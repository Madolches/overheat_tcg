import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104030307
 * Card2 Row: 537
 * Card Row: 357
 * Source CardNo: BT07-B04
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】{你的战场上有「汉莫」单位}：这个单位〖伤害+2〗，这个单位不会被战斗破坏。
 * 【4-7】【启】：{你的主要阶段，你的战场上<冒险家工会>的单位有2个以上}［舍弃1张手牌］：将侵蚀区中正面的这张卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104030307',
  fullName: '旋风狂斧「艾咪」',
  specialName: '艾咪',
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
