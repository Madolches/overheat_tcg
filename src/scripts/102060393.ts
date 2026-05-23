import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addTempPowerUntilEndOfTurn, canActivateDefaultTiming, createSelectCardQuery, moveCardAsCost, ownUnits, totalErosionCount } from './BaseUtil';

const ownOtherNonGodUnits = (playerState: any, instance: Card) =>
  ownUnits(playerState).filter(unit => unit.gamecardId !== instance.gamecardId && !unit.godMark);

const cardEffects: CardEffect[] = [{
  id: '102060393_soul_devour_power',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '噬魂：你的主要阶段，将这个单位以外的1个己方非神蚀单位送入墓地，本回合中你的所有单位力量+500。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    canActivateDefaultTiming(gameState, playerState) &&
    ownOtherNonGodUnits(playerState, instance).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownOtherNonGodUnits(playerState, instance),
      '选择噬魂费用',
      '选择这个单位以外的1个己方非神蚀单位送入墓地。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102060393_soul_devour_power' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = ownOtherNonGodUnits(playerState, instance).find(unit => unit.gamecardId === selections[0]);
    if (!target) return;
    moveCardAsCost(gameState, playerState.uid, target, 'GRAVE', instance);
    ownUnits(playerState).forEach(unit => addTempPowerUntilEndOfTurn(unit, instance, 500, gameState));
  }
}, {
  id: '102060393_draw_on_unit_cost_grave',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_ZONE',
  triggerLocation: ['UNIT'],
  isMandatory: false,
  isGlobal: true,
  limitCount: 1,
  limitNameType: true,
  description: '5~8，同名1回合1次：你的单位由于卡能力费用从战场送入墓地时，抽1张卡。',
  condition: (gameState, playerState, _instance, event) =>
    totalErosionCount(playerState) >= 5 &&
    totalErosionCount(playerState) <= 8 &&
    event?.playerUid === playerState.uid &&
    event.data?.isEffect === false &&
    event.data?.targetZone === 'GRAVE' &&
    (event.data?.sourceZone === 'UNIT' || event.data?.zone === 'UNIT') &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102060393
 * Card2 Row: 600
 * Card Row: 484
 * Source CardNo: BT08-R07
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】噬魂〖1回合1次〗{你的主要阶段}[将这个单位以外你的战场上的的1个非神蚀单位送入墓地]:本回合中，你的所有单位〖力量+500〗。    
 * 〖5~8〗【诱】〖同名1回合1次〗{你的单位由于卡的能力的费用从战场上送入墓地时}:抽1张卡。
 */
const card: Card = {
  id: '102060393',
  fullName: '噬魂术士',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '雷霆',
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
