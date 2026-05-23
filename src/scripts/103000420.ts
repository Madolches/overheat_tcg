import { Card, CardEffect } from '../types/game';
import { ensureData } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103000420_no_return_to_deck_by_effect',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  preventEffectReturnToDeck: true,
  description: '这个单位不会由于卡的效果返回卡组。',
  condition: (_gameState, _playerState, instance) =>
    instance.cardlocation === 'UNIT'
}, {
  id: '103000420_awakened_attack_defense_gate',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '只有被唤醒适用的这个单位才能宣言攻击或防御。',
  applyContinuous: (gameState, instance) => {
    const data = ensureData(instance);
    if (data.awakenedTurn !== gameState.turnCount) {
      data.cannotAttackThisTurn = gameState.turnCount;
      data.cannotAttackThisTurnSourceName = instance.fullName;
      data.cannotDefendTurn = gameState.turnCount;
      data.cannotDefendSourceName = instance.fullName;
    } else if (data.cannotAttackThisTurnSourceName === instance.fullName) {
      delete data.cannotAttackThisTurn;
      delete data.cannotAttackThisTurnSourceName;
      delete data.cannotDefendTurn;
      delete data.cannotDefendSourceName;
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000420
 * Card2 Row: 643
 * Card Row: 525
 * Source CardNo: BT08-G06
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【歼灭】
 * 【永】:这个单位不会由于卡的效果返回卡组。被唤醒适用的这个单位才能宣言攻击或防御。
 */
const card: Card = {
  id: '103000420',
  fullName: '司雷福角斗士',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 5,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
