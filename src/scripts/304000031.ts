import { Card, CardEffect, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const getFrontErosionCards = (playerState: PlayerState) =>
  playerState.erosionFront.filter((card): card is Card => !!card);

const effect: CardEffect = {
  id: 'shuixian_trigger',
  type: 'TRIGGER',
  triggerEvent: 'CARD_FIELD_TO_HAND',
  triggerLocation: ['ITEM'],
  isGlobal: true,
  isMandatory: false,
  limitCount: 1,
  limitGlobal: false,
  description: '一回合一次，[舍弃1张手牌]你的单位由于卡的效果返回手牌时，你可以选择你的侵蚀区中的1张正面卡，将其加入手牌。',
  condition: (gameState: GameState, playerState: PlayerState, _card: Card, event?: any) => {
    if (!event || event.type !== 'CARD_FIELD_TO_HAND' || event.playerUid !== playerState.uid) {
      return false;
    }

    if (!event.data?.isEffect || event.data?.zone !== 'UNIT') {
      return false;
    }

    const movedCard = event.sourceCard || AtomicEffectExecutor.findCardById(gameState, event.sourceCardId);
    if (!movedCard || movedCard.type !== 'UNIT') {
      return false;
    }

    return playerState.hand.length >= 1 && getFrontErosionCards(playerState).length > 0;
  },
  targetSpec: {
    title: '选择加入手牌的卡',
    description: '选择你的侵蚀区中的1张正面卡。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['EROSION_FRONT'],
    controller: 'SELF',
    step: 'EROSION_TARGET',
    getCandidates: (_gameState, playerState) =>
      getFrontErosionCards(playerState).map(card => ({ card, source: 'EROSION_FRONT' as any }))
  },
  cost: async (gameState: GameState, playerState: PlayerState, card: Card) => {
    if (playerState.hand.length === 0) return false;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: playerState.hand.map(c => ({ card: c, source: 'HAND' as any })),
      title: '选择舍弃的手牌',
      description: '请选择1张手牌作为【水仙心法】的发动费用舍弃。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'ACTIVATE_COST_RESOLVE',
      context: {
        sourceCardId: card.gamecardId,
        effectIndex: 0,
        step: 'DISCARD_COST',
        costType: 'DISCARD_HAND_COST',
        discardCostAmount: 1,
        skipEffectResolveAfterCost: true
      }
    };
    return true;
  },
  onCostResolve: async (_card, _gameState, _playerState, _selections, context) => {
    if (context?.step !== 'DISCARD_COST') return;
  },
  execute: async (card: Card, gameState: GameState, playerState: PlayerState) => {
    const erosionOptions = getFrontErosionCards(playerState);
    if (erosionOptions.length === 0) {
      gameState.logs.push(`[水仙心法] 侵蚀区没有可选卡。`);
      return;
    }

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: erosionOptions.map(c => ({ card: c, source: 'EROSION_FRONT' as any })),
      title: '选择加入手牌的卡',
      description: '从你的侵蚀区正面选择1张卡加入手牌。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: { sourceCardId: card.gamecardId, effectIndex: 0, step: 2 }
    };
  },
  onQueryResolve: async (card, gameState, playerState, selections, context) => {
    if (context?.step === 'EROSION_TARGET') {
      const targetId = selections[0];
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_EROSION',
        destinationZone: 'HAND',
        targetFilter: { gamecardId: targetId }
      }, card);
      gameState.logs.push(`[水仙心法] ${playerState.displayName} 将侵蚀区的卡牌加入手牌。`);
      return;
    }

    const step = context?.step || 1;

    if (step === 1) {
      const discardId = selections[0];
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'DISCARD_CARD',
        targetFilter: { gamecardId: discardId }
      }, card);
      gameState.logs.push(`${playerState.displayName} 丢弃了卡牌。`);

      const erosionOptions = getFrontErosionCards(playerState);
      if (erosionOptions.length > 0) {
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: erosionOptions.map(c => ({ card: c, source: 'EROSION_FRONT' as any })),
          title: '选择加入手牌的卡',
          description: '从你的侵蚀区正面选择1张卡加入手牌。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: { sourceCardId: card.gamecardId, effectIndex: 0, step: 2 }
        };
      } else {
        gameState.logs.push(`[水仙心法] 侵蚀区没有可选卡。`);
      }
    } else if (step === 2) {
      const targetId = selections[0];
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_EROSION',
        destinationZone: 'HAND',
        targetFilter: { gamecardId: targetId }
      }, card);
      gameState.logs.push(`[水仙心法] ${playerState.displayName} 将侵蚀区的卡牌加入手牌。`);
    }
  }
};

const card: Card = {
  id: '304000031',
  fullName: '水仙心法',
  specialName: '',
  type: 'ITEM',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
