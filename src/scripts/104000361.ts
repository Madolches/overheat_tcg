import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createPlayerSelectQuery, discardHandCost, getOpponentUid, isFeijingCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '104000361_draw_two',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '选择一名玩家，舍弃1张菲晶手牌：被选择的玩家抽2张卡。',
  condition: (_gameState, playerState, instance) =>
    playerState.hand.some(card => card.gamecardId !== instance.gamecardId && isFeijingCard(card)),
  cost: discardHandCost(1, isFeijingCard),
  execute: async (instance, gameState, playerState) => {
    createPlayerSelectQuery(
      gameState,
      playerState.uid,
      '选择玩家',
      '选择一名玩家抽2张卡。',
      { sourceCardId: instance.gamecardId, effectId: '104000361_draw_two' },
      { includeSelf: true, includeOpponent: true }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const targetUid = selections[0] === 'PLAYER_SELF'
      ? playerState.uid
      : getOpponentUid(gameState, playerState.uid);
    await AtomicEffectExecutor.execute(gameState, targetUid, { type: 'DRAW', value: 2 }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104000361
 * Card2 Row: 466
 * Card Row: 433
 * Source CardNo: BT06-B07
 * Package: BT06(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{选择一名玩家}（舍弃手牌中1张具有【菲晶】的卡）：被选择的玩家抽2张卡
 */
const card: Card = {
  id: '104000361',
  fullName: '晶矿贩子',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 1,
  power: 1000,
  basePower: 1000,
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
