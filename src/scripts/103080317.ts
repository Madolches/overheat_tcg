import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canMeetBattlefieldColorRequirement, canPayAccessCost, canPutUnitOntoBattlefield, cardsInZones, hasAwakenAbility, millTop, moveCardAsCost, putUnitOntoField, selectFromEntries } from './BaseUtil';

const awakenUnitEntries = (playerState: any) =>
  cardsInZones(playerState, ['DECK', 'GRAVE'])
    .filter(({ card }) =>
      card.type === 'UNIT' &&
      hasAwakenAbility(card) &&
      canPutUnitOntoBattlefield(playerState, card)
    );

const canPutUnitAfterSelfToGraveCost = (playerState: any, instance: Card, target: Card) => {
  if (target.type !== 'UNIT' || !hasAwakenAbility(target)) return false;
  if (canPutUnitOntoBattlefield(playerState, target)) return true;
  if (instance.cardlocation !== 'UNIT') return false;
  const slotIndex = playerState.unitZone.findIndex((unit: Card | null) => unit?.gamecardId === instance.gamecardId);
  if (slotIndex < 0) return false;
  const original = playerState.unitZone[slotIndex];
  playerState.unitZone[slotIndex] = null;
  try {
    return canPutUnitOntoBattlefield(playerState, target);
  } finally {
    playerState.unitZone[slotIndex] = original;
  }
};

const hasAwakenUnitTargetAfterSelfCost = (playerState: any, instance: Card) =>
  cardsInZones(playerState, ['DECK', 'GRAVE'])
    .some(({ card }) => canPutUnitAfterSelfToGraveCost(playerState, instance, card));

const grienAwakenCost: CardEffect['cost'] = async (gameState, playerState, instance) => {
  if (!canPayAccessCost(gameState, playerState, 2, undefined, instance)) return false;
  gameState.pendingQuery = {
    id: Math.random().toString(36).substring(7),
    type: 'SELECT_PAYMENT',
    playerUid: playerState.uid,
    options: [],
    title: '支付费用',
    description: `支付2点费用以发动${instance.fullName}。`,
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'ACTIVATE_COST_RESOLVE',
    paymentCost: 2,
    paymentColor: instance.color,
    context: {
      sourceCardId: instance.gamecardId,
      effectId: '103080317_put_awaken_unit',
      moveSelfToGraveAsCost: true
    }
  };
  return true;
};
(grienAwakenCost as any).paymentCost = 2;

const cardEffects: CardEffect[] = [
  {
    id: '103080317_revive_self_after_own_unit_effect_leave',
    type: 'TRIGGER',
    triggerLocation: ['UNIT', 'GRAVE'],
    triggerEvent: 'CARD_LEFT_FIELD',
    isGlobal: true,
    sourceSnapshotOnLeftField: true,
    limitCount: 1,
    limitNameType: true,
    description: '同名1回合1次：你的单位由于卡的效果从战场离开时，满足1绿并将卡组顶2张送入墓地，将墓地中的这张卡放置到战场。',
    condition: (_gameState, playerState, instance, event) =>
      (
        instance.cardlocation === 'GRAVE' ||
        (
          event?.sourceCard === instance &&
          event.data?.targetZone === 'GRAVE'
        )
      ) &&
      event?.playerUid === playerState.uid &&
      event.data?.sourceZone === 'UNIT' &&
      event.data?.isEffect === true &&
      canMeetBattlefieldColorRequirement(playerState, { GREEN: 1 }) &&
      playerState.deck.length >= 2 &&
      canPutUnitOntoBattlefield(playerState, instance),
    cost: async (gameState, playerState, instance) => {
      if (!canMeetBattlefieldColorRequirement(playerState, { GREEN: 1 }) || playerState.deck.length < 2) return false;
      millTop(gameState, playerState.uid, 2, instance);
      return true;
    },
    execute: async (instance, gameState, playerState) => {
      putUnitOntoField(gameState, playerState.uid, instance, instance);
    }
  },
  {
    id: '103080317_put_awaken_unit',
    type: 'ACTIVATE',
    triggerLocation: ['HAND', 'UNIT'],
    erosionBackLimit: [1, 10],
    limitCount: 1,
    limitNameType: true,
    description: '创痕1：同名1回合1次，支付2费并将手牌或战场上的这张卡送入墓地，将卡组或墓地中1张具有唤醒的单位卡放置到战场。',
    condition: (_gameState, playerState, instance) =>
      ['HAND', 'UNIT'].includes(instance.cardlocation || '') &&
      hasAwakenUnitTargetAfterSelfCost(playerState, instance),
    cost: grienAwakenCost,
    execute: async (instance, gameState, playerState) => {
      selectFromEntries(
        gameState,
        playerState.uid,
        awakenUnitEntries(playerState),
        '选择唤醒单位',
        '选择你的卡组或墓地中的1张具有唤醒的单位卡放置到战场。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '103080317_put_awaken_unit' }
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
      if (!target || target.type !== 'UNIT' || !hasAwakenAbility(target) || !canPutUnitOntoBattlefield(playerState, target)) return;
      const fromDeck = target.cardlocation === 'DECK';
      putUnitOntoField(gameState, playerState.uid, target, instance);
      if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    },
    onCostResolve: async (instance, gameState, playerState) => {
      const fromZone = instance.cardlocation;
      moveCardAsCost(gameState, playerState.uid, instance, 'GRAVE', instance);
      (instance as any).data = {
        ...((instance as any).data || {}),
        paidSelfToGraveForAwakenTurn: gameState.turnCount,
        paidSelfToGraveFromZone: fromZone
      };
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103080317
 * Card2 Row: 551
 * Card Row: 371
 * Source CardNo: BT07-G07
 * Package: BT07(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{你的单位由于卡的效果从战场上离开时}[〖0：绿〗将你卡组顶的2张卡送入墓地]:你可以将墓地中的这张卡放置到战场上。
 * 【创痕1】【启】〖同名1回合1次〗[〖+2〗，将手牌或战场上的这张卡送入墓地]：将你卡组或墓地中的1张具有唤醒的单位卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103080317',
  fullName: '翠绿守护「格里恩」',
  specialName: '格里恩',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '神木森',
  acValue: 4,
  power: 3500,
  basePower: 3500,
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
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
