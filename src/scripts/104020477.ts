import { Card, CardEffect, GameEvent, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { moveCardAsCost } from './BaseUtil';

const blueFaceUpErosionCosts = (playerState: PlayerState) =>
  playerState.erosionFront.filter((card): card is Card =>
    !!card &&
    card.displayState === 'FRONT_UPRIGHT' &&
    AtomicEffectExecutor.matchesColor(card, 'BLUE')
  );

const opponentNonGodUnits = (gameState: GameState, playerState: PlayerState) => {
  const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid);
  if (!opponentId) return [] as Card[];
  return gameState.players[opponentId].unitZone.filter((card): card is Card => !!card && !card.godMark);
};

const trigger_104020477: CardEffect = {
  id: '104020477_trigger',
  type: 'TRIGGER',
  description: '【诱】：这个单位进入战场时，若对手单位比你的单位多2个以上，将你的侵蚀区中的2张蓝色正面卡送入墓地作为费用，选择对手场上的最多2个非神蚀单位返回手牌。',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    const isSelfEntering = event?.type === 'CARD_ENTERED_ZONE' &&
      (event.sourceCardId === instance.gamecardId || event.sourceCard === instance) &&
      event.data?.zone === 'UNIT';
    if (!isSelfEntering) return false;

    const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid);
    if (!opponentId) return false;
    const opponentUnitCount = gameState.players[opponentId].unitZone.filter(Boolean).length;
    const myUnitCount = playerState.unitZone.filter(Boolean).length;

    return opponentUnitCount - myUnitCount >= 2 &&
      blueFaceUpErosionCosts(playerState).length >= 2;
  },
  cost: async (gameState: GameState, playerState: PlayerState, instance: Card) => {
    const costs = blueFaceUpErosionCosts(playerState);
    if (costs.length < 2) return false;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        costs.map(card => ({ card, source: 'EROSION_FRONT' as const }))
      ),
      title: '选择费用',
      description: '选择侵蚀区中的2张蓝色正面卡送入墓地作为费用。',
      minSelections: 2,
      maxSelections: 2,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '104020477_trigger',
        step: 'COST',
        skipEffectResolveAfterCost: true
      }
    };
    return true;
  },
  onCostResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step !== 'COST') return;
    selections.forEach(id => {
      const cost = blueFaceUpErosionCosts(playerState).find(card => card.gamecardId === id);
      if (cost) moveCardAsCost(gameState, playerState.uid, cost, 'GRAVE', instance);
    });
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const targets = opponentNonGodUnits(gameState, playerState);
    if (targets.length === 0) return;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        targets.map(card => ({ card, source: 'UNIT' as const }))
      ),
      title: '选择回手单位',
      description: '选择对手场上的最多2个非神蚀单位返回手牌。',
      minSelections: 0,
      maxSelections: 2,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '104020477_trigger',
        step: 'BOUNCE'
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step !== 'BOUNCE') return;
    const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid);
    if (!opponentId) return;
    for (const targetId of selections) {
      const target = gameState.players[opponentId].unitZone.find(card => card?.gamecardId === targetId && !card.godMark);
      if (!target) continue;
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_FIELD',
        targetFilter: { gamecardId: targetId },
        destinationZone: 'HAND'
      }, instance);
    }
  }
};

const card: Card = {
  id: '104020477',
  fullName: '私服「阿克蒂」',
  specialName: '阿克蒂',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
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
  effects: [trigger_104020477],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null
};

export default card;
