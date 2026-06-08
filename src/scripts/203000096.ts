import { Card, CardEffect } from '../types/game';
import { canPutUnitOntoBattlefield, createSelectCardQuery, putUnitOntoField } from './BaseUtil';

const chimeraInGrave = (playerState: any) =>
  playerState.grave.filter((card: Card) =>
    card.type === 'UNIT' &&
    (card.id === '103000084' || card.specialName === '奇美拉' || card.fullName.includes('奇美拉'))
  );

const greenHandCards = (instance: Card) => (card: Card) =>
  card.gamecardId !== instance.gamecardId && card.color === 'GREEN';

const cardEffects: CardEffect[] = [{
  id: '203000096_revive_chimera',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：选择墓地中的1张「奇美拉」单位卡，舍弃1张绿色手牌作为费用，将被选择的卡放置到战场上。',
  condition: (_gameState, playerState, instance) =>
    playerState.hand.some(greenHandCards(instance)) &&
    chimeraInGrave(playerState).some((card: Card) => canPutUnitOntoBattlefield(playerState, card)),
  targetSpec: {
    title: '选择奇美拉',
    description: '选择墓地中的1张「奇美拉」单位卡放置到战场上。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      chimeraInGrave(playerState)
        .filter((card: Card) => canPutUnitOntoBattlefield(playerState, card))
        .map((card: Card) => ({ card, source: 'GRAVE' as const }))
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
  execute: async () => {},
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'TARGET') return;
    const target = chimeraInGrave(playerState).find((card: Card) =>
      card.gamecardId === selections[0] &&
      canPutUnitOntoBattlefield(playerState, card)
    );
    if (target) {
      putUnitOntoField(gameState, playerState.uid, target, instance);
    }
  }
}];

const card: Card = {
  id: '203000096',
  fullName: '白色异兽的急袭',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 4,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
