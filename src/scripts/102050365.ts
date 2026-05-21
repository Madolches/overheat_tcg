import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, forbidAttackAndDefenseContinuous, isNonGodFieldCard, moveCardAsCost } from './BaseUtil';

const costCandidates = (playerState: any, instance: Card) =>
  [
    ...playerState.unitZone.filter((card: Card | null): card is Card => !!card),
    ...playerState.itemZone.filter((card: Card | null): card is Card => !!card),
  ].filter(card => card.gamecardId !== instance.gamecardId && isNonGodFieldCard(card));

const cardEffects: CardEffect[] = [{
  id: '102050365_caged_continuous',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '这张卡不能宣言攻击或防御，不会成为卡牌效果对象。',
  applyContinuous: (gameState, instance) => {
    if ((instance as any).data?.celiaContinuousDisabledTurn === gameState.turnCount) return;
    forbidAttackAndDefenseContinuous(instance, instance);
    (instance as any).cannotBeEffectTargetByEffect = true;
  }
}, {
  id: '102050365_disable_continuous',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '回合1次：将己方战场上1张非神蚀卡送入墓地。本回合中，这张卡所有持续能力无效。',
  condition: (_gameState, playerState, instance) => costCandidates(playerState, instance).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costCandidates(playerState, instance),
      '选择费用',
      '选择己方战场上1张非神蚀卡送入墓地。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050365_disable_continuous' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !costCandidates(playerState, instance).some(card => card.gamecardId === target.gamecardId)) return;
    moveCardAsCost(gameState, playerState.uid, target, 'GRAVE', instance);
    (instance as any).data = {
      ...((instance as any).data || {}),
      celiaContinuousDisabledTurn: gameState.turnCount
    };
  }
}];

const card: Card = {
  id: '102050365',
  fullName: '笼中之鸟「赛利亚」',
  specialName: '赛利亚',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
  acValue: 2,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
