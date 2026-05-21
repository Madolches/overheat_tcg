import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, destroyByEffect, getOpponentUid, isNonGodUnit, markCannotExhaustContinuous, millTop, ownerUidOf } from './BaseUtil';

const opponentNonGodUnits = (gameState: any, playerUid: string) =>
  gameState.players[getOpponentUid(gameState, playerUid)].unitZone
    .filter((unit: Card | null): unit is Card => !!unit && isNonGodUnit(unit));

const cardEffects: CardEffect[] = [{
  id: '302050056_enter_lock_unit',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  description: '这张卡进入战场时，选择对手场上1个非神蚀单位。只要这张卡在战场上，被选择单位不能横置。',
  condition: (gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'ITEM' &&
    opponentNonGodUnits(gameState, playerState.uid).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      opponentNonGodUnits(gameState, playerState.uid),
      '选择禁足目标',
      '选择对手场上1个非神蚀单位。只要这张卡在战场上，被选择单位不能横置。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '302050056_enter_lock_unit' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, _gameState, _playerState, selections) => {
    (instance as any).data = {
      ...((instance as any).data || {}),
      lockedUnitId: selections[0]
    };
  }
}, {
  id: '302050056_lock_continuous',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '被这张卡选择的单位不能横置。',
  applyContinuous: (gameState, instance) => {
    const targetId = (instance as any).data?.lockedUnitId;
    const target = targetId ? AtomicEffectExecutor.findCardById(gameState, targetId) : undefined;
    if (target?.cardlocation === 'UNIT') markCannotExhaustContinuous(target, instance);
  }
}, {
  id: '302050056_opponent_break',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  description: '对手的主要阶段，对手可以将自己卡组顶3张送入墓地：破坏这张卡。',
  condition: (gameState, playerState, instance) => {
    const ownerUid = ownerUidOf(gameState, instance);
    return !!ownerUid &&
      playerState.uid !== ownerUid &&
      playerState.isTurn &&
      gameState.phase === 'MAIN' &&
      playerState.deck.length >= 3;
  },
  cost: async (gameState, playerState, instance) => {
    millTop(gameState, playerState.uid, 3, instance);
    return true;
  },
  execute: async (instance, gameState) => {
    const ownerUid = ownerUidOf(gameState, instance);
    if (ownerUid) destroyByEffect(gameState, instance, instance);
  }
}];

(cardEffects[2] as any).canBeActivatedByOpponent = true;

const card: Card = {
  id: '302050056',
  fullName: '「禁足」',
  specialName: '禁足',
  type: 'ITEM',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
