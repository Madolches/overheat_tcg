import { Card, CardEffect } from '../types/game';
import { ensureData, getOpponentUid, markCannotDefendUntilEndOfTurn, totalErosionCount } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102000483_cannot_be_defended',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ATTACK_DECLARED',
  isMandatory: true,
  description: '5~7：这个单位单独攻击时，对手不能用单位防御。',
  condition: (_gameState, playerState, instance, event) =>
    totalErosionCount(playerState) >= 5 &&
    totalErosionCount(playerState) <= 7 &&
    !event?.data?.isAlliance &&
    (event?.data?.attackerIds || []).includes(instance.gamecardId),
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    opponent.unitZone
      .filter((unit): unit is Card => !!unit)
      .forEach(unit => markCannotDefendUntilEndOfTurn(unit, instance, gameState));
    ensureData(instance).cannotBeDefendedSourceName = instance.fullName;
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000483
 * Card2 Row: 271
 * Card Row: 627
 * Source CardNo: PR01-03R
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖5~7〗【永】:对手不能用单位来防御这个单位的攻击。（其他联军可以被防御时无效）
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000483',
  fullName: '侍女护卫',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 3,
  power: 2000,
  basePower: 2000,
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
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
