import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { createSelectCardQuery, isYellowHandCard, moveCard, moveCardAsCost } from './BaseUtil';

const effect_305120030_activate: CardEffect = {
  id: '305120030_activate',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  description: '只能在主要阶段发动。舍弃1张黄色手牌并横置这个道具。将我方1个单位送入墓地，之后从卡组将1个同色且AC多1的单位放置到战场。',
  condition: (gameState, playerState, instance) =>
    gameState.phase === 'MAIN' &&
    !instance.isExhausted &&
    playerState.hand.some(isYellowHandCard) &&
    playerState.unitZone.some(card => card !== null),
  cost: async (gameState, playerState, instance) => {
    const yellowHand = playerState.hand.filter(isYellowHandCard);
    if (instance.isExhausted || yellowHand.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      yellowHand,
      '舍弃黄色卡',
      '舍弃1张黄色手牌。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '305120030_activate',
        step: 'DISCARD_AND_EXHAUST_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      () => 'HAND'
    );
    return true;
  },
  canPayCost: (_gameState, playerState, instance) =>
    !instance.isExhausted && playerState.hand.some(isYellowHandCard),
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'DISCARD_AND_EXHAUST_COST') return;
    const discard = selections[0] ? playerState.hand.find((card: Card) => card.gamecardId === selections[0] && isYellowHandCard(card)) : undefined;
    if (!discard || instance.isExhausted) {
      context.cancelActivation = true;
      return;
    }
    moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'ROTATE_HORIZONTAL',
      targetFilter: { gamecardId: instance.gamecardId }
    }, instance);
  },
  execute: async (instance, gameState, playerState) => {
    const ownUnits = playerState.unitZone.filter((card): card is Card => !!card);
    if (ownUnits.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits,
      '选择单位',
      '将我方1个单位送入墓地。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '305120030_activate', step: 'SEND_UNIT' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context.step === 'SEND_UNIT') {
      const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
      if (!target) return;

      const nextAc = (target.acValue || 0) + 1;
      const targetColor = target.color;
      moveCard(gameState, playerState.uid, target, 'GRAVE', instance);

      const candidates = playerState.deck.filter(card =>
        card.type === 'UNIT' &&
        card.color === targetColor &&
        (card.acValue || 0) === nextAc &&
        (!card.specialName || !playerState.unitZone.some(unit => unit?.specialName === card.specialName))
      );
      if (candidates.length === 0) {
        EventEngine.recalculateContinuousEffects(gameState);
        return;
      }

      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择单位',
        '从你的卡组选择1个符合条件的单位。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '305120030_activate', step: 'PUT_UNIT' },
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

const card: Card = {
  id: '305120030',
  fullName: '「永生炼金釜」',
  specialName: '永生炼金釜',
  type: 'ITEM',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '永生之乡',
  acValue: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_305120030_activate],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
