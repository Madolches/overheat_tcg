import { Card, GameState, PlayerState, CardEffect, GameEvent, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';

const trigger_104010122_1: CardEffect = {
  id: '104010122_trigger_1',
  type: 'TRIGGER',
  description: '【诱发】这个单位进入战场时，选择你的1个蓝色非神蚀单位，本回合中+1/+1000。回合结束时，将那个单位返回持有者的手牌。',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    const isOnUnitZone = instance.cardlocation === 'UNIT';
    if (!event) return isOnUnitZone;

    const isSelf = event.type === 'CARD_ENTERED_ZONE' &&
      (event.sourceCardId === instance.gamecardId || event.sourceCard === instance);
    const isTargetZone = event.data?.zone === 'UNIT';

    if (!isSelf || !isTargetZone || !isOnUnitZone) return false;

    // Check if there's at least one blue non-EX unit on my field
    const targets = playerState.unitZone.filter(u => u && AtomicEffectExecutor.matchesColor(u, 'BLUE') && !u.godMark);
    return targets.length > 0;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const targets = playerState.unitZone.filter(u => u && AtomicEffectExecutor.matchesColor(u, 'BLUE') && !u.godMark) as Card[];

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, targets.map(t => ({ card: t, source: 'UNIT' }))),
      title: '选择强化的单位',
      description: '请选择你的1个蓝色非神蚀单位进行强化，该单位将在回合结束时返回手牌。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId || (instance as any).uniqueId,
        effectIndex: 0,
        step: 1
      }
    };
  },
  targetSpec: {
    title: '选择强化的单位',
    description: '选择你的1个蓝色非神蚀单位，本回合中伤害+1、力量+1000。回合结束时，将那个单位返回手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: '1',
    getCandidates: (_gameState, playerState) =>
      playerState.unitZone
        .filter((u): u is Card => !!u && AtomicEffectExecutor.matchesColor(u, 'BLUE') && !u.godMark)
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step === 1 || context.step === '1') {
      const targetId = selections[0];
      const targetUnit = playerState.unitZone.find(u => u?.gamecardId === targetId);

      if (targetUnit) {
        // Save boost state on the instance to survive hydration and enable applyContinuous
        (instance as any).boostTargetId = targetId;
        (instance as any).boostTurn = gameState.turnCount;

        gameState.logs.push(`[百濑刀匠] 强化了 ${targetUnit.fullName} (+1 等级 / +1000 ATK)。`);

        // Add to return-to-hand queue at end of turn
        if (!gameState.pendingResolutions) gameState.pendingResolutions = [];
        gameState.pendingResolutions.push({
          card: instance,
          effect: trigger_104010122_1,
          effectIndex: 0,
          playerUid: playerState.uid,
          event: {
            type: 'CARD_ENTERED_ZONE',
            data: { targetGamecardId: targetId }
          } as any
        });
        
        // Force recalculate to make the buff show up immediately via applyContinuous
        EventEngine.recalculateContinuousEffects(gameState);
      }
    }
  },
  applyContinuous: (gameState: GameState, instance: Card) => {
    const boostTargetId = (instance as any).boostTargetId;
    const boostTurn = (instance as any).boostTurn;

    if (boostTargetId && boostTurn === gameState.turnCount) {
      for (const player of Object.values(gameState.players)) {
        const target = player.unitZone.find(u => u?.gamecardId === boostTargetId);
        if (target) {
          const oldPower = target.power || 0;
          const oldDamage = target.damage || 0;
          
          target.damage = oldDamage + 1;
          target.power = oldPower + 1000;
          
          if (!target.influencingEffects) target.influencingEffects = [];
          target.influencingEffects.push({
            sourceCardName: '百濑刀匠',
            description: '+1伤害 / +1000力量（诱发效果）'
          });
          
          break;
        }
      }
    }
  },
  resolve: async (instance: Card, gameState: GameState, playerState: PlayerState, event?: GameEvent) => {
    // This is called at finishTurnTransition for each record in pendingResolutions
    const targetId = event?.data?.targetGamecardId;
    
    if (targetId && playerState) {
      // Clear boost state
      (instance as any).boostTargetId = undefined;
      (instance as any).boostTurn = undefined;

      const targetUnit = playerState.unitZone.find(u => u?.gamecardId === targetId);
      if (targetUnit) {
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_FIELD',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'HAND'
        }, instance);
        gameState.logs.push(`[百濑刀匠] 效果结束：${targetUnit.fullName} 返回手牌。`);
      }
    }
  }
};


const card: Card = {
  id: '104010122',
  fullName: '百濑刀匠',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '百濑之水城',
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
  effects: [trigger_104010122_1],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
