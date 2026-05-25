import { Card, CardEffect } from '../types/game';
import { canPutUnitOntoBattlefield, createSelectCardQuery, moveCardAsCost, putUnitOntoField } from './BaseUtil';

const chimeraInGrave = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.type === 'UNIT' && (card.specialName === '奇美拉' || card.fullName.includes('奇美拉')));

const greenHandCards = (instance: Card) => (card: Card) =>
  card.gamecardId !== instance.gamecardId && card.color === 'GREEN';

const cardEffects: CardEffect[] = [{
  id: '203000096_revive_chimera',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：选择你的墓地中的1张「奇美拉」单位卡，舍弃1张绿色手牌，将被选择的卡放置到战场上。',
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
    getCandidates: (_gameState, playerState) =>
      chimeraInGrave(playerState)
        .filter((card: Card) => canPutUnitOntoBattlefield(playerState, card))
        .map((card: Card) => ({ card, source: 'GRAVE' as const }))
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = chimeraInGrave(playerState).filter((card: Card) => canPutUnitOntoBattlefield(playerState, card));
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择奇美拉',
      '选择墓地中的1张「奇美拉」单位卡放置到战场上。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '203000096_revive_chimera', step: 'TARGET' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'DISCARD') {
      const target = chimeraInGrave(playerState).find((card: Card) =>
        card.gamecardId === selections[0] &&
        canPutUnitOntoBattlefield(playerState, card)
      );
      const discardCandidates = playerState.hand.filter(greenHandCards(instance));
      if (!target || discardCandidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        discardCandidates,
        '舍弃绿色手牌',
        '选择1张绿色手牌舍弃作为费用。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '203000096_revive_chimera', step: 'DISCARD', targetId: target.gamecardId },
        () => 'HAND'
      );
      return;
    }

    const discard = playerState.hand.find((card: Card) => card.gamecardId === selections[0] && greenHandCards(instance)(card));
    const target = chimeraInGrave(playerState).find((card: Card) =>
      card.gamecardId === context.targetId &&
      canPutUnitOntoBattlefield(playerState, card)
    );
    if (discard && target) {
      moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', instance);
      putUnitOntoField(gameState, playerState.uid, target, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203000096
 * Card2 Row: 457
 * Card Row: 392
 * Source CardNo: BT06-G09
 * Package: BT06(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖同名1回合1次〗{选择你的墓地中的1张「奇美拉」单位卡}[舍弃1张绿色手牌]：将被选择的卡放置到战场上。
 */
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
