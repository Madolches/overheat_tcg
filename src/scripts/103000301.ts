import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000301
 * Card2 Row: 531
 * Card Row: 351
 * Source CardNo: SP03-G03
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗{主要阶段中，选择你的侵蚀区中的1张卡名含有《九夜》的正面卡}[舍弃1张手牌]：将被选择的卡加入手牌。
 * 【启】〖1回合1次〗{你的主要阶段，选择你的战场上的1个非神蚀单位}[将你的墓地中的红、蓝色、绿色中的2种颜色的卡各1张放逐]：被选择的卡本回合中变为[2][3500]并获得【歼灭】。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000301',
  fullName: '霜梦九夜「冬织」',
  specialName: '冬织',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: true,
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
