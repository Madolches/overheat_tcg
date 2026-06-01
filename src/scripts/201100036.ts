import { Card, CardEffect, TriggerLocation } from '../types/game';
import { createSelectCardQuery, faceUpErosion, moveCard, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('201100036_prevent', '选择侵蚀区2张正面卡翻面。之后本回合防止你将受到的所有伤害。', async (instance, gameState, playerState) => {
    const candidates = faceUpErosion(playerState);
    if (candidates.length < 2) return;
    const count = 2;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择翻面的侵蚀卡',
      `选择你的侵蚀区中的${count}张正面卡，将其翻面。`,
      count,
      count,
      { sourceCardId: instance.gamecardId, effectId: '201100036_prevent' },
      () => 'EROSION_FRONT'
    );
  }, {
    condition: (_gameState, playerState) => faceUpErosion(playerState).length >= 2,
    targetSpec: {
      title: '选择翻面的侵蚀卡',
      description: '选择你的侵蚀区中的正面卡，将其翻面。',
      minSelections: 2,
      maxSelections: 2,
      zones: ['EROSION_FRONT'],
      controller: 'SELF',
      getCandidates: (_gameState, playerState) => faceUpErosion(playerState).map(card => ({ card, source: 'EROSION_FRONT' as any }))
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      selections
        .map(id => faceUpErosion(playerState).find(card => card.gamecardId === id))
        .filter((card): card is Card => !!card)
        .forEach(card => moveCard(gameState, playerState.uid, card, 'EROSION_BACK', instance, { faceDown: true }));
      (playerState as any).preventAllDamageTurn = gameState.turnCount;
      (playerState as any).preventAllDamageSourceName = instance.fullName;
    }
  })];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201100036
 * Card2 Row: 67
 * Card Row: 67
 * Source CardNo: BT01-W12
 * Package: ST01(TD),BT01(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择你的侵蚀区中的2张正面卡，将其〖翻面〗。之后，本回合中，防止你将要受到的所有伤害。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201100036',
  fullName: '治愈的奇迹',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '艾柯利普斯',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
