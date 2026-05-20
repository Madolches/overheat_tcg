import { Card, CardEffect } from '../types/game';
import { canPutUnitOntoBattlefield, putUnitOntoField } from './BaseUtil';

const isBloodflameUnit = (card: Card) =>
  card.type === 'UNIT' && card.fullName.includes('血焰');

const cardEffects: CardEffect[] = [{
  id: '102050259_disable_opponent_activated',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  content: 'DISABLE_ALL_ACTIVATED',
  description: '你的回合中，你的战场上卡名含有《血焰》的单位有3个以上时，对手不能发动【启】效果。',
  condition: (_gameState, playerState) =>
    playerState.isTurn &&
    playerState.unitZone.filter((unit): unit is Card => !!unit && isBloodflameUnit(unit)).length >= 3
}, {
  id: '102050259_goddess_enter',
  type: 'TRIGGER',
  triggerEvent: 'GODDESS_TRANSFORMATION',
  triggerLocation: ['HAND'],
  erosionTotalLimit: [10, 10],
  limitCount: 1,
  limitNameType: true,
  description: '10+：你的回合中，你由于你的卡的效果伤害进入女神化状态时，可以将这张卡从手牌放置到战场上。',
  condition: (_gameState, playerState, instance, event) =>
    playerState.isTurn &&
    event?.playerUid === playerState.uid &&
    event.data?.damageSource === 'EFFECT' &&
    event.data?.effectSourcePlayerUid === playerState.uid &&
    canPutUnitOntoBattlefield(playerState, instance),
  execute: async (instance, gameState, playerState) => {
    putUnitOntoField(gameState, playerState.uid, instance, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050259
 * Card2 Row: 417
 * Card Row: 301
 * Source CardNo: PR05-01R
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 1.永续效果：你的回合中，你的战场上卡名带有‘血焰’的单位有三个或者以上：对方不能发动启动（activate）效果
 * 2.诱发效果，卡名一回合一次，侵蚀区数量10，你的回合中，你由于你的卡的效果伤害进入女神化状态时：你可以将这张卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050259',
  fullName: '血焰的辅教士',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
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
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
