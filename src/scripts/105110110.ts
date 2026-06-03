import { Card, CardEffect, GameEvent, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, getTopDeckCards, moveCard, paymentCost } from './BaseUtil';

const getViewedTopCards = (playerState: PlayerState) => getTopDeckCards(playerState, 3);

const reorderRemainingTopCards = (
  gameState: GameState,
  playerUid: string,
  orderedTopToBottomIds: string[],
  sourceCard: Card
) => {
  const player = gameState.players[playerUid];
  const cards = orderedTopToBottomIds
    .map(id => AtomicEffectExecutor.findCardById(gameState, id))
    .filter((card): card is Card => !!card && card.cardlocation === 'DECK');

  if (cards.length === 0) return;

  const orderedIds = new Set(cards.map(card => card.gamecardId));
  player.deck = player.deck.filter(card => !orderedIds.has(card.gamecardId));
  for (let i = cards.length - 1; i >= 0; i -= 1) {
    cards[i].cardlocation = 'DECK';
    player.deck.push(cards[i]);
  }
  gameState.logs.push(`[${sourceCard.fullName}] 将检视后剩余的 ${cards.length} 张卡按选择顺序放回卡组顶。`);
};

const effect_105110110_enter: CardEffect = {
  id: '105110110_enter',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  cost: paymentCost(0, 'YELLOW'),
  description: '【诱】:[〖0:黄黄〗]这个单位进入战场时，检视你的卡组顶的3张卡，你可以从中选择1张道具卡公开，将其加入手牌，将其余的卡以任意顺序放置到卡组顶。',
  condition: (gameState, playerState, instance, event?: GameEvent) => {
    if (
      event?.type !== 'CARD_ENTERED_ZONE' ||
      event.sourceCardId !== instance.gamecardId ||
      event.data?.zone !== 'UNIT' ||
      instance.cardlocation !== 'UNIT'
    ) {
      return false;
    }

    const yellowUnits = playerState.unitZone.filter(
      (card): card is Card => !!card && AtomicEffectExecutor.matchesColor(card, 'YELLOW')
    ).length;
    if (yellowUnits < 2) return false;

    return getViewedTopCards(playerState).length > 0;
  },
  execute: async (instance, gameState, playerState) => {
    const topCards = getViewedTopCards(playerState);
    if (topCards.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        topCards.map(card => ({
          card,
          source: 'DECK' as const,
          disabled: card.type !== 'ITEM',
          disabledReason: card.type !== 'ITEM' ? '只有道具卡可以被选择' : undefined
        }))
      ),
      title: '查看卡组顶3张',
      description: '检视你的卡组顶的3张卡。你可以选择1张道具卡加入手牌，或提交而不选择。',
      minSelections: 0,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '105110110_enter',
        step: 'CHOOSE_ITEM',
        viewedIds: topCards.map(card => card.gamecardId)
      }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'CHOOSE_ITEM') {
      let remainingIds: string[] = [...(context.viewedIds || [])];

      if (selections.length > 0) {
        const chosenCard = AtomicEffectExecutor.findCardById(gameState, selections[0]);
        if (chosenCard && chosenCard.cardlocation === 'DECK' && chosenCard.type === 'ITEM') {
          moveCard(gameState, playerState.uid, chosenCard, 'HAND', instance);
          remainingIds = remainingIds.filter((id: string) => id !== chosenCard.gamecardId);
        }
      }

      const remainingCards = remainingIds
        .map((id: string) => AtomicEffectExecutor.findCardById(gameState, id))
        .filter((card): card is Card => !!card && card.cardlocation === 'DECK');

      if (remainingCards.length <= 1) return;

      createSelectCardQuery(
        gameState,
        playerState.uid,
        remainingCards,
        '排列剩余卡牌',
        '将剩余的卡以任意顺序放置到卡组顶。',
        remainingCards.length,
        remainingCards.length,
        {
          sourceCardId: instance.gamecardId,
          effectId: '105110110_enter',
          step: 'ORDER_REMAINING'
        },
        () => 'DECK'
      );
      return;
    }

    if (context?.step !== 'ORDER_REMAINING' || selections.length === 0) return;
    reorderRemainingTopCards(gameState, playerState.uid, selections, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110110
 * Card2 Row: 76
 * Card Row: 76
 * Source CardNo: BT01-Y04
 * Package: BT01(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:[〖0:黄黄〗]这个单位进入战场时，检视你的卡组顶的3张卡，你可以从中选择1张道具卡公开，将其加入手牌，将其余的卡以任意顺序放置到卡组顶。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110110',
  fullName: '占卜术学徒',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '学院要塞',
  acValue: 1,
  power: 1000,
  basePower: 1000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105110110_enter],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
