import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, addInfluence, createSelectCardQuery, ensureData, forbidAttackAndDefenseUntil, getBattlefieldUnits, moveCard, ownerUidOf } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '303000022_bind_enter',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  triggerLocation: ['ITEM'],
  description: '进入战场时，选择战场上1个单位。只要这张卡在战场上，那个单位不能横置，不能宣言攻击和防御。',
  condition: (gameState, _playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'ITEM' &&
    getBattlefieldUnits(gameState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      getBattlefieldUnits(gameState),
      '选择束缚单位',
      '选择战场上的1个单位，使其不能横置，不能宣言攻击和防御。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '303000022_bind_enter' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择束缚单位',
    description: '选择战场上的1个单位，使其不能横置，不能宣言攻击和防御。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    getCandidates: gameState =>
      getBattlefieldUnits(gameState).map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT') return;
    ensureData(instance).boundTargetId = target.gamecardId;
    const data = ensureData(target);
    data.soulBoundBy = instance.fullName;
    data.soulBindItemId = instance.gamecardId;
    data.cannotExhaustByEffect = true;
    forbidAttackAndDefenseUntil(target, instance, 999999);
    addInfluence(target, instance, '不能横置');
  }
}, {
  id: '303000022_bind_continuous',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '维持灵魂束缚。',
  applyContinuous: (gameState, instance) => {
    const targetId = ensureData(instance).boundTargetId;
    const target = targetId ? AtomicEffectExecutor.findCardById(gameState, targetId) : undefined;
    if (!target || target.cardlocation !== 'UNIT') return;
    const data = ensureData(target);
    data.soulBoundBy = instance.fullName;
    data.soulBindItemId = instance.gamecardId;
    data.cannotExhaustByEffect = true;
    forbidAttackAndDefenseUntil(target, instance, 999999);
    addInfluence(target, instance, '不能横置');
  }
}, {
  id: '303000022_leave_with_target',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_ZONE',
  isMandatory: true,
  triggerLocation: ['ITEM'],
  isGlobal: true,
  description: '被束缚单位离开战场时，将这张卡送入墓地。',
  condition: (_gameState, _playerState, instance, event) =>
    !!ensureData(instance).boundTargetId &&
    event?.sourceCardId === ensureData(instance).boundTargetId &&
    event.data?.zone === 'UNIT',
  execute: async (instance, gameState) => {
    const ownerUid = ownerUidOf(gameState, instance);
    if (ownerUid && instance.cardlocation === 'ITEM') moveCard(gameState, ownerUid, instance, 'GRAVE', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 303000022
 * Card2 Row: 123
 * Card Row: 123
 * Source CardNo: BT02-G17
 * Package: BT02(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这张卡进入战场时，选择战场上的1个单位，只要这张卡在战场上，那个单位获得“【永】:这个单位不能〖横置〗，不能宣言攻击和防御。”的能力。那个单位离开战场时，将这张卡送入墓地。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '303000022',
  fullName: '「灵魂束缚」',
  specialName: '灵魂束缚',
  type: 'ITEM',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
