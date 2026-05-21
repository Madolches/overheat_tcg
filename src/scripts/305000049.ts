import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 305000049
 * Card2 Row: 524
 * Card Row: 346
 * Source CardNo: SP03-Y04
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖1~4〗【永】{若你的战场上有具有异彩的神蚀单位，这张卡获得下列能力}：
 * “【永】：令这张卡离场的卡的效果不处理。”
 * “【永】：你的战场上的非神蚀单位〖力量+500〗。”
 * “【启】〖1回合1次〗{你的主要阶段}[将你战场上的一个非神蚀单位送入墓地]：抽1张卡。”
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '305000049',
  fullName: '「黄昏海滩」',
  specialName: '黄昏海滩',
  type: 'ITEM',
  color: 'YELLOW',
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
