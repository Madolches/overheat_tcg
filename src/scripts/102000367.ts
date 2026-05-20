import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000367
 * Card2 Row: 516
 * Card Row: 440
 * Source CardNo: SP03-R07
 * Package: SP03(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】异彩5。
 * 【永】{这个单位通过异彩能力进入战场时}：这个单位获得【速攻】【英勇】【歼灭】，不会由于对手ACCESS值+4以下的卡的效果从战场上离开。你的墓地中每有1中颜色的卡，这个单位〖+1〗〖+1000〗。
 * 【启】[舍弃3张手牌]：将这个单位【重置】。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000367',
  fullName: '霜梦虹彩「赛利亚」',
  specialName: '赛利亚',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1, WHITE: 1, YELLOW: 1, BLUE: 1, GREEN: 1 },
  faction: '无',
  acValue: 9,
  power: 0,
  basePower: 0,
  damage: 0,
  baseDamage: 0,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: true,
  isAnnihilation: true,
  isHeroic: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [],
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
