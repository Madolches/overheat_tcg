import { Card, CardEffect } from '../types/game';
import { EventEngine } from '../services/EventEngine';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  allCardsOnField,
  createSelectCardQuery,
  ensureData,
  moveCardAsCost,
  ownUnits,
  ownerUidOf,
  paymentCost
} from './BaseUtil';

const GRAVE_COST_COLORS = ['RED', 'YELLOW', 'BLUE'];

const matchesAnyColor = (card: Card, colors: string[]) =>
  colors.some(color => AtomicEffectExecutor.matchesColor(card, color));

const colorsForCard = (card: Card, colors: string[]) =>
  colors.filter(color => AtomicEffectExecutor.matchesColor(card, color));

const hasTwoColorGraveCost = (playerState: any, colors: string[]) => {
  const available = new Set<string>();
  playerState.grave.forEach((card: Card) => colorsForCard(card, colors).forEach(color => available.add(color)));
  return available.size >= 2;
};

const payTwoColorGraveCost = (gameState: any, playerState: any, instance: Card, selections: string[], colors: string[]) => {
  const usedColors = new Set<string>();
  const selected = selections
    .map(id => playerState.grave.find((card: Card) => card.gamecardId === id))
    .filter((card: Card | undefined): card is Card => !!card && matchesAnyColor(card, colors));

  if (selected.length !== 2 || new Set(selected.map(card => card.gamecardId)).size !== 2) return false;
  for (const card of selected) {
    const color = colorsForCard(card, colors).find(candidate => !usedColors.has(candidate));
    if (!color) return false;
    usedColors.add(color);
  }
  if (usedColors.size !== 2) return false;

  selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
  return true;
};

const isRedOrYellowNonGodUnit = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  (AtomicEffectExecutor.matchesColor(card, 'RED') || AtomicEffectExecutor.matchesColor(card, 'YELLOW'));

const isCatherineUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (card.id === '102050145' || card.id === '102050276' || card.specialName === '凯萨琳' || card.fullName.includes('凯萨琳'));

const firstEffectTargets = (playerState: any) =>
  ownUnits(playerState).filter(unit => isRedOrYellowNonGodUnit(unit) || isCatherineUnit(unit));

const DELAYED_TRIGGER_LOCATIONS = ['UNIT', 'ITEM', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'] as const;

const wasMarkedUnitLeftByNonBattleWay = (gameState: any, playerState: any, instance: Card, event: any) => {
  if (
    event?.type !== 'CARD_LEFT_FIELD' ||
    (event.data?.sourceZone || event.data?.zone) !== 'UNIT' ||
    !event.sourceCard ||
    event.playerUid !== playerState.uid
  ) {
    return false;
  }

  const movedCardId = event.sourceCardId || event.data?.previousSourceCardId;
  const playerMarker = (playerState as any).fuhuaDrawOnLeaveMarker;
  const data = (event.sourceCard as any).data || {};
  const cardMarkerMatches =
    data.fuhuaDrawOnLeaveTurn === gameState.turnCount &&
    data.fuhuaDrawOnLeaveControllerUid === playerState.uid &&
    data.fuhuaDrawOnLeaveSourceCardId === instance.gamecardId;
  const playerMarkerMatches =
    playerMarker?.turn === gameState.turnCount &&
    playerMarker?.controllerUid === playerState.uid &&
    playerMarker?.sourceCardId === instance.gamecardId &&
    playerMarker?.targetCardId === movedCardId;

  if (!cardMarkerMatches && !playerMarkerMatches) {
    return false;
  }

  const movedAsCost = data.lastMovedAsCostTurn === gameState.turnCount;
  return event.data?.isEffect || movedAsCost || event.data?.targetZone !== 'GRAVE';
};

const exhaustTargetByEffect = (gameState: any, playerState: any, target: Card, source: Card) => {
  if ((target as any).data?.cannotExhaustUntilTurn !== undefined && (target as any).data.cannotExhaustUntilTurn >= gameState.turnCount) {
    return false;
  }

  target.isExhausted = true;
  EventEngine.dispatchEvent(gameState, {
    type: 'CARD_ROTATED',
    sourceCard: source,
    sourceCardId: source.gamecardId,
    targetCardId: target.gamecardId,
    playerUid: playerState.uid,
    data: {
      direction: 'HORIZONTAL',
      effectSourcePlayerUid: playerState.uid,
      effectSourceCardId: source.gamecardId,
      allTargetCardIds: [target.gamecardId]
    }
  });
  return true;
};

const effect_104010268_mark_leave_draw: CardEffect = {
  id: '104010268_mark_leave_draw',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '【启】同名1回合1次，选择你战场上的1个红色或黄色的非神蚀单位、或「凯萨琳」单位：本回合中，被选择的单位由于战斗以外的方式从战场上离开时，抽1张卡。',
  condition: (_gameState, playerState, instance) =>
    playerState.isTurn &&
    instance.cardlocation === 'UNIT' &&
    firstEffectTargets(playerState).length > 0,
  targetSpec: {
    title: '选择离场抽牌目标',
    description: '选择你战场上的1个红色或黄色的非神蚀单位、或「凯萨琳」单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      firstEffectTargets(playerState).map(card => ({ card, source: 'UNIT' as const }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT' || ownerUidOf(gameState, target) !== playerState.uid) return;
    if (!isRedOrYellowNonGodUnit(target) && !isCatherineUnit(target)) return;

    const data = ensureData(target);
    data.fuhuaDrawOnLeaveTurn = gameState.turnCount;
    data.fuhuaDrawOnLeaveControllerUid = playerState.uid;
    data.fuhuaDrawOnLeaveSourceCardId = instance.gamecardId;
    data.fuhuaDrawOnLeaveSourceName = instance.fullName;
    (playerState as any).fuhuaDrawOnLeaveMarker = {
      turn: gameState.turnCount,
      controllerUid: playerState.uid,
      sourceCardId: instance.gamecardId,
      targetCardId: target.gamecardId
    };
  }
};

