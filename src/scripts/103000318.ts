import { Card, CardEffect } from '../types/game';
import { canPutUnitOntoBattlefield, putUnitOntoField, selectFromEntries } from './BaseUtil';

const greenNonGodGraveUnits = (playerState: any) =>
  playerState.grave.filter((card: Card) =>
    card.type === 'UNIT' &&
    card.color === 'GREEN' &&
    !card.godMark &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '103000318_enter_or_leave_revive_green',
  type: 'TRIGGER',
  isMandatory: true,
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'],
  triggerEvent: ['CARD_ENTERED_ZONE', 'CARD_LEFT_FIELD'] as any,
  sourceSnapshotOnLeftField: true,
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：这个单位进入战场或从战场离开时，选择墓地1张绿色非神蚀单位卡放置到战场。',
  condition: (_gameState, playerState, instance, event) => {
    const isSelfEnter = event?.type === 'CARD_ENTERED_ZONE' &&
      event.sourceCardId === instance.gamecardId &&
      event.data?.zone === 'UNIT';
    const isSelfLeave = event?.type === 'CARD_LEFT_FIELD' &&
      (
        event.sourceCard === instance ||
        event.sourceCardId === instance.gamecardId ||
        event.data?.previousSourceCardId === instance.gamecardId ||
        (
          !!event.sourceCard?.runtimeFingerprint &&
          event.sourceCard.runtimeFingerprint === instance.runtimeFingerprint
        )
      ) &&
      event.data?.sourceZone === 'UNIT';
    return (isSelfEnter || isSelfLeave) && greenNonGodGraveUnits(playerState).length > 0;
  },
  execute: async (instance, gameState, playerState) => {
    selectFromEntries(
      gameState,
      playerState.uid,
      greenNonGodGraveUnits(playerState).map((card: Card) => ({ card, source: 'GRAVE' as const })),
      '选择绿色单位',
      '选择墓地中1张绿色非神蚀单位卡放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000318_enter_or_leave_revive_green' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = greenNonGodGraveUnits(playerState).find((card: Card) => card.gamecardId === selections[0]);
    if (target) putUnitOntoField(gameState, playerState.uid, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000318
 * Card2 Row: 555
 * Card Row: 375
 * Source CardNo: BT07-G11
 * Package: BT07(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位进入战场时，或这个单位从战场上离开时，选择你的墓地中的1张绿色非神蚀单位}将被选择的单位卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000318',
  fullName: '快鸟信使「维多利亚」',
  specialName: '维多利亚',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
