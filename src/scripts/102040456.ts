import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutCardOntoBattlefieldByEffect, createSelectCardQuery, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102040456_entry_partner',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  description: '进入战场时，可以选择手牌中的1张「Guardian Promise」或「Eternal」卡放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    playerState.hand.some(card =>
      (card.specialName === 'Guardian Promise' || card.specialName === 'Eternal') &&
      canPutCardOntoBattlefieldByEffect(playerState, card)
    ),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.hand.filter(card =>
        (card.specialName === 'Guardian Promise' || card.specialName === 'Eternal') &&
        canPutCardOntoBattlefieldByEffect(playerState, card)
      ),
      '选择放置到战场的卡',
      '选择手牌中的1张「Guardian Promise」或「Eternal」卡放置到战场。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102040456_entry_partner' },
      () => 'HAND'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'HAND' && canPutCardOntoBattlefieldByEffect(playerState, target)) {
      moveCard(gameState, playerState.uid, target, target.type === 'ITEM' ? 'ITEM' : 'UNIT', instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102040456
 * Card2 Row: 343
 * Card Row: 582
 * Source CardNo: PR04-01R
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】：这个单位进入战场时，可以选择你的手牌中的1张「Guardian Promise」或「Eternal」卡，将其放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102040456',
  fullName: '布雷伏·因莫伦「Brave Immortal」',
  specialName: 'Brave Immortal',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '魔王不死传说',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
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
