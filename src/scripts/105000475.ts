import { Card, CardEffect, GameEvent, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, destroyByEffect, getOpponentUid } from './BaseUtil';

const effect_105000475_temp: CardEffect = {
  id: '105000475_temp',
  type: 'CONTINUOUS',
  description: '若这个单位的入场效果舍弃了单位卡，本回合中这个单位获得【神依】。',
  applyContinuous: (gameState, instance) => {
    if ((instance as any).data?.bt03Y09BuffTurn !== gameState.turnCount) return;
    instance.isShenyi = true;
  }
};

const effect_105000475_enter: CardEffect = {
  id: '105000475_enter',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  description: '这个单位进入战场时，你可以破坏你的1张道具。之后对手舍弃1张手牌。若舍弃的是单位卡，本回合中这个单位获得【速攻】和【神依】；否则双方玩家各受到1点伤害。',
  condition: (_gameState, _playerState, instance, event?: GameEvent) =>
    instance.cardlocation === 'UNIT' &&
    event?.type === 'CARD_ENTERED_ZONE' &&
    event.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    _playerState.itemZone.some(card => !!card),
  execute: async (instance, gameState, playerState) => {
    const ownItems = playerState.itemZone.filter((card): card is Card => !!card);
    if (ownItems.length > 0) {
      createSelectCardQuery(
        gameState,
        playerState.uid,
        ownItems,
        '选择最多1张道具',
        '你可以选择你的1张道具破坏。',
        0,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105000475_enter', step: 'DESTROY_ITEM' }
      );
      return;
    }

    return;
  },
  targetSpec: {
    title: '选择道具',
    description: '选择你的战场上的1张道具卡，将其破坏。',
    minSelections: 0,
    maxSelections: 1,
    zones: ['ITEM'],
    controller: 'SELF',
    step: 'DESTROY_ITEM',
    getCandidates: (_gameState, playerState) =>
      playerState.itemZone
        .filter((card): card is Card => !!card)
        .map(card => ({ card, source: 'ITEM' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context.step === 'DESTROY_ITEM') {
      const item = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!item || item.type !== 'ITEM' || !destroyByEffect(gameState, item, instance)) return;

      const opponentUid = getOpponentUid(gameState, playerState.uid);
      const opponent = gameState.players[opponentUid];
      if (opponent.hand.length === 0) return;

      createSelectCardQuery(
        gameState,
        opponentUid,
        [...opponent.hand],
        '舍弃卡牌',
        '选择1张手牌舍弃。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105000475_enter', step: 'OPPONENT_DISCARD' },
        () => 'HAND'
      );
      return;
    }

    if (context.step !== 'OPPONENT_DISCARD' || selections.length === 0) return;

    const opponentUid = getOpponentUid(gameState, playerState.uid);
    const discardedCard = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    const wasUnit = discardedCard?.type === 'UNIT';

    await AtomicEffectExecutor.execute(gameState, opponentUid, {
      type: 'DISCARD_CARD',
      targetFilter: { gamecardId: selections[0] }
    }, instance);

    if (wasUnit) {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'GAIN_KEYWORD',
        params: { keyword: 'RUSH' },
        turnDuration: 1,
        targetFilter: { gamecardId: instance.gamecardId }
      }, instance);
      (instance as any).data = {
        ...((instance as any).data || {}),
        bt03Y09BuffTurn: gameState.turnCount
      };
      return;
    }

    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DEAL_EFFECT_DAMAGE', value: 1 }, instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DEAL_EFFECT_DAMAGE_SELF', value: 1 }, instance);
  }
};

const card: Card = {
  id: '105000475',
  fullName: '幻想舞台的易形师',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  baseIsrush: false,
  isShenyi: false,
  baseShenyi: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105000475_temp, effect_105000475_enter],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
