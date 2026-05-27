import { Card, CardEffect } from '../types/game';
import { createSelectCardQuery, ownUnits, readyByEffect, story } from './BaseUtil';

const ownNonGodUnits = (playerState: any) =>
  ownUnits(playerState).filter(unit => !unit.godMark);

const cardEffects: CardEffect[] = [story('201000121_ready_on_opponent_attack', '对手的单位宣言攻击时，选择你战场上的1个非神蚀单位重置。', async (instance, gameState, playerState) => {
  createSelectCardQuery(
    gameState,
    playerState.uid,
    ownNonGodUnits(playerState),
    '选择重置单位',
    '选择你战场上的1个非神蚀单位，将其重置。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '201000121_ready_on_opponent_attack' },
    () => 'UNIT'
  );
}, {
  condition: (gameState, playerState) =>
    gameState.phase === 'COUNTERING' &&
    gameState.counterStack?.some((item: any) => item.type === 'ATTACK' && item.ownerUid !== playerState.uid && !item.isNegated) &&
    ownNonGodUnits(playerState).length > 0,
  targetSpec: {
    title: '选择重置单位',
    description: '选择你战场上的1个非神蚀单位，将其重置。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      ownNonGodUnits(playerState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = ownNonGodUnits(playerState).find(unit => unit.gamecardId === selections[0]);
    if (target) readyByEffect(gameState, target, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000121
 * Card2 Row: 613
 * Card Row: 497
 * Source CardNo: BT08-W09
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * {对手的单位宣言攻击时，选择你战场上的1个非神蚀单位}:将被选择的单位〖重置〗。
 */
const card: Card = {
  id: '201000121',
  fullName: '敲响警钟',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '无',
  acValue: 1,
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
