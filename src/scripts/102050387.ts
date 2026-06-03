import { Card, CardEffect } from '../types/game';
import { createSelectCardQuery, executePromotionAfterOptionalDiscard, hasPromotionTarget, isSameFactionCard, sameFactionHandCards } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102050387_turn_start_promotion',
  type: 'TRIGGER',
  triggerEvent: 'PHASE_CHANGED',
  triggerLocation: ['UNIT'],
  isMandatory: true,
  description: '你的回合开始时，舍弃1张<伊列宇王国>手牌：晋升。',
  condition: (gameState, playerState, instance, event) =>
    event?.type === 'PHASE_CHANGED' &&
    event.data?.phase === 'START' &&
    playerState.isTurn &&
    instance.cardlocation === 'UNIT' &&
    sameFactionHandCards(playerState, instance).length > 0 &&
    hasPromotionTarget(playerState, instance),
  cost: async (gameState, playerState, instance) => {
    const costs = sameFactionHandCards(playerState, instance);
    if (costs.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costs,
      '选择晋升费用',
      '舍弃1张同势力手牌以进行晋升。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '102050387_turn_start_promotion',
        costType: 'DISCARD_HAND_COST',
        discardCostAmount: 1,
        skipEffectResolveAfterCost: true
      },
      () => 'HAND'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    await executePromotionAfterOptionalDiscard(gameState, playerState, instance, '102050387_turn_start_promotion', {
      discardPredicate: card => isSameFactionCard(card, instance),
      skipDiscard: true
    });
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    await executePromotionAfterOptionalDiscard(gameState, playerState, instance, '102050387_turn_start_promotion', {
      selections,
      context,
      discardPredicate: card => isSameFactionCard(card, instance)
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050387
 * Card2 Row: 594
 * Card Row: 477
 * Source CardNo: BT08-R01
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{你的回合开始时}[舍弃1张<伊列宇王国>的手牌]:晋升（将这个单位送入墓地。之后，将你的卡组或手牌中的1张ACCESS值比这个单位的ACCESS值多1的单位卡放置到战场上）。
 */
const card: Card = {
  id: '102050387',
  fullName: '新人女兵',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '伊列宇王国',
  acValue: 2,
  baseAcValue: 2,
  power: 1500,
  basePower: 1500,
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
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
