import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canActivateDefaultTiming, cardsInZones, createSelectCardQuery, ensureData, markCanAttackAnyUnit, moveCardAsCost, readyByEffect } from './BaseUtil';

const dikaiGodmarkCards = (playerState: any, instance: Card) =>
  cardsInZones(playerState, ['HAND', 'DECK', 'GRAVE']).filter(({ card }) =>
    card.godMark &&
    card.gamecardId !== instance.gamecardId &&
    !!instance.specialName &&
    (card.specialName === instance.specialName || card.fullName.includes(instance.specialName))
  );

const cardEffects: CardEffect[] = [{
  id: '102050432_god_limit',
  type: 'CONTINUOUS',
  description: '你的战场上只能有1个神蚀单位。',
  limitGodmarkCount: 1
}, {
  id: '102050432_story_lock',
  type: 'CONTINUOUS',
  content: 'OPPONENT_STORY_ONLY_OWN_TURN',
  description: '所有对手只能在他自己的回合中使用故事卡。'
}, {
  id: '102050432_reset_attack_unit',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：放逐合计2张「迪凯」神蚀卡，重置这个单位。本回合下一次攻击可以攻击对手的单位。',
  condition: (gameState, playerState, instance) =>
    canActivateDefaultTiming(gameState, playerState) &&
    instance.cardlocation === 'UNIT' &&
    instance.isExhausted &&
    dikaiGodmarkCards(playerState, instance).length >= 2,
  cost: async (gameState, playerState, instance) => {
    const costs = dikaiGodmarkCards(playerState, instance);
    if (costs.length < 2) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costs.map(entry => entry.card),
      '选择放逐费用',
      '选择合计2张「迪凯」神蚀卡放逐作为费用。',
      2,
      2,
      {
        sourceCardId: instance.gamecardId,
        effectId: '102050432_reset_attack_unit',
        step: 'DIKAI_EXILE_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      card => (costs.find(entry => entry.card.gamecardId === card.gamecardId)?.source || card.cardlocation) as any
    );
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'DIKAI_EXILE_COST') return;
    const selected = selections
      .map(id => dikaiGodmarkCards(playerState, instance).find(entry => entry.card.gamecardId === id)?.card)
      .filter((card): card is Card => !!card);
    if (selected.length !== 2 || new Set(selected.map(card => card.gamecardId)).size !== 2) {
      context.cancelActivation = true;
      return;
    }
    const usedDeck = selected.some(card => card.cardlocation === 'DECK');
    selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
    if (usedDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  },
  execute: async (instance, gameState) => {
    readyByEffect(gameState, instance, instance);
    markCanAttackAnyUnit(instance, instance);
    const data = ensureData(instance);
    data.canAttackAnyUnitUntilTurn = gameState.turnCount;
    data.canAttackAnyUnitConsumeOnAttack = true;
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050432
 * Card2 Row: 307
 * Card Row: 546
 * Source CardNo: BT04-R06
 * Package: BT04(ESR,OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【速攻】
 * 【永】：你的战场上只能有一个神蚀单位。所有对手只能在他自己的回合中使用故事卡。
 * 【启】〖同名一回合一次〗：[从你的手牌，卡组，墓地放逐合计两张「迪凯」的神蚀卡]将这个单位重置。本回合中，这个单位的下一次攻击可以攻击对手的单位。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050432',
  fullName: '骑士团长「迪凯」',
  specialName: '迪凯',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '伊列宇王国',
  acValue: 5,
  power: 4000,
  basePower: 4000,
  damage: 4,
  baseDamage: 4,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
