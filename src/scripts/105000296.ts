import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000296
 * Card2 Row: 523
 * Card Row: 345
 * Source CardNo: SP03-Y03
 * Package: SP03(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】异彩2。
 * 【诱】〖同名1回合1次〗{这个单位通过异彩能力进入战场时，选择你战场上的1个红色或黄色的非神蚀单位，或卡名含有《天魔》的单位}：将被选择的单位放逐。之后，将那个单位放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000296',
  fullName: '天魔小雪仙「优姬」',
  specialName: '优姬',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '无',
  acValue: 3,
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
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
