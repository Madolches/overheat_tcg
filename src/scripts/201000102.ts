import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { backErosionCount, createSelectCardQuery, moveCard, nameContains, story } from './BaseUtil';

const isPrayerSearchTarget = (card: Card) =>
  card.type === 'UNIT' &&
  (nameContains(card, '柯莉尔') || nameContains(card, '迪凯') || nameContains(card, '赛利亚'));

const cardEffects: CardEffect[] = [story('201000102_prayer_search', '创痕1：你的主要阶段，将卡组中的1张「柯莉尔」或「迪凯」或「赛利亚」单位卡加入手牌。', async (instance, gameState, playerState) => {
  const candidates = playerState.deck.filter(isPrayerSearchTarget);
  if (candidates.length === 0) return;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    candidates,
    '选择加入手牌的单位',
    '选择卡组中的1张「柯莉尔」或「迪凯」或「赛利亚」单位卡加入手牌。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '201000102_prayer_search' },
    () => 'DECK'
  );
}, {
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    backErosionCount(playerState) >= 1 &&
    playerState.deck.some(isPrayerSearchTarget),
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || selected.cardlocation !== 'DECK' || !isPrayerSearchTarget(selected)) return;
    moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000102
 * Card2 Row: 480
 * Card Row: 413
 * Source CardNo: BT06-W10
 * Package: BT06(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕1】（你的侵蚀区中的背面卡有1张以上时才有效）{你的主要阶段}：将你的卡组中的1张「柯莉尔」或「迪凯」或「赛利亚」单位卡加入手牌。
 */
const card: Card = {
  id: '201000102',
  fullName: '祈祷',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
