import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  addInfluence,
  backErosionCount,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  isFeijingUnit,
  markCannotBeOpponentEffectTarget,
  putUnitOntoField
} from './BaseUtil';

const getFeijingCandidates = (playerState: any) =>
  [...playerState.hand, ...playerState.deck].filter((card: Card) =>
    isFeijingUnit(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const effect_105110350_protect_feijing: CardEffect = {
  id: '105110350_protect_feijing',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '你的战场上的具有【菲晶】的单位不会成为对手卡牌能力的效果对象。',
  applyContinuous: (gameState, instance) => {
    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId);
    const playerState = ownerUid ? gameState.players[ownerUid] : undefined;
    if (!playerState) return;
    playerState.unitZone
      .filter((unit): unit is Card => !!unit && isFeijingUnit(unit))
      .forEach(unit => markCannotBeOpponentEffectTarget(unit, instance));
  }
};

const effect_105110350_put_feijing: CardEffect = {
  id: '105110350_put_feijing',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionBackLimit: [1, 99],
  description: '创痕1，你的主要阶段，横置这张卡：将手牌或卡组1张具有【菲晶】的单位放置到战场。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    !instance.isExhausted &&
    backErosionCount(playerState) >= 1 &&
    getFeijingCandidates(playerState).length > 0,
  cost: async (_gameState, _playerState, instance) => {
    if (instance.isExhausted) return false;
    instance.isExhausted = true;
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = getFeijingCandidates(playerState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择菲晶单位',
      '从你的手牌或卡组选择1张具有【菲晶】的单位放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110350_put_feijing', step: 'PUT_FEIJING' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'PUT_FEIJING') return;
    const selected = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!selected || !isFeijingUnit(selected)) return;
    const fromDeck = selected.cardlocation === 'DECK';
    if (!putUnitOntoField(gameState, playerState.uid, selected, instance)) return;
    addInfluence(selected, instance, '由希克放置到战场');
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

const card: Card = {
  id: '105110350',
  fullName: '商队随从「希克」',
  specialName: '希克',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  baseColorReq: { YELLOW: 2 },
  faction: '学院要塞',
  acValue: 3,
  baseAcValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  baseGodMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: true,
  canResetCount: 0,
  effects: [effect_105110350_protect_feijing, effect_105110350_put_feijing],
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
