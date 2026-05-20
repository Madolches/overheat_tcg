import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000289
 * Card2 Row: 514
 * Card Row: 337
 * Source CardNo: SP03-R02
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{选择下列的一项效果并执行}：
 * ◆{你的主要阶段}[舍弃手牌中的这张卡和另1张卡]：将你卡组中的1张卡名含有《九夜》的卡加入手牌。
 * ◆{只能在这张卡由于卡的能力的费用从手牌送入墓地的回合中从墓地发动。选择墓地中1张《九夜霜江》以外的卡名含有《九夜》的卡}：将被选择的卡加入手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000289',
  fullName: '九夜霜江',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 3,
  power: 3500,
  basePower: 3500,
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
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
