import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  createSelectCardQuery,
  isAlchemyEffectSource,
  moveCard,
  nameContains,
  paymentCost,
  wasSentFromFieldToGraveByCardEffect
} from './BaseUtil';

const immortalStoneCandidates = (playerState: any) =>
  [...playerState.deck, ...playerState.grave].filter((card: Card) => card.id === '305000062' || nameContains(card, '永生石'));

const cardEffects: CardEffect[] = [{
  id: '105000384_all_colors_for_alchemy',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '卡名含有《炼金》的卡的效果将战场上的这张卡送入墓地时，这张卡视作具备所有颜色。',
  applyContinuous: () => {}
}, {
  id: '105000384_effect_grave_search_immortal_stone',
  type: 'TRIGGER',
  triggerLocation: ['UNIT', 'GRAVE'],
  triggerEvent: 'CARD_LEFT_ZONE',
  cost: paymentCost(2),
  description: '这张卡由于卡的效果送去墓地时，支付ACCESS2：将卡组或墓地中的1张《永生石》加入手牌。',
  condition: (gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    wasSentFromFieldToGraveByCardEffect(event, instance) &&
    isAlchemyEffectSource(gameState, event.data?.effectSourceCardId) &&
    immortalStoneCandidates(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      immortalStoneCandidates(playerState),
      '选择永生石',
      '从你的卡组或墓地选择1张《永生石》加入手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000384_effect_grave_search_immortal_stone' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || !immortalStoneCandidates(playerState).some(card => card.gamecardId === selected.gamecardId)) return;
    const fromDeck = selected.cardlocation === 'DECK';
    moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000384
 * Card2 Row: 581
 * Card Row: 465
 * Source CardNo: BT07-Y04
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：卡名含有《炼金》的卡的效果将战场上的这个单位送入墓地时，这个单位视作具备所有颜色。
 * 【诱】{这张卡由于卡的效果送去墓地时}[〖+2〗]:将你卡组或墓地中的1张《永生石》加入手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000384',
  fullName: '永生原石',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 1,
  power: 0,
  basePower: 0,
  damage: 0,
  baseDamage: 0,
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
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
