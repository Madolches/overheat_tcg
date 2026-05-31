import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, createSelectCardQuery, moveCard } from './BaseUtil';

const effect_205000143_activate: CardEffect = {
  id: '205000143_activate',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description: '只能在主要阶段发动。将你的1个单位送入墓地，之后从卡组将1个AC多1的非神蚀单位放置到战场。',
  condition: (gameState, playerState) =>
    (gameState.phase === 'MAIN' || gameState.previousPhase === 'MAIN') &&
    playerState.unitZone.some(unit => !!unit) &&
    playerState.deck.some(card => card.type === 'UNIT' && !card.godMark),
  targetSpec: {
    title: '选择单位',
    description: '选择你的1个单位送入墓地。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'SEND_UNIT',
    getCandidates: (_gameState, playerState) =>
      playerState.unitZone
        .filter((unit): unit is Card => !!unit)
        .map(card => ({ card, source: 'UNIT' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    const targets = playerState.unitZone.filter((unit): unit is Card => !!unit);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择单位',
      '选择你的1个单位送入墓地。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '205000143_activate', step: 'SEND_UNIT' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context.step === 'SEND_UNIT') {
      const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
      if (!target) return;

      const targetAc = (target.baseAcValue ?? target.acValue) + 1;
      moveCard(gameState, playerState.uid, target, 'GRAVE', instance);
      const livePlayer = gameState.players[playerState.uid];

      const candidates = livePlayer.deck.filter(card =>
        card.type === 'UNIT' &&
        !card.godMark &&
        (card.baseAcValue ?? card.acValue) === targetAc &&
        canPutUnitOntoBattlefield(livePlayer, card)
      );
      if (candidates.length === 0) return;

      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择单位',
        '从你的卡组选择1个非神蚀单位。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '205000143_activate', step: 'PUT_UNIT' },
        () => 'DECK'
      );
      return;
    }

    if (context.step !== 'PUT_UNIT') return;

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_DECK',
      targetFilter: { gamecardId: selections[0] },
      destinationZone: 'UNIT'
    }, instance);
  }
};

const card: Card = {
  id: '205000143',
  fullName: '简易炼金炉',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_205000143_activate],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
