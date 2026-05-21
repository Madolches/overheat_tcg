import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000294
 * Card2 Row: 521
 * Card Row: 343
 * Source CardNo: SP03-Y01
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位攻击宣言时}：你可以将你战场上的《清霜拉雪》以为的1个卡名含有《清霜》的单位破坏。之后，你的战场上所有ACCESS值+3以上的单位本回合中〖+1000〗。
 * 【诱】〖同名一回合一次〗{这个单位由于战斗或你的卡的效果从战场上离开时}：你可以将你卡组中的1张ACCESS值+3的卡名含有《清霜》的单位卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000294',
  fullName: '清霜粒雪',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
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
