import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, moveCard, moveCardAsCost, putUnitOntoField, story } from './BaseUtil';

const greenHandCards = (instance: Card) => (card: Card) =>
  card.gamecardId !== instance.gamecardId && card.color === 'GREEN';

const graveUnitTargets = (playerState: any) =>
  playerState.grave.filter((card: Card): card is Card =>
    card.type === 'UNIT' &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [story('203000093_cliff_rescue', '创痕1：你的主要阶段，选择墓地1张单位卡，舍弃1张绿色手牌，将其放置到战场。之后放逐这张卡。', async (instance, gameState, playerState) => {
  if (graveUnitTargets(playerState).length === 0 || !playerState.hand.some(greenHandCards(instance))) return;
  gameState.pendingQuery = {
    id: Math.random().toString(36).substring(7),
    type: 'SELECT_CARD',
    playerUid: playerState.uid,
    options: AtomicEffectExecutor.enrichQueryOptions(
      gameState,
      playerState.uid,
      graveUnitTargets(playerState).map((card: Card) => ({ card, source: 'GRAVE' as const }))
    ),
    title: '选择救出单位',
    description: '选择你墓地中的1张单位卡。',
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'EFFECT_RESOLVE',
    context: { sourceCardId: instance.gamecardId, effectId: '203000093_cliff_rescue', step: 'TARGET' }
  };
}, {
  erosionBackLimit: [1, 10],
  limitCount: 1,
  limitNameType: true,
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    graveUnitTargets(playerState).length > 0 &&
    playerState.hand.some(greenHandCards(instance)),
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const targetId = selections[0];
      const target = graveUnitTargets(playerState).find((card: Card) => card.gamecardId === targetId);
      if (!target) return;
      const discardCandidates = playerState.hand.filter(greenHandCards(instance));
      if (discardCandidates.length === 0) return;
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(
          gameState,
          playerState.uid,
          discardCandidates.map((card: Card) => ({ card, source: 'HAND' as const }))
        ),
        title: '舍弃绿色手牌',
        description: '选择1张绿色手牌舍弃。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: { sourceCardId: instance.gamecardId, effectId: '203000093_cliff_rescue', step: 'DISCARD', targetId }
      };
      return;
    }

    if (context?.step !== 'DISCARD') return;
    const discard = playerState.hand.find((card: Card) => card.gamecardId === selections[0] && greenHandCards(instance)(card));
    const target = graveUnitTargets(playerState).find((card: Card) => card.gamecardId === context.targetId);
    if (!discard || !target) return;
    moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', instance);
    putUnitOntoField(gameState, playerState.uid, target, instance);
    if (instance.cardlocation === 'PLAY' || instance.cardlocation === 'GRAVE') {
      moveCard(gameState, playerState.uid, instance, 'EXILE', instance);
    }
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203000093
 * Card2 Row: 552
 * Card Row: 372
 * Source CardNo: BT07-G08
 * Package: BT07(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕1】〖同名1回合1次〗{你的主要阶段，选择你墓地中的1张单位卡}[舍弃1张绿色手牌]：将被选择的单位卡放置到战场上。将这张卡放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
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
