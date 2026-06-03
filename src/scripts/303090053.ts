import { Card, CardEffect } from '../types/game';
import { allUnitsOnField, createSelectCardQuery, exhaustCost, getResonanceExiledCard, isResonanceExileEvent, silenceAllEffectsUntil, standardizeChoiceOptions } from './BaseUtil';

const unitCandidates = (gameState: any) => allUnitsOnField(gameState);
const nonGodUnitCandidates = (gameState: any) => allUnitsOnField(gameState).filter(unit => !unit.godMark);

const openSilenceChoice = (gameState: any, playerUid: string, source: Card, target: Card, parentEffectId: string) => {
  const effects = (target.effects || []).filter(effect => effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED' || effect.type === 'TRIGGER' || effect.type === 'TRIGGERED');
  if (effects.length === 0) {
    silenceAllEffectsUntil(target, source, gameState.turnCount);
    return;
  }
  gameState.pendingQuery = {
    id: Math.random().toString(36).substring(7),
    type: 'SELECT_CHOICE',
    playerUid,
    options: standardizeChoiceOptions(gameState, effects.map(effect => ({
      id: effect.id || effect.description,
      label: effect.description
    })), { sourceCardId: source.gamecardId, effectId: parentEffectId, targetId: target.gamecardId, step: 'EFFECT' }),
    title: '选择无效能力',
    description: '选择该单位的1个【启】或【诱】能力，本回合中无效。',
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'EFFECT_RESOLVE',
    context: { sourceCardId: source.gamecardId, effectId: parentEffectId, targetId: target.gamecardId, step: 'EFFECT' }
  };
};

const silenceSelectedEffect = (target: Card, effectId?: string) => {
  if (!effectId) return;
  target.silencedEffectIds = target.silencedEffectIds || [];
  if (!target.silencedEffectIds.includes(effectId)) target.silencedEffectIds.push(effectId);
};

const cardEffects: CardEffect[] = [{
  id: '303090053_resonance_silence',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  isMandatory: true,
  triggerLocation: ['EXILE'],
  description: '共鸣能力将你的墓地中的这张卡放逐时，选择战场上的1个单位，本回合中将其1个【启】或【诱】能力无效。',
  condition: (gameState, _playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    isResonanceExileEvent(event) &&
    !!getResonanceExiledCard(event) &&
    unitCandidates(gameState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      unitCandidates(gameState),
      '选择单位',
      '选择战场上的1个单位，本回合中将其1个【启】或【诱】能力无效。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '303090053_resonance_silence', step: 'TARGET' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择单位',
    description: '选择战场上的1个单位，本回合中将其1个【启】或【诱】能力无效。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState => unitCandidates(gameState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const target = unitCandidates(gameState).find(unit => unit.gamecardId === selections[0]);
      if (target) openSilenceChoice(gameState, playerState.uid, instance, target, '303090053_resonance_silence');
      return;
    }
    if (context?.step === 'EFFECT') {
      const target = unitCandidates(gameState).find(unit => unit.gamecardId === context.targetId);
      if (target) silenceSelectedEffect(target, selections[0]);
    }
  }
}, {
  id: '303090053_tap_silence',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：主要阶段，选择战场上1个非神蚀单位，横置这张卡，本回合中将其1个【启】或【诱】能力无效。',
  condition: (gameState, _playerState, instance) =>
    gameState.phase === 'MAIN' &&
    !instance.isExhausted &&
    nonGodUnitCandidates(gameState).length > 0,
  cost: exhaustCost,
  targetSpec: {
    title: '选择单位',
    description: '选择战场上1个非神蚀单位，本回合中将其1个【启】或【诱】能力无效。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState => nonGodUnitCandidates(gameState).map(card => ({ card, source: 'UNIT' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodUnitCandidates(gameState),
      '选择单位',
      '选择战场上1个非神蚀单位，本回合中将其1个【启】或【诱】能力无效。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '303090053_tap_silence', step: 'TARGET' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const target = nonGodUnitCandidates(gameState).find(unit => unit.gamecardId === selections[0]);
      if (target) openSilenceChoice(gameState, playerState.uid, instance, target, '303090053_tap_silence');
      return;
    }
    if (context?.step === 'EFFECT') {
      const target = unitCandidates(gameState).find(unit => unit.gamecardId === context.targetId);
      if (target) silenceSelectedEffect(target, selections[0]);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 303090053
 * Card2 Row: 458
 * Card Row: 393
 * Source CardNo: BT06-G10
 * Package: BT06(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{共鸣能力将你的墓地中的这张卡放逐时，选择战场上的1个单位}：本回合中，将被选择的单位的1个【启】或【诱】能力无效。
 * 【启】〖同名1回合1次〗{主要阶段中，选择战场上1个非神蚀单位}[〖横置〗]：本回合中，将被选择的单位的1个【启】或【诱】能力无效。
 */
const card: Card = {
  id: '303090053',
  fullName: '银乐器手风琴',
  specialName: '',
  type: 'ITEM',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '瑟诺布',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
