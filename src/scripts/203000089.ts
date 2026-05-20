import { Card, CardEffect } from '../types/game';
import { createSelectCardQuery, moveCard, moveCardsToBottom, nameContains, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '203000089_wind_grace',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  erosionBackLimit: [1, 10],
  limitCount: 1,
  limitNameType: true,
  description: '创痕3：主要阶段，将墓地X张卡放到卡组底，X为你的共鸣或菲晶单位数量且最多4。之后放逐这张卡。',
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    playerState.grave.length > 0 &&
    ownUnits(playerState).some(unit => unit.feijingMark || nameContains(unit, '共鸣')),
  execute: async (instance, gameState, playerState) => {
    const count = Math.min(4, ownUnits(playerState).filter(unit => unit.feijingMark || nameContains(unit, '共鸣')).length, playerState.grave.length);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.grave,
      '选择放回卡组底的卡',
      `选择墓地中的${count}张卡，放置到卡组底。`,
      count,
      count,
      { sourceCardId: instance.gamecardId, effectId: '203000089_wind_grace' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const cards = selections
      .map(id => playerState.grave.find(card => card.gamecardId === id))
      .filter((card): card is Card => !!card);
    moveCardsToBottom(gameState, playerState.uid, cards, instance);
    if (instance.cardlocation === 'PLAY' || instance.cardlocation === 'GRAVE') {
      moveCard(gameState, playerState.uid, instance, 'EXILE', instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203000089
 * Card2 Row: 508
 * Card Row: 331
 * Source CardNo: PR06-05G
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕3】（你的侵蚀区中的背面卡有1张以上时才有效）〖同名1回合1次〗{你的主要阶段}：将你墓地中的X张卡放置到你的卡组底。X位你站场上的具有共鸣或菲晶的单位的数量，且最多为4。将这张卡放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '203000089',
  fullName: '风之恩惠',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: true,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
