import { Card, CardEffect } from '../types/game';
import { createSelectCardQuery, moveCardsToBottom, ownerOf, story } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '201000140_exile_replacement',
  type: 'CONTINUOUS',
  triggerLocation: ['PLAY'],
  content: 'EXILE_WHEN_LEAVES_PLAY_TO_GRAVE',
  description: '这张卡将要被送入墓地时，放逐作为代替。'
}, {
  id: '201000140_exile_discount',
  type: 'CONTINUOUS',
  triggerLocation: ['HAND', 'PLAY'],
  content: 'SELF_HAND_COST',
  description: '若你的放逐区有《解放之光》，这张卡的ACCESS值变为0费。',
  applyContinuous: (gameState, instance) => {
    const owner = ownerOf(gameState, instance);
    if (!owner?.exile.some(card => card.id === instance.id || card.id === '201000040' || card.fullName === instance.fullName)) return;
    instance.acValue = 0;
  }
}, story('201000140_release', '同名1回合1次：选择墓地8张卡放置到卡组底。若你的放逐区有《解放之光》，这张卡0费。', async (instance, gameState, playerState) => {
  if (playerState.grave.length < 8) return;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    playerState.grave,
    '选择墓地的卡',
    '选择你的墓地中的8张卡，将其放置到卡组底。',
    8,
    8,
    { sourceCardId: instance.gamecardId, effectId: '201000140_release' },
    () => 'GRAVE'
  );
}, {
  limitCount: 1,
  limitNameType: true,
  condition: (_gameState, playerState) => playerState.grave.length >= 8,
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const cards = selections.map(id => playerState.grave.find(card => card.gamecardId === id)).filter((card): card is Card => !!card);
    moveCardsToBottom(gameState, playerState.uid, cards, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000140
 * Card2 Row: 241
 * Card Row: 597
 * Source CardNo: BT03-W16
 * Package: BT03(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖同名1回合1次〗选择你的墓地中的8张卡，将其放置到卡组底。
 * 若你的放逐区有《解放之光》，这张卡的ACCESS值变为〖0费，颜色需求1白〗。
 * 这张卡将要被送入墓地时，将这张卡放逐作为代替。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201000140',
  fullName: '解放之光',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '无',
  acValue: 5,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
