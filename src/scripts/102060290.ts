import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  allCardsOnField,
  canActivateDefaultTiming,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  destroyByEffect,
  moveCardAsCost,
  ownUnits,
  putUnitOntoField,
  recordUnitSentFromFieldToGrave
} from './BaseUtil';

const differentColorNonGodUnitsInGrave = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.type === 'UNIT' && !card.godMark);

const hasIrodoriCost = (playerState: any, amount: number) =>
  new Set(differentColorNonGodUnitsInGrave(playerState).map((card: Card) => card.color)).size >= amount;

const payIrodoriCost = (gameState: any, playerState: any, instance: Card, selections: string[], amount: number) => {
  const selected = selections
    .map(id => playerState.grave.find((card: Card) => card.gamecardId === id))
    .filter((card: Card | undefined): card is Card => !!card && card.type === 'UNIT' && !card.godMark);
  const colors = new Set(selected.map(card => card.color));
  if (selected.length !== amount || colors.size !== amount) return false;

  selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
  return true;
};

const isSacrificeCostUnit = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  (
    AtomicEffectExecutor.matchesColor(card, 'RED') ||
    AtomicEffectExecutor.matchesColor(card, 'YELLOW') ||
    AtomicEffectExecutor.matchesColor(card, 'BLUE')
  );

const nonGodFieldTargets = (gameState: any) =>
  allCardsOnField(gameState).filter(card => !card.godMark && (card.type === 'UNIT' || card.type === 'ITEM' || card.isEquip));

const effect_102060290_irodori_enter: CardEffect = {
  id: '102060290_irodori_enter',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '异彩2：将墓地2种颜色的非神蚀单位卡各1张放逐作为费用，将手牌中的这张卡放置到战场上。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'HAND' &&
    playerState.isTurn &&
    canPutUnitOntoBattlefield(playerState, instance) &&
    hasIrodoriCost(playerState, 2),
  cost: async (gameState, playerState, instance) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      differentColorNonGodUnitsInGrave(playerState),
      '选择异彩费用',
      '选择墓地中2种颜色的非神蚀单位卡各1张放逐。',
      2,
      2,
      {
        sourceCardId: instance.gamecardId,
        effectId: '102060290_irodori_enter',
        step: 'IRODORI2_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      () => 'GRAVE'
    );
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'IRODORI2_COST') return;
    if (!payIrodoriCost(gameState, playerState, instance, selections, 2)) {
      context.cancelActivation = true;
    }
  },
  execute: async (instance, gameState, playerState) => {
    (instance as any).data = {
      ...((instance as any).data || {}),
      enteredByIrodoriTurn: gameState.turnCount
    };
    if (putUnitOntoField(gameState, playerState.uid, instance, instance)) {
      (instance as any).data = {
        ...((instance as any).data || {}),
        enteredByIrodoriTurn: gameState.turnCount
      };
    }
  }
};

const effect_102060290_irodori_destroy: CardEffect = {
  id: '102060290_irodori_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：通过异彩进入战场的回合，选择1张非神蚀卡，将己方红/黄/蓝非神蚀单位送墓作为费用后破坏它。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    (instance as any).data?.enteredByIrodoriTurn === gameState.turnCount &&
    nonGodFieldTargets(gameState).length > 0 &&
    ownUnits(playerState).some(isSacrificeCostUnit),
  cost: async (gameState, playerState, instance) => {
    const costs = ownUnits(playerState).filter(isSacrificeCostUnit);
    if (costs.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costs,
      '选择送墓费用',
      '选择己方战场上的1个红色、黄色或蓝色非神蚀单位送入墓地作为费用。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '102060290_irodori_destroy',
        step: 'SACRIFICE_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      () => 'UNIT'
    );
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'SACRIFICE_COST') return;
    const cost = ownUnits(playerState).find(unit => unit.gamecardId === selections[0] && isSacrificeCostUnit(unit));
    if (!cost) {
      context.cancelActivation = true;
      return;
    }
    moveCardAsCost(gameState, playerState.uid, cost, 'GRAVE', instance);
    recordUnitSentFromFieldToGrave(gameState, playerState.uid, cost);
  },
  execute: async () => {},
  targetSpec: {
    title: '选择破坏目标',
    description: '选择战场上的1张非神蚀卡。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState =>
      nonGodFieldTargets(gameState).map(card => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections, context) => {
    if (context?.step !== 'TARGET') return;
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && !target.godMark && ['UNIT', 'ITEM'].includes(target.cardlocation || '')) {
      destroyByEffect(gameState, target, instance);
    }
  }
};

const card: Card = {
  id: '102060290',
  fullName: '炽月·炎雷「蕾」',
  specialName: '蕾',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  baseColorReq: { RED: 2 },
  faction: '闆烽渾',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_102060290_irodori_enter, effect_102060290_irodori_destroy],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
