import { Card, GameState, PlayerState, CardEffect, TriggerLocation, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const effect_104000176_activate: CardEffect = {
  id: 'mina_salvage_activate',
  type: 'ACTIVATE',
  description: '【启】每回合一次。在你的回合中，舍弃一张手牌：选择一张你侵蚀区域的卡牌加入手牌。',
  limitCount: 1,
  limitNameType: true,
  condition: (gameState: GameState, playerState: PlayerState) => {
    return playerState.isTurn && playerState.hand.length > 0 && playerState.erosionFront.some(c => c !== null);
  },
  triggerLocation: ['UNIT'],
  targetSpec: {
    title: '选择加入手牌的卡牌',
    description: '选择一张侵蚀区正面的卡牌加入手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['EROSION_FRONT'],
    controller: 'SELF',
    step: 'SALVAGE',
    getCandidates: (_gameState, playerState) =>
      playerState.erosionFront
        .filter((card): card is Card => !!card)
        .map(card => ({ card, source: 'EROSION_FRONT' as TriggerLocation }))
  },
  cost: async (gameState, playerState, instance) => {
    if (playerState.hand.length === 0) return false;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, playerState.hand.map(c => ({ card: c, source: 'HAND' }))),
      title: '选择舍弃费用',
      description: '选择1张手牌舍弃作为费用。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        effectId: 'mina_salvage_activate',
        sourceCardId: instance.gamecardId,
        step: 'DISCARD_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      }
    };
    return true;
  },
  onCostResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step !== 'DISCARD_COST') return;
    const discardId = selections[0];
    const discard = playerState.hand.find(card => card.gamecardId === discardId);
    if (!discard) {
      context.cancelActivation = true;
      return;
    }
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'DISCARD_CARD',
      targetFilter: { gamecardId: discardId }
    }, instance);
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    // 1. Discard 1
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, playerState.hand.map(c => ({ card: c, source: 'HAND' }))),
      title: '选择弃置的卡牌',
      description: '选择一张手牌作为代价弃入墓地。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        effectId: 'mina_salvage_activate',
        sourceCardId: instance.gamecardId,
        step: 'COST'
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step === 'SALVAGE' && selections.length > 0) {
      const targetId = selections[0];
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_EROSION',
        targetFilter: { gamecardId: targetId },
        destinationZone: 'HAND'
      }, instance);
      gameState.logs.push(`[${instance.fullName}] recovered 1 erosion card to hand.`);
      return;
    }

    if (context.step === 'COST' && selections.length > 0) {
      const discardId = selections[0];
      const pUid = playerState.uid;
      await AtomicEffectExecutor.execute(gameState, pUid, {
        type: 'DISCARD_CARD',
        targetFilter: { gamecardId: discardId }
      }, instance);
      gameState.logs.push(`[${instance.fullName}] 支付发动代价：弃置了一张手牌。`);

      // 2. Select 1 from Erosion Front
      const frontCards = playerState.erosionFront.filter(c => c !== null) as Card[];
      if (frontCards.length > 0) {
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, frontCards.map(c => ({ card: c, source: 'EROSION_FRONT' }))),
          title: '选择加入手牌的卡牌',
          description: '选择一张侵蚀区域正面的卡牌加入手牌。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: {
            effectId: 'mina_salvage_activate',
            sourceCardId: instance.gamecardId,
            step: 'SALVAGE'
          }
        };
      }
    } else if (context.step === 'SALVAGE' && selections.length > 0) {
      const targetId = selections[0];
      const pUid = playerState.uid;
      await AtomicEffectExecutor.execute(gameState, pUid, {
        type: 'MOVE_FROM_EROSION',
        targetFilter: { gamecardId: targetId },
        destinationZone: 'HAND'
      }, instance);
      gameState.logs.push(`[${instance.fullName}] 激活效果：将侵蚀区域的一张卡牌回收至手牌。`);
    }
  }
};

const effect_104000176_trigger: CardEffect = {
  id: 'mina_salvage_trigger',
  type: 'TRIGGER',
  triggerLocation: ['GRAVE'],
  triggerEvent: ['CARD_DESTROYED_BATTLE', 'CARD_DESTROYED_EFFECT'],
  isMandatory: true,
  description: '【诱发】当此单位因战斗或对手的卡牌效果破坏并送入墓地时：选择最多两张你侵蚀区域的卡牌加入手牌。',
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    if (!event) return instance.cardlocation === 'GRAVE';

    // Check destruction type and source
    if (event.type === 'CARD_DESTROYED_BATTLE' && event.targetCardId === instance.gamecardId) {
      return true;
    }
    if (event.type === 'CARD_DESTROYED_EFFECT' && event.targetCardId === instance.gamecardId) {
      // Must be opponent's effect
      return event.data.sourcePlayerId !== playerState.uid;
    }
    return false;
  },
  targetSpec: {
    title: '选择回收至手牌的卡牌',
    description: '选择最多两张侵蚀区域的正面卡牌加入手牌。',
    minSelections: 1,
    maxSelections: 2,
    zones: ['EROSION_FRONT'],
    controller: 'SELF',
    step: 'SALVAGE',
    getCandidates: (_gameState, playerState) =>
      playerState.erosionFront
        .filter((card): card is Card => !!card)
        .map(card => ({ card, source: 'EROSION_FRONT' as TriggerLocation }))
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const frontCards = playerState.erosionFront.filter(c => c !== null) as Card[];
    if (frontCards.length > 0) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, frontCards.map(c => ({ card: c, source: 'EROSION_FRONT' }))),
        title: '选择回收至手牌的卡牌',
        description: '选择最多两张侵蚀区域最前方的卡牌加入手牌。',
        minSelections: 1,
        maxSelections: Math.min(2, frontCards.length),
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          effectId: 'mina_salvage_trigger',
          sourceCardId: instance.gamecardId
        }
      };
    }
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[]) => {
    if (selections.length > 0) {
      const pUid = playerState.uid;
      for (const targetId of selections) {
        await AtomicEffectExecutor.execute(gameState, pUid, {
          type: 'MOVE_FROM_EROSION',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'HAND'
        }, instance);
      }
      gameState.logs.push(`[${instance.fullName}] 诱发效果：回收了 ${selections.length} 张侵蚀区域的卡牌。`);
    }
  }
};

const card: Card = {
  id: '104000176',
  gamecardId: null as any,
  fullName: '心灵手巧【米米娜】',
  specialName: '米米娜',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { 'BLUE': 2 },
  faction: '无',
  acValue: 2,
  power: 500,
  basePower: 500,
  damage: 0,
  baseDamage: 0,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    effect_104000176_activate,
    effect_104000176_trigger
  ],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT03',
  uniqueId: null,
};

export default card;
