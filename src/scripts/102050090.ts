import { Card, CardEffect, TriggerLocation } from '../types/game';
import { addInfluence, addTempDamage, addTempPower, allUnitsOnField, canPutUnitOntoBattlefield, createSelectCardQuery, ensureData, erosionCost, getOpponentUid, moveCard, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
    id: '102050090_attack_lock',
    type: 'TRIGGER',
    triggerEvent: 'CARD_ATTACK_DECLARED',
  isMandatory: true,
    triggerLocation: ['UNIT'],
    description: '攻击时，选择对手最多2个力量3000以上单位，本回合不能宣言防御。',
    condition: (_gameState, _playerState, instance, event) => event?.sourceCardId === instance.gamecardId,
    execute: async (instance, gameState, playerState) => {
      const candidates = ownUnits(gameState.players[getOpponentUid(gameState, playerState.uid)])
        .filter(unit => (unit.power || 0) >= 3000);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择不能防御的单位',
        '选择对手最多2个力量3000以上的单位，本回合中不能宣言防御。',
        0,
        Math.min(2, candidates.length),
        { sourceCardId: instance.gamecardId, effectId: '102050090_attack_lock' }
      );
    },
    targetSpec: {
      title: '选择不能防御的单位',
      description: '选择对手的最多2个力量3000以上的单位，本回合中不能宣言防御。',
      minSelections: 0,
      maxSelections: 2,
      zones: ['UNIT'],
      controller: 'OPPONENT',
      getCandidates: (gameState, playerState) =>
        ownUnits(gameState.players[getOpponentUid(gameState, playerState.uid)])
          .filter(unit => (unit.power || 0) >= 3000)
          .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
    },
    onQueryResolve: async (instance, gameState, _playerState, selections) => {
      allUnitsOnField(gameState)
        .filter(unit => selections.includes(unit.gamecardId))
        .forEach(unit => {
          ensureData(unit).cannotDefendTurn = gameState.turnCount;
          ensureData(unit).cannotDefendSourceName = instance.fullName;
          addInfluence(unit, instance, '本回合不能宣言防御');
        });
    }
  }, {
    id: '102050090_goddess_entry',
    type: 'TRIGGER',
    triggerEvent: 'GODDESS_TRANSFORMATION',
  isMandatory: false,
    triggerLocation: ['HAND'],
    erosionTotalLimit: [10, 10],
    description: '10+：进入女神化时，可以从手牌放置到战场，选择最多2个单位伤害+1、力量+1000。',
    condition: (_gameState, playerState, instance, event) =>
      event?.playerUid === playerState.uid &&
      canPutUnitOntoBattlefield(playerState, instance),
    cost: erosionCost(1),
    execute: async (instance, gameState, playerState) => {
      if (canPutUnitOntoBattlefield(playerState, instance)) moveCard(gameState, playerState.uid, instance, 'UNIT', instance);
      const candidates = allUnitsOnField(gameState);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择强化单位',
        '选择战场上的最多2个单位，本回合中伤害+1、力量+1000。',
        0,
        Math.min(2, candidates.length),
        { sourceCardId: instance.gamecardId, effectId: '102050090_goddess_entry' },
        card => card.cardlocation || 'UNIT'
      );
    },
    targetSpec: {
      title: '选择强化单位',
      description: '选择战场上的最多2个单位，本回合中伤害+1、力量+1000。',
      minSelections: 0,
      maxSelections: 2,
      zones: ['UNIT'],
      controller: 'ANY',
      getCandidates: gameState =>
        allUnitsOnField(gameState).map(card => ({ card, source: 'UNIT' as TriggerLocation }))
    },
    onQueryResolve: async (instance, gameState, _playerState, selections) => {
      const targets = allUnitsOnField(gameState).filter(unit => selections.includes(unit.gamecardId));
      targets.forEach(unit => {
        addTempDamage(unit, instance, 1);
        addTempPower(unit, instance, 1000);
      });
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050090
 * Card2 Row: 44
 * Card Row: 44
 * Source CardNo: BT01-R06
 * Package: BT01(SR,ESR,OHR),BTO3(FVR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【速攻】
 * 【诱】:这个单位攻击时，选择对手的最多2个〖力量3000〗以上的单位，本回合中，不能宣言防御。
 * 〖10+〗【诱】:[〖侵蚀1〗]你进入女神化状态时，你可以将这张卡从手牌放置到战场上，选择战场上的最多2个单位，本回合中〖伤害+1〗〖力量+1000〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050090',
  fullName: '第二王女「赛利亚」',
  specialName: '赛利亚',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '伊列宇王国',
  acValue: 4,
  power: 3500,
  basePower: 3500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
