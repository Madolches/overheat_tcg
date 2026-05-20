import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000295
 * Card2 Row: 522
 * Card Row: 344
 * Source CardNo: SP03-Y02
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗{对手的单位攻击宣言时}[将你的墓地中的白色、黄色、绿色中的2种颜色的卡各1张放逐]：你可以将这次战斗中的攻击对象变为你的场上的一个非神蚀单位。
 * 【启】〖1回合1次〗{你的主要阶段}[舍弃1张手牌]：将你卡组中的1张卡名含有《清霜》的非神蚀单位卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000295',
  fullName: '天舞清霜「绵雪」',
  specialName: '绵雪',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
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
