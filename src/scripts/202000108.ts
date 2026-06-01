import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allCardsOnField, backErosionCount, createChoiceQuery, createSelectCardQuery, destroyByEffect, story } from './BaseUtil';

const whiteLowNonGodFieldCards = (gameState: any) =>
  allCardsOnField(gameState).filter(card =>
    card.color === 'WHITE' &&
    !card.godMark &&
    (card.acValue || 0) <= 3
  );

const findOpponentWhiteLowNonGodPlay = (gameState: any, playerUid: string) => {
  for (let index = (gameState.counterStack?.length || 0) - 1; index >= 0; index -= 1) {
    const item = gameState.counterStack[index];
    const card = item?.card as Card | undefined;
    if (
      item?.type === 'PLAY' &&
      item.ownerUid !== playerUid &&
      !item.isNegated &&
      card &&
      card.color === 'WHITE' &&
      !card.godMark &&
      (card.acValue || 0) <= 3
    ) {
      return item;
    }
  }
  return undefined;
};

const canCounterWhitePlay = (gameState: any, playerState: any) =>
  gameState.phase === 'COUNTERING' &&
  backErosionCount(playerState) >= 1 &&
  !!findOpponentWhiteLowNonGodPlay(gameState, playerState.uid);

const modeOptions = (gameState: any, playerState: any) => {
  const options = [];
  if (whiteLowNonGodFieldCards(gameState).length > 0) options.push({ id: 'DESTROY', label: '破坏白色卡' });
  if (canCounterWhitePlay(gameState, playerState)) options.push({ id: 'COUNTER', label: '反击白色卡' });
  return options;
};

const counterWhitePlay = (instance: Card, gameState: any, playerUid: string) => {
  const target = findOpponentWhiteLowNonGodPlay(gameState, playerUid);
  if (!target) return;
  target.isNegated = true;
  gameState.logs.push(`[${instance.fullName}] 反击了 [${target.card?.fullName || '对手使用的白色卡'}]。`);
};

const cardEffects: CardEffect[] = [story('202000108_hiye_order', '选择1项：破坏战场1张白色ACCESS3以下非神蚀卡；或创痕1，在对抗中反击对手使用的白色ACCESS3以下非神蚀卡。', async (instance, gameState, playerState) => {
  const options = modeOptions(gameState, playerState);
  if (options.length === 0) return;
  if (options.length === 1 && options[0].id === 'COUNTER') {
    counterWhitePlay(instance, gameState, playerState.uid);
    return;
  }
  if (options.length === 1 && options[0].id === 'DESTROY') {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      whiteLowNonGodFieldCards(gameState),
      '选择破坏目标',
      '选择战场上的1张白色ACCESS3以下的非神蚀卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '202000108_hiye_order', step: 'DESTROY_TARGET' },
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
    { sourceCardId: instance.gamecardId, effectId: '202000108_hiye_order', step: 'MODE' }
  );
}, {
  condition: (gameState, playerState) =>
    whiteLowNonGodFieldCards(gameState).length > 0 ||
    canCounterWhitePlay(gameState, playerState),
  targetSpec: {
    modeOptions: [{
      id: 'DESTROY',
      label: '破坏白色卡',
      title: '选择破坏目标',
      description: '选择战场上的1张白色ACCESS3以下的非神蚀卡破坏。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT', 'ITEM'],
      controller: 'ANY',
      step: 'DESTROY_TARGET',
      condition: gameState => whiteLowNonGodFieldCards(gameState).length > 0,
      getCandidates: gameState => whiteLowNonGodFieldCards(gameState).map(card => ({ card, source: card.cardlocation as any }))
    }, {
      id: 'COUNTER',
      label: '反击白色卡',
      title: '反击白色卡',
      description: '创痕1：对手使用白色ACCESS3以下的非神蚀卡时，反击那张卡。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: 'COUNTER',
      condition: canCounterWhitePlay,
      getCandidates: () => []
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      if (selections[0] === 'COUNTER') {
        counterWhitePlay(instance, gameState, playerState.uid);
        return;
      }
      createSelectCardQuery(
        gameState,
        playerState.uid,
        whiteLowNonGodFieldCards(gameState),
        '选择破坏目标',
        '选择战场上的1张白色ACCESS3以下的非神蚀卡破坏。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '202000108_hiye_order', step: 'DESTROY_TARGET' },
        card => card.cardlocation as any
      );
      return;
    }

    if (context?.selectedModeId === 'COUNTER' || context?.step === 'COUNTER') {
      counterWhitePlay(instance, gameState, playerState.uid);
      return;
    }

    if (context?.selectedModeId === 'DESTROY' || context?.step === 'DESTROY_TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (
        target &&
        ['UNIT', 'ITEM'].includes(target.cardlocation || '') &&
        target.color === 'WHITE' &&
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
 * Source CardID: 202000108
 * Card2 Row: 564
 * Card Row: 448
 * Source CardNo: BT07-R09
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择下列的1项效果并执行:
 * ◆将战场上的1张白色的ACCESS值+3以下的非神蚀卡破坏。
 * ◆【创痕1】｛对手使用白色的ACCESS值+3以下的非神蚀卡时｝：反击那张卡。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202000108',
  fullName: '绯烨指令',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
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
