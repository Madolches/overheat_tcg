import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000407
 * Card2 Row: 621
 * Card Row: 505
 * Source CardNo: BT08-Y06
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【英勇】
 * 【永】:这张卡只能通过《高位炼金》的效果将包含白色卡的3张卡送入墓地而进入战场。
 * 〖3~6〗【永】:你的战场上的卡名含有《炼金幻兽》的单位不会被战斗破坏，不会成为ACCESS值+4以下的卡的效果的对象。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000407',
  fullName: '炼金幻兽「巴哈姆特」',
  specialName: '巴哈姆特',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2, WHITE: 2 },
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: true,
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
