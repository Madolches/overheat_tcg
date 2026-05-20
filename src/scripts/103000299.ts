import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000299
 * Card2 Row: 529
 * Card Row: 349
 * Source CardNo: SP03-G01
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位宣言攻击时}：你可以将你的战场上的《清霜饼雪》以外的1个卡名含有《清霜》的单位破坏。之后，你的战场上所有的ACCESS值+3的单位本回合中〖力量+1000〗。
 * 【诱】〖同名1回合1次〗{这张卡由于战斗或你的卡的效果从战场离开时}：你可以使你的战场上所有的ACCESS值+3的单位本回合中〖伤害+1〗〖力量+1000〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000299',
  fullName: '清霜饼雪',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
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
  effects: [],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
