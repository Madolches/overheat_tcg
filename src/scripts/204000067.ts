import { Card, GameState, PlayerState, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery } from './BaseUtil';

const card: Card = {
  id: '204000067',
  fullName: '歌月扬帆',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '无',
  acValue: -3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [
    {
      id: 'yingwu_activate',
      type: 'ACTIVATE',
      triggerLocation: ['HAND', 'PLAY'],
      condition: (gameState: GameState, playerState: PlayerState) => {
        // Can only be played if the player has at least one unit on the battlefield
        return playerState.unitZone.some(c => c !== null);
      },
      description: '选择你战场上的一个单位返回持有者手牌。若返回的是「风花」单位，可以选择对方一个单位变为横置，且该单位在下一回合开始时无法变为纵置。',
      execute: async (card: Card, gameState: GameState, playerState: PlayerState) => {
        const friendlyUnits = playerState.unitZone.filter(c => c !== null) as Card[];
        if (friendlyUnits.length === 0) {
          gameState.logs.push(`[歌月扬帆] 没有可选单位。`);
          return;
        }

        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: friendlyUnits.map(u => ({ card: u, source: 'UNIT' as any })),
          title: '选择返回手牌的单位',
          description: '请选择你战场上的一个单位返回持有者手牌。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: { sourceCardId: card.gamecardId, effectIndex: 0, step: 1 }
        };
      },
      onQueryResolve: async (card, gameState, playerState, selections, context) => {
        const step = String(context?.step ?? '1');

        if (step === '1') {
          const targetId = selections[0];
          const target = AtomicEffectExecutor.findCardById(gameState, targetId);
          if (!target) return;
          if (!playerState.unitZone.some(unit => unit?.gamecardId === target.gamecardId)) return;

          const isFuhua = target.specialName === '风花';
          
          // Perform bounce
          await AtomicEffectExecutor.execute(gameState, playerState.uid, {
            type: 'MOVE_FROM_FIELD',
            destinationZone: 'HAND',
            targetFilter: { gamecardId: targetId }
          }, card);

          gameState.logs.push(`${playerState.displayName} 将 ${target.fullName} 返回手牌。`);

          if (isFuhua) {
            const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid);
            if (opponentUid) {
              const opponent = gameState.players[opponentUid];
              const enemyTargets = opponent.unitZone.filter(u => u !== null) as Card[];
              if (enemyTargets.length > 0) {
                createSelectCardQuery(
                  gameState,
                  playerState.uid,
                  enemyTargets,
                  '选择对方单位横置',
                  '返回的是「风花」单位，可以选择对方一个单位变为横置且下回合无法重置。',
                  1,
                  1,
                  { sourceCardId: card.gamecardId, effectId: 'yingwu_activate', step: 2 },
                  () => 'UNIT'
                );
                return;
              }
            }
          }
        } else if (step === '2') {
          const targetId = selections[0];
          
          await AtomicEffectExecutor.execute(gameState, playerState.uid, {
            type: 'ROTATE_HORIZONTAL',
            targetFilter: { gamecardId: targetId }
          }, card);

          await AtomicEffectExecutor.execute(gameState, playerState.uid, {
            type: 'SET_CAN_RESET_COUNT',
            targetFilter: { gamecardId: targetId },
            value: 1
          }, card);

          gameState.logs.push(`[歌月扬帆] 使对方单位进入横置且下回合无法重置。`);
        }
      },
      targetSpec: {
        title: '选择返回手牌的单位',
        description: '请选择你战场上的一个单位返回持有者手牌。',
        minSelections: 1,
        maxSelections: 1,
        zones: ['UNIT'],
        controller: 'SELF',
        step: '1',
        getCandidates: (_gameState, playerState) => playerState.unitZone
          .filter((card): card is Card => !!card)
          .map(card => ({ card, source: 'UNIT' as any }))
      }
    }
  ],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT03',
  uniqueId: null,
};

export default card;
