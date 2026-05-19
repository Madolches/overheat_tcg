import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addTempDamage,
  addTempPower,
  battlingUnits,
  canPutUnitOntoBattlefield,
  createPlayerSelectQuery,
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

const effect_102050276_irodori_enter: CardEffect = {
  id: '102050276_irodori_enter',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '【启】【异彩3】同名1回合1次，将墓地3种颜色的非神蚀单位各1张放逐：将手牌中的这张卡放置到战场上。',
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
  triggerLocation: ['UNIT'],
  description: '这个单位参与的战斗的战斗自由步骤开始时，将你的战场上的1个黄色或蓝色非神蚀单位送入墓地：这次战斗中，这个单位伤害+2、力量+1500。',
  condition: (gameState, playerState, instance) =>
    gameState.phase === 'BATTLE_FREE' &&
    battlingUnits(gameState).some(unit => unit.gamecardId === instance.gamecardId) &&
    ownUnits(playerState).some(isYellowOrBlueNonGodUnit),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(isYellowOrBlueNonGodUnit),
      '选择送入墓地的单位',
      '选择你战场上的1个黄色或蓝色非神蚀单位送入墓地，使此单位本次战斗伤害+2、力量+1500。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050276_battle_boost', step: 'SAC' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'SAC') return;
    if (!sacrificeYellowOrBlueNonGodUnit(gameState, playerState, instance, selections)) return;
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
  description: '【启】同名1回合1次，你的主要阶段中，选择1名对手，将你的战场上的1个黄色或蓝色非神蚀单位送入墓地：给予选择的玩家2点伤害。',
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    ownUnits(playerState).some(isYellowOrBlueNonGodUnit),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(isYellowOrBlueNonGodUnit),
      '选择送入墓地的单位',
      '选择你战场上的1个黄色或蓝色非神蚀单位送入墓地，之后给予对手2点伤害。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050276_main_damage', step: 'SAC' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'SAC') {
      if (!sacrificeYellowOrBlueNonGodUnit(gameState, playerState, instance, selections)) return;
      createPlayerSelectQuery(
        gameState,
        playerState.uid,
        '选择对手',
        '选择1名对手，给予他2点伤害。',
        { sourceCardId: instance.gamecardId, effectId: '102050276_main_damage', step: 'DAMAGE' },
        { includeSelf: false, includeOpponent: true }
      );
      return;
    }

    if (context?.step !== 'DAMAGE') return;
    await damagePlayerByEffect(gameState, playerState.uid, getOpponentUid(gameState, playerState.uid), 2, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050276
 * Card2 Row: 435
 * Card Row: 318
 * Source CardNo: SP02-R01
 * Package: SP02(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】【异彩3】（〖同名1回合1次〗[将你的墓地中的3种颜色的非神蚀单位卡各1张放逐]:将手牌中的这张卡放置到战场上）。
 * 【诱】{这个单位参与的战斗的战斗自由步骤开始时}[将你的战场上的1个黄色或蓝色非神蚀单位送入墓地]:这次战斗中，你可以使这个单位+2+1500。
 * 【启】〖同名1回合1次〗{你的主要阶段中，选择1名对手}[将你的战场上的1个黄色或蓝色非神蚀单位送入墓地]:给予选择的玩家2点伤害。
 */
const card: Card = {
  id: '102050276',
  fullName: '炽月·女王「凯萨琳」',
  specialName: '凯萨琳',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 3 },
  faction: '伊列宇王国',
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
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
