import { Card, CardEffect } from '../types/game';
import { getOpponentUid, moveTopDeckTo } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101130267_reset_exile_top',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ROTATED',
  limitCount: 1,
  description: '1回合1次：这个单位由于卡的效果重置时，将对手卡组顶1张卡放逐。',
  condition: (_gameState, _playerState, instance, event) =>
    event?.targetCardId === instance.gamecardId &&
    event.data?.direction === 'VERTICAL' &&
    !!event.data?.effectSourceCardId,
  execute: async (instance, gameState, playerState) => {
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    moveTopDeckTo(gameState, opponentUid, 1, 'EXILE', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130267
 * Card2 Row: 426
 * Card Row: 309
 * Source CardNo: PR03-05W
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖一回合一次〗:这个单位由于卡的效果重置时，选择一名对手，将他的卡组顶的1张卡放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130267',
  fullName: '殿堂刺猬',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '圣王国',
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
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
