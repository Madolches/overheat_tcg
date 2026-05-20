import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  moveCard,
  moveCardAsCost,
  putUnitOntoField
} from './BaseUtil';

const faceDownExile = (playerState: any) =>
  playerState.exile.filter((card: Card) => card.displayState === 'FRONT_FACEDOWN');

const BLUEPRINT_TARGET_CARD_IDS = new Set(['105110348', '105110351']);

const isBlueprintTarget = (card: Card) =>
  card.type === 'UNIT' &&
  (BLUEPRINT_TARGET_CARD_IDS.has(card.id) ||
    card.fullName.includes('钢兵') ||
    card.fullName.includes('瓦尔基里') ||
    card.specialName === '瓦尔基里');

const deckCandidates = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    isBlueprintTarget(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const effect_305000055_start_exile: CardEffect = {
  id: '305000055_start_exile',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'PHASE_CHANGED' as any,
  description: '你的回合开始时，可将卡组顶1张卡背面放逐。',
  condition: (_gameState, playerState, _instance, event) =>
    event?.data?.phase === 'START' &&
    playerState.isTurn &&
    instance.cardlocation === 'ITEM' &&
    event?.type === 'PHASE_CHANGED' &&
    event.data?.phase === 'START' &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    const top = playerState.deck[playerState.deck.length - 1];
    if (!top) return;
    moveCard(gameState, playerState.uid, top, 'EXILE', instance, { faceDown: true });
  }
};

const effect_305000055_end_blueprint: CardEffect = {
  id: '305000055_end_blueprint',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'TURN_END' as any,
  description: '你的回合结束时，若放逐区背面卡2张以上，送墓这张卡：将卡组1张卡名含有《钢兵》或「瓦尔基里」的单位放置到战场。之后将所有背面放逐卡置于卡组底。',
  condition: (_gameState, playerState, instance) =>
    playerState.isTurn &&
    instance.cardlocation === 'ITEM' &&
    faceDownExile(playerState).length >= 2 &&
    deckCandidates(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    moveCardAsCost(gameState, playerState.uid, instance, 'GRAVE', instance);
    const candidates = deckCandidates(playerState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择蓝图单位',
      '从你的卡组选择1张卡名含有《钢兵》或「瓦尔基里」的单位放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '305000055_end_blueprint', step: 'PUT_UNIT' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'PUT_UNIT') return;
    const selected = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!selected || selected.cardlocation !== 'DECK' || !isBlueprintTarget(selected)) return;
    if (!putUnitOntoField(gameState, playerState.uid, selected, instance)) return;
    const live = AtomicEffectExecutor.findCardById(gameState, selected.gamecardId);
    if (live) {
      (live as any).data = {
        ...((live as any).data || {}),
        placedByBlueprintEffectTurn: gameState.turnCount,
        placedByBlueprintSourceCardId: instance.gamecardId
      };
    }

    const facedown = [...faceDownExile(playerState)];
    facedown.forEach(card => moveCard(gameState, playerState.uid, card, 'DECK', instance, { insertAtBottom: true }));
  }
};

const card: Card = {
  id: '305000055',
  fullName: '钢铁蓝图',
  specialName: '',
  type: 'ITEM',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  baseColorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 1,
  baseAcValue: 1,
  godMark: false,
  baseGodMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_305000055_start_exile, effect_305000055_end_blueprint],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
