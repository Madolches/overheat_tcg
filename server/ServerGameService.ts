import { GameState, PlayerState, Card, Deck, TriggerLocation, CardEffect, StackItem, GamePhase, GAME_TIMEOUTS, GameEvent, DeclaredEffectTarget, EffectTargetCandidate, AiDecisionLog } from '../src/types/game';
import { EventEngine } from '../src/services/EventEngine';
import { AtomicEffectExecutor } from '../src/services/AtomicEffectExecutor';
import { clearBattlefieldState, shouldClearBattlefieldStateOnMove } from '../src/lib/cardState';
import { getCardAdjustmentGroupId, getCardAdjustmentVersionKey } from '../src/lib/cardAdjustments';
import { getEntryRestrictionReason, satisfiesHighAlchemyEntryRestriction } from '../src/lib/highAlchemy';
import { getCardIdentity } from '../src/lib/utils';
import { addBattleLog, addCardAddedToHandBattleLog, cardToBattleLogRef, describeBattleLogTarget } from '../src/lib/battleLog';
import { SERVER_CARD_LIBRARY } from './card_loader';
import { GameService } from '../src/services/gameService';
import { getCurrentEffectResolutionBatchKey, grantedTotemReviveFromGrave, isAlchemyCard, isOpponentAcAtMost, isProtectedGraveCardFromOpponentEffect, nameContains, somelinStorybookGrantedActivate, standardizeChoiceOptions } from '../src/scripts/BaseUtil';
import { BotDifficulty, DeckAiProfile } from './ai/types';
import { getDeckAiProfile } from './ai/deckProfiles';
import { inferPlayerDeckProfile } from './ai/playerDeckProfile';
import {
  chooseAttacker,
  chooseDefender,
  chooseDiscardCard,
  chooseCheatDrawCard,
  chooseMulliganCards,
  chooseQuerySelections,
  buildTurnPlan,
  battleDamageWouldBeFatal,
  battleDamageWouldDeckOut,
  canUnitAttack,
  countErosion,
  damageToErosionCritical,
  estimateIncomingThreat,
  isClosingTurnPlan,
  scoreCardValue,
  scoreActivatableEffect,
  scoreMainPhaseCardSequencingValue,
  scoreAttackCandidate,
  scorePaymentExhaustValue,
  scorePlayableCard,
  scorePaymentSacrificeValue
} from './ai/hardStrategy';
import { ADVENTURER_GUILD_DEFAULT_OPENING_CARD_IDS, ADVENTURER_GUILD_PROFILE_ID, describeAdventurerGuildAttack, describeAdventurerGuildDefense, describeAdventurerGuildPlayableCard, describeAdventurerGuildQueryOption, getAdventurerGuildRouteAdvice, scoreAdventurerGuildDevelopmentPriority } from './ai/decks/adventurerGuildStrategy';

type PaymentSummary = {
  success: boolean;
  reason?: string;
  exhaustedUnits?: { id: string; name: string }[];
  erosionCostCards?: { id: string; name: string }[];
  feijingCard?: { id: string; name: string; destination: TriggerLocation };
};

export function getHardAiOpeningCardIds(profileId?: string | null) {
  return profileId === ADVENTURER_GUILD_PROFILE_ID ? ADVENTURER_GUILD_DEFAULT_OPENING_CARD_IDS : undefined;
}

export const ServerGameService = {
  shouldSkipVisualDelay(gameState: GameState) {
    const mode = gameState.mode || '';
    return (gameState as any).skipResolutionDelay === true || mode === 'ai-selfplay' || mode === 'ai-evaluation';
  },

  getVisualDelayMs(envKey: string, fallbackMs: number) {
    const raw = Number(process.env[envKey]);
    return Number.isFinite(raw) && raw >= 0 ? raw : fallbackMs;
  },

  getTriggerVisualDelayMs() {
    return ServerGameService.getVisualDelayMs('TRIGGER_VISUAL_DELAY_MS', 1500);
  },

  getStackVisualDelayMs() {
    return ServerGameService.getVisualDelayMs('STACK_VISUAL_DELAY_MS', 1500);
  },

  getStackBetweenItemsDelayMs() {
    return ServerGameService.getVisualDelayMs('STACK_BETWEEN_ITEMS_DELAY_MS', 1500);
  },

  async waitForVisualDelay(gameState: GameState, ms: number) {
    const delayMs = Math.max(0, Number(ms) || 0);
    if (delayMs <= 0) return;
    if (ServerGameService.shouldSkipVisualDelay(gameState)) return;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  },

  isVisualAnimationPending(gameState: GameState) {
    if (ServerGameService.shouldSkipVisualDelay(gameState)) return false;
    if (gameState.drawAnimationResume) return true;
    if (gameState.animationHint?.type === 'CONFRONTATION_CHAIN') return false;
    return Number(gameState.animationUntil || 0) > Date.now();
  },

  markConfrontationChainAnimation(gameState: GameState, _durationMs = 1100, _reason: 'build' | 'resolve' = 'build') {
    if (!gameState.counterStack?.length) return;
    const topItem = gameState.counterStack[gameState.counterStack.length - 1];
    (topItem as any).chainAnimationShown = true;
    if (gameState.animationHint?.type === 'CONFRONTATION_CHAIN') {
      delete gameState.animationHint;
      delete gameState.animationUntil;
    }
  },

  isConfrontationAnimationPending(_gameState: GameState) {
    return false;
  },

  assertConfrontationAnimationComplete(_gameState: GameState) {
    return;
  },

  clearAllianceAttackMarkers(gameState: GameState, attackerIds?: string[]) {
    const targetIds = attackerIds?.length ? new Set(attackerIds) : undefined;
    Object.values(gameState.players || {}).forEach(player => {
      const zones = [
        player.hand,
        player.deck,
        player.grave,
        player.exile,
        player.unitZone,
        player.itemZone,
        player.erosionFront,
        player.erosionBack,
        player.playZone,
      ];
      zones.forEach(zone => zone.forEach(card => {
        if (!card) return;
        if (!targetIds || targetIds.has(card.gamecardId)) card.inAllianceGroup = false;
      }));
    });
  },

  clearBattleCombatMarkers(gameState: GameState, attackerIds?: string[]) {
    const attackerSet = attackerIds?.length ? new Set(attackerIds) : undefined;
    const defenderId = gameState.battleState?.defender || gameState.battleState?.unitTargetId;
    const defenderSet = defenderId ? new Set([defenderId]) : undefined;

    ServerGameService.clearAllianceAttackMarkers(gameState, attackerIds);

    Object.values(gameState.players || {}).forEach(player => {
      player.unitZone.forEach(unit => {
        if (!unit) return;
        if (!attackerSet || attackerSet.has(unit.gamecardId)) {
          (unit as any).isAttacking = false;
        }
        if (!defenderSet || defenderSet.has(unit.gamecardId)) {
          (unit as any).isDefending = false;
        }
      });
    });
  },

  clearBattleAndReturnMain(gameState: GameState, reason: string, options?: { log?: string }) {
    const attackerIds = gameState.battleState?.attackers;
    ServerGameService.clearBattleCombatMarkers(gameState, attackerIds);
    gameState.battleState = undefined;
    gameState.phase = 'MAIN';
    gameState.previousPhase = undefined;
    gameState.phaseTimerStart = Date.now();
    if (options?.log) gameState.logs.push(options.log);
    EventEngine.dispatchEvent(gameState, {
      type: 'PHASE_CHANGED',
      data: { phase: 'MAIN', reason }
    });
  },

  async recoverBotPendingQueryFailure(
    gameState: GameState,
    playerUid: string,
    query: any,
    reason: string,
    onUpdate?: (state: GameState) => Promise<void>
  ) {
    const activeQuery = gameState.pendingQuery;
    const recoveryQuery = activeQuery?.id === query?.id ? activeQuery : query;
    if (!recoveryQuery || recoveryQuery.playerUid !== playerUid) return false;

    const callback = recoveryQuery.callbackKey || recoveryQuery.type || 'UNKNOWN_QUERY';
    const options = recoveryQuery.options || [];
    const canDecline = options.some((option: any) =>
      option?.id === 'NO' ||
      option?.selectionId === 'NO' ||
      option?.value === 'NO'
    );

    if (canDecline) {
      try {
        gameState.pendingQuery = recoveryQuery;
        gameState.logs.push(`[Bot recovery] ${callback} failed (${reason}); retrying as NO.`);
        await ServerGameService.handleQueryChoice(gameState, playerUid, recoveryQuery.id, ['NO'], onUpdate);
        await ServerGameService.finalizeBattleAfterPendingQuery(gameState, onUpdate);
        return true;
      } catch (fallbackErr: any) {
        reason = `${reason}; NO fallback failed: ${fallbackErr?.message || fallbackErr}`;
      }
    }

    if (gameState.pendingQuery && gameState.pendingQuery.id !== recoveryQuery.id) return false;
    gameState.pendingQuery = undefined;
    if (gameState.priorityPlayerId === playerUid) gameState.priorityPlayerId = undefined;

    ServerGameService.recordAiDecision(gameState, playerUid, {
      action: 'QUERY_RECOVERY',
      subject: recoveryQuery.title || callback,
      reason: `Bot query failed and was skipped to keep the game state moving: ${reason}`,
      details: {
        callback,
        type: recoveryQuery.type,
        phase: gameState.phase,
        options: options.filter((option: any) => !option.disabled).length,
      },
    });
    gameState.logs.push(`[Bot recovery] skipped ${callback}: ${reason}`);

    if (gameState.isResolvingStack || gameState.phase === 'COUNTERING') {
      if (gameState.counterStack.length > 0) {
        await ServerGameService.resolveCounterStack(gameState, onUpdate);
      } else {
        await ServerGameService.finishCounteringStack(gameState, onUpdate);
      }
    } else if (!gameState.isCountering) {
      await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
    }

    await ServerGameService.finalizeBattleAfterPendingQuery(gameState, onUpdate);

    if (!gameState.pendingQuery && gameState.phase === 'DAMAGE_CALCULATION' && gameState.battleState) {
      const attackerPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
      ServerGameService.clearBattleAndReturnMain(gameState, 'BOT_QUERY_RECOVERY', {
        log: `[Bot recovery] battle was returned to MAIN after unresolved ${callback}.`
      });
      await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      if (!gameState.pendingQuery) {
        await ServerGameService.enterForcedAttackBattleIfNeeded(
          gameState,
          attackerPlayerId,
          onUpdate,
          'FORCED_ATTACK_CONTINUE'
        );
      }
    }

    return true;
  },

  rememberBattleEndAfterPendingQuery(gameState: GameState, attackerPlayerId?: string) {
    if (!gameState.pendingQuery || !gameState.battleState || gameState.phase !== 'DAMAGE_CALCULATION') return;
    (gameState as any).pendingBattleEndAfterQuery = {
      attackerIds: [...(gameState.battleState.attackers || [])],
      attackerPlayerId: attackerPlayerId || gameState.playerIds[gameState.currentTurnPlayer]
    };
  },

  isFullEffectSilencedThisTurn(gameState: GameState, card: Card) {
    const data = (card as any).data;
    if (data?.permanentEffectSilenced) return true;
    if (data?.fullEffectSilencedUntilOwnStartUid) return true;
    if (data?.fullEffectSilencedTurn === undefined || data.fullEffectSilencedTurn < gameState.turnCount) return false;
    const zones = data.fullEffectSilencedZones as TriggerLocation[] | undefined;
    return !zones || zones.includes(card.cardlocation as TriggerLocation);
  },

  getEffectivePlayCost(player: PlayerState, card: Card, gameState?: GameState) {
    const baseCost = card.id === '202000080' ? 6 : (card.baseAcValue ?? card.acValue ?? 0);
    const soulDevourCount = gameState && card.cardlocation === 'HAND'
      ? Number((player as any)[`soulDevourActivatedTurn_${gameState.turnCount}`] || 0)
      : 0;
    const thunderPriestCount = gameState && card.cardlocation === 'HAND'
      ? player.unitZone.filter(unit =>
        unit?.id === '102060321' &&
        !ServerGameService.isFullEffectSilencedThisTurn(gameState, unit) &&
        unit.effects?.some(effect => effect.id === '102060321_hand_access_discount')
      ).length
      : 0;
    const soulDevourDiscount = soulDevourCount * thunderPriestCount;
    const isThunderUnit =
      card.type === 'UNIT' &&
      (
        String(card.faction || '').includes('雷霆') ||
        card.fullName.includes('雷霆') ||
        !!card.specialName?.includes('雷霆')
      );
    if (soulDevourDiscount > 0 && card.type === 'UNIT' && (isThunderUnit || (card.color === 'RED' && !card.godMark))) {
      return Math.max(0, baseCost - soulDevourDiscount);
    }
    if (card.id === '101140062') {
      const unitCount = player.unitZone.filter(c => c !== null).length;
      return Math.max(0, baseCost - unitCount);
    }
    if (card.id === '202050034' && player.isGoddessMode) {
      return 0;
    }
    if (card.id === '105000117') {
      const hasUnits = player.unitZone.some(c => c !== null);
      const hasFaceUpErosion = player.erosionFront.some(c => c !== null && c.displayState === 'FRONT_UPRIGHT');
      if (!hasUnits && !hasFaceUpErosion) return 0;
    }
    if (card.id === '205110063') {
      const itemCount = player.itemZone.filter(c => c !== null).length;
      return Math.max(0, baseCost - itemCount);
    }
    if (card.id === '103090247') {
      const xenobuCount = player.unitZone.filter(unit => unit?.faction === '瑟诺布').length;
      return Math.max(0, baseCost - xenobuCount);
    }
    if (
      (card.id === '201000140' || card.id === '201000040' || card.fullName === '解放之光') &&
      player.exile.some(c => c.id === card.id || c.id === '201000140' || c.id === '201000040' || c.fullName === card.fullName)
    ) {
      return 0;
    }
    if (card.id === '202000080' && player.unitZone.some(unit => unit?.isShenyi)) {
      return Math.max(0, baseCost - 4);
    }
    if ((card as any).data?.spiritCostTarget103080185) {
      return 0;
    }
    if (
      card.type === 'UNIT' &&
      card.faction === '圣王国' &&
      (player as any).holyKingdomUnitDiscountUsedTurn !== gameState?.turnCount &&
      player.unitZone.some(unit => unit?.id === '101130153')
    ) {
      return Math.max(0, baseCost - 1);
    }
    return baseCost;
  },

  isSpiritDiscountCard(card: Card) {
    return card.id === '203000075' || card.id === '203000076';
  },

  findCardAnywhere(gameState: GameState, gamecardId?: string) {
    if (!gamecardId) return undefined;
    for (const player of Object.values(gameState.players)) {
      const found = [
        ...player.deck,
        ...player.hand,
        ...player.grave,
        ...player.exile,
        ...player.unitZone,
        ...player.itemZone,
        ...player.erosionFront,
        ...player.erosionBack,
        ...player.playZone
      ].find(card => card?.gamecardId === gamecardId);
      if (found) return found;
    }
    return undefined;
  },

  hasSpiritDiscountTargetOnField(gameState: GameState, card: Card) {
    return ServerGameService.isSpiritDiscountCard(card) &&
      Object.values(gameState.players).some(player =>
        player.unitZone.some(unit => unit?.id === '103080185')
      );
  },

  hasPreselectTargetSpec(effect?: CardEffect) {
    return !!effect?.targetSpec && effect.targetSpec.preselect !== false;
  },

  cloneForTargetProbe(gameState: GameState): GameState {
    const clone = JSON.parse(JSON.stringify(gameState));
    ServerGameService.hydrateGameState(clone);
    clone.pendingQuery = undefined;
    clone.logs = [...(gameState.logs || [])];
    return clone;
  },

  legacyPreselectEffectIds: new Set<string>(),

  shouldUseLegacyPreselectTarget(effect?: CardEffect) {
    return !!effect?.id && ServerGameService.legacyPreselectEffectIds.has(effect.id);
  },

  isPreselectableCapturedQuery(query: any) {
    if (!query || query.type !== 'SELECT_CARD') return false;
    const title = `${query.title || ''} ${query.description || ''}`;
    if (/费用|作为费用|卡组|公开|查看|检索|搜索|加入手牌/.test(title) && /卡组|牌库/.test(title)) return false;
    if (/费用|作为费用|代价|支付/.test(title)) return false;
    const zones = new Set<string>((query.options || []).map((option: any) => option.source || option.card?.cardlocation));
    return [...zones].some(zone => ['UNIT', 'ITEM', 'GRAVE', 'EXILE', 'EROSION_FRONT', 'EROSION_BACK'].includes(zone));
  },

  async probeLegacyTargetSpec(gameState: GameState, playerId: string, sourceCard: Card, effect: CardEffect, effectIndex: number): Promise<any | undefined> {
    if (!ServerGameService.shouldUseLegacyPreselectTarget(effect)) return undefined;
    if (effect.targetSpec || !effect.execute) return undefined;
    if (!(effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED' || effect.type === 'ALWAYS')) return undefined;
    const probeState = ServerGameService.cloneForTargetProbe(gameState);
    const probePlayer = probeState.players[playerId];
    const probeCard = ServerGameService.findCardById(probeState, sourceCard.gamecardId);
    if (!probePlayer || !probeCard) return undefined;
    try {
      await (effect.execute as any)(probeCard, probeState, probePlayer);
    } catch {
      return undefined;
    }
    if (!ServerGameService.isPreselectableCapturedQuery(probeState.pendingQuery)) return undefined;
    const query = probeState.pendingQuery;
    const options = (query.options || []).filter((option: any) => option.card);
    if (options.length < (query.minSelections || 1)) return undefined;
    return {
      title: query.title,
      description: query.description,
      minSelections: query.minSelections,
      maxSelections: query.maxSelections,
      step: query.context?.step,
      capturedContext: query.context,
      getCandidates: () => options.map((option: any) => ({ card: option.card, source: option.source || option.card.cardlocation }))
    };
  },

  async createLegacyDeclareTargetQuery(
    gameState: GameState,
    playerUid: string,
    sourceCard: Card,
    effect: CardEffect,
    effectIndex: number,
    context: any
  ) {
    const runtimeTargetSpec = await ServerGameService.probeLegacyTargetSpec(gameState, playerUid, sourceCard, effect, effectIndex);
    if (!runtimeTargetSpec) return false;
    return ServerGameService.createDeclareTargetQuery(gameState, playerUid, sourceCard, effect, effectIndex, {
      ...context,
      runtimeTargetSpec
    });
  },

  getZoneCards(player: PlayerState, zone: TriggerLocation): (Card | null)[] {
    if (zone === 'HAND') return player.hand;
    if (zone === 'UNIT') return player.unitZone;
    if (zone === 'ITEM') return player.itemZone;
    if (zone === 'GRAVE') return player.grave;
    if (zone === 'EXILE') return player.exile;
    if (zone === 'DECK') return player.deck;
    if (zone === 'EROSION_FRONT') return player.erosionFront;
    if (zone === 'EROSION_BACK') return player.erosionBack;
    if (zone === 'PLAY') return player.playZone;
    return [];
  },

  findCardLocation(gameState: GameState, gamecardId?: string): { card: Card; ownerUid: string; zone: TriggerLocation } | undefined {
    if (!gamecardId) return undefined;
    for (const [ownerUid, player] of Object.entries(gameState.players)) {
      const zones: TriggerLocation[] = ['HAND', 'UNIT', 'ITEM', 'GRAVE', 'EXILE', 'DECK', 'EROSION_FRONT', 'EROSION_BACK', 'PLAY'];
      for (const zone of zones) {
        const card = ServerGameService.getZoneCards(player, zone).find(c => c?.gamecardId === gamecardId);
        if (card) return { card, ownerUid, zone };
      }
    }
    return undefined;
  },

  getTriggerZoneLabel(zone?: TriggerLocation) {
    const labels: Record<TriggerLocation, string> = {
      HAND: '手牌',
      UNIT: '战场',
      ITEM: '道具区',
      GRAVE: '墓地',
      EXILE: '放逐区',
      EROSION_FRONT: '侵蚀区正面',
      EROSION_BACK: '侵蚀区背面',
      PLAY: '使用区',
      DECK: '卡组'
    };
    return zone ? labels[zone] || zone : '';
  },

  isUnaffectedByCardEffect(gameState: GameState, target: Card, source?: Card, sourceOwnerUid?: string) {
    if (!source || target.gamecardId === source.gamecardId) return false;
    const targetOwnerUid = ServerGameService.findCardLocation(gameState, target.gamecardId)?.ownerUid;
    const effectSourceOwnerUid = sourceOwnerUid || ServerGameService.findCardLocation(gameState, source.gamecardId)?.ownerUid;
    if (!targetOwnerUid || !effectSourceOwnerUid) return false;

    const data = (target as any).data || {};
    if (data.unaffectedByOtherCardEffects) {
      gameState.logs.push(`[${target.fullName}] 不受这张卡以外的卡牌效果影响。`);
      return true;
    }
    if (targetOwnerUid === effectSourceOwnerUid) return false;
    if (data.immuneToOpponentEffectsIfOpponentGoddess && gameState.players[effectSourceOwnerUid]?.isGoddessMode) {
      gameState.logs.push(`[${target.fullName}] 因对手处于女神化状态而不受对手卡牌效果影响。`);
      return true;
    }
    if (data.unaffectedByOpponentCardEffects) {
      gameState.logs.push(`[${target.fullName}] 不受对手的卡牌效果影响。`);
      return true;
    }
    if (data.unaffectedByOpponentColorEffects && source.color === data.unaffectedByOpponentColorEffects) {
      gameState.logs.push(`[${target.fullName}] 不受对手宣言颜色的卡牌效果影响。`);
      return true;
    }
    if (
      data.unaffectedByOpponentAcLe !== undefined &&
      isOpponentAcAtMost(gameState, target, source, Number(data.unaffectedByOpponentAcLe), effectSourceOwnerUid)
    ) {
      gameState.logs.push(`[${target.fullName}] is unaffected by opponent ACCESS ${data.unaffectedByOpponentAcLe} or less card effects.`);
      return true;
    }
    return false;
  },

  isLegalDeclaredTarget(gameState: GameState, sourceCard: Card, target: Card) {
    if (target.gamecardId === sourceCard.gamecardId) return true;
    const isFieldCard = target.cardlocation === 'UNIT' || target.cardlocation === 'ITEM';
    const data = (target as any).data || {};
    if (isFieldCard && (target as any).cannotBeEffectTargetByEffect) return false;
    if (
      isFieldCard &&
      data.cannotBeEffectTargetByOpponent
    ) {
      const sourceOwnerUid = ServerGameService.findCardLocation(gameState, sourceCard.gamecardId)?.ownerUid;
      const targetOwnerUid = ServerGameService.findCardLocation(gameState, target.gamecardId)?.ownerUid;
      if (sourceOwnerUid && targetOwnerUid && sourceOwnerUid !== targetOwnerUid) return false;
    }
    if (
      isFieldCard &&
      Array.isArray(data.cannotBeEffectTargetColors) &&
      data.cannotBeEffectTargetColors.includes(sourceCard.color)
    ) {
      return false;
    }
    if (
      isFieldCard &&
      data.cannotBeEffectTargetByOpponentAcLe !== undefined &&
      isOpponentAcAtMost(gameState, target, sourceCard, Number(data.cannotBeEffectTargetByOpponentAcLe))
    ) {
      return false;
    }
    return true;
  },

  getTargetCandidates(gameState: GameState, playerUid: string, sourceCard: Card, effect: CardEffect, targetShape?: any, declaredTargets?: DeclaredEffectTarget[]): EffectTargetCandidate[] {
    const spec = targetShape || effect.targetSpec;
    if (!spec) return [];
    const player = gameState.players[playerUid];
    let candidates = spec.getCandidates
      ? spec.getCandidates(gameState, player, sourceCard, declaredTargets)
      : Object.entries(gameState.players).flatMap(([uid, zonePlayer]) => {
          if (spec.controller === 'SELF' && uid !== playerUid) return [];
          if (spec.controller === 'OPPONENT' && uid === playerUid) return [];
          const zones = spec.zones || ['UNIT', 'GRAVE', 'EXILE', 'EROSION_FRONT', 'EROSION_BACK', 'ITEM'];
          return zones.flatMap(zone =>
            ServerGameService.getZoneCards(zonePlayer, zone)
              .filter((card): card is Card => !!card)
              .map(card => ({ card, source: zone }))
          );
        });

    candidates = candidates.filter(candidate => {
      const { card } = candidate;
      const ownerUid = candidate.ownerUid || AtomicEffectExecutor.findCardOwnerKey(gameState, card.gamecardId);
      if (spec.controller === 'SELF' && ownerUid !== playerUid) return false;
      if (spec.controller === 'OPPONENT' && ownerUid === playerUid) return false;
      if (!ServerGameService.isLegalDeclaredTarget(gameState, sourceCard, card)) return false;
      if (spec.filter && !AtomicEffectExecutor.matchesFilter(card, spec.filter, sourceCard, undefined, card.cardlocation as TriggerLocation)) return false;
      return true;
    });

    const seen = new Set<string>();
    return candidates.filter(candidate => {
      if (seen.has(candidate.card.gamecardId)) return false;
      seen.add(candidate.card.gamecardId);
      return true;
    });
  },

  createDeclareTargetQuery(
    gameState: GameState,
    playerUid: string,
    sourceCard: Card,
    effect: CardEffect,
    effectIndex: number,
    context: any
  ) {
    const spec = effect.targetSpec;
    const runtimeSpec = context.runtimeTargetSpec || (effect as any).__runtimeTargetSpec;
    if (!spec && !runtimeSpec) return false;
    const activeSpec = spec || runtimeSpec;
    const player = gameState.players[playerUid];
    if (activeSpec.modeOptions?.length && !context.modeId) {
      const options = activeSpec.modeOptions
        .filter(mode => !mode.condition || mode.condition(gameState, player, sourceCard))
        .filter(mode => {
          const targetShapes = mode.targetGroups?.length ? mode.targetGroups : [mode];
          return targetShapes.every(shape => {
            if ((shape.maxSelections ?? 0) === 0) return true;
            return ServerGameService.getTargetCandidates(gameState, playerUid, sourceCard, effect, shape).length >= shape.minSelections;
          });
        })
        .map(mode => ({ id: mode.id, label: mode.label, detail: mode.modeDescription || mode.description }));
      if (options.length === 0) return false;
      const choiceContext = {
        ...context,
        sourceCardId: sourceCard.gamecardId,
        effectIndex,
        activationPlayerUid: playerUid
      };
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CHOICE',
        playerUid,
        options: standardizeChoiceOptions(gameState, options, choiceContext),
        title: activeSpec.modeTitle || '选择效果',
        description: activeSpec.modeDescription || '选择要发动的效果。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'DECLARE_EFFECT_TARGET_MODE',
        context: choiceContext
      };
      return true;
    }

    const selectedMode = context.modeId
      ? activeSpec.modeOptions?.find((mode: any) => mode.id === context.modeId)
      : undefined;
    if (selectedMode && !ServerGameService.isTargetModeCurrentlyValid(
      gameState,
      playerUid,
      sourceCard,
      effect,
      selectedMode,
      context.declaredTargets,
      context.targetGroupIndex || 0,
      false
    )) {
      return false;
    }
    const modeTargetGroups = selectedMode?.targetGroups;
    const targetShape = selectedMode
      ? (modeTargetGroups?.[context.targetGroupIndex || 0] || selectedMode)
      : activeSpec.targetGroups?.[context.targetGroupIndex || 0] || activeSpec;
    if (!targetShape) return false;
    if ((targetShape.maxSelections ?? 0) === 0) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid,
        options: [],
        title: targetShape.title || selectedMode?.label || activeSpec.modeTitle || '确认效果',
        description: targetShape.description || selectedMode?.modeDescription || selectedMode?.description || activeSpec.modeDescription || '确认发动该效果。',
        minSelections: 0,
        maxSelections: 0,
        callbackKey: 'DECLARE_EFFECT_TARGETS',
        context: {
          ...context,
          sourceCardId: sourceCard.gamecardId,
          effectIndex,
          activationPlayerUid: playerUid,
          step: targetShape.step,
          capturedContext: targetShape.capturedContext,
          targetGroupIndex: context.targetGroupIndex || 0
        }
      };
      return true;
    }
    const candidates = ServerGameService.getTargetCandidates(gameState, playerUid, sourceCard, effect, targetShape, context.declaredTargets);
    if (candidates.length < targetShape.minSelections) return false;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerUid,
        candidates.map(candidate => ({
          card: candidate.card,
          source: candidate.source || (candidate.card.cardlocation as TriggerLocation)
        }))
      ),
      title: targetShape.title,
      description: targetShape.description,
      minSelections: targetShape.minSelections,
      maxSelections: targetShape.maxSelections,
      callbackKey: 'DECLARE_EFFECT_TARGETS',
      context: {
        ...context,
        sourceCardId: sourceCard.gamecardId,
        effectIndex,
        activationPlayerUid: playerUid,
        step: targetShape.step,
        capturedContext: targetShape.capturedContext,
        targetGroupIndex: context.targetGroupIndex || 0
      }
    };
    return true;
  },

  isTargetModeCurrentlyValid(
    gameState: GameState,
    playerUid: string,
    sourceCard: Card,
    effect: CardEffect,
    mode: any,
    declaredTargets?: DeclaredEffectTarget[],
    targetGroupIndex = 0,
    checkAllTargetGroups = true
  ) {
    const player = gameState.players[playerUid];
    if (!player) return false;
    if (mode.condition && !mode.condition(gameState, player, sourceCard)) return false;

    const targetShapes = mode.targetGroups?.length ? mode.targetGroups : [mode];
    const targetShapesToCheck = checkAllTargetGroups ? targetShapes : targetShapes.slice(targetGroupIndex, targetGroupIndex + 1);
    return targetShapesToCheck.every((shape: any) => {
      if ((shape.maxSelections ?? 0) === 0) return true;
      return ServerGameService.getTargetCandidates(gameState, playerUid, sourceCard, effect, shape, declaredTargets).length >= shape.minSelections;
    });
  },

  declareEffectTargets(
    gameState: GameState,
    playerUid: string,
    sourceCard: Card,
    effect: CardEffect,
    effectIndex: number,
    selections: string[],
    targetShape?: any,
    previousTargets?: DeclaredEffectTarget[],
    modeId?: string
  ): DeclaredEffectTarget[] {
    const spec = effect.targetSpec || (effect as any).__runtimeTargetSpec;
    if (!spec && !targetShape) throw new Error('该效果不需要指定对象');
    const activeTargetShape = targetShape || spec;
    if (selections.length < activeTargetShape.minSelections || selections.length > activeTargetShape.maxSelections) {
      throw new Error(`请选择 ${activeTargetShape.minSelections === activeTargetShape.maxSelections ? activeTargetShape.minSelections : `${activeTargetShape.minSelections}-${activeTargetShape.maxSelections}`} 个合法对象`);
    }

    const legalCandidates = ServerGameService.getTargetCandidates(gameState, playerUid, sourceCard, effect, activeTargetShape, previousTargets);
    const legalIds = new Set(legalCandidates.map(candidate => candidate.card.gamecardId));
    const declaredTargets: DeclaredEffectTarget[] = [];

    for (const id of selections) {
      if (!legalIds.has(id)) throw new Error('选择的对象不合法');
      const candidate = legalCandidates.find(candidate => candidate.card.gamecardId === id);
      const located = ServerGameService.findCardLocation(gameState, id);
      if (!candidate && !located) throw new Error('选择的对象已不存在');
      const card = candidate?.card || located!.card;
      const ownerUid = candidate?.ownerUid || located?.ownerUid || AtomicEffectExecutor.findCardOwnerKey(gameState, card.gamecardId) || playerUid;
      const zone = candidate?.source || located?.zone || (card.cardlocation as TriggerLocation);
      if (card.nextEffectProtection) {
        card.nextEffectProtection = false;
        gameState.logs.push(`[变装] [${card.fullName}] 抵消了来自 [${sourceCard.fullName}] 的一次指定对象效果。`);
        continue;
      }

      const declaredTarget: DeclaredEffectTarget = {
        gamecardId: card.gamecardId,
        ownerUid,
        zone,
        costTarget: !!activeTargetShape.costTarget,
        sourceCardId: sourceCard.gamecardId,
        sourceCardName: sourceCard.fullName,
        effectIndex,
        modeId,
        step: activeTargetShape.step,
        capturedContext: activeTargetShape.capturedContext
      };
      declaredTargets.push(declaredTarget);
      const targetRef = cardToBattleLogRef(gameState, card, ownerUid, zone);
      const linkNumber = previousTargets?.find(target => target.sourceCardId === sourceCard.gamecardId)?.linkNumber;
      const effectLabel = effect.description || '效果';
      addBattleLog(gameState, {
        category: 'CONFRONTATION',
        actorUid: playerUid,
        actorName: gameState.players[playerUid]?.displayName,
        sourceCard: cardToBattleLogRef(gameState, sourceCard, playerUid),
        targets: targetRef ? [targetRef] : undefined,
        metadata: { effectIndex, modeId, step: activeTargetShape.step, effectDescription: effect.description, linkNumber },
        text: `[${sourceCard.fullName}]的[${effectLabel}]指定了${targetRef ? describeBattleLogTarget(targetRef) : `[${card.fullName}]`}。`
      });
      card.declaredTargetMarkers = [
        ...(card.declaredTargetMarkers || []).filter(marker => marker.sourceCardId !== sourceCard.gamecardId || marker.effectIndex !== effectIndex),
        { sourceCardId: sourceCard.gamecardId, sourceCardName: sourceCard.fullName, effectIndex, modeId: declaredTarget.modeId, step: declaredTarget.step }
      ];
      EventEngine.dispatchEvent(gameState, {
        type: 'CARD_SELECTED_TARGET',
        sourceCard,
        sourceCardId: sourceCard.gamecardId,
        targetCardId: card.gamecardId,
        playerUid
      });
    }

    EventEngine.recalculateContinuousEffects(gameState);
    if (modeId) {
      (declaredTargets as any).declaredModeId = modeId;
    }
    return declaredTargets;
  },

  getValidDeclaredTargets(gameState: GameState, declaredTargets?: DeclaredEffectTarget[]) {
    return (declaredTargets || []).filter(target => {
      if (target.costTarget) return true;
      const located = ServerGameService.findCardLocation(gameState, target.gamecardId);
      return !!located && located.ownerUid === target.ownerUid && located.zone === target.zone;
    });
  },

  clearDeclaredTargetMarkers(gameState: GameState, declaredTargets?: DeclaredEffectTarget[]) {
    if (!declaredTargets?.length) return;
    for (const target of declaredTargets) {
      const located = ServerGameService.findCardLocation(gameState, target.gamecardId);
      if (!located) continue;
      located.card.declaredTargetMarkers = (located.card.declaredTargetMarkers || []).filter(marker =>
        marker.sourceCardId !== target.sourceCardId || marker.effectIndex !== target.effectIndex
      );
    }
    EventEngine.recalculateContinuousEffects(gameState);
  },

  clearAllDeclaredTargetMarkers(gameState: GameState) {
    Object.values(gameState.players).forEach(player => {
      const allCards = [
        ...player.deck,
        ...player.hand,
        ...player.grave,
        ...player.exile,
        ...player.unitZone,
        ...player.itemZone,
        ...player.erosionFront,
        ...player.erosionBack,
        ...player.playZone
      ];
      allCards.forEach(card => {
        if (!card) return;
        card.declaredTargetMarkers = [];
        if (card.influencingEffects?.length) {
          card.influencingEffects = card.influencingEffects.filter(effect => !effect.description.includes('指定为效果对象'));
        }
      });
    });
    EventEngine.recalculateContinuousEffects(gameState);
  },

  getDeclaredTargetIds(declaredTargets?: DeclaredEffectTarget[]) {
    return (declaredTargets || []).map(target => target.gamecardId);
  },

  assignDeclaredTargetLink(gameState: GameState, declaredTargets: DeclaredEffectTarget[] | undefined, linkNumber: number) {
    if (!declaredTargets?.length) return;
    declaredTargets.forEach(target => {
      target.linkNumber = linkNumber;
      const located = ServerGameService.findCardLocation(gameState, target.gamecardId);
      if (!located) return;
      located.card.declaredTargetMarkers = (located.card.declaredTargetMarkers || []).map(marker =>
        marker.sourceCardId === target.sourceCardId && marker.effectIndex === target.effectIndex
          ? { ...marker, linkNumber }
          : marker
      );
    });
    EventEngine.recalculateContinuousEffects(gameState);
  },

  isSpiritDiscountFromDeclaredTargets(gameState: GameState, card: Card, declaredTargets?: DeclaredEffectTarget[]) {
    if (!ServerGameService.isSpiritDiscountCard(card)) return false;
    return (declaredTargets || []).some(target => {
      const located = ServerGameService.findCardLocation(gameState, target.gamecardId);
      return located?.card.cardlocation === 'UNIT' && located.card.id === '103080185';
    });
  },

  async executeWithDeclaredTargets(
    gameState: GameState,
    playerUid: string,
    sourceCard: Card,
    effect: CardEffect,
    owner: PlayerState,
    declaredTargets?: DeclaredEffectTarget[],
    event?: GameEvent
  ) {
    const validDeclaredTargets = ServerGameService.getValidDeclaredTargets(gameState, declaredTargets);
    const declaredModeId = (gameState.currentProcessingItem as any)?.declaredModeId;
    const runtimeSpec = (effect as any).__runtimeTargetSpec || (gameState.currentProcessingItem as any)?.runtimeTargetSpec;
    const activeSpec = effect.targetSpec || runtimeSpec;
    const declaredMode = declaredModeId && activeSpec?.modeOptions
      ? activeSpec.modeOptions.find(mode => mode.id === declaredModeId)
      : undefined;
    const activeTargetShapes = declaredMode
      ? (declaredMode.targetGroups?.length ? declaredMode.targetGroups : [declaredMode])
      : activeSpec
        ? (activeSpec.targetGroups?.length ? activeSpec.targetGroups : [activeSpec])
        : [];
    const activeRequiresDeclaredTarget = activeTargetShapes.some(shape => (shape.minSelections ?? 0) > 0);
    const defaultTargetStep = activeTargetShapes[0]?.step;
    const requiresDeclaredTargets =
      (
        ((ServerGameService.hasPreselectTargetSpec(effect) || !!runtimeSpec) &&
        (
          !!declaredTargets?.length ||
          activeRequiresDeclaredTarget
        ))
      ) ||
      !!declaredTargets?.some(target => target.capturedContext);
    if (requiresDeclaredTargets && validDeclaredTargets.length === 0) {
      gameState.logs.push(`[效果结算] [${sourceCard.fullName}] 指定对象已全部离开原位置，后续效果不处理。`);
      return false;
    }

    const declaredSelectionIds = validDeclaredTargets.map(target => target.gamecardId);
    const firstDeclaredTarget = validDeclaredTargets[0];
    const captured = validDeclaredTargets.find(target => target.capturedContext)?.capturedContext;
    if (captured && effect.onQueryResolve) {
      await (effect.onQueryResolve as any)(sourceCard, gameState, owner, declaredSelectionIds, captured);
      return true;
    }
    if ((ServerGameService.hasPreselectTargetSpec(effect) || declaredModeId) && effect.onQueryResolve) {
      await (effect.onQueryResolve as any)(sourceCard, gameState, owner, declaredSelectionIds, {
        step: firstDeclaredTarget?.step || defaultTargetStep,
        modeId: firstDeclaredTarget?.modeId || declaredModeId,
        selectedModeId: firstDeclaredTarget?.modeId || declaredModeId,
        declaredTargets: validDeclaredTargets
      });
      return true;
    }

    if (effect.atomicEffects && effect.atomicEffects.length > 0) {
      await AtomicEffectExecutor.executeBatch(gameState, playerUid, effect.atomicEffects, sourceCard, event, declaredSelectionIds);
    }

    if (effect.execute) {
      const selectedModeId = validDeclaredTargets[0]?.modeId || declaredModeId;
      await (effect.execute as any)(sourceCard, gameState, owner, event, declaredSelectionIds, { selectedModeId, declaredTargets: validDeclaredTargets });
    }
    return true;
  },

  async dispatchEventAndDrainTriggers(gameState: GameState, event: GameEvent, onUpdate?: (state: GameState) => Promise<void>) {
    EventEngine.dispatchEvent(gameState, event);
    await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
  },

  getColorRequirementResult(player: PlayerState, req: Record<string, number> = {}) {
    const availableColors: Record<string, number> = { RED: 0, WHITE: 0, YELLOW: 0, BLUE: 0, GREEN: 0, NONE: 0 };
    let omniColorCount = 0;

    player.unitZone.forEach(c => {
      if (!c) return;
      const isOmni = String(c.id) === '105000481' || !!c.effects?.some(e => e.id === '105000481_omni');
      if (isOmni) {
        omniColorCount++;
      } else if (c.color !== 'NONE') {
        availableColors[c.color] = (availableColors[c.color] || 0) + 1;
      }
      const extraColors = [
        ...((c as any).temporaryExtraColors || []),
        ...((c as any).persistentExtraColors || [])
      ];
      if (Array.isArray(extraColors)) {
        extraColors.forEach(color => {
          if (typeof color === 'string' && color !== c.color && color in availableColors) {
            availableColors[color] = (availableColors[color] || 0) + 1;
          }
        });
      }
    });

    let totalDeficit = 0;
    for (const [color, reqCount] of Object.entries(req)) {
      totalDeficit += Math.max(0, (reqCount as number) - (availableColors[color] || 0));
    }

    return { valid: totalDeficit <= omniColorCount, totalDeficit, omniColorCount };
  },

  hasGlobalDisableAllActivated(gameState: GameState, affectedPlayerUid?: string) {
    return Object.values(gameState.players).some(player =>
      player.uid !== affectedPlayerUid &&
      [...player.unitZone, ...player.itemZone, ...player.erosionFront]
        .filter((card): card is Card => !!card)
        .some(card =>
          card.effects?.some(effect =>
            effect.type === 'CONTINUOUS' &&
            effect.content === 'DISABLE_ALL_ACTIVATED' &&
            (!effect.condition || effect.condition(gameState, player, card))
          )
        )
    );
  },

  effectHasErosionRequirement(effect: CardEffect) {
    return !!effect.erosionFrontLimit ||
      !!effect.erosionBackLimit ||
      !!effect.erosionTotalLimit;
  },

  isTenPlusEffect(effect: CardEffect) {
    return !!effect.erosionTotalLimit && effect.erosionTotalLimit[0] >= 10;
  },

  isGoddessTierEffect(effect: CardEffect) {
    if (ServerGameService.isTenPlusEffect(effect)) return true;

    const triggerEvents = Array.isArray(effect.triggerEvent)
      ? effect.triggerEvent
      : effect.triggerEvent
        ? [effect.triggerEvent]
        : [];

    return triggerEvents.includes('GODDESS_TRANSFORMATION');
  },

  effectHasSubGoddessErosionRequirement(effect: CardEffect) {
    return ServerGameService.effectHasErosionRequirement(effect) &&
      !ServerGameService.isGoddessTierEffect(effect);
  },

  hasGlobalDisableErosionRequirementEffects(gameState: GameState) {
    return Object.values(gameState.players).some(player =>
      [...player.unitZone, ...player.itemZone, ...player.erosionFront]
        .filter((card): card is Card => !!card)
        .some(card =>
          card.effects?.some(effect =>
            effect.type === 'CONTINUOUS' &&
            effect.content === 'DISABLE_EROSION_REQUIREMENT_EFFECTS' &&
            (!effect.condition || effect.condition(gameState, player, card))
          )
        )
    );
  },

  getForcedAttackUnit(gameState: GameState, playerId: string) {
    return ServerGameService.getForcedAttackUnits(gameState, playerId)[0];
  },

  getForcedAttackUnits(gameState: GameState, playerId: string) {
    const player = gameState.players[playerId];
    if (!player) return [];
    if (ServerGameService.isPlayerAttackLockedThisTurn(gameState, playerId)) return [];

    return player.unitZone.filter((unit): unit is Card => {
      if (!unit) return false;
      const forcedAttackTurn = (unit as any).data?.forcedAttackTurn;
      if (forcedAttackTurn !== gameState.turnCount) return false;
      if (!ServerGameService.canExhaustForDeclaration(unit, gameState) || unit.canAttack === false) return false;
      if ((unit as any).battleForbiddenByEffect) return false;
      if ((unit as any).data?.cannotAttackThisTurn === gameState.turnCount) return false;
      if ((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount) return false;

      const isRush = !!unit.isrush;
      const wasPlayedThisTurn = unit.playedTurn === gameState.turnCount;
      return isRush || !wasPlayedThisTurn;
    });
  },

  canUnitDefendInCurrentBattle(gameState: GameState, unit: Card | null | undefined) {
    if (!unit || !gameState.battleState) return false;
    if (unit.isExhausted) return false;
    if ((unit as any).battleForbiddenByEffect) return false;
    if ((unit as any).data?.cannotDefendTurn === gameState.turnCount) return false;
    if ((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount) return false;
    if (!ServerGameService.canExhaustForDeclaration(unit, gameState)) return false;

    const lockedTargetId = gameState.battleState.defenseLockedToTargetId;
    if (lockedTargetId && unit.gamecardId !== lockedTargetId) return false;

    const minPower = gameState.battleState.defensePowerRestriction || 0;
    if (minPower > 0 && (unit.power || 0) < minPower) return false;

    const maxPower = gameState.battleState.defenseMaxPowerRestriction;
    if (maxPower !== undefined && (unit.power || 0) >= maxPower) return false;

    const turnPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
    const attackers = (gameState.battleState.attackers || [])
      .map(id => gameState.players[turnPlayerId]?.unitZone.find(attacker => attacker?.gamecardId === id))
      .filter((attacker): attacker is Card => !!attacker);
    const minExclusive = Math.max(0, ...attackers.map(attacker => (attacker as any).data?.defenseMinPower || 0));
    return minExclusive <= 0 || (unit.power || 0) > minExclusive;
  },

  isPlayerAttackLockedThisTurn(gameState: GameState, playerUid: string) {
    const player = gameState.players[playerUid];
    return !!player && (player as any).cannotDeclareAttackTurn === gameState.turnCount;
  },

  applyExtraTurnIfQueued(gameState: GameState, currentPlayerId: string) {
    const player = gameState.players[currentPlayerId];
    if (!player || (player as any).extraTurnAfterCurrentTurn !== gameState.turnCount) return false;

    delete (player as any).extraTurnAfterCurrentTurn;
    gameState.currentTurnPlayer = gameState.playerIds.indexOf(currentPlayerId) as 0 | 1;
    if (gameState.currentTurnPlayer !== 0 && gameState.currentTurnPlayer !== 1) {
      gameState.currentTurnPlayer = 0;
    }
    gameState.logs.push(`[追加回合] ${player.displayName} 获得了一个追加回合。`);
    return true;
  },

  ensureBattleInstanceId(gameState: GameState) {
    if (!gameState.battleState) return undefined;
    const battleState = gameState.battleState as any;
    if (!battleState.battleId) {
      battleState.battleId = `battle_${gameState.turnCount}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return battleState.battleId as string;
  },

  async enterForcedAttackBattleIfNeeded(gameState: GameState, playerId: string, onUpdate?: (state: GameState) => Promise<void>, reason: string = 'FORCED_ATTACK') {
    if (gameState.gameStatus === 2 || gameState.pendingQuery || gameState.isResolvingStack || gameState.currentProcessingItem) return false;
    if (gameState.turnCount <= 1) return false;

    const player = gameState.players[playerId];
    if (!player?.isTurn) return false;

    EventEngine.recalculateContinuousEffects(gameState);
    const forcedAttackUnits = ServerGameService.getForcedAttackUnits(gameState, playerId);
    if (forcedAttackUnits.length === 0) return false;

    gameState.phase = 'BATTLE_DECLARATION';
    gameState.phaseTimerStart = Date.now();

    if (forcedAttackUnits.length === 1) {
      const unit = forcedAttackUnits[0];
      await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', data: { phase: 'BATTLE_DECLARATION', reason } }, onUpdate);
      gameState.logs.push(`[强制攻击] ${player.displayName} 必须用 [${unit.fullName}] 攻击。`);
      if (gameState.pendingQuery || gameState.phase !== 'BATTLE_DECLARATION') return true;
      await ServerGameService.declareAttack(gameState, playerId, [unit.gamecardId], false, undefined, undefined, onUpdate);
      return true;
    }

    await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', data: { phase: 'BATTLE_DECLARATION', reason: `${reason}_CHOICE` } }, onUpdate);
    gameState.logs.push(`[强制攻击] ${player.displayName} 有多个必须攻击的单位，进入攻击宣言阶段请选择其中1个攻击。`);
    return true;
  },

  canUse204000145AsPaymentSubstitute(paymentCard: Card | undefined, cardColor?: string, cost?: number, playingCardId?: string) {
    return !!paymentCard &&
      paymentCard.id === '204000145' &&
      paymentCard.gamecardId !== playingCardId &&
      cardColor === 'BLUE' &&
      !!cost &&
      cost > 0 &&
      cost <= 3;
  },

  canUse205000136AsPaymentSubstitute(paymentCard: Card | undefined, cardColor?: string, cost?: number, playingCardId?: string) {
    return !!paymentCard &&
      paymentCard.id === '205000136' &&
      paymentCard.gamecardId !== playingCardId &&
      cardColor === 'YELLOW' &&
      !!cost &&
      cost > 0 &&
      cost <= 3;
  },

  canUseStoryPaymentSubstitute(paymentCard: Card | undefined, playingCard: Card | undefined, cost?: number, playingCardId?: string) {
    if (!paymentCard || paymentCard.gamecardId === playingCardId || !playingCard || !cost || cost <= 0) return false;
    if (paymentCard.id === '201000132' || paymentCard.id === '201000148' || paymentCard.id === '203000146') {
      return playingCard.color === 'WHITE' && (playingCard.acValue || 0) <= 3;
    }
    if (paymentCard.id === '202000151') {
      return playingCard.color === 'RED' && (playingCard.acValue || 0) <= 3;
    }
    if (paymentCard.id === '202060130') {
      return playingCard.faction === '雷霆';
    }
    return false;
  },

  hydrateCard(card: Card | null) {
    if (!card || (!card.id && !card.uniqueId)) return;
    const masterCard = SERVER_CARD_LIBRARY[card.uniqueId] || SERVER_CARD_LIBRARY[card.id];
    if (!card.baseColorReq) {
      card.baseColorReq = { ...(masterCard?.colorReq || card.colorReq || {}) };
    }
    if (masterCard) {
      card.basePower = card.basePower ?? masterCard.basePower ?? masterCard.power;
      card.baseDamage = card.baseDamage ?? masterCard.baseDamage ?? masterCard.damage;
      card.baseAcValue = card.baseAcValue ?? masterCard.baseAcValue ?? masterCard.acValue;
      card.baseIsrush = card.baseIsrush ?? masterCard.baseIsrush ?? masterCard.isrush ?? false;
      card.baseCanAttack = card.baseCanAttack ?? masterCard.baseCanAttack ?? masterCard.canAttack ?? true;
      card.baseGodMark = card.baseGodMark ?? masterCard.baseGodMark ?? masterCard.godMark;
      card.baseCanActivateEffect = card.baseCanActivateEffect ?? masterCard.baseCanActivateEffect ?? masterCard.canActivateEffect ?? true;
      if (card.isrush === undefined) card.isrush = card.baseIsrush;
      if (card.canAttack === undefined) card.canAttack = card.baseCanAttack;
      if (card.godMark === undefined) card.godMark = !!card.baseGodMark;
    }
    if (masterCard && masterCard.effects) {
      // Re-assign effects to restore functions lost during JSON serialization
      const runtimeGrantedEffects = (card.effects || [])
        .filter(effect => effect.grantedByEquipSourceId)
        .map(effect => {
          if (String(effect.id || '').startsWith('305000080_granted_activate:') && effect.grantedByEquipSourceId) {
            return somelinStorybookGrantedActivate(effect.grantedByEquipSourceId);
          }
          return effect;
        });

      card.effects = masterCard.effects.map((originalEffect, idx) => {
        const runtimeEffect = card.effects ? card.effects[idx] : null;
        return {
          ...(runtimeEffect || originalEffect),
          condition: originalEffect.condition,
          execute: originalEffect.execute,
          cost: originalEffect.cost,
          onQueryResolve: originalEffect.onQueryResolve,
          onCostResolve: originalEffect.onCostResolve,
          resolve: originalEffect.resolve,
          applyContinuous: originalEffect.applyContinuous,
          removeContinuous: originalEffect.removeContinuous,
          wealthValue: originalEffect.wealthValue ?? runtimeEffect?.wealthValue,
          playerEffectScope: originalEffect.playerEffectScope ?? runtimeEffect?.playerEffectScope,
          playerEffectDescription: originalEffect.playerEffectDescription ?? runtimeEffect?.playerEffectDescription,
          hideFromCardInfluence: originalEffect.hideFromCardInfluence ?? runtimeEffect?.hideFromCardInfluence
        };
      });
      if (runtimeGrantedEffects.length) {
        const baseIds = new Set(card.effects.map(effect => effect.id));
        card.effects = [
          ...card.effects,
          ...runtimeGrantedEffects.filter(effect => !baseIds.has(effect.id))
        ];
      }
    }
    if (
      card.type === 'UNIT' &&
      card.fullName?.includes('图腾') &&
      !card.effects?.some(effect => effect.id === '103080184_granted_totem_revive')
    ) {
      card.effects = [...(card.effects || []), grantedTotemReviveFromGrave()];
    }
  },

  hydrateVirtualTriggerRecord(record: any) {
    if (!record || record.effectIndex >= 0 || !record.virtualTriggerType) return record;
    const payload = record.virtualPayload || {};
    const queueId = record.queueId || record.effect?.id || `${record.virtualTriggerType}_${payload.targetCardId || record.playerUid || 'effect'}`;
    const sourceName = payload.sourceName || record.card?.fullName || '卡牌效果';
    record.effect = {
      ...(record.effect || {}),
      id: record.effect?.id || queueId,
      type: 'TRIGGER',
      triggerEvent: 'TURN_END' as any,
      isMandatory: true,
      execute: async (_source: Card, state: GameState, player: PlayerState) => {
        await ServerGameService.executeVirtualTriggerRecord(state, player, record);
      }
    };
    if (!record.effect.description) {
      if (record.virtualTriggerType === 'RETURN_TO_OWNER_FIELD_AT_END') {
        record.effect.description = `[${sourceName}] 回合结束时将 [${record.card?.fullName || '目标'}] 放回持有者战场。`;
      } else if (record.virtualTriggerType === 'RETURN_TO_EXILE_AT_END') {
        record.effect.description = `[${sourceName}] 回合结束时将 [${record.card?.fullName || '目标'}] 放逐。`;
      } else if (record.virtualTriggerType === 'RETURN_TO_DECK_BOTTOM_AT_END') {
        record.effect.description = `[${sourceName}] 回合结束时将 [${record.card?.fullName || '目标'}] 放置到卡组底。`;
      } else if (record.virtualTriggerType === 'LOSE_AT_END') {
        record.effect.description = `[${sourceName}] 回合结束时你输掉游戏。`;
      } else {
        record.effect.description = '回合结束时处理延迟效果。';
      }
    }
    return record;
  },

  async executeVirtualTriggerRecord(state: GameState, player: PlayerState, record: any) {
    const payload = record.virtualPayload || {};
    const sourceName = payload.sourceName || record.card?.fullName || '卡牌效果';
    const sourceCardId = payload.sourceCardId;
    const targetCardId = payload.targetCardId || record.card?.gamecardId;

    if (record.virtualTriggerType === 'RETURN_TO_OWNER_FIELD_AT_END') {
      const live = ServerGameService.findCardLocation(state, targetCardId);
      if (!live || live.zone !== 'EXILE' || live.ownerUid !== (payload.ownerUid || live.ownerUid)) return;
      const target = live.card;
      const ownerUid = payload.ownerUid || live.ownerUid;
      const owner = state.players[ownerUid];
      if (!owner) return;
      const returnZone: TriggerLocation = target.type === 'ITEM' || target.isEquip ? 'ITEM' : 'UNIT';
      const hasOpenSlot = returnZone === 'ITEM'
        ? owner.itemZone.some(slot => slot === null)
        : owner.unitZone.some(slot => slot === null);
      const hasSpecialNameConflict = !!target.specialName && (
        returnZone === 'ITEM'
          ? owner.itemZone.some(card => card?.specialName === target.specialName)
          : owner.unitZone.some(card => card?.specialName === target.specialName)
      );
      const data = (target as any).data || {};
      delete data.returnToOwnerFieldAtTurnEndSourceName;
      delete data.returnToOwnerFieldAtTurnEndOwnerUid;
      delete data.returnToOwnerFieldAtTurnEndSourceCardId;
      if (!hasOpenSlot || hasSpecialNameConflict) {
        state.logs.push(`[${sourceName}] [${target.fullName}] 因没有可用区域或同名专用卡冲突，无法在回合结束时回到战场。`);
        return;
      }
      ServerGameService.moveCard(state, ownerUid, 'EXILE', ownerUid, returnZone, target.gamecardId, {
        isEffect: true,
        faceDown: false,
        effectSourcePlayerUid: payload.effectOwnerUid || ownerUid,
        effectSourceCardId: sourceCardId
      });
      const returned = ServerGameService.findCardById(state, targetCardId);
      if (returned) {
        returned.isExhausted = false;
        returned.displayState = 'FRONT_UPRIGHT';
      }
      state.logs.push(`[${sourceName}] 回合结束时将 [${target.fullName}] 放回持有者战场。`);
      return;
    }

    if (record.virtualTriggerType === 'RETURN_TO_EXILE_AT_END') {
      const live = ServerGameService.findCardLocation(state, targetCardId);
      if (!live || (live.card as any).data?.returnToExileAtEndTurn !== state.turnCount) return;
      const predicateKey = (live.card as any).data.returnToExileAtEndPredicateKey || payload.predicateKey || 'STILL_IN_UNIT';
      if (predicateKey === 'STILL_IN_UNIT' && live.zone !== 'UNIT') return;
      delete (live.card as any).data.returnToExileAtEndTurn;
      delete (live.card as any).data.returnToExileSourceName;
      delete (live.card as any).data.returnToExileSourceCardId;
      delete (live.card as any).data.returnToExileEffectOwnerUid;
      delete (live.card as any).data.returnToExileAtEndPredicate;
      delete (live.card as any).data.returnToExileAtEndPredicateKey;
      ServerGameService.moveCard(state, live.ownerUid, live.zone, live.ownerUid, 'EXILE', live.card.gamecardId, {
        isEffect: true,
        faceDown: false,
        effectSourcePlayerUid: payload.effectOwnerUid || live.ownerUid,
        effectSourceCardId: sourceCardId
      });
      state.logs.push(`[${sourceName}] 回合结束时将 [${live.card.fullName}] 放逐。`);
      return;
    }

    if (record.virtualTriggerType === 'RETURN_TO_DECK_BOTTOM_AT_END') {
      const live = ServerGameService.findCardLocation(state, targetCardId);
      if (!live || (live.card as any).data?.returnToDeckBottomAtTurnEnd !== state.turnCount) return;
      delete (live.card as any).data.returnToDeckBottomAtTurnEnd;
      delete (live.card as any).data.returnToDeckBottomSourceName;
      delete (live.card as any).data.returnToDeckBottomSourceCardId;
      delete (live.card as any).data.returnToDeckBottomOwnerUid;
      ServerGameService.moveCard(state, live.ownerUid, live.zone, live.ownerUid, 'DECK', live.card.gamecardId, {
        insertAtBottom: true,
        isEffect: true,
        effectSourcePlayerUid: payload.effectOwnerUid || live.ownerUid,
        effectSourceCardId: sourceCardId
      });
      state.logs.push(`[${sourceName}] 将 [${live.card.fullName}] 放置到卡组底。`);
      return;
    }

    if (record.virtualTriggerType === 'LOSE_AT_END') {
      delete (player as any).loseAtEndOfTurn;
      delete (player as any).loseAtEndOfTurnSourceName;
      delete (player as any).loseAtEndOfTurnSourceCardId;
      delete (player as any).loseAtEndOfTurnSourceCardSnapshot;
      state.gameStatus = 2;
      state.winReason = 'CARD_EFFECT_SPECIAL_WIN';
      state.winnerId = state.playerIds.find(id => id !== player.uid);
      state.winSourceCardName = sourceName;
      state.logs.push(`[游戏结束] ${player.displayName} 因 [${sourceName}] 的效果在回合结束时判负。`);
    }
  },

  hydrateGameState(gameState: GameState) {
    if (!gameState || !gameState.players) return;
    Object.values(gameState.players).forEach(player => {
      player.hand.forEach(card => {
        if (card) {
          card.cardlocation = 'HAND';
          ServerGameService.hydrateCard(card);
        }
      });
      player.deck.forEach(card => {
        if (card) {
          card.cardlocation = 'DECK';
          ServerGameService.hydrateCard(card);
        }
      });
      player.grave.forEach(card => {
        if (card) {
          card.cardlocation = 'GRAVE';
          ServerGameService.hydrateCard(card);
        }
      });
      player.exile.forEach(card => {
        if (card) {
          card.cardlocation = 'EXILE';
          ServerGameService.hydrateCard(card);
        }
      });
      player.unitZone.forEach(card => {
        if (card) {
          card.cardlocation = 'UNIT';
          ServerGameService.hydrateCard(card);
        }
      });
      player.itemZone.forEach(card => {
        if (card) {
          card.cardlocation = 'ITEM';
          ServerGameService.hydrateCard(card);
        }
      });
      player.erosionFront.forEach(card => {
        if (card) {
          card.cardlocation = 'EROSION_FRONT';
          card.isExhausted = false;
          ServerGameService.hydrateCard(card);
        }
      });
      player.erosionBack.forEach(card => {
        if (card) {
          card.cardlocation = 'EROSION_BACK';
          card.isExhausted = false;
          ServerGameService.hydrateCard(card);
        }
      });
      player.playZone.forEach(card => {
        if (card) {
          card.cardlocation = 'PLAY';
          ServerGameService.hydrateCard(card);
        }
      });
    }
    );
    // Also hydrate cards in the counter stack
    if (gameState.counterStack) {
      gameState.counterStack.forEach(item => {
        if (item.card) ServerGameService.hydrateCard(item.card);
      });
    }

    if (gameState.triggeredEffectsQueue) {
      gameState.triggeredEffectsQueue = gameState.triggeredEffectsQueue.map(record => {
        if (!record || !record.card) return record;

        ServerGameService.hydrateCard(record.card);
        if (record.sourceCard) ServerGameService.hydrateCard(record.sourceCard);
        ServerGameService.hydrateVirtualTriggerRecord(record);

        if (record.effectIndex >= 0 && record.card.effects) {
          const masterEffect = record.card.effects[record.effectIndex];
          if (masterEffect) {
            record.effect = { ...record.effect, ...masterEffect };
          }
        }
        return record;
      });
    }

    // New: Hydrate cards and effects in pending resolutions
    if (gameState.pendingResolutions) {
      gameState.pendingResolutions = gameState.pendingResolutions.map(record => {
        if (!record || !record.card) return record;

        ServerGameService.hydrateCard(record.card);
        if (record.sourceCard) ServerGameService.hydrateCard(record.sourceCard);
        ServerGameService.hydrateVirtualTriggerRecord(record);

        // Find the matching effect in the library and restore it entirely
        if (record.effectIndex >= 0 && record.card.effects) {
          const masterEffect = record.card.effects[record.effectIndex];
          if (masterEffect) {
            // Merge all properties from the library to restore functions and metadata
            record.effect = { ...record.effect, ...masterEffect };
          }
        }
        return record;
      });
    }

    // New: After restoring all functions, recalculate all continuous effects to ensure stats are correct
    EventEngine.recalculateContinuousEffects(gameState);
  },

  // Validate deck: 50 cards, max 10 God Mark, max 4 per card
  validateDeck(cards: Card[]): { valid: boolean; error?: string } {
    if (cards.length !== 50) {
      return { valid: false, error: `卡组必须正好为 50 张卡牌 (当前: ${cards.length})` };
    }
    const godMarkCount = cards.filter(c => c.godMark).length;
    if (godMarkCount > 10) {
      return { valid: false, error: `卡组中带有神蚀标记的卡牌不能超过 10 张 (当前: ${godMarkCount})` };
    }

    // Check for max 4 of each card adjustment group and forbid mixing versions.
    const counts: { [id: string]: number } = {};
    const versions: { [id: string]: string } = {};
    for (const card of cards) {
      const groupId = getCardAdjustmentGroupId(card);
      const version = getCardAdjustmentVersionKey(card);
      if (versions[groupId] && versions[groupId] !== version) {
        return { valid: false, error: `卡牌 [${card.fullName}] 的调整前/后版本不能同时加入卡组` };
      }
      versions[groupId] = version;

      counts[groupId] = (counts[groupId] || 0) + 1;
      if (counts[groupId] > 4) {
        return { valid: false, error: `同名卡牌 [${card.fullName}] 在卡组中不能超过 4 张` };
      }
    }

    return { valid: true };
  },

  exhaustCard(card: Card, gameState?: GameState) {
    if (!card) return false;
    const untilTurn = (card as any).data?.cannotExhaustUntilTurn;
    if (untilTurn !== undefined && (!gameState || untilTurn >= gameState.turnCount)) {
      return false;
    }
    card.isExhausted = true;
    return true;
  },

  canExhaustForDeclaration(card: Card | null | undefined, gameState: GameState) {
    if (!card || card.isExhausted) return false;
    const untilTurn = (card as any).data?.cannotExhaustUntilTurn;
    return untilTurn === undefined || untilTurn < gameState.turnCount;
  },

  readyCard(card: Card) {
    if (card) {
      card.isExhausted = false;
    }
  },

  has102050091ExhaustedAttack(card: Card | undefined) {
    return !!card && !!(card as any).data?.canAttackExhausted;
  },

  hasReadyUnitAttack(card: Card | undefined) {
    return !!card && !!(card as any).data?.canAttackReady;
  },

  getBattleDestroySaveCandidate(gameState: GameState, playerId: string, targetUnitId: string): { card: Card; effect: CardEffect; effectIndex: number } | undefined {
    const player = gameState.players[playerId];
    if (!player) return undefined;

    const event: GameEvent = {
      type: 'CARD_DESTROYED_BATTLE',
      playerUid: playerId,
      targetCardId: targetUnitId,
      data: {
        beforeDestroy: true,
        targetUnitId,
        attackerIds: gameState.battleState?.attackers || [],
        defenderId: gameState.battleState?.defender,
        isAlliance: gameState.battleState?.isAlliance || false
      }
    };

    for (const card of player.hand) {
      const effects = card.effects || [];
      for (let effectIndex = 0; effectIndex < effects.length; effectIndex += 1) {
        const effect = effects[effectIndex];
        if (!effect.battleDestroySave) continue;
        const result = ServerGameService.checkEffectLimitsAndReqs(gameState, playerId, card, effect, 'HAND', event);
        if (result.valid) return { card, effect, effectIndex };
      }
    }

    return undefined;
  },

  async resolveBattleDestroySaveAfterCost(
    gameState: GameState,
    playerUid: string,
    context: any,
    selections: string[] = [],
    onUpdate?: (state: GameState) => Promise<void>
  ): Promise<GameState> {
    const { cardId, targetUnitId, isEffect, sourcePlayerId, effectIndex, effectId } = context;
    const player = gameState.players[playerUid];
    const handCard = player?.hand.find(card => card.gamecardId === cardId);
    const effect = effectIndex !== undefined
      ? handCard?.effects?.[effectIndex]
      : effectId
        ? handCard?.effects?.find(e => e.id === effectId)
        : undefined;

    if (handCard && effect?.onCostResolve) {
      await effect.onCostResolve(handCard, gameState, player, selections, context);
      if (context?.battleDestroySaveResolved) {
        ServerGameService.recordEffectUsage(gameState, playerUid, handCard, effect);
        EventEngine.recalculateContinuousEffects(gameState);
        await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      } else {
        gameState.logs.push(`[${handCard.fullName}] 防止破坏失败。`);
        const destroyed = await ServerGameService.destroyUnit(gameState, playerUid, targetUnitId, isEffect, sourcePlayerId, false, true);
        if (destroyed === undefined) return gameState;
      }
    } else {
      gameState.logs.push(`[${handCard?.fullName || '战斗破坏防止'}] 无法结算，防止破坏失败。`);
      const destroyed = await ServerGameService.destroyUnit(gameState, playerUid, targetUnitId, isEffect, sourcePlayerId, false, true);
      if (destroyed === undefined) return gameState;
    }

    if (gameState.battleState) {
      gameState.battleState.resolvedUnitIds = gameState.battleState.resolvedUnitIds || [];
      if (!gameState.battleState.resolvedUnitIds.includes(targetUnitId)) {
        gameState.battleState.resolvedUnitIds.push(targetUnitId);
      }
    }

    if (gameState.phase === 'DAMAGE_CALCULATION' && gameState.battleState) {
      await ServerGameService.resolveDamage(gameState);
    }
    return gameState;
  },

  normalizeForcedGuardBattleState(gameState: GameState) {
    const forcedGuardTargetId = gameState.battleState?.forcedGuardTargetId;
    if (!forcedGuardTargetId || !gameState.battleState) return;

    const defenderPlayerId = gameState.playerIds[gameState.currentTurnPlayer === 0 ? 1 : 0];
    const defenderPlayer = gameState.players[defenderPlayerId];
    const target = defenderPlayer?.unitZone.find(unit => unit?.gamecardId === forcedGuardTargetId);

    if (!target) {
      delete gameState.battleState.forcedGuardTargetId;
      return;
    }

    if (!ServerGameService.canUnitDefendInCurrentBattle(gameState, target)) {
      delete gameState.battleState.forcedGuardTargetId;
      delete gameState.battleState.defenseLockedToTargetId;
      if (gameState.battleState.defender === target.gamecardId) delete gameState.battleState.defender;
      if (gameState.battleState.unitTargetId === target.gamecardId) delete gameState.battleState.unitTargetId;
      return;
    }
    if (!ServerGameService.exhaustCard(target, gameState)) return;
    gameState.battleState.unitTargetId = target.gamecardId;
    gameState.battleState.defender = target.gamecardId;
    gameState.battleState.defenseLockedToTargetId = target.gamecardId;

    if (gameState.phase === 'DEFENSE_DECLARATION') {
      gameState.phase = 'BATTLE_FREE';
      gameState.phaseTimerStart = Date.now();
    }

    if (!gameState.battleState.forcedGuardLogged) {
      gameState.logs.push(`[系统] 强制护卫生效，跳过防御宣告并与 [${target.fullName}] 进行战斗。`);
      gameState.battleState.forcedGuardLogged = true;
    }
  },

  async tryApplyMinotaurShieldGuardOnAttackDeclaration(gameState: GameState, onUpdate?: (state: GameState) => Promise<void>) {
    if (!gameState.battleState) return false;

    const defenderPlayerId = gameState.playerIds[gameState.currentTurnPlayer === 0 ? 1 : 0];
    const defenderPlayer = gameState.players[defenderPlayerId];
    if (!defenderPlayer) return false;

    const hasGuildGodmarkUnit = defenderPlayer.unitZone.some(unit =>
      unit &&
      unit.godMark &&
      unit.faction === '九尾商会联盟'
    );
    if (!hasGuildGodmarkUnit) return false;

    const candidates = defenderPlayer.unitZone.filter((unit): unit is Card =>
      !!unit &&
      unit.id === '104020246' &&
      ServerGameService.canUnitDefendInCurrentBattle(gameState, unit)
    );

    if (candidates.length !== 1) return false;

    const target = candidates[0];
    if (!ServerGameService.exhaustCard(target, gameState)) return false;
    gameState.battleState.unitTargetId = target.gamecardId;
    gameState.battleState.defender = target.gamecardId;
    gameState.battleState.defenseLockedToTargetId = target.gamecardId;
    gameState.battleState.forcedGuardTargetId = target.gamecardId;
    gameState.battleState.forcedGuardLogged = false;
    gameState.logs.push(`[${target.fullName}] 强制本次攻击与 [${target.fullName}] 进行战斗，跳过防御宣告。`);
    gameState.currentProcessingItem = {
      type: 'EFFECT',
      card: target,
      ownerUid: defenderPlayerId,
      effectIndex: 1,
      timestamp: Date.now(),
      data: { isTriggeredEffect: true }
    };
    if (onUpdate) await onUpdate(gameState);
    await ServerGameService.waitForVisualDelay(gameState, ServerGameService.getTriggerVisualDelayMs());
    gameState.currentProcessingItem = null;
    if (onUpdate) await onUpdate(gameState);
    EventEngine.recalculateContinuousEffects(gameState);
    return true;
  },

  refreshCardAsNewInstance(card: Card) {
    const masterCard = SERVER_CARD_LIBRARY[card.uniqueId] || SERVER_CARD_LIBRARY[card.id];
    const newGamecardId = Math.random().toString(36).substring(2, 10);
    card.gamecardId = newGamecardId;
    card.runtimeFingerprint = `FP_${newGamecardId}_${Date.now()}`;
    delete (card as any).data;
    delete (card as any).__playSnapshot;
    card.equipTargetId = undefined;
    card.isExhausted = false;
    card.displayState = 'FRONT_UPRIGHT';
    card.canResetCount = 0;
    card.hasAttackedThisTurn = false;
    card.usedShenyiThisTurn = false;
    card.playedTurn = undefined;
    card.silencedEffectIds = [];
    card.temporaryPowerBuff = 0;
    card.temporaryDamageBuff = 0;
    card.temporaryRush = false;
    card.temporaryAnnihilation = false;
    card.temporaryHeroic = false;
    card.temporaryCanAttackAny = false;
    delete (card as any).temporaryExtraColors;
    delete (card as any).persistentExtraColors;
    card.temporaryBuffSources = {};
    card.temporaryBuffDetails = {};
    card.influencingEffects = [];
    if (masterCard) {
      card.basePower = masterCard.basePower ?? masterCard.power;
      card.baseDamage = masterCard.baseDamage ?? masterCard.damage;
      card.baseAcValue = masterCard.baseAcValue ?? masterCard.acValue;
      card.baseIsrush = masterCard.baseIsrush ?? masterCard.isrush;
      card.baseCanAttack = masterCard.baseCanAttack ?? masterCard.canAttack;
      card.baseGodMark = masterCard.baseGodMark ?? masterCard.godMark;
      card.baseCanActivateEffect = masterCard.baseCanActivateEffect ?? masterCard.canActivateEffect ?? true;
    }
    if (card.basePower !== undefined) card.power = card.basePower;
    if (card.baseDamage !== undefined) card.damage = card.baseDamage;
    if (card.baseAcValue !== undefined) card.acValue = card.baseAcValue;
    card.isrush = card.baseIsrush ?? false;
    card.canAttack = card.baseCanAttack ?? true;
    card.godMark = card.baseGodMark ?? card.godMark;
    if (card.baseCanActivateEffect !== undefined) {
      card.canActivateEffect = card.baseCanActivateEffect;
    } else {
      card.canActivateEffect = true;
    }
  },

  checkEffectLimitsAndReqs(gameState: GameState, playerUid: string, card: Card, effect: CardEffect, triggerLocation?: TriggerLocation, event?: GameEvent): { valid: boolean; reason?: string } {
    const player = gameState.players[playerUid];
    const cardData = (card as any).data || {};
    const pseudoGoddessActive = cardData.pseudoGoddessTenPlusTurn === gameState.turnCount;
    const activatedEffectsDisabled = cardData.pseudoGoddessDisableActivatedTurn === gameState.turnCount;
    const globalDisableAllActivated = ServerGameService.hasGlobalDisableAllActivated(gameState, playerUid);
    const globalDisableErosionRequirementEffects = ServerGameService.hasGlobalDisableErosionRequirementEffects(gameState);
    const effectivePlayer = pseudoGoddessActive ? { ...player, isGoddessMode: true } : player;
    if (!player) return { valid: false, reason: '未找到玩家信息' };

    // 1. Trigger Location
    if (effect.triggerLocation && triggerLocation) {
      if (!effect.triggerLocation.includes(triggerLocation)) {
        return { valid: false, reason: '发动位置不符合效果要求' };
      }
    }

    // 2. Limits
    if (effect.limitCount) {
      const usageMap = gameState.effectUsage || {};
      let key = '';
      if (effect.limitGlobal) {
        if (effect.limitNameType) {
          key = `game_${playerUid}_name_${card.id}_${effect.id}`;
        } else {
          key = `game_${playerUid}_instance_${card.gamecardId}_${effect.id}`;
        }
      } else {
        if (effect.limitNameType) {
          key = `turn_${gameState.turnCount}_${playerUid}_name_${card.id}_${effect.id}`;
        } else {
          key = `turn_${gameState.turnCount}_${playerUid}_instance_${card.gamecardId}_${effect.id}`;
        }
      }

      const currentUsage = usageMap[key] || 0;
      if (currentUsage >= effect.limitCount) {
        return { valid: false, reason: '已达到该效果的发动次数限制' };
      }
    }

    // 3. Erosion Limits
    if (effect.erosionFrontLimit) {
      const frontCount = player.erosionFront.filter(c => c !== null).length;
      if (frontCount < effect.erosionFrontLimit[0] || frontCount > effect.erosionFrontLimit[1]) {
        return { valid: false, reason: '侵蚀区正面卡牌数量不满足条件' };
      }
    }
    if (effect.erosionBackLimit) {
      const backCount = player.erosionBack.filter(c => c !== null).length;
      if (backCount < effect.erosionBackLimit[0] || backCount > effect.erosionBackLimit[1]) {
        return { valid: false, reason: '侵蚀区背面卡牌数量不满足条件' };
      }
    }
    if (effect.erosionTotalLimit) {
      const totalCount = player.erosionFront.filter(c => c !== null).length + player.erosionBack.filter(c => c !== null).length;
      const ignoresTenPlusLimit = pseudoGoddessActive && effect.erosionTotalLimit[0] >= 10;
      if (!ignoresTenPlusLimit && (totalCount < effect.erosionTotalLimit[0] || totalCount > effect.erosionTotalLimit[1])) {
        return { valid: false, reason: '侵蚀区卡牌总数不满足条件' };
      }
    }

    if (ServerGameService.isFullEffectSilencedThisTurn(gameState, card)) {
      return { valid: false, reason: '该卡牌本回合失去所有效果' };
    }

    // 4. Condition Check
    if (effect.condition) {
      if (!effect.condition(gameState, effectivePlayer as PlayerState, card, event)) {
        return { valid: false, reason: '不满足发动条件' };
      }
    }

    if (player.negatedNames && player.negatedNames.includes(card.fullName)) {
      return { valid: false, reason: '该卡牌本回合已被禁止发动' };
    }

    // 6. Effect Negation Check
    if (card.canActivateEffect === false) {
      return { valid: false, reason: '该卡牌已被无效，无法发动效果' };
    }
    if (card.silencedEffectIds && card.silencedEffectIds.includes(effect.id)) {
      return { valid: false, reason: '该效果已被封印' };
    }
    if (activatedEffectsDisabled && (effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED')) {
      return { valid: false, reason: '该卡本回合失去所有【启】能力' };
    }
    if (globalDisableAllActivated && (effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED')) {
      return { valid: false, reason: '当前有持续效果使所有卡失去【启】能力' };
    }
    if (globalDisableErosionRequirementEffects && ServerGameService.effectHasSubGoddessErosionRequirement(effect)) {
      return { valid: false, reason: '当前有持续效果使所有女神化以下的侵蚀区数量要求能力失效' };
    }

    // 7. Faction-lock Check
    if (player.factionLock && card.faction !== player.factionLock) {
      return { valid: false, reason: '已锁定阵营，无法发动该卡牌效果' };
    }

    if (
      card.type === 'STORY' &&
      !player.isTurn &&
      Object.entries(gameState.players).some(([uid, opponent]) =>
        uid !== playerUid &&
        [...opponent.unitZone, ...opponent.itemZone].some(source =>
          source?.effects?.some(sourceEffect => sourceEffect.type === 'CONTINUOUS' && sourceEffect.content === 'OPPONENT_STORY_ONLY_OWN_TURN')
        )
      )
    ) {
      return { valid: false, reason: '对手效果限制：只能在自己的回合中使用故事卡' };
    }

    return { valid: true };
  },

  recordEffectUsage(gameState: GameState, playerUid: string, card: Card, effect: CardEffect) {
    if (!effect.limitCount) return;

    if (!gameState.effectUsage) {
      gameState.effectUsage = {};
    }

    let key = '';
    if (effect.limitGlobal) {
      if (effect.limitNameType) {
        key = `game_${playerUid}_name_${card.id}_${effect.id}`;
      } else {
        key = `game_${playerUid}_instance_${card.gamecardId}_${effect.id}`;
      }
    } else {
      if (effect.limitNameType) {
        key = `turn_${gameState.turnCount}_${playerUid}_name_${card.id}_${effect.id}`;
      } else {
        key = `turn_${gameState.turnCount}_${playerUid}_instance_${card.gamecardId}_${effect.id}`;
      }
    }

    gameState.effectUsage[key] = (gameState.effectUsage[key] || 0) + 1;
  },

  moveCard(
    gameState: GameState,
    sourcePlayerId: string,
    sourceZone: TriggerLocation,
    targetPlayerId: string,
    targetZone: TriggerLocation,
    cardId: string,
    options?: {
      targetIndex?: number;
      faceDown?: boolean;
      insertAtBottom?: boolean;
      isEffect?: boolean;
      effectSourcePlayerUid?: string;
      effectSourceCardId?: string;
      suppressLog?: boolean;
      highAlchemyMaterialColors?: string[];
      highAlchemyMaterialCount?: number;
      onlySelfActivateSourceCardId?: string;
    }
  ): boolean {
    const sourcePlayer = gameState.players[sourcePlayerId];
    const targetPlayer = gameState.players[targetPlayerId];
    if (!sourcePlayer || !targetPlayer) return false;

    let card: Card | null = null;
    let sourceArray: any[] = [];
    let graveToDeckReplacementControllerUid: string | undefined;

    switch (sourceZone) {
      case 'HAND': sourceArray = sourcePlayer.hand; break;
      case 'GRAVE': sourceArray = sourcePlayer.grave; break;
      case 'EXILE': sourceArray = sourcePlayer.exile; break;
      case 'PLAY': sourceArray = sourcePlayer.playZone; break;
      case 'DECK': sourceArray = sourcePlayer.deck; break;
      case 'UNIT': sourceArray = sourcePlayer.unitZone; break;
      case 'ITEM': sourceArray = sourcePlayer.itemZone; break;
      case 'EROSION_FRONT': sourceArray = sourcePlayer.erosionFront; break;
      case 'EROSION_BACK': sourceArray = sourcePlayer.erosionBack; break;
    }

    let previousSourceCardIdForMove: string | undefined;
    const index = sourceArray.findIndex(c => c && (c.gamecardId === cardId || c.id === cardId));
    if (index !== -1) {
      card = sourceArray[index];
      if (
        targetZone === 'UNIT' &&
        card.type === 'UNIT' &&
        !satisfiesHighAlchemyEntryRestriction(card, options)
      ) {
        gameState.logs.push(`[系统] [${card.fullName}] ${getEntryRestrictionReason(card) || '不能通过当前方式进入战场'}。`);
        return false;
      }
      if (options?.isEffect && options.effectSourceCardId) {
        const sourceCard = ServerGameService.findCardById(gameState, options.effectSourceCardId);
        if (isProtectedGraveCardFromOpponentEffect(gameState, card, sourceCard, options.effectSourcePlayerUid)) {
          return false;
        }
        if (sourceCard && ServerGameService.isUnaffectedByCardEffect(gameState, card, sourceCard, options.effectSourcePlayerUid)) {
          return false;
        }
      }
      if (
        options?.isEffect &&
        (sourceZone === 'UNIT' || sourceZone === 'ITEM') &&
        !['UNIT', 'ITEM'].includes(targetZone) &&
        options.effectSourcePlayerUid &&
        options.effectSourcePlayerUid !== sourcePlayerId &&
        (card as any).data?.cannotLeaveFieldByOpponentEffectTurn === gameState.turnCount
      ) {
        const sourceName = (card as any).data?.cannotLeaveFieldByOpponentEffectSourceName || '卡牌效果';
        gameState.logs.push(`[${sourceName}] 防止了 [${card.fullName}] 因对手效果从战场离开。`);
        return false;
      }
      if (
        options?.isEffect &&
        (sourceZone === 'UNIT' || sourceZone === 'ITEM') &&
        !['UNIT', 'ITEM'].includes(targetZone) &&
        options.effectSourcePlayerUid &&
        options.effectSourcePlayerUid !== sourcePlayerId &&
        (card as any).data?.preventFirstOpponentEffectLeaveEachTurnSourceName &&
        (card as any).data.preventFirstOpponentEffectLeaveEachTurnUsedTurn !== gameState.turnCount
      ) {
        const sourceName = (card as any).data.preventFirstOpponentEffectLeaveEachTurnSourceName || 'card effect';
        (card as any).data.preventFirstOpponentEffectLeaveEachTurnUsedTurn = gameState.turnCount;
        gameState.logs.push(`[${sourceName}] prevented [${card.fullName}] from leaving the field by an opponent effect for the first time this turn.`);
        return false;
      }
      if (
        options?.isEffect &&
        (sourceZone === 'UNIT' || sourceZone === 'ITEM') &&
        !['UNIT', 'ITEM'].includes(targetZone) &&
        options.effectSourceCardId
      ) {
        const sourceCard = ServerGameService.findCardById(gameState, options.effectSourceCardId);
        if (
          sourceCard &&
          (card as any).data?.cannotLeaveFieldByOpponentAcLe !== undefined &&
          isOpponentAcAtMost(gameState, card, sourceCard, Number((card as any).data.cannotLeaveFieldByOpponentAcLe), options.effectSourcePlayerUid)
        ) {
          gameState.logs.push(`[${card.fullName}] cannot leave the field by opponent ACCESS ${(card as any).data.cannotLeaveFieldByOpponentAcLe} or less card effects.`);
          return false;
        }
      }
      if (
        options?.isEffect &&
        sourceZone === 'UNIT' &&
        targetZone === 'DECK' &&
        card.effects?.some(effect =>
          effect.type === 'CONTINUOUS' &&
          effect.preventEffectReturnToDeck &&
          ServerGameService.checkEffectLimitsAndReqs(gameState, sourcePlayerId, card, effect, sourceZone).valid
        )
      ) {
        gameState.logs.push(`[${card.fullName}] 不会由于卡的效果返回卡组。`);
        return false;
      }
      previousSourceCardIdForMove = card.gamecardId;
      if (sourceZone === 'UNIT' || sourceZone === 'ITEM' || sourceZone === 'EROSION_FRONT' || sourceZone === 'EROSION_BACK') {
        sourceArray[index] = null;
      } else {
        sourceArray.splice(index, 1);
      }
      EventEngine.handleCardLeftZone(gameState, sourcePlayerId, card, sourceZone, options?.isEffect, targetZone, {
        effectSourcePlayerUid: options?.effectSourcePlayerUid,
        effectSourceCardId: options?.effectSourceCardId,
        previousSourceCardId: previousSourceCardIdForMove
      });
    }

    if (!card) return false;

    if (targetZone === 'GRAVE' && (card.id === '201000140' || card.id === '201000040' || card.fullName === '解放之光')) {
      targetZone = 'EXILE';
      gameState.logs.push(`[替换效果] [${card.fullName}] 将要被送入墓地，改为放逐。`);
    }

    let exileWhenLeavesFieldReplacementData: Record<string, unknown> | undefined;
    if (
      (sourceZone === 'UNIT' || sourceZone === 'ITEM') &&
      targetZone !== 'EXILE' &&
      !['UNIT', 'ITEM'].includes(targetZone) &&
      (card as any).data?.exileWhenLeavesFieldSourceName
    ) {
      const data = (card as any).data || {};
      exileWhenLeavesFieldReplacementData = {
        exileWhenLeavesFieldSourceName: data.exileWhenLeavesFieldSourceName,
        exileWhenLeavesFieldSourceCardId: data.exileWhenLeavesFieldSourceCardId,
        exileWhenLeavesFieldMillControllerUid: data.exileWhenLeavesFieldMillControllerUid,
        exileWhenLeavesFieldMillTargetUid: data.exileWhenLeavesFieldMillTargetUid,
        exileWhenLeavesFieldMillAmount: data.exileWhenLeavesFieldMillAmount
      };
      targetZone = 'EXILE';
      gameState.logs.push(`[替换效果] [${card.fullName}] 离开战场时改为放逐。`);
    }

    if (
      options?.isEffect &&
      (sourceZone === 'EROSION_FRONT' || sourceZone === 'EROSION_BACK') &&
      targetZone === 'EXILE'
    ) {
      sourcePlayer.exiledFromErosionTurn = gameState.turnCount;
    }

    if (
      options?.isEffect &&
      sourceZone === 'GRAVE' &&
      targetZone === 'DECK' &&
      sourcePlayerId === targetPlayerId &&
      options.effectSourcePlayerUid === sourcePlayerId &&
      (sourcePlayer as any).replaceOwnGraveToDeckWithExileTurn === gameState.turnCount
    ) {
      targetZone = 'EXILE';
      graveToDeckReplacementControllerUid = (sourcePlayer as any).replaceOwnGraveToDeckWithExileControllerUid;
      gameState.logs.push(`[${(sourcePlayer as any).replaceOwnGraveToDeckWithExileSourceName || '墓地回卡组替换'}] 将 [${card.fullName}] 放置到卡组改为放逐。`);
    }

    if (options?.isEffect && sourceZone === 'DECK' && targetZone === 'HAND') {
      const replacement = Object.values(gameState.players)
        .flatMap(owner => [...owner.unitZone, ...owner.itemZone].filter((source): source is Card => !!source))
        .flatMap(source => (source.effects || [])
          .filter(effect => effect.type === 'CONTINUOUS' && effect.replaceDeckToHandWithDiscard)
          .map(effect => ({ source, effect }))
        )
        .find(({ effect, source }) => !effect.condition || effect.condition(gameState, targetPlayer, source));
      if (replacement) {
        gameState.logs.push(`[${replacement.source.fullName}] 将从卡组加入手牌的 [${card.fullName}] 改为舍弃。`);
        targetZone = 'GRAVE';
      }
    }

    // Movement Replacement logic (e.g. 104010484)
    if (options?.isEffect && (targetZone === 'HAND' || targetZone === 'DECK' || targetZone === 'EROSION_FRONT' || targetZone === 'EROSION_BACK')) {
      if (card.effects) {
        for (const effect of card.effects) {
          if (effect.type === 'CONTINUOUS' && effect.movementReplacementDestination) {
            if (!effect.condition || effect.condition(gameState, targetPlayer, card)) {
              gameState.logs.push(`[替换效果] ${card.fullName} 的移动目的地从 ${targetZone} 被替换为 ${effect.movementReplacementDestination}`);
              targetZone = effect.movementReplacementDestination;
              break;
            }
          }
        }
      }
    }

    const clearsBattlefieldState = shouldClearBattlefieldStateOnMove(sourceZone, targetZone);
    if (clearsBattlefieldState) {
      EventEngine.dispatchMovementSubEvents(gameState, {
        card,
        cardOwnerUid: sourcePlayerId,
        fromZone: sourceZone,
        toZone: targetZone,
        isEffect: options?.isEffect,
        effectSourcePlayerUid: options?.effectSourcePlayerUid,
        effectSourceCardId: options?.effectSourceCardId,
        previousSourceCardId: previousSourceCardIdForMove,
        onlyLeftFieldEvent: true,
        extraData: exileWhenLeavesFieldReplacementData
      });
      clearBattlefieldState(card);
    }

    if ((targetZone === 'HAND' || targetZone === 'DECK') && sourceZone !== 'HAND' && sourceZone !== 'DECK') {
      ServerGameService.refreshCardAsNewInstance(card);
    }

    if (!(card as any).data) {
      (card as any).data = {};
    }
    (card as any).data.lastMovedFromZone = sourceZone;
    (card as any).data.lastMovedToZone = targetZone;
    if (options?.isEffect) {
      (card as any).data.lastMovedByEffectTurn = gameState.turnCount;
      (card as any).data.lastMoveEffectSourceCardId = options.effectSourceCardId;
    }

    card.cardlocation = targetZone;
    if (options?.faceDown !== undefined) {
      card.displayState = options.faceDown ? 'FRONT_FACEDOWN' : 'FRONT_UPRIGHT';
    } else if (targetZone === 'EXILE') {
      card.displayState = 'FRONT_UPRIGHT';
    }
    if (targetZone === 'GRAVE') {
      card.displayState = 'FRONT_UPRIGHT';
      card.isExhausted = false;
    }

    if (targetZone === 'EROSION_FRONT' || targetZone === 'EROSION_BACK') {
      card.isExhausted = false;
      const currentErosion = targetPlayer.erosionFront.filter(c => c !== null).length + targetPlayer.erosionBack.filter(c => c !== null).length;
      if (currentErosion >= 10) {
        gameState.logs.push(`[侵蚀区已满] ${card.fullName} 因侵蚀区已达10张改为送入墓地。`);
        targetZone = 'GRAVE';
        card.cardlocation = 'GRAVE';
        card.displayState = 'FRONT_UPRIGHT';
        card.isExhausted = false;
      }
    }

    if (
      options?.isEffect &&
      targetZone === 'UNIT' &&
      card.type === 'UNIT' &&
      !targetPlayer.unitZone.some(slot => slot === null)
    ) {
      gameState.logs.push(`[单位区已满] ${card.fullName} 因单位区已满改为送入墓地。`);
      targetZone = 'GRAVE';
      card.cardlocation = 'GRAVE';
      card.displayState = 'FRONT_UPRIGHT';
      card.isExhausted = false;
      (card as any).data.lastMovedToZone = 'GRAVE';
    }

    if (targetZone === 'UNIT' || targetZone === 'ITEM') {
      ServerGameService.readyCard(card);
      // Mark as played this turn to handle summon sickness/triggers correctly
      card.playedTurn = gameState.turnCount;
    }

    if (
      options?.isEffect &&
      sourceZone === 'GRAVE' &&
      targetZone === 'UNIT' &&
      card.type === 'UNIT'
    ) {
      targetPlayer.unitFromGraveToFieldTurn = gameState.turnCount;
    }

    if (
      options?.isEffect &&
      targetZone === 'UNIT' &&
      card.type === 'UNIT' &&
      sourcePlayerId === targetPlayerId &&
      options.effectSourcePlayerUid === targetPlayerId &&
      (targetPlayer as any).ownEffectPlacedUnitsEnterExhaustedSilencedTurn === gameState.turnCount
    ) {
      const data = (card as any).data || {};
      (card as any).data = data;
      card.isExhausted = true;
      data.fullEffectSilencedTurn = gameState.turnCount;
      data.fullEffectSilenceSource = (targetPlayer as any).ownEffectPlacedUnitsEnterExhaustedSilencedSourceName || '深海幻想';
      data.placedByOwnEffectForcedExhaustedTurn = gameState.turnCount;
    }

    if (
      options?.isEffect &&
      sourceZone === 'DECK' &&
      targetZone === 'UNIT' &&
      options.effectSourceCardId
    ) {
      const sourceCard = ServerGameService.findCardById(gameState, options.effectSourceCardId);
      if (sourceCard && isAlchemyCard(sourceCard)) {
        (card as any).data.enteredFromDeckByAlchemyTurn = gameState.turnCount;
        (card as any).data.enteredFromDeckByAlchemySourceCardId = sourceCard.gamecardId;
      }
    }

    if (
      options?.isEffect &&
      targetZone === 'GRAVE' &&
      (sourceZone === 'UNIT' || sourceZone === 'ITEM')
    ) {
      (card as any).data.sentToGraveFromFieldByEffectTurn = gameState.turnCount;
      (card as any).data.sentToGraveFromFieldByEffectSourceCardId = options.effectSourceCardId;
    }

    let targetArray: any[] = [];
    switch (targetZone) {
      case 'HAND': targetArray = targetPlayer.hand; break;
      case 'GRAVE': targetArray = targetPlayer.grave; break;
      case 'EXILE': targetArray = targetPlayer.exile; break;
      case 'PLAY': targetArray = targetPlayer.playZone; break;
      case 'DECK': targetArray = targetPlayer.deck; break;
      case 'UNIT': targetArray = targetPlayer.unitZone; break;
      case 'ITEM': targetArray = targetPlayer.itemZone; break;
      case 'EROSION_FRONT': targetArray = targetPlayer.erosionFront; break;
      case 'EROSION_BACK': targetArray = targetPlayer.erosionBack; break;
    }

    if (targetZone === 'UNIT' || targetZone === 'ITEM' || targetZone === 'EROSION_FRONT' || targetZone === 'EROSION_BACK') {
      if (options?.targetIndex !== undefined && options.targetIndex >= 0 && options.targetIndex < targetArray.length) {
        targetArray[options.targetIndex] = card;
      } else {
        const emptyIndex = targetArray.findIndex(c => c === null);
        if (emptyIndex !== -1) {
          targetArray[emptyIndex] = card;
        } else {
          targetArray.push(card);
        }
      }
    } else {
      if (options?.insertAtBottom) {
        targetArray.unshift(card);
      } else {
        targetArray.push(card);
      }
    }

    EventEngine.handleCardEnteredZone(gameState, targetPlayerId, card, targetZone, options?.isEffect, {
      sourceZone,
      targetZone,
      effectSourcePlayerUid: options?.effectSourcePlayerUid,
      effectSourceCardId: options?.effectSourceCardId,
      effectResolutionBatchKey: getCurrentEffectResolutionBatchKey(gameState)
    });
    EventEngine.dispatchMovementSubEvents(gameState, {
      card,
      cardOwnerUid: sourcePlayerId,
      fromZone: sourceZone,
      toZone: targetZone,
      isEffect: options?.isEffect,
      effectSourcePlayerUid: options?.effectSourcePlayerUid,
      effectSourceCardId: options?.effectSourceCardId,
      previousSourceCardId: previousSourceCardIdForMove,
      skipLeftFieldEvent: clearsBattlefieldState,
      extraData: exileWhenLeavesFieldReplacementData
    });

    if (
      sourceZone !== targetZone &&
      !options?.suppressLog &&
      options?.isEffect &&
      targetZone === 'HAND'
    ) {
      addCardAddedToHandBattleLog(gameState, {
        playerUid: targetPlayerId,
        actorUid: options.effectSourcePlayerUid || sourcePlayerId,
        card,
        sourceCard: options.effectSourceCardId
          ? ServerGameService.findCardById(gameState, options.effectSourceCardId)
          : undefined,
        fromZone: sourceZone,
        isEffect: true
      });
    }

    if (graveToDeckReplacementControllerUid) {
      ServerGameService.applyDamageToPlayer(gameState, sourcePlayerId, 1, 'EFFECT');
    }

    if (targetZone === 'EROSION_BACK') {
      ServerGameService.checkWinConditions(gameState);
    }

    if (
      (targetZone === 'EROSION_FRONT' || targetZone === 'EROSION_BACK') &&
      targetPlayer.erosionFront.filter(c => c !== null).length + targetPlayer.erosionBack.filter(c => c !== null).length >= 10 &&
      !targetPlayer.isGoddessMode
    ) {
      if (options?.isEffect) {
        (gameState as any).pendingGoddessTransformationDamageSource = 'EFFECT';
        (gameState as any).pendingGoddessTransformationEffectSourcePlayerUid = options.effectSourcePlayerUid;
        (gameState as any).pendingGoddessTransformationEffectSourceCardId = options.effectSourceCardId;
      }
      ServerGameService.triggerGoddessTransformation(gameState, targetPlayerId);
    }

    return true;
  },

  canPlayCard(gameState: GameState, player: PlayerState, card: Card, options?: { skipColorRequirementCheck?: boolean; skipPlayEffectRequirementCheck?: boolean }): { canPlay: boolean; reason?: string } {
    if (player.negatedNames && player.negatedNames.includes(card.fullName)) {
      return { canPlay: false, reason: `该卡牌 [${card.fullName}] 在本回合已被禁止打出或发动` };
    }

    if (
      card.type === 'STORY' &&
      !player.isTurn &&
      Object.entries(gameState.players).some(([uid, opponent]) =>
        uid !== player.uid &&
        [...opponent.unitZone, ...opponent.itemZone].some(source =>
          source?.effects?.some(effect => effect.type === 'CONTINUOUS' && effect.content === 'OPPONENT_STORY_ONLY_OWN_TURN')
        )
      )
    ) {
      return { canPlay: false, reason: '对手效果限制：只能在自己的回合中使用故事卡' };
    }

    if (card.type === 'UNIT') {
      if (!player.unitZone.some(c => c === null)) {
        return { canPlay: false, reason: '单位区已满' };
      }
      if (card.specialName && player.unitZone.some(c => c?.specialName === card.specialName)) {
        return { canPlay: false, reason: '单位区已有同名专用卡' };
      }
      if (!satisfiesHighAlchemyEntryRestriction(card)) {
        return { canPlay: false, reason: getEntryRestrictionReason(card) || '这张卡不能通过当前方式进入战场' };
      }
    } else if (card.type === 'ITEM') {
      if (card.specialName && player.itemZone.some(c => c?.specialName === card.specialName)) {
        return { canPlay: false, reason: '道具区已有同名专用卡' };
      }
    }

    // 1.1 Godmark Unit Limit Check (e.g. 1040101739). This applies only to units.
    if (card.type === 'UNIT' && card.godMark) {
      // Check for limits on the field OR on the card itself
      const fieldEffects = player.unitZone
        .filter(u => u !== null)
        .flatMap(u => (u as Card).effects || []);

      const fieldLimitEffect = fieldEffects.find(e => e.type === 'CONTINUOUS' && e.limitGodmarkCount !== undefined);
      const selfLimitEffect = card.effects?.find(e => e.type === 'CONTINUOUS' && e.limitGodmarkCount !== undefined);

      const effectiveLimit = fieldLimitEffect?.limitGodmarkCount ?? selfLimitEffect?.limitGodmarkCount;

      if (effectiveLimit !== undefined) {
        const currentGodmarkCount = player.unitZone.filter(u => u && u.godMark).length;
        if (currentGodmarkCount >= effectiveLimit) {
          return { canPlay: false, reason: `场上神蚀单位数量达到上限 (${effectiveLimit})` };
        }
      }
    }

    // 3. Color Requirements
    if (!options?.skipColorRequirementCheck) {
      const availableColors: Record<string, number> = { RED: 0, WHITE: 0, YELLOW: 0, BLUE: 0, GREEN: 0, NONE: 0 };
      let omniColorCount = 0;

      const checkOmni = (c: Card | null) => {
        if (!c) return false;
        // Use robust ID matching (string/number safe)
        const isTargetId = String(c.id) === '105000481';
        const hasOmniEffect = c.effects && c.effects.some(e => e.id === '105000481_omni');
        return isTargetId || hasOmniEffect;
      };

      // Count fixed colors from Unit Zone
      player.unitZone.forEach(c => {
        if (!c) return;
        if (checkOmni(c)) {
          omniColorCount++;
        } else if (c.color !== 'NONE') {
          availableColors[c.color] = (availableColors[c.color] || 0) + 1;
        }
        const extraColors = [
          ...((c as any).temporaryExtraColors || []),
          ...((c as any).persistentExtraColors || [])
        ];
        extraColors.forEach(color => {
          if (typeof color === 'string' && color !== c.color && color in availableColors) {
            availableColors[color] = (availableColors[color] || 0) + 1;
          }
        });
      });

      const colorReqOptions = [card.colorReq || {}];
      if ((card as any).data?.spiritCostTarget103080185 || ServerGameService.hasSpiritDiscountTargetOnField(gameState, card)) {
        colorReqOptions.unshift({ GREEN: 1 });
      }
      const colorRequirementResults = colorReqOptions.map(req => {
        let totalDeficit = 0;
        for (const [color, reqCount] of Object.entries(req)) {
          const deficit = Math.max(0, (reqCount as number) - (availableColors[color] || 0));
          totalDeficit += deficit;
        }
        return { valid: totalDeficit <= omniColorCount, totalDeficit };
      });

      if (!colorRequirementResults.some(result => result.valid)) {
        const bestDeficit = Math.min(...colorRequirementResults.map(result => result.totalDeficit));
        return { canPlay: false, reason: `缺少颜色需求 (缺口: ${bestDeficit}, 可用变色单位: ${omniColorCount})` };
      }
    }



    // 4. Cost Check (AC Value)
    const canUseSpiritDiscountOption =
      ServerGameService.hasSpiritDiscountTargetOnField(gameState, card) &&
      ServerGameService.getColorRequirementResult(player, { GREEN: 1 }).valid;
    const cost = canUseSpiritDiscountOption ? 0 : ServerGameService.getEffectivePlayCost(player, card, gameState);
    const onlyFeijingPayment = card.effects?.some(effect => effect.content === 'ONLY_FEIJING_PAYMENT');
    if (cost < 0) {
      const absCost = Math.abs(cost);
      const faceUpFrontCount = player.erosionFront.filter(c => c !== null && c.displayState === 'FRONT_UPRIGHT').length;
      if (faceUpFrontCount < absCost) {
        return { canPlay: false, reason: `侵蚀区正面卡不足以支付费用 (需要 ${absCost} 张)` };
      }
    } else if (cost > 0) {
      let remainingCost = cost;
      if (onlyFeijingPayment && !player.hand.some(c =>
        c.gamecardId !== card.gamecardId &&
        c.feijingMark &&
        c.color === card.color
      )) {
        return { canPlay: false, reason: '这张卡只能通过菲晶能力支付使用费用' };
      }
      const hasSpecialSubstitute = player.hand.some(c =>
        ServerGameService.canUse204000145AsPaymentSubstitute(c, card.color, cost, card.gamecardId) ||
        ServerGameService.canUse205000136AsPaymentSubstitute(c, card.color, cost, card.gamecardId) ||
        ServerGameService.canUseStoryPaymentSubstitute(c, card, cost, card.gamecardId)
      );
      if (hasSpecialSubstitute) {
        remainingCost = 0;
      }

      // I. Check for Feijing card in hand (of the same color)
      const hasFeijing = player.hand.some(c =>
        c.gamecardId !== card.gamecardId &&
        c.feijingMark &&
        c.color === card.color
      );
      if (remainingCost > 0 && hasFeijing) {
        remainingCost = Math.max(0, remainingCost - 3);
      }

      // II. Check for ready units on field
      const readyUnitsCount = player.unitZone.filter(c => c !== null && !c.isExhausted).length;
      remainingCost = Math.max(0, remainingCost - readyUnitsCount);

      // III. Check Erosion space limit (cannot reach 10 total)
      if (remainingCost > 0) {
        if (player.deck.length < remainingCost) {
          return { canPlay: false, reason: '卡组数量不足以支付剩余费用' };
        }
        const totalErosionCount = player.erosionFront.filter(c => c !== null).length +
          player.erosionBack.filter(c => c !== null).length;
        const canUseWindProduction =
          (player as any).windProductionTurn === gameState.turnCount &&
          totalErosionCount + remainingCost === 10;
        if (!canUseWindProduction && totalErosionCount + remainingCost >= 10) {
          return { canPlay: false, reason: '侵蚀区空间不足 (总数不能超过 9 张)' };
        }
      }
    }

    // 5. Specific Effect Limits & Requirements (using comprehensive check)
    const playEffect = card.effects?.find(e => e.type === 'ACTIVATE' || e.type === 'TRIGGER' || e.type === 'ALWAYS');
    if (playEffect && !options?.skipPlayEffectRequirementCheck) {
      const isStory = card.type === 'STORY';
      const isAlways = playEffect.type === 'ALWAYS';
      const shouldValidate = isStory || isAlways;

      if (shouldValidate) {
        // Use the comprehensive engine check to validate limits, conditions, and erosion counts
        const validationLocation = card.type === 'STORY' ? 'PLAY' : (card.cardlocation as TriggerLocation);
        const result = ServerGameService.checkEffectLimitsAndReqs(gameState, player.uid, card, playEffect, validationLocation);
        if (!result.valid) {
          return { canPlay: false, reason: result.reason || '不满足发动条件' };
        }
      }
    }

    // 6. Faction-lock Check
    if (player.factionLock && card.faction !== player.factionLock) {
      return { canPlay: false, reason: `受到势力限制：只能打出 [${player.factionLock}] 势力的卡牌` };
    }

    return { canPlay: true };
  },

  playerHasAvailableConfrontationAction(gameState: GameState, playerId: string): boolean {
    const player = gameState.players[playerId];
    if (!player) return false;

    const turnPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
    const isCounteringTurn = gameState.phase === 'COUNTERING' && gameState.priorityPlayerId === playerId;
    const isBattleFreeTurnPlayer = gameState.phase === 'BATTLE_FREE' && turnPlayerId === playerId;
    const isBattleFreeAskedPlayer =
      gameState.phase === 'BATTLE_FREE' &&
      !!gameState.battleState?.askConfront &&
      (
        (gameState.battleState.askConfront === 'ASKING_OPPONENT' && turnPlayerId !== playerId) ||
        (gameState.battleState.askConfront === 'ASKING_TURN_PLAYER' && turnPlayerId === playerId)
      );
    if (!isCounteringTurn && !isBattleFreeTurnPlayer && !isBattleFreeAskedPlayer) return false;

    const hasPlayableStory = player.hand.some(card =>
      card.type === 'STORY' &&
      (isCounteringTurn || isBattleFreeTurnPlayer) &&
      ServerGameService.canPlayCard(gameState, player, card).canPlay
    );
    if (hasPlayableStory) return true;

    const activationZones: { cards: (Card | null)[]; location: TriggerLocation }[] = [
      { cards: player.unitZone, location: 'UNIT' },
      { cards: player.itemZone, location: 'ITEM' },
      { cards: player.erosionFront, location: 'EROSION_FRONT' },
      { cards: player.grave, location: 'GRAVE' },
      { cards: player.hand, location: 'HAND' }
    ];

    return activationZones.some(({ cards, location }) =>
      cards.some(card => {
        if (!card) return false;
        if (card.type === 'STORY' && location === 'HAND') return false;

        return !!card.effects?.some(effect =>
          (effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED') &&
          ServerGameService.checkEffectLimitsAndReqs(gameState, playerId, card, effect, location).valid
        );
      })
    );
  },

  async applyConfrontationStrategy(gameState: GameState, onUpdate?: (state: GameState) => Promise<void>) {
    if (
      gameState.phase === 'BATTLE_FREE' &&
      gameState.battleState &&
      !gameState.battleState.askConfront &&
      !gameState.pendingQuery &&
      !gameState.isResolvingStack &&
      !gameState.currentProcessingItem
    ) {
      const turnPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
      const player = gameState.players[turnPlayerId];
      if (!player) return gameState;

      const strategy = player.confrontationStrategy || 'AUTO';
      if (strategy === 'ON') return gameState;

      const hasAction = strategy === 'AUTO'
        ? ServerGameService.playerHasAvailableConfrontationAction(gameState, player.uid)
        : false;
      if (strategy === 'AUTO' && hasAction) return gameState;

      await ServerGameService.advancePhase(gameState, 'PROPOSE_DAMAGE_CALCULATION', player.uid, onUpdate);
      return ServerGameService.applyConfrontationStrategy(gameState, onUpdate);
    }

    if (
      gameState.phase === 'BATTLE_FREE' &&
      gameState.battleState?.askConfront &&
      !gameState.pendingQuery &&
      !gameState.isResolvingStack &&
      !gameState.currentProcessingItem
    ) {
      const turnPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
      const askedPlayerId = gameState.battleState.askConfront === 'ASKING_OPPONENT'
        ? gameState.playerIds.find(uid => uid !== turnPlayerId)
        : turnPlayerId;
      const player = askedPlayerId ? gameState.players[askedPlayerId] : undefined;
      if (!player) return gameState;

      const strategy = player.confrontationStrategy || 'AUTO';
      if (strategy === 'ON') return gameState;

      const hasAction = strategy === 'AUTO'
        ? ServerGameService.playerHasAvailableConfrontationAction(gameState, player.uid)
        : false;
      if (strategy === 'AUTO' && hasAction) return gameState;

      await ServerGameService.advancePhase(gameState, 'DECLINE_CONFRONTATION', player.uid, onUpdate);
      return ServerGameService.applyConfrontationStrategy(gameState, onUpdate);
    }

    if (
      gameState.phase !== 'COUNTERING' ||
      !gameState.priorityPlayerId ||
      gameState.pendingQuery ||
      gameState.isResolvingStack ||
      gameState.currentProcessingItem
    ) {
      return gameState;
    }

    const player = gameState.players[gameState.priorityPlayerId];
    if (!player) return gameState;

    const strategy = player.confrontationStrategy || 'AUTO';
    if (strategy === 'ON') return gameState;
    if (ServerGameService.isConfrontationAnimationPending(gameState)) return gameState;

    const hasAction = strategy === 'AUTO'
      ? ServerGameService.playerHasAvailableConfrontationAction(gameState, player.uid)
      : false;

    if (strategy === 'AUTO' && hasAction) return gameState;

    await ServerGameService.resolveCounterStack(gameState, onUpdate);
    return gameState;
  },

  async applyDefenseStrategy(gameState: GameState, onUpdate?: (state: GameState) => Promise<void>) {
    if (
      gameState.phase !== 'DEFENSE_DECLARATION' ||
      gameState.pendingQuery ||
      gameState.isResolvingStack ||
      gameState.currentProcessingItem
    ) {
      return gameState;
    }

    const defenderId = gameState.playerIds[gameState.currentTurnPlayer === 0 ? 1 : 0];
    const defender = gameState.players[defenderId];
    if (!defender) return gameState;

    const strategy = defender.confrontationStrategy || 'AUTO';
    if (strategy !== 'AUTO' && strategy !== 'OFF') return gameState;

    const hasAvailableDefender = defender.unitZone.some(unit =>
      ServerGameService.canUnitDefendInCurrentBattle(gameState, unit)
    );
    if (hasAvailableDefender) return gameState;

    await ServerGameService.declareDefense(gameState, defenderId, undefined);
    if (onUpdate) await onUpdate(gameState);
    return gameState;
  },

  payCost(gameState: GameState, playerId: string, cost: number, paymentSelection: { feijingCardId?: string, exhaustUnitIds?: string[], erosionFrontIds?: string[] }, cardColor?: string, playingCardId?: string, options?: { excludeExhaustUnitIds?: string[] }): PaymentSummary {
    const player = gameState.players[playerId];
    cardColor = cardColor === 'NONE' ? undefined : cardColor;
    const findPlayingCard = () => playingCardId
      ? player.hand.find(c => c.gamecardId === playingCardId) ||
        player.playZone.find(c => c.gamecardId === playingCardId) ||
        player.deck.find(c => c.gamecardId === playingCardId)
      : undefined;
    if (cost === 0) {
      const zeroCostCard = findPlayingCard();
      if (zeroCostCard?.effects?.some(effect => effect.content === 'ONLY_FEIJING_PAYMENT')) {
        return { success: false, reason: '这张卡只能通过菲晶能力支付使用费用' };
      }
      return { success: true, exhaustedUnits: [], erosionCostCards: [] };
    }

    if (cost < 0) {
      const absCost = Math.abs(cost);
      if (!paymentSelection.erosionFrontIds || paymentSelection.erosionFrontIds.length !== absCost) {
          return { success: false, reason: `请选择 ${absCost} 张侵蚀区正面卡` };
      }

      for (const id of paymentSelection.erosionFrontIds) {
        if (!player.erosionFront.some(c => c?.gamecardId === id)) {
          return { success: false, reason: '选择的侵蚀区卡牌无效' };
        }
      }

      const negativeCostCards: { id: string; name: string }[] = [];
      for (const id of paymentSelection.erosionFrontIds) {
        const costCard = player.erosionFront.find(c => c?.gamecardId === id);
        if (costCard) negativeCostCards.push({ id: costCard.gamecardId, name: costCard.fullName });
        ServerGameService.moveCard(gameState, playerId, 'EROSION_FRONT', playerId, 'GRAVE', id, { suppressLog: true });
      }
      return { success: true, exhaustedUnits: [], erosionCostCards: negativeCostCards };
    }

    if (cost > 0) {
      let remainingCost = cost;
      let feijingCard: Card | undefined;
      let use204000145Replacement = false;
      let reservedDeckCard: Card | undefined;
      let playingCard: Card | undefined;

      if (playingCardId) {
        const reservedIndex = player.deck.findIndex(c => c?.gamecardId === playingCardId);
        if (reservedIndex !== -1) {
          reservedDeckCard = player.deck.splice(reservedIndex, 1)[0];
        }
        playingCard = reservedDeckCard ||
          player.hand.find(c => c.gamecardId === playingCardId) ||
          player.playZone.find(c => c.gamecardId === playingCardId);
      }

      if (playingCard?.effects?.some(effect => effect.content === 'ONLY_FEIJING_PAYMENT') && !paymentSelection.feijingCardId) {
        if (reservedDeckCard) player.deck.push(reservedDeckCard);
        return { success: false, reason: '这张卡只能通过菲晶能力支付使用费用' };
      }

      if (paymentSelection.feijingCardId) {
        if (paymentSelection.feijingCardId === playingCardId) {
          if (reservedDeckCard) player.deck.push(reservedDeckCard);
          return { success: false, reason: '不能使用正在打出的卡牌作为菲晶卡支付费用' };
        }
        feijingCard = player.hand.find(c =>
          c.gamecardId === paymentSelection.feijingCardId &&
          (c.feijingMark || c.id === '204000145' || c.id === '205000136' || c.id === '201000132' || c.id === '201000148' || c.id === '203000146' || c.id === '202000151' || c.id === '202060130')
        );
        if (feijingCard) {
          if (
            ServerGameService.canUse204000145AsPaymentSubstitute(feijingCard, cardColor, cost, playingCardId) ||
            ServerGameService.canUse205000136AsPaymentSubstitute(feijingCard, cardColor, cost, playingCardId) ||
            ServerGameService.canUseStoryPaymentSubstitute(feijingCard, playingCard, cost, playingCardId)
          ) {
            remainingCost = 0;
            use204000145Replacement = true;
          } else if (cardColor && feijingCard.color !== cardColor) {
            if (reservedDeckCard) player.deck.push(reservedDeckCard);
            return { success: false, reason: '菲晶卡颜色与打出的卡牌颜色不匹配' };
          } else if (!feijingCard.feijingMark) {
            if (reservedDeckCard) player.deck.push(reservedDeckCard);
            return { success: false, reason: '选择的手牌不能用于代替支付该费用' };
          } else {
            remainingCost = Math.max(0, remainingCost - 3);
          }
        } else {
          if (reservedDeckCard) player.deck.push(reservedDeckCard);
          return { success: false, reason: '选择的手牌支付卡无效' };
        }
      }

      const cardsToExhaust: Card[] = [];
      const excludedExhaustIds = new Set(options?.excludeExhaustUnitIds || []);
      if (paymentSelection.exhaustUnitIds) {
        const seenExhaustUnitIds = new Set<string>();
        for (const uid of paymentSelection.exhaustUnitIds) {
          if (seenExhaustUnitIds.has(uid)) {
            if (reservedDeckCard) player.deck.push(reservedDeckCard);
            return { success: false, reason: '不能重复选择同一个横置支付单位' };
          }
          seenExhaustUnitIds.add(uid);
          if (excludedExhaustIds.has(uid)) {
            if (reservedDeckCard) player.deck.push(reservedDeckCard);
            return { success: false, reason: '不能横置本次宣言的单位来支付该费用' };
          }
          const card = [...player.unitZone].find(c =>
            c?.gamecardId === uid &&
            !c.isExhausted &&
            !(c as any).data?.cannotExhaustByEffect &&
            !((c as any).data?.cannotExhaustUntilTurn !== undefined && (c as any).data.cannotExhaustUntilTurn >= gameState.turnCount)
          );
          if (card) {
            cardsToExhaust.push(card);
          } else {
            if (reservedDeckCard) player.deck.push(reservedDeckCard);
            return { success: false, reason: '选择的横置支付单位无效' };
          }
        }
      }

      const accessMinValue = (card: Card) => Math.max(1, Number((card as any).data?.accessTapMinValue || 1));
      const accessMaxValue = (card: Card) => {
        const data = (card as any).data || {};
        if (data.accessTapColor && data.accessTapColor !== cardColor) return 1;
        return Math.max(accessMinValue(card), Number(data.accessTapValue || 1));
      };
      const selectedAccessMin = cardsToExhaust.reduce((total, card) => total + accessMinValue(card), 0);
      const selectedAccessMax = cardsToExhaust.reduce((total, card) => total + accessMaxValue(card), 0);
      if (selectedAccessMin > remainingCost) {
        if (reservedDeckCard) player.deck.push(reservedDeckCard);
        return { success: false, reason: '选择的横置支付单位超过支付需求' };
      }
      remainingCost = selectedAccessMax >= remainingCost ? 0 : remainingCost - selectedAccessMax;

      // Actually exhaust them
      cardsToExhaust.forEach(c => ServerGameService.exhaustCard(c, gameState));
      const exhaustedUnits = cardsToExhaust.map(card => ({ id: card.gamecardId, name: card.fullName }));
      const erosionCostCards: { id: string; name: string }[] = [];
      let feijingSummary: PaymentSummary['feijingCard'];

      if (remainingCost > 0) {
        const totalErosion = player.erosionFront.filter(c => c !== null).length + player.erosionBack.filter(c => c !== null).length;
        if (player.deck.length < remainingCost) {
          if (reservedDeckCard) player.deck.push(reservedDeckCard);
          return { success: false, reason: '卡组数量不足以支付剩余费用' };
        }
        if (
          (player as any).windProductionTurn === gameState.turnCount &&
          remainingCost === 10 - totalErosion
        ) {
          gameState.logs.push(`[${(player as any).windProductionSourceName || '风力生产'}] 允许本次ACCESS支付使侵蚀区刚好达到10张。`);
          delete (player as any).windProductionTurn;
          delete (player as any).windProductionSourceName;
        } else
        if (remainingCost >= 10 - totalErosion) {
          if (reservedDeckCard) player.deck.push(reservedDeckCard);
          return { success: false, reason: '侵蚀区空间不足以支付剩余费用 (不能达到 10 张)' };
        }
      }

      if (feijingCard) {
        if (feijingCard.feijingMark && playingCard) {
          (playingCard as any).data = {
            ...((playingCard as any).data || {}),
            playedUsingFeijingTurn: gameState.turnCount,
            playedUsingFeijingCardId: feijingCard.gamecardId,
            playedUsingFeijingCardName: feijingCard.fullName
          };
        }
        let fromZone: TriggerLocation = 'UNIT';
        if (player.itemZone.some(c => c?.gamecardId === feijingCard!.gamecardId)) {
          fromZone = 'ITEM';
        } else if (player.erosionFront.some(c => c?.gamecardId === feijingCard!.gamecardId)) {
          fromZone = 'EROSION_FRONT';
        } else if (player.erosionBack.some(c => c?.gamecardId === feijingCard!.gamecardId)) {
          fromZone = 'EROSION_BACK';
        } else if (player.hand.some(c => c?.gamecardId === feijingCard!.gamecardId)) {
          fromZone = 'HAND';
        }
        const destination = use204000145Replacement ? 'EXILE' : 'GRAVE';
        ServerGameService.moveCard(gameState, playerId, fromZone, playerId, destination, feijingCard.gamecardId, { suppressLog: true });
        feijingSummary = { id: feijingCard.gamecardId, name: feijingCard.fullName, destination };
      }
      for (let i = 0; i < remainingCost; i++) {
        if (player.deck.length === 0) {
          if (reservedDeckCard) player.deck.push(reservedDeckCard);
          return { success: false, reason: '卡组数量不足以支付剩余费用' };
        }
        const topCard = player.deck[player.deck.length - 1];
        if (topCard) {
          erosionCostCards.push({ id: topCard.gamecardId, name: topCard.fullName });
          ServerGameService.moveCard(gameState, playerId, 'DECK', playerId, 'EROSION_FRONT', topCard.gamecardId, {
            faceDown: false,
            suppressLog: true
          });
        }
      }
      if (reservedDeckCard) {
        player.deck.push(reservedDeckCard);
      }
      return { success: true, exhaustedUnits, erosionCostCards, feijingCard: feijingSummary };
    }

    return { success: false, reason: '未知错误' };
  },

  buildPlayLogText(playerName: string, cardName: string, paymentSummary?: PaymentSummary) {
    const parts = [`${playerName}打出了[${cardName}]`];
    if (paymentSummary?.exhaustedUnits?.length) {
      parts.push(`横置了${paymentSummary.exhaustedUnits.map(unit => `[${unit.name}]`).join('、')}`);
    }
    if (paymentSummary?.feijingCard) {
      parts.push(`使用了[${paymentSummary.feijingCard.name}]支付`);
    }
    if (paymentSummary?.erosionCostCards?.length) {
      parts.push(`支付了${paymentSummary.erosionCostCards.length}费用使${paymentSummary.erosionCostCards.map(card => `[${card.name}]`).join('、')}移动到侵蚀区正面`);
    }
    return `${parts.join('，')}。`;
  },

  getTurnTimerLimitMs(gameState: GameState) {
    return gameState.turnTimerLimit ? gameState.turnTimerLimit * 1000 : GAME_TIMEOUTS.MAIN_PHASE_TOTAL;
  },

  chargeTimer(gameState: GameState, playerUid: string | undefined, elapsed: number) {
    if (!playerUid || elapsed <= 0) return;
    const player = gameState.players[playerUid];
    if (!player) return;
    player.timeRemaining = Math.max(0, (player.timeRemaining ?? ServerGameService.getTurnTimerLimitMs(gameState)) - elapsed);
  },

  getTimedPlayerForSharedPhase(gameState: GameState, fallbackPlayerUid?: string) {
    if (gameState.phase === 'DEFENSE_DECLARATION') {
      const turnPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
      return gameState.playerIds.find(uid => uid !== turnPlayerId);
    }
    return fallbackPlayerUid;
  },

  enterCountering(gameState: GameState, sourcePlayerId: string, stackItem: StackItem) {
    const now = Date.now();
    const elapsed = now - (gameState.phaseTimerStart || now);
    const opponentId = gameState.playerIds.find(id => id !== sourcePlayerId);
    const isUncounterable = ServerGameService.isStackItemUncounterable(gameState, sourcePlayerId, stackItem);
    const isStartingNewCounterChain = gameState.phase !== 'COUNTERING';

    if (isStartingNewCounterChain) {
      // If we are leaving a shared phase, subtract from the acting side's turn budget.
      const sharedPhases: GamePhase[] = ['MAIN', 'BATTLE_DECLARATION', 'DEFENSE_DECLARATION', 'BATTLE_FREE'];
      if (sharedPhases.includes(gameState.phase)) {
        ServerGameService.chargeTimer(
          gameState,
          ServerGameService.getTimedPlayerForSharedPhase(gameState, sourcePlayerId),
          elapsed
        );
      }

      gameState.previousPhase = gameState.phase;
      gameState.phase = 'COUNTERING';
      gameState.phaseTimerStart = now; // Independent 15/30s starts now
    }

    const chainId = isStartingNewCounterChain || !gameState.currentConfrontationChainId
      ? `${gameState.gameId || 'game'}_${gameState.turnCount}_${now}_${Math.random().toString(36).slice(2, 8)}`
      : gameState.currentConfrontationChainId;
    if (!isStartingNewCounterChain && !gameState.currentConfrontationChainId) {
      gameState.counterStack.forEach(item => {
        if (!item.confrontationChainId) item.confrontationChainId = chainId;
      });
    }
    gameState.currentConfrontationChainId = chainId;
    stackItem.confrontationChainId = chainId;

    gameState.isCountering = 1;
    gameState.counterStack.forEach(item => item.isInterrupted = true);
    gameState.counterStack.push(stackItem);

    // Combo Link Numbering is local to the active confrontation chain and only counts real cards.
    const linkNumber = gameState.counterStack.filter(item =>
      item.confrontationChainId === chainId && item.card?.gamecardId
    ).length;
    if (linkNumber > 0) {
      ServerGameService.assignDeclaredTargetLink(gameState, stackItem.declaredTargets, linkNumber);
    }
    gameState.priorityPlayerId = isUncounterable ? sourcePlayerId : opponentId;

    if (stackItem.card && stackItem.type !== 'PHASE_END') {
      const isPlayedPermanent = stackItem.type === 'PLAY' && stackItem.card.type !== 'STORY';
      const effect = isPlayedPermanent
        ? undefined
        : stackItem.effectIndex !== undefined
          ? stackItem.card.effects?.[stackItem.effectIndex]
          : stackItem.card.effects?.find(e => e.type === 'ALWAYS' || e.type === 'ACTIVATE' || e.type === 'ACTIVATED');
      const effectLabel = effect?.description || stackItem.card.fullName;
      addBattleLog(gameState, {
        category: 'CONFRONTATION',
        actorUid: sourcePlayerId,
        actorName: gameState.players[sourcePlayerId]?.displayName,
        sourceCard: cardToBattleLogRef(gameState, stackItem.card, sourcePlayerId),
        text: isPlayedPermanent
          ? `link${linkNumber}：打出[${stackItem.card.fullName}]。`
          : `link${linkNumber}：发动[${stackItem.card.fullName}]的[${effectLabel}]。`,
        metadata: { linkNumber, stackType: stackItem.type, effectIndex: stackItem.effectIndex }
      });
    }

    const priorityPlayer = gameState.priorityPlayerId ? gameState.players[gameState.priorityPlayerId] : undefined;
    const strategy = priorityPlayer?.confrontationStrategy || 'AUTO';
    const shouldShowChain =
      !isUncounterable &&
      !!gameState.priorityPlayerId &&
      (strategy === 'ON' || (strategy === 'AUTO' && ServerGameService.playerHasAvailableConfrontationAction(gameState, gameState.priorityPlayerId)));
    if (shouldShowChain) {
      ServerGameService.markConfrontationChainAnimation(gameState, 3000);
    }
  },

  isShingiNamedCard(card?: Card) {
    return !!card && (
      card.fullName.includes('神仪') ||
      card.fullName.includes('绁炰华')
    );
  },

  playerHasDawnChapel(gameState: GameState, playerUid: string) {
    const player = gameState.players[playerUid];
    return !!player?.itemZone.some(item => item?.id === '301140059');
  },

  isStackItemUncounterable(gameState: GameState, sourcePlayerId: string, stackItem: StackItem) {
    if (
      stackItem.type === 'PLAY' &&
      ServerGameService.isShingiNamedCard(stackItem.card) &&
      ServerGameService.playerHasDawnChapel(gameState, sourcePlayerId)
    ) {
      gameState.logs.push('[「黎明礼拜堂」] 对手不能对抗这次神仪卡的使用。');
      return true;
    }
    return false;
  },

  async playCard(gameState: GameState, playerId: string, cardId: string, paymentSelection: { feijingCardId?: string, exhaustUnitIds?: string[], erosionFrontIds?: string[] }, declaredTargets?: DeclaredEffectTarget[], options?: { resumeFromQuery?: boolean; paymentSelectionResolved?: boolean; declaredModeId?: string; effectCostResolved?: boolean }) {
    if (!options?.resumeFromQuery && (gameState.pendingQuery || gameState.isResolvingStack || gameState.currentProcessingItem)) {
      throw new Error('当前有未结算步骤，请等待处理完毕。');
    }
    if (!options?.resumeFromQuery) {
      ServerGameService.assertConfrontationAnimationComplete(gameState);
    }
    const player = gameState.players[playerId];
    let card = player.hand.find(c => c.gamecardId === cardId);
    let sourceZone: TriggerLocation = 'HAND';

    if (!card) {
      card = player.erosionFront.find(c => c?.gamecardId === cardId) as Card;
      if (card && card.allowPlayFromErosionFront) {
        sourceZone = 'EROSION_FRONT' as TriggerLocation;
      }
    }

    if (!card) throw new Error('Card not found in valid zones for playing');

    const isCounteringTurn = gameState.phase === 'COUNTERING' && gameState.priorityPlayerId === playerId;
    const isMainTurn = player.isTurn && gameState.phase === 'MAIN';
    const isBattleFreeTurn = player.isTurn && gameState.phase === 'BATTLE_FREE' && card.type === 'STORY';
    if (!isMainTurn && !isBattleFreeTurn && !isCounteringTurn) {
      throw new Error('当前阶段不能从手牌主动打出该卡');
    }

    const forcedAttackUnit = ServerGameService.getForcedAttackUnit(gameState, playerId);
    if (gameState.phase === 'MAIN' && forcedAttackUnit) {
      throw new Error(`必须先用 [${forcedAttackUnit.fullName}] 宣告攻击`);
    }

    (card as any).__playSnapshot = {
      isGoddessMode: !!player.isGoddessMode,
      phase: gameState.phase,
      sourceZone
    };

    // RULE 2: During countering phase, only story cards can be played
    if (gameState.phase === 'COUNTERING' && card.type !== 'STORY') {
      throw new Error('对抗阶段只能打出故事卡');
    }

    const playEffect = card.type === 'STORY'
      ? card.effects?.find(e => e.type === 'ALWAYS' || e.type === 'ACTIVATE' || e.type === 'ACTIVATED')
      : undefined;
    const playEffectIndex = playEffect ? card.effects?.indexOf(playEffect) ?? -1 : -1;
    if (playEffect && playEffectIndex >= 0 && ServerGameService.hasPreselectTargetSpec(playEffect) && !declaredTargets) {
      const canPlay = ServerGameService.canPlayCard(gameState, player, card);
      if (!canPlay.canPlay) throw new Error(canPlay.reason);
      const opened = ServerGameService.createDeclareTargetQuery(gameState, playerId, card, playEffect, playEffectIndex, {
        pendingAction: 'PLAY_CARD',
        cardId,
        paymentSelection,
        paymentSelectionResolved: options?.paymentSelectionResolved,
        declaredModeId: options?.declaredModeId
      });
      if (!opened) throw new Error('没有可指定的合法对象');
      return gameState;
    }
    if (playEffect && playEffectIndex >= 0 && !declaredTargets) {
      const opened = await ServerGameService.createLegacyDeclareTargetQuery(gameState, playerId, card, playEffect, playEffectIndex, {
        pendingAction: 'PLAY_CARD',
        cardId,
        paymentSelection,
        paymentSelectionResolved: options?.paymentSelectionResolved,
        declaredModeId: options?.declaredModeId
      });
      if (opened) return gameState;
    }

    const canPlay = ServerGameService.canPlayCard(gameState, player, card, {
      skipColorRequirementCheck: !!options?.effectCostResolved,
      skipPlayEffectRequirementCheck: !!options?.effectCostResolved || (!!options?.resumeFromQuery && !!declaredTargets)
    });
    if (!canPlay.canPlay) throw new Error(canPlay.reason);

    const usesSpiritDiscount = ServerGameService.isSpiritDiscountFromDeclaredTargets(gameState, card, declaredTargets);
    if (!options?.effectCostResolved) {
      const colorCheck = ServerGameService.getColorRequirementResult(player, usesSpiritDiscount ? { GREEN: 1 } : (card.colorReq || {}));
      if (!colorCheck.valid) {
        throw new Error(`缺少颜色需求 (缺口: ${colorCheck.totalDeficit}, 可用变色单位: ${colorCheck.omniColorCount})`);
      }
    }

    const cost = usesSpiritDiscount ? 0 : ServerGameService.getEffectivePlayCost(player, card, gameState);
    const declaredModeId = (declaredTargets as any)?.declaredModeId || declaredTargets?.[0]?.modeId || options?.declaredModeId;
    const usesHolyKingdomUnitDiscount =
      card.type === 'UNIT' &&
      card.faction === '圣王国' &&
      (player as any).holyKingdomUnitDiscountUsedTurn !== gameState.turnCount &&
      player.unitZone.some(unit => unit?.id === '101130153');

    let effectCostResolved = !!options?.effectCostResolved;
    if (playEffect?.cost && !effectCostResolved) {
      const effectCostResult = await (playEffect.cost as any)(gameState, player, card, {
        declaredTargets,
        declaredModeId
      });

      if (gameState.pendingQuery) {
        gameState.pendingQuery.callbackKey = 'ACTIVATE_COST_RESOLVE';
        gameState.pendingQuery.context = {
          ...gameState.pendingQuery.context,
          sourceCardId: card.gamecardId,
          effectIndex: playEffectIndex,
          activationPlayerUid: playerId,
          declaredTargets,
          declaredModeId,
          pendingAction: 'PLAY_CARD_EFFECT_COST',
          cardId,
          paymentSelection,
          paymentSelectionResolved: !!options?.paymentSelectionResolved
        };
        return gameState;
      }

      if (!effectCostResult) {
        throw new Error('发动费用不足或无法支付费用');
      }
      effectCostResolved = true;
    }

    if (declaredTargets && !options?.paymentSelectionResolved && cost !== 0 && !paymentSelection.feijingCardId && !paymentSelection.exhaustUnitIds?.length && !paymentSelection.erosionFrontIds?.length) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_PAYMENT',
        playerUid: playerId,
        options: [],
        title: `支付费用: ${card.fullName}`,
        description: `请选择如何支付 ${cost} 点费用。`,
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'PLAY_CARD_PAYMENT',
        paymentCost: cost,
        paymentColor: card.color,
        context: {
          cardId,
          declaredTargets,
          declaredModeId,
          effectCostResolved,
          sourceCardId: card.gamecardId,
          paymentTargetId: card.gamecardId,
          useEffectiveCardCost: false
        }
      };
      return gameState;
    }

    const paymentResult = ServerGameService.payCost(gameState, playerId, cost, paymentSelection, card.color, cardId);
    if (!paymentResult.success) throw new Error(paymentResult.reason);

    if (usesSpiritDiscount) {
      (card as any).data = {
        ...((card as any).data || {}),
        preselectedSpiritTargetId: ServerGameService.getDeclaredTargetIds(declaredTargets)[0],
        spiritCostTarget103080185: true
      };
    } else if ((card as any).data) {
      delete (card as any).data.preselectedSpiritTargetId;
      delete (card as any).data.spiritCostTarget103080185;
    }

    ServerGameService.moveCard(gameState, playerId, sourceZone, playerId, 'PLAY', cardId);
    if (usesHolyKingdomUnitDiscount) {
      (player as any).holyKingdomUnitDiscountUsedTurn = gameState.turnCount;
    }

    // Record faction used
    if (card.faction) {
      if (!player.factionsUsedThisTurn) player.factionsUsedThisTurn = [];
      if (!player.factionsUsedThisTurn.includes(card.faction)) {
        player.factionsUsedThisTurn.push(card.faction);
      }
    }

    const identity = getCardIdentity(gameState, playerId, card);
    addBattleLog(gameState, {
      category: 'CARD_PLAYED',
      actorUid: playerId,
      actorName: player.displayName,
      sourceCard: cardToBattleLogRef(gameState, card, playerId, 'PLAY'),
      targets: declaredTargets?.map(target => ({
        gamecardId: target.gamecardId,
        name: target.sourceCardName,
        ownerUid: target.ownerUid,
        zone: target.zone
      })),
      text: ServerGameService.buildPlayLogText(player.displayName, card.fullName, paymentResult),
      metadata: { identity, declaredTargets, paymentSummary: paymentResult }
    });

    EventEngine.dispatchEvent(gameState, {
      type: 'CARD_PLAYED',
      sourceCard: card,
      playerUid: playerId,
      sourceCardId: card.gamecardId
    });

    ServerGameService.enterCountering(gameState, playerId, {
      card,
      ownerUid: playerId,
      type: 'PLAY',
      declaredTargets,
      declaredModeId,
      timestamp: Date.now()
    });

    return gameState;
  },

  async activateEffect(gameState: GameState, playerId: string, cardId: string, effectIndex: number, declaredTargets?: DeclaredEffectTarget[], options?: { resumeFromQuery?: boolean; declaredModeId?: string }) {
    if (!options?.resumeFromQuery && (gameState.pendingQuery || gameState.isResolvingStack || gameState.currentProcessingItem)) {
      throw new Error('当前有未结算步骤，请等待处理完毕。');
    }
    if (!options?.resumeFromQuery) {
      ServerGameService.assertConfrontationAnimationComplete(gameState);
    }
    // Find card in hand or on field
    const player = gameState.players[playerId];
    let card: Card | undefined;
    let location: TriggerLocation | undefined;

    const findInZones = (zones: (Card | null)[][], loc: TriggerLocation) => {
      for (const zone of zones) {
        const found = zone.find(c => c?.gamecardId === cardId);
        if (found) { card = found; location = loc; break; }
      }
    };

    findInZones([player.unitZone], 'UNIT');
    if (!card) findInZones([player.itemZone], 'ITEM');
    if (!card) findInZones([player.erosionFront], 'EROSION_FRONT');
    if (!card) findInZones([player.erosionBack], 'EROSION_BACK');
    if (!card) findInZones([player.grave], 'GRAVE');
    if (!card) {
      card = player.hand.find(c => c.gamecardId === cardId);
      if (card) location = 'HAND';
    }

    let cardControllerId = playerId;
    if (!card) {
      const opponentId = gameState.playerIds.find(id => id !== playerId);
      const opponent = opponentId ? gameState.players[opponentId] : undefined;
      if (opponent) {
        findInZones([opponent.unitZone], 'UNIT');
        if (!card) findInZones([opponent.itemZone], 'ITEM');
        if (card) cardControllerId = opponentId!;
      }
    }

    if (!card) throw new Error('Card not found');

    const effect = card.effects?.[effectIndex];
    if (!effect) throw new Error('Effect not found');
    if (cardControllerId !== playerId && !(effect as any).canBeActivatedByOpponent) {
      throw new Error('不能发动对手卡牌的效果');
    }
    const loc = location || (card.cardlocation as TriggerLocation);
    const result = ServerGameService.checkEffectLimitsAndReqs(gameState, playerId, card, effect, loc);
    if (!result.valid) {
      throw new Error(result.reason || '不满足发动条件或已达到使用次数限制');
    }

    // RULE: STORY cards in HAND must be PLAYED, not ACTIVATED
    // EXCEPT during countering phase if the effect is specifically a hand-trigger
    if (card.type === 'STORY' && location === 'HAND' && gameState.phase !== 'COUNTERING') {
      throw new Error('当前阶段手牌中的故事卡只能通过打出来发动');
    }

    const isCounteringTurn = gameState.phase === 'COUNTERING' && gameState.priorityPlayerId === playerId;
    const isOwnSharedPhase =
      player.isTurn &&
      ['MAIN', 'BATTLE_DECLARATION', 'BATTLE_FREE'].includes(gameState.phase);
    const isBattleFreeSharedPhase = gameState.phase === 'BATTLE_FREE';
    if (!isOwnSharedPhase && !isBattleFreeSharedPhase && !isCounteringTurn) {
      throw new Error('当前阶段不能自由发动该起动效果');
    }

    const forcedAttackUnit = ServerGameService.getForcedAttackUnit(gameState, playerId);
    if (gameState.phase === 'MAIN' && forcedAttackUnit) {
      throw new Error(`必须先用 [${forcedAttackUnit.fullName}] 宣告攻击`);
    }

    // RULE 2: During countering phase, only ACTIVATE/ACTIVATED effects can be used
    if (gameState.phase === 'COUNTERING' && effect.type !== 'ACTIVATE' && effect.type !== 'ACTIVATED') {
      throw new Error('对抗阶段只能发动主动效果');
    }

    if (ServerGameService.hasPreselectTargetSpec(effect) && !declaredTargets) {
      const opened = ServerGameService.createDeclareTargetQuery(gameState, playerId, card, effect, effectIndex, {
        pendingAction: 'ACTIVATE_EFFECT',
        cardId
      });
      if (!opened) throw new Error('没有可指定的合法对象');
      return gameState;
    }
    if (!declaredTargets) {
      const opened = await ServerGameService.createLegacyDeclareTargetQuery(gameState, playerId, card, effect, effectIndex, {
        pendingAction: 'ACTIVATE_EFFECT',
        cardId
      });
      if (opened) return gameState;
    }
    const declaredModeId = (declaredTargets as any)?.declaredModeId || declaredTargets?.[0]?.modeId || options?.declaredModeId;
    // 3. Payment/Cost Check
    if (effect.cost) {
      const player = gameState.players[playerId];
      const costResult = await (effect.cost as any)(gameState, player, card, {
        declaredTargets,
        declaredModeId
      });

      // If cost triggered a query, wait for it
      if (gameState.pendingQuery) {
        gameState.pendingQuery.callbackKey = 'ACTIVATE_COST_RESOLVE';
        gameState.pendingQuery.context = {
          ...gameState.pendingQuery.context,
          sourceCardId: card.gamecardId,
          effectIndex: effectIndex,
          activationPlayerUid: playerId,
          declaredTargets,
          declaredModeId
        };
        return gameState;
      }

      if (!costResult) {
        throw new Error('发动费用不足或无法支付费用');
      }
    }

    ServerGameService.finalizeEffectActivation(gameState, playerId, card, effect, effectIndex, declaredTargets, declaredModeId);
    return gameState;

    ServerGameService.recordEffectUsage(gameState, playerId, card, effect);

    // Record faction used
    if (card.faction) {
      if (!player.factionsUsedThisTurn) player.factionsUsedThisTurn = [];
      if (!player.factionsUsedThisTurn.includes(card.faction)) {
        player.factionsUsedThisTurn.push(card.faction);
      }
    }

    const identity = getCardIdentity(gameState, playerId, card);
    addBattleLog(gameState, {
      category: effect.type === 'TRIGGER' || effect.type === 'TRIGGERED' ? 'TRIGGERED_EFFECT' : 'EFFECT_ACTIVATED',
      actorUid: playerId,
      actorName: player.displayName,
      sourceCard: cardToBattleLogRef(gameState, card, playerId),
      text: `${player.displayName} 发动了 ${identity} ${card.fullName} 的效果: ${effect.description}`,
      metadata: { identity, effectIndex, effectType: effect.type, effectDescription: effect.description, declaredTargets }
    });

    ServerGameService.enterCountering(gameState, playerId, {
      card,
      ownerUid: playerId,
      type: 'EFFECT',
      effectIndex,
      timestamp: Date.now()
    });

    return gameState;
  },

  finalizeEffectActivation(gameState: GameState, playerId: string, card: Card, effect: CardEffect, effectIndex: number, declaredTargets?: DeclaredEffectTarget[], declaredModeId?: string) {
    const player = gameState.players[playerId];

    ServerGameService.recordEffectUsage(gameState, playerId, card, effect);

    if (card.faction) {
      if (!player.factionsUsedThisTurn) player.factionsUsedThisTurn = [];
      if (!player.factionsUsedThisTurn.includes(card.faction)) {
        player.factionsUsedThisTurn.push(card.faction);
      }
    }

    const identity = getCardIdentity(gameState, playerId, card);
    addBattleLog(gameState, {
      category: effect.type === 'TRIGGER' || effect.type === 'TRIGGERED' ? 'TRIGGERED_EFFECT' : 'EFFECT_ACTIVATED',
      actorUid: playerId,
      actorName: player.displayName,
      sourceCard: cardToBattleLogRef(gameState, card, playerId),
      text: `${player.displayName} 发动了 ${identity} ${card.fullName} 的效果: ${effect.description}`,
      metadata: { identity, effectIndex, effectType: effect.type, effectDescription: effect.description, declaredTargets }
    });

    ServerGameService.enterCountering(gameState, playerId, {
      card,
      ownerUid: playerId,
      type: 'EFFECT',
      effectIndex,
      declaredTargets,
      declaredModeId: declaredTargets?.[0]?.modeId || declaredModeId,
      timestamp: Date.now()
    });
  },

  async passConfrontation(gameState: GameState, playerId: string, onUpdate?: (state: GameState) => Promise<void>) {
    if (gameState.phase !== 'COUNTERING') return;
    ServerGameService.assertConfrontationAnimationComplete(gameState);
    if (gameState.pendingQuery) {
      if (gameState.pendingQuery.playerUid === playerId) {
        throw new Error('请先完成当前选择，再继续对抗。');
      }
      return gameState;
    }
    if (gameState.priorityPlayerId !== playerId) throw new Error('尚未轮到你进行对抗');

    const player = gameState.players[playerId];
    const topItem = gameState.counterStack[gameState.counterStack.length - 1];
    if (
      topItem?.ownerUid === playerId &&
      topItem.type === 'PLAY' &&
      ServerGameService.isShingiNamedCard(topItem.card) &&
      ServerGameService.playerHasDawnChapel(gameState, playerId)
    ) {
      gameState.logs.push(`${player.displayName} 的神仪卡不能被对抗，直接结算。`);
    }

    if (topItem.type === 'PHASE_END') {
      gameState.logs.push(`${player.displayName} 接受了阶段结束请求 (Pass)。`);
    } else if (topItem.type === 'ATTACK') {
      gameState.logs.push(`${player.displayName} 接受了攻击宣言 (Pass)。`);
    } else {
      gameState.logs.push(`${player.displayName} 选择不进行对抗 (Pass)。`);
    }

    // RULE 4 & Note 1: Once either side no longer confronts, settlement begins.
    await ServerGameService.resolveCounterStack(gameState, onUpdate);

    return gameState;
  },

  async resolveCounterStack(gameState: GameState, onUpdate?: (state: GameState) => Promise<void>) {
    if (gameState.counterStack.length === 0) return;
    if (gameState.pendingQuery) return gameState;

    const emitVisualUpdate = async () => {
      if (!onUpdate) return;
      (gameState as any).__visualOnlySync = true;
      try {
        await onUpdate(gameState);
      } finally {
        delete (gameState as any).__visualOnlySync;
      }
    };

    gameState.isResolvingStack = true;
    (gameState as any).deferTriggeredEffectsUntilCounterStackEnds = true;
    gameState.priorityPlayerId = undefined;
    const isPhaseEndOnly = gameState.counterStack.length === 1 && gameState.counterStack[0].type === 'PHASE_END' && !gameState.counterStack[0].isInterrupted;
    const phaseEndItem = isPhaseEndOnly ? gameState.counterStack[0] : null;

    if (isPhaseEndOnly) {
      gameState.counterStack.pop();
      gameState.isCountering = 0;
      gameState.isResolvingStack = false;
      delete (gameState as any).deferTriggeredEffectsUntilCounterStackEnds;
      gameState.priorityPlayerId = undefined;
      gameState.currentConfrontationChainId = undefined;
      ServerGameService.clearAllDeclaredTargetMarkers(gameState);

      const nextPhase = phaseEndItem!.nextPhase;
      if (gameState.previousPhase) {
        gameState.phase = gameState.previousPhase;
        gameState.previousPhase = undefined;
      }

      if (onUpdate) await onUpdate(gameState);

      if (nextPhase) {
        if (nextPhase === 'DAMAGE_CALCULATION' && ServerGameService.checkBattleInterruption(gameState)) {
          await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
          return gameState;
        }
        return ServerGameService.advancePhase(gameState, nextPhase, undefined, onUpdate);
      }
      return gameState;
    }

    await emitVisualUpdate();

    // Resolve the entire stack from top to bottom (LIFO)
    while (gameState.counterStack.length > 0) {
      const topItem = gameState.counterStack[gameState.counterStack.length - 1];

      gameState.currentProcessingItem = topItem;
      ServerGameService.markConfrontationChainAnimation(gameState, 1500, 'resolve');
      await emitVisualUpdate();

      await ServerGameService.waitForVisualDelay(gameState, 1500);

      const stackItem = gameState.counterStack.pop();
      if (!stackItem) continue;
      if (!stackItem) continue;

      // If we encounter a PHASE_END in a multi-item stack, it means the phase end was interrupted.
      // RULE 3: after confrontation is over, return to 'main' or 'battle_free'.
      if (stackItem.type === 'PHASE_END') {
        continue;
      }

      const card = stackItem.card;
      const owner = gameState.players[stackItem.ownerUid];

      if (stackItem.isNegated) {
        ServerGameService.clearDeclaredTargetMarkers(gameState, stackItem.declaredTargets);
        // We still need to cleanup the card if it was played to the field/play zone
        if (stackItem.type === 'PLAY' && card) {
          const isInPlayZone = owner.playZone.some(c => c && c.gamecardId === card.gamecardId);
          if (isInPlayZone) {
            const liveStory = owner.playZone.find(c => c?.gamecardId === card.gamecardId);
            const replaceToExile = liveStory?.effects?.some(effect =>
              effect.type === 'CONTINUOUS' &&
              effect.content === 'EXILE_WHEN_LEAVES_PLAY_TO_GRAVE'
            );
            ServerGameService.moveCard(
              gameState,
              stackItem.ownerUid,
              'PLAY',
              stackItem.ownerUid,
              replaceToExile ? 'EXILE' : 'GRAVE',
              card.gamecardId,
              replaceToExile ? {
                isEffect: true,
                effectSourcePlayerUid: stackItem.ownerUid,
                effectSourceCardId: card.gamecardId,
                faceDown: false
              } : undefined
            );
          }
        }
        continue;
      }

      switch (stackItem.type) {
        case 'PLAY':
          if (!card) break;
          if (card.type === 'UNIT') {
            const playZoneCard = owner.playZone.find(c => c && c.gamecardId === card.gamecardId);
            if (playZoneCard) playZoneCard.playedTurn = gameState.turnCount;
            ServerGameService.moveCard(gameState, stackItem.ownerUid, 'PLAY', stackItem.ownerUid, 'UNIT', card.gamecardId);
          } else if (card.type === 'ITEM' || card.isEquip) {
            const playZoneCard = owner.playZone.find(c => c && c.gamecardId === card.gamecardId);
            if (playZoneCard) playZoneCard.playedTurn = gameState.turnCount;
            ServerGameService.moveCard(gameState, stackItem.ownerUid, 'PLAY', stackItem.ownerUid, 'ITEM', card.gamecardId);
          } else {
            // STORY card
            const effect = card.effects?.find(e => e.type === 'ALWAYS' || e.type === 'ACTIVATE' || e.type === 'ACTIVATED');
            if (effect) {
              // Story activation requirements are checked when the card is played.
              // Costs may change erosion totals before resolution, so do not re-check
              // erosion/condition gates here.
              ServerGameService.recordEffectUsage(gameState, stackItem.ownerUid, card, effect);
              const executed = await ServerGameService.executeWithDeclaredTargets(gameState, stackItem.ownerUid, card, effect, owner, stackItem.declaredTargets);
              if (executed) {
                EventEngine.dispatchEvent(gameState, {
                  type: 'EFFECT_ACTIVATED',
                  playerUid: stackItem.ownerUid,
                  sourceCardId: card.gamecardId
                });
              }
            }
            const liveStory = owner.playZone.find(c => c?.gamecardId === card.gamecardId);
            if (liveStory) {
              const replaceToExile = liveStory.effects?.some(effect =>
                effect.type === 'CONTINUOUS' &&
                effect.content === 'EXILE_WHEN_LEAVES_PLAY_TO_GRAVE'
              );
              ServerGameService.moveCard(
                gameState,
                stackItem.ownerUid,
                'PLAY',
                stackItem.ownerUid,
                replaceToExile ? 'EXILE' : 'GRAVE',
                card.gamecardId,
                replaceToExile ? {
                  isEffect: true,
                  effectSourcePlayerUid: stackItem.ownerUid,
                  effectSourceCardId: card.gamecardId,
                  faceDown: false
                } : undefined
              );
            }
          }
          const identity = getCardIdentity(gameState, stackItem.ownerUid, card);
          ServerGameService.clearDeclaredTargetMarkers(gameState, stackItem.declaredTargets);
          break;

        case 'EFFECT':
          if (!card) break;
          const liveEffectCard = ServerGameService.findCardById(gameState, card.gamecardId) || card;
          if (liveEffectCard !== card) {
            stackItem.card = liveEffectCard;
            gameState.currentProcessingItem = stackItem;
          }
          const data = stackItem.data as any;
          if (data && data.afterSelectionEffects) {
            await AtomicEffectExecutor.executeBatch(gameState, stackItem.ownerUid, data.afterSelectionEffects, liveEffectCard, undefined, data.selections);
          } else {
            const effectIndex = stackItem.effectIndex ?? 0;
            const effect = liveEffectCard.effects?.[effectIndex];
            if (effect) {
              const executed = await ServerGameService.executeWithDeclaredTargets(gameState, stackItem.ownerUid, liveEffectCard, effect, owner, stackItem.declaredTargets);
              if (!executed) {
                ServerGameService.clearDeclaredTargetMarkers(gameState, stackItem.declaredTargets);
                break;
              }
              EventEngine.recalculateContinuousEffects(gameState);

              if (effect.resolve) {
                gameState.pendingResolutions.push({
                  card: liveEffectCard,
                  effect,
                  effectIndex,
                  playerUid: stackItem.ownerUid
                });
              }
              EventEngine.dispatchEvent(gameState, {
                type: 'EFFECT_ACTIVATED',
                playerUid: stackItem.ownerUid,
                sourceCardId: liveEffectCard.gamecardId
              });
            }
          }
          ServerGameService.clearDeclaredTargetMarkers(gameState, stackItem.declaredTargets);
          break;

        case 'ATTACK':
          // Set battle state and transition to defense declaration
          // Merge with existing battleState to preserve unitTargetId and other metadata
          gameState.battleState = {
            ...gameState.battleState,
            attackers: stackItem.attackerIds || [],
            isAlliance: !!stackItem.isAlliance
          };
          ServerGameService.ensureBattleInstanceId(gameState);
          gameState.phase = stackItem.skipDefense ? 'BATTLE_FREE' : 'DEFENSE_DECLARATION';
          gameState.logs.push(`[攻击宣言] 连锁结算完成，进入${stackItem.skipDefense ? '战斗自由' : '防御宣言'}阶段`);
          // Clear previous phase so we don't return to MAIN
          gameState.previousPhase = undefined;

          // Re-calculate effects to ensure 302050013's defensePowerRestriction is applied to the new battleState
          EventEngine.recalculateContinuousEffects(gameState);
          if (stackItem.skipDefense) {
            await ServerGameService.dispatchEventAndDrainTriggers(gameState, {
              type: 'PHASE_CHANGED',
              playerUid: stackItem.ownerUid,
              data: { phase: 'BATTLE_FREE', reason: 'ATTACK_DECLARED_SKIP_DEFENSE' }
            }, onUpdate);
          }
          break;
      }

      // 2. Clear Highlight: Item has been processed and removed from stack
      gameState.currentProcessingItem = null;
      await emitVisualUpdate();

      // PAUSE RESOLUTION: If an effect triggered a user choice, stop here.
      // We will resume once handleQueryChoice is called and finished.
      if (gameState.pendingQuery) {
        gameState.currentProcessingItem = null; // Clear highlight while waiting
        return gameState;
      }

      // Small pause between multiple items
      if (gameState.counterStack.length > 0) {
        await ServerGameService.waitForVisualDelay(gameState, ServerGameService.getStackBetweenItemsDelayMs());
      }
    }

    await ServerGameService.finishCounteringStack(gameState, onUpdate);
    addBattleLog(gameState, {
      category: 'CONFRONTATION',
      text: '对抗逆向结算完成。'
    });
    return gameState;
  },

  async finishCounteringStack(gameState: GameState, onUpdate?: (state: GameState) => Promise<void>) {
    if (gameState.isResolvingStack || gameState.isCountering > 0) {
      // console.log(`[连锁结算] 所有项目结算完成，正在恢复游戏流程...`);
    }

    // CLEANUP: All items resolved
    gameState.isResolvingStack = false;
    gameState.isCountering = 0;
    gameState.priorityPlayerId = undefined;
    gameState.currentProcessingItem = null; // Ensure this is cleared
    gameState.currentConfrontationChainId = undefined;
    gameState.phaseTimerStart = Date.now();
    delete (gameState as any).deferTriggeredEffectsUntilCounterStackEnds;
    ServerGameService.clearAllDeclaredTargetMarkers(gameState);

    // After resolving the stack, return to previous phase if it exists
    if (gameState.previousPhase) {
      gameState.phase = gameState.previousPhase;
      gameState.previousPhase = undefined;
    }

    await ServerGameService.checkTriggeredEffects(gameState, onUpdate);

    const interruptedBattlePhases: GamePhase[] = ['DEFENSE_DECLARATION', 'BATTLE_FREE'];
    const shouldReturnToMainAfterInterruptedBattle =
      gameState.phase === 'BATTLE_END' ||
      (interruptedBattlePhases.includes(gameState.phase) && !gameState.battleState);

    if (
      shouldReturnToMainAfterInterruptedBattle &&
      !gameState.pendingQuery &&
      !gameState.isResolvingStack &&
      gameState.isCountering === 0
    ) {
      ServerGameService.clearBattleAndReturnMain(gameState, 'BATTLE_INTERRUPTED', {
        log: `[阶段切换] 战斗已中止，返回主要阶段`
      });
      await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
    }

    const currentPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
    const currentPlayer = gameState.players[currentPlayerId];
    if (
      currentPlayer &&
      !gameState.pendingQuery &&
      (currentPlayer as any).forceEndTurnRequested === gameState.turnCount &&
      currentPlayer.isTurn
    ) {
      delete (currentPlayer as any).forceEndTurnRequested;
      await ServerGameService.executeEndPhase(gameState, currentPlayer, false, onUpdate);
      return;
    }

    ServerGameService.normalizeForcedGuardBattleState(gameState);
    EventEngine.recalculateContinuousEffects(gameState);
    if (ServerGameService.checkBattleInterruption(gameState)) {
      await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
    }
  },

  getTriggerQueueId(record: any) {
    if (!record.queueId) {
      record.queueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return record.queueId;
  },

  getTriggerBucketOrder(gameState: GameState) {
    const turnPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
    const nonTurnPlayerId = gameState.playerIds.find(uid => uid !== turnPlayerId);
    return [
      { ownerUid: turnPlayerId, mandatory: true },
      { ownerUid: nonTurnPlayerId, mandatory: true },
      { ownerUid: turnPlayerId, mandatory: false },
      { ownerUid: nonTurnPlayerId, mandatory: false }
    ].filter(bucket => !!bucket.ownerUid) as { ownerUid: string; mandatory: boolean }[];
  },

  removeTriggerRecordById(gameState: GameState, queueId?: string) {
    if (!queueId || !gameState.triggeredEffectsQueue) return undefined;
    const index = gameState.triggeredEffectsQueue.findIndex(record => ServerGameService.getTriggerQueueId(record) === queueId);
    if (index === -1) return undefined;
    return gameState.triggeredEffectsQueue.splice(index, 1)[0];
  },

  getTriggerBucket(gameState: GameState) {
    const queue = gameState.triggeredEffectsQueue || [];
    for (const bucket of ServerGameService.getTriggerBucketOrder(gameState)) {
      const records = queue
        .filter(record => record.playerUid === bucket.ownerUid && !!record.effect?.isMandatory === bucket.mandatory)
        .sort((a, b) => (b.effect?.triggerPriority || 0) - (a.effect?.triggerPriority || 0));
      if (records.length > 0) {
        return { ...bucket, records };
      }
    }
    return undefined;
  },

  createTriggerOrderQuery(gameState: GameState, playerUid: string, records: any[], mandatory: boolean) {
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CHOICE',
      playerUid,
      options: records.map(record => {
        const queueId = ServerGameService.getTriggerQueueId(record);
        const sourceCard = record.sourceCard || record.effectSourceCard || record.card;
        const sourceName = sourceCard?.fullName || record.card?.fullName || record.effect?.id || '未知来源';
        const identity = sourceCard ? getCardIdentity(gameState, record.playerUid, sourceCard) : '';
        return {
          id: queueId,
          selectionId: queueId,
          value: queueId,
          label: `${identity ? `${identity} ` : ''}${sourceName}`,
          detail: `${mandatory ? '必发' : '选发'}：${record.effect.description}`,
          icon: mandatory ? 'trigger' : 'choice',
          card: sourceCard
        };
      }),
      title: '选择诱发效果',
      description: `请选择下一个要结算的${mandatory ? '必发' : '选发'}诱发效果。`,
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'TRIGGER_ORDER_CHOICE',
      context: { mandatory }
    };
  },

  resolveTriggerOrderSelection(query: GameState['pendingQuery'], selection?: string) {
    if (!selection) return selection;
    const options = query?.options || [];
    const option = options.find((opt: any) =>
      opt.id === selection ||
      opt.selectionId === selection ||
      opt.value === selection ||
      opt.card?.gamecardId === selection ||
      opt.card?.id === selection
    );
    return (option as any)?.selectionId || option?.id || option?.value || selection;
  },

  markBattleEndAfterPendingQuery(gameState: GameState, attackerPlayerId?: string) {
    ServerGameService.rememberBattleEndAfterPendingQuery(gameState, attackerPlayerId);
  },

  async processSelectedTriggerRecord(gameState: GameState, trigger: any, onUpdate?: (state: GameState) => Promise<void>) {
    ServerGameService.hydrateVirtualTriggerRecord(trigger);
    let { card, effect, effectIndex, playerUid, event } = trigger;
    let liveSource = ServerGameService.findCardLocation(gameState, card.gamecardId);
    if (!liveSource && event?.sourceCardId === card.gamecardId) {
      liveSource = ServerGameService.findCardLocation(gameState, event.data?.previousSourceCardId);
    }
    const isVirtualTrigger = effectIndex < 0;
    if (!liveSource) {
      if (isVirtualTrigger) {
        liveSource = { card, ownerUid: playerUid, zone: card.cardlocation || 'PLAY' };
      }
    }
    if (!liveSource) {
      await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      return;
    }
    card = liveSource.card;
    const triggerLocation = (event?.type === 'REVEAL_DECK' && effect.triggerLocation?.includes('DECK'))
      ? 'DECK'
      : (event?.type === 'CARD_LEFT_FIELD' && effect.sourceSnapshotOnLeftField === true && event.data?.sourceZone)
        ? event.data.sourceZone as TriggerLocation
        : card.cardlocation as TriggerLocation;
    if (!isVirtualTrigger && !ServerGameService.checkEffectLimitsAndReqs(gameState, playerUid, card, effect, triggerLocation, event).valid) {
      await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      return;
    }

    if (effect.isMandatory) {
      await ServerGameService.executeTriggeredEffect(gameState, playerUid, {
        effectIndex,
        card,
        effect,
        event
      }, onUpdate);
      return;
    }

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'ASK_TRIGGER',
      playerUid,
      options: [],
      title: `是否发动${ServerGameService.getTriggerZoneLabel(triggerLocation)}${card.fullName}的诱发效果？`,
      description: `是否发动${ServerGameService.getTriggerZoneLabel(triggerLocation)}${card.fullName}的诱发效果？`,
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'TRIGGER_CHOICE',
      context: {
        triggerQueueId: ServerGameService.getTriggerQueueId(trigger),
        effectIndex,
        effectId: effect.id,
        queuedEffect: effect,
        effectDescription: effect.description,
        sourceCardId: card.gamecardId,
        sourceCardSnapshot: { ...card, effects: undefined },
        event
      }
    };
    ServerGameService.markBattleEndAfterPendingQuery(gameState, playerUid);
  },

  async checkTriggeredEffects(gameState: GameState, onUpdate?: (state: GameState) => Promise<void>) {
    if (
      gameState.gameStatus === 2 ||
      gameState.isCountering === 1 ||
      gameState.isResolvingStack ||
      (gameState as any).deferTriggeredEffectsUntilCounterStackEnds ||
      gameState.pendingQuery ||
      gameState.currentProcessingItem
    ) {
      return;
    }

    if (gameState.triggeredEffectsQueue && gameState.triggeredEffectsQueue.length > 0) {
      const bucket = ServerGameService.getTriggerBucket(gameState);
      if (!bucket) return;
      if (bucket.records.length > 1) {
        ServerGameService.createTriggerOrderQuery(gameState, bucket.ownerUid, bucket.records, bucket.mandatory);
        return;
      }
      const trigger = ServerGameService.removeTriggerRecordById(
        gameState,
        ServerGameService.getTriggerQueueId(bucket.records[0])
      );
      if (!trigger) return;
      await ServerGameService.processSelectedTriggerRecord(gameState, trigger, onUpdate);
    } else {
      // Queue is empty, settlement is truly complete
      const queueLengthBeforeInterrupt = gameState.triggeredEffectsQueue?.length || 0;
      ServerGameService.checkBattleInterruption(gameState);
      if ((gameState.triggeredEffectsQueue?.length || 0) > queueLengthBeforeInterrupt) {
        await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
        return;
      }

      if (gameState.phase === 'START') {
        const currentPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
        const currentPlayer = gameState.players[currentPlayerId];
        if (currentPlayer) {
          await ServerGameService.executeStartPhase(gameState, currentPlayer);
        }
        return;
      }

      // If we were in the middle of ending a turn, resume the transition
      if (gameState.phase === 'END') {
        const currentPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
        const currentPlayer = gameState.players[currentPlayerId];
        if (currentPlayer) {
          await ServerGameService.executeEndPhase(gameState, currentPlayer, true, onUpdate);
        }
      }

      if (!gameState.pendingQuery && gameState.phase === 'MAIN') {
        const currentPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
        await ServerGameService.enterForcedAttackBattleIfNeeded(gameState, currentPlayerId, onUpdate, 'FORCED_ATTACK_CONTINUE');
      }

      const currentPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
      const currentPlayer = gameState.players[currentPlayerId];
      if (
        currentPlayer &&
        !gameState.pendingQuery &&
        (currentPlayer as any).forceEndTurnRequested === gameState.turnCount &&
        currentPlayer.isTurn
      ) {
        delete (currentPlayer as any).forceEndTurnRequested;
        await ServerGameService.executeEndPhase(gameState, currentPlayer, false, onUpdate);
      }
    }
  },

  async finalizeBattleAfterPendingQuery(gameState: GameState, onUpdate?: (state: GameState) => Promise<void>) {
    const pendingBattle = (gameState as any).pendingBattleEndAfterQuery;
    if (!pendingBattle || gameState.pendingQuery || !gameState.battleState) return;
    if (gameState.phase !== 'DAMAGE_CALCULATION' && gameState.phase !== 'MAIN') return;

    if (gameState.phase === 'DAMAGE_CALCULATION') {
      gameState.phase = 'MAIN';
      gameState.phaseTimerStart = Date.now();
      await ServerGameService.dispatchEventAndDrainTriggers(
        gameState,
        { type: 'PHASE_CHANGED', data: { phase: 'MAIN', reason: 'BATTLE_END' } },
        onUpdate
      );
      if (gameState.pendingQuery) return;
    }

    delete (gameState as any).pendingBattleEndAfterQuery;
    ServerGameService.clearBattleCombatMarkers(gameState, pendingBattle.attackerIds);
    gameState.battleState = undefined;
    await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
    if (!gameState.pendingQuery && gameState.phase === 'MAIN') {
      await ServerGameService.enterForcedAttackBattleIfNeeded(
        gameState,
        pendingBattle.attackerPlayerId,
        onUpdate,
        'FORCED_ATTACK_CONTINUE'
      );
    }
  },

  async resolvePlay(gameState: GameState, onUpdate?: (state: GameState) => Promise<void>) {
    return ServerGameService.resolveCounterStack(gameState, onUpdate);
  },

  resolveStandardChoiceSelections(query: GameState['pendingQuery'], selections: string[]) {
    if (!query || query.type.replace(/-/g, '_').toUpperCase() !== 'SELECT_CHOICE') return selections;

    return selections.map(selection => {
      const option = query.options?.find(opt => opt.id === selection || opt.selectionId === selection);
      return option?.value ?? option?.id ?? selection;
    });
  },

  async handleQueryChoice(gameState: GameState, playerUid: string, queryId: string, selections: string[], onUpdate?: (state: GameState) => Promise<void>) {
    // console.log(`[Server] handleQueryChoice: player=${playerUid}, queryId=${queryId}, selections=`, selections);

    if (!gameState.pendingQuery || gameState.pendingQuery.id !== queryId) {
      // console.warn(`[Server] Invalid query choice request: expected ${gameState.pendingQuery?.id}, got ${queryId}`);
      throw new Error('无效的选择请求');
    }
    if (gameState.pendingQuery.playerUid !== playerUid) {
      throw new Error('不属于你的选择请求');
    }

    const query = gameState.pendingQuery;
    gameState.pendingQuery = undefined;

    let afterEffects = query.afterSelectionEffects || [];
    let currentSelections = selections;
    const sourceCardId = query.context?.sourceCardId;

    // Robust source card finding: Check if id exists
    const sourceCard = sourceCardId ? ServerGameService.findCardById(gameState, sourceCardId) : undefined;

    const normalizedType = query.type.replace(/-/g, '_').toUpperCase();
    if (normalizedType === 'SELECT_CHOICE') {
      currentSelections = ServerGameService.resolveStandardChoiceSelections(query, selections);
    }

    if (query.callbackKey === 'PLAY_CARD_PAYMENT') {
      const declaredTargets = query.context?.declaredTargets as DeclaredEffectTarget[] | undefined;
      await ServerGameService.playCard(
        gameState,
        playerUid,
        query.context.cardId,
        JSON.parse(selections[0] || '{}'),
        declaredTargets,
        {
          resumeFromQuery: true,
          paymentSelectionResolved: true,
          declaredModeId: query.context?.declaredModeId,
          effectCostResolved: !!query.context?.effectCostResolved
        }
      );
      if (onUpdate) await onUpdate(gameState);
      return gameState;
    }

    // 1. Process Core Actions (like Payment) first
    if (normalizedType === 'SELECT_PAYMENT') {
      try {
        const paymentPlayerUid = query.context?.activationPlayerUid || playerUid;
        const paymentSelection = JSON.parse(selections[0]);
        const paymentTargetId = query.context?.targetCardId || query.context?.targetId;
        const paymentTarget = paymentTargetId ? ServerGameService.findCardById(gameState, paymentTargetId) : undefined;
        const paymentCost = paymentTarget && query.context?.useEffectiveCardCost === true
          ? ServerGameService.getEffectivePlayCost(gameState.players[paymentPlayerUid], paymentTarget, gameState)
          : (query.paymentCost || 0);
        const result = ServerGameService.payCost(
          gameState,
          paymentPlayerUid,
          paymentCost,
          paymentSelection,
          paymentTarget?.color || query.paymentColor,
          paymentTargetId || query.context?.sourceCardId,
          query.context?.paymentOptions
        );

        if (!result.success) {
          gameState.pendingQuery = query; // Restore for retry
          throw new Error(result.reason || '支付失败');
        }

        afterEffects = query.context?.remainingEffects || [];
        currentSelections = query.context?.targetSelections || [];
      } catch (e: any) {
        gameState.pendingQuery = query;
        throw e;
      }
    }

    if (query.callbackKey === 'DECLARE_EFFECT_TARGETS') {
      try {
        if (!sourceCard) {
          throw new Error('指定对象失败：找不到来源卡');
        }
        const effectIndex = query.context?.effectIndex;
        const effectId = query.context?.effectId;
        const effect = effectIndex !== undefined && effectIndex >= 0
          ? sourceCard.effects?.[effectIndex]
          : effectId
            ? sourceCard.effects?.find(e => e.id === effectId) || query.context?.queuedEffect
            : query.context?.queuedEffect;
        if (!effect) throw new Error('指定对象失败：找不到效果');
        const runtimeTargetSpec = query.context?.runtimeTargetSpec || query.context?.capturedContext
          ? {
              title: query.title,
              description: query.description,
              minSelections: query.minSelections,
              maxSelections: query.maxSelections,
              step: query.context?.step,
              capturedContext: query.context?.capturedContext,
              getCandidates: () => (query.options || [])
                .filter((option: any) => option.card)
                .map((option: any) => ({ card: option.card, source: option.source || option.card.cardlocation }))
            }
          : undefined;
        const spec: any = effect.targetSpec || runtimeTargetSpec;
        if (!spec) throw new Error('指定对象失败：该效果没有目标声明');
        const selectedMode = query.context?.modeId
          ? spec.modeOptions?.find(mode => mode.id === query.context.modeId)
          : undefined;
        const activationPlayerUid = query.context?.activationPlayerUid || playerUid;
        if (selectedMode && !ServerGameService.isTargetModeCurrentlyValid(
          gameState,
          activationPlayerUid,
          sourceCard,
          effect,
          selectedMode,
          query.context?.declaredTargets,
          query.context?.targetGroupIndex || 0,
          false
        )) {
          throw new Error('指定对象失败：该模式当前无法发动');
        }
        const modeTargetGroups = selectedMode?.targetGroups;
        const targetShape = selectedMode
          ? (modeTargetGroups?.[query.context?.targetGroupIndex || 0] || selectedMode)
          : spec.targetGroups?.[query.context?.targetGroupIndex || 0] || spec;
        if (!targetShape) throw new Error('指定对象失败：找不到目标声明');

        const previousDeclaredTargets = (query.context?.declaredTargets || []) as DeclaredEffectTarget[];
        const newlyDeclaredTargets = ServerGameService.declareEffectTargets(
          gameState,
          activationPlayerUid,
          sourceCard,
          effect,
          effectIndex,
          currentSelections,
          targetShape,
          previousDeclaredTargets,
          query.context?.modeId
        );
        const declaredTargets = [...previousDeclaredTargets, ...newlyDeclaredTargets];
        if (query.context?.modeId) {
          (declaredTargets as any).declaredModeId = query.context.modeId;
        }
        const nextGroupIndex = (query.context?.targetGroupIndex || 0) + 1;
        const targetGroups = selectedMode ? modeTargetGroups : spec.targetGroups;
        if (targetGroups && nextGroupIndex < targetGroups.length) {
          const opened = ServerGameService.createDeclareTargetQuery(gameState, activationPlayerUid, sourceCard, effect, effectIndex, {
            ...query.context,
            declaredTargets,
            targetGroupIndex: nextGroupIndex
          });
          if (!opened) throw new Error('没有可指定的合法对象');
          return gameState;
        }

        if (query.context?.pendingAction === 'PLAY_CARD') {
          await ServerGameService.playCard(
            gameState,
            activationPlayerUid,
            query.context.cardId,
            query.context.paymentSelection || {},
            declaredTargets,
            {
              resumeFromQuery: true,
              paymentSelectionResolved: !!query.context?.paymentSelectionResolved,
              declaredModeId: query.context?.modeId,
              effectCostResolved: !!query.context?.effectCostResolved
            }
          );
          return gameState;
        }

        if (query.context?.pendingAction === 'ACTIVATE_EFFECT') {
          await ServerGameService.activateEffect(
            gameState,
            activationPlayerUid,
            query.context.cardId,
            effectIndex,
            declaredTargets,
            { resumeFromQuery: true, declaredModeId: query.context?.modeId }
          );
          return gameState;
        }

        if (query.context?.pendingAction === 'TRIGGER_EFFECT') {
          await ServerGameService.executeTriggeredEffect(gameState, activationPlayerUid, {
            effectIndex,
            card: sourceCard,
            effect,
            event: query.context.event,
            declaredTargets,
            declaredModeId: query.context?.modeId
          }, onUpdate);
          await ServerGameService.finalizeBattleAfterPendingQuery(gameState, onUpdate);
          return gameState;
        }

        return gameState;
      } catch (err) {
        gameState.pendingQuery = query;
        throw err;
      }
    }

    if (query.callbackKey === 'DECLARE_EFFECT_TARGET_MODE') {
      if (!sourceCard) {
        throw new Error('指定对象失败：找不到来源卡');
      }
      const effectIndex = query.context?.effectIndex;
      const effectId = query.context?.effectId;
      const effect = effectIndex !== undefined && effectIndex >= 0
        ? sourceCard.effects?.[effectIndex]
        : effectId
          ? sourceCard.effects?.find(e => e.id === effectId) || query.context?.queuedEffect
          : query.context?.queuedEffect;
      if (!effect?.targetSpec?.modeOptions) throw new Error('指定对象失败：找不到模式声明');
      const modeId = currentSelections[0];
      const mode = effect.targetSpec.modeOptions.find(option => option.id === modeId);
      if (!mode) throw new Error('指定对象失败：选择的模式无效');
      const activationPlayerUid = query.context?.activationPlayerUid || playerUid;
      if (!ServerGameService.isTargetModeCurrentlyValid(gameState, activationPlayerUid, sourceCard, effect, mode)) {
        throw new Error('指定对象失败：该模式当前无法发动');
      }
      const modeTargetShapes = mode.targetGroups?.length ? mode.targetGroups : [mode];
      const needsTargetSelection = modeTargetShapes.some(shape => (shape.maxSelections ?? shape.minSelections ?? 0) > 0);
      if (!needsTargetSelection) {
        const declaredTargets = [] as DeclaredEffectTarget[];
        (declaredTargets as any).declaredModeId = modeId;

        if (query.context?.pendingAction === 'PLAY_CARD') {
          await ServerGameService.playCard(
            gameState,
            activationPlayerUid,
            query.context.cardId,
            query.context.paymentSelection || {},
            declaredTargets,
            {
              resumeFromQuery: true,
              paymentSelectionResolved: !!query.context?.paymentSelectionResolved,
              declaredModeId: modeId,
              effectCostResolved: !!query.context?.effectCostResolved
            }
          );
          return gameState;
        }

        if (query.context?.pendingAction === 'ACTIVATE_EFFECT') {
          await ServerGameService.activateEffect(
            gameState,
            activationPlayerUid,
            query.context.cardId,
            effectIndex,
            declaredTargets,
            { resumeFromQuery: true, declaredModeId: modeId }
          );
          return gameState;
        }

        if (query.context?.pendingAction === 'TRIGGER_EFFECT') {
          await ServerGameService.executeTriggeredEffect(gameState, activationPlayerUid, {
            effectIndex,
            card: sourceCard,
            effect,
            event: query.context.event,
            declaredTargets,
            declaredModeId: modeId
          }, onUpdate);
          await ServerGameService.finalizeBattleAfterPendingQuery(gameState, onUpdate);
          return gameState;
        }
      }
      const opened = ServerGameService.createDeclareTargetQuery(gameState, activationPlayerUid, sourceCard, effect, effectIndex, {
        ...query.context,
        modeId,
        selectedModeId: modeId
      });
      if (!opened) throw new Error('没有可指定的合法对象');
      return gameState;
    }

    if (query.callbackKey === 'DIKAI_ATTACK_TARGET_CHOICE') {
      const { attackerIds, isAlliance, targetMode } = query.context;
      if (currentSelections[0] !== 'YES') {
        await ServerGameService.declareAttack(gameState, playerUid, attackerIds, isAlliance, 'NO_PROMPT', undefined, onUpdate);
        return gameState;
      }

      const opponentId = gameState.playerIds.find(id => id !== playerUid)!;
      const opponent = gameState.players[opponentId];
      const candidates = opponent.unitZone.filter((unit): unit is Card => {
        if (!unit || (unit as any).cannotBeAttackTargetByEffect) return false;
        if (targetMode === 'ANY') return true;
        if (targetMode === 'READY') return !unit.isExhausted;
        return unit.isExhausted;
      });

      if (candidates.length === 0) {
        await ServerGameService.declareAttack(gameState, playerUid, attackerIds, isAlliance, 'NO_PROMPT', undefined, onUpdate);
        return gameState;
      }

      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid,
        options: AtomicEffectExecutor.enrichQueryOptions(
          gameState,
          playerUid,
          candidates.map(card => ({ card, source: 'UNIT' as TriggerLocation }))
        ),
        title: '选择攻击目标',
        description: targetMode === 'ANY'
          ? '选择对手的1个单位。本次攻击将直接进入战斗自由步骤。'
          : targetMode === 'READY'
            ? '选择对手的1个重置单位。本次攻击将直接进入战斗自由步骤。'
            : '选择对手的1个横置单位。本次攻击将直接进入战斗自由步骤。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'DIKAI_ATTACK_TARGET_SELECT',
        context: {
          attackerIds,
          isAlliance,
          targetMode,
          sourceCardId: query.context?.sourceCardId || attackerIds?.[0],
          effectId: 'DIKAI_ATTACK_TARGET_SELECT'
        }
      };
      return gameState;
    }

    if (query.callbackKey === 'DIKAI_ATTACK_TARGET_SELECT') {
      const { attackerIds, isAlliance } = query.context;
      const targetId = currentSelections[0];
      await ServerGameService.declareAttack(gameState, playerUid, attackerIds, isAlliance, targetId, true, onUpdate);
      return gameState;
    }

    if (query.callbackKey === 'DECLARE_ATTACK_TAX_PAYMENT') {
      const { attackerIds, isAlliance, targetId, skipDefense } = query.context;
      await ServerGameService.declareAttack(gameState, playerUid, attackerIds, isAlliance, targetId, skipDefense, onUpdate, true);
      return gameState;
    }

    if (query.callbackKey === 'DECLARE_DEFENSE_TAX_PAYMENT') {
      const { defenderId } = query.context;
      await ServerGameService.declareDefense(gameState, playerUid, defenderId, true);
      return gameState;
    }

    if (!gameState.pendingQuery) {
      const interruptedByChoice = ServerGameService.checkBattleInterruption(gameState);
      if (
        interruptedByChoice &&
        !gameState.pendingQuery &&
        !gameState.isResolvingStack &&
        gameState.isCountering === 0 &&
        gameState.phase === 'MAIN'
      ) {
        await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      }
    }

    if (query.callbackKey === 'RESET_AFTER_BATTLE_DESTROY_CHOICE') {
      const { unitId, sourceName } = query.context;
      const unit = ServerGameService.findCardById(gameState, unitId);

      if (currentSelections[0] === 'YES' && unit?.cardlocation === 'UNIT') {
        unit.isExhausted = false;
        unit.hasAttackedThisTurn = false;
        if (gameState.battleState) {
          gameState.battleState.keepResetUnitIds = Array.from(new Set([...(gameState.battleState.keepResetUnitIds || []), unit.gamecardId]));
        }
        gameState.logs.push(`[${sourceName || '效果'}] 将 [${unit.fullName}] 重置。`);
      } else if (unit) {
        gameState.logs.push(`[${sourceName || '效果'}] 不重置 [${unit.fullName}]。`);
      }

      if (gameState.phase === 'DAMAGE_CALCULATION' && gameState.battleState) {
        await ServerGameService.resolveDamage(gameState);
      }
      return gameState;
    }

    if (query.callbackKey === 'BATTLE_DESTROY_SAVE_CHOICE') {
      const { cardId, targetUnitId, isEffect, sourcePlayerId, effectIndex, effectId } = query.context;
      const effect = effectIndex !== undefined
        ? sourceCard?.effects?.[effectIndex]
        : effectId
          ? sourceCard?.effects?.find(e => e.id === effectId)
          : undefined;
      if (currentSelections[0] !== 'YES') {
        const destroyed = await ServerGameService.destroyUnit(gameState, playerUid, targetUnitId, isEffect, sourcePlayerId, false, true);
        if (destroyed === undefined) return gameState;
        if (gameState.battleState) {
          gameState.battleState.resolvedUnitIds = gameState.battleState.resolvedUnitIds || [];
          if (destroyed !== false && !gameState.battleState.resolvedUnitIds.includes(targetUnitId)) {
            gameState.battleState.resolvedUnitIds.push(targetUnitId);
          }
        }
        if (gameState.phase === 'DAMAGE_CALCULATION' && gameState.battleState) {
          await ServerGameService.resolveDamage(gameState);
        }
        return gameState;
      }

      if (!sourceCard || !effect?.cost) {
        gameState.logs.push(`[${sourceCard?.fullName || '战斗破坏防止'}] 无法支付费用，防止破坏失败。`);
        const destroyed = await ServerGameService.destroyUnit(gameState, playerUid, targetUnitId, isEffect, sourcePlayerId, false, true);
        if (destroyed === undefined) return gameState;
        return gameState;
      }

      const costResult = await (effect.cost as any)(gameState, gameState.players[playerUid], sourceCard, query.context);
      if (gameState.pendingQuery) {
        gameState.pendingQuery.callbackKey = 'BATTLE_DESTROY_SAVE_PAYMENT';
        gameState.pendingQuery.context = {
          ...gameState.pendingQuery.context,
          cardId,
          targetUnitId,
          isEffect,
          sourcePlayerId,
          effectIndex,
          effectId,
          sourceCardId: cardId
        };
        return gameState;
      }
      if (!costResult) {
        const destroyed = await ServerGameService.destroyUnit(gameState, playerUid, targetUnitId, isEffect, sourcePlayerId, false, true);
        if (destroyed === undefined) return gameState;
        return gameState;
      }

      return ServerGameService.resolveBattleDestroySaveAfterCost(
        gameState,
        playerUid,
        { cardId, targetUnitId, isEffect, sourcePlayerId, effectIndex, effectId, sourceCardId: cardId },
        [],
        onUpdate
      );
    }

    if (query.callbackKey === 'BATTLE_DESTROY_SAVE_PAYMENT') {
      return ServerGameService.resolveBattleDestroySaveAfterCost(gameState, playerUid, query.context, currentSelections, onUpdate);
    }

    if (query.callbackKey === 'DRAW_REPLACEMENT_CHOICE') {
      if (currentSelections[0] !== 'YES' || !sourceCard) {
        gameState.logs.push(`[抽牌阶段] ${gameState.players[playerUid].displayName} 选择通常抽卡。`);
        (gameState.players[playerUid] as any).skipDrawReplacementOnce = gameState.turnCount;
        await ServerGameService.executeDrawPhase(gameState, gameState.players[playerUid], onUpdate);
        return gameState;
      }

      const player = gameState.players[playerUid];
      const candidates = player.grave.filter(Boolean) as Card[];
      if (candidates.length < 2) {
        await ServerGameService.executeDrawPhase(gameState, player, onUpdate);
        return gameState;
      }

      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid,
        options: AtomicEffectExecutor.enrichQueryOptions(
          gameState,
          playerUid,
          candidates.map(card => ({ card, source: 'GRAVE' as TriggerLocation }))
        ),
        title: '选择放回卡组底的卡',
        description: `选择墓地中的2张卡，放置到卡组底，代替通常抽卡。`,
        minSelections: 2,
        maxSelections: 2,
        callbackKey: 'DRAW_REPLACEMENT_SELECT',
        context: { sourceCardId: sourceCard.gamecardId }
      };
      return gameState;
    }

    if (query.callbackKey === 'DRAW_REPLACEMENT_SELECT') {
      const player = gameState.players[playerUid];
      currentSelections.forEach(id => {
        const card = player.grave.find(c => c.gamecardId === id);
        if (card && sourceCard) {
          ServerGameService.moveCard(gameState, playerUid, 'GRAVE', playerUid, 'DECK', id, {
            insertAtBottom: true,
            isEffect: true,
            effectSourcePlayerUid: playerUid,
            effectSourceCardId: sourceCard.gamecardId
          });
        }
      });
      gameState.logs.push(`[${sourceCard?.fullName || '替代抽卡'}] 代替通常抽卡，将2张墓地卡放置到卡组底。`);
      if (onUpdate) {
        gameState.animationUntil = Date.now() + 1200;
        await onUpdate(gameState);
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
      gameState.phase = 'EROSION';
      await ServerGameService.executeErosionPhase(gameState, player);
      return gameState;
    }

    // 2. Trigger Option Processing
    if (query.callbackKey === 'TRIGGER_CHOICE') {
      if (currentSelections[0] === 'YES') {
        const effectIndex = query.context?.effectIndex;
        const effectId = query.context?.effectId;
        const snapshot = query.context?.sourceCardSnapshot as Card | undefined;
        const isSyntheticTrigger = effectIndex === undefined || effectIndex < 0;
        const effect = effectIndex !== undefined && effectIndex >= 0
          ? sourceCard?.effects?.[effectIndex]
          : effectId
            ? sourceCard?.effects?.find(e => e.id === effectId)
            : undefined;
        const queuedEffect = query.context?.queuedEffect as CardEffect | undefined;
        if (sourceCard && effect) {
          if (ServerGameService.hasPreselectTargetSpec(effect) && !query.context?.declaredTargets) {
            const opened = ServerGameService.createDeclareTargetQuery(gameState, playerUid, sourceCard, effect, effectIndex, {
              pendingAction: 'TRIGGER_EFFECT',
              effectIndex,
              effectId,
              event: query.context.event,
              queuedEffect: query.context?.queuedEffect
            });
            if (!opened) {
              await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
              return gameState;
            }
            return gameState;
          }
          await ServerGameService.executeTriggeredEffect(gameState, playerUid, {
            effectIndex,
            card: sourceCard,
            effect,
            event: query.context.event,
            declaredTargets: query.context?.declaredTargets
          }, onUpdate);
        } else if (sourceCard && queuedEffect) {
          if (ServerGameService.hasPreselectTargetSpec(queuedEffect) && !query.context?.declaredTargets) {
            const opened = ServerGameService.createDeclareTargetQuery(gameState, playerUid, sourceCard, queuedEffect, isSyntheticTrigger ? -1 : effectIndex, {
              pendingAction: 'TRIGGER_EFFECT',
              effectIndex: isSyntheticTrigger ? -1 : effectIndex,
              effectId,
              event: query.context.event,
              queuedEffect
            });
            if (!opened) {
              await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
              return gameState;
            }
            return gameState;
          }
          await ServerGameService.executeTriggeredEffect(gameState, playerUid, {
            effectIndex: isSyntheticTrigger ? -1 : effectIndex,
            card: sourceCard,
            effect: queuedEffect,
            event: query.context.event,
            declaredTargets: query.context?.declaredTargets
          }, onUpdate);
        } else if (isSyntheticTrigger && sourceCard) {
          const queuedLikeEffect: CardEffect = {
            id: effectId || query.context?.triggerQueueId || 'synthetic_optional_trigger',
            type: 'TRIGGER',
            isMandatory: false,
            description: query.context?.effectDescription || '选发诱发效果',
            execute: async () => undefined
          };
          await ServerGameService.executeTriggeredEffect(gameState, playerUid, {
            effectIndex: -1,
            card: sourceCard,
            effect: queuedLikeEffect,
            event: query.context.event
          }, onUpdate);
        } else {
          const fallbackCard = snapshot || sourceCard;
          gameState.logs.push(`[诱发跳过] 找不到选发诱发来源或效果，已跳过：${fallbackCard?.fullName || sourceCardId || '未知来源'}。`);
          await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
        }
      } else {
        await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      }
      await ServerGameService.finalizeBattleAfterPendingQuery(gameState, onUpdate);
      return gameState;
    }

    if (query.callbackKey === 'TRIGGER_ORDER_CHOICE') {
      const selectedQueueId = ServerGameService.resolveTriggerOrderSelection(query, currentSelections[0]);
      const trigger = ServerGameService.removeTriggerRecordById(gameState, selectedQueueId);
      if (trigger) {
        await ServerGameService.processSelectedTriggerRecord(gameState, trigger, onUpdate);
      } else {
        gameState.logs.push(`[错误] 找不到选择的诱发效果: ${currentSelections[0] || 'none'}。`);
        await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      }
      await ServerGameService.finalizeBattleAfterPendingQuery(gameState, onUpdate);
      return gameState;
    }

    // 3. Generic Effect Resolution (Script-Driven via resolve callback)
    if (query.callbackKey === 'EFFECT_RESOLVE') {
      if (!sourceCard) {
          gameState.logs.push(`[错误] EFFECT_RESOLVE 找不到来源卡 ID: ${sourceCardId}，当前结算失败并继续后续处理。`);
        if (gameState.isResolvingStack) {
          if (gameState.counterStack.length > 0) {
            await ServerGameService.resolveCounterStack(gameState, onUpdate);
          } else {
            await ServerGameService.finishCounteringStack(gameState, onUpdate);
          }
        } else if (!gameState.isCountering) {
          await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
        }
        return gameState;
      }

      const effectIndex = query.context?.effectIndex;
      const effectId = query.context?.effectId;

      // Ensure sourceCard.effects exists and find the effect
      let effect: CardEffect | undefined;
      if (effectIndex !== undefined) {
        effect = sourceCard.effects?.[effectIndex];
      } else if (effectId) {
        effect = sourceCard.effects?.find(e => e.id === effectId);
      }
      if (effect && effect.onQueryResolve) {
        const previousProcessingItem = gameState.currentProcessingItem;
        if (!gameState.currentProcessingItem) {
          gameState.currentProcessingItem = {
            type: 'EFFECT',
            card: sourceCard,
            ownerUid: query.context?.ownerUid || playerUid,
            effectIndex,
            timestamp: Date.now()
          };
        }
        try {
          await (effect.onQueryResolve as any)(sourceCard, gameState, gameState.players[playerUid], currentSelections, query.context);
          ServerGameService.normalizeForcedGuardBattleState(gameState);
          EventEngine.recalculateContinuousEffects(gameState);
        } catch (err: any) {
          console.error(`[Error] CRASH in onQueryResolve:`, err);
          gameState.logs.push(`[閿欒] 鑴氭湰鍥炶皟鎵ц宕╂簝: ${err.message}`);
        } finally {
          gameState.currentProcessingItem = previousProcessingItem || null;
        }

        if (gameState.pendingQuery) {
          return gameState;
        }

        if (gameState.phase === 'DAMAGE_CALCULATION' && gameState.battleState?.autoResolveDamage) {
          delete gameState.battleState.autoResolveDamage;
          await ServerGameService.resolveDamage(gameState);
          if (gameState.pendingQuery) {
            return gameState;
          }
        }

        // RESUME RESOLUTION: If this choice was part of a sequential settlement, resume it.
        if (gameState.isResolvingStack) {
          if (gameState.counterStack.length > 0) {
            await ServerGameService.resolveCounterStack(gameState, onUpdate);
          } else {
            // If the stack is now empty, ensure we clean up the "Resolving" state
            await ServerGameService.finishCounteringStack(gameState);
            if (onUpdate) await onUpdate(gameState);
          }
        } else if (!gameState.isCountering) {
          // If not in a stack resolution and not in priority window, likely resuming a triggered effect chain
          await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
        }
        await ServerGameService.finalizeBattleAfterPendingQuery(gameState, onUpdate);
        return gameState;
      } else {
        gameState.logs.push(`[错误] EFFECT_RESOLVE 找不到有效回调 (index: ${effectIndex}, id: ${effectId})`);
      }
    }

    if (query.callbackKey === 'ACTIVATE_COST_RESOLVE') {
      if (!sourceCard) {
        gameState.logs.push(`[错误] ACTIVATE_COST_RESOLVE 找不到来源卡 ID: ${sourceCardId}，当前结算失败并继续后续处理。`);
        if (gameState.isResolvingStack) {
          if (gameState.counterStack.length > 0) {
            await ServerGameService.resolveCounterStack(gameState, onUpdate);
          } else {
            await ServerGameService.finishCounteringStack(gameState, onUpdate);
          }
        } else if (!gameState.isCountering) {
          await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
        }
        return gameState;
      }
      const effectIndex = query.context?.effectIndex;
      const effectId = query.context?.effectId;
      const effect = effectIndex !== undefined
        ? sourceCard.effects?.[effectIndex]
        : effectId
          ? sourceCard.effects?.find(e => e.id === effectId)
          : undefined;
      const activationPlayerUid = query.context?.activationPlayerUid || playerUid;

      if (query.context?.costType === 'EROSION_COST') {
        const amount = query.context?.erosionCostAmount || selections.length;
        const player = gameState.players[activationPlayerUid];
        const selectedCards = selections
          .map(id => player.erosionFront.find(card => card?.gamecardId === id))
          .filter((card): card is Card => !!card && card.displayState === 'FRONT_UPRIGHT');

        if (selectedCards.length !== amount) {
          gameState.pendingQuery = query;
          throw new Error(`请选择 ${amount} 张正面侵蚀卡支付费用`);
        }

        selectedCards.forEach(card => {
          ServerGameService.moveCard(gameState, activationPlayerUid, 'EROSION_FRONT', activationPlayerUid, 'EROSION_BACK', card.gamecardId, {
            faceDown: true,
            isEffect: true,
            effectSourcePlayerUid: activationPlayerUid,
            effectSourceCardId: sourceCard.gamecardId
          });
        });
        gameState.logs.push(`[${sourceCard.fullName}] 支付侵蚀${amount}：将 ${amount} 张正面侵蚀卡转为背面。`);
      } else if (query.context?.costType === 'TOP_DECK_FACE_DOWN_EXILE') {
        const amount = query.context?.topDeckExileAmount || 1;
        const player = gameState.players[activationPlayerUid];
        if (!player || player.deck.length < amount) {
          gameState.pendingQuery = query;
          throw new Error(`卡组数量不足，无法将卡组顶${amount}张背面放逐作为费用`);
        }

        for (let i = 0; i < amount; i += 1) {
          const topCard = player.deck[player.deck.length - 1];
          if (!topCard) break;
          ServerGameService.moveCard(gameState, activationPlayerUid, 'DECK', activationPlayerUid, 'EXILE', topCard.gamecardId, {
            faceDown: true,
            isEffect: true,
            effectSourcePlayerUid: activationPlayerUid,
            effectSourceCardId: sourceCard.gamecardId
          });
        }
        gameState.logs.push(`[${sourceCard.fullName}] 将卡组顶${amount}张卡背面放逐作为费用。`);
      } else if (query.context?.costType === 'DISCARD_HAND_COST') {
        const amount = query.context?.discardCostAmount || selections.length;
        const player = gameState.players[activationPlayerUid];
        const selectedCards = selections
          .map(id => player.hand.find(card => card.gamecardId === id))
          .filter((card): card is Card => !!card);

        if (selectedCards.length !== amount) {
          gameState.pendingQuery = query;
          throw new Error(`请选择 ${amount} 张手牌支付费用`);
        }

        selectedCards.forEach(card => {
          (card as any).data = {
            ...((card as any).data || {}),
            lastMovedAsCostTurn: gameState.turnCount,
            lastMovedAsCostSourceCardId: sourceCard.gamecardId,
            lastMovedAsCostSourceName: sourceCard.fullName
          };
          ServerGameService.moveCard(gameState, activationPlayerUid, 'HAND', activationPlayerUid, 'GRAVE', card.gamecardId, {
            isEffect: false,
            effectSourcePlayerUid: activationPlayerUid,
            effectSourceCardId: sourceCard.gamecardId
          });
        });
        gameState.logs.push(`[${sourceCard.fullName}] 舍弃 ${amount} 张手牌作为费用。`);
        if (query.context?.exhaustSourceAsCost) {
          if (!ServerGameService.exhaustCard(sourceCard, gameState)) {
            gameState.pendingQuery = query;
            throw new Error(`[${sourceCard.fullName}] 不能横置自身支付费用`);
          }
          EventEngine.dispatchEvent(gameState, {
            type: 'CARD_ROTATED',
            sourceCard,
            sourceCardId: sourceCard.gamecardId,
            targetCardId: sourceCard.gamecardId,
            playerUid: activationPlayerUid,
            data: {
              direction: 'HORIZONTAL',
              effectSourcePlayerUid: activationPlayerUid,
              effectSourceCardId: sourceCard.gamecardId,
              allTargetCardIds: [sourceCard.gamecardId]
            }
          });
          gameState.logs.push(`[${sourceCard.fullName}] 横置自身作为费用。`);
        }
      } else if (query.context?.costType === 'SIMETE_EXILE_COST') {
        const amount = query.context?.simeteCostAmount || selections.length;
        const selectedCards = selections
          .map(id => ServerGameService.findCardById(gameState, id))
          .filter((card): card is Card => !!card && card.godMark && card.specialName === '丝梅特');

        if (selectedCards.length !== amount) {
          gameState.pendingQuery = query;
          throw new Error(`请选择 ${amount} 张「丝梅特」神蚀卡支付费用`);
        }

        selectedCards.forEach(card => {
          const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, card.gamecardId);
          if (ownerUid) {
            ServerGameService.moveCard(gameState, ownerUid, card.cardlocation as TriggerLocation, ownerUid, 'EXILE', card.gamecardId, {
              isEffect: true,
              effectSourcePlayerUid: activationPlayerUid,
              effectSourceCardId: sourceCard.gamecardId
            });
          }
        });
        gameState.logs.push(`[${sourceCard.fullName}] 放逐 ${amount} 张「丝梅特」神蚀卡作为费用。`);
      }

      const shouldResumeEffectQuery =
        !!effect?.onQueryResolve &&
        !query.context?.skipEffectResolveAfterCost &&
        query.context?.costType !== 'DISCARD_HAND_COST' &&
        (normalizedType !== 'SELECT_PAYMENT' || query.context?.step !== undefined || query.context?.effectId !== undefined);

      if (shouldResumeEffectQuery) {
        await (effect.onQueryResolve as any)(sourceCard, gameState, gameState.players[activationPlayerUid], currentSelections, query.context);
      }

      if (gameState.pendingQuery) {
        gameState.pendingQuery.callbackKey = 'ACTIVATE_COST_RESOLVE';
        gameState.pendingQuery.context = {
          ...query.context,
          ...gameState.pendingQuery.context,
          sourceCardId: sourceCard.gamecardId,
          effectIndex,
          activationPlayerUid,
          isTrigger: query.context?.isTrigger,
          event: query.context?.event
        };
        return gameState;
      }

      if (typeof (effect as any).onCostResolve === 'function') {
        await (effect as any).onCostResolve(sourceCard, gameState, gameState.players[activationPlayerUid], currentSelections, query.context);
      }

      if (query.context?.cancelActivation) {
        if (query.context?.resumeStackAfterCost && gameState.isResolvingStack) {
          if (gameState.counterStack.length > 0) {
            await ServerGameService.resolveCounterStack(gameState, onUpdate);
          } else {
            await ServerGameService.finishCounteringStack(gameState, onUpdate);
          }
        }
        return gameState;
      }

      if (query.context?.pendingAction === 'PLAY_CARD_EFFECT_COST') {
        await ServerGameService.playCard(
          gameState,
          activationPlayerUid,
          query.context.cardId,
          query.context.paymentSelection || {},
          query.context.declaredTargets,
          {
            resumeFromQuery: true,
            paymentSelectionResolved: !!query.context?.paymentSelectionResolved,
            declaredModeId: query.context?.declaredModeId,
            effectCostResolved: true
          }
        );
        return gameState;
      }

      if (query.context?.pendingAction === 'TRIGGER_EFFECT' && effect) {
        await ServerGameService.executeTriggeredEffect(gameState, activationPlayerUid, {
          card: sourceCard,
          effect,
          effectIndex,
          event: query.context.event,
          skipCost: true,
          declaredTargets: query.context?.declaredTargets,
          declaredModeId: query.context?.declaredModeId
        }, onUpdate);
        return gameState;
      }

      // If it was a trigger cost, execute immediately, otherwise enter countering
      if (query.context?.isTrigger) {
        await ServerGameService.executeTriggeredEffect(gameState, activationPlayerUid, {
          card: sourceCard,
          effect,
          effectIndex,
          event: query.context.event,
          skipCost: true,
          declaredTargets: query.context?.declaredTargets,
          declaredModeId: query.context?.declaredModeId
        }, onUpdate);
      } else if (effect) {
        ServerGameService.finalizeEffectActivation(gameState, activationPlayerUid, sourceCard, effect, effectIndex, query.context?.declaredTargets, query.context?.declaredModeId);
      }
      return gameState;
    }

    if (query.callbackKey === 'SUBSTITUTION_CHOICE') {
      const { subCardId, targetUnitId, isEffect, sourcePlayerId } = query.context;
      gameState.pendingQuery = undefined;

      if (currentSelections[0] === 'YES') {
        // Find equipment
        const player = gameState.players[playerUid];
        let subZone: TriggerLocation = 'ITEM';
        let subCardIdx = player.itemZone.findIndex(c => c?.gamecardId === subCardId);
        let subCard = player.itemZone[subCardIdx];
        if (subCardIdx === -1) {
          subZone = 'UNIT';
          subCardIdx = player.unitZone.findIndex(c => c?.gamecardId === subCardId);
          subCard = player.unitZone[subCardIdx] || undefined;
        }
        if (subCardIdx !== -1 && subCard) {
          const targetUnit = ServerGameService.findCardById(gameState, targetUnitId) || ({ gamecardId: targetUnitId } as Card);
          const substitutionEffect = subCard.effects?.find(e =>
            e.substitutionFilter &&
            (!e.substitutionOnlyEffect || isEffect) &&
            (!e.substitutionOnlyOpponent || (!!sourcePlayerId && sourcePlayerId !== playerUid)) &&
            AtomicEffectExecutor.matchesFilter(targetUnit, e.substitutionFilter, subCard)
          );
          const substitutionAction = substitutionEffect?.substitutionAction || 'SEND_SELF_TO_GRAVE';
          if (substitutionAction === 'EXHAUST_SELF') {
            if (ServerGameService.exhaustCard(subCard, gameState)) {
              gameState.logs.push(`[系统] ${subCard.fullName} 横置代替了承受破坏。`);
            } else {
              gameState.logs.push(`[系统] ${subCard.fullName} 无法横置，代替破坏失败。`);
              await ServerGameService.destroyUnit(gameState, playerUid, targetUnitId, isEffect, sourcePlayerId, true);
            }
          } else if (substitutionAction === 'DESTROY_SELF') {
            await ServerGameService.destroyUnit(gameState, playerUid, subCardId, true, sourcePlayerId, true);
            gameState.logs.push(`[系统] ${subCard.fullName} 破坏自身代替了承受破坏。`);
          } else {
            ServerGameService.moveCard(gameState, playerUid, subZone, playerUid, 'GRAVE', subCardId, {
              isEffect,
              effectSourcePlayerUid: sourcePlayerId,
              effectSourceCardId: sourcePlayerId
                ? gameState.currentProcessingItem?.card?.gamecardId
                : undefined
            });
            gameState.logs.push(`[系统] ${subCard.fullName} 代替了承受破坏。`);
          }

          // Mark the unit as resolved (it survived)
          if (gameState.battleState) {
            if (!gameState.battleState.resolvedUnitIds) gameState.battleState.resolvedUnitIds = [];
            if (!gameState.battleState.resolvedUnitIds.includes(targetUnitId)) {
              gameState.battleState.resolvedUnitIds.push(targetUnitId);
            }
          }

          // CRITICAL: Trigger check after substitution
          await ServerGameService.checkTriggeredEffects(gameState);
        }
      } else {
        // Resume default destruction (skip substitution)
        await ServerGameService.destroyUnit(gameState, playerUid, targetUnitId, isEffect, sourcePlayerId, true);

        // Mark the unit as resolved (it was destroyed)
        if (gameState.battleState) {
          if (!gameState.battleState.resolvedUnitIds) gameState.battleState.resolvedUnitIds = [];
          if (!gameState.battleState.resolvedUnitIds.includes(targetUnitId)) {
            gameState.battleState.resolvedUnitIds.push(targetUnitId);
          }
        }
      }

      // Resume battle resolution if in damage calculation
      if (gameState.phase === 'DAMAGE_CALCULATION' && gameState.battleState) {
        await ServerGameService.resolveDamage(gameState);
      }

      return gameState;
    }

    if (query.callbackKey === 'EROSION_KEEP_RESOLVE') {
      const { choice, selectedCardId } = query.context;
      const keepCardId = selections[0]; // If none picked, selections[0] is undefined

      ServerGameService.executeErosionMovements(gameState, playerUid, choice, selectedCardId, keepCardId);

      await ServerGameService.proceedAfterErosion(gameState, playerUid, onUpdate);
      await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      return gameState;
    }

    if (query.callbackKey === 'ALLIANCE_DESTRUCTION_RESOLVE') {
      const selectedId = selections[0];
      const attackerId = query.context?.attackerId;
      const defenderId = query.context?.defenderPlayerId;
      const defenderUnitId = query.context?.defenderId;

      const attacker = gameState.players[attackerId];
      const defender = gameState.players[defenderId];
      if (!attacker || !defender || !gameState.battleState) return gameState;

      const selectedUnit = attacker.unitZone.find(u => u?.gamecardId === selectedId);
      const defendingUnit = defender.unitZone.find(u => u?.gamecardId === defenderUnitId);

      if (selectedUnit) {
        const destroyed = await ServerGameService.destroyUnit(gameState, attackerId, selectedId);
        if (destroyed === undefined) return gameState;
        if (destroyed !== false) {
          gameState.logs.push(`[联军结算] ${defender.displayName} 选择破坏进攻单位 ${selectedUnit.fullName}。`);
          if (!gameState.battleState.resolvedUnitIds?.includes(selectedId)) {
            gameState.battleState.resolvedUnitIds = gameState.battleState.resolvedUnitIds || [];
            gameState.battleState.resolvedUnitIds.push(selectedId);
          }
        }
      }

      let defenderDestroyed = gameState.battleState.resolvedUnitIds?.includes(defenderUnitId) || false;
      if (defendingUnit && !defenderDestroyed) {
        const destroyedDefender = await ServerGameService.destroyUnit(gameState, defenderId, defenderUnitId);
        if (destroyedDefender === undefined) return gameState;
        if (destroyedDefender !== false) {
          gameState.logs.push(`[联军结算] ${defendingUnit.fullName} 被联军破坏。`);
          gameState.battleState.resolvedUnitIds = gameState.battleState.resolvedUnitIds || [];
          gameState.battleState.resolvedUnitIds.push(defenderUnitId);
          defenderDestroyed = true;
        }
      }

      // Continue to finalize battle
      const attackingUnits = gameState.battleState!.attackers.map(id =>
        attacker.unitZone.find(c => c?.gamecardId === id)
      ).filter(Boolean) as Card[];
      const attackerIds = [...(gameState.battleState?.attackers || [])];

      // Exhaust remaining units
      attackingUnits.forEach(u => {
        const unit = attacker.unitZone.find(uz => uz?.gamecardId === u.gamecardId);
        if (unit) ServerGameService.exhaustCard(unit, gameState);
      });

      // Annihilation is based on attackers that actually survived destruction/prevention.
      if (defenderDestroyed) {
        const survivors = ServerGameService.getSurvivingAllianceAttackers(gameState, attackerId, attackerIds);
        ServerGameService.applyAllianceAnnihilationDamage(gameState, defenderId, survivors);
      }
      await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      if (gameState.pendingQuery) {
        (gameState as any).pendingBattleEndAfterQuery = {
          attackerIds: gameState.battleState.attackers || [],
          attackerPlayerId: attackerId
        };
        return gameState;
      }

      // Cleanup battle state
      ServerGameService.clearBattleCombatMarkers(gameState, attackerIds);
      if (gameState.phase === 'SHENYI_CHOICE') {
        gameState.previousPhase = 'MAIN';
      } else {
        gameState.phase = 'MAIN';
      }
      gameState.battleState = undefined;
      gameState.phaseTimerStart = Date.now();

      // RESUME RESOLUTION
      if (gameState.isResolvingStack) {
        await ServerGameService.resolveCounterStack(gameState, onUpdate);
      } else if (!gameState.pendingQuery && gameState.phase === 'MAIN') {
        await ServerGameService.enterForcedAttackBattleIfNeeded(gameState, attackerId, onUpdate, 'FORCED_ATTACK_CONTINUE');
      }
      return gameState;
    }

    if (query.callbackKey === 'COCOLA_ATTACK_CHOICE') {
      const { attackerIds, isAlliance, markedTargetId } = query.context;
      if (currentSelections[0] === 'YES') {
        // Execute attack declaration with forced target and skip defense
        await ServerGameService.declareAttack(gameState, playerUid, attackerIds, isAlliance, markedTargetId, true, onUpdate);
        gameState.logs.push(`[公会看板娘] 强制攻击生效，连锁结算后将跳过防御直接进入战斗自由阶段。`);
      } else {
        // Resume normal attack declaration (pass a special targetId to bypass prompt)
        await ServerGameService.declareAttack(gameState, playerUid, attackerIds, isAlliance, 'NO_PROMPT', undefined, onUpdate);
      }
      return gameState;
    }


    if (afterEffects.length > 0) {
      AtomicEffectExecutor.beginRecalcBatch(gameState);
      try {
        for (let i = 0; i < afterEffects.length; i++) {
          const effect = afterEffects[i];

          // INTERCEPT: If we need payment, "pause" and issue a SELECT_PAYMENT query
          if (effect.type === 'PAY_CARD_COST') {
            const targetId = currentSelections[0];
            const targetCard = ServerGameService.findCardById(gameState, targetId);
            const targetCost = targetCard
              ? ServerGameService.getEffectivePlayCost(gameState.players[playerUid], targetCard, gameState)
              : 0;
            if (targetCard && targetCost !== 0) {
              gameState.pendingQuery = {
                id: Math.random().toString(36).substring(7),
                type: 'SELECT_PAYMENT',
                playerUid,
                options: [], // Not used for payment
                title: `支付费用: ${targetCard.fullName}`,
                description: `请选择如何支付 ${targetCost} 点费用。`,
                minSelections: 1,
                maxSelections: 1,
                callbackKey: 'GENERIC_RESOLVE',
                paymentCost: targetCost,
                paymentColor: targetCard.color,
                context: {
                  ...query.context,
                  targetCardId: targetId,
                  targetSelections: currentSelections,
                  remainingEffects: afterEffects.slice(i + 1)
                }
              };
              return gameState; // Exit handleQueryChoice, waiting for payment
            }
            continue; // No cost to pay
          }

          if (query.executionMode === 'ON_STACK') {
            const queryCard = sourceCard || query.options[0]?.card;
            ServerGameService.enterCountering(gameState, playerUid, {
              ownerUid: playerUid,
              type: 'EFFECT',
              card: queryCard,
              timestamp: Date.now(),
              data: {
                afterSelectionEffects: [effect], // Push one by one to stack?
                selections: currentSelections
              } as any
            });
          } else {
            // IMMEDIATE resolution
            await AtomicEffectExecutor.execute(gameState, playerUid, effect, sourceCard, undefined, currentSelections);
          }
        }
      } finally {
        AtomicEffectExecutor.endRecalcBatch(gameState);
      }
    }

    ServerGameService.checkBattleInterruption(gameState);

    // RESUME RESOLUTION: If this choice was part of a sequential settlement, resume it.
    if (gameState.isResolvingStack) {
      await ServerGameService.resolveCounterStack(gameState, onUpdate);
    }

    return gameState;
  },

  findCardById(gameState: GameState, gamecardId: string): Card | undefined {
    for (const player of Object.values(gameState.players)) {
      const zones = [player.hand, player.deck, player.grave, player.exile, player.unitZone, player.itemZone, player.erosionFront, player.erosionBack, player.playZone];
      for (const zone of zones) {
        const found = zone.find(c => c?.gamecardId === gamecardId);
        if (found) return found;
      }
    }
    return undefined;
  },

  async declareAttack(gameState: GameState, playerId: string, attackerIds: string[], isAlliance: boolean, targetId?: string, skipDefense?: boolean, onUpdate?: (state: GameState) => Promise<void>, declarationTaxPaid = false) {
    if (gameState.pendingQuery || gameState.isResolvingStack || gameState.currentProcessingItem) {
      throw new Error('当前有未结算步骤，请等待处理完毕。');
    }
    const player = gameState.players[playerId];
    if (!player) throw new Error('Player not found');

    if (gameState.phase === 'MAIN') {
      if (!player.isTurn) throw new Error('Not your turn');
      if (gameState.turnCount === 1) {
        throw new Error('先手玩家第一回合不能进入战斗阶段');
      }
      gameState.phase = 'BATTLE_DECLARATION';
      await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', data: { phase: 'BATTLE_DECLARATION', reason: 'DECLARE_ATTACK_FROM_MAIN' } }, onUpdate);
      gameState.logs.push(`[阶段切换] ${player.displayName} 进入战斗阶段`);
      if (gameState.pendingQuery || gameState.phase !== 'BATTLE_DECLARATION') return gameState;
    }
    if (gameState.phase !== 'BATTLE_DECLARATION') throw new Error('Not in battle declaration phase');
    if (ServerGameService.isPlayerAttackLockedThisTurn(gameState, playerId)) {
      throw new Error('你本回合不能宣言攻击');
    }

    const attackers: Card[] = [];

    if (isAlliance && attackerIds.length !== 2) {
      throw new Error('联军攻击必须选择两个单位');
    }
    if (!isAlliance && attackerIds.length !== 1) {
      throw new Error('单体攻击必须选择一个单位');
    }

    const forcedAttackUnits = ServerGameService.getForcedAttackUnits(gameState, playerId);
    if (forcedAttackUnits.length > 0) {
      const forcedIds = new Set(forcedAttackUnits.map(unit => unit.gamecardId));
      if (isAlliance || attackerIds.length !== 1 || !forcedIds.has(attackerIds[0])) {
        const names = forcedAttackUnits.map(unit => unit.fullName).join('、');
        throw new Error(`本次必须由必须攻击的单位单独宣告攻击：${names}`);
      }
    }

    // Cocola's marked target prompt
    if (player.markedUnitAttackTarget && !targetId) {
      const opponentId = gameState.playerIds.find(id => id !== playerId)!;
      const opponent = gameState.players[opponentId];
      const targetUnit = opponent.unitZone.find(u => u && u.gamecardId === player.markedUnitAttackTarget);

      if (targetUnit && !(targetUnit as any).cannotBeAttackTargetByEffect) {
        const sourceAttacker = player.unitZone.find(unit => unit?.gamecardId === attackerIds[0]);
        const choiceContext = {
          attackerIds,
          isAlliance,
          markedTargetId: player.markedUnitAttackTarget,
          ...(sourceAttacker ? { sourceCardId: sourceAttacker.gamecardId } : {})
        };
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CHOICE',
          playerUid: playerId,
          options: standardizeChoiceOptions(gameState, [
            { id: 'YES', label: '发动(YES)' },
            { id: 'NO', label: '不发动(NO)' }
          ], choiceContext, targetUnit.id),
          title: '全攻确认',
          description: `是否选择发动【全攻】，攻击指定单位 [${targetUnit.fullName}]？选择“是”将直接进入战斗自由阶段。`,
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'COCOLA_ATTACK_CHOICE',
          context: choiceContext
        };
        return gameState;
      }
    }

    if (!isAlliance && attackerIds.length === 1 && !targetId && !skipDefense) {
      const attackerUnit = player.unitZone.find(unit => unit?.gamecardId === attackerIds[0]);
      const opponentId = gameState.playerIds.find(id => id !== playerId)!;
      const opponent = gameState.players[opponentId];
      const readyTargets = opponent.unitZone.filter((unit): unit is Card =>
        !!unit &&
        !unit.isExhausted &&
        !(unit as any).cannotBeAttackTargetByEffect
      );
      const exhaustedTargets = opponent.unitZone.filter((unit): unit is Card =>
        !!unit &&
        unit.isExhausted &&
        !(unit as any).cannotBeAttackTargetByEffect
      );

      if (ServerGameService.hasReadyUnitAttack(attackerUnit) && readyTargets.length > 0) {
        const choiceContext = { attackerIds, isAlliance, targetMode: 'READY', sourceCardId: attackerUnit!.gamecardId };
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CHOICE',
          playerUid: playerId,
          options: standardizeChoiceOptions(gameState, [
            { id: 'YES', label: '攻击重置单位(YES)' },
            { id: 'NO', label: '不攻击重置单位(NO)' }
          ], choiceContext),
          title: '攻击重置单位',
          description: `[${attackerUnit!.fullName}] 可以攻击对手的重置单位。是否选择攻击重置单位？`,
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'DIKAI_ATTACK_TARGET_CHOICE',
          context: choiceContext
        };
        return gameState;
      }

      if ((attackerUnit as any)?.data?.canAttackAnyUnit && (readyTargets.length + exhaustedTargets.length) > 0) {
        const choiceContext = { attackerIds, isAlliance, targetMode: 'ANY', sourceCardId: attackerUnit!.gamecardId };
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CHOICE',
          playerUid: playerId,
          options: standardizeChoiceOptions(gameState, [
            { id: 'YES', label: '攻击单位(YES)' },
            { id: 'NO', label: '不攻击单位(NO)' }
          ], choiceContext),
          title: '攻击单位',
          description: `[${attackerUnit!.fullName}] 可以攻击对手的单位。是否选择攻击单位？`,
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'DIKAI_ATTACK_TARGET_CHOICE',
          context: choiceContext
        };
        return gameState;
      }

      if (ServerGameService.has102050091ExhaustedAttack(attackerUnit) && exhaustedTargets.length > 0) {
        const choiceContext = { attackerIds, isAlliance, targetMode: 'EXHAUSTED', sourceCardId: attackerUnit!.gamecardId };
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CHOICE',
          playerUid: playerId,
          options: standardizeChoiceOptions(gameState, [
            { id: 'YES', label: '攻击横置单位(YES)' },
            { id: 'NO', label: '不攻击横置单位(NO)' }
          ], choiceContext),
          title: '攻击横置单位',
          description: `[${attackerUnit!.fullName}] 可以攻击对手的横置单位。是否选择攻击横置单位？`,
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'DIKAI_ATTACK_TARGET_CHOICE',
          context: choiceContext
        };
        return gameState;
      }
      player.markedUnitAttackTarget = undefined;
    }

    if (!isAlliance) {
      for (const id of attackerIds) {
        const unit = player.unitZone.find(c => c?.gamecardId === id);
        if (unit?.inAllianceGroup) {
          throw new Error(`单位 [${unit.fullName}] 处于联军状态，只能进行联军攻击`);
        }
      }
    }

    for (const id of attackerIds) {
      const unit = player.unitZone.find(c => c?.gamecardId === id);
      if (!unit) throw new Error('Attacker not found in unit zone');
      if (unit.isExhausted) throw new Error('Attacker is already exhausted');
      if (unit.canAttack === false) throw new Error(`单位 [${unit.fullName}] 无法攻击`);
      if ((unit as any).data?.cannotAttackThisTurn === gameState.turnCount) {
        throw new Error(`单位 [${unit.fullName}] 由于 [${(unit as any).data.cannotAttackThisTurnSourceName || '卡牌效果'}] 不能在本回合宣言攻击`);
      }
      if ((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount) {
        throw new Error(`单位 [${unit.fullName}] 由于 [${(unit as any).data.cannotAttackOrDefendSourceName || '卡牌效果'}] 不能宣言攻击`);
      }
      if (!ServerGameService.canExhaustForDeclaration(unit, gameState)) {
        throw new Error(`单位 [${unit.fullName}] 由于 [${(unit as any).data.cannotExhaustSourceName || '卡牌效果'}] 不能横置`);
      }
      if (isAlliance && (unit as any).data?.cannotAllianceByEffect) {
        throw new Error(`单位 [${unit.fullName}] 由于效果不能组成联军`);
      }
      if ((unit as any).battleForbiddenByEffect) throw new Error(`单位 [${unit.fullName}] 由于效果不能参与战斗`);

      if (targetId) {
        const opponentId = gameState.playerIds.find(id => id !== playerId)!;
        const targetUnit = gameState.players[opponentId]?.unitZone.find(c => c?.gamecardId === targetId);
        if (targetUnit && (targetUnit as any).cannotBeAttackTargetByEffect) {
          throw new Error(`单位 [${targetUnit.fullName}] 由于效果不能成为攻击对象`);
        }
        if (targetId !== 'NO_PROMPT') {
          const canAttackMarkedTarget = player.markedUnitAttackTarget === targetId;
          const canAttackAnyUnitTarget =
            !isAlliance &&
            attackerIds.length === 1 &&
            !!targetUnit &&
            !!(unit as any).data?.canAttackAnyUnit;
          const canAttackExhaustedTarget =
            !isAlliance &&
            attackerIds.length === 1 &&
            !!targetUnit &&
            targetUnit.isExhausted &&
            ServerGameService.has102050091ExhaustedAttack(unit);
          const canAttackReadyTarget =
            !isAlliance &&
            attackerIds.length === 1 &&
            !!targetUnit &&
            !targetUnit.isExhausted &&
            ServerGameService.hasReadyUnitAttack(unit);
          if (!canAttackMarkedTarget && !canAttackAnyUnitTarget && !canAttackExhaustedTarget && !canAttackReadyTarget) {
            throw new Error('不能攻击该单位');
          }
        }
      }

      // Interpretation: entering "allied territory" makes them participants in an alliance
      if (isAlliance) {
        unit.inAllianceGroup = true;
      }

      // Attack conditions:
      // a. Upright, isrush=true, can attack this turn
      // b. Upright, isrush=false, not played this turn
      const isRush = !!unit.isrush;
      const wasPlayedThisTurn = unit.playedTurn === gameState.turnCount;
      if (!isRush && wasPlayedThisTurn) {
        throw new Error(`单位 [${unit.fullName}] 在本回合打出，没有【速攻】不能攻击`);
      }

      unit.hasAttackedThisTurn = true;
      if ((unit as any).data?.canAttackExhaustedConsumeOnAttack) {
        delete (unit as any).data.canAttackExhausted;
        delete (unit as any).data.canAttackExhaustedUntilTurn;
        delete (unit as any).data.canAttackExhaustedSourceName;
        delete (unit as any).data.canAttackExhaustedConsumeOnAttack;
      }
      if ((unit as any).data?.canAttackAnyUnitConsumeOnAttack) {
        delete (unit as any).data.canAttackAnyUnit;
        delete (unit as any).data.canAttackAnyUnitUntilTurn;
        delete (unit as any).data.canAttackAnyUnitSourceName;
        delete (unit as any).data.canAttackAnyUnitConsumeOnAttack;
      }
      attackers.push(unit);
    }

    const attackTaxAmount = declarationTaxPaid
      ? 0
      : Math.max(0, ...attackers.map(unit => Number((unit as any).data?.declareAttackDefenseTax || 0)));
    if (attackTaxAmount > 0) {
      const sourceNames = Array.from(new Set(attackers
        .map(unit => (unit as any).data?.declareAttackDefenseTaxSourceName)
        .filter(Boolean))).join('、') || '卡牌效果';
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_PAYMENT',
        playerUid: playerId,
        options: [],
        title: '支付宣言费用',
        description: `由于 [${sourceNames}]，宣言攻击需要支付 ${attackTaxAmount} 费。若不支付，不能进行这次宣言。`,
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'DECLARE_ATTACK_TAX_PAYMENT',
        paymentCost: attackTaxAmount,
        paymentColor: attackers[0]?.color,
        context: { attackerIds, isAlliance, targetId, skipDefense }
      };
      return gameState;
    }

    // Exhaust attackers
    for (const unit of attackers) {
      ServerGameService.exhaustCard(unit, gameState);
      if ((player as any).snowstormTurn === gameState.turnCount) {
        unit.temporaryDamageBuff = (unit.temporaryDamageBuff || 0) - 1;
        unit.temporaryPowerBuff = (unit.temporaryPowerBuff || 0) - 1000;
        unit.damage = (unit.damage || 0) - 1;
        unit.power = (unit.power || 0) - 1000;
        unit.temporaryBuffSources = { ...(unit.temporaryBuffSources || {}), damage: (player as any).snowstormSourceName || '暴风雪', power: (player as any).snowstormSourceName || '暴风雪' };
      }
    }

    if (attackers.some(unit => nameContains(unit, '殿堂'))) {
      if ((player as any).hallAttackCountTurn !== gameState.turnCount) {
        (player as any).hallAttackCount = 0;
      }
      (player as any).hallAttackCountTurn = gameState.turnCount;
      (player as any).hallAttackCount = Number((player as any).hallAttackCount || 0) + 1;
    }

    gameState.battleState = {
      attackers: attackerIds,
      isAlliance,
      unitTargetId: targetId === 'NO_PROMPT' ? undefined : targetId,
      defensePowerRestriction: 0,
      battleId: `battle_${gameState.turnCount}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    };
    EventEngine.recalculateContinuousEffects(gameState);

    let effectiveSkipDefense = !!skipDefense;
    if (!effectiveSkipDefense) {
      effectiveSkipDefense = await ServerGameService.tryApplyMinotaurShieldGuardOnAttackDeclaration(gameState, onUpdate);
    }

    const attackerNames = attackers.map(a => a.fullName).join(' 和 ');
    addBattleLog(gameState, {
      category: 'BATTLE',
      actorUid: playerId,
      actorName: player.displayName,
      targets: attackers.map(unit => cardToBattleLogRef(gameState, unit, playerId, 'UNIT')!),
      text: `${player.displayName} 宣告了攻击 ${attackerNames}${isAlliance ? ' (联军攻击)' : ''}`,
      metadata: { attackerIds, isAlliance, targetId }
    });

    EventEngine.dispatchEvent(gameState, {
      type: 'CARD_ATTACK_DECLARED',
      sourceCard: attackers[0],
      sourceCardId: attackers[0].gamecardId,
      playerUid: playerId,
      data: { attackerIds, isAlliance }
    });

    ServerGameService.enterCountering(gameState, playerId, {
      ownerUid: playerId,
      type: 'ATTACK',
      attackerIds,
      isAlliance,
      timestamp: Date.now(),
      skipDefense: effectiveSkipDefense
    });

    await ServerGameService.checkTriggeredEffects(gameState, onUpdate);

    return gameState;
  },

  async declareDefense(gameState: GameState, playerId: string, defenderId?: string, declarationTaxPaid = false) {
    if (gameState.pendingQuery || gameState.isResolvingStack || gameState.currentProcessingItem) {
      throw new Error('当前有未结算步骤，请等待处理完毕。');
    }
    if (gameState.phase !== 'DEFENSE_DECLARATION') throw new Error('Not in defense declaration phase');
    if (!gameState.battleState) throw new Error('No battle state found');

    const now = Date.now();
    ServerGameService.chargeTimer(gameState, playerId, now - (gameState.phaseTimerStart || now));

    const player = gameState.players[playerId];

    if (defenderId) {
      const unit = player.unitZone.find(c => c?.gamecardId === defenderId);
      if (!unit) throw new Error('Defender not found in unit zone');
      if (unit.isExhausted) throw new Error('Defender is already exhausted');
      if ((unit as any).battleForbiddenByEffect) throw new Error(`单位 [${unit.fullName}] 由于效果不能参与战斗`);
      if ((unit as any).data?.cannotDefendTurn === gameState.turnCount) {
        throw new Error(`单位 [${unit.fullName}] 由于 [${(unit as any).data.cannotDefendSourceName || '卡牌效果'}] 不能宣言防御`);
      }
      if ((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount) {
        throw new Error(`单位 [${unit.fullName}] 由于 [${(unit as any).data.cannotAttackOrDefendSourceName || '卡牌效果'}] 不能宣言防御`);
      }
      if (!ServerGameService.canExhaustForDeclaration(unit, gameState)) {
        throw new Error(`单位 [${unit.fullName}] 由于 [${(unit as any).data.cannotExhaustSourceName || '卡牌效果'}] 不能横置`);
      }

      const lockedTargetId = gameState.battleState.defenseLockedToTargetId;
      if (lockedTargetId && defenderId !== lockedTargetId) {
        throw new Error('由于效果限制，这场战斗中只能由被指定的单位进行防御');
      }

      const minPower = gameState.battleState.defensePowerRestriction || 0;
      if (minPower > 0 && (unit.power || 0) < minPower) {
        throw new Error(`无法防御：对方的效果使得力量值低于 ${minPower} 的单位不能进行防御`);
      }
      const maxPower = gameState.battleState.defenseMaxPowerRestriction;
      if (maxPower !== undefined && (unit.power || 0) >= maxPower) {
        throw new Error(`无法防御：对方的效果使得力量值 ${maxPower} 以上的单位不能进行防御`);
      }
      const attackers = gameState.battleState.attackers
        .map(id => gameState.players[gameState.playerIds[gameState.currentTurnPlayer]].unitZone.find(attacker => attacker?.gamecardId === id))
        .filter(Boolean) as Card[];
      const minExclusive = Math.max(0, ...attackers.map(attacker => (attacker as any).data?.defenseMinPower || 0));
      if (minExclusive > 0 && (unit.power || 0) <= minExclusive) {
        throw new Error(`无法防御：攻击单位的效果使力量值 ${minExclusive} 以下的单位不能防御`);
      }

      const defenseTaxAmount = declarationTaxPaid ? 0 : Number((unit as any).data?.declareAttackDefenseTax || 0);
      if (defenseTaxAmount > 0) {
        const sourceName = (unit as any).data?.declareAttackDefenseTaxSourceName || '卡牌效果';
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_PAYMENT',
          playerUid: playerId,
          options: [],
          title: '支付宣言费用',
          description: `由于 [${sourceName}]，宣言防御需要支付 ${defenseTaxAmount} 费。若不支付，不能进行这次宣言。`,
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'DECLARE_DEFENSE_TAX_PAYMENT',
          paymentCost: defenseTaxAmount,
          paymentColor: unit.color,
          context: {
            defenderId,
            paymentOptions: { excludeExhaustUnitIds: [defenderId] }
          }
        };
        return gameState;
      }

      ServerGameService.exhaustCard(unit, gameState);
      if ((player as any).snowstormTurn === gameState.turnCount) {
        unit.temporaryDamageBuff = (unit.temporaryDamageBuff || 0) - 1;
        unit.temporaryPowerBuff = (unit.temporaryPowerBuff || 0) - 1000;
        unit.damage = (unit.damage || 0) - 1;
        unit.power = (unit.power || 0) - 1000;
        unit.temporaryBuffSources = { ...(unit.temporaryBuffSources || {}), damage: (player as any).snowstormSourceName || '暴风雪', power: (player as any).snowstormSourceName || '暴风雪' };
      }
      gameState.battleState.defender = defenderId;
      await ServerGameService.dispatchEventAndDrainTriggers(gameState, {
        type: 'CARD_DEFENSE_DECLARED',
        sourceCard: unit,
        sourceCardId: unit.gamecardId,
        playerUid: playerId,
        data: { defenderId: unit.gamecardId }
      });
      if (gameState.pendingQuery) return gameState;
      addBattleLog(gameState, {
        category: 'BATTLE',
        actorUid: playerId,
        actorName: player.displayName,
        targets: [cardToBattleLogRef(gameState, unit, playerId, 'UNIT')!],
        text: `${player.displayName} 宣告了防御 ${unit.fullName}`,
        metadata: { defenderId: unit.gamecardId }
      });
    } else {
      const turnPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
      const attackingUnits = (gameState.battleState.attackers || [])
        .map(id => gameState.players[turnPlayerId].unitZone.find(unit => unit?.gamecardId === id))
        .filter((unit): unit is Card => !!unit);
      const mustDefend = attackingUnits.some(unit => (unit as any).data?.mustBeDefendedTurn === gameState.turnCount);
      const hasAvailableDefender = player.unitZone.some(unit =>
        ServerGameService.canUnitDefendInCurrentBattle(gameState, unit)
      );
      if (mustDefend && hasAvailableDefender) {
        throw new Error('由于效果限制，必须选择1个单位宣言防御');
      }
      addBattleLog(gameState, {
        category: 'BATTLE',
        actorUid: playerId,
        actorName: player.displayName,
        text: `${player.displayName} 选择不防御`,
        metadata: { declinedDefense: true }
      });
    }

    // Transition to counter check (for now just move to battle free)
    gameState.phase = 'BATTLE_FREE';
    gameState.phaseTimerStart = Date.now();
    await ServerGameService.dispatchEventAndDrainTriggers(gameState, {
      type: 'PHASE_CHANGED',
      playerUid: playerId,
      data: { phase: 'BATTLE_FREE', reason: 'DEFENSE_DECLARED' }
    });
    if (gameState.pendingQuery) return gameState;

    return gameState;
  },

  async resolveDamage(gameState: GameState) {

    if (gameState.phase !== 'DAMAGE_CALCULATION') throw new Error('Not in damage calculation phase');
    if (!gameState.battleState) throw new Error('No battle state found');

    if (!gameState.battleState.resolvedUnitIds) {
      gameState.battleState.resolvedUnitIds = [];
    }

    const attackerId = gameState.playerIds[gameState.currentTurnPlayer];
    const defenderId = gameState.playerIds[gameState.currentTurnPlayer === 0 ? 1 : 0];
    const attacker = gameState.players[attackerId];
    const defender = gameState.players[defenderId];

    const attackingUnits = gameState.battleState.attackers.map(id =>
      attacker.unitZone.find(c => c?.gamecardId === id)
    ).filter(Boolean) as Card[];

    // Safety check: Ensure attackers still on field
    if (attackingUnits.length === 0) {
      gameState.logs.push(`[系统] 由于所有攻击单位均已离开战场，战斗被中断。`);
      ServerGameService.clearBattleCombatMarkers(gameState, gameState.battleState.attackers);
      gameState.battleState = undefined;
      gameState.phase = 'MAIN';
      await ServerGameService.checkTriggeredEffects(gameState);
      return gameState;
    }

    // Safety check: Ensure alliance attack still has both units
    if (gameState.battleState.isAlliance && attackingUnits.length < 2) {
      gameState.logs.push(`[系统] 由于联军攻击单位数量不足，战斗被中断。`);
      ServerGameService.clearBattleCombatMarkers(gameState, gameState.battleState.attackers);
      gameState.battleState = undefined;
      gameState.phase = 'MAIN';
      await ServerGameService.checkTriggeredEffects(gameState);
      return gameState;
    }

    // Handle forced attack target (Effect-based)
    if (!gameState.battleState.defender && gameState.battleState.unitTargetId) {
      const targetUnit = defender.unitZone.find(u => u && u.gamecardId === gameState.battleState!.unitTargetId);
      if (targetUnit) {
        gameState.battleState.defender = targetUnit.gamecardId;
        gameState.logs.push(`[系统] 攻击指向了被指定的单位 ${targetUnit.fullName}`);
      }
    }

    if (!gameState.battleState.defender) {
      // Direct damage to player
      const totalDamage = attackingUnits.reduce((sum, u) => sum + (u.damage || 0), 0);
      const dealtDamage = ServerGameService.applyDamageToPlayer(gameState, defenderId, totalDamage, 'BATTLE');

      if (dealtDamage > 0) {
        addBattleLog(gameState, {
          category: 'BATTLE',
          actorUid: attackerId,
          actorName: attacker.displayName,
          targets: attackingUnits.map(unit => cardToBattleLogRef(gameState, unit, attackerId, 'UNIT')!),
          text: `${attacker.displayName} 对 ${defender.displayName} 造成了 ${dealtDamage} 点战斗伤害`,
          metadata: { result: 'DIRECT_DAMAGE', damage: dealtDamage, defenderId }
        });
        await ServerGameService.dispatchEventAndDrainTriggers(gameState, {
          type: 'COMBAT_DAMAGE_CAUSED',
          playerUid: defenderId,
          data: {
            amount: dealtDamage,
            source: 'BATTLE',
            attackerIds: gameState.battleState.attackers || [],
            isAlliance: !!gameState.battleState.isAlliance
          }
        });
        if (gameState.pendingQuery) {
          ServerGameService.rememberBattleEndAfterPendingQuery(gameState, attackerId);
          return gameState;
        }
      }
    } else {
      // Unit combat
      EventEngine.recalculateContinuousEffects(gameState);
      const defendingUnitId = gameState.battleState!.defender;
      const defendingUnit = defender.unitZone.find(c => c?.gamecardId === defendingUnitId);

      if (!defendingUnit) {
        gameState.logs.push(`[系统] 由于指定防御单位离开战场，战斗宣言无效。`);
        ServerGameService.clearBattleCombatMarkers(gameState, gameState.battleState.attackers);
        gameState.battleState = undefined;
        gameState.phase = 'MAIN';
        await ServerGameService.checkTriggeredEffects(gameState);
        return gameState;
      }

      const defenderPower = defendingUnit.power || 0;

      if (!gameState.battleState.isAlliance) {
        const attackingUnit = attackingUnits[0];
        const attackerPower = attackingUnit.power || 0;
        addBattleLog(gameState, {
          category: 'BATTLE',
          actorUid: attackerId,
          actorName: attacker.displayName,
          targets: [
            cardToBattleLogRef(gameState, attackingUnit, attackerId, 'UNIT')!,
            cardToBattleLogRef(gameState, defendingUnit, defenderId, 'UNIT')!
          ],
          text: `[战斗] [${attackingUnit.fullName}](${attackerPower}) 与 [${defendingUnit.fullName}](${defenderPower}) 进行战斗。`,
          metadata: { attackerPower, defenderPower, attackerId: attackingUnit.gamecardId, defenderId: defendingUnit.gamecardId }
        });

        if (attackerPower > defenderPower) {
          if (!gameState.battleState.resolvedUnitIds.includes(defendingUnit.gamecardId)) {
            const destroyed = await ServerGameService.destroyUnit(gameState, defenderId, defendingUnit.gamecardId);
            if (destroyed === undefined) return gameState; // Wait for substitution choice
            if (!gameState.battleState) return gameState;
            if (destroyed !== false) {
              gameState.logs.push(`${attackingUnit.fullName} 破坏了 ${defendingUnit.fullName}`);
              gameState.battleState.resolvedUnitIds.push(defendingUnit.gamecardId);

              // Annihilation Effect
              if (attackingUnit.isAnnihilation) {
                gameState.logs.push(`【歼灭】效果触发！${attackingUnit.fullName} 对对手造成额外伤害`);
                const dealtDamage = ServerGameService.applyDamageToPlayer(gameState, defenderId, attackingUnit.damage || 0, 'BATTLE');
                if (dealtDamage > 0) {
                  EventEngine.dispatchEvent(gameState, {
                    type: 'COMBAT_DAMAGE_CAUSED',
                    playerUid: defenderId,
                    data: {
                      amount: dealtDamage,
                      source: 'BATTLE',
                      attackerIds: [attackingUnit.gamecardId],
                      isAlliance: !!gameState.battleState?.isAlliance
                    }
                  });
                }
              }

              if ((attackingUnit as any).data?.resetAfterNextBattleDestroyTurn === gameState.turnCount && gameState.gameStatus !== 2) {
                const sourceName = (attackingUnit as any).data.resetAfterNextBattleDestroySourceName || '效果';
                delete (attackingUnit as any).data.resetAfterNextBattleDestroyTurn;
                delete (attackingUnit as any).data.resetAfterNextBattleDestroySourceName;
                const choiceContext = {
                  unitId: attackingUnit.gamecardId,
                  sourceName,
                  sourceCardId: attackingUnit.gamecardId
                };
                gameState.pendingQuery = {
                  id: Math.random().toString(36).substring(7),
                  type: 'SELECT_CHOICE',
                  playerUid: attackerId,
                  options: standardizeChoiceOptions(gameState, [
                    { id: 'YES', label: '重置(YES)' },
                    { id: 'NO', label: '不重置(NO)' }
                  ], choiceContext),
                  title: '重置确认',
                  description: `由于 [${sourceName}]，是否将 [${attackingUnit.fullName}] 重置？`,
                  minSelections: 1,
                  maxSelections: 1,
                  callbackKey: 'RESET_AFTER_BATTLE_DESTROY_CHOICE',
                  context: choiceContext
                };
                gameState.priorityPlayerId = attackerId;
                gameState.logs.push(`[${sourceName}] 等待选择是否重置 [${attackingUnit.fullName}]。`);
                return gameState;
              }
            }
          }
        } else if (attackerPower < defenderPower) {
          if (!gameState.battleState.resolvedUnitIds.includes(attackingUnit.gamecardId)) {
            const destroyed = await ServerGameService.destroyUnit(gameState, attackerId, attackingUnit.gamecardId);
            if (destroyed === undefined) return gameState; // Wait for substitution choice
            if (!gameState.battleState) return gameState;
            if (destroyed !== false) {
              gameState.logs.push(`${defendingUnit.fullName} 破坏了 ${attackingUnit.fullName}`);
              gameState.battleState.resolvedUnitIds.push(attackingUnit.gamecardId);
            }
          }
        } else {
          // Mutual destruction
          const alreadyA = gameState.battleState.resolvedUnitIds.includes(attackingUnit.gamecardId);
          const alreadyD = gameState.battleState.resolvedUnitIds.includes(defendingUnit.gamecardId);

          if (!alreadyA || !alreadyD) {
            const destroyedA = alreadyA ? true : await ServerGameService.destroyUnit(gameState, attackerId, attackingUnit.gamecardId);
            if (destroyedA === undefined) return gameState;
            if (!gameState.battleState) return gameState;
            const destroyedD = alreadyD ? true : await ServerGameService.destroyUnit(gameState, defenderId, defendingUnit.gamecardId);
            if (destroyedD === undefined) return gameState;
            if (!gameState.battleState) return gameState;

            if (destroyedA !== false && !alreadyA) gameState.battleState.resolvedUnitIds.push(attackingUnit.gamecardId);
            if (destroyedD !== false && !alreadyD) gameState.battleState.resolvedUnitIds.push(defendingUnit.gamecardId);

            if (destroyedA !== false && destroyedD !== false) {
              gameState.logs.push(`${attackingUnit.fullName} 和 ${defendingUnit.fullName} 同归于尽`);
            }
          }
        }
      } else {
        // Alliance combat
        const totalAttackerPower = attackingUnits.reduce((sum, u) => sum + (u.power || 0), 0);
        const powerA = attackingUnits[0].power || 0;
        const powerB = attackingUnits[1].power || 0;
        const attackerA = attackingUnits[0];
        const attackerB = attackingUnits[1];
        addBattleLog(gameState, {
          category: 'BATTLE',
          actorUid: attackerId,
          actorName: attacker.displayName,
          targets: [
            ...attackingUnits.map(unit => cardToBattleLogRef(gameState, unit, attackerId, 'UNIT')!),
            cardToBattleLogRef(gameState, defendingUnit, defenderId, 'UNIT')!
          ],
          text: `[战斗] 联军 [${attackerA.fullName}](${powerA}) 和 [${attackerB.fullName}](${powerB}) 与 [${defendingUnit.fullName}](${defenderPower}) 进行战斗。`,
          metadata: { totalAttackerPower, defenderPower, attackerIds: attackingUnits.map(unit => unit.gamecardId), defenderId: defendingUnit.gamecardId }
        });
        const aHigher = powerA > defenderPower;
        const bHigher = powerB > defenderPower;

        const destroyAttacker = async (unit: Card) => {
          const already = gameState.battleState!.resolvedUnitIds.includes(unit.gamecardId);
          if (already) return true;
          const destroyed = await ServerGameService.destroyUnit(gameState, attackerId, unit.gamecardId);
          if (destroyed === undefined) return destroyed;
          if (!gameState.battleState) return undefined;
          if (destroyed !== false) {
            gameState.battleState!.resolvedUnitIds.push(unit.gamecardId);
          }
          return destroyed;
        };

        const destroyDefender = async () => {
          const already = gameState.battleState!.resolvedUnitIds.includes(defendingUnit.gamecardId);
          if (already) return true;
          const destroyed = await ServerGameService.destroyUnit(gameState, defenderId, defendingUnit.gamecardId);
          if (destroyed === undefined) return destroyed;
          if (!gameState.battleState) return undefined;
          if (destroyed !== false) {
            gameState.battleState!.resolvedUnitIds.push(defendingUnit.gamecardId);
          }
          return destroyed;
        };

        if (totalAttackerPower < defenderPower) {
          const res1 = await destroyAttacker(attackingUnits[0]);
          const res2 = await destroyAttacker(attackingUnits[1]);
          if (res1 !== false && res2 !== false) {
            gameState.logs.push(`联军总力量低于 ${defendingUnit.fullName}，攻击方所有单位都被破坏`);
          }
          if (res1 === undefined || res2 === undefined) return gameState;
        } else if (totalAttackerPower === defenderPower) {
          const defenderResult = await destroyDefender();
          const res1 = await destroyAttacker(attackingUnits[0]);
          const res2 = await destroyAttacker(attackingUnits[1]);
          if (defenderResult === undefined || res1 === undefined || res2 === undefined) return gameState;
          if (defenderResult !== false && res1 !== false && res2 !== false) {
            gameState.logs.push(`联军与 ${defendingUnit.fullName} 同归于尽`);
          }
          if (defenderResult !== false) {
            ServerGameService.applyAllianceAnnihilationDamage(
              gameState,
              defenderId,
              ServerGameService.getSurvivingAllianceAttackers(gameState, attackerId, gameState.battleState.attackers)
            );
          }
        } else if (aHigher && bHigher) {
          const defenderResult = await destroyDefender();
          if (defenderResult === undefined) return gameState;
          if (defenderResult !== false) {
            gameState.logs.push(`${defendingUnit.fullName} 被联军破坏`);
            ServerGameService.applyAllianceAnnihilationDamage(
              gameState,
              defenderId,
              ServerGameService.getSurvivingAllianceAttackers(gameState, attackerId, gameState.battleState.attackers)
            );
          }
        } else if (aHigher || bHigher) {
          const survivingUnit = aHigher ? attackerA : attackerB;
          const sacrificedUnit = aHigher ? attackerB : attackerA;
          const defenderResult = await destroyDefender();
          const attackerResult = await destroyAttacker(sacrificedUnit);
          if (defenderResult === undefined || attackerResult === undefined) return gameState;
          if (defenderResult !== false) {
            if (attackerResult !== false) {
              gameState.logs.push(`${defendingUnit.fullName} 与 ${sacrificedUnit.fullName} 被破坏，${survivingUnit.fullName} 留在场上`);
            } else {
              gameState.logs.push(`${defendingUnit.fullName} 被破坏，${sacrificedUnit.fullName} 的战斗破坏被防止，${survivingUnit.fullName} 留在场上`);
            }
            ServerGameService.applyAllianceAnnihilationDamage(
              gameState,
              defenderId,
              ServerGameService.getSurvivingAllianceAttackers(gameState, attackerId, gameState.battleState.attackers)
            );
          }
        } else if (!aHigher && !bHigher) {
          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CARD',
            playerUid: defenderId,
            options: attackingUnits.map(u => ({ card: u, source: 'UNIT' as TriggerLocation })),
            title: '联军破坏选择',
            description: `联军总力量 (${totalAttackerPower}) 高于防御单位 (${defenderPower})，且联军单位力量均不高于防御单位。请选择1个进攻单位破坏。`,
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'ALLIANCE_DESTRUCTION_RESOLVE',
            context: {
              defenderId: defendingUnit.gamecardId,
              attackerId,
              defenderPlayerId: defenderId
            }
          };
          gameState.priorityPlayerId = defenderId;
          gameState.logs.push(`等待 ${defender.displayName} 选择联军中要被破坏的进攻单位...`);
          return gameState;
        } else {
          const sacrificedUnit = powerA <= powerB ? attackerA : attackerB;
          const survivingUnit = sacrificedUnit.gamecardId === attackerA.gamecardId ? attackerB : attackerA;
          const defenderResult = await destroyDefender();
          const attackerResult = await destroyAttacker(sacrificedUnit);
          if (defenderResult === undefined || attackerResult === undefined) return gameState;
          if (defenderResult !== false) {
            if (attackerResult !== false) {
              gameState.logs.push(`${defendingUnit.fullName} 与 ${sacrificedUnit.fullName} 被破坏，${survivingUnit.fullName} 留在场上`);
            } else {
              gameState.logs.push(`${defendingUnit.fullName} 被破坏，${sacrificedUnit.fullName} 的战斗破坏被防止，${survivingUnit.fullName} 留在场上`);
            }
            ServerGameService.applyAllianceAnnihilationDamage(
              gameState,
              defenderId,
              ServerGameService.getSurvivingAllianceAttackers(gameState, attackerId, gameState.battleState.attackers)
            );
          }
        }
      }
    }
    if (!gameState.battleState.skipAttackerExhaust) {
      const keepResetUnitIds = new Set(gameState.battleState.keepResetUnitIds || []);
      attackingUnits.forEach(u => {
        const unit = attacker.unitZone.find(uz => uz?.gamecardId === u.gamecardId);
        if (unit && !keepResetUnitIds.has(unit.gamecardId)) ServerGameService.exhaustCard(unit, gameState);
      });
    }

    // Re-trigger check for Goddard effects like 302050014 that depend on combat state/phase
    // Process triggers while still in DAMAGE_CALCULATION and with valid battleState
    await ServerGameService.checkTriggeredEffects(gameState);
    if (!gameState.battleState) return gameState;
    if (gameState.pendingQuery) {
      ServerGameService.rememberBattleEndAfterPendingQuery(gameState, attackerId);
      return gameState;
    }

    // Now set phase back to MAIN or SHENYI if triggered
    if ((gameState.phase as GamePhase) !== 'SHENYI_CHOICE') {
      await ServerGameService.dispatchEventAndDrainTriggers(gameState, {
        type: 'BATTLE_ENDED',
        sourceCard: attackingUnits[0],
        sourceCardId: attackingUnits[0]?.gamecardId,
        playerUid: attackerId,
        data: {
          attackerIds: gameState.battleState.attackers || [],
          defenderId: gameState.battleState.defender,
          isAlliance: !!gameState.battleState.isAlliance
        }
      });
      if (gameState.pendingQuery) {
        ServerGameService.rememberBattleEndAfterPendingQuery(gameState, attackerId);
        return gameState;
      }
      gameState.phase = 'MAIN';
      gameState.phaseTimerStart = Date.now();
      await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', data: { phase: 'MAIN', reason: 'BATTLE_END' } });
      if (gameState.pendingQuery) {
        ServerGameService.rememberBattleEndAfterPendingQuery(gameState, attackerId);
        return gameState;
      }
      if (!gameState.battleState) return gameState;
      gameState.logs.push(`${attacker.displayName} 进入主要阶段 (战斗结算后)`);
    }

    // After all triggers are checked, see if we need to enter Shenyi choice
    if (gameState.pendingShenyi && !gameState.pendingQuery) {
      const currentPhase = gameState.phase as GamePhase;
      gameState.previousPhase = currentPhase === 'DAMAGE_CALCULATION' ? 'MAIN' : currentPhase;
      gameState.phase = 'SHENYI_CHOICE';
      gameState.logs.push(`等待玩家确认是否触发【神依】`);
    }

    const phaseAfterBattleTriggers = gameState.phase as GamePhase;
    if (phaseAfterBattleTriggers !== 'SHENYI_CHOICE' && phaseAfterBattleTriggers !== 'DAMAGE_CALCULATION') {
      // Phase might have been changed by a trigger, otherwise move to MAIN
    } else if (phaseAfterBattleTriggers === 'DAMAGE_CALCULATION') {
      gameState.phase = 'MAIN';
    }

    ServerGameService.clearBattleCombatMarkers(gameState, gameState.battleState?.attackers);
    gameState.battleState = undefined;
    gameState.phaseTimerStart = Date.now();
    await ServerGameService.checkTriggeredEffects(gameState);
    if (!gameState.pendingQuery && gameState.phase === 'MAIN') {
      await ServerGameService.enterForcedAttackBattleIfNeeded(gameState, attackerId, undefined, 'FORCED_ATTACK_CONTINUE');
    }
    return gameState;
  },

  applyDamageToPlayer(gameState: GameState, playerId: string, damage: number, source: 'BATTLE' | 'EFFECT' = 'BATTLE') {
    const player = gameState.players[playerId];

    if ((player as any).preventAllDamageTurn === gameState.turnCount) {
      gameState.logs.push(`[${(player as any).preventAllDamageSourceName || '伤害防止'}] 防止了 ${player.displayName} 将要受到的 ${damage} 点伤害。`);
      return 0;
    }

    if (
      source === 'EFFECT' &&
      (player as any).preventOpponentEffectDamageTurn === gameState.turnCount
    ) {
      gameState.logs.push(`[${(player as any).preventOpponentEffectDamageSourceName || '伤害防止'}] 防止了 ${player.displayName} 将要受到的 ${damage} 点对手效果伤害。`);
      (player as any).preventedOpponentEffectDamageThisTurn = Number((player as any).preventedOpponentEffectDamageThisTurn || 0) + damage;
      ServerGameService.bottomGraveCardsForPreventedEffectDamage(gameState, playerId, damage);
      return 0;
    }

    if (
      source === 'BATTLE' &&
      (player as any).preventBattleDamageUpToTurn === gameState.turnCount &&
      damage <= Number((player as any).preventBattleDamageUpToAmount || 0)
    ) {
      gameState.logs.push(`[${(player as any).preventBattleDamageUpToSourceName || '伤害防止'}] 防止了 ${player.displayName} 将要受到的 ${damage} 点战斗伤害。`);
      delete (player as any).preventBattleDamageUpToTurn;
      delete (player as any).preventBattleDamageUpToAmount;
      delete (player as any).preventBattleDamageUpToSourceName;
      return 0;
    }

    let finalAmount = damage;
    let finalDestination: TriggerLocation = 'EROSION_FRONT';

    if (player.isGoddessMode) {
      finalAmount *= 2;
      finalDestination = 'GRAVE';
      gameState.logs.push(`[女神化状态] ${player.displayName} 受到的伤害翻倍并直接进入墓地`);
    }

    if (player.deck.length < finalAmount) {
      gameState.logs.push(`[游戏结束] ${player.displayName} 的卡组中没有足够的卡牌来承受 ${finalAmount} 点伤害，判负。`);
      gameState.gameStatus = 2;
      gameState.winReason = source === 'BATTLE' ? 'DECK_OUT_BATTLE_DAMAGE' : 'DECK_OUT_EFFECT_DAMAGE';
      gameState.winnerId = gameState.playerIds.find(id => id !== playerId);
      return 0;
    }

    for (let i = 0; i < finalAmount; i++) {
      let card = player.deck.pop()!;
      let loopDestination: TriggerLocation = finalDestination;

      // Check for movement substitution (e.g. 104010484) - Only if not already forced to Grave by Goddess mode
      if (loopDestination === 'EROSION_FRONT' && card.effects) {
        for (const effect of card.effects) {
          if (
            effect.type === 'CONTINUOUS' &&
            effect.movementReplacementDestination &&
            effect.content !== 'REPLACE_DAMAGE_TO_EROSION'
          ) {
            if (!effect.condition || effect.condition(gameState, player, card)) {
              gameState.logs.push(`[替换效果] ${card.fullName} 的移动目的地从 EROSION_FRONT 被替换为 ${effect.movementReplacementDestination}`);
              loopDestination = effect.movementReplacementDestination;
              break;
            }
          }
        }
      }

      if (loopDestination === 'EROSION_FRONT') {
        const replacementSources = Object.values(gameState.players).flatMap(owner =>
          [...owner.unitZone, ...owner.itemZone, ...owner.erosionFront]
            .filter((sourceCard): sourceCard is Card => !!sourceCard)
            .map(sourceCard => ({ sourceCard, owner }))
        );

        for (const { sourceCard, owner } of replacementSources) {
          for (const effect of sourceCard.effects || []) {
            if (
              effect.type === 'CONTINUOUS' &&
              effect.content === 'REPLACE_DAMAGE_TO_EROSION' &&
              effect.movementReplacementDestination
            ) {
              if (!effect.condition || effect.condition(gameState, owner, sourceCard)) {
                gameState.logs.push(`[替换效果] [${sourceCard.fullName}] 将伤害导致的侵蚀改为进入 ${effect.movementReplacementDestination}`);
                loopDestination = effect.movementReplacementDestination;
                break;
              }
            }
          }

          if (loopDestination !== 'EROSION_FRONT') {
            break;
          }
        }
      }

      if (loopDestination === 'GRAVE' && (card.id === '201000140' || card.id === '201000040' || card.fullName === '解放之光')) {
        loopDestination = 'EXILE';
        gameState.logs.push(`[替换效果] [${card.fullName}] 将要被送入墓地，改为放逐。`);
      }

      if (loopDestination === 'EROSION_FRONT') {
        const currentErosion = player.erosionFront.filter(c => c !== null).length + player.erosionBack.filter(c => c !== null).length;
        if (currentErosion >= 10) {
          if (card.id === '201000140' || card.id === '201000040' || card.fullName === '解放之光') {
            card.cardlocation = 'EXILE';
            card.displayState = 'FRONT_UPRIGHT';
            player.exile.push(card);
            gameState.logs.push(`[替换效果] [${card.fullName}] 将要被送入墓地，改为放逐。`);
          } else {
            card.cardlocation = 'GRAVE';
            card.displayState = 'FRONT_UPRIGHT';
            player.grave.push(card);
            gameState.logs.push(`[侵蚀区已满] ${card.fullName} 因侵蚀区已达10张改为送入墓地。`);
          }
        } else {
          card.cardlocation = 'EROSION_FRONT';
          card.displayState = 'FRONT_UPRIGHT';
          card.isExhausted = false;
          const emptyIdx = player.erosionFront.findIndex(c => c === null);
          if (emptyIdx !== -1) player.erosionFront[emptyIdx] = card;
          else player.erosionFront.push(card);
        }
      } else if (loopDestination === 'UNIT') {
        card.cardlocation = 'UNIT';
        card.displayState = 'FRONT_UPRIGHT';
        card.playedTurn = gameState.turnCount;
        const emptyIdx = player.unitZone.findIndex(c => c === null);
        if (emptyIdx !== -1) player.unitZone[emptyIdx] = card;
        else player.unitZone.push(card);
        EventEngine.handleCardEnteredZone(gameState, playerId, card, 'UNIT', true);
      } else if (loopDestination === 'GRAVE') {
        card.cardlocation = 'GRAVE';
        card.displayState = 'FRONT_UPRIGHT';
        player.grave.push(card);
      } else if (loopDestination === 'EXILE') {
        card.cardlocation = 'EXILE';
        card.displayState = 'FRONT_UPRIGHT';
        player.exile.push(card);
      }

      // Check for goddess mode transformation
      const totalErosion = player.erosionFront.filter(c => c !== null).length + player.erosionBack.filter(c => c !== null).length;
      if (totalErosion >= 10 && !player.isGoddessMode) {
        (gameState as any).pendingGoddessTransformationDamageSource = source;
        ServerGameService.triggerGoddessTransformation(gameState, playerId);
        // Note: doubling and direct grave destination apply only to damage received thereafter.
      }

      // If more than 10 (non-goddess or legacy check), excess to grave
      const totalAfterPlacement = player.erosionFront.filter(c => c !== null).length + player.erosionBack.filter(c => c !== null).length;
      if (totalAfterPlacement > 10) {
        const lastIdx = player.erosionFront.length - 1;
        const excessCard = player.erosionFront[lastIdx];
        if (excessCard) {
          excessCard.cardlocation = 'GRAVE';
          player.grave.push(excessCard);
          player.erosionFront[lastIdx] = null;
        }
      }
    }

    ServerGameService.checkWinConditions(gameState);
    if (finalAmount > 0) {
      addBattleLog(gameState, {
        category: 'DAMAGE',
        actorUid: playerId,
        actorName: player.displayName,
        text: `[伤害] ${player.displayName} 受到了 ${finalAmount} 点 ${source === 'BATTLE' ? '战斗' : '效果'}伤害。`,
        metadata: { source, amount: finalAmount, originalAmount: damage, destination: finalDestination }
      });
    }
    return finalAmount;
  },

  bottomGraveCardsForPreventedEffectDamage(gameState: GameState, playerId: string, amount: number) {
    const player = gameState.players[playerId];
    if (!player || amount <= 0) return;
    const sourceName = (player as any).preventOpponentEffectDamageSourceName || '伤害防止';
    const sourceCardId = (player as any).preventOpponentEffectDamageSourceCardId;
    const cards = player.grave.slice(0, Math.min(amount, player.grave.length));
    cards.forEach(card => {
      ServerGameService.moveCard(gameState, playerId, 'GRAVE', playerId, 'DECK', card.gamecardId, {
        insertAtBottom: true,
        isEffect: true,
        effectSourcePlayerUid: playerId,
        effectSourceCardId: sourceCardId
      });
    });
    if (cards.length > 0) {
      gameState.logs.push(`[${sourceName}] 将墓地 ${cards.length} 张卡放置到卡组底。`);
    }
  },

  applyAllianceAnnihilationDamage(gameState: GameState, defenderPlayerId: string, survivingUnits: Card[]) {
    const annihilators = survivingUnits.filter(u => u.isAnnihilation);
    if (annihilators.length === 0) return;

    const totalAnnihilationDamage = annihilators.reduce((sum, u) => sum + (u.damage || 0), 0);
    gameState.logs.push(`【歼灭】效果触发！幸存的联军单位造成额外伤害 (${totalAnnihilationDamage})`);
    const dealtDamage = ServerGameService.applyDamageToPlayer(gameState, defenderPlayerId, totalAnnihilationDamage, 'BATTLE');
    if (dealtDamage > 0) {
      EventEngine.dispatchEvent(gameState, {
        type: 'COMBAT_DAMAGE_CAUSED',
        playerUid: defenderPlayerId,
        data: {
          amount: dealtDamage,
          source: 'BATTLE',
          attackerIds: annihilators.map(unit => unit.gamecardId),
          isAlliance: true
        }
      });
    }
  },

  getSurvivingAllianceAttackers(gameState: GameState, attackerPlayerId: string, attackerIds?: string[]) {
    const attacker = gameState.players[attackerPlayerId];
    if (!attacker) return [];
    return (attackerIds || gameState.battleState?.attackers || [])
      .map(id => attacker.unitZone.find(unit => unit?.gamecardId === id))
      .filter((unit): unit is Card => !!unit);
  },

  triggerGoddessTransformation(gameState: GameState, playerId: string) {
    const player = gameState.players[playerId];
    if (player.isGoddessMode) return;

    player.isGoddessMode = true;
    gameState.logs.push(`${player.displayName} 进入了女神化状态！`);
    const damageSource = (gameState as any).pendingGoddessTransformationDamageSource;
    const effectSourcePlayerUid = (gameState as any).pendingGoddessTransformationEffectSourcePlayerUid;
    const effectSourceCardId = (gameState as any).pendingGoddessTransformationEffectSourceCardId;
    delete (gameState as any).pendingGoddessTransformationDamageSource;
    delete (gameState as any).pendingGoddessTransformationEffectSourcePlayerUid;
    delete (gameState as any).pendingGoddessTransformationEffectSourceCardId;

    EventEngine.dispatchEvent(gameState, {
      type: 'GODDESS_TRANSFORMATION',
      playerUid: playerId,
      data: {
        playerUid: playerId,
        damageSource,
        effectSourcePlayerUid,
        effectSourceCardId,
        enteredByEffect: damageSource === 'EFFECT'
      }
    });

    // Shenyi Effect (Interactive)
    const shenyiUnits = player.unitZone.filter(u => u && u.isShenyi && !u.usedShenyiThisTurn && (u.isExhausted || u.displayState.includes('EXHAUSTED')));
    if (shenyiUnits.length > 0) {
      gameState.pendingShenyi = {
        playerUid: playerId,
        cardIds: shenyiUnits.map(u => u!.gamecardId)
      };
      gameState.priorityPlayerId = playerId;
      gameState.logs.push(`${player.displayName} 进入女神化，满足【神依】触发条件。`);
    }
  },

  async destroyUnit(gameState: GameState, playerId: string, gamecardId: string, isEffect: boolean = false, sourcePlayerId?: string, skipSubstitution: boolean = false, skipBattleDestroySave: boolean = false): Promise<boolean | undefined> {
    const player = gameState.players[playerId];
    let unitIdx = player.unitZone.findIndex(c => c?.gamecardId === gamecardId);
    let zone: 'UNIT' | 'ITEM' = 'UNIT';

    if (unitIdx === -1) {
      unitIdx = player.itemZone.findIndex(c => c?.gamecardId === gamecardId);
      if (unitIdx === -1) return false;
      zone = 'ITEM';
    }

    const unit = zone === 'UNIT' ? player.unitZone[unitIdx]! : player.itemZone[unitIdx]!;
    const battleId = ServerGameService.ensureBattleInstanceId(gameState);

    if (
      !isEffect &&
      zone === 'UNIT' &&
      !!battleId &&
      (unit as any).data?.preventBattleDestroyForBattleTurn === gameState.turnCount &&
      (unit as any).data.preventBattleDestroyForBattleId === battleId
    ) {
      const sourceName = (unit as any).data.preventBattleDestroyForBattleSourceName || '战斗破坏防止';
      gameState.logs.push(`[${sourceName}] 防止了 [${unit.fullName}] 这次战斗中将被战斗破坏。`);
      return false;
    }

    if (!isEffect && (unit as any).data?.combatImmuneUntilOwnNextTurnStartUid === playerId) {
      gameState.logs.push(`[${unit.fullName}] 不会被战斗破坏，本次破坏无效。`);
      return false;
    }

    if (!isEffect && (unit as any).battleImmuneByEffect) {
      gameState.logs.push(`[${unit.fullName}] 因效果不会被战斗破坏。`);
      return false;
    }

    if (
      !isEffect &&
      (unit as any).data?.preventNextBattleDestroy &&
      (
        (unit as any).data.preventNextBattleDestroyUntilTurn === undefined ||
        (unit as any).data.preventNextBattleDestroyUntilTurn >= gameState.turnCount
      )
    ) {
      const sourceName = (unit as any).data?.preventNextBattleDestroySourceName || '战斗破坏防止';
      delete (unit as any).data.preventNextBattleDestroy;
      delete (unit as any).data.preventNextBattleDestroySourceName;
      delete (unit as any).data.preventNextBattleDestroyUntilTurn;
      gameState.logs.push(`[${sourceName}] 防止了 [${unit.fullName}] 将要被战斗破坏。`);
      return false;
    }

    if (
      !isEffect &&
      (unit as any).data?.preventFirstAnyDestroyEachTurnSourceName &&
      (unit as any).data.preventFirstAnyDestroyEachTurnUsedTurn !== gameState.turnCount
    ) {
      (unit as any).data.preventFirstAnyDestroyEachTurnUsedTurn = gameState.turnCount;
      gameState.logs.push(`[${(unit as any).data.preventFirstAnyDestroyEachTurnSourceName}] 防止了 [${unit.fullName}] 本回合第一次将被破坏。`);
      return false;
    }

    if (
      !isEffect &&
      (unit as any).data?.preventFirstBattleDestroyEachTurnSourceName &&
      (unit as any).data.preventFirstBattleDestroyEachTurnUsedTurn !== gameState.turnCount
    ) {
      (unit as any).data.preventFirstBattleDestroyEachTurnUsedTurn = gameState.turnCount;
      gameState.logs.push(`[${(unit as any).data.preventFirstBattleDestroyEachTurnSourceName}] 防止了 [${unit.fullName}] 本回合第一次将被战斗破坏。`);
      return false;
    }

    if (isEffect && (unit as any).data?.indestructibleByEffect) {
      gameState.logs.push(`[${unit.fullName}] 因效果不会被破坏。`);
      return false;
    }

    if (
      isEffect &&
      (unit as any).data?.preventNextDestroy &&
      (
        (unit as any).data.preventNextDestroyUntilTurn === undefined ||
        (unit as any).data.preventNextDestroyUntilTurn >= gameState.turnCount
      )
    ) {
      const sourceName = (unit as any).data?.preventNextDestroySourceName || '破坏防止';
      delete (unit as any).data.preventNextDestroy;
      delete (unit as any).data.preventNextDestroySourceName;
      delete (unit as any).data.preventNextDestroyUntilTurn;
      gameState.logs.push(`[${sourceName}] 防止了 [${unit.fullName}] 将要被破坏。`);
      return false;
    }

    if (
      isEffect &&
      (unit as any).data?.preventFirstAnyDestroyEachTurnSourceName &&
      (unit as any).data.preventFirstAnyDestroyEachTurnUsedTurn !== gameState.turnCount
    ) {
      (unit as any).data.preventFirstAnyDestroyEachTurnUsedTurn = gameState.turnCount;
      gameState.logs.push(`[${(unit as any).data.preventFirstAnyDestroyEachTurnSourceName}] 防止了 [${unit.fullName}] 本回合第一次将被破坏。`);
      return false;
    }

    if (
      isEffect &&
      (unit as any).data?.preventFirstDestroyEachTurnSourceName &&
      (unit as any).data.preventFirstDestroyEachTurnUsedTurn !== gameState.turnCount
    ) {
      (unit as any).data.preventFirstDestroyEachTurnUsedTurn = gameState.turnCount;
      gameState.logs.push(`[${(unit as any).data.preventFirstDestroyEachTurnSourceName}] 防止了 [${unit.fullName}] 本回合第一次将被破坏。`);
      return false;
    }

    if (
      isEffect &&
      sourcePlayerId &&
      sourcePlayerId !== playerId &&
      (unit as any).data?.preventFirstOpponentEffectDestroyEachTurnSourceName &&
      (unit as any).data.preventFirstOpponentEffectDestroyEachTurnUsedTurn !== gameState.turnCount
    ) {
      (unit as any).data.preventFirstOpponentEffectDestroyEachTurnUsedTurn = gameState.turnCount;
      gameState.logs.push(`[${(unit as any).data.preventFirstOpponentEffectDestroyEachTurnSourceName}] 防止了 [${unit.fullName}] 本回合第一次将被对手的卡的效果破坏。`);
      return false;
    }

    const opponentUid = gameState.playerIds.find(id => id !== playerId);
    if (
      (unit as any).data?.indestructibleIfOpponentGoddess &&
      opponentUid &&
      gameState.players[opponentUid]?.isGoddessMode
    ) {
      gameState.logs.push(`[${unit.fullName}] 因对手处于女神化状态而不会被破坏。`);
      return false;
    }

    if (
      isEffect &&
      sourcePlayerId &&
      sourcePlayerId !== playerId &&
      gameState.players[sourcePlayerId]?.isGoddessMode &&
      (unit as any).data?.immuneToOpponentEffectsIfOpponentGoddess
    ) {
      gameState.logs.push(`[${unit.fullName}] 因对手处于女神化状态而不受对手卡牌效果影响。`);
      return false;
    }

    if (
      isEffect &&
      sourcePlayerId &&
      sourcePlayerId !== playerId &&
      (unit as any).data?.unaffectedByOpponentCardEffects
    ) {
      gameState.logs.push(`[${unit.fullName}] 不受对手的卡牌效果影响。`);
      return false;
    }

    if (
      isEffect &&
      sourcePlayerId &&
      sourcePlayerId !== playerId &&
      (unit as any).data?.unaffectedByOpponentColorEffects
    ) {
      const sourceCard = gameState.currentProcessingItem?.card;
      if (sourceCard && sourceCard.color === (unit as any).data.unaffectedByOpponentColorEffects) {
        gameState.logs.push(`[${unit.fullName}] 不受对手宣言颜色的卡牌效果影响。`);
        return false;
      }
    }

    if (
      isEffect &&
      sourcePlayerId &&
      sourcePlayerId !== playerId &&
      (unit as any).data?.unaffectedByOpponentAcLe !== undefined
    ) {
      const sourceCard = gameState.currentProcessingItem?.card;
      if (sourceCard && isOpponentAcAtMost(gameState, unit, sourceCard, Number((unit as any).data.unaffectedByOpponentAcLe), sourcePlayerId)) {
        gameState.logs.push(`[${unit.fullName}] is unaffected by opponent ACCESS ${(unit as any).data.unaffectedByOpponentAcLe} or less card effects.`);
        return false;
      }
    }

    if (
      isEffect &&
      sourcePlayerId &&
      sourcePlayerId !== playerId &&
      (player as any).preventOwnUnitsOpponentEffectDestroyTurn === gameState.turnCount
    ) {
      const preventSourceCardId = (player as any).preventOwnUnitsOpponentEffectDestroySourceCardId;
      const preventSource = preventSourceCardId ? ServerGameService.findCardById(gameState, preventSourceCardId) : undefined;
      const sourceName = preventSource?.fullName || (player as any).preventOwnUnitsOpponentEffectDestroySourceName || '破坏防止';
      gameState.logs.push(`[${sourceName}] 防止了 [${unit.fullName}] 将要被对手的卡的效果破坏。`);
      EventEngine.dispatchEvent(gameState, {
        type: 'CARD_EFFECT_DESTROY_PREVENTED',
        sourceCard: preventSource,
        sourceCardId: preventSourceCardId,
        targetCardId: gamecardId,
        playerUid: playerId,
        data: {
          preventedCardId: gamecardId,
          destroySourcePlayerId: sourcePlayerId,
          destroySourceCardId: gameState.currentProcessingItem?.card?.gamecardId,
          preventBatchKey: getCurrentEffectResolutionBatchKey(gameState)
        }
      });
      return false;
    }

    if ((unit as any).data?.returnToHandOnDestroyTurn === gameState.turnCount) {
      ServerGameService.moveCard(gameState, playerId, zone, playerId, 'HAND', gamecardId, {
        isEffect: true,
        effectSourcePlayerUid: (unit as any).data?.returnToHandOnDestroySourcePlayerUid || playerId,
        effectSourceCardId: (unit as any).data?.returnToHandOnDestroySourceCardId
      });
      gameState.logs.push(`[替换效果] ${unit.fullName} 本回合被破坏时改为返回手牌。`);
      await ServerGameService.checkTriggeredEffects(gameState);
      return false;
    }

    if (!skipSubstitution && (unit as any).data?.betisCanDestroyBatInstead) {
      const bat = player.unitZone.find(candidate =>
        candidate &&
        candidate.gamecardId !== unit.gamecardId &&
        (
          candidate.id === '102070357' ||
          candidate.fullName.includes('异界狂蝠') ||
          !!(candidate as any).data?.extraNameContainsOtherworldBatBy
        )
      );
      if (bat) {
        ServerGameService.moveCard(gameState, playerId, 'UNIT', playerId, 'GRAVE', bat.gamecardId, {
          isEffect: true,
          effectSourcePlayerUid: playerId,
          effectSourceCardId: unit.gamecardId
        });
        gameState.logs.push(`[${unit.fullName}] destroyed [${bat.fullName}] instead of being destroyed.`);
        await ServerGameService.checkTriggeredEffects(gameState);
        return false;
      }
    }

    if (!isEffect && !skipSubstitution && !skipBattleDestroySave) {
      const saveCandidate = ServerGameService.getBattleDestroySaveCandidate(gameState, playerId, gamecardId);
      if (saveCandidate) {
        const { card: saveCard, effect, effectIndex } = saveCandidate;
        const choiceContext = {
          cardId: saveCard.gamecardId,
          sourceCardId: saveCard.gamecardId,
          targetUnitId: gamecardId,
          isEffect,
          sourcePlayerId,
          effectIndex,
          effectId: effect.id
        };
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CHOICE',
          playerUid: playerId,
          options: standardizeChoiceOptions(gameState, [
            { id: 'YES', label: '发动(YES)' },
            { id: 'NO', label: '不发动(NO)' }
          ], choiceContext),
          title: '战斗破坏防止',
          description: `你的 [${unit.fullName}] 将要被战斗破坏。是否发动手牌中的 [${saveCard.fullName}] 防止那次破坏？`,
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'BATTLE_DESTROY_SAVE_CHOICE',
          context: choiceContext
        };
        return undefined;
      }
    }

    // Check for Substitution effects
    if (!skipSubstitution) {
      const substitutionCards = [...player.itemZone, ...player.unitZone].filter(c =>
        c !== null &&
        c.gamecardId !== gamecardId &&
        c.effects &&
        c.effects.some(e =>
          e.substitutionFilter &&
          (!e.substitutionOnlyEffect || isEffect) &&
          (!e.substitutionOnlyOpponent || (!!sourcePlayerId && sourcePlayerId !== playerId)) &&
          AtomicEffectExecutor.matchesFilter(unit, e.substitutionFilter, c)
        )
      ) as Card[];

      for (const subCard of substitutionCards) {
        const effect = subCard.effects.find(e =>
          e.substitutionFilter &&
          (!e.substitutionOnlyEffect || isEffect) &&
          (!e.substitutionOnlyOpponent || (!!sourcePlayerId && sourcePlayerId !== playerId)) &&
          AtomicEffectExecutor.matchesFilter(unit, e.substitutionFilter, subCard)
        );
        const result = ServerGameService.checkEffectLimitsAndReqs(gameState, playerId, subCard, effect);
        if (effect && result.valid) {
          // Issue Query
          const queryId = Math.random().toString(36).substring(7);
          const choiceContext = { subCardId: subCard.gamecardId, sourceCardId: subCard.gamecardId, targetUnitId: gamecardId, isEffect, sourcePlayerId };
          gameState.pendingQuery = {
            id: queryId,
            type: 'SELECT_CHOICE',
            playerUid: playerId,
            options: standardizeChoiceOptions(gameState, [
              { id: 'YES', label: '发动(YES)' },
              { id: 'NO', label: '不发动(NO)' }
            ], choiceContext),
            title: '效果发动确认',
            description: `是否发动 [${subCard.fullName}] 的效果，将其送入墓地代替 [${unit.fullName}] 的破坏？`,
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'SUBSTITUTION_CHOICE',
            context: choiceContext
          };
          return undefined; // Indicates pending choice
        }
      }
    }

    // Detect fromZone
    // Detect fromZone
    let fromZone: TriggerLocation = 'UNIT';
    if (player.itemZone.some(c => c?.gamecardId === gamecardId)) {
      fromZone = 'ITEM';
    } else if (player.erosionFront.some(c => c?.gamecardId === gamecardId)) {
      fromZone = 'EROSION_FRONT';
    } else if (player.erosionBack.some(c => c?.gamecardId === gamecardId)) {
      fromZone = 'EROSION_BACK';
    }

    // Default destruction using standard moveCard
    ServerGameService.moveCard(gameState, playerId, fromZone, playerId, 'GRAVE', gamecardId, {
      isEffect,
      effectSourcePlayerUid: sourcePlayerId
    });

    addBattleLog(gameState, {
      category: 'DESTROYED',
      actorUid: sourcePlayerId,
      actorName: sourcePlayerId ? gameState.players[sourcePlayerId]?.displayName : undefined,
      targets: [cardToBattleLogRef(gameState, unit, playerId, 'GRAVE')!],
      text: `[破坏] ${gameState.players[playerId]?.displayName || '玩家'} 的 [${unit.fullName}] 因${isEffect ? '效果' : '战斗'}被破坏并进入墓地。`,
      metadata: { isEffect, sourcePlayerId, fromZone }
    });

    if (isEffect) {
      await ServerGameService.dispatchEventAndDrainTriggers(gameState, {
        type: 'CARD_DESTROYED_EFFECT',
        targetCardId: gamecardId,
        playerUid: playerId,
        data: { sourcePlayerId }
      });
    } else {
      await ServerGameService.dispatchEventAndDrainTriggers(gameState, {
        type: 'CARD_DESTROYED_BATTLE',
        targetCardId: gamecardId,
        playerUid: playerId,
        data: {
          attackerIds: gameState.battleState?.attackers || [],
          defenderId: gameState.battleState?.defender,
          isAlliance: gameState.battleState?.isAlliance || false
        }
      });
    }
    return true; // Successfully destroyed
  },

  async discardCard(gameState: GameState, playerId: string, cardId: string) {

    if (gameState.phase !== 'DISCARD') throw new Error('Not in discard phase');
    const player = gameState.players[playerId];

    const cardIdx = player.hand.findIndex(c => c.gamecardId === cardId);
    if (cardIdx === -1) throw new Error('Card not found in hand');

    const card = player.hand.splice(cardIdx, 1)[0];
    card.cardlocation = 'GRAVE';
    player.grave.push(card);
    gameState.logs.push(`${player.displayName} 弃置了一张卡牌`);

    EventEngine.dispatchEvent(gameState, {
      type: 'CARD_DISCARDED',
      playerUid: playerId,
      data: { cardId: card.gamecardId }
    });

    await ServerGameService.checkTriggeredEffects(gameState);

    if (player.hand.length <= 6) {
      // Move to next turn
      await ServerGameService.finishTurnTransition(gameState);
    }

    return gameState;
  },

  processBt01DestroyAtEnd(gameState: GameState) {
    const pendingTargets = Object.values(gameState.players).flatMap(player =>
      player.unitZone
        .filter((card): card is Card => !!card && !!(card as any).data?.destroyAtEndBy)
        .map(card => ({ player, card }))
    );

    pendingTargets.forEach(({ player, card }) => {
      const data = (card as any).data || {};
      const sourceName = data.destroyAtEndBy || '卡牌效果';
      const sourcePlayerUid = data.destroyAtEndSourcePlayerUid;
      const sourceCardId = data.destroyAtEndSourceCardId;

      delete data.destroyAtEndBy;
      delete data.destroyAtEndSourceCardId;
      delete data.destroyAtEndSourcePlayerUid;

      const moved = ServerGameService.moveCard(gameState, player.uid, 'UNIT', player.uid, 'GRAVE', card.gamecardId, {
        isEffect: true,
        effectSourcePlayerUid: sourcePlayerUid,
        effectSourceCardId: sourceCardId
      });

      if (!moved) return;

      gameState.logs.push(`[${sourceName}] 的延迟效果在回合结束时破坏了 [${card.fullName}]。`);
      EventEngine.dispatchEvent(gameState, {
        type: 'CARD_DESTROYED_EFFECT',
        targetCardId: card.gamecardId,
        playerUid: player.uid,
        data: { sourcePlayerId: sourcePlayerUid }
      });
    });
  },

  enqueueMandatoryEndTurnDelayedEffects(gameState: GameState, turnPlayerUid: string) {
    const queue = gameState.triggeredEffectsQueue || [];
    gameState.triggeredEffectsQueue = queue;
    const enqueue = (record: any) => {
      if (queue.some(existing => existing.queueId === record.queueId)) return;
      queue.push(record);
    };

    Object.entries(gameState.players).forEach(([uid, player]) => {
      const fieldCards = [
        ...player.unitZone.map(card => ({ card, zone: 'UNIT' as TriggerLocation })),
        ...player.itemZone.map(card => ({ card, zone: 'ITEM' as TriggerLocation }))
      ];

      fieldCards.forEach(({ card, zone }) => {
        if (!card || (card as any).data?.returnToDeckBottomAtTurnEnd !== gameState.turnCount) return;
        const sourceName = (card as any).data.returnToDeckBottomSourceName || '卡牌效果';
        const sourceCardId = (card as any).data.returnToDeckBottomSourceCardId;
        const effectOwnerUid = (card as any).data.returnToDeckBottomOwnerUid ||
          (sourceCardId ? ServerGameService.findCardLocation(gameState, sourceCardId)?.ownerUid : undefined) ||
          uid;
        const queueId = `return_deck_${card.gamecardId}_${gameState.turnCount}`;
        enqueue({
          queueId,
          card,
          sourceCard: sourceCardId ? ServerGameService.findCardById(gameState, sourceCardId) : undefined,
          playerUid: effectOwnerUid,
          effectIndex: -1,
          virtualTriggerType: 'RETURN_TO_DECK_BOTTOM_AT_END',
          virtualPayload: {
            targetCardId: card.gamecardId,
            sourceCardId,
            sourceName,
            effectOwnerUid,
            turnCount: gameState.turnCount,
            targetZone: zone
          },
          event: { type: 'TURN_END' as any, playerUid: turnPlayerUid },
          effect: {
            id: queueId,
            type: 'TRIGGER',
            triggerEvent: 'TURN_END' as any,
            triggerLocation: [zone],
            isMandatory: true,
            description: `[${sourceName}] 回合结束时将 [${card.fullName}] 放置到卡组底。`
          }
        });
      });
    });

    Object.entries(gameState.players).forEach(([uid, player]) => {
      const fieldCards = [
        ...player.unitZone.map(card => ({ card, zone: 'UNIT' as TriggerLocation })),
        ...player.itemZone.map(card => ({ card, zone: 'ITEM' as TriggerLocation }))
      ];

      fieldCards.forEach(({ card, zone }) => {
        if (!card || (card as any).data?.returnToExileAtEndTurn !== gameState.turnCount) return;
        const sourceName = (card as any).data.returnToExileSourceName || '卡牌效果';
        const sourceCardId = (card as any).data.returnToExileSourceCardId;
        const effectOwnerUid = (card as any).data.returnToExileEffectOwnerUid ||
          (sourceCardId ? ServerGameService.findCardLocation(gameState, sourceCardId)?.ownerUid : undefined) ||
          uid;
        const queueId = `return_exile_${card.gamecardId}_${gameState.turnCount}`;
        enqueue({
          queueId,
          card,
          sourceCard: sourceCardId ? ServerGameService.findCardById(gameState, sourceCardId) : undefined,
          playerUid: effectOwnerUid,
          effectIndex: -1,
          virtualTriggerType: 'RETURN_TO_EXILE_AT_END',
          virtualPayload: {
            targetCardId: card.gamecardId,
            sourceCardId,
            sourceName,
            effectOwnerUid,
            turnCount: gameState.turnCount,
            targetZone: zone,
            predicateKey: (card as any).data.returnToExileAtEndPredicateKey || 'STILL_IN_UNIT'
          },
          event: { type: 'TURN_END' as any, playerUid: turnPlayerUid },
          effect: {
            id: queueId,
            type: 'TRIGGER',
            triggerEvent: 'TURN_END' as any,
            triggerLocation: [zone],
            isMandatory: true,
            description: `[${sourceName}] 回合结束时将 [${card.fullName}] 放逐。`
          }
        });
      });
    });

    Object.entries(gameState.players).forEach(([uid, player]) => {
      player.exile.forEach(card => {
        if (!card || !(card as any).data?.returnToOwnerFieldAtTurnEndSourceName) return;
        const sourceName = (card as any).data.returnToOwnerFieldAtTurnEndSourceName || '卡牌效果';
        const sourceCardId = (card as any).data.returnToOwnerFieldAtTurnEndSourceCardId;
        const ownerUid = (card as any).data.returnToOwnerFieldAtTurnEndOwnerUid || uid;
        const effectOwnerUid = sourceCardId
          ? ServerGameService.findCardLocation(gameState, sourceCardId)?.ownerUid
          : ownerUid;
        const queueId = `return_owner_field_${card.gamecardId}_${gameState.turnCount}`;
        enqueue({
          queueId,
          card,
          sourceCard: sourceCardId ? ServerGameService.findCardById(gameState, sourceCardId) : undefined,
          playerUid: effectOwnerUid || ownerUid,
          effectIndex: -1,
          virtualTriggerType: 'RETURN_TO_OWNER_FIELD_AT_END',
          virtualPayload: {
            targetCardId: card.gamecardId,
            sourceCardId,
            sourceName,
            ownerUid,
            effectOwnerUid: effectOwnerUid || ownerUid,
            turnCount: gameState.turnCount
          },
          event: { type: 'TURN_END' as any, playerUid: turnPlayerUid },
          effect: {
            id: queueId,
            type: 'TRIGGER',
            triggerEvent: 'TURN_END' as any,
            triggerLocation: ['EXILE'],
            isMandatory: true,
            description: `[${sourceName}] 回合结束时将 [${card.fullName}] 放回持有者战场。`
          }
        });
      });
    });

    if (gameState.pendingResolutions && gameState.pendingResolutions.length > 0) {
      const resolutions = [...gameState.pendingResolutions];
      gameState.pendingResolutions = [];
      resolutions.forEach((record, index) => {
        if (!record.effect?.resolve) return;
        const queueId = `pending_resolution_${gameState.turnCount}_${index}_${record.effect.id || record.card?.gamecardId || 'effect'}`;
        enqueue({
          ...record,
          queueId,
          playerUid: record.playerUid,
          event: record.event || { type: 'TURN_END' as any, playerUid: turnPlayerUid },
          effectIndex: record.effectIndex ?? -1,
          effect: {
            ...record.effect,
            id: record.effect.id || queueId,
            type: 'TRIGGER',
            triggerEvent: 'TURN_END' as any,
            isMandatory: true,
            execute: async (source: Card, state: GameState, player: PlayerState, event?: any) => {
              try {
                const resolvePromise = (record.effect.resolve as any)(source, state, player, event);
                await Promise.race([
                  resolvePromise,
                  new Promise((_, reject) => setTimeout(() => reject(new Error("Effect resolution timeout (5s)")), 5000))
                ]);
              } catch (err: any) {
                state.logs.push(`[效果错误] ${source?.fullName || '未知来源'} 的阶段结束效果处理失败: ${err.message}`);
              }
            }
          }
        });
      });
    }

    const currentPlayer = gameState.players[turnPlayerUid];
    if ((currentPlayer as any)?.loseAtEndOfTurn === gameState.turnCount) {
      const sourceName = (currentPlayer as any).loseAtEndOfTurnSourceName || '卡牌效果';
      const sourceCardId = (currentPlayer as any).loseAtEndOfTurnSourceCardId;
      const sourceCardSnapshot = (currentPlayer as any).loseAtEndOfTurnSourceCardSnapshot as Card | undefined;
      const sourceCard = sourceCardId
        ? ServerGameService.findCardById(gameState, sourceCardId)
        : currentPlayer.unitZone.find(card => card?.fullName === sourceName);
      const displaySourceCard = sourceCard || sourceCardSnapshot;
      const queueId = `lose_at_end_${turnPlayerUid}_${gameState.turnCount}`;
        enqueue({
          queueId,
          card: displaySourceCard || {
          id: queueId,
          uniqueId: queueId,
          gamecardId: queueId,
          fullName: sourceName,
          type: 'STORY',
          color: 'NONE',
          colorReq: {},
          acValue: 0,
          godMark: false,
          displayState: 'FRONT_UPRIGHT',
          feijingMark: false,
          canResetCount: 0,
          faction: '无'
        } as Card,
        playerUid: turnPlayerUid,
        effectIndex: -1,
        virtualTriggerType: 'LOSE_AT_END',
        virtualPayload: {
          sourceCardId,
          sourceName,
          effectOwnerUid: turnPlayerUid,
          turnCount: gameState.turnCount
        },
        event: { type: 'TURN_END' as any, playerUid: turnPlayerUid },
        effect: {
          id: queueId,
          type: 'TRIGGER',
          triggerEvent: 'TURN_END' as any,
          isMandatory: true,
          description: `[${sourceName}] 回合结束时你输掉游戏。`
        }
      });
    }
  },

  async finishTurnTransition(gameState: GameState) {
    try {

      const currentPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
      const currentPlayer = gameState.players[currentPlayerId];

      if (gameState.gameStatus === 2) return;

      gameState.currentTurnPlayer = gameState.currentTurnPlayer === 0 ? 1 : 0;
      ServerGameService.applyExtraTurnIfQueued(gameState, currentPlayerId);
      gameState.turnCount += 1;
      gameState.phase = 'START';
      gameState.phaseTimerStart = Date.now();
      const nextPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
      const nextPlayer = gameState.players[nextPlayerId];

      currentPlayer.isTurn = false;
      nextPlayer.isTurn = true;

      addBattleLog(gameState, {
        category: 'TURN',
        actorUid: nextPlayer.uid,
        actorName: nextPlayer.displayName,
        text: `Turn ${gameState.turnCount}: ${nextPlayer.displayName}`,
        metadata: { currentTurnPlayer: gameState.currentTurnPlayer }
      });

      ServerGameService.processBt01DestroyAtEnd(gameState);

      // 2. Perform global cleanup/flag reset
      Object.values(gameState.players).forEach(p => {
        p.hasUnitReturnedThisTurn = false;
        delete (p as any).unitsReturnedToDeckThisTurn;
        if ((p as any).cannotDeclareAttackTurn !== gameState.turnCount) {
          delete (p as any).cannotDeclareAttackTurn;
          delete (p as any).cannotDeclareAttackSourceName;
        }
        p.hasExhaustedThisTurn = [];
        p.negatedNames = [];
        delete (p as any).windProductionTurn;
        delete (p as any).windProductionSourceName;
        delete (p as any).preventAllDamageTurn;
        delete (p as any).preventAllDamageSourceName;
        delete (p as any).preventOpponentEffectDamageTurn;
        delete (p as any).preventOpponentEffectDamageSourceName;
        delete (p as any).preventOpponentEffectDamageSourceCardId;
        delete (p as any).preventedOpponentEffectDamageThisTurn;
        delete (p as any).drawnByEffectTurn;

        const allCards = [
          ...p.deck, ...p.hand, ...p.grave, ...p.exile,
          ...p.unitZone, ...p.itemZone, ...p.erosionFront, ...p.erosionBack, ...p.playZone
        ];
        allCards.forEach(card => {
          if (!card) return;
          card.temporaryCanActivateEffect = undefined;
          card.temporaryImmuneToUnitEffects = undefined;
          if ((card as any).data?.clearMirrorActiveTurn !== undefined) {
            delete (card as any).data.clearMirrorActiveTurn;
          }
          if ((card as any).data?.fullEffectSilencedTurn !== undefined && (card as any).data.fullEffectSilencedTurn < gameState.turnCount) {
            delete (card as any).data.fullEffectSilencedTurn;
            delete (card as any).data.fullEffectSilenceSource;
            delete (card as any).data.fullEffectSilencedZones;
          }
          if ((card as any).data?.ohEffectDisabledUntilOwnStartUid === nextPlayerId) {
            delete (card as any).data.ohEffectDisabledUntilOwnStartUid;
          }
          if ((card as any).data?.combatImmuneUntilOwnNextTurnStartUid === nextPlayerId) {
            delete (card as any).data.combatImmuneUntilOwnNextTurnStartUid;
            delete (card as any).data.combatImmuneSourceName;
          }
          if ((card as any).data?.tradeEffectDisabledUntilOwnStartUid === nextPlayerId) {
            delete (card as any).data.tradeEffectDisabledUntilOwnStartUid;
          }
          const disabledAketiRecordModes = (card as any).data?.disabledAketiRecordModesUntilOwnStart;
          if (disabledAketiRecordModes) {
            Object.keys(disabledAketiRecordModes).forEach(mode => {
              if (disabledAketiRecordModes[mode] === nextPlayerId) {
                delete disabledAketiRecordModes[mode];
              }
            });
            if (Object.keys(disabledAketiRecordModes).length === 0) {
              delete (card as any).data.disabledAketiRecordModesUntilOwnStart;
            }
          }
          if ((card as any).data?.forcedAttackTurn !== undefined && (card as any).data.forcedAttackTurn < gameState.turnCount) {
            delete (card as any).data.forcedAttackTurn;
            delete (card as any).data.forcedAttackSourceName;
          }
          if ((card as any).data?.cannotAttackThisTurn !== undefined && (card as any).data.cannotAttackThisTurn < gameState.turnCount) {
            delete (card as any).data.cannotAttackThisTurn;
            delete (card as any).data.cannotAttackThisTurnSourceName;
          }
          if ((card as any).data?.canAttackAnyUnitUntilTurn !== undefined && (card as any).data.canAttackAnyUnitUntilTurn < gameState.turnCount) {
            delete (card as any).data.canAttackAnyUnit;
            delete (card as any).data.canAttackAnyUnitUntilTurn;
            delete (card as any).data.canAttackAnyUnitSourceName;
            delete (card as any).data.canAttackAnyUnitConsumeOnAttack;
          }
          if ((card as any).data?.cannotAttackOrDefendUntilTurn !== undefined && (card as any).data.cannotAttackOrDefendUntilTurn < gameState.turnCount) {
            delete (card as any).data.cannotAttackOrDefendUntilTurn;
            delete (card as any).data.cannotAttackOrDefendSourceName;
          }
          if ((card as any).data?.cannotExhaustUntilTurn !== undefined && (card as any).data.cannotExhaustUntilTurn < gameState.turnCount) {
            delete (card as any).data.cannotExhaustUntilTurn;
            delete (card as any).data.cannotExhaustSourceName;
          }
          if ((card as any).data?.cannotActivateUntilTurn !== undefined && (card as any).data.cannotActivateUntilTurn < gameState.turnCount) {
            delete (card as any).data.cannotActivateUntilTurn;
            delete (card as any).data.cannotActivateSourceName;
          }
          if ((card as any).data?.preventNextDestroyUntilTurn !== undefined && (card as any).data.preventNextDestroyUntilTurn < gameState.turnCount) {
            delete (card as any).data.preventNextDestroy;
            delete (card as any).data.preventNextDestroySourceName;
            delete (card as any).data.preventNextDestroyUntilTurn;
          }
          if ((card as any).data?.preventNextBattleDestroyUntilTurn !== undefined && (card as any).data.preventNextBattleDestroyUntilTurn < gameState.turnCount) {
            delete (card as any).data.preventNextBattleDestroy;
            delete (card as any).data.preventNextBattleDestroySourceName;
            delete (card as any).data.preventNextBattleDestroyUntilTurn;
          }
          if ((card as any).data?.preventBattleDestroyForBattleTurn !== undefined && (card as any).data.preventBattleDestroyForBattleTurn < gameState.turnCount) {
            delete (card as any).data.preventBattleDestroyForBattleId;
            delete (card as any).data.preventBattleDestroyForBattleTurn;
            delete (card as any).data.preventBattleDestroyForBattleSourceName;
          }
          if ((card as any).data?.forbiddenAlchemyBanishTurn !== undefined && (card as any).data.forbiddenAlchemyBanishTurn < gameState.turnCount) {
            delete (card as any).data.forbiddenAlchemyBanishTurn;
            delete (card as any).data.forbiddenAlchemySourceName;
            delete (card as any).data.forbiddenAlchemyWillExileAtEndOfTurn;
          }
          const endOfTurnPowerBuffs = (card as any).data?.endOfTurnTempPowerBuffs;
          if (Array.isArray(endOfTurnPowerBuffs) && endOfTurnPowerBuffs.length > 0) {
            const expired = endOfTurnPowerBuffs.filter((buff: any) => buff.turn < gameState.turnCount);
            const remaining = endOfTurnPowerBuffs.filter((buff: any) => buff.turn >= gameState.turnCount);
            const expiredAmount = expired.reduce((sum: number, buff: any) => sum + Number(buff.amount || 0), 0);
            if (expiredAmount !== 0) {
              card.temporaryPowerBuff = (card.temporaryPowerBuff || 0) - expiredAmount;
              const details = card.temporaryBuffDetails?.power || [];
              expired.forEach((buff: any) => {
                const index = details.findIndex((detail: any) =>
                  detail.sourceCardName === buff.sourceCardName &&
                  Number(detail.value || 0) === Number(buff.amount || 0)
                );
                if (index !== -1) details.splice(index, 1);
              });
              card.temporaryBuffDetails = { ...(card.temporaryBuffDetails || {}), power: details };
            }
            if (remaining.length > 0) {
              (card as any).data.endOfTurnTempPowerBuffs = remaining;
            } else {
              delete (card as any).data.endOfTurnTempPowerBuffs;
            }
          }
        });

        p.unitZone.forEach(u => {
          if (u) {
            u.hasAttackedThisTurn = false;
            u.usedShenyiThisTurn = false;
            u.inAllianceGroup = false;

            // Reset Temporary Buffs
            u.temporaryPowerBuff = 0;
            u.temporaryDamageBuff = 0;
            u.temporaryRush = false;
            u.temporaryAnnihilation = false;
            u.temporaryHeroic = false;
            u.temporaryCanAttackAny = false;
            delete (u as any).temporaryExtraColors;
            u.temporaryBuffSources = {};
            u.temporaryBuffDetails = {};
            u.isrush = u.baseIsrush;
            u.isAnnihilation = u.baseAnnihilation || false;
            u.isHeroic = u.baseHeroic || false;
            u.isShenyi = u.baseShenyi || false;
            if ((u as any).data?.tempShenyiUntilTurn !== undefined && (u as any).data.tempShenyiUntilTurn < gameState.turnCount) {
              delete (u as any).data.tempShenyiUntilTurn;
              delete (u as any).data.tempShenyiSourceName;
            }
            u.power = u.basePower;
            u.damage = u.baseDamage;
          }
        });
      });

      // 3. Recalculate stats after any moves during resolutions
      EventEngine.recalculateContinuousEffects(gameState);

      // 4. Start the next phase
      await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', playerUid: nextPlayerId, data: { phase: 'START' } });
      if (gameState.pendingQuery || gameState.phase !== 'START') return;
      await ServerGameService.executeStartPhase(gameState, nextPlayer);

    } catch (err: any) {
      gameState.logs.push(`[鑷村懡閿欒] 鍥炲悎鍒囨崲杩囩▼宕╂簝: ${err.message}`);
      // Ensure we don't block the server response despite the crash
      if (gameState.phase === 'DECLARE_END') {
        gameState.phase = 'START';
      }
    }
  },

  checkWinConditions(gameState: GameState): boolean {
    if (gameState.gameStatus === 2) return true; // Already over

    for (const player of Object.values(gameState.players)) {
      // 3. There are 10 cards on the back of the erosion area
      const erosionBackCount = player.erosionBack.filter(c => c !== null).length;
      if (erosionBackCount >= 10) {
        gameState.gameStatus = 2;
        gameState.winReason = 'EROSION_BACK_FULL';
        gameState.winnerId = gameState.playerIds.find(id => id !== player.uid);
        gameState.logs.push(`[游戏结束] ${player.displayName} 的侵蚀区背面达到 10 张，判负。`);
        return true;
      }
    }
    return false;
  },

  checkBattleInterruption(gameState: GameState) {
    if (!gameState.battleState) return false;

    let contextPhase = gameState.phase;
    if (gameState.phase === 'COUNTERING' || gameState.phase === 'SHENYI_CHOICE') {
      contextPhase = gameState.previousPhase || gameState.phase;
    }

    const preDamageBattlePhases: GamePhase[] = ['BATTLE_DECLARATION', 'DEFENSE_DECLARATION', 'BATTLE_FREE'];
    if (!preDamageBattlePhases.includes(contextPhase)) return false;

    const turnPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
    const opponentId = gameState.playerIds[gameState.currentTurnPlayer === 0 ? 1 : 0];

    const turnPlayer = gameState.players[turnPlayerId];
    const opponent = gameState.players[opponentId];

    let defenderGone = false;
    if (gameState.battleState.defender) {
      const defenderFound = opponent.unitZone.some(c => c && c.gamecardId === gameState.battleState!.defender);
      if (!defenderFound) {
        defenderGone = true;
      }
    }

    if (gameState.battleState.unitTargetId) {
      const explicitFound = opponent.unitZone.some(c => c && c.gamecardId === gameState.battleState!.unitTargetId);
      if (!explicitFound) {
        defenderGone = true;
      }
    }

    // Verify attackers exist in their respective owner's zones
    const attackersFound = gameState.battleState.attackers.filter(id => {
      // Check both players since turn order might have shifted or an out-of-turn attack could occur
      return Object.values(gameState.players).some(p => p.unitZone.some(c => c && c.gamecardId === id));
    });

    const allAttackersGone = attackersFound.length === 0;

    if (defenderGone || allAttackersGone) {
      gameState.logs.push(`[战斗中止] ${defenderGone ? '防御/目标单位' : '所有攻击单位'} 已离开字段，战斗中止。`);
      const interruptedBattle = gameState.battleState;
      const interruptedAttackers = [...(interruptedBattle.attackers || [])];

      const inConfrontation = gameState.isResolvingStack || (gameState.counterStack && gameState.counterStack.length > 0) || gameState.isCountering > 0;
      ServerGameService.clearBattleCombatMarkers(gameState, interruptedAttackers);

      if (inConfrontation) {
        if (gameState.phase === 'COUNTERING') {
          gameState.previousPhase = 'MAIN';
        } else {
          gameState.phase = 'MAIN';
        }
        if (gameState.counterStack) {
          gameState.counterStack.forEach(item => {
            if (item.type === 'PHASE_END') {
              item.nextPhase = 'MAIN';
            }
          });
        }
      } else {
        gameState.phase = 'MAIN';
        if (gameState.previousPhase && preDamageBattlePhases.includes(gameState.previousPhase)) {
          gameState.previousPhase = undefined;
        }
        gameState.phaseTimerStart = Date.now();
      }

      gameState.battleState = undefined;
      EventEngine.dispatchEvent(gameState, {
        type: 'BATTLE_ENDED',
        playerUid: turnPlayerId,
        data: {
          attackerIds: attackersFound,
          defenderId: interruptedBattle.defender,
          isAlliance: !!interruptedBattle.isAlliance,
          interrupted: true
        }
      });
      EventEngine.dispatchEvent(gameState, { type: 'PHASE_CHANGED', data: { phase: 'MAIN', reason: 'BATTLE_INTERRUPTED' } });
      return true;
    } else if (gameState.battleState.attackers.length !== attackersFound.length) {
      gameState.logs.push(`[战斗继续] 其中一个攻击单位已离开，剩余单位继续攻击。`);
      gameState.battleState.attackers = attackersFound;
    }
    return false;
  },

  async executeTriggeredEffect(
    gameState: GameState,
    playerUid: string,
    trigger: { card: Card; effect: CardEffect; effectIndex: number; event?: any; skipCost?: boolean; declaredTargets?: DeclaredEffectTarget[]; declaredModeId?: string },
    onUpdate?: (state: GameState) => Promise<void>
  ) {
    ServerGameService.hydrateVirtualTriggerRecord(trigger);
    const { card, effectIndex, event, skipCost, declaredTargets, declaredModeId } = trigger;
    const effect = trigger.effect || card.effects?.[effectIndex];
    let liveSource = ServerGameService.findCardLocation(gameState, card.gamecardId);
    if (!liveSource && event?.sourceCardId === card.gamecardId) {
      liveSource = ServerGameService.findCardLocation(gameState, event.data?.previousSourceCardId);
    }
    if (!liveSource && effectIndex < 0) {
      liveSource = { card, ownerUid: playerUid, zone: card.cardlocation || 'PLAY' };
    }

    if (!effect || !liveSource) {
      await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      return;
    }
    const liveCard = liveSource.card;

    const triggerLocation = (event?.type === 'REVEAL_DECK' && effect.triggerLocation?.includes('DECK'))
      ? 'DECK'
      : (event?.type === 'CARD_LEFT_FIELD' && effect.sourceSnapshotOnLeftField === true && event.data?.sourceZone)
        ? event.data.sourceZone as TriggerLocation
        : liveCard.cardlocation as TriggerLocation;
    const movementTriggerEvents = new Set(['CARD_ENTERED_ZONE', 'CARD_LEFT_ZONE', 'CARD_LEFT_FIELD', 'CARD_EXILED', 'CARD_DESTROYED_BATTLE', 'CARD_DESTROYED_EFFECT']);
    if (effectIndex >= 0 && !skipCost && !movementTriggerEvents.has(event?.type)) {
      const triggerCheck = ServerGameService.checkEffectLimitsAndReqs(gameState, playerUid, liveCard, effect, triggerLocation, event);
      if (!triggerCheck.valid) {
        await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
        return;
      }
    }

    if (ServerGameService.hasPreselectTargetSpec(effect) && !declaredTargets) {
      const opened = ServerGameService.createDeclareTargetQuery(gameState, playerUid, liveCard, effect, effectIndex, {
        pendingAction: 'TRIGGER_EFFECT',
        effectIndex,
        effectId: effect.id,
        event,
        queuedEffect: trigger.effect
      });
      if (!opened) {
        await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      }
      return;
    }

    // 1. Cost check (If needed and not skipped)
    if (effect.cost && !skipCost) {
      const player = gameState.players[playerUid];
      const costResult = await (effect.cost as any)(gameState, player, liveCard, {
        declaredTargets,
        declaredModeId
      });

      if (gameState.pendingQuery) {
        // If query triggered by cost, we must wait
        gameState.pendingQuery.callbackKey = 'ACTIVATE_COST_RESOLVE';
        gameState.pendingQuery.context = {
          ...gameState.pendingQuery.context,
          sourceCardId: liveCard.gamecardId,
          effectIndex: effectIndex,
          isTrigger: true, // IMPORTANT: mark as trigger to avoid countering after cost
          event,
          declaredTargets,
          declaredModeId
        };
        return;
      }

      if (!costResult) {
        // Cost failed, proceed to next trigger
        await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
        return;
      }
    }

    // 2. Record usage
    ServerGameService.recordEffectUsage(gameState, playerUid, liveCard, effect);
    addBattleLog(gameState, {
      category: 'TRIGGERED_EFFECT',
      actorUid: playerUid,
      actorName: gameState.players[playerUid]?.displayName,
      sourceCard: cardToBattleLogRef(gameState, liveCard, playerUid, triggerLocation),
      text: `【诱发效果】[${liveCard.fullName}]发动了[${effect.description}]。`,
      metadata: { effectIndex, effectId: effect.id, effectDescription: effect.description }
    });

    // 3. Highlight for UI
    gameState.currentProcessingItem = {
      type: 'EFFECT',
      card: liveCard,
      ownerUid: playerUid,
      effectIndex,
      declaredTargets,
      declaredModeId,
      timestamp: Date.now(),
      data: { event, isTriggeredEffect: true }
    };
    if (onUpdate) await onUpdate(gameState);

    // Record faction used
    const player = gameState.players[playerUid];
    if (liveCard.faction && player) {
      if (!player.factionsUsedThisTurn) player.factionsUsedThisTurn = [];
      if (!player.factionsUsedThisTurn.includes(liveCard.faction)) {
        player.factionsUsedThisTurn.push(liveCard.faction);
      }
    }

    // 4. Atomic Effects
    const executed = await ServerGameService.executeWithDeclaredTargets(
      gameState,
      playerUid,
      liveCard,
      effect,
      gameState.players[playerUid],
      declaredTargets,
      event
    );
    if (!executed) {
      ServerGameService.clearDeclaredTargetMarkers(gameState, declaredTargets);
      gameState.currentProcessingItem = null;
      if (!gameState.pendingQuery) {
        await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
      }
      return;
    }
    ServerGameService.clearDeclaredTargetMarkers(gameState, declaredTargets);

    ServerGameService.normalizeForcedGuardBattleState(gameState);
    EventEngine.recalculateContinuousEffects(gameState);

    // 6. Dispatch Event
    EventEngine.dispatchEvent(gameState, {
      type: 'EFFECT_ACTIVATED',
      playerUid,
      sourceCardId: liveCard.gamecardId
    });

    if (!gameState.pendingQuery) {
      addBattleLog(gameState, {
        category: 'TRIGGERED_EFFECT',
        actorUid: playerUid,
        actorName: gameState.players[playerUid]?.displayName,
        sourceCard: cardToBattleLogRef(gameState, liveCard, playerUid, liveCard.cardlocation),
        text: '诱发效果结算完成。',
        metadata: { effectIndex, effectId: effect.id }
      });
      await ServerGameService.waitForVisualDelay(gameState, ServerGameService.getTriggerVisualDelayMs());
    }

    // 7. Cleanup highlight
    gameState.currentProcessingItem = null;
    if (onUpdate) await onUpdate(gameState);

    // 8. Resolve persistence
    if (effect.resolve) {
      gameState.pendingResolutions.push({
        card: liveCard,
        effect,
        effectIndex,
        playerUid
      });
    }

    // 9. Continue trigger queue if no new query was opened
    if (!gameState.pendingQuery) {
      await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
    } else {
      ServerGameService.markBattleEndAfterPendingQuery(gameState, playerUid);
    }
  },

  async advancePhase(gameState: GameState, action?: string, playerId?: string, onUpdate?: (state: GameState) => Promise<void>) {
    if (gameState.pendingQuery || gameState.isResolvingStack || gameState.currentProcessingItem) {
      throw new Error('当前有未结算阶段，请等待处理完毕。');
    }

    // Identity of the player performing the action
    const actingPlayerId = playerId || gameState.playerIds[gameState.currentTurnPlayer];
    const actingPlayer = gameState.players[actingPlayerId];

    // Identity of the current turn player (for phase transitions)
    const turnPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
    const turnPlayer = gameState.players[turnPlayerId];

    const now = Date.now();
    const elapsed = now - (gameState.phaseTimerStart || now);
    const sharedPhases: GamePhase[] = ['MAIN', 'BATTLE_DECLARATION', 'DEFENSE_DECLARATION', 'BATTLE_FREE'];
    const isWaiting = (gameState.counterStack && gameState.counterStack.length > 0) ||
      (gameState.battleState && gameState.battleState.askConfront) ||
      gameState.isResolvingStack ||
      gameState.currentProcessingItem ||
      gameState.pendingQuery;

    if (sharedPhases.includes(gameState.phase) && !isWaiting) {
      ServerGameService.chargeTimer(
        gameState,
        ServerGameService.getTimedPlayerForSharedPhase(gameState, actingPlayerId),
        elapsed
      );
    }
    gameState.phaseTimerStart = now;

    switch (gameState.phase) {
      case 'INIT':
      case 'MULLIGAN':
        gameState.phase = 'START';
        gameState.turnCount = 1;
        gameState.logs.push(`[阶段切换] 进入开始阶段`);
        await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', data: { phase: 'START' } }, onUpdate);
        if (gameState.pendingQuery || gameState.phase !== 'START') return gameState;
        await ServerGameService.executeStartPhase(gameState, turnPlayer, onUpdate);
        break;
      case 'START':
        gameState.phase = 'DRAW';
        gameState.logs.push(`[阶段切换] 进入抽牌阶段`);
        EventEngine.dispatchEvent(gameState, { type: 'PHASE_CHANGED', data: { phase: 'DRAW' } });
        await ServerGameService.executeDrawPhase(gameState, turnPlayer, onUpdate);
        break;
      case 'DRAW':
        gameState.phase = 'EROSION';
        gameState.logs.push(`[阶段切换] 进入侵蚀阶段`);
        EventEngine.dispatchEvent(gameState, { type: 'PHASE_CHANGED', data: { phase: 'EROSION' } });
        await ServerGameService.executeErosionPhase(gameState, turnPlayer);
        break;
      case 'EROSION':
        // Handled by handleErosionChoice
        break;
      case 'MAIN':
        if ((action === 'DECLARE_END' || action === 'DISCARD') && ServerGameService.getForcedAttackUnit(gameState, actingPlayerId)) {
          const forcedAttackUnit = ServerGameService.getForcedAttackUnit(gameState, actingPlayerId)!;
          throw new Error(`必须先用 [${forcedAttackUnit.fullName}] 宣告攻击`);
        }
        if (action === 'DECLARE_BATTLE' || action === 'BATTLE_DECLARATION') {
          if (gameState.turnCount === 1) {
            throw new Error('先手玩家第一回合不能进入战斗阶段');
          }
          if (action === 'BATTLE_DECLARATION' || action === 'DECLARE_BATTLE') {
            gameState.phase = 'BATTLE_DECLARATION';
            await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', data: { phase: 'BATTLE_DECLARATION' } }, onUpdate);
            gameState.logs.push(`[阶段切换] ${actingPlayer.displayName} 进入战斗阶段`);
            if (gameState.pendingQuery || gameState.phase !== 'BATTLE_DECLARATION') return gameState;
          } else {
            gameState.logs.push(`[对抗请求] ${actingPlayer.displayName} 请求进入战斗阶段`);
            ServerGameService.enterCountering(gameState, actingPlayerId, {
              ownerUid: actingPlayerId,
              type: 'PHASE_END',
              nextPhase: 'BATTLE_DECLARATION',
              timestamp: Date.now()
            });
          }
        } else if (action === 'DECLARE_END' || action === 'DISCARD') {
          if (action === 'DISCARD') {
            gameState.logs.push(`[阶段切换] 进入弃牌阶段`);
            await ServerGameService.executeEndPhase(gameState, actingPlayer, false, onUpdate);
          } else {
            gameState.logs.push(`[对抗请求] ${actingPlayer.displayName} 请求结束回合`);
            ServerGameService.enterCountering(gameState, actingPlayerId, {
              ownerUid: actingPlayerId,
              type: 'PHASE_END',
              nextPhase: 'DISCARD', // Transition to discard/end
              timestamp: Date.now()
            });
          }
        }
        break;
      case 'BATTLE_DECLARATION':
        if ((action === 'RETURN_MAIN' || action === 'MAIN' || action === 'DECLARE_END' || action === 'DISCARD') && ServerGameService.getForcedAttackUnit(gameState, actingPlayerId)) {
          const forcedAttackUnit = ServerGameService.getForcedAttackUnit(gameState, actingPlayerId)!;
          throw new Error(`必须先用 [${forcedAttackUnit.fullName}] 宣告攻击`);
        }
        if (action === 'DECLARE_END' || action === 'DISCARD') {
          if (action === 'DISCARD') {
            gameState.logs.push(`[阶段切换] 进入弃牌阶段`);
            await ServerGameService.executeEndPhase(gameState, actingPlayer, false, onUpdate);
          } else {
            gameState.logs.push(`[对抗请求] ${actingPlayer.displayName} 请求结束回合`);
            ServerGameService.enterCountering(gameState, actingPlayerId, {
              ownerUid: actingPlayerId,
              type: 'PHASE_END',
              nextPhase: 'DISCARD',
              timestamp: Date.now()
            });
          }
        } else if (action === 'RETURN_MAIN' || action === 'MAIN') {
          if (action === 'MAIN' || action === 'RETURN_MAIN') {
            gameState.phase = 'MAIN';
            await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', data: { phase: 'MAIN', reason: 'RETURN_MAIN' } }, onUpdate);
            gameState.logs.push(`[阶段切换] ${actingPlayer.displayName} 返回主要阶段`);
            if (gameState.pendingQuery || gameState.phase !== 'MAIN') return gameState;
          } else {
            gameState.logs.push(`[对抗请求] ${actingPlayer.displayName} 请求返回主要阶段`);
            ServerGameService.enterCountering(gameState, actingPlayerId, {
              ownerUid: actingPlayerId,
              type: 'PHASE_END',
              nextPhase: 'MAIN',
              timestamp: Date.now()
            });
          }
        }
        break;
      case 'BATTLE_FREE':
        if (!gameState.battleState) {
          gameState.phase = 'MAIN';
          gameState.logs.push(`[阶段切换] 战斗状态缺失，返回主要阶段`);
          return gameState;
        }

        if (action === 'PROPOSE_DAMAGE_CALCULATION' || action === 'DAMAGE_CALCULATION') {
          if (action === 'DAMAGE_CALCULATION') {
            if (ServerGameService.checkBattleInterruption(gameState)) {
              await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
              return gameState;
            }
            gameState.phase = 'DAMAGE_CALCULATION';
            gameState.logs.push(`[阶段切换] 进入伤害计算阶段`);
            await ServerGameService.resolveDamage(gameState);
          } else {
            // Use the standard countering system for ending the battle free phase
            ServerGameService.enterCountering(gameState, actingPlayerId, {
              ownerUid: actingPlayerId,
              type: 'PHASE_END',
              nextPhase: 'DAMAGE_CALCULATION',
              timestamp: Date.now()
            });
          }
        } else if (action === 'DECLINE_CONFRONTATION') {
          if (!gameState.battleState.askConfront) return gameState;
          const turnPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
          const opponentId = gameState.playerIds.find(uid => uid !== turnPlayerId);
          const expectedPlayerId = gameState.battleState.askConfront === 'ASKING_OPPONENT'
            ? opponentId
            : turnPlayerId;
          if (expectedPlayerId && actingPlayerId !== expectedPlayerId) return gameState;

          if (gameState.battleState.askConfront === 'ASKING_OPPONENT') {
            gameState.logs.push(`${actingPlayer.displayName} 选择不进行战斗自由对抗。`);
            gameState.battleState.askConfront = 'ASKING_TURN_PLAYER';
          } else {
            gameState.logs.push(`${actingPlayer.displayName} 选择不继续战斗自由对抗。`);
            delete gameState.battleState.askConfront;
            if (ServerGameService.checkBattleInterruption(gameState)) {
              await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
              return gameState;
            }
            gameState.phase = 'DAMAGE_CALCULATION';
            gameState.phaseTimerStart = Date.now();
            gameState.logs.push(`[阶段切换] 双方均不进行对抗，进入伤害计算阶段`);
            await ServerGameService.resolveDamage(gameState);
          }
        } else if (action === 'RETURN_MAIN') {
          gameState.phase = 'MAIN';
          ServerGameService.clearBattleCombatMarkers(gameState, gameState.battleState?.attackers);
          gameState.battleState = undefined;
          await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', data: { phase: 'MAIN', reason: 'RETURN_MAIN' } }, onUpdate);
          gameState.logs.push(`[阶段切换] 战斗中止，返回主要阶段`);
          if (gameState.pendingQuery || gameState.phase !== 'MAIN') return gameState;
        }
        break;
      case 'BATTLE_END':
        gameState.phase = 'MAIN';
        await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', data: { phase: 'MAIN' } }, onUpdate);
        ServerGameService.clearBattleCombatMarkers(gameState, gameState.battleState?.attackers);
        gameState.battleState = undefined;
        gameState.logs.push(`[阶段切换] 战斗结束，返回主要阶段`);
        break;
      case 'DISCARD':
        // Handled by discardCard
        break;
      case 'END':
        // This case is now handled automatically in DECLARE_END
        break;
      case 'SHENYI_CHOICE':
        if (action === 'CONFIRM_SHENYI') {
          const cardIds = gameState.pendingShenyi?.cardIds || [];
          const player = gameState.players[actingPlayerId];
          cardIds.forEach(cid => {
            const unit = player.unitZone.find(u => u?.gamecardId === cid);
            if (unit) {
              ServerGameService.readyCard(unit);
              unit.usedShenyiThisTurn = true;
            }
          });
          gameState.logs.push(`【神依】效果已触发`);
        } else if (action === 'DECLINE_SHENYI') {
          const cardIds = gameState.pendingShenyi?.cardIds || [];
          const player = gameState.players[actingPlayerId];
          cardIds.forEach(cid => {
            const unit = player.unitZone.find(u => u?.gamecardId === cid);
            if (unit) unit.usedShenyiThisTurn = true;
          });
          gameState.logs.push(`已跳过【神依】触发`);
        }

        gameState.phase = gameState.previousPhase || 'MAIN';
        gameState.previousPhase = undefined;
        gameState.pendingShenyi = undefined;
        gameState.priorityPlayerId = undefined;
        gameState.phaseTimerStart = Date.now();
        break;
    }

    return gameState;
  },

  async executeStartPhase(gameState: GameState, player: PlayerState, onUpdate?: (state: GameState) => Promise<void>) {
    // console.log(`[ServerGameService] executeStartPhase for ${player.displayName}`);

    // Update public hand duration
    Object.values(gameState.players).forEach(p => {
      if (p.isHandPublic !== undefined && p.isHandPublic > 0) {
        p.isHandPublic -= 1;
        if (p.isHandPublic === 0) {
          gameState.logs.push(`${p.displayName} 的手牌已恢复私密状态`);
        }
      }

      p.negatedNames = [];

      // Reset target protection and effect negation
      [...p.deck, ...p.hand, ...p.grave, ...p.exile, ...p.unitZone, ...p.itemZone, ...p.erosionFront, ...p.erosionBack, ...p.playZone].forEach(c => {
        if (c) {
          c.nextEffectProtection = false;
          c.silencedEffectIds = [];
          c.temporaryCanActivateEffect = undefined;
          c.temporaryImmuneToUnitEffects = undefined;
          if ((c as any).data?.clearMirrorActiveTurn !== undefined) {
            delete (c as any).data.clearMirrorActiveTurn;
          }
          if ((c as any).data?.fullEffectSilencedTurn !== undefined && (c as any).data.fullEffectSilencedTurn < gameState.turnCount) {
            delete (c as any).data.fullEffectSilencedTurn;
            delete (c as any).data.fullEffectSilenceSource;
            delete (c as any).data.fullEffectSilencedZones;
          }
          if ((c as any).data?.fullEffectSilencedUntilOwnStartUid === player.uid) {
            delete (c as any).data.fullEffectSilencedUntilOwnStartUid;
            delete (c as any).data.fullEffectSilenceSource;
          }
          if ((c as any).data?.ohEffectDisabledUntilOwnStartUid === player.uid) {
            delete (c as any).data.ohEffectDisabledUntilOwnStartUid;
          }
          if ((c as any).data?.combatImmuneUntilOwnNextTurnStartUid === player.uid) {
            delete (c as any).data.combatImmuneUntilOwnNextTurnStartUid;
            delete (c as any).data.combatImmuneSourceName;
          }
          if ((c as any).data?.tradeEffectDisabledUntilOwnStartUid === player.uid) {
            delete (c as any).data.tradeEffectDisabledUntilOwnStartUid;
          }
          const disabledAketiRecordModes = (c as any).data?.disabledAketiRecordModesUntilOwnStart;
          if (disabledAketiRecordModes) {
            Object.keys(disabledAketiRecordModes).forEach(mode => {
              if (disabledAketiRecordModes[mode] === player.uid) {
                delete disabledAketiRecordModes[mode];
              }
            });
            if (Object.keys(disabledAketiRecordModes).length === 0) {
              delete (c as any).data.disabledAketiRecordModesUntilOwnStart;
            }
          }
        }
      });
    });

    player.timeRemaining = (gameState.turnTimerLimit ? gameState.turnTimerLimit * 1000 : GAME_TIMEOUTS.MAIN_PHASE_TOTAL);
    const shouldSkipOwnStartReady = (card: Card | null) =>
      !!card && !!card.effects?.some(effect =>
        effect.type === 'CONTINUOUS' &&
        effect.content === 'SKIP_OWN_START_READY' &&
        (!effect.condition || effect.condition(gameState, player, card))
      );

    const unitsToReset = player.unitZone.filter(card =>
      card && card.isExhausted && (card.canResetCount === 0 || card.canResetCount === undefined)
    );
    const itemsToReset = player.itemZone.filter(card =>
      card &&
      card.isExhausted &&
      (card.canResetCount === 0 || card.canResetCount === undefined) &&
      !shouldSkipOwnStartReady(card)
    );

    // Check if any unit/item has a freeze counter that needs aging
    const unitsToAge = player.unitZone.filter(card =>
      card && card.canResetCount !== undefined && card.canResetCount > 0
    );
    const itemsToAge = player.itemZone.filter(card =>
      card && card.canResetCount !== undefined && card.canResetCount > 0
    );

    if (unitsToReset.length === 0 && itemsToReset.length === 0 && unitsToAge.length === 0 && itemsToAge.length === 0) {
      gameState.logs.push(`${player.displayName} 没有可调度的单位，直接进入抽牌阶段。`);
    } else {
      player.unitZone.forEach(card => {
        if (card) {
          card.temporaryPowerBuff = 0;
          if (card.canResetCount === 0 || card.canResetCount === undefined) {
            ServerGameService.readyCard(card);
          } else if (card && card.canResetCount !== undefined && card.canResetCount > 0) {
            card.canResetCount -= 1;
            if (card.canResetCount <= 0) {
              delete (card as any).data?.cannotResetSourceName;
            }
          }
        }
      });
      player.itemZone.forEach(card => {
        if (card && shouldSkipOwnStartReady(card)) {
          return;
        } else if (card && (card.canResetCount === 0 || card.canResetCount === undefined)) {
          ServerGameService.readyCard(card);
        } else if (card && card.canResetCount !== undefined && card.canResetCount > 0) {
          card.canResetCount -= 1;
          if (card.canResetCount <= 0) {
            delete (card as any).data?.cannotResetSourceName;
          }
        }
      });
      gameState.logs.push(`${player.displayName} 完成了调度。`);
    }

    player.hasExhaustedThisTurn = [];
    player.hasUnitReturnedThisTurn = false;
    player.factionsUsedThisTurn = [];
    player.factionLock = undefined;

    // Automatically move to DRAW phase
    gameState.phase = 'DRAW';
    gameState.phaseTimerStart = Date.now();
    await ServerGameService.executeDrawPhase(gameState, player, onUpdate);
  },

  async completeDrawAnimationResume(gameState: GameState, player: PlayerState, onUpdate?: (state: GameState) => Promise<void>) {
    const resume = gameState.drawAnimationResume;
    if (!resume || resume.playerUid !== player.uid) return false;

    const pendingCardId = resume.cardId || resume.card?.gamecardId;
    const deckIndex = pendingCardId
      ? player.deck.findIndex(card => card.gamecardId === pendingCardId)
      : player.deck.length - 1;
    const card = deckIndex >= 0 ? player.deck.splice(deckIndex, 1)[0] : undefined;

    if (!card) {
      delete gameState.drawAnimationResume;
      delete gameState.animationHint;
      delete gameState.animationUntil;
      gameState.logs.push(`[抽卡异常] ${player.displayName} 的待抽卡牌已不在卡组中。`);
      return false;
    }

    card.cardlocation = 'HAND';
    player.hand.push(card);
    gameState.logs.push(`${player.displayName} 抽了一张卡`);
    EventEngine.dispatchEvent(gameState, {
      type: 'CARD_DRAWN',
      playerUid: player.uid,
      data: { cardId: card.gamecardId }
    });
    await ServerGameService.checkTriggeredEffects(gameState, onUpdate);

    delete gameState.drawAnimationResume;
    delete gameState.animationUntil;
    if (gameState.pendingQuery) {
      return true;
    }
    gameState.phase = 'EROSION';
    await ServerGameService.executeErosionPhase(gameState, player);
    delete gameState.animationHint;
    return true;
  },

  async executeDrawPhase(gameState: GameState, player: PlayerState, onUpdate?: (state: GameState) => Promise<void>) {
    if (player.skipDrawPhase) {
      player.skipDrawPhase = false;
      gameState.logs.push(`${player.displayName} 的抽牌阶段被跳过了。`);
      gameState.phase = 'EROSION';
      await ServerGameService.executeErosionPhase(gameState, player);
      return;
    }

    gameState.logs.push(`${player.displayName} 的抽牌阶段`);


    // First player on first turn does not draw
    if (gameState.turnCount === 1) {
      gameState.logs.push('先手玩家第一回合不抽牌');
      gameState.phase = 'EROSION';
      await ServerGameService.executeErosionPhase(gameState, player);
      return;
    }

    const skipDrawReplacementOnce = (player as any).skipDrawReplacementOnce === gameState.turnCount;
    if (skipDrawReplacementOnce) {
      delete (player as any).skipDrawReplacementOnce;
    }

    const drawReplacementCard = skipDrawReplacementOnce ? undefined : player.unitZone.find(card =>
      card?.effects?.some(effect =>
        effect.type === 'CONTINUOUS' &&
        effect.content === 'DRAW_REPLACEMENT_GRAVE_BOTTOM' &&
        (!effect.condition || effect.condition(gameState, player, card))
      )
    );
    if (drawReplacementCard && player.grave.length >= 2) {
      const choiceContext = { sourceCardId: drawReplacementCard.gamecardId };
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CHOICE',
        playerUid: player.uid,
        options: standardizeChoiceOptions(gameState, [
          { id: 'YES', label: '发动(YES)' },
          { id: 'NO', label: '通常抽卡(NO)' }
        ], choiceContext),
        title: '通常抽卡替代',
        description: `是否发动 [${drawReplacementCard.fullName}] 的效果，选择墓地中的2张卡放置到卡组底，代替通常抽卡？`,
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'DRAW_REPLACEMENT_CHOICE',
        context: choiceContext
      };
      return;
    }

    const selected = ServerGameService.chooseHardAiDrawCard(gameState, player.uid, {
      source: 'DRAW_PHASE',
      drawIndex: 0,
      drawCount: 1,
    });
    const drawnCard = selected || player.deck[player.deck.length - 1];
    if (!drawnCard) {
      // 1. During the card drawing stage, there are no cards available for drawing
      gameState.logs.push(`[游戏结束] ${player.displayName} 在抽牌阶段卡组已空，判负。`);
      gameState.gameStatus = 2;
      gameState.winReason = 'DECK_OUT_DRAW';
      gameState.winnerId = gameState.playerIds.find(id => id !== player.uid);
      return; // Stop processing further phases
    }

    if (!onUpdate || ServerGameService.shouldSkipVisualDelay(gameState)) {
      gameState.drawAnimationResume = {
        playerUid: player.uid,
        cardId: drawnCard.gamecardId,
        card: { ...drawnCard, cardlocation: 'HAND' },
        resumeAt: Date.now()
      };
      await ServerGameService.completeDrawAnimationResume(gameState, player, onUpdate);
      return;
    }

    gameState.animationUntil = Date.now() + 2000;
    gameState.animationHint = {
      id: `draw_${player.uid}_${drawnCard.gamecardId}_${Date.now()}`,
      type: 'DRAW_CARD',
      playerUid: player.uid,
      cardId: drawnCard.gamecardId,
      card: { ...drawnCard, cardlocation: 'HAND' },
      revealTo: 'owner',
      durationMs: 2000,
      createdAt: Date.now()
    };
    gameState.drawAnimationResume = {
      playerUid: player.uid,
      cardId: drawnCard.gamecardId,
      card: { ...drawnCard, cardlocation: 'HAND' },
      resumeAt: gameState.animationUntil
    };

    if (onUpdate) {
      await onUpdate(gameState);
    }
    if (gameState.pendingQuery) {
      return;
    }
    if (onUpdate) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await ServerGameService.completeDrawAnimationResume(gameState, player, onUpdate);
      return;
    } else {
      return;
    }
  },

  async executeErosionPhase(gameState: GameState, player: PlayerState) {
    // console.log(`[ServerGameService] executeErosionPhase for ${player.displayName}`);
    const handleableCards = player.erosionFront.filter(c => c !== null);
    // console.log(`[ServerGameService] Found ${handleableCards.length} cards in erosion front`);

    if (handleableCards.length === 0) {
      gameState.logs.push(`${player.displayName} 侵蚀区没有正面卡，跳过侵蚀阶段。`);
      await ServerGameService.proceedAfterErosion(gameState, player.uid);
      // console.log(`[ServerGameService] No face-up cards, auto-moving to MAIN phase`);
    } else {
      gameState.logs.push(`${player.displayName} 进入侵蚀阶段，请选择处理方式。`);
      // console.log(`[ServerGameService] Waiting for erosion choice`);
    }
  },

  async proceedAfterErosion(gameState: GameState, playerId: string, onUpdate?: (state: GameState) => Promise<void>) {
    const player = gameState.players[playerId];
    if (!player) return gameState;

    const enteredForcedAttack = await ServerGameService.enterForcedAttackBattleIfNeeded(gameState, playerId, onUpdate, 'FORCED_ATTACK_AFTER_EROSION');
    if (enteredForcedAttack) {
      return gameState;
    }

    gameState.phase = 'MAIN';
    gameState.phaseTimerStart = Date.now();
    gameState.logs.push(`${player.displayName} 进入主要阶段`);
    await ServerGameService.dispatchEventAndDrainTriggers(gameState, { type: 'PHASE_CHANGED', data: { phase: 'MAIN', reason: 'MAIN_PHASE_START' } }, onUpdate);
    return gameState;
  },


  async handleErosionChoice(gameState: GameState, playerId: string, choice: 'A' | 'C', selectedCardId?: string) {

    const player = gameState.players[playerId];
    if (gameState.phase !== 'EROSION' || !player.isTurn) throw new Error('Not in erosion phase or not your turn');
    if (choice !== 'A' && choice !== 'C') throw new Error('Invalid erosion choice');

    const handleableCards = player.erosionFront.filter(c => c !== null) as Card[];

    // Identify cards going to grave
    let goingToGrave: Card[] = [];
    if (choice === 'A') goingToGrave = [...handleableCards];
    else if (choice === 'C') goingToGrave = handleableCards.filter(c => c.gamecardId !== selectedCardId);

    // Check for EROSION_KEEP effects (104030455)
    const keepEffectCard = player.unitZone.find(c =>
      c && c.effects && c.effects.some(e =>
        e.erosionKeepReplacement &&
        (!e.condition || e.condition(gameState, player, c))
      )
    );

    if (keepEffectCard && goingToGrave.length > 0) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerId,
        options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerId, goingToGrave.map(c => ({ card: c, source: 'EROSION_FRONT' }))),
        title: '选择保留的侵蚀卡',
          description: `由于 [${keepEffectCard.fullName}] 的效果，你可以从即将移至墓地的卡牌中选择一张保留在侵蚀区。`,
        minSelections: 0,
        maxSelections: 1,
        callbackKey: 'EROSION_KEEP_RESOLVE',
        context: {
          choice,
          selectedCardId,
          keepCardSourceId: keepEffectCard.gamecardId
        }
      };
      return;
    }

    ServerGameService.executeErosionMovements(gameState, playerId, choice, selectedCardId);

    if ((gameState.phase as GamePhase) !== 'SHENYI_CHOICE') {
      await ServerGameService.proceedAfterErosion(gameState, playerId);
    } else {
      gameState.previousPhase = 'MAIN';
    }
    await ServerGameService.checkTriggeredEffects(gameState);
  },

  executeErosionMovements(gameState: GameState, playerId: string, choice: 'A' | 'C', selectedCardId?: string, keptCardId?: string) {
    const player = gameState.players[playerId];
    const handleableCards = player.erosionFront.filter(c => c !== null) as Card[];

    if (choice === 'A') {
      // a. Move all cards in the Erosion Zone to the Graveyard
      for (const card of handleableCards) {
        if (card.gamecardId === keptCardId) {
          gameState.logs.push(`[白夜效果] ${card.fullName} 被保留在侵蚀区。`);
          continue;
        }
        ServerGameService.moveCard(gameState, playerId, 'EROSION_FRONT', playerId, 'GRAVE', card.gamecardId);
      }
      gameState.logs.push(`${player.displayName} 将侵蚀区所有正面卡移至墓地。`);
    } else if (choice === 'C') {
      // c. Choose one to hand; others to Graveyard; then top card to Erosion Zone face-down
      if (!selectedCardId) throw new Error('Please select a card to add to hand');
      let addedCardName = '';
      for (const card of handleableCards) {
        if (card.gamecardId === selectedCardId) {
          addedCardName = card.fullName;
          ServerGameService.moveCard(gameState, playerId, 'EROSION_FRONT', playerId, 'HAND', card.gamecardId);
        } else if (card.gamecardId === keptCardId) {
            gameState.logs.push(`[白夜效果] ${card.fullName} 被保留在侵蚀区。`);
        } else {
          ServerGameService.moveCard(gameState, playerId, 'EROSION_FRONT', playerId, 'GRAVE', card.gamecardId);
        }
      }

      // Place top card of deck face-down in Erosion Zone
      let backCardName = '';
      if (player.deck.length > 0) {
        const topCard = player.deck.pop()!;
        backCardName = topCard.fullName;
        topCard.cardlocation = 'EROSION_BACK';
        topCard.displayState = 'FRONT_FACEDOWN';
        topCard.isExhausted = false;
        const emptyIndex = player.erosionBack.findIndex(c => c === null);
        if (emptyIndex !== -1) {
          player.erosionBack[emptyIndex] = topCard;
        } else {
          player.erosionBack.push(topCard);
        }
      }
      const backText = backCardName ? `并将 [${backCardName}] 从卡组顶放入侵蚀区背面。` : '但卡组没有卡可放入侵蚀区背面。';
      gameState.logs.push(`${player.displayName} 将正面侵蚀卡 [${addedCardName || selectedCardId}] 加入手牌，其余移至墓地，${backText}`);
    }
  },

  async executeEndPhase(gameState: GameState, player: PlayerState, skipEvents: boolean = false, onUpdate?: (state: GameState) => Promise<void>) {
    if (!skipEvents) {
      gameState.phase = 'END';
      gameState.logs.push(`${player.displayName} 的结束阶段`);

      player.unitZone.forEach(unit => {
        if (!unit || !(unit.isHeroic || unit.temporaryHeroic) || !unit.hasAttackedThisTurn || !unit.isExhausted) {
          return;
        }

        ServerGameService.readyCard(unit);
        gameState.logs.push(`【英勇】效果触发，${unit.fullName} 在回合结束时被重置。`);
      });

      // Dispatch TURN_END event to allow end-of-turn triggers to fire while it's still the player's turn
      EventEngine.dispatchEvent(gameState, {
        type: 'TURN_END' as any,
        playerUid: player.uid
      });
      ServerGameService.enqueueMandatoryEndTurnDelayedEffects(gameState, player.uid);

      // Check if any triggers were added to the queue
      if (gameState.triggeredEffectsQueue && gameState.triggeredEffectsQueue.length > 0) {
        await ServerGameService.checkTriggeredEffects(gameState, onUpdate);
        // If we now have a pending query, don't proceed to turn transition yet
        if (gameState.pendingQuery) return;
        if (gameState.phase !== 'END' || !gameState.players[player.uid]?.isTurn) return;
      }
    }

    player.factionLock = undefined;

    // This block is reachable either initially (if no triggers) or via resumption from checkTriggeredEffects
    if (player.hand.length > 6) {
      gameState.phase = 'DISCARD';
        gameState.logs.push(`${player.displayName} 手牌超过 6 张，请弃置卡牌。`);
    } else {
      player.markedUnitAttackTarget = undefined;
      await ServerGameService.finishTurnTransition(gameState);
    }
  },


  // Create a new game and wait for opponent
  async createGame(deck: Card[]) {
    // Auth check placeholder removed (always truthy in temp environment)

    const validation = ServerGameService.validateDeck(deck);
    if (!validation.valid) throw new Error(validation.error);

    const tempId = Math.random().toString(36).substring(7);
    const initializedDeck = deck.map(card => ({
      ...card,
      baseColorReq: card.baseColorReq ?? { ...(card.colorReq || {}) },
      basePower: card.basePower ?? card.power,
      baseDamage: card.baseDamage ?? card.damage,
      baseIsrush: card.baseIsrush ?? card.isrush,
      isAnnihilation: card.isAnnihilation,
      baseAnnihilation: card.baseAnnihilation ?? card.isAnnihilation,
      isShenyi: card.isShenyi,
      baseShenyi: card.baseShenyi ?? card.isShenyi,
      isHeroic: card.isHeroic,
      baseHeroic: card.baseHeroic ?? card.isHeroic,
      hasAttackedThisTurn: false,
      usedShenyiThisTurn: false,
      baseCanAttack: card.baseCanAttack ?? card.canAttack,
      baseGodMark: card.baseGodMark ?? card.godMark,
      baseAcValue: card.baseAcValue ?? card.acValue,
      baseCanActivateEffect: card.baseCanActivateEffect ?? card.canActivateEffect ?? true
    }));

    const initialPlayerState: PlayerState = {
      uid: ({ uid: "temp", displayName: "temp" } as any).uid,
      displayName: ({ uid: "temp", displayName: "temp" } as any).displayName || 'Player 1',
      deck: ServerGameService.assignGameCardIds(ServerGameService.shuffle([...initializedDeck])),
      hand: [],
      grave: [],
      exile: [],
      itemZone: [],
      erosionFront: [],
      erosionBack: [],
      unitZone: Array(6).fill(null),
      playZone: [],
      isTurn: false,
      isFirst: true,
      mulliganDone: false,
      hasExhaustedThisTurn: [],
      isHandPublic: 0,
      timeRemaining: GAME_TIMEOUTS.MAIN_PHASE_TOTAL,
      confrontationStrategy: 'AUTO',
    };

    // Initial Draw 4
    for (let i = 0; i < 4; i++) {
      const card = initialPlayerState.deck.pop();
      if (card) initialPlayerState.hand.push(card);
    }

    const gameState: GameState = {
      gameId: "temp", phase: 'INIT',
      currentTurnPlayer: 0,
      turnCount: 0,
      isCountering: 0,
      counterStack: [],
      passCount: 0,
      playerIds: [({ uid: "temp", displayName: "temp" } as any).uid, ''],
      gameStatus: 1,
      logs: ['游戏已创建。等待对手加入...'],
      players: {
        [({ uid: "temp", displayName: "temp" } as any).uid]: initialPlayerState
      },
      phaseTimerStart: 0,
      triggeredEffectsQueue: [],
      pendingResolutions: []
    };
    return gameState;
  },

  // Create a practice game with a bot
  async createPracticeGame(deck: Card[], botDifficulty: BotDifficulty = 'simple') {
    // Auth check placeholder removed (always truthy in temp environment)

    const validation = ServerGameService.validateDeck(deck);
    if (!validation.valid) throw new Error(validation.error);

    const initializedDeck = deck.map(card => ({
      ...card,
      baseColorReq: card.baseColorReq ?? { ...(card.colorReq || {}) },
      basePower: card.basePower ?? card.power,
      baseDamage: card.baseDamage ?? card.damage,
      baseIsrush: card.baseIsrush ?? card.isrush,
      isAnnihilation: card.isAnnihilation,
      baseAnnihilation: card.baseAnnihilation ?? card.isAnnihilation,
      isShenyi: card.isShenyi,
      baseShenyi: card.baseShenyi ?? card.isShenyi,
      isHeroic: card.isHeroic,
      baseHeroic: card.baseHeroic ?? card.isHeroic,
      hasAttackedThisTurn: false,
      usedShenyiThisTurn: false,
      baseCanAttack: card.baseCanAttack ?? card.canAttack,
      baseGodMark: card.baseGodMark ?? card.godMark,
      baseAcValue: card.baseAcValue ?? card.acValue,
      baseCanActivateEffect: card.baseCanActivateEffect ?? card.canActivateEffect ?? true
    }));

    const tempId = 'practice_' + Math.random().toString(36).substring(7);
    const myState: PlayerState = {
      uid: ({ uid: "temp", displayName: "temp" } as any).uid,
      displayName: ({ uid: "temp", displayName: "temp" } as any).displayName || 'Player 1',
      deck: ServerGameService.assignGameCardIds(ServerGameService.shuffle([...initializedDeck])),
      hand: [],
      grave: [],
      exile: [],
      itemZone: [],
      erosionFront: [],
      erosionBack: [],
      unitZone: Array(6).fill(null),
      playZone: [],
      isTurn: false,
      isFirst: false,
      mulliganDone: false,
      hasExhaustedThisTurn: [],
      isHandPublic: 0,
      timeRemaining: GAME_TIMEOUTS.MAIN_PHASE_TOTAL,
      confrontationStrategy: 'AUTO',
    };

    const botState: PlayerState = {
      uid: 'BOT_PLAYER',
      displayName: '神蚀 AI',
      deck: ServerGameService.assignGameCardIds(ServerGameService.shuffle([...initializedDeck])), // Bot uses same deck as player
      hand: [],
      grave: [],
      exile: [],
      itemZone: [],
      erosionFront: [],
      erosionBack: [],
      unitZone: Array(6).fill(null),
      playZone: [],
      isTurn: false,
      isFirst: false,
      mulliganDone: true, // Bot skips mulligan
      hasExhaustedThisTurn: [],
      isHandPublic: 0,
      timeRemaining: GAME_TIMEOUTS.MAIN_PHASE_TOTAL,
      confrontationStrategy: 'AUTO',
      botDifficulty,
    };

    ServerGameService.drawInitialHand(myState, 4);
    ServerGameService.drawInitialHand(
      botState,
      4,
      undefined
    );

    // Random first player
    const uids = [({ uid: "temp", displayName: "temp" } as any).uid, 'BOT_PLAYER'];
    const firstIdx = Math.floor(Math.random() * uids.length) as 0 | 1;
    const firstPlayerUid = uids[firstIdx];

    myState.isFirst = firstPlayerUid === myState.uid;
    botState.isFirst = firstPlayerUid === botState.uid;

    const gameState: GameState = {
      gameId: "temp", phase: 'MULLIGAN',
      currentTurnPlayer: firstIdx,
      turnCount: 0,
      isCountering: 0,
      counterStack: [],
      passCount: 0,
      playerIds: [uids[0], uids[1]],
      gameStatus: 1,
      logs: ['练习赛开始。请进行调度 (Mulligan)。'],
      players: {
        [({ uid: "temp", displayName: "temp" } as any).uid]: myState,
        'BOT_PLAYER': botState
      },
      phaseTimerStart: 0,
      triggeredEffectsQueue: [],
      pendingResolutions: []
    };
    return gameState;
  },

  async performMulligan(gameState: GameState, cardIdsToReturn: string[], uid: string) {
    const player = gameState.players[uid];
    if (!player || player.mulliganDone) return;

    if (cardIdsToReturn.length > 0) {
      // Return cards to deck
      const cardsToReturn: Card[] = [];
      for (const gamecardId of cardIdsToReturn) {
        const index = player.hand.findIndex(c => c.gamecardId === gamecardId);
        if (index !== -1) {
          cardsToReturn.push(player.hand.splice(index, 1)[0]);
        }
      }
      player.deck = [...player.deck, ...cardsToReturn.map(c => ({ ...c, cardlocation: 'DECK' as TriggerLocation }))];

      // Shuffle
      player.deck = ServerGameService.shuffle(player.deck);

      // Draw same number
      for (let i = 0; i < cardIdsToReturn.length; i++) {
        const card = player.deck.pop();
        if (card) {
          card.cardlocation = 'HAND';
          player.hand.push(card);
        }
      }

    } else {
    }

    player.mulliganDone = true;

    // Check if both players are done
    const allDone = Object.values(gameState.players).every(p => p.mulliganDone);
    if (allDone) {
      gameState.phase = 'START';
      gameState.turnCount = 1;
      // Find the first player
      const firstPlayerIdx = gameState.players[gameState.playerIds[0]].isFirst ? 0 : 1;
      gameState.currentTurnPlayer = firstPlayerIdx as 0 | 1;

      const firstPlayerUid = gameState.playerIds[gameState.currentTurnPlayer];
      gameState.players[firstPlayerUid].isTurn = true;
      const firstPlayerName = gameState.players[firstPlayerUid]?.displayName || '玩家';
      const playerNames = gameState.playerIds.map(uid => gameState.players[uid]?.displayName || '玩家');
      addBattleLog(gameState, {
        category: 'SYSTEM',
        actorUid: firstPlayerUid,
        actorName: firstPlayerName,
        text: `对战开始：${playerNames[0]} vs ${playerNames[1]}，${firstPlayerName} 先攻。`
      });

      const firstPlayer = gameState.players[firstPlayerUid];
      ServerGameService.executeStartPhase(gameState, firstPlayer);
    }
  },

  async endTurn(gameState: GameState) {
    return ServerGameService.advancePhase(gameState, 'DECLARE_END');
  },

  async surrender(gameState: GameState, playerUid: string) {
    const player = gameState.players[playerUid];
    const opponentId = gameState.playerIds.find(id => id !== playerUid);

    gameState.gameStatus = 2;
    gameState.winnerId = opponentId;
    gameState.winReason = 'SURRENDER';
    gameState.logs.push(`[游戏结束] ${player.displayName} 选择了投降。`);

    return gameState;
  },

  // Bot logic
  getBotDifficulty(gameState: GameState, playerUid: string): BotDifficulty {
    const player = gameState.players[playerUid] as (PlayerState & { botDifficulty?: BotDifficulty }) | undefined;
    return player?.botDifficulty || gameState.botDifficulty || 'simple';
  },

  getBotProfile(gameState: GameState, playerUid: string): DeckAiProfile {
    const player = gameState.players[playerUid] as (PlayerState & { botDeckProfileId?: string }) | undefined;
    const profileId = player?.botDeckProfileId || gameState.botDeckProfiles?.[playerUid];
    return getDeckAiProfile(profileId);
  },

  getAiCardName(card: Card | null | undefined) {
    return card?.fullName || card?.id || '未知卡牌';
  },

  recordAiDecision(
    gameState: GameState,
    playerUid: string,
    decision: Omit<AiDecisionLog, 'id' | 'turn' | 'playerUid' | 'playerName' | 'profileId' | 'difficulty' | 'phase' | 'createdAt'>
  ) {
    const player = gameState.players[playerUid];
    if (!player) return;

    gameState.aiDecisionLogs ??= [];
    const profile = ServerGameService.getBotProfile(gameState, playerUid);
    gameState.aiDecisionLogs.push({
      id: `${gameState.gameId || 'game'}_${gameState.aiDecisionLogs.length + 1}`,
      turn: gameState.turnCount,
      playerUid,
      playerName: player.displayName,
      profileId: profile.id,
      difficulty: ServerGameService.getBotDifficulty(gameState, playerUid),
      phase: gameState.phase,
      createdAt: Date.now(),
      ...decision,
    });

    if (gameState.aiDecisionLogs.length > 300) {
      gameState.aiDecisionLogs.splice(0, gameState.aiDecisionLogs.length - 300);
    }
  },

  chooseHardAiDrawCard(gameState: GameState, playerUid: string, context: { source: 'DRAW_PHASE' | 'ATOMIC_DRAW'; drawIndex: number; drawCount: number }) {
    const player = gameState.players[playerUid];
    if (!player || player.deck.length === 0) return undefined;
    const isBotPlayer = playerUid === 'BOT_PLAYER' || !!(player as PlayerState & { botDifficulty?: BotDifficulty }).botDifficulty;
    if (!isBotPlayer) return undefined;
    if (ServerGameService.getBotDifficulty(gameState, playerUid) !== 'hard') return undefined;

    const profile = ServerGameService.getBotProfile(gameState, playerUid);
    const result = chooseCheatDrawCard(gameState, player, profile);
    const selected = result?.selected;
    if (!selected) return undefined;

    ServerGameService.recordAiDecision(gameState, playerUid, {
      action: 'CHEAT_DRAW',
      subject: ServerGameService.getAiCardName(selected),
      score: result.selectedScore === undefined ? undefined : Number(result.selectedScore.toFixed(1)),
      reason: '困难 AI 读取双方隐藏信息后，从卡组中选择当前评分最高的抽牌目标。',
      details: {
        source: context.source,
        drawIndex: context.drawIndex + 1,
        drawCount: context.drawCount,
        ownDeck: player.deck.length,
        handSize: player.hand.length,
        turnPlan: result.turnPlan.mode,
        opponentHand: result.intel.opponentHandSize,
        opponentDeck: result.intel.opponentDeckSize,
        opponentThreats: result.intel.opponentThreats,
        opponentRemoval: result.intel.opponentRemoval,
        bestOpponentHandThreat: Number(result.intel.bestOpponentHandThreat.toFixed(1)),
      },
      candidates: result.candidates.map(candidate => ({
        name: ServerGameService.getAiCardName(candidate.card),
        score: Number(candidate.score.toFixed(1)),
        note: candidate.notes.slice(0, 3).join(', ') || undefined,
      })),
    });

    return selected;
  },

  describeAiSelection(gameState: GameState, query: any, selection: string) {
    const option = (query.options || []).find((candidate: any) =>
      candidate.id === selection || candidate.card?.gamecardId === selection
    );
    if (option?.card) return ServerGameService.getAiCardName(option.card);
    if (option?.label) return option.label;
    const card = ServerGameService.findCardById(gameState, selection);
    return card ? ServerGameService.getAiCardName(card) : selection;
  },

  describeAiPaymentSelection(gameState: GameState, payment: { feijingCardId?: string; exhaustUnitIds?: string[]; erosionFrontIds?: string[] }) {
    const parts: string[] = [];
    if (payment.feijingCardId) {
      parts.push(`费用替代:${ServerGameService.getAiCardName(ServerGameService.findCardById(gameState, payment.feijingCardId))}`);
    }
    if (payment.exhaustUnitIds?.length) {
      parts.push(`横置:${payment.exhaustUnitIds.map(id => ServerGameService.getAiCardName(ServerGameService.findCardById(gameState, id))).join('、')}`);
    }
    if (payment.erosionFrontIds?.length) {
      parts.push(`侵蚀支付:${payment.erosionFrontIds.map(id => ServerGameService.getAiCardName(ServerGameService.findCardById(gameState, id))).join('、')}`);
    }
    return parts.join('；') || '无需额外支付';
  },

  getBotEffectPaymentCost(effect: CardEffect) {
    const explicitCost = Number((effect.cost as any)?.paymentCost || effect.playCost || 0);
    if (Number.isFinite(explicitCost) && explicitCost > 0) return explicitCost;

    const text = `${effect.description || ''} ${effect.content || ''}`;
    const match = text.match(/支付\s*(\d+)\s*费用/) ||
      text.match(/pay\s*(\d+)\s*(?:cost|resource)?/i);
    const parsed = match ? Number(match[1]) : 0;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const looksLikeAccessPayment = /支付|鏀粯|敮浠|费|費|费用|璐|璐圭敤|pay|payment|cost|resource/i.test(text);
    return effect.cost && looksLikeAccessPayment ? 1 : 0;
  },

  botEffectPaymentExhaustsSource(effect: CardEffect) {
    const text = `${effect.description || ''} ${effect.content || ''}`;
    return /横置|妯疆|exhaust/i.test(text);
  },

  canBotPayPositiveCost(
    gameState: GameState,
    player: PlayerState,
    cost: number,
    cardColor?: string,
    sourceCard?: Card,
    options: { excludeUnitIds?: string[] } = {}
  ) {
    if (cost <= 0) return true;
    const normalizedColor = cardColor === 'NONE' ? undefined : cardColor;
    const sourceCardId = sourceCard?.gamecardId;
    const excludedUnitIds = new Set(options.excludeUnitIds || []);

    const hasSpecialSubstitute = player.hand.some(card =>
      ServerGameService.canUse204000145AsPaymentSubstitute(card, normalizedColor, cost, sourceCardId) ||
      ServerGameService.canUse205000136AsPaymentSubstitute(card, normalizedColor, cost, sourceCardId) ||
      ServerGameService.canUseStoryPaymentSubstitute(card, sourceCard, cost, sourceCardId)
    );
    if (hasSpecialSubstitute) return true;

    let remainingCost = cost;
    const hasFeijing = player.hand.some(card =>
      card.gamecardId !== sourceCardId &&
      card.feijingMark &&
      (!normalizedColor || card.color === normalizedColor)
    );
    if (hasFeijing) remainingCost = Math.max(0, remainingCost - 3);

    const readyUnitPayment = player.unitZone
      .filter((card): card is Card => !!card && !card.isExhausted && !(card as any).data?.cannotExhaustByEffect && !excludedUnitIds.has(card.gamecardId))
      .reduce((total, card) => {
        const data = (card as any).data || {};
        const accessMin = Math.max(1, Number(data.accessTapMinValue || 1));
        const accessMax = data.accessTapColor && data.accessTapColor !== normalizedColor
          ? 1
          : Math.max(accessMin, Number(data.accessTapValue || 1));
        return total + accessMax;
      }, 0);
    remainingCost = Math.max(0, remainingCost - readyUnitPayment);
    if (remainingCost <= 0) return true;
    if (player.deck.length < remainingCost) return false;

    const totalErosion = player.erosionFront.filter(Boolean).length + player.erosionBack.filter(Boolean).length;
    const canUseWindProduction =
      (player as any).windProductionTurn === gameState.turnCount &&
      totalErosion + remainingCost === 10;
    return canUseWindProduction || totalErosion + remainingCost < 10;
  },

  canBotPayQueryCost(gameState: GameState, playerUid: string, query: any) {
    const paymentPlayerUid = query.context?.activationPlayerUid || playerUid;
    const player = gameState.players[paymentPlayerUid];
    if (!player) return false;

    const paymentTargetId = query.context?.targetCardId || query.context?.targetId;
    const paymentTarget = paymentTargetId ? ServerGameService.findCardById(gameState, paymentTargetId) : undefined;
    const sourceCard = query.context?.sourceCardId ? ServerGameService.findCardById(gameState, query.context.sourceCardId) : undefined;
    const paymentCost = paymentTarget && query.context?.useEffectiveCardCost === true
      ? ServerGameService.getEffectivePlayCost(player, paymentTarget, gameState)
      : Number(query.paymentCost || 0);

    if (paymentCost < 0) {
      const faceUpFrontCount = player.erosionFront.filter(card => card && card.displayState === 'FRONT_UPRIGHT').length;
      return faceUpFrontCount >= Math.abs(paymentCost);
    }

    return ServerGameService.canBotPayPositiveCost(
      gameState,
      player,
      paymentCost,
      paymentTarget?.color || query.paymentColor,
      paymentTarget || sourceCard,
      { excludeUnitIds: query.context?.paymentOptions?.excludeExhaustUnitIds || [] }
    );
  },

  shouldBoldlyExhaustOpeningPayment(gameState: GameState, playerUid: string) {
    const player = gameState.players[playerUid];
    if (!player || ServerGameService.getBotDifficulty(gameState, playerUid) !== 'hard') return false;
    if (!player.isTurn || !player.isFirst || gameState.turnCount !== 1 || gameState.phase !== 'MAIN') return false;

    const opponentUid = gameState.playerIds.find(uid => uid !== playerUid);
    if (!opponentUid) return false;

    const explicitProfileId = (gameState as any).botDeckProfiles?.[opponentUid] ||
      (gameState.players[opponentUid] as any)?.botDeckProfileId;
    const explicitProfile = explicitProfileId ? getDeckAiProfile(explicitProfileId) : undefined;
    const inferredProfile = inferPlayerDeckProfile(gameState, opponentUid);
    const opponentIsAggro =
      explicitProfile?.gamePlan?.mode === 'aggro' ||
      explicitProfile?.gamePlan?.primaryGoal === 'damage' ||
      inferredProfile?.archetype === 'aggro' ||
      !!inferredProfile?.traits.includes('burst-damage') ||
      !!inferredProfile?.traits.includes('low-curve-swarm');

    return !opponentIsAggro;
  },

  scoreBotPaymentSelectionRisk(
    gameState: GameState,
    playerUid: string,
    payment: { feijingCardId?: string; exhaustUnitIds?: string[]; erosionFrontIds?: string[] },
    options: {
      paymentCost?: number;
      paymentColor?: string;
      sourceCard?: Card;
      addedReadyDefenders?: number;
      additionalExhaustUnitIds?: string[];
    } = {}
  ) {
    const player = gameState.players[playerUid];
    if (!player || ServerGameService.getBotDifficulty(gameState, playerUid) !== 'hard') {
      return {
        penalty: 0,
        notes: [] as string[],
        exhaustedUnits: [] as Card[],
        estimatedDeckPayment: 0,
        readyDefendersAfter: 0,
        defensePressure: false,
      };
    }

    const profile = ServerGameService.getBotProfile(gameState, playerUid);
    const incomingThreat = estimateIncomingThreat(gameState, player, profile);
    const ownErosion = countErosion(player);
    const lowDeck = profile.riskThresholds?.lowDeck ?? 10;
    const reserveDeck = profile.riskThresholds?.reserveDefendersAtDeck ?? lowDeck;
    const boldOpeningPayment = ServerGameService.shouldBoldlyExhaustOpeningPayment(gameState, playerUid);
    const defensePressure =
      !boldOpeningPayment &&
      (
        player.deck.length <= reserveDeck ||
        incomingThreat.defendersNeeded > 0 ||
        incomingThreat.lethalWithoutBlocks ||
        incomingThreat.totalDamage >= Math.max(4, 10 - ownErosion)
      );
    const preserveBoardForPlan =
      profile.gamePlan?.mode === 'engine' ||
      profile.gamePlan?.mode === 'combo' ||
      profile.gamePlan?.primaryGoal === 'resourceLoop' ||
      profile.gamePlan?.primaryGoal === 'comboSetup';
    const canDefendSoon = (unit: Card | null | undefined) => !!unit &&
      !unit.isExhausted &&
      !(unit as any).battleForbiddenByEffect &&
      !((unit as any).data?.cannotDefendTurn === gameState.turnCount) &&
      !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount);
    const paymentExhaustedUnitIds = new Set(payment.exhaustUnitIds || []);
    const paymentExhaustedUnits = Array.from(paymentExhaustedUnitIds)
      .map(id => ServerGameService.findCardById(gameState, id))
      .filter((card): card is Card => !!card);
    const additionalExhaustedUnits = (options.additionalExhaustUnitIds || [])
      .filter(id => !paymentExhaustedUnitIds.has(id))
      .map(id => ServerGameService.findCardById(gameState, id))
      .filter((card): card is Card => !!card);
    const exhaustedUnits = [...paymentExhaustedUnits, ...additionalExhaustedUnits];
    const exhaustedReadyDefenders = exhaustedUnits.filter(canDefendSoon).length;
    const readyDefendersBefore = player.unitZone.filter(canDefendSoon).length + (options.addedReadyDefenders || 0);
    const readyDefendersAfter = Math.max(0, readyDefendersBefore - exhaustedReadyDefenders);
    const notes: string[] = [];
    let penalty = 0;

    if (defensePressure && exhaustedUnits.length > 0) {
      for (const unit of exhaustedUnits) {
        const cardValue = scoreCardValue(unit, profile);
        const explicitPreserve = !!(
          profile.preserveCardIds?.[unit.id] ||
          profile.preserveCardIds?.[unit.uniqueId] ||
          profile.preferredCardIds?.[unit.id] ||
          profile.preferredCardIds?.[unit.uniqueId]
        );
        const newlyPlayed = unit.playedTurn === gameState.turnCount;
        const highValueUnit = explicitPreserve || cardValue >= 34;
        penalty += 8 + (unit.damage || 0) * 6 + (unit.power || 0) / 700;
        if (newlyPlayed) penalty += 22;
        if (explicitPreserve) penalty += 24;
        if (preserveBoardForPlan && highValueUnit) penalty += 18;
        if (preserveBoardForPlan && (unit.damage || 0) > 0) penalty += (unit.damage || 0) * 6;
      }
      if (exhaustedUnits.length >= 2) penalty += (exhaustedUnits.length - 1) * 12;
      const missingDefenders = Math.max(0, incomingThreat.defendersNeeded - readyDefendersAfter);
      if (missingDefenders > 0) penalty += missingDefenders * (incomingThreat.lethalWithoutBlocks ? 44 : 30);
      if (incomingThreat.lethalThroughOneBlock && readyDefendersAfter < 2) penalty += 28;
      if (incomingThreat.totalDamage >= Math.max(4, 10 - ownErosion) && readyDefendersAfter === 0) penalty += 36;
      notes.push(`payment exhaust risk ${Math.round(penalty)}`);
    }

    const paymentCost = Number(options.paymentCost || 0);
    let estimatedDeckPayment = 0;
    if (paymentCost > 0) {
      const paymentColor = options.paymentColor || options.sourceCard?.color;
      const sourceCard = options.sourceCard;
      const playingCardId = sourceCard?.gamecardId;
      const feijingCard = payment.feijingCardId
        ? ServerGameService.findCardById(gameState, payment.feijingCardId)
        : undefined;
      const feijingReduction = feijingCard
        ? (
          ServerGameService.canUse204000145AsPaymentSubstitute(feijingCard, paymentColor, paymentCost, playingCardId) ||
          ServerGameService.canUse205000136AsPaymentSubstitute(feijingCard, paymentColor, paymentCost, playingCardId) ||
          ServerGameService.canUseStoryPaymentSubstitute(feijingCard, sourceCard, paymentCost, playingCardId)
        )
          ? paymentCost
          : 3
        : 0;
      const unitPayment = paymentExhaustedUnits.reduce((total, unit) => {
        const data = (unit as any).data || {};
        const accessMin = Math.max(1, Number(data.accessTapMinValue || 1));
        const accessMax = data.accessTapColor && data.accessTapColor !== paymentColor
          ? 1
          : Math.max(accessMin, Number(data.accessTapValue || 1));
        return total + accessMax;
      }, 0);
      estimatedDeckPayment = Math.max(0, paymentCost - feijingReduction - unitPayment);
    }

    if (estimatedDeckPayment > 0 && defensePressure) {
      const deckAfterPayment = player.deck.length - estimatedDeckPayment;
      const erosionAfterPayment = countErosion(player) + estimatedDeckPayment;
      if (deckAfterPayment <= 0 || erosionAfterPayment >= 10) {
        penalty += 80 + estimatedDeckPayment * 12;
        notes.push('unsafe deck payment');
      } else if (player.deck.length <= (profile.riskThresholds?.stopSelfDrawAtDeck ?? lowDeck)) {
        penalty += 10 + estimatedDeckPayment * 5;
        notes.push('low deck payment');
      }
    }

    return {
      penalty,
      notes,
      exhaustedUnits,
      estimatedDeckPayment,
      readyDefendersAfter,
      defensePressure,
    };
  },

  markBotClosingAttackCommitment(gameState: GameState, playerUid: string, turnPlan?: ReturnType<typeof buildTurnPlan>) {
    const player = gameState.players[playerUid] as any;
    if (!player || ServerGameService.getBotDifficulty(gameState, playerUid) !== 'hard') return;
    if (isClosingTurnPlan(turnPlan)) {
      player.botClosingAttackTurn = gameState.turnCount;
    }
  },

  hasBotClosingAttackCommitment(gameState: GameState, playerUid: string) {
    const player = gameState.players[playerUid] as any;
    return !!player && player.botClosingAttackTurn === gameState.turnCount;
  },

  getBotEffectAttemptKey(gameState: GameState, card: Card, effectIndex: number) {
    return `${gameState.turnCount}:${gameState.phase}:${card.gamecardId}:${effectIndex}`;
  },

  getBotEffectAttempts(gameState: GameState, player: PlayerState) {
    const statefulPlayer = player as any;
    if (statefulPlayer.botEffectAttemptTurn !== gameState.turnCount) {
      statefulPlayer.botEffectAttemptTurn = gameState.turnCount;
      statefulPlayer.botEffectAttempts = {};
      statefulPlayer.botEffectFailedIds = {};
    }
    statefulPlayer.botEffectAttempts ??= {};
    return statefulPlayer.botEffectAttempts as Record<string, number>;
  },

  getBotEffectFailedIds(gameState: GameState, player: PlayerState) {
    const statefulPlayer = player as any;
    if (statefulPlayer.botEffectAttemptTurn !== gameState.turnCount) {
      statefulPlayer.botEffectAttemptTurn = gameState.turnCount;
      statefulPlayer.botEffectAttempts = {};
      statefulPlayer.botEffectFailedIds = {};
    }
    statefulPlayer.botEffectFailedIds ??= {};
    return statefulPlayer.botEffectFailedIds as Record<string, number>;
  },

  getEffectTargetCount(gameState: GameState, playerUid: string, sourceCard: Card, effect: CardEffect) {
    if (!ServerGameService.hasPreselectTargetSpec(effect)) return undefined;
    const spec = effect.targetSpec;
    if (!spec) return 0;

    if (spec.modeOptions?.length) {
      const player = gameState.players[playerUid];
      return spec.modeOptions.reduce((total, mode) => {
        if (mode.condition && !mode.condition(gameState, player, sourceCard)) return total;
        const targetShape = mode.targetGroups?.[0] || mode;
        if ((targetShape.maxSelections ?? 0) === 0) return total + 1;
        const candidates = ServerGameService.getTargetCandidates(gameState, playerUid, sourceCard, effect, targetShape);
        return candidates.length >= (targetShape.minSelections ?? 0) ? total + candidates.length : total;
      }, 0);
    }

    const firstTargetShape = spec.targetGroups?.[0] || spec;
    const candidates = ServerGameService.getTargetCandidates(gameState, playerUid, sourceCard, effect, firstTargetShape);
    return candidates.length >= (firstTargetShape.minSelections ?? 0) ? candidates.length : 0;
  },

  getStoryPlayEffect(card: Card) {
    return card.type === 'STORY'
      ? card.effects?.find(effect => effect.type === 'ALWAYS' || effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED')
      : undefined;
  },

  chooseBotDeclaredTargetsForEffect(
    gameState: GameState,
    playerUid: string,
    sourceCard: Card,
    effect: CardEffect,
    effectIndex: number
  ) {
    if (!ServerGameService.hasPreselectTargetSpec(effect) || !effect.targetSpec) return undefined;

    const profile = ServerGameService.getBotProfile(gameState, playerUid);
    const difficulty = ServerGameService.getBotDifficulty(gameState, playerUid);
    const spec: any = effect.targetSpec;
    let modeId: string | undefined;
    let targetShapes: any[] = [];

    if (spec.modeOptions?.length) {
      const player = gameState.players[playerUid];
      const availableModes = spec.modeOptions.filter((mode: any) => {
        if (mode.condition && !mode.condition(gameState, player, sourceCard)) return false;
        const targetShapes = mode.targetGroups?.length ? mode.targetGroups : [mode];
        return targetShapes.every((shape: any) => {
          if ((shape.maxSelections ?? 0) === 0) return true;
          return ServerGameService.getTargetCandidates(gameState, playerUid, sourceCard, effect, shape).length >= (shape.minSelections ?? 0);
        });
      });
      if (availableModes.length === 0) return undefined;

      const modeQuery: any = {
        id: 'BOT_DECLARE_TARGET_MODE',
        type: 'SELECT_CHOICE',
        playerUid,
        options: availableModes.map((mode: any) => ({
          id: mode.id,
          value: mode.id,
          label: mode.label,
          detail: mode.modeDescription || mode.description
        })),
        title: spec.modeTitle || '选择效果',
        description: spec.modeDescription || '选择要发动的效果。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'DECLARE_EFFECT_TARGET_MODE',
        context: { sourceCardId: sourceCard.gamecardId, effectIndex }
      };
      const [selectedModeId] = chooseQuerySelections(gameState, playerUid, modeQuery, profile, difficulty);
      if (difficulty === 'hard') {
        ServerGameService.recordBotQuerySelectionDecision(gameState, playerUid, modeQuery, selectedModeId ? [selectedModeId] : [], profile);
      }
      const selectedMode = availableModes.find((mode: any) => mode.id === selectedModeId) || availableModes[0];
      modeId = selectedMode.id;
      targetShapes = selectedMode.targetGroups?.length ? selectedMode.targetGroups : [selectedMode];
    } else {
      targetShapes = spec.targetGroups?.length ? spec.targetGroups : [spec];
    }

    let declaredTargets: DeclaredEffectTarget[] = [];
    for (let index = 0; index < targetShapes.length; index += 1) {
      const targetShape = targetShapes[index];
      const candidates = ServerGameService.getTargetCandidates(gameState, playerUid, sourceCard, effect, targetShape, declaredTargets);
      if (candidates.length < (targetShape.minSelections ?? 0)) {
        ServerGameService.clearDeclaredTargetMarkers(gameState, declaredTargets);
        return undefined;
      }

      const targetQuery: any = {
        id: 'BOT_DECLARE_TARGETS',
        type: 'SELECT_CARD',
        playerUid,
        options: AtomicEffectExecutor.enrichQueryOptions(
          gameState,
          playerUid,
          candidates.map(candidate => ({
            card: candidate.card,
            source: candidate.source || (candidate.card.cardlocation as TriggerLocation)
          }))
        ),
        title: targetShape.title || spec.title || '选择对象',
        description: targetShape.description || spec.description || '请选择合法对象。',
        minSelections: targetShape.minSelections ?? 1,
        maxSelections: targetShape.maxSelections ?? targetShape.minSelections ?? 1,
        callbackKey: 'DECLARE_EFFECT_TARGETS',
        context: {
          sourceCardId: sourceCard.gamecardId,
          effectIndex,
          modeId,
          targetGroupIndex: index,
          declaredTargets
        }
      };
      const selections = chooseQuerySelections(gameState, playerUid, targetQuery, profile, difficulty);
      if (difficulty === 'hard') {
        ServerGameService.recordBotQuerySelectionDecision(gameState, playerUid, targetQuery, selections, profile);
      }
      if (selections.length < (targetShape.minSelections ?? 1)) {
        ServerGameService.clearDeclaredTargetMarkers(gameState, declaredTargets);
        return undefined;
      }

      const newlyDeclaredTargets = ServerGameService.declareEffectTargets(
        gameState,
        playerUid,
        sourceCard,
        effect,
        effectIndex,
        selections,
        targetShape,
        declaredTargets,
        modeId
      );
      declaredTargets = [...declaredTargets, ...newlyDeclaredTargets];
    }

    if (modeId) {
      (declaredTargets as any).declaredModeId = modeId;
    }
    return declaredTargets;
  },

  getBotActivatableEffectCandidates(gameState: GameState, playerUid: string) {
    const player = gameState.players[playerUid];
    if (!player || ServerGameService.getBotDifficulty(gameState, playerUid) !== 'hard') return [];
    if (gameState.pendingQuery || gameState.isResolvingStack || gameState.currentProcessingItem) return [];
    if (!['MAIN', 'BATTLE_FREE', 'COUNTERING'].includes(gameState.phase)) return [];
    if (gameState.phase === 'COUNTERING' && gameState.priorityPlayerId !== playerUid) return [];

    const profile = ServerGameService.getBotProfile(gameState, playerUid);
    const opponentUid = gameState.playerIds.find(uid => uid !== playerUid);
    const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
    const attempts = ServerGameService.getBotEffectAttempts(gameState, player);
    const failedEffectIds = ServerGameService.getBotEffectFailedIds(gameState, player);
    const zones: Array<{ location: TriggerLocation; cards: (Card | null)[] }> = [
      { location: 'HAND', cards: player.hand },
      { location: 'UNIT', cards: player.unitZone },
      { location: 'ITEM', cards: player.itemZone },
      { location: 'EROSION_FRONT', cards: player.erosionFront },
      { location: 'EROSION_BACK', cards: player.erosionBack },
      { location: 'GRAVE', cards: player.grave },
    ];

    return zones.flatMap(({ location, cards }) =>
      cards.flatMap(card => {
        if (!card?.effects?.length) return [];
        if (location === 'HAND' && card.type === 'STORY') return [];
        return card.effects.map((effect, effectIndex) => {
          if (!(effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED')) return undefined;
          if (effect.id && failedEffectIds[effect.id]) return undefined;
          const attemptKey = ServerGameService.getBotEffectAttemptKey(gameState, card, effectIndex);
          if (attempts[attemptKey]) return undefined;
          const rules = ServerGameService.checkEffectLimitsAndReqs(gameState, playerUid, card, effect, location);
          if (!rules.valid) return undefined;
          const paymentCost = ServerGameService.getBotEffectPaymentCost(effect);
          const paymentOptions = ServerGameService.botEffectPaymentExhaustsSource(effect)
            ? { excludeExhaustUnitIds: [card.gamecardId] }
            : undefined;
          const sourceExhaustUnitIds = paymentOptions?.excludeExhaustUnitIds || [];
          if (paymentCost > 0 && !ServerGameService.canBotPayPositiveCost(gameState, player, paymentCost, card.color, card, {
            excludeUnitIds: paymentOptions?.excludeExhaustUnitIds,
          })) {
            return undefined;
          }
          const projectedPayment = paymentCost > 0
            ? ServerGameService.buildBotPaymentSelectionForPlayer(gameState, playerUid, {
              paymentCost,
              paymentColor: card.color,
              context: {
                cardId: card.gamecardId,
                sourceCardId: card.gamecardId,
                paymentTargetId: card.gamecardId,
                paymentOptions,
              },
            })
            : {};
          const paymentRisk = paymentCost > 0 || sourceExhaustUnitIds.length > 0
            ? ServerGameService.scoreBotPaymentSelectionRisk(gameState, playerUid, projectedPayment, {
              paymentCost,
              paymentColor: card.color,
              sourceCard: card,
              additionalExhaustUnitIds: sourceExhaustUnitIds,
            })
            : { penalty: 0, notes: [] as string[], estimatedDeckPayment: 0, readyDefendersAfter: undefined };
          const targetCount = ServerGameService.getEffectTargetCount(gameState, playerUid, card, effect);
          if (targetCount !== undefined && targetCount <= 0) return undefined;
          const scored = scoreActivatableEffect(gameState, player, card, effect, profile, {
            opponent,
            targetCount,
            hasTargetSpec: targetCount !== undefined,
          });
          const finalScore = scored.score - paymentRisk.penalty;
          return {
            card,
            effect,
            effectIndex,
            location,
            score: finalScore,
            reason: scored.reason,
            notes: [...scored.notes, ...paymentRisk.notes],
            targetCount,
            paymentCost,
            projectedPayment,
            paymentRisk,
          };
        }).filter(Boolean);
      })
    ).sort((a: any, b: any) => b.score - a.score);
  },

  async activateBotEffectCandidate(
    gameState: GameState,
    playerUid: string,
    phaseContext: string,
    chosen: any,
    candidates: any[]
  ) {
    const player = gameState.players[playerUid];
    if (!player) return false;

    const attempts = ServerGameService.getBotEffectAttempts(gameState, player);
    const attemptKey = ServerGameService.getBotEffectAttemptKey(gameState, chosen.card, chosen.effectIndex);
    attempts[attemptKey] = (attempts[attemptKey] || 0) + 1;

    ServerGameService.recordAiDecision(gameState, playerUid, {
      action: 'ACTIVATE_EFFECT',
      subject: `${ServerGameService.getAiCardName(chosen.card)} #${chosen.effectIndex + 1}`,
      score: chosen.score,
      reason: chosen.reason,
      details: {
        effectId: chosen.effect.id,
        location: chosen.location,
        phaseContext,
        targetCount: chosen.targetCount,
        paymentCost: chosen.paymentCost,
        projectedPayment: ServerGameService.describeAiPaymentSelection(gameState, chosen.projectedPayment || {}),
        paymentRisk: chosen.paymentRisk?.penalty ? Number(chosen.paymentRisk.penalty.toFixed(1)) : 0,
        readyDefendersAfterPayment: chosen.paymentRisk?.readyDefendersAfter,
        estimatedDeckPayment: chosen.paymentRisk?.estimatedDeckPayment,
        notes: chosen.notes.join('、'),
      },
      candidates: candidates.slice(0, 3).map((candidate: any) => ({
        name: `${ServerGameService.getAiCardName(candidate.card)} #${candidate.effectIndex + 1}`,
        score: candidate.score,
        note: candidate.notes.join('、'),
      })),
    });

    let declaredTargets: DeclaredEffectTarget[] | undefined;
    try {
      if (ServerGameService.hasPreselectTargetSpec(chosen.effect)) {
        declaredTargets = ServerGameService.chooseBotDeclaredTargetsForEffect(
          gameState,
          playerUid,
          chosen.card,
          chosen.effect,
          chosen.effectIndex
        );
        if (!declaredTargets) throw new Error('没有可指定的合法对象');
      }

      await ServerGameService.activateEffect(gameState, playerUid, chosen.card.gamecardId, chosen.effectIndex, declaredTargets, (declaredTargets as any)?.declaredModeId
        ? { declaredModeId: (declaredTargets as any).declaredModeId }
        : undefined);
      delete (player as any).lastBotEffectFailure;
      return true;
    } catch (err) {
      ServerGameService.clearDeclaredTargetMarkers(gameState, declaredTargets);
      const message = err instanceof Error ? err.message : String(err);
      (player as any).lastBotEffectFailure = message;
      if (chosen.effect.id) {
        ServerGameService.getBotEffectFailedIds(gameState, player)[chosen.effect.id] = 1;
      }
      ServerGameService.recordAiDecision(gameState, playerUid, {
        action: 'ACTIVATE_EFFECT_FAILED',
        subject: `${ServerGameService.getAiCardName(chosen.card)} #${chosen.effectIndex + 1}`,
        score: chosen.score,
        reason: '主动效果通过评分筛选，但实际发动入口拒绝执行，跳过该效果继续行动。',
        details: {
          effectId: chosen.effect.id,
          location: chosen.location,
          phaseContext,
          error: message,
        },
      });
      return false;
    }
  },

  async tryActivateBotEffect(
    gameState: GameState,
    playerUid: string,
    phaseContext: string,
    minScore: number,
    onUpdate?: (state: GameState) => Promise<void>
  ) {
    const player = gameState.players[playerUid];
    if (!player) return false;
    const candidates = ServerGameService.getBotActivatableEffectCandidates(gameState, playerUid);
    const chosen = candidates.find((candidate: any) => candidate.score >= minScore) as any;
    if (!chosen) return false;
    return ServerGameService.activateBotEffectCandidate(gameState, playerUid, phaseContext, chosen, candidates);
  },

  getBotStoryPlayCandidates(gameState: GameState, playerUid: string) {
    const player = gameState.players[playerUid];
    if (!player || ServerGameService.getBotDifficulty(gameState, playerUid) !== 'hard') return [];
    if (gameState.pendingQuery || gameState.isResolvingStack || gameState.currentProcessingItem) return [];
    if (gameState.phase === 'BATTLE_FREE' && !player.isTurn) return [];
    if (gameState.phase === 'COUNTERING' && gameState.priorityPlayerId !== playerUid) return [];
    if (!['BATTLE_FREE', 'COUNTERING'].includes(gameState.phase)) return [];

    const difficulty = ServerGameService.getBotDifficulty(gameState, playerUid);
    const profile = ServerGameService.getBotProfile(gameState, playerUid);
    if (difficulty !== 'hard') return [];

    const canPayPlayCost = (card: Card) => {
      const effectiveCost = ServerGameService.getEffectivePlayCost(player, card, gameState);
      if (effectiveCost < 0) {
        const faceUpFrontCount = player.erosionFront.filter(erosionCard =>
          erosionCard && erosionCard.displayState === 'FRONT_UPRIGHT'
        ).length;
        return faceUpFrontCount >= Math.abs(effectiveCost);
      }
      return ServerGameService.canBotPayPositiveCost(gameState, player, effectiveCost, card.color, card);
    };

    return player.hand
      .filter(card =>
        card.type === 'STORY' &&
        ServerGameService.canPlayCard(gameState, player, card).canPlay &&
        canPayPlayCost(card)
      )
      .map(card => {
        const effectiveCost = ServerGameService.getEffectivePlayCost(player, card, gameState);
        const initialPaymentSelection = effectiveCost !== 0
          ? ServerGameService.buildBotPaymentSelectionForPlayer(gameState, playerUid, {
            paymentCost: effectiveCost,
            paymentColor: card.color,
            context: {
              cardId: card.gamecardId,
              sourceCardId: card.gamecardId,
              paymentTargetId: card.gamecardId,
            },
          })
          : {};
        const paymentRisk = effectiveCost > 0
          ? ServerGameService.scoreBotPaymentSelectionRisk(gameState, playerUid, initialPaymentSelection, {
            paymentCost: effectiveCost,
            paymentColor: card.color,
            sourceCard: card,
          })
          : { penalty: 0, notes: [] as string[], estimatedDeckPayment: 0, readyDefendersAfter: undefined };
        return {
          card,
          score: scorePlayableCard(gameState, player, card, profile) - paymentRisk.penalty,
          effectiveCost,
          initialPaymentSelection,
          paymentRisk,
        };
      })
      .sort((a, b) => b.score - a.score);
  },

  async playBotStoryCandidate(
    gameState: GameState,
    playerUid: string,
    phaseContext: string,
    chosen: any,
    candidates: any[],
    action: string,
    failureAction: string,
    reason: string
  ) {
    const player = gameState.players[playerUid];
    const profile = ServerGameService.getBotProfile(gameState, playerUid);
    const chosenDevelopment = player ? scoreAdventurerGuildDevelopmentPriority(gameState, player, chosen.card, profile) : { score: 0, notes: [] as string[] };
    ServerGameService.recordAiDecision(gameState, playerUid, {
      action,
      subject: ServerGameService.getAiCardName(chosen.card),
      score: chosen.score,
      reason,
      details: {
        phaseContext,
        cost: chosen.effectiveCost,
        initialPayment: ServerGameService.describeAiPaymentSelection(gameState, chosen.initialPaymentSelection),
        paymentRisk: chosen.paymentRisk?.penalty ? Number(chosen.paymentRisk.penalty.toFixed(1)) : 0,
        readyDefendersAfterPayment: chosen.paymentRisk?.readyDefendersAfter,
        estimatedDeckPayment: chosen.paymentRisk?.estimatedDeckPayment,
        battleAttackers: gameState.battleState?.attackers?.length || 0,
        developmentTier: chosenDevelopment.tier,
        developmentScore: chosenDevelopment.score ? Number(chosenDevelopment.score.toFixed(1)) : undefined,
        developmentNotes: chosenDevelopment.notes.slice(0, 3).join(', ') || undefined,
      },
      candidates: candidates.slice(0, 3).map(candidate => ({
        name: ServerGameService.getAiCardName(candidate.card),
        score: candidate.score,
        note: player ? scoreAdventurerGuildDevelopmentPriority(gameState, player, candidate.card, profile).notes.slice(0, 3).join(', ') || undefined : undefined,
      })),
    });

    try {
      await ServerGameService.playCard(
        gameState,
        playerUid,
        chosen.card.gamecardId,
        chosen.initialPaymentSelection,
        undefined,
        { paymentSelectionResolved: true }
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ServerGameService.recordAiDecision(gameState, playerUid, {
        action: failureAction,
        subject: ServerGameService.getAiCardName(chosen.card),
        score: chosen.score,
        reason: 'Story passed scoring but playCard rejected it; skip this story for the current decision.',
        details: {
          phaseContext,
          error: message,
          cost: chosen.effectiveCost,
        },
      });
      return false;
    }
  },

  async tryPlayBotBattleStory(
    gameState: GameState,
    playerUid: string,
    phaseContext: string,
    minScore: number,
    onUpdate?: (state: GameState) => Promise<void>
  ) {
    const player = gameState.players[playerUid];
    if (!player || !player.isTurn || gameState.phase !== 'BATTLE_FREE') return false;

    const candidates = ServerGameService.getBotStoryPlayCandidates(gameState, playerUid);
    const chosen = candidates.find(candidate => candidate.score >= minScore);
    if (!chosen) return false;

    return ServerGameService.playBotStoryCandidate(
      gameState,
      playerUid,
      phaseContext,
      chosen,
      candidates,
      'PLAY_BATTLE_STORY',
      'PLAY_BATTLE_STORY_FAILED',
      'Hard AI plays a high-value story during the battle free window instead of limiting itself to field effects.'
    );
  },

  async tryUseBotConfrontationAction(
    gameState: GameState,
    playerUid: string,
    minScore = 18,
    onUpdate?: (state: GameState) => Promise<void>
  ) {
    const player = gameState.players[playerUid];
    if (!player || ServerGameService.getBotDifficulty(gameState, playerUid) !== 'hard') return false;
    if (gameState.phase !== 'COUNTERING' || gameState.priorityPlayerId !== playerUid) return false;

    const effectCandidates = ServerGameService.getBotActivatableEffectCandidates(gameState, playerUid)
      .map((candidate: any) => ({ type: 'ACTIVATE_EFFECT', candidate, score: candidate.score }));
    const storyCandidates = ServerGameService.getBotStoryPlayCandidates(gameState, playerUid)
      .map((candidate: any) => ({ type: 'PLAY_STORY', candidate, score: candidate.score }));
    const candidates = [...effectCandidates, ...storyCandidates].sort((a, b) => b.score - a.score);
    const chosen = candidates.find(candidate => candidate.score >= minScore);
    if (!chosen) return false;

    if (chosen.type === 'ACTIVATE_EFFECT') {
      return ServerGameService.activateBotEffectCandidate(
        gameState,
        playerUid,
        'COUNTERING',
        chosen.candidate,
        effectCandidates.map(entry => entry.candidate)
      );
    }

    return ServerGameService.playBotStoryCandidate(
      gameState,
      playerUid,
      'COUNTERING',
      chosen.candidate,
      storyCandidates.map(entry => entry.candidate),
      'PLAY_CONFRONTATION_STORY',
      'PLAY_CONFRONTATION_STORY_FAILED',
      'Hard AI uses a story card in the confrontation window only when it has clear tactical value.'
    );
  },

  getBotQuerySelections(query: any): string[] {
    const selectableOptions = (query.options || []).filter((option: any) => !option.disabled);
    const minSelections = query.minSelections ?? 1;
    const selectionCount = Math.max(0, Math.min(minSelections, selectableOptions.length));

    if (query.type === 'SELECT_CARD') {
      return selectableOptions
        .slice(0, selectionCount)
        .map((option: any) => option.card?.gamecardId || option.id)
        .filter(Boolean);
    }

    return selectableOptions
      .slice(0, selectionCount)
      .map((option: any) => option.id || option.card?.gamecardId)
      .filter(Boolean);
  },

  getBotQuerySelectionsForPlayer(gameState: GameState, playerUid: string, query: any): string[] {
    const profile = ServerGameService.getBotProfile(gameState, playerUid);
    const difficulty = ServerGameService.getBotDifficulty(gameState, playerUid);
    const selections = chooseQuerySelections(
      gameState,
      playerUid,
      query,
      profile,
      difficulty
    );
    if (difficulty === 'hard') {
      ServerGameService.recordBotQuerySelectionDecision(gameState, playerUid, query, selections, profile);
    }
    return selections;
  },

  recordBotQuerySelectionDecision(gameState: GameState, playerUid: string, query: any, selections: string[], profile: DeckAiProfile) {
    const selectableOptions = (query.options || []).filter((option: any) => !option.disabled);
    const scored = selectableOptions
      .map((option: any) => ({
        option,
        detail: describeAdventurerGuildQueryOption(gameState, playerUid, query, option, profile),
      }))
      .filter((entry: any): entry is { option: any; detail: NonNullable<ReturnType<typeof describeAdventurerGuildQueryOption>> } => !!entry.detail)
      .sort((a, b) => b.detail.score - a.detail.score);

    if (scored.length === 0) return;

    const selectedSet = new Set(selections);
    ServerGameService.recordAiDecision(gameState, playerUid, {
      action: 'QUERY_SELECTION',
      subject: query.title || query.context?.effectId || query.callbackKey || '选择',
      reason: '困难冒险者公会 AI 按专用目标/选项优先级处理选择窗口。',
      details: {
        effectId: query.context?.effectId,
        step: query.context?.step,
        callbackKey: query.callbackKey,
        selections: selections.join(', '),
      },
      candidates: scored.slice(0, 3).map(({ option, detail }) => ({
        name: option.card ? ServerGameService.getAiCardName(option.card) : (option.label || option.id),
        score: detail.score,
        note: [
          selectedSet.has(option.card?.gamecardId || option.id) ? '已选择' : undefined,
          ...detail.notes,
        ].filter(Boolean).join('、') || undefined,
      })),
    });
  },

  buildBotPaymentSelection(gameState: GameState, query: any) {
    return ServerGameService.buildBotPaymentSelectionForPlayer(gameState, 'BOT_PLAYER', query);
  },

  buildBotPaymentSelectionForPlayer(gameState: GameState, playerUid: string, query: any) {
    const player = gameState.players[playerUid];
    if (!player) return {};

    const difficulty = ServerGameService.getBotDifficulty(gameState, playerUid);
    const profile = ServerGameService.getBotProfile(gameState, playerUid);

    const paymentCost = Number(query.paymentCost || 0);
    if (paymentCost === 0) return {};

    if (paymentCost < 0) {
      const amount = Math.abs(paymentCost);
      const erosionFrontIds = player.erosionFront
        .filter((card): card is Card => !!card && card.displayState === 'FRONT_UPRIGHT')
        .sort((a, b) => difficulty === 'hard' ? scorePaymentSacrificeValue(a, profile, gameState, player) - scorePaymentSacrificeValue(b, profile, gameState, player) : 0)
        .slice(0, amount)
        .map(card => card.gamecardId);
      return erosionFrontIds.length === amount ? { erosionFrontIds } : {};
    }

    const sourceCardId = query.context?.sourceCardId || query.context?.cardId || query.context?.targetCardId;
    const sourceCard = sourceCardId ? ServerGameService.findCardById(gameState, sourceCardId) : undefined;
    const playingCardId = query.context?.paymentTargetId || query.context?.targetCardId || query.context?.cardId || sourceCardId;
    const playingCard = playingCardId ? ServerGameService.findCardById(gameState, playingCardId) : sourceCard;
    const cardColor = query.paymentColor || playingCard?.color || sourceCard?.color;

    const feijingCandidates = player.hand
      .filter(card => {
        if (!card || card.gamecardId === playingCardId) return false;
        return (
          ServerGameService.canUse204000145AsPaymentSubstitute(card, cardColor, paymentCost, playingCardId) ||
          ServerGameService.canUse205000136AsPaymentSubstitute(card, cardColor, paymentCost, playingCardId) ||
          ServerGameService.canUseStoryPaymentSubstitute(card, playingCard, paymentCost, playingCardId) ||
          (card.feijingMark && (!cardColor || card.color === cardColor))
        );
      })
      .sort((a, b) => difficulty === 'hard'
        ? scorePaymentSacrificeValue(a, profile, gameState, player) - scorePaymentSacrificeValue(b, profile, gameState, player)
        : 0
      );
    const onlyFeijingPayment = !!playingCard?.effects?.some(effect => effect.content === 'ONLY_FEIJING_PAYMENT');
    const feijingRoutes = difficulty === 'hard'
      ? [
        ...(onlyFeijingPayment ? [] : [undefined]),
        ...feijingCandidates,
      ] as (Card | undefined)[]
      : [
        feijingCandidates[0],
      ] as (Card | undefined)[];
    if (onlyFeijingPayment && feijingCandidates.length === 0) return {};

    const getFeijingReduction = (feijingCard: Card | undefined) =>
      feijingCard
        ? ((ServerGameService.canUse204000145AsPaymentSubstitute(feijingCard, cardColor, paymentCost, playingCardId) ||
            ServerGameService.canUse205000136AsPaymentSubstitute(feijingCard, cardColor, paymentCost, playingCardId) ||
            ServerGameService.canUseStoryPaymentSubstitute(feijingCard, playingCard, paymentCost, playingCardId))
            ? paymentCost
            : 3)
        : 0;

    const candidates = player.unitZone
      .filter((card): card is Card => !!card && !card.isExhausted && !(card as any).data?.cannotExhaustByEffect)
      .map(card => {
        const data = (card as any).data || {};
        const accessMin = Math.max(1, Number(data.accessTapMinValue || 1));
        const accessMax = data.accessTapColor && data.accessTapColor !== cardColor
          ? 1
          : Math.max(accessMin, Number(data.accessTapValue || 1));
        return { card, accessMin, accessMax };
      });

    const totalErosion = player.erosionFront.filter(c => c !== null).length + player.erosionBack.filter(c => c !== null).length;
    const canUseWindProduction = (player as any).windProductionTurn === gameState.turnCount;
    const incomingThreat = estimateIncomingThreat(gameState, player, profile);
    const opponentUid = gameState.playerIds.find(uid => uid !== playerUid);
    const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
    const opponentErosion = opponent ? countErosion(opponent) : 0;
    const ownAttackers = player.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
    const totalAttackDamage = ownAttackers.reduce((sum, unit) => sum + Math.max(0, unit.damage || 0), 0);
    const opponentPotentialDamage = incomingThreat.totalDamage;
    const ownErosion = countErosion(player);
    const lowDeck = profile.riskThresholds?.lowDeck ?? 10;
    const reserveDeck = profile.riskThresholds?.reserveDefendersAtDeck ?? lowDeck;
    const stopSelfDrawAtDeck = profile.riskThresholds?.stopSelfDrawAtDeck ?? lowDeck;
    const boldOpeningPayment = ServerGameService.shouldBoldlyExhaustOpeningPayment(gameState, playerUid);
    const defensePressure = difficulty === 'hard' && (
      !boldOpeningPayment &&
      (
        player.deck.length <= reserveDeck ||
        incomingThreat.defendersNeeded > 0 ||
        incomingThreat.lethalWithoutBlocks ||
        opponentPotentialDamage >= Math.max(4, 10 - ownErosion)
      )
    );
    const preserveBoardForPlan = difficulty === 'hard' && (
      profile.gamePlan?.mode === 'engine' ||
      profile.gamePlan?.mode === 'combo' ||
      profile.gamePlan?.primaryGoal === 'resourceLoop' ||
      profile.gamePlan?.primaryGoal === 'comboSetup'
    );
    const closingAttackPressure = difficulty === 'hard' &&
      player.isTurn &&
      gameState.phase === 'MAIN' &&
      ownAttackers.length > 0 &&
      !!opponent &&
      (
        battleDamageWouldBeFatal(totalAttackDamage, opponent) ||
        (!opponent.isGoddessMode && opponentErosion >= 7) ||
        opponent.deck.length <= lowDeck
      );
    const canDefendSoon = (unit: Card | null | undefined) => !!unit &&
      !unit.isExhausted &&
      !(unit as any).battleForbiddenByEffect &&
      !((unit as any).data?.cannotDefendTurn === gameState.turnCount) &&
      !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount);
    const readyDefendersBefore = player.unitZone.filter(canDefendSoon).length;
    const deckPaymentWeight = difficulty === 'hard'
      ? boldOpeningPayment
        ? 14
        : incomingThreat.deckOutRisk
        ? 34
        : player.deck.length <= stopSelfDrawAtDeck
        ? 24
        : totalErosion >= 7
          ? 18
          : 5
      : 0;
    let bestSelection: { feijingCardId?: string; exhaustUnitIds?: string[] } | undefined;
    let bestRemaining = Number.POSITIVE_INFINITY;
    let bestPaymentScore = Number.POSITIVE_INFINITY;

    const candidateCount = candidates.length;
    let bestUnitValue = Number.POSITIVE_INFINITY;
    for (const feijingCard of feijingRoutes) {
      const reduction = getFeijingReduction(feijingCard);
      const remainingCost = Math.max(0, paymentCost - reduction);
      const feijingValue = difficulty === 'hard' && feijingCard
        ? scorePaymentSacrificeValue(feijingCard, profile, gameState, player) + (onlyFeijingPayment ? 0 : 18)
        : 0;

      for (let mask = 0; mask < (1 << candidateCount); mask++) {
        const exhaustUnitIds: string[] = [];
        let selectedUnitValue = 0;
        let selectedMin = 0;
        let selectedMax = 0;
        let selectedReadyDefenders = 0;
        let selectedAttackDamage = 0;
        let selectedAttackers = 0;

        for (let i = 0; i < candidateCount; i++) {
          if ((mask & (1 << i)) === 0) continue;
          exhaustUnitIds.push(candidates[i].card.gamecardId);
          if (difficulty === 'hard') {
            const unit = candidates[i].card;
            const baseUnitValue = scorePaymentExhaustValue(gameState, unit, profile, difficulty);
            const cardValue = scoreCardValue(unit, profile);
            const explicitPreserve = !!(
              profile.preserveCardIds?.[unit.id] ||
              profile.preserveCardIds?.[unit.uniqueId] ||
              profile.preferredCardIds?.[unit.id] ||
              profile.preferredCardIds?.[unit.uniqueId]
            );
            const newlyPlayed = unit.playedTurn === gameState.turnCount;
            const highValueUnit = explicitPreserve || cardValue >= 34;
            const readyAttacker = canUnitAttack(gameState, unit);
            let unitPaymentValue = defensePressure
              ? baseUnitValue * 1.4 +
                (unit.damage || 0) * 8 +
                (unit.power || 0) / 600 +
                (incomingThreat.defendersNeeded > 0 ? 22 : 0) +
                (newlyPlayed ? 22 : 0) +
                (explicitPreserve ? 24 : 0) +
                (preserveBoardForPlan && highValueUnit ? 18 : 0) +
                (preserveBoardForPlan ? (unit.damage || 0) * 6 : 0)
              : baseUnitValue;
            if (boldOpeningPayment) {
              unitPaymentValue = highValueUnit || unit.godMark
                ? unitPaymentValue * 0.35
                : Math.min(unitPaymentValue * 0.08, 1.5 + Math.max(0, unit.damage || 0) * 0.4 + Math.max(0, unit.power || 0) / 5000);
            }
            selectedUnitValue += unitPaymentValue;
            if (canDefendSoon(unit)) selectedReadyDefenders += 1;
            if (readyAttacker) {
              selectedAttackers += 1;
              selectedAttackDamage += Math.max(0, unit.damage || 0);
              if (closingAttackPressure) {
                selectedUnitValue += 24 + (unit.damage || 0) * 14 + (unit.power || 0) / 600;
              }
            }
          }
          selectedMin += candidates[i].accessMin;
          selectedMax += candidates[i].accessMax;
        }

        if (selectedMin > remainingCost) continue;
        if (defensePressure) {
          const readyDefendersAfter = Math.max(0, readyDefendersBefore - selectedReadyDefenders);
          const missingDefenders = Math.max(0, incomingThreat.defendersNeeded - readyDefendersAfter);
          if (missingDefenders > 0) selectedUnitValue += missingDefenders * (incomingThreat.lethalWithoutBlocks ? 44 : 30);
          if (incomingThreat.lethalThroughOneBlock && readyDefendersAfter < 2) selectedUnitValue += 28;
          if (opponentPotentialDamage >= Math.max(4, 10 - ownErosion) && readyDefendersAfter === 0) selectedUnitValue += 36;
          if (exhaustUnitIds.length >= 2) selectedUnitValue += (exhaustUnitIds.length - 1) * 12;
        }
        if (closingAttackPressure && selectedAttackers > 0 && opponent) {
          const remainingAttackDamage = Math.max(0, totalAttackDamage - selectedAttackDamage);
          const damageNeeded = damageToErosionCritical(opponent);
          if (battleDamageWouldDeckOut(totalAttackDamage, opponent) && !battleDamageWouldDeckOut(remainingAttackDamage, opponent)) {
            selectedUnitValue += 70;
          } else if (!opponent.isGoddessMode && totalAttackDamage >= damageNeeded && remainingAttackDamage < damageNeeded) {
            selectedUnitValue += 50;
          }
        }
        const remainingAfterUnits = Math.max(0, remainingCost - selectedMax);
        if (remainingAfterUnits > player.deck.length) continue;
        if (remainingAfterUnits > 0 && !canUseWindProduction && remainingAfterUnits >= 10 - totalErosion) continue;

        const paymentScore =
          feijingValue +
          selectedUnitValue +
          remainingAfterUnits * deckPaymentWeight +
          exhaustUnitIds.length * 0.1;
        if (
          paymentScore < bestPaymentScore ||
          (paymentScore === bestPaymentScore && remainingAfterUnits < bestRemaining) ||
          (
            paymentScore === bestPaymentScore &&
            remainingAfterUnits === bestRemaining &&
            selectedUnitValue === bestUnitValue &&
            exhaustUnitIds.length < (bestSelection?.exhaustUnitIds?.length ?? Number.POSITIVE_INFINITY)
          )
        ) {
          bestSelection = {
            ...(feijingCard ? { feijingCardId: feijingCard.gamecardId } : {}),
            ...(exhaustUnitIds.length ? { exhaustUnitIds } : {})
          };
          bestRemaining = remainingAfterUnits;
          bestUnitValue = selectedUnitValue;
          bestPaymentScore = paymentScore;
        }
      }
    }

    if (bestSelection) return bestSelection;
    return {};
  },

  async botMove(gameState: GameState, onUpdate?: (state: GameState) => Promise<void>) {
    return ServerGameService.botMoveForPlayer(gameState, 'BOT_PLAYER', onUpdate);
  },

  async botMoveForPlayer(gameState: GameState, playerUid: string, onUpdate?: (state: GameState) => Promise<void>) {
    const bot = gameState.players[playerUid];
    if (!bot) return;
    if (gameState.pendingQuery && gameState.pendingQuery.playerUid !== playerUid) return;
    if (ServerGameService.isVisualAnimationPending(gameState)) return;

    const difficulty = ServerGameService.getBotDifficulty(gameState, playerUid);
    const profile = ServerGameService.getBotProfile(gameState, playerUid);

    if (gameState.phase === 'MULLIGAN' && !bot.mulliganDone) {
      const returned = chooseMulliganCards(bot, profile, difficulty, gameState);
      ServerGameService.recordAiDecision(gameState, playerUid, {
        action: 'MULLIGAN',
        subject: returned.length > 0 ? `${returned.length} cards` : 'keep',
        reason: difficulty === 'hard'
          ? 'Use deck profile to keep early units, engines, and playable pressure while replacing slow or unsupported cards.'
          : 'Simple AI keeps its opening hand.',
        details: {
          returned: returned.length,
          handSize: bot.hand.length,
          kept: bot.hand.length - returned.length,
        },
        candidates: returned.slice(0, 4).map(card => ({
          name: ServerGameService.getAiCardName(card),
          score: scoreCardValue(card, profile),
        })),
      });
      await ServerGameService.performMulligan(gameState, returned.map(card => card.gamecardId), playerUid);
      return;
    }

    // Handle Generic Queries (New)
    if (gameState.pendingQuery && gameState.pendingQuery.playerUid === playerUid) {
      const query = gameState.pendingQuery;
      // console.log(`[Bot] Handling query: ${query.type} (${query.callbackKey})`);

      let selections: string[] = [];

      if (query.type === 'SELECT_PAYMENT') {
        if (query.callbackKey === 'DECLARE_DEFENSE_TAX_PAYMENT') {
          ServerGameService.recordAiDecision(gameState, playerUid, {
            action: 'DECLINE_DEFENSE_TAX',
            subject: query.title || '宣言防御费用',
            reason: '困难 AI 默认不为宣言防御追加支付费用，避免为低收益防御牺牲资源。',
            details: {
              callback: query.callbackKey,
              paymentCost: Number(query.paymentCost || 0),
            },
          });
          gameState.pendingQuery = undefined;
          gameState.logs.push(`[Bot] 放弃支付宣言防御费用，不进行防御。`);
          await ServerGameService.declareDefense(gameState, playerUid, undefined);
          return;
        }
        const canPay = ServerGameService.canBotPayQueryCost(gameState, playerUid, query);
        const payment = canPay ? ServerGameService.buildBotPaymentSelectionForPlayer(gameState, playerUid, query) : {};
        selections = canPay ? [JSON.stringify(payment)] : [];
        const paymentPlayerUid = query.context?.activationPlayerUid || playerUid;
        const paymentPlayer = gameState.players[paymentPlayerUid];
        const paymentTargetId = query.context?.targetCardId || query.context?.targetId;
        const paymentTarget = paymentTargetId ? ServerGameService.findCardById(gameState, paymentTargetId) : undefined;
        const sourceCard = query.context?.sourceCardId ? ServerGameService.findCardById(gameState, query.context.sourceCardId) : undefined;
        const resolvedPaymentCost = paymentTarget && query.context?.useEffectiveCardCost === true && paymentPlayer
          ? ServerGameService.getEffectivePlayCost(paymentPlayer, paymentTarget, gameState)
          : Number(query.paymentCost || 0);
        const paymentRisk = canPay && resolvedPaymentCost > 0
          ? ServerGameService.scoreBotPaymentSelectionRisk(gameState, paymentPlayerUid, payment, {
            paymentCost: resolvedPaymentCost,
            paymentColor: paymentTarget?.color || query.paymentColor,
            sourceCard: paymentTarget || sourceCard,
          })
          : { penalty: 0, notes: [] as string[], exhaustedUnits: [] as Card[], estimatedDeckPayment: 0, readyDefendersAfter: undefined };
        if (canPay) ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'PAYMENT',
          subject: query.title || '支付费用',
          reason: difficulty === 'hard'
            ? '按保留价值和本回合攻击机会选择最低代价的费用支付组合，尽量不横置关键攻击单位。'
            : '简单 AI 使用可用的默认费用支付组合。',
          details: {
            callback: query.callbackKey,
            paymentCost: resolvedPaymentCost,
            selection: ServerGameService.describeAiPaymentSelection(gameState, payment),
            paymentExhaustsUnits: paymentRisk.exhaustedUnits?.length || 0,
            estimatedDeckPayment: paymentRisk.estimatedDeckPayment || 0,
            readyDefendersAfterPayment: paymentRisk.readyDefendersAfter,
            paymentRisk: paymentRisk.penalty ? Number(paymentRisk.penalty.toFixed(1)) : 0,
          },
        });
      } else if (query.callbackKey === 'TRIGGER_CHOICE') {
        selections = ServerGameService.getBotQuerySelectionsForPlayer(gameState, playerUid, query);
        if (selections.length === 0) selections = ['YES'];
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'TRIGGER_CHOICE',
          subject: query.title || '请选择是否发动效果',
          reason: selections[0] === 'NO'
            ? 'Deck-specific hard AI declined this optional trigger.'
            : 'Deck-specific hard AI accepted this trigger when it advances the current plan.',
          details: {
            callback: query.callbackKey,
            type: query.type,
            selection: selections[0] || 'YES',
          },
        });
      } else if (query.callbackKey === 'TRIGGER_ORDER_CHOICE') {
        selections = (query.options || []).filter((option: any) => !option.disabled).slice(0, 1).map((option: any) => option.id).filter(Boolean);
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'TRIGGER_ORDER_CHOICE',
          subject: query.title || '选择诱发效果',
          reason: '自动选择当前优先级组中的第一个诱发效果继续结算。',
          details: {
            callback: query.callbackKey,
            type: query.type,
            selection: selections[0] || 'none',
          },
        });
      } else if (query.options && query.options.length > 0) {
        selections = ServerGameService.getBotQuerySelectionsForPlayer(gameState, playerUid, query);
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'EFFECT_CHOICE',
          subject: query.title || query.callbackKey || query.type,
          reason: difficulty === 'hard'
            ? '按效果语义、目标价值和费用倾向选择对象。'
            : '简单 AI 选择列表中靠前的合法对象。',
          details: {
            callback: query.callbackKey,
            type: query.type,
            selected: selections.map(selection => ServerGameService.describeAiSelection(gameState, query, selection)).join('、') || '无',
            options: (query.options || []).filter((option: any) => !option.disabled).length,
          },
          candidates: (query.options || [])
            .filter((option: any) => !option.disabled)
            .slice(0, 3)
            .map((option: any) => ({
              name: option.card ? ServerGameService.getAiCardName(option.card) : option.label || option.id || '选项',
            })),
        });
      }

      if ((query.minSelections ?? 1) > 0 && selections.length === 0) {
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'QUERY_FAILED',
          subject: query.title || query.callbackKey || query.type,
          reason: '没有找到满足最小选择数量的合法对象，自动处理失败。',
          details: {
            callback: query.callbackKey,
            type: query.type,
            minSelections: Number(query.minSelections ?? 1),
            options: (query.options || []).filter((option: any) => !option.disabled).length,
          },
        });
        await ServerGameService.recoverBotPendingQueryFailure(
          gameState,
          playerUid,
          query,
          'no legal selections',
          onUpdate
        );
        return;
      }

      try {
        await ServerGameService.handleQueryChoice(gameState, playerUid, query.id, selections, onUpdate);
      } catch (err: any) {
        await ServerGameService.recoverBotPendingQueryFailure(
          gameState,
          playerUid,
          query,
          err?.message || String(err),
          onUpdate
        );
      }
      return;
    }

    // Handle Countering (Bot chooses to pass priority)
    if (gameState.phase === 'COUNTERING') {
      if (gameState.priorityPlayerId === playerUid) {
        if (difficulty === 'hard' && await ServerGameService.tryUseBotConfrontationAction(gameState, playerUid, 18, onUpdate)) {
          return;
        }
        await ServerGameService.passConfrontation(gameState, playerUid, onUpdate);
      }
      return;
    }

    // Handle Shenyi Choice (Bot chooses to confirm)
    if (gameState.phase === 'SHENYI_CHOICE' && gameState.priorityPlayerId === playerUid) {
      await ServerGameService.advancePhase(gameState, 'CONFIRM_SHENYI', playerUid, onUpdate);
      return;
    }

    const turnPlan = difficulty === 'hard' ? buildTurnPlan(gameState, bot, profile) : undefined;
    const describeAttackNote = (card: Card) =>
      describeAdventurerGuildAttack(gameState, bot, card, profile).notes.slice(0, 3).join('、') || undefined;
    const describePlayableNote = (card: Card) =>
      describeAdventurerGuildPlayableCard(gameState, bot, card, profile).notes.slice(0, 3).join('、') || undefined;
    if (turnPlan && (gameState.phase === 'MAIN' || gameState.phase === 'BATTLE_DECLARATION')) {
      const planLogKey = `${playerUid}:${gameState.turnCount}`;
      if ((bot as any).lastBotTurnPlanLogKey !== planLogKey) {
        (bot as any).lastBotTurnPlanLogKey = planLogKey;
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'TURN_PLAN',
          subject: turnPlan.mode,
          reason: turnPlan.reason,
          details: {
            opponentProfile: turnPlan.opponentProfileId || 'unknown',
            opponentArchetype: turnPlan.opponentArchetype || 'unknown',
            opponentTraits: turnPlan.opponentTraits?.join(', ') || 'none',
            attackers: turnPlan.attackers,
            totalDamage: turnPlan.totalAvailableDamage,
            damageToCritical: turnPlan.damageToCritical,
            lethalWindow: turnPlan.lethalWindow,
            likelyDefenders: turnPlan.likelyDefenders,
            damageThroughLikelyDefenders: turnPlan.damageThroughLikelyDefenders,
            reserveDefenders: turnPlan.reserveDefenders,
            defendersNeededNextTurn: turnPlan.defendersNeededNextTurn,
            incomingDamage: turnPlan.opponentPotentialDamage,
            damageAfterOneBlock: turnPlan.opponentDamageAfterOneBlock,
            damageAfterTwoBlocks: turnPlan.opponentDamageAfterTwoBlocks,
            incomingLethal: turnPlan.opponentLethalWithoutBlocks,
            desperationAttack: turnPlan.desperationAttack,
            attackBeforeDeveloping: turnPlan.attackBeforeDeveloping,
            minMainEffectScore: Number(turnPlan.minMainEffectScore.toFixed(1)),
            minBattleEffectScore: Number(turnPlan.minBattleEffectScore.toFixed(1)),
            tacticalLine: turnPlan.tacticalLine || 'develop',
            tacticalScore: turnPlan.tacticalScore === undefined ? 0 : Number(turnPlan.tacticalScore.toFixed(1)),
            tacticalNotes: turnPlan.tacticalNotes?.join(', ') || 'none',
            ownDeck: turnPlan.ownDeck,
            opponentDeck: turnPlan.opponentDeck,
            ownErosion: turnPlan.ownErosion,
            opponentErosion: turnPlan.opponentErosion,
            notes: turnPlan.notes.join(', '),
          },
        });
      }
    }

    // Handle Defense Declaration (Smart Defense)
    if (gameState.phase === 'DEFENSE_DECLARATION') {
      const attackerUid = Object.keys(gameState.players).find(uid => gameState.players[uid].isTurn);
      if (attackerUid && attackerUid !== playerUid) {
        const attacker = gameState.players[attackerUid];
        const attackingUnits = (gameState.battleState?.attackers || []).map(id =>
          attacker.unitZone.find(c => c?.gamecardId === id)
        ).filter(Boolean) as Card[];
        const availableDefenders = bot.unitZone.filter(c =>
          ServerGameService.canUnitDefendInCurrentBattle(gameState, c)
        );

        const defender = chooseDefender(
          gameState,
          bot,
          attackingUnits,
          availableDefenders,
          profile,
          difficulty
        );
        const totalAttackerPower = attackingUnits.reduce((sum, unit) => sum + (unit.power || 0), 0);
        const totalAttackerDamage = attackingUnits.reduce((sum, unit) => sum + (unit.damage || 0), 0);
        const danger = countErosion(bot) + totalAttackerDamage >= 9;
        const scoredDefenseCandidates = availableDefenders
          .map(card => {
            const adventurerDefense = describeAdventurerGuildDefense(gameState, bot, card, attackingUnits, profile);
            const score = (card.power || 0) - totalAttackerPower + adventurerDefense.score;
            return {
              card,
              score,
              note: adventurerDefense.notes.slice(0, 3).join('、') || undefined,
            };
          })
          .sort((a, b) => b.score - a.score);
        const selectedDefenseScore = defender
          ? scoredDefenseCandidates.find(entry => entry.card.gamecardId === defender.gamecardId)
          : undefined;

        if (defender) {
          ServerGameService.recordAiDecision(gameState, playerUid, {
            action: 'DEFEND',
            subject: ServerGameService.getAiCardName(defender),
            score: selectedDefenseScore?.score ?? (defender.power || 0) - totalAttackerPower,
            reason: danger
              ? '承受本次伤害会接近败北线，因此优先宣告防御。'
              : '防御者的交换价值可接受，选择减少本次战斗伤害。',
            details: {
              incomingDamage: totalAttackerDamage,
              attackerPower: totalAttackerPower,
              defenderPower: defender.power || 0,
              availableDefenders: availableDefenders.length,
              adventurerDefenseNote: selectedDefenseScore?.note,
            },
            candidates: scoredDefenseCandidates
              .slice(0, 3)
              .map(({ card, score, note }) => ({
                name: ServerGameService.getAiCardName(card),
                score,
                note,
              })),
          });
          await ServerGameService.declareDefense(gameState, playerUid, defender.gamecardId);
        } else {
          ServerGameService.recordAiDecision(gameState, playerUid, {
            action: 'DECLINE_DEFENSE',
            subject: attackingUnits.map(unit => ServerGameService.getAiCardName(unit)).join('、') || '攻击',
            reason: availableDefenders.length === 0
              ? '没有可用防御者。'
              : '防御评分不够高，保留单位价值优先于承受本次伤害。',
            details: {
              incomingDamage: totalAttackerDamage,
              attackerPower: totalAttackerPower,
              availableDefenders: availableDefenders.length,
              erosionAfterHit: countErosion(bot) + totalAttackerDamage,
            },
            candidates: scoredDefenseCandidates
              .slice(0, 3)
              .map(({ card, score, note }) => ({
                name: ServerGameService.getAiCardName(card),
                score,
                note,
              })),
          });
          await ServerGameService.declareDefense(gameState, playerUid, undefined);
        }
        return;
      }
    }

    // Handle Discard Phase
    if (gameState.phase === 'DISCARD' && bot.isTurn) {
      if (bot.hand.length > 6) {
        const discard = chooseDiscardCard(bot, profile, difficulty, gameState);
        if (discard) {
          ServerGameService.recordAiDecision(gameState, playerUid, {
            action: 'DISCARD',
            subject: ServerGameService.getAiCardName(discard),
            score: scoreCardValue(discard, profile),
            reason: difficulty === 'hard'
              ? '弃掉当前手牌中保留价值最低的牌，尽量保留核心组件和高收益牌。'
              : '简单 AI 弃掉手牌中靠前的牌。',
            details: {
              handSize: bot.hand.length,
            },
            candidates: bot.hand
              .map(card => ({
                card,
                score: scoreCardValue(card, profile),
              }))
              .sort((a, b) => a.score - b.score)
              .slice(0, 3)
              .map(({ card, score }) => ({
                name: ServerGameService.getAiCardName(card),
                score,
              })),
          });
          await ServerGameService.discardCard(gameState, playerUid, discard.gamecardId);
        }
      }
      return;
    }

    // Battle Free Phase response (as Opponent)
    if (gameState.phase === 'BATTLE_FREE' && !bot.isTurn) {
      if (gameState.battleState && gameState.battleState.askConfront === 'ASKING_OPPONENT') {
        // console.log('[Bot] Declining confrontation in BATTLE_FREE as Opponent');
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'PASS_BATTLE_WINDOW',
          subject: '战斗自由时点',
          reason: '防守方没有追加发动对抗效果，选择通过以进入下一步战斗结算。',
          details: {
            askConfront: gameState.battleState.askConfront,
          },
        });
        await ServerGameService.advancePhase(gameState, 'DECLINE_CONFRONTATION', playerUid, onUpdate);
        return;
      }
    }

    if (!bot.isTurn) return;

    // Handle Erosion Phase
    if (gameState.phase === 'EROSION') {
      const erosionCards = bot.erosionFront.filter((card): card is Card => !!card);
      let erosionChoice: 'A' | 'C' = 'A';
      let selectedErosionCard: Card | undefined;
      let selectedErosionScore: number | undefined;
      let erosionReason = 'clear erosion cards to grave';

      if (difficulty === 'hard' && erosionCards.length > 0) {
        const recoveryValue = (card: Card) => {
          const preserve = profile.preserveCardIds?.[card.id] || profile.preserveCardIds?.[card.uniqueId] || 0;
          const preferred = profile.preferredCardIds?.[card.id] || profile.preferredCardIds?.[card.uniqueId] || 0;
          const baseValue = scoreCardValue(card, profile);
          const playableValue = scorePlayableCard(gameState, bot, card, profile);
          let score = baseValue + Math.max(-10, playableValue * 0.12);
          if (card.godMark) score += card.type === 'UNIT' ? 76 : 42;
          if (preserve > 0 || preferred > 0) score += 26 + preserve * 0.9 + preferred * 0.55;
          if (card.type === 'UNIT') {
            score += Math.max(0, card.damage || 0) * 8;
            score += Math.max(0, card.power || 0) / 800;
            if (card.isrush) score += 6;
          } else if (card.type === 'ITEM') {
            score += card.isEquip ? 14 : 5;
          } else if (card.type === 'STORY') {
            score += Math.max(0, card.acValue || 0) <= 3 ? 4 : 0;
          }
          return score;
        };
        const scoredErosionCards = [...erosionCards]
          .map(card => ({
            card,
            valueScore: scoreCardValue(card, profile),
            playableScore: scorePlayableCard(gameState, bot, card, profile),
            score: recoveryValue(card),
          }))
          .sort((a, b) =>
            b.score - a.score ||
            b.valueScore - a.valueScore ||
            b.playableScore - a.playableScore
          );
        selectedErosionCard = scoredErosionCards[0]?.card;
        selectedErosionScore = scoredErosionCards[0]?.score;
        const lowDeck = profile.riskThresholds?.lowDeck ?? 10;
        const criticalDeck = profile.riskThresholds?.criticalDeck ?? 3;
        const stopSelfDrawAtDeck = profile.riskThresholds?.stopSelfDrawAtDeck ?? lowDeck;
        const deckDanger = bot.deck.length <= stopSelfDrawAtDeck;
        const canUseChoiceC = bot.deck.length > Math.max(criticalDeck + 2, 5) && bot.erosionBack.filter(Boolean).length < 9;
        const canUseHighValueChoiceC = bot.deck.length > Math.max(criticalDeck + 1, 4) && bot.erosionBack.filter(Boolean).length < 9;
        const handPressure = bot.hand.length <= 2;
        const ownUnits = bot.unitZone.filter(Boolean).length;
        const readyDefenders = bot.unitZone.filter(unit =>
          unit &&
          !unit.isExhausted &&
          !(unit as any).battleForbiddenByEffect &&
          !((unit as any).data?.cannotDefendTurn === gameState.turnCount) &&
          !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount)
        ).length;
        const opponentUid = gameState.playerIds.find(uid => uid !== playerUid);
        const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
        const opponentUnits = opponent?.unitZone.filter(Boolean).length || 0;
        const incomingThreat = estimateIncomingThreat(gameState, bot, profile);
        const affordableHandUnits = bot.hand.filter(card => {
          if (card.type !== 'UNIT') return false;
          const effectiveCost = ServerGameService.getEffectivePlayCost(bot, card, gameState);
          return effectiveCost <= 3;
        }).length;
        const needsTempoRecovery =
          bot.hand.length <= 4 ||
          affordableHandUnits === 0 ||
          (ownUnits === 0 && opponentUnits >= 2);
        const selectedScore = scoredErosionCards[0]?.score || 0;
        const openUnitSlot = bot.unitZone.some(slot => slot === null);
        const emergencyRecoveryCard = scoredErosionCards
          .filter(({ card }) => {
          if (!canUseChoiceC || !openUnitSlot || card.type !== 'UNIT') return false;
          if (bot.factionLock && card.faction !== bot.factionLock) return false;
          const colorCheck = ServerGameService.getColorRequirementResult(bot, card.colorReq || {});
          if (!colorCheck.valid) return false;
          const effectiveCost = ServerGameService.getEffectivePlayCost(bot, card, gameState);
          if (effectiveCost < 0) return true;
          return ServerGameService.canBotPayPositiveCost(gameState, bot, effectiveCost, card.color, card);
        })
          .sort((a, b) => recoveryValue(b.card) - recoveryValue(a.card))[0]?.card;
        const needsEmergencyRecovery =
          !!emergencyRecoveryCard &&
          incomingThreat.lethalWithoutBlocks &&
          readyDefenders < Math.max(1, incomingThreat.defendersNeeded);
        const selectedRecoveryValue = selectedErosionCard ? recoveryValue(selectedErosionCard) : 0;
        const selectedPlayableNow = (() => {
          const card = selectedErosionCard;
          if (!card || card.type !== 'UNIT') return false;
          if (!openUnitSlot) return false;
          if (bot.factionLock && card.faction !== bot.factionLock) return false;
          const colorCheck = ServerGameService.getColorRequirementResult(bot, card.colorReq || {});
          if (!colorCheck.valid) return false;
          const effectiveCost = ServerGameService.getEffectivePlayCost(bot, card, gameState);
          if (effectiveCost < 0) return true;
          return ServerGameService.canBotPayPositiveCost(gameState, bot, effectiveCost, card.color, card);
        })();
        const boardBehind = ownUnits <= Math.max(1, opponentUnits);
        const highValueLowDeckRecovery =
          canUseHighValueChoiceC &&
          deckDanger &&
          !!selectedErosionCard &&
          (
            selectedRecoveryValue >= 70 ||
            selectedScore >= 50 ||
            (selectedErosionCard.godMark && (selectedRecoveryValue >= 45 || selectedScore >= 30))
          ) &&
          (
            handPressure ||
            (needsTempoRecovery && selectedPlayableNow) ||
            (boardBehind && selectedPlayableNow) ||
            (selectedErosionCard.godMark && selectedPlayableNow)
          );

        if (needsEmergencyRecovery) {
          selectedErosionCard = emergencyRecoveryCard;
          erosionChoice = 'C';
          erosionReason = 'emergency defense: recover a high-value playable unit from erosion despite low deck pressure';
        } else if (highValueLowDeckRecovery) {
          erosionChoice = 'C';
          erosionReason = 'low deck but high-value recovery: take the erosion card because the current board or hand needs it';
        } else if (deckDanger && selectedErosionCard) {
          erosionChoice = 'A';
          selectedErosionCard = undefined;
          erosionReason = 'low deck: send face-up erosion cards to grave without spending another deck card';
        } else if (
          canUseChoiceC &&
          selectedErosionCard &&
          (handPressure || (needsTempoRecovery && selectedScore >= 35))
        ) {
          erosionChoice = 'C';
          erosionReason = 'tempo recovery: return a strong erosion card to hand before the board falls behind';
        }
      }

      ServerGameService.recordAiDecision(gameState, playerUid, {
        action: 'EROSION_CHOICE',
        subject: erosionChoice,
        reason: '自动选择默认侵蚀处理路线，保持对局推进。',
        details: {
          erosionFront: bot.erosionFront.filter(Boolean).length,
          erosionBack: bot.erosionBack.filter(Boolean).length,
          selected: selectedErosionCard ? ServerGameService.getAiCardName(selectedErosionCard) : undefined,
          ownDeck: bot.deck.length,
          handSize: bot.hand.length,
          erosionReason,
          selectedScore: selectedErosionScore !== undefined ? Number(selectedErosionScore.toFixed(1)) : undefined,
        },
      });
      await ServerGameService.handleErosionChoice(gameState, playerUid, erosionChoice, selectedErosionCard?.gamecardId);
      return;
    }

    // Main Phase Logic
    if (gameState.phase === 'MAIN') {
      const forcedAttackUnit = ServerGameService.getForcedAttackUnit(gameState, playerUid);
      if (forcedAttackUnit) {
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'ENTER_BATTLE',
          subject: ServerGameService.getAiCardName(forcedAttackUnit),
          reason: '存在必须攻击的单位，优先进入战斗阶段满足强制攻击要求。',
          details: {
            forcedAttack: true,
          },
        });
        await ServerGameService.advancePhase(gameState, 'DECLARE_BATTLE', playerUid, onUpdate);
        return;
      }

      const adventurerRouteAttack = difficulty === 'hard'
        ? getAdventurerGuildRouteAdvice(gameState, bot, profile, 'ATTACK')
        : undefined;
      const routeAttackCandidates = adventurerRouteAttack?.preferredCardIds?.length
        ? bot.unitZone.filter((unit): unit is Card =>
          !!unit &&
          adventurerRouteAttack.preferredCardIds!.includes(unit.id) &&
          canUnitAttack(gameState, unit)
        )
        : [];
      if (adventurerRouteAttack && routeAttackCandidates.length > 0 && (bot as any).botReservedAttackTurn !== gameState.turnCount) {
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'ADVENTURER_COMBO_ROUTE',
          subject: adventurerRouteAttack.note,
          score: adventurerRouteAttack.scoreBonus,
          reason: '困难冒险者公会 AI 识别到本回合连招路线，优先进入战斗执行路线攻击步骤。',
          details: {
            routeId: adventurerRouteAttack.routeId,
            stepKey: adventurerRouteAttack.stepKey,
            preferredAttackers: adventurerRouteAttack.preferredCardIds?.join(', '),
          },
          candidates: routeAttackCandidates.slice(0, 3).map(card => ({
            name: ServerGameService.getAiCardName(card),
            score: scoreAttackCandidate(gameState, bot, card, profile),
            note: adventurerRouteAttack.note,
          })),
        });
        await ServerGameService.advancePhase(gameState, 'DECLARE_BATTLE', playerUid);
        return;
      }

      if (difficulty === 'hard' && (bot as any).botReservedAttackTurn === gameState.turnCount) {
        const heldUnfavorableAttack = (bot as any).botHeldUnfavorableAttackTurn === gameState.turnCount;
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'END_TURN',
          subject: heldUnfavorableAttack ? 'held unfavorable attacks' : 'reserved defenders',
          reason: heldUnfavorableAttack
            ? 'End the turn after holding attacks that would trade down into stronger ready defenders.'
            : 'End the turn after holding ready units for defense; avoid spending reserved defenders on main-phase payments or effects.',
          details: {
            reservedDefenders: ((bot as any).botReservedDefenderIds || []).length,
            heldUnfavorableAttack,
            turn: gameState.turnCount,
          },
        });
        delete (bot as any).lastBotPlayFailure;
        delete (bot as any).botHeldUnfavorableAttackTurn;
        await ServerGameService.advancePhase(gameState, 'DECLARE_END', playerUid, onUpdate);
        return;
      }

      if (difficulty === 'hard' && ServerGameService.hasBotClosingAttackCommitment(gameState, playerUid)) {
        if (await ServerGameService.tryActivateBotEffect(gameState, playerUid, 'MAIN_COMBAT_SETUP', Math.max(42, turnPlan?.minBattleEffectScore ?? 9.5), onUpdate)) {
          return;
        }
        const attackCandidates = bot.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
        if (attackCandidates.length > 0) {
          ServerGameService.recordAiDecision(gameState, playerUid, {
            action: 'ENTER_BATTLE',
            subject: `${attackCandidates.length} attackers`,
            reason: 'Continue the committed closing attack line before considering any further development.',
            details: {
              attackers: attackCandidates.length,
              closingAttackCommitted: true,
              opponentErosion: turnPlan?.opponentErosion,
              totalAvailableDamage: attackCandidates.reduce((sum, unit) => sum + Math.max(0, unit.damage || 0), 0),
              damageToCritical: turnPlan?.damageToCritical,
              ownDeck: bot.deck.length,
            },
            candidates: attackCandidates.slice(0, 3).map(card => ({
              name: ServerGameService.getAiCardName(card),
              score: scoreAttackCandidate(gameState, bot, card, profile),
              note: describeAttackNote(card),
            })),
          });
          await ServerGameService.advancePhase(gameState, 'DECLARE_BATTLE', playerUid, onUpdate);
          return;
        }

        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'END_TURN',
          subject: 'closing attack complete',
          reason: 'The AI already committed to a lethal or critical attack line this turn, so it stops instead of spending cards after the attacks are gone.',
          details: {
            closingAttackCommitted: true,
            playableCards: bot.hand.length,
            turn: gameState.turnCount,
          },
        });
        delete (bot as any).lastBotPlayFailure;
        await ServerGameService.advancePhase(gameState, 'DECLARE_END', playerUid, onUpdate);
        return;
      }

      if (
        difficulty === 'hard' &&
        turnPlan &&
        !turnPlan.attackBeforeDeveloping &&
        gameState.turnCount > 1 &&
        (bot as any).botClosingAttackStartedTurn === gameState.turnCount &&
        (isClosingTurnPlan(turnPlan) || turnPlan.totalAvailableDamage >= Math.max(1, turnPlan.damageToCritical))
      ) {
        const attackCandidates = bot.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
        if (attackCandidates.length > 0) {
          ServerGameService.markBotClosingAttackCommitment(gameState, playerUid, turnPlan);
          ServerGameService.recordAiDecision(gameState, playerUid, {
            action: 'ENTER_BATTLE',
            subject: `${attackCandidates.length} attackers`,
            reason: 'Continue the current pressure attack line instead of developing more cards after combat has already started this turn.',
            details: {
              attackers: attackCandidates.length,
              pressureAttackAlreadyStarted: true,
              opponentErosion: turnPlan.opponentErosion,
              totalAvailableDamage: attackCandidates.reduce((sum, unit) => sum + Math.max(0, unit.damage || 0), 0),
              damageToCritical: turnPlan.damageToCritical,
              ownDeck: bot.deck.length,
            },
            candidates: attackCandidates.slice(0, 3).map(card => ({
              name: ServerGameService.getAiCardName(card),
              score: scoreAttackCandidate(gameState, bot, card, profile),
              note: describeAttackNote(card),
            })),
          });
          await ServerGameService.advancePhase(gameState, 'DECLARE_BATTLE', playerUid, onUpdate);
          return;
        }
      }

      if (difficulty === 'hard' && turnPlan && gameState.turnCount > 1 && (bot as any).botReservedAttackTurn !== gameState.turnCount) {
        const attackCandidates = bot.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
        const shouldAttackBeforeDeveloping = turnPlan.attackBeforeDeveloping;

        if (shouldAttackBeforeDeveloping) {
          if (await ServerGameService.tryActivateBotEffect(gameState, playerUid, 'MAIN_PRE_ATTACK_SETUP', Math.max(42, turnPlan?.minBattleEffectScore ?? 9.5), onUpdate)) {
            return;
          }
          ServerGameService.markBotClosingAttackCommitment(gameState, playerUid, turnPlan);
          ServerGameService.recordAiDecision(gameState, playerUid, {
            action: 'ENTER_BATTLE',
            subject: `${attackCandidates.length} attackers`,
            reason: `Follow turn plan (${turnPlan.mode}) and use the current attack window before main-phase development.`,
            details: {
              attackers: attackCandidates.length,
              opponentErosion: turnPlan.opponentErosion,
              totalAvailableDamage: turnPlan.totalAvailableDamage,
              damageToCritical: turnPlan.damageToCritical,
            lethalWindow: turnPlan.lethalWindow,
            desperationAttack: turnPlan.desperationAttack,
            ownDeck: bot.deck.length,
              avoidSelfDraw: turnPlan.avoidSelfDraw,
              avoidSearch: turnPlan.avoidSearch,
            },
            candidates: attackCandidates.slice(0, 3).map(card => ({
              name: ServerGameService.getAiCardName(card),
              score: scoreAttackCandidate(gameState, bot, card, profile),
              note: describeAttackNote(card),
            })),
          });
          await ServerGameService.advancePhase(gameState, 'DECLARE_BATTLE', playerUid, onUpdate);
          return;
        }
      }

      if (difficulty === 'hard' && await ServerGameService.tryActivateBotEffect(gameState, playerUid, 'MAIN', turnPlan?.minMainEffectScore ?? 8.5, onUpdate)) {
        if (turnPlan && isClosingTurnPlan(turnPlan) && !turnPlan.attackBeforeDeveloping && gameState.turnCount > 1) {
          ServerGameService.markBotClosingAttackCommitment(gameState, playerUid, turnPlan);
        }
        return;
      }

      const canPayPlayCostForBot = (card: Card) => {
        const effectiveCost = ServerGameService.getEffectivePlayCost(bot, card, gameState);
        if (effectiveCost < 0) {
          const faceUpFrontCount = bot.erosionFront.filter(erosionCard =>
            erosionCard && erosionCard.displayState === 'FRONT_UPRIGHT'
          ).length;
          return faceUpFrontCount >= Math.abs(effectiveCost);
        }
        return ServerGameService.canBotPayPositiveCost(gameState, bot, effectiveCost, card.color, card);
      };
      const canPlayForBot = (card: Card) => {
        const playEffect = ServerGameService.getStoryPlayEffect(card);
        if (playEffect && ServerGameService.hasPreselectTargetSpec(playEffect)) {
          const targetCount = ServerGameService.getEffectTargetCount(gameState, playerUid, card, playEffect);
          if (targetCount !== undefined && targetCount <= 0) return false;
        }

        return ServerGameService.canPlayCard(gameState, bot, card).canPlay &&
          canPayPlayCostForBot(card);
      };
      const playableCards = bot.hand.filter(canPlayForBot);
      const playableCandidates = playableCards
        .map(card => ({
          card,
          score: difficulty === 'hard'
            ? scorePlayableCard(gameState, bot, card, profile)
            : scoreCardValue(card, profile),
        }))
        .sort((a, b) => b.score - a.score);

      const buildPlayOption = (card: Card) => {
        const rawScore = difficulty === 'hard'
          ? scorePlayableCard(gameState, bot, card, profile)
          : scoreCardValue(card, profile);
        const effectiveCost = ServerGameService.getEffectivePlayCost(bot, card, gameState);
        const initialPaymentSelection = effectiveCost !== 0
          ? ServerGameService.buildBotPaymentSelectionForPlayer(gameState, playerUid, {
            paymentCost: effectiveCost,
            paymentColor: card.color,
            context: {
              cardId: card.gamecardId,
              sourceCardId: card.gamecardId,
              paymentTargetId: card.gamecardId,
            },
          })
          : {};
        const exhaustedPaymentUnits = ((initialPaymentSelection as any).exhaustUnitIds || []) as string[];
        const canDefendSoon = (unit: Card | null | undefined) => !!unit &&
          !unit.isExhausted &&
          !(unit as any).battleForbiddenByEffect &&
          !((unit as any).data?.cannotDefendTurn === gameState.turnCount) &&
          !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount);
        const readyDefendersBefore = bot.unitZone.filter(canDefendSoon).length;
        const paysWithDeck =
          effectiveCost > 0 &&
          !(initialPaymentSelection as any).feijingCardId &&
          exhaustedPaymentUnits.length === 0 &&
          !((initialPaymentSelection as any).erosionFrontIds || []).length;
        const estimatedDeckPayment = paysWithDeck ? effectiveCost : 0;
        const defensePaymentPressure = difficulty === 'hard' && !!turnPlan && (
          turnPlan.mode === 'defense' ||
          turnPlan.defendersNeededNextTurn > 0 ||
          turnPlan.opponentLethalWithoutBlocks ||
          turnPlan.opponentLethalThroughOneBlock
        );
        const lowDeckPaymentPressure = difficulty === 'hard' && !!turnPlan && !turnPlan.lethalWindow && !turnPlan.desperationAttack && (
          turnPlan.avoidSelfDraw ||
          bot.deck.length <= (profile.riskThresholds?.lowDeck ?? 10) ||
          countErosion(bot) >= (profile.riskThresholds?.highErosion ?? 7)
        );
        const netReadyDefenders = (card.type === 'UNIT' ? 1 : 0) - exhaustedPaymentUnits.length;
        const projectedReadyDefenders = Math.max(0, readyDefendersBefore + netReadyDefenders);
        let defenseDevelopmentBonus = 0;
        if (defensePaymentPressure && card.type === 'UNIT') {
          const neededDefenders = turnPlan?.defendersNeededNextTurn || 0;
          const missingBefore = Math.max(0, neededDefenders - readyDefendersBefore);
          const missingAfter = Math.max(0, neededDefenders - projectedReadyDefenders);
          const blockersAdded = Math.max(0, missingBefore - missingAfter);
          if (blockersAdded > 0) {
            defenseDevelopmentBonus += blockersAdded * (turnPlan?.opponentLethalWithoutBlocks ? 36 : 24);
          }
          if (readyDefendersBefore === 0 && projectedReadyDefenders > 0) defenseDevelopmentBonus += 18;
          if ((turnPlan?.opponentDamageAfterOneBlock || 0) < (turnPlan?.opponentPotentialDamage || 0)) {
            defenseDevelopmentBonus += Math.max(0, card.damage || 0) * 4 + Math.max(0, card.power || 0) / 800;
          }
        }
        let defensivePaymentPenalty = 0;
        if (defensePaymentPressure && exhaustedPaymentUnits.length > 0) {
          defensivePaymentPenalty += exhaustedPaymentUnits.length * (turnPlan?.opponentLethalWithoutBlocks ? 22 : 12);
          if (netReadyDefenders < 0) defensivePaymentPenalty += Math.abs(netReadyDefenders) * 34;
          if ((turnPlan?.defendersNeededNextTurn || 0) > 0 && netReadyDefenders < 1) defensivePaymentPenalty += 12;
        }
        if ((defensePaymentPressure || lowDeckPaymentPressure) && estimatedDeckPayment > 0) {
          const deckAfterPayment = bot.deck.length - estimatedDeckPayment;
          const erosionAfterPayment = countErosion(bot) + estimatedDeckPayment;
          const unsafeDeckPayment = deckAfterPayment <= 0 || erosionAfterPayment >= 10;
          const stopDeckPaymentAt = profile.riskThresholds?.stopSelfDrawAtDeck ?? (profile.riskThresholds?.lowDeck ?? 10);
          const criticalDeck = profile.riskThresholds?.criticalDeck ?? 3;
          if (unsafeDeckPayment) defensivePaymentPenalty += 90 + estimatedDeckPayment * 12;
          else if (defensePaymentPressure && deckAfterPayment <= Math.max(2, turnPlan?.opponentDamageAfterOneBlock || 0)) defensivePaymentPenalty += 24 + estimatedDeckPayment * 8;
          if (!unsafeDeckPayment && lowDeckPaymentPressure && deckAfterPayment <= stopDeckPaymentAt) {
            const nearCriticalDeck = deckAfterPayment <= criticalDeck + 2;
            defensivePaymentPenalty += (nearCriticalDeck ? 34 : 12) + estimatedDeckPayment * (nearCriticalDeck ? 10 : 5);
            if (card.type !== 'UNIT') defensivePaymentPenalty += 8;
            if (card.type === 'UNIT' && (card.damage || 0) <= 1 && nearCriticalDeck) defensivePaymentPenalty += 8;
          }
          if (card.type === 'UNIT' && (turnPlan?.defendersNeededNextTurn || 0) > 1 && netReadyDefenders < (turnPlan?.defendersNeededNextTurn || 0)) {
            defensivePaymentPenalty += 18;
          }
        }
        const scadiErosionPaymentBonus = 0;
        let closingDevelopmentPenalty = 0;
        if (
          difficulty === 'hard' &&
          turnPlan &&
          isClosingTurnPlan(turnPlan) &&
          gameState.turnCount > 1 &&
          !turnPlan.attackBeforeDeveloping
        ) {
          const sequencingValue = scoreMainPhaseCardSequencingValue(gameState, bot, card, profile);
          const addsImmediateAttacker = card.type === 'UNIT' && card.isrush && bot.unitZone.some(slot => slot === null);
          const tacticalSupport =
            sequencingValue >= 36 ||
            (turnPlan.likelyDefenders > 0 && card.type !== 'UNIT') ||
            (addsImmediateAttacker && (card.damage || 0) > 0);
          if (!tacticalSupport) {
            closingDevelopmentPenalty += 95;
            if (card.type === 'UNIT' && (card.damage || 0) <= 1) closingDevelopmentPenalty += 18;
            if (turnPlan.lethalWindow || turnPlan.tacticalLine === 'lethal' || turnPlan.tacticalLine === 'erosion-lethal') {
              closingDevelopmentPenalty += 35;
            }
          }
        }
        const exhaustedClosingAttackers = exhaustedPaymentUnits
          .map(id => bot.unitZone.find(unit => unit?.gamecardId === id))
          .filter((unit): unit is Card => !!unit && canUnitAttack(gameState, unit));
        const exhaustedClosingDamage = exhaustedClosingAttackers.reduce((sum, unit) => sum + Math.max(0, unit.damage || 0), 0);
        const addedImmediateDamage = card.type === 'UNIT' && card.isrush && bot.unitZone.some(slot => slot === null)
          ? Math.max(0, card.damage || 0)
          : 0;
        let closingPaymentPenalty = 0;
        if (
          difficulty === 'hard' &&
          turnPlan &&
          isClosingTurnPlan(turnPlan) &&
          gameState.turnCount > 1 &&
          exhaustedClosingAttackers.length > 0
        ) {
          const projectedClosingDamage = Math.max(0, turnPlan.totalAvailableDamage - exhaustedClosingDamage + addedImmediateDamage);
          const breaksClosingDamage = projectedClosingDamage < Math.max(1, turnPlan.damageToCritical);
          closingPaymentPenalty +=
            80 +
            exhaustedClosingAttackers.length * 24 +
            exhaustedClosingDamage * 18;
          if (breaksClosingDamage || turnPlan.lethalWindow || turnPlan.tacticalLine === 'lethal' || turnPlan.tacticalLine === 'erosion-lethal') {
            closingPaymentPenalty += 90;
          }
        }
        return {
          card,
          rawScore,
          score: rawScore + defenseDevelopmentBonus + scadiErosionPaymentBonus - defensivePaymentPenalty - closingPaymentPenalty - closingDevelopmentPenalty,
          effectiveCost,
          initialPaymentSelection,
          defensivePaymentPenalty,
          defenseDevelopmentBonus,
          scadiErosionPaymentBonus,
          closingPaymentPenalty,
          closingDevelopmentPenalty,
          exhaustedPaymentUnits,
          estimatedDeckPayment,
          netReadyDefenders,
          projectedReadyDefenders,
        };
      };

      const rankedPlayOptions = difficulty === 'hard'
        ? playableCandidates.map(candidate => buildPlayOption(candidate.card)).sort((a, b) => b.score - a.score)
        : [];
      const emergencyBlockerOption = difficulty === 'hard'
        ? rankedPlayOptions.find(option => {
          if (!turnPlan || option.card.type !== 'UNIT') return false;
          if ((turnPlan.defendersNeededNextTurn || 0) <= 0 && !turnPlan.opponentLethalWithoutBlocks) return false;
          if (option.projectedReadyDefenders <= 0 || option.netReadyDefenders <= 0) return false;
          if (option.estimatedDeckPayment > 0 && (
            bot.deck.length - option.estimatedDeckPayment <= 0 ||
            countErosion(bot) + option.estimatedDeckPayment >= 10
          )) return false;
          return option.defenseDevelopmentBonus > 0;
        })
        : undefined;
      const chosenPlayOption = difficulty === 'hard'
        ? rankedPlayOptions.find(option => option.score > 0) || emergencyBlockerOption
        : playableCards[0] ? buildPlayOption(playableCards[0]) : undefined;
      const cardToPlay = chosenPlayOption?.card;

      if (cardToPlay && chosenPlayOption) {
        let playFailure: string | undefined;
        const effectiveCost = chosenPlayOption.effectiveCost;
        const initialPaymentSelection = chosenPlayOption.initialPaymentSelection;
        const chosenDevelopment = scoreAdventurerGuildDevelopmentPriority(gameState, bot, cardToPlay, profile);
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'PLAY_CARD',
          subject: ServerGameService.getAiCardName(cardToPlay),
          score: chosenPlayOption.score,
          reason: difficulty === 'hard'
            ? '选择当前评分最高的可打出牌，综合费用、身材、伤害、效果角色和卡组偏好。'
            : '简单 AI 选择第一张可打出的牌。',
          details: {
            handSize: bot.hand.length,
            playableCards: playableCandidates.length,
            openUnitSlots: bot.unitZone.filter(slot => slot === null).length,
            cost: effectiveCost,
            type: cardToPlay.type,
            initialPayment: ServerGameService.describeAiPaymentSelection(gameState, initialPaymentSelection),
            rawScore: Number(chosenPlayOption.rawScore.toFixed(1)),
            defensivePaymentPenalty: Number(chosenPlayOption.defensivePaymentPenalty.toFixed(1)),
            defenseDevelopmentBonus: Number(chosenPlayOption.defenseDevelopmentBonus.toFixed(1)),
            closingPaymentPenalty: Number(chosenPlayOption.closingPaymentPenalty.toFixed(1)),
            closingDevelopmentPenalty: Number(chosenPlayOption.closingDevelopmentPenalty.toFixed(1)),
            paymentExhaustsUnits: chosenPlayOption.exhaustedPaymentUnits.length,
            estimatedDeckPayment: chosenPlayOption.estimatedDeckPayment,
            netReadyDefenders: chosenPlayOption.netReadyDefenders,
            projectedReadyDefenders: chosenPlayOption.projectedReadyDefenders,
            developmentTier: chosenDevelopment.tier,
            developmentScore: chosenDevelopment.score ? Number(chosenDevelopment.score.toFixed(1)) : undefined,
            developmentNotes: chosenDevelopment.notes.slice(0, 3).join(', ') || undefined,
          },
          candidates: (difficulty === 'hard' ? rankedPlayOptions : playableCandidates).slice(0, 3).map(candidate => ({
            name: ServerGameService.getAiCardName(candidate.card),
            score: candidate.score,
            note: describePlayableNote(candidate.card),
          })),
        });
        let declaredTargets: DeclaredEffectTarget[] | undefined;
        try {
          const playEffect = ServerGameService.getStoryPlayEffect(cardToPlay);
          const playEffectIndex = playEffect ? cardToPlay.effects?.indexOf(playEffect) ?? -1 : -1;
          if (playEffect && playEffectIndex >= 0 && ServerGameService.hasPreselectTargetSpec(playEffect)) {
            declaredTargets = ServerGameService.chooseBotDeclaredTargetsForEffect(
              gameState,
              playerUid,
              cardToPlay,
              playEffect,
              playEffectIndex
            );
            if (!declaredTargets) throw new Error('没有可指定的合法对象');
          }

          await ServerGameService.playCard(
            gameState,
            playerUid,
            cardToPlay.gamecardId,
            initialPaymentSelection,
            declaredTargets,
            {
              paymentSelectionResolved: true,
              declaredModeId: (declaredTargets as any)?.declaredModeId
            }
          );
          if (turnPlan && isClosingTurnPlan(turnPlan) && !turnPlan.attackBeforeDeveloping && gameState.turnCount > 1) {
            ServerGameService.markBotClosingAttackCommitment(gameState, playerUid, turnPlan);
          }
          // We return and let the next botMove tick handle the next card to ensure stack resolution
          return;
        } catch (e) {
          ServerGameService.clearDeclaredTargetMarkers(gameState, declaredTargets);
          playFailure = e instanceof Error ? e.message : String(e);
          ServerGameService.recordAiDecision(gameState, playerUid, {
            action: 'PLAY_CARD_FAILED',
            subject: ServerGameService.getAiCardName(cardToPlay),
            score: chosenPlayOption.score,
            reason: '候选牌通过基础可打出检查，但实际执行 playCard 时失败，AI 跳过该牌继续判断战斗或结束回合。',
            details: {
              error: playFailure,
              handSize: bot.hand.length,
              playableCards: playableCandidates.length,
              cost: effectiveCost,
              type: cardToPlay.type,
              initialPayment: ServerGameService.describeAiPaymentSelection(gameState, initialPaymentSelection),
              rawScore: Number(chosenPlayOption.rawScore.toFixed(1)),
              defensivePaymentPenalty: Number(chosenPlayOption.defensivePaymentPenalty.toFixed(1)),
              defenseDevelopmentBonus: Number(chosenPlayOption.defenseDevelopmentBonus.toFixed(1)),
              closingPaymentPenalty: Number(chosenPlayOption.closingPaymentPenalty.toFixed(1)),
              closingDevelopmentPenalty: Number(chosenPlayOption.closingDevelopmentPenalty.toFixed(1)),
              estimatedDeckPayment: chosenPlayOption.estimatedDeckPayment,
            },
          });
        }
        (bot as any).lastBotPlayFailure = playFailure;
      } else {
        delete (bot as any).lastBotPlayFailure;
      }

      // If no cards can be played, try to enter battle or end turn
      const canAttack = bot.unitZone.some(c => {
        if (!c || c.isExhausted || c.canAttack === false) return false;
        if ((c as any).battleForbiddenByEffect) return false;
        if ((c as any).data?.cannotAttackOrDefendUntilTurn && (c as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount) return false;
        if ((c.damage || 0) < 1) return false; // Rule 2: Robots will not attack with units having damage < 1
        const isRush = !!c.isrush;
        const wasPlayedThisTurn = c.playedTurn === gameState.turnCount;
        return isRush || !wasPlayedThisTurn;
      });

      if (gameState.turnCount > 1 && canAttack && (bot as any).botReservedAttackTurn !== gameState.turnCount) {
        // Enter battle phase only if we haven't already exhausted all attackers this AI iteration
        // To prevent infinite re-entry to BATTLE_DECLARATION from MAIN, we check if there's truly something new to do
        // console.log('[Bot] Entering Battle Phase');
        const attackCandidates = bot.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'ENTER_BATTLE',
          subject: `${attackCandidates.length} 个可攻击单位`,
          reason: '没有更高优先级的可打出牌，且场上存在可攻击单位，进入战斗阶段推进伤害。',
          details: {
            playableCards: playableCandidates.length,
            attackers: attackCandidates.length,
          },
          candidates: attackCandidates.slice(0, 3).map(card => ({
            name: ServerGameService.getAiCardName(card),
            score: scoreAttackCandidate(gameState, bot, card, profile),
            note: describeAttackNote(card),
          })),
        });
        await ServerGameService.advancePhase(gameState, 'DECLARE_BATTLE', playerUid, onUpdate);
      } else {
        // console.log('[Bot] Ending Turn');
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'END_TURN',
          subject: '结束回合',
          reason: (bot as any).lastBotPlayFailure
            ? '存在可打出候选牌，但最高优先级牌执行失败且没有可攻击单位，结束回合。'
            : gameState.turnCount <= 1
            ? '首回合或当前规则限制下不进入战斗，结束回合。'
            : '没有可打出的牌，也没有合适的可攻击单位，结束回合。',
          details: {
            playableCards: playableCandidates.length,
            canAttack,
            turn: gameState.turnCount,
            playFailure: (bot as any).lastBotPlayFailure,
          },
        });
        delete (bot as any).lastBotPlayFailure;
        await ServerGameService.advancePhase(gameState, 'DECLARE_END', playerUid, onUpdate);
      }
      return;
    }

    // Battle Declaration Phase
    if (gameState.phase === 'BATTLE_DECLARATION' && bot.isTurn) {
      const forcedAttackUnit = ServerGameService.getForcedAttackUnit(gameState, playerUid);
      const attackCandidates = bot.unitZone
        .filter(unit => canUnitAttack(gameState, unit)) as Card[];
      const scoredAttackers = attackCandidates
        .map(card => ({
          card,
          score: scoreAttackCandidate(gameState, bot, card, profile),
        }))
        .sort((a, b) => b.score - a.score);
      const opponentUid = gameState.playerIds.find(uid => uid !== playerUid);
      const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
      const opponentErosion = opponent ? countErosion(opponent) : 0;
      const totalAvailableDamage = attackCandidates.reduce((sum, unit) => sum + (unit.damage || 0), 0);
      const attackDamages = attackCandidates
        .map(unit => Math.max(0, unit.damage || 0))
        .sort((a, b) => b - a);
      const likelyDefenders = opponent
        ? opponent.unitZone.filter(unit =>
          unit &&
          !unit.isExhausted &&
          !(unit as any).battleForbiddenByEffect &&
          !((unit as any).data?.cannotDefendTurn === gameState.turnCount) &&
          !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount)
        ).length
        : 0;
      const damageThroughLikelyDefenders = Math.max(0, totalAvailableDamage -
        attackDamages.slice(0, likelyDefenders).reduce((sum, damage) => sum + damage, 0));
      const damageToCritical = damageToErosionCritical(opponent);
      const erosionPressureWindow = !!opponent && !opponent.isGoddessMode && damageThroughLikelyDefenders >= damageToCritical;
      const lethalWindow = opponent ? battleDamageWouldDeckOut(totalAvailableDamage, opponent) : false;
      const ownErosion = turnPlan?.ownErosion ?? countErosion(bot);
      const opponentPotentialDamage = turnPlan?.opponentPotentialDamage ?? (opponent
        ? opponent.unitZone.filter(Boolean).reduce((sum, unit) => sum + (unit?.damage || 0), 0)
        : 0);
      const dynamicCounterPressure =
        opponentPotentialDamage > 0 ||
        !!turnPlan?.opponentLethalWithoutBlocks ||
        !!turnPlan?.opponentLethalThroughOneBlock;
      const forcingAttackWindow = difficulty === 'hard' && !!turnPlan && (
        isClosingTurnPlan(turnPlan) ||
        turnPlan.tacticalLine === 'lethal' ||
        turnPlan.tacticalLine === 'erosion-lethal' ||
        turnPlan.lethalWindow ||
        turnPlan.damageThroughLikelyDefenders >= Math.max(1, turnPlan.damageToCritical)
      );
      const shouldReserveDefenders =
        difficulty === 'hard' &&
        !forcedAttackUnit &&
        !forcingAttackWindow &&
        !turnPlan?.desperationAttack &&
        dynamicCounterPressure &&
        !lethalWindow &&
        !erosionPressureWindow &&
        attackCandidates.length > 0 &&
        (turnPlan?.reserveDefenders || 0) > 0;
      const reserveCount = shouldReserveDefenders ? Math.min(turnPlan?.reserveDefenders || 0, attackCandidates.length) : 0;
      const previousReservedIds = (bot as any).botReservedDefenderTurn === gameState.turnCount
        ? new Set<string>((bot as any).botReservedDefenderIds || [])
        : new Set<string>();
      const reservedDefenderIds = new Set([...attackCandidates]
        .filter(card => dynamicCounterPressure && previousReservedIds.has(card.gamecardId))
        .map(card => card.gamecardId));
      const shouldHoldOnlyAttacker =
        difficulty === 'hard' &&
        !forcedAttackUnit &&
        !forcingAttackWindow &&
        !turnPlan?.desperationAttack &&
        dynamicCounterPressure &&
        !lethalWindow &&
        !erosionPressureWindow &&
        attackCandidates.length === 1 &&
        (
          previousReservedIds.has(attackCandidates[0].gamecardId) ||
          (turnPlan?.reserveDefenders || 0) >= attackCandidates.length ||
          (turnPlan?.mode === 'defense' && opponentPotentialDamage >= Math.max(4, 10 - ownErosion)) ||
          bot.deck.length <= Math.max(4, opponentPotentialDamage + 2)
        );

      if (reservedDefenderIds.size === 0 && shouldHoldOnlyAttacker) {
        reservedDefenderIds.add(attackCandidates[0].gamecardId);
      }

      if (reservedDefenderIds.size === 0 && reserveCount > 0) {
        [...attackCandidates]
          .sort((a, b) =>
            (scoreCardValue(b, profile) + (b.power || 0) / 500 + (b.damage || 0) * 2) -
            (scoreCardValue(a, profile) + (a.power || 0) / 500 + (a.damage || 0) * 2)
          )
          .slice(0, reserveCount)
          .forEach(card => reservedDefenderIds.add(card.gamecardId));
      }
      if (reservedDefenderIds.size > 0) {
        (bot as any).botReservedDefenderTurn = gameState.turnCount;
        (bot as any).botReservedDefenderIds = [...reservedDefenderIds];
      } else if ((bot as any).botReservedDefenderTurn === gameState.turnCount && (!dynamicCounterPressure || attackCandidates.length === 0)) {
        delete (bot as any).botReservedDefenderIds;
      }
      const attackPool = reservedDefenderIds.size > 0
        ? attackCandidates.filter(card => !reservedDefenderIds.has(card.gamecardId))
        : attackCandidates;
      const scoredAvailableAttackers = attackPool
        .map(card => ({
          card,
          score: scoreAttackCandidate(gameState, bot, card, profile),
        }))
        .sort((a, b) => b.score - a.score);
      const relaxedAttackThreshold =
        forcingAttackWindow ||
        isClosingTurnPlan(turnPlan) ||
        lethalWindow ||
        erosionPressureWindow ||
        (!!turnPlan?.desperationAttack && (lethalWindow || erosionPressureWindow));
      const minimumAttackScore =
        difficulty === 'hard' && !forcedAttackUnit
          ? relaxedAttackThreshold
            ? 0
            : (turnPlan?.mode === 'defense' || turnPlan?.mode === 'stabilize' || turnPlan?.desperationAttack ? 30 : 14)
          : 0;
      const attacker = difficulty === 'hard'
        ? forcedAttackUnit || (scoredAvailableAttackers[0]?.score > minimumAttackScore ? scoredAvailableAttackers[0].card : undefined)
        : forcedAttackUnit || bot.unitZone.find(c => {
        if (!c || c.isExhausted || c.canAttack === false) return false;
        if ((c as any).battleForbiddenByEffect) return false;
        if ((c as any).data?.cannotAttackOrDefendUntilTurn && (c as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount) return false;
        if ((c.damage || 0) < 1) return false; // Rule 2: Robots will not attack with units having damage < 1
        const isRush = !!c.isrush;
        const wasPlayedThisTurn = c.playedTurn === gameState.turnCount;
        return isRush || !wasPlayedThisTurn;
      });
      if (attacker) {
        if (
          difficulty === 'hard' &&
          (
            isClosingTurnPlan(turnPlan) ||
            erosionPressureWindow ||
            lethalWindow ||
            totalAvailableDamage >= Math.max(1, damageToCritical)
          )
        ) {
          (bot as any).botClosingAttackStartedTurn = gameState.turnCount;
        }
        ServerGameService.markBotClosingAttackCommitment(gameState, playerUid, turnPlan);
        const chosen = scoredAvailableAttackers.find(candidate => candidate.card.gamecardId === attacker.gamecardId) ||
          scoredAttackers.find(candidate => candidate.card.gamecardId === attacker.gamecardId);
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'ATTACK',
          subject: ServerGameService.getAiCardName(attacker),
          score: forcedAttackUnit ? undefined : chosen?.score,
          reason: forcedAttackUnit
            ? '该单位受到强制攻击要求，必须宣告攻击。'
            : difficulty === 'hard'
              ? lethalWindow
                ? '当前总可攻击伤害接近胜利线，按斩杀压力和诱导防御价值安排攻击顺序。'
                : '根据对手侵蚀压力、可防御者和单位价值选择本次攻击者。'
              : '简单 AI 选择第一个可攻击单位。',
          details: {
            damage: attacker.damage || 0,
            power: attacker.power || 0,
            canAttackers: attackCandidates.length,
            opponentErosion,
            totalAvailableDamage,
            likelyDefenders,
            damageThroughLikelyDefenders,
            damageToCritical,
            lethalWindow,
            erosionPressureWindow,
            reservedDefenders: reservedDefenderIds.size,
            opponentPotentialDamage,
            dynamicCounterPressure,
            ownErosion,
            planMode: turnPlan?.mode,
            minimumAttackScore,
          },
          candidates: scoredAvailableAttackers.slice(0, 3).map(candidate => ({
            name: ServerGameService.getAiCardName(candidate.card),
            score: candidate.score,
            note: describeAttackNote(candidate.card),
          })),
        });
        await ServerGameService.declareAttack(gameState, playerUid, [attacker.gamecardId], false, undefined, undefined, onUpdate);
      } else {
        const heldUnfavorableAttack = difficulty === 'hard' && !forcedAttackUnit && scoredAvailableAttackers.length > 0;
        if (reservedDefenderIds.size > 0) {
          (bot as any).botReservedAttackTurn = gameState.turnCount;
        } else if (heldUnfavorableAttack) {
          (bot as any).botReservedAttackTurn = gameState.turnCount;
          (bot as any).botHeldUnfavorableAttackTurn = gameState.turnCount;
        }
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: reservedDefenderIds.size > 0 || heldUnfavorableAttack ? 'HOLD_ATTACKERS' : 'RETURN_MAIN',
          subject: reservedDefenderIds.size > 0
            ? `${reservedDefenderIds.size} reserved defenders`
            : heldUnfavorableAttack
              ? 'unfavorable attacks'
              : '无攻击者',
          reason: reservedDefenderIds.size > 0
            ? 'Hold remaining ready units for defense because the current attack is not lethal and the opponent can pressure back.'
            : heldUnfavorableAttack
              ? 'Hold attackers because available attacks would trade down into stronger ready defenders without a clear closing purpose.'
              : '战斗宣言阶段没有合法攻击单位，返回主要阶段继续判断。',
          details: {
            canAttackers: attackCandidates.length,
            reservedDefenders: reservedDefenderIds.size,
            heldUnfavorableAttack,
            bestAttackScore: scoredAvailableAttackers[0]?.score,
            minimumAttackScore,
            damageThroughLikelyDefenders,
            opponentPotentialDamage,
            dynamicCounterPressure,
            ownErosion,
            ownDeck: bot.deck.length,
            planMode: turnPlan?.mode,
          },
        });
        await ServerGameService.advancePhase(gameState, 'RETURN_MAIN', playerUid, onUpdate);
      }
      return;
    }

    // Battle Free Phase (as Turn Player)
    if (gameState.phase === 'BATTLE_FREE' && bot.isTurn) {
      if (!gameState.battleState?.askConfront) {
        if (difficulty === 'hard' && await ServerGameService.tryPlayBotBattleStory(gameState, playerUid, 'BATTLE_FREE', turnPlan?.minBattleEffectScore ?? 9.5, onUpdate)) {
          return;
        }

        if (difficulty === 'hard' && await ServerGameService.tryActivateBotEffect(gameState, playerUid, 'BATTLE_FREE', turnPlan?.minBattleEffectScore ?? 9.5, onUpdate)) {
          return;
        }

        // Bot proposes calculation to give player a chance to counter
        // console.log('[Bot] Proposing damage calculation in BATTLE_FREE');
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'PROPOSE_DAMAGE',
          subject: (gameState.battleState?.attackers || [])
            .map(id => ServerGameService.getAiCardName(ServerGameService.findCardById(gameState, id)))
            .join('、') || '战斗',
          reason: '没有需要继续发动的战斗中效果，推进到伤害计算。',
          details: {
            attackers: gameState.battleState?.attackers?.length || 0,
          },
        });
        await ServerGameService.advancePhase(gameState, 'PROPOSE_DAMAGE_CALCULATION', playerUid, onUpdate);
      } else if (gameState.battleState.askConfront === 'ASKING_TURN_PLAYER') {
        // Player declined, bot now asked if it wants to counter? 
        // Bot usually just declines to get to resolution.
        // console.log('[Bot] Declining confrontation in BATTLE_FREE (ASKING_TURN_PLAYER)');
        ServerGameService.recordAiDecision(gameState, playerUid, {
          action: 'PASS_BATTLE_WINDOW',
          subject: '战斗自由时点',
          reason: '对手已放弃对抗，AI 不追加发动效果，继续推进战斗结算。',
          details: {
            askConfront: gameState.battleState.askConfront,
          },
        });
        await ServerGameService.advancePhase(gameState, 'DECLINE_CONFRONTATION', playerUid, onUpdate);
      }
      return;
    }

    // Damage Calculation Phase
    if (gameState.phase === 'DAMAGE_CALCULATION') {
      if (gameState.battleState) {
        await ServerGameService.resolveDamage(gameState);
      } else {
        gameState.phase = 'MAIN';
        gameState.phaseTimerStart = Date.now();
      }
      return;
    }
  },

  // Helper: Assign unique gamecardId to all cards in a deck
  assignGameCardIds(deck: Card[]): Card[] {
    return deck.map((card, index) => ({
      ...card,
      gamecardId: `${card.id}_${index}_${Math.random().toString(36).substring(2, 7)}`
    }));
  },

  // Helper: Shuffle deck
  shuffle(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  drawInitialHand(player: PlayerState, count = 4, preferredCardIds?: readonly string[]) {
    const drawnCards: Card[] = [];

    for (const cardId of preferredCardIds || []) {
      if (drawnCards.length >= count) break;
      const cardIndex = player.deck.findIndex(card => card?.id === cardId);
      if (cardIndex === -1) continue;
      const [card] = player.deck.splice(cardIndex, 1);
      if (card) drawnCards.push(card);
    }

    while (drawnCards.length < count) {
      const card = player.deck.pop();
      if (!card) break;
      drawnCards.push(card);
    }

    drawnCards.forEach(card => {
      card.cardlocation = 'HAND';
      player.hand.push(card);
    });
  },

  async createPracticeGameState(
    deck: Card[],
    playerUid: string | number,
    playerName: string,
    turnTimerLimit?: number,
    botDifficulty: BotDifficulty = 'simple',
    botDeckProfileId?: string,
    botDeck?: Card[]
  ): Promise<GameState> {
    const playerUidStr = playerUid.toString();
    const initializedDeck = deck.map(card => ({
      ...card,
      baseColorReq: card.baseColorReq ?? { ...(card.colorReq || {}) },
      basePower: card.basePower ?? card.power,
      baseDamage: card.baseDamage ?? card.damage,
      baseIsrush: card.baseIsrush ?? card.isrush,
      isAnnihilation: card.isAnnihilation,
      baseAnnihilation: card.baseAnnihilation ?? card.isAnnihilation,
      isShenyi: card.isShenyi,
      baseShenyi: card.baseShenyi ?? card.isShenyi,
      isHeroic: card.isHeroic,
      baseHeroic: card.baseHeroic ?? card.isHeroic,
      hasAttackedThisTurn: false,
      usedShenyiThisTurn: false,
      baseCanAttack: card.baseCanAttack ?? card.canAttack,
      baseGodMark: card.baseGodMark ?? card.godMark,
      baseAcValue: card.baseAcValue ?? card.acValue,
      baseCanActivateEffect: card.baseCanActivateEffect ?? card.canActivateEffect ?? true,
      cardlocation: 'DECK',
      displayState: 'FRONT_FACEDOWN'
    }));
    const initializedBotDeck = (botDeck || deck).map(card => ({
      ...card,
      baseColorReq: card.baseColorReq ?? { ...(card.colorReq || {}) },
      basePower: card.basePower ?? card.power,
      baseDamage: card.baseDamage ?? card.damage,
      baseIsrush: card.baseIsrush ?? card.isrush,
      isAnnihilation: card.isAnnihilation,
      baseAnnihilation: card.baseAnnihilation ?? card.isAnnihilation,
      isShenyi: card.isShenyi,
      baseShenyi: card.baseShenyi ?? card.isShenyi,
      isHeroic: card.isHeroic,
      baseHeroic: card.baseHeroic ?? card.isHeroic,
      hasAttackedThisTurn: false,
      usedShenyiThisTurn: false,
      baseCanAttack: card.baseCanAttack ?? card.canAttack,
      baseGodMark: card.baseGodMark ?? card.godMark,
      baseAcValue: card.baseAcValue ?? card.acValue,
      baseCanActivateEffect: card.baseCanActivateEffect ?? card.canActivateEffect ?? true,
      cardlocation: 'DECK',
      displayState: 'FRONT_FACEDOWN'
    }));
    const botProfile = botDeckProfileId ? getDeckAiProfile(botDeckProfileId) : undefined;

    const myState: PlayerState = {
      uid: playerUidStr,
      displayName: playerName,
      deck: ServerGameService.assignGameCardIds(ServerGameService.shuffle([...initializedDeck])),
      hand: [],
      grave: [],
      exile: [],
      itemZone: Array(6).fill(null),
      erosionFront: Array(10).fill(null),
      erosionBack: Array(10).fill(null),
      unitZone: Array(6).fill(null),
      playZone: [],
      isTurn: false,
      isFirst: false,
      mulliganDone: false,
      hasExhaustedThisTurn: [],
      isHandPublic: 0,
      timeRemaining: turnTimerLimit ? turnTimerLimit * 1000 : GAME_TIMEOUTS.MAIN_PHASE_TOTAL,
      confrontationStrategy: 'AUTO',
    };

    const botState: PlayerState = {
      uid: 'BOT_PLAYER',
      displayName: botProfile ? `${botProfile.displayName} AI` : '神蚀 AI',
      deck: ServerGameService.assignGameCardIds(ServerGameService.shuffle([...initializedBotDeck])),
      hand: [],
      grave: [],
      exile: [],
      itemZone: Array(6).fill(null),
      erosionFront: Array(10).fill(null),
      erosionBack: Array(10).fill(null),
      unitZone: Array(6).fill(null),
      playZone: [],
      isTurn: false,
      isFirst: false,
      mulliganDone: true,
      hasExhaustedThisTurn: [],
      isHandPublic: 0,
      timeRemaining: turnTimerLimit ? turnTimerLimit * 1000 : GAME_TIMEOUTS.MAIN_PHASE_TOTAL,
      confrontationStrategy: 'AUTO',
      botDifficulty,
      botDeckProfileId,
    };

    ServerGameService.drawInitialHand(myState, 4);
    ServerGameService.drawInitialHand(
      botState,
      4,
      botDifficulty === 'hard' ? getHardAiOpeningCardIds(botDeckProfileId) : undefined
    );

    const gameState: GameState = {
      gameId: "temp",
      phase: 'FIRST_PLAYER_CHOICE',
      currentTurnPlayer: 0,
      turnCount: 0,
      isCountering: 0,
      counterStack: [],
      passCount: 0,
      playerIds: [playerUidStr, 'BOT_PLAYER'],
      gameStatus: 1,
      logs: ['练习赛开始。请选择先攻或后攻。'],
      players: {
        [playerUidStr]: myState,
        'BOT_PLAYER': botState
      },
      mode: 'practice',
      botDifficulty,
      botDeckProfiles: botDeckProfileId ? { BOT_PLAYER: botDeckProfileId } : undefined,
      phaseTimerStart: 0,
      firstPlayerChoice: {
        chooserUid: playerUidStr,
        source: 'PRACTICE',
        startedAt: Date.now(),
        timeoutMs: 30000
      },
      turnTimerLimit,
      triggeredEffectsQueue: [],
      pendingResolutions: [],
      effectUsage: {}
    };

    return gameState;
  },

  async createMatchGameState(uid1: string, deck1: Card[], uid2: string, deck2: Card[], turnTimerLimit?: number): Promise<GameState> {
    const init1 = ServerGameService.assignGameCardIds(ServerGameService.shuffle(deck1.map(c => ({ ...c, cardlocation: 'DECK', displayState: 'FRONT_FACEDOWN' }))));
    const init2 = ServerGameService.assignGameCardIds(ServerGameService.shuffle(deck2.map(c => ({ ...c, cardlocation: 'DECK', displayState: 'FRONT_FACEDOWN' }))));

    const p1: PlayerState = {
      uid: uid1, displayName: 'Player 1', deck: init1, hand: [], grave: [], exile: [], itemZone: Array(6).fill(null), erosionFront: Array(10).fill(null), erosionBack: Array(10).fill(null), unitZone: Array(6).fill(null), playZone: [],
      isTurn: false, isFirst: false, mulliganDone: false, hasExhaustedThisTurn: [],
      isHandPublic: 0,
      timeRemaining: turnTimerLimit ? turnTimerLimit * 1000 : GAME_TIMEOUTS.MAIN_PHASE_TOTAL,
      confrontationStrategy: 'AUTO',
    };
    const p2: PlayerState = {
      uid: uid2, displayName: 'Player 2', deck: init2, hand: [], grave: [], exile: [], itemZone: Array(6).fill(null), erosionFront: Array(10).fill(null), erosionBack: Array(10).fill(null), unitZone: Array(6).fill(null), playZone: [],
      isTurn: false, isFirst: false, mulliganDone: false, hasExhaustedThisTurn: [],
      isHandPublic: 0,
      timeRemaining: turnTimerLimit ? turnTimerLimit * 1000 : GAME_TIMEOUTS.MAIN_PHASE_TOTAL,
      confrontationStrategy: 'AUTO',
    };

    for (let i = 0; i < 4; i++) {
      const c1 = p1.deck.pop(); if (c1) { c1.cardlocation = 'HAND'; p1.hand.push(c1); }
      const c2 = p2.deck.pop(); if (c2) { c2.cardlocation = 'HAND'; p2.hand.push(c2); }
    }

    const gameState: GameState = {
      gameId: "match", phase: 'RPS', currentTurnPlayer: 0, turnCount: 0, isCountering: 0, counterStack: [],
      passCount: 0,
      playerIds: [uid1, uid2], gameStatus: 1, logs: ['匹配成功。开始猜拳决定先后攻选择权。'],
      players: { [uid1]: p1, [uid2]: p2 },
      mode: 'match',
      rps: {
        round: 1,
        startedAt: Date.now(),
        timeoutMs: 30000,
        choices: {}
      },
      phaseTimerStart: 0,
      turnTimerLimit,
      triggeredEffectsQueue: [],
      pendingResolutions: [],
      effectUsage: {}
    };

    return gameState;
  },
};

// Link shared service to server-side implementation
(GameService as any).destroyUnit = ServerGameService.destroyUnit;
(GameService as any).triggerGoddessTransformation = ServerGameService.triggerGoddessTransformation;
(GameService as any).refreshCardAsNewInstance = ServerGameService.refreshCardAsNewInstance;
AtomicEffectExecutor.setDrawCardSelector((gameState, playerUid, _player, context) =>
  ServerGameService.chooseHardAiDrawCard(gameState, playerUid, context)
);
