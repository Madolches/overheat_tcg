import { Card, CardEffect } from '../types/game';
import { addContinuousDamage, addContinuousPower, addInfluence, canPutUnitOntoBattlefield, ensureData, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '104000326_draw_put',
  type: 'TRIGGER',
  triggerLocation: ['HAND'],
  triggerEvent: 'CARD_DRAWN',
  isMandatory: false,
  description: '抽到这张卡并展示时，可以将手牌中的这张卡放置到战场上。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    instance.cardlocation === 'HAND' &&
    canPutUnitOntoBattlefield(playerState, instance),
  cost: async (gameState, playerState, instance) => {
    if (instance.cardlocation !== 'HAND') return false;
    gameState.logs.push(`[${instance.fullName}] 展示这张卡并大喊“OverHeat Dice Draw”作为费用。`);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    moveCard(gameState, playerState.uid, instance, 'UNIT', instance);
    const moved = playerState.unitZone.find(unit => unit?.gamecardId === instance.gamecardId);
    if (moved) {
      ensureData(moved).diceDrawPutTurn = gameState.turnCount;
      ensureData(moved).placedByOwnDrawTrigger = true;
      ensureData(moved).diceDrawSourceName = instance.fullName;
      addInfluence(moved, instance, '由于自身抽到展示效果进入战场');
    }
    gameState.logs.push(`[${instance.fullName}] OverHeat Dice Draw：从手牌放置到战场。`);
  }
}, {
  id: '104000326_draw_put_boost',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '由于自身诱发能力进入战场时，这个单位伤害+1、力量+500。',
  applyContinuous: (gameState, instance) => {
    if ((instance as any).data?.placedByOwnDrawTrigger) {
      addContinuousDamage(instance, instance, 1);
      addContinuousPower(instance, instance, 500);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104000326
 * Card2 Row: 448
 * Card Row: 383
 * Source CardNo: PR06-06B
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：由于这张卡的【诱】能力的效果进入战场的这个单位〖+1〗〖+500〗。
 * 【诱】{你抽到这张卡时，将这张卡展示}[你大喊“OverHeat Dice Draw”]：你可以将手牌中的这张卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104000326',
  fullName: '桌游智械「DICE」',
  specialName: 'DICE',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
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
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
