import { Card, CardEffect } from '../types/game';
import { addContinuousDamage, addInfluence, addTempPower, canPayAccessCost, ownUnits, paymentCost } from './BaseUtil';

const highPowerRush: CardEffect = {
  id: '102060192_high_power',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  continuousPriority: -100,
  description: '力量3500以上时，伤害+1并获得【速攻】。',
  condition: (_gameState, _playerState, instance) => (instance.power || 0) >= 3500,
  applyContinuous: (_gameState, instance) => {
    addContinuousDamage(instance, instance, 1);
    instance.isrush = true;
    addInfluence(instance, instance, '获得【速攻】');
  }
};

const cardEffects: CardEffect[] = [highPowerRush, {
  id: '102060192_enter_boost',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  triggerLocation: ['UNIT'],
  description: '入场时，可以支付2费，使你的所有单位本回合力量+1000。',
  condition: (gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    canPayAccessCost(gameState, playerState, 2, instance.color, instance),
  cost: paymentCost(2),
  execute: async (instance, gameState, playerState) => {
    ownUnits(playerState).forEach(unit => addTempPower(unit, instance, 1000));
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102060192
 * Card2 Row: 211
 * Card Row: 211
 * Source CardNo: BT03-R03
 * Package: BT03(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:〖力量3500〗以上的这个单位〖伤害+1〗并获得【速攻】。
 * 【诱】:[〖支付2费〗]这个单位进入战场时，你可以使你的所有单位本回合中〖力量+1000〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102060192',
  fullName: '迅雷的号令者',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '雷霆',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  baseIsrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
