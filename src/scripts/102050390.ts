import { Card, CardEffect } from '../types/game';
import { executePromotionAfterOptionalDiscard, hasPromotionTarget } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102050390_end_promotion_after_attack',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END' as any,
  triggerLocation: ['UNIT'],
  isMandatory: false,
  description: '这个单位攻击过的回合结束时：晋升。',
  condition: (_gameState, playerState, instance, event) =>
    event?.type === ('TURN_END' as any) &&
    event.playerUid === playerState.uid &&
    instance.cardlocation === 'UNIT' &&
    !!instance.hasAttackedThisTurn &&
    hasPromotionTarget(playerState, instance),
  execute: async (instance, gameState, playerState) => {
    await executePromotionAfterOptionalDiscard(gameState, playerState, instance, '102050390_end_promotion_after_attack', {
      skipDiscard: true
    });
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    await executePromotionAfterOptionalDiscard(gameState, playerState, instance, '102050390_end_promotion_after_attack', {
      selections,
      context,
      skipDiscard: true
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050390
 * Card2 Row: 597
 * Card Row: 480
 * Source CardNo: BT08-R04
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位攻击过的回合结束时}:晋升（将这个单位送入墓地。之后，将你的卡组或手牌中的1张ACCESS值比这个单位的ACCESS值多1的单位卡放置到战场上）。
 */
const card: Card = {
  id: '102050390',
  fullName: '伊列宇十剑长',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '伊列宇王国',
  acValue: 3,
  power: 3000,
  basePower: 3000,
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
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
