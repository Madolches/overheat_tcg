import { Card, CardEffect } from '../types/game';
import { EventEngine } from '../services/EventEngine';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addTempPowerUntilEndOfTurn,
  allCardsOnField,
  attackingUnits,
  createSelectCardQuery,
  ensureData,
  getOpponentUid,
  isBattleFreeContext,
  isNonGodFieldCard,
  moveCard,
  moveCardAsCost,
  ownerUidOf,
  ownUnits,
  totalErosionCount
} from './BaseUtil';

const GRAVE_COST_COLORS = ['WHITE', 'BLUE', 'GREEN'];
const DELAYED_TRIGGER_LOCATIONS = ['UNIT', 'ITEM', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'] as const;

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

const exhaustByEffect = (gameState: any, playerState: any, target: Card, source: Card) => {
  if (target.isExhausted) return false;
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

const isWhiteOrGreenAttacker = (card: Card) =>
  card.type === 'UNIT' &&
  (AtomicEffectExecutor.matchesColor(card, 'WHITE') || AtomicEffectExecutor.matchesColor(card, 'GREEN'));

const supportTargets = (gameState: any, playerState: any) => {
  const attackerIds = new Set(attackingUnits(gameState).map(unit => unit.gamecardId));
  return ownUnits(playerState).filter(unit => attackerIds.has(unit.gamecardId) && isWhiteOrGreenAttacker(unit));
};

const opponentNonGodFieldTargets = (gameState: any, playerState: any) => {
  const opponentUid = getOpponentUid(gameState, playerState.uid);
  return allCardsOnField(gameState).filter(card => ownerUidOf(gameState, card) === opponentUid && isNonGodFieldCard(card));
};

const canUseMainBounce = (gameState: any, playerState: any, instance: Card) => {
  const erosion = totalErosionCount(playerState);
  return playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    instance.cardlocation === 'UNIT' &&
    !instance.isExhausted &&
    erosion >= 4 &&
    erosion <= 6 &&
    hasTwoColorGraveCost(playerState, GRAVE_COST_COLORS) &&
    opponentNonGodFieldTargets(gameState, playerState).length > 0;
};

const effect_104000271_battle_support: CardEffect = {
  id: '104000271_battle_support',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '【启】战斗自由步骤中，选择你的一个正在进行攻击的白色或绿色单位，横置此卡：这次战斗中，被选择的单位力量+1000。若这次战斗中你的单位战斗破坏对手的单位，你可以抽1张卡，之后舍弃1张手牌。',
  condition: (gameState, playerState, instance) =>
    isBattleFreeContext(gameState) &&
    instance.cardlocation === 'UNIT' &&
    !instance.isExhausted &&
    supportTargets(gameState, playerState).length > 0,
  targetSpec: {
    title: '选择助攻目标',
    description: '选择你的一个正在进行攻击的白色或绿色单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    getCandidates: (gameState, playerState) =>
      supportTargets(gameState, playerState).map(card => ({ card, source: 'UNIT' as const }))
  },
  cost: async (gameState, playerState, instance) => exhaustByEffect(gameState, playerState, instance, instance),
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || ownerUidOf(gameState, target) !== playerState.uid || !supportTargets(gameState, playerState).some(unit => unit.gamecardId === target.gamecardId)) return;

    addTempPowerUntilEndOfTurn(target, instance, 1000, gameState);
    const data = ensureData(target);
    data.canglanBattleSupportTurn = gameState.turnCount;
    data.canglanBattleSupportBattleId = gameState.battleState?.battleId || `${gameState.turnCount}:${(gameState.battleState?.attackers || []).join(',')}:${gameState.battleState?.defender || ''}`;
    data.canglanBattleSupportControllerUid = playerState.uid;
    data.canglanBattleSupportSourceCardId = instance.gamecardId;
    data.canglanBattleSupportSourceName = instance.fullName;
    (playerState as any).canglanBattleSupportTurn = gameState.turnCount;
    (playerState as any).canglanBattleSupportBattleId = data.canglanBattleSupportBattleId;
    (playerState as any).canglanBattleSupportTargetId = target.gamecardId;
    (playerState as any).canglanBattleSupportSourceCardId = instance.gamecardId;
  }
};

