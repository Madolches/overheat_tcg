import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addContinuousPower, cardsInZones, createSelectCardQuery, faceUpErosion, moveCard, moveCardAsCost, ownUnits } from './BaseUtil';

const isSwordImmortal = (card: Card) =>
  card.fullName.includes('剑仙') || !!card.specialName?.includes('剑仙');

const costCards = (playerState: any) =>
  cardsInZones(playerState, ['UNIT', 'HAND'])
    .filter(({ card }) => isSwordImmortal(card));

const searchCards = (playerState: any) =>
  [
    ...playerState.deck.map((card: Card) => ({ card, source: 'DECK' as const })),
    ...faceUpErosion(playerState).map((card: Card) => ({ card, source: 'EROSION_FRONT' as const }))
  ].filter(({ card }) => isSwordImmortal(card));

const cardEffects: CardEffect[] = [{
  id: '304010068_send_and_search_sword_immortal',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  limitCount: 1,
  description: '1回合1次，主要阶段：将战场上或手牌中1张卡名含有《剑仙》的卡送入墓地，将卡组或正面侵蚀区1张卡名含有《剑仙》的卡加入手牌。',
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    costCards(playerState).length > 0 &&
    searchCards(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costCards(playerState).map(entry => entry.card),
      '选择送入墓地的剑仙卡',
      '选择你战场上或手牌中1张卡名含有《剑仙》的卡送入墓地。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '304010068_send_and_search_sword_immortal', step: 'COST' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'COST') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || !costCards(playerState).some(entry => entry.card.gamecardId === target.gamecardId)) return;
      moveCardAsCost(gameState, playerState.uid, target, 'GRAVE', instance);
      if (searchCards(playerState).length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        searchCards(playerState).map(entry => entry.card),
        '选择加入手牌的剑仙卡',
        '选择你的卡组或正面侵蚀区中1张卡名含有《剑仙》的卡加入手牌。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '304010068_send_and_search_sword_immortal', step: 'SEARCH' },
        card => card.cardlocation as any
      );
      return;
    }

    if (context?.step !== 'SEARCH') return;
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !searchCards(playerState).some(entry => entry.card.gamecardId === target.gamecardId)) return;
    const fromDeck = target.cardlocation === 'DECK';
    moveCard(gameState, playerState.uid, target, 'HAND', instance);
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}, {
  id: '304010068_sword_immortal_power',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  erosionTotalLimit: [1, 4],
  description: '1~4：你战场上的卡名含有《剑仙》的单位力量+500。',
  applyContinuous: (_gameState, instance) => {
    const owner = Object.values((_gameState as any).players)
      .find((player: any) => player.itemZone.some((item: Card | null) => item?.gamecardId === instance.gamecardId)) as any;
    if (!owner) return;
    ownUnits(owner)
      .filter(isSwordImmortal)
      .forEach(unit => addContinuousPower(unit, instance, 500));
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 304010068
 * Card2 Row: 636
 * Card Row: 520
 * Source CardNo: BT08-B10
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗{你的主要阶段}:将你战场上或手牌中1张卡名含有《剑仙》的卡送入墓地，将你的卡组或侵蚀区的正面卡中的1张卡名含有《剑仙》的卡加入手牌。
 * 〖1~4〗【永】:你战场上的卡名含有《剑仙》的单位〖力量+500〗。
 */
const card: Card = {
  id: '304010068',
  fullName: '「东剑仙庄」',
  specialName: '东剑仙庄',
  type: 'ITEM',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '百濑之水城',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
