import { Card } from '../types/game';
import { wealthContinuous } from './BaseUtil';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020335
 * Card2 Row: 460
 * Card Row: 395
 * Source CardNo: BT06-B01
 * Package: BT06(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】财富1（只要这个单位在战场上，你获得1个财富指示物）。
 */
const card: Card = {
  id: '104020335',
  fullName: '商队后勤',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '九尾商会联盟',
  acValue: 1,
  power: 1000,
  basePower: 1000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [wealthContinuous('104020335_wealth_1', 1)],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
