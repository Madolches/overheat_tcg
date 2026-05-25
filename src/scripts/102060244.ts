import { Card, CardEffect } from '../types/game';
import { addInfluence, addTempDamage, addTempPowerUntilEndOfTurn, ensureData, isFaction, ownUnits, ownerUidOf } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102060244_power_bonus',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  continuousPriority: 100,
  description: '处理将你的单位力量值上升的卡效果时，上升数值+500。',
  applyContinuous: (gameState, instance) => {
    const ownerUid = ownerUidOf(gameState, instance);
    if (!ownerUid) return;
    ownUnits(gameState.players[ownerUid]).forEach(unit => {
      const data = ensureData(unit);
      data.powerIncreaseBonus = Number(data.powerIncreaseBonus || 0) + 500;
      data.powerIncreaseBonusSourceName = instance.fullName;
      addInfluence(unit, instance, '力量上升的卡效果额外+500');
    });
  }
}, {
  id: '102060244_thunder_boost',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [10, 10],
  limitCount: 1,
  limitGlobal: true,
  description: '10+：1游戏1次，主要阶段中，若你有5个以上<雷霆>单位，本回合你的所有<雷霆>单位伤害+1、力量+500。',
  condition: (gameState, playerState) =>
    gameState.phase === 'MAIN' &&
    playerState.isTurn &&
    ownUnits(playerState).filter(unit => isFaction(unit, '雷霆')).length >= 5,
  execute: async (instance, gameState, playerState) => {
    ownUnits(playerState)
      .filter(unit => isFaction(unit, '雷霆'))
      .forEach(unit => {
        addTempDamage(unit, instance, 1);
        addTempPowerUntilEndOfTurn(unit, instance, 500, gameState);
      });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102060244
 * Card2 Row: 413
 * Card Row: 283
 * Source CardNo: BT05-R07
 * Package: BT05(ESR,OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:处理将你的单位的力量值上升的卡的效果时，那个上升的数值+500。
 * 〖10+〗【启】〖1游戏1次〗{你的主要阶段，你的战场上的<雷霆>单位有5个以上}:本回合中，你的所有<雷霆>单位〖伤害+1〗〖力量+500〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102060244',
  fullName: '炎雷的增幅师「拉法」',
  specialName: '拉法',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '雷霆',
  acValue: 3,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
