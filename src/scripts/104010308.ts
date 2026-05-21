import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104010308
 * Card2 Row: 538
 * Card Row: 358
 * Source CardNo: BT07-B05
 * Package: BT07(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：玩家以抽卡以外的方式从卡组将卡加入手牌时，将那张卡舍弃。
 * 【3-6】【诱】：{这张卡从手牌送去墓地时，选择下列的1项效果执行 }［0：蓝］：
 * ◆抽1张卡。
 * ◆将这张卡以横置状态放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104010308',
  fullName: '「艾琳娜」',
  specialName: '艾琳娜',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '百濑之水城',
  acValue: 2,
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
  effects: [],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
