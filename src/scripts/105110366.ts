import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addTempDamage, createSelectCardQuery, exhaustCost, nameContains, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105110366_steel_damage',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '你的主要阶段，横置：选择你的1个卡名含有《钢兵》的单位，本回合伤害+2。',
  cost: exhaustCost,
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    !instance.isExhausted &&
    ownUnits(playerState).some(unit => nameContains(unit, '钢兵')),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(unit => nameContains(unit, '钢兵')),
      '选择钢兵单位',
      '选择你的1个卡名含有《钢兵》的单位，本回合伤害+2。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110366_steel_damage' }
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT') addTempDamage(target, instance, 2);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110366
 * Card2 Row: 506
 * Card Row: 439
 * Source CardNo: PR06-03Y
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】{你的主要阶段，选择你的战场上的1个卡名含有《钢兵》的单位}[横置]：本回合中，被选择的单位〖伤害+2〗
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110366',
  fullName: '钢兵督战官',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '学院要塞',
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
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
