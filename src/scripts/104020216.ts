import { Card, CardEffect, GameEvent, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, moveCardAsCost } from './BaseUtil';

const getValidBattleDestroyers = (gameState: GameState, playerState: PlayerState, event?: GameEvent) => {
  if (!event || event.type !== 'CARD_DESTROYED_BATTLE') return [] as Card[];
  if (!playerState.isTurn) return [] as Card[];
  if (event.playerUid === playerState.uid) return [] as Card[];

  const attackerIds = Array.isArray(event.data?.attackerIds) ? event.data.attackerIds as string[] : [];
  if (attackerIds.length === 0) return [] as Card[];

  return attackerIds
    .map(id => playerState.unitZone.find(unit => unit?.gamecardId === id) || null)
    .filter((unit): unit is Card => !!unit && unit.fullName.includes('牛头人'));
};

const trigger_104020216_ready: CardEffect = {
  id: '104020216_ready_trigger',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_DESTROYED_BATTLE',
  isGlobal: true,
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  description: '【诱发】【卡名一回合一次】你的回合中，你的单位区中卡名含有“牛头人”的单位战斗破坏对手单位时：你可以选择发动，将那个单位竖置。',
  condition: (gameState: GameState, playerState: PlayerState, _instance: Card, event?: GameEvent) => {
    return getValidBattleDestroyers(gameState, playerState, event).length > 0;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState, event?: GameEvent) => {
    const targets = getValidBattleDestroyers(gameState, playerState, event);
    if (targets.length === 0) return;

    if (targets.length === 1) {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'ROTATE_VERTICAL',
        targetFilter: { gamecardId: targets[0].gamecardId }
      }, instance);
      gameState.logs.push(`[${instance.fullName}] 使 [${targets[0].fullName}] 变为竖置状态。`);
      return;
    }

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        targets.map(card => ({ card, source: 'UNIT' as any }))
      ),
      title: '选择竖置的单位',
      description: '请选择1个战斗破坏了对手单位的“牛头人”单位，将其变为竖置状态。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectIndex: 0,
        step: 'SELECT_READY_TARGET'
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step !== 'SELECT_READY_TARGET' || selections.length === 0) return;

    const targetId = selections[0];
    const target = playerState.unitZone.find(unit => unit?.gamecardId === targetId && unit.fullName.includes('牛头人'));
    if (!target) {
      gameState.logs.push(`[${instance.fullName}] 目标已不合法，效果结算失败。`);
      return;
    }

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'ROTATE_VERTICAL',
      targetFilter: { gamecardId: targetId }
    }, instance);
    gameState.logs.push(`[${instance.fullName}] 使 [${target.fullName}] 变为竖置状态。`);
  }
};

const activate_104020216_power_up: CardEffect = {
  id: '104020216_power_up_activate',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '【启动】【卡名一回合一次】舍弃手牌中的1张菲晶卡：本回合中，这个单位力量值+1000。',
  condition: (_gameState: GameState, playerState: PlayerState) => {
    return playerState.hand.some(card => card.feijingMark);
  },
  cost: async (gameState: GameState, playerState: PlayerState, instance: Card) => {
    const feijingCards = playerState.hand.filter(card => card.feijingMark);
    if (feijingCards.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      feijingCards,
      '选择要舍弃的菲晶卡',
      '请选择1张带有菲晶的手牌舍弃，作为发动费用。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '104020216_power_up_activate',
        step: 'DISCARD_FEIJING_COST',
        skipEffectResolveAfterCost: true
      },
      () => 'HAND'
    );
    return !!gameState.pendingQuery;
  },
  onCostResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    const discardId = selections[0];
    const discardCard = playerState.hand.find(card => card.gamecardId === discardId && card.feijingMark);
    if (!discardCard) {
      context.cancelActivation = true;
      gameState.logs.push(`[${instance.fullName}] 选择的菲晶手牌已不合法，发动中止。`);
      return;
    }
    moveCardAsCost(gameState, playerState.uid, discardCard, 'GRAVE', instance);
    gameState.logs.push(`[${instance.fullName}] 舍弃了 [${discardCard.fullName}] 作为费用。`);
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'CHANGE_POWER',
      targetFilter: { gamecardId: instance.gamecardId },
      value: 1000,
      turnDuration: 1
    }, instance);

    gameState.logs.push(`[${instance.fullName}] 本回合力量值+1000。`);
  }
};

const card: Card = {
  id: '104020216',
  fullName: '牛头人盟约重战士【胧】',
  specialName: '胧',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '九尾商会联盟',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    trigger_104020216_ready,
    activate_104020216_power_up
  ],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT05',
  uniqueId: null,
};

export default card;
