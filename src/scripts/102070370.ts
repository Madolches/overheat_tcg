import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allCardsOnField, createSelectCardQuery, destroyByEffect, paymentCost } from './BaseUtil';

const nonGodFieldCards = (gameState: any) =>
  allCardsOnField(gameState).filter(card => !card.godMark);

const cardEffects: CardEffect[] = [{
  id: '102070370_entry_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  cost: paymentCost(2),
  description: '同名1回合1次：这个单位进入战场的回合中，支付AC+2，选择战场上1张非神蚀卡破坏。',
  condition: (gameState, _playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    instance.playedTurn === gameState.turnCount &&
    nonGodFieldCards(gameState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodFieldCards(gameState),
      '选择破坏目标',
      '选择战场上的1张非神蚀卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102070370_entry_destroy' },
      card => card.cardlocation as any
    );
  },
  targetSpec: {
    title: '选择破坏目标',
    description: '选择战场上的1张非神蚀卡破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'ANY',
    getCandidates: gameState =>
      nonGodFieldCards(gameState).map(card => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && ['UNIT', 'ITEM'].includes(target.cardlocation || '') && !target.godMark) {
      destroyByEffect(gameState, target, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102070370
 * Card2 Row: 560
 * Card Row: 444
 * Source CardNo: BT07-R05
 * Package: BT07(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{这个单位进入战场的回合中，选择战场上的1张非神蚀卡}[AC+2]：将被选择的卡破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102070370',
  fullName: '「嗜血蝠魔」',
  specialName: '嗜血蝠魔',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '忒碧拉之门',
  acValue: 3,
  power: 3500,
  basePower: 3500,
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
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
