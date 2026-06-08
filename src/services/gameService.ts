/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { socket } from '../socket';
import { GameState, Card, CardEffect, TriggerLocation, GameEvent, PlayerState } from '../types/game';
import { getEntryRestrictionReason, satisfiesHighAlchemyEntryRestriction } from '../lib/highAlchemy';
import { cardHasEffectiveColor, getColorRequirementResult } from '../lib/effectiveColors';

const isFullEffectSilencedThisTurn = (gameState: GameState | null, card: Card) =>
  !!gameState &&
  (
    (card as any).data?.permanentEffectSilenced ||
    (card as any).data?.fullEffectSilencedUntilOwnStartUid ||
    ((card as any).data?.fullEffectSilencedTurn !== undefined &&
      (card as any).data.fullEffectSilencedTurn >= gameState.turnCount)
  ) &&
  (
    !(card as any).data?.fullEffectSilencedZones ||
    (card as any).data.fullEffectSilencedZones.includes(card.cardlocation as TriggerLocation)
  );

const isPseudoGoddessActiveForCard = (gameState: GameState | null, card?: Card | null) =>
  !!gameState && !!card && (card as any).data?.pseudoGoddessTenPlusTurn === gameState.turnCount;

const isTenPlusEffect = (effect: CardEffect) => !!effect.erosionTotalLimit && effect.erosionTotalLimit[0] >= 10;

const isGoddessTierEffect = (effect: CardEffect) => {
  if (isTenPlusEffect(effect)) return true;

  const triggerEvents = Array.isArray(effect.triggerEvent)
    ? effect.triggerEvent
    : effect.triggerEvent
      ? [effect.triggerEvent]
      : [];

  return triggerEvents.includes('GODDESS_TRANSFORMATION');
};

const effectHasErosionRequirement = (effect: CardEffect) =>
  !!effect.erosionFrontLimit ||
  !!effect.erosionBackLimit ||
  !!effect.erosionTotalLimit;

const effectHasSubGoddessErosionRequirement = (effect: CardEffect) =>
  effectHasErosionRequirement(effect) && !isGoddessTierEffect(effect);

const getEffectivePlayerForCard = (gameState: GameState | null, player: PlayerState | undefined, card?: Card | null) => {
  if (!player) return player;
  return isPseudoGoddessActiveForCard(gameState, card) ? { ...player, isGoddessMode: true } : player;
};

const canUse204000145AsPaymentSubstitute = (paymentCard: Card | undefined, cardColor?: string, cost?: number, playingCardId?: string) =>
  !!paymentCard &&
  paymentCard.id === '204000145' &&
  paymentCard.gamecardId !== playingCardId &&
  cardColor === 'BLUE' &&
  !!cost &&
  cost > 0 &&
  cost <= 3;

const canUse205000136AsPaymentSubstitute = (paymentCard: Card | undefined, cardColor?: string, cost?: number, playingCardId?: string) =>
  !!paymentCard &&
  paymentCard.id === '205000136' &&
  paymentCard.gamecardId !== playingCardId &&
  cardColor === 'YELLOW' &&
  !!cost &&
  cost > 0 &&
  cost <= 3;

const canUseStoryPaymentSubstitute = (paymentCard: Card | undefined, playingCard: Card | undefined, cost?: number, playingCardId?: string) => {
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
};

type EffectivePlayCostDetails = {
  baseCost: number;
  cost: number;
  sourceCardName?: string;
  description?: string;
};

const costReductionDescription = (baseCost: number, cost: number, reason?: string) => {
  if (cost >= baseCost) return undefined;
  const change = cost <= 0 ? 'ACCESS值变为0' : `ACCESS值-${baseCost - cost}`;
  return reason ? `${reason}：${change}` : change;
};

const costDetails = (
  baseCost: number,
  cost: number,
  sourceCardName: string | undefined,
  reason?: string
): EffectivePlayCostDetails => ({
  baseCost,
  cost,
  sourceCardName,
  description: costReductionDescription(baseCost, cost, reason)
});

