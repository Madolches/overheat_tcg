import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addTempPowerUntilEndOfTurn,
  canActivateDefaultTiming,
  createSelectCardQuery,
  moveCardAsCost,
  ownUnits,
  recordSoulDevourActivation,
  recordUnitSentFromFieldToGrave,
  totalErosionCount
} from './BaseUtil';

const ownOtherNonGodUnits = (playerState: any, instance: Card) =>
  ownUnits(playerState).filter(unit => unit.gamecardId !== instance.gamecardId && !unit.godMark);

const cardEffects: CardEffect[] = [{
  id: '102060393_soul_devour_power',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '噬魂：你的主要阶段，将这个单位以外的1个己方非神蚀单位送入墓地作为费用，本回合中你的所有单位力量+500。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    canActivateDefaultTiming(gameState, playerState) &&
    ownOtherNonGodUnits(playerState, instance).length > 0,
  cost: async (gameState, playerState, instance) => {
    const costs = ownOtherNonGodUnits(playerState, instance);
    if (costs.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costs,
      '选择噬魂费用',
      '选择这个单位以外的1个己方非神蚀单位送入墓地作为费用。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '102060393_soul_devour_power',
        step: 'SOUL_DEVOUR_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      () => 'UNIT'
    );
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'SOUL_DEVOUR_COST') return;
    const costUnit = ownOtherNonGodUnits(playerState, instance).find(unit => unit.gamecardId === selections[0]);
    if (!costUnit) {
      context.cancelActivation = true;
      return;
    }
    moveCardAsCost(gameState, playerState.uid, costUnit, 'GRAVE', instance);
    recordUnitSentFromFieldToGrave(gameState, playerState.uid, costUnit);
    recordSoulDevourActivation(gameState, playerState);
  },
  execute: async (instance, gameState, playerState) => {
    ownUnits(playerState).forEach(unit => addTempPowerUntilEndOfTurn(unit, instance, 500, gameState));
  }
}, {
  id: '102060393_draw_on_unit_cost_grave',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_ZONE',
  triggerLocation: ['UNIT'],
  isMandatory: true,
  isGlobal: true,
  limitCount: 1,
  limitNameType: true,
  description: '5~8，同名1回合1次：你的单位由于卡能力的费用从战场送入墓地时，抽1张卡。',
  condition: (gameState, playerState, _instance, event) =>
    totalErosionCount(playerState) >= 5 &&
    totalErosionCount(playerState) <= 8 &&
    event?.playerUid === playerState.uid &&
    event.sourceCard?.type === 'UNIT' &&
    (event.sourceCard as any).data?.lastMovedAsCostTurn === gameState.turnCount &&
    !!(event.sourceCard as any).data?.lastMovedAsCostSourceCardId &&
    event.data?.targetZone === 'GRAVE' &&
    (event.data?.sourceZone === 'UNIT' || event.data?.zone === 'UNIT') &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
}];

const card: Card = {
  id: '102060393',
  fullName: '噬魂术士',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '闆烽渾',
  acValue: 2,
  power: 1000,
  basePower: 1000,
  damage: 0,
  baseDamage: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
