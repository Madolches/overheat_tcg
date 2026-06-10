import { ServerGameService } from '../server/ServerGameService';
import { AI_DECK_PROFILES } from '../server/ai/deckProfiles';
import { ADVENTURER_GUILD_CARD_IDS, ADVENTURER_GUILD_DEFAULT_OPENING_CARD_IDS, ADVENTURER_GUILD_FIRST_TURN_PLAY_CARD_IDS, getAdventurerGuildRouteAdvice } from '../server/ai/decks/adventurerGuildStrategy';
import { PURE_YELLOW_STEEL_CARD_IDS, PURE_YELLOW_STEEL_DEFAULT_OPENING_CARD_IDS, PURE_YELLOW_STEEL_FIRST_TURN_PLAY_CARD_IDS } from '../server/ai/decks/pureYellowSteel';
import { buildTurnPlan, chooseCheatDrawCard } from '../server/ai/hardStrategy';
import { initServerCardLibrary, SERVER_CARD_LIBRARY } from '../server/card_loader';
import { decodeDeckShareCode } from '../src/lib/deckShareCode';
import { Card, EffectQuery, GameState } from '../src/types/game';

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
let scenarioCardSeq = 0;

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

const makeScenarioCard = (overrides: Partial<Card> = {}): Card => {
  scenarioCardSeq += 1;
  const id = overrides.id || `AI_SCENARIO_CARD_${scenarioCardSeq}`;
  return {
    id,
    uniqueId: overrides.uniqueId || `${id}:TEST`,
    gamecardId: overrides.gamecardId || `${id}_INSTANCE_${scenarioCardSeq}`,
    fullName: overrides.fullName || id,
    specialName: overrides.specialName || '',
    type: overrides.type || 'UNIT',
    color: overrides.color || 'YELLOW',
    colorReq: overrides.colorReq || {},
    baseColorReq: overrides.baseColorReq || overrides.colorReq || {},
    acValue: overrides.acValue ?? 1,
    baseAcValue: overrides.baseAcValue ?? overrides.acValue ?? 1,
    power: overrides.power ?? 1000,
    basePower: overrides.basePower ?? overrides.power ?? 1000,
    damage: overrides.damage ?? 1,
    baseDamage: overrides.baseDamage ?? overrides.damage ?? 1,
    godMark: overrides.godMark ?? false,
    baseGodMark: overrides.baseGodMark ?? overrides.godMark ?? false,
    displayState: overrides.displayState || 'FRONT_UPRIGHT',
    feijingMark: overrides.feijingMark ?? false,
    faction: overrides.faction || 'TEST',
    cardlocation: overrides.cardlocation || 'DECK',
    effects: overrides.effects || [],
    ...overrides,
  } as Card;
};

const querySelection = (state: GameState, query: EffectQuery) =>
  ServerGameService.getBotQuerySelectionsForPlayer(state, 'BOT_PLAYER', query);

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

const putErosionFrontForScenario = (state: GameState, playerUid: string, card: Card, slot = 0) => {
  const player = state.players[playerUid];
  assert(player, `Missing player ${playerUid}`);
  card.cardlocation = 'EROSION_FRONT';
  card.displayState = 'FRONT_UPRIGHT';
  card.isExhausted = false;
  player.erosionFront[slot] = card;
};

