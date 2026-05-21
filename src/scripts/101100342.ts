import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { backErosionCount, canPutUnitOntoBattlefield, cardsInZones, ensureData, exhaustCost, moveCard, putUnitOntoField } from './BaseUtil';

const isPrayerOrDevotion = (card: Card) =>
  card.id === '201000102' ||
  card.id === '201100099' ||
  card.fullName === '祈祷' ||
  card.fullName === '献身';

const isColorlessNonGodUnit = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  Object.values(card.colorReq || {}).every(value => !value);

const effect_101100342_end_search: CardEffect = {
  id: '101100342_end_search',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END' as any,
  triggerLocation: ['UNIT'],
  cost: exhaustCost,
  isMandatory: true,
  description: '你的回合结束时，横置：可以将卡组或墓地中的1张《祈祷》或《献身》加入手牌。',
  condition: (_gameState, playerState, instance, event) =>
    event?.playerUid === playerState.uid &&
    !instance.isExhausted &&
    cardsInZones(playerState, ['DECK', 'GRAVE']).some(({ card }) => isPrayerOrDevotion(card)),
  execute: async (instance, gameState, playerState) => {
    const candidates = cardsInZones(playerState, ['DECK', 'GRAVE']).filter(({ card }) => isPrayerOrDevotion(card));
    if (candidates.length === 0) return;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, candidates),
      title: '选择加入手牌的卡',
      description: '选择卡组或墓地中的1张《祈祷》或《献身》加入手牌。',
      minSelections: 0,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: { sourceCardId: instance.gamecardId, effectId: '101100342_end_search' }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || (selected.cardlocation !== 'DECK' && selected.cardlocation !== 'GRAVE')) return;
    const fromDeck = selected.cardlocation === 'DECK';
    moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

const effect_101100342_story_cheat_unit: CardEffect = {
  id: '101100342_story_cheat_unit',
  type: 'TRIGGER',
  triggerEvent: 'CARD_PLAYED',
  triggerLocation: ['UNIT'],
  isGlobal: true,
  limitCount: 1,
  description: '创痕2：你的回合中使用故事卡时，可以将卡组或墓地中的1张没有颜色限制的非神蚀单位放置到战场上，那个单位失去所有非关键词效果。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    backErosionCount(playerState) >= 2 &&
    event?.playerUid === playerState.uid &&
    playerState.isTurn &&
    event.sourceCard?.type === 'STORY' &&
    playerState.unitZone.some(slot => slot === null) &&
    cardsInZones(playerState, ['DECK', 'GRAVE']).some(({ card }) =>
      isColorlessNonGodUnit(card) &&
      canPutUnitOntoBattlefield(playerState, card)
    ),
  execute: async (instance, gameState, playerState) => {
    const candidates = cardsInZones(playerState, ['DECK', 'GRAVE']).filter(({ card }) =>
      isColorlessNonGodUnit(card) &&
      canPutUnitOntoBattlefield(playerState, card)
    );
    if (candidates.length === 0) return;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, candidates),
      title: '选择放置到战场的单位',
      description: '选择卡组或墓地中的1张没有颜色限制的非神蚀单位放置到战场。',
      minSelections: 0,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: { sourceCardId: instance.gamecardId, effectId: '101100342_story_cheat_unit' }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || (selected.cardlocation !== 'DECK' && selected.cardlocation !== 'GRAVE')) return;
    const fromDeck = selected.cardlocation === 'DECK';
    const selectedId = selected.gamecardId;
    if (!putUnitOntoField(gameState, playerState.uid, selected, instance)) return;
    const live = AtomicEffectExecutor.findCardById(gameState, selectedId);
    if (live?.cardlocation === 'UNIT') {
      const data = ensureData(live);
      data.permanentEffectSilenced = true;
      data.permanentEffectSilenceSource = instance.fullName;
      data.placedByShingiEffectTurn = gameState.turnCount;
      data.placedByShingiEffectSourceCardId = instance.gamecardId;
      data.placedByShingiEffectSourceName = instance.fullName;
    }
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101100342
 * Card2 Row: 471
 * Card Row: 405
 * Source CardNo: BT06-W01
 * Package: BT06(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{你的回合结束时}[〖横置〗]：你可以将你的卡组或墓地中的1张《祈祷》或《献身》加入手牌。
 * 【创痕2】（你的侵蚀区中的背面卡有2张以上时才有效）【诱】〖1回合1次〗{你的回合中，你使用故事卡时}：你可以将你的卡组或墓地中的1张没有颜色限制的非神蚀单位卡放置到战场上，那个单位失去所有效果（不包括关键词效果）。
 */
const card: Card = {
  id: '101100342',
  fullName: '虔诚少女「柯莉尔」',
  specialName: '柯莉尔',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '艾柯利普斯',
  acValue: 3,
  power: 0,
  basePower: 0,
  damage: 0,
  baseDamage: 0,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_101100342_end_search, effect_101100342_story_cheat_unit],
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
