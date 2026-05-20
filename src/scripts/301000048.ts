import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 301000048
 * Card2 Row: 520
 * Card Row: 342
 * Source CardNo: SP03-W04
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖3~6〗【永】{若你的战场上有具有异彩的神蚀单位，这张卡获得下列能力}：
 * “【永】：令这张卡离场的卡的效果不处理。”
 * “【诱】{你的回合中，你的ACCESS+3的非神蚀单位被破坏时}：抽1张卡。”
 * “【启】{你的具有异彩的单位攻击宣言时}：那个单位本回合〖伤害+1〗。”
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '301000048',
  fullName: '「雪夜小屋」',
  specialName: '雪夜小屋',
  type: 'ITEM',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