const putErosionBackForScenario = (state: GameState, playerUid: string, card: Card, slot = 0) => {
  const player = state.players[playerUid];
  assert(player, `Missing player ${playerUid}`);
  card.cardlocation = 'EROSION_BACK';
  card.displayState = 'FRONT_FACEDOWN';
  card.isExhausted = false;
  player.erosionBack[slot] = card;
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

const runSelfPlayOpeningScenario = async (scenario: FixedOpeningScenario) => {
  const profile = AI_DECK_PROFILES.find(candidate => candidate.id === scenario.profileId);
  assert(profile?.shareCode, `Missing hard AI self-play profile ${scenario.profileId}`);

  const deck = resolveDeck(profile.shareCode);
  const playerUid = `AI_${scenario.profileId}`;
  const opponentUid = `AI_SELFPLAY_OPPONENT_${scenario.profileId}`;
  const state = await ServerGameService.createMatchGameState(playerUid, deck, opponentUid, deck, 999);
  const player = state.players[playerUid];

  assert(player, `Self-play state should create ${playerUid}`);
  state.mode = 'ai-selfplay';
  state.phase = 'MULLIGAN';
  state.botDifficulty = 'hard';
  state.botDeckProfiles = { [playerUid]: scenario.profileId };
  player.botDifficulty = 'hard';
  player.botDeckProfileId = scenario.profileId;
  player.mulliganDone = false;

  ServerGameService.prepareHardAiOpeningHand(player, scenario.profileId, 4);

  const openingHandIds = player.hand.map(card => card.id);
  const expectedHandIds = scenario.defaultOpeningCardIds.slice(0, 4);
  assert(
    openingHandIds.join(',') === expectedHandIds.join(','),
    `Expected ${scenario.profileId} self-play opening hand ${expectedHandIds.join(',')}, got ${openingHandIds.join(',')}`
  );

  await ServerGameService.botMoveForPlayer(state, playerUid);

  const mulliganHandIds = player.hand.map(card => card.id);
  assert(
    mulliganHandIds.join(',') === expectedHandIds.join(','),
    `Expected ${scenario.profileId} self-play mulligan to keep fixed opening ${expectedHandIds.join(',')}, got ${mulliganHandIds.join(',')}`
  );
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
  name: 'pure-yellow-steel avoids academy puppet master engine effect at low deck',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 8;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const puppetMaster = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.academyPuppetMaster);
    bot.isTurn = true;
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    bot.deck = [
      makeScenarioCard({ id: 'LOW_DECK_SAFE_FILLER_A', fullName: 'Low Deck Safe Filler A', type: 'UNIT', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'LOW_DECK_SAFE_FILLER_B', fullName: 'Low Deck Safe Filler B', type: 'UNIT', cardlocation: 'DECK' }),
      makeScenarioCard({ id: PURE_YELLOW_STEEL_CARD_IDS.steelBlueprint, fullName: '钢铁蓝图', type: 'ITEM', cardlocation: 'DECK' }),
      makeScenarioCard({ id: '105110348', fullName: '钢兵魔偶', type: 'UNIT', faction: '学院要塞', cardlocation: 'DECK', power: 3500, damage: 3 }),
      makeScenarioCard({ id: 'LOW_DECK_SAFE_FILLER_C', fullName: 'Low Deck Safe Filler C', type: 'UNIT', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'LOW_DECK_SAFE_FILLER_D', fullName: 'Low Deck Safe Filler D', type: 'UNIT', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'LOW_DECK_SAFE_FILLER_E', fullName: 'Low Deck Safe Filler E', type: 'UNIT', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'LOW_DECK_SAFE_FILLER_F', fullName: 'Low Deck Safe Filler F', type: 'UNIT', cardlocation: 'DECK' }),
    ];
    putUnitForScenario(state, 'BOT_PLAYER', puppetMaster, 0);

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const engineEffect = candidates.find(candidate => candidate.effect?.id === '105110383_creation_scar_put_top_blueprint_or_puppet');
    assert(engineEffect, 'Expected academy puppet master engine effect candidate to exist');
    assert(engineEffect.score < 5.5, `Expected low-deck academy puppet master effect below main threshold, got ${engineEffect.score}`);
  },
}, {
  name: 'pure-yellow-steel holds academy puppet master engine under adventurer pressure',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 7;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const adventurerProfile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(adventurerProfile?.shareCode, 'Missing adventurer-guild profile share code');

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const puppetMaster = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.academyPuppetMaster);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    bot.deck = [
      makeScenarioCard({ id: PURE_YELLOW_STEEL_CARD_IDS.steelBlueprint, fullName: 'Steel Blueprint', type: 'ITEM', cardlocation: 'DECK' }),
      makeScenarioCard({ id: '105110348', fullName: 'Steel Puppet', type: 'UNIT', faction: 'Academy Fortress', cardlocation: 'DECK', power: 3500, damage: 3 }),
      ...Array.from({ length: 15 }, (_, index) =>
        makeScenarioCard({ id: `PUPPET_PRESSURE_BOT_DECK_${index}`, fullName: `Puppet Pressure Bot Deck ${index}`, cardlocation: 'DECK' })
      ),
    ];
    putUnitForScenario(state, 'BOT_PLAYER', puppetMaster, 0);
    for (let index = 0; index < 4; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `PUPPET_PRESSURE_BOT_EROSION_${index}`,
        fullName: `Puppet Pressure Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    opponent.deck = resolveDeck(adventurerProfile.shareCode).map((card, index) => ({
      ...card,
      gamecardId: `PUPPET_PRESSURE_ADVENTURER_DECK_${index}_${card.id}`,
      cardlocation: 'DECK',
    }));
    opponent.hand = [];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.itemZone = [null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'pure-yellow-steel',
      TEST_PLAYER: 'adventurer-guild',
    };
    (opponent as any).botDeckProfileId = 'adventurer-guild';

    [
      { id: ADVENTURER_GUILD_CARD_IDS.batra, name: 'Batra Pressure', damage: 3, power: 3000 },
      { id: ADVENTURER_GUILD_CARD_IDS.albert, name: 'Albert Pressure', damage: 2, power: 3000 },
      { id: ADVENTURER_GUILD_CARD_IDS.amy, name: 'Amy Pressure', damage: 2, power: 3000 },
    ].forEach((threat, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: threat.id,
        fullName: threat.name,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: threat.power,
        basePower: threat.power,
        damage: threat.damage,
        baseDamage: threat.damage,
        playedTurn: 0,
      }), index);
    });

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const engineEffect = candidates.find(candidate => candidate.effect?.id === '105110383_creation_scar_put_top_blueprint_or_puppet');
    assert(engineEffect, 'Expected academy puppet master engine effect candidate to exist under pressure');
    assert(engineEffect.score < 5.5, `Expected pressure academy puppet master effect below main threshold, got ${engineEffect.score}`);
    assert(
      engineEffect.notes.some((note: string) => /defense pressure/.test(note)),
      `Expected defense pressure note, got ${engineEffect.notes.join(',')}`
    );
  },
}, {
  name: 'pure-yellow-steel declines start-step blueprint exile triggers at low deck',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const bot = state.players.BOT_PLAYER;
    bot.deck = Array.from({ length: 8 }, (_, index) =>
      makeScenarioCard({ id: `LOW_DECK_TRIGGER_DECK_${index}`, fullName: `Low Deck Trigger Deck ${index}`, cardlocation: 'DECK' })
    );

    for (const effectId of ['305000055_start_exile', '305110061_start_face_down_exile']) {
      const query: EffectQuery = {
        id: `LOW_DECK_TRIGGER_${effectId}`,
        type: 'ASK_TRIGGER',
        playerUid: 'BOT_PLAYER',
        options: [],
        title: 'Optional blueprint start trigger',
        description: 'Optional blueprint start trigger',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'TRIGGER_CHOICE',
        context: { effectId },
      };
      const selections = ServerGameService.getBotQuerySelectionsForPlayer(state, 'BOT_PLAYER', query);
      assert(selections[0] === 'NO', `Expected ${effectId} to be declined at low deck, got ${selections.join(',') || 'none'}`);
    }
  },
}, {
  name: 'pure-yellow-steel does not spend its last deck card to play fortress blueprint',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 8;
    state.phase = 'MAIN';

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const fortressBlueprint = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.fortressBlueprint);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = [makeScenarioCard({ id: 'FORTRESS_LOW_DECK_FILLER', fullName: 'Last Deck Card', cardlocation: 'DECK' })];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    bot.hand.push(fortressBlueprint);
    putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
      id: 'FORTRESS_LOW_DECK_ATTACKER_A',
      fullName: 'Low Deck Attacker A',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 4000,
      basePower: 4000,
      damage: 4,
      baseDamage: 4,
      playedTurn: 0,
    }), 0);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const playLog = state.aiDecisionLogs?.find(log => log.action === 'PLAY_CARD');
    assert(!playLog, `Expected hard AI to hold fortress blueprint at one-card deck, got PLAY_CARD ${playLog?.subject || ''}`);
    assert(bot.hand.some(card => card.gamecardId === fortressBlueprint.gamecardId), 'Expected fortress blueprint to remain in hand');
    assert(bot.deck.length === 1, `Expected deck to remain at 1, got ${bot.deck.length}`);
  },
}, {
  name: 'pure-yellow-steel avoids deck payment that leaves too little deck under incoming attacks',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 9;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const puppetMaster = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.academyPuppetMaster);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [puppetMaster];
    bot.deck = Array.from({ length: 6 }, (_, index) =>
      makeScenarioCard({ id: `LOW_DECK_PAYMENT_BOT_DECK_${index}`, fullName: `Low Deck Payment Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    [1, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `LOW_DECK_PAYMENT_BLOCKER_${index}`,
        fullName: `Low Deck Payment Blocker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 2500,
        basePower: 2500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [4, 3, 2, 2].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `LOW_DECK_PAYMENT_ATTACKER_${index}`,
        fullName: `Low Deck Payment Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000 + index * 500,
        basePower: 3000 + index * 500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const playLog = state.aiDecisionLogs?.find(log => log.action === 'PLAY_CARD');
    assert(!playLog, `Expected pure yellow steel to hold the 3-cost unit at low deck, got PLAY_CARD ${playLog?.subject || ''}: ${JSON.stringify(playLog?.details || {})}`);
    assert(bot.hand.some(card => card.gamecardId === puppetMaster.gamecardId), 'Expected academy puppet master to remain in hand');
    assert(bot.deck.length === 6, `Expected deck to remain at 6, got ${bot.deck.length}`);
  },
}, {
  name: 'pure-yellow-steel applies adventurer matchup threshold to deck-payment plays',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 9;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    const adventurerProfile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing pure-yellow-steel profile');
    assert(adventurerProfile?.shareCode, 'Missing adventurer-guild profile share code');

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const lowValueUnit = makeScenarioCard({
      id: 'PYS_MATCHUP_THRESHOLD_LOW_VALUE_UNIT',
      fullName: 'Matchup Threshold Low Value Unit',
      type: 'UNIT',
      color: 'YELLOW',
      cardlocation: 'HAND',
      faction: 'Academy Fortress',
      acValue: 3,
      baseAcValue: 3,
      power: 1000,
      basePower: 1000,
      damage: 1,
      baseDamage: 1,
    });

    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [lowValueUnit];
    bot.deck = Array.from({ length: 15 }, (_, index) =>
      makeScenarioCard({ id: `PYS_MATCHUP_THRESHOLD_BOT_DECK_${index}`, fullName: `PYS Matchup Threshold Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.hand = [];
    opponent.deck = resolveDeck(adventurerProfile.shareCode).map((card, index) => ({
      ...card,
      gamecardId: `PYS_MATCHUP_THRESHOLD_ADVENTURER_DECK_${index}_${card.id}`,
      cardlocation: 'DECK',
    }));
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.itemZone = [null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'pure-yellow-steel',
      TEST_PLAYER: 'adventurer-guild',
    };
    (opponent as any).botDeckProfileId = 'adventurer-guild';

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.stopSelfDrawAtDeck === 16, `Expected adventurer matchup stopSelfDrawAtDeck 16, got ${plan.stopSelfDrawAtDeck}`);
    assert(plan.avoidSelfDraw === true, 'Expected pure-yellow-steel to avoid self deck payment at 15 cards against adventurer-guild');

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const playLog = state.aiDecisionLogs?.find(log => log.action === 'PLAY_CARD');
    assert(
      !playLog,
      `Expected pure yellow steel to hold low-value deck-payment play at matchup threshold, got ${playLog?.subject || ''}: ${JSON.stringify(playLog?.details || {})}`
    );
    assert(bot.hand.some(card => card.gamecardId === lowValueUnit.gamecardId), 'Expected low-value unit to remain in hand');
    assert(bot.deck.length === 15, `Expected deck to remain at 15, got ${bot.deck.length}`);
  },
}, {
  name: 'pure-yellow-steel holds high-value engine plays inside adventurer self-draw stop line',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 21;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    const adventurerProfile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing pure-yellow-steel profile');
    assert(adventurerProfile?.shareCode, 'Missing adventurer-guild profile share code');

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const analysisRoom = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.analysisRoom);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [analysisRoom];
    bot.deck = Array.from({ length: 9 }, (_, index) =>
      makeScenarioCard({ id: `PYS_ANALYSIS_HOLD_BOT_DECK_${index}`, fullName: `PYS Analysis Hold Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.hand = [];
    opponent.deck = resolveDeck(adventurerProfile.shareCode).map((card, index) => ({
      ...card,
      gamecardId: `PYS_ANALYSIS_HOLD_ADVENTURER_DECK_${index}_${card.id}`,
      cardlocation: 'DECK',
    }));
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.itemZone = [null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'pure-yellow-steel',
      TEST_PLAYER: 'adventurer-guild',
    };
    (opponent as any).botDeckProfileId = 'adventurer-guild';

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.stopSelfDrawAtDeck === 16, `Expected adventurer matchup stopSelfDrawAtDeck 16, got ${plan.stopSelfDrawAtDeck}`);
    assert(plan.avoidSelfDraw === true, 'Expected pure-yellow-steel to avoid self deck payment inside the adventurer stop line');

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const playLog = state.aiDecisionLogs?.find(log => log.action === 'PLAY_CARD');
    assert(
      !playLog,
      `Expected pure yellow steel to hold analysis room inside self-draw stop line, got ${playLog?.subject || ''}: ${JSON.stringify(playLog?.details || {})}`
    );
    assert(bot.hand.some(card => card.gamecardId === analysisRoom.gamecardId), 'Expected analysis room to remain in hand');
    assert(bot.deck.length === 9, `Expected deck to remain at 9, got ${bot.deck.length}`);
  },
}, {
  name: 'pure-yellow-steel skips low-deck blocker play when it still dies to incoming damage',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 12;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const researcher = makeScenarioCard({
      id: '105110402',
      fullName: 'Researcher',
      type: 'UNIT',
      color: 'YELLOW',
      cardlocation: 'HAND',
      faction: '学院要塞',
      acValue: 1,
      baseAcValue: 1,
      power: 1000,
      basePower: 1000,
      damage: 1,
      baseDamage: 1,
    });
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [researcher];
    bot.deck = Array.from({ length: 2 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_UNSAFE_BLOCKER_DECK_${index}`, fullName: `Steel Unsafe Blocker Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    [4, 3, 2].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_UNSAFE_BLOCKER_THREAT_${index}`,
        fullName: `Steel Unsafe Blocker Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3500,
        basePower: 3500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const playLog = state.aiDecisionLogs?.find(log => log.action === 'PLAY_CARD');
    assert(!playLog, `Expected pure yellow steel to skip unsafe low-deck blocker play, got PLAY_CARD ${playLog?.subject || ''}: ${JSON.stringify(playLog?.details || {})}`);
    assert(bot.hand.some(card => card.gamecardId === researcher.gamecardId), 'Expected researcher to remain in hand');
    assert(bot.deck.length === 2, `Expected deck to remain at 2, got ${bot.deck.length}`);
  },
}, {
  name: 'pure-yellow-steel avoids high-erosion deck payment when blockers already cover pressure',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 7;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const steelPuppet = takeCardById(state, 'BOT_PLAYER', '105000385');
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [steelPuppet];
    bot.deck = Array.from({ length: 18 }, (_, index) =>
      makeScenarioCard({ id: `HIGH_EROSION_PAYMENT_BOT_DECK_${index}`, fullName: `High Erosion Payment Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 5; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `HIGH_EROSION_PAYMENT_BOT_EROSION_${index}`,
        fullName: `High Erosion Payment Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [3, 2].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `HIGH_EROSION_PAYMENT_READY_BLOCKER_${index}`,
        fullName: `High Erosion Payment Ready Blocker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3500,
        basePower: 3500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [4, 3].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `HIGH_EROSION_PAYMENT_OPPONENT_THREAT_${index}`,
        fullName: `High Erosion Payment Opponent Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3500,
        basePower: 3500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const playLog = state.aiDecisionLogs?.find(log => log.action === 'PLAY_CARD');
    assert(!playLog, `Expected pure yellow steel to avoid pushing itself to critical erosion, got PLAY_CARD ${playLog?.subject || ''}: ${JSON.stringify(playLog?.details || {})}`);
    assert(bot.hand.some(card => card.gamecardId === steelPuppet.gamecardId), 'Expected steel puppet to remain in hand');
    assert(bot.deck.length === 18, `Expected deck to remain at 18, got ${bot.deck.length}`);
  },
}, {
  name: 'pure-yellow-steel avoids adventurer high-erosion overdevelopment',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 4;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const puppetMaster = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.academyPuppetMaster);
    const blueprintPainter = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter);
    const valkyrie = takeCardById(state, 'BOT_PLAYER', STEEL_VALKYRIE_CARD_ID);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [puppetMaster];
    bot.deck = Array.from({ length: 26 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_ADVENTURER_OVERDEVELOP_DECK_${index}`, fullName: `Steel Adventurer Overdevelop Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'pure-yellow-steel',
      TEST_PLAYER: 'adventurer-guild',
    };
    (opponent as any).botDeckProfileId = 'adventurer-guild';

    for (let index = 0; index < 5; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_ADVENTURER_OVERDEVELOP_EROSION_${index}`,
        fullName: `Steel Adventurer Overdevelop Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    putUnitForScenario(state, 'BOT_PLAYER', blueprintPainter, 0);
    putUnitForScenario(state, 'BOT_PLAYER', valkyrie, 1);

    [
      { id: ADVENTURER_GUILD_CARD_IDS.batra, name: 'Adventurer Batra Pressure', damage: 4, power: 3500 },
      { id: ADVENTURER_GUILD_CARD_IDS.albert, name: 'Adventurer Albert Pressure', damage: 2, power: 3000 },
      { id: ADVENTURER_GUILD_CARD_IDS.xiaoting, name: 'Adventurer Xiaoting Pressure', damage: 1, power: 1500 },
    ].forEach((threat, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: threat.id,
        fullName: threat.name,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: threat.power,
        basePower: threat.power,
        damage: threat.damage,
        baseDamage: threat.damage,
        playedTurn: 0,
      }), index);
    });

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const playLog = state.aiDecisionLogs?.find(log => log.action === 'PLAY_CARD');
    assert(!playLog, `Expected pure yellow steel to avoid high-erosion overdevelopment against adventurer, got PLAY_CARD ${playLog?.subject || ''}: ${JSON.stringify(playLog?.details || {})}`);
    assert(bot.hand.some(card => card.gamecardId === puppetMaster.gamecardId), 'Expected academy puppet master to remain in hand');
    assert(bot.deck.length === 26, `Expected deck to remain at 26, got ${bot.deck.length}`);
    assert(bot.erosionFront.filter(Boolean).length + bot.erosionBack.filter(Boolean).length === 5, 'Expected erosion to stay below the high-risk line');
  },
}, {
  name: 'pure-yellow-steel preserves deck instead of tempo recovery under sustained pressure',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 7;
    state.phase = 'EROSION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const steelPuppet = takeCardById(state, 'BOT_PLAYER', '105000385');
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = Array.from({ length: 4 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_EROSION_PRESSURE_HAND_${index}`, fullName: `Steel Erosion Pressure Hand ${index}`, cardlocation: 'HAND' })
    );
    bot.deck = Array.from({ length: 15 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_EROSION_PRESSURE_DECK_${index}`, fullName: `Steel Erosion Pressure Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    putErosionFrontForScenario(state, 'BOT_PLAYER', steelPuppet, 0);
    putErosionBackForScenario(state, 'BOT_PLAYER', makeScenarioCard({
      id: 'STEEL_EROSION_PRESSURE_BACK',
      fullName: 'Steel Erosion Pressure Back',
      cardlocation: 'EROSION_BACK',
    }), 0);
    putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
      id: 'STEEL_EROSION_PRESSURE_READY_BLOCKER',
      fullName: 'Steel Erosion Pressure Ready Blocker',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3500,
      basePower: 3500,
      damage: 1,
      baseDamage: 1,
      playedTurn: 0,
    }), 0);
    [3, 2, 2].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_EROSION_PRESSURE_ATTACKER_${index}`,
        fullName: `Steel Erosion Pressure Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000 + index * 500,
        basePower: 3000 + index * 500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const erosionLog = state.aiDecisionLogs?.find(log => log.action === 'EROSION_CHOICE');
    assert(erosionLog?.subject === 'A', `Expected pure yellow steel to choose erosion A under sustained pressure, got ${erosionLog?.subject || 'none'}`);
    assert(erosionLog?.details?.erosionReason === 'preserve deck and back erosion under incoming attack pressure', `Expected pressure preservation reason, got ${erosionLog?.details?.erosionReason || 'none'}`);
    assert(bot.deck.length === 15, `Expected erosion A not to spend deck at 15-card pressure point, got deck ${bot.deck.length}`);
    assert(!bot.hand.some(card => card.gamecardId === steelPuppet.gamecardId), 'Expected steel puppet not to be recovered when deck preservation is more important');
  },
}, {
  name: 'pure-yellow-steel avoids spending entire deck on non-rush development in a blockable raw lethal window',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure-yellow-steel profile');

    state.turnCount = 10;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const defenseMechanism = takeCardById(state, 'BOT_PLAYER', '105110386');
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [defenseMechanism];
    bot.deck = Array.from({ length: 5 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_SELF_DECK_OUT_BOT_DECK_${index}`, fullName: `Steel Self Deck Out Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 4 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_SELF_DECK_OUT_OPPONENT_DECK_${index}`, fullName: `Steel Self Deck Out Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    [3, 2].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_SELF_DECK_OUT_ATTACKER_${index}`,
        fullName: `Steel Self Deck Out Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3500,
        basePower: 3500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });
    putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
      id: 'STEEL_SELF_DECK_OUT_READY_DEFENDER',
      fullName: 'Steel Self Deck Out Ready Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 4000,
      basePower: 4000,
      damage: 0,
      baseDamage: 0,
      playedTurn: 0,
    }), 0);

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.lethalWindow === true, 'Expected raw deck lethal to be visible before blockers are considered');
    assert(plan.damageThroughLikelyDefenders < plan.damageToCritical, 'Expected the ready defender to make the raw lethal blockable');
    assert(plan.attackBeforeDeveloping === false, 'Expected pre-combat defense mechanism sequencing to be considered before the self-deck-out guard');

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const playLog = state.aiDecisionLogs?.find(log => log.action === 'PLAY_CARD');
    assert(!playLog, `Expected pure yellow steel not to spend all 5 deck cards on ${defenseMechanism.fullName}, got PLAY_CARD ${playLog?.subject || ''}: ${JSON.stringify(playLog?.details || {})}`);
    assert(bot.hand.some(card => card.gamecardId === defenseMechanism.gamecardId), 'Expected defense mechanism to remain in hand');
    assert(bot.deck.length === 5, `Expected deck to remain at 5, got ${bot.deck.length}`);
    const battleLog = state.aiDecisionLogs?.find(log => log.action === 'ENTER_BATTLE');
    assert(battleLog, 'Expected hard AI to advance after declining the unsafe development');
  },
}, {
  name: 'pure-yellow-steel healing apprentice declares the real top-deck name',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const bot = state.players.BOT_PLAYER;
    const wrongCard = makeScenarioCard({ id: 'HEALING_WRONG', fullName: 'Wrong Declaration', cardlocation: 'DECK' });
    const topCard = makeScenarioCard({ id: 'HEALING_TOP', fullName: 'Correct Declaration', type: 'STORY', cardlocation: 'DECK' });
    bot.deck = [wrongCard, topCard];

    const query: EffectQuery = {
      id: 'HEALING_DECLARE_QUERY',
      type: 'SELECT_CHOICE',
      playerUid: 'BOT_PLAYER',
      options: [
        { id: wrongCard.fullName, label: wrongCard.fullName, card: wrongCard },
        { id: topCard.fullName, label: topCard.fullName, card: topCard },
      ],
      title: 'Declare name',
      description: 'Choose a card name.',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: { effectId: '105110108_activate', step: 'DECLARE_NAME' },
    };

    const selections = querySelection(state, query);
    assert(selections[0] === topCard.fullName, `Expected healing apprentice to declare ${topCard.fullName}, got ${selections.join(',') || 'none'}`);
  },
}, {
  name: 'pure-yellow-steel healing apprentice recycles godmark and story cards first',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const lowUnit = makeScenarioCard({ id: 'HEALING_LOW_UNIT', fullName: 'Low Unit', type: 'UNIT', cardlocation: 'GRAVE', acValue: 1, power: 1000, damage: 1 });
    const story = makeScenarioCard({ id: 'HEALING_STORY', fullName: 'Key Story', type: 'STORY', cardlocation: 'GRAVE', acValue: 2 });
    const godmark = makeScenarioCard({ id: 'HEALING_GODMARK', fullName: 'Key Godmark', type: 'UNIT', cardlocation: 'GRAVE', acValue: 4, power: 3500, damage: 2, godMark: true });
    state.players.BOT_PLAYER.grave = [lowUnit, story, godmark];

    const query: EffectQuery = {
      id: 'HEALING_RECYCLE_QUERY',
      type: 'SELECT_CARD',
      playerUid: 'BOT_PLAYER',
      options: [lowUnit, story, godmark].map(card => ({ card, id: card.gamecardId, source: 'GRAVE' })),
      title: 'Recycle grave cards',
      description: 'Choose two cards from grave.',
      minSelections: 2,
      maxSelections: 2,
      callbackKey: 'EFFECT_RESOLVE',
      context: { effectId: '105110108_activate', step: 'SELECT_GRAVE' },
    };

    const selections = querySelection(state, query);
    assert(selections.includes(godmark.gamecardId), 'Expected healing apprentice to recycle godmark card');
    assert(selections.includes(story.gamecardId), 'Expected healing apprentice to recycle story card');
    assert(!selections.includes(lowUnit.gamecardId), 'Expected healing apprentice to leave low unit in grave');
  },
}, {
  name: 'pure-yellow-steel otherworld fantasy prefers exile mode and most-common key target',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const opponent = state.players.TEST_PLAYER;
    const rareTarget = makeScenarioCard({ id: 'OTHERWORLD_RARE', fullName: 'Rare Target', type: 'UNIT', cardlocation: 'GRAVE', acValue: 3, power: 3000 });
    const commonTarget = makeScenarioCard({ id: 'OTHERWORLD_COMMON', fullName: 'Common Target', type: 'STORY', cardlocation: 'GRAVE', acValue: 4 });
    opponent.grave = [rareTarget, commonTarget];
    opponent.deck = [
      makeScenarioCard({ id: 'OTHERWORLD_RARE', fullName: rareTarget.fullName, cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'OTHERWORLD_COMMON', fullName: commonTarget.fullName, cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'OTHERWORLD_COMMON', fullName: commonTarget.fullName, cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'OTHERWORLD_COMMON', fullName: commonTarget.fullName, cardlocation: 'DECK' }),
    ];

    const modeQuery: EffectQuery = {
      id: 'OTHERWORLD_MODE_QUERY',
      type: 'SELECT_CHOICE',
      playerUid: 'BOT_PLAYER',
      options: [
        { id: 'MILL_DECK_SAME_NAME', label: 'Mill same name' },
        { id: 'EXILE_ALL_SAME_NAME', label: 'Exile all same name' },
      ],
      title: 'Choose mode',
      description: 'Choose otherworld fantasy mode.',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'DECLARE_EFFECT_TARGET_MODE',
      context: { effectId: '205000117_otherworld_fantasy' },
    };
    const modeSelections = querySelection(state, modeQuery);
    assert(modeSelections[0] === 'EXILE_ALL_SAME_NAME', `Expected exile mode, got ${modeSelections.join(',') || 'none'}`);

    const targetQuery: EffectQuery = {
      id: 'OTHERWORLD_TARGET_QUERY',
      type: 'SELECT_CARD',
      playerUid: 'BOT_PLAYER',
      options: [rareTarget, commonTarget].map(card => ({ card, id: card.gamecardId, source: 'GRAVE', isMine: false })),
      title: 'Choose opponent grave card',
      description: 'Choose one non-godmark card in opponent grave.',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'DECLARE_EFFECT_TARGETS',
      context: { effectId: '205000117_otherworld_fantasy', step: 'TARGET', modeId: 'EXILE_ALL_SAME_NAME' },
    };
    const targetSelections = querySelection(state, targetQuery);
    assert(targetSelections[0] === commonTarget.gamecardId, `Expected most-common target, got ${targetSelections.join(',') || 'none'}`);
  },
}, {
  name: 'pure-yellow-steel high alchemy sends low-cost non-key units first',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const lowOne = makeScenarioCard({ id: 'ALCHEMY_LOW_ONE', fullName: 'Low One', type: 'UNIT', cardlocation: 'UNIT', acValue: 1, power: 500, damage: 0 });
    const lowTwo = makeScenarioCard({ id: 'ALCHEMY_LOW_TWO', fullName: 'Low Two', type: 'UNIT', cardlocation: 'UNIT', acValue: 2, power: 1000, damage: 0 });
    const exhaustedLow = makeScenarioCard({ id: 'ALCHEMY_LOW_THREE', fullName: 'Exhausted Low', type: 'UNIT', cardlocation: 'UNIT', acValue: 1, power: 1500, damage: 1, isExhausted: true });
    const keyGodmark = makeScenarioCard({ id: 'ALCHEMY_KEY_GODMARK', fullName: 'Key Godmark', type: 'UNIT', cardlocation: 'UNIT', acValue: 4, power: 4000, damage: 2, godMark: true });
    const highCost = makeScenarioCard({ id: 'ALCHEMY_HIGH_COST', fullName: 'High Cost', type: 'UNIT', cardlocation: 'UNIT', acValue: 5, power: 5000, damage: 3 });

    const candidates = [keyGodmark, highCost, lowOne, lowTwo, exhaustedLow];
    const query: EffectQuery = {
      id: 'HIGH_ALCHEMY_SEND_QUERY',
      type: 'SELECT_CARD',
      playerUid: 'BOT_PLAYER',
      options: candidates.map(card => ({ card, id: card.gamecardId, source: 'UNIT', isMine: true })),
      title: 'Choose units to send',
      description: 'Choose three units to send to grave.',
      minSelections: 3,
      maxSelections: 3,
      callbackKey: 'DECLARE_EFFECT_TARGETS',
      context: { effectId: '305000073_activate', step: 'SEND_UNITS' },
    };

    const selections = querySelection(state, query);
    for (const card of [lowOne, lowTwo, exhaustedLow]) {
      assert(selections.includes(card.gamecardId), `Expected high alchemy to send ${card.fullName}`);
    }
    assert(!selections.includes(keyGodmark.gamecardId), 'Expected high alchemy to preserve key godmark unit');
    assert(!selections.includes(highCost.gamecardId), 'Expected high alchemy to preserve high-cost unit');
  },
}, {
  name: 'pure-yellow-steel story high alchemy preserves key godmark materials',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const lowOne = makeScenarioCard({ id: 'STORY_ALCHEMY_LOW_ONE', fullName: 'Story Low One', type: 'UNIT', cardlocation: 'UNIT', acValue: 1, power: 500, damage: 0 });
    const lowTwo = makeScenarioCard({ id: 'STORY_ALCHEMY_LOW_TWO', fullName: 'Story Low Two', type: 'UNIT', cardlocation: 'UNIT', acValue: 2, power: 1000, damage: 0 });
    const keyGodmark = makeScenarioCard({ id: 'STORY_ALCHEMY_KEY_GODMARK', fullName: 'Story Key Godmark', type: 'UNIT', cardlocation: 'UNIT', acValue: 4, power: 4000, damage: 2, godMark: true });
    const highCost = makeScenarioCard({ id: 'STORY_ALCHEMY_HIGH_COST', fullName: 'Story High Cost', type: 'UNIT', cardlocation: 'UNIT', acValue: 5, power: 5000, damage: 3 });

    const candidates = [keyGodmark, highCost, lowOne, lowTwo];
    const query: EffectQuery = {
      id: 'STORY_HIGH_ALCHEMY_SEND_QUERY',
      type: 'SELECT_CARD',
      playerUid: 'BOT_PLAYER',
      options: candidates.map(card => ({ card, id: card.gamecardId, source: 'UNIT', isMine: true })),
      title: 'Choose high alchemy materials',
      description: 'Choose two own field cards to send to grave.',
      minSelections: 2,
      maxSelections: 2,
      callbackKey: 'DECLARE_EFFECT_TARGETS',
      context: { effectId: '205000103_high_alchemy', step: 'SEND_FIELD' },
    };

    const selections = querySelection(state, query);
    assert(selections.includes(lowOne.gamecardId), 'Expected story high alchemy to send the 1-cost low-value unit');
    assert(selections.includes(lowTwo.gamecardId), 'Expected story high alchemy to send the 2-cost low-value unit');
    assert(!selections.includes(keyGodmark.gamecardId), 'Expected story high alchemy to preserve key godmark unit');
    assert(!selections.includes(highCost.gamecardId), 'Expected story high alchemy to preserve high-cost unit');
  },
}, {
  name: 'pure-yellow-steel alchemist high alchemy uses low-value hand and field materials',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const lowField = makeScenarioCard({ id: 'ALCHEMIST_ALCHEMY_LOW_FIELD', fullName: 'Alchemist Low Field', type: 'UNIT', cardlocation: 'UNIT', acValue: 1, power: 500, damage: 0 });
    const lowHand = makeScenarioCard({ id: 'ALCHEMIST_ALCHEMY_LOW_HAND', fullName: 'Alchemist Low Hand', type: 'UNIT', cardlocation: 'HAND', acValue: 1, power: 1000, damage: 0 });
    const lowItem = makeScenarioCard({ id: 'ALCHEMIST_ALCHEMY_LOW_ITEM', fullName: 'Alchemist Low Item', type: 'ITEM', cardlocation: 'ITEM', acValue: 2, power: 0, damage: 0 });
    const keyGodmark = makeScenarioCard({ id: 'ALCHEMIST_ALCHEMY_KEY_GODMARK', fullName: 'Alchemist Key Godmark', type: 'UNIT', cardlocation: 'UNIT', acValue: 4, power: 4000, damage: 2, godMark: true });
    const highCost = makeScenarioCard({ id: 'ALCHEMIST_ALCHEMY_HIGH_COST', fullName: 'Alchemist High Cost', type: 'UNIT', cardlocation: 'UNIT', acValue: 5, power: 5000, damage: 3 });

    const candidates = [keyGodmark, highCost, lowField, lowHand, lowItem];
    const query: EffectQuery = {
      id: 'ALCHEMIST_HIGH_ALCHEMY_COST_QUERY',
      type: 'SELECT_CARD',
      playerUid: 'BOT_PLAYER',
      options: candidates.map(card => ({ card, id: card.gamecardId, source: card.cardlocation, isMine: true })),
      title: 'Choose alchemist materials',
      description: 'Choose three own field or hand cards to send to grave.',
      minSelections: 3,
      maxSelections: 3,
      callbackKey: 'DECLARE_EFFECT_TARGETS',
      context: { effectId: '105110404_high_alchemy_put_unit', step: 'COST' },
    };

    const selections = querySelection(state, query);
    for (const card of [lowField, lowHand, lowItem]) {
      assert(selections.includes(card.gamecardId), `Expected alchemist high alchemy to send ${card.fullName}`);
    }
    assert(!selections.includes(keyGodmark.gamecardId), 'Expected alchemist high alchemy to preserve key godmark unit');
    assert(!selections.includes(highCost.gamecardId), 'Expected alchemist high alchemy to preserve high-cost unit');
  },
}, {
  name: 'pure-yellow-steel fortress blueprint searches defense mechanism into wide non-god boards',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const opponent = state.players.TEST_PLAYER;
    const defenseMechanism = takeCardById(state, 'BOT_PLAYER', '105110386');
    const valkyrie = takeCardById(state, 'BOT_PLAYER', '105110351');
    const steelPuppet = takeCardById(state, 'BOT_PLAYER', '105000385');
    const candidates = [valkyrie, steelPuppet, defenseMechanism];
    candidates.forEach(card => {
      card.cardlocation = 'DECK';
    });

    opponent.unitZone = [null, null, null, null, null, null];
    [0, 1, 2].forEach(index => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `FORTRESS_BLUEPRINT_OPPONENT_NON_GOD_${index}`,
        fullName: `Fortress Blueprint Opponent Non God ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 2500 + index * 500,
        basePower: 2500 + index * 500,
        damage: 2,
        baseDamage: 2,
        godMark: false,
      }), index);
    });

    const query: EffectQuery = {
      id: 'FORTRESS_BLUEPRINT_PUT_UNIT_QUERY',
      type: 'SELECT_CARD',
      playerUid: 'BOT_PLAYER',
      options: candidates.map(card => ({ card, id: card.gamecardId, source: 'DECK', isMine: true })),
      title: 'Choose fortress blueprint unit',
      description: 'Choose one ACCESS 4+ Academy Fortress unit from deck.',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: { effectId: '305110061_end_fortress_blueprint', step: 'PUT_UNIT' },
    };

    const selections = querySelection(state, query);
    assert(selections[0] === defenseMechanism.gamecardId, `Expected fortress blueprint to choose defense mechanism, got ${selections.join(',') || 'none'}`);
  },
}, {
  name: 'pure-yellow-steel keeps defense mechanism in deck when cheat drawing for early defense',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure yellow steel profile');

    state.turnCount = 4;
    state.phase = 'DRAW';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    for (let index = 0; index < 5; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_CHEAT_DRAW_BOT_EROSION_${index}`,
        fullName: `Steel Cheat Draw Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    [3, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_CHEAT_DRAW_THREAT_${index}`,
        fullName: `Steel Cheat Draw Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000,
        basePower: 3000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    const defenseMechanism = takeCardById(state, 'BOT_PLAYER', '105110386');
    const puppetMaster = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.academyPuppetMaster);
    defenseMechanism.cardlocation = 'DECK';
    puppetMaster.cardlocation = 'DECK';
    bot.deck = [
      makeScenarioCard({ id: 'STEEL_CHEAT_DRAW_FILLER_A', fullName: 'Steel Cheat Draw Filler A', cardlocation: 'DECK' }),
      defenseMechanism,
      puppetMaster,
      makeScenarioCard({ id: 'STEEL_CHEAT_DRAW_FILLER_B', fullName: 'Steel Cheat Draw Filler B', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'STEEL_CHEAT_DRAW_FILLER_C', fullName: 'Steel Cheat Draw Filler C', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'STEEL_CHEAT_DRAW_FILLER_D', fullName: 'Steel Cheat Draw Filler D', cardlocation: 'DECK' }),
    ];

    const result = chooseCheatDrawCard(state, bot, profile);
    const selected = result?.selected;
    assert(selected?.id !== '105110386', 'Expected cheat draw not to pull defense mechanism when it cannot be played from hand');
    assert(
      selected?.id === PURE_YELLOW_STEEL_CARD_IDS.academyPuppetMaster,
      `Expected cheat draw to prefer a playable engine unit, got ${selected?.fullName || 'none'}`
    );
  },
}, {
  name: 'adventurer-guild preserves deck by avoiding erosion choice C under incoming pressure',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 13;
    state.phase = 'EROSION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);

    bot.hand = [makeScenarioCard({ id: 'ADVENTURER_LOW_DECK_HAND', fullName: 'Low Deck Hand Card', cardlocation: 'HAND' })];
    bot.deck = Array.from({ length: 11 }, (_, index) =>
      makeScenarioCard({ id: `ADVENTURER_LOW_DECK_${index}`, fullName: `Adventurer Low Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    putErosionFrontForScenario(state, 'BOT_PLAYER', batra, 0);
    for (let index = 1; index < 5; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `ADVENTURER_LOW_DECK_FRONT_${index}`,
        fullName: `Adventurer Low Deck Front ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    for (let index = 0; index < 5; index++) {
      putErosionBackForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `ADVENTURER_LOW_DECK_BACK_${index}`,
        fullName: `Adventurer Low Deck Back ${index}`,
        cardlocation: 'EROSION_BACK',
      }), index);
    }
    for (let index = 0; index < 3; index++) {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `ADVENTURER_LOW_DECK_ATTACKER_${index}`,
        fullName: `Incoming Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage: index === 0 ? 4 : 3,
        baseDamage: index === 0 ? 4 : 3,
      }), index);
    }

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const erosionLog = state.aiDecisionLogs?.find(log => log.action === 'EROSION_CHOICE');
    assert(erosionLog?.subject === 'A', `Expected Adventurer to choose erosion A under deck pressure, got ${erosionLog?.subject || 'none'}`);
    assert(erosionLog?.details?.erosionReason === 'preserve deck and back erosion under incoming attack pressure', `Expected pressure preservation reason, got ${erosionLog?.details?.erosionReason || 'none'}`);
    assert(bot.deck.length === 11, `Expected erosion A not to spend another deck card, got deck ${bot.deck.length}`);
    assert(!bot.hand.some(card => card.gamecardId === batra.gamecardId), 'Expected Batra not to be recovered to hand when preserving deck');
  },
}, {
  name: 'adventurer-guild avoids low-deck high-value erosion recovery when it cannot become a blocker',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 10;
    state.phase = 'EROSION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const hammo = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.hammo);

    bot.hand = [
      makeScenarioCard({ id: 'ADVENTURER_LOW_DECK_HAND_A', fullName: 'Low Deck Hand A', cardlocation: 'HAND' }),
      makeScenarioCard({ id: 'ADVENTURER_LOW_DECK_HAND_B', fullName: 'Low Deck Hand B', cardlocation: 'HAND' }),
    ];
    bot.deck = Array.from({ length: 5 }, (_, index) =>
      makeScenarioCard({ id: `ADVENTURER_NO_BLOCKER_DECK_${index}`, fullName: `Adventurer No Blocker Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    putErosionFrontForScenario(state, 'BOT_PLAYER', hammo, 0);
    for (let index = 1; index < 6; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `ADVENTURER_NO_BLOCKER_FRONT_${index}`,
        fullName: `Adventurer No Blocker Front ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    for (let index = 0; index < 4; index++) {
      putErosionBackForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `ADVENTURER_NO_BLOCKER_BACK_${index}`,
        fullName: `Adventurer No Blocker Back ${index}`,
        cardlocation: 'EROSION_BACK',
      }), index);
    }
    [4, 4, 3].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `ADVENTURER_NO_BLOCKER_ATTACKER_${index}`,
        fullName: `No Blocker Incoming Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
      }), index);
    });

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const erosionLog = state.aiDecisionLogs?.find(log => log.action === 'EROSION_CHOICE');
    assert(erosionLog?.subject === 'A', `Expected Adventurer to preserve deck instead of recovering non-playable Hammo, got ${erosionLog?.subject || 'none'}`);
    assert(erosionLog?.details?.erosionReason === 'low deck: send face-up erosion cards to grave without spending another deck card', `Expected low deck preservation reason, got ${erosionLog?.details?.erosionReason || 'none'}`);
    assert(bot.deck.length === 5, `Expected erosion A not to spend deck, got deck ${bot.deck.length}`);
    assert(!bot.hand.some(card => card.gamecardId === hammo.gamecardId), 'Expected Hammo not to be recovered when it cannot become a blocker');
  },
}, {
  name: 'adventurer-guild preserves deck under low-deck pressure even with few back erosion cards',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 9;
    state.phase = 'EROSION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    (bot as any).factionLock = 'ADVENTURER_GUILD_TEST';
    const seliya = makeScenarioCard({
      id: '102050090',
      fullName: '第二王女「赛利亚」',
      type: 'UNIT',
      cardlocation: 'EROSION_FRONT',
      faction: 'OFF_FACTION',
      acValue: 4,
      baseAcValue: 4,
      power: 3500,
      basePower: 3500,
      damage: 2,
      baseDamage: 2,
      godMark: true,
      baseGodMark: true,
    });

    bot.hand = [makeScenarioCard({ id: 'ADVENTURER_PRESSURE_HAND', fullName: 'Pressure Hand Card', cardlocation: 'HAND' })];
    bot.deck = Array.from({ length: 7 }, (_, index) =>
      makeScenarioCard({ id: `ADVENTURER_LOW_BACK_DECK_${index}`, fullName: `Adventurer Low Back Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    putErosionFrontForScenario(state, 'BOT_PLAYER', seliya, 0);
    for (let index = 1; index < 5; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `ADVENTURER_LOW_BACK_FRONT_${index}`,
        fullName: `Adventurer Low Back Front ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    putErosionBackForScenario(state, 'BOT_PLAYER', makeScenarioCard({
      id: 'ADVENTURER_LOW_BACK_SINGLE',
      fullName: 'Adventurer Low Back Single',
      cardlocation: 'EROSION_BACK',
    }), 0);
    [4, 4, 3].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `ADVENTURER_LOW_BACK_ATTACKER_${index}`,
        fullName: `Low Back Incoming Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
      }), index);
    });

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const erosionLog = state.aiDecisionLogs?.find(log => log.action === 'EROSION_CHOICE');
    assert(erosionLog?.subject === 'A', `Expected Adventurer to choose erosion A under low-deck pressure, got ${erosionLog?.subject || 'none'}`);
    assert(erosionLog?.details?.erosionReason === 'preserve deck and back erosion under incoming attack pressure', `Expected pressure preservation reason, got ${erosionLog?.details?.erosionReason || 'none'}`);
    assert(bot.deck.length === 7, `Expected erosion A not to spend deck at low back erosion, got deck ${bot.deck.length}`);
    assert(!bot.hand.some(card => card.gamecardId === seliya.gamecardId), 'Expected Seliya not to be recovered when deck preservation is more important');
  },
}, {
  name: 'adventurer-guild cheat draw prefers an immediately playable blocker at low deck',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');
    state.turnCount = 8;
    state.phase = 'DRAW';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    for (let index = 0; index < 4; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `ADVENTURER_DRAW_BLOCKER_EROSION_${index}`,
        fullName: `Adventurer Draw Blocker Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    [4, 4].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `ADVENTURER_DRAW_BLOCKER_ATTACKER_${index}`,
        fullName: `Draw Blocker Incoming Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
      }), index);
    });

    const sodo = makeScenarioCard({
      id: ADVENTURER_GUILD_CARD_IDS.sodo,
      fullName: 'High Cost Sodo',
      type: 'UNIT',
      cardlocation: 'DECK',
      acValue: 5,
      baseAcValue: 5,
      power: 3500,
      basePower: 3500,
      damage: 2,
      baseDamage: 2,
      colorReq: {},
      baseColorReq: {},
    });
    const batra = makeScenarioCard({
      id: ADVENTURER_GUILD_CARD_IDS.batra,
      fullName: 'Low Cost Batra',
      type: 'UNIT',
      cardlocation: 'DECK',
      acValue: 2,
      baseAcValue: 2,
      power: 3000,
      basePower: 3000,
      damage: 3,
      baseDamage: 3,
      colorReq: {},
      baseColorReq: {},
    });
    bot.deck = [
      sodo,
      batra,
      makeScenarioCard({ id: 'ADVENTURER_DRAW_FILLER_A', fullName: 'Draw Filler A', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'ADVENTURER_DRAW_FILLER_B', fullName: 'Draw Filler B', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'ADVENTURER_DRAW_FILLER_C', fullName: 'Draw Filler C', cardlocation: 'DECK' }),
    ];

    const result = chooseCheatDrawCard(state, bot, profile, bot.deck);
    assert(result?.selected?.gamecardId === batra.gamecardId, `Expected cheat draw to choose playable Batra, got ${result?.selected?.fullName || 'none'}`);
    const sodoCandidate = result.candidates.find(candidate => candidate.card.gamecardId === sodo.gamecardId);
    assert(sodoCandidate?.notes.some(note => note === 'not immediately playable as blocker'), 'Expected Sodo to be marked as not immediately playable');
  },
}, {
  name: 'adventurer-guild cheat draw skips fair trade for a real low-deck blocker',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');
    state.turnCount = 13;
    state.phase = 'DRAW';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const fairTrade = takeCardById(state, 'BOT_PLAYER', '204020023');
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 14 }, (_, index) =>
      makeScenarioCard({ id: `ADVENTURER_FAIR_TRADE_OPPONENT_DECK_${index}`, fullName: `Fair Trade Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'adventurer-guild',
      TEST_PLAYER: 'pure-yellow-steel',
    };
    (opponent as any).botDeckProfileId = 'pure-yellow-steel';

    for (let index = 0; index < 5; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `ADVENTURER_FAIR_TRADE_EROSION_${index}`,
        fullName: `Fair Trade Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    [4, 4, 3].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `ADVENTURER_FAIR_TRADE_ATTACKER_${index}`,
        fullName: `Fair Trade Incoming Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
      }), index);
    });

    const batra = makeScenarioCard({
      id: ADVENTURER_GUILD_CARD_IDS.batra,
      fullName: 'Low Deck Batra Blocker',
      type: 'UNIT',
      cardlocation: 'DECK',
      colorReq: {},
      baseColorReq: {},
      acValue: 2,
      baseAcValue: 2,
      power: 3000,
      basePower: 3000,
      damage: 3,
      baseDamage: 3,
    });
    fairTrade.cardlocation = 'DECK';
    bot.deck = [
      fairTrade,
      batra,
      makeScenarioCard({ id: 'ADVENTURER_FAIR_TRADE_FILLER_A', fullName: 'Fair Trade Filler A', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'ADVENTURER_FAIR_TRADE_FILLER_B', fullName: 'Fair Trade Filler B', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'ADVENTURER_FAIR_TRADE_FILLER_C', fullName: 'Fair Trade Filler C', cardlocation: 'DECK' }),
    ];

    const result = chooseCheatDrawCard(state, bot, profile, bot.deck);
    assert(result?.selected?.gamecardId === batra.gamecardId, `Expected cheat draw to choose Batra over fair trade, got ${result?.selected?.fullName || 'none'}`);
    const fairTradeCandidate = result.candidates.find(candidate => candidate.card.gamecardId === fairTrade.gamecardId);
    assert(
      fairTradeCandidate?.notes.some(note => note === 'fair trade held at low deck defense'),
      `Expected fair trade low-deck defense note, got ${fairTradeCandidate?.notes.join(',') || 'none'}`
    );
  },
}, {
  name: 'adventurer-guild cheat draw skips color-locked Batra when an urgent blocker is needed',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');
    state.turnCount = 6;
    state.phase = 'DRAW';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    [4, 3, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `ADVENTURER_COLOR_LOCK_ATTACKER_${index}`,
        fullName: `Color Lock Incoming Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000 + index * 500,
        basePower: 3000 + index * 500,
        damage,
        baseDamage: damage,
      }), index);
    });

    const colorLockedBatra = makeScenarioCard({
      id: ADVENTURER_GUILD_CARD_IDS.batra,
      fullName: 'Color Locked Batra',
      type: 'UNIT',
      cardlocation: 'DECK',
      color: 'BLUE',
      colorReq: { BLUE: 1 },
      baseColorReq: { BLUE: 1 },
      acValue: 2,
      baseAcValue: 2,
      power: 3000,
      basePower: 3000,
      damage: 3,
      baseDamage: 3,
    });
    const playableBlocker = makeScenarioCard({
      id: 'ADVENTURER_PLAYABLE_URGENT_BLOCKER',
      fullName: 'Playable Urgent Blocker',
      type: 'UNIT',
      cardlocation: 'DECK',
      colorReq: {},
      baseColorReq: {},
      acValue: 1,
      baseAcValue: 1,
      power: 2500,
      basePower: 2500,
      damage: 1,
      baseDamage: 1,
    });
    bot.deck = [
      colorLockedBatra,
      playableBlocker,
      makeScenarioCard({ id: 'ADVENTURER_COLOR_LOCK_FILLER_A', fullName: 'Color Lock Filler A', cardlocation: 'DECK' }),
      makeScenarioCard({ id: 'ADVENTURER_COLOR_LOCK_FILLER_B', fullName: 'Color Lock Filler B', cardlocation: 'DECK' }),
    ];

    const result = chooseCheatDrawCard(state, bot, profile, bot.deck);
    assert(result?.selected?.gamecardId === playableBlocker.gamecardId, `Expected cheat draw to choose the immediately playable blocker, got ${result?.selected?.fullName || 'none'}`);
    const batraCandidate = result.candidates.find(candidate => candidate.card.gamecardId === colorLockedBatra.gamecardId);
    assert(batraCandidate?.notes.some(note => note === 'cannot cover urgent blocker need'), 'Expected color-locked Batra to be marked as unable to cover urgent blocker need');
  },
}, {
  name: 'hard AI counts four required blockers against wide lethal attacks',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');

    state.turnCount = 10;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.hand = [];
    bot.deck = Array.from({ length: 13 }, (_, index) =>
      makeScenarioCard({ id: `WIDE_LETHAL_BOT_DECK_${index}`, fullName: `Wide Lethal Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    for (let index = 0; index < 6; index++) {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `WIDE_LETHAL_BLOCKER_${index}`,
        fullName: `Wide Lethal Blocker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 2500,
        basePower: 2500,
        damage: 1,
        baseDamage: 1,
      }), index);
    }

    for (let index = 0; index < 5; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `WIDE_LETHAL_EROSION_${index}`,
        fullName: `Wide Lethal Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [4, 4, 3, 3, 3, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `WIDE_LETHAL_ATTACKER_${index}`,
        fullName: `Wide Lethal Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
      }), index);
    });

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.defendersNeededNextTurn >= 4, `Expected at least 4 blockers needed against wide lethal attacks, got ${plan.defendersNeededNextTurn}`);
    assert(plan.reserveDefenders >= 4, `Expected hard AI to reserve at least 4 blockers against wide lethal attacks, got ${plan.reserveDefenders}`);
    assert(plan.attackBeforeDeveloping === false, 'Expected hard AI not to attack before stabilizing against wide lethal attacks');
    assert(plan.opponentLethalWithoutBlocks === true, 'Expected wide attacks to be recognized as incoming lethal');
  },
}, {
  name: 'adventurer-guild batra attacks into a 3000 ready defender when swap line is available',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');

    state.turnCount = 3;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.unitZone = [null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    bot.hand = [];
    opponent.unitZone = [null, null, null, null, null];

    const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
    const association = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.association);
    const xiaoting = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.xiaoting);
    const hammo = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.hammo);
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    const amy = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.amy);
    const soup = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.soup);
    const erosionFillerA = makeScenarioCard({ id: 'BATRA_ATTACK_EROSION_FILLER_A', fullName: 'Batra Erosion Filler A', type: 'UNIT', cardlocation: 'EROSION_FRONT' });
    const erosionFillerB = makeScenarioCard({ id: 'BATRA_ATTACK_EROSION_FILLER_B', fullName: 'Batra Erosion Filler B', type: 'UNIT', cardlocation: 'EROSION_FRONT' });
    const bigReadyDefender = makeScenarioCard({
      id: 'BATRA_ROUTE_READY_3000_DEFENDER',
      fullName: 'Ready 3000 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 0,
      baseDamage: 0,
    });

    putUnitForScenario(state, 'BOT_PLAYER', albert, 0);
    putItemForScenario(state, 'BOT_PLAYER', association, 0);
    putItemForScenario(state, 'BOT_PLAYER', soup, 1);
    putUnitForScenario(state, 'BOT_PLAYER', xiaoting, 1);
    putUnitForScenario(state, 'BOT_PLAYER', hammo, 2);
    putUnitForScenario(state, 'BOT_PLAYER', batra, 3);
    putErosionFrontForScenario(state, 'BOT_PLAYER', amy, 0);
    putErosionFrontForScenario(state, 'BOT_PLAYER', erosionFillerA, 1);
    putErosionFrontForScenario(state, 'BOT_PLAYER', erosionFillerB, 2);
    putUnitForScenario(state, 'TEST_PLAYER', bigReadyDefender, 0);

    const advice = getAdventurerGuildRouteAdvice(state, bot, profile!, 'ATTACK');
    assert(advice?.preferredCardIds?.includes(ADVENTURER_GUILD_CARD_IDS.batra), `Expected batra attack route advice, got ${advice?.stepKey || 'none'}`);
    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog?.details?.damage === (batra.damage || 0), `Expected batra to attack, got ${attackLog?.subject || 'none'}`);
    assert(state.battleState?.attackers?.includes(batra.gamecardId), 'Expected batra to be the declared attacker');
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected batra not to be held because of the 3000 ready defender');
  },
}, {
  name: 'adventurer-guild route A prioritizes batra before amy into a 3000 ready defender',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');

    state.turnCount = 5;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    bot.hand = [];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
    const association = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.association);
    const xiaoting = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.xiaoting);
    const hammo = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.hammo);
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    const amy = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.amy);
    const soup = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.soup);

    amy.power = 3000;
    amy.basePower = 3000;
    amy.damage = 2;
    amy.baseDamage = 2;

    for (let index = 0; index < 8; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `BATRA_ROUTE_A_OPPONENT_EROSION_${index}`,
        fullName: `Batra Route A Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const bigReadyDefender = makeScenarioCard({
      id: 'BATRA_ROUTE_A_READY_3000_DEFENDER',
      fullName: 'Route A Ready 3000 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 0,
      baseDamage: 0,
    });
    const erosionFillerA = makeScenarioCard({ id: 'BATRA_ROUTE_A_EROSION_FILLER_A', fullName: 'Batra Route A Erosion Filler A', type: 'UNIT', cardlocation: 'EROSION_FRONT' });
    const erosionFillerB = makeScenarioCard({ id: 'BATRA_ROUTE_A_EROSION_FILLER_B', fullName: 'Batra Route A Erosion Filler B', type: 'UNIT', cardlocation: 'EROSION_FRONT' });

    putUnitForScenario(state, 'BOT_PLAYER', albert, 0);
    putItemForScenario(state, 'BOT_PLAYER', association, 0);
    putItemForScenario(state, 'BOT_PLAYER', soup, 1);
    putUnitForScenario(state, 'BOT_PLAYER', xiaoting, 1);
    putUnitForScenario(state, 'BOT_PLAYER', hammo, 2);
    putUnitForScenario(state, 'BOT_PLAYER', amy, 3);
    putUnitForScenario(state, 'BOT_PLAYER', batra, 4);
    putErosionFrontForScenario(state, 'BOT_PLAYER', erosionFillerA, 0);
    putErosionFrontForScenario(state, 'BOT_PLAYER', erosionFillerB, 1);
    putUnitForScenario(state, 'TEST_PLAYER', bigReadyDefender, 0);

    const advice = getAdventurerGuildRouteAdvice(state, bot, profile, 'ATTACK');
    assert(advice?.stepKey === 'A_BATRA_BAIT_READY_DEFENDER', `Expected route A to prioritize Batra bait, got ${advice?.stepKey || 'none'}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog?.subject?.includes(batra.specialName || batra.fullName), `Expected Batra to attack before Amy, got ${attackLog?.subject || 'none'}`);
    assert(attackLog?.details?.batraReadyDefenderAttackWindow === true, 'Expected Batra ready-defender attack window to be recorded');
    assert(attackLog?.details?.batraReadyDefenderAttacker === true, 'Expected the route A attack log to record Batra as the attacker');
    assert(state.battleState?.attackers?.includes(batra.gamecardId), 'Expected Batra to be declared before Amy into a 3000 ready defender');
  },
}, {
  name: 'adventurer-guild batra attacks into a 3000 ready defender by default',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 3;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.unitZone = [null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    bot.hand = [];
    opponent.unitZone = [null, null, null, null, null];

    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    const bigReadyDefender = makeScenarioCard({
      id: 'BATRA_DEFAULT_READY_3000_DEFENDER',
      fullName: 'Default Ready 3000 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 0,
      baseDamage: 0,
    });

    putUnitForScenario(state, 'BOT_PLAYER', batra, 0);
    putUnitForScenario(state, 'TEST_PLAYER', bigReadyDefender, 0);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog?.subject?.includes(batra.specialName || batra.fullName), `Expected Batra to attack by default, got ${attackLog?.subject || 'none'}`);
    assert(state.battleState?.attackers?.includes(batra.gamecardId), 'Expected Batra to be declared as attacker by default');
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected Batra not to be held by default into a 3000 ready defender');
  },
}, {
  name: 'adventurer-guild batra enters battle from main into a 3000 ready defender by default',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 3;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.unitZone = [null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    bot.hand = [];
    opponent.unitZone = [null, null, null, null, null];

    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    const bigReadyDefender = makeScenarioCard({
      id: 'BATRA_MAIN_DEFAULT_READY_3000_DEFENDER',
      fullName: 'Main Default Ready 3000 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 0,
      baseDamage: 0,
    });

    putUnitForScenario(state, 'BOT_PLAYER', batra, 0);
    putUnitForScenario(state, 'TEST_PLAYER', bigReadyDefender, 0);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');
    const phaseAfterEnterBattle: string = state.phase;
    assert(phaseAfterEnterBattle === 'BATTLE_DECLARATION', `Expected Batra default line to enter battle from main, got ${phaseAfterEnterBattle}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog?.subject?.includes(batra.specialName || batra.fullName), `Expected Batra to attack from main by default, got ${attackLog?.subject || 'none'}`);
    assert(attackLog?.details?.batraReadyDefenderAttackWindow === true, 'Expected Batra ready-defender attack window to be recorded from main');
    assert(state.battleState?.attackers?.includes(batra.gamecardId), 'Expected Batra to be declared as attacker from main by default');
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected Batra not to be held from main into a 3000 ready defender');
  },
}, {
  name: 'adventurer-guild batra attacks into a stronger ready defender by default',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 3;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.unitZone = [null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    bot.hand = [];
    opponent.unitZone = [null, null, null, null, null];

    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    const strongerReadyDefender = makeScenarioCard({
      id: 'BATRA_DEFAULT_READY_5000_DEFENDER',
      fullName: 'Default Ready 5000 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 5000,
      basePower: 5000,
      damage: 0,
      baseDamage: 0,
    });

    putUnitForScenario(state, 'BOT_PLAYER', batra, 0);
    putUnitForScenario(state, 'TEST_PLAYER', strongerReadyDefender, 0);

    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');
    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.attackBeforeDeveloping === true, 'Expected Batra 3000+ ready-defender window to be an attack window');
    assert(plan.reserveDefenders === 0, `Expected Batra not to be reserved into a stronger ready defender, got ${plan.reserveDefenders}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog?.subject?.includes(batra.specialName || batra.fullName), `Expected Batra to attack by default into a stronger ready defender, got ${attackLog?.subject || 'none'}`);
    assert(attackLog?.details?.batraReadyDefenderAttackWindow === true, 'Expected Batra ready-defender attack window to be recorded');
    assert(attackLog?.details?.batraReadyDefenderAttacker === true, 'Expected the attack log to record Batra as the ready-defender attacker');
    assert(state.battleState?.attackers?.includes(batra.gamecardId), 'Expected Batra to be declared as attacker into a stronger ready defender');
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected Batra not to be held by default into a stronger ready defender');
  },
}, {
  name: 'adventurer-guild batra still attacks a 3000 ready defender under reserve pressure',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 8;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    bot.hand = [];
    bot.deck = Array.from({ length: 8 }, (_, index) =>
      makeScenarioCard({ id: `BATRA_PRESSURE_BOT_DECK_${index}`, fullName: `Batra Pressure Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 6; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `BATRA_PRESSURE_BOT_EROSION_${index}`,
        fullName: `Batra Pressure Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const bigReadyDefender = makeScenarioCard({
      id: 'BATRA_PRESSURE_READY_3000_DEFENDER',
      fullName: 'Pressure Ready 3000 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 6,
      baseDamage: 6,
    });

    putUnitForScenario(state, 'BOT_PLAYER', batra, 0);
    putUnitForScenario(state, 'TEST_PLAYER', bigReadyDefender, 0);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog?.subject?.includes(batra.specialName || batra.fullName), `Expected Batra to attack under reserve pressure, got ${attackLog?.subject || 'none'}`);
    assert(attackLog?.details?.batraReadyDefenderAttackWindow === true, 'Expected Batra ready-defender attack window to be recorded');
    assert(attackLog?.details?.minimumAttackScore === -999, `Expected forcing attack threshold -999, got ${attackLog?.details?.minimumAttackScore}`);
    assert(state.battleState?.attackers?.includes(batra.gamecardId), 'Expected Batra to be declared as attacker under reserve pressure');
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected Batra not to be reserved when facing a 3000 ready defender');
  },
}, {
  name: 'adventurer-guild clears prior reserve for batra into a 3000 ready defender',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 8;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    bot.hand = [];
    bot.deck = Array.from({ length: 8 }, (_, index) =>
      makeScenarioCard({ id: `BATRA_PRIOR_RESERVE_BOT_DECK_${index}`, fullName: `Batra Prior Reserve Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 6; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `BATRA_PRIOR_RESERVE_BOT_EROSION_${index}`,
        fullName: `Batra Prior Reserve Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const bigReadyDefender = makeScenarioCard({
      id: 'BATRA_PRIOR_RESERVE_READY_3000_DEFENDER',
      fullName: 'Prior Reserve Ready 3000 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 6,
      baseDamage: 6,
    });

    putUnitForScenario(state, 'BOT_PLAYER', batra, 0);
    putUnitForScenario(state, 'TEST_PLAYER', bigReadyDefender, 0);
    (bot as any).botReservedDefenderTurn = state.turnCount;
    (bot as any).botReservedDefenderIds = [batra.gamecardId];

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog?.subject?.includes(batra.specialName || batra.fullName), `Expected prior-reserved Batra to attack into a 3000 ready defender, got ${attackLog?.subject || 'none'}`);
    assert(attackLog?.details?.batraReadyDefenderAttackWindow === true, 'Expected Batra ready-defender attack window to be recorded');
    assert(attackLog?.details?.reservedDefenders === 0, `Expected Batra reserve to be cleared, got ${attackLog?.details?.reservedDefenders}`);
    assert(state.battleState?.attackers?.includes(batra.gamecardId), 'Expected prior-reserved Batra to be declared as attacker');
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected prior-reserved Batra not to be held into a 3000 ready defender');
  },
}, {
  name: 'adventurer-guild clears main-phase attack hold for batra into a 3000 ready defender',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');

    state.turnCount = 8;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;
    state.players.BOT_PLAYER.isTurn = true;
    state.players.TEST_PLAYER.isTurn = false;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    bot.hand = [];
    bot.deck = Array.from({ length: 12 }, (_, index) =>
      makeScenarioCard({ id: `BATRA_MAIN_HOLD_BOT_DECK_${index}`, fullName: `Batra Main Hold Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    const bigReadyDefender = makeScenarioCard({
      id: 'BATRA_MAIN_HOLD_READY_3000_DEFENDER',
      fullName: 'Main Hold Ready 3000 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 6,
      baseDamage: 6,
    });

    putUnitForScenario(state, 'BOT_PLAYER', batra, 0);
    putUnitForScenario(state, 'TEST_PLAYER', bigReadyDefender, 0);
    (bot as any).botReservedAttackTurn = state.turnCount;
    (bot as any).botHeldUnfavorableAttackTurn = state.turnCount;
    (bot as any).botReservedDefenderTurn = state.turnCount;
    (bot as any).botReservedDefenderIds = [batra.gamecardId];

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.attackBeforeDeveloping === true, 'Expected Batra ready-defender window to force attack before developing');
    assert(plan.reserveDefenders === 0, `Expected Batra not to be reserved, got ${plan.reserveDefenders}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const phaseAfterEnterBattle: string = state.phase;
    assert(phaseAfterEnterBattle === 'BATTLE_DECLARATION', `Expected Batra hold to be cleared and battle entered, got ${phaseAfterEnterBattle}`);
    assert((bot as any).botReservedAttackTurn !== state.turnCount, 'Expected current-turn attack hold marker to be cleared for Batra');

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog?.subject?.includes(batra.specialName || batra.fullName), `Expected Batra to attack after main-phase hold was cleared, got ${attackLog?.subject || 'none'}`);
    assert(attackLog?.details?.batraReadyDefenderAttackWindow === true, 'Expected Batra ready-defender attack window to be recorded');
    assert(state.battleState?.attackers?.includes(batra.gamecardId), 'Expected Batra to be declared as attacker after main-phase hold was cleared');
  },
}, {
  name: 'adventurer-guild holds scales self draw at low deck against pure yellow steel',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 11;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const scales = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.scales);
    const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [
      makeScenarioCard({
        id: ADVENTURER_GUILD_CARD_IDS.wen,
        fullName: 'Scales Low Deck Hand Adventurer',
        type: 'UNIT',
        faction: '冒险家公会',
        cardlocation: 'HAND',
      }),
    ];
    bot.deck = Array.from({ length: 5 }, (_, index) =>
      makeScenarioCard({ id: `SCALES_LOW_DECK_BOT_DECK_${index}`, fullName: `Scales Low Deck Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 12 }, (_, index) =>
      makeScenarioCard({ id: `SCALES_LOW_DECK_OPPONENT_DECK_${index}`, fullName: `Scales Low Deck Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'adventurer-guild',
      TEST_PLAYER: 'pure-yellow-steel',
    };
    (opponent as any).botDeckProfileId = 'pure-yellow-steel';

    putUnitForScenario(state, 'BOT_PLAYER', albert, 0);
    putItemForScenario(state, 'BOT_PLAYER', scales, 0);

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const scalesCandidate = candidates.find(candidate => candidate.effect?.id === '304020009_activate');
    assert(scalesCandidate, 'Expected scales effect candidate to remain visible to AI scoring');
    assert(scalesCandidate.score < 5.5, `Expected low-deck scales self draw below main threshold, got ${scalesCandidate.score}`);
    assert(
      scalesCandidate.notes.some((note: string) => /Scales self draw held/.test(note)),
      `Expected low-deck scales note, got ${scalesCandidate.notes.join(',')}`
    );

    const choiceQuery: EffectQuery = {
      id: 'SCALES_LOW_DECK_PLAYER_CHOICE',
      type: 'SELECT_CARD',
      playerUid: 'BOT_PLAYER',
      options: [
        { card: { gamecardId: 'PLAYER_SELF', id: 'PLAYER_SELF', fullName: 'Self', type: 'UNIT', color: 'NONE' }, source: 'HAND' },
        { card: { gamecardId: 'PLAYER_OPPONENT', id: 'PLAYER_OPPONENT', fullName: 'Opponent', type: 'UNIT', color: 'NONE' }, source: 'HAND' },
      ],
      title: 'Choose scales player',
      description: 'Choose scales player',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        effectId: '304020009_activate',
        step: 'EXECUTE_EFFECT',
      },
    } as EffectQuery;
    const selections = ServerGameService.getBotQuerySelectionsForPlayer(state, 'BOT_PLAYER', choiceQuery);
    assert(selections[0] === 'PLAYER_OPPONENT', `Expected low-deck scales choice to avoid self, got ${selections.join(',') || 'none'}`);
  },
}, {
  name: 'adventurer-guild makes a last-chance low-deck attack when defense cannot cover',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');

    state.turnCount = 13;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 2 }, (_, index) =>
      makeScenarioCard({ id: `ADVENTURER_LAST_CHANCE_BOT_DECK_${index}`, fullName: `Adventurer Last Chance Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 12 }, (_, index) =>
      makeScenarioCard({ id: `ADVENTURER_LAST_CHANCE_OPPONENT_DECK_${index}`, fullName: `Adventurer Last Chance Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 7; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `ADVENTURER_LAST_CHANCE_OPPONENT_EROSION_${index}`,
        fullName: `Adventurer Last Chance Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [2, 2].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `ADVENTURER_LAST_CHANCE_ATTACKER_${index}`,
        fullName: `Adventurer Last Chance Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000,
        basePower: 3000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [4, 4, 3].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `ADVENTURER_LAST_CHANCE_READY_THREAT_${index}`,
        fullName: `Adventurer Last Chance Ready Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    (bot as any).botReservedDefenderTurn = state.turnCount;
    (bot as any).botReservedDefenderIds = bot.unitZone.filter(Boolean).map(card => card!.gamecardId);

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.lastChanceAttack === true, `Expected adventurer last-chance attack plan, got notes: ${plan.notes.join(', ')}`);
    assert(plan.attackBeforeDeveloping === true, 'Expected adventurer last-chance plan to attack before developing');
    assert(plan.reserveDefenders === 0, `Expected no reserved defenders in adventurer last-chance plan, got ${plan.reserveDefenders}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');
    const phaseAfterMain: string = state.phase;
    assert(phaseAfterMain === 'BATTLE_DECLARATION', `Expected adventurer last-chance plan to enter battle, got ${phaseAfterMain}`);
    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog, 'Expected adventurer guild to attack in the last-chance low-deck window');
    assert(attackLog?.details?.lastChanceAttack === true, 'Expected attack log to record lastChanceAttack');
    assert(attackLog?.details?.reservedDefenders === 0, `Expected no reserved defenders, got ${attackLog?.details?.reservedDefenders}`);
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected adventurer last-chance attack not to hold all attackers');
  },
}, {
  name: 'adventurer-guild last-chance does not force negative attacks into ready defenders',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');

    state.turnCount = 32;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
    const hammo = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.hammo);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 2 }, (_, index) =>
      makeScenarioCard({ id: `ADVENTURER_LAST_CHANCE_HOLD_BOT_DECK_${index}`, fullName: `Adventurer Last Chance Hold Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 6 }, (_, index) =>
      makeScenarioCard({ id: `ADVENTURER_LAST_CHANCE_HOLD_OPPONENT_DECK_${index}`, fullName: `Adventurer Last Chance Hold Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 8; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `ADVENTURER_LAST_CHANCE_HOLD_OPPONENT_EROSION_${index}`,
        fullName: `Adventurer Last Chance Hold Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    albert.power = 3000;
    albert.basePower = 3000;
    albert.damage = 2;
    albert.baseDamage = 2;
    hammo.power = 2500;
    hammo.basePower = 2500;
    hammo.damage = 1;
    hammo.baseDamage = 1;
    putUnitForScenario(state, 'BOT_PLAYER', albert, 0);
    putUnitForScenario(state, 'BOT_PLAYER', hammo, 1);
    putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
      id: 'ADVENTURER_LAST_CHANCE_HOLD_READY_DEFENDER',
      fullName: 'Adventurer Last Chance Hold Ready Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 4000,
      basePower: 4000,
      damage: 4,
      baseDamage: 4,
      playedTurn: 0,
    }), 0);
    [4, 4, 3].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `ADVENTURER_LAST_CHANCE_HOLD_THREAT_${index}`,
        fullName: `Adventurer Last Chance Hold Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 2500,
        basePower: 2500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
        isExhausted: true,
      }), index + 1);
    });

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.lastChanceAttack === true, `Expected adventurer last-chance plan, got notes: ${plan.notes.join(', ')}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    const holdLog = state.aiDecisionLogs?.find(log => log.action === 'HOLD_ATTACKERS');
    assert(!attackLog, `Expected no negative last-chance attack into ready defender, got ${attackLog?.subject || 'none'} score=${attackLog?.score ?? 'n/a'}`);
    assert(holdLog, 'Expected last-chance with only negative attacks to hold attackers');
    const bestAttackScore = Number(holdLog?.details?.bestAttackScore ?? 0);
    assert(bestAttackScore < 0, `Expected held best attack score to be negative, got ${holdLog?.details?.bestAttackScore}`);
    assert(holdLog?.details?.minimumAttackScore === 0, `Expected last-chance minimum attack score to be 0, got ${holdLog?.details?.minimumAttackScore}`);
  },
}, {
  name: 'adventurer-guild treats goddess pressure as stabilize when counter-lethal is incoming',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'adventurer-guild');
    assert(profile, 'Missing adventurer guild profile');

    state.turnCount = 16;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 12 }, (_, index) =>
      makeScenarioCard({ id: `GODDESS_PRESSURE_BOT_DECK_${index}`, fullName: `Goddess Pressure Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.deck = Array.from({ length: 24 }, (_, index) =>
      makeScenarioCard({ id: `GODDESS_PRESSURE_OPPONENT_DECK_${index}`, fullName: `Goddess Pressure Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 6; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `GODDESS_PRESSURE_BOT_EROSION_${index}`,
        fullName: `Goddess Pressure Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    for (let index = 0; index < 3; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `GODDESS_PRESSURE_OPPONENT_EROSION_${index}`,
        fullName: `Goddess Pressure Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [4, 3, 2, 2, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `GODDESS_PRESSURE_ATTACKER_${index}`,
        fullName: `Goddess Pressure Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000,
        basePower: 3000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [4, 4].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `GODDESS_PRESSURE_COUNTER_ATTACKER_${index}`,
        fullName: `Goddess Pressure Counter Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.tacticalLine === 'stabilize', `Expected goddess pressure under incoming lethal to stabilize, got ${plan.tacticalLine}`);
    assert(plan.mode === 'defense', `Expected defensive mode, got ${plan.mode}`);
    assert(plan.attackBeforeDeveloping === false, 'Expected hard AI not to force attacks before stabilizing');
    assert(plan.reserveDefenders >= 2, `Expected at least 2 reserved defenders, got ${plan.reserveDefenders}`);
  },
}, {
  name: 'pure-yellow-steel attacks before developing with decisive goddess pressure',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure yellow steel profile');

    state.turnCount = 8;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter)];
    bot.deck = Array.from({ length: 17 }, (_, index) =>
      makeScenarioCard({ id: `DECISIVE_PRESSURE_BOT_DECK_${index}`, fullName: `Decisive Pressure Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 16 }, (_, index) =>
      makeScenarioCard({ id: `DECISIVE_PRESSURE_OPPONENT_DECK_${index}`, fullName: `Decisive Pressure Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 9; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `DECISIVE_PRESSURE_OPPONENT_EROSION_${index}`,
        fullName: `Decisive Pressure Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [4, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `DECISIVE_PRESSURE_ATTACKER_${index}`,
        fullName: `Decisive Pressure Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3500,
        basePower: 3500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });
    putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
      id: 'DECISIVE_PRESSURE_READY_DEFENDER',
      fullName: 'Decisive Pressure Ready Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 4000,
      basePower: 4000,
      damage: 4,
      baseDamage: 4,
      playedTurn: 0,
    }), 0);
    const counterAttacker = makeScenarioCard({
      id: 'DECISIVE_PRESSURE_COUNTER_ATTACKER',
      fullName: 'Decisive Pressure Counter Attacker',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3500,
      basePower: 3500,
      damage: 3,
      baseDamage: 3,
      playedTurn: 0,
    });
    putUnitForScenario(state, 'TEST_PLAYER', counterAttacker, 1);
    counterAttacker.isExhausted = true;
    counterAttacker.displayState = 'FRONT_HORIZONTAL';

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.tacticalLine === 'erosion-lethal', `Expected decisive pressure to be erosion-lethal, got ${plan.tacticalLine}`);
    assert(plan.attackBeforeDeveloping === true, 'Expected hard AI to attack before developing under decisive pressure');

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const firstActionAfterPlan = state.aiDecisionLogs?.find(log => log.action !== 'TURN_PLAN');
    assert(firstActionAfterPlan?.action === 'ENTER_BATTLE', `Expected first action after plan to enter battle, got ${firstActionAfterPlan?.action || 'none'}`);
    assert(!state.aiDecisionLogs?.some(log => log.action === 'PLAY_CARD'), 'Expected no play before the decisive attack window');
  },
}, {
  name: 'pure-yellow-steel low deck attacks before developing with exact goddess pressure',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure yellow steel profile');

    state.turnCount = 15;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter)];
    bot.deck = Array.from({ length: 5 }, (_, index) =>
      makeScenarioCard({ id: `LOW_DECK_EXACT_PRESSURE_BOT_DECK_${index}`, fullName: `Low Deck Exact Pressure Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 9; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `LOW_DECK_EXACT_PRESSURE_OPPONENT_EROSION_${index}`,
        fullName: `Low Deck Exact Pressure Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [5, 4, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `LOW_DECK_EXACT_PRESSURE_ATTACKER_${index}`,
        fullName: `Low Deck Exact Pressure Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });
    [4, 3].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `LOW_DECK_EXACT_PRESSURE_DEFENDER_${index}`,
        fullName: `Low Deck Exact Pressure Defender ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.tacticalLine === 'erosion-lethal', `Expected low-deck exact pressure to become erosion-lethal, got ${plan.tacticalLine}`);
    assert(plan.attackBeforeDeveloping === true, 'Expected low-deck exact pressure to attack before developing');

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const firstActionAfterPlan = state.aiDecisionLogs?.find(log => log.action !== 'TURN_PLAN');
    assert(firstActionAfterPlan?.action === 'ENTER_BATTLE', `Expected low-deck pressure to enter battle first, got ${firstActionAfterPlan?.action || 'none'}`);
    assert(!state.aiDecisionLogs?.some(log => log.action === 'PLAY_CARD'), 'Expected no low-deck development before exact pressure attack');
  },
}, {
  name: 'pure-yellow-steel attacks before developing when through-defender erosion lethal is available',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure-yellow-steel profile');

    state.turnCount = 8;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const fortressBlueprint = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.fortressBlueprint);
    const analysisRoom = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.analysisRoom);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [fortressBlueprint, analysisRoom];
    bot.deck = Array.from({ length: 16 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_THROUGH_LETHAL_BOT_DECK_${index}`, fullName: `Steel Through Lethal Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 16 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_THROUGH_LETHAL_OPPONENT_DECK_${index}`, fullName: `Steel Through Lethal Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.itemZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'pure-yellow-steel',
      TEST_PLAYER: 'adventurer-guild',
    };
    (opponent as any).botDeckProfileId = 'adventurer-guild';

    for (let index = 0; index < 3; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_THROUGH_LETHAL_BOT_EROSION_${index}`,
        fullName: `Steel Through Lethal Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    for (let index = 0; index < 9; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_THROUGH_LETHAL_OPPONENT_EROSION_${index}`,
        fullName: `Steel Through Lethal Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [4, 4, 3, 1, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_THROUGH_LETHAL_ATTACKER_${index}`,
        fullName: `Steel Through Lethal Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [3, 2, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_THROUGH_LETHAL_READY_DEFENDER_${index}`,
        fullName: `Steel Through Lethal Ready Defender ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000,
        basePower: 3000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.tacticalLine === 'erosion-lethal', `Expected through-defender pressure to be erosion-lethal, got ${plan.tacticalLine}: ${plan.notes.join(', ')}`);
    assert(plan.attackBeforeDeveloping === true, 'Expected through-defender lethal to attack before developing');
    assert(plan.reserveDefenders === 0, `Expected no reserved defenders when lethal damage already gets through, got ${plan.reserveDefenders}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const firstActionAfterPlan = state.aiDecisionLogs?.find(log => log.action !== 'TURN_PLAN');
    assert(firstActionAfterPlan?.action === 'ENTER_BATTLE', `Expected through-defender lethal to enter battle before development, got ${firstActionAfterPlan?.action || 'none'}`);
    assert(!state.aiDecisionLogs?.some(log => log.action === 'PLAY_CARD'), 'Expected no play before the through-defender lethal attack window');
  },
}, {
  name: 'pure-yellow-steel reserves extra blockers against adventurer wide pressure inside self-draw line',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure-yellow-steel profile');

    state.turnCount = 11;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 14 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_WIDE_GUARD_BOT_DECK_${index}`, fullName: `Steel Wide Guard Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 11 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_WIDE_GUARD_OPPONENT_DECK_${index}`, fullName: `Steel Wide Guard Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.itemZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'pure-yellow-steel',
      TEST_PLAYER: 'adventurer-guild',
    };
    (opponent as any).botDeckProfileId = 'adventurer-guild';

    [3, 2, 1, 1, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_WIDE_GUARD_ATTACKER_${index}`,
        fullName: `Steel Wide Guard Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000,
        basePower: 3000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [3, 2, 2, 2, 2].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_WIDE_GUARD_ADVENTURER_THREAT_${index}`,
        fullName: `Steel Wide Guard Adventurer Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000,
        basePower: 3000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.lastChanceAttack === false, 'Expected this guard scenario not to be a last-chance attack');
    assert(plan.reserveDefenders >= 4, `Expected pure-yellow-steel to reserve at least 4 blockers against adventurer wide pressure, got ${plan.reserveDefenders}`);
    assert(plan.attackBeforeDeveloping === false, 'Expected pure-yellow-steel to delay attacks and preserve blockers under wide pressure');
    assert(
      plan.notes.some(note => /reserves extra blockers/.test(note)),
      `Expected wide-pressure reserve note, got ${plan.notes.join(', ')}`
    );
  },
}, {
  name: 'pure-yellow-steel starts deck-race attack before two-card last chance against adventurer',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure-yellow-steel profile');

    state.turnCount = 24;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 5 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_DECK_RACE_BOT_DECK_${index}`, fullName: `Steel Deck Race Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 5 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_DECK_RACE_OPPONENT_DECK_${index}`, fullName: `Steel Deck Race Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.itemZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'pure-yellow-steel',
      TEST_PLAYER: 'adventurer-guild',
    };
    (opponent as any).botDeckProfileId = 'adventurer-guild';

    [4, 4, 3, 1, 1, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_DECK_RACE_ATTACKER_${index}`,
        fullName: `Steel Deck Race Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3500,
        basePower: 3500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [4, 4, 3, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_DECK_RACE_READY_THREAT_${index}`,
        fullName: `Steel Deck Race Ready Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    (bot as any).botReservedDefenderTurn = state.turnCount;
    (bot as any).botReservedDefenderIds = bot.unitZone.filter(Boolean).map(card => card!.gamecardId);

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.lastChanceAttack === true, `Expected deck-race attack plan before two-card last chance, got notes: ${plan.notes.join(', ')}`);
    assert(plan.notes.some(note => /deck-race attack/.test(note)), `Expected deck-race note, got ${plan.notes.join(', ')}`);
    assert(plan.attackBeforeDeveloping === true, 'Expected deck-race plan to attack before developing');
    assert(plan.reserveDefenders === 0, `Expected no reserved defenders in deck-race plan, got ${plan.reserveDefenders}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');
    const phaseAfterMain: string = state.phase;
    assert(phaseAfterMain === 'BATTLE_DECLARATION', `Expected deck-race plan to enter battle, got ${phaseAfterMain}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');
    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog, 'Expected pure yellow steel to attack in the deck-race window');
    assert(attackLog?.details?.lastChanceAttack === true, 'Expected attack log to record lastChanceAttack for deck-race window');
    assert(attackLog?.details?.reservedDefenders === 0, `Expected no reserved defenders, got ${attackLog?.details?.reservedDefenders}`);
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected deck-race window not to hold all attackers');
  },
}, {
  name: 'pure-yellow-steel makes a last-chance low-deck attack instead of reserving every blocker',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure-yellow-steel profile');

    state.turnCount = 23;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 2 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_LAST_CHANCE_BOT_DECK_${index}`, fullName: `Steel Last Chance Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 7 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_LAST_CHANCE_OPPONENT_DECK_${index}`, fullName: `Steel Last Chance Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 7; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_LAST_CHANCE_OPPONENT_EROSION_${index}`,
        fullName: `Steel Last Chance Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [4, 3, 3, 2, 1, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_LAST_CHANCE_ATTACKER_${index}`,
        fullName: `Steel Last Chance Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3500,
        basePower: 3500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [4, 4, 3, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_LAST_CHANCE_READY_THREAT_${index}`,
        fullName: `Steel Last Chance Ready Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    (bot as any).botReservedDefenderTurn = state.turnCount;
    (bot as any).botReservedDefenderIds = bot.unitZone.filter(Boolean).map(card => card!.gamecardId);

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.lastChanceAttack === true, `Expected last-chance attack plan, got notes: ${plan.notes.join(', ')}`);
    assert(plan.attackBeforeDeveloping === true, 'Expected last-chance plan to attack before developing');
    assert(plan.reserveDefenders === 0, `Expected no reserved defenders in last-chance plan, got ${plan.reserveDefenders}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');
    const phaseAfterMain: string = state.phase;
    assert(phaseAfterMain === 'BATTLE_DECLARATION', `Expected last-chance plan to enter battle, got ${phaseAfterMain}`);
    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog, 'Expected pure yellow steel to attack in the last-chance low-deck window');
    assert(attackLog?.details?.lastChanceAttack === true, 'Expected attack log to record lastChanceAttack');
    assert(attackLog?.details?.reservedDefenders === 0, `Expected no reserved defenders, got ${attackLog?.details?.reservedDefenders}`);
    assert(!state.aiDecisionLogs?.some(log => log.action === 'ATTACK' && typeof log.score === 'number' && log.score < 0), 'Expected last-chance attack not to force negative-score attacks into covered defenders');
    const holdLog = state.aiDecisionLogs?.find(log => log.action === 'HOLD_ATTACKERS');
    if (holdLog) {
      assert(holdLog.details?.lastChanceFullyBlocked === true, 'Expected last-chance hold only after remaining attacks are fully covered');
    }
  },
}, {
  name: 'pure-yellow-steel keeps attacking when last-chance defense cannot cover next turn',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure-yellow-steel profile');

    state.turnCount = 19;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    opponent.isGoddessMode = true;
    bot.hand = [];
    bot.deck = Array.from({ length: 2 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_UNCOVERABLE_LAST_CHANCE_BOT_DECK_${index}`, fullName: `Steel Uncoverable Last Chance Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 10 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_UNCOVERABLE_LAST_CHANCE_OPPONENT_DECK_${index}`, fullName: `Steel Uncoverable Last Chance Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 7; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_UNCOVERABLE_LAST_CHANCE_OPPONENT_EROSION_${index}`,
        fullName: `Steel Uncoverable Last Chance Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [1, 1, 1, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_UNCOVERABLE_LAST_CHANCE_ATTACKER_${index}`,
        fullName: `Steel Uncoverable Last Chance Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 1000,
        basePower: 1000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [0, 1, 2, 3, 4].forEach((slot) => {
      const threat = makeScenarioCard({
        id: `STEEL_UNCOVERABLE_LAST_CHANCE_THREAT_${slot}`,
        fullName: `Steel Uncoverable Last Chance Threat ${slot}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 9000,
        basePower: 9000,
        damage: 5,
        baseDamage: 5,
        acValue: 6,
        baseAcValue: 6,
        playedTurn: 0,
      });
      putUnitForScenario(state, 'TEST_PLAYER', threat, slot);
      if (slot >= 3) {
        threat.isExhausted = true;
        threat.displayState = 'FRONT_HORIZONTAL';
      }
    });

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.lastChanceAttack === true, `Expected last-chance attack plan, got notes: ${plan.notes.join(', ')}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog, 'Expected pure yellow steel to keep attacking when defense cannot cover next turn');
    assert(attackLog?.details?.lastChanceAttack === true, 'Expected attack log to record lastChanceAttack');
    assert(attackLog?.details?.lastChanceFullyBlocked === false, 'Expected current pressure not to be fully covered');
    assert(attackLog?.details?.defenseCannotCoverAttackWindow === true, 'Expected attack log to record the broader no-cover attack window');
    assert(attackLog?.details?.lastChanceDefenseCannotCover === true, 'Expected attack log to record that defense cannot cover next turn');
    assert(attackLog?.details?.minimumAttackScore === -999, `Expected forced last-chance threshold -999, got ${attackLog?.details?.minimumAttackScore}`);
    assert(typeof attackLog.score === 'number' && attackLog.score < 0, `Expected this regression to force a negative-score attack, got ${attackLog.score ?? 'n/a'}`);
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected no hold when last-chance defense cannot cover next turn');
  },
}, {
  name: 'pure-yellow-steel attacks sole unit when defense cannot cover next turn',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure-yellow-steel profile');

    state.turnCount = 25;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 2 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_SOLE_UNCOVERABLE_BOT_DECK_${index}`, fullName: `Steel Sole Uncoverable Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 18 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_SOLE_UNCOVERABLE_OPPONENT_DECK_${index}`, fullName: `Steel Sole Uncoverable Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
      id: 'STEEL_SOLE_UNCOVERABLE_ATTACKER',
      fullName: 'Steel Sole Uncoverable Attacker',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 1000,
      basePower: 1000,
      damage: 1,
      baseDamage: 1,
      playedTurn: 0,
    }), 0);

    for (let slot = 0; slot < 5; slot++) {
      const threat = makeScenarioCard({
        id: `STEEL_SOLE_UNCOVERABLE_THREAT_${slot}`,
        fullName: `Steel Sole Uncoverable Threat ${slot}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 5000,
        basePower: 5000,
        damage: 4,
        baseDamage: 4,
        playedTurn: 0,
      });
      putUnitForScenario(state, 'TEST_PLAYER', threat, slot);
      threat.isExhausted = true;
      threat.displayState = 'FRONT_HORIZONTAL';
    }

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.lastChanceAttack === false, 'Expected this regression to cover the non-lastChance single-attacker case');
    assert(plan.defendersNeededNextTurn > 1, `Expected more defenders needed than the sole attacker can cover, got ${plan.defendersNeededNextTurn}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog, 'Expected sole attacker to attack when defense cannot cover next turn');
    assert(attackLog?.details?.defenseCannotCoverAttackWindow === true, 'Expected no-cover attack window in attack details');
    assert(attackLog?.details?.lastChanceAttack === false, 'Expected this attack to come from no-cover logic, not lastChanceAttack');
    assert(attackLog?.details?.reservedDefenders === 0, `Expected no symbolic defender reserve, got ${attackLog?.details?.reservedDefenders}`);
    assert(attackLog?.details?.minimumAttackScore === -999, `Expected forced no-cover threshold -999, got ${attackLog?.details?.minimumAttackScore}`);
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected no hold when a sole defender cannot cover next turn');
  },
}, {
  name: 'pure-yellow-steel does not mark fully blockable erosion pressure as attack-before-developing',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure yellow steel profile');

    state.turnCount = 6;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 20 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_BLOCKABLE_PRESSURE_BOT_DECK_${index}`, fullName: `Steel Blockable Pressure Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 28 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_BLOCKABLE_PRESSURE_OPPONENT_DECK_${index}`, fullName: `Steel Blockable Pressure Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 5; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_BLOCKABLE_PRESSURE_OPPONENT_EROSION_${index}`,
        fullName: `Steel Blockable Pressure Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [3, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_BLOCKABLE_PRESSURE_ATTACKER_${index}`,
        fullName: `Steel Blockable Pressure Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 1000 + index * 500,
        basePower: 1000 + index * 500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [2, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_BLOCKABLE_PRESSURE_DEFENDER_${index}`,
        fullName: `Steel Blockable Pressure Defender ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000 + index * 500,
        basePower: 3000 + index * 500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.damageThroughLikelyDefenders === 0, `Expected pressure to be fully blockable, got ${plan.damageThroughLikelyDefenders}`);
    assert(plan.attackBeforeDeveloping === false, `Expected fully blockable pressure not to force attack before developing, got notes: ${plan.notes.join(', ')}`);
    assert(plan.notes.includes('fully blockable pressure waits for development'), `Expected fully blockable pressure note, got ${plan.notes.join(', ')}`);
  },
}, {
  name: 'pure-yellow-steel does not mark attack-before-developing when its only attacker must stay back',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure yellow steel profile');

    state.turnCount = 8;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 12 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_SOLE_RESERVED_ATTACKER_DECK_${index}`, fullName: `Steel Sole Reserved Attacker Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 20 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_SOLE_RESERVED_OPPONENT_DECK_${index}`, fullName: `Steel Sole Reserved Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 2; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_SOLE_RESERVED_BOT_EROSION_${index}`,
        fullName: `Steel Sole Reserved Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    for (let index = 0; index < 5; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_SOLE_RESERVED_OPPONENT_EROSION_${index}`,
        fullName: `Steel Sole Reserved Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
      id: PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter,
      fullName: 'Blueprint Painter',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 1000,
      basePower: 1000,
      damage: 1,
      baseDamage: 1,
      playedTurn: 0,
    }), 0);
    [3, 2].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_SOLE_RESERVED_READY_THREAT_${index}`,
        fullName: `Steel Sole Reserved Ready Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3500,
        basePower: 3500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.reserveDefenders >= 1, `Expected the only ready attacker to be reserved, got ${plan.reserveDefenders}`);
    assert(plan.attackBeforeDeveloping === false, 'Expected low-deck reserve pressure not to be reported as an attack-before-developing window');
    assert(plan.notes.includes('all ready attackers reserved for defense'), `Expected reserve note, got ${plan.notes.join(', ')}`);
  },
}, {
  name: 'pure-yellow-steel refuses negative emergency blocker plays that burn a low deck',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 8;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const blueprintPainter = takeCardById(state, 'BOT_PLAYER', PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [blueprintPainter];
    bot.deck = Array.from({ length: 5 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_NEGATIVE_EMERGENCY_DECK_${index}`, fullName: `Steel Negative Emergency Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 2; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_NEGATIVE_EMERGENCY_EROSION_${index}`,
        fullName: `Steel Negative Emergency Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [3, 3].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_NEGATIVE_EMERGENCY_BLOCKER_${index}`,
        fullName: `Steel Negative Emergency Blocker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3500,
        basePower: 3500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });
    [3, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_NEGATIVE_EMERGENCY_THREAT_${index}`,
        fullName: `Steel Negative Emergency Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3000,
        basePower: 3000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const playLog = state.aiDecisionLogs?.find(log => log.action === 'PLAY_CARD');
    assert(!playLog, `Expected no negative emergency blocker play, got ${playLog?.subject || 'unknown'} score=${playLog?.score}`);
    assert(bot.hand.some(card => card.gamecardId === blueprintPainter.gamecardId), 'Expected blueprint painter to remain in hand');
    assert(bot.deck.length === 5, `Expected deck to remain at 5, got ${bot.deck.length}`);
  },
}, {
  name: 'hard AI does not force blockable raw deck lethal while incoming lethal is present',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 10;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 12 }, (_, index) =>
      makeScenarioCard({ id: `BLOCKABLE_RAW_LETHAL_BOT_DECK_${index}`, fullName: `Blockable Raw Lethal Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.deck = Array.from({ length: 3 }, (_, index) =>
      makeScenarioCard({ id: `BLOCKABLE_RAW_LETHAL_OPPONENT_DECK_${index}`, fullName: `Blockable Raw Lethal Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 6; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `BLOCKABLE_RAW_LETHAL_BOT_EROSION_${index}`,
        fullName: `Blockable Raw Lethal Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [2, 1, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `BLOCKABLE_RAW_LETHAL_ATTACKER_${index}`,
        fullName: `Blockable Raw Lethal Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 2000,
        basePower: 2000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [4, 4, 4].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `BLOCKABLE_RAW_LETHAL_DEFENDER_${index}`,
        fullName: `Blockable Raw Lethal Defender ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 5000,
        basePower: 5000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(!attackLog, `Expected hard AI not to force a blockable raw deck lethal attack, got ${attackLog?.subject || 'unknown attacker'}`);
    const holdLog = state.aiDecisionLogs?.find(log => log.action === 'HOLD_ATTACKERS');
    assert(holdLog, 'Expected hard AI to hold attackers for defense');
    assert(holdLog?.details?.effectiveLethalWindow === false, 'Expected effective lethal window to be false');
    assert(holdLog?.details?.minimumAttackScore !== -999, `Expected non-forcing threshold, got ${holdLog?.details?.minimumAttackScore}`);
  },
}, {
  name: 'adventurer-guild holds xiaoting swap during battle free setup windows',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 3;
    state.phase = 'BATTLE_FREE';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    const xiaoting = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.xiaoting);
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    const amy = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.amy);
    putUnitForScenario(state, 'BOT_PLAYER', xiaoting, 0);
    putUnitForScenario(state, 'BOT_PLAYER', batra, 1);
    putErosionFrontForScenario(state, 'BOT_PLAYER', amy, 0);

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const xiaotingSwap = candidates.find(candidate => candidate.effect?.id === 'dragon_wing_receptionist_activate');
    assert(xiaotingSwap, 'Expected Xiaoting swap candidate to exist in battle free');
    assert(xiaotingSwap.score < 7, `Expected Xiaoting swap below battle-free threshold, got ${xiaotingSwap.score}`);
    assert(
      xiaotingSwap.notes?.some((note: string) => /outside main phase/i.test(note)),
      `Expected Xiaoting timing hold note, got ${(xiaotingSwap.notes || []).join(',')}`
    );
  },
}, {
  name: 'adventurer-guild holds kathy swap in a generic countering window',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 3;
    state.phase = 'COUNTERING';
    state.priorityPlayerId = 'BOT_PLAYER';
    state.isCountering = 1;
    state.counterStack = [{
      ownerUid: 'TEST_PLAYER',
      type: 'EFFECT',
      timestamp: Date.now(),
      card: makeScenarioCard({ id: 'OPPONENT_STACK_SOURCE', fullName: 'Opponent Stack Source', cardlocation: 'PLAY' }),
    }];

    const bot = state.players.BOT_PLAYER;
    bot.isTurn = true;
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    const kathy = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.kathy);
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    const fillerA = makeScenarioCard({ id: 'ADVENTURER_EROSION_FILLER_A', fullName: 'Erosion Filler A', cardlocation: 'EROSION_FRONT' });
    const fillerB = makeScenarioCard({ id: 'ADVENTURER_EROSION_FILLER_B', fullName: 'Erosion Filler B', cardlocation: 'EROSION_FRONT' });
    putUnitForScenario(state, 'BOT_PLAYER', kathy, 0);
    putErosionFrontForScenario(state, 'BOT_PLAYER', batra, 0);
    putErosionFrontForScenario(state, 'BOT_PLAYER', fillerA, 1);
    putErosionFrontForScenario(state, 'BOT_PLAYER', fillerB, 2);

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const kathySwap = candidates.find(candidate => candidate.effect?.id === '104030459_swap_activate');
    if (kathySwap) {
      assert(kathySwap.paymentCost === 1, `Expected kathy swap payment cost 1, got ${kathySwap.paymentCost}`);
    }
    assert(!kathySwap || kathySwap.score < 18, `Expected kathy swap to stay below countering threshold, got ${kathySwap?.score}`);
  },
}, {
  name: 'adventurer-guild avoids paid kathy swap when the turn plan needs blockers',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 8;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const kathy = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.kathy);
    const freya = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.freya);
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);

    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    const fillerA = makeScenarioCard({ id: 'KATHY_DEFENSE_PAYMENT_FILLER_A', fullName: 'Defense Payment Filler A', cardlocation: 'EROSION_FRONT' });
    const fillerB = makeScenarioCard({ id: 'KATHY_DEFENSE_PAYMENT_FILLER_B', fullName: 'Defense Payment Filler B', cardlocation: 'EROSION_FRONT' });
    putUnitForScenario(state, 'BOT_PLAYER', kathy, 0);
    putUnitForScenario(state, 'BOT_PLAYER', freya, 1);
    putErosionFrontForScenario(state, 'BOT_PLAYER', batra, 0);
    putErosionFrontForScenario(state, 'BOT_PLAYER', fillerA, 1);
    putErosionFrontForScenario(state, 'BOT_PLAYER', fillerB, 2);

    for (let index = 0; index < 3; index += 1) {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `KATHY_DEFENSE_PAYMENT_ATTACKER_${index}`,
        fullName: `Defense Payment Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage: 3,
        baseDamage: 3,
        playedTurn: 0,
      }), index);
    }

    ServerGameService.recordAiDecision(state, 'BOT_PLAYER', {
      action: 'TURN_PLAN',
      subject: 'defense',
      reason: 'test plan: preserve blockers',
      details: {
        defendersNeededNextTurn: 3,
        reserveDefenders: 3,
        incomingLethal: true,
        tacticalLine: 'stabilize',
      },
    });

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const kathySwap = candidates.find(candidate => candidate.effect?.id === '104030459_swap_activate');
    assert(kathySwap, 'Expected kathy swap candidate to exist');
    assert(kathySwap.paymentRisk?.penalty >= 90, `Expected high turn-plan payment risk, got ${kathySwap.paymentRisk?.penalty}`);
    assert(kathySwap.score < 7.3, `Expected kathy swap below main threshold while blockers are needed, got ${kathySwap.score}`);
  },
}, {
  name: 'adventurer-guild holds low-deck kathy swap without a high-value target against pure-yellow-steel',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 12;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const pureYellowProfile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(pureYellowProfile?.shareCode, 'Missing pure-yellow-steel profile share code');

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const kathy = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.kathy);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 16 }, (_, index) =>
      makeScenarioCard({ id: `KATHY_LOW_DECK_BOT_DECK_${index}`, fullName: `Kathy Low Deck Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = resolveDeck(pureYellowProfile.shareCode).map((card, index) => ({
      ...card,
      gamecardId: `KATHY_LOW_DECK_PURE_YELLOW_${index}_${card.id}`,
      cardlocation: 'DECK',
    }));
    opponent.hand = [];
    opponent.unitZone = [null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'adventurer-guild',
      TEST_PLAYER: 'pure-yellow-steel',
    };
    (opponent as any).botDeckProfileId = 'pure-yellow-steel';

    putUnitForScenario(state, 'BOT_PLAYER', kathy, 0);
    for (let index = 0; index < 3; index += 1) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `KATHY_LOW_DECK_NO_TARGET_${index}`,
        fullName: `Kathy Low Deck No Target ${index}`,
        type: 'UNIT',
        faction: 'TEST',
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const kathySwap = candidates.find(candidate => candidate.effect?.id === '104030459_swap_activate');
    assert(kathySwap, 'Expected kathy swap candidate to exist');
    assert(kathySwap.score < 7.3, `Expected low-deck no-target kathy swap below main threshold, got ${kathySwap.score}`);
    assert(
      kathySwap.notes.some((note: string) => /low deck without a high-value target/.test(note)),
      `Expected low deck no-target note, got ${kathySwap.notes.join(',')}`
    );
  },
}, {
  name: 'adventurer-guild avoids playing kathy when payment taps needed blockers',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 12;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const kathy = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.kathy);
    const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
    const xiaoting = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.xiaoting);

    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [kathy];
    bot.deck = Array.from({ length: 14 }, (_, index) =>
      makeScenarioCard({ id: `KATHY_PLAY_PAYMENT_BOT_DECK_${index}`, fullName: `Kathy Play Payment Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    putUnitForScenario(state, 'BOT_PLAYER', albert, 0);
    putUnitForScenario(state, 'BOT_PLAYER', xiaoting, 1);

    for (let index = 0; index < 3; index += 1) {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `KATHY_PLAY_PAYMENT_ATTACKER_${index}`,
        fullName: `Kathy Play Payment Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage: 3,
        baseDamage: 3,
        playedTurn: 0,
      }), index);
    }

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const playLog = state.aiDecisionLogs?.find(log => log.action === 'PLAY_CARD');
    assert(!playLog, `Expected hard AI not to play Kathy by tapping needed blockers, got ${playLog?.subject || 'unknown card'}`);
    assert(bot.hand.some(card => card.gamecardId === kathy.gamecardId), 'Expected Kathy to remain in hand');
    assert(bot.unitZone.some(card => card?.gamecardId === albert.gamecardId && !card.isExhausted), 'Expected Albert to remain ready as a blocker');
    assert(bot.unitZone.some(card => card?.gamecardId === xiaoting.gamecardId && !card.isExhausted), 'Expected Xiaoting to remain ready as a blocker');
  },
}, {
  name: 'adventurer-guild holds albert cycle in a generic countering window',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 3;
    state.phase = 'COUNTERING';
    state.priorityPlayerId = 'BOT_PLAYER';
    state.isCountering = 1;
    state.counterStack = [{
      ownerUid: 'TEST_PLAYER',
      type: 'EFFECT',
      timestamp: Date.now(),
      card: makeScenarioCard({ id: 'OPPONENT_STACK_SOURCE_ALBERT', fullName: 'Opponent Stack Source', cardlocation: 'PLAY' }),
    }];

    const bot = state.players.BOT_PLAYER;
    bot.isTurn = true;
    bot.unitZone = [null, null, null, null, null];
    const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    const costFiller = makeScenarioCard({ id: 'ALBERT_COUNTERING_COST_FILLER', fullName: 'Cost Filler', cardlocation: 'HAND' });
    putUnitForScenario(state, 'BOT_PLAYER', albert, 0);
    batra.cardlocation = 'GRAVE';
    bot.grave.push(batra);
    bot.hand.push(costFiller);

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const albertCycle = candidates.find(candidate => candidate.effect?.id === '104030415_cycle_adventurer_through_erosion');
    assert(!albertCycle || albertCycle.score < 18, `Expected albert cycle to stay below countering threshold, got ${albertCycle?.score}`);
  },
}, {
  name: 'adventurer-guild holds albert cycle in generic countering even with route pieces',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 5;
    state.phase = 'COUNTERING';
    state.priorityPlayerId = 'BOT_PLAYER';
    state.isCountering = 1;
    state.counterStack = [{
      ownerUid: 'TEST_PLAYER',
      type: 'EFFECT',
      timestamp: Date.now(),
      card: makeScenarioCard({ id: 'OPPONENT_STACK_SOURCE_ALBERT_ROUTE', fullName: 'Opponent Stack Source', cardlocation: 'PLAY' }),
    }];

    const bot = state.players.BOT_PLAYER;
    bot.isTurn = true;
    bot.unitZone = [null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
    const association = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.association);
    const xiaoting = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.xiaoting);
    const hammo = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.hammo);
    const amy = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.amy);
    const batra = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.batra);
    const costFiller = makeScenarioCard({ id: 'ALBERT_ROUTE_COUNTERING_COST_FILLER', fullName: 'Cost Filler', cardlocation: 'HAND' });

    putUnitForScenario(state, 'BOT_PLAYER', albert, 0);
    putItemForScenario(state, 'BOT_PLAYER', association, 0);
    putUnitForScenario(state, 'BOT_PLAYER', xiaoting, 1);
    putUnitForScenario(state, 'BOT_PLAYER', hammo, 2);
    putErosionFrontForScenario(state, 'BOT_PLAYER', amy, 0);
    batra.cardlocation = 'GRAVE';
    bot.grave.push(batra);
    bot.hand.push(costFiller);

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const albertCycle = candidates.find(candidate => candidate.effect?.id === '104030415_cycle_adventurer_through_erosion');
    assert(!albertCycle || albertCycle.score < 18, `Expected route albert cycle to stay below countering threshold, got ${albertCycle?.score}`);
  },
}, {
  name: 'adventurer-guild holds sodo setup in generic countering and battle windows',
  profileId: 'adventurer-guild',
  run: async deck => {
    for (const phase of ['COUNTERING', 'BATTLE_FREE'] as const) {
      const state = await createScenarioState('adventurer-guild', deck);
      state.turnCount = 7;
      state.phase = phase;
      state.priorityPlayerId = 'BOT_PLAYER';
      state.isCountering = phase === 'COUNTERING' ? 1 : 0;
      state.counterStack = phase === 'COUNTERING'
        ? [{
          ownerUid: 'TEST_PLAYER',
          type: 'EFFECT',
          timestamp: Date.now(),
          card: makeScenarioCard({ id: `OPPONENT_STACK_SOURCE_SODO_${phase}`, fullName: 'Opponent Stack Source', cardlocation: 'PLAY' }),
        }]
        : [];

      const bot = state.players.BOT_PLAYER;
      const opponent = state.players.TEST_PLAYER;
      bot.isTurn = true;
      bot.hand = [];
      bot.unitZone = [null, null, null, null, null];
      bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
      opponent.unitZone = [null, null, null, null, null];

      const sodo = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.sodo);
      const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
      const highCostOpponent = makeScenarioCard({
        id: `SODO_HIGH_COST_OPPONENT_${phase}`,
        fullName: 'High Cost Opponent',
        type: 'UNIT',
        cardlocation: 'UNIT',
        acValue: 5,
        power: 5000,
        damage: 3,
      });
      sodo.cardlocation = 'HAND';
      bot.hand.push(sodo);
      putUnitForScenario(state, 'BOT_PLAYER', albert, 0);
      putUnitForScenario(state, 'TEST_PLAYER', highCostOpponent, 0);

      const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
      const sodoSetup = candidates.find(candidate => candidate.effect?.id === 'sodo_to_erosion');
      assert(!sodoSetup || sodoSetup.score < 18, `Expected sodo setup to stay below ${phase} threshold, got ${sodoSetup?.score}`);
    }
  },
}, {
  name: 'adventurer-guild holds sodo draw setup against pure-yellow-steel at low deck',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 9;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const pureYellowProfile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(pureYellowProfile?.shareCode, 'Missing pure-yellow-steel profile share code');

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    const sodo = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.sodo);
    const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 12 }, (_, index) =>
      makeScenarioCard({ id: `SODO_LOW_DECK_BOT_DECK_${index}`, fullName: `Sodo Low Deck Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = resolveDeck(pureYellowProfile.shareCode).map((card, index) => ({
      ...card,
      gamecardId: `SODO_LOW_DECK_PURE_YELLOW_${index}_${card.id}`,
      cardlocation: 'DECK',
    }));
    opponent.hand = [];
    opponent.unitZone = [null, null, null, null, null, null];
    state.botDeckProfiles = {
      ...(state.botDeckProfiles || {}),
      BOT_PLAYER: 'adventurer-guild',
      TEST_PLAYER: 'pure-yellow-steel',
    };
    (opponent as any).botDeckProfileId = 'pure-yellow-steel';

    sodo.cardlocation = 'HAND';
    bot.hand.push(sodo);
    putUnitForScenario(state, 'BOT_PLAYER', albert, 0);

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const sodoSetup = candidates.find(candidate => candidate.effect?.id === 'sodo_to_erosion');
    assert(sodoSetup, 'Expected sodo setup candidate to exist');
    assert(sodoSetup.score < 5.5, `Expected low-deck sodo setup below main threshold, got ${sodoSetup.score}`);
    assert(
      sodoSetup.notes.some((note: string) => /low deck effect risk/.test(note)),
      `Expected low deck risk note, got ${sodoSetup.notes.join(',')}`
    );
  },
}, {
  name: 'adventurer-guild aketi erosion play estimates full AC payment',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    const aketi = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.aketi);
    const playFromErosion = aketi.effects?.find(effect => effect.id === 'aketi_play_from_erosion');
    assert(playFromErosion, 'Expected aketi play-from-erosion effect');

    const paymentCost = ServerGameService.getBotEffectPaymentCost(playFromErosion!);
    assert(paymentCost === 3, `Expected aketi play-from-erosion payment cost 3, got ${paymentCost}`);
  },
}, {
  name: 'adventurer-guild skips aketi goddess bounce when only own battlefield cards exist',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 12;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.isGoddessMode = true;
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.itemZone = [null, null, null, null, null, null];

    const aketi = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.aketi);
    const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
    putUnitForScenario(state, 'BOT_PLAYER', aketi, 0);
    putUnitForScenario(state, 'BOT_PLAYER', albert, 1);
    for (let index = 0; index < 10; index += 1) {
      const filler = makeScenarioCard({ id: `AKETI_BOUNCE_ONLY_OWN_EROSION_${index}`, fullName: `Aketi Bounce Own Erosion ${index}`, cardlocation: 'EROSION_FRONT' });
      putErosionFrontForScenario(state, 'BOT_PLAYER', filler, index);
    }

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const bounce = candidates.find(candidate => candidate.effect?.id === 'aketi_goddess_bounce');
    assert(!bounce || bounce.score < 5.5, `Expected Aketi bounce below main threshold without opponent targets, got ${bounce?.score}`);
  },
}, {
  name: 'adventurer-guild aketi goddess bounce targets opponent cards only',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 12;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.isGoddessMode = true;
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.itemZone = [null, null, null, null, null, null];

    const aketi = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.aketi);
    const albert = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.albert);
    putUnitForScenario(state, 'BOT_PLAYER', aketi, 0);
    putUnitForScenario(state, 'BOT_PLAYER', albert, 1);
    for (let index = 0; index < 10; index += 1) {
      const filler = makeScenarioCard({ id: `AKETI_BOUNCE_TARGET_EROSION_${index}`, fullName: `Aketi Bounce Target Erosion ${index}`, cardlocation: 'EROSION_FRONT' });
      putErosionFrontForScenario(state, 'BOT_PLAYER', filler, index);
    }

    const opponentThreat = makeScenarioCard({
      id: 'AKETI_BOUNCE_OPPONENT_THREAT',
      fullName: 'Opponent Threat',
      type: 'UNIT',
      cardlocation: 'UNIT',
      acValue: 5,
      baseAcValue: 5,
      power: 5000,
      basePower: 5000,
      damage: 4,
      baseDamage: 4,
    });
    const opponentItem = makeScenarioCard({
      id: 'AKETI_BOUNCE_OPPONENT_ITEM',
      fullName: 'Opponent Item',
      type: 'ITEM',
      cardlocation: 'ITEM',
      acValue: 2,
      baseAcValue: 2,
      power: 0,
      basePower: 0,
      damage: 0,
      baseDamage: 0,
    });
    putUnitForScenario(state, 'TEST_PLAYER', opponentThreat, 0);
    putItemForScenario(state, 'TEST_PLAYER', opponentItem, 0);

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const bounce = candidates.find(candidate => candidate.effect?.id === 'aketi_goddess_bounce');
    assert(bounce, 'Expected Aketi bounce candidate when opponent battlefield targets exist');
    assert(bounce.score >= 5.5, `Expected Aketi bounce above main threshold with opponent targets, got ${bounce.score}`);

    const declaredTargets = ServerGameService.chooseBotDeclaredTargetsForEffect(
      state,
      'BOT_PLAYER',
      aketi,
      bounce.effect,
      bounce.effectIndex
    );
    assert(declaredTargets && declaredTargets.length > 0, 'Expected Aketi bounce to declare opponent targets');
    assert(declaredTargets.every(target => target.ownerUid === 'TEST_PLAYER'), `Expected only opponent targets, got ${declaredTargets.map(target => target.ownerUid).join(',')}`);
    assert(declaredTargets.some(target => target.gamecardId === opponentThreat.gamecardId), 'Expected Aketi bounce to include the high-value opponent threat');
    assert(!declaredTargets.some(target => target.gamecardId === albert.gamecardId), 'Expected Aketi bounce not to target own Albert');
  },
}, {
  name: 'hard AI attacks in deck-lethal windows even when the best attacker scores negative',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 8;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 1 }, (_, index) =>
      makeScenarioCard({ id: `DECK_LETHAL_TARGET_DECK_${index}`, fullName: `Deck Card ${index}`, cardlocation: 'DECK' })
    );

    const fragileAttacker = makeScenarioCard({
      id: 'DECK_LETHAL_FRAGILE_ATTACKER',
      fullName: 'Fragile Closing Attacker',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 500,
      basePower: 500,
      damage: 2,
      baseDamage: 2,
      godMark: true,
      playedTurn: 0,
    });
    const strongDefender = makeScenarioCard({
      id: 'DECK_LETHAL_READY_DEFENDER',
      fullName: 'Ready High Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 5000,
      basePower: 5000,
      damage: 4,
      baseDamage: 4,
      playedTurn: 0,
    });

    putUnitForScenario(state, 'BOT_PLAYER', fragileAttacker, 0);
    putUnitForScenario(state, 'TEST_PLAYER', strongDefender, 0);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');
    const phaseAfterEnterBattle: string = state.phase;
    assert(phaseAfterEnterBattle === 'BATTLE_DECLARATION', `Expected bot to enter battle, got ${phaseAfterEnterBattle}`);
    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK' && log.details?.minimumAttackScore === -999);
    assert(attackLog, 'Expected hard AI to attack in a forcing deck-lethal window despite negative attack score');
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected no HOLD_ATTACKERS in forcing deck-lethal window');
  },
}, {
  name: 'pure-yellow-steel stops committed closing attacks once only weak blueprint painters remain into a defender',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 11;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 14 }, (_, index) =>
      makeScenarioCard({ id: `BLUEPRINT_HOLD_BOT_DECK_${index}`, fullName: `Blueprint Hold Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 10 }, (_, index) =>
      makeScenarioCard({ id: `BLUEPRINT_HOLD_OPPONENT_DECK_${index}`, fullName: `Blueprint Hold Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 8; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `BLUEPRINT_HOLD_OPPONENT_EROSION_${index}`,
        fullName: `Blueprint Hold Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const blueprintA = makeScenarioCard({
      id: PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter,
      fullName: '蓝图绘师',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 1000,
      basePower: 1000,
      damage: 1,
      baseDamage: 1,
    });
    const blueprintB = makeScenarioCard({
      id: PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter,
      fullName: '蓝图绘师',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 1000,
      basePower: 1000,
      damage: 1,
      baseDamage: 1,
    });
    const readyDefender = makeScenarioCard({
      id: 'BLUEPRINT_HOLD_READY_DEFENDER',
      fullName: 'Blueprint Hold Ready Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 0,
      baseDamage: 0,
    });

    putUnitForScenario(state, 'BOT_PLAYER', blueprintA, 0);
    putUnitForScenario(state, 'BOT_PLAYER', blueprintB, 1);
    putUnitForScenario(state, 'TEST_PLAYER', readyDefender, 0);
    (bot as any).botClosingAttackTurn = state.turnCount;

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(!attackLog, `Expected weak blueprint painters to be held after closing pressure ended, got ${attackLog?.subject || 'unknown attacker'}`);
    const holdLog = state.aiDecisionLogs?.find(log => log.action === 'HOLD_ATTACKERS');
    assert(holdLog, 'Expected hard AI to hold weak blueprint painters into a ready defender');
    assert(holdLog?.details?.closingAttackCommitted === true, 'Expected the scenario to keep the prior closing commitment');
    assert(holdLog?.details?.closingAttackStillForcing === false, 'Expected exhausted closing pressure not to force weak attacks');
    assert(holdLog?.details?.minimumAttackScore !== -999, `Expected non-forcing threshold, got ${holdLog?.details?.minimumAttackScore}`);
  },
}, {
  name: 'pure-yellow-steel preserves blockers after a low-deck pressure attack is fully covered',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 11;
    state.phase = 'MAIN';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === 'pure-yellow-steel');
    assert(profile, 'Missing pure-yellow-steel profile');
    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 3 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_LOW_DECK_BOT_DECK_${index}`, fullName: `Steel Low Deck Bot ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 18 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_LOW_DECK_OPPONENT_DECK_${index}`, fullName: `Steel Low Deck Opponent ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 3; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_LOW_DECK_BOT_EROSION_${index}`,
        fullName: `Steel Low Deck Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    for (let index = 0; index < 7; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_LOW_DECK_OPPONENT_EROSION_${index}`,
        fullName: `Steel Low Deck Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const steelPuppet = makeScenarioCard({
      id: '105000385',
      fullName: 'Steel Puppet',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3500,
      basePower: 3500,
      damage: 3,
      baseDamage: 3,
      playedTurn: 0,
    });
    const valkyrie = makeScenarioCard({
      id: STEEL_VALKYRIE_CARD_ID,
      fullName: 'Steel Valkyrie',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 3,
      baseDamage: 3,
      playedTurn: 0,
    });
    const readyDefenders = [0, 1].map(index => makeScenarioCard({
      id: `STEEL_LOW_DECK_READY_DEFENDER_${index}`,
      fullName: `Steel Low Deck Ready Defender ${index}`,
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3500,
      basePower: 3500,
      damage: 4,
      baseDamage: 4,
      playedTurn: 0,
    }));

    putUnitForScenario(state, 'BOT_PLAYER', steelPuppet, 0);
    putUnitForScenario(state, 'BOT_PLAYER', valkyrie, 1);
    readyDefenders.forEach((card, index) => putUnitForScenario(state, 'TEST_PLAYER', card, index));
    (bot as any).botClosingAttackStartedTurn = state.turnCount;

    const plan = buildTurnPlan(state, bot, profile);
    assert(plan.mode === 'defense' || plan.mode === 'stabilize', `Expected a defensive low-deck plan, got ${plan.mode}`);
    assert(plan.reserveDefenders >= 2, `Expected plan to reserve both blockers, got ${plan.reserveDefenders}`);
    assert(plan.damageThroughLikelyDefenders === 0, `Expected remaining pressure to be fully covered, got ${plan.damageThroughLikelyDefenders}`);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');
    const phaseAfterReservationCheck: string = state.phase;
    assert(phaseAfterReservationCheck === 'BATTLE_DECLARATION', `Expected bot to re-enter battle for reservation check, got ${phaseAfterReservationCheck}`);
    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(!attackLog, `Expected pure yellow steel to preserve both blockers, got attack ${attackLog?.subject || 'unknown attacker'}`);
    const holdLog = state.aiDecisionLogs?.find(log => log.action === 'HOLD_ATTACKERS');
    assert(holdLog, 'Expected hard AI to hold the remaining steel blockers');
    assert(holdLog?.details?.reservedDefenders === 2, `Expected both steel blockers to be reserved, got ${holdLog?.details?.reservedDefenders}`);
  },
}, {
  name: 'pure-yellow-steel recalculates defender reserves after deck drops before battle',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 11;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 4 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_DYNAMIC_RESERVE_BOT_DECK_${index}`, fullName: `Steel Dynamic Reserve Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 20 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_DYNAMIC_RESERVE_OPPONENT_DECK_${index}`, fullName: `Steel Dynamic Reserve Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 2; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_DYNAMIC_RESERVE_BOT_EROSION_${index}`,
        fullName: `Steel Dynamic Reserve Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    for (let index = 0; index < 9; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_DYNAMIC_RESERVE_OPPONENT_EROSION_${index}`,
        fullName: `Steel Dynamic Reserve Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    [3, 3, 3, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `STEEL_DYNAMIC_RESERVE_ATTACKER_${index}`,
        fullName: `Steel Dynamic Reserve Attacker ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 3500,
        basePower: 3500,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    [3, 2, 2, 2, 1].forEach((damage, index) => {
      putUnitForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_DYNAMIC_RESERVE_READY_THREAT_${index}`,
        fullName: `Steel Dynamic Reserve Ready Threat ${index}`,
        type: 'UNIT',
        cardlocation: 'UNIT',
        power: 4000,
        basePower: 4000,
        damage,
        baseDamage: damage,
        playedTurn: 0,
      }), index);
    });

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const decision = state.aiDecisionLogs?.find(log => log.action === 'ATTACK' || log.action === 'HOLD_ATTACKERS');
    assert(decision, 'Expected hard AI to either attack once while reserving blockers or hold attackers');
    const currentDefendersNeeded = Number(decision?.details?.currentDefendersNeededNextTurn || 0);
    const currentReserveDefenders = Number(decision?.details?.currentReserveDefenders || 0);
    const reservedDefenders = Number(decision?.details?.reservedDefenders || 0);
    assert(currentDefendersNeeded >= 3, `Expected current defender need to be recalculated to at least 3, got ${decision?.details?.currentDefendersNeededNextTurn}`);
    assert(currentReserveDefenders >= 3, `Expected current reserve defenders at least 3, got ${decision?.details?.currentReserveDefenders}`);
    assert(reservedDefenders >= 3, `Expected at least 3 reserved defenders, got ${decision?.details?.reservedDefenders}`);
  },
}, {
  name: 'pure-yellow-steel clears stale defender reserve when blockers are no longer needed',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 8;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 24 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_STALE_RESERVE_BOT_DECK_${index}`, fullName: `Steel Stale Reserve Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.deck = Array.from({ length: 24 }, (_, index) =>
      makeScenarioCard({ id: `STEEL_STALE_RESERVE_OPPONENT_DECK_${index}`, fullName: `Steel Stale Reserve Opponent Deck ${index}`, cardlocation: 'DECK' })
    );
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    for (let index = 0; index < 7; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `STEEL_STALE_RESERVE_OPPONENT_EROSION_${index}`,
        fullName: `Steel Stale Reserve Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const attacker = makeScenarioCard({
      id: 'STEEL_STALE_RESERVE_ATTACKER',
      fullName: 'Steel Stale Reserve Attacker',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 5000,
      basePower: 5000,
      damage: 4,
      baseDamage: 4,
      playedTurn: 0,
    });
    const lowThreat = makeScenarioCard({
      id: 'STEEL_STALE_RESERVE_LOW_THREAT',
      fullName: 'Steel Stale Reserve Low Threat',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 1000,
      basePower: 1000,
      damage: 1,
      baseDamage: 1,
      playedTurn: 0,
    });

    putUnitForScenario(state, 'BOT_PLAYER', attacker, 0);
    putUnitForScenario(state, 'TEST_PLAYER', lowThreat, 0);
    (bot as any).botReservedDefenderTurn = state.turnCount;
    (bot as any).botReservedDefenderIds = [attacker.gamecardId];

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog, 'Expected stale reserve marker to be cleared and the attacker to attack');
    assert(attackLog?.subject?.includes(attacker.fullName), `Expected stale-reserve attacker to attack, got ${attackLog?.subject || 'none'}`);
    assert(attackLog?.details?.reservedDefenders === 0, `Expected no defenders reserved after stale marker is cleared, got ${attackLog?.details?.reservedDefenders}`);
    assert(!(bot as any).botReservedDefenderIds, 'Expected stale defender reserve ids to be cleared');
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected no hold from stale defender reserve');
  },
}, {
  name: 'hard AI sends a pressure attack instead of reserving every attacker at opponent 9 erosion',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 8;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.deck = Array.from({ length: 18 }, (_, index) =>
      makeScenarioCard({ id: `PRESSURE_ATTACK_BOT_DECK_${index}`, fullName: `Bot Deck Card ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 6; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `PRESSURE_ATTACK_BOT_EROSION_${index}`,
        fullName: `Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    for (let index = 0; index < 9; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `PRESSURE_ATTACK_OPPONENT_EROSION_${index}`,
        fullName: `Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const attackers = [0, 1, 2].map(index => makeScenarioCard({
      id: `PRESSURE_ATTACKER_${index}`,
      fullName: `Pressure Attacker ${index}`,
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 1000,
      basePower: 1000,
      damage: 1,
      baseDamage: 1,
      playedTurn: 0,
    }));
    const defenders = [0, 1, 2].map(index => makeScenarioCard({
      id: `PRESSURE_DEFENDER_${index}`,
      fullName: `Pressure Defender ${index}`,
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 5000,
      basePower: 5000,
      damage: 4,
      baseDamage: 4,
      playedTurn: 0,
    }));

    attackers.forEach((card, index) => putUnitForScenario(state, 'BOT_PLAYER', card, index));
    defenders.forEach((card, index) => putUnitForScenario(state, 'TEST_PLAYER', card, index));

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(attackLog, 'Expected hard AI to send one pressure attack at opponent 9 erosion');
    assert(attackLog?.details?.pressureAttackWindow === true, 'Expected pressure attack window to be recorded');
    assert(attackLog?.details?.minimumAttackScore === 12, `Expected pressure attack threshold 12, got ${attackLog?.details?.minimumAttackScore}`);
    assert(!state.aiDecisionLogs?.some(log => log.action === 'HOLD_ATTACKERS'), 'Expected pressure attack window not to reserve every attacker');
  },
}, {
  name: 'adventurer-guild holds hammo low-value attack into a ready defender',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 8;
    state.phase = 'BATTLE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('BOT_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = true;
    opponent.isTurn = false;
    bot.hand = [];
    bot.unitZone = [null, null, null, null, null, null];
    bot.itemZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];
    opponent.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    opponent.erosionBack = [null, null, null, null, null, null, null, null, null, null];

    for (let index = 0; index < 4; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `HAMMO_HOLD_BOT_EROSION_${index}`,
        fullName: `Hammo Hold Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }
    for (let index = 0; index < 8; index++) {
      putErosionFrontForScenario(state, 'TEST_PLAYER', makeScenarioCard({
        id: `HAMMO_HOLD_OPPONENT_EROSION_${index}`,
        fullName: `Hammo Hold Opponent Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const hammo = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.hammo);
    const weakSupport = takeCardById(state, 'BOT_PLAYER', ADVENTURER_GUILD_CARD_IDS.elena);
    const readyDefender = makeScenarioCard({
      id: 'HAMMO_HOLD_READY_DEFENDER',
      fullName: 'Hammo Hold Ready Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 5000,
      basePower: 5000,
      damage: 4,
      baseDamage: 4,
      playedTurn: 0,
    });
    putUnitForScenario(state, 'BOT_PLAYER', hammo, 0);
    hammo.power = 3000;
    hammo.basePower = 3000;
    hammo.damage = 2;
    hammo.baseDamage = 2;
    putUnitForScenario(state, 'BOT_PLAYER', weakSupport, 1);
    weakSupport.power = 1000;
    weakSupport.basePower = 1000;
    weakSupport.damage = 1;
    weakSupport.baseDamage = 1;
    putUnitForScenario(state, 'TEST_PLAYER', readyDefender, 0);

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const attackLog = state.aiDecisionLogs?.find(log => log.action === 'ATTACK');
    assert(!attackLog, `Expected Hammo low-value attack to be held, got ${attackLog?.subject || 'unknown attacker'}`);
    const holdLog = state.aiDecisionLogs?.find(log => log.action === 'HOLD_ATTACKERS');
    assert(holdLog, 'Expected hard AI to hold Hammo rather than attack into a ready defender');
    assert(holdLog?.details?.pressureAttackWindow === true, 'Expected Hammo hold to happen inside the pressure attack window');
    assert(holdLog?.details?.minimumAttackScore === 12, `Expected pressure attack threshold 12, got ${holdLog?.details?.minimumAttackScore}`);
  },
}, {
  name: 'hard AI blocks the current fatal hit even if more attackers remain',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 9;
    state.phase = 'DEFENSE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('TEST_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = false;
    opponent.isTurn = true;
    bot.unitZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    for (let index = 0; index < 7; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `FATAL_BLOCK_EROSION_${index}`,
        fullName: `Fatal Block Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const currentAttacker = makeScenarioCard({
      id: 'FATAL_BLOCK_CURRENT_ATTACKER',
      fullName: 'Current Fatal Attacker',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 4000,
      basePower: 4000,
      damage: 3,
      baseDamage: 3,
      playedTurn: 0,
    });
    const nextAttacker = makeScenarioCard({
      id: 'FATAL_BLOCK_NEXT_ATTACKER',
      fullName: 'Next Fatal Attacker',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 4000,
      basePower: 4000,
      damage: 3,
      baseDamage: 3,
      playedTurn: 0,
    });
    const defender = makeScenarioCard({
      id: 'FATAL_BLOCK_DEFENDER',
      fullName: 'Fatal Block Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 1000,
      basePower: 1000,
      damage: 1,
      baseDamage: 1,
      playedTurn: 0,
    });

    putUnitForScenario(state, 'TEST_PLAYER', currentAttacker, 0);
    putUnitForScenario(state, 'TEST_PLAYER', nextAttacker, 1);
    putUnitForScenario(state, 'BOT_PLAYER', defender, 0);
    state.battleState = {
      attackers: [currentAttacker.gamecardId],
      isAlliance: false,
    };

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const defendLog = state.aiDecisionLogs?.find(log => log.action === 'DEFEND');
    assert(defendLog, 'Expected hard AI to block the current fatal hit');
    assert(state.battleState?.defender === defender.gamecardId, 'Expected the available defender to be declared');
    assert(!state.aiDecisionLogs?.some(log => log.action === 'DECLINE_DEFENSE'), 'Expected no decline when the current hit is fatal');
  },
}, {
  name: 'hard AI blocks current high damage when remaining defenders can cover later attacks',
  profileId: 'adventurer-guild',
  run: async deck => {
    const state = await createScenarioState('adventurer-guild', deck);
    state.turnCount = 10;
    state.phase = 'DEFENSE_DECLARATION';
    state.currentTurnPlayer = state.playerIds.indexOf('TEST_PLAYER') as 0 | 1;

    const bot = state.players.BOT_PLAYER;
    const opponent = state.players.TEST_PLAYER;
    bot.isTurn = false;
    opponent.isTurn = true;
    bot.deck = Array.from({ length: 8 }, (_, index) =>
      makeScenarioCard({ id: `CHAIN_BLOCK_BOT_DECK_${index}`, fullName: `Chain Block Bot Deck ${index}`, cardlocation: 'DECK' })
    );
    bot.unitZone = [null, null, null, null, null, null];
    bot.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    bot.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    opponent.unitZone = [null, null, null, null, null, null];

    for (let index = 0; index < 4; index++) {
      putErosionFrontForScenario(state, 'BOT_PLAYER', makeScenarioCard({
        id: `CHAIN_BLOCK_BOT_EROSION_${index}`,
        fullName: `Chain Block Bot Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      }), index);
    }

    const currentAttacker = makeScenarioCard({
      id: 'CHAIN_BLOCK_CURRENT_ATTACKER',
      fullName: 'Current High Damage Attacker',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 4000,
      basePower: 4000,
      damage: 4,
      baseDamage: 4,
      playedTurn: 0,
    });
    const nextAttackerA = makeScenarioCard({
      id: 'CHAIN_BLOCK_NEXT_ATTACKER_A',
      fullName: 'Next Attacker A',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 4,
      baseDamage: 4,
      playedTurn: 0,
    });
    const nextAttackerB = makeScenarioCard({
      id: 'CHAIN_BLOCK_NEXT_ATTACKER_B',
      fullName: 'Next Attacker B',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3000,
      basePower: 3000,
      damage: 3,
      baseDamage: 3,
      playedTurn: 0,
    });
    const currentBlocker = makeScenarioCard({
      id: 'CHAIN_BLOCK_CURRENT_BLOCKER',
      fullName: 'Current Blocker',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3500,
      basePower: 3500,
      damage: 2,
      baseDamage: 2,
      playedTurn: 0,
    });
    const futureBlocker = makeScenarioCard({
      id: 'CHAIN_BLOCK_FUTURE_BLOCKER',
      fullName: 'Future Blocker',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3500,
      basePower: 3500,
      damage: 2,
      baseDamage: 2,
      playedTurn: 0,
    });

    putUnitForScenario(state, 'TEST_PLAYER', currentAttacker, 0);
    putUnitForScenario(state, 'TEST_PLAYER', nextAttackerA, 1);
    putUnitForScenario(state, 'TEST_PLAYER', nextAttackerB, 2);
    putUnitForScenario(state, 'BOT_PLAYER', currentBlocker, 0);
    putUnitForScenario(state, 'BOT_PLAYER', futureBlocker, 1);
    state.battleState = {
      attackers: [currentAttacker.gamecardId],
      isAlliance: false,
    };

    await ServerGameService.botMoveForPlayer(state, 'BOT_PLAYER');

    const defendLog = state.aiDecisionLogs?.find(log => log.action === 'DEFEND');
    assert(defendLog, 'Expected hard AI to block the current high-damage attack');
    assert(state.battleState?.defender === currentBlocker.gamecardId || state.battleState?.defender === futureBlocker.gamecardId, 'Expected one available defender to be declared');
    assert(!state.aiDecisionLogs?.some(log => log.action === 'DECLINE_DEFENSE'), 'Expected no decline when blocking current hit preserves a survival path');
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
}, {
  name: 'pure-yellow-steel holds steel valkyrie boost without immediate combat payoff',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 5;
    state.phase = 'MAIN';

    const valkyrie = takeCardById(state, 'BOT_PLAYER', STEEL_VALKYRIE_CARD_ID);
    const sacrificeItem = makeScenarioCard({
      id: 'VALKYRIE_LOW_VALUE_ITEM',
      fullName: 'Low Value Item',
      type: 'ITEM',
      cardlocation: 'ITEM',
      acValue: 1,
      color: 'YELLOW',
    });
    const smallDefender = makeScenarioCard({
      id: 'VALKYRIE_SMALL_DEFENDER',
      fullName: 'Small Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 2000,
      basePower: 2000,
      damage: 1,
    });

    putUnitForScenario(state, 'BOT_PLAYER', valkyrie, 0);
    putItemForScenario(state, 'BOT_PLAYER', sacrificeItem, 0);
    putUnitForScenario(state, 'TEST_PLAYER', smallDefender, 0);
    state.players.TEST_PLAYER.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    state.players.TEST_PLAYER.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    state.players.TEST_PLAYER.deck = Array.from({ length: 20 }, (_, index) =>
      makeScenarioCard({ id: `VALKYRIE_SAFE_DECK_${index}`, fullName: `Safe Deck ${index}`, cardlocation: 'DECK' })
    );

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const valkyrieBoost = candidates.find(candidate => candidate.effect?.id === STEEL_VALKYRIE_BOOST_EFFECT_ID);
    assert(valkyrieBoost && valkyrieBoost.score < 7.2, `Expected valkyrie boost below main threshold, got ${valkyrieBoost?.score}`);
  },
}, {
  name: 'pure-yellow-steel uses steel valkyrie boost when it creates annihilation pressure',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 5;
    state.phase = 'MAIN';

    const valkyrie = takeCardById(state, 'BOT_PLAYER', STEEL_VALKYRIE_CARD_ID);
    const sacrificeItem = makeScenarioCard({
      id: 'VALKYRIE_PRESSURE_ITEM',
      fullName: 'Pressure Item',
      type: 'ITEM',
      cardlocation: 'ITEM',
      acValue: 1,
      color: 'YELLOW',
    });
    const keyDefender = makeScenarioCard({
      id: 'VALKYRIE_3500_DEFENDER',
      fullName: '3500 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3500,
      basePower: 3500,
      damage: 2,
    });

    putUnitForScenario(state, 'BOT_PLAYER', valkyrie, 0);
    putItemForScenario(state, 'BOT_PLAYER', sacrificeItem, 0);
    putUnitForScenario(state, 'TEST_PLAYER', keyDefender, 0);
    state.players.TEST_PLAYER.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    state.players.TEST_PLAYER.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    for (let index = 0; index < 8; index += 1) {
      state.players.TEST_PLAYER.erosionFront[index] = makeScenarioCard({
        id: `VALKYRIE_PRESSURE_EROSION_${index}`,
        fullName: `Pressure Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      });
    }

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const valkyrieBoost = candidates.find(candidate => candidate.effect?.id === STEEL_VALKYRIE_BOOST_EFFECT_ID);
    assert(valkyrieBoost && valkyrieBoost.score >= 7.2, `Expected valkyrie boost above main threshold, got ${valkyrieBoost?.score}`);
  },
}, {
  name: 'pure-yellow-steel holds steel valkyrie boost when valkyrie cannot attack this turn',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 5;
    state.phase = 'MAIN';

    const valkyrie = takeCardById(state, 'BOT_PLAYER', STEEL_VALKYRIE_CARD_ID);
    const sacrificeItem = makeScenarioCard({
      id: 'VALKYRIE_SUMMON_LOCK_ITEM',
      fullName: 'Summon Lock Item',
      type: 'ITEM',
      cardlocation: 'ITEM',
      acValue: 1,
      color: 'YELLOW',
    });
    const keyDefender = makeScenarioCard({
      id: 'VALKYRIE_SUMMON_LOCK_3500_DEFENDER',
      fullName: 'Summon Lock 3500 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3500,
      basePower: 3500,
      damage: 2,
    });

    putUnitForScenario(state, 'BOT_PLAYER', valkyrie, 0);
    valkyrie.playedTurn = state.turnCount;
    valkyrie.isrush = false;
    putItemForScenario(state, 'BOT_PLAYER', sacrificeItem, 0);
    putUnitForScenario(state, 'TEST_PLAYER', keyDefender, 0);
    state.players.TEST_PLAYER.erosionFront = [null, null, null, null, null, null, null, null, null, null];
    state.players.TEST_PLAYER.erosionBack = [null, null, null, null, null, null, null, null, null, null];
    for (let index = 0; index < 8; index += 1) {
      state.players.TEST_PLAYER.erosionFront[index] = makeScenarioCard({
        id: `VALKYRIE_SUMMON_LOCK_EROSION_${index}`,
        fullName: `Summon Lock Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      });
    }

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const valkyrieBoost = candidates.find(candidate => candidate.effect?.id === STEEL_VALKYRIE_BOOST_EFFECT_ID);
    assert(valkyrieBoost && valkyrieBoost.score < 7.2, `Expected summon-locked valkyrie boost below main threshold, got ${valkyrieBoost?.score}`);
    assert(
      valkyrieBoost.notes?.some((note: string) => note.includes('waits until valkyrie can attack')),
      `Expected summon-locked valkyrie note, got ${valkyrieBoost.notes?.join(',') || 'none'}`
    );
  },
}, {
  name: 'pure-yellow-steel holds steel valkyrie boost in generic countering windows',
  profileId: 'pure-yellow-steel',
  run: async deck => {
    const state = await createScenarioState('pure-yellow-steel', deck);
    state.turnCount = 5;
    state.phase = 'COUNTERING';
    state.priorityPlayerId = 'BOT_PLAYER';
    state.isCountering = 1;
    state.counterStack = [{
      ownerUid: 'TEST_PLAYER',
      type: 'EFFECT',
      timestamp: Date.now(),
      card: makeScenarioCard({ id: 'VALKYRIE_COUNTER_SOURCE', fullName: 'Counter Source', cardlocation: 'PLAY' }),
    }];

    const valkyrie = takeCardById(state, 'BOT_PLAYER', STEEL_VALKYRIE_CARD_ID);
    const sacrificeItem = makeScenarioCard({
      id: 'VALKYRIE_COUNTER_ITEM',
      fullName: 'Counter Item',
      type: 'ITEM',
      cardlocation: 'ITEM',
      acValue: 1,
      color: 'YELLOW',
    });
    const keyDefender = makeScenarioCard({
      id: 'VALKYRIE_COUNTER_3500_DEFENDER',
      fullName: 'Counter 3500 Defender',
      type: 'UNIT',
      cardlocation: 'UNIT',
      power: 3500,
      basePower: 3500,
      damage: 2,
    });

    putUnitForScenario(state, 'BOT_PLAYER', valkyrie, 0);
    putItemForScenario(state, 'BOT_PLAYER', sacrificeItem, 0);
    putUnitForScenario(state, 'TEST_PLAYER', keyDefender, 0);
    for (let index = 0; index < 8; index += 1) {
      state.players.TEST_PLAYER.erosionFront[index] = makeScenarioCard({
        id: `VALKYRIE_COUNTER_EROSION_${index}`,
        fullName: `Counter Erosion ${index}`,
        cardlocation: 'EROSION_FRONT',
      });
    }

    const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT_PLAYER') as any[];
    const valkyrieBoost = candidates.find(candidate => candidate.effect?.id === STEEL_VALKYRIE_BOOST_EFFECT_ID);
    assert(!valkyrieBoost || valkyrieBoost.score < 18, `Expected valkyrie boost below countering threshold, got ${valkyrieBoost?.score}`);
  },
}];

await initServerCardLibrary();

await runFixedOpeningScenario({
  profileId: 'adventurer-guild',
  expectedShareCode: 'GihIjIjYOVY1kX2fdZtTRgFcWXj6dQw',
  defaultOpeningCardIds: ADVENTURER_GUILD_DEFAULT_OPENING_CARD_IDS,
  firstTurnPlayCardIds: ADVENTURER_GUILD_FIRST_TURN_PLAY_CARD_IDS,
});

await runSelfPlayOpeningScenario({
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

await runSelfPlayOpeningScenario({
  profileId: 'pure-yellow-steel',
  expectedShareCode: 'GihIjIjYGTovnjmfgpP_JeoLo_uA',
  defaultOpeningCardIds: PURE_YELLOW_STEEL_DEFAULT_OPENING_CARD_IDS,
  firstTurnPlayCardIds: PURE_YELLOW_STEEL_FIRST_TURN_PLAY_CARD_IDS,
});

for (const regression of regressionCases) {
  await runRegressionCase(regression);
}

console.log('困难 AI 卡组与首回合固定展开测试通过。');
