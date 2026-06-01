import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allCardsOnField, backErosionCount, createChoiceQuery, createSelectCardQuery, destroyByEffect, story } from './BaseUtil';

const redLowNonGodFieldCards = (gameState: any) =>
  allCardsOnField(gameState).filter(card =>
    card.color === 'RED' &&
    !card.godMark &&
    (card.acValue || 0) <= 3
  );

const findOpponentRedLowNonGodPlay = (gameState: any, playerUid: string) => {
  for (let index = (gameState.counterStack?.length || 0) - 1; index >= 0; index -= 1) {
    const item = gameState.counterStack[index];
    const card = item?.card as Card | undefined;
    if (
      item?.type === 'PLAY' &&
      item.ownerUid !== playerUid &&
      !item.isNegated &&
      card &&
      card.color === 'RED' &&
      !card.godMark &&
      (card.acValue || 0) <= 3
    ) {
      return item;
    }
  }
  return undefined;
};

const canCounterRedPlay = (gameState: any, playerState: any) =>
  gameState.phase === 'COUNTERING' &&
  backErosionCount(playerState) >= 1 &&
  !!findOpponentRedLowNonGodPlay(gameState, playerState.uid);

const modeOptions = (gameState: any, playerState: any) => {
  const options = [];
  if (redLowNonGodFieldCards(gameState).length > 0) options.push({ id: 'DESTROY', label: '破坏红色卡' });
  if (canCounterRedPlay(gameState, playerState)) options.push({ id: 'COUNTER', label: '反击红色卡' });
  return options;
};

const counterRedPlay = (instance: Card, gameState: any, playerUid: string) => {
  const target = findOpponentRedLowNonGodPlay(gameState, playerUid);
  if (!target) return;
  target.isNegated = true;
  gameState.logs.push(`[${instance.fullName}] 反击了 [${target.card?.fullName || '对手使用的红色卡'}]。`);
};

const cardEffects: CardEffect[] = [story('203000094_silver_music_order', '选择1项：破坏战场1张红色ACCESS值3以下非神蚀卡；或创痕1，在对抗中反击对手使用的红色ACCESS值3以下非神蚀卡。', async (instance, gameState, playerState) => {
  const options = modeOptions(gameState, playerState);
  if (options.length === 0) return;
  if (options.length === 1 && options[0].id === 'COUNTER') {
    counterRedPlay(instance, gameState, playerState.uid);
    return;
  }
  if (options.length === 1 && options[0].id === 'DESTROY') {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      redLowNonGodFieldCards(gameState),
      '选择破坏目标',
      '选择战场上1张红色ACCESS值3以下的非神蚀卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '203000094_silver_music_order', step: 'DESTROY_TARGET' },
      card => card.cardlocation as any
    );
    return;
  }
  createChoiceQuery(
    gameState,
    playerState.uid,
    '选择效果',
    '选择1项效果执行。',
    options,
    { sourceCardId: instance.gamecardId, effectId: '203000094_silver_music_order', step: 'MODE' }
  );
}, {
  condition: (gameState, playerState) =>
    redLowNonGodFieldCards(gameState).length > 0 ||
    canCounterRedPlay(gameState, playerState),
  targetSpec: {
    modeOptions: [{
      id: 'DESTROY',
      label: '破坏红色卡',
      title: '选择破坏目标',
      description: '选择战场上1张红色ACCESS值3以下的非神蚀卡破坏。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT', 'ITEM'],
      controller: 'ANY',
      step: 'DESTROY_TARGET',
      condition: gameState => redLowNonGodFieldCards(gameState).length > 0,
      getCandidates: gameState => redLowNonGodFieldCards(gameState).map(card => ({ card, source: card.cardlocation as any }))
    }, {
      id: 'COUNTER',
      label: '反击红色卡',
      title: '反击红色卡',
      description: '创痕1：对手使用红色ACCESS值3以下的非神蚀卡时，反击那张卡。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: 'COUNTER',
      condition: canCounterRedPlay,
      getCandidates: () => []
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      if (selections[0] === 'COUNTER') {
        counterRedPlay(instance, gameState, playerState.uid);
        return;
      }
      createSelectCardQuery(
        gameState,
        playerState.uid,
        redLowNonGodFieldCards(gameState),
        '选择破坏目标',
        '选择战场上1张红色ACCESS值3以下的非神蚀卡破坏。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '203000094_silver_music_order', step: 'DESTROY_TARGET' },
        card => card.cardlocation as any
      );
      return;
    }

    if (context?.selectedModeId === 'COUNTER' || context?.step === 'COUNTER') {
      counterRedPlay(instance, gameState, playerState.uid);
      return;
    }

    if (context?.selectedModeId === 'DESTROY' || context?.step === 'DESTROY_TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (
        target &&
        ['UNIT', 'ITEM'].includes(target.cardlocation || '') &&
        target.color === 'RED' &&
        !target.godMark &&
        (target.acValue || 0) <= 3
      ) {
        destroyByEffect(gameState, target, instance);
      }
    }
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203000094
 * Card2 Row: 553
 * Card Row: 373
 * Source CardNo: BT07-G09
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择下列的1项效果并执行:
 * ◆将战场上的1张红色的ACCESS值+3以下的非神蚀卡破坏。
 * ◆【创痕1】｛对手使用红色的ACCESS值+3以下的非神蚀卡时｝：反击那张卡。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '203000094',
  fullName: '银乐指令',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