const effect_104000271_battle_destroy_draw_discard: CardEffect = {
  id: '104000271_battle_destroy_draw_discard',
  type: 'TRIGGER',
  triggerEvent: 'CARD_DESTROYED_BATTLE',
  triggerLocation: [...DELAYED_TRIGGER_LOCATIONS],
  isGlobal: true,
  isMandatory: false,
  description: '被此卡助攻的战斗中，你的单位战斗破坏对手单位时，你可以抽1张卡，之后舍弃1张手牌。',
  condition: (gameState, playerState, instance, event) => {
    if (
      event?.type !== 'CARD_DESTROYED_BATTLE' ||
      event.playerUid === playerState.uid ||
      playerState.deck.length === 0 ||
      (playerState as any).canglanBattleSupportResolvedTurn === gameState.turnCount
    ) {
      return false;
    }

    const attackerIds = new Set(event.data?.attackerIds || gameState.battleState?.attackers || []);
    const playerMarker = playerState as any;
    if (
      playerMarker.canglanBattleSupportTurn === gameState.turnCount &&
      playerMarker.canglanBattleSupportSourceCardId === instance.gamecardId &&
      attackerIds.has(playerMarker.canglanBattleSupportTargetId)
    ) {
      return true;
    }

    return ownUnits(playerState).some(unit => {
      const data = (unit as any).data || {};
      return attackerIds.has(unit.gamecardId) &&
        data.canglanBattleSupportTurn === gameState.turnCount &&
        data.canglanBattleSupportControllerUid === playerState.uid &&
        data.canglanBattleSupportSourceCardId === instance.gamecardId;
    });
  },
  execute: async (instance, gameState, playerState) => {
    (playerState as any).canglanBattleSupportResolvedTurn = gameState.turnCount;
    if (playerState.deck.length > 0) {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
    }

    if (playerState.hand.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.hand,
      '选择舍弃手牌',
      '选择1张手牌舍弃。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104000271_battle_destroy_draw_discard', step: 'DISCARD' },
      () => 'HAND'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'DISCARD') return;
    const discard = selections[0] ? playerState.hand.find(card => card.gamecardId === selections[0]) : undefined;
    if (!discard) return;
    moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', instance);
  }
};

const effect_104000271_main_bounce: CardEffect = {
  id: '104000271_main_bounce',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '【启】侵蚀4-6，1回合1次，主要阶段，选择对手战场上的1张非神蚀卡，横置此卡并放逐墓地中白/蓝/绿中的2种颜色的卡各1张：将被选择的卡返回持有者手牌。',
  condition: canUseMainBounce,
  targetSpec: {
    title: '选择返回手牌目标',
    description: '选择对手战场上的1张非神蚀卡。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) =>
      opponentNonGodFieldTargets(gameState, playerState).map(card => ({ card, source: card.cardlocation as any }))
  },
  cost: async (gameState, playerState, instance) => {
    if (!exhaustByEffect(gameState, playerState, instance, instance)) return false;
    const candidates = playerState.grave.filter((card: Card) => matchesAnyColor(card, GRAVE_COST_COLORS));
    if (!hasTwoColorGraveCost(playerState, GRAVE_COST_COLORS)) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择墓地费用',
      '选择墓地中白色、蓝色、绿色中的2种颜色的卡各1张放逐。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '104000271_main_bounce', costType: 'SP02_B04_TWO_COLOR_GRAVE_EXILE' },
      () => 'GRAVE'
    );
    return true;
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType === 'SP02_B04_TWO_COLOR_GRAVE_EXILE') {
      if (!payTwoColorGraveCost(gameState, playerState, instance, selections, GRAVE_COST_COLORS)) {
        context.cancelActivation = true;
      }
      return;
    }

    const targetId = selections[0] || context?.declaredTargets?.[0]?.gamecardId;
    const target = targetId ? AtomicEffectExecutor.findCardById(gameState, targetId) : undefined;
    if (!target || !isNonGodFieldCard(target)) return;
    const ownerUid = ownerUidOf(gameState, target);
    if (!ownerUid || ownerUid === playerState.uid) return;
    moveCard(gameState, ownerUid, target, 'HAND', instance);
  }
};

const card: Card = {
  id: '104000271',
  gamecardId: null as any,
  fullName: '兽神之助攻【苍蓝】',
  specialName: '苍蓝',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { 'BLUE': 1 },
  faction: '无',
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
  effects: [
    effect_104000271_battle_support,
    effect_104000271_battle_destroy_draw_discard,
    effect_104000271_main_bounce
  ],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP02',
  uniqueId: null,
};

export default card;
