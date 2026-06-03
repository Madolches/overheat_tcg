import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, addTempDamage, addTempPower, createSelectCardQuery, faceUpErosion, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101150209_attack_boost',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ATTACK_DECLARED',
  isMandatory: false,
  triggerLocation: ['UNIT'],
  description: '宣言攻击时，可以选择2张正面侵蚀放逐，这次战斗中伤害+1、力量+1000。',
  condition: (_gameState, playerState, instance, event) =>
    (event?.data?.attackerIds || []).includes(instance.gamecardId) &&
    faceUpErosion(playerState).length >= 2,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      faceUpErosion(playerState),
      '选择放逐的侵蚀卡',
      '选择你的侵蚀区的2张正面卡，将其放逐。',
      0,
      2,
      { sourceCardId: instance.gamecardId, effectId: '101150209_attack_boost' },
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
 * Source CardID: 101150209
 * Card2 Row: 235
 * Card Row: 235
 * Source CardNo: BT03-W10
 * Package: BT03(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位宣言攻击时，你可以选择你的侵蚀区的2张正面卡，将其放逐。之后，这次战斗中，这个单位〖伤害+1〗〖力量+1000〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101150209',
  fullName: '龙神骑士',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '仙雪原',
  acValue: 3,
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
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
