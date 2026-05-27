import { Card, CardEffect } from '../types/game';
import { canActivateDefaultTiming, createSelectCardQuery, destroyByEffect, isNonGodUnit, moveCard, ownUnits } from './BaseUtil';

const SERNOBU = '瑟诺布';
const CONDUCTOR = '银乐协奏师';

const costUnits = (playerState: any, instance: Card) =>
  ownUnits(playerState).filter(unit =>
    unit.gamecardId !== instance.gamecardId &&
    unit.faction === SERNOBU &&
    !unit.fullName.includes(CONDUCTOR)
  );

const nonGodUnitTargets = (gameState: any) =>
  Object.values(gameState.players)
    .flatMap((player: any) => player.unitZone)
    .filter((unit: Card | null): unit is Card => !!unit && isNonGodUnit(unit));

const cardEffects: CardEffect[] = [{
  id: '103090417_sacrifice_sernobu_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：主要阶段，选择战场上1个非神蚀单位，将你战场上2个《银乐协奏师》以外的<瑟诺布>单位送入墓地，破坏被选择单位。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    costUnits(playerState, instance).length >= 2 &&
    nonGodUnitTargets(gameState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodUnitTargets(gameState),
      '选择破坏目标',
      '选择战场上的1个非神蚀单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103090417_sacrifice_sernobu_destroy', step: 'TARGET' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择破坏目标',
    description: '选择战场上的1个非神蚀单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState =>
      nonGodUnitTargets(gameState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.declaredTargets?.length && context?.step === 'TARGET') {
      const targetId = selections[0];
      createSelectCardQuery(
        gameState,
        playerState.uid,
        costUnits(playerState, instance),
        '选择送墓单位',
        '选择你战场上2个《银乐协奏师》以外的<瑟诺布>单位送入墓地。',
        2,
        2,
        { sourceCardId: instance.gamecardId, effectId: '103090417_sacrifice_sernobu_destroy', step: 'SERNOBU_SEND', targetId },
        () => 'UNIT'
      );
      return;
    }

    if (context?.step === 'TARGET') {
      const target = nonGodUnitTargets(gameState).find(unit => unit.gamecardId === selections[0]);
      if (!target) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        costUnits(playerState, instance),
        '选择送墓费用',
        '选择你战场上2个《银乐协奏师》以外的<瑟诺布>单位送入墓地。',
        2,
        2,
        { sourceCardId: instance.gamecardId, effectId: '103090417_sacrifice_sernobu_destroy', step: 'COST', targetId: target.gamecardId },
        () => 'UNIT'
      );
      return;
    }
    if (context?.step !== 'COST' && context?.step !== 'SERNOBU_SEND') return;
    // This selection is after the colon, so it is effect movement rather than cost.
    const selectedCosts = selections
      .map(id => costUnits(playerState, instance).find(unit => unit.gamecardId === id))
      .filter((unit): unit is Card => !!unit)
      .slice(0, 2);
    if (selectedCosts.length < 2) return;
    selectedCosts.forEach(unit => {
      moveCard(gameState, playerState.uid, unit, 'GRAVE', instance);
      gameState.logs.push(`[${instance.fullName}] 将 [${unit.fullName}] 送入墓地。`);
    });
    const target = nonGodUnitTargets(gameState).find(unit => unit.gamecardId === context.targetId);
    if (target) destroyByEffect(gameState, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090417
 * Card2 Row: 638
 * Card Row: 522
 * Source CardNo: BT08-G01
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗{你的主要阶段，选择战场上的1个非神蚀单位}:将你战场上的2个《银乐协奏师》以外的<瑟诺布>单位送入墓地。将被选择的单位破坏。
 */
const card: Card = {
  id: '103090417',
  fullName: '银乐协奏师',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '瑟诺布',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
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
