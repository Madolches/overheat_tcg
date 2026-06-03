import { Card, CardEffect } from '../types/game';
import { createSelectCardQuery, moveCardsToBottom, universalEquipEffect } from './BaseUtil';

const substituteEffect: CardEffect = {
  id: '301000078_substitute',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '装备单位被破坏时，你可以将这张卡送入墓地作为代替。',
  substitutionFilter: undefined,
  applyContinuous: (_gameState, instance) => {
    substituteEffect.substitutionFilter = instance.equipTargetId ? { gamecardId: instance.equipTargetId, onField: true } : undefined;
  }
};

const cardEffects: CardEffect[] = [universalEquipEffect, substituteEffect, {
  id: '301000078_destroyed_bottom',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_ZONE',
  triggerLocation: ['GRAVE'],
  isMandatory: true,
  description: '这张卡被破坏并送入墓地时，选择墓地2张卡放置到卡组底。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'ITEM' &&
    event.data?.targetZone === 'GRAVE' &&
    playerState.grave.length >= 2,
  targetSpec: {
    title: '选择墓地的卡',
    description: '选择你的墓地中的2张卡，将其放置到卡组底。',
    minSelections: 2,
    maxSelections: 2,
    zones: ['GRAVE'],
    controller: 'SELF',
    step: 'BOTTOM_GRAVE',
    getCandidates: (_gameState, playerState) =>
      playerState.grave.map(card => ({ card, source: 'GRAVE' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, playerState.grave, '选择墓地的卡', '选择你的墓地中的2张卡，将其放置到卡组底。', 2, 2, { sourceCardId: instance.gamecardId, effectId: '301000078_destroyed_bottom' }, () => 'GRAVE');
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const cards = selections.map(id => playerState.grave.find(card => card.gamecardId === id)).filter((card): card is Card => !!card);
    moveCardsToBottom(gameState, playerState.uid, cards, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 301000078
 * Card2 Row: 242
 * Card Row: 598
 * Source CardNo: BT03-W17
 * Package: BT03(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【装备】（〖1回合1次〗你的主要阶段中，你可以选择你的1个单位装备这张卡，或者解除这张卡的装备状态。）
 * 【永】:装备单位被破坏时，你可以将这张卡送入墓地作为代替。
 * 【诱】:这张卡被破坏并送入墓地时，选择你的墓地中的2张卡，将其放置到卡组底。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '301000078',
  fullName: '天使之翼',
  specialName: '',
  type: 'ITEM',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
