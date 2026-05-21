import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, addInfluence, allCardsOnField, createSelectCardQuery, ensureData, moveCard, ownUnits, ownerUidOf } from './BaseUtil';

const getFieldSlotIndex = (gameState: any, ownerUid: string, card: Card) => {
  const owner = gameState.players[ownerUid];
  const zone = card.cardlocation;
  const zoneCards = zone === 'ITEM' ? owner?.itemZone : zone === 'UNIT' ? owner?.unitZone : undefined;
  return Array.isArray(zoneCards) ? zoneCards.findIndex((slot: Card | null) => slot?.gamecardId === card.gamecardId) : -1;
};

const cardEffects: CardEffect[] = [{
    id: '101140100_blink',
    type: 'TRIGGER',
    triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
    triggerLocation: ['UNIT'],
    description: '入场时，若你的<女神教会>单位有3个以上，放逐战场上1张其他卡，下一次你的回合结束时返回。',
    condition: (_gameState, playerState, instance, event) => event?.sourceCardId === instance.gamecardId && event.data?.zone === 'UNIT' && ownUnits(playerState).filter(unit => unit.faction === '女神教会').length >= 3,
    execute: async (instance, gameState, playerState) => {
      const candidates = allCardsOnField(gameState).filter(card => card.gamecardId !== instance.gamecardId);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择放逐对象',
        '选择战场上的1张这个单位以外的卡，将其放逐。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '101140100_blink' },
        card => card.cardlocation || 'UNIT'
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      const target = allCardsOnField(gameState).find(card => card.gamecardId === selections[0]);
      if (!target) return;
      const ownerUid = ownerUidOf(gameState, target);
      const zone = target.cardlocation as TriggerLocation;
      const slotIndex = ownerUid ? getFieldSlotIndex(gameState, ownerUid, target) : -1;
      const id = target.gamecardId;
      moveCard(gameState, ownerUid, target, 'EXILE', instance, { faceDown: false });
      const exiled = AtomicEffectExecutor.findCardById(gameState, id);
      if (exiled) {
        ensureData(exiled).returnAtOwnEndSourceName = instance.fullName;
        addInfluence(exiled, instance, '在下一个回合结束时回归战场');
      }
      const currentTurnPlayerUid = gameState.playerIds[gameState.currentTurnPlayer];
      const returnTurn = gameState.turnCount + (currentTurnPlayerUid === playerState.uid ? 2 : 1);
      const returns = (playerState as any).blinkReturns || [];
      returns.push({
        cardId: id,
        ownerUid,
        zone,
        slotIndex,
        sourceCardId: instance.gamecardId,
        afterTurn: returnTurn,
        sourceName: instance.fullName
      });
      (playerState as any).blinkReturns = returns;
    }
  }, {
    id: '101140100_return_at_own_end',
    type: 'TRIGGER',
    triggerEvent: 'TURN_END' as any,
    triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK'],
    isMandatory: true,
    description: '下一次你的回合结束时，将此效果放逐的卡放回其持有者的战场。',
    condition: (gameState, playerState, instance, event) =>
      event?.playerUid === playerState.uid &&
      ((playerState as any).blinkReturns || []).some((entry: any) =>
        entry.sourceCardId === instance.gamecardId &&
        gameState.turnCount >= entry.afterTurn
      ),
    execute: async (instance, gameState, playerState) => {
      const returns = ((playerState as any).blinkReturns || []) as any[];
      const remaining: any[] = [];
      returns.forEach(entry => {
        if (entry.sourceCardId !== instance.gamecardId || gameState.turnCount < entry.afterTurn) {
          remaining.push(entry);
          return;
        }

        const exiled = AtomicEffectExecutor.findCardById(gameState, entry.cardId);
        if (exiled && entry.ownerUid && exiled.cardlocation === 'EXILE') {
          const data = ensureData(exiled);
          delete data.returnAtOwnEndSourceName;
          moveCard(gameState, entry.ownerUid, exiled, entry.zone || 'UNIT', instance, { targetIndex: entry.slotIndex });
          gameState.logs.push(`[${entry.sourceName || instance.fullName}] ${exiled.fullName} 在回合结束时回归战场。`);
        }
      });
      (playerState as any).blinkReturns = remaining;
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140100
 * Card2 Row: 60
 * Card Row: 60
 * Source CardNo: BT01-W05
 * Package: ST01(TD),BT01(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位进入战场时，若你的战场上的<女神教会>单位有3个以上，选择战场上的1张这个单位以外的卡，将其放逐。下一次你的回合结束时，将那张卡放置到其持有者的战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101140100',
  fullName: '教会调查团',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '女神教会',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
