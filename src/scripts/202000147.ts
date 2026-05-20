import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202000147
 * Card2 Row: 265
 * Card Row: 621
 * Source CardNo: SP01-R02
 * Package: SP01(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 你在抽卡阶段抽到这张卡时，你可以将手牌中的这种卡展示直到这个回合结束时为止。若展示，本回合中，这张卡获得下列效果:
 * “〖一游戏一次〗:只能在你的主要阶段开始时使用。选择1名对手，给予他4点伤害，你的侵蚀区中每有一张背面卡，这个伤害再增加1点。”
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202000147',
  fullName: '火焰爆弹',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 3 },
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP01',
  uniqueId: null as any,
};

export default card;
