import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, moveCardsToBottom } from './BaseUtil';

const whiteSourceCount = (cards: (Card | null)[]) =>
  cards.filter(card => !!card && AtomicEffectExecutor.matchesColor(card, 'WHITE')).length;

const effect_101000283_enter_recover: CardEffect = {
  id: '101000283_enter_recover',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '【诱】〖同名1回合1次〗这个单位进入战场时，选择你的墓地中最多三张红色或黄色卡：将被选择的卡放置到卡组底。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    whiteSourceCount(playerState.unitZone) >= 2 &&
    playerState.grave.some(card => card.color === 'RED' || card.color === 'YELLOW'),
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.grave.filter(card => card.color === 'RED' || card.color === 'YELLOW');
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择放回卡组底的卡',
      '选择你的墓地中最多三张红色或黄色卡，放置到卡组底。',
      0,
      Math.min(3, candidates.length),
      { sourceCardId: instance.gamecardId, effectId: '101000283_enter_recover' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selectedCards = selections
      .map(id => playerState.grave.find(card => card.gamecardId === id))
      .filter((card): card is Card => !!card && (card.color === 'RED' || card.color === 'YELLOW'));
    moveCardsToBottom(gameState, playerState.uid, selectedCards, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000283
 * Card2 Row: 442
 * Card Row: 325
 * Source CardNo: SP02-W04
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗｛这个单位进入战场时，选择你的墓地中最多三张红色或黄色卡｝[〖0：白白〗]：将被选择的卡放置到卡组底。
 */
const card: Card = {
  id: '101000283',
  fullName: '天魔保健官',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_101000283_enter_recover],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
