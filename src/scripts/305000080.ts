import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createChoiceQuery, createSelectCardQuery, findUnitOnBattlefield, moveCard, revealDeckCards, universalEquipEffect } from './BaseUtil';

const canExhaustEquipTarget = (gameState: any, instance: Card) => {
  const target = findUnitOnBattlefield(gameState, instance.equipTargetId);
  if (!target || target.isExhausted) return false;
  return !((target as any).data?.cannotExhaustUntilTurn >= gameState.turnCount);
};

const effect_305000080_activate: CardEffect = {
  id: '305000080_activate',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  description: '横置装备单位：展示你的卡组顶1张卡。你可以将其加入手牌，之后将1张手牌放置到卡组底。',
  condition: (gameState, playerState, instance) => {
    return instance.cardlocation === 'ITEM' && canExhaustEquipTarget(gameState, instance) && playerState.deck.length > 0;
  },
  cost: async (gameState, playerState, instance) => {
    const target = findUnitOnBattlefield(gameState, instance.equipTargetId);
    if (!target || !canExhaustEquipTarget(gameState, instance)) return false;
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'ROTATE_HORIZONTAL',
      targetFilter: { gamecardId: target.gamecardId }
    }, instance);
    return !!target.isExhausted;
  },
  execute: async (instance, gameState, playerState) => {
    const topCard = revealDeckCards(gameState, playerState.uid, 1)[0];
    if (!topCard) return;

    createChoiceQuery(
      gameState,
      playerState.uid,
      '将展示的卡加入手牌？',
      `展示${topCard.fullName}。你可以将其加入手牌。`,
      [
        { id: 'YES', label: '加入手牌' },
        { id: 'NO', label: '留在原处' }
      ],
      {
        sourceCardId: instance.gamecardId,
        effectId: '305000080_activate',
        step: 'CHOOSE_ADD',
        revealedCardId: topCard.gamecardId
      }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context.step === 'CHOOSE_ADD') {
      if (selections[0] !== 'YES') return;

      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_DECK',
        targetFilter: { gamecardId: context.revealedCardId },
        destinationZone: 'HAND'
      }, instance);

      createSelectCardQuery(
        gameState,
        playerState.uid,
        [...playerState.hand],
        '选择手牌',
        '选择1张手牌放置到卡组底。',
        1,
        1,
        {
          sourceCardId: instance.gamecardId,
          effectId: '305000080_activate',
          step: 'PUT_TO_BOTTOM'
        },
        () => 'HAND'
      );
      return;
    }

    if (context.step !== 'PUT_TO_BOTTOM') return;

    const chosenCard = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!chosenCard) return;

    moveCard(gameState, playerState.uid, chosenCard, 'DECK', instance, { insertAtBottom: true });
  }
};

const card: Card = {
  id: '305000080',
  fullName: '索美琳童话集',
  specialName: '',
  type: 'ITEM',
  isEquip: true,
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [universalEquipEffect, effect_305000080_activate],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
