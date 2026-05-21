import { GameState, PlayerState, Card, AtomicEffect, CardFilter, TriggerLocation } from '../types/game';
import { GameService } from './gameService';
import { EventEngine } from './EventEngine';
import { clearBattlefieldState, shouldClearBattlefieldStateOnMove } from '../lib/cardState';
import { getCardIdentity } from '../lib/utils';

export class AtomicEffectExecutor {
  private static loseForInsufficientDeckMove(gameState: GameState, playerUid: string, count: number, sourceCard?: Card) {
    if (gameState.gameStatus === 2) return;
    const player = gameState.players[playerUid];
    if (!player) return;
    gameState.gameStatus = 2;
    gameState.winReason = 'DECK_OUT_DECK_MOVE';
    gameState.winnerId = gameState.playerIds.find(id => id !== playerUid);
    gameState.winSourceCardName = sourceCard?.fullName;
    gameState.logs.push(`[游戏结束] ${player.displayName} 的卡组数量不足，无法从卡组移动 ${count} 张卡，判负。`);
  }

  /**
   * Enriches query options with ownership metadata.
   */
  static enrichQueryOptions(gameState: GameState, viewerUid: string, options: any[]): any[] {
    const getZonePositionMeta = (owner: PlayerState, cardId: string) => {
      const handIndex = owner.hand.findIndex(c => c?.gamecardId === cardId);
      if (handIndex !== -1) {
        const slotNumber = handIndex + 1;
        return {
          slotNumber,
          slotLabel: `手牌 ${slotNumber}`,
          zoneLabel: '手牌'
        };
      }

      const unitIndex = owner.unitZone.findIndex(c => c?.gamecardId === cardId);
      if (unitIndex !== -1) {
        const slotNumber = owner.uid === viewerUid ? unitIndex + 1 : 6 - unitIndex;
        return {
          slotNumber,
          slotLabel: `单位区 ${slotNumber}`,
          zoneLabel: '单位区'
        };
      }

      const itemIndex = owner.itemZone.findIndex(c => c?.gamecardId === cardId);
      if (itemIndex !== -1) {
        const slotNumber = itemIndex + 1;
        return {
          slotNumber,
          slotLabel: `道具区 ${slotNumber}`,
          zoneLabel: '道具区'
        };
      }

      const graveIndex = owner.grave.findIndex(c => c?.gamecardId === cardId);
      if (graveIndex !== -1) {
        const slotNumber = graveIndex + 1;
        return {
          slotNumber,
          slotLabel: `墓地 ${slotNumber}`,
          zoneLabel: '墓地'
        };
      }

      const deckIndex = owner.deck.findIndex(c => c?.gamecardId === cardId);
      if (deckIndex !== -1) {
        const slotNumber = deckIndex + 1;
        return {
          slotNumber,
          slotLabel: `卡组 ${slotNumber}`,
          zoneLabel: '卡组'
        };
      }

      const exileIndex = owner.exile.findIndex(c => c?.gamecardId === cardId);
      if (exileIndex !== -1) {
        const slotNumber = exileIndex + 1;
        return {
          slotNumber,
          slotLabel: `放逐区 ${slotNumber}`,
          zoneLabel: '放逐区'
        };
      }

      const playIndex = owner.playZone.findIndex(c => c?.gamecardId === cardId);
      if (playIndex !== -1) {
        const slotNumber = playIndex + 1;
        return {
          slotNumber,
          slotLabel: `处理区 ${slotNumber}`,
          zoneLabel: '处理区'
        };
      }

      const erosionCards = [
        ...owner.erosionBack.filter((c): c is Card => !!c),
        ...owner.erosionFront.filter((c): c is Card => !!c)
      ];
      const erosionIndex = erosionCards.findIndex(c => c.gamecardId === cardId);
      if (erosionIndex !== -1) {
        const slotNumber = erosionIndex + 1;
        return {
          slotNumber,
          slotLabel: `侵蚀区 ${slotNumber}`,
          zoneLabel: '侵蚀区'
        };
      }

      return {};
    };

    return options.map(opt => {
      if (!opt.card) return opt;
      const cardId = opt.card.gamecardId;
      let cardOwner: PlayerState | undefined;

      // Special handles for player-as-card selection
      if (cardId === 'PLAYER_SELF') {
        return {
          ...opt,
          isMine: true,
          ownerName: gameState.players[viewerUid].displayName
        };
      }
      if (cardId === 'PLAYER_OPPONENT') {
        const opponentId = Object.keys(gameState.players).find(id => id !== viewerUid);
        return {
          ...opt,
          isMine: false,
          ownerName: opponentId ? gameState.players[opponentId].displayName : 'OPPONENT'
        };
      }

      // Find real owner
      for (const uid of Object.keys(gameState.players)) {
        const p = gameState.players[uid];
        const hasCard = [...p.hand, ...p.unitZone, ...p.itemZone, ...p.grave, ...p.exile, ...p.erosionFront, ...p.erosionBack, ...p.playZone, ...p.deck]
          .some(c => c && c.gamecardId === cardId);
        if (hasCard) {
          cardOwner = p;
          break;
        }
      }

      const positionMeta = cardOwner ? getZonePositionMeta(cardOwner, cardId) : {};

      return {
        ...opt,
        id: cardId, // Ensure ID is present for bot and frontend selection
        isMine: cardOwner ? cardOwner.uid === viewerUid : false,
        ownerName: cardOwner ? cardOwner.displayName : 'UNKNOWN',
        ...positionMeta
      };
    });
  }

