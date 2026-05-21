import { Card, CardEffect } from '../types/game';
import { canActivateDefaultTiming, createPlayerSelectQuery, dealUnpreventableSelfDamage, erosionCost, getOpponentUid } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102000486_unpreventable_damage',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次，侵蚀1：选择1名玩家，给予他1点不能防止的伤害。',
  cost: erosionCost(1),
  condition: (gameState, playerState, instance) =>
    canActivateDefaultTiming(gameState, playerState) &&
    instance.cardlocation === 'UNIT',
  execute: async (instance, gameState, playerState) => {
    createPlayerSelectQuery(
      gameState,
      playerState.uid,
      '选择伤害对象',
      '选择1名玩家，给予他1点不能防止的伤害。',
      { sourceCardId: instance.gamecardId, effectId: '102000486_unpreventable_damage' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const targetUid = selections[0] === 'PLAYER_SELF' ? playerState.uid : getOpponentUid(gameState, playerState.uid);
    dealUnpreventableSelfDamage(gameState, targetUid, 1, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000486
 * Card2 Row: 276
 * Card Row: 632
 * Source CardNo: PR01-08R
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗:[〖侵蚀1〗]选择1名玩家，给予他1点不能防止的伤害。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000486',
  fullName: '破灭的先知「雅各布」',
  specialName: '雅各布',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
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
