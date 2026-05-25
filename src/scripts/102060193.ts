import { Card, CardEffect } from '../types/game';
import { addContinuousDamage, addInfluence, addTempPower, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102060193_high_power',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '力量3500以上时，伤害+1并获得【速攻】。',
  condition: (_gameState, _playerState, instance) => (instance.power || 0) >= 3500,
  applyContinuous: (_gameState, instance) => {
    addContinuousDamage(instance, instance, 1);
    instance.isrush = true;
    addInfluence(instance, instance, '获得【速攻】');
  }
}, {
  id: '102060193_attack_power',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ATTACK_DECLARED',
  isMandatory: false,
  triggerLocation: ['UNIT'],
  isGlobal: true,
  description: '你的单位攻击时，本回合这个单位力量+1000。',
  condition: (_gameState, playerState, _instance, event) =>
    event?.playerUid === playerState.uid &&
    (event.data?.attackerIds || []).some((id: string) => ownUnits(playerState).some(unit => unit.gamecardId === id)),
  execute: async (instance) => {
    addTempPower(instance, instance, 1000);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102060193
 * Card2 Row: 212
 * Card Row: 212
 * Source CardNo: BT03-R04
 * Package: BT03(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:〖力量3500〗以上的这个单位〖伤害+1〗并获得【速攻】。
 * 【诱】:你的单位攻击时，本回合中，这个单位〖力量+1000〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102060193',
  fullName: '迅雷的飞兵',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '雷霆',
  acValue: 3,
  power: 1500,
  basePower: 1500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  baseIsrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
