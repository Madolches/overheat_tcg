import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, allCardsOnField, createSelectCardQuery, discardHandCost, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '104010341_draw_when_equipped',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_EQUIPPED',
  isMandatory: false,
  limitCount: 1,
  description: '你的回合中，这个单位被道具卡装备时，可以抽1张卡。',
  condition: (_gameState, playerState, instance, event) =>
    playerState.isTurn &&
    event?.targetCardId === instance.gamecardId &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
}, {
  id: '104010341_top_non_god',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  erosionBackLimit: [4, 10],
  description: '创痕4，同名1回合1次，选择战场上的1张非神蚀卡，舍弃2张手牌：将被选择的卡放置到持有者卡组顶。',
  condition: (gameState, playerState, instance) =>
    playerState.hand.length >= 2 &&
    allCardsOnField(gameState).some(card => card.gamecardId !== instance.gamecardId && !card.godMark),
  cost: discardHandCost(2),
  execute: async (instance, gameState, playerState) => {
    const targets = allCardsOnField(gameState).filter(card => card.gamecardId !== instance.gamecardId && !card.godMark);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择回顶目标',
      '选择战场上的1张非神蚀卡放置到持有者的卡组顶。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104010341_top_non_god' },
      card => card.cardlocation as any
    );
  },
  targetSpec: {
    title: '选择回顶目标',
    description: '选择战场上的1张非神蚀卡放置到持有者的卡组顶。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: (gameState, _playerState, instance) =>
      allCardsOnField(gameState)
        .filter(card => card.gamecardId !== instance.gamecardId && !card.godMark)
        .map(card => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    const ownerUid = target ? AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) : undefined;
    if (!target || !ownerUid || target.godMark || !['UNIT', 'ITEM'].includes(target.cardlocation || '')) return;
    moveCard(gameState, ownerUid, target, 'DECK', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104010341
 * Card2 Row: 470
 * Card Row: 404
 * Source CardNo: BT06-B11
 * Package: BT06(OHR)，特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗{你的回合中，这个单位被道具卡装备时}：你可以抽1张卡。
 * 【创痕4】【启】〖同名1回合1次〗{选择战场上的1张非神蚀卡 }（舍弃2张手牌）：将被选择的卡放置到持有者的卡组顶。
 */
const card: Card = {
  id: '104010341',
  fullName: '炉火之舞「风花」',
  specialName: '风花',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
  faction: '百濑之水城',
  acValue: 4,
  power: 3000,
  basePower: 3000,
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
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
