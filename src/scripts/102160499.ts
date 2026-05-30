import { Card, CardEffect } from '../types/game';
import { addContinuousKeyword, allUnitsOnField, appendEndResolution, canActivateDuringYourTurn, canPutUnitOntoBattlefield, createSelectCardQuery, ensureData, erosionCost, markCanAttackAnyUnit, moveCard, ownerUidOf, paymentCost, totalErosionCount } from './BaseUtil';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const cardEffects: CardEffect[] = [{
  id: '102160499_mid_continuous',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '2~7：这个单位获得【速攻】，并可以攻击对手的单位。',
  applyContinuous: (gameState, instance) => {
    const owner = Object.values(gameState.players).find(player => player.unitZone.some(unit => unit?.gamecardId === instance.gamecardId));
    if (!owner || totalErosionCount(owner) < 2 || totalErosionCount(owner) > 7) return;
    addContinuousKeyword(instance, instance, 'rush');
    markCanAttackAnyUnit(instance, instance);
  }
}, {
  id: '102160499_interrupt_battle',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'PHASE_CHANGED',
  isMandatory: false,
  erosionTotalLimit: [2, 7],
  cost: paymentCost(1),
  description: '2~7：这个单位参与的战斗伤害判定步骤开始时，可以支付1费中断这次战斗。',
  condition: (gameState, _playerState, instance, event) =>
    event?.data?.phase === 'DAMAGE_CALCULATION' &&
    !!gameState.battleState &&
    [
      ...(gameState.battleState.attackers || []),
      ...(gameState.battleState.defender ? [gameState.battleState.defender] : [])
    ].includes(instance.gamecardId),
  execute: async (_instance, gameState) => {
    gameState.battleState = undefined;
    gameState.phase = 'MAIN';
    gameState.logs.push('[蛊惑之主 欧吉尔] 中断了这次战斗。');
  }
}, {
  id: '102160499_control',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [10, 10],
  erosionFrontLimit: [2, 10],
  limitCount: 1,
  limitNameType: true,
  cost: erosionCost(2),
  description: '10+：你的回合，侵蚀2，选择1个单位，获得其控制权。',
  condition: (gameState, playerState, instance) =>
    canActivateDuringYourTurn(gameState, playerState) &&
    instance.cardlocation === 'UNIT' &&
    allUnitsOnField(gameState).some(unit => {
      const ownerUid = ownerUidOf(gameState, unit);
      return ownerUid === playerState.uid || canPutUnitOntoBattlefield(playerState, unit);
    }),
  targetSpec: {
    title: '选择获得控制权的单位',
    description: '选择1个单位，获得其控制权。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    getCandidates: (gameState, playerState) =>
      allUnitsOnField(gameState)
        .filter(unit => {
          const ownerUid = ownerUidOf(gameState, unit);
          return ownerUid === playerState.uid || canPutUnitOntoBattlefield(playerState, unit);
        })
        .map(card => ({ card, source: 'UNIT' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    const targets = allUnitsOnField(gameState).filter(unit => {
      const ownerUid = ownerUidOf(gameState, unit);
      return ownerUid === playerState.uid || canPutUnitOntoBattlefield(playerState, unit);
    });
    createSelectCardQuery(gameState, playerState.uid, targets, '选择获得控制权的单位', '选择1个单位，获得其控制权。', 1, 1, {
      sourceCardId: instance.gamecardId,
      effectId: '102160499_control'
    }, () => 'UNIT');
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    const ownerUid = target ? ownerUidOf(gameState, target) : undefined;
    if (!target || !ownerUid || target.cardlocation !== 'UNIT') return;
    if (ownerUid !== playerState.uid && !canPutUnitOntoBattlefield(playerState, target)) return;
    if (ownerUid !== playerState.uid) moveCard(gameState, ownerUid, target, 'UNIT', instance, { toPlayerUid: playerState.uid });
    const moved = AtomicEffectExecutor.findCardById(gameState, target.gamecardId);
    if (moved) ensureData(moved).controlChangedBy = instance.fullName;
    appendEndResolution(gameState, playerState.uid, instance, '102160499_control_display_refresh', () => undefined);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102160499
 * Card2 Row: 290
 * Card Row: 646
 * Source CardNo: SF01-R01
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖2~7〗【永】:这个单位获得【速攻】，并可以攻击对手的单位。
 * 〖2~7〗【诱】:[〖+1〗]这个单位参与的战斗的伤害判定步骤开始时，你可以中断这次战斗。
 * 〖10+〗【启】〖同名1回合1次〗:[〖侵蚀2〗]这个能力只能在你的回合中发动。选择1个单位，你获得其控制权。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102160499',
  fullName: '蛊惑之主 欧吉尔',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '御庭院',
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
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
