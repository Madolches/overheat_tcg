import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, allUnitsOnField, createSelectCardQuery, isNonGodUnit, moveCard, ownerUidOf, paymentCost } from './BaseUtil';

const enteredFromErosionByEffectThisTurn = (gameState: any, instance: Card) => {
  const data = (instance as any).data || {};
  return data.lastMovedByEffectTurn === gameState.turnCount &&
    data.lastMovedToZone === 'UNIT' &&
    (data.lastMovedFromZone === 'EROSION_FRONT' || data.lastMovedFromZone === 'EROSION_BACK');
};

const bounceTargets = (gameState: any) =>
  allUnitsOnField(gameState).filter(unit =>
    isNonGodUnit(unit) &&
    (unit.acValue || 0) <= 3
  );

const cardEffects: CardEffect[] = [{
  id: '104030412_bounce_after_erosion_entry',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次，你的回合中，若这个单位由于卡的效果从侵蚀区进入战场，支付+2：选择战场1个ACCESS值+3以下非神蚀单位返回持有者手牌。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    instance.cardlocation === 'UNIT' &&
    enteredFromErosionByEffectThisTurn(gameState, instance) &&
    bounceTargets(gameState).length > 0,
  cost: paymentCost(2),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      bounceTargets(gameState),
      '选择返回手牌目标',
      '选择战场上的1个ACCESS值+3以下的非神蚀单位返回持有者手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104030412_bounce_after_erosion_entry' },
      card => card.cardlocation as any
    );
  },
  targetSpec: {
    title: '选择返回手牌目标',
    description: '选择战场上的1个ACCESS值3以下的非神蚀单位返回持有者手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState =>
      bounceTargets(gameState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !bounceTargets(gameState).some(unit => unit.gamecardId === target.gamecardId)) return;
    const ownerUid = ownerUidOf(gameState, target);
    if (ownerUid) moveCard(gameState, ownerUid, target, 'HAND', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104030412
 * Card2 Row: 629
 * Card Row: 513
 * Source CardNo: BT08-B03
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{你的回合中，若这个单位由于卡的效果从侵蚀区进入战场，选择战场上的1个ACCESS值+3以下的非神蚀单位}[〖+2〗]:将被选择的单位返回持有者的手牌。
 */
const card: Card = {
  id: '104030412',
  fullName: '青炎破斩「索德」',
  specialName: '索德',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '冒险家公会',
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
