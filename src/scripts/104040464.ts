import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutCardOntoBattlefieldByEffect, createSelectCardQuery, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '104040464_entry_partner',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  description: '进入战场时，可以选择侵蚀区中的1张「Brave Immortal」或「Eternal」卡放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    playerState.erosionFront.some(card =>
      !!card &&
      (card.specialName === 'Brave Immortal' || card.specialName === 'Eternal') &&
      canPutCardOntoBattlefieldByEffect(playerState, card)
    ),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.erosionFront.filter((card): card is Card =>
        !!card &&
        (card.specialName === 'Brave Immortal' || card.specialName === 'Eternal') &&
        canPutCardOntoBattlefieldByEffect(playerState, card)
      ),
      '选择放置到战场的卡',
      '选择侵蚀区中的1张「Brave Immortal」或「Eternal」卡放置到战场。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104040464_entry_partner' },
      () => 'EROSION_FRONT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'EROSION_FRONT' && canPutCardOntoBattlefieldByEffect(playerState, target)) {
      moveCard(gameState, playerState.uid, target, target.type === 'ITEM' ? 'ITEM' : 'UNIT', instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104040464
 * Card2 Row: 344
 * Card Row: 591
 * Source CardNo: PR04-01B
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】：这个单位进入战场时，可以选择你的侵蚀区中的1张「Brave Immortal」或「Eternal」卡，将其放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104040464',
  fullName: '盖迪恩·普米斯「Guardian Promise」',
  specialName: 'Guardian Promise',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
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
