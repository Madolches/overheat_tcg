import { Card, CardEffect, TriggerLocation } from '../types/game';
import { addInfluence, battlingUnits, createSelectCardQuery, ensureData, faceUpErosion, getOpponentUid, moveCard, ownerUidOf } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103000188_destroy_end',
  type: 'TRIGGER',
  triggerEvent: ['PHASE_CHANGED', 'CARD_DEFENSE_DECLARED'],
  triggerLocation: ['UNIT'],
  isMandatory: true,
  description: '这个单位参与战斗的战斗自由步骤开始时，参与这次战斗的对手所有单位获得回合结束时破坏。',
  condition: (gameState, _playerState, instance) =>
    gameState.phase === 'BATTLE_FREE' &&
    battlingUnits(gameState).some(unit => unit.gamecardId === instance.gamecardId),
  execute: async (instance, gameState, playerState) => {
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    battlingUnits(gameState)
      .filter(unit => ownerUidOf(gameState, unit) === opponentUid)
      .forEach(unit => {
        const data = ensureData(unit);
        data.destroyAtEndBy = instance.fullName;
        data.destroyAtEndSourcePlayerUid = playerState.uid;
        data.destroyAtEndSourceCardId = instance.gamecardId;
        addInfluence(unit, instance, '回合结束时破坏');
      });
  }
}, {
  id: '103000188_ten_flip',
  type: 'TRIGGER',
  triggerEvent: 'COMBAT_DAMAGE_CAUSED',
  triggerLocation: ['UNIT'],
  isMandatory: true,
  erosionTotalLimit: [10, 10],
  description: '10+：这个单位给予对手战斗伤害时，选择那名玩家侵蚀区2张正面卡翻面。',
  condition: (_gameState, _playerState, instance, event) =>
    event?.data?.source === 'BATTLE' &&
    (event.data?.attackerIds || []).includes(instance.gamecardId),
  execute: async (instance, gameState, playerState, event) => {
    const damagedUid = event?.playerUid || getOpponentUid(gameState, playerState.uid);
    const targets = faceUpErosion(gameState.players[damagedUid]);
    if (targets.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择翻面的侵蚀卡',
      '选择那名玩家侵蚀区中的2张正面卡，将其翻面。',
      Math.min(2, targets.length),
      Math.min(2, targets.length),
      { sourceCardId: instance.gamecardId, effectId: '103000188_ten_flip', damagedUid },
      () => 'EROSION_FRONT'
    );
  },
  targetSpec: {
    title: '选择翻面的侵蚀卡',
    description: '选择那名玩家侵蚀区中的2张正面卡，将其翻面。',
    minSelections: 2,
    maxSelections: 2,
    zones: ['EROSION_FRONT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) =>
      faceUpErosion(gameState.players[getOpponentUid(gameState, playerState.uid)])
        .map(card => ({ card, source: 'EROSION_FRONT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections, context) => {
    const damagedUid = context?.damagedUid || getOpponentUid(gameState, _playerState.uid);
    const damaged = gameState.players[damagedUid];
    selections.forEach(id => {
      const card = damaged.erosionFront.find(candidate => candidate?.gamecardId === id);
      if (card) moveCard(gameState, damagedUid, card, 'EROSION_BACK', instance, { faceDown: true });
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000188
 * Card2 Row: 201
 * Card Row: 201
 * Source CardNo: BT03-G10
 * Package: BT03(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位参与战斗的战斗自由步骤开始时，本回合中，参与这次战斗的对手的所有单位获得“【诱】:回合结束时，将这个单位破坏。”的能力。
 * 〖10+〗【诱】:这个单位给予对手战斗伤害时，选择那名玩家的侵蚀区中的2张正面卡，将其〖翻面〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000188',
  fullName: '紫间之痕「叶西妮娅」',
  specialName: '叶西妮娅',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '无',
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
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
