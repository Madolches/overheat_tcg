import { Card, GameState, PlayerState, CardEffect, TriggerLocation, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canActivateDefaultTiming, createSelectCardQuery } from './BaseUtil';

const opponentUnits = (gameState: GameState, playerUid: string) => {
  const opponentId = gameState.playerIds.find(id => id !== playerUid);
  return opponentId
    ? gameState.players[opponentId].unitZone.filter((unit: Card | null): unit is Card => !!unit)
    : [];
};

const effect_104030454_trigger: CardEffect = {
  id: 'sodo_entry_bounce',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EROSION_TO_FIELD',
  isMandatory: false,
  description: '【诱】每回合1次：这个单位从侵蚀区进入战场时，选择对手1个单位，将这个单位横置：将被选择单位返回持有者手牌。',
  limitCount: 1,
  limitNameType: true,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) =>
    event?.type === 'CARD_EROSION_TO_FIELD' &&
    event.sourceCardId === instance.gamecardId &&
    !instance.isExhausted &&
    opponentUnits(gameState, playerState.uid).length > 0,
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      opponentUnits(gameState, playerState.uid),
      '选择回手目标',
      '选择对手的1个单位返回持有者手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: 'sodo_entry_bounce', step: 'BOUNCE_TARGET' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择回手目标',
    description: '选择对手的1个单位返回持有者手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    step: 'BOUNCE_TARGET',
    getCandidates: (gameState, playerState) =>
      opponentUnits(gameState, playerState.uid).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step !== 'BOUNCE_TARGET' || selections.length === 0) return;
    const targetId = selections[0];
    const target = AtomicEffectExecutor.findCardById(gameState, targetId);
    const owner = AtomicEffectExecutor.findCardOwnerKey(gameState, targetId);
    if (!target || !owner || target.cardlocation !== 'UNIT' || owner === playerState.uid) return;

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'ROTATE_HORIZONTAL',
      targetFilter: { gamecardId: instance.gamecardId }
    }, instance);

    await AtomicEffectExecutor.execute(gameState, owner, {
      type: 'MOVE_FROM_FIELD',
      targetFilter: { gamecardId: targetId },
      destinationZone: 'HAND'
    }, instance);
  }
};

const effect_104030454_activate: CardEffect = {
  id: 'sodo_to_erosion',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  description: '【启】若场上存在蓝色单位且你的侵蚀前区没有「索德」，支付0费用：将这张卡从手牌放置到侵蚀前区，并抽1张牌。',
  condition: (gameState: GameState, playerState: PlayerState) => {
    if (!canActivateDefaultTiming(gameState, playerState)) return false;

    const hasBlueUnit = playerState.unitZone.some(unit => unit && AtomicEffectExecutor.matchesColor(unit, 'BLUE'));
    if (!hasBlueUnit) return false;

    const hasSodoOnErosion = playerState.erosionFront.some(card => card && card.fullName.includes('索德'));
    if (hasSodoOnErosion) return false;

    return playerState.erosionFront.some(slot => slot === null);
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_HAND',
      targetFilter: { gamecardId: instance.gamecardId },
      destinationZone: 'EROSION_FRONT'
    }, instance);

    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
};

const card: Card = {
  id: '104030454',
  gamecardId: null as any,
  fullName: '一级冒险家「索德」',
  specialName: '索德',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { 'BLUE': 2 },
  faction: '冒险家公会',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    effect_104030454_trigger,
    effect_104030454_activate
  ],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT04',
  uniqueId: null,
};

export default card;
