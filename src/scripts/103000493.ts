import { Card, CardEffect } from '../types/game';
import { addTempPower, battlingUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103000493_big_opponent_boost',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'PHASE_CHANGED',
  description: '与ACCESS值4以上的单位进行战斗时，这个单位力量+2000。',
  condition: (gameState, _playerState, instance, event) => {
    if (event?.data?.phase !== 'DAMAGE_CALCULATION') return false;
    const units = battlingUnits(gameState);
    return units.some(unit => unit.gamecardId === instance.gamecardId) &&
      units.some(unit => unit.gamecardId !== instance.gamecardId && (unit.acValue || 0) >= 4);
  },
  execute: async (instance) => {
    addTempPower(instance, instance, 2000);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000493
 * Card2 Row: 283
 * Card Row: 639
 * Source CardNo: PR03-02G
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位与ACEESS值+4以上的单位进行战斗时，这个单位〖力量+2000〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000493',
  fullName: '坚韧的长毛象',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 3,
  power: 2000,
  basePower: 2000,
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
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