  /**
   * Main entry point for executing atomic effects.
   */
  static async execute(
    gameState: GameState,
    playerUid: string,
    effect: AtomicEffect,
    sourceCard?: Card,
    event?: any,
    querySelections?: string[] // IDs of cards selected in a query
  ): Promise<void> {
    const player = gameState.players[playerUid];
    const opponentUid = Object.keys(gameState.players).find(id => id !== playerUid)!;
    const opponent = gameState.players[opponentUid];
    const effectSourcePlayerUid = sourceCard?.gamecardId
      ? (this.findCardOwnerKey(gameState, sourceCard.gamecardId) || playerUid)
      : playerUid;

    switch (effect.type) {
      case 'DRAW':
        this.drawCards(gameState, playerUid, effect.value || 1);
        break;

      case 'BOTH_PLAYERS_DRAW':
        Object.keys(gameState.players).forEach(uid => {
          this.drawCards(gameState, uid, effect.value || 1);
        });
        break;

      case 'TURN_EROSION_FACE_DOWN':
        this.turnErosionFaceDown(gameState, playerUid, effect.value || 0, sourceCard, querySelections);
        break;


      case 'ROTATE_HORIZONTAL':
        this.rotateCards(gameState, playerUid, effect, 'HORIZONTAL', sourceCard, querySelections);
        break;

      case 'ROTATE_VERTICAL':
        this.rotateCards(gameState, playerUid, effect, 'VERTICAL', sourceCard, querySelections);
        break;

      case 'SHUFFLE_DECK':
        this.shuffleDeck(gameState, playerUid);
        break;

      case 'REVEAL_DECK':
        this.revealDeck(gameState, playerUid, effect.value || 0);
        break;

      case 'SEARCH_DECK':
        this.searchDeck(gameState, playerUid, effect, sourceCard);
        break;

      case 'MOVE_FROM_HAND':
        this.moveCards(gameState, playerUid, effect, effect.destinationZone || 'GRAVE', 'HAND', sourceCard, querySelections, effectSourcePlayerUid);
        break;

      case 'MOVE_FROM_EROSION':
        this.moveCards(gameState, playerUid, effect, effect.destinationZone || 'HAND', 'EROSION_FRONT', sourceCard, querySelections, effectSourcePlayerUid);
        break;

      case 'MOVE_FROM_EROSION_BACK':
        this.moveCards(gameState, playerUid, effect, effect.destinationZone || 'GRAVE', 'EROSION_BACK', sourceCard, querySelections, effectSourcePlayerUid);
        break;

      case 'MOVE_FROM_DECK':
        this.moveCards(gameState, playerUid, effect, effect.destinationZone || 'HAND', 'DECK', sourceCard, querySelections, effectSourcePlayerUid);
        break;
      case 'MOVE_FROM_FIELD':
        // Standardize MOVE_FROM_FIELD to search both UNIT and ITEM zones
        this.moveCards(gameState, playerUid, effect, effect.destinationZone || 'HAND', ['UNIT', 'ITEM'], sourceCard, querySelections, effectSourcePlayerUid);
        break;

      case 'MOVE_FROM_GRAVE':
        this.moveCards(gameState, playerUid, effect, effect.destinationZone || 'HAND', 'GRAVE', sourceCard, querySelections, effectSourcePlayerUid);
        break;

      case 'NEGATE_EFFECT':
        this.negateEffect(gameState, effect, sourceCard);
        break;

      case 'IMMUNE_COMBAT_DESTRUCTION':
        this.applyImmunity(gameState, effect, 'COMBAT', sourceCard);
        break;

      case 'IMMUNE_EFFECT':
        this.applyImmunity(gameState, effect, 'EFFECT', sourceCard);
        break;

      case 'CHANGE_POWER':
        this.applyStatChange(gameState, effect, 'power', sourceCard, querySelections);
        break;
      case 'CHANGE_DAMAGE':
        this.applyStatChange(gameState, effect, 'damage', sourceCard, querySelections);
        break;
      case 'CHANGE_AC':
        this.applyStatChange(gameState, effect, 'acValue', sourceCard, querySelections);
        break;
      case 'CHANGE_GOD_MARK':
        this.applyStatChange(gameState, effect, 'godMark', sourceCard, querySelections);
        break;

      case 'SET_CAN_RESET_COUNT':
        this.setCanResetCount(gameState, effect, sourceCard, querySelections);
        break;

      case 'DEAL_EFFECT_DAMAGE':
        if (effect.value) this.dealDamage(gameState, opponentUid, playerUid, effect.value, 'EFFECT', effect.destinationZone, sourceCard);
        break;

      case 'DEAL_COMBAT_DAMAGE':
        if (effect.value) this.dealDamage(gameState, opponentUid, playerUid, effect.value, 'BATTLE', undefined, sourceCard);
        break;

      case 'DESTROY_CARD':
        await this.destroyCards(gameState, playerUid, effect, sourceCard, querySelections);
        break;

      case 'BANISH_CARD':
        this.moveCards(gameState, playerUid, effect, 'EXILE', undefined, sourceCard, querySelections);
        break;

      case 'DISCARD_CARD':
        this.moveCards(gameState, playerUid, effect, 'GRAVE', 'HAND', sourceCard, querySelections);
        break;

      case 'REVEAL_HAND':
        player.isHandPublic = effect.turnDuration !== undefined ? effect.turnDuration : -1;
        gameState.logs.push(`${player.displayName} 展示了手牌`);
        EventEngine.dispatchEvent(gameState, { type: 'REVEAL_HAND', playerUid });
        break;

      case 'SKIP_PHASE':
        // logic for skipping next phase
        gameState.logs.push(`跳过阶段: ${effect.params?.phase}`);
        break;

      case 'FORCE_PLAY':
        {
          const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
          targets.forEach(c => {
            const ownerUid = this.findCardOwnerKey(gameState, c.gamecardId) || playerUid;
            this.moveCard(gameState, ownerUid, c.cardlocation as any, ownerUid, 'PLAY', c.gamecardId, true, {
              effectSourcePlayerUid,
              effectSourceCardId: sourceCard?.gamecardId
            });
            EventEngine.dispatchEvent(gameState, {
              type: 'CARD_PLAYED',
              sourceCard: c,
              playerUid: ownerUid,
              sourceCardId: c.gamecardId
            });
          });
        }
        break;

      case 'EXECUTE_CARD_EFFECTS':
        await this.executeCardEffects(gameState, playerUid, effect, sourceCard, querySelections);
        break;

      case 'PAY_CARD_COST':
        // This is handled by ServerGameService's handleQueryChoice
        break;

      case 'CHANGE_CAN_ACTIVATE':
        this.applySilence(gameState, effect, sourceCard, querySelections);
        break;

      case 'IMMUNE_UNIT_EFFECTS':
        this.applyUnitImmunity(gameState, effect, sourceCard, querySelections);
        break;

      case 'DEAL_EFFECT_DAMAGE_SELF':
        if (effect.value) this.dealDamage(gameState, playerUid, playerUid, effect.value, 'EFFECT', effect.destinationZone, sourceCard);
        break;

      case 'GAIN_KEYWORD':
        this.applyKeyword(gameState, effect, sourceCard, querySelections);
        break;

      default:
        // console.warn(`AtomicEffectExecutor: Effect type ${effect.type} not fully implemented yet.`);
        break;
    }

    // After any atomic effect, we might need to recalculate continuous effects
    EventEngine.recalculateContinuousEffects(gameState);
  }

  private static async executeCardEffects(gameState: GameState, playerUid: string, effect: AtomicEffect, sourceCard?: Card, querySelections?: string[]) {
    const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
    const player = gameState.players[playerUid];

    for (const card of targets) {
      if (card.effects) {
        for (const e of card.effects) {
          if (e.atomicEffects) {
            for (const atomic of e.atomicEffects) {
              await this.execute(gameState, playerUid, atomic, card, undefined, querySelections);
            }
          }
          if (e.execute) {
            e.execute(card, gameState, player);
          }
        }
      }
    }
  }

  private static drawCards(gameState: GameState, playerUid: string, count: number) {
    const player = gameState.players[playerUid];
    for (let i = 0; i < count; i++) {
      if (player.deck.length > 0) {
        const card = player.deck.pop()!;
        card.cardlocation = 'HAND';
        player.hand.push(card);
        EventEngine.dispatchEvent(gameState, {
          type: 'CARD_DRAWN',
          sourceCard: card,
          playerUid,
          sourceCardId: card.gamecardId
        });
      } else {
        // Loss condition: Deck out during draw
        if (gameState.gameStatus !== 2) {
          gameState.gameStatus = 2;
          gameState.winReason = 'DECK_OUT_DRAW_EFFECT';
          gameState.winnerId = gameState.playerIds.find(id => id !== playerUid);
          gameState.logs.push(`[游戏结束] ${player.displayName} 尝试抽牌但卡组已空，判负。`);
        }
        return;
      }
    }
    gameState.logs.push(`${player.displayName} 抽了 ${count} 张卡`);
  }

  private static shuffleDeck(gameState: GameState, playerUid: string) {
    const player = gameState.players[playerUid];
    // Fisher-Yates shuffle
    for (let i = player.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [player.deck[i], player.deck[j]] = [player.deck[j], player.deck[i]];
    }
    EventEngine.dispatchEvent(gameState, {
      type: 'DECK_SHUFFLED',
      playerUid
    });
    gameState.logs.push(`${player.displayName} 洗了卡组`);
  }

  private static checkErosionBackDefeat(gameState: GameState) {
    if (gameState.gameStatus === 2) return true;

    for (const player of Object.values(gameState.players)) {
      const erosionBackCount = player.erosionBack.filter(card => card !== null).length;
      if (erosionBackCount >= 10) {
        gameState.gameStatus = 2;
        gameState.winReason = 'EROSION_BACK_FULL';
        gameState.winnerId = gameState.playerIds.find(id => id !== player.uid);
        gameState.logs.push(`[游戏结束] ${player.displayName} 的侵蚀区背面达到 10 张，判负。`);
        return true;
      }
    }

    return false;
  }