const effect_104010268_draw_on_marked_leave: CardEffect = {
  id: '104010268_draw_on_marked_leave',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_FIELD',
  sourceSnapshotOnLeftField: true,
  triggerLocation: [...DELAYED_TRIGGER_LOCATIONS],
  isGlobal: true,
  isMandatory: true,
  description: '被这个能力选择的单位本回合由于战斗以外的方式离开战场时，抽1张卡。',
  condition: (gameState, playerState, instance, event) =>
    playerState.deck.length > 0 &&
    wasMarkedUnitLeftByNonBattleWay(gameState, playerState, instance, event),
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
};

const effect_104010268_exhaust_card: CardEffect = {
  id: '104010268_exhaust_card',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '【启】同名1回合1次，主要阶段，选择战场上的1张卡，支付+1并放逐墓地中红/黄/蓝中的2种颜色的卡各1张：将被选择的卡横置。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    instance.cardlocation === 'UNIT' &&
    allCardsOnField(gameState).length > 0 &&
    hasTwoColorGraveCost(playerState, GRAVE_COST_COLORS),
  targetSpec: {
    title: '选择横置目标',
    description: '选择战场上的1张卡。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'ANY',
    getCandidates: gameState =>
      allCardsOnField(gameState).map(card => ({ card, source: card.cardlocation as any }))
  },
  cost: async (gameState, playerState, instance) => {
    const paid = await paymentCost(1)!(gameState, playerState, instance);
    if (gameState.pendingQuery) {
      gameState.pendingQuery.context = {
        ...gameState.pendingQuery.context,
        effectId: '104010268_exhaust_card',
        step: 'PAYMENT'
      };
    }
    if (!paid || gameState.pendingQuery) return paid;

    const candidates = playerState.grave.filter((card: Card) => matchesAnyColor(card, GRAVE_COST_COLORS));
    if (!hasTwoColorGraveCost(playerState, GRAVE_COST_COLORS)) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择墓地费用',
      '选择墓地中红色、黄色、蓝色中的2种颜色的卡各1张放逐。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '104010268_exhaust_card', costType: 'SP02_B01_TWO_COLOR_GRAVE_EXILE' },
      () => 'GRAVE'
    );
    return true;
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType === 'SP02_B01_TWO_COLOR_GRAVE_EXILE') {
      if (!payTwoColorGraveCost(gameState, playerState, instance, selections, GRAVE_COST_COLORS)) {
        context.cancelActivation = true;
      }
      return;
    }

    if (context?.step === 'PAYMENT') {
      const candidates = playerState.grave.filter((card: Card) => matchesAnyColor(card, GRAVE_COST_COLORS));
      if (!hasTwoColorGraveCost(playerState, GRAVE_COST_COLORS)) {
        context.cancelActivation = true;
        return;
      }
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择墓地费用',
        '选择墓地中红色、黄色、蓝色中的2种颜色的卡各1张放逐。',
        2,
        2,
        { sourceCardId: instance.gamecardId, effectId: '104010268_exhaust_card', costType: 'SP02_B01_TWO_COLOR_GRAVE_EXILE' },
        () => 'GRAVE'
      );
      return;
    }

    const targetId = selections[0] || context?.declaredTargets?.[0]?.gamecardId;
    const target = targetId ? AtomicEffectExecutor.findCardById(gameState, targetId) : undefined;
    if (!target || !['UNIT', 'ITEM'].includes(target.cardlocation as any)) return;
    exhaustTargetByEffect(gameState, playerState, target, instance);
  }
};

const card: Card = {
  id: '104010268',
  gamecardId: null as any,
  fullName: '炽月·舞者【风花】',
  specialName: '风花',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { 'BLUE': 1 },
  faction: '百濑之水城',
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
  effects: [effect_104010268_mark_leave_draw, effect_104010268_draw_on_marked_leave, effect_104010268_exhaust_card],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP02',
  uniqueId: null,
};

export default card;
