import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, addTempDamage, addTempPower, createSelectCardQuery, faceUpErosion, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101150207_combat_boost',
  type: 'TRIGGER',
  triggerEvent: ['CARD_ATTACK_DECLARED', 'CARD_DEFENSE_DECLARED'],
  isMandatory: false,
  triggerLocation: ['UNIT'],
  description: '宣言攻击或防御时，可以选择2张正面侵蚀放逐，这次战斗中伤害+1、力量+1000。',
  condition: (_gameState, playerState, instance, event) => {
    const attacks = event?.type === 'CARD_ATTACK_DECLARED' && (event.data?.attackerIds || []).includes(instance.gamecardId);
    const defends = event?.type === 'CARD_DEFENSE_DECLARED' && event.sourceCardId === instance.gamecardId;
    return (attacks || defends) && faceUpErosion(playerState).length >= 2;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      faceUpErosion(playerState),
      '选择放逐的侵蚀卡',
      '选择你的侵蚀区的2张正面卡，将其放逐。',
      0,
      2,
      { sourceCardId: instance.gamecardId, effectId: '101150207_combat_boost' },
      () => 'EROSION_FRONT'
    );
  },
  targetSpec: {
    title: '选择放逐的侵蚀卡',
    description: '选择你的侵蚀区的2张正面卡，将其放逐。',
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
      if (card) moveCard(gameState, playerState.uid, card, 'EXILE', instance);
    });
    const self = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (self) {
      addTempDamage(self, instance, 1);
      addTempPower(self, instance, 1000);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101150207
 * Card2 Row: 233
 * Card Row: 233
 * Source CardNo: BT03-W08
 * Package: BT03(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位宣言攻击或防御时，你可以选择你的侵蚀区的2张正面卡，将其放逐。之后，这次战斗中，这个单位〖伤害+1〗〖力量+1000〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101150207',
  fullName: '龙神斗士',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '仙雪原',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
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
