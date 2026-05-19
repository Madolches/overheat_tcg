import { Card, CardEffect } from '../types/game';
import { addTempDamage, addTempPower, discardHandCost } from './BaseUtil';

const effect_102000278_support: CardEffect = {
  id: '102000278_support',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '【启】1回合1次，舍弃1张手牌：本回合中，这个单位伤害+1、力量+500并也具备白色和黄色。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.hand.some(card => card.gamecardId !== instance.gamecardId),
  cost: discardHandCost(1),
  execute: async (instance, gameState) => {
    addTempDamage(instance, instance, 1);
    addTempPower(instance, instance, 500);
    (instance as any).temporaryExtraColors = Array.from(new Set([
      ...((instance as any).temporaryExtraColors || []),
      'WHITE',
      'YELLOW'
    ]));
    gameState.logs.push(`[${instance.fullName}] 本回合伤害+1、力量+500，并也具备白色和黄色。`);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000278
 * Card2 Row: 437
 * Card Row: 320
 * Source CardNo: SP02-R03
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗[舍弃1张手牌]:本回合中，这个单位+1+500并也具备白色和黄色。
 */
const card: Card = {
  id: '102000278',
  fullName: '天魔粉丝团',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
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
  effects: [effect_102000278_support],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
