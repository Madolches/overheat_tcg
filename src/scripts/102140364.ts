import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, cardsInZones, createSelectCardQuery, isOtherworldBat, putUnitOntoField } from './BaseUtil';

const batCandidates = (playerState: any) =>
  cardsInZones(playerState, ['HAND', 'DECK']).filter(({ card }) =>
    isOtherworldBat(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '102140364_destroyed_put_bats',
  type: 'TRIGGER',
  triggerEvent: ['CARD_DESTROYED_BATTLE', 'CARD_DESTROYED_EFFECT'],
  triggerLocation: ['GRAVE'],
  description: '这张卡被破坏时，可以将手牌或卡组中最多2张《异界狂蝠》横置放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    event?.targetCardId === instance.gamecardId &&
    batCandidates(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    const candidates = batCandidates(playerState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates.map(entry => entry.card),
      '选择异界狂蝠',
      '选择手牌或卡组中最多2张《异界狂蝠》横置放置到战场。',
      0,
      Math.min(2, candidates.length),
      { sourceCardId: instance.gamecardId, effectId: '102140364_destroyed_put_bats' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    let shuffled = false;
    for (const id of selections.slice(0, 2)) {
      const target = AtomicEffectExecutor.findCardById(gameState, id);
      if (!target || !isOtherworldBat(target) || !canPutUnitOntoBattlefield(playerState, target)) continue;
      shuffled = shuffled || target.cardlocation === 'DECK';
      putUnitOntoField(gameState, playerState.uid, target, instance, { exhausted: true });
    }
    if (shuffled) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

const card: Card = {
  id: '102140364',
  fullName: '尖脸的黎明教徒',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '女神教会',
  acValue: 3,
  power: 0,
  basePower: 0,
  damage: 0,
  baseDamage: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
