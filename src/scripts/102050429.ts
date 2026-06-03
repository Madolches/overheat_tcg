import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, faceUpErosion, moveCard, moveCardAsCost, nameContains } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102050429_ten_recycle',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END' as any,
  isMandatory: false,
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [10, 10],
  limitCount: 1,
  limitNameType: true,
  description: '10+同名1回合1次：你的回合结束时，可以放逐这个单位，选择侵蚀区2张卡名含有《血焰》的正面卡加入手牌。',
  condition: (_gameState, playerState, instance) =>
    playerState.isTurn &&
    instance.cardlocation === 'UNIT' &&
    faceUpErosion(playerState).filter(card => nameContains(card, '血焰')).length >= 2,
  cost: async (gameState, playerState, instance) => {
    if (instance.cardlocation !== 'UNIT') return false;
    moveCardAsCost(gameState, playerState.uid, instance, 'EXILE', instance);
    return true;
  },
  targetSpec: {
    title: '选择回收卡牌',
    description: '选择侵蚀区中最多2张卡名含有《血焰》的正面卡加入手牌。',
    minSelections: 0,
    maxSelections: 2,
    zones: ['EROSION_FRONT'],
    controller: 'SELF',
    step: 'RECYCLE',
    getCandidates: (_gameState, playerState) =>
      faceUpErosion(playerState)
        .filter(card => nameContains(card, '血焰'))
        .map(card => ({ card, source: 'EROSION_FRONT' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, faceUpErosion(playerState).filter(card => nameContains(card, '血焰')), '选择回收卡牌', '选择侵蚀区中2张卡名含有《血焰》的正面卡加入手牌。', 0, 2, {
      sourceCardId: instance.gamecardId,
      effectId: '102050429_ten_recycle'
    }, () => 'EROSION_FRONT');
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    selections.forEach(id => {
      const target = AtomicEffectExecutor.findCardById(gameState, id);
      if (target?.cardlocation === 'EROSION_FRONT') moveCard(gameState, playerState.uid, target, 'HAND', instance);
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050429
 * Card2 Row: 304
 * Card Row: 543
 * Source CardNo: BT04-R03
 * Package: BT04(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖10+〗【诱】〖同名1回合1次〗:[将这个单位放逐]你的回合结束时，你可以选择你的侵蚀区中的2张卡名含有《血焰》的正面卡，将其加入手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050429',
  fullName: '血焰的后勤部队',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '伊列宇王国',
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
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
