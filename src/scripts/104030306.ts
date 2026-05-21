import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104030306
 * Card2 Row: 536
 * Card Row: 356
 * Source CardNo: BT07-B03
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】{你的战场上有「艾咪」单位}：你的战场上的<冒险家公会>的单位每个回合中第一次将要被破坏时，防止那次破坏。
 * 【4-7】【启】：{你的主要阶段，你的战场上<冒险家工会>的单位有2个以上}［舍弃1张手牌］：将侵蚀区中正面的这张卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104030306',
  fullName: '沉默巨盾「汉莫」',
  specialName: '汉莫',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
  faction: '冒险家公会',
  acValue: 4,
  power: 2500,
  basePower: 2500,
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
