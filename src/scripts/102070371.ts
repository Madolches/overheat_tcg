import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102070371
 * Card2 Row: 561
 * Card Row: 445
 * Source CardNo: BT07-R06
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{你的主要阶段中，若你的战场上有2个以上红色的单位}[舍弃一张手牌]：将手牌或墓地中的这张单位卡放置到战场上。
 * 【启】[将战场上的这个单位送入墓地]：将你卡组中的1张具有噬魂的单位卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102070371',
  fullName: '「贝缇丝之刃」',
  specialName: '贝缇丝之刃',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '忒碧拉之门',
  acValue: 4,
  power: 3000,
  basePower: 3000,
  damage: 2,
  baseDamage: 2,
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
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