  private static applyStatChange(gameState: GameState, effect: AtomicEffect, stat: 'power' | 'damage' | 'acValue' | 'godMark', sourceCard?: Card, querySelections?: string[]) {
    const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
    targets.forEach(card => {
      if (this.shouldSkipEffect(gameState, card, sourceCard)) return;

      if (effect.value !== undefined) {
        if (!card.temporaryBuffSources) card.temporaryBuffSources = {};
        if (!card.temporaryBuffDetails) card.temporaryBuffDetails = {};
        const sourceName = sourceCard ? sourceCard.fullName : '效果';

        if (stat === 'power') {
          const ownerUid = this.findCardOwnerKey(gameState, card.gamecardId);
          const bonus = effect.value > 0 && ownerUid
            ? Number((card as any).data?.powerIncreaseBonus || 0)
            : 0;
          const finalValue = effect.value + bonus;
          if (effect.turnDuration === 0 || effect.turnDuration === -1) {
            card.basePower = (card.basePower || 0) + finalValue;
          } else if (effect.turnDuration === 1) {
            card.temporaryPowerBuff = (card.temporaryPowerBuff || 0) + finalValue;
            const existingDetails = card.temporaryBuffDetails['power'] || [];
            const existingEntry = existingDetails.find(entry => entry.sourceCardName === sourceName);
            if (existingEntry) {
              existingEntry.value = (existingEntry.value || 0) + finalValue;
            } else {
              existingDetails.push({ sourceCardName: sourceName, value: finalValue });
            }
            card.temporaryBuffDetails['power'] = existingDetails;
            card.temporaryBuffSources['power'] = sourceName;
          }
          card.power = (card.power || 0) + finalValue;
          EventEngine.dispatchEvent(gameState, { type: 'CARD_POWER_CHANGED', targetCardId: card.gamecardId, data: { delta: finalValue } });
        } else if (stat === 'damage') {
          if (effect.turnDuration === 0 || effect.turnDuration === -1) {
            card.baseDamage = (card.baseDamage || 0) + effect.value;
          } else if (effect.turnDuration === 1) {
            card.temporaryDamageBuff = (card.temporaryDamageBuff || 0) + effect.value;
            card.temporaryBuffSources['damage'] = sourceName;
          }
          card.damage = (card.damage || 0) + effect.value;
          EventEngine.dispatchEvent(gameState, { type: 'CARD_DAMAGE_CHANGED', targetCardId: card.gamecardId, data: { delta: effect.value } });
        } else if (stat === 'acValue') {
          if (effect.turnDuration === 0 || effect.turnDuration === -1) {
            card.baseAcValue = (card.baseAcValue || 0) + effect.value;
          }
          card.acValue = (card.acValue || 0) + effect.value;
          EventEngine.dispatchEvent(gameState, { type: 'CARD_AC_CHANGED', targetCardId: card.gamecardId, data: { delta: effect.value } });
        } else if (stat === 'godMark') {
          card.godMark = !!effect.value;
          EventEngine.dispatchEvent(gameState, { type: 'CHANGE_GOD_MARK' as any, targetCardId: card.gamecardId, data: { value: !!effect.value } });
        }
      }
    });
  }

