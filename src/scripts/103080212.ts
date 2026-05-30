import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, createSelectCardQuery, isFaction, isNonGodUnit, moveCard, nameContains, ownUnits, putUnitOntoField } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103080212_end_search',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'TURN_END' as any,
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  description: '你的回合结束时，若你有3个以上单位返回过卡组，可以将卡组中1张卡名含有《神木》的单位卡加入手牌。',
  condition: (_gameState, playerState, _instance, event) =>
    event?.playerUid === playerState.uid &&
    Number((playerState as any).unitsReturnedToDeckThisTurn || 0) >= 3 &&
    playerState.deck.some(card => card.type === 'UNIT' && nameContains(card, '神木')),
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.deck.filter(card => card.type === 'UNIT' && nameContains(card, '神木'));
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择神木单位',
      '选择卡组中1张卡名含有《神木》的单位卡加入手牌。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103080212_end_search' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.effectId !== '103080212_end_search') return;
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (selected?.cardlocation === 'DECK') {
      moveCard(gameState, playerState.uid, selected, 'HAND', instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
}, {
  id: '103080212_plan',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '你的回合中，选择你的1个<神木森>单位放置到卡组底，之后将卡组中1张不同卡名的<神木森>非神蚀单位放置到战场上。',
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    ownUnits(playerState).some(unit => isFaction(unit, '神木森')) &&
    playerState.deck.some(card => isFaction(card, '神木森') && isNonGodUnit(card)),
  targetSpec: {
    title: '选择返回单位',
    description: '选择你的战场上的1个<神木森>单位放置到卡组底。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'RETURN',
    getCandidates: (_gameState, playerState) =>
      ownUnits(playerState)
        .filter(unit => isFaction(unit, '神木森'))
        .map(card => ({ card, source: 'UNIT' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(unit => isFaction(unit, '神木森')),
      '选择返回单位',
      '选择你的战场上的1个<神木森>单位放置到卡组底。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103080212_plan', step: 'RETURN' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'RETURN') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || target.cardlocation !== 'UNIT') return;
      const returnedName = target.fullName;
      moveCard(gameState, playerState.uid, target, 'DECK', instance, { insertAtBottom: true });
      const candidates = playerState.deck.filter(card =>
        card.fullName !== returnedName &&
        isFaction(card, '神木森') &&
        isNonGodUnit(card) &&
        canPutUnitOntoBattlefield(playerState, card)
      );
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择登场单位',
        '选择卡组中1张与返回单位卡名不同的<神木森>非神蚀单位卡放置到战场上。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '103080212_plan', step: 'PUT' },
        () => 'DECK'
      );
      return;
    }
    if (context?.step !== 'PUT') return;
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (selected?.cardlocation === 'DECK') {
      putUnitOntoField(gameState, playerState.uid, selected, instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103080212
 * Card2 Row: 370
 * Card Row: 240
 * Source CardNo: BT05-G04
 * Package: BT05(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{你有3个以上单位返回过卡组的你的回合结束时}:你可以将你的卡组中1张卡名含有《神木》的单位卡加入手牌。
 * 【启】〖同名1回合1次〗:{你的回合中，选择你的战场上的1个<神木森>单位}:将被选择的单位放置到你的卡组底。之后，将你的卡组中的1张与那个单位卡名不同的<神木森>非神蚀单位卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103080212',
  fullName: '神木规划师「希尔维娅」',
  specialName: '希尔维娅',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '神木森',
  acValue: 3,
  power: 2500,
  basePower: 2500,
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
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