const getEffectivePlayCostDetails = (gameState: GameState | null, player: PlayerState, card: Card): EffectivePlayCostDetails => {
  const baseCost = card.id === '202000080' ? 6 : (card.baseAcValue ?? card.acValue ?? 0);
  const soulDevourCount = gameState && card.cardlocation === 'HAND'
    ? Number((player as any)[`soulDevourActivatedTurn_${gameState.turnCount}`] || 0)
    : 0;
  const thunderPriestCount = gameState && card.cardlocation === 'HAND'
    ? player.unitZone.filter(unit =>
      unit?.id === '102060321' &&
      !isFullEffectSilencedThisTurn(gameState, unit) &&
      unit.effects?.some(effect => effect.id === '102060321_hand_access_discount')
    ).length
    : 0;
  const soulDevourDiscount = soulDevourCount * thunderPriestCount;
  const thunderPriestSource = thunderPriestCount > 0
    ? player.unitZone.find(unit =>
      unit?.id === '102060321' &&
      !isFullEffectSilencedThisTurn(gameState, unit) &&
      unit.effects?.some(effect => effect.id === '102060321_hand_access_discount')
    )
    : undefined;
  const isThunderUnit =
    card.type === 'UNIT' &&
    (
      String(card.faction || '').includes('雷霆') ||
      card.fullName.includes('雷霆') ||
      !!card.specialName?.includes('雷霆')
    );
  if (soulDevourDiscount > 0 && card.type === 'UNIT' && (isThunderUnit || (card.color === 'RED' && !card.godMark))) {
    return costDetails(
      baseCost,
      Math.max(0, baseCost - soulDevourDiscount),
      thunderPriestSource?.fullName || '炎雷祭司',
      `噬魂发动${soulDevourCount}次`
    );
  }
  if (card.id === '101140062') {
    const unitCount = player.unitZone.filter(c => c !== null).length;
    return costDetails(baseCost, Math.max(0, baseCost - unitCount), card.fullName);
  }
  if (card.id === '202050034' && player.isGoddessMode) {
    return costDetails(baseCost, 0, card.fullName, '女神化');
  }
  if (card.id === '105000117') {
    const hasUnits = player.unitZone.some(cardInZone => cardInZone !== null);
    const hasFaceUpErosion = player.erosionFront.some(cardInZone => cardInZone !== null && cardInZone.displayState === 'FRONT_UPRIGHT');
    if (!hasUnits && !hasFaceUpErosion) return costDetails(baseCost, 0, card.fullName, '没有单位且没有正面侵蚀');
  }
  if (card.id === '205110063') {
    const itemCount = player.itemZone.filter(c => c !== null).length;
    return costDetails(baseCost, Math.max(0, baseCost - itemCount), card.fullName);
  }
  if (card.id === '103090247') {
    const xenobuCount = player.unitZone.filter(unit => unit?.faction === '瑟诺布').length;
    return costDetails(baseCost, Math.max(0, baseCost - xenobuCount), card.fullName);
  }
  if (
    (card.id === '201000140' || card.id === '201000040' || card.fullName === '解放之光') &&
    player.exile.some(c => c.id === card.id || c.id === '201000140' || c.id === '201000040' || c.fullName === card.fullName)
  ) {
    return costDetails(baseCost, 0, '解放之光', '放逐区有《解放之光》');
  }
  if (card.id === '202000080' && player.unitZone.some(unit => unit?.isShenyi)) {
    const source = player.unitZone.find(unit => unit?.isShenyi);
    return costDetails(baseCost, Math.max(0, baseCost - 4), source?.fullName || '神依单位');
  }
  if ((card as any).data?.spiritCostTarget103080185) {
    return costDetails(baseCost, 0, '天鬼图腾「暴龙」', '指定天鬼图腾「暴龙」');
  }
  if (
    card.type === 'UNIT' &&
    card.faction === '圣王国' &&
    (player as any).holyKingdomUnitDiscountUsedTurn !== gameState?.turnCount &&
    player.unitZone.some(unit => unit?.id === '101130153')
  ) {
    const source = player.unitZone.find(unit => unit?.id === '101130153');
    return costDetails(baseCost, Math.max(0, baseCost - 1), source?.fullName || '祷告的群众', '每回合第1张<圣王国>单位');
  }
  return { baseCost, cost: baseCost };
};

