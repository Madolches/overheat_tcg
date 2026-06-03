import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, createSelectCardQuery, isNonGodUnit, putUnitOntoField } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103090257_feijing_enter',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  description: '进入战场时，若使用费用通过【菲晶】能力支付，可以选择墓地中1张非神蚀单位卡放置到战场上。',
  condition: (_gameState, playerState, instance, event?: GameEvent) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    (instance as any).data?.playedUsingFeijingTurn === _gameState.turnCount &&
    playerState.grave.some(card => isNonGodUnit(card) && canPutUnitOntoBattlefield(playerState, card)),
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.grave.filter(card => isNonGodUnit(card) && canPutUnitOntoBattlefield(playerState, card));
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择墓地单位',
      '选择你墓地中的1张非神蚀单位卡放置到战场上。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103090257_feijing_enter' },
      () => 'GRAVE'
    );
  },
  targetSpec: {
    title: '选择墓地单位',
    description: '选择你墓地中的1张非神蚀单位卡放置到战场上。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      playerState.grave
        .filter(card => isNonGodUnit(card) && canPutUnitOntoBattlefield(playerState, card))
        .map(card => ({ card, source: 'GRAVE' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'GRAVE') putUnitOntoField(gameState, playerState.uid, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090257
 * Card2 Row: 367
 * Card Row: 298
 * Source CardNo: BT05-G01
 * Package: BT05(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位进入战场时，若这个单位的使用费用是通过【菲晶】能力来支付，你可以选择你墓地中的1张非神蚀单位卡}:将被选择的单位放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103090257',
  fullName: '瑟诺布演奏家',
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
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
