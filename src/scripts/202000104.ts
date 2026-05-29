import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, getOpponentUid, isNonGodUnit, moveCard } from './BaseUtil';

const opponentNonGodUnits = (gameState: any, playerUid: string) =>
  gameState.players[getOpponentUid(gameState, playerUid)].unitZone
    .filter((unit: Card | null): unit is Card => !!unit && isNonGodUnit(unit));

const cardEffects: CardEffect[] = [{
  id: '202000104_track_attack_target',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：你的主要阶段，选择对手战场上的1个非神蚀单位。本回合中，你战场上的单位可以攻击被选择的单位。将这张卡放逐。',
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    opponentNonGodUnits(gameState, playerState.uid).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      opponentNonGodUnits(gameState, playerState.uid),
      '选择攻击目标',
      '选择对手战场上的1个非神蚀单位。本回合中，你的单位可以攻击该单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '202000104_track_attack_target' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择攻击目标',
    description: '选择对手战场上的1个非神蚀单位，本回合中你的单位可以攻击被选择的单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) =>
      opponentNonGodUnits(gameState, playerState.uid).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = opponentNonGodUnits(gameState, playerState.uid).find(unit => unit.gamecardId === selections[0]);
    if (!target) return;
    playerState.markedUnitAttackTarget = target.gamecardId;
    const liveStory = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (liveStory?.cardlocation === 'PLAY' || liveStory?.cardlocation === 'GRAVE') {
      moveCard(gameState, playerState.uid, liveStory, 'EXILE', instance);
    }
  }
}];

const card: Card = {
  id: '202000104',
  fullName: '追迹',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
