import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, discardHandCost, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103100179_return',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_FIELD',
  sourceSnapshotOnLeftField: true,
  isMandatory: false,
  triggerLocation: ['UNIT', 'GRAVE'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次，舍弃1张手牌：这个单位从战场送入墓地时，可以横置放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    (
      event?.sourceCard === instance ||
      event?.sourceCardId === instance.gamecardId ||
      event?.data?.previousSourceCardId === instance.gamecardId
    ) &&
    event.data?.sourceZone === 'UNIT' &&
    event.data?.targetZone === 'GRAVE' &&
    (instance.cardlocation === 'GRAVE' || event?.sourceCard === instance) &&
    playerState.hand.length > 0 &&
    canPutUnitOntoBattlefield(playerState, instance),
  cost: discardHandCost(1),
  execute: async (instance, gameState, playerState) => {
    if (instance.cardlocation !== 'GRAVE' || !canPutUnitOntoBattlefield(playerState, instance)) return;
    moveCard(gameState, playerState.uid, instance, 'UNIT', instance);
    const moved = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (moved) moved.isExhausted = true;
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103100179
 * Card2 Row: 192
 * Card Row: 192
 * Source CardNo: BT03-G01
 * Package: BT03(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗:[舍弃1张手牌]这个单位从战场送入墓地时，你可以将这个单位横置放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103100179',
  fullName: '魔女的幽魂蝶',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '艾柯利普斯',
  acValue: 2,
  power: 1500,
  basePower: 1500,
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
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
