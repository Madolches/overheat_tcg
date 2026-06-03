import { Card, CardEffect, TriggerLocation } from '../types/game';
import { createSelectCardQuery, damagePlayerByEffect, faceUpErosion, getOpponentUid, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102050190_end_damage',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END' as any,
  isMandatory: false,
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  erosionTotalLimit: [10, 10],
  description: '10+，同名1回合1次：你的回合结束时，可以选择2张正面侵蚀送入墓地，之后给予对手2点伤害。',
  condition: (_gameState, playerState, _instance, event) =>
    event?.playerUid === playerState.uid &&
    playerState.isTurn &&
    faceUpErosion(playerState).length >= 2,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      faceUpErosion(playerState),
      '选择送入墓地的侵蚀卡',
      '选择你的侵蚀区的2张正面卡，将其送入墓地。之后给予对手2点伤害。',
      0,
      2,
      { sourceCardId: instance.gamecardId, effectId: '102050190_end_damage' },
      () => 'EROSION_FRONT'
    );
  },
  targetSpec: {
    title: '选择送入墓地的侵蚀卡',
    description: '选择你的侵蚀区的2张正面卡，将其送入墓地。',
    minSelections: 0,
    maxSelections: 2,
    zones: ['EROSION_FRONT'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      faceUpErosion(playerState).map(card => ({ card, source: 'EROSION_FRONT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    if (selections.length !== 2) return;
    selections.forEach(id => {
      const card = playerState.erosionFront.find(candidate => candidate?.gamecardId === id);
      if (card) moveCard(gameState, playerState.uid, card, 'GRAVE', instance);
    });
    await damagePlayerByEffect(gameState, playerState.uid, getOpponentUid(gameState, playerState.uid), 2, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050190
 * Card2 Row: 209
 * Card Row: 209
 * Source CardNo: BT03-R01
 * Package: BT03(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖10+〗【诱】〖同名1回合1次〗:你的回合结束时，你可以选择你的侵蚀区的2张正面卡，将其送入墓地。之后，选择1名对手，给予他2点伤害。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050190',
  fullName: '火魂的钢弓手',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
  acValue: 4,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
