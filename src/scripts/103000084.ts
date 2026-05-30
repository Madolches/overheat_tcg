import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  addInfluence,
  addTempKeyword,
  createSelectCardQuery,
  erosionCost,
  getOpponentUid,
  isNonGodUnit,
  moveCard,
  moveCardAsCost,
  ownUnits,
  recordUnitSentFromFieldToGrave
} from './BaseUtil';

const graveEntryCostUnits = (playerState: any) => ownUnits(playerState).filter(isNonGodUnit);

const cardEffects: CardEffect[] = [{
  id: '103000084_grave_entry',
  type: 'ACTIVATE',
  triggerLocation: ['GRAVE'],
  description: '主要阶段，从墓地发动：将你战场上3个非神蚀单位送入墓地作为费用，将此卡放置到战场，本回合获得速攻、歼灭。',
  condition: (gameState, playerState, instance) =>
    gameState.phase === 'MAIN' &&
    playerState.isTurn &&
    instance.cardlocation === 'GRAVE' &&
    ownUnits(playerState).filter(unit => AtomicEffectExecutor.matchesColor(unit, 'GREEN')).length >= 2 &&
    graveEntryCostUnits(playerState).length >= 3,
  cost: async (gameState, playerState, instance) => {
    const candidates = graveEntryCostUnits(playerState);
    if (candidates.length < 3) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择送入墓地的单位',
      '选择你的战场上的3个非神蚀单位送入墓地作为费用。',
      3,
      3,
      {
        sourceCardId: instance.gamecardId,
        effectId: '103000084_grave_entry',
        step: 'SEND_UNITS_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      () => 'UNIT'
    );
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'SEND_UNITS_COST') return;
    const selected = selections
      .map(id => graveEntryCostUnits(playerState).find(unit => unit.gamecardId === id))
      .filter((unit): unit is Card => !!unit);
    if (selected.length !== 3) {
      context.cancelActivation = true;
      return;
    }
    selected.forEach(unit => {
      moveCardAsCost(gameState, playerState.uid, unit, 'GRAVE', instance);
      recordUnitSentFromFieldToGrave(gameState, playerState.uid, unit);
    });
  },
  execute: async (instance, gameState, playerState) => {
    if (instance.cardlocation === 'GRAVE') moveCard(gameState, playerState.uid, instance, 'UNIT', instance);
    addTempKeyword(instance, instance, 'rush');
    addTempKeyword(instance, instance, 'annihilation');
  }
}, {
  id: '103000084_ten_plus_tap',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitGlobal: true,
  erosionTotalLimit: [10, 10],
  description: '10+：游戏1次，侵蚀2：横置对手最多2个非神蚀单位；下次对手回合开始不能重置。',
  cost: erosionCost(2),
  targetSpec: {
    title: '选择横置单位',
    description: '选择对手最多2个非神蚀单位，将其横置。',
    minSelections: 1,
    maxSelections: 2,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) => {
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      return ownUnits(opponent).filter(unit => !unit.godMark).map(card => ({ card, source: 'UNIT' as any }));
    }
  },
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    const candidates = ownUnits(opponent).filter(unit => !unit.godMark);
    if (candidates.length === 0) return;
    const count = Math.min(2, candidates.length);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择横置单位',
      `选择对手的${count}个非神蚀单位，将其横置。`,
      count,
      count,
      { sourceCardId: instance.gamecardId, effectId: '103000084_ten_plus_tap' }
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    Object.values(gameState.players)
      .flatMap(player => ownUnits(player))
      .filter(unit => selections.includes(unit.gamecardId))
      .forEach(unit => {
        unit.isExhausted = true;
        unit.canResetCount = 1;
        addInfluence(unit, instance, '下个重置阶段不能重置');
      });
  }
}];

const card: Card = {
  id: '103000084',
  fullName: '苍穹的飞狮「奇美拉」',
  specialName: '奇美拉',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '无',
  acValue: 3,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  baseIsrush: false,
  isAnnihilation: false,
  baseAnnihilation: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT01',
  uniqueId: null,
};

export default card;
