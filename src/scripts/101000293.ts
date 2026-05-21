import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000293
 * Card2 Row: 519
 * Card Row: 341
 * Source CardNo: SP03-W03
 * Package: SP03(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】异彩3。
 * 【启】〖1回合1次〗{选择你战场上的1个黄色、绿色或卡名含有《清霜》的非神蚀单位，选择下列的1项效果并执行}：
 * ◆{你的主要阶段，选择对手场上的1张ACCESS值+3以下的非神蚀卡}[+1]：将被选择的你和对手的卡破坏。
 * ◆本回合中，被选择的你的单位被破坏时，将你的卡组中的1张卡名含有《清霜》的单位卡以横置状态放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101000293',
  fullName: '天舞清霜「牡丹雪」',
  specialName: '牡丹雪',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 3 },
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
