import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addInfluence, createSelectCardQuery, isValkyrieUnit } from './BaseUtil';

const effect_205110063_item_discount: CardEffect = {
  id: '205110063_item_discount',
  type: 'CONTINUOUS',
  content: 'SELF_HAND_COST',
  description: '你的道具区每有1张道具，这张卡AC减少1，最低为0。',
  applyContinuous: (gameState, instance) => {
    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId);
    if (!ownerUid) return;

    const baseCost = instance.baseAcValue ?? instance.acValue ?? 0;
    const itemCount = gameState.players[ownerUid].itemZone.filter(Boolean).length;
    const nextCost = Math.max(0, baseCost - itemCount);
    instance.acValue = nextCost;
    if (nextCost < baseCost) {
      addInfluence(instance, instance, `ACCESS值-${baseCost - nextCost}`);
    }
  }
};

const effect_205110063_activate: CardEffect = {
  id: '205110063_activate',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description: '从你的卡组选择1个‘瓦尔基里’单位放置到战场。',
  condition: (_gameState, playerState) => playerState.unitZone.some(card => card === null) && playerState.deck.some(isValkyrieUnit),
  targetSpec: {
    title: '选择瓦尔基里',
    description: '从你的卡组选择1个“瓦尔基里”单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['DECK'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      playerState.deck
        .filter(card =>
          isValkyrieUnit(card) &&
          (!card.specialName || !playerState.unitZone.some(unit => unit?.specialName === card.specialName))
        )
        .map(card => ({ card, source: 'DECK' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.deck.filter(card =>
      isValkyrieUnit(card) &&
      (!card.specialName || !playerState.unitZone.some(unit => unit?.specialName === card.specialName))
    );
    if (candidates.length === 0) return;

    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择‘瓦尔基里’',
      '从你的卡组选择1个‘瓦尔基里’单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '205110063_activate' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_DECK',
      targetFilter: { gamecardId: selections[0] },
      destinationZone: 'UNIT'
    }, instance);
  }
};

const card: Card = {
  id: '205110063',
  fullName: '瓦尔基里计划',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '学院要塞',
  acValue: 5,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_205110063_activate, effect_205110063_item_discount],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
