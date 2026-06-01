import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addTempDamage, addTempKeyword, addTempPower, canPutUnitOntoBattlefield, createSelectCardQuery, erosionCost, isNonGodUnit, moveCard, moveCardAsCost, ownUnits, recordUnitSentFromFieldToGrave } from './BaseUtil';

const isWitchUnit = (card: Card) => card.type === 'UNIT' && card.fullName.includes('魔女');

const cardEffects: CardEffect[] = [{
  id: '103100133_sac_boost',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '将X个自己的非神蚀单位送入墓地：本回合伤害+X、力量+X000。X大于2时获得英勇、歼灭。',
  condition: (_gameState, playerState) => ownUnits(playerState).some(isNonGodUnit),
  cost: async (gameState, playerState, instance) => {
    const candidates = ownUnits(playerState).filter(isNonGodUnit);
    if (candidates.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      'Select cost units',
      'Select X of your non-god units to send to grave as cost.',
      1,
      candidates.length,
      {
        sourceCardId: instance.gamecardId,
        effectId: '103100133_sac_boost',
        step: 'SAC_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      () => 'UNIT'
    );
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'SAC_COST') return;
    const selectedIds = new Set(selections);
    const targets = ownUnits(playerState).filter(unit => selectedIds.has(unit.gamecardId) && isNonGodUnit(unit));
    if (targets.length === 0 || targets.length !== selectedIds.size) {
      context.cancelActivation = true;
      return;
    }
    targets.forEach(unit => {
      moveCardAsCost(gameState, playerState.uid, unit, 'GRAVE', instance);
      recordUnitSentFromFieldToGrave(gameState, playerState.uid, unit);
    });
    const data = ((instance as any).data = (instance as any).data || {});
    data.sacBoostCostX = targets.length;
    data.sacBoostCostTurn = gameState.turnCount;
    data.sacBoostCostActivationId = instance.gamecardId;
  },
  execute: async (instance, gameState, playerState) => {
    const data = (instance as any).data || {};
    const paidX = data.sacBoostCostTurn === gameState.turnCount && data.sacBoostCostActivationId === instance.gamecardId
      ? Number(data.sacBoostCostX || 0)
      : 0;
    if (paidX > 0) {
      addTempDamage(instance, instance, paidX);
      addTempPower(instance, instance, paidX * 1000);
      if (paidX > 2) {
        addTempKeyword(instance, instance, 'heroic');
        addTempKeyword(instance, instance, 'annihilation');
      }
      return;
    }

    const candidates = ownUnits(playerState).filter(isNonGodUnit);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择送入墓地的单位',
      '选择你的战场上的X个非神蚀单位送入墓地。',
      1,
      candidates.length,
      { sourceCardId: instance.gamecardId, effectId: '103100133_sac_boost' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const targets = ownUnits(playerState).filter(unit => selections.includes(unit.gamecardId) && !unit.godMark);
    targets.forEach(unit => {
      moveCardAsCost(gameState, playerState.uid, unit, 'GRAVE', instance);
      recordUnitSentFromFieldToGrave(gameState, playerState.uid, unit);
    });
    const x = targets.length;
    if (x <= 0) return;
    addTempDamage(instance, instance, x);
    addTempPower(instance, instance, x * 1000);
    if (x > 2) {
      addTempKeyword(instance, instance, 'heroic');
      addTempKeyword(instance, instance, 'annihilation');
    }
  }
}, {
  id: '103100133_ten_revive_witches',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  erosionTotalLimit: [10, 10],
  description: '10+：侵蚀3，将墓地中卡名含《魔女》的非神蚀单位尽可能多地放置到战场。',
  condition: (_gameState, playerState) =>
    playerState.unitZone.some(slot => slot === null) &&
    playerState.grave.some(card => isWitchUnit(card) && !card.godMark && canPutUnitOntoBattlefield(playerState, card)),
  cost: erosionCost(3),
  execute: async (instance, gameState, playerState) => {
    const slots = playerState.unitZone.filter(slot => slot === null).length;
    const candidates = playerState.grave.filter(card =>
      isWitchUnit(card) &&
      !card.godMark &&
      canPutUnitOntoBattlefield(playerState, card)
    );
    const count = Math.min(slots, candidates.length);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择复活的魔女',
      `选择${count}张卡名含有《魔女》的非神蚀单位卡，放置到战场上。`,
      count,
      count,
      { sourceCardId: instance.gamecardId, effectId: '103100133_ten_revive_witches' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    selections
      .map(id => AtomicEffectExecutor.findCardById(gameState, id))
      .filter((card): card is Card => !!card && card.cardlocation === 'GRAVE')
      .forEach(card => moveCard(gameState, playerState.uid, card, 'UNIT', instance));
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103100133
 * Card2 Row: 111
 * Card Row: 111
 * Source CardNo: BT02-G05
 * Package: BT02(SR,ESR,OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗:[将你的战场上的X个非神蚀单位送入墓地]本回合中，这个单位〖伤害+X〗〖力量+X000〗。若X大于2，本回合中，这个单位获得【英勇】【歼灭】。
 * 〖10+〗【启】〖1回合1次〗:[〖侵蚀3〗]将你的墓地中的卡名含有《魔女》的非神蚀单位卡尽可能多地放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103100133',
  fullName: '黄昏的魔女「柯莉尔」',
  specialName: '柯莉尔',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '艾柯利普斯',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 1,
  baseDamage: 1,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: false,
  isHeroic: false,
  baseAnnihilation: false,
  baseHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
