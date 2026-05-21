import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020410
 * Card2 Row: 627
 * Card Row: 511
 * Source CardNo: BT08-B01
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{你的财富指示物有3个以上，你的主要阶段，选择对手战场上1个ACCESS值+3以下的非神蚀单位}[舍弃3张手牌]：将被选择的卡加入你的手牌。
 * 〖3~6〗【永】:财富1(只要这个单位在战场上，你获得1个财富指示物)。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104020410',
  fullName: '「狐族分会长」',
  specialName: '狐族分会长',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '九尾商会联盟',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
