import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, discardHandCost, ensureData, getOpponentUid, isNonGodUnit, moveCard, totalErosionCount, wealthCount } from './BaseUtil';

const opponentTargets = (gameState: any, playerUid: string) => {
  const opponentUid = getOpponentUid(gameState, playerUid);
  return gameState.players[opponentUid].unitZone.filter((unit: Card | null): unit is Card =>
    !!unit &&
    isNonGodUnit(unit) &&
    (unit.acValue || 0) <= 3
  );
};

const cardEffects: CardEffect[] = [{
  id: '104020410_wealth_1',
  type: 'CONTINUOUS',
  wealthValue: 0,
  description: '3~6：财富1(只要这个单位在战场上，你获得1个财富指示物)。',
  erosionTotalLimit: [3, 6],
  condition: (_gameState, playerState) =>
    totalErosionCount(playerState) >= 3 &&
    totalErosionCount(playerState) <= 6,
  applyContinuous: (_gameState, instance) => {
    ensureData(instance).wealthValue = 1;
  },
}, {
  id: '104020410_take_opponent_unit',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次，财富3以上，主要阶段，舍弃3张手牌：选择对手战场1个ACCESS值+3以下非神蚀单位加入你的手牌。',
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    wealthCount(playerState, gameState) >= 3 &&
    playerState.hand.length >= 3 &&
    opponentTargets(gameState, playerState.uid).length > 0,
  cost: discardHandCost(3),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      opponentTargets(gameState, playerState.uid),
      '选择加入手牌的单位',
      '选择对手战场上的1个ACCESS值+3以下的非神蚀单位加入你的手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104020410_take_opponent_unit' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择加入手牌的单位',
    description: '选择对手战场上的1个ACCESS值+3以下的非神蚀单位加入你的手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) =>
      opponentTargets(gameState, playerState.uid).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !opponentTargets(gameState, playerState.uid).some(unit => unit.gamecardId === target.gamecardId)) return;
    moveCard(gameState, getOpponentUid(gameState, playerState.uid), target, 'HAND', instance, { toPlayerUid: playerState.uid });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020410
 * Card2 Row: 627
 * Card Row: 511
 * Source CardNo: BT08-B01
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{你的财富指示物有3个以上，你的主要阶段，选择对手战场上1个ACCESS值+3以下的非神蚀单位}[舍弃3张手牌]：将被选择的卡加入你的手牌。
 * 〖3~6〗【永】:财富1(只要这个单位在战场上，你获得1个财富指示物)。
 */
const card: Card = {
  id: '104020410',
  fullName: '「狐族分会长」',
  specialName: '狐族分会长',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '九尾商会联盟',
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
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
