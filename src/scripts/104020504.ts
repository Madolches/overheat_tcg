import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allUnitsOnField, createSelectCardQuery, discardHandCost, ensureData, getCardWealthValue, moveCard, moveCardAsCost, ownerUidOf } from './BaseUtil';

const effect_gain_wealth_draw: CardEffect = {
  id: '104020504_gain_wealth_draw',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次，舍弃1张手牌：这个单位获得财富1，抽1张卡。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.hand.length > 0,
  cost: discardHandCost(1),
  execute: async (instance, gameState, playerState) => {
    const data = ensureData(instance);
    data.grantedWealthValue = Number(data.grantedWealthValue || 0) + 1;
    data.grantedWealthSourceName = instance.fullName;
    data.grantedWealthSourceCardId = instance.gamecardId;
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
};

const effect_bounce_unit: CardEffect = {
  id: '104020504_wealth_four_bounce',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '自身拥有4个以上财富1能力时，选择战场1个单位，将这个单位送墓：将被选择的卡加入手牌。',
  condition: (gameState, _playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    getCardWealthValue(instance, { turnCount: gameState.turnCount }) >= 4 &&
    allUnitsOnField(gameState).length > 0,
  cost: async (gameState, playerState, instance) => {
    if (instance.cardlocation !== 'UNIT') return false;
    moveCardAsCost(gameState, playerState.uid, instance, 'GRAVE', instance);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      allUnitsOnField(gameState),
      '选择回收单位',
      '选择战场上的1个单位加入其持有者手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104020504_wealth_four_bounce' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择回收单位',
    description: '选择战场上的1个单位加入其持有者手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    getCandidates: gameState =>
      allUnitsOnField(gameState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT') return;
    const ownerUid = ownerUidOf(gameState, target);
    if (!ownerUid) return;
    moveCard(gameState, ownerUid, target, 'HAND', instance);
  }
};

const cardEffects: CardEffect[] = [effect_gain_wealth_draw, effect_bounce_unit];

const card: Card = {
  id: '104020504',
  fullName: '豁达的售卖者',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '九尾商会联盟',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
