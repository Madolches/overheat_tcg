import { ServerGameService } from '../server/ServerGameService';
import { AI_DECK_PROFILES } from '../server/ai/deckProfiles';
import { ADVENTURER_GUILD_DEFAULT_OPENING_CARD_IDS, ADVENTURER_GUILD_FIRST_TURN_PLAY_CARD_IDS } from '../server/ai/decks/adventurerGuildStrategy';
import { PURE_YELLOW_STEEL_CARD_IDS, PURE_YELLOW_STEEL_DEFAULT_OPENING_CARD_IDS, PURE_YELLOW_STEEL_FIRST_TURN_PLAY_CARD_IDS } from '../server/ai/decks/pureYellowSteel';
import { initServerCardLibrary, SERVER_CARD_LIBRARY } from '../server/card_loader';
import { decodeDeckShareCode } from '../src/lib/deckShareCode';
import { Card, GameState } from '../src/types/game';

type FixedOpeningScenario = {
  profileId: string;
  expectedShareCode: string;
  defaultOpeningCardIds: readonly string[];
  firstTurnPlayCardIds: readonly string[];
  afterResolve?: (state: GameState, expectedCardId: string) => Promise<void>;
};

type RegressionCase = {
  name: string;
  profileId: string;
  run: (deck: Card[]) => Promise<void>;
};

const STEEL_VALKYRIE_CARD_ID = '105110351';
const STEEL_VALKYRIE_BOOST_EFFECT_ID = '105110351_destroy_boost';

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const catalogRefs = () =>
  [...new Set(
    Object.values(SERVER_CARD_LIBRARY)
      .map(card => card?.uniqueId)
      .filter((ref): ref is string => !!ref)
  )].sort((a, b) => a.localeCompare(b));

const resolveDeck = (shareCode: string) => {
  const refs = decodeDeckShareCode(shareCode, catalogRefs());
  return refs
    .map(ref => SERVER_CARD_LIBRARY[ref])
    .filter((card): card is Card => !!card);
};

const resolveAllCountering = async (state: GameState) => {
  while (state.counterStack.length > 0 || state.isCountering) {
    await ServerGameService.resolveCounterStack(state);
  }
};

const resolveSteelBlueprintPainterSearch = async (state: GameState) => {
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    const triggerSelections = ServerGameService.getBotQuerySelectionsForPlayer(state, 'BOT_PLAYER', state.pendingQuery);
    assert(triggerSelections[0] === 'YES', `Expected blueprint painter trigger to be accepted, got ${triggerSelections.join(',') || 'none'}`);
    await ServerGameService.handleQueryChoice(state, 'BOT_PLAYER', state.pendingQuery.id, triggerSelections);
  }

  const query = state.pendingQuery;
  assert(query, 'Expected blueprint painter search query');
  assert(query?.context?.effectId === '105110381_hand_enter_search_blueprint_item', `Expected blueprint painter query, got ${query?.context?.effectId || 'none'}`);
  assert(query?.type === 'SELECT_CARD', `Expected blueprint painter SELECT_CARD query, got ${query?.type || 'none'}`);

  const selections = ServerGameService.getBotQuerySelectionsForPlayer(state, 'BOT_PLAYER', query);
  const selectedCard = query.options
    .map(option => option.card)
    .find(card => card?.gamecardId === selections[0] || card?.id === selections[0]);
  assert(selectedCard?.id === PURE_YELLOW_STEEL_CARD_IDS.steelBlueprint, `Expected blueprint painter to search steel blueprint, got ${selectedCard?.id || 'none'}`);

  await ServerGameService.handleQueryChoice(state, 'BOT_PLAYER', query.id, selections);
};

const createScenarioState = async (profileId: string, deck: Card[]) => {
  const state = await ServerGameService.createPracticeGameState(
    deck,
    'TEST_PLAYER',
    '测试玩家',
    undefined,
    'hard',
    profileId,
    deck
  );

  const bot = state.players.BOT_PLAYER;
  assert(bot, 'Practice game should create BOT_PLAYER');
  state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
  state.turnCount = 1;
  state.phase = 'MAIN';
  state.players.TEST_PLAYER.isTurn = false;
  bot.isTurn = true;
  bot.isFirst = true;
  state.firstPlayerChoice = undefined;
  state.phaseTimerStart = Date.now();
  return state;
};

