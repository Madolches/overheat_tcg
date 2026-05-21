import { Card, CardEffect, GameEvent } from '../types/game';
import { addInfluence, allCardsOnField, createSelectCardQuery, ensureData, moveCard, ownerUidOf } from './BaseUtil';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const cardEffects: CardEffect[] = [{
  id: '101140151_enter_exile',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  description: '进入战场时，放逐战场上1张其他卡。发动者的对方回合结束时，那张卡横置回场。',
  condition: (gameState, _playerState, instance, event?: GameEvent) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    allCardsOnField(gameState).some(card => card.gamecardId !== instance.gamecardId && card.id !== instance.id),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, allCardsOnField(gameState).filter(card => card.gamecardId !== instance.gamecardId && card.id !== instance.id), '选择放逐目标', '选择战场上的1张《教会的押送人》以外的卡。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '101140151_enter_exile' }, card => card.cardlocation as any);
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target) return;
    const ownerUid = ownerUidOf(gameState, target);
    if (!ownerUid) return;
    const originalZone = target.cardlocation;
    const currentTurnPlayerUid = gameState.playerIds[gameState.currentTurnPlayer];
    const returnTurn = gameState.turnCount + (currentTurnPlayerUid === playerState.uid ? 1 : 0);
    moveCard(gameState, ownerUid, target, 'EXILE', instance, { faceDown: false });
    ensureData(target).escortReturn = {
      ownerUid,
      zone: originalZone,
      returnOnOpponentEndTurn: returnTurn,
      sourceName: instance.fullName,
      sourceCardId: instance.gamecardId
    };
    addInfluence(target, instance, '发动者的对方回合结束时横置回场');
    const returns = ((playerState as any).escortReturns || []) as any[];
    returns.push({
      cardId: target.gamecardId,
      ownerUid,
      zone: originalZone,
      sourceCardId: instance.gamecardId,
      returnTurn
    });
    (playerState as any).escortReturns = returns;
  }
}, {
  id: '101140151_return_at_opponent_end',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END' as any,
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK'],
  isMandatory: true,
  description: '发动者的对方回合结束时，将押送放逐的卡横置放回其持有者战场。',
  condition: (gameState, playerState, instance, event) =>
    event?.playerUid !== playerState.uid &&
    ((playerState as any).escortReturns || []).some((entry: any) =>
      entry.sourceCardId === instance.gamecardId &&
      gameState.turnCount >= (entry.returnTurn ?? Number.POSITIVE_INFINITY)
    ),
  execute: async (instance, gameState, playerState) => {
    const returns = ((playerState as any).escortReturns || []) as any[];
    if (returns.length === 0) return;
    const remaining: any[] = [];
    for (const entry of returns) {
      const returnTurn = entry.returnTurn ?? Number.POSITIVE_INFINITY;
      if (entry.sourceCardId !== instance.gamecardId || gameState.turnCount < returnTurn) {
        remaining.push(entry);
        continue;
      }
      const card = AtomicEffectExecutor.findCardById(gameState, entry.cardId);
      if (!card || card.cardlocation !== 'EXILE') continue;
      delete ensureData(card).escortReturn;
      moveCard(gameState, entry.ownerUid, card, entry.zone, instance);
      card.isExhausted = true;
      card.displayState = 'FRONT_UPRIGHT';
    }
    (playerState as any).escortReturns = remaining;
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140151
 * Card2 Row: 141
 * Card Row: 141
 * Source CardNo: BT02-W01
 * Package: BT02(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗:这个单位进入战场时，选择战场上的1张《教会的押送人》以外的卡，将其放逐。对手的回合结束时，将那张卡以横置状态放置到其持有者的战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101140151',
  fullName: '教会的押送人',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '女神教会',
  acValue: 3,
  power: 1500,
  basePower: 1500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
