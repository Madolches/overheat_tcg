import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, addTempDamage, addTempKeyword, addTempPower, createSelectCardQuery, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101130440_reset_boost',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ROTATED',
  isMandatory: false,
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：这个单位因为卡的效果被重置时，可以选择你的1个<圣王国>单位，本回合伤害+1、力量+1000并获得【英勇】。',
  condition: (_gameState, playerState, instance, event) =>
    event?.targetCardId === instance.gamecardId &&
    event.data?.direction === 'VERTICAL' &&
    !!event.data?.effectSourceCardId &&
    ownUnits(playerState).some(unit => unit.faction === '圣王国'),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, ownUnits(playerState).filter(unit => unit.faction === '圣王国'), '选择强化单位', '选择你的1个<圣王国>单位，本回合伤害+1、力量+1000并获得【英勇】。', 0, 1, {
      sourceCardId: instance.gamecardId,
      effectId: '101130440_reset_boost'
    });
  },
  targetSpec: {
    title: '选择强化单位',
    description: '选择你的1个<圣王国>单位，本回合伤害+1、力量+1000并获得【英勇】。',
    minSelections: 0,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      ownUnits(playerState)
        .filter(unit => unit.faction === '圣王国')
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation !== 'UNIT') return;
    addTempDamage(target, instance, 1);
    addTempPower(target, instance, 1000);
    addTempKeyword(target, instance, 'heroic');
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130440
 * Card2 Row: 317
 * Card Row: 556
 * Source CardNo: BT04-W06
 * Package: BT04(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗：这个单位由于卡的效果而被重置时，你可以选择你的1个<圣王国>单位，本回合中，那个单位〖伤害+1〗〖力量+1000〗并获得【英勇】。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130440',
  fullName: '殿堂骑士·魔枪',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '圣王国',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
