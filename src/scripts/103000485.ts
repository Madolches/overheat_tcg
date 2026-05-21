import { Card, CardEffect } from '../types/game';
import { addContinuousDamage, addContinuousKeyword, addContinuousPower, totalErosionCount } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103000485_grave_entry_boost',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '从墓地进入战场的这个单位力量+500，并获得【速攻】【歼灭】。',
  applyContinuous: (_gameState, instance) => {
    if ((instance as any).data?.lastMovedFromZone === 'GRAVE') {
      addContinuousPower(instance, instance, 500);
      addContinuousKeyword(instance, instance, 'rush');
      addContinuousKeyword(instance, instance, 'annihilation');
    }
  }
}, {
  id: '103000485_erosion_damage',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '6~8：这个单位伤害+1。',
  applyContinuous: (gameState, instance) => {
    const owner = Object.values(gameState.players).find(player => player.unitZone.some(unit => unit?.gamecardId === instance.gamecardId));
    if (owner && totalErosionCount(owner) >= 6 && totalErosionCount(owner) <= 8) {
      addContinuousDamage(instance, instance, 1);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000485
 * Card2 Row: 274
 * Card Row: 630
 * Source CardNo: PR01-06G
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:从墓地进入战场的这个单位〖力量+500〗，获得【速攻】【歼灭】。
 * 〖6~8〗【永】这个单位〖伤害+1〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000485',
  fullName: '被唤醒的树精灵',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: false,
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
