import { Card, CardEffect } from '../types/game';
import { moveTopDeckTo } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105110402_enter_face_down_exile',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  limitCount: 1,
  limitNameType: true,
  isMandatory: true,
  description: '同名1回合1次：这个单位进入战场时，将你卡组顶的1张卡背面放逐。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    moveTopDeckTo(gameState, playerState.uid, 1, 'EXILE', instance, true);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110402
 * Card2 Row: 616
 * Card Row: 500
 * Source CardNo: BT08-Y01
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位进入战场时}:将你卡组顶的1张卡背面放逐。（放逐区中的背面卡可以被其持有者确认）
 */
const card: Card = {
  id: '105110402',
  fullName: '研发人员',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '学院要塞',
  acValue: 1,
  power: 1000,
  basePower: 1000,
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
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
