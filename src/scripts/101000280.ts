import { Card, CardEffect } from '../types/game';
import { addTempDamage, addTempPower, discardHandCost } from './BaseUtil';

const effect_101000280_support: CardEffect = {
  id: '101000280_support',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '【启】〖1回合1次〗[舍弃1张手牌]：本回合中，这个单位〖伤害+1〗〖力量+500〗并也具备蓝色和绿色。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.hand.some(card => card.gamecardId !== instance.gamecardId),
  cost: discardHandCost(1),
  execute: async (instance, gameState) => {
    addTempDamage(instance, instance, 1);
    addTempPower(instance, instance, 500);
    (instance as any).temporaryExtraColors = Array.from(new Set([
      ...((instance as any).temporaryExtraColors || []),
      'BLUE',
      'GREEN'
    ]));
    gameState.logs.push(`[${instance.fullName}] 本回合伤害+1、力量+500，并也具备蓝色和绿色。`);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000280
 * Card2 Row: 439
 * Card Row: 322
 * Source CardNo: SP02-W01
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗[舍弃1张手牌]：本回合中，这个单位〖伤害+1〗〖力量+500〗并也具备蓝色和绿色。
 */
const card: Card = {
  id: '101000280',
  fullName: '兽神之后援',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
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
  effects: [effect_101000280_support],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
