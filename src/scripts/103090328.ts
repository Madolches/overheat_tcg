import { Card, CardEffect, TriggerLocation } from '../types/game';
import { addTempDamage, addTempPower, allUnitsOnField, createSelectCardQuery, getResonanceExiledCard, isResonanceExileEvent, isSilverInstrumentCard, resonanceEffect } from './BaseUtil';

const cardEffects: CardEffect[] = [
  resonanceEffect('103090328_resonance'),
  {
    id: '103090328_boost',
    type: 'TRIGGER',
    triggerEvent: 'CARD_EXILED',
    isMandatory: true,
    triggerLocation: ['UNIT'],
    description: '这个单位的共鸣能力将卡名含有《银乐器》的卡放逐时，选择战场上1个非神蚀单位，本回合中伤害+1、力量+1500。',
    condition: (_gameState, _playerState, instance, event) => {
      const exiled = getResonanceExiledCard(event);
      return isResonanceExileEvent(event, instance) && !!exiled && isSilverInstrumentCard(exiled);
    },
    execute: async (instance, gameState, playerState) => {
      const candidates = allUnitsOnField(gameState).filter(unit => !unit.godMark);
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择强化单位',
        '选择战场上1个非神蚀单位，本回合中伤害+1、力量+1500。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '103090328_boost' },
        card => card.cardlocation as any
      );
    },
    targetSpec: {
      title: '选择强化单位',
      description: '选择战场上的1个非神蚀单位，本回合中伤害+1、力量+1500。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'ANY',
      getCandidates: gameState =>
        allUnitsOnField(gameState)
          .filter(unit => !unit.godMark)
          .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
    },
    onQueryResolve: async (instance, gameState, _playerState, selections) => {
      const target = allUnitsOnField(gameState).find(unit => unit.gamecardId === selections[0] && !unit.godMark);
      if (!target) return;
      addTempDamage(target, instance, 1);
      addTempPower(target, instance, 1500);
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090328
 * Card2 Row: 450
 * Card Row: 385
 * Source CardNo: BT06-G02
 * Package: BT06(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】共鸣（〖1回合1次〗｛你的主要阶段，选择你的墓地中的1张卡｝：将被选择的卡放逐）。
 * 【诱】｛这个单位的共鸣能力将卡名含有《银乐器》的卡放逐时，选择战场上1个非神蚀单位｝：被选择的单位本回合中〖伤害+1〗〖力量+1500〗。
 */
const card: Card = {
  id: '103090328',
  fullName: '聚居地的诗人',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '瑟诺布',
  acValue: 3,
  power: 2000,
  basePower: 2000,
  damage: 2,
  baseDamage: 2,
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
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
