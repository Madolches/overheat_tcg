import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  allCardsOnField,
  canActivateDefaultTiming,
  createSelectCardQuery,
  destroyByEffect,
  moveCard,
  moveCardAsCost,
  paymentCost
} from './BaseUtil';

const isKuyaCard = (card: Card) =>
  card.fullName.includes('九夜') || !!card.specialName?.includes('九夜');

const wasDiscardedAsCostFromHandThisTurn = (card: Card, gameState: any) => {
  const data = (card as any).data || {};
  return card.cardlocation === 'GRAVE' &&
    data.lastMovedAsCostTurn === gameState.turnCount &&
    data.lastMovedFromZone === 'HAND' &&
    data.lastMovedToZone === 'GRAVE';
};

const isAccessThreeNonGodUnit = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  Number(card.acValue || 0) === 3;

const effect_102000288_hand_search_kuya: CardEffect = {
  id: '102000288_hand_search_kuya',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：主要阶段，舍弃手牌中的这张卡和另1张卡，将卡组1张《九夜》卡加入手牌。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'HAND' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    playerState.hand.some((card: Card) => card.gamecardId !== instance.gamecardId) &&
    playerState.deck.some(isKuyaCard),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId),
      '舍弃另一张手牌',
      '舍弃手牌中的这张卡和另1张卡作为费用。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102000288_hand_search_kuya', step: 'DISCARD' },
      () => 'HAND'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'DISCARD') {
      const other = selections[0] ? playerState.hand.find((card: Card) => card.gamecardId === selections[0]) : undefined;
      if (!other || instance.cardlocation !== 'HAND') return;
      moveCardAsCost(gameState, playerState.uid, instance, 'GRAVE', instance);
      moveCardAsCost(gameState, playerState.uid, other, 'GRAVE', instance);
      createSelectCardQuery(
        gameState,
        playerState.uid,
        playerState.deck.filter(isKuyaCard),
        '选择九夜卡',
        '选择卡组中的1张卡名含有《九夜》的卡加入手牌。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '102000288_hand_search_kuya', step: 'SEARCH' },
        () => 'DECK'
      );
      return;
    }

    if (context?.step !== 'SEARCH') return;
    const target = selections[0] ? playerState.deck.find((card: Card) => card.gamecardId === selections[0] && isKuyaCard(card)) : undefined;
    if (target) {
      moveCard(gameState, playerState.uid, target, 'HAND', instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
};

const effect_102000288_grave_destroy_access_three: CardEffect = {
  id: '102000288_grave_destroy_access_three',
  type: 'ACTIVATE',
  triggerLocation: ['GRAVE'],
  limitCount: 1,
  limitNameType: true,
  cost: paymentCost(2),
  description: '同名1回合1次：这张卡作为卡牌能力费用从手牌送墓的回合，从墓地选择战场上1个ACCESS值3的非神蚀单位破坏。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'GRAVE' &&
    canActivateDefaultTiming(gameState, playerState) &&
    wasDiscardedAsCostFromHandThisTurn(instance, gameState) &&
    allCardsOnField(gameState).some(isAccessThreeNonGodUnit),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      allCardsOnField(gameState).filter(isAccessThreeNonGodUnit),
      '选择破坏目标',
      '选择战场上的1个ACCESS值3的非神蚀单位破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102000288_grave_destroy_access_three' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择破坏目标',
    description: '选择战场上的1个ACCESS值+3的非神蚀单位破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState =>
      allCardsOnField(gameState)
        .filter(isAccessThreeNonGodUnit)
        .map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && isAccessThreeNonGodUnit(target) && target.cardlocation === 'UNIT') {
      destroyByEffect(gameState, target, instance);
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000288
 * Card2 Row: 513
 * Card Row: 336
 * Source CardNo: SP03-R01
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{选择下列的一项效果并执行}：
 * ◆{你的主要阶段}[舍弃手牌中的这张卡和另1张卡]：将你卡组中的1张卡名含有《九夜》的卡加入手牌。
 * ◆{只能在这张卡由于卡的能力的费用从手牌送入墓地的回合中从墓地发动。选择战场上的1个ACCESS值+3的非神蚀单位}[+2]：将被选择的单位破坏。
 */
const card: Card = {
  id: '102000288',
  fullName: '九夜寒露',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 2,
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
  effects: [effect_102000288_hand_search_kuya, effect_102000288_grave_destroy_access_three],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
