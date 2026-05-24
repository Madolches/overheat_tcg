import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  ensureData,
  isEffectiveGodMark,
  isNonGodFieldCard,
  isNonGodUnit,
  moveCard,
  nameContains,
  putUnitOntoField,
  story
} from './BaseUtil';

const materialCandidates = (playerState: any) => [
  ...playerState.unitZone,
  ...playerState.itemZone,
  ...playerState.deck
].filter((card: Card | null): card is Card =>
  !!card &&
  (
    (['UNIT', 'ITEM'].includes(card.cardlocation || '') && isNonGodFieldCard(card)) ||
    (card.cardlocation === 'DECK' && isEffectiveGodMark(card))
  )
);

const deckTargets = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    isNonGodUnit(card) &&
    nameContains(card, '炼金') &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const markHighAlchemy = (gameState: any, target: Card, source: Card, materialColors: string[]) => {
  const data = ensureData(target);
  data.highAlchemyPlacedTurn = gameState.turnCount;
  data.highAlchemySourceCardId = source.gamecardId;
  data.highAlchemySourceName = source.fullName;
  data.highAlchemyMaterialColors = Array.from(new Set(materialColors));
  data.enteredFromDeckByAlchemyTurn = gameState.turnCount;
  data.enteredFromDeckByAlchemySourceCardId = source.gamecardId;
};

const cardEffects: CardEffect[] = [story('205000153_rainbow_high_alchemy', '创痕2：主要阶段，将战场非神蚀卡或卡组神蚀卡合计2张以上送入墓地，将卡组中1张卡名含有《炼金》的非神蚀单位放置到战场。视作《高位炼金》。', async (instance, gameState, playerState) => {
  createSelectCardQuery(
    gameState,
    playerState.uid,
    materialCandidates(playerState),
    '选择炼金素材',
    '选择战场上的非神蚀卡或卡组中的神蚀卡合计2张以上送入墓地。',
    2,
    materialCandidates(playerState).length,
    { sourceCardId: instance.gamecardId, effectId: '205000153_rainbow_high_alchemy', step: 'MATERIALS' },
    card => card.cardlocation as any
  );
}, {
  erosionBackLimit: [2, 99],
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    materialCandidates(playerState).length >= 2 &&
    deckTargets(playerState).length > 0,
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MATERIALS') {
      const selected = selections
        .map(id => AtomicEffectExecutor.findCardById(gameState, id))
        .filter((card: Card | undefined): card is Card =>
          !!card && materialCandidates(playerState).some(candidate => candidate.gamecardId === card.gamecardId)
        );
      if (selected.length < 2) return;
      const materialColors = selected.map(card => card.color);
      selected.forEach(card => moveCard(gameState, playerState.uid, card, 'GRAVE', instance));
      createSelectCardQuery(
        gameState,
        playerState.uid,
        deckTargets(playerState),
        '选择炼金单位',
        '选择卡组中的1张卡名含有《炼金》的非神蚀单位放置到战场。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '205000153_rainbow_high_alchemy', step: 'PUT_UNIT', materialColors },
        () => 'DECK'
      );
      return;
    }

    if (context?.step !== 'PUT_UNIT') return;
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !deckTargets(playerState).some(card => card.gamecardId === target.gamecardId)) return;
    const targetId = target.gamecardId;
    if (!putUnitOntoField(gameState, playerState.uid, target, instance)) return;
    const moved = AtomicEffectExecutor.findCardById(gameState, targetId);
    if (moved?.cardlocation === 'UNIT') markHighAlchemy(gameState, moved, instance, context.materialColors || []);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 205000153
 * Card2 Row: 624
 * Card Row: 508
 * Source CardNo: BT08-Y09
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕2】{你的主要阶段}:将你战场上的非神蚀卡或你的卡组中的神蚀卡合计2张以上送入墓地，将你的卡组中的1张卡名含有《炼金》的非神蚀单位卡放置到战场上。这个效果也视作《高位炼金》的效果将单位卡放置到战场上。
 */
const card: Card = {
  id: '205000153',
  fullName: '虹彩炼金',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 1,
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
