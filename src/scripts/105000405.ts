import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, getTopDeckCards, moveCard, moveCardsToTop } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105000405_start_reorder_top_four',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'PHASE_CHANGED',
  isMandatory: true,
  description: '你的回合开始时，查看卡组顶4张，并以任意顺序放回卡组顶。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    event?.type === 'PHASE_CHANGED' &&
    event.data?.phase === 'START' &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    const topCards = getTopDeckCards(playerState, Math.min(4, playerState.deck.length));
    createSelectCardQuery(
      gameState,
      playerState.uid,
      topCards,
      '排列卡组顶',
      '按选择顺序将这些卡放回卡组顶。',
      topCards.length,
      topCards.length,
      { sourceCardId: instance.gamecardId, effectId: '105000405_start_reorder_top_four', step: 'REORDER' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'REORDER') return;
    const topCards = getTopDeckCards(playerState, Math.min(4, playerState.deck.length));
    const topIds = new Set(topCards.map(card => card.gamecardId));
    if (selections.length !== topCards.length || selections.some(id => !topIds.has(id))) return;
    const ordered = selections
      .map(id => topCards.find(card => card.gamecardId === id))
      .filter((card: Card | undefined): card is Card => !!card);
    moveCardsToTop(gameState, playerState.uid, ordered, instance);
  }
}, {
  id: '105000405_bottom_hand_draw',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：主要阶段，将1张手牌放置到卡组底，抽1张卡。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    playerState.hand.length > 0 &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.hand,
      '选择置底手牌',
      '选择1张手牌放置到卡组底，之后抽1张卡。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000405_bottom_hand_draw' },
      () => 'HAND'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? playerState.hand.find((card: Card) => card.gamecardId === selections[0]) : undefined;
    if (!target) return;
    moveCard(gameState, playerState.uid, target, 'DECK', instance, { insertAtBottom: true });
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000405
 * Card2 Row: 619
 * Card Row: 503
 * Source CardNo: BT08-Y04
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{你的回合开始时}:查看你卡组顶的4张卡，将其以任意顺序放置到卡组顶。
 * 【启】〖1回合1次〗{你的主要阶段}[将你的1张手牌放置到卡组底]:抽1张卡。
 */
const card: Card = {
  id: '105000405',
  fullName: '魔偶设计师',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
