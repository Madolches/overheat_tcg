import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { ensureData, nameContains } from './BaseUtil';

const isPlacedByShingiEffect = (gameState: any, card: Card, event?: any) => {
  const data = (card as any).data || {};
  if (data.placedByShingiEffectSourceCardId || data.placedByShingiEffectSourceName) return true;
  const source = event?.data?.effectSourceCardId
    ? AtomicEffectExecutor.findCardById(gameState, event.data.effectSourceCardId)
    : undefined;
  return event?.data?.isEffect && !!source && nameContains(source, '神仪');
};

const cardEffects: CardEffect[] = [{
  id: '301140059_uncounterable_shingi',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '对手不能对抗你对卡名含有《神仪》的卡的使用。',
  applyContinuous: (_gameState, instance) => {
    const data = ensureData(instance);
    data.uncounterableShingiPlay = true;
  }
}, {
  id: '301140059_shingi_enter_draw',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isGlobal: true,
  limitCount: 1,
  erosionTotalLimit: [0, 4],
  description: '0-4：你的单位由于卡名含有《神仪》的卡的效果进入战场时，可以抽1张卡。',
  condition: (gameState, playerState, _instance, event) =>
    event?.type === 'CARD_ENTERED_ZONE' &&
    event.playerUid === playerState.uid &&
    event.data?.zone === 'UNIT' &&
    !!event.sourceCard &&
    event.sourceCard.type === 'UNIT' &&
    isPlacedByShingiEffect(gameState, event.sourceCard, event),
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 301140059
 * Card2 Row: 575
 * Card Row: 459
 * Source CardNo: BT07-W09
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：对手不能对抗你对卡名含有《神仪》的卡的使用。
 * 【0-4】【诱】〖1回合1次〗{你的单位由于卡名含有《神仪》的卡的效果进入战场时}：你可以抽1张卡。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '301140059',
  fullName: '「黎明礼拜堂」',
  specialName: '黎明礼拜堂',
  type: 'ITEM',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '女神教会',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
