import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addContinuousDamage,
  addContinuousPower,
  addInfluence,
  backErosionCount,
  canActivateDefaultTiming,
  canPutUnitOntoBattlefield,
  cardsInZones,
  createSelectCardQuery,
  markExileAtEndOfTurn,
  nameContains,
  putUnitOntoField,
} from './BaseUtil';

const isPlacedByShingiEffect = (card: Card) =>
  !!(card as any).data?.placedByShingiEffectSourceCardId;

const hasShingiPlacedUnit = (playerState: any) =>
  playerState.unitZone.some((unit: Card | null) => !!unit && isPlacedByShingiEffect(unit));

const isShingiStory = (card: Card) =>
  card.type === 'STORY' && card.fullName.includes('神仪');

const isDawnFollower = (card: Card) =>
  card.type === 'UNIT' && (card.id === '101140343' || nameContains(card, '黎明教众'));

const dawnFollowerCandidates = (playerState: any) =>
  cardsInZones(playerState, ['HAND', 'DECK', 'GRAVE']).filter(({ card }) =>
    isDawnFollower(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const effect_101140345_shingi_aura: CardEffect = {
  id: '101140345_shingi_aura',
  type: 'CONTINUOUS',
  description: '你的战场上有由于卡名含有《神仪》的卡的效果放置到战场上的单位时，这个单位伤害+1、力量+1000且不会被战斗破坏。',
  applyContinuous: (_gameState, instance) => {
    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(_gameState, instance.gamecardId);
    if (!ownerUid) return;
    const owner = _gameState.players[ownerUid];
    if (!owner || !hasShingiPlacedUnit(owner)) return;

    addContinuousPower(instance, instance, 1000);
    addContinuousDamage(instance, instance, 1);
    (instance as any).battleImmuneByEffect = true;
    addInfluence(instance, instance, '不会被战斗破坏');
  }
};

const effect_101140345_call_dawn_followers: CardEffect = {
  id: '101140345_call_dawn_followers',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitGlobal: true,
  description: '创痕1，1游戏1次：主要阶段展示手牌中1张卡名含有《神仪》的故事卡，将手牌、卡组、墓地中最多3张《黎明教众》横置放置到战场，回合结束时放逐。',
  condition: (gameState, playerState, instance) =>
    canActivateDefaultTiming(gameState, playerState) &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    instance.cardlocation === 'UNIT' &&
    backErosionCount(playerState) >= 1 &&
    playerState.hand.some(isShingiStory) &&
    dawnFollowerCandidates(playerState).length > 0,
  cost: async (gameState, playerState, instance) => {
    const revealCandidates = playerState.hand.filter(isShingiStory);
    if (revealCandidates.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      revealCandidates,
      '展示神仪故事卡',
      '选择手牌中的1张卡名含有《神仪》的故事卡展示作为费用。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101140345_call_dawn_followers', step: 'REVEAL_COST' },
      () => 'HAND'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    const emptySlots = playerState.unitZone.filter((slot: Card | null) => slot === null).length;
    const candidates = dawnFollowerCandidates(playerState);
    const maxCount = Math.min(3, emptySlots, candidates.length);
    if (maxCount <= 0) return;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, candidates),
      title: '选择黎明教众',
      description: '选择最多3张《黎明教众》横置放置到战场。回合结束时，将其放逐。',
      minSelections: 0,
      maxSelections: maxCount,
      callbackKey: 'EFFECT_RESOLVE',
      context: { sourceCardId: instance.gamecardId, effectId: '101140345_call_dawn_followers', step: 'PUT_DAWN_FOLLOWERS' }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'REVEAL_COST') {
      const revealed = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!revealed || revealed.cardlocation !== 'HAND' || !isShingiStory(revealed)) {
        context.cancelActivation = true;
        return;
      }
      gameState.logs.push(`[${instance.fullName}] 展示了手牌中的 [${revealed.fullName}]。`);
      return;
    }

    if (context?.step !== 'PUT_DAWN_FOLLOWERS') return;
    const selectedIds = selections.slice(0, 3);
    let movedFromDeck = false;
    selectedIds.forEach(targetId => {
      const target = AtomicEffectExecutor.findCardById(gameState, targetId);
      if (!target || !['HAND', 'DECK', 'GRAVE'].includes(target.cardlocation || '')) return;
      if (!isDawnFollower(target) || !canPutUnitOntoBattlefield(playerState, target)) return;
      const fromDeck = target.cardlocation === 'DECK';
      const targetGamecardId = target.gamecardId;
      if (!putUnitOntoField(gameState, playerState.uid, target, instance, { exhausted: true })) return;
      const live = AtomicEffectExecutor.findCardById(gameState, targetGamecardId);
      if (live?.cardlocation === 'UNIT') {
        markExileAtEndOfTurn(gameState, playerState.uid, live, instance, `101140345_end_exile_${targetGamecardId}`);
      }
      movedFromDeck = movedFromDeck || fromDeck;
    });
    if (movedFromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140345
 * Card2 Row: 475
 * Card Row: 408
 * Source CardNo: BT06-W05
 * Package: BT06(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】{你的战场上有由于卡名含有《神仪》的卡的效果放置到战场上的单位}：这个单位〖伤害+1〗〖力量+1000〗且不会被战斗破坏。
 * 【创痕1】（你的侵蚀区中的背面卡有1张以上时才有效）【启】〖1游戏1次〗{你的主要阶段}[展示你手牌中的1张卡名含有《神仪》的故事卡]：将你的手牌、卡组、墓地中最多3张《黎明教众》以横置状态放置到战场上。回合结束时，将其放逐。
 */
const card: Card = {
  id: '101140345',
  fullName: '「暮城教区长」',
  specialName: '暮城教区长',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '女神教会',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_101140345_shingi_aura, effect_101140345_call_dawn_followers],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
