import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { canPutCardOntoBattlefieldByEffect, createSelectCardQuery, exhaustCost, isAlchemyCard, moveCardsToBottom } from './BaseUtil';

const effect_105120167_activate: CardEffect = {
  id: '105120167_activate',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '横置这个单位，将其他我方战场上的2张卡送入墓地，之后从卡组将1个炼金单位放置到战场。',
  condition: (_gameState, playerState, instance) => {
    const ownField = [...playerState.unitZone, ...playerState.itemZone].filter(
      (card): card is Card => !!card && card.gamecardId !== instance.gamecardId
    );
    return !instance.isExhausted && ownField.length >= 2 && playerState.deck.some(card => card.type === 'UNIT' && isAlchemyCard(card));
  },
  cost: exhaustCost,
  execute: async (instance, gameState, playerState) => {
    const ownField = [...playerState.unitZone, ...playerState.itemZone].filter(
      (card): card is Card => !!card && card.gamecardId !== instance.gamecardId
    );
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownField,
      '选择2张卡',
      '将其他我方战场上的2张卡送入墓地。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '105120167_activate', step: 'SEND_FIELD' }
    );
  },
  targetSpec: {
    title: '选择2张卡',
    description: '选择其他我方战场上的2张卡送入墓地。',
    minSelections: 2,
    maxSelections: 2,
    zones: ['UNIT', 'ITEM'],
    controller: 'SELF',
    step: 'SEND_FIELD',
    getCandidates: (_gameState, playerState, instance) =>
      [...playerState.unitZone, ...playerState.itemZone]
        .filter((card): card is Card => !!card && card.gamecardId !== instance.gamecardId)
        .map(card => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context.step === 'SEND_FIELD') {
      for (const selectedId of selections) {
        const target = AtomicEffectExecutor.findCardById(gameState, selectedId);
        const ownerUid = target ? AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) : undefined;
        if (target && ownerUid) {
          AtomicEffectExecutor.moveCard(gameState, ownerUid, target.cardlocation as any, ownerUid, 'GRAVE', target.gamecardId, true, {
            effectSourcePlayerUid: playerState.uid,
            effectSourceCardId: instance.gamecardId
          });
        }
      }

      const candidates = playerState.deck.filter(card =>
        card.type === 'UNIT' &&
        isAlchemyCard(card) &&
        canPutCardOntoBattlefieldByEffect(playerState, card)
      );
      if (candidates.length === 0) return;

      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择单位',
        '从你的卡组选择1个炼金单位。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105120167_activate', step: 'PUT_UNIT' },
        () => 'DECK'
      );
      return;
    }

    if (context.step === 'PUT_UNIT') {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_DECK',
        targetFilter: { gamecardId: selections[0] },
        destinationZone: 'UNIT'
      }, instance);
    }
  }
};

const effect_105120167_last_resort: CardEffect = {
  id: '105120167_last_resort',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitGlobal: true,
  limitNameType: true,
  erosionTotalLimit: [10, 10],
  description: '只能在女神化状态发动。将你墓地的所有卡放置到卡组底。回合结束时你输掉游戏。',
  execute: async (instance, gameState, playerState) => {
    const graveCards = [...playerState.grave];
    moveCardsToBottom(gameState, playerState.uid, graveCards, instance);
    (playerState as any).loseAtEndOfTurn = gameState.turnCount;
    (playerState as any).loseAtEndOfTurnSourceName = instance.fullName;
    (playerState as any).loseAtEndOfTurnSourceCardId = instance.gamecardId;
    (playerState as any).loseAtEndOfTurnSourceCardSnapshot = { ...instance };
    EventEngine.recalculateContinuousEffects(gameState);
  }
};

const card: Card = {
  id: '105120167',
  fullName: '大炼金术士「伊丽瑟薇」',
  specialName: '伊丽瑟薇',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '永生之乡',
  acValue: 3,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105120167_activate, effect_105120167_last_resort],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
