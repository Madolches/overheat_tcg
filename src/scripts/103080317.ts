import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canMeetBattlefieldColorRequirement, canPutUnitOntoBattlefield, cardsInZones, millTop, moveCard, putUnitOntoField, resonanceEffect, selectFromEntries } from './BaseUtil';

const hasAwakenText = (card: Card) =>
  (card.effects || []).some(effect =>
    /awaken/i.test(effect.id || '') ||
    (effect.description || '').includes('唤醒') ||
    (effect.description || '').includes('喚醒')
  );

const awakenUnitEntries = (playerState: any) =>
  cardsInZones(playerState, ['DECK', 'GRAVE'])
    .filter(({ card }) =>
      card.type === 'UNIT' &&
      hasAwakenText(card) &&
      canPutUnitOntoBattlefield(playerState, card)
    );

const cardEffects: CardEffect[] = [
  {
    ...resonanceEffect('103080317_resonance'),
    cost: async (gameState, playerState, instance) => {
      if (playerState.deck.length < 2) return false;
      millTop(gameState, playerState.uid, 2, instance);
      return true;
    },
    condition: (gameState, playerState, instance) =>
      instance.cardlocation === 'UNIT' &&
      playerState.isTurn &&
      gameState.phase === 'MAIN' &&
      playerState.grave.length > 0 &&
      playerState.deck.length >= 2
  },
  {
    id: '103080317_revive_self_after_own_unit_effect_leave',
    type: 'TRIGGER',
    triggerLocation: ['GRAVE'],
    triggerEvent: 'CARD_LEFT_FIELD',
    isGlobal: true,
    limitCount: 1,
    limitNameType: true,
    description: '同名1回合1次：你的单位由于卡的效果从战场离开时，满足1绿并将卡组顶2张送入墓地，将墓地中的这张卡放置到战场。',
    condition: (_gameState, playerState, instance, event) =>
      instance.cardlocation === 'GRAVE' &&
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
    description: '创痕1：同名1回合1次，将手牌或战场上的这张卡送入墓地，将卡组或墓地中1张具有唤醒的单位卡放置到战场。',
    condition: (_gameState, playerState, instance) =>
      ['HAND', 'UNIT'].includes(instance.cardlocation || '') &&
      awakenUnitEntries(playerState).length > 0,
    execute: async (instance, gameState, playerState) => {
      const fromZone = instance.cardlocation;
      moveCard(gameState, playerState.uid, instance, 'GRAVE', instance);
      (instance as any).data = {
        ...((instance as any).data || {}),
        paidSelfToGraveForAwakenTurn: gameState.turnCount,
        paidSelfToGraveFromZone: fromZone
      };
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
      if (!target || target.type !== 'UNIT' || !hasAwakenText(target) || !canPutUnitOntoBattlefield(playerState, target)) return;
      const fromDeck = target.cardlocation === 'DECK';
      putUnitOntoField(gameState, playerState.uid, target, instance);
      if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
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
