import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, addTempDamage, addTempKeyword, addTempPower, allUnitsOnField, createSelectCardQuery, grantedTotemReviveFromGrave, isSpiritEffectEvent } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103080182_spirit_targeted',
  type: 'TRIGGER',
  triggerEvent: 'CARD_SELECTED_TARGET',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  description: '被卡名含有《降灵》的卡选择为效果对象时，选择战场1个单位伤害+1、力量+1000并获得【歼灭】。',
  condition: (_gameState, _playerState, instance, event) =>
    event?.targetCardId === instance.gamecardId && isSpiritEffectEvent(event),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      allUnitsOnField(gameState),
      '选择单位',
      '选择战场上的1个单位，本回合中伤害+1、力量+1000并获得【歼灭】。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103080182_spirit_targeted' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择单位',
    description: '选择战场上的1个单位，本回合中伤害+1、力量+1000并获得【歼灭】。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    getCandidates: gameState =>
      allUnitsOnField(gameState).map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT') {
      addTempDamage(target, instance, 1);
      addTempPower(target, instance, 1000);
      addTempKeyword(target, instance, 'annihilation');
    }
  }
}, grantedTotemReviveFromGrave()];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103080182
 * Card2 Row: 195
 * Card Row: 195
 * Source CardNo: BT03-G05
 * Package: BT03(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位被卡名含有《降灵》的卡选择为效果对象时，选择战场上的1个单位，本回合中〖伤害+1〗〖力量+1000〗并获得【歼灭】。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103080182',
  fullName: '地鬼图腾「果鹿」',
  specialName: '果鹿',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '神木森',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: false,
  baseAnnihilation: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
