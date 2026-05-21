import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addInfluence,
  canPutUnitOntoBattlefield,
  cardsInZones,
  createSelectCardQuery,
  ensureData,
  isOtherworldBat,
  moveCardAsCost,
  putUnitOntoField
} from './BaseUtil';

const shingiBetisCandidates = (playerState: any, gameState: any) =>
  playerState.unitZone.filter((unit: Card | null): unit is Card =>
    !!unit &&
    unit.specialName === '贝缇丝' &&
    (unit as any).data?.placedByShingiEffectTurn === gameState.turnCount &&
    (!!(unit as any).data?.placedByShingiEffectSourceCardId || !!(unit as any).data?.placedByShingiEffectSourceName)
  );

const batCandidates = (playerState: any) =>
  cardsInZones(playerState, ['DECK', 'GRAVE']).filter(({ card }) =>
    isOtherworldBat(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '102070359_field_protection',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '战场上的这张卡不会成为对手ACCESS值4以下的卡牌效果对象，或因其效果从场上离开。',
  applyContinuous: (_gameState, instance) => {
    const data = ensureData(instance);
    data.unaffectedByOpponentAcLe = 4;
    data.cannotBeEffectTargetByOpponentAcLe = 4;
    data.cannotLeaveFieldByOpponentAcLe = 4;
    addInfluence(instance, instance, '不受对手ACCESS4以下卡牌效果对象和离场效果影响');
  }
}, {
  id: '102070359_hand_put_self_and_bats',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  description: '将己方场上1个由《神仪》效果放置的「贝缇丝」放逐：将手牌中的这张卡放置到战场。之后，将卡组或墓地中任意数量《异界狂蝠》放置到战场。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'HAND' &&
    canPutUnitOntoBattlefield(playerState, instance) &&
    shingiBetisCandidates(playerState, gameState).length > 0,
  execute: async (instance, gameState, playerState) => {
    const candidates = shingiBetisCandidates(playerState, gameState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择放逐贝缇丝',
      '选择己方场上1个由《神仪》效果放置的「贝缇丝」放逐。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102070359_hand_put_self_and_bats', step: 'COST_BETIS' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'COST_BETIS') {
      const betis = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!betis || !shingiBetisCandidates(playerState, gameState).some(card => card.gamecardId === betis.gamecardId)) return;
      moveCardAsCost(gameState, playerState.uid, betis, 'EXILE', instance);
      if (!putUnitOntoField(gameState, playerState.uid, instance, instance)) return;

      const candidates = batCandidates(playerState);
      if (candidates.length === 0) return;
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, candidates),
        title: '选择异界狂蝠',
        description: '选择卡组或墓地中任意数量《异界狂蝠》放置到战场。',
        minSelections: 0,
        maxSelections: candidates.length,
        callbackKey: 'EFFECT_RESOLVE',
        context: { sourceCardId: instance.gamecardId, effectId: '102070359_hand_put_self_and_bats', step: 'PUT_BATS' }
      };
      return;
    }

    if (context?.step !== 'PUT_BATS') return;
    let shuffled = false;
    for (const id of selections) {
      const target = AtomicEffectExecutor.findCardById(gameState, id);
      if (!target || !isOtherworldBat(target) || !canPutUnitOntoBattlefield(playerState, target)) continue;
      shuffled = shuffled || target.cardlocation === 'DECK';
      putUnitOntoField(gameState, playerState.uid, target, instance);
    }
    if (shuffled) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

const card: Card = {
  id: '102070359',
  fullName: '撕裂的恐惧「巨蝠」',
  specialName: '巨蝠',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 5 },
  faction: '忒碧拉之间',
  acValue: 9,
  power: 4000,
  basePower: 4000,
  damage: 4,
  baseDamage: 4,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
