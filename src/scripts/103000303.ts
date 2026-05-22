import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canActivateDefaultTiming,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  millTop,
  moveCard,
  moveCardAsCost,
  putUnitOntoField
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

const effect_103000303_hand_search_kuya: CardEffect = {
  id: '103000303_hand_search_kuya',
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
      { sourceCardId: instance.gamecardId, effectId: '103000303_hand_search_kuya', step: 'DISCARD' },
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
        { sourceCardId: instance.gamecardId, effectId: '103000303_hand_search_kuya', step: 'SEARCH' },
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

const effect_103000303_grave_self_put: CardEffect = {
  id: '103000303_grave_self_put',
  type: 'ACTIVATE',
  triggerLocation: ['GRAVE'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：这张卡因卡牌能力费用从手牌进墓的回合中，从墓地发动，将卡组顶1张送墓，之后将这张卡放置到战场。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'GRAVE' &&
    canActivateDefaultTiming(gameState, playerState) &&
    wasDiscardedAsCostFromHandThisTurn(instance, gameState) &&
    playerState.deck.length >= 3 &&
    canPutUnitOntoBattlefield(playerState, instance),
  execute: async (instance, gameState, playerState) => {
    millTop(gameState, playerState.uid, 3, instance);
    putUnitOntoField(gameState, playerState.uid, instance, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000303
 * Card2 Row: 533
 * Card Row: 353
 * Source CardNo: SP03-G05
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{选择下列的一项效果并执行}：
 * ◆{你的主要阶段}[舍弃手牌中的这张卡和另1张卡]：将你卡组中的1张卡名含有《九夜》的卡加入手牌。
 * ◆{只能在这张卡由于卡的能力的费用从手牌送入墓地的回合中从墓地发动}：将你卡组顶的3张卡送入墓地，之后，将墓地中的这张卡放置到战场上。
 */
const card: Card = {
  id: '103000303',
  fullName: '九夜晚宴的兽娘',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 5,
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
  effects: [effect_103000303_hand_search_kuya, effect_103000303_grave_self_put],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
