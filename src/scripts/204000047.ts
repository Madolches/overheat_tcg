import { Card, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allCardsOnField } from './BaseUtil';

const fufengTargets = (gameState: GameState, playerState: PlayerState, source: Card) => {
  const isFuhuaPresent = playerState.unitZone.some(c => c && c.specialName === '风花');
  const filter = {
    onField: true,
    godMark: isFuhuaPresent ? undefined : false
  };

  return allCardsOnField(gameState).filter(card =>
    AtomicEffectExecutor.matchesFilter(card, filter as any, source)
  );
};

const card: Card = {
  id: '204000047',
  fullName: '歌月拂风',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '无',
  acValue: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [
    {
      id: 'fufeng_activate',
      type: 'ACTIVATE',
      triggerLocation: ['HAND', 'PLAY'],
      condition: (gameState: GameState, playerState: PlayerState, card: Card) =>
        fufengTargets(gameState, playerState, card).length > 0,
      description: '选择战场上1张非神蚀卡返回持有者手牌。若你的战场上存在「风花」单位，可以选择战场上1张神蚀卡返回持有者手牌。',
      execute: async (card: Card, gameState: GameState, playerState: PlayerState) => {
        // 1. Check for Fuhua on your side
        const isFuhuaPresent = playerState.unitZone.some(c => c && c.specialName === '风花');

        // 2. Find valid targets across all players
        const allPotentialTargets = fufengTargets(gameState, playerState, card);

        if (allPotentialTargets.length === 0) {
          gameState.logs.push(`[歌月拂风] 没有合法目标。`);
          return;
        }

        // 4. Trigger selection query
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, allPotentialTargets.map(t => ({ card: t, source: t.cardlocation as any }))),
          title: '选择返回手牌的卡',
          description: isFuhuaPresent ? '选择战场上1张卡返回持有者手牌。' : '选择战场上1张非神蚀卡返回持有者手牌。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: {
            sourceCardId: card.gamecardId,
            effectId: 'fufeng_activate'
          }
        };
      },
      onQueryResolve: async (card, gameState, playerState, selections) => {
        const targetId = selections[0];
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_FIELD',
          destinationZone: 'HAND',
          targetFilter: { gamecardId: targetId }
        }, card);

        gameState.logs.push(`${playerState.displayName} 发动了 [歌月拂风]，将一张卡返回手牌。`);
      },
      targetSpec: {
        title: '选择返回手牌的卡',
        description: '选择战场上1张卡返回持有者手牌。',
        minSelections: 1,
        maxSelections: 1,
        zones: ['UNIT', 'ITEM'],
        getCandidates: (gameState, playerState, card) => {
          const isFuhuaPresent = playerState.unitZone.some(c => c && c.specialName === '风花');
          const filter = { onField: true, godMark: isFuhuaPresent ? undefined : false };
          return Object.values(gameState.players)
            .flatMap(player => [...player.unitZone, ...player.itemZone].filter((unit): unit is Card => !!unit && AtomicEffectExecutor.matchesFilter(unit, filter as any, card)))
            .map(card => ({ card, source: card.cardlocation as any }));
        }
      }
    }
  ],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null,
};

export default card;
