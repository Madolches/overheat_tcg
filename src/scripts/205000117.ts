import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  backErosionCount,
  createSelectCardQuery,
  getOpponentUid,
  moveCard,
  story
} from './BaseUtil';

const anyDiscardCandidates = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId);

const yellowDiscardCandidates = (playerState: any, instance: Card) =>
  anyDiscardCandidates(playerState, instance).filter((card: Card) => card.color === 'YELLOW');

const opponentNonGodGrave = (gameState: any, playerUid: string) =>
  gameState.players[getOpponentUid(gameState, playerUid)].grave.filter((card: Card) => !card.godMark);

const isSameNameCard = (card: Card, selected: Card) =>
  card.id === selected.id || (!!card.fullName && card.fullName === selected.fullName);

const hasMillMode = (playerState: any, instance: Card) =>
  anyDiscardCandidates(playerState, instance).length > 0;

const hasExileMode = (playerState: any, instance: Card) =>
  backErosionCount(playerState) >= 2 && yellowDiscardCandidates(playerState, instance).length > 0;

const canUseAnyMode = (playerState: any, instance: Card) =>
  hasMillMode(playerState, instance) || hasExileMode(playerState, instance);

const discardCandidatesForMode = (playerState: any, instance: Card, mode?: string) =>
  mode === 'EXILE_ALL_SAME_NAME'
    ? yellowDiscardCandidates(playerState, instance)
    : anyDiscardCandidates(playerState, instance);

const createDiscardCostQuery = (gameState: any, playerState: any, instance: Card, mode?: string, targetId?: string) => {
  const candidates = discardCandidatesForMode(playerState, instance, mode);
  if (candidates.length === 0) return false;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    candidates,
    '支付舍弃费用',
    mode === 'EXILE_ALL_SAME_NAME' ? '选择1张黄色手牌舍弃。' : '选择1张手牌舍弃。',
    1,
    1,
    {
      sourceCardId: instance.gamecardId,
      effectId: '205000117_otherworld_fantasy',
      step: 'DISCARD',
      mode,
      targetId,
      costType: 'CUSTOM_CARD_COST',
      skipEffectResolveAfterCost: true
    },
    () => 'HAND'
  );
  return true;
};

const cardEffects: CardEffect[] = [story('205000117_otherworld_fantasy', '选择对手墓地中的1张非神蚀卡。舍弃1张手牌，对手将卡组中的同名卡送入墓地；或【创痕2】舍弃1张黄色手牌，对手将卡组、手牌、墓地中的同名卡全部放逐。', async () => {
}, {
  condition: (gameState, playerState, instance) =>
    opponentNonGodGrave(gameState, playerState.uid).length > 0 &&
    canUseAnyMode(playerState, instance),
  targetSpec: {
    modeTitle: '选择异界幻想',
    modeDescription: '选择1项效果执行。',
    modeOptions: [{
      id: 'MILL_DECK_SAME_NAME',
      label: '卡组同名送墓',
      title: '选择对手墓地卡',
      description: '选择对手墓地中的1张非神蚀卡。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['GRAVE'],
      controller: 'OPPONENT',
      step: 'TARGET',
      condition: (_gameState, playerState, instance) => hasMillMode(playerState, instance),
      getCandidates: (gameState, playerState) =>
        opponentNonGodGrave(gameState, playerState.uid).map(card => ({ card, source: 'GRAVE' as any }))
    }, {
      id: 'EXILE_ALL_SAME_NAME',
      label: '全部同名放逐',
      title: '选择对手墓地卡',
      description: '选择对手墓地中的1张非神蚀卡。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['GRAVE'],
      controller: 'OPPONENT',
      step: 'TARGET',
      condition: (_gameState, playerState, instance) => hasExileMode(playerState, instance),
      getCandidates: (gameState, playerState) =>
        opponentNonGodGrave(gameState, playerState.uid).map(card => ({ card, source: 'GRAVE' as any }))
    }]
  },
  cost: async (gameState, playerState, instance, options?: any) => {
    const mode = options?.declaredModeId;
    const targetId = options?.declaredTargets?.[0]?.gamecardId;
    return createDiscardCostQuery(gameState, playerState, instance, mode, targetId);
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'DISCARD') return;
    const discarded = selections[0] ? playerState.hand.find((card: Card) => card.gamecardId === selections[0]) : undefined;
    if (!discarded) {
      context.cancelActivation = true;
      return;
    }
    if (context.mode === 'EXILE_ALL_SAME_NAME' && discarded.color !== 'YELLOW') {
      context.cancelActivation = true;
      return;
    }
    moveCard(gameState, playerState.uid, discarded, 'GRAVE', instance);
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    const mode = context?.modeId || context?.selectedModeId || context?.mode;
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || selected.cardlocation !== 'GRAVE' || selected.godMark) return;

    const opponentUid = getOpponentUid(gameState, playerState.uid);
    const opponent = gameState.players[opponentUid];
    if (mode === 'EXILE_ALL_SAME_NAME') {
      const cards = [...opponent.deck, ...opponent.hand, ...opponent.grave].filter((card: Card) => isSameNameCard(card, selected));
      const searchedDeck = cards.some((card: Card) => card.cardlocation === 'DECK');
      cards.forEach((card: Card) => moveCard(gameState, opponentUid, card, 'EXILE', instance));
      if (searchedDeck) {
        await AtomicEffectExecutor.execute(gameState, opponentUid, { type: 'SHUFFLE_DECK' }, instance);
      }
      return;
    }

    const deckCards = [...opponent.deck].filter((card: Card) => isSameNameCard(card, selected));
    deckCards.forEach((card: Card) => moveCard(gameState, opponentUid, card, 'GRAVE', instance));
    if (deckCards.length > 0) {
      await AtomicEffectExecutor.execute(gameState, opponentUid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 205000117
 * Card2 Row: 591
 * Card Row: 481
 * Source CardNo: BT07-03Y
 * Package: PR(2017年3月)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * {选择对手墓地中的1张非神蚀卡，选择下列的1项效果执行}：
 * ◆[舍弃1张手牌]：对手将他卡组中的被选择的卡的同名卡全部送入墓地。
 * ◆【创痕2】[舍弃1张黄色手牌]：对手将他的卡组、手牌、墓地中的被选择的卡的同名卡全部放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '205000117',
  fullName: '异界幻想',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
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
