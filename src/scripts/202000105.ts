import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, createSelectCardQuery, isNonGodUnit, moveCard, putUnitOntoField } from './BaseUtil';

const handTargets = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) =>
    card.gamecardId !== instance.gamecardId &&
    isNonGodUnit(card) &&
    (card.acValue || 0) <= 3 &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '202000105_explore_put_unit',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：你的主要阶段，将手牌中1张ACCESS值3以下的非神蚀单位放置到战场。将这张卡放逐。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    handTargets(playerState, instance).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      handTargets(playerState, instance),
      '选择放置单位',
      '选择手牌中1张ACCESS值3以下的非神蚀单位放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '202000105_explore_put_unit' },
      () => 'HAND'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = handTargets(playerState, instance).find((card: Card) => card.gamecardId === selections[0]);
    if (target) putUnitOntoField(gameState, playerState.uid, target, instance);
    const liveStory = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (liveStory?.cardlocation === 'PLAY' || liveStory?.cardlocation === 'GRAVE') {
      moveCard(gameState, playerState.uid, liveStory, 'EXILE', instance);
    }
  }
}];

const card: Card = {
  id: '202000105',
  fullName: '探寻',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 1,
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
