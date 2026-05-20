import { Card, CardEffect } from '../types/game';
import { exileByEffect, getOpponentUid, story } from './BaseUtil';

const duplicatedOpponentCards = (gameState: any, playerState: any) => {
  const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
  const field = [...opponent.unitZone, ...opponent.itemZone].filter((card): card is Card => !!card);
  const counts = new Map<string, number>();
  field.forEach(card => counts.set(card.fullName, (counts.get(card.fullName) || 0) + 1));
  return field.filter(card => (counts.get(card.fullName) || 0) >= 2);
};

const cardEffects: CardEffect[] = [story('201000148_exile_duplicates', '若对手场上的卡名相同的卡有2张以上，将那些卡放逐。', async (instance, gameState, playerState) => {
  duplicatedOpponentCards(gameState, playerState).forEach(card => exileByEffect(gameState, card, instance));
}, {
  condition: (gameState, playerState) => duplicatedOpponentCards(gameState, playerState).length > 0
}), {
  id: '201000148_payment_substitute',
  type: 'CONTINUOUS',
  triggerLocation: ['HAND'],
  content: 'SELF_HAND_COST',
  description: '为ACCESS+3以下白色卡支付使用费用时，可以将手牌中的这张卡放逐作为代替。'
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000148
 * Card2 Row: 266
 * Card Row: 622
 * Source CardNo: SP01-W02
 * Package: SP01(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 若对手场上的卡名相同的卡有2张以上，将那些卡放逐。
 * 【你为ACCESS值+3以下的白色卡支付使用费用时，你可以将手牌中的这张卡放逐作为这次费用的代替。】
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201000148',
  fullName: '女神的眼泪',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP01',
  uniqueId: null as any,
};

export default card;
