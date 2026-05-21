import { GameState, PlayerState, Card, GameEvent, CardEffect, TriggerLocation } from '../types/game';
import { GameService } from './gameService';
import { AtomicEffectExecutor } from './AtomicEffectExecutor';
import { getCardIdentity } from '../lib/utils';
import { addBattleLog, cardToBattleLogRef } from '../lib/battleLog';

export class EventEngine {
  private static isFullEffectSilenced(gameState: GameState, card: Card) {
    const data = (card as any).data;
    if (data?.permanentEffectSilenced) return true;
    if (data?.fullEffectSilencedUntilOwnStartUid) return true;
    if (data?.fullEffectSilencedTurn !== gameState.turnCount) return false;
    const zones = data.fullEffectSilencedZones as TriggerLocation[] | undefined;
    return !zones || zones.includes(card.cardlocation as TriggerLocation);
  }

  private static isContinuousEffectActiveAtLocation(card: Card, effect: CardEffect, cardLoc: TriggerLocation) {
    if (effect.type !== 'CONTINUOUS') return false;
    if (effect.triggerLocation?.length) return effect.triggerLocation.includes(cardLoc);
    if (card.type === 'UNIT') return cardLoc === 'UNIT';
    if (card.type === 'ITEM') return cardLoc === 'ITEM';
    return cardLoc === 'PLAY';
  }

  static dispatchEvent(gameState: GameState, event: GameEvent) {
    if (event.type === 'REVEAL_DECK' && Array.isArray(event.data?.cards) && event.data.cards.length > 0 && event.playerUid) {
      const revealingPlayer = gameState.players[event.playerUid];
      gameState.publicReveal = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        playerUid: event.playerUid,
        playerName: revealingPlayer?.displayName || '玩家',
        cards: event.data.cards,
        createdAt: Date.now()
      };
    }

    // 1. Find all active effects that listen to this event
    const triggeredEffects: { card: Card, effect: CardEffect, effectIndex: number, playerUid: string }[] = [];
    const findCardByGamecardId = (gamecardId?: string) => {
      if (!gamecardId) return undefined;
      for (const player of Object.values(gameState.players)) {
        const found = [
          ...player.hand,
          ...player.unitZone,
          ...player.itemZone,
          ...player.grave,
          ...player.exile,
          ...player.erosionFront,
          ...player.erosionBack,
          ...player.playZone,
          ...player.deck
        ].find(card => card && card.gamecardId === gamecardId);
        if (found) return found;
      }
      return undefined;
    };

    const BATTLEFIELD_ZONES: TriggerLocation[] = ['UNIT', 'ITEM'];

    const checkPlayerCards = (player: PlayerState) => {
      // activeZones: units and items are always active. 
      // erosionFront cards are active (e.g. for continuous effects like color), 
      // but TRIGGER effects should only fire if the card is in an allowed triggerLocation.
      const activeZones = [
        ...player.unitZone, ...player.itemZone, ...player.erosionFront, ...player.erosionBack,
        ...player.playZone, ...player.grave, ...player.hand, ...player.exile, ...player.deck
      ];
      const eventSourceSnapshot = event.sourceCard &&
        (!event.playerUid || player.uid === event.playerUid) &&
        !activeZones.some(card =>
          card && card.gamecardId === event.sourceCardId
        )
        ? event.sourceCard
        : undefined;

      const cardsToCheck = eventSourceSnapshot ? [eventSourceSnapshot, ...activeZones] : activeZones;
      cardsToCheck.forEach(card => {
        if (card && card.effects) {
          card.effects.forEach((effect, index) => {
            const isEventMatch = !effect.triggerEvent || 
              (Array.isArray(effect.triggerEvent) ? effect.triggerEvent.includes(event.type) : effect.triggerEvent === event.type);

            if ((effect.type === 'TRIGGERED' || effect.type === 'TRIGGER') && isEventMatch) {
              if (
                eventSourceSnapshot &&
                card === eventSourceSnapshot &&
                event.type === 'CARD_LEFT_FIELD' &&
                effect.sourceSnapshotOnLeftField !== true
              ) {
                return;
              }

              const pseudoTenPlusTargetCardId = event.type === 'GODDESS_TRANSFORMATION'
                ? event.data?.pseudoTenPlusTargetCardId
                : undefined;

              if (pseudoTenPlusTargetCardId) {
                const canUsePseudoTenPlusTrigger =
                  card.gamecardId === pseudoTenPlusTargetCardId &&
                  GameService.isPseudoGoddessActiveForCard(gameState, card) &&
                  GameService.isGoddessTierEffect(effect);

                if (!canUsePseudoTenPlusTrigger) {
                  return;
                }
              }

              // New: Check if the card's current location is in the effect's triggerLocation array
              // If triggerLocation is not specified, default depends on the card type (usually UNIT/ITEM for units)
              const cardLoc = card.cardlocation as TriggerLocation;
              let allowedLocations = effect.triggerLocation || BATTLEFIELD_ZONES;

              // Story cards can be activated from Hand or Play zone by default
              if (!effect.triggerLocation && card.type === 'STORY') {
                allowedLocations = [...BATTLEFIELD_ZONES, 'HAND', 'PLAY'];
              }

              if (!allowedLocations.includes(cardLoc)) {
                return;
              }

              // Check limits and requirements
              const checkResult = GameService.checkEffectLimitsAndReqs(gameState, player.uid, card, effect, cardLoc, event);
              if (!checkResult.valid) {
                return;
              }

              // Robust Self-Identification
              const isEventSelf = (event.sourceCard === card) ||
                (event.sourceCard?.runtimeFingerprint && event.sourceCard.runtimeFingerprint === card.runtimeFingerprint) ||
                (event.sourceCardId && event.sourceCardId === card.gamecardId) ||
                (event.data?.previousSourceCardId && event.data.previousSourceCardId === card.gamecardId) ||
                (event.targetCardId && event.targetCardId === card.gamecardId);

              // Guard: For specific card-entry/action events, default to self-trigger unless explicitly global
              const isMovementEvent = ['CARD_ENTERED_ZONE', 'CARD_LEFT_ZONE', 'CARD_LEFT_FIELD', 'CARD_PLAYED', 'CARD_ATTACK_DECLARED', 'CARD_DESTROYED_BATTLE', 'CARD_DESTROYED_EFFECT'].includes(event.type);

              if (isMovementEvent && !effect.isGlobal && !isEventSelf) {
                // If it's a movement/entry event for another card and this effect is not global, skip it
                return;
              }

              if (!effect.condition || effect.condition(gameState, player, card, event)) {
                // Diagnostic log
                if (event.type === 'CARD_ENTERED_ZONE') {
                  const sourceIdentity = getCardIdentity(gameState, event.playerUid || player.uid, event.sourceCard || { gamecardId: event.sourceCardId });
                  const sourceName = event.sourceCard?.fullName || '未知卡牌';
                  const targetIdentity = getCardIdentity(gameState, player.uid, card);
                  gameState.logs.push(`[Induction-Check] ${targetIdentity} ${card.fullName} evaluates ${sourceIdentity} ${sourceName}. Match!`);
                }
                triggeredEffects.push({ card, effect, effectIndex: index, playerUid: player.uid });
              }
            }
          });
        }
      });
    };

