import { Card, CardEffect } from '../types/game';
import { addContinuousPower, addInfluence, attackingUnits, ensureData, ownerOf } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102000199_enter_exhausted',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '只能以横置状态进入战场，且你的回合开始阶段不能重置。',
  applyContinuous: (_gameState, instance) => {
    if (instance.playedTurn === _gameState.turnCount) {
      instance.isExhausted = true;
    }
    instance.canResetCount = Math.max(instance.canResetCount || 0, 1);
    ensureData(instance).cannotResetSourceName = instance.fullName;
    addInfluence(instance, instance, '下个重置阶段不能重置');
  }
}, {
  id: '102000199_attack_power',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '这个单位以外的你的所有参与攻击的单位力量上升与这个单位力量相同的数值。',
  applyContinuous: (gameState, instance) => {
    const owner = ownerOf(gameState, instance);
    if (!owner || !gameState.battleState) return;
    attackingUnits(gameState)
      .filter(unit => owner.unitZone.some(own => own?.gamecardId === unit.gamecardId))
      .filter(unit => unit.gamecardId !== instance.gamecardId)
      .forEach(unit => addContinuousPower(unit, instance, instance.power || 0));
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000199
 * Card2 Row: 218
 * Card Row: 218
 * Source CardNo: BT03-R10
 * Package: BT03(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:这个单位只能以横置的状态进入战场。你的回合开始阶段中，这个单位不能〖重置〗。
 * 【永】:这个单位以外的你的所有参与攻击的单位在那次战斗中，力量上升与这个单位的力量值相同的数值。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000199',
  fullName: '翻云的舞蹈家「亚迪拉」',
  specialName: '亚迪拉',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 2,
  power: 500,
  basePower: 500,
  damage: 0,
  baseDamage: 0,
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
