import { Card, CardEffect } from '../types/game';
import { canPutUnitOntoBattlefield, createSelectCardQuery, moveCard, putUnitOntoField, story } from './BaseUtil';

const greenHandCards = (instance: Card) => (card: Card) =>
  card.gamecardId !== instance.gamecardId && card.color === 'GREEN';

const graveUnitTargets = (playerState: any) =>
  playerState.grave.filter((card: Card): card is Card =>
    card.type === 'UNIT' &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [story('203000093_cliff_rescue', '创痕1：选择墓地1张单位卡，舍弃1张绿色手牌作为费用，将其放置到战场。之后放逐这张卡。', async () => {}, {
  erosionBackLimit: [1, 10],
  limitCount: 1,
  limitNameType: true,
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    graveUnitTargets(playerState).length > 0 &&
    playerState.hand.some(greenHandCards(instance)),
  targetSpec: {
    title: '选择救出单位',
    description: '选择你墓地中的1张单位卡。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      graveUnitTargets(playerState).map((card: Card) => ({ card, source: 'GRAVE' as const }))
  },
  cost: async (gameState, playerState, instance) => {
    const discardCandidates = playerState.hand.filter(greenHandCards(instance));
    if (discardCandidates.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      discardCandidates,
      '舍弃绿色手牌',
      '选择1张绿色手牌舍弃作为费用。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        costType: 'DISCARD_HAND_COST',
        discardCostAmount: 1
      },
      () => 'HAND'
    );
    return true;
  },
  canPayCost: (_gameState, playerState, instance) =>
    playerState.hand.some(greenHandCards(instance)),
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'TARGET') return;
    const target = graveUnitTargets(playerState).find((card: Card) => card.gamecardId === selections[0]);
    if (!target) return;
    putUnitOntoField(gameState, playerState.uid, target, instance);
    if (instance.cardlocation === 'PLAY' || instance.cardlocation === 'GRAVE') {
      moveCard(gameState, playerState.uid, instance, 'EXILE', instance);
    }
  }
})];

const card: Card = {
  id: '203000093',
  fullName: '悬崖救出',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
