import { Card, CardEffect, TriggerLocation } from '../types/game';
import { canPutUnitOntoBattlefield, createSelectCardQuery, isNonGodUnit, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
    id: '103090079_revive',
    type: 'TRIGGER',
    triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
    triggerLocation: ['UNIT'],
    limitCount: 1,
    limitNameType: true,
    erosionTotalLimit: [6, 8],
    description: '入场时，选择墓地中1个力量2000以下的绿色非神蚀单位放置到战场上。',
    condition: (_gameState, playerState, instance, event) =>
      event?.sourceCardId === instance.gamecardId &&
      event.data?.zone === 'UNIT' &&
      playerState.grave.some(card => isNonGodUnit(card) && card.color === 'GREEN' && (card.power || 0) <= 2000 && canPutUnitOntoBattlefield(playerState, card)),
    execute: async (instance, gameState, playerState) => {
      const candidates = playerState.grave.filter(card => isNonGodUnit(card) && card.color === 'GREEN' && (card.power || 0) <= 2000 && canPutUnitOntoBattlefield(playerState, card));
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择放置到战场的单位',
        '选择你的墓地中的1个力量2000以下的绿色非神蚀单位，放置到战场上。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '103090079_revive' },
        () => 'GRAVE'
      );
    },
    targetSpec: {
      title: '选择放置到战场的单位',
      description: '选择你的墓地中的1个力量2000以下的绿色非神蚀单位，放置到战场上。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['GRAVE'],
      controller: 'SELF',
      getCandidates: (_gameState, playerState) =>
        playerState.grave
          .filter(card => isNonGodUnit(card) && card.color === 'GREEN' && (card.power || 0) <= 2000 && canPutUnitOntoBattlefield(playerState, card))
          .map(card => ({ card, source: 'GRAVE' as TriggerLocation }))
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      const target = playerState.grave.find(card => card.gamecardId === selections[0] && isNonGodUnit(card) && card.color === 'GREEN' && (card.power || 0) <= 2000 && canPutUnitOntoBattlefield(playerState, card));
      if (target) moveCard(gameState, playerState.uid, target, 'UNIT', instance);
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090079
 * Card2 Row: 27
 * Card Row: 27
 * Source CardNo: BT01-G06
 * Package: BT01(R),ST02(TD)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖6~8〗【诱】〖同名1回合1次〗:这个单位进入战场时，选择你的墓地中的1个〖力量2000〗以下的绿色非神蚀单位，放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103090079',
  fullName: '银乐团弦乐小队',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '瑟诺布',
  acValue: 3,
  power: 2500,
  basePower: 2500,
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
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
