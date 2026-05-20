import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, allCardsOnField, destroyByEffect, enteredFromHand, ownItems } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105000491_destroy_items',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  description: '从手牌进入战场时，破坏战场上所有道具。若破坏3张以上，可以选择战场1张卡破坏。',
  condition: (_gameState, _playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    enteredFromHand(instance, event),
  execute: async (instance, gameState, playerState) => {
    const items = Object.values(gameState.players).flatMap(player => ownItems(player));
    items.forEach(item => destroyByEffect(gameState, item, instance));
    if (items.length < 3) return;
    const targets = allCardsOnField(gameState).filter(card => card.gamecardId !== instance.gamecardId);
    if (targets.length === 0) return;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, targets.map(card => ({ card, source: card.cardlocation as any }))),
      title: '选择破坏的卡',
      description: '破坏的道具卡有3张以上。你可以选择战场上的1张卡，将其破坏。',
      minSelections: 0,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: { sourceCardId: instance.gamecardId, effectId: '105000491_destroy_items' }
    };
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && (target.cardlocation === 'UNIT' || target.cardlocation === 'ITEM')) destroyByEffect(gameState, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000491
 * Card2 Row: 281
 * Card Row: 637
 * Source CardNo: PR02-05Y
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【神依】（〖1回合1次〗你进入女神化状态时，将这个单位〖重置〗。）
 * 【诱】:这个单位从手牌进入战场时，将战场上的所有道具卡破坏。若破坏的道具卡有3张以上，你可以选择战场上的1张卡，将其破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000491',
  fullName: '金漠霸者「纳·塞尔」',
  specialName: '纳·塞尔',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isShenyi: true,
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
