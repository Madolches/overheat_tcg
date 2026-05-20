import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutCardOntoBattlefieldByEffect, cardsInZones, createSelectCardQuery, discardHandCost, isFeijingCard, isFeijingUnit, isNonGodAccessLe3Item, moveCardAsCost, putCardOntoField } from './BaseUtil';

const nonGodErosionCards = (playerState: any) =>
  playerState.erosionFront
    .filter((card: Card | null): card is Card => !!card && !card.godMark)
    .filter((card: Card) => (card.type === 'UNIT' || card.type === 'ITEM' || card.isEquip) && canPutCardOntoBattlefieldByEffect(playerState, card));

const cardEffects: CardEffect[] = [{
  id: '104020340_end_put_erosion',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'TURN_END' as any,
  description: '你的回合结束时，选择侵蚀区中的1张非神蚀卡，将你战场上的1个菲晶单位破坏：可以将被选择的侵蚀区卡放置到战场上。',
  condition: (_gameState, playerState, _instance, event) =>
    event?.playerUid === playerState.uid &&
    playerState.isTurn &&
    playerState.unitZone.some((unit: Card | null) => !!unit && isFeijingUnit(unit)) &&
    nonGodErosionCards(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodErosionCards(playerState),
      '选择侵蚀区非神蚀卡',
      '选择你的侵蚀区中的1张非神蚀卡。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104020340_end_put_erosion', step: 'TARGET' },
      () => 'EROSION_FRONT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      if (!selections[0]) return;
      const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
      if (!target || target.godMark || !canPutCardOntoBattlefieldByEffect(playerState, target)) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        playerState.unitZone.filter((unit: Card | null): unit is Card => !!unit && isFeijingUnit(unit)),
        '选择破坏菲晶单位',
        '选择你战场上的1个具有【菲晶】的单位破坏作为费用。',
        1,
        1,
        {
          sourceCardId: instance.gamecardId,
          effectId: '104020340_end_put_erosion',
          step: 'COST',
          targetId: target.gamecardId
        },
        () => 'UNIT'
      );
      return;
    }

    if (context?.step !== 'COST') return;
    const cost = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!cost || cost.cardlocation !== 'UNIT' || !isFeijingUnit(cost)) return;
    moveCardAsCost(gameState, playerState.uid, cost, 'GRAVE', instance);
    const target = AtomicEffectExecutor.findCardById(gameState, context.targetId);
    if (target && target.cardlocation === 'EROSION_FRONT' && !target.godMark) {
      putCardOntoField(gameState, playerState.uid, target, instance);
    }
  }
}, {
  id: '104020340_put_item',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  erosionTotalLimit: [3, 5],
  description: '3-5，同名1回合1次，舍弃1张菲晶手牌：将卡组或侵蚀区中1张AC+3以下的非神蚀道具卡放置到战场上。',
  condition: (_gameState, playerState, instance) =>
    playerState.hand.some((card: Card) => card.gamecardId !== instance.gamecardId && isFeijingCard(card)) &&
    cardsInZones(playerState, ['DECK', 'EROSION_FRONT']).some(({ card }) =>
      isNonGodAccessLe3Item(card) &&
      canPutCardOntoBattlefieldByEffect(playerState, card)
    ),
  cost: discardHandCost(1, isFeijingCard),
  execute: async (instance, gameState, playerState) => {
    const entries = cardsInZones(playerState, ['DECK', 'EROSION_FRONT'])
      .filter(({ card }) => isNonGodAccessLe3Item(card) && canPutCardOntoBattlefieldByEffect(playerState, card));
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, entries),
      title: '选择非神蚀道具',
      description: '选择你的卡组或侵蚀区中的1张ACCESS值+3以下的非神蚀道具卡放置到战场上。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: { sourceCardId: instance.gamecardId, effectId: '104020340_put_item' }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !isNonGodAccessLe3Item(target) || !canPutCardOntoBattlefieldByEffect(playerState, target)) return;
    const fromDeck = target.cardlocation === 'DECK';
    putCardOntoField(gameState, playerState.uid, target, instance);
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020340
 * Card2 Row: 465
 * Card Row: 400
 * Source CardNo: BT06-B06
 * Package: BT06(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{你的回合结束时，选择你的侵蚀区中的1张非神蚀卡}（将你战场上的1个具有【菲晶】的单位破坏）：你可以将被选择的侵蚀区中的卡放置到战场上。
 * 【3-5】【启】〖同名一回合一次〗（舍弃手牌中1张具有【菲晶】的卡）：将你的卡组或侵蚀区中1张AC值+3以下的非神蚀道具卡放置到战场上。
 */
const card: Card = {
  id: '104020340',
  fullName: '菲晶工匠「特特鲁」',
  specialName: '特特鲁',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '九尾商会联盟',
  acValue: 4,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: true,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
