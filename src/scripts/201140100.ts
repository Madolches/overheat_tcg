import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { cardsInZones, createSelectCardQuery, ensureData, moveCardAsCost, putUnitOntoField, story } from './BaseUtil';

const ownUnits = (playerState: any) =>
  playerState.unitZone.filter((unit: Card | null): unit is Card => !!unit);

const canPutUnitAfterUnitCost = (playerState: any, card: Card, unitCostCount: number) => {
  const currentUnits = ownUnits(playerState);
  const availableSlotsAfterCost = playerState.unitZone.length - currentUnits.length + unitCostCount;
  const sameSpecialNameUnits = card.specialName
    ? currentUnits.filter(unit => unit?.specialName === card.specialName).length
    : 0;
  return card.type === 'UNIT' &&
    availableSlotsAfterCost > 0 &&
    sameSpecialNameUnits <= unitCostCount;
};

const shingiTargets = (playerState: any, pendingUnitCostCount = 0) =>
  cardsInZones(playerState, ['HAND', 'DECK']).filter(({ card }) =>
    card.type === 'UNIT' &&
    AtomicEffectExecutor.matchesColor(card, 'WHITE') &&
    (card.acValue || 0) >= 5 &&
    canPutUnitAfterUnitCost(playerState, card, pendingUnitCostCount)
  );

const markPlacedByShingi = (gameState: any, target: Card, source: Card) => {
  const data = ensureData(target);
  data.placedByShingiEffectTurn = gameState.turnCount;
  data.placedByShingiEffectSourceCardId = source.gamecardId;
  data.placedByShingiEffectSourceName = source.fullName;
};

const cardEffects: CardEffect[] = [story('201140100_angel_advent', '只能在你的主要阶段使用。将你战场上的3个单位放逐，将手牌或卡组中1张ACCESS值+5以上的白色单位卡放置到战场。', async (instance, gameState, playerState) => {
  const units = ownUnits(playerState);
  if (units.length < 3) return;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    units,
    '选择神仪费用',
    '选择你战场上的3个单位放逐作为费用。',
    3,
    3,
    { sourceCardId: instance.gamecardId, effectId: '201140100_angel_advent', step: 'EXILE_UNITS' },
    () => 'UNIT'
  );
}, {
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    ownUnits(playerState).length >= 3 &&
    shingiTargets(playerState, 3).length > 0,
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'EXILE_UNITS') {
      const selected = selections
        .map(id => AtomicEffectExecutor.findCardById(gameState, id))
        .filter((card: Card | undefined): card is Card => !!card && card.cardlocation === 'UNIT');
      if (selected.length !== 3) return;
      selected.forEach(unit => moveCardAsCost(gameState, playerState.uid, unit, 'EXILE', instance));
      const candidates = shingiTargets(playerState);
      if (candidates.length === 0) return;
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, candidates),
        title: '选择天使降临单位',
        description: '选择手牌或卡组中1张ACCESS值+5以上的白色单位卡放置到战场。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: { sourceCardId: instance.gamecardId, effectId: '201140100_angel_advent', step: 'PUT_UNIT' }
      };
      return;
    }

    if (context?.step !== 'PUT_UNIT') return;
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || !['HAND', 'DECK'].includes(selected.cardlocation || '')) return;
    const fromDeck = selected.cardlocation === 'DECK';
    const targetId = selected.gamecardId;
    if (!putUnitOntoField(gameState, playerState.uid, selected, instance)) return;
    const live = AtomicEffectExecutor.findCardById(gameState, targetId);
    if (live?.cardlocation === 'UNIT') markPlacedByShingi(gameState, live, instance);
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201140100
 * Card2 Row: 478
 * Card Row: 411
 * Source CardNo: BT06-W08
 * Package: BT06(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * {你的主要阶段}[将你战场上的3个单位放逐]：这张卡不能用于对抗。将你手牌或卡组中1张ACCESS值+5以上的白色单位卡放置到战场上。
 */
const card: Card = {
  id: '201140100',
  fullName: '神仪：天使降临',
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
