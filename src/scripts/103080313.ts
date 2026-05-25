import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, cardsInZones, putUnitOntoField, selectFromEntries } from './BaseUtil';

const SWORD_TIGER = '利牙剑虎';

const tigerTargets = (playerState: any) =>
  cardsInZones(playerState, ['DECK', 'GRAVE'])
    .filter(({ card }) =>
      card.type === 'UNIT' &&
      (card.id === '103080316' || card.fullName.includes(SWORD_TIGER)) &&
      canPutUnitOntoBattlefield(playerState, card)
    );

const cardEffects: CardEffect[] = [{
  id: '103080313_effect_leave_put_sword_tiger',
  type: 'TRIGGER',
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'],
  triggerEvent: 'CARD_LEFT_FIELD',
  sourceSnapshotOnLeftField: true,
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：这个单位由于卡的效果从战场离开时，将卡组或墓地中1张《利牙剑虎》放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
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
    event.data?.isEffect === true &&
    tigerTargets(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    selectFromEntries(
      gameState,
      playerState.uid,
      tigerTargets(playerState),
      '选择利牙剑虎',
      '选择你的卡组或墓地中的1张《利牙剑虎》，放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103080313_effect_leave_put_sword_tiger' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!target || !canPutUnitOntoBattlefield(playerState, target)) return;
    const fromDeck = target.cardlocation === 'DECK';
    putUnitOntoField(gameState, playerState.uid, target, instance);
    const moved = AtomicEffectExecutor.findCardById(gameState, target.gamecardId);
    if (moved) {
      (moved as any).data = {
        ...((moved as any).data || {}),
        enteredByCubEffectTurn: gameState.turnCount,
        enteredByCubEffectSourceCardId: instance.gamecardId
      };
    }
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103080313
 * Card2 Row: 547
 * Card Row: 367
 * Source CardNo: BT07-G03
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位由于卡的效果从战场上离开时}:将你的卡组或墓地中1张《利牙剑虎》放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103080313',
  fullName: '仔虎',
  specialName: '',
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
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
