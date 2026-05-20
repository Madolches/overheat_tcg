import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000291
 * Card2 Row: 517
 * Card Row: 339
 * Source CardNo: SP03-W01
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位宣言攻击时}：你可以将你的战场上的《清霜饼雪》以外的1个卡名含有《清霜》的单位破坏。之后，你的战场上所有的ACCESS值+3的单位本回合中〖力量+1000〗。
 * 【诱】〖同名1回合1次〗{这张卡由于战斗或你的卡的效果从战场离开时，选择战场上1个ACCESS值+3以下的非神蚀单位}：将被选择的单位破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101000291',
  fullName: '清霜粉雪',
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
  effects: [],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