  private static dealDamage(gameState: GameState, targetPlayerUid: string, dealerPlayerUid: string, amount: number, source: 'BATTLE' | 'EFFECT', destination?: TriggerLocation, sourceCard?: Card) {
    const player = gameState.players[targetPlayerUid];
    const dealer = gameState.players[dealerPlayerUid];

    if ((player as any).preventAllDamageTurn === gameState.turnCount) {
      gameState.logs.push(`[${(player as any).preventAllDamageSourceName || '伤害防止'}] 防止了 ${player.displayName} 将要受到的 ${amount} 点伤害。`);
      return;
    }

    if (
      source === 'EFFECT' &&
      targetPlayerUid !== dealerPlayerUid &&
      (player as any).preventOpponentEffectDamageTurn === gameState.turnCount
    ) {
      gameState.logs.push(`[${(player as any).preventOpponentEffectDamageSourceName || '伤害防止'}] 防止了 ${player.displayName} 将要受到的 ${amount} 点对手效果伤害。`);
      (player as any).preventedOpponentEffectDamageThisTurn = Number((player as any).preventedOpponentEffectDamageThisTurn || 0) + amount;
      this.bottomGraveCardsForPreventedEffectDamage(gameState, targetPlayerUid, amount, sourceCard);
      return;
    }

    if (
      source === 'BATTLE' &&
      (player as any).preventBattleDamageUpToTurn === gameState.turnCount &&
      amount <= Number((player as any).preventBattleDamageUpToAmount || 0)
    ) {
      gameState.logs.push(`[${(player as any).preventBattleDamageUpToSourceName || '伤害防止'}] 防止了 ${player.displayName} 将要受到的 ${amount} 点战斗伤害。`);
      delete (player as any).preventBattleDamageUpToTurn;
      delete (player as any).preventBattleDamageUpToAmount;
      delete (player as any).preventBattleDamageUpToSourceName;
      return;
    }

    let finalAmount = amount;
    if (source === 'EFFECT' && targetPlayerUid !== dealerPlayerUid && dealer.effectDamageModifier) {
      finalAmount += dealer.effectDamageModifier;
    }

    // New Goddess Mode Rules: 
    // 1. Damage is doubled
    // 2. Damage goes to Graveyard instead of Erosion
    let finalDestination = destination || 'EROSION_FRONT';
    if (player.isGoddessMode) {
      finalAmount *= 2;
      finalDestination = 'GRAVE';
      gameState.logs.push(`[女神化状态] ${player.displayName} 受到的伤害翻倍并直接进入墓地！`);
    }

    // Loss condition check
    if (player.deck.length < finalAmount) {
      if (gameState.gameStatus !== 2) {
        gameState.gameStatus = 2;
        gameState.winReason = source === 'BATTLE' ? 'DECK_OUT_BATTLE_DAMAGE' : 'DECK_OUT_EFFECT_DAMAGE';
        gameState.winnerId = gameState.playerIds.find(id => id !== targetPlayerUid);
        gameState.logs.push(`[游戏结束] ${player.displayName} 受到伤害但卡组不足以支付，判负。`);
      }
      return;
    }

    gameState.logs.push(`${player.displayName} 受到了 ${finalAmount} 点 ${source === 'BATTLE' ? '战斗' : '效果'} 伤害`);

    for (let i = 0; i < finalAmount; i++) {
      const card = player.deck.pop()!;
      let loopDestination: TriggerLocation = finalDestination;

      if (loopDestination === 'EROSION_FRONT' && card.effects) {
        for (const effect of card.effects) {
          if (
            effect.type === 'CONTINUOUS' &&
            effect.movementReplacementDestination &&
            effect.content !== 'REPLACE_DAMAGE_TO_EROSION'
          ) {
            const checkResult = GameService.checkEffectLimitsAndReqs(
              gameState,
              player.uid,
              card,
              effect,
              card.cardlocation as TriggerLocation
            );
            if (checkResult.valid) {
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
              const checkResult = GameService.checkEffectLimitsAndReqs(
                gameState,
                owner.uid,
                sourceCard,
                effect,
                sourceCard.cardlocation as TriggerLocation
              );
              if (checkResult.valid) {
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

      card.displayState = 'FRONT_UPRIGHT';
      card.cardlocation = loopDestination;

      if (loopDestination === 'EROSION_FRONT') {
        card.isExhausted = false;
        const currentErosion = player.erosionFront.filter(c => c !== null).length + player.erosionBack.filter(c => c !== null).length;
        if (currentErosion >= 10) {
          if (card.id === '201000140' || card.id === '201000040' || card.fullName === '解放之光') {
            loopDestination = 'EXILE';
            card.cardlocation = 'EXILE';
            player.exile.push(card);
            gameState.logs.push(`[替换效果] [${card.fullName}] 将要被送入墓地，改为放逐。`);
          } else {
            loopDestination = 'GRAVE';
            card.cardlocation = 'GRAVE';
            player.grave.push(card);
            gameState.logs.push(`[侵蚀区已满] ${card.fullName} 因侵蚀区已达10张改为送入墓地。`);
          }
        } else {
          const emptyIndex = player.erosionFront.findIndex(c => c === null);
          if (emptyIndex !== -1) player.erosionFront[emptyIndex] = card;
          else player.erosionFront.push(card);
        }
      } else if (loopDestination === 'GRAVE') {
        player.grave.push(card);
      } else if (loopDestination === 'HAND') {
        player.hand.push(card);
      } else if (loopDestination === 'EXILE') {
        player.exile.push(card);
      }

      // Check for goddess transformation during resolution
      const totalErosion = player.erosionFront.filter(c => c !== null).length + player.erosionBack.filter(c => c !== null).length;
      if (totalErosion >= 10 && !player.isGoddessMode) {
        (gameState as any).pendingGoddessTransformationDamageSource = source;
        (gameState as any).pendingGoddessTransformationEffectSourcePlayerUid = dealerPlayerUid;
        if (typeof (GameService as any).triggerGoddessTransformation === 'function') {
          (GameService as any).triggerGoddessTransformation(gameState, targetPlayerUid);
        } else {
          player.isGoddessMode = true;
          gameState.logs.push(`${player.displayName} 进入女神化状态。`);
          delete (gameState as any).pendingGoddessTransformationDamageSource;
          delete (gameState as any).pendingGoddessTransformationEffectSourcePlayerUid;
          EventEngine.dispatchEvent(gameState, {
            type: 'GODDESS_TRANSFORMATION',
            playerUid: targetPlayerUid,
            data: {
              playerUid: targetPlayerUid,
              damageSource: source,
              effectSourcePlayerUid: dealerPlayerUid,
              enteredByEffect: source === 'EFFECT'
            }
          });
        }
        // Note: doubling and direct grave destination apply only to damage received thereafter.
      }
    }

    // Post-loop cleanup: Excess erosion front cards to Grave
    const totalAfterPlacement = player.erosionFront.filter(c => c !== null).length + player.erosionBack.filter(c => c !== null).length;
    if (totalAfterPlacement > 10) {
      for (let j = 10; j < player.erosionFront.length; j++) {
        const excessCard = player.erosionFront[j];
        if (excessCard) {
          excessCard.cardlocation = 'GRAVE';
          player.grave.push(excessCard);
          player.erosionFront[j] = null;
        }
      }
    }

    EventEngine.dispatchEvent(gameState, {
      type: source === 'BATTLE' ? 'COMBAT_DAMAGE_CAUSED' : 'EFFECT_DAMAGE_CAUSED',
      sourceCard,
      sourceCardId: sourceCard?.gamecardId,
      playerUid: targetPlayerUid,
      data: { amount: finalAmount, destination: finalDestination }
    });
  }

  private static bottomGraveCardsForPreventedEffectDamage(gameState: GameState, playerUid: string, amount: number, sourceCard?: Card) {
    const player = gameState.players[playerUid];
    if (!player || amount <= 0) return;
    const sourceName = (player as any).preventOpponentEffectDamageSourceName || sourceCard?.fullName || '伤害防止';
    const cards = player.grave.slice(0, Math.min(amount, player.grave.length));
    cards.forEach(card => this.moveCard(
      gameState,
      playerUid,
      'GRAVE',
      playerUid,
      'DECK',
      card.gamecardId,
      true,
      {
        insertAtBottom: true,
        effectSourcePlayerUid: playerUid,
        effectSourceCardId: (player as any).preventOpponentEffectDamageSourceCardId || sourceCard?.gamecardId
      }
    ));
    if (cards.length > 0) {
      gameState.logs.push(`[${sourceName}] 将墓地 ${cards.length} 张卡放置到卡组底。`);
    }
  }

  private static async destroyCards(gameState: GameState, playerUid: string, effect: AtomicEffect, sourceCard?: Card, querySelections?: string[]) {
    const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
    const finalTargets = effect.targetCount ? targets.slice(0, effect.targetCount) : targets;

    for (const card of finalTargets) {
      if (this.shouldSkipEffect(gameState, card, sourceCard)) continue;

      // Find which player owns the card
      for (const pUid of Object.keys(gameState.players)) {
        const p = gameState.players[pUid];
        if (p.unitZone.some(c => c?.gamecardId === card.gamecardId) ||
          p.itemZone.some(c => c?.gamecardId === card.gamecardId)) {

          // Use ServerGameService.destroyUnit for proper logic/substitution
          await GameService.destroyUnit(gameState, pUid, card.gamecardId, true, playerUid);
          break;
        }
      }
    }
  }

  private static moveCards(
    gameState: GameState,
    playerUid: string,
    effect: AtomicEffect,
    toZone: TriggerLocation,
    fromZonePref?: TriggerLocation | TriggerLocation[],
    sourceCard?: Card,
    querySelections?: string[],
    effectSourcePlayerUid?: string
  ) {
    // Ensure we only look in the preferred zone if provided and no specific zone filter is set
    let filter = effect.targetFilter;
    if (fromZonePref && (!filter || !filter.zone)) {
      const preferredZones = Array.isArray(fromZonePref) ? fromZonePref : [fromZonePref];
      filter = { ...filter, zone: preferredZones };
    }

    // Bug Fix: If targeting a specific gamecardId (e.g. from a resolve query), 
    // allow searching ALL players' zones.
    let preferredOwner: string | undefined = playerUid;
    if (filter?.gamecardId || querySelections) {
      preferredOwner = undefined;
    }
    
    const targets = this.findTargets(gameState, filter, sourceCard, querySelections, preferredOwner);

    // For deck movements, top card is the last card in the array. 
    // findTargets returns them in array order [bottom...top].
    // If no specific IDs are targeted, we should reverse to pick from the top.
    let processedTargets = targets;
    if (fromZonePref === 'DECK' && (!effect.targetFilter || (!effect.targetFilter.gamecardId && !effect.targetFilter.id)) && !querySelections) {
      processedTargets = [...targets].reverse();
    }

    // Limit by targetCount. Default to 1 for MOVE_FROM_DECK if not specified to prevent moving whole deck.
    const defaultCount = (fromZonePref === 'DECK' && !querySelections) ? 1 : undefined;
    const count = effect.targetCount !== undefined ? effect.targetCount : defaultCount;
    if (fromZonePref === 'DECK' && count !== undefined && count > 0 && !querySelections) {
      const deckCount = gameState.players[playerUid]?.deck.length || 0;
      if (deckCount < count) {
        this.loseForInsufficientDeckMove(gameState, playerUid, count, sourceCard);
        return;
      }
    }
    const finalTargets = count !== undefined ? processedTargets.slice(0, count) : processedTargets;

    finalTargets.forEach(card => {
      if (this.shouldSkipEffect(gameState, card, sourceCard)) return;
      if (toZone === 'UNIT' && card.type !== 'UNIT') {
        gameState.logs.push(`[系统] [${card.fullName}] 不是单位卡，不能放置到单位区。`);
        return;
      }
      if (toZone === 'ITEM' && card.type !== 'ITEM') {
        gameState.logs.push(`[系统] [${card.fullName}] 不是道具卡，不能放置到道具区。`);
        return;
      }

      // Find current zone and OWNER
      const currentZone = card.cardlocation as TriggerLocation;

      // Look for the actual owner of the target card
      let ownerUid = playerUid;
      for (const uid of Object.keys(gameState.players)) {
        const p = gameState.players[uid];
        const allZones = [p.hand, p.unitZone, p.itemZone, p.grave, p.exile, p.deck, p.erosionFront, p.erosionBack];
        if (allZones.some(zone => zone.some(c => c && c.gamecardId === card.gamecardId))) {
          ownerUid = uid;
          break;
        }
      }

      this.moveCard(gameState, ownerUid, currentZone, ownerUid, toZone, card.gamecardId, true, {
        effectSourcePlayerUid,
        effectSourceCardId: sourceCard?.gamecardId,
        faceDown: effect.faceDown
      });

      // If moving to unit zone from anywhere, mark as played this turn to ensure summon sickness applies
      if (toZone === 'UNIT' && card) {
        card.playedTurn = gameState.turnCount;
      }
    });
  }

  private static rotateCards(gameState: GameState, playerUid: string, effect: AtomicEffect, direction: 'HORIZONTAL' | 'VERTICAL', sourceCard?: Card, querySelections?: string[]) {
    const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
    const effectSourcePlayerUid = sourceCard?.gamecardId
      ? (this.findCardOwnerKey(gameState, sourceCard.gamecardId) || playerUid)
      : playerUid;
    const allTargetCardIds = targets.map(card => card.gamecardId);

    targets.forEach(card => {
      if (this.shouldSkipEffect(gameState, card, sourceCard)) return;
      if (
        direction === 'HORIZONTAL' &&
        (card as any).data?.cannotExhaustUntilTurn !== undefined &&
        (card as any).data.cannotExhaustUntilTurn >= gameState.turnCount
      ) {
        gameState.logs.push(`[${card.fullName}] 因 [${(card as any).data.cannotExhaustSourceName || '卡牌效果'}] 不能横置。`);
        return;
      }

      card.isExhausted = direction === 'HORIZONTAL';
      if (direction === 'VERTICAL') {
        card.hasAttackedThisTurn = false;
        if (gameState.battleState) {
          gameState.battleState.keepResetUnitIds = Array.from(new Set([...(gameState.battleState.keepResetUnitIds || []), card.gamecardId]));
        }
      }
      EventEngine.dispatchEvent(gameState, {
        type: 'CARD_ROTATED',
        sourceCard,
        sourceCardId: sourceCard?.gamecardId,
        targetCardId: card.gamecardId,
        playerUid: effectSourcePlayerUid,
        data: {
          direction,
          effectSourcePlayerUid,
          effectSourceCardId: sourceCard?.gamecardId,
          allTargetCardIds
        }
      });
    });
  }

  private static revealDeck(gameState: GameState, playerUid: string, count: number) {
    const player = gameState.players[playerUid];
    const cards = player.deck.slice(-count).reverse();
    gameState.logs.push(`${player.displayName} 展示了卡组顶部的 ${cards.length} 张卡: ${cards.map(c => c.fullName).join(', ')}`);
    EventEngine.dispatchEvent(gameState, { type: 'REVEAL_DECK', playerUid, data: { cards } });
  }

  private static searchDeck(gameState: GameState, playerUid: string, effect: AtomicEffect, sourceCard?: Card) {
    const player = gameState.players[playerUid];
    const effectSourcePlayerUid = sourceCard?.gamecardId
      ? (this.findCardOwnerKey(gameState, sourceCard.gamecardId) || playerUid)
      : playerUid;
    const results = player.deck.filter(c => this.matchesFilter(c, effect.targetFilter, sourceCard));
    if (results.length > 0) {
      // In a real game, this would be a UI choice if there are multiple. 
      // For atomic execution, we might pick the first one or the specific one.
      const card = results[0];
      this.moveCard(gameState, playerUid, 'DECK', playerUid, effect.destinationZone || 'HAND', card.gamecardId, true, {
        effectSourcePlayerUid,
        effectSourceCardId: sourceCard?.gamecardId
      });
      this.shuffleDeck(gameState, playerUid);
    }
  }

  private static setCanResetCount(gameState: GameState, effect: AtomicEffect, sourceCard?: Card, querySelections?: string[]) {
    const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
    targets.forEach(card => {
      if (this.shouldSkipEffect(gameState, card, sourceCard)) return;

      card.canResetCount = effect.value || 0;
      const ownerUid = this.findCardOwnerKey(gameState, card.gamecardId) || '';
      const identity = getCardIdentity(gameState, ownerUid, card);
      gameState.logs.push(`${identity} ${card.fullName} 的调度重置计数被设为 ${card.canResetCount}`);
    });
  }

  private static negateEffect(gameState: GameState, effect: AtomicEffect, sourceCard?: Card, querySelections?: string[]) {
    const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
    targets.forEach(card => {
      if (this.shouldSkipEffect(gameState, card, sourceCard)) return;

      // logic to negate card effects
      const ownerUid = this.findCardOwnerKey(gameState, card.gamecardId) || '';
      const identity = getCardIdentity(gameState, ownerUid, card);
      gameState.logs.push(`${identity} ${card.fullName} 的效果被无效了`);
      EventEngine.dispatchEvent(gameState, { type: 'EFFECT_COUNTERED', targetCardId: card.gamecardId });
    });
  }

  private static applyImmunity(gameState: GameState, effect: AtomicEffect, type: 'COMBAT' | 'EFFECT', sourceCard?: Card, querySelections?: string[]) {
    const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
    targets.forEach(card => {
      const ownerUid = this.findCardOwnerKey(gameState, card.gamecardId) || '';
      const identity = getCardIdentity(gameState, ownerUid, card);
      gameState.logs.push(`${identity} ${card.fullName} 获得了对${type === 'COMBAT' ? '战斗' : '效果'}的免疫`);
    });
  }

  static findCardById(gameState: GameState, cardId: string): Card | undefined {
    for (const uid of Object.keys(gameState.players)) {
      const p = gameState.players[uid];
      const zones = [p.hand, p.unitZone, p.itemZone, p.grave, p.exile, p.deck, p.erosionFront, p.erosionBack, p.playZone];
      for (const zone of zones) {
        const card = zone.find(c => c && c.gamecardId === cardId);
        if (card) return card;
      }
    }
    return undefined;
  }

  static findCardOwnerKey(gameState: GameState, cardId: string): string | undefined {
    for (const uid of Object.keys(gameState.players)) {
      const p = gameState.players[uid];
      const hasCard = [...p.hand, ...p.unitZone, ...p.itemZone, ...p.grave, ...p.exile, ...p.erosionFront, ...p.erosionBack, ...p.deck, ...p.playZone]
        .some(c => c && c.gamecardId === cardId);
      if (hasCard) return uid;
    }
    return undefined;
  }

  private static isOpponentAcAtMost(gameState: GameState, target: Card, source: Card, maxAc: number, sourceUid?: string): boolean {
    const targetUid = this.findCardOwnerKey(gameState, target.gamecardId);
    const sourceOwnerUid = sourceUid || this.findCardOwnerKey(gameState, source.gamecardId);
    return !!targetUid &&
      !!sourceOwnerUid &&
      targetUid !== sourceOwnerUid &&
      Number(source.acValue || 0) <= maxAc;
  }

  static matchesColor(card: Card, targetColor: string): boolean {
    if (card.color === targetColor) return true;

    const extraColors = [
      ...((card as any).temporaryExtraColors || []),
      ...((card as any).persistentExtraColors || [])
    ];
    if (
      ['UNIT', 'ITEM', 'EROSION_FRONT'].includes(card.cardlocation as string) &&
      Array.isArray(extraColors) &&
      extraColors.includes(targetColor)
    ) {
      return true;
    }

    // Robust check for 105000481 (string/number safe)
    const isOmni = String(card.id) === '105000481' || (card.effects && card.effects.some(e => e.id === '105000481_omni'));

    if (isOmni && ['UNIT', 'EROSION_FRONT'].includes(card.cardlocation as string)) {
      return true;
    }
    return false;
  }

  static matchesFilter(card: Card, filter?: CardFilter, sourceCard?: Card, querySelections?: string[], currentZone?: TriggerLocation): boolean {
    if (!filter) return true;

    if (filter.querySelection && querySelections) {
      if (!querySelections.includes(card.gamecardId)) return false;
    }

    if (filter.id && card.id !== filter.id) return false;
    if (filter.hasOwnProperty('gamecardId') && card.gamecardId !== filter.gamecardId) return false;
    if (filter.type) {
      if (filter.type === 'ITEM') {
        if (card.type !== 'ITEM' && !card.isEquip) return false;
      } else {
        if (card.type !== filter.type) return false;
      }
    }
    if (filter.color && !this.matchesColor(card, filter.color)) return false;
    if (filter.faction && card.faction !== filter.faction) return false;
    if (filter.godMark !== undefined && card.godMark !== filter.godMark) return false;
    if (filter.minPower !== undefined && (card.power || 0) < filter.minPower) return false;
    if (filter.maxPower !== undefined && (card.power || 0) > filter.maxPower) return false;
    if (filter.minAc !== undefined && card.acValue < filter.minAc) return false;
    if (filter.maxAc !== undefined && card.acValue > filter.maxAc) return false;

    // Exclusions
    if (filter.excludeColor && card.color === filter.excludeColor) return false;
    if (filter.excludeSelf && sourceCard && card.gamecardId === sourceCard.gamecardId) return false;
    if (filter.excludeId && card.id !== filter.id) return false;
    if (filter.excludeGamecardId && card.gamecardId === filter.excludeGamecardId) return false;

    if (filter.fuzzyName && !card.fullName.includes(filter.fuzzyName)) return false;
    if (filter.isExhausted !== undefined && card.isExhausted !== filter.isExhausted) return false;

    // Field/Zone check (with robust fallback)
    const effectiveLocation = (card.cardlocation as TriggerLocation) || currentZone;
    if (filter.onField && !['UNIT', 'ITEM'].includes(effectiveLocation as string)) return false;
    if (filter.zone && !filter.zone.includes(effectiveLocation as any)) return false;

    return true;
  }

  static findTargets(gameState: GameState, filter?: CardFilter, sourceCard?: Card, querySelections?: string[], preferredPlayerUid?: string): Card[] {
    const results: Card[] = [];

    const playersToSearch = preferredPlayerUid ? [gameState.players[preferredPlayerUid]] : Object.values(gameState.players);

    playersToSearch.forEach(player => {
      if (!player) return;
      const zones: { data: (Card | null)[], type: TriggerLocation }[] = [
        { data: player.hand, type: 'HAND' },
        { data: player.unitZone, type: 'UNIT' },
        { data: player.itemZone, type: 'ITEM' },
        { data: player.grave, type: 'GRAVE' },
        { data: player.exile, type: 'EXILE' },
        { data: player.deck, type: 'DECK' },
        { data: player.erosionFront, type: 'EROSION_FRONT' },
        { data: player.erosionBack, type: 'EROSION_BACK' }
      ];

      zones.forEach(zone => {
        zone.data.forEach(card => {
          if (!card) return;

          const isChosenEffectTarget = !!filter?.gamecardId || !!filter?.querySelection;
          if (
            isChosenEffectTarget &&
            sourceCard &&
            (card.cardlocation === 'UNIT' || card.cardlocation === 'ITEM') &&
            card.gamecardId !== sourceCard.gamecardId &&
            (
              (card as any).cannotBeEffectTargetByEffect ||
              (
                (card as any).data?.cannotBeEffectTargetByOpponent &&
                !!this.findCardOwnerKey(gameState, card.gamecardId) &&
                !!this.findCardOwnerKey(gameState, sourceCard.gamecardId) &&
                this.findCardOwnerKey(gameState, card.gamecardId) !== this.findCardOwnerKey(gameState, sourceCard.gamecardId)
              ) ||
              (
                Array.isArray((card as any).data?.cannotBeEffectTargetColors) &&
                (card as any).data.cannotBeEffectTargetColors.includes(sourceCard.color)
              ) ||
              (
                (card as any).data?.cannotBeEffectTargetByOpponentAcLe !== undefined &&
                this.isOpponentAcAtMost(gameState, card, sourceCard, Number((card as any).data.cannotBeEffectTargetByOpponentAcLe))
              )
            )
          ) {
            return;
          }

          if (this.matchesFilter(card, filter, sourceCard, querySelections, zone.type)) {
            results.push(card);
          }
        });
      });
    });

    return results;
  }

  static moveCard(
    gameState: GameState,
    playerUid: string,
    fromZone: TriggerLocation,
    toPlayerUid: string,
    toZone: TriggerLocation,
    cardId: string,
    isEffect?: boolean,
    options?: { faceDown?: boolean; insertAtBottom?: boolean; effectSourcePlayerUid?: string; effectSourceCardId?: string; targetIndex?: number }
  ) {
    const sourcePlayer = gameState.players[playerUid];
    const targetPlayer = gameState.players[toPlayerUid];

    let card: Card | undefined;
    let fromArray: (Card | null)[] = [];
    let previousSourceCardId: string | undefined;
    let leftZoneHandled = false;

    // Localized movement logic to handle specific Yu-Gi-Oh events
    const findInZone = (zone: (Card | null)[], loc: TriggerLocation) => {
      if (loc === fromZone) fromArray = zone;
    };
    findInZone(sourcePlayer.hand, 'HAND');
    findInZone(sourcePlayer.unitZone, 'UNIT');
    findInZone(sourcePlayer.itemZone, 'ITEM');
    findInZone(sourcePlayer.grave, 'GRAVE');
    findInZone(sourcePlayer.exile, 'EXILE');
    findInZone(sourcePlayer.deck, 'DECK');
    findInZone(sourcePlayer.erosionFront, 'EROSION_FRONT');
    findInZone(sourcePlayer.erosionBack, 'EROSION_BACK');
    findInZone(sourcePlayer.playZone, 'PLAY');

    const idx = fromArray.findIndex(c => c?.gamecardId === cardId);
    if (idx !== -1) {
      card = fromArray[idx]!;
      previousSourceCardId = card.gamecardId;
      if (
        isEffect &&
        (fromZone === 'UNIT' || fromZone === 'ITEM') &&
        !['UNIT', 'ITEM'].includes(toZone) &&
        options?.effectSourcePlayerUid &&
        options.effectSourcePlayerUid !== playerUid &&
        (card as any).data?.cannotLeaveFieldByOpponentEffectTurn === gameState.turnCount
      ) {
        const sourceName = (card as any).data?.cannotLeaveFieldByOpponentEffectSourceName || '卡牌效果';
        gameState.logs.push(`[${sourceName}] 防止了 [${card.fullName}] 因对手效果从战场离开。`);
        return;
      }
      if (
        isEffect &&
        (fromZone === 'UNIT' || fromZone === 'ITEM') &&
        !['UNIT', 'ITEM'].includes(toZone) &&
        options?.effectSourceCardId
      ) {
        const sourceCard = this.findCardById(gameState, options.effectSourceCardId);
        if (
          sourceCard &&
          (card as any).data?.cannotLeaveFieldByOpponentAcLe !== undefined &&
          this.isOpponentAcAtMost(gameState, card, sourceCard, Number((card as any).data.cannotLeaveFieldByOpponentAcLe), options.effectSourcePlayerUid)
        ) {
          gameState.logs.push(`[${card.fullName}] cannot leave the field by opponent ACCESS ${(card as any).data.cannotLeaveFieldByOpponentAcLe} or less card effects.`);
          return;
        }
      }
      if (['UNIT', 'ITEM', 'EROSION_FRONT', 'EROSION_BACK'].includes(fromZone)) {
        fromArray[idx] = null;
      } else {
        fromArray.splice(idx, 1);
      }
      if (fromZone !== toZone) {
        EventEngine.handleCardLeftZone(gameState, playerUid, card, fromZone, isEffect, toZone, {
          effectSourcePlayerUid: options?.effectSourcePlayerUid,
          effectSourceCardId: options?.effectSourceCardId,
          previousSourceCardId
        });
        leftZoneHandled = true;
      }
    }

    if (!card) return;

    if (toZone === 'GRAVE' && (card.id === '201000140' || card.id === '201000040' || card.fullName === '解放之光')) {
      toZone = 'EXILE';
      gameState.logs.push(`[替换效果] [${card.fullName}] 将要被送入墓地，改为放逐。`);
    }

    if (
      (fromZone === 'UNIT' || fromZone === 'ITEM') &&
      toZone !== 'EXILE' &&
      !['UNIT', 'ITEM'].includes(toZone) &&
      (card as any).data?.exileWhenLeavesFieldSourceName
    ) {
      toZone = 'EXILE';
      gameState.logs.push(`[替换效果] [${card.fullName}] 离开战场时改为放逐。`);
    }

    if (
      isEffect &&
      (fromZone === 'EROSION_FRONT' || fromZone === 'EROSION_BACK') &&
      toZone === 'EXILE'
    ) {
      sourcePlayer.exiledFromErosionTurn = gameState.turnCount;
    }

    let shouldRefreshAsNewInstance =
      (toZone === 'HAND' || toZone === 'DECK') &&
      fromZone !== 'HAND' &&
      fromZone !== 'DECK';

    if (shouldRefreshAsNewInstance) {
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
      card.temporaryCanActivateEffect = undefined;
      card.temporaryImmuneToUnitEffects = undefined;
      card.temporaryPowerBuff = 0;
      card.temporaryDamageBuff = 0;
      card.temporaryRush = false;
      card.temporaryHeroic = false;
      card.temporaryCanAttackAny = false;
      delete (card as any).temporaryExtraColors;
      delete (card as any).persistentExtraColors;
      card.temporaryBuffSources = {};
      card.temporaryBuffDetails = {};
      card.influencingEffects = [];
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
    }

    // Movement Replacement logic (e.g. 104010484)
    if (isEffect && (toZone === 'HAND' || toZone === 'DECK' || toZone === 'EROSION_FRONT' || toZone === 'EROSION_BACK')) {
      if (card.effects) {
        for (const effect of card.effects) {
          if (
            effect.type === 'CONTINUOUS' &&
            effect.movementReplacementDestination &&
            effect.content !== 'REPLACE_DAMAGE_TO_EROSION'
          ) {
            const player = gameState.players[toPlayerUid];
            const checkResult = GameService.checkEffectLimitsAndReqs(
              gameState,
              player.uid,
              card,
              effect,
              card.cardlocation as TriggerLocation
            );
            if (checkResult.valid) {
              gameState.logs.push(`[替换效果] ${card.fullName} 的移动目的地从 ${toZone} 被替换为 ${effect.movementReplacementDestination}`);
              toZone = effect.movementReplacementDestination;
              break;
            }
          }
        }
      }
    }
    const clearsBattlefieldState = shouldClearBattlefieldStateOnMove(fromZone, toZone);
    if (clearsBattlefieldState) {
      EventEngine.dispatchMovementSubEvents(gameState, {
        card,
        cardOwnerUid: playerUid,
        fromZone,
        toZone,
        isEffect,
        effectSourcePlayerUid: options?.effectSourcePlayerUid,
        effectSourceCardId: options?.effectSourceCardId,
        previousSourceCardId,
        onlyLeftFieldEvent: true
      });
      clearBattlefieldState(card);
    }

    if (!(card as any).data) {
      (card as any).data = {};
    }
    (card as any).data.lastMovedFromZone = fromZone;
    (card as any).data.lastMovedToZone = toZone;
    if (isEffect) {
      (card as any).data.lastMovedByEffectTurn = gameState.turnCount;
      (card as any).data.lastMoveEffectSourceCardId = options?.effectSourceCardId;
    }

    if (options?.faceDown !== undefined) {
      card.displayState = options.faceDown ? 'FRONT_FACEDOWN' : 'FRONT_UPRIGHT';
    } else if (toZone === 'EROSION_FRONT') {
      card.displayState = 'FRONT_UPRIGHT';
    } else if (toZone === 'EROSION_BACK') {
      card.displayState = 'FRONT_FACEDOWN';
    } else if (toZone === 'GRAVE') {
      card.displayState = 'FRONT_UPRIGHT';
      card.isExhausted = false;
    }

    if ((toZone === 'EROSION_FRONT' || toZone === 'EROSION_BACK')) {
      card.isExhausted = false;
      const currentErosion = targetPlayer.erosionFront.filter(c => c !== null).length + targetPlayer.erosionBack.filter(c => c !== null).length;
      if (currentErosion >= 10) {
        gameState.logs.push(`[侵蚀区已满] ${card.fullName} 因侵蚀区已达10张改为送入墓地。`);
        toZone = 'GRAVE';
        card.displayState = 'FRONT_UPRIGHT';
        card.isExhausted = false;
      }
    }

    if (
      isEffect &&
      fromZone === 'DECK' &&
      toZone === 'UNIT' &&
      options?.effectSourceCardId
    ) {
      const sourceCard = this.findCardById(gameState, options.effectSourceCardId);
      if (sourceCard?.fullName?.includes('炼金')) {
        (card as any).data.enteredFromDeckByAlchemyTurn = gameState.turnCount;
        (card as any).data.enteredFromDeckByAlchemySourceCardId = sourceCard.gamecardId;
      }
    }

    if (
      isEffect &&
      fromZone === 'GRAVE' &&
      toZone === 'UNIT' &&
      card.type === 'UNIT'
    ) {
      targetPlayer.unitFromGraveToFieldTurn = gameState.turnCount;
    }

    if (
      isEffect &&
      toZone === 'GRAVE' &&
      (fromZone === 'UNIT' || fromZone === 'ITEM')
    ) {
      (card as any).data.sentToGraveFromFieldByEffectTurn = gameState.turnCount;
      (card as any).data.sentToGraveFromFieldByEffectSourceCardId = options?.effectSourceCardId;
    }

    card.cardlocation = toZone;
    if (toZone === 'UNIT' || toZone === 'ITEM') {
      card.isExhausted = false;
      card.playedTurn = gameState.turnCount;
    }
    let toArray: (Card | null)[] = [];
    const findToZone = (zone: (Card | null)[], loc: TriggerLocation) => {
      if (loc === toZone) toArray = zone;
    };
    findToZone(targetPlayer.hand, 'HAND');
    findToZone(targetPlayer.unitZone, 'UNIT');
    findToZone(targetPlayer.itemZone, 'ITEM');
    findToZone(targetPlayer.grave, 'GRAVE');
    findToZone(targetPlayer.exile, 'EXILE');
    findToZone(targetPlayer.deck, 'DECK');
    findToZone(targetPlayer.erosionFront, 'EROSION_FRONT');
    findToZone(targetPlayer.erosionBack, 'EROSION_BACK');
    findToZone(targetPlayer.playZone, 'PLAY');

    if (['UNIT', 'ITEM', 'EROSION_FRONT', 'EROSION_BACK'].includes(toZone)) {
      const targetIndex =
        options?.targetIndex !== undefined &&
        options.targetIndex >= 0 &&
        options.targetIndex < toArray.length &&
        toArray[options.targetIndex] === null
          ? options.targetIndex
          : -1;
      if (targetIndex !== -1) {
        toArray[targetIndex] = card;
      } else {
        const emptyIdx = toArray.findIndex(c => c === null);
        if (emptyIdx !== -1) toArray[emptyIdx] = card;
        else toArray.push(card);
      }
    } else {
      if (options?.insertAtBottom) {
        toArray.unshift(card);
      } else {
        toArray.push(card);
      }
    }

    // Specific Events based on movement
    if (leftZoneHandled) {
      EventEngine.handleCardEnteredZone(gameState, playerUid, card, toZone, isEffect, {
        sourceZone: fromZone,
        targetZone: toZone,
        effectSourcePlayerUid: options?.effectSourcePlayerUid,
        effectSourceCardId: options?.effectSourceCardId,
        previousSourceCardId
      });
      EventEngine.dispatchMovementSubEvents(gameState, {
        card,
        cardOwnerUid: playerUid,
        fromZone,
        toZone,
        isEffect,
        effectSourcePlayerUid: options?.effectSourcePlayerUid,
        effectSourceCardId: options?.effectSourceCardId,
        previousSourceCardId,
        skipLeftFieldEvent: clearsBattlefieldState
      });
    } else {
      this.dispatchMovementEvents(gameState, playerUid, card, fromZone, toZone, isEffect, options);
    }

    if (toZone === 'EROSION_BACK') {
      this.checkErosionBackDefeat(gameState);
    }

    if (
      (toZone === 'EROSION_FRONT' || toZone === 'EROSION_BACK') &&
      targetPlayer.erosionFront.filter(c => c !== null).length + targetPlayer.erosionBack.filter(c => c !== null).length >= 10 &&
      !targetPlayer.isGoddessMode
    ) {
      if (isEffect) {
        (gameState as any).pendingGoddessTransformationDamageSource = 'EFFECT';
        (gameState as any).pendingGoddessTransformationEffectSourcePlayerUid = options?.effectSourcePlayerUid;
        (gameState as any).pendingGoddessTransformationEffectSourceCardId = options?.effectSourceCardId;
      }
      if (typeof (GameService as any).triggerGoddessTransformation === 'function') {
        (GameService as any).triggerGoddessTransformation(gameState, toPlayerUid);
      } else {
        targetPlayer.isGoddessMode = true;
        gameState.logs.push(`${targetPlayer.displayName} 进入女神化状态。`);
        EventEngine.dispatchEvent(gameState, {
          type: 'GODDESS_TRANSFORMATION',
          playerUid: toPlayerUid,
          data: {
            playerUid: toPlayerUid,
            damageSource: isEffect ? 'EFFECT' : undefined,
            effectSourcePlayerUid: options?.effectSourcePlayerUid,
            effectSourceCardId: options?.effectSourceCardId,
            enteredByEffect: !!isEffect
          }
        });
      }
    }
  }

  private static dispatchMovementEvents(
    gameState: GameState,
    playerUid: string,
    card: Card,
    from: TriggerLocation,
    to: TriggerLocation,
    isEffect?: boolean,
    options?: { effectSourcePlayerUid?: string; effectSourceCardId?: string }
  ) {
    // Use centralized EventEngine handlers for movement events to avoid double dispatches
    if (from !== to) {
      EventEngine.handleCardLeftZone(gameState, playerUid, card, from, isEffect, to, {
        effectSourcePlayerUid: options?.effectSourcePlayerUid,
        effectSourceCardId: options?.effectSourceCardId
      });
      EventEngine.handleCardEnteredZone(gameState, playerUid, card, to, isEffect, {
        sourceZone: from,
        targetZone: to,
        effectSourcePlayerUid: options?.effectSourcePlayerUid,
        effectSourceCardId: options?.effectSourceCardId
      });
    }

    EventEngine.dispatchMovementSubEvents(gameState, {
      card,
      cardOwnerUid: playerUid,
      fromZone: from,
      toZone: to,
      isEffect,
      effectSourcePlayerUid: options?.effectSourcePlayerUid,
      effectSourceCardId: options?.effectSourceCardId
    });
  }

  private static turnErosionFaceDown(gameState: GameState, playerUid: string, count: number, sourceCard?: Card, querySelections?: string[]) {
    const player = gameState.players[playerUid];

    // 1. Identify Target Cards
    let targets: Card[] = [];
    if (querySelections && querySelections.length > 0) {
      targets = this.findTargets(gameState, { querySelection: true }, sourceCard, querySelections);
    } else {
      const faceUpCards = player.erosionFront.filter(c => c !== null && c.displayState === 'FRONT_UPRIGHT') as Card[];
      targets = faceUpCards.slice(0, count);
    }

    // 2. Flip and Move Each Card
    targets.forEach(targetCard => {
      if (!targetCard) return;

      // a. Remove from current spot in Front
      const frontIdx = player.erosionFront.findIndex(c => c?.gamecardId === targetCard.gamecardId);
      if (frontIdx !== -1) player.erosionFront[frontIdx] = null;

      // b. Update Card State
      targetCard.displayState = 'BACK_UPRIGHT';
      targetCard.cardlocation = 'EROSION_BACK';
      targetCard.isExhausted = false;

      // c. Shift existing back cards (Move 0->1, 1->2... up to 9)
      for (let i = 9; i > 0; i--) {
        player.erosionBack[i] = player.erosionBack[i - 1];
      }
      // d. Place at slot 0
      player.erosionBack[0] = targetCard;

      gameState.logs.push(`[系统] ${player.displayName} 的卡片 [${targetCard.fullName}] 已由于效果移动到侵蚀区背面。`);
    });

    if (targets.length > 0) {
      gameState.logs.push(`${player.displayName} 将 ${targets.length} 张侵蚀区的卡翻面并转至背面区域。`);
      this.checkErosionBackDefeat(gameState);
    }
  }

  private static applySilence(gameState: GameState, effect: AtomicEffect, sourceCard?: Card, querySelections?: string[]) {
    const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
    targets.forEach(card => {
      if (effect.value !== undefined) {
        const val = !!effect.value;
        if (effect.turnDuration === 0 || effect.turnDuration === -1) {
          card.baseCanActivateEffect = val;
        } else if (effect.turnDuration === 1) {
          card.temporaryCanActivateEffect = val;
        }
        card.canActivateEffect = val;
        gameState.logs.push(`${card.fullName} 的效果在本回合内被屏蔽了。`);
      }
    });
  }

  private static applyUnitImmunity(gameState: GameState, effect: AtomicEffect, sourceCard?: Card, querySelections?: string[]) {
    const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
    targets.forEach(card => {
      if (effect.value !== undefined) {
        const val = !!effect.value;
        if (effect.turnDuration === 0 || effect.turnDuration === -1) {
          card.baseIsImmuneToUnitEffects = val;
        } else if (effect.turnDuration === 1) {
          card.temporaryImmuneToUnitEffects = val;
        }
        card.isImmuneToUnitEffects = val;
      }
    });
  }

  private static shouldSkipEffect(gameState: GameState, card: Card, sourceCard?: Card): boolean {
    if (card && card.nextEffectProtection) {
      card.nextEffectProtection = false;
      const ownerUid = this.findCardOwnerKey(gameState, card.gamecardId) || '';
      const identity = ownerUid ? getCardIdentity(gameState, ownerUid, card) : `[${card.fullName}]`;
      gameState.logs.push(`${identity} 的护盾生效，抵消了本次效果！`);
      return true;
    }

    if (card && sourceCard && (card as any).data?.immuneToOpponentEffectsIfOpponentGoddess) {
      const targetOwnerUid = this.findCardOwnerKey(gameState, card.gamecardId);
      const sourceOwnerUid = this.findCardOwnerKey(gameState, sourceCard.gamecardId);
      if (
        targetOwnerUid &&
        sourceOwnerUid &&
        targetOwnerUid !== sourceOwnerUid &&
        gameState.players[sourceOwnerUid]?.isGoddessMode
      ) {
        const identity = getCardIdentity(gameState, targetOwnerUid, card);
        gameState.logs.push(`${identity} 不受对手卡牌效果影响。`);
        return true;
      }
    }

    if (card && sourceCard && card.isImmuneToUnitEffects && sourceCard.type === 'UNIT' && card.gamecardId !== sourceCard.gamecardId) {
      const targetOwnerUid = this.findCardOwnerKey(gameState, card.gamecardId) || '';
      const identity = targetOwnerUid ? getCardIdentity(gameState, targetOwnerUid, card) : `[${card.fullName}]`;
      gameState.logs.push(`${identity} 不受其他单位效果影响。`);
      return true;
    }

    if (card && sourceCard && (card as any).data?.unaffectedByOpponentCardEffects) {
      const targetOwnerUid = this.findCardOwnerKey(gameState, card.gamecardId);
      const sourceOwnerUid = this.findCardOwnerKey(gameState, sourceCard.gamecardId);
      if (targetOwnerUid && sourceOwnerUid && targetOwnerUid !== sourceOwnerUid) {
        const identity = getCardIdentity(gameState, targetOwnerUid, card);
        gameState.logs.push(`${identity} 不受对手卡牌效果影响。`);
        return true;
      }
    }

    if (card && sourceCard && (card as any).data?.unaffectedByOtherCardEffects) {
      if (card.gamecardId !== sourceCard.gamecardId) {
        const targetOwnerUid = this.findCardOwnerKey(gameState, card.gamecardId) || '';
        const identity = targetOwnerUid ? getCardIdentity(gameState, targetOwnerUid, card) : `[${card.fullName}]`;
        gameState.logs.push(`${identity} 不受这张卡以外的卡牌效果影响。`);
        return true;
      }
    }

    if (card && sourceCard && (card as any).data?.unaffectedByOpponentColorEffects) {
      const targetOwnerUid = this.findCardOwnerKey(gameState, card.gamecardId);
      const sourceOwnerUid = this.findCardOwnerKey(gameState, sourceCard.gamecardId);
      if (
        targetOwnerUid &&
        sourceOwnerUid &&
        targetOwnerUid !== sourceOwnerUid &&
        sourceCard.color === (card as any).data.unaffectedByOpponentColorEffects
      ) {
        const identity = getCardIdentity(gameState, targetOwnerUid, card);
        gameState.logs.push(`${identity} 不受对手宣言颜色的卡牌效果影响。`);
        return true;
      }
    }

    if (card && sourceCard && (card as any).data?.unaffectedByOpponentAcLe !== undefined) {
      const maxAc = Number((card as any).data.unaffectedByOpponentAcLe);
      if (this.isOpponentAcAtMost(gameState, card, sourceCard, maxAc)) {
        const targetOwnerUid = this.findCardOwnerKey(gameState, card.gamecardId) || '';
        const identity = targetOwnerUid ? getCardIdentity(gameState, targetOwnerUid, card) : `[${card.fullName}]`;
        gameState.logs.push(`${identity} is unaffected by opponent ACCESS ${maxAc} or less card effects.`);
        return true;
      }
    }

    if (
      card &&
      sourceCard &&
      (card as any).data?.cannotBeEffectTargetByOpponent
    ) {
      const targetOwnerUid = this.findCardOwnerKey(gameState, card.gamecardId);
      const sourceOwnerUid = this.findCardOwnerKey(gameState, sourceCard.gamecardId);
      if (targetOwnerUid && sourceOwnerUid && targetOwnerUid !== sourceOwnerUid) {
        const identity = getCardIdentity(gameState, targetOwnerUid, card);
        gameState.logs.push(`${identity} cannot be chosen as a target by opponent card effects.`);
        return true;
      }
    }

    if (
      card &&
      sourceCard &&
      Array.isArray((card as any).data?.cannotBeEffectTargetColors) &&
      (card as any).data.cannotBeEffectTargetColors.includes(sourceCard.color)
    ) {
      const targetOwnerUid = this.findCardOwnerKey(gameState, card.gamecardId);
      const sourceOwnerUid = this.findCardOwnerKey(gameState, sourceCard.gamecardId);
      if (targetOwnerUid && sourceOwnerUid && targetOwnerUid !== sourceOwnerUid) {
        const identity = getCardIdentity(gameState, targetOwnerUid, card);
        gameState.logs.push(`${identity} 不能成为该颜色卡牌效果的对象。`);
        return true;
      }
    }
    return false;
  }

  private static applyKeyword(gameState: GameState, effect: AtomicEffect, sourceCard?: Card, querySelections?: string[]) {
    const targets = this.findTargets(gameState, effect.targetFilter, sourceCard, querySelections);
    const keyword = effect.params?.keyword;
    const duration = effect.turnDuration ?? 0;

    targets.forEach(card => {
      if (this.shouldSkipEffect(gameState, card, sourceCard)) return;
      if (!card.temporaryBuffSources) card.temporaryBuffSources = {};
      const sourceName = sourceCard ? sourceCard.fullName : '效果';

      if (keyword === 'RUSH') {
        if (duration === 1) {
          card.temporaryRush = true;
          card.temporaryBuffSources['rush'] = sourceName;
        }
        else card.baseIsrush = true;
        card.isrush = true;
      } else if (keyword === 'HEROIC') {
        if (duration === 1) {
          card.temporaryHeroic = true;
          card.temporaryBuffSources['heroic'] = sourceName;
        } else {
          card.baseHeroic = true;
        }
        card.isHeroic = true;
      } else if (keyword === 'FULL_ATTACK') {
        if (duration === 1) {
          card.temporaryCanAttackAny = true;
          card.temporaryBuffSources['full_attack'] = sourceName;
        }
      }
    });

    gameState.logs.push(`应用了关键字: ${keyword} (持续: ${duration === 1 ? '本回合' : '永久'})`);
  }
}