const takeCardById = (state: GameState, playerUid: string, cardId: string) => {
  const player = state.players[playerUid];
  assert(player, `Missing player ${playerUid}`);

  const takeFromCardArray = (cards: Card[]) => {
    const index = cards.findIndex(card => card.id === cardId);
    if (index < 0) return undefined;
    const [card] = cards.splice(index, 1);
    return card;
  };

  for (const zone of [player.hand, player.deck, player.grave, player.exile, player.playZone]) {
    const card = takeFromCardArray(zone);
    if (card) return card;
  }

  for (const zone of [player.unitZone, player.itemZone, player.erosionFront, player.erosionBack]) {
    const index = zone.findIndex(card => card?.id === cardId);
    if (index < 0) continue;
    const card = zone[index];
    zone[index] = null;
    if (card) return card;
  }

  throw new Error(`Could not find card ${cardId} for ${playerUid}`);
};

const putUnitForScenario = (state: GameState, playerUid: string, card: Card, slot = 0) => {
  const player = state.players[playerUid];
  assert(player, `Missing player ${playerUid}`);
  card.cardlocation = 'UNIT';
  card.displayState = 'FRONT_UPRIGHT';
  card.isExhausted = false;
  card.playedTurn = Math.max(0, state.turnCount - 1);
  player.unitZone[slot] = card;
};

const putItemForScenario = (state: GameState, playerUid: string, card: Card, slot = 0) => {
  const player = state.players[playerUid];
  assert(player, `Missing player ${playerUid}`);
  card.cardlocation = 'ITEM';
  card.displayState = 'FRONT_UPRIGHT';
  player.itemZone[slot] = card;
};

const runFixedOpeningScenario = async (scenario: FixedOpeningScenario) => {
  const profile = AI_DECK_PROFILES.find(candidate => candidate.id === scenario.profileId);
  assert(profile, `Missing hard AI profile ${scenario.profileId}`);
  assert(profile!.shareCode === scenario.expectedShareCode, `${scenario.profileId} hard AI share code mismatch`);

  const deck = resolveDeck(profile!.shareCode!);
  assert(deck.length === 50, `${scenario.profileId} deck should contain 50 cards, got ${deck.length}`);
  const validation = ServerGameService.validateDeck(deck);
  assert(validation.valid, `${scenario.profileId} deck should be valid: ${validation.error}`);

  const state = await createScenarioState(scenario.profileId, deck);
  const bot = state.players.BOT_PLAYER;

  const openingHandIds = bot.hand.map(card => card.id);
  const expectedHandIds = scenario.defaultOpeningCardIds.slice(0, 4);
  assert(
    openingHandIds.join(',') === expectedHandIds.join(','),
    `Expected ${scenario.profileId} opening hand ${expectedHandIds.join(',')}, got ${openingHandIds.join(',')}`
  );

  const nextDeckCard = bot.deck[bot.deck.length - 1];
  assert(
    nextDeckCard?.id === scenario.defaultOpeningCardIds[4],
    `Expected ${scenario.profileId} fifth fixed opening card on top of deck, got ${nextDeckCard?.id || 'none'}`
  );

  for (const expectedCardId of scenario.firstTurnPlayCardIds) {
    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');
    const topStackCard = state.counterStack[state.counterStack.length - 1]?.card;
    assert(topStackCard?.id === expectedCardId, `Expected ${scenario.profileId} to play ${expectedCardId}, got ${topStackCard?.id || 'none'}`);
    await resolveAllCountering(state);
    if (scenario.afterResolve) await scenario.afterResolve(state, expectedCardId);
    assert(!state.pendingQuery, `Unexpected pending query after resolving ${expectedCardId}: ${state.pendingQuery?.callbackKey}`);
    assert(
      bot.unitZone.some(card => card?.id === expectedCardId) ||
        bot.itemZone.some(card => card?.id === expectedCardId),
      `Expected ${scenario.profileId} ${expectedCardId} to resolve to the battlefield`
    );
  }

  const fieldIds = [...bot.unitZone, ...bot.itemZone].filter(Boolean).map(card => card!.id);
  for (const cardId of scenario.firstTurnPlayCardIds) {
    assert(fieldIds.includes(cardId), `Expected ${scenario.profileId} fixed opening card ${cardId} on field`);
  }
};

const runRegressionCase = async (regression: RegressionCase) => {
  const profile = AI_DECK_PROFILES.find(candidate => candidate.id === regression.profileId);
  assert(profile?.shareCode, `Missing hard AI regression profile ${regression.profileId}`);
  const deck = resolveDeck(profile.shareCode);
  const validation = ServerGameService.validateDeck(deck);
  assert(validation.valid, `${regression.name} deck should be valid: ${validation.error}`);
  await regression.run(deck);
};

