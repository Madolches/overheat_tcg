import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canActivateDefaultTiming, createSelectCardQuery, ensureData, markCanAttackAnyUnit, moveCardAsCost, ownUnits, wasPlacedByPromotion } from './BaseUtil';

const ownNonGodUnits = (playerState: any) => ownUnits(playerState).filter(unit => !unit.godMark);
const redDiscardCosts = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId && card.color === 'RED');

const grantAttackAnyThisTurn = (target: Card, source: Card, gameState: any) => {
  markCanAttackAnyUnit(target, source);
  const data = ensureData(target);
  data.canAttackAnyUnitUntilTurn = gameState.turnCount;
};

const cardEffects: CardEffect[] = [{
  id: '102050392_promotion_all_units_attack_units',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '这个单位由于晋升进入战场时，你的所有单位可以攻击对手的单位。',
  applyContinuous: (gameState, instance) => {
    const owner = Object.values((gameState as any).players)
      .find((player: any) => player.unitZone.some((unit: Card | null) => unit?.gamecardId === instance.gamecardId));
    if (!owner || !wasPlacedByPromotion(instance)) return;
    ownUnits(owner as any).forEach(unit => markCanAttackAnyUnit(unit, instance));
  }
}, {
  id: '102050392_hand_grant_attack_units',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  description: '展示手牌中的这张卡并舍弃另1张红色手牌：本回合中，你的1个非神蚀单位可以攻击对手单位。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'HAND' &&
    canActivateDefaultTiming(gameState, playerState) &&
    redDiscardCosts(playerState, instance).length > 0 &&
    ownNonGodUnits(playerState).length > 0,
  cost: async (gameState, playerState, instance) => {
    const candidates = redDiscardCosts(playerState, instance);
    if (candidates.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择舍弃费用',
      '选择这张卡以外的1张红色手牌舍弃。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '102050392_hand_grant_attack_units',
        costType: 'DISCARD_HAND_COST',
        discardCostAmount: 1
      },
      () => 'HAND'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    gameState.logs.push(`[${instance.fullName}] revealed itself from hand.`);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownNonGodUnits(playerState),
      '选择赋予攻击单位能力的单位',
      '选择你的1个非神蚀单位，本回合中可以攻击对手单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050392_hand_grant_attack_units', step: 'TARGET' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择赋予攻击单位能力的单位',
    description: '选择你的1个非神蚀单位，本回合中可以攻击对手单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      ownNonGodUnits(playerState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const target = ownNonGodUnits(playerState).find(unit => unit.gamecardId === selections[0]);
      if (!target) return;
      grantAttackAnyThisTurn(target, instance, gameState);
      return;
    }
    if (context?.step !== 'DISCARD') return;
    // Legacy fallback for stack entries created before targetSpec/cost separation.
    const discard = redDiscardCosts(playerState, instance).find((card: Card) => card.gamecardId === selections[0]);
    const target = context?.targetId ? AtomicEffectExecutor.findCardById(gameState, context.targetId) : undefined;
    if (!discard || !target || target.cardlocation !== 'UNIT' || target.godMark) return;
    moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', instance);
    grantAttackAnyThisTurn(target, instance, gameState);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050392
 * Card2 Row: 599
 * Card Row: 483
 * Source CardNo: BT08-R06
 * Package: BT08(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】{这个单位由于晋升进入战场}:你的战场上的所有单位可以攻击对手的单位。
 * 【启】{展示手牌中的这张卡，选择你战场上的1个非神蚀单位}[舍弃这张卡以外的1张红色手牌]:本回合中，被选择的单位可以攻击对手的单位。
 */
const card: Card = {
  id: '102050392',
  fullName: '千剑长「库里姆森」',
  specialName: '库里姆森',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '伊列宇王国',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
