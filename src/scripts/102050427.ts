import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addContinuousDamage, addContinuousKeyword, addContinuousPower, cardsInZones, getOpponentUid, getOnlyGodMarkUnit, markCannotDefendUntilEndOfTurn, moveCardAsCost } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102050427_lone_god_boost',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '若你的战场上仅有1个神蚀单位，且那个单位ACCESS+5以上，那个单位伤害+1、力量+500并获得【速攻】。',
  applyContinuous: (gameState, instance) => {
    const owner = Object.values(gameState.players).find(player => player.unitZone.some(unit => unit?.gamecardId === instance.gamecardId));
    if (!owner) return;
    const target = getOnlyGodMarkUnit(owner);
    if (!target || (target.acValue || 0) < 5) return;
    addContinuousDamage(target, instance, 1);
    addContinuousPower(target, instance, 500);
    addContinuousKeyword(target, instance, 'rush');
  }
}, {
  id: '102050427_cannot_defend',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：放逐合计2张「赛利亚」，选择对手最多2个力量2000以下单位，本回合不能宣言防御。',
  condition: (gameState, playerState) => {
    if (!playerState.isTurn || gameState.phase !== 'MAIN') return false;
    const costs = cardsInZones(playerState, ['HAND', 'DECK', 'GRAVE']).filter(({ card }) => card.specialName === '赛利亚');
    return costs.length >= 2;
  },
  targetSpec: {
    title: '选择不能防御的单位',
    description: '选择对手最多2个力量2000以下单位，本回合不能宣言防御。',
    minSelections: 0,
    maxSelections: 2,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    step: 'TARGET',
    getCandidates: (gameState, playerState) => {
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      return opponent.unitZone
        .filter((unit): unit is Card => !!unit && (unit.power || 0) <= 2000)
        .map(card => ({ card, source: 'UNIT' as any }));
    }
  },
  cost: async (gameState, playerState, instance) => {
    const costs = cardsInZones(playerState, ['HAND', 'DECK', 'GRAVE']).filter(({ card }) => card.specialName === '赛利亚');
    if (costs.length < 2) return false;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, costs),
      title: '选择放逐费用',
      description: '选择合计2张「赛利亚」放逐作为费用。',
      minSelections: 2,
      maxSelections: 2,
      callbackKey: 'ACTIVATE_COST_RESOLVE',
      context: { sourceCardId: instance.gamecardId, effectId: '102050427_cannot_defend', step: 'COST', skipEffectResolveAfterCost: true }
    };
    return true;
  },
  onCostResolve: async (instance, gameState, _playerState, selections) => {
    selections.forEach(id => {
      const cost = AtomicEffectExecutor.findCardById(gameState, id);
      const ownerUid = cost ? AtomicEffectExecutor.findCardOwnerKey(gameState, cost.gamecardId) : undefined;
      if (cost && ownerUid) moveCardAsCost(gameState, ownerUid, cost, 'EXILE', instance);
    });
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'TARGET') return;
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    selections.forEach(id => {
      const target = AtomicEffectExecutor.findCardById(gameState, id);
      const ownerUid = target ? AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) : undefined;
      if (target?.cardlocation === 'UNIT' && ownerUid === opponentUid && (target.power || 0) <= 2000) {
        markCannotDefendUntilEndOfTurn(target, instance, gameState);
      }
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050427
 * Card2 Row: 302
 * Card Row: 541
 * Source CardNo: BT04-R01
 * Package: BT04(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：若你的战场上仅有1个神蚀单位，且那个单位的ACCESS值在+5以上，那个单位〖伤害+1〗〖力量+500〗并获得【速攻】。
 * 【启】〖一回合一次〗：[从你的手牌，卡组，墓地放逐合计两张「赛利亚」]这个能力只能在你的主要阶段发动。选择对手的最多两个〖力量2000〗以下的单位，本回合中，那些单位不能宣言防御。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050427',
  fullName: '绯烨姬「赛利亚」',
  specialName: '赛利亚',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
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
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
