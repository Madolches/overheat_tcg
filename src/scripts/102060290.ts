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
  putUnitOntoField
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

const effect_102060290_irodori_enter: CardEffect = {
  id: '102060290_irodori_enter',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '异彩2：将墓地2种颜色的非神蚀单位卡各1张放逐，将手牌中的这张卡放置到战场上。',
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
      { sourceCardId: instance.gamecardId, effectId: '102060290_irodori_enter', costType: 'SP03_R03_IRODORI2' },
      () => 'GRAVE'
    );
    return true;
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
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType !== 'SP03_R03_IRODORI2') return;
    if (!payIrodoriCost(gameState, playerState, instance, selections, 2)) {
      context.cancelActivation = true;
    }
  }
};

const effect_102060290_irodori_destroy: CardEffect = {
  id: '102060290_irodori_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：这个单位通过异彩进入战场的回合，选择战场上1张非神蚀卡，送墓己方红/黄/蓝非神蚀单位后破坏它。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    (instance as any).data?.enteredByIrodoriTurn === gameState.turnCount &&
    allCardsOnField(gameState).some(card => !card.godMark && (card.type === 'UNIT' || card.type === 'ITEM' || card.isEquip)) &&
    ownUnits(playerState).some(isSacrificeCostUnit),
  cost: async (gameState, playerState, instance) => {
    const candidates = ownUnits(playerState).filter(isSacrificeCostUnit);
    if (candidates.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择送墓费用',
      '选择己方战场上的1个红色、黄色或蓝色非神蚀单位送入墓地作为费用。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102060290_irodori_destroy', costType: 'SACRIFICE_UNIT' },
      () => 'UNIT'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      allCardsOnField(gameState).filter(card => !card.godMark && (card.type === 'UNIT' || card.type === 'ITEM' || card.isEquip)),
      '选择破坏目标',
      '选择战场上的1张非神蚀卡。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102060290_irodori_destroy', step: 'TARGET' },
      card => card.cardlocation as any
    );
  },
  targetSpec: {
    title: '选择破坏目标',
    description: '选择战场上的1张非神蚀卡。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState =>
      allCardsOnField(gameState)
        .filter(card => !card.godMark && (card.type === 'UNIT' || card.type === 'ITEM' || card.isEquip))
        .map(card => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType === 'SACRIFICE_UNIT') {
      const cost = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (
        !cost ||
        cost.cardlocation !== 'UNIT' ||
        AtomicEffectExecutor.findCardOwnerKey(gameState, cost.gamecardId) !== playerState.uid ||
        !isSacrificeCostUnit(cost)
      ) {
        context.cancelActivation = true;
        return;
      }
      moveCardAsCost(gameState, playerState.uid, cost, 'GRAVE', instance);
      return;
    }

    if (context?.step === 'TARGET') {
      const targetId = selections[0];
      const target = targetId ? AtomicEffectExecutor.findCardById(gameState, targetId) : undefined;
      if (!target || target.godMark || !['UNIT', 'ITEM'].includes(target.cardlocation || '')) return;
      if (context?.declaredTargets?.length) {
        destroyByEffect(gameState, target, instance);
        return;
      }
      createSelectCardQuery(
        gameState,
        playerState.uid,
        ownUnits(playerState).filter(isSacrificeCostUnit),
        '选择送墓费用',
        '选择己方战场上的1个红色、黄色或蓝色非神蚀单位送入墓地作为费用。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '102060290_irodori_destroy', step: 'COST', targetId },
        () => 'UNIT'
      );
      return;
    }

    if (context?.step !== 'COST') return;
    const cost = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (
      !cost ||
      cost.cardlocation !== 'UNIT' ||
      AtomicEffectExecutor.findCardOwnerKey(gameState, cost.gamecardId) !== playerState.uid ||
      !isSacrificeCostUnit(cost)
    ) {
      return;
    }
    moveCardAsCost(gameState, playerState.uid, cost, 'GRAVE', instance);

    const target = context.targetId ? AtomicEffectExecutor.findCardById(gameState, context.targetId) : undefined;
    if (target && !target.godMark && ['UNIT', 'ITEM'].includes(target.cardlocation || '')) {
      destroyByEffect(gameState, target, instance);
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102060290
 * Card2 Row: 515
 * Card Row: 338
 * Source CardNo: SP03-R03
 * Package: SP03(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】异彩2。
 * 【启】〖同名一回合一次〗{这个单位通过异彩能力进入战场的回合中，选择战场上的1张非神蚀卡}[将你战场的1张红色、黄色或蓝色的非神蚀单位送入墓地]：将选择的卡牌破坏。
 */
const card: Card = {
  id: '102060290',
  fullName: '炽月·炎雷「蕾」',
  specialName: '蕾',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  baseColorReq: { RED: 2 },
  faction: '雷霆',
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
