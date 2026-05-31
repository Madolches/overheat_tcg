import { Card, GameState, PlayerState, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { standardizeChoiceOptions } from './BaseUtil';

const effect_204020023_activate: CardEffect = {
  id: '204020023_activate',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description: '对手选择以下效果之一发动。若你在神依状态下发动，则由你代替对手进行选择：a.抽三张牌，选择其两张手牌，放置在侵蚀前区。b.选择一个横置单位并破坏。',
  targetSpec: {
    preselect: false,
    modeTitle: '公平交易：选择效果',
    modeDescription: '请选择一个效果以执行。',
    modeOptions: [{
      id: 'MODE_A',
      label: '抽3并充能2张',
      title: '选择手牌放置到侵蚀区',
      description: '对手抽3张牌，选择其中2张手牌放置到侵蚀前区。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: 'MODE_A'
    }, {
      id: 'MODE_B',
      label: '破坏横置单位',
      title: '选择破坏目标',
      description: '请选择一个横置的单位。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'ANY',
      step: 'MODE_B_DESTROY',
      getCandidates: gameState =>
        Object.values(gameState.players).flatMap(player =>
          player.unitZone
            .filter((unit): unit is Card => !!unit && !!unit.isExhausted)
            .map(card => ({ card, source: 'UNIT' as any }))
        )
    }]
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid)!;
    const activatedInGoddess = !!((instance as any).__playSnapshot?.isGoddessMode ?? playerState.isGoddessMode);
    const selectorUid = activatedInGoddess ? playerState.uid : opponentUid;

    const choiceContext = {
      sourceCardId: instance.gamecardId,
      effectId: '204020023_activate',
      step: 'CHOOSE_MODE',
      opponentUid,
      selectorUid
    };

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CHOICE',
      playerUid: selectorUid,
      options: standardizeChoiceOptions(gameState, [
        {
          id: 'MODE_A',
          label: '抽3张并充能2张',
          detail: '对手抽3张牌，选择其2张手牌放置到侵蚀前区。',
          icon: 'draw'
        },
        {
          id: 'MODE_B',
          label: '破坏横置单位',
          detail: '选择1个横置单位并破坏。',
          icon: 'destroy'
        }
      ], choiceContext),
      title: '公平交易：选择效果',
      description: '请选择一个效果以执行。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: choiceContext
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    const opponentUid = context.opponentUid;
    const selectorUid = context.selectorUid;
    const opponent = gameState.players[opponentUid];

    if (context.step === 'CHOOSE_MODE') {
      const mode = selections[0];
      if (mode === 'MODE_A') {
        await AtomicEffectExecutor.execute(gameState, opponentUid, {
          type: 'DRAW',
          value: 3
        }, instance);

        if (opponent.hand.length > 0) {
          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CARD',
            playerUid: selectorUid,
            options: opponent.hand.map(c => ({ card: c, source: 'HAND' as any })),
            title: '选择手牌放置到侵蚀区',
            description: '请选择 2 张手牌放置在侵蚀前区。',
            minSelections: Math.min(opponent.hand.length, 2),
            maxSelections: 2,
            callbackKey: 'EFFECT_RESOLVE',
            context: {
              ...context,
              step: 'MODE_A_RECHARGE'
            }
          };
        }
      } else if (mode === 'MODE_B') {
        const targets: Card[] = [];
        Object.values(gameState.players).forEach(p => {
          p.unitZone.forEach(u => {
            if (u && u.isExhausted) targets.push(u);
          });
        });

        if (targets.length > 0) {
          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CARD',
            playerUid: selectorUid, 
            options: AtomicEffectExecutor.enrichQueryOptions(gameState, selectorUid, targets.map(t => ({ card: t, source: 'UNIT' as any }))),
            title: '选择破坏目标',
            description: '请选择一个横置的单位。',
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'EFFECT_RESOLVE',
            context: {
              ...context,
              step: 'MODE_B_DESTROY'
            }
          };
        } else {
          gameState.logs.push(`[${instance.fullName}] 没有可供破坏的横置单位。`);
        }
      }
    } else if (context.step === 'MODE_A_RECHARGE') {
      for (const cid of selections) {
        await AtomicEffectExecutor.execute(gameState, opponentUid, {
          type: 'MOVE_FROM_HAND',
          targetFilter: { gamecardId: cid },
          destinationZone: 'EROSION_FRONT'
        }, instance);
      }
      gameState.logs.push(`[${instance.fullName}] 效果：充能已完成。`);
    } else if (context.step === 'MODE_B_DESTROY') {
      const targetId = selections[0];
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'DESTROY_CARD',
        targetFilter: { gamecardId: targetId }
      }, instance);
      gameState.logs.push(`[${instance.fullName}] 效果：破坏已执行。`);
    }
  }
};

const card: Card = {
  id: '204020023',
  fullName: '公平交易',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
  faction: '九尾商会联盟',
  acValue: -3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_204020023_activate],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT01',
  uniqueId: null,
};

export default card;
