import { Card, CardEffect } from '../types/game';
import { allUnitsOnField, createSelectCardQuery, freezeUntil, story } from './BaseUtil';

const nonGodUnitTargets = (gameState: any) =>
  allUnitsOnField(gameState).filter(unit => !unit.godMark);

const cardEffects: CardEffect[] = [story('201150120_freeze_non_god_unit', '选择战场上的1个非神蚀单位，本回合中将其冻结。', async (instance, gameState, playerState) => {
  createSelectCardQuery(
    gameState,
    playerState.uid,
    nonGodUnitTargets(gameState),
    '选择冻结单位',
    '选择战场上的1个非神蚀单位，本回合中将其冻结。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '201150120_freeze_non_god_unit' },
    () => 'UNIT'
  );
}, {
  condition: gameState => nonGodUnitTargets(gameState).length > 0,
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = nonGodUnitTargets(gameState).find(unit => unit.gamecardId === selections[0]);
    if (target) freezeUntil(target, instance, gameState.turnCount);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201150120
 * Card2 Row: 612
 * Card Row: 496
 * Source CardNo: BT08-W08
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * {选择战场上的1个非神蚀单位}:本回合中，将其冻结（不能发动能力，不能宣言攻击和防御，也不会被破坏）。
 */
const card: Card = {
  id: '201150120',
  fullName: '风雪',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '仙雪原',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
