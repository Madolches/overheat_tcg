import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  allCardsOnField,
  canPutUnitOntoBattlefield,
  cardsInZones,
  createSelectCardQuery,
  destroyByEffect,
  ensureData,
  getOpponentUid,
  isNonGodUnit,
  isOtherworldBat,
  moveCard,
  ownerUidOf,
  putUnitOntoField
} from './BaseUtil';

const wasPlacedByShingi = (card: Card, gameState: any) => {
  const data = (card as any).data || {};
  return data.placedByShingiEffectTurn === gameState.turnCount &&
    (!!data.placedByShingiEffectSourceCardId || !!data.placedByShingiEffectSourceName);
};

const batSummonCandidates = (playerState: any) =>
  cardsInZones(playerState, ['DECK', 'GRAVE']).filter(({ card }) =>
    isOtherworldBat(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const findDestroyedOpponentUnit = (gameState: any, playerUid: string, event: any) => {
  const opponentUid = getOpponentUid(gameState, playerUid);
  if (event?.playerUid !== opponentUid || !event.targetCardId) return undefined;
  return gameState.players[opponentUid].grave.find((card: Card) => card.gamecardId === event.targetCardId && card.type === 'UNIT');
};

const cardEffects: CardEffect[] = [{
  id: '102070358_destroy_substitute_marker',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '这张卡将被破坏时，可以破坏己方1个《异界狂蝠》作为代替。',
  applyContinuous: (_gameState, instance) => {
    ensureData(instance).betisCanDestroyBatInstead = true;
  }
}, {
  id: '102070358_opponent_destroyed_exile_and_put_bat',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: ['CARD_DESTROYED_BATTLE', 'CARD_DESTROYED_EFFECT'],
  isMandatory: false,
  isGlobal: true,
  limitCount: 1,
  description: '对手战场上的单位被破坏送入墓地时，可以将那个单位放逐。之后，将卡组或墓地中1张《异界狂蝠》放置到战场。',
  condition: (gameState, playerState, _instance, event) =>
    !!findDestroyedOpponentUnit(gameState, playerState.uid, event),
  execute: async (instance, gameState, playerState, event) => {
    const destroyed = findDestroyedOpponentUnit(gameState, playerState.uid, event);
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    if (destroyed) moveCard(gameState, opponentUid, destroyed, 'EXILE', instance);

    const candidates = batSummonCandidates(playerState);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates.map(entry => entry.card),
      '选择异界狂蝠',
      '选择卡组或墓地中的1张《异界狂蝠》放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102070358_opponent_destroyed_exile_and_put_bat' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !isOtherworldBat(target) || !canPutUnitOntoBattlefield(playerState, target)) return;
    const fromDeck = target.cardlocation === 'DECK';
    putUnitOntoField(gameState, playerState.uid, target, instance);
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}, {
  id: '102070358_shingi_turn_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '回合1次：这张卡由于《神仪》卡的效果进入战场的回合，选择战场上的1个非神蚀单位破坏。',
  condition: (gameState, _playerState, instance) =>
    wasPlacedByShingi(instance, gameState) &&
    allCardsOnField(gameState).some(card => isNonGodUnit(card)),
  targetSpec: {
    title: '选择破坏单位',
    description: '选择战场上的1个非神蚀单位破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    getCandidates: (gameState) =>
      allCardsOnField(gameState)
        .filter(card => isNonGodUnit(card))
        .map(card => ({ card, source: card.cardlocation as any }))
  },
  execute: async (instance, gameState, playerState) => {
    const targets = allCardsOnField(gameState).filter(card => isNonGodUnit(card));
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择破坏单位',
      '选择战场上的1个非神蚀单位破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102070358_shingi_turn_destroy' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !isNonGodUnit(target) || !ownerUidOf(gameState, target)) return;
    destroyByEffect(gameState, target, instance);
  }
}];

const card: Card = {
  id: '102070358',
  fullName: '神秘女子「贝缇丝」',
  specialName: '贝缇丝',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '忒碧拉之门',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
