import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, allCardsOnField, createSelectCardQuery, destroyByEffect, moveRandomGraveToDeckBottom, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('201000086_destroy_recover', '选择战场上的1张非神蚀道具卡破坏。之后恢复2。', async (instance, gameState, playerState) => {
  const targets = allCardsOnField(gameState).filter(card => card.type === 'ITEM' && !card.godMark);
  createSelectCardQuery(
    gameState,
    playerState.uid,
    targets,
    '选择道具卡',
    '选择战场上的1张非神蚀道具卡破坏。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '201000086_destroy_recover' },
    card => card.cardlocation as any
  );
}, {
  condition: gameState => allCardsOnField(gameState).some(card => card.type === 'ITEM' && !card.godMark),
  targetSpec: {
    title: '选择道具卡',
    description: '选择战场上的1张非神蚀道具卡破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['ITEM'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState =>
      allCardsOnField(gameState)
        .filter(card => card.type === 'ITEM' && !card.godMark)
        .map(card => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.type !== 'ITEM' || target.godMark || !destroyByEffect(gameState, target, instance)) return;
    moveRandomGraveToDeckBottom(gameState, playerState.uid, 2, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000086
 * Card2 Row: 405
 * Card Row: 275
 * Source CardNo: BT05-W09
 * Package: BT05(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * {选择战场上的1张非神蚀道具卡}:将被选择的卡破坏。之后，恢复2（随机将你的墓地中的2张卡，将其放置到你的卡组底）。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201000086',
  fullName: '粉碎',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '无',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
