import { Card, GameState, PlayerState, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery } from './BaseUtil';

const card: Card = {
  id: '304020010',
  fullName: '菲晶相机',
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
  effects: [
    {
      id: 'feijing_camera_activate',
      type: 'ACTIVATE',
      triggerLocation: ['ITEM'],
      limitCount: 1,
      limitNameType: true,
      description: '【同名回合1次】弃置1张手牌，并将这张卡转为横置状态：选择战场上1个AC2及以下的非「神蚀」单位，该单位在下一个对手回合的开始阶段不能转为纵置状态。',
      condition: (gameState, playerState, instance) => {
        if (instance.isExhausted) return false;
        if (playerState.hand.length === 0) return false;

        // Check for valid targets on field
        return Object.values(gameState.players).some(p =>
          p.unitZone.some(u =>
            u !== null &&
            (u.acValue || 0) <= 2 &&
            !u.godMark
          )
        );
      },
      cost: async (gameState, playerState, instance) => {
        const candidates = playerState.hand.filter(card => card.gamecardId !== instance.gamecardId);
        if (candidates.length === 0 || instance.isExhausted) return false;
        createSelectCardQuery(
          gameState,
          playerState.uid,
          candidates,
          '弃置手牌',
          '发动费用：请选择 1 张手牌弃置。',
          1,
          1,
          {
            sourceCardId: instance.gamecardId,
            costType: 'DISCARD_HAND_COST',
            discardCostAmount: 1,
            exhaustSourceAsCost: true
          },
          () => 'HAND'
        );
        return true;
      },
      execute: async (card, gameState, playerState) => {
        // 1. Cost: Discard selection
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, playerState.hand.map(c => ({ card: c, source: 'HAND' as any }))),
          title: '弃置手牌',
          description: '发动费用：请选择 1 张手牌弃置。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: { sourceCardId: card.gamecardId, effectIndex: 0, step: 1 }
        };
      },
      onQueryResolve: async (card, gameState, playerState, selections, context) => {
        if (context?.declaredTargets?.length) {
          const targetId = selections[0];
          await AtomicEffectExecutor.execute(gameState, playerState.uid, {
            type: 'SET_CAN_RESET_COUNT',
            targetFilter: { gamecardId: targetId },
            value: 1
          }, card);
          gameState.logs.push(`[菲晶相机] 效果生效，目标单位在下次调度阶段无法转为纵置。`);
          return;
        }
        const step = context?.step || 1;

        if (step === 1) {
          // Process Discard
          const discardId = selections[0];
          await AtomicEffectExecutor.execute(gameState, playerState.uid, {
            type: 'MOVE_FROM_HAND',
            targetFilter: { gamecardId: discardId },
            destinationZone: 'GRAVE'
          }, card);

          // Exhaust the camera
          await AtomicEffectExecutor.execute(gameState, playerState.uid, {
            type: 'ROTATE_HORIZONTAL',
            targetFilter: { gamecardId: card.gamecardId }
          }, card);

          gameState.logs.push(`${playerState.displayName} 弃置了卡牌并横置了 ${card.fullName}。`);

          // 2. Step 2: Select Target for Freeze
          const allUnits = Object.values(gameState.players).flatMap(p =>
            p.unitZone.filter(u => u !== null && (u.acValue || 0) <= 2 && !u.godMark)
          ) as Card[];

          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CARD',
            playerUid: playerState.uid,
            options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, allUnits.map(u => ({ card: u, source: 'UNIT' as any }))),
            title: '选择冻结目标',
            description: '效果结算：请选择 1 个 AC 2 及以下的非「神蚀」单位。该单位下次无法调度。',
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'EFFECT_RESOLVE',
            context: { sourceCardId: card.gamecardId, effectIndex: 0, step: 2 }
          };
        } else if (step === 2) {
          const targetId = selections[0];

          await AtomicEffectExecutor.execute(gameState, playerState.uid, {
            type: 'SET_CAN_RESET_COUNT',
            targetFilter: { gamecardId: targetId },
            value: 1
          }, card);

          gameState.logs.push(`[菲晶相机] 效果生效，目标单位在下次调度阶段无法转为纵置。`);
        }
      },
      targetSpec: {
        title: '选择冻结目标',
        description: '效果结算：请选择 1 个 AC 2 及以下的非「神蚀」单位。该单位下次无法调度。',
        minSelections: 1,
        maxSelections: 1,
        zones: ['UNIT'],
        step: '2',
        getCandidates: gameState => Object.values(gameState.players)
          .flatMap(player => player.unitZone.filter((card): card is Card => !!card && (card.acValue || 0) <= 2 && !card.godMark))
          .map(card => ({ card, source: 'UNIT' as any }))
      }
    }
  ],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
