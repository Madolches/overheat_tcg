import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, createSelectCardQuery, destroyByEffect, moveCard, totalErosionCount, universalEquipEffect } from './BaseUtil';

const cardEffects: CardEffect[] = [
  universalEquipEffect,
  {
    id: '305000045_equip_recruit',
    type: 'TRIGGER',
    triggerLocation: ['ITEM'],
    triggerEvent: ['CARD_DESTROYED_BATTLE', 'CARD_DESTROYED_EFFECT'],
    isGlobal: true,
    description: '3~5：装备单位由于战斗或对手卡效果破坏送入墓地时，从卡组放置1张同色且AC少1的非神蚀卡到战场。之后破坏这张卡。',
    condition: (gameState, playerState, instance, event) => {
      if (!instance.equipTargetId || event?.targetCardId !== instance.equipTargetId) return false;
      if (totalErosionCount(playerState) < 3 || totalErosionCount(playerState) > 5) return false;
      if (event.type === 'CARD_DESTROYED_EFFECT' && event.data?.sourcePlayerId === playerState.uid) return false;
      const destroyed = playerState.grave.find(card => card.gamecardId === event.targetCardId);
      return !!destroyed && playerState.deck.some(card =>
        card.type === 'UNIT' &&
        !card.godMark &&
        card.color === destroyed.color &&
        (card.acValue || 0) === (destroyed.acValue || 0) - 1 &&
        canPutUnitOntoBattlefield(playerState, card)
      );
    },
    execute: async (instance, gameState, playerState, event) => {
      const destroyed = playerState.grave.find(card => card.gamecardId === event?.targetCardId);
      if (!destroyed) return;
      const candidates = playerState.deck.filter(card =>
        card.type === 'UNIT' &&
        !card.godMark &&
        card.color === destroyed.color &&
        (card.acValue || 0) === (destroyed.acValue || 0) - 1 &&
        canPutUnitOntoBattlefield(playerState, card)
      );
      createSelectCardQuery(gameState, playerState.uid, candidates, '选择放置到战场的单位', '选择卡组中1张同色且ACCESS值少1的非神蚀单位放置到战场。', 1, 1, {
        sourceCardId: instance.gamecardId,
        effectId: '305000045_equip_recruit'
      }, () => 'DECK');
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target?.cardlocation === 'DECK' && canPutUnitOntoBattlefield(playerState, target)) {
        moveCard(gameState, playerState.uid, target, 'UNIT', instance);
        await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
      }
      if (instance.cardlocation === 'ITEM') destroyByEffect(gameState, instance, instance);
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 305000045
 * Card2 Row: 510
 * Card Row: 333
 * Source CardNo: PR06-08Y
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【装备】
 * 〖3-5〗【诱】{装备单位由于战斗或对手的卡效果破坏送入墓地时}：将你的卡组中的1张与那个单位卡颜色相同，ACCESS值比那个单位的ACCESS值少1的非神蚀卡放置到战场上。之后，破坏这张卡。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '305000045',
  fullName: '「群蝠披风」',
  specialName: '群蝠披风',
  type: 'ITEM',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 2,
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
