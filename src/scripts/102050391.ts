import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { executePromotionAfterOptionalDiscard, hasPromotionTarget, markCanAttackAnyUnit, wasPlacedByPromotion } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102050391_promotion_attack_units',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '由于晋升进入战场的这个单位可以攻击对手的单位。',
  applyContinuous: (gameState, instance) => {
    if (wasPlacedByPromotion(instance)) markCanAttackAnyUnit(instance, instance);
  }
}, {
  id: '102050391_end_draw_promotion_after_attack',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END' as any,
  triggerLocation: ['UNIT'],
  isMandatory: true,
  description: '这个单位攻击过的回合结束时：抽1张卡。晋升。',
  condition: (_gameState, playerState, instance, event) =>
    event?.type === ('TURN_END' as any) &&
    event.playerUid === playerState.uid &&
    instance.cardlocation === 'UNIT' &&
    !!instance.hasAttackedThisTurn &&
    playerState.deck.length > 0 &&
    hasPromotionTarget(playerState, instance),
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
    await executePromotionAfterOptionalDiscard(gameState, playerState, instance, '102050391_end_draw_promotion_after_attack', {
      skipDiscard: true
    });
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    await executePromotionAfterOptionalDiscard(gameState, playerState, instance, '102050391_end_draw_promotion_after_attack', {
      selections,
      context,
      skipDiscard: true
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050391
 * Card2 Row: 598
 * Card Row: 482
 * Source CardNo: BT08-R05
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:由于晋升进入战场的这个单位可以攻击对手的单位。
 * 【诱】{这个单位攻击过的回合结束时}:抽1张卡。晋升（将这个单位送入墓地。之后，将你的卡组或手牌中的1张ACCESS值比这个单位的ACCESS值多1的单位卡放置到战场上）。
 */
const card: Card = {
  id: '102050391',
  fullName: '伊列宇百剑长',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
  acValue: 4,
  power: 3500,
  basePower: 3500,
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
