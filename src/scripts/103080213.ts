import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, grantedTotemReviveFromGrave } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103080213_leave_draw',
  type: 'TRIGGER',
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK'],
  triggerEvent: 'CARD_LEFT_FIELD',
  sourceSnapshotOnLeftField: true,
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  description: '通过卡的效果从战场离开时，可以抽1张卡。',
  condition: (_gameState, _playerState, instance, event) =>
    (
      event?.sourceCard === instance ||
      event?.sourceCardId === instance.gamecardId ||
      event?.data?.previousSourceCardId === instance.gamecardId ||
      (
        !!event?.sourceCard?.runtimeFingerprint &&
        event.sourceCard.runtimeFingerprint === instance.runtimeFingerprint
      )
    ) &&
    event.data?.sourceZone === 'UNIT' &&
    !!event.data?.isEffect,
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
}, grantedTotemReviveFromGrave()];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103080213
 * Card2 Row: 371
 * Card Row: 241
 * Source CardNo: BT05-G05
 * Package: BT05(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{通过卡的效果将这个单位从战场离开时}:你可以抽1张卡。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103080213',
  fullName: '图腾神木',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '神木森',
  acValue: 3,
  power: 3000,
  basePower: 3000,
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
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
