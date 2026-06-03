import { Card, CardEffect, GameEvent, GameState, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, moveCard, paymentCost } from './BaseUtil';

const getItemTargets = (gameState: GameState, playerUid: string) => {
  const playerState = gameState.players[playerUid];
  return [
    ...playerState.deck.filter((card: Card) => card.type === 'ITEM'),
    ...playerState.grave.filter((card: Card) => card.type === 'ITEM')
  ];
};

const effect_105110107_enter: CardEffect = {
  id: '105110107_enter',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  cost: paymentCost(0, 'YELLOW'),
  description: '当这张卡进入战场时，你可以选择你的卡组或墓地中的1张道具卡，放置到卡组顶。',
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

    return getItemTargets(gameState, playerState.uid).length > 0;
  },
  execute: async (instance, gameState, playerState) => {
    const targets = getItemTargets(gameState, playerState.uid);
    if (targets.length === 0) return;

    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择道具',
      '选择1张道具卡，将其放置到卡组顶。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '105110107_enter',
        step: 'SELECT_ITEM'
      },
      card => card.cardlocation as TriggerLocation
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'SELECT_ITEM' || selections.length === 0) return;

    const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!target) return;

    moveCard(gameState, playerState.uid, target, 'DECK', instance);
    gameState.logs.push(`[${instance.fullName}] effect: put [${target.fullName}] on top of the deck.`);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110107
 * Card2 Row: 73
 * Card Row: 73
 * Source CardNo: BT01-Y01
 * Package: BT01(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:[〖0:黄黄〗]这个单位进入战场时，你可以选择你的卡组或墓地中的1张道具卡，放置到卡组顶。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110107',
  fullName: '年迈的研究员',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '学院要塞',
  acValue: 1,
  power: 500,
  basePower: 500,
  damage: 0,
  baseDamage: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105110107_enter],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
