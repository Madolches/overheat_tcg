import { Card, GameState, PlayerState, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const effect_104010173_activation: CardEffect = {
  id: 'suisen_bounce',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '【启】侵蚀区总数为1-4时：将此单位返回持有者手牌，选择场上一张横置的非神蚀单位返回其持有者手牌。',
  erosionTotalLimit: [1, 4],
  condition: (gameState: GameState, _playerState: PlayerState, instance: Card) => {
    const hasValidTarget = Object.values(gameState.players).some(p =>
      p.unitZone.some(c => c && c.gamecardId !== instance.gamecardId && !c.godMark && c.isExhausted)
    );
    const sharedPhases = ['MAIN', 'BATTLE_DECLARATION', 'BATTLE_FREE'];
    return (sharedPhases.includes(gameState.phase) || gameState.phase === 'COUNTERING') && hasValidTarget;
  },
  targetSpec: {
    title: '选择返回手牌的单位',
    description: '请选择一张横置的非神蚀单位返回其持有者手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'SELECT_TARGET',
    getCandidates: (gameState, _playerState, instance) =>
      Object.values(gameState.players).flatMap(player =>
        player.unitZone
          .filter((card): card is Card => !!card && card.gamecardId !== instance.gamecardId && !card.godMark && !!card.isExhausted)
          .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
      )
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const targets: Card[] = [];
    Object.values(gameState.players).forEach(p => {
      p.unitZone.forEach(c => {
        if (c && c.gamecardId !== instance.gamecardId && !c.godMark && c.isExhausted) {
          targets.push(c);
        }
      });
    });

    if (targets.length === 0) {
      gameState.logs.push(`[${instance.fullName}] 没有符合条件的横置非神蚀单位，效果失败。`);
      return;
    }

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        targets.map(c => ({ card: c, source: 'UNIT' as TriggerLocation }))
      ),
      title: '选择返回手牌的单位',
      description: '请选择一张横置的非神蚀单位返回其持有者手牌。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        effectId: 'suisen_bounce',
        sourceCardId: instance.gamecardId,
        step: 'SELECT_TARGET'
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step !== 'SELECT_TARGET' || selections.length === 0) return;

    const targetId = selections[0];
    const target = AtomicEffectExecutor.findCardById(gameState, targetId);
    const owner = AtomicEffectExecutor.findCardOwnerKey(gameState, targetId);

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_FIELD',
      targetFilter: { gamecardId: instance.gamecardId },
      destinationZone: 'HAND'
    }, instance);
    gameState.logs.push(`[${instance.fullName}] 自身返回了手牌。`);

    if (!target || !owner) {
      gameState.logs.push(`[${instance.fullName}] 结算时目标已不合法，不再返回其他单位。`);
      return;
    }

    await AtomicEffectExecutor.execute(gameState, owner, {
      type: 'MOVE_FROM_FIELD',
      targetFilter: { gamecardId: targetId },
      destinationZone: 'HAND'
    }, instance);
    gameState.logs.push(`[${instance.fullName}] 的效果使 [${target.fullName}] 返回了手牌。`);
  }
};

const card: Card = {
  id: '104010173',
  gamecardId: null as any,
  fullName: '水仙--剑姬',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { BLUE: 1 },
  faction: '百濑之水城',
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
    effect_104010173_activation
  ],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT03',
  uniqueId: null,
};

export default card;
