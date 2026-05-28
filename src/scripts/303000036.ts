import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPayAccessCost, createSelectCardQuery, getOpponentUid, isFeijingCard, moveCard, paymentCost } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '303000036_opponent_end_recover',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'TURN_END' as any,
  isMandatory: false,
  limitCount: 1,
  description: '对手的回合结束时，可以支付1费，选择墓地中1张菲晶卡加入手牌。',
  condition: (gameState, playerState, _instance, event) =>
    event?.playerUid === getOpponentUid(gameState, playerState.uid) &&
    playerState.grave.some(isFeijingCard) &&
    canPayAccessCost(gameState, playerState, 1, 'GREEN'),
  cost: paymentCost(1, 'GREEN'),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.grave.filter(isFeijingCard),
      '选择菲晶卡',
      '选择你墓地中的1张具有【菲晶】的卡加入手牌。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '303000036_opponent_end_recover' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (selected?.cardlocation === 'GRAVE') moveCard(gameState, playerState.uid, selected, 'HAND', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 303000036
 * Card2 Row: 376
 * Card Row: 246
 * Source CardNo: BT05-G10
 * Package: BT05(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗{对手的回合结束时，你可以选择你的墓地中的1张具有【菲晶】的卡}[〖支付1费〗]：将被选择的卡加入手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '303000036',
  fullName: '「甘美泉水」',
  specialName: '甘美泉水',
  type: 'ITEM',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
