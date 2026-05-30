import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allCardsOnField, allUnitsOnField, backErosionCount, createSelectCardQuery, destroyByEffect, ensureData, getOpponentUid, moveTopDeckTo, paymentCost } from './BaseUtil';

const nonGodFieldCards = (gameState: any) => allCardsOnField(gameState).filter(card => !card.godMark);
const hasDrawnByEffectThisTurn = (playerState: any, gameState: any) =>
  Number((playerState as any).drawnByEffectTurn || -1) === gameState.turnCount;

const ohDisabled = (instance: Card) => !!(instance as any).data?.ohEffectDisabledUntilOwnStartUid;

const cardEffects: CardEffect[] = [{
  id: '104000309_draw_effect_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '创痕2：你的回合中，若你由于卡的效果抽过卡，选择战场1张非神蚀卡，破坏。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isGoddessMode &&
    playerState.isTurn &&
    backErosionCount(playerState) >= 2 &&
    hasDrawnByEffectThisTurn(playerState, gameState) &&
    nonGodFieldCards(gameState).length > 0,
  cost: paymentCost(2, 'BLUE'),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodFieldCards(gameState),
      '选择破坏目标',
      '选择战场上的1张非神蚀卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104000309_draw_effect_destroy' },
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
}, {
  id: '104000309_oh_exhaust_mill',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: 'OH：1回合1次，选择战场上1个单位横置，将对手卡组顶2张送入墓地；直到下次你的回合开始失去这个启动能力。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isGoddessMode &&
    !ohDisabled(instance) &&
    allUnitsOnField(gameState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      allUnitsOnField(gameState),
      '选择横置单位',
      '选择战场上的1个单位横置，并将对手卡组顶2张送入墓地。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104000309_oh_exhaust_mill' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择横置单位',
    description: '选择战场上1个单位横置。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    getCandidates: gameState =>
      allUnitsOnField(gameState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && target.cardlocation === 'UNIT' && !target.isExhausted) target.isExhausted = true;
    moveTopDeckTo(gameState, getOpponentUid(gameState, playerState.uid), 2, 'GRAVE', instance);
    const data = ensureData(instance);
    data.ohEffectDisabledUntilOwnStartUid = playerState.uid;
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104000309
 * Card2 Row: 539
 * Card Row: 359
 * Source CardNo: BT07-B06
 * Package: BT07(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕2】【启】〖一回合一次〗{你的回合中，你由于卡的效果抽过卡，选择战场上的1张非神蚀卡}[+2]：将被选择的卡破坏。
 * 【OH】【启】〖一回合一次〗{选择战场上1个单位}：将被选择的单位横置，将对方卡组顶的2张卡送入墓地。直到下一次你的回合开始时为止，失去这个【启】能力。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104000309',
  fullName: '圣神八部「摩呼罗迦」',
  specialName: '摩呼罗迦',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '无',
  acValue: 4,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
