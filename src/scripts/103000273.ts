import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addTempDamage,
  addTempPower,
  createSelectCardQuery,
  ownItems,
  ownUnits,
  readyByEffect
} from './BaseUtil';

const hasWhiteOrBlueUnit = (playerState: any) =>
  ownUnits(playerState).some(unit =>
    AtomicEffectExecutor.matchesColor(unit, 'WHITE') ||
    AtomicEffectExecutor.matchesColor(unit, 'BLUE')
  );

const isVictoriaUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (
    card.fullName.includes('维多利亚') ||
    !!card.specialName?.includes('维多利亚')
  );

const ownFieldCards = (playerState: any) => [
  ...ownUnits(playerState),
  ...ownItems(playerState)
];

const canExhaustForWhiteBlueCost = (card: Card) =>
  !card.isExhausted &&
  (
    AtomicEffectExecutor.matchesColor(card, 'WHITE') ||
    AtomicEffectExecutor.matchesColor(card, 'BLUE')
  );

const hasWhiteBlueExhaustCost = (playerState: any) => {
  const candidates = ownFieldCards(playerState).filter(canExhaustForWhiteBlueCost);
  return candidates.some(card => AtomicEffectExecutor.matchesColor(card, 'WHITE')) &&
    candidates.some(card => AtomicEffectExecutor.matchesColor(card, 'BLUE')) &&
    candidates.length >= 2;
};

const createWhiteBlueExhaustCostQuery = (gameState: any, playerState: any, instance: Card) => {
  const candidates = ownFieldCards(playerState).filter(canExhaustForWhiteBlueCost);
  createSelectCardQuery(
    gameState,
    playerState.uid,
    candidates,
    '选择横置费用',
    '选择你战场上的白色、蓝色卡各1张横置。',
    2,
    2,
    {
      sourceCardId: instance.gamecardId,
      effectId: '103000273_ready_victoria',
      costType: '103000273_WHITE_BLUE_EXHAUST'
    },
    card => card.cardlocation as any
  );
};

const payWhiteBlueExhaustCost = (gameState: any, playerState: any, selections: string[]) => {
  const selected = selections
    .map(id => ownFieldCards(playerState).find(card => card.gamecardId === id))
    .filter((card: Card | undefined): card is Card => !!card && canExhaustForWhiteBlueCost(card));
  const hasWhite = selected.some(card => AtomicEffectExecutor.matchesColor(card, 'WHITE'));
  const hasBlue = selected.some(card => AtomicEffectExecutor.matchesColor(card, 'BLUE'));
  if (selected.length !== 2 || new Set(selected.map(card => card.gamecardId)).size !== 2 || !hasWhite || !hasBlue) {
    return false;
  }

  selected.forEach(card => {
    card.isExhausted = true;
  });
  gameState.logs.push(`[费用] 横置了 ${selected.map(card => `[${card.fullName}]`).join('、')}。`);
  return true;
};

const effect_103000273_enter_boost: CardEffect = {
  id: '103000273_enter_boost',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '【诱】同名1回合1次，你的战场上有白色或蓝色单位，这个单位进入战场时，选择你的1个非神蚀单位：本回合中，其伤害+1、力量+500。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    hasWhiteOrBlueUnit(playerState) &&
    ownUnits(playerState).some(unit => !unit.godMark),
  execute: async (instance, gameState, playerState) => {
    const candidates = ownUnits(playerState).filter(unit => !unit.godMark);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择强化单位',
      '选择你的1个非神蚀单位，本回合中伤害+1、力量+500。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000273_enter_boost' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT' || target.godMark) return;
    addTempDamage(target, instance, 1);
    addTempPower(target, instance, 500);
  }
};

const effect_103000273_ready_victoria: CardEffect = {
  id: '103000273_ready_victoria',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '【启】选择你的1个「维多利亚」单位，横置你战场上的白色、蓝色卡各1张：将其重置，本回合中力量+1000。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    ownUnits(playerState).some(isVictoriaUnit) &&
    hasWhiteBlueExhaustCost(playerState),
  cost: async (gameState, playerState, instance) => {
    if (!hasWhiteBlueExhaustCost(playerState)) return false;
    createWhiteBlueExhaustCostQuery(gameState, playerState, instance);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(isVictoriaUnit),
      '选择维多利亚单位',
      '选择你的1个「维多利亚」单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000273_ready_victoria', step: 'TARGET' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择维多利亚单位',
    description: '选择你的1个「维多利亚」单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      ownUnits(playerState)
        .filter(isVictoriaUnit)
        .map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType === '103000273_WHITE_BLUE_EXHAUST') {
      if (!payWhiteBlueExhaustCost(gameState, playerState, selections)) {
        context.cancelActivation = true;
      }
      return;
    }

    if (context?.step === 'TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || target.cardlocation !== 'UNIT' || !isVictoriaUnit(target)) return;
      readyByEffect(gameState, target, instance);
      addTempPower(target, instance, 1000);
      return;
    }

    if (context?.step !== 'COST') return;
    // Legacy fallback for saves or stack entries created before targetSpec/cost separation.
    const target = context.targetId ? AtomicEffectExecutor.findCardById(gameState, context.targetId) : undefined;
    if (!target || target.cardlocation !== 'UNIT' || !isVictoriaUnit(target)) return;
    if (!payWhiteBlueExhaustCost(gameState, playerState, selections)) return;
    readyByEffect(gameState, target, instance);
    addTempPower(target, instance, 1000);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000273
 * Card2 Row: 432
 * Card Row: 315
 * Source CardNo: SP02-G02
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{你的战场上有白色或蓝色单位，这个单位进入战场时，选择你的一个非神蚀单位}:本回合中，被选择的单位＋1/＋1500。
 * 【启】{选择一个你的「维多利亚」单位}{将你的战场上的白色、蓝色卡各一张横置}:将被选择的单位重置，本回合中，被选择的单位＋1000。
 */
const card: Card = {
  id: '103000273',
  fullName: '兽神之辅佐「维拉妮卡」',
  specialName: '维拉妮卡',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 2,
  power: 1000,
  basePower: 1000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_103000273_enter_boost, effect_103000273_ready_victoria],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
