import { Card, GameState, PlayerState, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { ensureDeckHasCardsForMove, paymentCost } from './BaseUtil';

const card: Card = {
  id: '104020064',
  fullName: '小巷里的情报贩子',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '九尾商会联盟',
  acValue: 1,
  power: 500,
  basePower: 500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    {
      id: 'alley_broker_trigger',
      type: 'TRIGGER',
      triggerEvent: 'CARD_ENTERED_ZONE',
      isMandatory: false,
      description: '【诱】：当这个单位进入单位区时，如果你单位区中包含2个或2个以上蓝色单位，支付0费：展示你卡组顶部的2张卡，由对手选择其中1张加入你的手牌，剩下的那张卡以正面表示置入你的侵蚀区。',
      cost: paymentCost(0, 'BLUE'),
      condition: (gameState, playerState, instance, event) => {
        // 1. Check if this card entered the UNIT zone
        const isSelfEntering = event?.type === 'CARD_ENTERED_ZONE' &&
          (event.sourceCardId === instance.gamecardId || event.sourceCard === instance) &&
          event.data?.zone === 'UNIT';
        if (!isSelfEntering) return false;

        // 2. Check for at least 2 blue units in unit area (including itself)
        const blueUnitCount = playerState.unitZone.filter(u =>
          u !== null && AtomicEffectExecutor.matchesColor(u, 'BLUE')
        ).length;

        return blueUnitCount >= 2;
      },
      execute: (card, gameState, playerState) => {
        // Find opponent
        const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid);
        if (!opponentUid) return;

        if (!ensureDeckHasCardsForMove(gameState, playerState.uid, 2, card)) return;

        // Take top 2 cards from deck
        const topCards = playerState.deck.slice(-2).reverse();

        // We technically "publicly display" them by putting them in query options for the opponent
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: opponentUid, // Opponent selects
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, opponentUid, topCards.map(c => ({ card: c, source: 'DECK' as any }))),
          title: '对手发动了效果',
          description: `请为 ${playerState.displayName} 选择一张加入其手牌，另一张将置入其侵蚀区。`,
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: {
            sourceCardId: card.gamecardId,
            effectIndex: 0,
            ownerUid: playerState.uid, // Store the activator's UID
            cardIds: topCards.map(c => c.gamecardId)
          }
        };

        gameState.logs.push(`[小巷里的情报贩子] 展示了卡组顶部的 ${topCards.length} 张卡，等待对手选择。`);
      },
      onQueryResolve: (card, gameState, playerState, selections, context) => {
        const ownerUid = context.ownerUid;
        const owner = gameState.players[ownerUid];
        const selectedCardId = selections[0];
        const allCardIds = context.cardIds as string[];

        // 1. Handle selected card (to Hand)
        if (selections.length > 0) {
          AtomicEffectExecutor.moveCard(gameState, ownerUid, 'DECK', ownerUid, 'HAND', selectedCardId, true, {
            effectSourcePlayerUid: ownerUid,
            effectSourceCardId: card.gamecardId
          });
          const selectedCard = AtomicEffectExecutor.findCardById(gameState, selectedCardId);
          gameState.logs.push(`[小巷里的情报贩子] 对手选择了 ${selectedCard?.fullName} 加入 ${owner.displayName} 的手牌。`);
        }

        // 2. Handle other card (to Erosion Front)
        const otherCardId = allCardIds.find(id => id !== selectedCardId);
        if (otherCardId) {
          AtomicEffectExecutor.moveCard(gameState, ownerUid, 'DECK', ownerUid, 'EROSION_FRONT', otherCardId, true, {
            effectSourcePlayerUid: ownerUid,
            effectSourceCardId: card.gamecardId
          });
          const otherCard = AtomicEffectExecutor.findCardById(gameState, otherCardId);
          gameState.logs.push(`[小巷里的情报贩子] 另一张卡 ${otherCard?.fullName} 被置入 ${owner.displayName} 的侵蚀区。`);
        }
      }
    }
  ],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
