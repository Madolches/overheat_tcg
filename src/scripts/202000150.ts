import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, allUnitsOnField, canActivateDefaultTiming, createSelectCardQuery, destroyByEffect, discardHandCost } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '202000150_destroy_big',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  erosionBackLimit: [2, 10],
  description: '创痕2：舍弃1张手牌。之后选择1个力量3500以上的单位，将其破坏。',
  cost: discardHandCost(1),
  condition: (gameState, playerState) =>
    canActivateDefaultTiming(gameState, playerState) &&
    allUnitsOnField(gameState).some(unit => (unit.power || 0) >= 3500),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      allUnitsOnField(gameState).filter(unit => (unit.power || 0) >= 3500),
      '选择破坏的单位',
      '选择1个力量3500以上的单位，将其破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '202000150_destroy_big' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT' && (target.power || 0) >= 3500) destroyByEffect(gameState, target, instance);
  },
  targetSpec: {
    title: '选择破坏的单位',
    description: '选择1个力量3500以上的单位，将其破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    getCandidates: gameState => allUnitsOnField(gameState)
      .filter(unit => (unit.power || 0) >= 3500)
      .map(card => ({ card, source: 'UNIT' as any }))
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202000150
 * Card2 Row: 275
 * Card Row: 631
 * Source CardNo: PR01-07R
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕2】:（你的侵蚀区中的背面卡有2张以上时才有效）舍弃1张手牌。之后选择一个〖力量3500〗以上的单位，将其破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202000150',
  fullName: '湖上的死斗',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
