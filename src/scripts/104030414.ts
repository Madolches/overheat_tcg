import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, paymentCost } from './BaseUtil';

const enteredFromErosionByEffect = (event?: any) =>
  event?.type === 'CARD_EROSION_TO_FIELD' &&
  event.data?.isEffect === true &&
  (event.data?.targetZone === 'UNIT' || event.data?.targetZone === undefined);

const cardEffects: CardEffect[] = [{
  id: '104030414_draw_after_erosion_entry',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EROSION_TO_FIELD',
  triggerLocation: ['UNIT'],
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次，这个单位由于卡的效果从侵蚀区进入战场时，支付+1：抽1张卡。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    enteredFromErosionByEffect(event) &&
    playerState.deck.length > 0,
  cost: paymentCost(1),
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104030414
 * Card2 Row: 631
 * Card Row: 515
 * Source CardNo: BT08-B05
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位由于卡的效果从侵蚀区进入战场时}[〖+1〗]:抽1张卡。
 */
const card: Card = {
  id: '104030414',
  fullName: '破阵苍穹「芙蕾雅」',
  specialName: '芙蕾雅',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '冒险家公会',
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
