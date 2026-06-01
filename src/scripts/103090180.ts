import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addTempDamage, addTempPower, canPutUnitOntoBattlefield, createSelectCardQuery, erosionCost, moveCard, ownUnits } from './BaseUtil';

const boostCostUnits = (gameState: any, playerState: any) =>
  ownUnits(playerState).filter(unit =>
    !unit.isExhausted &&
    !((unit as any).data?.cannotExhaustUntilTurn >= gameState.turnCount)
  );

const cardEffects: CardEffect[] = [{
  id: '103090180_exhaust_boost',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '横置你的X个单位：选择你的1个单位，本回合伤害+X、力量+X000。X不能小于2。',
  condition: (gameState, playerState) => boostCostUnits(gameState, playerState).length >= 2 && ownUnits(playerState).length > 0,
  targetSpec: {
    title: '选择获得增益的单位',
    description: '选择你的1个单位，本回合伤害+X、力量+X000。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      ownUnits(playerState).map(card => ({ card, source: 'UNIT' as any }))
  },
  cost: async (gameState, playerState, instance) => {
    const candidates = boostCostUnits(gameState, playerState);
    if (candidates.length < 2) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择横置的单位',
      '选择要横置的X个单位。X不能小于2。',
      2,
      candidates.length,
      {
        sourceCardId: instance.gamecardId,
        effectId: '103090180_exhaust_boost',
        step: 'EXHAUST_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      () => 'UNIT'
    );
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'EXHAUST_COST') return;
    const selected = selections
      .map(id => boostCostUnits(gameState, playerState).find(unit => unit.gamecardId === id))
      .filter((unit): unit is Card => !!unit);
    if (selected.length !== selections.length || selected.length < 2 || new Set(selected.map(unit => unit.gamecardId)).size !== selected.length) {
      context.cancelActivation = true;
      return;
    }

    selected.forEach(unit => { unit.isExhausted = true; });
    (instance as any).data = {
      ...((instance as any).data || {}),
      exhaustBoostCostX: selected.length,
      exhaustBoostCostTurn: gameState.turnCount
    };
  },
  execute: async (instance, gameState, playerState) => {
    const data = (instance as any).data || {};
    const x = data.exhaustBoostCostTurn === gameState.turnCount ? Number(data.exhaustBoostCostX || 0) : 0;
    if ((instance as any).data) {
      delete (instance as any).data.exhaustBoostCostX;
      delete (instance as any).data.exhaustBoostCostTurn;
    }
    if (x < 2) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState),
      '选择获得增益的单位',
      `选择你的1个单位，本回合伤害+${x}、力量+${x * 1000}。`,
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103090180_exhaust_boost', step: 'TARGET', x },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      const data = (instance as any).data || {};
      const storedX = data.exhaustBoostCostTurn === gameState.turnCount ? Number(data.exhaustBoostCostX || 0) : 0;
      const x = Number(context.x || storedX || 0);
      if ((instance as any).data) {
        delete (instance as any).data.exhaustBoostCostX;
        delete (instance as any).data.exhaustBoostCostTurn;
      }
      if (target?.cardlocation === 'UNIT' && ownUnits(playerState).some(unit => unit.gamecardId === target.gamecardId) && x >= 2) {
        addTempDamage(target, instance, x);
        addTempPower(target, instance, x * 1000);
      }
      return;
    }
  }
}, {
  id: '103090180_ten_revive',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  erosionTotalLimit: [10, 10],
  description: '10+，1回合1次，侵蚀3：选择墓地最多2张力量2000以下<瑟诺布>单位放置到战场。',
  condition: (_gameState, playerState) =>
    playerState.grave.some(card => card.type === 'UNIT' && card.faction === '瑟诺布' && (card.power || card.basePower || 0) <= 2000) &&
    playerState.unitZone.some(slot => slot === null),
  cost: erosionCost(3),
  targetSpec: {
    title: '选择放置到战场的单位',
    description: '选择墓地中的最多2张力量2000以下<瑟诺布>单位卡，放置到战场。',
    minSelections: 0,
    maxSelections: 2,
    zones: ['GRAVE'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      playerState.grave
        .filter(card => card.type === 'UNIT' && card.faction === '瑟诺布' && (card.power || card.basePower || 0) <= 2000)
        .map(card => ({ card, source: 'GRAVE' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    const emptySlots = playerState.unitZone.filter(slot => slot === null).length;
    const targets = playerState.grave.filter(card => card.type === 'UNIT' && card.faction === '瑟诺布' && (card.power || card.basePower || 0) <= 2000);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择放置到战场的单位',
      '选择墓地中的最多2张力量2000以下<瑟诺布>单位卡，放置到战场。',
      0,
      Math.min(2, emptySlots, targets.length),
      { sourceCardId: instance.gamecardId, effectId: '103090180_ten_revive' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    selections.forEach(id => {
      const card = playerState.grave.find(candidate => candidate.gamecardId === id);
      if (card && canPutUnitOntoBattlefield(playerState, card)) moveCard(gameState, playerState.uid, card, 'UNIT', instance);
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090180
 * Card2 Row: 193
 * Card Row: 193
 * Source CardNo: BT03-G02
 * Package: BT03(SR,ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】:[将你的战场上的X个单位横置]选择你的1个单位，本回合中〖伤害+X〗〖力量+X000〗。（X不能小于2）
 * 〖10+〗【启】〖1回合1次〗:[〖侵蚀3〗]选择你的墓地中的最多2张〖力量2000〗以下的<瑟诺布>单位卡，将其放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103090180',
  fullName: '链风者「萨利和」',
  specialName: '萨利和',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '瑟诺布',
  acValue: 4,
  power: 2000,
  basePower: 2000,
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
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
