import { Card, GameState, PlayerState, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { standardizeChoiceOptions } from './BaseUtil';

const canNegateStackItem = (gameState: GameState, playerUid: string, item: any) =>
  (item.type === 'PLAY' || item.type === 'EFFECT') &&
  !item.isNegated &&
  item.ownerUid !== playerUid &&
  (gameState.players[item.ownerUid] as any)?.uncounterableActionsTurn !== gameState.turnCount &&
  (gameState.players[item.ownerUid] as any)?.cardEffectsCannotBeNegatedTurn !== gameState.turnCount;

const effect_204000025_activation: CardEffect = {
  id: 'kaguya_flowering_silence',
  type: 'ACTIVATE',
  description: '【启】主要阶段：选择场上一个单位的一个“启”效果，在本回合中不被处理。不论目标是否处理该效果，此卡均可参与对抗并支付费用。或者：在对抗阶段：使一次发动无效并送入墓地。',
  triggerLocation: ['PLAY'],
  condition: (gameState: GameState, playerState: PlayerState, instance: Card) => {
    const playPhase = (instance as any).__playSnapshot?.phase;
    const isMainMode = playPhase === 'MAIN' || (!playPhase && gameState.phase === 'MAIN' && playerState.isTurn);
    if (isMainMode) {
      return Object.values(gameState.players).some(p =>
        p.unitZone.some(c => c && c.effects && c.effects.some(e => e.type === 'ACTIVATE'))
      );
    }

    const isCounterMode = playPhase === 'COUNTERING' || (!playPhase && gameState.phase === 'COUNTERING');
    if (isCounterMode) {
      return gameState.counterStack.some(item =>
        canNegateStackItem(gameState, playerState.uid, item)
      );
    }

    return false;
  },
  targetSpec: {
    modeTitle: '选择效果',
    modeDescription: '选择要执行的效果。',
    modeOptions: [{
      id: 'MAIN_SEAL',
      label: '封印启效果',
      title: '选择封印目标',
      description: '请选择一个单位，然后封印其一个“启”效果。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'ANY',
      step: 'SELECT_UNIT',
      condition: (gameState, playerState, instance) => {
        const playPhase = (instance as any).__playSnapshot?.phase;
        return playPhase === 'MAIN' || (!playPhase && gameState.phase === 'MAIN' && playerState.isTurn);
      },
      getCandidates: gameState => Object.values(gameState.players).flatMap(player =>
        player.unitZone
          .filter((card): card is Card => !!card && !!card.effects?.some(effect => effect.type === 'ACTIVATE'))
          .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
      )
    }, {
      id: 'COUNTER_NEGATE',
      label: '无效发动',
      title: '无效发动',
      description: '对抗阶段，使对手的一次发动无效。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: 'COUNTER_NEGATE',
      condition: (gameState, playerState, instance) => {
        const playPhase = (instance as any).__playSnapshot?.phase;
        const isCounterMode = playPhase === 'COUNTERING' || (!playPhase && gameState.phase === 'COUNTERING');
        return isCounterMode && gameState.counterStack.some(item =>
          canNegateStackItem(gameState, playerState.uid, item)
        );
      },
      getCandidates: () => []
    }]
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const playPhase = (instance as any).__playSnapshot?.phase;
    const isMainMode = playPhase === 'MAIN' || (!playPhase && gameState.phase === 'MAIN' && playerState.isTurn);
    if (isMainMode) {
      const fieldCandidates: Card[] = [];
      Object.values(gameState.players).forEach(p => {
        p.unitZone.forEach(c => {
          if (c && c.effects && c.effects.some(e => e.type === 'ACTIVATE')) {
            fieldCandidates.push(c);
          }
        });
      });

      if (fieldCandidates.length === 0) {
        gameState.logs.push(`[${instance.fullName}] 没有发现可处理的目标。`);
        return;
      }

      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(
          gameState,
          playerState.uid,
          fieldCandidates.map(c => ({
            card: c,
            source: 'UNIT' as TriggerLocation,
            id: c.gamecardId
          }))
        ),
        title: '选择封印目标',
        description: '请选择一个单位，然后封印其一个“启”效果。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          effectId: 'kaguya_flowering_silence',
          sourceCardId: instance.gamecardId,
          step: 'SELECT_UNIT'
        }
      };
      return;
    }

    const isCounterMode = playPhase === 'COUNTERING' || (!playPhase && gameState.phase === 'COUNTERING');
    if (isCounterMode) {
      const stackCandidates = gameState.counterStack
        .filter(item => canNegateStackItem(gameState, playerState.uid, item));

      const fieldCandidates: Card[] = [];
      Object.values(gameState.players).forEach(p => {
        p.unitZone.forEach(c => {
          if (c && c.effects && c.effects.some(e => e.type === 'ACTIVATE')) {
            fieldCandidates.push(c);
          }
        });
      });

      if (stackCandidates.length === 0 && fieldCandidates.length === 0) {
        gameState.logs.push(`[${instance.fullName}] 没有发现可处理的目标。`);
        return;
      }

      const options = [
        ...stackCandidates.map(item => ({
          card: item.card || { fullName: '未知效果', type: 'EFFECT' } as unknown as Card,
          source: (item.type === 'PLAY' ? (item.card?.cardlocation || 'PLAY') : 'STACK') as any,
          id: item.card?.gamecardId || `stack_${gameState.counterStack.indexOf(item)}`
        })),
        ...fieldCandidates.map(c => ({
          card: c,
          source: 'UNIT' as any,
          id: c.gamecardId
        }))
      ];

      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, options),
        title: '选择拦截或封印目标',
        description: '请选择一个要无效的发动，或要封印的“启”效果单位。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          effectId: 'kaguya_flowering_silence',
          sourceCardId: instance.gamecardId,
          step: 'SELECT_ANY_TARGET'
        }
      };
    }
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    const selectedMode = context?.selectedModeId || context?.modeId || context?.declaredModeId;
    if (selectedMode === 'COUNTER_NEGATE' || context.step === 'COUNTER_NEGATE') {
      const item = [...gameState.counterStack]
        .reverse()
        .find(i => canNegateStackItem(gameState, playerState.uid, i));
      if (item) {
        item.isNegated = true;
        gameState.logs.push(`[${instance.fullName}] 成功拦截并使 [${item.card?.fullName || '效果'}] 无效。`);
      }
      return;
    }

    if (context.step === 'SELECT_ANY_TARGET' && selections.length > 0) {
      const selectedId = selections[0];

      const stackItemIndex = gameState.counterStack.findIndex(i =>
        canNegateStackItem(gameState, playerState.uid, i) &&
        (i.card?.gamecardId === selectedId || `stack_${gameState.counterStack.indexOf(i)}` === selectedId)
      );

      if (stackItemIndex !== -1) {
        const item = gameState.counterStack[stackItemIndex];
        item.isNegated = true;
        gameState.logs.push(`[${instance.fullName}] 成功拦截并使 [${item.card?.fullName || '效果'}] 无效。`);
        return;
      }

      context.step = 'SELECT_UNIT';
    }

    if (context.step === 'SELECT_UNIT' && selections.length > 0) {
      const targetId = selections[0];
      const target = AtomicEffectExecutor.findCardById(gameState, targetId);
      if (target && target.effects) {
        const activateEffects = target.effects.filter(e => e.type === 'ACTIVATE');

        if (activateEffects.length === 1) {
          if (!target.silencedEffectIds) target.silencedEffectIds = [];
          if (!target.silencedEffectIds.includes(activateEffects[0].id)) {
            target.silencedEffectIds.push(activateEffects[0].id);
          }
          gameState.logs.push(`[${instance.fullName}] 封印了 [${target.fullName}] 的“启”效果。`);
        } else if (activateEffects.length > 1) {
          const choiceContext = {
            effectId: 'kaguya_flowering_silence',
            sourceCardId: instance.gamecardId,
            targetId,
            step: 'SELECT_EFFECT'
          };

          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CHOICE',
            playerUid: playerState.uid,
            options: standardizeChoiceOptions(gameState, activateEffects.map(e => ({ id: e.id, label: e.description })), choiceContext),
            title: '选择效果',
            description: '请选择要封印的“启”效果。',
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'EFFECT_RESOLVE',
            context: choiceContext
          };
        }
      }
    } else if (context.step === 'SELECT_EFFECT' && selections.length > 0) {
      const { targetId } = context;
      const target = AtomicEffectExecutor.findCardById(gameState, targetId);
      if (target) {
        if (!target.silencedEffectIds) target.silencedEffectIds = [];
        if (!target.silencedEffectIds.includes(selections[0])) {
          target.silencedEffectIds.push(selections[0]);
        }
        gameState.logs.push(`[${instance.fullName}] 封印了 [${target.fullName}] 的指定“启”效果。`);
      }
    } else if (context.step === 'SELECT_STACK_ITEM' && selections.length > 0) {
      const selectedId = selections[0];
      const item = gameState.counterStack.find(i => i.card?.gamecardId === selectedId || `stack_${gameState.counterStack.indexOf(i)}` === selectedId);
      if (item) {
        item.isNegated = true;
        gameState.logs.push(`[${instance.fullName}] 成功拦截并使 [${item.card?.fullName || '效果'}] 无效。`);
      }
    }
  }
};

const card: Card = {
  id: '204000025',
  gamecardId: null as any,
  fullName: '歌月花开',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  colorReq: { 'BLUE': 1 },
  faction: '无',
  acValue: 2,
  power: 0,
  basePower: 0,
  damage: 0,
  baseDamage: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: false,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    effect_204000025_activation
  ],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT01',
  uniqueId: null,
};

export default card;
