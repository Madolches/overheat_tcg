import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  canPutCardOntoBattlefieldByEffect,
  createSelectCardQuery,
  moveCard,
  putCardOntoField,
  silenceAllNonKeywordEffectsUntilOwnStart
} from './BaseUtil';

const ownFieldCards = (playerState: any) =>
  [...playerState.unitZone, ...playerState.itemZone].filter((card): card is Card => !!card);

const deckCandidates = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    !card.godMark &&
    (card.type === 'UNIT' || card.type === 'ITEM') &&
    canPutCardOntoBattlefieldByEffect(playerState, card)
  );

const effect_105120352_end_alchemy: CardEffect = {
  id: '105120352_end_alchemy',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'TURN_END' as any,
  isMandatory: false,
  description: '你的回合结束时，选择你的战场2张以上卡，可将其送墓。之后将卡组1张非神蚀卡放置到战场，其所有非关键词效果直到下个你的回合开始无效。',
  condition: (_gameState, playerState) =>
    playerState.isTurn &&
    ownFieldCards(playerState).length >= 2 &&
    deckCandidates(playerState).length > 0,
  targetSpec: {
    title: '选择炼金素材',
    description: '选择你战场上的2张以上卡。',
    minSelections: 2,
    maxSelections: 99,
    zones: ['UNIT', 'ITEM'],
    controller: 'SELF',
    step: 'SEND_FIELD_CHOICE',
    getCandidates: (_gameState, playerState) =>
      ownFieldCards(playerState).map(card => ({ card, source: card.cardlocation as any }))
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownFieldCards(playerState),
      '选择炼金素材',
      '选择你的战场上的2张以上卡送入墓地。',
      2,
      ownFieldCards(playerState).length,
      { sourceCardId: instance.gamecardId, effectId: '105120352_end_alchemy', step: 'SEND_FIELD' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'SEND_FIELD_CHOICE') {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CHOICE',
        playerUid: playerState.uid,
        options: [
          { id: 'yes', value: 'yes', label: '是' },
          { id: 'no', value: 'no', label: '否' }
        ],
        title: '是否送入墓地',
        description: '是否将被选择的卡送入墓地？',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          sourceCardId: instance.gamecardId,
          effectId: '105120352_end_alchemy',
          step: 'SEND_FIELD',
          declaredSelectionIds: selections
        }
      };
      return;
    }
    if (context?.step === 'SEND_FIELD') {
      if (selections[0] === 'no') return;
      const selectedIds = context?.declaredSelectionIds || selections;
      selectedIds.forEach(cardId => {
        const target = AtomicEffectExecutor.findCardById(gameState, cardId);
        const ownerUid = target ? AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) : undefined;
        if (target && ownerUid === playerState.uid && (target.cardlocation === 'UNIT' || target.cardlocation === 'ITEM')) {
          moveCard(gameState, playerState.uid, target, 'GRAVE', instance);
        }
      });
      const candidates = deckCandidates(playerState);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择放置卡',
        '从你的卡组选择1张非神蚀卡放置到战场。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105120352_end_alchemy', step: 'PUT_CARD' },
        () => 'DECK'
      );
      return;
    }

    if (context?.step !== 'PUT_CARD') return;
    const selected = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!selected || selected.cardlocation !== 'DECK' || selected.godMark) return;
    if (!putCardOntoField(gameState, playerState.uid, selected, instance)) return;
    const live = AtomicEffectExecutor.findCardById(gameState, selected.gamecardId);
    if (live) silenceAllNonKeywordEffectsUntilOwnStart(live, instance, playerState.uid);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

const card: Card = {
  id: '105120352',
  fullName: '憧憬的炼金「伊丽瑟薇」',
  specialName: '伊丽瑟薇',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  baseColorReq: { YELLOW: 1 },
  faction: '永生之乡',
  acValue: 3,
  baseAcValue: 3,
  power: 1500,
  basePower: 1500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  baseGodMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105120352_end_alchemy],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
