import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, createSelectCardQuery, moveCard, putUnitOntoField } from './BaseUtil';

const effect_205000136_substitute: CardEffect = {
  id: '205000136_substitute',
  type: 'CONTINUOUS',
  description: '支付AC为3以下的黄色卡费用时，你可以从手牌将这张卡放逐作为支付替代。'
};

const effect_205000136_activate: CardEffect = {
  id: '205000136_activate',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  erosionBackLimit: [1, 10],
  description: '创痕1。只能在主要阶段发动。从你的卡组将1个单位放置到战场，对自己造成等同于其AC的伤害，之后结束本回合。',
  condition: (gameState, playerState) =>
    gameState.phase === 'MAIN' &&
    playerState.deck.some(card => card.type === 'UNIT' && canPutUnitOntoBattlefield(playerState, card)),
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.deck.filter(card => card.type === 'UNIT' && canPutUnitOntoBattlefield(playerState, card));
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择单位',
      '从你的卡组选择1个单位放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '205000136_activate' },
      () => 'DECK'
    );
  },
  targetSpec: {
    title: '选择单位',
    description: '从你的卡组选择1个单位放置到战场。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['DECK'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      playerState.deck
        .filter(card => card.type === 'UNIT' && canPutUnitOntoBattlefield(playerState, card))
        .map(card => ({ card, source: 'DECK' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!target) return;

    const damage = target.baseAcValue ?? target.acValue;
    if (!putUnitOntoField(gameState, playerState.uid, target, instance)) return;
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'DEAL_EFFECT_DAMAGE_SELF',
      value: damage
    }, instance);
    (playerState as any).forceEndTurnRequested = gameState.turnCount;
    if (instance.cardlocation === 'PLAY') {
      moveCard(gameState, playerState.uid, instance, 'GRAVE', instance);
    }
  }
};

const card: Card = {
  id: '205000136',
  fullName: '神灵的炼金',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '无',
  acValue: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_205000136_substitute, effect_205000136_activate],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
