import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, addTempDamage, addTempPower, createSelectCardQuery, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
    id: '102000093_red_buffs',
    type: 'TRIGGER',
    triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
    triggerLocation: ['UNIT'],
    description: '入场时，选择最多2个红色单位，本回合伤害+1、力量+500。',
    condition: (_gameState, playerState, instance, event) =>
      event?.sourceCardId === instance.gamecardId &&
      event.data?.zone === 'UNIT' &&
      ownUnits(playerState).some(unit => AtomicEffectExecutor.matchesColor(unit, 'RED')),
    execute: async (instance, gameState, playerState) => {
      const candidates = ownUnits(playerState).filter(unit => AtomicEffectExecutor.matchesColor(unit, 'RED'));
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择红色单位',
        '选择最多2个红色单位，本回合中伤害+1、力量+500。',
        0,
        Math.min(2, candidates.length),
        { sourceCardId: instance.gamecardId, effectId: '102000093_red_buffs' }
      );
    },
    targetSpec: {
      title: '选择红色单位',
      description: '选择你的最多2个红色单位，本回合中伤害+1、力量+500。',
      minSelections: 0,
      maxSelections: 2,
      zones: ['UNIT'],
      controller: 'SELF',
      getCandidates: (_gameState, playerState) =>
        ownUnits(playerState)
          .filter(unit => AtomicEffectExecutor.matchesColor(unit, 'RED'))
          .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
    },
    onQueryResolve: async (instance, _gameState, playerState, selections) => {
      selections
        .map(id => ownUnits(playerState).find(unit => unit.gamecardId === id))
        .filter((unit): unit is Card => !!unit)
        .forEach(unit => {
          addTempDamage(unit, instance, 1);
          addTempPower(unit, instance, 500);
        });
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000093
 * Card2 Row: 47
 * Card Row: 47
 * Source CardNo: BT01-R09
 * Package: BT01(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位进入战场时，选择你的最多2个红色单位，本回合中〖伤害+1〗〖力量+500〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000093',
  fullName: '无名的武器工匠',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 1,
  power: 500,
  basePower: 500,
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
