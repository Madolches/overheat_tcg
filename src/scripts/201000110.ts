import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allCardsOnField, backErosionCount, createChoiceQuery, createSelectCardQuery, destroyByEffect, story } from './BaseUtil';

const blueLowNonGodFieldCards = (gameState: any) =>
  allCardsOnField(gameState).filter(card =>
    card.color === 'BLUE' &&
    !card.godMark &&
    (card.acValue || 0) <= 3
  );

const findOpponentBlueLowNonGodPlay = (gameState: any, playerUid: string) => {
  for (let index = (gameState.counterStack?.length || 0) - 1; index >= 0; index -= 1) {
    const item = gameState.counterStack[index];
    const card = item?.card as Card | undefined;
    const owner = item?.ownerUid ? gameState.players[item.ownerUid] as any : undefined;
    if (
      item?.type === 'PLAY' &&
      item.ownerUid !== playerUid &&
      !item.isNegated &&
      owner?.uncounterableActionsTurn !== gameState.turnCount &&
      owner?.cardEffectsCannotBeNegatedTurn !== gameState.turnCount &&
      card &&
      card.color === 'BLUE' &&
      !card.godMark &&
      (card.acValue || 0) <= 3
    ) {
      return item;
    }
  }
  return undefined;
};

const canCounterBluePlay = (gameState: any, playerState: any) =>
  gameState.phase === 'COUNTERING' &&
  backErosionCount(playerState) >= 1 &&
  !!findOpponentBlueLowNonGodPlay(gameState, playerState.uid);

const modeOptions = (gameState: any, playerState: any) => {
  const options = [];
  if (blueLowNonGodFieldCards(gameState).length > 0) options.push({ id: 'DESTROY', label: '破坏蓝色卡' });
  if (canCounterBluePlay(gameState, playerState)) options.push({ id: 'COUNTER', label: '反击蓝色卡' });
  return options;
};

const counterBluePlay = (instance: Card, gameState: any, playerUid: string) => {
  const target = findOpponentBlueLowNonGodPlay(gameState, playerUid);
  if (!target) return;
  target.isNegated = true;
  gameState.logs.push(`[${instance.fullName}] 反击了 [${target.card?.fullName || '对手使用的蓝色卡'}]。`);
};

const cardEffects: CardEffect[] = [story('201000110_temple_order', '选择1项：破坏战场上1张蓝色ACCESS值+3以下的非神蚀卡；或创痕1，在对抗中反击对手使用的蓝色ACCESS值+3以下的非神蚀卡。', async (instance, gameState, playerState) => {
  const options = modeOptions(gameState, playerState);
  if (options.length === 0) return;
  if (options.length === 1 && options[0].id === 'COUNTER') {
    counterBluePlay(instance, gameState, playerState.uid);
    return;
  }
  if (options.length === 1 && options[0].id === 'DESTROY') {
    const targets = blueLowNonGodFieldCards(gameState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择破坏目标',
      '选择战场上1张蓝色ACCESS值+3以下的非神蚀卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '201000110_temple_order', step: 'DESTROY_TARGET' },
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
    { sourceCardId: instance.gamecardId, effectId: '201000110_temple_order', step: 'MODE' }
  );
}, {
  condition: (gameState, playerState) =>
    blueLowNonGodFieldCards(gameState).length > 0 ||
    canCounterBluePlay(gameState, playerState),
  targetSpec: {
    modeOptions: [{
      id: 'DESTROY',
      label: '破坏蓝色卡',
      title: '选择破坏目标',
      description: '选择战场上1张蓝色ACCESS值+3以下的非神蚀卡破坏。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT', 'ITEM'],
      controller: 'ANY',
      step: 'DESTROY_TARGET',
      condition: gameState => blueLowNonGodFieldCards(gameState).length > 0,
      getCandidates: gameState => blueLowNonGodFieldCards(gameState).map(card => ({ card, source: card.cardlocation as any }))
    }, {
      id: 'COUNTER',
      label: '反击蓝色卡',
      title: '反击蓝色卡',
      description: '创痕1：对手使用蓝色ACCESS值+3以下的非神蚀卡时，反击那张卡。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: 'COUNTER',
      condition: canCounterBluePlay,
      getCandidates: () => []
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      if (selections[0] === 'COUNTER') {
        counterBluePlay(instance, gameState, playerState.uid);
        return;
      }
      const targets = blueLowNonGodFieldCards(gameState);
      if (targets.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        targets,
        '选择破坏目标',
        '选择战场上1张蓝色ACCESS值+3以下的非神蚀卡破坏。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '201000110_temple_order', step: 'DESTROY_TARGET' },
        card => card.cardlocation as any
      );
      return;
    }

    if (context?.selectedModeId === 'COUNTER' || context?.step === 'COUNTER') {
      counterBluePlay(instance, gameState, playerState.uid);
      return;
    }

    if (context?.selectedModeId === 'DESTROY' || context?.step === 'DESTROY_TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (
        target &&
        ['UNIT', 'ITEM'].includes(target.cardlocation || '') &&
        target.color === 'BLUE' &&
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
 * Source CardID: 201000110
 * Card2 Row: 574
 * Card Row: 458
 * Source CardNo: BT07-W08
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择下列的1项效果并执行:
 * ◆将战场上的1张蓝色的ACCESS值+3以下的非神蚀卡破坏。
 * ◆【创痕1】｛对手使用蓝色的ACCESS值+3以下的非神蚀卡时｝：反击那张卡。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201000110',
  fullName: '殿堂指令',
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
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
