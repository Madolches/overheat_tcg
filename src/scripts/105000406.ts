import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000406
 * Card2 Row: 620
 * Card Row: 504
 * Source CardNo: BT08-Y05
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【速攻】
 * 【永】:这张卡只能通过《高位炼金》的效果将包含红色卡的3张卡送入墓地而进入战场。
 * 〖3~6〗【永】:对手不能用非神蚀单位来防御你的战场上的卡名含有《炼金幻兽》的单位的攻击。（其他联军可以被防御时无效）
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000406',
  fullName: '炼金幻兽「寇德」',
  specialName: '寇德',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2, RED: 2 },
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
