import { Card, CardEffect } from '../types/game';
import { addInfluence, addTempDamage, addTempPower } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102060196_high_power_keywords',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  continuousPriority: -100,
  description: '力量4500以上时，获得【速攻】【歼灭】【神依】。',
  condition: (_gameState, _playerState, instance) => (instance.power || 0) >= 4500,
  applyContinuous: (_gameState, instance) => {
    instance.isrush = true;
    instance.isAnnihilation = true;
    instance.isShenyi = true;
    addInfluence(instance, instance, '获得【速攻】');
    addInfluence(instance, instance, '获得【歼灭】');
    addInfluence(instance, instance, '获得【神依】');
  }
}, {
  id: '102060196_battle_destroy_boost',
  type: 'TRIGGER',
  triggerEvent: 'CARD_DESTROYED_BATTLE',
  triggerLocation: ['UNIT'],
  isGlobal: true,
  isMandatory: true,
  limitCount: 1,
  description: '1回合1次：你的单位被战斗破坏时，本回合这个单位伤害+1、力量+1500。',
  condition: (_gameState, playerState, _instance, event) => event?.playerUid === playerState.uid,
  execute: async (instance) => {
    addTempDamage(instance, instance, 1);
    addTempPower(instance, instance, 1500);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102060196
 * Card2 Row: 215
 * Card Row: 215
 * Source CardNo: BT03-R07
 * Package: BT03(SR,ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:〖力量4500〗以上的这个单位获得【速攻】【歼灭】【神依】。
 * 【诱】〖1回合1次〗:你的单位被战斗破坏时，本回合中，这个单位〖伤害+1〗〖力量+500〗。0
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102060196',
  fullName: '雷霆女帝「塔米」',
  specialName: '塔米',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '雷霆',
  acValue: 4,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  baseIsrush: false,
  isAnnihilation: false,
  baseAnnihilation: false,
  isShenyi: false,
  baseShenyi: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
