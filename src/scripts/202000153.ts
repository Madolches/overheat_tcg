import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, createSelectCardQuery, discardHandCost, putUnitOntoField, story } from './BaseUtil';

const hasNoColorRequirement = (card: Card) =>
  Object.values(card.colorReq || {}).every(value => !value || value <= 0);

const candidates = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    card.type === 'UNIT' &&
    card.color === 'RED' &&
    !card.godMark &&
    Number(card.acValue || 0) <= 2 &&
    hasNoColorRequirement(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [story('202000153_light_forging', '你的主要阶段且战场没有单位，舍弃1张红色手牌：从卡组最多2张ACCESS2以下无颜色需求的红色非神蚀单位放置到战场。', async (instance, gameState, playerState) => {
  const list = candidates(playerState);
  const maxSelections = Math.min(2, list.length, playerState.unitZone.filter((slot: Card | null) => slot === null).length);
  createSelectCardQuery(
    gameState,
    playerState.uid,
    list,
    '选择轻量锻造对象',
    '选择最多2张ACCESS2以下、没有颜色需求的红色非神蚀单位放置到战场。',
    0,
    maxSelections,
    { sourceCardId: instance.gamecardId, effectId: '202000153_light_forging', step: 'PUT_UNITS' },
    () => 'DECK'
  );
}, {
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    !playerState.unitZone.some(unit => !!unit) &&
    playerState.hand.some(card => card.color === 'RED') &&
    candidates(playerState).length > 0,
  cost: discardHandCost(1, card => card.color === 'RED'),
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'PUT_UNITS') return;
    for (const selectedId of selections.slice(0, 2)) {
      const selected = AtomicEffectExecutor.findCardById(gameState, selectedId);
      if (!selected || selected.cardlocation !== 'DECK') continue;
      if (!candidates(playerState).some(card => card.gamecardId === selected.gamecardId)) continue;
      putUnitOntoField(gameState, playerState.uid, selected, instance);
    }
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
})];

const card: Card = {
  id: '202000153',
  fullName: '轻量锻造',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