const getEffectivePlayCost = (gameState: GameState | null, player: PlayerState, card: Card) => {
  return getEffectivePlayCostDetails(gameState, player, card).cost;
};

const hasGlobalDisableAllActivated = (gameState: GameState | null, affectedPlayerUid?: string) => {
  if (!gameState) return false;
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
};

const isSpiritDiscountCard = (card: Card) => card.id === '203000075' || card.id === '203000076';

const hasSpiritDiscountTargetOnField = (gameState: GameState | null, card: Card) =>
  !!gameState &&
  isSpiritDiscountCard(card) &&
  Object.values(gameState.players).some(player =>
    player.unitZone.some(unit => unit?.id === '103080185')
  );

const hasGlobalDisableErosionRequirementEffects = (gameState: GameState | null) => {
  if (!gameState) return false;
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
};

export const GameService = {
  isPseudoGoddessActiveForCard(gameState: GameState | null, card?: Card | null) {
    return isPseudoGoddessActiveForCard(gameState, card);
  },

  isTenPlusEffect(effect: CardEffect) {
    return isTenPlusEffect(effect);
  },

  isGoddessTierEffect(effect: CardEffect) {
    return isGoddessTierEffect(effect);
  },

  effectHasErosionRequirement(effect: CardEffect) {
    return effectHasErosionRequirement(effect);
  },

  effectHasSubGoddessErosionRequirement(effect: CardEffect) {
    return effectHasSubGoddessErosionRequirement(effect);
  },

  hasGlobalDisableErosionRequirementEffects(gameState: GameState | null) {
    return hasGlobalDisableErosionRequirementEffects(gameState);
  },

  getEffectivePlayerForCard(gameState: GameState | null, player: PlayerState | undefined, card?: Card | null) {
    return getEffectivePlayerForCard(gameState, player, card);
  },

  getEffectivePlayCost(gameState: GameState | null, player: PlayerState, card: Card) {
    return getEffectivePlayCost(gameState, player, card);
  },

  getEffectivePlayCostDetails(gameState: GameState | null, player: PlayerState, card: Card) {
    return getEffectivePlayCostDetails(gameState, player, card);
  },

  async advancePhase(gameId: string, action?: any) {
    socket.emit('gameAction', { gameId, action: 'END_PHASE', payload: action });
  },

  async performMulligan(gameId: string, cardIds: string[]) {
    socket.emit('gameAction', { gameId, action: 'MULLIGAN', payload: cardIds });
  },

  async submitRpsChoice(gameId: string, choice: 'ROCK' | 'PAPER' | 'SCISSORS') {
    socket.emit('gameAction', { gameId, action: 'RPS_CHOICE', payload: { choice } });
  },

  async chooseFirstPlayer(gameId: string, firstPlayerUid: string) {
    socket.emit('gameAction', { gameId, action: 'CHOOSE_FIRST_PLAYER', payload: { firstPlayerUid } });
  },

  async playCard(gameId: string, playerId: string, cardId: string, paymentSelection: any) {
    socket.emit('gameAction', { gameId, action: 'PLAY_CARD', payload: { cardId, paymentSelection } });
  },

  async declareAttack(gameId: string, playerId: string, attackerIds: string[], isAlliance: boolean, targetId?: string, skipDefense?: boolean) {
    socket.emit('gameAction', { gameId, action: 'ATTACK', payload: { attackerIds, isAlliance, targetId, skipDefense } });
  },

  async declareDefense(gameId: string, playerId: string, defenderId?: string) {
    socket.emit('gameAction', { gameId, action: 'DEFEND', payload: { defenderId } });
  },

  async passConfrontation(gameId: string) {
    socket.emit('gameAction', { gameId, action: 'PASS_CONFRONTATION' });
  },

  async activateEffect(gameId: string, playerId: string, cardId: string, effectIndex: number) {
    socket.emit('gameAction', { gameId, action: 'ACTIVATE_EFFECT', payload: { cardId, effectIndex } });
  },

  async setConfrontationStrategy(gameId: string, strategy: 'ON' | 'AUTO' | 'OFF') {
    socket.emit('gameAction', { gameId, action: 'SET_CONFRONTATION_STRATEGY', payload: { strategy } });
  },

  async resolvePlay(gameId: string) {
    socket.emit('gameAction', { gameId, action: 'RESOLVE_PLAY' });
  },

  async resolveDamage(gameId: string) {
    socket.emit('gameAction', { gameId, action: 'RESOLVE_DAMAGE' });
  },

  async handleErosionChoice(gameId: string, _playerId: string, choice: 'A' | 'C', selectedCardId?: string) {
    socket.emit('gameAction', { gameId, action: 'EROSION_CHOICE', payload: { choice, selectedCardId } });
  },

  async handleShenyiChoice(gameId: string, action: 'CONFIRM_SHENYI' | 'DECLINE_SHENYI') {
    socket.emit('gameAction', { gameId, action });
  },

  async discardCard(gameId: string, playerId: string, cardId: string) {
    socket.emit('gameAction', { gameId, action: 'DISCARD', payload: { cardId } });
  },

  async submitQueryChoice(gameId: string, queryId: string, selections: string[]) {
    socket.emit('gameAction', { gameId, action: 'SUBMIT_QUERY_CHOICE', payload: { queryId, selections } });
  },

  async setDebugMode(gameId: string, enabled: boolean) {
    socket.emit('gameAction', { gameId, action: 'DEBUG_SET_MODE', payload: { enabled } });
  },

  async debugDraw(gameId: string, playerUid: string, count: number) {
    socket.emit('gameAction', { gameId, action: 'DEBUG_DRAW', payload: { playerUid, count } });
  },

  async debugShuffle(gameId: string, playerUid: string) {
    socket.emit('gameAction', { gameId, action: 'DEBUG_SHUFFLE', payload: { playerUid } });
  },

  async debugMoveCard(gameId: string, payload: {
    cardId: string;
    targetPlayerUid: string;
    targetZone: TriggerLocation;
    targetIndex?: number;
    insertAtBottom?: boolean;
    displayState?: Card['displayState'];
    isExhausted?: boolean;
  }) {
    socket.emit('gameAction', { gameId, action: 'DEBUG_MOVE_CARD', payload });
  },

  async debugPatchCard(gameId: string, gamecardId: string, patch: Partial<Pick<Card,
    'power' |
    'damage' |
    'acValue' |
    'godMark' |
    'canAttack' |
    'canActivateEffect' |
    'isrush' |
    'isAnnihilation' |
    'isShenyi' |
    'isHeroic' |
    'isExhausted' |
    'displayState'
  >>) {
    socket.emit('gameAction', { gameId, action: 'DEBUG_PATCH_CARD', payload: { cardId: gamecardId, patch } });
  },

  moveCard(gameOrId: GameState | string, playerId: string, fromZone: TriggerLocation, toPlayerId: string, toZone: TriggerLocation, cardId: string): boolean {
    if (typeof gameOrId === 'string') {
      socket.emit('gameAction', { gameId: gameOrId, action: 'MOVE_CARD', payload: { fromZone, toPlayerId, toZone, cardId } });
    }
    return true;
  },

  async destroyUnit(gameState: GameState, playerId: string, gamecardId: string, isEffect: boolean = false, sourcePlayerId?: string, skipSubstitution: boolean = false) {
    if (typeof window !== 'undefined') {
      socket.emit('gameAction', {
        gameId: (gameState as any).gameId,
        action: 'DESTROY_UNIT',
        payload: { gamecardId, isEffect, sourcePlayerId, skipSubstitution }
      });
    }
  },

  canPlayCard(gameState: GameState | null, player: PlayerState, card: Card): { canPlay: boolean; reason?: string } {
    if (!player || !card) return { canPlay: false, reason: 'Missing player or card' };

    if (player.factionLock && card.faction !== player.factionLock) {
      return { canPlay: false, reason: `Faction locked to [${player.factionLock}]` };
    }

    if (
      gameState &&
      card.type === 'STORY' &&
      !player.isTurn &&
      Object.entries(gameState.players).some(([uid, opponent]) =>
        uid !== player.uid &&
        [...opponent.unitZone, ...opponent.itemZone].some(source =>
          source?.effects?.some(effect => effect.type === 'CONTINUOUS' && effect.content === 'OPPONENT_STORY_ONLY_OWN_TURN')
        )
      )
    ) {
      return { canPlay: false, reason: 'Story cards can only be used on their owner turn' };
    }

    if (card.type === 'UNIT') {
      if (!player.unitZone.some(cardInZone => cardInZone === null)) {
        return { canPlay: false, reason: 'Unit zone is full' };
      }
      if (card.specialName && player.unitZone.some(cardInZone => cardInZone?.specialName === card.specialName)) {
        return { canPlay: false, reason: 'A unit with the same special name already exists' };
      }
      if (!satisfiesHighAlchemyEntryRestriction(card)) {
        return { canPlay: false, reason: getEntryRestrictionReason(card) || 'This card can only enter the field through a specific effect' };
      }

      if (card.type === 'UNIT' && card.godMark) {
        const fieldEffects = player.unitZone.filter(cardInZone => cardInZone !== null).flatMap(cardInZone => cardInZone?.effects || []);
        const fieldLimitEffect = fieldEffects.find(effect => effect.type === 'CONTINUOUS' && effect.limitGodmarkCount !== undefined);
        const selfLimitEffect = card.effects?.find(effect => effect.type === 'CONTINUOUS' && effect.limitGodmarkCount !== undefined);
        const effectiveLimit = fieldLimitEffect?.limitGodmarkCount ?? selfLimitEffect?.limitGodmarkCount;

        if (effectiveLimit !== undefined) {
          const currentGodmarkCount = player.unitZone.filter(cardInZone => cardInZone && cardInZone.godMark).length;
          if (currentGodmarkCount >= effectiveLimit) {
            return { canPlay: false, reason: `God-mark limit reached (${effectiveLimit})` };
          }
        }
      }
    } else if (card.type === 'ITEM') {
      if (card.specialName && player.itemZone.some(cardInZone => cardInZone?.specialName === card.specialName)) {
        return { canPlay: false, reason: 'An item with the same special name already exists' };
      }
    }

    const colorReqOptions = [card.colorReq || {}];
    if ((card as any).data?.spiritCostTarget103080185 || hasSpiritDiscountTargetOnField(gameState, card)) {
      colorReqOptions.unshift({ GREEN: 1 });
    }
    const colorRequirementResults = colorReqOptions.map(req => getColorRequirementResult(player, req, gameState));

    if (!colorRequirementResults.some(result => result.valid)) {
      const bestDeficit = Math.min(...colorRequirementResults.map(result => result.totalDeficit));
      return { canPlay: false, reason: `Color requirement not met (missing ${bestDeficit})` };
    }

    const cost = hasSpiritDiscountTargetOnField(gameState, card) ? 0 : getEffectivePlayCost(gameState, player, card);
    const onlyFeijingPayment = card.effects?.some(effect => effect.content === 'ONLY_FEIJING_PAYMENT');
    if (cost < 0) {
      const absCost = Math.abs(cost);
      const faceUpFrontCount = player.erosionFront.filter(cardInZone => cardInZone !== null && cardInZone.displayState === 'FRONT_UPRIGHT').length;
      if (faceUpFrontCount < absCost) {
        return { canPlay: false, reason: `Need ${absCost} face-up erosion cards` };
      }
    } else if (cost > 0) {
      let remainingCost = cost;
      if (onlyFeijingPayment && !player.hand.some(cardInHand =>
        cardInHand.gamecardId !== card.gamecardId &&
        cardInHand.feijingMark &&
        cardHasEffectiveColor(cardInHand, card.color, { player, gameState })
      )) {
        return { canPlay: false, reason: 'This card can only be paid by Feijing' };
      }
      const hasSpecialSubstitute = player.hand.some(cardInHand =>
        canUse204000145AsPaymentSubstitute(cardInHand, card.color, cost, card.gamecardId) ||
        canUse205000136AsPaymentSubstitute(cardInHand, card.color, cost, card.gamecardId) ||
        canUseStoryPaymentSubstitute(cardInHand, card, cost, card.gamecardId)
      );
      if (hasSpecialSubstitute) {
        remainingCost = 0;
      }

      const hasFeijing = player.hand.some(cardInHand =>
        cardInHand.gamecardId !== card.gamecardId &&
        cardInHand.feijingMark &&
        cardHasEffectiveColor(cardInHand, card.color, { player, gameState })
      );
      if (remainingCost > 0 && hasFeijing) {
        remainingCost = Math.max(0, remainingCost - 3);
      }

      const readyUnitsCount = player.unitZone.filter(cardInZone => cardInZone !== null && !cardInZone.isExhausted).length;
      remainingCost = Math.max(0, remainingCost - readyUnitsCount);

      if (remainingCost > 0) {
        if (player.deck.length < remainingCost) {
          return { canPlay: false, reason: 'Not enough cards in deck to pay the remaining cost' };
        }
        const totalErosionCount = player.erosionFront.filter(cardInZone => cardInZone !== null).length +
          player.erosionBack.filter(cardInZone => cardInZone !== null).length;
        if (totalErosionCount + remainingCost >= 10) {
          return { canPlay: false, reason: 'Not enough erosion space to pay the remaining cost' };
        }
      }
    }

    const playEffect = card.effects?.find(effect => effect.type === 'ACTIVATE' || effect.type === 'TRIGGER' || effect.type === 'ALWAYS');
    if (playEffect) {
      const shouldValidate = card.type === 'STORY' || playEffect.type === 'ALWAYS';
      if (shouldValidate) {
        const validationLocation = card.type === 'STORY' ? 'PLAY' : (card.cardlocation as TriggerLocation);
        const result = GameService.checkEffectLimitsAndReqs(gameState, player.uid, card, playEffect, validationLocation);
        if (!result.valid) {
          return { canPlay: false, reason: result.reason };
        }
      }
    }

    return { canPlay: true };
  },

  checkEffectLimitsAndReqs(gameState: GameState | null, playerUid: string, card: Card, effect: CardEffect, triggerLocation: TriggerLocation, event?: GameEvent): { valid: boolean; reason?: string } {
    if (!gameState || !gameState.players) return { valid: true };
    const player = gameState.players[playerUid];
    const pseudoGoddessActive = isPseudoGoddessActiveForCard(gameState, card);
    const activatedEffectsDisabled = (card as any).data?.pseudoGoddessDisableActivatedTurn === gameState.turnCount;
    const globalDisableAllActivated = hasGlobalDisableAllActivated(gameState, playerUid);
    const globalDisableErosionRequirementEffects = hasGlobalDisableErosionRequirementEffects(gameState);
    const effectivePlayer = getEffectivePlayerForCard(gameState, player, card);
    if (!player) return { valid: false, reason: 'Player data not found' };

    if (effect.triggerLocation && triggerLocation && !effect.triggerLocation.includes(triggerLocation)) {
      return { valid: false, reason: 'Invalid trigger location' };
    }

    if (effect.limitCount) {
      const usageMap = gameState.effectUsage || {};
      let key = '';
      if (effect.limitGlobal) {
        key = effect.limitNameType
          ? `game_${playerUid}_name_${card.id}_${effect.id}`
          : `game_${playerUid}_instance_${card.gamecardId}_${effect.id}`;
      } else {
        key = effect.limitNameType
          ? `turn_${gameState.turnCount}_${playerUid}_name_${card.id}_${effect.id}`
          : `turn_${gameState.turnCount}_${playerUid}_instance_${card.gamecardId}_${effect.id}`;
      }
      if ((usageMap[key] || 0) >= effect.limitCount) {
        return { valid: false, reason: 'Effect usage limit reached' };
      }
    }

    if (effect.erosionFrontLimit) {
      const frontCount = player.erosionFront.filter(cardInZone => cardInZone !== null).length;
      if (frontCount < effect.erosionFrontLimit[0] || frontCount > effect.erosionFrontLimit[1]) {
        return { valid: false, reason: 'Front erosion count requirement not met' };
      }
    }
    if (effect.erosionBackLimit) {
      const backCount = player.erosionBack.filter(cardInZone => cardInZone !== null).length;
      if (backCount < effect.erosionBackLimit[0] || backCount > effect.erosionBackLimit[1]) {
        return { valid: false, reason: 'Back erosion count requirement not met' };
      }
    }
    if (effect.erosionTotalLimit) {
      const totalCount = player.erosionFront.filter(cardInZone => cardInZone !== null).length +
        player.erosionBack.filter(cardInZone => cardInZone !== null).length;
      const ignoresTenPlusLimit = pseudoGoddessActive && isTenPlusEffect(effect);
      if (!ignoresTenPlusLimit && (totalCount < effect.erosionTotalLimit[0] || totalCount > effect.erosionTotalLimit[1])) {
        return { valid: false, reason: 'Total erosion count requirement not met' };
      }
    }

    if (isFullEffectSilencedThisTurn(gameState, card)) {
      return { valid: false, reason: 'This card loses all effects this turn' };
    }

    if (effect.condition) {
      try {
        if (!effect.condition(gameState, effectivePlayer as PlayerState, card, event)) {
          return { valid: false, reason: 'Condition not met' };
        }
      } catch {
        return { valid: false, reason: 'Condition not met' };
      }
    }

    if (player.negatedNames && player.negatedNames.includes(card.fullName)) {
      return { valid: false, reason: 'This card name is negated this turn' };
    }

    if (card.canActivateEffect === false) {
      return { valid: false, reason: 'This card cannot activate effects' };
    }

    if (card.silencedEffectIds && card.silencedEffectIds.includes(effect.id)) {
      return { valid: false, reason: 'This effect is silenced' };
    }

    if (activatedEffectsDisabled && (effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED')) {
      return { valid: false, reason: 'This card loses activated abilities this turn' };
    }

    if (globalDisableAllActivated && (effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED')) {
      return { valid: false, reason: 'All activated abilities are currently disabled' };
    }

    if (globalDisableErosionRequirementEffects && effectHasSubGoddessErosionRequirement(effect)) {
      return { valid: false, reason: 'Sub-goddess erosion-count abilities are currently disabled' };
    }

    if (player.factionLock && card.faction !== player.factionLock) {
      return { valid: false, reason: 'Faction locked' };
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
      return { valid: false, reason: 'Story cards can only be used on their owner turn' };
    }

    return { valid: true };
  },

  recordEffectUsage(_game: GameState | null, _playerUid: string, _card: Card, _effect: CardEffect) {
    // Persistent usage is recorded on the server.
  }
};
