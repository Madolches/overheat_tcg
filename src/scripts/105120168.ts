import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutCardOntoBattlefieldByEffect, createSelectCardQuery, isAlchemyCard, isNonGodAccessLe3UnitOrItem, moveCardAsCost, moveCardsToBottom, revealDeckCards } from './BaseUtil';

const effect_105120168_enter: CardEffect = {
  id: '105120168_enter',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  description: '这个单位进入战场时，将你墓地最多2张「艾尔蒙特」以外的炼金卡放置到卡组底，之后抽1张卡。',
  condition: (_gameState, playerState, instance, event?: GameEvent) =>
    instance.cardlocation === 'UNIT' &&
    event?.type === 'CARD_ENTERED_ZONE' &&
    event.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    playerState.grave.filter(card => isAlchemyCard(card) && card.specialName !== '艾尔蒙特').length >= 2,
  targetSpec: {
    title: '选择墓地卡',
    description: '从你的墓地选择2张炼金卡放置到卡组底。',
    minSelections: 2,
    maxSelections: 2,
    zones: ['GRAVE'],
    controller: 'SELF',
    step: 'BOTTOM_GRAVE',
    getCandidates: (_gameState, playerState) =>
      playerState.grave
        .filter(card => isAlchemyCard(card) && card.specialName !== '艾尔蒙特')
        .map(card => ({ card, source: 'GRAVE' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.grave.filter(card => isAlchemyCard(card) && card.specialName !== '艾尔蒙特');

    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择墓地卡',
      '从你的墓地选择2张炼金卡放置到卡组底。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '105120168_enter' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const cards = selections
      .map(id => AtomicEffectExecutor.findCardById(gameState, id))
      .filter((card): card is Card => !!card);
    moveCardsToBottom(gameState, playerState.uid, cards, instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
};

const effect_105120168_activate: CardEffect = {
  id: '105120168_activate',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  erosionTotalLimit: [3, 5],
  description: '只能在主要阶段发动。舍弃1张手牌，展示你的卡组顶1张卡，若其为AC为3以下的非神蚀单位或道具，将其放置到战场。',
  condition: (gameState, playerState) => gameState.phase === 'MAIN' && playerState.hand.length > 0,
  cost: async (gameState, playerState, instance) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      [...playerState.hand],
      '舍弃卡牌',
      '舍弃1张手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105120168_activate', step: 'DISCARD_COST' },
      () => 'HAND'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    const topCard = revealDeckCards(gameState, playerState.uid, 1, instance)[0];
    if (!topCard) return;

    if (!isNonGodAccessLe3UnitOrItem(topCard)) {
      gameState.logs.push(`[${instance.fullName}] 公开的卡不是ACCESS值3以下的非神蚀单位或道具，留在卡组顶。`);
      return;
    }
    if (!canPutCardOntoBattlefieldByEffect(playerState, topCard)) {
      gameState.logs.push(`[${instance.fullName}] 公开的卡无法放置到战场，留在卡组顶。`);
      return;
    }

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_DECK',
      targetFilter: { gamecardId: topCard.gamecardId },
      destinationZone: topCard.type === 'UNIT' ? 'UNIT' : 'ITEM'
    }, instance);
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context.step !== 'DISCARD_COST') return;

    const discardCard = playerState.hand.find(card => card.gamecardId === selections[0]);
    if (!discardCard) {
      gameState.logs.push(`[${instance.fullName}] 选择的手牌已不合法，费用支付失败。`);
      return;
    }
    moveCardAsCost(gameState, playerState.uid, discardCard, 'GRAVE', instance);
    gameState.logs.push(`[${instance.fullName}] 舍弃了 [${discardCard.fullName}] 作为费用。`);
  }
};

const card: Card = {
  id: '105120168',
  fullName: '炼金骑士「艾尔蒙特」',
  specialName: '艾尔蒙特',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '永生之乡',
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
  effects: [effect_105120168_enter, effect_105120168_activate],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
