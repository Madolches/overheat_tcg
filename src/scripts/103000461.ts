import { Card, CardEffect } from '../types/game';
import { searchDeckEffect } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  ...searchDeckEffect(
    '103000461_unit_to_grave_search',
    '这个单位从单位区送去墓地时，可以选择卡组中1张卡名含有《黄昏的魔女》的单位卡加入手牌。',
    card => card.type === 'UNIT' && card.fullName.includes('黄昏的魔女')
  ),
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['GRAVE'],
  condition: (_gameState, _playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'GRAVE' &&
    event.data?.sourceZone === 'UNIT'
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000461
 * Card2 Row: 350
 * Card Row: 588
 * Source CardNo: PR04-04G
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 诱发效果，这个单位从单位区送去墓地时，选择你的卡组的一张卡名带有‘黄昏的魔女’的单位卡，将其加入手牌
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000461',
  fullName: '迷途的少女',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
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
