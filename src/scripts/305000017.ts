import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const effect_305000017_skip_ready: CardEffect = {
  id: '305000017_skip_ready',
  type: 'CONTINUOUS',
  content: 'SKIP_OWN_START_READY',
  description: '你的回合开始时，这个单位不能竖置'
};

const effect_305000017_activate: CardEffect = {
  id: '305000017_activate',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  description: '支付1点费用并横置这个道具。选择你的1个单位。本回合中，若其将被破坏，改为将其返回手牌。',
  condition: (_gameState, playerState, instance) => {
    return !instance.isExhausted && playerState.unitZone.some(unit => unit !== null);
  },
  targetSpec: {
    title: '选择单位',
    description: '选择你的1个单位，本回合中若其将被破坏，改为返回手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'APPLY_TARGET',
    getCandidates: (_gameState, playerState) =>
      playerState.unitZone
        .filter((unit): unit is Card => !!unit)
        .map(card => ({ card, source: 'UNIT' as any }))
  },
  cost: async (gameState, playerState, instance) => {
    if (instance.isExhausted) return false;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_PAYMENT',
      playerUid: playerState.uid,
      options: [],
      title: `支付费用：${instance.id}`,
      description: '支付1点费用。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      paymentCost: 1,
      paymentColor: instance.color,
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '305000017_activate',
        step: 'PAY_AND_EXHAUST_COST',
        skipEffectResolveAfterCost: true
      }
    };
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, _selections, context) => {
    if (context?.step !== 'PAY_AND_EXHAUST_COST') return;
    if (instance.isExhausted) {
      context.cancelActivation = true;
      return;
    }
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'ROTATE_HORIZONTAL',
      targetFilter: { gamecardId: instance.gamecardId }
    }, instance);
  },
  execute: async (instance, gameState, playerState) => {
    const ownUnits = playerState.unitZone.filter((unit): unit is Card => !!unit);
    if (ownUnits.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        ownUnits.map(unit => ({ card: unit, source: 'UNIT' as const }))
      ),
      title: '选择单位',
      description: '选择一个单位，这个单位本回合如果要被破坏，改为返回手牌。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '305000017_activate',
        step: 'APPLY_TARGET'
      }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {

    if (context.step === 'APPLY_TARGET') {
      const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
      if (!target) return;

      if (!(target as any).data) {
        (target as any).data = {};
      }

      (target as any).data.returnToHandOnDestroyTurn = gameState.turnCount;
      (target as any).data.returnToHandOnDestroySourceCardId = instance.gamecardId;
      (target as any).data.returnToHandOnDestroySourcePlayerUid = playerState.uid;
      gameState.logs.push(`[${instance.id}] will return [${target.fullName}] to hand instead of destruction this turn.`);
    }
  }
};

const card: Card = {
  id: '305000017',
  fullName: '烟雾弹',
  specialName: '',
  type: 'ITEM',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_305000017_skip_ready, effect_305000017_activate],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
