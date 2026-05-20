import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104000368
 * Card2 Row: 527
 * Card Row: 441
 * Source CardNo: SP03-B03
 * Package: SP03(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】：异彩3
 * 【启】〖1回合1次〗[舍弃1张红色、绿色或卡名含有《九夜》的手牌]选择下列的1项效果并执行：
 * ◆{你的主要阶段，选择1名对手}：给予他2点伤害，将其墓地最多2张卡放逐。
 * ◆{对抗对手使用有颜色限制的非神蚀卡时}：反击那张卡。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104000368',
  fullName: '霜梦九夜「可可拉」',
  specialName: '可可拉',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 3 },
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
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
