import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutItemOntoBattlefield, canPutUnitOntoBattlefield, countItemTypes, createChoiceQuery, createSelectCardQuery, moveCardAsCost } from './BaseUtil';

const getTruthGodmarkCards = (playerState: any, instance?: Card) => {
  const zones: { zone: (Card | null)[]; source: TriggerLocation }[] = [
    { zone: playerState.hand, source: 'HAND' },
    { zone: playerState.deck, source: 'DECK' },
    { zone: playerState.grave, source: 'GRAVE' }
  ];
  return zones.flatMap(({ zone, source }) =>
    zone
      .filter((card): card is Card =>
        !!card &&
        card.godMark &&
        card.gamecardId !== instance?.gamecardId &&
        (!instance?.specialName || card.specialName === instance.specialName || card.fullName.includes(instance.specialName))
      )
      .map(card => ({ card, source }))
  );
};

const effect_105110445_limit: CardEffect = {
  id: '105110445_limit',
  type: 'CONTINUOUS',
  description: '你的战场上只能存在1个神蚀单位。',
  limitGodmarkCount: 1
};

const effect_105110445_end: CardEffect = {
  id: '105110445_end',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END' as any,
  isMandatory: false,
  triggerLocation: ['UNIT'],
  description: '你的回合结束时，你可以抽最多X张卡。X为你控制的不同道具种类数量。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    countItemTypes(playerState) > 0,
  execute: async (instance, gameState, playerState) => {
    const maxDraw = countItemTypes(playerState);
    createChoiceQuery(
      gameState,
      playerState.uid,
      '选择抽牌数量',
      `选择0到${maxDraw}之间的数量。`,
      Array.from({ length: maxDraw + 1 }, (_, idx) => ({ id: String(idx), label: String(idx) })),
      { sourceCardId: instance.gamecardId, effectId: '105110445_end' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const drawCount = Number(selections[0] || '0');
    if (drawCount <= 0) return;
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: drawCount }, instance);
  }
};

const effect_105110445_activate: CardEffect = {
  id: '105110445_activate',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '只能在主要阶段发动。从你的手牌、卡组和/或墓地放逐2张「真实」神蚀卡。从卡组将1张AC为X以下的非神蚀卡放置到战场。X为你控制的不同道具种类数量。',
  condition: (gameState, playerState, instance) =>
    gameState.phase === 'MAIN' &&
    countItemTypes(playerState) > 0 &&
    getTruthGodmarkCards(playerState, instance).length >= 2,
  cost: async (gameState, playerState, instance) => {
    const truthCards = getTruthGodmarkCards(playerState, instance);
    if (truthCards.length < 2) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      truthCards.map(entry => entry.card),
      '选择2张真实卡',
      '从你的手牌、卡组和/或墓地选择2张「真实」神蚀卡放逐作为费用。',
      2,
      2,
      {
        sourceCardId: instance.gamecardId,
        effectId: '105110445_activate',
        step: 'TRUTH_EXILE_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      card => (truthCards.find(entry => entry.card.gamecardId === card.gamecardId)?.source || card.cardlocation) as TriggerLocation
    );
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'TRUTH_EXILE_COST') return;
    const truthCards = getTruthGodmarkCards(playerState, instance);
    const selected = selections
      .map(id => truthCards.find(entry => entry.card.gamecardId === id)?.card)
      .filter((card): card is Card => !!card);
    if (selected.length !== 2 || new Set(selected.map(card => card.gamecardId)).size !== 2) {
      context.cancelActivation = true;
      return;
    }
    const usedDeck = selected.some(card => card.cardlocation === 'DECK');
    selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
    if (usedDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  },
  execute: async (instance, gameState, playerState) => {
    const maxAc = countItemTypes(playerState);
    const candidates = playerState.deck.filter(card => {
      if (card.godMark || (card.baseAcValue ?? card.acValue) > maxAc) return false;
      if (card.type === 'UNIT') return canPutUnitOntoBattlefield(playerState, card);
      if (card.type === 'ITEM') return canPutItemOntoBattlefield(playerState, card);
      return false;
    });
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择卡牌',
      `从你的卡组选择1张AC为${maxAc}以下的非神蚀卡。`,
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110445_activate', step: 'PUT_CARD' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'PUT_CARD') return;
    const card = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!card) return;
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_DECK',
      targetFilter: { gamecardId: selections[0] },
      destinationZone: card.type === 'UNIT' ? 'UNIT' : 'ITEM'
    }, instance);
  }
};

const card: Card = {
  id: '105110445',
  fullName: '彼岸共鸣「真理」',
  specialName: '真理',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '学院要塞',
  acValue: 5,
  power: 4000,
  basePower: 4000,
  damage: 4,
  baseDamage: 4,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  baseIsrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105110445_limit, effect_105110445_end, effect_105110445_activate],
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
