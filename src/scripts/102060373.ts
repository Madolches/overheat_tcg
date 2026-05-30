import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addContinuousKeyword,
  addContinuousPower,
  addInfluence,
  allCardsOnField,
  createSelectCardQuery,
  destroyByEffect,
  markCanAttackAnyUnit,
  ownUnits,
  totalUnitsSentFromFieldToGraveThisTurn
} from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102060373_units_to_grave_thresholds',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '根据本回合中从战场送入墓地的单位数量，依次获得力量加成、速攻/英勇/神依、攻击单位能力。',
  applyContinuous: (gameState, instance) => {
    const owner = Object.values(gameState.players).find(player =>
      player.unitZone.some(unit => unit?.gamecardId === instance.gamecardId)
    );
    if (!owner) return;
    const count = totalUnitsSentFromFieldToGraveThisTurn(gameState);
    addInfluence(instance, instance, `本回合从战场送入墓地的单位数量：${count}`);

    if (count >= 1) {
      ownUnits(owner).forEach(unit => addContinuousPower(unit, instance, 1000));
    }
    if (count >= 2) {
      addContinuousKeyword(instance, instance, 'rush');
      addContinuousKeyword(instance, instance, 'heroic');
      instance.isShenyi = true;
      addInfluence(instance, instance, '获得【神依】');
    }
    if (count >= 4) {
      ownUnits(owner).forEach(unit => markCanAttackAnyUnit(unit, instance));
    }
  }
}, {
  id: '102060373_six_destroy_card',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitGlobal: true,
  description: '游戏1次：本回合从战场送入墓地的单位达到6个后，选择战场上1张卡破坏。',
  condition: (gameState, _playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    totalUnitsSentFromFieldToGraveThisTurn(gameState) >= 6 &&
    allCardsOnField(gameState).length > 0,
  targetSpec: {
    title: '选择破坏目标',
    description: '选择战场上的1张卡破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'ANY',
    getCandidates: gameState => allCardsOnField(gameState).map(card => ({ card, source: card.cardlocation as any }))
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      allCardsOnField(gameState),
      '选择破坏目标',
      '选择战场上的1张卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102060373_six_destroy_card' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && ['UNIT', 'ITEM'].includes(target.cardlocation || '')) {
      destroyByEffect(gameState, target, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102060373
 * Card2 Row: 566
 * Card Row: 450
 * Source CardNo: BT07-R11
 * Package: BT07(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】根据本回合中从战场上送入墓地的单位的数量，这个单位获得以下能力：
 * ◆1个：“【永】：你的战场上的所有单位〖力量+1000〗。”
 * ◆2个：“【永】：这个单位获得【速攻】【英勇】【神依】。”
 * ◆4个：“【永】：你的单位可以攻击对手的单位。”
 * ◆6个：“【启】〖1游戏1次〗{选择战场上的1张卡}：将被选择的卡破坏。”
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102060373',
  fullName: '炎雷之舞「塔米」',
  specialName: '塔米',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '雷霆',
  acValue: 5,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  baseIsrush: false,
  isHeroic: false,
  baseHeroic: false,
  isShenyi: false,
  baseShenyi: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
