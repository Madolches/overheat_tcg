import { Card, CardEffect } from '../types/game';
import { ensureData, getOpponentUid, moveCard, ownerUidOf } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '202000151_mark_draw_discard',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description: '本回合中，对手每次由于自己的卡效果抽卡时，将抽到的卡舍弃。',
  execute: async (instance, gameState, playerState) => {
    const data = ensureData(instance);
    data.windFestivalTurn = gameState.turnCount;
    data.windFestivalOpponentUid = getOpponentUid(gameState, playerState.uid);
    gameState.logs.push(`[${instance.fullName}] 本回合中将对手由效果抽到的卡舍弃。`);
  }
}, {
  id: '202000151_discard_drawn',
  type: 'TRIGGER',
  triggerLocation: ['GRAVE', 'PLAY'],
  triggerEvent: 'CARD_DRAWN',
  isGlobal: true,
  isMandatory: true,
  description: '拂风庆典：将对手因效果抽到的卡舍弃。',
  condition: (gameState, _playerState, instance, event) => {
    const data = (instance as any).data || {};
    return data.windFestivalTurn === gameState.turnCount &&
      event?.playerUid === data.windFestivalOpponentUid &&
      gameState.phase !== 'DRAW';
  },
  execute: async (instance, gameState, _playerState, event) => {
    const drawn = event?.sourceCardId ? event.sourceCard || undefined : undefined;
    const target = drawn || (event?.sourceCardId ? Object.values(gameState.players).flatMap(player => player.hand).find(card => card.gamecardId === event.sourceCardId) : undefined);
    const ownerUid = target ? ownerUidOf(gameState, target) : undefined;
    if (target && ownerUid && target.cardlocation === 'HAND') {
      moveCard(gameState, ownerUid, target, 'GRAVE', instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202000151
 * Card2 Row: 287
 * Card Row: 643
 * Source CardNo: PR03-06R
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 这个回合中，对手每次由于他自己的卡的效果抽卡时，将对手抽到的卡舍弃。
 * 【你为ACCESS值+3以下的红色卡支付使用费用时，你可以将手牌中的这张卡放逐作为这次费用的代替。】
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202000151',
  fullName: '拂风庆典',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
