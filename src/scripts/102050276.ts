import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addTempDamage,
  addTempPower,
  battlingUnits,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  damagePlayerByEffect,
  getOpponentUid,
  moveCardAsCost,
  ownUnits,
  putUnitOntoField
} from './BaseUtil';

const isYellowOrBlueNonGodUnit = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  (AtomicEffectExecutor.matchesColor(card, 'YELLOW') || AtomicEffectExecutor.matchesColor(card, 'BLUE'));

const differentColorNonGodUnitsInGrave = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.type === 'UNIT' && !card.godMark);

const hasIrodoriThreeCost = (playerState: any) =>
  new Set(differentColorNonGodUnitsInGrave(playerState).map((card: Card) => card.color)).size >= 3;

const payIrodoriThreeCost = (gameState: any, playerState: any, instance: Card, selections: string[]) => {
  const selected = selections
    .map(id => playerState.grave.find((card: Card) => card.gamecardId === id))
    .filter((card: Card | undefined): card is Card => !!card && card.type === 'UNIT' && !card.godMark);
  const colors = new Set(selected.map(card => card.color));
  if (selected.length !== 3 || colors.size !== 3) return false;

  selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
  return true;
};

const sacrificeYellowOrBlueNonGodUnit = (gameState: any, playerState: any, instance: Card, selections: string[]) => {
  const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
  if (
    !target ||
    target.cardlocation !== 'UNIT' ||
    AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) !== playerState.uid ||
    !isYellowOrBlueNonGodUnit(target)
  ) {
    return false;
  }
  moveCardAsCost(gameState, playerState.uid, target, 'GRAVE', instance);
  return true;
};

const yellowOrBlueNonGodUnitCost = (effectId: string): CardEffect['cost'] => async (gameState, playerState, instance) => {
  const candidates = ownUnits(playerState).filter(isYellowOrBlueNonGodUnit);
  if (candidates.length === 0) return false;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    candidates,
    '选择费用单位',
    '选择你的战场上的1个黄色或蓝色非神蚀单位送入墓地作为费用。',
    1,
    1,
    {
      sourceCardId: instance.gamecardId,
      effectId,
      costType: '102050276_SAC_YELLOW_BLUE',
      skipEffectResolveAfterCost: true
    },
    () => 'UNIT'
  );
  return true;
};

const resolveYellowOrBlueNonGodUnitCost: CardEffect['onCostResolve'] = async (
  instance,
  gameState,
  playerState,
  selections,
  context
) => {
  if (context?.costType !== '102050276_SAC_YELLOW_BLUE') return;
  if (!sacrificeYellowOrBlueNonGodUnit(gameState, playerState, instance, selections)) {
    context.cancelActivation = true;
  }
};

const effect_102050276_irodori_enter: CardEffect = {
  id: '102050276_irodori_enter',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '【启】【异彩】将墓地3种颜色的非神蚀单位各1张放逐：将手牌中的这张卡放置到战场上。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'HAND' &&
    playerState.isTurn &&
    canPutUnitOntoBattlefield(playerState, instance) &&
    hasIrodoriThreeCost(playerState),
  cost: async (gameState, playerState, instance) => {
    const candidates = differentColorNonGodUnitsInGrave(playerState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择异彩费用',
      '选择墓地中3种颜色的非神蚀单位卡各1张放逐。',
      3,
      3,
      { sourceCardId: instance.gamecardId, effectId: '102050276_irodori_enter', costType: 'SP02_R01_IRODORI3' },
      () => 'GRAVE'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    putUnitOntoField(gameState, playerState.uid, instance, instance);
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType !== 'SP02_R01_IRODORI3') return;
    if (!payIrodoriThreeCost(gameState, playerState, instance, selections)) {
      context.cancelActivation = true;
    }
  }
};

const effect_102050276_battle_boost: CardEffect = {
  id: '102050276_battle_boost',
  type: 'TRIGGER',
  triggerEvent: ['PHASE_CHANGED', 'CARD_DEFENSE_DECLARED'],
  isMandatory: false,
  triggerLocation: ['UNIT'],
  description: '这个单位参与的战斗的战斗自由步骤开始时，将你的战场上的1个黄色或蓝色非神蚀单位送入墓地：这次战斗中，这个单位伤害+2、力量+1500。',
  condition: (gameState, playerState, instance) =>
    gameState.phase === 'BATTLE_FREE' &&
    battlingUnits(gameState).some(unit => unit.gamecardId === instance.gamecardId) &&
    ownUnits(playerState).some(isYellowOrBlueNonGodUnit),
  cost: yellowOrBlueNonGodUnitCost('102050276_battle_boost'),
  onCostResolve: resolveYellowOrBlueNonGodUnitCost,
  execute: async (instance, gameState) => {
    addTempDamage(instance, instance, 2);
    addTempPower(instance, instance, 1500);
    gameState.logs.push(`[${instance.fullName}] 本次战斗中伤害+2、力量+1500。`);
  }
};

const effect_102050276_main_damage: CardEffect = {
  id: '102050276_main_damage',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '【启】同名1回合1次，主要阶段，选择1名对手，将你的战场上的1个黄色或蓝色非神蚀单位送入墓地：给予选择的玩家2点伤害。',
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    ownUnits(playerState).some(isYellowOrBlueNonGodUnit),
  cost: yellowOrBlueNonGodUnitCost('102050276_main_damage'),
  onCostResolve: resolveYellowOrBlueNonGodUnitCost,
  execute: async (instance, gameState, playerState) => {
    await damagePlayerByEffect(gameState, playerState.uid, getOpponentUid(gameState, playerState.uid), 2, instance);
  }
};

const card: Card = {
  id: '102050276',
  fullName: '\u70bd\u6708\u00b7\u5973\u738b\u300c\u51ef\u8428\u7433\u300d',
  specialName: '\u51ef\u8428\u7433',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 3 },
  faction: '\u4f0a\u5217\u5b87\u738b\u56fd',
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
  effects: [effect_102050276_irodori_enter, effect_102050276_battle_boost, effect_102050276_main_damage],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
