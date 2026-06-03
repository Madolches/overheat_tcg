import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, destroyByEffect, getBattlefieldCards, ownUnits, paymentCost } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102000148_enter_destroy_item',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  erosionBackLimit: [5, 7],
  cost: paymentCost(0, 'RED'),
  description: '5~7：入场时，若我方有2个以上红色单位，选择战场上1张道具卡破坏。',
  condition: (gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    ownUnits(playerState).filter(unit => AtomicEffectExecutor.matchesColor(unit, 'RED')).length >= 2 &&
    getBattlefieldCards(gameState).some(card => card.type === 'ITEM'),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      getBattlefieldCards(gameState).filter(card => card.type === 'ITEM'),
      '选择破坏的道具',
      '选择战场上的1张道具卡，将其破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102000148_enter_destroy_item' },
      card => card.cardlocation as any
    );
  },
  targetSpec: {
    title: '选择破坏的道具',
    description: '选择战场上的1张道具卡，将其破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['ITEM'],
    controller: 'ANY',
    getCandidates: gameState =>
      getBattlefieldCards(gameState)
        .filter(card => card.type === 'ITEM')
        .map(card => ({ card, source: card.cardlocation as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'ITEM') destroyByEffect(gameState, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000148
 * Card2 Row: 132
 * Card Row: 132
 * Source CardNo: BT02-R09
 * Package: BT02(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖5~7〗【诱】:[〖支付0费，我方场上有两个或以上的红色单位〗]这个单位进入战场时，选择战场上的1张道具卡，将其破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000148',
  fullName: '愤怒的暴徒',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
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
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
