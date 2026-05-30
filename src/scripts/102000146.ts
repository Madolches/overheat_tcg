import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, destroyByEffect, erosionCost, faceUpErosion, getOpponentUid, isNonGodUnit, moveCard, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102000146_exile_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '将这个单位放逐并侵蚀1：选择对手1个非神蚀单位破坏。',
  condition: (gameState, playerState, instance) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    return instance.cardlocation === 'UNIT' &&
      faceUpErosion(playerState).length >= 1 &&
      ownUnits(opponent).some(isNonGodUnit);
  },
  cost: async (gameState, playerState, instance) => {
    if (instance.cardlocation === 'UNIT') {
      moveCard(gameState, playerState.uid, instance, 'EXILE', instance);
    }
    return erosionCost(1)(gameState, playerState, instance);
  },
  targetSpec: {
    title: '选择破坏对象',
    description: '选择对手的1个非神蚀单位，将其破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) => {
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      return ownUnits(opponent).filter(isNonGodUnit).map(card => ({ card, source: 'UNIT' as const }));
    }
  },
  execute: async (instance, gameState, playerState, _event, declaredSelections?: string[]) => {
    if (declaredSelections?.length) {
      const target = AtomicEffectExecutor.findCardById(gameState, declaredSelections[0]);
      if (target && target.cardlocation === 'UNIT' && !target.godMark) destroyByEffect(gameState, target, instance);
      return;
    }
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(opponent).filter(isNonGodUnit),
      '选择破坏对象',
      '选择对手的1个非神蚀单位，将其破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102000146_exile_destroy' }
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && target.cardlocation === 'UNIT' && !target.godMark) destroyByEffect(gameState, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000146
 * Card2 Row: 130
 * Card Row: 130
 * Source CardNo: BT02-R07
 * Package: BT02(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗:[将这个单位放逐，侵蚀1]选择对手的1个非神蚀单位，将其破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000146',
  fullName: '徘徊的暗影',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 2,
  power: 500,
  basePower: 500,
  damage: 0,
  baseDamage: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
