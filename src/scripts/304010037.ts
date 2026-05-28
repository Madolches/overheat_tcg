import { Card, GameState, PlayerState, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { exhaustCost } from './BaseUtil';

const trigger_304010037: CardEffect = {
  id: '304010037_trigger',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  description: '在你的回合，当你战场上的单位返回手牌时，可以发动：将这张卡转为横置状态，选择手牌中一张非神位且属于「百濑之水城」势力单位卡放置在战场上。',
  triggerEvent: 'CARD_FIELD_TO_HAND',
  isMandatory: false,
  limitCount: 1,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: any) => {
    if (!playerState.isTurn || event?.type !== 'CARD_FIELD_TO_HAND' || event.playerUid !== playerState.uid || instance.isExhausted) {
      return false;
    }

    if (event.data?.zone !== 'UNIT') {
      return false;
    }

    const movedCard = event.sourceCard || AtomicEffectExecutor.findCardById(gameState, event.sourceCardId);
    return movedCard?.type === 'UNIT' &&
      playerState.hand.some(c => c && c.faction === '百濑之水城' && !c.godMark && c.type === 'UNIT');
  },
  cost: exhaustCost,
  execute: async (instance, gameState, playerState) => {
    const validTargets = playerState.hand.filter(c => c && c.faction === '百濑之水城' && !c.godMark && c.type === 'UNIT');

    if (validTargets.length > 0) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, validTargets.map(c => ({ card: c, source: 'HAND' as any }))),
        title: '选择出击单位',
        description: '发动【水城客栈】效果：将此卡横置，并选择手牌中的「百濑之水城」单位放置在单位区。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          sourceCardId: instance.gamecardId,
          effectId: '304010037_trigger',
          step: 1
        }
      };
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context.step === 1) {
      const targetId = selections[0];
      const target = playerState.hand.find(c => c.gamecardId === targetId);
      if (target) {
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_HAND',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'UNIT'
        }, instance);

        gameState.logs.push(`[${instance.fullName}] 横置并使 [${target.fullName}] 登场了！`);
      }
    }
  }
};

const card: Card = {
  id: '304010037',
  fullName: '【水城客栈】',
  specialName: '',
  type: 'ITEM',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '百濑之水城',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [trigger_304010037],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT05',
  uniqueId: null,
};

export default card;
