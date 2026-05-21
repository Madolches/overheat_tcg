import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  backErosionCount,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  moveCard,
  moveCardAsCost,
  putUnitOntoField
} from './BaseUtil';

const isSteelPart = (card: Card) => card.id === '105110348' || card.fullName.includes('钢兵零件');

const getCandidates = (playerState: any) =>
  [...playerState.deck, ...playerState.grave].filter((card: Card) =>
    isSteelPart(card) &&
    card.type === 'UNIT' &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const effect_105110349_make_part: CardEffect = {
  id: '105110349_make_part',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionBackLimit: [1, 99],
  description: '创痕1，你的主要阶段，横置这张卡并将墓地2张卡放逐：将卡组或墓地1张《钢兵零件》放置到战场。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    !instance.isExhausted &&
    backErosionCount(playerState) >= 1 &&
    playerState.grave.length >= 2 &&
    getCandidates(playerState).length > 0,
  cost: async (gameState, playerState, instance) => {
    if (instance.isExhausted) return false;
    instance.isExhausted = true;
    if (playerState.grave.length < 2) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      [...playerState.grave],
      '选择放逐费用',
      '选择你墓地中的2张卡放逐。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '105110349_make_part', step: 'EXILE_COST' },
      () => 'GRAVE'
    );
    return true;
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'EXILE_COST') {
      selections.forEach(cardId => {
        const card = AtomicEffectExecutor.findCardById(gameState, cardId);
        if (card?.cardlocation === 'GRAVE') moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance);
      });
      const candidates = getCandidates(playerState);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择钢兵零件',
        '从你的卡组或墓地选择1张《钢兵零件》放置到战场。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105110349_make_part', step: 'PUT_PART' },
        card => card.cardlocation as any
      );
      return;
    }

    if (context?.step !== 'PUT_PART') return;
    const selected = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!selected || !isSteelPart(selected) || selected.type !== 'UNIT') return;
    const fromDeck = selected.cardlocation === 'DECK';
    if (!putUnitOntoField(gameState, playerState.uid, selected, instance)) return;
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

const card: Card = {
  id: '105110349',
  fullName: '零件制作师',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  baseColorReq: { YELLOW: 1 },
  faction: '学院要塞',
  acValue: 3,
  baseAcValue: 3,
  power: 2000,
  basePower: 2000,
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
  effects: [effect_105110349_make_part],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