const regressionCases: RegressionCase[] = [{
  name: '纯黄钢兵低牌库支付风险识别',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const bot = state.players.BOT_PLAYER;
    bot.deck = bot.deck.slice(0, 2);

    const paymentRisk = ServerGameService.scoreBotPaymentSelectionRisk(state, 'BOT_PLAYER', {}, {
      paymentCost: 2,
      paymentColor: 'YELLOW',
    });

    assert(paymentRisk.estimatedDeckPayment === 2, `Expected deck payment estimate 2, got ${paymentRisk.estimatedDeckPayment}`);
    assert(paymentRisk.penalty >= 80, `Expected unsafe low-deck payment penalty, got ${paymentRisk.penalty}`);
    assert(paymentRisk.notes.some(note => /unsafe deck payment/i.test(note)), `Expected unsafe deck payment note, got ${paymentRisk.notes.join(',')}`);
  },
}, {
  name: 'pure-yellow-steel skips steel valkyrie boost when only protected costs exist',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 5;
    state.phase = 'MAIN';
    state.pendingQuery = undefined;
    state.isResolvingStack = false;
    state.currentProcessingItem = undefined;

    const valkyrie = takeCardById(state, 'BOT_PLAYER', STEEL_VALKYRIE_CARD_ID);
    const steelBlueprint = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.steelBlueprint);
    const fortressBlueprint = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.fortressBlueprint);
    putUnitForScenario(state, 'BOT_PLAYER', valkyrie, 0);
    putItemForScenario(state, 'BOT_PLAYER', steelBlueprint, 0);
    putItemForScenario(state, 'BOT_PLAYER', fortressBlueprint, 1);

    const effectIndex = valkyrie.effects?.findIndex(effect => effect.id === STEEL_VALKYRIE_BOOST_EFFECT_ID) ?? -1;
    const effect = effectIndex >= 0 ? valkyrie.effects?.[effectIndex] : undefined;
    assert(effect, 'Expected steel valkyrie boost effect to exist');

    const canChooseTargets = ServerGameService.canBotChooseDeclaredTargetsForEffect(
      state,
      'BOT_PLAYER',
      valkyrie,
      effect!,
      effectIndex
    );
    assert(!canChooseTargets, 'Expected protected blueprint costs to fail hard AI target precheck');

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    assert(
      !candidates.some(candidate => candidate.effect?.id === STEEL_VALKYRIE_BOOST_EFFECT_ID),
      'Expected steel valkyrie boost to be filtered before activation'
    );
    assert(
      !state.aiDecisionLogs?.some(log => log.action === 'ACTIVATE_EFFECT_FAILED' && log.details?.effectId === STEEL_VALKYRIE_BOOST_EFFECT_ID),
      'Expected target precheck not to record a failed activation'
    );
  },
}];

await initServerCardLibrary();

await runFixedOpeningScenario({
  profileId: 'adventurer-guild',
  expectedShareCode: 'GihIjIjYOVY1kX2fdZtTRgFcWXj6dQw',
  defaultOpeningCardIds: ADVENTURER_GUILD_DEFAULT_OPENING_CARD_IDS,
  firstTurnPlayCardIds: ADVENTURER_GUILD_FIRST_TURN_PLAY_CARD_IDS,
});

await runFixedOpeningScenario({
  profileId: 'pure-yellow-steel',
  expectedShareCode: 'GihIjIjYGTovnjmfgpP_JeoLo_uA',
  defaultOpeningCardIds: PURE_YELLOW_STEEL_DEFAULT_OPENING_CARD_IDS,
  firstTurnPlayCardIds: PURE_YELLOW_STEEL_FIRST_TURN_PLAY_CARD_IDS,
  afterResolve: async (state, expectedCardId) => {
    if (expectedCardId !== PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter) return;
    await resolveSteelBlueprintPainterSearch(state);
    const bot = state.players.BOT_PLAYER;
    assert(
      bot.hand.some(card => card.id === PURE_YELLOW_STEEL_CARD_IDS.steelBlueprint),
      'Expected steel blueprint in hand after blueprint painter search'
    );
  },
});

for (const regression of regressionCases) {
  await runRegressionCase(regression);
}

console.log('困难 AI 卡组与首回合固定展开测试通过。');
