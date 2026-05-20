import { Card } from '../types/game';

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 304000057
 * Card2 Row: 528
 * Card Row: 442
 * Source CardNo: SP03-B04
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖5~8〗【永】{若你的战场上有具有异彩的神蚀单位，这张卡获得下列能力}：
 * “【永】：令这张卡离场的卡的效果不处理。”
 * “【启】〖1回合1次〗{对抗对手使用非神蚀卡}[舍弃手牌中的2种颜色的卡各1张]：反击那张卡。”
 * “【启】〖1回合1次〗[舍弃1张手牌]：将你侵蚀区中的3张正面卡送入墓地。”
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '304000057',
  fullName: '「宝物箱」',
  specialName: '宝物箱',
  type: 'ITEM',
  color: 'BLUE',
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
