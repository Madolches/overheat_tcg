import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allUnitsOnField, canActivateDefaultTiming, createSelectCardQuery, moveCard, ownerUidOf } from './BaseUtil';

const frozenNonGodUnits = (gameState: any) =>
  allUnitsOnField(gameState).filter(unit =>
    !unit.godMark &&
    (unit as any).data?.freezeUntilTurn !== undefined &&
    (unit as any).data.freezeUntilTurn >= gameState.turnCount
  );

const cardEffects: CardEffect[] = [{
  id: '101150401_send_frozen_non_god_to_grave',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：将战场上的1个被冻结的非神蚀单位送入墓地。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    frozenNonGodUnits(gameState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      frozenNonGodUnits(gameState),
      '选择冻结单位',
      '选择战场上的1个被冻结的非神蚀单位，将其送入墓地。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101150401_send_frozen_non_god_to_grave' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    const targetOwnerUid = target ? ownerUidOf(gameState, target) : undefined;
    if (!target || !targetOwnerUid || target.godMark || !frozenNonGodUnits(gameState).some(unit => unit.gamecardId === target.gamecardId)) return;
    moveCard(gameState, targetOwnerUid, target, 'GRAVE', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101150401
 * Card2 Row: 615
 * Card Row: 499
 * Source CardNo: BT08-W11
 * Package: BT08(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗:将战场上的1个被冻结的非神蚀单位送入墓地。
 */
const card: Card = {
  id: '101150401',
  fullName: '圣雪「妮可拉丝」',
  specialName: '妮可拉丝',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '仙雪原',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
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
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
