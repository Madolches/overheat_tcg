import { Card, CardEffect } from '../types/game';
import {
  allCardsOnField,
  canActivateDefaultTiming,
  createSelectCardQuery,
  destroyByEffect,
  executePromotionAfterOptionalDiscard,
  hasPromotionTarget,
  isNonGodFieldCard,
  isSameFactionCard,
  paymentCost,
  sameFactionHandCards,
  wasPlacedByPromotionThisTurn
} from './BaseUtil';

const nonGodTargets = (gameState: any) => allCardsOnField(gameState).filter(isNonGodFieldCard);

const cardEffects: CardEffect[] = [{
  id: '102050389_turn_start_promotion',
  type: 'TRIGGER',
  triggerEvent: 'PHASE_CHANGED',
  triggerLocation: ['UNIT'],
  isMandatory: false,
  description: '你的回合开始时，舍弃1张同势力手牌：晋升。',
  condition: (gameState, playerState, instance, event) =>
    event?.type === 'PHASE_CHANGED' &&
    event.data?.phase === 'START' &&
    playerState.isTurn &&
    instance.cardlocation === 'UNIT' &&
    sameFactionHandCards(playerState, instance).length > 0 &&
    hasPromotionTarget(playerState, instance),
  execute: async (instance, gameState, playerState) => {
    await executePromotionAfterOptionalDiscard(gameState, playerState, instance, '102050389_turn_start_promotion', {
      discardPredicate: card => isSameFactionCard(card, instance)
    });
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    await executePromotionAfterOptionalDiscard(gameState, playerState, instance, '102050389_turn_start_promotion', {
      selections,
      context,
      discardPredicate: card => isSameFactionCard(card, instance)
    });
  }
}, {
  id: '102050389_promotion_destroy_non_god',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  playCost: 2,
  description: '1回合1次：这个单位由于晋升进入战场的回合中，支付2费，选择战场上1张非神蚀卡破坏。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    wasPlacedByPromotionThisTurn(gameState, instance) &&
    nonGodTargets(gameState).length > 0,
  cost: paymentCost(2, 'RED'),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodTargets(gameState),
      '选择破坏目标',
      '选择战场上1张非神蚀卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050389_promotion_destroy_non_god' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? nonGodTargets(gameState).find(card => card.gamecardId === selections[0]) : undefined;
    if (target) destroyByEffect(gameState, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050389
 * Card2 Row: 596
 * Card Row: 479
 * Source CardNo: BT08-R03
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{你的回合开始时}[舍弃1张<伊列宇王国>的手牌]:晋升（将这个单位送入墓地。之后，将你的卡组或手牌中的1张ACCESS值比这个单位的ACCESS值多1的单位卡放置到战场上）。
 * 【启】〖1回合1次〗{这个单位由于晋升进入战场的回合中，选择战场上的1张非神蚀卡}[〖+2〗]:将被选择的卡破坏。
 */
const card: Card = {
  id: '102050389',
  fullName: '战场的红蔷薇',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
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
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
