import { Card, CardEffect, GameEvent, GameState, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, paymentCost } from './BaseUtil';

const getDestroyableItems = (gameState: GameState) =>
  Object.values(gameState.players).flatMap(player =>
    player.itemZone.filter((card: Card | null): card is Card => !!card && !card.godMark)
  );

const effect_105110109_enter: CardEffect = {
  id: '105110109_enter',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  cost: paymentCost(0, 'YELLOW'),
  description: '【诱】:[〖0:黄黄〗]这个单位进入战场时，你可以选择1张非神蚀道具卡，将其破坏。',
  condition: (gameState, playerState, instance, event?: GameEvent) => {
    if (
      event?.type !== 'CARD_ENTERED_ZONE' ||
      event.sourceCardId !== instance.gamecardId ||
      event.data?.zone !== 'UNIT' ||
      instance.cardlocation !== 'UNIT'
    ) {
      return false;
    }

    const yellowUnits = playerState.unitZone.filter(
      (card): card is Card => !!card && AtomicEffectExecutor.matchesColor(card, 'YELLOW')
    ).length;
    if (yellowUnits < 2) return false;

    return getDestroyableItems(gameState).length > 0;
  },
  execute: async (instance, gameState, playerState) => {
    const targets = getDestroyableItems(gameState);
    if (targets.length === 0) return;

    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择道具',
      '你可以选择1张非神蚀道具卡，将其破坏。',
      0,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '105110109_enter',
        step: 'SELECT_ITEM'
      },
      () => 'ITEM'
    );
  },
  targetSpec: {
    title: '选择道具',
    description: '你可以选择1张非神蚀道具卡，将其破坏。',
    minSelections: 0,
    maxSelections: 1,
    zones: ['ITEM'],
    controller: 'ANY',
    step: 'SELECT_ITEM',
    getCandidates: gameState =>
      getDestroyableItems(gameState).map(card => ({ card, source: 'ITEM' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'SELECT_ITEM' || selections.length === 0) return;

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'DESTROY_CARD',
      targetFilter: { gamecardId: selections[0], type: 'ITEM', godMark: false }
    }, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110109
 * Card2 Row: 75
 * Card Row: 75
 * Source CardNo: BT01-Y03
 * Package: BT01(C),ST04(TD)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:[〖0:黄黄〗]这个单位进入战场时，你可以选择1张非神蚀道具卡，将其破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110109',
  fullName: '扫地机械',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '学院要塞',
  acValue: 1,
  power: 1000,
  basePower: 1000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105110109_enter],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
