import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, createSelectCardQuery, ensureData, moveCardAsCost, ownUnits, putUnitOntoField, story } from './BaseUtil';

const isWhiteUnit = (card: Card) =>
  card.type === 'UNIT' && AtomicEffectExecutor.matchesColor(card, 'WHITE');

const baptismTargets = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    isWhiteUnit(card) &&
    (card.acValue || 0) === 5 &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const selectedAccessTotal = (cards: Card[]) =>
  cards.reduce((total, card) => total + Number(card.acValue || 0), 0);

const markPlacedByShingi = (gameState: any, target: Card, source: Card) => {
  const data = ensureData(target);
  data.placedByShingiEffectTurn = gameState.turnCount;
  data.placedByShingiEffectSourceCardId = source.gamecardId;
  data.placedByShingiEffectSourceName = source.fullName;
};

const cardEffects: CardEffect[] = [story('201140119_baptism', '同名1回合1次：你的主要阶段，若你的战场上只有白色单位，放逐你战场上的单位直到ACCESS值合计5以上，将卡组中1张ACCESS值5的白色单位放置到战场。这张卡不能用于对抗。', async (instance, gameState, playerState) => {
  const candidates = baptismTargets(playerState);
  if (candidates.length === 0) return;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    candidates,
    '选择白色单位',
    '选择卡组中的1张ACCESS值5的白色单位放置到战场。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '201140119_baptism', step: 'PUT_UNIT' },
    () => 'DECK'
  );
}, {
  limitCount: 1,
  limitNameType: true,
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    ownUnits(playerState).length > 0 &&
    ownUnits(playerState).every(isWhiteUnit) &&
    selectedAccessTotal(ownUnits(playerState)) >= 5 &&
    baptismTargets(playerState).length > 0,
  cost: async (gameState, playerState, instance) => {
    const costs = ownUnits(playerState);
    if (selectedAccessTotal(costs) < 5) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costs,
      '选择神仪费用',
      '选择你战场上的单位放逐作为费用，所选单位ACCESS值合计需为5以上。',
      1,
      costs.length,
      {
        sourceCardId: instance.gamecardId,
        effectId: '201140119_baptism',
        step: 'EXILE_UNITS_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      () => 'UNIT'
    );
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'EXILE_UNITS_COST') return;
    const selected = selections
      .map(id => ownUnits(playerState).find(unit => unit.gamecardId === id))
      .filter((card: Card | undefined): card is Card => !!card);
    if (
      selected.length === 0 ||
      selected.length !== selections.length ||
      new Set(selected.map(card => card.gamecardId)).size !== selected.length ||
      selectedAccessTotal(selected) < 5
    ) {
      context.cancelActivation = true;
      return;
    }
    selected.forEach(unit => moveCardAsCost(gameState, playerState.uid, unit, 'EXILE', instance));
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'PUT_UNIT') return;
    const target = selections[0] ? playerState.deck.find((card: Card) => card.gamecardId === selections[0]) : undefined;
    if (!target || !baptismTargets(playerState).some((card: Card) => card.gamecardId === target.gamecardId)) return;
    const targetId = target.gamecardId;
    if (!putUnitOntoField(gameState, playerState.uid, target, instance)) return;
    const live = AtomicEffectExecutor.findCardById(gameState, targetId);
    if (live?.cardlocation === 'UNIT') markPlacedByShingi(gameState, live, instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201140119
 * Card2 Row: 611
 * Card Row: 495
 * Source CardNo: BT08-W07
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖同名1回合1次〗{你的主要阶段，若你的战场上只有白色单位}[放逐你战场上的单位直到被放逐的单位的ACCESS值合计+5以上]:这张卡不能用于对抗。将你的卡组中的1张ACCESS值+5的白色单位卡放置到战场上。
 */
const card: Card = {
  id: '201140119',
  fullName: '神仪：洗礼',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '女神教会',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