    Object.values(gameState.players).forEach(checkPlayerCards);

    triggeredEffects.sort((a, b) => (b.effect.triggerPriority || 0) - (a.effect.triggerPriority || 0));

    // 2. Queue all valid triggers into the triggeredEffectsQueue for sequential resolution
    for (const { card, effect, effectIndex, playerUid } of triggeredEffects) {
      const pendingSourceCard = findCardByGamecardId(gameState.pendingQuery?.context?.sourceCardId);
      const hasQueuedDuplicate = !!(
        gameState.triggeredEffectsQueue?.some(item =>
          item.playerUid === playerUid &&
          (effect.limitNameType ? item.card?.id === card.id : item.card?.gamecardId === card.gamecardId) &&
          (item.effect?.id || '') === (effect.id || '') &&
          (effect.limitNameType || item.effectIndex === effectIndex) &&
          item.event?.type === event.type &&
          item.event?.sourceCardId === event.sourceCardId &&
          item.event?.targetCardId === event.targetCardId
        )
      );
      const hasPendingDuplicate = !!(
        gameState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE' &&
        gameState.pendingQuery?.playerUid === playerUid &&
        (effect.limitNameType ? pendingSourceCard?.id === card.id : gameState.pendingQuery?.context?.sourceCardId === card.gamecardId) &&
        (effect.limitNameType || gameState.pendingQuery?.context?.effectIndex === effectIndex) &&
        gameState.pendingQuery?.context?.event?.type === event.type &&
        gameState.pendingQuery?.context?.event?.sourceCardId === event.sourceCardId &&
        gameState.pendingQuery?.context?.event?.targetCardId === event.targetCardId
      );

      if (hasQueuedDuplicate || hasPendingDuplicate) {
        continue;
      }

      if (!gameState.triggeredEffectsQueue) gameState.triggeredEffectsQueue = [];
      gameState.triggeredEffectsQueue.push({ card, effect, effectIndex, playerUid, event });
      const identity = getCardIdentity(gameState, playerUid, card);
      gameState.logs.push(`[诱发入队] ${identity} ${card.fullName} 的效果已入队，待系统处理。`);
    }
  }

  static recalculateContinuousEffects(gameState: GameState) {
    const globalDisableErosionRequirementEffects = GameService.hasGlobalDisableErosionRequirementEffects(gameState);

    // 0. Update Goddess Mode status based on erosion count
    Object.values(gameState.players).forEach(player => {
      const totalErosion = player.erosionFront.filter(c => c !== null).length + 
                           player.erosionBack.filter(c => c !== null).length;
      
      if (player.isGoddessMode && totalErosion < 10) {
        player.isGoddessMode = false;
        gameState.logs.push(`${player.displayName} 的侵蚀区卡牌不足 10 张，退出了女神化状态。`);
        
        this.dispatchEvent(gameState, {
          type: 'GODDESS_EXIT',
          playerUid: player.uid
        });
      }
    });

    // 0. Reset global battle properties that are recalculated
    if (gameState.battleState) {
      gameState.battleState.defensePowerRestriction = 0;
    }

    // 1. Reset all cards to base stats
    const resetCards = (player: PlayerState) => {
      const allCards = [
        ...player.deck, ...player.hand, ...player.grave, ...player.exile,
        ...player.unitZone, ...player.itemZone, ...player.erosionFront, ...player.erosionBack, ...player.playZone
      ];
      allCards.forEach(card => {
        if (card) {
          delete (card as any).battleForbiddenByEffect;
          delete (card as any).cannotBeAttackTargetByEffect;
          delete (card as any).cannotBeEffectTargetByEffect;
          delete (card as any).battleImmuneByEffect;
          if ((card as any).data?.cannotBeEffectTargetColors !== undefined) {
            delete (card as any).data.cannotBeEffectTargetColors;
          }
          if ((card as any).data?.cannotBeEffectTargetByOpponent !== undefined) {
            delete (card as any).data.cannotBeEffectTargetByOpponent;
            delete (card as any).data.cannotBeEffectTargetByOpponentSourceName;
          }
          if ((card as any).data?.cannotAllianceByEffect !== undefined) {
            delete (card as any).data.cannotAllianceByEffect;
          }
          if ((card as any).data?.canAttackExhausted !== undefined) {
            delete (card as any).data.canAttackExhausted;
          }
          if ((card as any).data?.canAttackReady !== undefined) {
            delete (card as any).data.canAttackReady;
          }
          if ((card as any).data?.indestructibleByEffect !== undefined) {
            delete (card as any).data.indestructibleByEffect;
          }
          if ((card as any).data?.unaffectedByOpponentCardEffects !== undefined) {
            delete (card as any).data.unaffectedByOpponentCardEffects;
          }
          if ((card as any).data?.unaffectedByOpponentColorEffects !== undefined) {
            delete (card as any).data.unaffectedByOpponentColorEffects;
          }
          if ((card as any).data?.unaffectedByOtherCardEffects !== undefined) {
            delete (card as any).data.unaffectedByOtherCardEffects;
          }
          if ((card as any).data?.clearMirrorActiveTurn === gameState.turnCount) {
            (card as any).data.unaffectedByOtherCardEffects = true;
          }
          delete (card as any).__lockPowerToBaseSourceName;
          if (!card.baseColorReq) {
            card.baseColorReq = { ...(card.colorReq || {}) };
          }
          card.colorReq = { ...(card.baseColorReq || {}) };
          if (card.basePower !== undefined) card.power = card.basePower + (card.temporaryPowerBuff || 0);
          if (card.baseDamage !== undefined) card.damage = card.baseDamage + (card.temporaryDamageBuff || 0);
          if (card.baseIsrush !== undefined) card.isrush = card.baseIsrush || !!card.temporaryRush;
          if (card.baseAnnihilation !== undefined) card.isAnnihilation = card.baseAnnihilation || !!card.temporaryAnnihilation;
          if (card.baseCanAttack !== undefined) card.canAttack = card.baseCanAttack;
          if (card.temporaryCanAttackAny !== undefined && card.temporaryCanAttackAny) {
            // "Full Attack" logic: potentially update some property that battle system checks
            // For now we just keep the property on the object
          }
          if (card.baseGodMark !== undefined) card.godMark = card.baseGodMark;
          if (card.baseAcValue !== undefined) card.acValue = card.baseAcValue;
          if (card.baseHeroic !== undefined) card.isHeroic = card.baseHeroic || !!card.temporaryHeroic;
          card.canActivateEffect = card.baseCanActivateEffect !== undefined ? card.baseCanActivateEffect : true;
          if (card.temporaryCanActivateEffect !== undefined) {
            card.canActivateEffect = card.temporaryCanActivateEffect;
          }
          if ((card as any).data?.cannotActivateUntilTurn !== undefined && (card as any).data.cannotActivateUntilTurn >= gameState.turnCount) {
            card.canActivateEffect = false;
          }
          card.isImmuneToUnitEffects = card.baseIsImmuneToUnitEffects ?? false;
          if (card.temporaryImmuneToUnitEffects !== undefined) {
            card.isImmuneToUnitEffects = card.temporaryImmuneToUnitEffects;
          }
          if (card.baseShenyi !== undefined) card.isShenyi = card.baseShenyi;
          if ((card as any).data?.tempShenyiUntilTurn === gameState.turnCount) {
            card.isShenyi = true;
          }
          if ((card as any).data) {
            if ((card as any).data.cannotExhaustContinuous) {
              delete (card as any).data.cannotExhaustContinuous;
              delete (card as any).data.cannotExhaustUntilTurn;
              delete (card as any).data.cannotExhaustSourceName;
            }
            if ((card as any).data.cannotAttackOrDefendContinuous) {
              delete (card as any).data.cannotAttackOrDefendContinuous;
              delete (card as any).data.cannotAttackOrDefendUntilTurn;
              delete (card as any).data.cannotAttackOrDefendSourceName;
            }
            if ((card as any).data.grantedTotemReviveBy103080184) {
              delete (card as any).data.grantedTotemReviveBy103080184;
              delete (card as any).data.grantedTotemReviveSourceName;
            }
            delete (card as any).data.accessTapValue;
            delete (card as any).data.accessTapMinValue;
            delete (card as any).data.accessTapFlexible;
            delete (card as any).data.accessTapValueSourceName;
            delete (card as any).data.accessTapColor;
            delete (card as any).data.powerIncreaseBonus;
            delete (card as any).data.powerIncreaseBonusSourceName;
            delete (card as any).data.declareAttackDefenseTax;
            delete (card as any).data.declareAttackDefenseTaxSourceName;
            delete (card as any).data.cannotAllianceByEffect;
            delete (card as any).data.canAttackExhausted;
            delete (card as any).data.canAttackReady;
            delete (card as any).data.cannotExhaustByEffect;
            if ((card as any).data.soulBindItemId) {
              const sourceStillActive = Object.values(gameState.players).some(player =>
                player.itemZone.some(item => item?.gamecardId === (card as any).data.soulBindItemId)
              );
              if (!sourceStillActive) {
                if ((card as any).data.cannotAttackOrDefendSourceName === (card as any).data.soulBoundBy) {
                  delete (card as any).data.cannotAttackOrDefendUntilTurn;
                  delete (card as any).data.cannotAttackOrDefendSourceName;
                }
                delete (card as any).data.soulBoundBy;
                delete (card as any).data.soulBindItemId;
              }
            }
          }
          card.influencingEffects = [];
          if (card.cardlocation === 'ITEM' && card.isExhausted) {
            card.influencingEffects.push({ sourceCardName: '系统状态', description: '已横置' });
          }
          if ((card.cardlocation === 'UNIT' || card.cardlocation === 'ITEM') && card.nextEffectProtection) {
            card.influencingEffects.push({ sourceCardName: '变装', description: '已变装' });
          }
          if (card.declaredTargetMarkers?.length) {
            card.declaredTargetMarkers.forEach(marker => {
              const linkPrefix = marker.linkNumber ? `Link ${marker.linkNumber}: ` : '';
              card.influencingEffects!.push({
                sourceCardName: marker.sourceCardName,
                description: `${linkPrefix}被 [${marker.sourceCardName}] 指定为效果对象`
              });
            });
          }

          if (card.temporaryPowerBuff) {
            const source = card.temporaryBuffSources?.['power'] || '效果';
            card.influencingEffects.push({ sourceCardName: source, description: `临时力量加成: +${card.temporaryPowerBuff}` });
          }
          const powerDetails = card.temporaryBuffDetails?.['power'] || [];
          if (powerDetails.length > 0) {
            card.influencingEffects = card.influencingEffects.filter(effect => !effect.description.includes('力量加成'));
            powerDetails.forEach(detail => {
              card.influencingEffects!.push({
                sourceCardName: detail.sourceCardName,
                description: `临时力量加成: +${detail.value || 0}`
              });
            });
          }
          if (gameState.battleState?.forcedGuardTargetId === card.gamecardId) {
            card.influencingEffects.push({ sourceCardName: '系统状态', description: '强制护卫中' });
          }
          if (gameState.battleState?.forcedGuardTargetId === card.gamecardId) {
            const hasGuardLabel = card.influencingEffects.some(effect => effect.description === '强制护卫中');
            if (!hasGuardLabel) {
              card.influencingEffects.push({ sourceCardName: '系统状态', description: '强制护卫中' });
            }
          }
          if (card.temporaryDamageBuff) {
            const source = card.temporaryBuffSources?.['damage'] || '效果';
            card.influencingEffects.push({ sourceCardName: source, description: `临时伤害加成: +${card.temporaryDamageBuff}` });
          }
          if (card.temporaryRush) {
            const source = card.temporaryBuffSources?.['rush'] || '效果';
            card.influencingEffects.push({ sourceCardName: source, description: '获得【速攻】' });
          }
          if (card.temporaryAnnihilation) {
            const source = card.temporaryBuffSources?.['annihilation'] || '效果';
            card.influencingEffects.push({ sourceCardName: source, description: '获得【歼灭】' });
          }
          if (card.temporaryHeroic) {
            const source = card.temporaryBuffSources?.['heroic'] || '效果';
            card.influencingEffects.push({ sourceCardName: source, description: '获得【英勇】' });
          }
          if (card.temporaryCanAttackAny) {
            const source = card.temporaryBuffSources?.['full_attack'] || '效果';
            card.influencingEffects.push({ sourceCardName: source, description: '获得【全攻】' });
          }
          if ((card as any).data?.clearMirrorActiveTurn === gameState.turnCount) {
            card.influencingEffects.push({ sourceCardName: '明镜止水', description: '已明镜止水' });
          }
          const forcedAttackTurn = (card as any).data?.forcedAttackTurn;
          if (forcedAttackTurn !== undefined) {
            card.influencingEffects.push({
              sourceCardName: (card as any).data?.forcedAttackSourceName || '效果',
              description: forcedAttackTurn <= gameState.turnCount ? '本回合必须攻击（若可以）' : '下个回合必须攻击（若可以）'
            });
          }
          const forbiddenAlchemySourceName = (card as any).data?.forbiddenAlchemySourceName;
          if (
            card.cardlocation === 'UNIT' &&
            forbiddenAlchemySourceName &&
            (card as any).data?.forbiddenAlchemyWillExileAtEndOfTurn === false
          ) {
            card.influencingEffects.push({
              sourceCardName: forbiddenAlchemySourceName,
              description: '回合结束时不会被放逐'
            });
          }
        }
      });
      player.effectDamageModifier = 0;
    };
    Object.values(gameState.players).forEach(resetCards);
    Object.values(gameState.players).forEach(player => {
      [...player.deck, ...player.hand, ...player.grave, ...player.exile, ...player.unitZone, ...player.itemZone, ...player.erosionFront, ...player.erosionBack, ...player.playZone].forEach(card => {
        if (card && this.isFullEffectSilenced(gameState, card)) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data?.permanentEffectSilenceSource || (card as any).data?.fullEffectSilenceSource || '系统状态',
            description: (card as any).data?.permanentEffectSilenced ? '失去所有非关键词效果' : '本回合失去所有效果'
          });
        }
        if (card && (card as any).data?.combatImmuneUntilOwnNextTurnStartUid) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data?.combatImmuneSourceName || '系统状态',
            description: '获得效果: 【永续】不会被战斗破坏'
          });
        }
        if (card && (card as any).data?.returnAtOwnEndSourceName) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.returnAtOwnEndSourceName,
            description: '在回合结束时回归战场'
          });
        }
        if (card && (card as any).data?.returnToOwnerFieldAtTurnEndSourceName) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.returnToOwnerFieldAtTurnEndSourceName,
            description: '回合结束时回到持有者战场'
          });
        }
        if (card && card.cardlocation === 'UNIT' && (card as any).data?.returnToExileAtEndTurn) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.returnToExileSourceName || '卡牌效果',
            description: '回合结束时放逐'
          });
        }
        if (card && (card as any).data?.placedOnOpponentFieldSourceName) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.placedOnOpponentFieldSourceName,
            description: '被放置到对手战场'
          });
        }
        if (card && (card as any).data?.destroyAtEndBy) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.destroyAtEndBy,
            description: '回合结束时破坏'
          });
        }
        if (
          card &&
          (card as any).data?.preventNextDestroy &&
          (
            (card as any).data.preventNextDestroyUntilTurn === undefined ||
            (card as any).data.preventNextDestroyUntilTurn >= gameState.turnCount
          )
        ) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.preventNextDestroySourceName || '效果',
            description: '下一次将被破坏时防止'
          });
        }
        if (card && (card as any).data?.preventFirstDestroyEachTurnSourceName) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.preventFirstDestroyEachTurnSourceName,
            description: '每回合第一次将被破坏时防止'
          });
        }
        if (card && (card as any).data?.cannotAttackOrDefendSourceName) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.cannotAttackOrDefendSourceName,
            description: '不能宣言攻击和防御'
          });
        }
        if (card && card.canResetCount !== undefined && card.canResetCount > 0 && (card as any).data?.cannotResetSourceName) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.cannotResetSourceName,
            description: '下个重置阶段不能重置'
          });
        }
        if (card && (card as any).data?.cocolaMarkedTurn === gameState.turnCount) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.cocolaMarkedSourceName || '可可拉',
            description: '被可可拉标记'
          });
        }
        if (card && (card as any).data?.defeatVillainsMarkedTurn === gameState.turnCount) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.defeatVillainsSourceName || '任务：击溃恶党',
            description: (card as any).data.defeatVillainsMarkDescription || '离场时触发：将其控制者战场1张非神蚀卡放置到卡组顶'
          });
        }
          if (card && (card as any).data?.cannotActivateUntilTurn !== undefined && (card as any).data.cannotActivateUntilTurn >= gameState.turnCount) {
            if (!card.influencingEffects) card.influencingEffects = [];
            card.influencingEffects.push({
              sourceCardName: (card as any).data.cannotActivateSourceName || '效果',
              description: '不能发动能力'
            });
          }
          if (card && (card as any).data?.cannotExhaustUntilTurn !== undefined && (card as any).data.cannotExhaustUntilTurn >= gameState.turnCount) {
            if (!card.influencingEffects) card.influencingEffects = [];
            card.influencingEffects.push({
              sourceCardName: (card as any).data.cannotExhaustSourceName || '效果',
              description: '不能横置'
            });
          }
          if (card && (card as any).data?.freezeUntilTurn !== undefined && (card as any).data.freezeUntilTurn >= gameState.turnCount) {
            (card as any).data.indestructibleByEffect = true;
            card.canActivateEffect = false;
            if (!card.influencingEffects) card.influencingEffects = [];
            card.influencingEffects.push({
              sourceCardName: (card as any).data.freezeSourceName || '效果',
              description: '冻结：不能发动能力，不能宣言攻击和防御，也不会被破坏'
            });
          }
          if (card && (card as any).data?.returnToDeckBottomAtTurnEnd === gameState.turnCount) {
            if (!card.influencingEffects) card.influencingEffects = [];
            card.influencingEffects.push({
              sourceCardName: (card as any).data.returnToDeckBottomSourceName || '效果',
              description: '回合结束时放置到卡组底'
            });
          }
        if (card && (card as any).data?.tempShenyiUntilTurn === gameState.turnCount) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.tempShenyiSourceName || '效果',
            description: '获得【神依】'
          });
        }
        if (card && (card as any).data?.escortReturn) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.escortReturn.sourceName || '效果',
            description: '对手回合结束时横置回场'
          });
        }
        if (card && (card as any).data?.accessTapValue) {
          if (!card.influencingEffects) card.influencingEffects = [];
          const maxValue = (card as any).data.accessTapValue;
          const minValue = (card as any).data.accessTapMinValue || 1;
          const isFlexible = !!(card as any).data.accessTapFlexible && minValue < maxValue;
          const colorText = (card as any).data.accessTapColor === 'GREEN' ? '绿色卡' : 'ACCESS';
          card.influencingEffects.push({
            sourceCardName: (card as any).data.accessTapValueSourceName || '效果',
            description: isFlexible
              ? `横置支付${colorText}时可当作+${minValue}或+${maxValue}`
              : `横置支付${colorText}时可当作+${maxValue}`
          });
        }
        if (card && (card as any).data?.declareAttackDefenseTax) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.declareAttackDefenseTaxSourceName || '效果',
            description: `宣言攻击或防御需要支付${(card as any).data.declareAttackDefenseTax}费`
          });
        }
        if (card && (card as any).data?.controlChangedBy) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.controlChangedBy,
            description: '控制权已变更'
          });
        }
        if (card && (card as any).data?.unaffectedByOpponentColorEffects) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.unaffectedByOpponentColorEffectsSourceName,
            description: `不受对手${(card as any).data.unaffectedByOpponentColorEffectsLabel || ''}色卡牌效果影响`
          });
        }
        if (card && (card as any).data?.extraNameContainsWitchBy) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.extraNameContainsWitchBy,
            description: '视为卡名含有《魔女》'
          });
        }
        if (card && (card as any).data?.resetAfterNextBattleDestroyTurn === gameState.turnCount) {
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.resetAfterNextBattleDestroySourceName || '效果',
            description: '战斗破坏对手单位后可以重置'
          });
        }
          if (card && (card as any).data?.mustBeDefendedTurn === gameState.turnCount) {
            if (!card.influencingEffects) card.influencingEffects = [];
            card.influencingEffects.push({
              sourceCardName: (card as any).data.mustBeDefendedSourceName || '效果',
              description: '攻击时对手必须宣言防御'
            });
          }
          if (
            card &&
            (card as any).data?.canAttackExhaustedUntilTurn !== undefined &&
            (card as any).data.canAttackExhaustedUntilTurn >= gameState.turnCount
          ) {
            (card as any).data.canAttackExhausted = true;
            if (!card.influencingEffects) card.influencingEffects = [];
            card.influencingEffects.push({
              sourceCardName: (card as any).data.canAttackExhaustedSourceName || '效果',
              description: '可以攻击对手横置单位'
            });
          }
          if (
            card &&
            (card as any).data?.canAttackReadyUntilTurn !== undefined &&
            (card as any).data.canAttackReadyUntilTurn >= gameState.turnCount
          ) {
            (card as any).data.canAttackReady = true;
            if (!card.influencingEffects) card.influencingEffects = [];
            card.influencingEffects.push({
              sourceCardName: (card as any).data.canAttackReadySourceName || '效果',
              description: '可以攻击对手重置单位'
            });
          }
          if (card && (card as any).data?.canAttackAnyUnit) {
            if (!card.influencingEffects) card.influencingEffects = [];
            card.influencingEffects.push({
              sourceCardName: (card as any).data.canAttackAnyUnitSourceName || '效果',
              description: '可以攻击对手单位'
            });
          }
      });
    });

    // 2. Apply all continuous effects from active zones
    const applyEffects = (player: PlayerState) => {
      const handContinuousCards = player.hand.filter(card =>
        !!card &&
        card.effects?.some(effect => effect.type === 'CONTINUOUS' && effect.content === 'SELF_HAND_COST')
      );
      const activeZones = [...player.unitZone, ...player.itemZone, ...player.erosionFront, ...handContinuousCards];
      activeZones.forEach(card => {
        if (card && card.effects) {
          if (this.isFullEffectSilenced(gameState, card)) {
            return;
          }
          card.effects.forEach(effect => {
            const cardLoc = card.cardlocation as TriggerLocation;
            if (effect.type === 'CONTINUOUS' && !this.isContinuousEffectActiveAtLocation(card, effect, cardLoc)) {
              return;
            }
            const checkResult = GameService.checkEffectLimitsAndReqs(gameState, player.uid, card, effect, cardLoc);
            if (!checkResult.valid) {
              return;
            }
            if (effect.type === 'CONTINUOUS') {
              const activeKey = `${card.gamecardId}:${effect.id || effect.description}`;
              const activeContinuousLogs = ((gameState as any).activeContinuousEffectLogKeys || {}) as Record<string, number>;
              if (activeContinuousLogs[activeKey] !== gameState.turnCount) {
                addBattleLog(gameState, {
                  category: 'CONTINUOUS_EFFECT',
                  actorUid: player.uid,
                  actorName: player.displayName,
                  sourceCard: cardToBattleLogRef(gameState, card, player.uid, cardLoc),
                  text: `[永续效果] ${getCardIdentity(gameState, player.uid, card)} ${card.fullName} 的永续效果生效：${effect.description}`,
                  metadata: { effectId: effect.id, effectDescription: effect.description }
                });
                (gameState as any).activeContinuousEffectLogKeys = {
                  ...activeContinuousLogs,
                  [activeKey]: gameState.turnCount
                };
              }
            }
            if (effect.applyContinuous) {
              effect.applyContinuous(gameState, card);
            }
            if (effect.type === 'CONTINUOUS' && effect.atomicEffects) {
              effect.atomicEffects.forEach(atomic => {
                // Only applying stat changes for continuous atomic effects for now
                AtomicEffectExecutor.execute(gameState, player.uid, atomic, card);
              });
            }
          });
        }
      });
    };
    Object.values(gameState.players).forEach(applyEffects);

    // 2.5 Apply post-processing locks that must override other stat changes.
    Object.values(gameState.players).forEach(player => {
      [...player.unitZone, ...player.itemZone, ...player.erosionFront].forEach(card => {
        if (!card) return;

        const lockPowerSource = (card as any).__lockPowerToBaseSourceName;
        if (lockPowerSource && card.basePower !== undefined) {
          card.power = card.basePower;
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: lockPowerSource,
            description: '力量值不会变动'
          });
        }

        if ((card as any).data?.forcePowerToZeroUntilTurn === gameState.turnCount) {
          card.power = 0;
          if (!card.influencingEffects) card.influencingEffects = [];
          card.influencingEffects.push({
            sourceCardName: (card as any).data.forcePowerToZeroSourceName || '效果',
            description: '力量变为0'
          });
        }
      });
    });

    // 3. New: Equipment Influence Display
    const allUnitMap = new Map<string, Card>();
    Object.values(gameState.players).forEach(p => {
      p.unitZone.forEach(u => { if (u) allUnitMap.set(u.gamecardId, u); });
    });

    Object.values(gameState.players).forEach(p => {
      p.itemZone.forEach(item => {
        if (item && item.equipTargetId) {
          const target = allUnitMap.get(item.equipTargetId);
          if (target) {
            // Add entry to Equipment
            if (!item.influencingEffects) item.influencingEffects = [];
            const equipDescription = `已装备给 ${target.fullName}`;
            if (!item.influencingEffects.some(e => e.sourceCardName === target.fullName && e.description === equipDescription)) {
              item.influencingEffects.push({
                sourceCardName: target.fullName,
                description: equipDescription
              });
            }

            // Ensure Unit also shows it (most scripts do this, but defensive check)
            if (!target.influencingEffects) target.influencingEffects = [];
            if (!target.influencingEffects.some(e => e.sourceCardName === item.fullName)) {
              target.influencingEffects.push({
                sourceCardName: item.fullName,
                description: '装备中'
              });
            }
          } else {
            item.equipTargetId = undefined;
            if (!item.influencingEffects) item.influencingEffects = [];
            item.influencingEffects.push({
              sourceCardName: '系统状态',
              description: '装备目标离场，已解除装备'
            });
          }
        }
      });
    });

    // 4. Status Effect & Mission Mark Display
    Object.values(gameState.players).forEach(p => {
      p.unitZone.forEach(u => {
        if (!u) return;
        if (!u.influencingEffects) u.influencingEffects = [];

        // Display Silenced Effects
        if (u.silencedEffectIds && u.silencedEffectIds.length > 0) {
          if (!u.influencingEffects.some(e => e.description === '效果已被封印')) {
            u.influencingEffects.push({
              sourceCardName: '系统状态',
              description: '效果已被封印'
            });
          }
        }

        // Display Mission Marks (from Grave or Field)
        Object.values(gameState.players).forEach(owner => {
          const possibleSources = [...owner.grave, ...owner.unitZone, ...owner.itemZone, ...owner.playZone];
          possibleSources.forEach(source => {
            if (source && (source as any).data && (source as any).data.markedTargetId === u.gamecardId) {
              if (gameState.turnCount === (source as any).data.playedTurn) {
                if (!u.influencingEffects.some(e => e.sourceCardName === source.fullName)) {
                  u.influencingEffects.push({
                    sourceCardName: source.fullName,
                    description: source.id === '104030125'
                      ? '被可可拉标记'
                      : source.id === '204000069'
                        ? '离场时触发：将其控制者战场1张非神蚀卡放置到卡组顶'
                        : '已标记'
                  });
                }
              }
            }
          });
        });
      });
    });
  }

  static handleCardEnteredZone(
    gameState: GameState,
    playerUid: string,
    card: Card,
    zone: string,
    isEffect?: boolean,
    options?: {
      sourceZone?: TriggerLocation;
      targetZone?: TriggerLocation;
      effectSourcePlayerUid?: string;
      effectSourceCardId?: string;
      previousSourceCardId?: string;
    }
  ) {
    this.recalculateContinuousEffects(gameState);

    this.dispatchEvent(gameState, {
      type: 'CARD_ENTERED_ZONE',
      sourceCard: card,
      sourceCardId: card.gamecardId,
      playerUid,
      data: {
        zone,
        isEffect: !!isEffect,
        sourceZone: options?.sourceZone,
        targetZone: options?.targetZone || zone,
        effectSourcePlayerUid: options?.effectSourcePlayerUid,
        effectSourceCardId: options?.effectSourceCardId,
        previousSourceCardId: options?.previousSourceCardId
      }
    });
  }

  static handleCardLeftZone(
    gameState: GameState,
    playerUid: string,
    card: Card,
    fromZone: TriggerLocation,
    isEffect?: boolean,
    targetZone?: TriggerLocation,
    options?: {
      effectSourcePlayerUid?: string;
      effectSourceCardId?: string;
      previousSourceCardId?: string;
    }
  ) {
    this.recalculateContinuousEffects(gameState);

    // Track "Returned from battlefield" (Bounce)
    if (fromZone === 'UNIT' && (targetZone === 'HAND' || targetZone === 'DECK')) {
      const player = gameState.players[playerUid];
      if (player) {
        player.hasUnitReturnedThisTurn = true;
        if (targetZone === 'DECK') {
          (player as any).unitsReturnedToDeckThisTurn = Number((player as any).unitsReturnedToDeckThisTurn || 0) + 1;
        }
      }
    }

    this.dispatchEvent(gameState, {
      type: 'CARD_LEFT_ZONE',
      sourceCard: card,
      sourceCardId: card.gamecardId,
      playerUid,
      data: {
        zone: fromZone,
        isEffect: !!isEffect,
        targetZone,
        effectSourcePlayerUid: options?.effectSourcePlayerUid,
        effectSourceCardId: options?.effectSourceCardId,
        previousSourceCardId: options?.previousSourceCardId
      }
    });
  }

  static dispatchMovementSubEvents(
    gameState: GameState,
    {
      card,
      cardOwnerUid,
      fromZone,
      toZone,
      isEffect,
      effectSourcePlayerUid,
      effectSourceCardId,
      previousSourceCardId,
      skipLeftFieldEvent,
      onlyLeftFieldEvent
    }: {
      card: Card;
      cardOwnerUid: string;
      fromZone: TriggerLocation;
      toZone: TriggerLocation;
      isEffect?: boolean;
      effectSourcePlayerUid?: string;
      effectSourceCardId?: string;
      previousSourceCardId?: string;
      skipLeftFieldEvent?: boolean;
      onlyLeftFieldEvent?: boolean;
    }
  ) {
    const data = {
      isEffect: !!isEffect,
      zone: fromZone,
      sourceZone: fromZone,
      targetZone: toZone,
      effectSourcePlayerUid,
      effectSourceCardId,
      previousSourceCardId
    };

    if (onlyLeftFieldEvent) {
      if (['UNIT', 'ITEM'].includes(fromZone)) {
        this.dispatchEvent(gameState, {
          type: 'CARD_LEFT_FIELD',
          playerUid: cardOwnerUid,
          sourceCard: card,
          sourceCardId: card.gamecardId,
          data
        });
      }
      return;
    }

    if (toZone === 'EROSION_FRONT') {
      this.dispatchEvent(gameState, {
        type: 'CARD_TO_EROSION_FRONT',
        playerUid: cardOwnerUid,
        sourceCard: card,
        sourceCardId: card.gamecardId,
        data
      });
    }

    if (fromZone === 'DECK' && toZone === 'EROSION_FRONT') {
      this.dispatchEvent(gameState, {
        type: 'CARD_DECK_TO_EROSION_UP',
        playerUid: cardOwnerUid,
        sourceCard: card,
        sourceCardId: card.gamecardId,
        data
      });
    } else if ((fromZone === 'EROSION_FRONT' || fromZone === 'EROSION_BACK') && ['UNIT', 'ITEM'].includes(toZone)) {
      this.dispatchEvent(gameState, {
        type: 'CARD_EROSION_TO_FIELD',
        playerUid: cardOwnerUid,
        sourceCard: card,
        sourceCardId: card.gamecardId,
        data
      });
    } else if (fromZone === 'EROSION_FRONT' && toZone === 'HAND') {
      this.dispatchEvent(gameState, {
        type: 'CARD_EROSION_TO_HAND',
        playerUid: cardOwnerUid,
        sourceCard: card,
        sourceCardId: card.gamecardId,
        data
      });
    } else if (fromZone === 'HAND' && toZone === 'GRAVE') {
      this.dispatchEvent(gameState, {
        type: 'CARD_DISCARDED',
        playerUid: cardOwnerUid,
        sourceCard: card,
        sourceCardId: card.gamecardId,
        data
      });
    } else if (['UNIT', 'ITEM'].includes(fromZone) && toZone === 'HAND') {
      this.dispatchEvent(gameState, {
        type: 'CARD_FIELD_TO_HAND',
        playerUid: cardOwnerUid,
        sourceCard: card,
        sourceCardId: card.gamecardId,
        data
      });
    }

    if (toZone === 'EXILE') {
      const player = gameState.players[cardOwnerUid];
      if (player) {
        (player as any).cardExiledTurn = gameState.turnCount;
      }
      this.dispatchEvent(gameState, {
        type: 'CARD_EXILED',
        playerUid: cardOwnerUid,
        sourceCard: card,
        sourceCardId: card.gamecardId,
        data
      });
    }

    if (!skipLeftFieldEvent && ['UNIT', 'ITEM'].includes(fromZone)) {
      this.dispatchEvent(gameState, {
        type: 'CARD_LEFT_FIELD',
        playerUid: cardOwnerUid,
        sourceCard: card,
        sourceCardId: card.gamecardId,
        data
      });
    }
  }
}
