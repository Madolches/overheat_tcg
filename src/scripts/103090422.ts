import { Card } from '../types/game';
import { resonanceEffect } from './BaseUtil';

const cardEffects = [resonanceEffect('103090422_resonance')];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090422
 * Card2 Row: 639
 * Card Row: 531
 * Source CardNo: BT08-G02
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】:共鸣（〖1回合1次〗{你的主要阶段，选择你的墓地中的1张卡}:将被选择的卡放逐）。
 */
const card: Card = {
  id: '103090422',
  fullName: '银乐歌者',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '瑟诺布',
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
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
