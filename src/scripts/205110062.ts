import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, isTruthOrHickUnit, moveCard } from './BaseUtil';

const effect_205110062_activate: CardEffect = {
  id: '205110062_activate',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description: '选择你战场上1张神蚀卡并放置到卡组底。之后从卡组选择1个「真理」或「希克」单位放置到战场。',
  condition: (_gameState, playerState) =>
    [...playerState.unitZone, ...playerState.itemZone].some(card => card?.godMark) &&
    playerState.deck.some(isTruthOrHickUnit),
  targetSpec: {
    title: '选择神蚀卡',
    description: '选择我方1张神蚀卡。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'SELF',
    step: 'BOTTOM_GODMARK',
    getCandidates: (_gameState, playerState) =>
      [...playerState.unitZone, ...playerState.itemZone]
        .filter((card): card is Card => !!card && !!card.godMark)
        .map(card => ({ card, source: card.cardlocation as any }))
  },
  execute: async (instance, gameState, playerState) => {
    const ownGodMarks = [...playerState.unitZone, ...playerState.itemZone].filter((card): card is Card => !!card && !!card.godMark);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownGodMarks,
      '选择神蚀卡',
      '选择我方1张神蚀卡。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '205110062_activate', step: 'BOTTOM_GODMARK' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context.step === 'BOTTOM_GODMARK') {
      const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
      if (!target) return;

      moveCard(gameState, playerState.uid, target, 'DECK', instance, { insertAtBottom: true });

      const candidates = playerState.deck.filter(card =>
        isTruthOrHickUnit(card) &&
        (!card.specialName || !playerState.unitZone.some(unit => unit?.specialName === card.specialName))
      );
      if (candidates.length === 0 || !playerState.unitZone.some(card => card === null)) return;

      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择单位',
        '从你的卡组选择1个「真理」或「希克」单位。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '205110062_activate', step: 'PUT_UNIT' },
        () => 'DECK'
      );
      return;
    }

    if (context.step === 'PUT_UNIT') {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_DECK',
        targetFilter: { gamecardId: selections[0] },
        destinationZone: 'UNIT'
      }, instance);
    }
  }
};

const card: Card = {
  id: '205110062',
  fullName: '与教会的交涉',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '学院要塞',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_205110062_activate],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
