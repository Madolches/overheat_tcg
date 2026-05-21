import { Card, CardEffect } from '../types/game';
import { canActivateDuringYourTurn, createChoiceQuery, moveCard, revealDeckCards } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '305000082_scan',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  limitCount: 1,
  description: '1回合1次：你的回合，宣言一个卡名，公开卡组顶1张。若卡名一致，加入手牌；否则放回卡组顶。',
  condition: (gameState, playerState, instance) =>
    canActivateDuringYourTurn(gameState, playerState) &&
    instance.cardlocation === 'ITEM' &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    const names = Array.from(new Set(playerState.deck.map(card => card.fullName))).sort();
    createChoiceQuery(
      gameState,
      playerState.uid,
      '宣言卡名',
      '选择要宣言的卡名。',
      names.map(name => ({ id: name, label: name })),
      { sourceCardId: instance.gamecardId, effectId: '305000082_scan' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const declaredName = selections[0];
    const top = playerState.deck[playerState.deck.length - 1];
    if (!top) return;
    revealDeckCards(gameState, playerState.uid, 1, instance);
    if (top.fullName === declaredName) {
      moveCard(gameState, playerState.uid, top, 'HAND', instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 305000082
 * Card2 Row: 272
 * Card Row: 628
 * Source CardNo: PR01-04Y
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗:这个能力只能在你的回合中发动。宣言一个卡名，公开你的卡组顶的一张卡。若那张卡的卡名和宣言一致，将其加入手牌。否则，将那卡按原样放回。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '305000082',
  fullName: '「魔法扫描仪」',
  specialName: '魔法扫描仪',
  type: 'ITEM',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 3,
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
