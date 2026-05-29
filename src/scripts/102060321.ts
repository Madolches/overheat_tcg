import { Card, CardEffect } from '../types/game';
import {
  addTemporaryAccessDiscount,
  genericSoulDevourPowerEffect,
  isThunderUnit,
  ownerOf,
  soulDevourCountThisTurn
} from './BaseUtil';

const cardEffects: CardEffect[] = [
  genericSoulDevourPowerEffect('102060321_soul_devour_power'),
  {
    id: '102060321_hand_access_discount',
    type: 'CONTINUOUS',
    triggerLocation: ['UNIT'],
    content: 'HAND_ACCESS_DISCOUNT_BY_SOUL_DEVOUR',
    description: '你的手牌中的<雷霆>单位卡和红色非神蚀单位卡ACCESS值减少本回合发动过的噬魂次数，最低为0。',
    applyContinuous: (gameState, instance) => {
      const owner = ownerOf(gameState, instance);
      if (!owner) return;
      const discount = soulDevourCountThisTurn(gameState, owner);
      if (discount <= 0) return;
      owner.hand
        .filter(card => card.type === 'UNIT' && (isThunderUnit(card) || (card.color === 'RED' && !card.godMark)))
        .forEach(card => addTemporaryAccessDiscount(card, instance, discount));
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102060321
 * Card2 Row: 558
 * Card Row: 378
 * Source CardNo: BT07-R03
 * Package: BT07(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】【噬魂】（〖1回合1次〗{你的主要阶段}[将这个单位以外的你的战场上的1个非神蚀单位送入墓地]：本回合中你的所有单位〖力量+500〗）。
 * 【永】：你的手牌中的<雷霆>的单位卡和红色的非神蚀卡ACCESS值减少X。（X为你本回合中发动过的噬魂能力的次数，ACCESS值最低降到0）
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102060321',
  fullName: '炎雷祭司',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '雷霆',
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
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
