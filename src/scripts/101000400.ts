import { Card, CardEffect } from '../types/game';
import { addContinuousKeyword } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101000400_heroic',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '【英勇】',
  applyContinuous: (_gameState, instance) => {
    addContinuousKeyword(instance, instance, 'heroic');
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000400
 * Card2 Row: 610
 * Card Row: 494
 * Source CardNo: BT08-W06
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【英勇】
 */
const card: Card = {
  id: '101000400',
  fullName: '女神的雕塑家',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
