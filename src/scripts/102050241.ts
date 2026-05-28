import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, isFaction, ownUnits, readyByEffect } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102050241_end_ready',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'TURN_END' as any,
  isMandatory: false,
  limitCount: 1,
  description: '你的回合结束时，可以选择你的1个横置的<伊列宇王国>神蚀单位，将其重置。',
  condition: (_gameState, playerState, _instance, event) =>
    event?.playerUid === playerState.uid &&
    ownUnits(playerState).some(unit => unit.isExhausted && unit.godMark && isFaction(unit, '伊列宇王国')),
  execute: async (instance, gameState, playerState) => {
    const targets = ownUnits(playerState).filter(unit => unit.isExhausted && unit.godMark && isFaction(unit, '伊列宇王国'));
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择重置单位',
      '选择你的1个横置的<伊列宇王国>神蚀单位重置。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050241_end_ready' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target) readyByEffect(gameState, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050241
 * Card2 Row: 410
 * Card Row: 280
 * Source CardNo: BT05-R04
 * Package: BT05(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗{你的回合结束时，你可以选择你的1个横置的<伊列宇王国>神蚀单位}:将被选择的单位〖重置〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050241',
  fullName: '择帝侯「萨克雷德」',
  specialName: '萨克雷德',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
  acValue: 3,
  power: 3500,
  basePower: 3500,
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
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
