import { Card, CardEffect } from '../types/game';
import { allCardsOnField, allUnitsOnField, canPayAccessCost, createSelectCardQuery, destroyByEffect } from './BaseUtil';

const isShingiStory = (card?: Card) =>
  !!card &&
  card.type === 'STORY' &&
  card.fullName.includes('神仪');

const shingiDestroyCandidates = (gameState: any, playerState: any, instance: Card) =>
  allUnitsOnField(gameState)
    .filter(card => !card.godMark)
    .filter(card => canPayAccessCost(gameState, playerState, (card.acValue || 0) + 2, instance.color, instance));

const cardEffects: CardEffect[] = [{
  id: '101140374_shingi_cost_destroy',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  isMandatory: false,
  triggerLocation: ['EXILE'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：这个单位由于卡名含有《神仪》的故事卡费用被放逐时，选择战场1个非神蚀单位，支付AC+2：可以破坏被选择的单位。',
  condition: (gameState, playerState, instance, event) => {
    if (event?.sourceCardId !== instance.gamecardId || instance.cardlocation !== 'EXILE') return false;
    const sourceCardId = event.data?.effectSourceCardId || (instance as any).data?.lastMovedAsCostSourceCardId;
    const source = sourceCardId
      ? allCardsOnField(gameState).find(card => card.gamecardId === sourceCardId) ||
        Object.values(gameState.players)
          .flatMap(player => [...player.hand, ...player.deck, ...player.grave, ...player.exile, ...player.playZone])
          .find(card => card?.gamecardId === sourceCardId)
      : undefined;
    return event.data?.sourceZone === 'UNIT' &&
      event.data?.targetZone === 'EXILE' &&
      event.data?.isEffect === false &&
      isShingiStory(source) &&
      shingiDestroyCandidates(gameState, playerState, instance).length > 0;
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = shingiDestroyCandidates(gameState, playerState, instance);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择破坏目标',
      '选择战场上1个非神蚀单位，支付AC+2后可以将其破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101140374_shingi_cost_destroy', step: 'TARGET' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择破坏目标',
    description: '选择战场上1个非神蚀单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: (gameState, playerState, instance) =>
      shingiDestroyCandidates(gameState, playerState, instance)
        .map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'PAYMENT') {
      const paidTarget = context.targetId
        ? allUnitsOnField(gameState).find(card => card.gamecardId === context.targetId && !card.godMark)
        : undefined;
      if (paidTarget) destroyByEffect(gameState, paidTarget, instance);
      return;
    }

    const target = selections[0]
      ? allUnitsOnField(gameState).find(card => card.gamecardId === selections[0] && !card.godMark)
      : undefined;
    if (!target) return;
    const accessCost = (target.acValue || 0) + 2;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_PAYMENT',
      playerUid: playerState.uid,
      options: [],
      title: `支付${accessCost}点ACCESS`,
      description: `支付${accessCost}点费用以结算 [${instance.fullName}] 的效果。`,
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      paymentCost: accessCost,
      paymentColor: instance.color,
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '101140374_shingi_cost_destroy',
        targetId: target.gamecardId,
        step: 'PAYMENT'
      }
    };
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140374
 * Card2 Row: 567
 * Card Row: 451
 * Source CardNo: BT07-W01
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位由于卡名含有《神仪》的故事卡的费用而被放逐时，选择战场上1个非神蚀单位}[AC+2]：你可以将被选择的卡破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101140374',
  fullName: '神仪筹备人',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '女神教会',
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
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
