import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  backErosionCount,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  discardHandCost,
  markExileWhenLeavesField,
  putUnitOntoField,
  silenceAllNonKeywordEffectsPermanently
} from './BaseUtil';

const hasNoColorRequirement = (card: Card) =>
  Object.values(card.colorReq || {}).every(value => !value || value <= 0);

const normalizeTokenBody = (card: Card, source: Card) => {
  silenceAllNonKeywordEffectsPermanently(card, source);
  markExileWhenLeavesField(card, source);
  card.baseDamage = 1;
  card.damage = 1;
  card.basePower = 0;
  card.power = 0;
};

const getCandidates = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    card.type === 'UNIT' &&
    !card.godMark &&
    hasNoColorRequirement(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const availableUnitSlots = (playerState: any) =>
  playerState.unitZone.filter((slot: Card | null) => slot === null).length;

const effect_205000106_daily_scene: CardEffect = {
  id: '205000106_daily_scene',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  limitCount: 1,
  limitNameType: true,
  erosionBackLimit: [1, 99],
  description: '创痕1，同名1回合1次，主要阶段，舍弃1张黄色手牌：将卡组2张无颜色限制的非神蚀单位放置到战场，其非关键词效果无效，伤害1力量0，离场时放逐。',
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    backErosionCount(playerState) >= 1 &&
    playerState.hand.some((card: Card) => card.color === 'YELLOW') &&
    availableUnitSlots(playerState) >= 2 &&
    getCandidates(playerState).length >= 2,
  cost: discardHandCost(1, card => card.color === 'YELLOW'),
  execute: async (instance, gameState, playerState) => {
    const candidates = getCandidates(playerState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择日常的光景对象',
      '从你的卡组选择2张没有颜色限制的非神蚀单位放置到战场。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '205000106_daily_scene', step: 'PUT_UNIT' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'PUT_UNIT') return;
    for (const selectedId of selections) {
      const selected = AtomicEffectExecutor.findCardById(gameState, selectedId);
      if (!selected || selected.cardlocation !== 'DECK' || selected.type !== 'UNIT' || selected.godMark || !hasNoColorRequirement(selected)) continue;
      if (!putUnitOntoField(gameState, playerState.uid, selected, instance)) continue;
      const live = AtomicEffectExecutor.findCardById(gameState, selected.gamecardId);
      if (live) normalizeTokenBody(live, instance);
    }
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

const card: Card = {
  id: '205000106',
  fullName: '日常的光景',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  baseColorReq: {},
  faction: '无',
  acValue: 1,
  baseAcValue: 1,
  godMark: false,
  baseGodMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_205000106_daily_scene],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
