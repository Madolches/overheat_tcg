import {
  buildTurnPlan,
  applyOpeningHandSoftCompensation,
  chooseAttacker,
  chooseDefender,
  choosePlayableCard,
  chooseQuerySelections,
  canUnitAttack,
  countPendingUnitReturnSlots,
  isClosingTurnPlan,
  scoreAttackCandidate,
  scoreActivatableEffect,
  scorePlayableCard,
  scorePaymentSacrificeValue,
  scorePaymentExhaustValue,
} from '../server/ai/hardStrategy';
import { AI_DECK_PROFILES, getDeckAiProfile } from '../server/ai/deckProfiles';
import { scoreEffectTimingWindow } from '../server/ai/effectTimingKnowledge';
import { inferPlayerDeckProfile } from '../server/ai/playerDeckProfile';
import { getComboAllianceAttack, KNOWN_COMBO_CARD_IDS } from '../server/ai/comboKnowledge';
import { ServerGameService } from '../server/ServerGameService';
import dikaiCardScript from '../src/scripts/102050432';
import { initServerCardLibrary, loadServerCards, SERVER_CARD_LIBRARY } from '../server/card_loader';
import { decodeDeckShareCode } from '../src/lib/deckShareCode';

type ScenarioResult = {
  name: string;
  passed: boolean;
  detail: string;
};

type ScenarioRun = () => ScenarioResult | Promise<ScenarioResult>;

let seq = 0;

function unit(overrides: Record<string, any> = {}) {
  seq += 1;
  const id = overrides.id || `TEST_UNIT_${seq}`;
  return {
    id,
    uniqueId: overrides.uniqueId || `${id}:N`,
    gamecardId: overrides.gamecardId || `${id}_${seq}`,
    fullName: overrides.fullName || id,
    type: 'UNIT',
    color: overrides.color || 'WHITE',
    cardlocation: 'UNIT',
    power: overrides.power ?? 1000,
    basePower: overrides.basePower ?? overrides.power ?? 1000,
    damage: overrides.damage ?? 1,
    baseDamage: overrides.baseDamage ?? overrides.damage ?? 1,
    acValue: overrides.acValue ?? 1,
    baseAcValue: overrides.baseAcValue ?? overrides.acValue ?? 1,
    canAttack: overrides.canAttack ?? true,
    isExhausted: overrides.isExhausted ?? false,
    playedTurn: overrides.playedTurn ?? 1,
    godMark: !!overrides.godMark,
    effects: overrides.effects || [],
    ...overrides,
  };
}

function story(overrides: Record<string, any> = {}) {
  seq += 1;
  const id = overrides.id || `TEST_STORY_${seq}`;
  return {
    id,
    uniqueId: overrides.uniqueId || `${id}:N`,
    gamecardId: overrides.gamecardId || `${id}_${seq}`,
    fullName: overrides.fullName || id,
    type: 'STORY',
    color: overrides.color || 'WHITE',
    cardlocation: overrides.cardlocation || 'HAND',
    acValue: overrides.acValue ?? 1,
    baseAcValue: overrides.baseAcValue ?? overrides.acValue ?? 1,
    effects: overrides.effects || [],
    ...overrides,
  };
}

function effect(overrides: Record<string, any> = {}) {
  seq += 1;
  return {
    id: overrides.id || `TEST_EFFECT_${seq}`,
    type: overrides.type || 'ACTIVATE',
    description: overrides.description || '',
    content: overrides.content || '',
    ...overrides,
  };
}

function deckCards(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => story({
    id: `${prefix}_${index}`,
    gamecardId: `${prefix}_${index}`,
    cardlocation: 'DECK',
  }));
}

function erosionCards(count: number, prefix: string) {
  return deckCards(count, prefix).map(card => ({ ...card, cardlocation: 'EROSION_BACK' }));
}

function player(uid: string, overrides: Record<string, any> = {}) {
  return {
    uid,
    displayName: uid,
    deck: overrides.deck || deckCards(20, `${uid}_D`),
    hand: overrides.hand || [],
    grave: overrides.grave || [],
    exile: overrides.exile || [],
    unitZone: overrides.unitZone || [null, null, null, null, null, null],
    itemZone: overrides.itemZone || [],
    erosionFront: overrides.erosionFront || [],
    erosionBack: overrides.erosionBack || [],
    playZone: overrides.playZone || [],
    isTurn: overrides.isTurn ?? uid === 'BOT',
    isFirst: false,
    mulliganDone: true,
    hasExhaustedThisTurn: [],
    timeRemaining: 0,
    ...overrides,
  };
}

function game(botOverrides: Record<string, any> = {}, opponentOverrides: Record<string, any> = {}, stateOverrides: Record<string, any> = {}) {
  const bot = player('BOT', botOverrides);
  const opponent = player('P1', { isTurn: false, ...opponentOverrides });
  return {
    gameId: 'hard_ai_scenario',
    phase: stateOverrides.phase || 'MAIN',
    currentTurnPlayer: 0,
    turnCount: stateOverrides.turnCount ?? 5,
    playerIds: ['BOT', 'P1'],
    players: {
      BOT: bot,
      P1: opponent,
    },
    counterStack: [],
    passCount: 0,
    gameStatus: 1,
    logs: [],
    triggeredEffectsQueue: [],
    pendingResolutions: [],
    ...stateOverrides,
  } as any;
}

function assertScenario(name: string, condition: boolean, detail: string): ScenarioResult {
  return { name, passed: condition, detail };
}

function testLethalTurnPlan(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const attackerA = unit({ damage: 2, power: 2000, playedTurn: 1 });
  const attackerB = unit({ damage: 1, power: 1000, playedTurn: 1 });
  const state = game(
    { unitZone: [attackerA, attackerB, null, null, null, null] },
    { deck: deckCards(2, 'P1_LOW'), erosionFront: [], erosionBack: [] }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  return assertScenario(
    'lethal turn plan attacks before developing',
    plan.mode === 'lethal' && plan.attackBeforeDeveloping && plan.reserveDefenders === 0,
    `mode=${plan.mode}, attackBeforeDeveloping=${plan.attackBeforeDeveloping}, reserve=${plan.reserveDefenders}`
  );
}

function testSmileEclipseCombo(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const smile = unit({
    id: KNOWN_COMBO_CARD_IDS.smileKoriel,
    uniqueId: `${KNOWN_COMBO_CARD_IDS.smileKoriel}:N`,
    fullName: 'Smile Koriel',
    damage: 1,
    color: 'WHITE',
    playedTurn: 1,
    godMark: true,
  });
  const partner = unit({
    id: 'WHITE_PARTNER',
    fullName: 'White Partner',
    damage: 2,
    power: 2500,
    color: 'WHITE',
    playedTurn: 1,
  });
  const eclipse = story({
    id: KNOWN_COMBO_CARD_IDS.eclipse,
    uniqueId: `${KNOWN_COMBO_CARD_IDS.eclipse}:N`,
    fullName: 'Eclipse',
    effects: [{ id: KNOWN_COMBO_CARD_IDS.eclipseEffect, type: 'ACTIVATE', description: 'combo board wipe' }],
  });
  const state = game(
    {
      hand: [eclipse],
      unitZone: [smile, partner, null, null, null, null],
      erosionBack: deckCards(3, 'BOT_BACK').map(card => ({ ...card, cardlocation: 'EROSION_BACK' })),
    },
    {},
    { phase: 'BATTLE_DECLARATION' }
  );
  const plan = getComboAllianceAttack(state, state.players.BOT, profile, [smile, partner] as any);
  return assertScenario(
    'smile alliance eclipse chooses protected alliance attack',
    !!plan && plan.attackers.some(card => card.id === KNOWN_COMBO_CARD_IDS.smileKoriel),
    plan ? `attackers=${plan.attackers.map(card => card.id).join(',')}` : 'no combo alliance plan'
  );
}

function testSmileKorielProtectedAllianceWithoutEclipse(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const smile = unit({
    id: KNOWN_COMBO_CARD_IDS.smileKoriel,
    uniqueId: `${KNOWN_COMBO_CARD_IDS.smileKoriel}:N`,
    fullName: 'Smile Koriel',
    damage: 1,
    power: 2000,
    color: 'WHITE',
    playedTurn: 1,
    godMark: true,
  });
  const partner = unit({
    id: 'WHITE_PARTNER_NO_ECLIPSE',
    fullName: 'White Protected Partner',
    damage: 2,
    power: 2500,
    color: 'WHITE',
    playedTurn: 1,
  });
  const blocker = unit({
    id: 'P1_READY_BLOCKER',
    fullName: 'Ready Blocker',
    damage: 1,
    power: 3000,
    color: 'RED',
    playedTurn: 1,
  });
  const state = game(
    {
      hand: [],
      unitZone: [smile, partner, null, null, null, null],
    },
    {
      unitZone: [blocker, null, null, null, null, null],
    },
    { phase: 'BATTLE_DECLARATION' }
  );
  const plan = getComboAllianceAttack(state, state.players.BOT, profile, [smile, partner] as any);
  return assertScenario(
    'smile koriel chooses protected white alliance even without eclipse',
    !!plan &&
      plan.attackers.some(card => card.id === KNOWN_COMBO_CARD_IDS.smileKoriel) &&
      plan.attackers.some(card => card.gamecardId === partner.gamecardId),
    plan ? `attackers=${plan.attackers.map(card => card.id).join(',')}` : 'no protected alliance plan'
  );
}

function testProtectHighValueFromSelfDestroy(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const god = unit({ id: 'GOD_VALUE', fullName: 'God Value', godMark: true, power: 5000, damage: 2 });
  const low = unit({ id: 'LOW_VALUE', fullName: 'Low Value', power: 500, damage: 0 });
  const state = game({ unitZone: [god, low, null, null, null, null] });
  const query = {
    id: 'destroy_own',
    type: 'SELECT_CARD',
    playerUid: 'BOT',
    title: 'destroy unit',
    description: 'destroy selected unit',
    callbackKey: 'DUMMY_DESTROY_UNIT',
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: 'dummy_destroy', step: 'DESTROY_UNIT' },
    options: [
      { card: god, isMine: true },
      { card: low, isMine: true },
    ],
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'self destructive query preserves god/high value unit',
    selected[0] === low.gamecardId,
    `selected=${selected.join(',') || 'none'}`
  );
}

function testOnlyHighValueSelfDestroyAborts(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const god = unit({ id: 'ONLY_GOD_VALUE', fullName: 'Only God Value', godMark: true, power: 5000, damage: 2 });
  const state = game({ unitZone: [god, null, null, null, null, null] });
  const query = {
    id: 'destroy_only_god',
    type: 'SELECT_CARD',
    playerUid: 'BOT',
    title: 'destroy unit',
    description: 'destroy selected unit',
    callbackKey: 'DUMMY_DESTROY_UNIT',
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: 'dummy_destroy', step: 'DESTROY_UNIT' },
    options: [{ card: god, isMine: true }],
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'only high value self destruction aborts instead of sacrificing key unit',
    selected.length === 0,
    `selected=${selected.join(',') || 'none'}`
  );
}

function testElementInstructorAvoidsDestroyMode(): ScenarioResult {
  const profile = getDeckAiProfile('yellow-alchemy');
  const ownWeak = unit({ id: 'OWN_WEAK', power: 1000, damage: 1 });
  const state = game({ unitZone: [ownWeak, null, null, null, null, null] });
  const query = {
    id: 'element_mode',
    type: 'SELECT_CHOICE',
    playerUid: 'BOT',
    title: 'choose mode',
    description: 'choose effect mode',
    callbackKey: 'DECLARE_EFFECT_TARGET_MODE',
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '105110112_activate', step: 'CHOOSE_MODE' },
    options: [
      { id: 'DRAW', label: 'DRAW' },
      { id: 'DAMAGE', label: 'DAMAGE' },
      { id: 'DESTROY', label: 'DESTROY' },
    ],
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'element instructor avoids destroy mode when only own weak unit exists',
    selected[0] !== 'DESTROY',
    `selected=${selected.join(',') || 'none'}`
  );
}

function testEffectTimingWindows(): ScenarioResult {
  const card = unit({ id: 'TIMING_SOURCE', effects: [] });
  const drawEffect = { id: 'draw_test', type: 'ACTIVATE', description: 'draw 1 card search deck', content: 'DRAW_CARD SEARCH_DECK' };
  const combatEffect = { id: 'combat_test', type: 'ACTIVATE', description: 'add power during battle and prevent destroy', content: 'ADD_POWER PREVENT COMBAT' };
  const mainState = game({ unitZone: [card, null, null, null, null, null] }, {}, { phase: 'MAIN' });
  const battleState = game(
    { unitZone: [card, null, null, null, null, null] },
    {},
    { phase: 'BATTLE_FREE', battleState: { attackers: [card.gamecardId] } }
  );
  const drawMain = scoreEffectTimingWindow(mainState, mainState.players.BOT, card as any, drawEffect as any).score;
  const drawBattle = scoreEffectTimingWindow(battleState, battleState.players.BOT, card as any, drawEffect as any).score;
  const combatBattle = scoreEffectTimingWindow(battleState, battleState.players.BOT, card as any, combatEffect as any).score;
  return assertScenario(
    'effect timing prefers setup in main and combat in battle',
    drawMain > 0 && drawBattle < 0 && combatBattle > 0 && combatBattle > drawBattle,
    `drawMain=${drawMain}, drawBattle=${drawBattle}, combatBattle=${combatBattle}`
  );
}

function testBattleFreeHoldsSetupStory(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const attacker = unit({ id: 'BATTLE_ATTACKER', damage: 1, playedTurn: 1 });
  const setupStory = story({
    id: 'SETUP_STORY',
    fullName: 'Setup Story',
    effects: [{
      id: 'setup_story_draw',
      type: 'ACTIVATE',
      description: 'draw 1 card and search the deck',
      content: 'DRAW_CARD SEARCH_DECK',
    }],
  });
  const state = game(
    { hand: [setupStory], unitZone: [attacker, null, null, null, null, null] },
    {},
    { phase: 'BATTLE_FREE', battleState: { attackers: [attacker.gamecardId] } }
  );
  const score = scorePlayableCard(state, state.players.BOT, setupStory as any, profile);
  return assertScenario(
    'battle free holds setup/draw story without combo purpose',
    score < 0,
    `score=${score.toFixed(1)}`
  );
}

function testMainRemovalStoryNeedsTarget(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const removalStory = story({
    id: 'TARGETLESS_REMOVAL_STORY',
    fullName: 'Targetless Removal Story',
    effects: [{
      id: 'targetless_destroy',
      type: 'ACTIVATE',
      description: 'destroy target opponent unit',
      content: 'DESTROY_UNIT',
      targetSpec: {
        title: 'choose opponent unit',
        description: 'destroy target opponent unit',
        minSelections: 1,
        maxSelections: 1,
        zones: ['UNIT'],
        controller: 'OPPONENT',
        getCandidates: (gameState: any, playerState: any) =>
          gameState.players[gameState.playerIds.find((uid: string) => uid !== playerState.uid)].unitZone
            .filter(Boolean)
            .map((card: any) => ({ card, source: 'UNIT' })),
      },
    }],
  });
  const state = game({ hand: [removalStory] }, { unitZone: [null, null, null, null, null, null] }, { phase: 'MAIN' });
  const score = scorePlayableCard(state, state.players.BOT, removalStory as any, profile);
  return assertScenario(
    'main removal story is held when there is no opposing target',
    score < 0,
    `score=${score.toFixed(1)}`
  );
}

function testBattleCombatStoryBeatsSetupStory(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const attacker = unit({ id: 'COMBAT_ATTACKER', damage: 2, playedTurn: 1 });
  const combatStory = story({
    id: 'COMBAT_STORY',
    fullName: 'Combat Story',
    effects: [{
      id: 'combat_story_boost',
      type: 'ACTIVATE',
      description: 'during battle add power prevent destroy and add damage',
      content: 'COMBAT ADD_POWER PREVENT ADD_DAMAGE',
    }],
  });
  const setupStory = story({
    id: 'BATTLE_SETUP_STORY',
    fullName: 'Battle Setup Story',
    effects: [{
      id: 'battle_setup_draw',
      type: 'ACTIVATE',
      description: 'draw and search deck',
      content: 'DRAW_CARD SEARCH_DECK',
    }],
  });
  const state = game(
    {
      hand: [combatStory, setupStory],
      unitZone: [attacker, null, null, null, null, null],
    },
    {},
    { phase: 'BATTLE_FREE', battleState: { attackers: [attacker.gamecardId] } }
  );
  const combatScore = scorePlayableCard(state, state.players.BOT, combatStory as any, profile);
  const setupScore = scorePlayableCard(state, state.players.BOT, setupStory as any, profile);
  return assertScenario(
    'battle story discipline prefers combat trick over setup story',
    combatScore > 0 && combatScore > setupScore + 40,
    `combat=${combatScore.toFixed(1)}, setup=${setupScore.toFixed(1)}`
  );
}

function testEclipseWaitsForProtectedAllianceWindow(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const smile = unit({
    id: KNOWN_COMBO_CARD_IDS.smileKoriel,
    uniqueId: `${KNOWN_COMBO_CARD_IDS.smileKoriel}:N`,
    fullName: 'Smile Koriel',
    damage: 1,
    color: 'WHITE',
    playedTurn: 1,
    godMark: true,
  });
  const partner = unit({ id: 'ECLIPSE_PARTNER', fullName: 'White Partner', damage: 2, color: 'WHITE', playedTurn: 1 });
  const eclipseEffect = effect({
    id: KNOWN_COMBO_CARD_IDS.eclipseEffect,
    description: 'combo board wipe destroy all opponent units',
    content: 'DESTROY_CARD COMBO',
  });
  const eclipse = story({
    id: KNOWN_COMBO_CARD_IDS.eclipse,
    uniqueId: `${KNOWN_COMBO_CARD_IDS.eclipse}:N`,
    fullName: 'Eclipse',
    effects: [eclipseEffect],
  });
  const opponentA = unit({ id: 'ECLIPSE_TARGET_A', power: 2500, damage: 2 });
  const opponentB = unit({ id: 'ECLIPSE_TARGET_B', power: 1500, damage: 1 });
  const mainState = game(
    {
      hand: [eclipse],
      unitZone: [smile, partner, null, null, null, null],
      erosionBack: erosionCards(3, 'BOT_ECLIPSE_MAIN'),
    },
    { unitZone: [opponentA, opponentB, null, null, null, null] },
    { phase: 'MAIN' }
  );
  const battleState = game(
    {
      hand: [eclipse],
      unitZone: [smile, partner, null, null, null, null],
      erosionBack: erosionCards(3, 'BOT_ECLIPSE_BATTLE'),
    },
    { unitZone: [opponentA, opponentB, null, null, null, null] },
    {
      phase: 'BATTLE_FREE',
      battleState: { isAlliance: true, attackers: [smile.gamecardId, partner.gamecardId] },
    }
  );
  const mainPlayable = scorePlayableCard(mainState, mainState.players.BOT, eclipse as any, profile);
  const battleEffect = scoreActivatableEffect(
    battleState,
    battleState.players.BOT,
    eclipse as any,
    eclipseEffect as any,
    profile,
    { opponent: battleState.players.P1, targetCount: 2, hasTargetSpec: false }
  ).score;
  return assertScenario(
    'eclipse waits for protected smile alliance window',
    mainPlayable < 0 && battleEffect > 80 && battleEffect > mainPlayable + 100,
    `mainPlayable=${mainPlayable.toFixed(1)}, battleEffect=${battleEffect.toFixed(1)}`
  );
}

function testBlueCounterStoryRequiresCounterWindow(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const counterEffect = effect({
    id: '204000145_counter_silence',
    description: 'counter target effect and silence it',
    content: 'COUNTER_EFFECT SILENCE',
  });
  const counterStory = story({
    id: '204000145',
    fullName: 'Counter Silence Story',
    color: 'BLUE',
    effects: [counterEffect],
  });
  const mainState = game({ hand: [counterStory] }, {}, { phase: 'MAIN' });
  const counterState = game({ hand: [counterStory] }, {}, { phase: 'COUNTERING', currentTurnPlayer: 1 });
  const mainScore = scorePlayableCard(mainState, mainState.players.BOT, counterStory as any, profile);
  const counterScore = scoreActivatableEffect(
    counterState,
    counterState.players.BOT,
    counterStory as any,
    counterEffect as any,
    profile,
    { opponent: counterState.players.P1, targetCount: 1, hasTargetSpec: true }
  ).score;
  return assertScenario(
    'blue counter story is held outside counter window',
    mainScore < 0 && counterScore > 20 && counterScore > mainScore + 40,
    `main=${mainScore.toFixed(1)}, counter=${counterScore.toFixed(1)}`
  );
}

async function testHardAiUsesConfrontationStory(): Promise<ScenarioResult> {
  const counterEffect = effect({
    id: '204000145_counter_silence',
    description: 'counter target effect and silence it',
    content: 'COUNTER_EFFECT SILENCE',
  });
  const counterStory = story({
    id: '204000145',
    fullName: 'Counter Silence Story',
    color: 'BLUE',
    acValue: 0,
    baseAcValue: 0,
    effects: [counterEffect],
  });
  const opponentSource = story({
    id: 'P1_STACK_STORY',
    gamecardId: 'P1_STACK_STORY',
    fullName: 'Opponent Stack Story',
    cardlocation: 'PLAY',
    effects: [effect({ id: 'p1_stack_effect', type: 'ACTIVATE', description: 'opponent stack effect' })],
  });
  const state = game(
    { isTurn: false, hand: [counterStory], botDifficulty: 'hard', botDeckProfileId: 'blue-adventurer' },
    { isTurn: true, playZone: [opponentSource] },
    {
      phase: 'COUNTERING',
      previousPhase: 'MAIN',
      currentTurnPlayer: 1,
      priorityPlayerId: 'BOT',
      botDifficulty: 'hard',
      counterStack: [{ card: opponentSource, ownerUid: 'P1', type: 'PLAY', timestamp: Date.now() }],
    }
  );

  const used = await ServerGameService.tryUseBotConfrontationAction(state, 'BOT', 18);
  const action = state.aiDecisionLogs?.at(-1)?.action;
  return assertScenario(
    'hard AI uses high-value story in confrontation',
    used && action === 'PLAY_CONFRONTATION_STORY' && state.phase === 'COUNTERING' && state.priorityPlayerId === 'P1' && state.counterStack.length === 2,
    `used=${used}, action=${action}, priority=${state.priorityPlayerId}, stack=${state.counterStack.length}`
  );
}

async function testHardAiPassesLowValueConfrontationStory(): Promise<ScenarioResult> {
  const setupStory = story({
    id: 'LOW_VALUE_SETUP_STORY',
    fullName: 'Low Value Setup Story',
    acValue: 0,
    baseAcValue: 0,
    effects: [effect({
      id: 'low_value_setup_draw',
      type: 'ACTIVATE',
      description: 'draw 1 card and search deck for setup',
      content: 'DRAW_CARD SEARCH_DECK RESOURCE SETUP',
    })],
  });
  const state = game(
    { isTurn: false, hand: [setupStory], botDifficulty: 'hard', botDeckProfileId: 'blue-adventurer' },
    { isTurn: true },
    {
      phase: 'COUNTERING',
      previousPhase: 'MAIN',
      currentTurnPlayer: 1,
      priorityPlayerId: 'BOT',
      botDifficulty: 'hard',
      counterStack: [{ type: 'PHASE_END', ownerUid: 'P1', timestamp: Date.now() }],
    }
  );

  const hasAction = ServerGameService.playerHasAvailableConfrontationAction(state, 'BOT');
  const candidateScore = ServerGameService.getBotStoryPlayCandidates(state, 'BOT')[0]?.score ?? -999;
  const used = await ServerGameService.tryUseBotConfrontationAction(state, 'BOT', 18);
  await ServerGameService.botMoveForPlayer(state, 'BOT');

  return assertScenario(
    'hard AI passes low-value confrontation story without stalling',
    hasAction && !used && candidateScore < 18 && state.phase === 'MAIN' && state.counterStack.length === 0,
    `hasAction=${hasAction}, used=${used}, score=${candidateScore.toFixed(1)}, phase=${state.phase}, stack=${state.counterStack.length}`
  );
}

async function testHardAiChoosesConfrontationFieldEffect(): Promise<ScenarioResult> {
  const tempoEffect = effect({
    id: 'counter_tempo_field_effect',
    type: 'ACTIVATE',
    description: 'countering silence target opponent unit and prevent damage',
    content: 'COUNTER SILENCE PREVENT DAMAGE',
    targetSpec: {
      title: 'choose opponent unit',
      description: 'choose opponent unit',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'OPPONENT',
    },
  });
  const source = unit({
    id: 'COUNTER_FIELD_SOURCE',
    fullName: 'Counter Field Source',
    color: 'BLUE',
    effects: [tempoEffect],
  });
  const target = unit({ id: 'COUNTER_FIELD_TARGET', power: 3500, damage: 2 });
  const state = game(
    { isTurn: false, unitZone: [source, null, null, null, null, null], botDifficulty: 'hard', botDeckProfileId: 'blue-adventurer' },
    { isTurn: true, unitZone: [target, null, null, null, null, null] },
    {
      phase: 'COUNTERING',
      previousPhase: 'BATTLE_FREE',
      currentTurnPlayer: 1,
      priorityPlayerId: 'BOT',
      botDifficulty: 'hard',
      battleState: { attackers: [target.gamecardId] },
      counterStack: [{ type: 'ATTACK', ownerUid: 'P1', timestamp: Date.now(), card: target }],
    }
  );

  const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT');
  const used = await ServerGameService.tryUseBotConfrontationAction(state, 'BOT', 18);
  const activationLog = state.aiDecisionLogs?.find((log: any) =>
    log.action === 'ACTIVATE_EFFECT' &&
    log.playerUid === 'BOT' &&
    log.details?.effectId === tempoEffect.id
  );
  const failureLog = state.aiDecisionLogs?.find((log: any) =>
    log.action === 'ACTIVATE_EFFECT_FAILED' &&
    log.playerUid === 'BOT' &&
    log.details?.effectId === tempoEffect.id
  );
  return assertScenario(
    'hard AI chooses useful field effect in confrontation',
    candidates.length > 0 &&
      candidates[0].effect.id === tempoEffect.id &&
      candidates[0].score >= 18 &&
      used &&
      !!activationLog &&
      !failureLog,
    `candidates=${candidates.length}, top=${candidates[0]?.effect.id}, score=${(candidates[0]?.score ?? 0).toFixed(1)}, used=${used}, activated=${!!activationLog}, failed=${!!failureLog}, query=${state.pendingQuery?.callbackKey}`
  );
}

function testPreventDestroyWaitsForThreatWindow(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const protectedUnit = unit({ id: '101000501', fullName: 'White Tiger', damage: 2, power: 3500, godMark: true, playedTurn: 1 });
  const lowValueUnit = unit({ id: 'LOW_VALUE_PROTECTED_UNIT', damage: 1, power: 1000, playedTurn: 1 });
  const attacker = unit({ id: 'THREAT_ATTACKER', damage: 2, power: 3500 });
  const lowAttacker = unit({ id: 'LOW_THREAT_ATTACKER', damage: 1, power: 2500 });
  const preventEffect = effect({
    id: '201000059_prevent_destroy',
    description: 'prevent destroy and protect unit during battle',
    content: 'PREVENT_DESTROY PROTECT COMBAT',
    targetSpec: {
      title: 'choose protected unit',
      description: 'choose your unit to prevent next destroy',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
    },
  });
  const preventStory = story({ id: '201000059', fullName: 'Prevent Destroy Story', effects: [preventEffect] });
  const mainState = game({ hand: [preventStory], unitZone: [protectedUnit, null, null, null, null, null] }, {}, { phase: 'MAIN' });
  const noThreatBattleState = game(
    { hand: [preventStory], unitZone: [protectedUnit, null, null, null, null, null] },
    { unitZone: [attacker, null, null, null, null, null] },
    { phase: 'BATTLE_FREE', battleState: { attackers: [protectedUnit.gamecardId] } }
  );
  const lowThreatBattleState = game(
    { hand: [preventStory], unitZone: [lowValueUnit, null, null, null, null, null] },
    { unitZone: [lowAttacker, null, null, null, null, null] },
    {
      phase: 'BATTLE_FREE',
      battleState: {
        attackers: [lowValueUnit.gamecardId],
        defender: lowAttacker.gamecardId,
        resolvedUnitIds: [],
      },
    }
  );
  const highThreatBattleState = game(
    { hand: [preventStory], unitZone: [protectedUnit, null, null, null, null, null] },
    { unitZone: [attacker, null, null, null, null, null] },
    {
      phase: 'BATTLE_FREE',
      battleState: {
        attackers: [protectedUnit.gamecardId],
        defender: attacker.gamecardId,
        resolvedUnitIds: [],
      },
    }
  );
  const mainScore = scoreActivatableEffect(
    mainState,
    mainState.players.BOT,
    preventStory as any,
    preventEffect as any,
    profile,
    { opponent: mainState.players.P1, targetCount: 1, hasTargetSpec: true }
  ).score;
  const noThreatBattleScore = scorePlayableCard(
    noThreatBattleState,
    noThreatBattleState.players.BOT,
    preventStory as any,
    profile
  );
  const lowThreatBattleScore = scorePlayableCard(
    lowThreatBattleState,
    lowThreatBattleState.players.BOT,
    preventStory as any,
    profile
  );
  const highThreatBattleScore = scorePlayableCard(
    highThreatBattleState,
    highThreatBattleState.players.BOT,
    preventStory as any,
    profile
  );
  return assertScenario(
    'prevent-destroy story waits for high-value destruction threat',
    mainScore < 0 &&
      noThreatBattleScore < 18 &&
      lowThreatBattleScore < 18 &&
      highThreatBattleScore > 35 &&
      highThreatBattleScore > lowThreatBattleScore + 45,
    `main=${mainScore.toFixed(1)}, noThreat=${noThreatBattleScore.toFixed(1)}, lowThreat=${lowThreatBattleScore.toFixed(1)}, highThreat=${highThreatBattleScore.toFixed(1)}`
  );
}

async function testPreventDestroyConfrontationRequiresHighValueThreat(): Promise<ScenarioResult> {
  const preventEffect = effect({
    id: '201000059_prevent_destroy',
    description: 'prevent destroy and protect unit during battle',
    content: 'PREVENT_DESTROY PROTECT COMBAT',
    targetSpec: {
      title: 'choose protected unit',
      description: 'choose your unit to prevent next destroy',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
    },
  });
  const noThreatStory = story({ id: '201000059', fullName: 'Prevent Destroy Story', effects: [preventEffect] });
  const noThreatUnit = unit({ id: '101000501', fullName: 'White Tiger', damage: 2, power: 3500, godMark: true });
  const noThreatState = game(
    { hand: [noThreatStory], unitZone: [noThreatUnit, null, null, null, null, null], botDifficulty: 'hard', botDeckProfileId: 'white-temple' },
    {},
    {
      phase: 'COUNTERING',
      previousPhase: 'BATTLE_FREE',
      priorityPlayerId: 'BOT',
      botDifficulty: 'hard',
      counterStack: [{ type: 'PHASE_END', ownerUid: 'P1', timestamp: Date.now() }],
    }
  );

  const destroyEffect = effect({
    id: 'opponent_destroy_unit',
    type: 'ACTIVATE',
    description: 'destroy target unit',
    content: 'DESTROY_UNIT',
  });
  const opponentSource = unit({ id: 'OPP_DESTROY_SOURCE', color: 'RED', effects: [destroyEffect] });
  const threatenedUnit = unit({ id: '101000501', fullName: 'White Tiger', damage: 2, power: 3500, godMark: true });
  const threatStory = story({ id: '201000059', fullName: 'Prevent Destroy Story', effects: [preventEffect] });
  const threatState = game(
    { hand: [threatStory], unitZone: [threatenedUnit, null, null, null, null, null], botDifficulty: 'hard', botDeckProfileId: 'white-temple' },
    { unitZone: [opponentSource, null, null, null, null, null] },
    {
      phase: 'COUNTERING',
      previousPhase: 'BATTLE_FREE',
      priorityPlayerId: 'BOT',
      botDifficulty: 'hard',
      counterStack: [{
        type: 'EFFECT',
        ownerUid: 'P1',
        card: opponentSource,
        effectIndex: 0,
        declaredTargets: [{
          gamecardId: threatenedUnit.gamecardId,
          ownerUid: 'BOT',
          zone: 'UNIT',
          sourceCardId: opponentSource.gamecardId,
          sourceCardName: opponentSource.fullName,
          effectIndex: 0,
        }],
        timestamp: Date.now(),
      }],
    }
  );

  const noThreatScore = ServerGameService.getBotStoryPlayCandidates(noThreatState, 'BOT')[0]?.score ?? -999;
  const noThreatUsed = await ServerGameService.tryUseBotConfrontationAction(noThreatState, 'BOT', 18);
  const threatScore = ServerGameService.getBotStoryPlayCandidates(threatState, 'BOT')[0]?.score ?? -999;
  const threatUsed = await ServerGameService.tryUseBotConfrontationAction(threatState, 'BOT', 18);

  return assertScenario(
    'prevent-destroy confrontation story requires high-value destruction threat',
    noThreatScore < 18 && !noThreatUsed && threatScore >= 18 && threatUsed && threatState.pendingQuery?.callbackKey === 'DECLARE_EFFECT_TARGETS',
    `noThreat=${noThreatScore.toFixed(1)}, noThreatUsed=${noThreatUsed}, threat=${threatScore.toFixed(1)}, threatUsed=${threatUsed}, query=${threatState.pendingQuery?.callbackKey}`
  );
}

function testPreventDestroySelectsThreatenedHighValueUnit(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const threatened = unit({ id: '101130440', fullName: 'Threatened Magic Spear', damage: 2, power: 3200, playedTurn: 1 });
  const decoyCore = unit({ id: '101000501', fullName: 'White Tiger Decoy', damage: 3, power: 5000, godMark: true, playedTurn: 1 });
  const destroyEffect = effect({
    id: 'opponent_destroy_unit',
    type: 'ACTIVATE',
    description: 'destroy target unit',
    content: 'DESTROY_UNIT',
  });
  const opponentSource = unit({ id: 'OPP_DESTROY_SOURCE', color: 'RED', effects: [destroyEffect] });
  const state = game(
    { unitZone: [threatened, decoyCore, null, null, null, null], botDeckProfileId: 'white-temple' },
    { unitZone: [opponentSource, null, null, null, null, null] },
    {
      phase: 'COUNTERING',
      priorityPlayerId: 'BOT',
      counterStack: [{
        type: 'EFFECT',
        ownerUid: 'P1',
        card: opponentSource,
        effectIndex: 0,
        declaredTargets: [{
          gamecardId: threatened.gamecardId,
          ownerUid: 'BOT',
          zone: 'UNIT',
          sourceCardId: opponentSource.gamecardId,
          sourceCardName: opponentSource.fullName,
          effectIndex: 0,
        }],
        timestamp: Date.now(),
      }],
    }
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: decoyCore, source: 'UNIT', isMine: true },
      { card: threatened, source: 'UNIT', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'DECLARE_EFFECT_TARGETS',
    context: { effectId: '201000059_prevent_destroy' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'prevent-destroy target selection follows the explicit destruction threat',
    selected[0] === threatened.gamecardId,
    `selected=${selected[0]}, threatened=${threatened.gamecardId}, decoy=${decoyCore.gamecardId}`
  );
}

function testPreventBattleDestroyEffectRequiresCombatThreat(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const protectedUnit = unit({ id: '101000501', fullName: 'White Tiger', damage: 2, power: 3500, godMark: true, playedTurn: 1 });
  const attacker = unit({ id: 'BATTLE_DESTROY_ATTACKER', color: 'RED', damage: 2, power: 4500 });
  const preventBattleEffect = effect({
    id: '101150208_prevent_battle_destroy',
    description: 'prevent battle destroy target own unit',
    content: 'PREVENT_BATTLE_DESTROY PROTECT',
  });
  const source = unit({ id: '101150208', fullName: 'Battle Protection Source', effects: [preventBattleEffect] });
  const noThreatState = game(
    { isTurn: false, unitZone: [source, protectedUnit, null, null, null, null] },
    { isTurn: true, unitZone: [attacker, null, null, null, null, null] },
    {
      phase: 'COUNTERING',
      currentTurnPlayer: 1,
      priorityPlayerId: 'BOT',
      battleState: { attackers: [attacker.gamecardId] },
    }
  );
  const threatState = game(
    { isTurn: false, unitZone: [source, protectedUnit, null, null, null, null] },
    { isTurn: true, unitZone: [attacker, null, null, null, null, null] },
    {
      phase: 'COUNTERING',
      currentTurnPlayer: 1,
      priorityPlayerId: 'BOT',
      battleState: {
        attackers: [attacker.gamecardId],
        defender: protectedUnit.gamecardId,
        resolvedUnitIds: [],
      },
    }
  );
  const noThreatScore = scoreActivatableEffect(
    noThreatState,
    noThreatState.players.BOT,
    source as any,
    preventBattleEffect as any,
    profile,
    { opponent: noThreatState.players.P1, targetCount: 1, hasTargetSpec: true }
  ).score;
  const threatScore = scoreActivatableEffect(
    threatState,
    threatState.players.BOT,
    source as any,
    preventBattleEffect as any,
    profile,
    { opponent: threatState.players.P1, targetCount: 1, hasTargetSpec: true }
  ).score;

  return assertScenario(
    'prevent-battle-destroy effect waits for high-value combat loss',
    noThreatScore < 18 && threatScore > 25 && threatScore > noThreatScore + 70,
    `noThreat=${noThreatScore.toFixed(1)}, threat=${threatScore.toFixed(1)}`
  );
}

function testPreventBattleDestroySelectsThreatenedCombatUnit(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const threatened = unit({ id: '101130440', fullName: 'Threatened Magic Spear', damage: 2, power: 2500, playedTurn: 1 });
  const decoyCore = unit({ id: '101000501', fullName: 'White Tiger Decoy', damage: 3, power: 5000, godMark: true, playedTurn: 1 });
  const attacker = unit({ id: 'BATTLE_DESTROY_ATTACKER', color: 'RED', damage: 2, power: 3500 });
  const state = game(
    { isTurn: false, unitZone: [threatened, decoyCore, null, null, null, null], botDeckProfileId: 'white-temple' },
    { isTurn: true, unitZone: [attacker, null, null, null, null, null] },
    {
      phase: 'COUNTERING',
      currentTurnPlayer: 1,
      priorityPlayerId: 'BOT',
      battleState: {
        attackers: [attacker.gamecardId],
        defender: threatened.gamecardId,
        resolvedUnitIds: [],
      },
    }
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: decoyCore, source: 'UNIT', isMine: true },
      { card: threatened, source: 'UNIT', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'EFFECT_RESOLVE',
    context: { effectId: '101150208_prevent_battle_destroy', step: 'TARGET' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'prevent-battle-destroy target selection follows combat loss',
    selected[0] === threatened.gamecardId,
    `selected=${selected[0]}, threatened=${threatened.gamecardId}, decoy=${decoyCore.gamecardId}`
  );
}

function testDikaiResetCostChoosesNonFieldGodmarkCosts(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const handCost = unit({ id: '102050432', fullName: 'Dikai Hand Cost', color: 'RED', godMark: true, cardlocation: 'HAND' });
  const deckCost = unit({ id: '102050432', fullName: 'Dikai Deck Cost', color: 'RED', godMark: true, cardlocation: 'DECK' });
  const graveCost = unit({ id: '102050432', fullName: 'Dikai Grave Cost', color: 'RED', godMark: true, cardlocation: 'GRAVE' });
  const fieldCore = unit({ id: '102050432', fullName: 'Dikai Field Core', color: 'RED', godMark: true, cardlocation: 'UNIT', damage: 4, power: 4000 });
  const state = game(
    {
      hand: [handCost],
      deck: [deckCost],
      grave: [graveCost],
      unitZone: [fieldCore, null, null, null, null, null],
      botDeckProfileId: 'red-dikai',
    },
    {}
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: fieldCore, source: 'UNIT', isMine: true },
      { card: handCost, source: 'HAND', isMine: true },
      { card: deckCost, source: 'DECK', isMine: true },
      { card: graveCost, source: 'GRAVE', isMine: true },
    ],
    minSelections: 2,
    maxSelections: 2,
    callbackKey: 'EFFECT_RESOLVE',
    context: { effectId: '102050432_reset_attack_unit' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'dikai reset cost can choose non-field godmark costs',
    selected.length === 2 && !selected.includes(fieldCore.gamecardId),
    `selected=${selected.join(',')}, field=${fieldCore.gamecardId}`
  );
}

function testDikaiResetHeldInCountering(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const resetEffect = effect({
    id: '102050432_reset_attack_unit',
    type: 'ACTIVATE',
    description: 'reset this unit and it can attack opponent unit next attack',
    content: 'RESET READY ATTACK UNIT RESOURCE',
  });
  const commander = unit({
    id: '102050432',
    color: 'RED',
    fullName: 'Knight Captain Dikai',
    damage: 4,
    power: 4000,
    godMark: true,
    effects: [resetEffect],
  });
  const state = game(
    { unitZone: [commander, null, null, null, null, null], botDeckProfileId: 'red-dikai' },
    {},
    { phase: 'COUNTERING', priorityPlayerId: 'BOT' }
  );
  const score = scoreActivatableEffect(
    state,
    state.players.BOT,
    commander as any,
    resetEffect as any,
    profile,
    { opponent: state.players.P1, targetCount: 0, hasTargetSpec: false }
  ).score;
  return assertScenario(
    'dikai reset is held during generic countering windows',
    score < 18,
    `score=${score.toFixed(1)}`
  );
}

function testDikaiResetRequiresPostAttackExhaustedUnit(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const resetEffect = effect({
    id: '102050432_reset_attack_unit',
    type: 'ACTIVATE',
    description: 'reset this unit and it can attack opponent unit next attack',
    content: 'RESET READY ATTACK UNIT RESOURCE',
  });
  const readyCommander = unit({
    id: '102050432',
    color: 'RED',
    fullName: 'Knight Captain Dikai Ready',
    specialName: '迪凯',
    damage: 4,
    power: 4000,
    godMark: true,
    isExhausted: false,
    effects: [resetEffect],
  });
  const spentCommander = unit({
    ...readyCommander,
    gamecardId: 'DIKAI_SPENT_POST_ATTACK',
    fullName: 'Knight Captain Dikai Spent',
    isExhausted: true,
    hasAttackedThisTurn: true,
  });
  const costA = unit({ id: '102050432', fullName: 'Dikai Cost A', color: 'RED', specialName: '迪凯', godMark: true, cardlocation: 'HAND' });
  const costB = unit({ id: '102050432', fullName: 'Dikai Cost B', color: 'RED', specialName: '迪凯', godMark: true, cardlocation: 'DECK' });
  const readyState = game(
    {
      hand: [costA],
      deck: [costB, ...deckCards(10, 'BOT_DIKAI_READY_DECK')],
      unitZone: [readyCommander, null, null, null, null, null],
      botDeckProfileId: 'red-dikai',
    },
    {},
    { phase: 'MAIN' }
  );
  const spentState = game(
    {
      hand: [costA],
      deck: [costB, ...deckCards(10, 'BOT_DIKAI_SPENT_DECK')],
      unitZone: [spentCommander, null, null, null, null, null],
      botDeckProfileId: 'red-dikai',
    },
    {},
    { phase: 'MAIN' }
  );
  const readyScore = scoreActivatableEffect(
    readyState,
    readyState.players.BOT,
    readyCommander as any,
    resetEffect as any,
    profile,
    { opponent: readyState.players.P1, targetCount: 0, hasTargetSpec: false }
  ).score;
  const spentScore = scoreActivatableEffect(
    spentState,
    spentState.players.BOT,
    spentCommander as any,
    resetEffect as any,
    profile,
    { opponent: spentState.players.P1, targetCount: 0, hasTargetSpec: false }
  ).score;
  const scriptedEffect = (dikaiCardScript.effects || []).find(cardEffect => cardEffect.id === '102050432_reset_attack_unit');
  const readyLegal = scriptedEffect?.condition?.(readyState as any, readyState.players.BOT as any, readyCommander as any);
  const spentLegal = scriptedEffect?.condition?.(spentState as any, spentState.players.BOT as any, spentCommander as any);

  return assertScenario(
    'dikai reset waits until captain is exhausted after attacking',
    readyScore < 18 && spentScore >= 18 && spentScore > readyScore + 50 && readyLegal === false && spentLegal === true,
    `readyScore=${readyScore.toFixed(1)}, spentScore=${spentScore.toFixed(1)}, readyLegal=${readyLegal}, spentLegal=${spentLegal}`
  );
}

function testDikaiResetRejectsPreAttackExhaustedUnit(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const resetEffect = effect({
    id: '102050432_reset_attack_unit',
    type: 'ACTIVATE',
    description: 'reset this unit and it can attack opponent unit next attack',
    content: 'RESET READY ATTACK UNIT RESOURCE',
  });
  const exhaustedCommander = unit({
    id: '102050432',
    color: 'RED',
    fullName: 'Knight Captain Dikai Pre Attack Exhausted',
    specialName: '迪凯',
    damage: 4,
    power: 4000,
    godMark: true,
    isExhausted: true,
    hasAttackedThisTurn: false,
    effects: [resetEffect],
  });
  const costA = unit({ id: '102050432', fullName: 'Dikai Cost A', color: 'RED', specialName: '迪凯', godMark: true, cardlocation: 'HAND' });
  const costB = unit({ id: '102050432', fullName: 'Dikai Cost B', color: 'RED', specialName: '迪凯', godMark: true, cardlocation: 'DECK' });
  const state = game(
    {
      hand: [costA],
      deck: [costB, ...deckCards(10, 'BOT_DIKAI_PRE_ATTACK_DECK')],
      unitZone: [exhaustedCommander, null, null, null, null, null],
      botDeckProfileId: 'red-dikai',
    },
    {},
    { phase: 'MAIN' }
  );
  const score = scoreActivatableEffect(
    state,
    state.players.BOT,
    exhaustedCommander as any,
    resetEffect as any,
    profile,
    { opponent: state.players.P1, targetCount: 0, hasTargetSpec: false }
  ).score;

  return assertScenario(
    'dikai reset rejects pre-attack exhausted unit',
    score < 18,
    `score=${score.toFixed(1)}`
  );
}

function testRedCannotDefendNeedsTargetInClosingWindow(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const source = unit({ id: '102050427', color: 'RED', damage: 2, power: 2500, playedTurn: 1 });
  const helper = unit({ id: 'RED_HELPER_ATTACKER', color: 'RED', damage: 1, power: 1500, playedTurn: 1 });
  const blocker = unit({ id: 'TARGET_BLOCKER', power: 4000, damage: 1 });
  const cannotDefend = effect({
    id: '102050427_cannot_defend',
    description: 'target opponent unit cannot defend this turn',
    content: 'CANNOT_DEFEND FINISHER',
    targetSpec: { controller: 'OPPONENT', zones: ['UNIT'], minSelections: 1, maxSelections: 1 },
  });
  const targetState = game(
    { unitZone: [source, helper, null, null, null, null] },
    { unitZone: [blocker, null, null, null, null, null], erosionBack: erosionCards(7, 'P1_RED_CLOSE') },
    { phase: 'BATTLE_DECLARATION' }
  );
  const noTargetState = game(
    { unitZone: [source, helper, null, null, null, null] },
    { unitZone: [null, null, null, null, null, null], erosionBack: erosionCards(7, 'P1_RED_CLOSE_EMPTY') },
    { phase: 'BATTLE_DECLARATION' }
  );
  const targetScore = scoreActivatableEffect(
    targetState,
    targetState.players.BOT,
    source as any,
    cannotDefend as any,
    profile,
    { opponent: targetState.players.P1, targetCount: 1, hasTargetSpec: true }
  ).score;
  const noTargetScore = scoreActivatableEffect(
    noTargetState,
    noTargetState.players.BOT,
    source as any,
    cannotDefend as any,
    profile,
    { opponent: noTargetState.players.P1, targetCount: 0, hasTargetSpec: true }
  ).score;
  return assertScenario(
    'red cannot-defend effect needs a target and rewards closing window',
    targetScore > 20 && noTargetScore < 0 && targetScore > noTargetScore + 35,
    `target=${targetScore.toFixed(1)}, noTarget=${noTargetScore.toFixed(1)}`
  );
}

function testYellowReviveMainPhaseNotBattleSetup(): ScenarioResult {
  const profile = getDeckAiProfile('yellow-alchemy');
  const attacker = unit({ id: 'YELLOW_ATTACKER_FOR_REVIVE', color: 'YELLOW', damage: 1, playedTurn: 1 });
  const reviveTarget = unit({ id: 'YELLOW_REVIVE_TARGET', color: 'YELLOW', damage: 2, cardlocation: 'GRAVE' });
  const reviveEffect = effect({
    id: '305110028_revive',
    description: 'revive unit from graveyard to field',
    content: 'REVIVE SUMMON GRAVE_TO_FIELD',
    targetSpec: { controller: 'SELF', zones: ['GRAVE'], minSelections: 1, maxSelections: 1 },
  });
  const memoryDoll = story({ id: '305110028', fullName: 'Memory Doll', type: 'ITEM', effects: [reviveEffect] });
  const mainState = game(
    { hand: [memoryDoll], grave: [reviveTarget], unitZone: [null, null, null, null, null, null] },
    {},
    { phase: 'MAIN' }
  );
  const battleState = game(
    { hand: [memoryDoll], grave: [reviveTarget], unitZone: [attacker, null, null, null, null, null] },
    {},
    { phase: 'BATTLE_FREE', battleState: { attackers: [attacker.gamecardId] } }
  );
  const mainScore = scoreActivatableEffect(
    mainState,
    mainState.players.BOT,
    memoryDoll as any,
    reviveEffect as any,
    profile,
    { opponent: mainState.players.P1, targetCount: 1, hasTargetSpec: true }
  ).score;
  const battleScore = scoreActivatableEffect(
    battleState,
    battleState.players.BOT,
    memoryDoll as any,
    reviveEffect as any,
    profile,
    { opponent: battleState.players.P1, targetCount: 1, hasTargetSpec: true }
  ).score;
  return assertScenario(
    'yellow revive setup is main-phase memory, not battle free filler',
    mainScore > 20 && battleScore < mainScore - 30,
    `main=${mainScore.toFixed(1)}, battle=${battleScore.toFixed(1)}`
  );
}

function testTotemPrepareStoryMainNotBattleFiller(): ScenarioResult {
  const profile = getDeckAiProfile('overlord-totem');
  const attacker = unit({ id: 'TOTEM_ATTACKER_FOR_PREPARE', damage: 2, playedTurn: 1 });
  const prepareEffect = effect({
    id: '203080083_prepare',
    description: 'search deck for totem resource setup',
    content: 'SEARCH DECK_TO_HAND RESOURCE SETUP',
  });
  const prepareStory = story({ id: '203080083', fullName: 'Totem Prepare', effects: [prepareEffect] });
  const mainState = game({ hand: [prepareStory], unitZone: [null, null, null, null, null, null] }, {}, { phase: 'MAIN' });
  const battleState = game(
    { hand: [prepareStory], unitZone: [attacker, null, null, null, null, null] },
    {},
    { phase: 'BATTLE_FREE', battleState: { attackers: [attacker.gamecardId] } }
  );
  const mainScore = scorePlayableCard(mainState, mainState.players.BOT, prepareStory as any, profile);
  const battleScore = scorePlayableCard(battleState, battleState.players.BOT, prepareStory as any, profile);
  return assertScenario(
    'totem preparation story is main-phase setup, not battle filler',
    mainScore > 0 && battleScore < 0 && mainScore > battleScore + 40,
    `main=${mainScore.toFixed(1)}, battle=${battleScore.toFixed(1)}`
  );
}

function testWhiteTemplePrefersKeyResetTargets(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const source = unit({ id: '101130439', fullName: 'Hall Knight Source', damage: 1, isExhausted: false });
  const other = unit({ id: '101130155', fullName: 'Other Temple Unit', damage: 1, isExhausted: true });
  const magicSpear = unit({ id: '101130440', fullName: 'Temple Knight Magic Spear', damage: 2, isExhausted: true });
  const heroSword = unit({ id: '101130458', fullName: 'Temple Knight Hero Sword', damage: 2, isExhausted: true });
  const state = game({
    unitZone: [source, other, magicSpear, heroSword, null, null],
  });
  const query = {
    id: 'white_temple_reset',
    type: 'SELECT_CARD',
    playerUid: 'BOT',
    title: 'choose reset unit',
    description: 'choose a Temple unit to reset',
    callbackKey: 'EFFECT_RESOLVE',
    minSelections: 1,
    maxSelections: 1,
    context: { sourceCardId: source.gamecardId, effectId: '101130439_reset_hall' },
    options: [
      { card: other, isMine: true },
      { card: magicSpear, isMine: true },
      { card: heroSword, isMine: true },
    ],
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  const selectedCard = [other, magicSpear, heroSword].find(card => card.gamecardId === selected[0]);
  return assertScenario(
    'white temple reset prefers magic spear or hero sword',
    selectedCard?.id === '101130440' || selectedCard?.id === '101130458',
    `selected=${selectedCard?.fullName || selected.join(',') || 'none'}`
  );
}

function testWhiteTempleMultiResetTakesBothKeyTargets(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const other = unit({ id: '101130155', fullName: 'Other Temple Unit', damage: 1, isExhausted: true });
  const magicSpear = unit({ id: '101130440', fullName: 'Temple Knight Magic Spear', damage: 2, isExhausted: true });
  const heroSword = unit({ id: '101130458', fullName: 'Temple Knight Hero Sword', damage: 2, isExhausted: true });
  const state = game({
    unitZone: [other, magicSpear, heroSword, null, null, null],
  });
  const query = {
    id: 'white_temple_multi_reset',
    type: 'SELECT_CARD',
    playerUid: 'BOT',
    title: 'choose reset units',
    description: 'choose two non-god units to reset',
    callbackKey: 'EFFECT_RESOLVE',
    minSelections: 2,
    maxSelections: 2,
    context: { effectId: '101000063_ten_reset_units' },
    options: [
      { card: other, isMine: true },
      { card: magicSpear, isMine: true },
      { card: heroSword, isMine: true },
    ],
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  const selectedIds = selected
    .map(id => [other, magicSpear, heroSword].find(card => card.gamecardId === id)?.id)
    .filter(Boolean);
  return assertScenario(
    'white temple multi reset chooses magic spear and hero sword first',
    selectedIds.includes('101130440') && selectedIds.includes('101130458'),
    `selected=${selectedIds.join(',') || 'none'}`
  );
}

function testWhiteTempleFixedOpeningHand(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const junkA = story({ id: 'JUNK_A', fullName: 'Junk A', cardlocation: 'HAND' });
  const junkB = story({ id: 'JUNK_B', fullName: 'Junk B', cardlocation: 'HAND' });
  const junkC = story({ id: 'JUNK_C', fullName: 'Junk C', cardlocation: 'HAND' });
  const junkD = story({ id: 'JUNK_D', fullName: 'Junk D', cardlocation: 'HAND' });
  const archer = unit({ id: '101130202', fullName: 'Archer', cardlocation: 'DECK' });
  const spear = unit({ id: '101130440', fullName: 'Magic Spear', cardlocation: 'DECK' });
  const prince = unit({ id: '101130441', fullName: 'Holy Prince', cardlocation: 'DECK', godMark: true });
  const tiger = unit({ id: '101000501', fullName: 'White Tiger', cardlocation: 'DECK', godMark: true });
  const state = game({
    hand: [junkA, junkB, junkC, junkD],
    deck: [archer, spear, prince, tiger, ...deckCards(6, 'WHITE_FIXED_FILLER')],
    botDeckProfileId: 'white-temple',
  });

  const result = applyOpeningHandSoftCompensation(state.players.BOT, profile);
  const openingIds = state.players.BOT.hand.map((card: any) => card.id);
  const expected = ['101130202', '101130440', '101130441', '101000501'];
  const returnedJunk = [junkA, junkB, junkC, junkD].every(card =>
    state.players.BOT.deck.some((deckCard: any) => deckCard.gamecardId === card.gamecardId)
  );

  return assertScenario(
    'white temple uses fixed opening hand',
    result.applied &&
      result.fixedOpening === true &&
      openingIds.join(',') === expected.join(',') &&
      returnedJunk,
    `opening=${openingIds.join(',')}, fixed=${!!result.fixedOpening}, returnedJunk=${returnedJunk}`
  );
}

function testRedDikaiFixedOpeningHand(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const junkA = story({ id: 'RED_JUNK_A', fullName: 'Red Junk A', color: 'RED', cardlocation: 'HAND' });
  const junkB = story({ id: 'RED_JUNK_B', fullName: 'Red Junk B', color: 'RED', cardlocation: 'HAND' });
  const junkC = story({ id: 'RED_JUNK_C', fullName: 'Red Junk C', color: 'RED', cardlocation: 'HAND' });
  const junkD = story({ id: 'RED_JUNK_D', fullName: 'Red Junk D', color: 'RED', cardlocation: 'HAND' });
  const captain = unit({ id: '102050432', fullName: 'Knight Captain Dikai', color: 'RED', cardlocation: 'DECK', godMark: true });
  const guard = unit({ id: '102050086', fullName: 'Royal Guard', color: 'RED', cardlocation: 'DECK' });
  const patrol = unit({ id: '102050141', fullName: 'Railway Patrol', color: 'RED', cardlocation: 'DECK' });
  const scadi = story({ id: '302050013', fullName: 'Scadi', color: 'RED', type: 'ITEM', cardlocation: 'DECK', godMark: true });
  const state = game({
    hand: [junkA, junkB, junkC, junkD],
    deck: [captain, guard, patrol, scadi, ...deckCards(6, 'RED_FIXED_FILLER')],
    botDeckProfileId: 'red-dikai',
  });

  const result = applyOpeningHandSoftCompensation(state.players.BOT, profile);
  const openingIds = state.players.BOT.hand.map((card: any) => card.id);
  const expected = ['102050086', '102050141', '102050432', '302050013'];
  const returnedJunk = [junkA, junkB, junkC, junkD].every(card =>
    state.players.BOT.deck.some((deckCard: any) => deckCard.gamecardId === card.gamecardId)
  );

  return assertScenario(
    'red dikai uses fixed opening hand',
    result.applied &&
      result.fixedOpening === true &&
      openingIds.join(',') === expected.join(',') &&
      returnedJunk,
    `opening=${openingIds.join(',')}, fixed=${!!result.fixedOpening}, returnedJunk=${returnedJunk}`
  );
}

function testRedDikaiHoldsRushUnitOnFirstTurn(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const rushUnit = unit({
    id: '102050432',
    fullName: 'Knight Captain Dikai',
    color: 'RED',
    cardlocation: 'HAND',
    isrush: true,
    godMark: true,
    damage: 4,
    power: 4000,
    acValue: 1,
    baseAcValue: 1,
  });
  const normalUnit = unit({
    id: '102050086',
    fullName: 'Royal Guard',
    color: 'RED',
    cardlocation: 'HAND',
    isrush: false,
    damage: 1,
    power: 1500,
    acValue: 1,
    baseAcValue: 1,
  });
  const state = game(
    {
      isFirst: true,
      hand: [rushUnit, normalUnit],
      botDeckProfileId: 'red-dikai',
    },
    {},
    { turnCount: 1, phase: 'MAIN' }
  );

  const rushScore = scorePlayableCard(state as any, state.players.BOT as any, rushUnit as any, profile);
  const normalScore = scorePlayableCard(state as any, state.players.BOT as any, normalUnit as any, profile);
  const chosen = choosePlayableCard(state as any, state.players.BOT as any, profile, 'hard', () => true);

  return assertScenario(
    'red dikai holds rush unit on first turn',
    rushScore < 0 && chosen?.gamecardId === normalUnit.gamecardId,
    `rush=${rushScore.toFixed(1)}, normal=${normalScore.toFixed(1)}, chosen=${chosen?.id || 'none'}`
  );
}

function testRedScadiHeldUntilDikaiField(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const scadi = story({
    id: '302050013',
    fullName: 'Scadi',
    color: 'RED',
    type: 'ITEM',
    cardlocation: 'HAND',
    effects: [effect({ id: 'equip_universal', description: 'equip to one of your units' })],
  });
  const guard = unit({
    id: '102050086',
    fullName: 'Royal Guard',
    color: 'RED',
    cardlocation: 'HAND',
    damage: 1,
    power: 1500,
    acValue: 1,
    baseAcValue: 1,
  });
  const dikai = unit({
    id: '102050432',
    fullName: 'Knight Captain Dikai',
    color: 'RED',
    cardlocation: 'HAND',
    isrush: true,
    godMark: true,
    damage: 4,
    power: 4000,
    acValue: 5,
    baseAcValue: 5,
  });
  const state = game(
    { hand: [scadi, guard, dikai], botDeckProfileId: 'red-dikai' },
    {},
    { turnCount: 2, phase: 'MAIN' }
  );

  const scadiScore = scorePlayableCard(state as any, state.players.BOT as any, scadi as any, profile);
  const chosen = choosePlayableCard(state as any, state.players.BOT as any, profile, 'hard', () => true);

  return assertScenario(
    'red scadi is held until dikai is on field',
    scadiScore < 0 && chosen?.gamecardId !== scadi.gamecardId,
    `scadi=${scadiScore.toFixed(1)}, chosen=${chosen?.id || 'none'}`
  );
}

function testRedScadiEquipTargetsDikai(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const scadiEquip = effect({ id: 'equip_universal', description: 'equip to one of your units' });
  const scadi = story({
    id: '302050013',
    fullName: 'Scadi',
    color: 'RED',
    type: 'ITEM',
    cardlocation: 'ITEM',
    effects: [scadiEquip],
  });
  const dikai = unit({ id: '102050432', fullName: 'Knight Captain Dikai', color: 'RED', damage: 4, power: 4000, godMark: true });
  const guard = unit({ id: '102050086', fullName: 'Royal Guard', color: 'RED', damage: 1, power: 1500 });
  const state = game(
    { itemZone: [scadi], unitZone: [guard, dikai, null, null, null, null], botDeckProfileId: 'red-dikai' },
    {}
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: guard, source: 'UNIT', isMine: true },
      { card: dikai, source: 'UNIT', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { sourceCardId: scadi.gamecardId, effectId: 'equip_universal' },
  };

  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'red scadi equip targets dikai',
    selected[0] === dikai.gamecardId,
    `selected=${selected[0]}, dikai=${dikai.gamecardId}`
  );
}

function testRedScadiStaysEquippedToDikai(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const scadiEquip = effect({ id: 'equip_universal', description: 'equip to one of your units' });
  const dikai = unit({ id: '102050432', fullName: 'Knight Captain Dikai', color: 'RED', damage: 4, power: 4000, godMark: true });
  const scadi = story({
    id: '302050013',
    fullName: 'Scadi',
    color: 'RED',
    type: 'ITEM',
    cardlocation: 'ITEM',
    equipTargetId: dikai.gamecardId,
    effects: [scadiEquip],
  });
  const state = game(
    { itemZone: [scadi], unitZone: [dikai, null, null, null, null, null], botDeckProfileId: 'red-dikai' },
    {}
  );
  const scored = scoreActivatableEffect(
    state as any,
    state.players.BOT as any,
    scadi as any,
    scadiEquip as any,
    profile,
    { targetCount: 1, hasTargetSpec: true }
  );

  return assertScenario(
    'red scadi stays equipped to dikai',
    scored.score < 0,
    `score=${scored.score.toFixed(1)}, notes=${scored.notes.join('|')}`
  );
}

function testRedScadiPaymentBuildsErosionWindow(): ScenarioResult {
  const dikai = unit({ id: '102050432', fullName: 'Knight Captain Dikai', color: 'RED', damage: 4, power: 4000, godMark: true });
  const lowPayer = unit({ id: 'RED_LOW_PAYER', fullName: 'Red Low Payer', color: 'RED', damage: 0, power: 500 });
  const scadi = story({
    id: '302050013',
    fullName: 'Scadi',
    color: 'RED',
    type: 'ITEM',
    cardlocation: 'ITEM',
    equipTargetId: dikai.gamecardId,
  });
  const state = game(
    {
      itemZone: [scadi],
      unitZone: [dikai, lowPayer, null, null, null, null],
      erosionBack: erosionCards(4, 'BOT_SCADI_LOW_EROSION'),
      deck: deckCards(20, 'BOT_SCADI_PAYMENT_DECK'),
      botDifficulty: 'hard',
      botDeckProfileId: 'red-dikai',
    },
    {},
    { phase: 'MAIN' }
  );
  const payment: any = ServerGameService.buildBotPaymentSelectionForPlayer(state as any, 'BOT', {
    paymentCost: 1,
    paymentColor: 'RED',
    context: { sourceCardId: 'SCADI_TEST_SOURCE' },
  } as any);

  return assertScenario(
    'red scadi payment uses deck to reach erosion window',
    !payment.feijingCardId && !payment.exhaustUnitIds?.length && !payment.erosionFrontIds?.length,
    `payment=${JSON.stringify(payment)}`
  );
}

function testRedScadiPaymentAvoidsLeavingErosionWindow(): ScenarioResult {
  const dikai = unit({ id: '102050432', fullName: 'Knight Captain Dikai', color: 'RED', damage: 4, power: 4000, godMark: true });
  const lowPayer = unit({ id: 'RED_LOW_PAYER_WINDOW', fullName: 'Red Low Payer Window', color: 'RED', damage: 0, power: 500 });
  const scadi = story({
    id: '302050013',
    fullName: 'Scadi',
    color: 'RED',
    type: 'ITEM',
    cardlocation: 'ITEM',
    equipTargetId: dikai.gamecardId,
  });
  const state = game(
    {
      itemZone: [scadi],
      unitZone: [dikai, lowPayer, null, null, null, null],
      erosionBack: erosionCards(7, 'BOT_SCADI_GOOD_EROSION'),
      deck: deckCards(20, 'BOT_SCADI_AVOID_DECK'),
      botDifficulty: 'hard',
      botDeckProfileId: 'red-dikai',
    },
    {},
    { phase: 'MAIN' }
  );
  const payment: any = ServerGameService.buildBotPaymentSelectionForPlayer(state as any, 'BOT', {
    paymentCost: 1,
    paymentColor: 'RED',
    context: { sourceCardId: 'SCADI_TEST_SOURCE_WINDOW' },
  } as any);

  return assertScenario(
    'red scadi payment avoids pushing erosion above seven',
    payment.exhaustUnitIds?.[0] === lowPayer.gamecardId,
    `payment=${JSON.stringify(payment)}, low=${lowPayer.gamecardId}`
  );
}

function testRedScadiDelaysAttackUntilErosionWindow(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const dikai = unit({ id: '102050432', fullName: 'Knight Captain Dikai', color: 'RED', damage: 4, power: 4000, godMark: true, playedTurn: 1 });
  const scadi = story({
    id: '302050013',
    fullName: 'Scadi',
    color: 'RED',
    type: 'ITEM',
    cardlocation: 'ITEM',
    equipTargetId: dikai.gamecardId,
  });
  const state = game(
    {
      itemZone: [scadi],
      unitZone: [dikai, null, null, null, null, null],
      erosionBack: erosionCards(4, 'BOT_SCADI_SETUP_EROSION'),
      botDeckProfileId: 'red-dikai',
    },
    { erosionBack: erosionCards(5, 'P1_SCADI_PRESSURE') },
    { phase: 'MAIN' }
  );

  const plan = buildTurnPlan(state as any, state.players.BOT as any, profile);
  return assertScenario(
    'red scadi delays attack until erosion window',
    !plan.attackBeforeDeveloping && plan.notes.some(note => note.includes('red scadi')),
    `attackBefore=${plan.attackBeforeDeveloping}, notes=${plan.notes.join('|')}`
  );
}

function testRedScadiAttackRewardsActiveErosionWindow(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const activeDikai = unit({ id: '102050432', fullName: 'Knight Captain Dikai Active', color: 'RED', damage: 4, power: 5000, godMark: true, playedTurn: 1 });
  const inactiveDikai = unit({ id: '102050432', fullName: 'Knight Captain Dikai Setup', color: 'RED', damage: 4, power: 5000, godMark: true, playedTurn: 1 });
  const activeScadi = story({ id: '302050013', fullName: 'Scadi Active', color: 'RED', type: 'ITEM', cardlocation: 'ITEM', equipTargetId: activeDikai.gamecardId });
  const inactiveScadi = story({ id: '302050013', fullName: 'Scadi Setup', color: 'RED', type: 'ITEM', cardlocation: 'ITEM', equipTargetId: inactiveDikai.gamecardId });
  const lowBlockerA = unit({ id: 'LOW_BLOCKER_A', fullName: 'Low Blocker A', color: 'WHITE', damage: 1, power: 2000 });
  const lowBlockerB = unit({ id: 'LOW_BLOCKER_B', fullName: 'Low Blocker B', color: 'WHITE', damage: 1, power: 2000 });
  const activeState = game(
    { itemZone: [activeScadi], unitZone: [activeDikai, null, null, null, null, null], erosionBack: erosionCards(5, 'BOT_SCADI_ACTIVE'), botDeckProfileId: 'red-dikai' },
    { unitZone: [lowBlockerA, null, null, null, null, null] },
    { phase: 'BATTLE_DECLARATION' }
  );
  const inactiveState = game(
    { itemZone: [inactiveScadi], unitZone: [inactiveDikai, null, null, null, null, null], erosionBack: erosionCards(4, 'BOT_SCADI_INACTIVE'), botDeckProfileId: 'red-dikai' },
    { unitZone: [lowBlockerB, null, null, null, null, null] },
    { phase: 'BATTLE_DECLARATION' }
  );

  const activeScore = scoreAttackCandidate(activeState as any, activeState.players.BOT as any, activeDikai as any, profile);
  const inactiveScore = scoreAttackCandidate(inactiveState as any, inactiveState.players.BOT as any, inactiveDikai as any, profile);

  return assertScenario(
    'red scadi attack rewards active erosion window',
    activeScore > inactiveScore + 25,
    `active=${activeScore.toFixed(1)}, inactive=${inactiveScore.toFixed(1)}`
  );
}

function testBlueAdventurerFixedOpeningHand(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const junkA = story({ id: 'BLUE_JUNK_A', fullName: 'Blue Junk A', color: 'BLUE', cardlocation: 'HAND' });
  const junkB = story({ id: 'BLUE_JUNK_B', fullName: 'Blue Junk B', color: 'BLUE', cardlocation: 'HAND' });
  const junkC = story({ id: 'BLUE_JUNK_C', fullName: 'Blue Junk C', color: 'BLUE', cardlocation: 'HAND' });
  const junkD = story({ id: 'BLUE_JUNK_D', fullName: 'Blue Junk D', color: 'BLUE', cardlocation: 'HAND' });
  const byakuya = unit({ id: '104030455', fullName: 'Byakuya', color: 'BLUE', cardlocation: 'DECK' });
  const ting = unit({ id: '104030451', fullName: 'Xiaoting', color: 'BLUE', cardlocation: 'DECK' });
  const guild = story({ id: '304030075', fullName: 'Dragon Wing Adventurer Guild', color: 'BLUE', type: 'ITEM', cardlocation: 'DECK' });
  const aketi = unit({ id: '104020068', fullName: 'Nine-Tailed Fox Aketi', color: 'BLUE', cardlocation: 'DECK', godMark: true });
  const state = game({
    hand: [junkA, junkB, junkC, junkD],
    deck: [byakuya, ting, guild, aketi, ...deckCards(6, 'BLUE_FIXED_FILLER')],
    botDeckProfileId: 'blue-adventurer',
  });

  const result = applyOpeningHandSoftCompensation(state.players.BOT, profile);
  const openingIds = state.players.BOT.hand.map((card: any) => card.id);
  const expected = ['104030455', '104030451', '304030075', '104020068'];
  const returnedJunk = [junkA, junkB, junkC, junkD].every(card =>
    state.players.BOT.deck.some((deckCard: any) => deckCard.gamecardId === card.gamecardId)
  );

  return assertScenario(
    'blue adventurer uses fixed opening hand',
    result.applied &&
      result.fixedOpening === true &&
      openingIds.join(',') === expected.join(',') &&
      returnedJunk,
    `opening=${openingIds.join(',')}, fixed=${!!result.fixedOpening}, returnedJunk=${returnedJunk}`
  );
}

function testBlueGuildChoosesExhaustOptionForBlocker(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const entering = unit({
    id: '104030451',
    fullName: 'Xiaoting',
    color: 'BLUE',
    power: 1000,
    damage: 1,
    playedTurn: 5,
  });
  const blocker = unit({
    id: 'BLUE_GUILD_BLOCKER',
    fullName: 'Guild Exhaust Blocker',
    color: 'RED',
    power: 3500,
    damage: 2,
    isExhausted: false,
  });
  const state = game(
    { unitZone: [entering, null, null, null, null, null], botDeckProfileId: 'blue-adventurer' },
    { unitZone: [blocker, null, null, null, null, null] },
    { phase: 'MAIN' }
  );
  const query = {
    type: 'SELECT_CHOICE',
    options: [
      { id: 'OPTION_A', label: 'buff entering unit' },
      { id: 'OPTION_B', label: 'exhaust opponent unit' },
      { id: 'OPTION_C', label: 'recycle guild card' },
    ],
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'EFFECT_RESOLVE',
    context: {
      sourceCardId: 'BLUE_GUILD_ITEM',
      effectId: '304030075_trigger',
      enteringCardId: entering.gamecardId,
      step: 'RESOLVE_OPTION',
    },
  };

  const selected = chooseQuerySelections(state as any, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'blue guild chooses exhaust option for blocker',
    selected[0] === 'OPTION_B',
    `selected=${selected.join(',')}`
  );
}

function testBlueGuildExhaustTargetsHighestThreat(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const low = unit({ id: 'BLUE_GUILD_LOW_TARGET', fullName: 'Low Guild Target', color: 'RED', power: 1000, damage: 1 });
  const high = unit({ id: 'BLUE_GUILD_HIGH_TARGET', fullName: 'High Guild Target', color: 'RED', power: 4000, damage: 3 });
  const state = game(
    { botDeckProfileId: 'blue-adventurer' },
    { unitZone: [low, high, null, null, null, null] }
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: low, source: 'UNIT', isMine: false },
      { card: high, source: 'UNIT', isMine: false },
    ],
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'EFFECT_RESOLVE',
    context: {
      sourceCardId: 'BLUE_GUILD_ITEM',
      effectId: '304030075_trigger',
      step: 'FINALIZE_EXHAUST',
    },
  };

  const selected = chooseQuerySelections(state as any, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'blue guild exhaust targets highest threat',
    selected[0] === high.gamecardId,
    `selected=${selected[0]}, high=${high.gamecardId}`
  );
}

function testBigSalalaFixedOpeningHand(): ScenarioResult {
  const profile = getDeckAiProfile('big-salala');
  const junkA = story({ id: 'BIG_SALALA_JUNK_A', fullName: 'Big Salala Junk A', color: 'GREEN', cardlocation: 'HAND' });
  const junkB = story({ id: 'BIG_SALALA_JUNK_B', fullName: 'Big Salala Junk B', color: 'GREEN', cardlocation: 'HAND' });
  const junkC = story({ id: 'BIG_SALALA_JUNK_C', fullName: 'Big Salala Junk C', color: 'GREEN', cardlocation: 'HAND' });
  const junkD = story({ id: 'BIG_SALALA_JUNK_D', fullName: 'Big Salala Junk D', color: 'GREEN', cardlocation: 'HAND' });
  const cradle = unit({ id: '105000481', fullName: 'Cradle Girl', color: 'YELLOW', cardlocation: 'DECK' });
  const repairer = unit({ id: '103090253', fullName: 'Windmill Repairer', color: 'GREEN', cardlocation: 'DECK' });
  const angel = unit({ id: '101140435', fullName: 'Battle Angel', color: 'WHITE', cardlocation: 'DECK' });
  const salala = unit({ id: '103000426', fullName: 'Big Salala', color: 'GREEN', cardlocation: 'DECK', godMark: true });
  const state = game({
    hand: [junkA, junkB, junkC, junkD],
    deck: [cradle, repairer, angel, salala, ...deckCards(6, 'BIG_SALALA_FIXED_FILLER')],
    botDeckProfileId: 'big-salala',
  });

  const result = applyOpeningHandSoftCompensation(state.players.BOT, profile);
  const openingIds = state.players.BOT.hand.map((card: any) => card.id);
  const expected = ['105000481', '103090253', '101140435', '103000426'];
  const returnedJunk = [junkA, junkB, junkC, junkD].every(card =>
    state.players.BOT.deck.some((deckCard: any) => deckCard.gamecardId === card.gamecardId)
  );

  return assertScenario(
    'big salala uses fixed opening hand',
    result.applied &&
      result.fixedOpening === true &&
      openingIds.join(',') === expected.join(',') &&
      returnedJunk,
    `opening=${openingIds.join(',')}, fixed=${!!result.fixedOpening}, returnedJunk=${returnedJunk}`
  );
}

function testBigSalalaWarSongEquipsSalala(): ScenarioResult {
  const profile = getDeckAiProfile('big-salala');
  const equipEffect = effect({ id: 'equip_universal', description: 'equip to one of your units' });
  const warSong = story({
    id: '301000016',
    fullName: 'War Song Blessing',
    color: 'WHITE',
    type: 'ITEM',
    cardlocation: 'ITEM',
    effects: [equipEffect],
  });
  const salala = unit({ id: '103000426', fullName: 'Big Salala', color: 'GREEN', power: 4000, damage: 3, godMark: true });
  const repairer = unit({ id: '103090253', fullName: 'Windmill Repairer', color: 'GREEN', power: 2000, damage: 1 });
  const state = game(
    { itemZone: [warSong], unitZone: [repairer, salala, null, null, null, null], botDeckProfileId: 'big-salala' },
    {}
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: repairer, source: 'UNIT', isMine: true },
      { card: salala, source: 'UNIT', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { sourceCardId: warSong.gamecardId, effectId: 'equip_universal' },
  };

  const selected = chooseQuerySelections(state as any, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'big salala war song equips salala',
    selected[0] === salala.gamecardId,
    `selected=${selected[0]}, salala=${salala.gamecardId}`
  );
}

function testBigSalalaWarSongStaysEquipped(): ScenarioResult {
  const profile = getDeckAiProfile('big-salala');
  const equipEffect = effect({ id: 'equip_universal', description: 'equip to one of your units' });
  const salala = unit({ id: '103000426', fullName: 'Big Salala', color: 'GREEN', power: 4000, damage: 3, godMark: true });
  const warSong = story({
    id: '301000016',
    fullName: 'War Song Blessing',
    color: 'WHITE',
    type: 'ITEM',
    cardlocation: 'ITEM',
    equipTargetId: salala.gamecardId,
    effects: [equipEffect],
  });
  const state = game(
    { itemZone: [warSong], unitZone: [salala, null, null, null, null, null], botDeckProfileId: 'big-salala' },
    {}
  );

  const scored = scoreActivatableEffect(
    state as any,
    state.players.BOT as any,
    warSong as any,
    equipEffect as any,
    profile,
    { targetCount: 1, hasTargetSpec: true }
  );

  return assertScenario(
    'big salala war song stays equipped',
    scored.score < 0,
    `score=${scored.score.toFixed(1)}, notes=${scored.notes.join('|')}`
  );
}

function testMagicSpearResetEffectScoresWhenAttackWouldLose(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const spear = unit({
    id: '101130440',
    fullName: 'Temple Knight Magic Spear',
    power: 2000,
    damage: 2,
    isExhausted: true,
    playedTurn: 1,
  });
  const resetEffect = effect({
    id: '101130439_reset_hall',
    type: 'ACTIVATE',
    description: 'reset a hall unit',
    cost: {},
  });
  const resetSource = unit({
    id: '101130439',
    fullName: 'Hall Knight Shenyu',
    power: 2000,
    damage: 1,
    isExhausted: false,
    effects: [resetEffect],
    playedTurn: 1,
  });
  const blocker = unit({ id: 'BLOCKER_2500', fullName: '2500 Blocker', power: 2500, damage: 1, playedTurn: 1 });
  const state = game(
    {
      unitZone: [spear, resetSource, null, null, null, null],
      botDeckProfileId: 'white-temple',
    },
    { unitZone: [blocker, null, null, null, null, null] },
    {
      phase: 'COUNTERING',
      currentTurnPlayer: 0,
      priorityPlayerId: 'BOT',
      previousPhase: 'BATTLE_DECLARATION',
      battleState: { attackers: [spear.gamecardId], isAlliance: false },
    }
  );

  const scored = scoreActivatableEffect(state, state.players.BOT, resetSource as any, resetEffect as any, profile, {
    opponent: state.players.P1,
    targetCount: 1,
    hasTargetSpec: true,
  });

  return assertScenario(
    'magic spear reset effect is valuable when attack would lose',
    scored.score >= 18 && scored.notes.some(note => note.includes('magic spear reset')),
    `score=${scored.score.toFixed(1)}, notes=${scored.notes.join('|')}`
  );
}

function testShenyuResetSequencedBeforeOwnAttack(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const spear = unit({
    id: '101130440',
    fullName: 'Temple Knight Magic Spear',
    power: 2000,
    damage: 2,
    isExhausted: true,
    playedTurn: 1,
  });
  const resetEffect = effect({
    id: '101130439_reset_hall',
    type: 'ACTIVATE',
    description: 'reset a hall unit',
    cost: {},
  });
  const shenyu = unit({
    id: '101130439',
    fullName: 'Hall Knight Shenyu',
    power: 2000,
    damage: 1,
    isExhausted: false,
    effects: [resetEffect],
    playedTurn: 1,
  });
  const otherAttacker = unit({
    id: 'WHITE_ROUTE_ATTACKER',
    fullName: 'White Route Attacker',
    power: 2500,
    damage: 3,
    playedTurn: 1,
  });
  const state = game(
    {
      unitZone: [spear, shenyu, otherAttacker, null, null, null],
      botDeckProfileId: 'white-temple',
    },
    { erosionBack: erosionCards(5, 'P1_SHENYU_PRESSURE') }
  );

  const effectScore = scoreActivatableEffect(state, state.players.BOT, shenyu as any, resetEffect as any, profile, {
    opponent: state.players.P1,
    targetCount: 1,
    hasTargetSpec: true,
  });
  const attackScore = scoreAttackCandidate(state, state.players.BOT, shenyu as any, profile);
  const plan = buildTurnPlan(state, state.players.BOT, profile);

  return assertScenario(
    'shenyu reset is sequenced before its own attack',
    effectScore.score >= 42 &&
      effectScore.score > attackScore + 20 &&
      !plan.attackBeforeDeveloping &&
      plan.notes.some(note => note.includes('sequence pre-combat action')),
    `effect=${effectScore.score.toFixed(1)}, attack=${attackScore.toFixed(1)}, attackBefore=${plan.attackBeforeDeveloping}, notes=${plan.notes.join('|')}`
  );
}

function testHolyPrinceResetHeldInLooseCountering(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const lowUnit = unit({
    id: 'WHITE_LOW_RESET_TARGET',
    fullName: 'Low White Unit',
    power: 1000,
    damage: 1,
    isExhausted: true,
    playedTurn: 1,
  });
  const princeEffect = effect({
    id: '101130441_reset_boost',
    type: 'ACTIVATE',
    description: 'reset a saint kingdom unit and give it power +500',
  });
  const prince = unit({
    id: '101130441',
    fullName: 'Holy Prince Rune',
    power: 2000,
    damage: 1,
    godMark: true,
    effects: [princeEffect],
    playedTurn: 1,
  });
  const state = game(
    {
      unitZone: [lowUnit, prince, null, null, null, null],
      grave: deckCards(3, 'PRINCE_COST_GRAVE'),
      botDeckProfileId: 'white-temple',
    },
    {},
    {
      phase: 'COUNTERING',
      currentTurnPlayer: 1,
      priorityPlayerId: 'BOT',
      previousPhase: 'MAIN',
    }
  );

  const scored = scoreActivatableEffect(state, state.players.BOT, prince as any, princeEffect as any, profile, {
    opponent: state.players.P1,
    targetCount: 1,
    hasTargetSpec: true,
  });

  return assertScenario(
    'holy prince reset is held in loose countering windows',
    scored.score < 18 && scored.notes.some(note => note.includes('post-attack high-value reset')),
    `score=${scored.score.toFixed(1)}, notes=${scored.notes.join('|')}`
  );
}

function testHolyPrinceResetSupportsMagicSpearCountering(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const spear = unit({
    id: '101130440',
    fullName: 'Temple Knight Magic Spear',
    power: 2000,
    damage: 2,
    isExhausted: true,
    playedTurn: 1,
  });
  const princeEffect = effect({
    id: '101130441_reset_boost',
    type: 'ACTIVATE',
    description: 'reset a saint kingdom unit and give it power +500',
  });
  const prince = unit({
    id: '101130441',
    fullName: 'Holy Prince Rune',
    power: 2000,
    damage: 1,
    godMark: true,
    effects: [princeEffect],
    playedTurn: 1,
  });
  const blocker = unit({ id: 'BLOCKER_3000_PRINCE', fullName: '3000 Blocker', power: 3000, damage: 1, playedTurn: 1 });
  const state = game(
    {
      unitZone: [spear, prince, null, null, null, null],
      grave: deckCards(3, 'PRINCE_SUPPORT_COST'),
      botDeckProfileId: 'white-temple',
    },
    { unitZone: [blocker, null, null, null, null, null] },
    {
      phase: 'COUNTERING',
      currentTurnPlayer: 0,
      priorityPlayerId: 'BOT',
      previousPhase: 'BATTLE_DECLARATION',
      battleState: { attackers: [spear.gamecardId], defender: blocker.gamecardId, isAlliance: false },
    }
  );

  const scored = scoreActivatableEffect(state, state.players.BOT, prince as any, princeEffect as any, profile, {
    opponent: state.players.P1,
    targetCount: 1,
    hasTargetSpec: true,
  });

  return assertScenario(
    'holy prince reset supports magic spear in countering',
    scored.score >= 18 &&
      scored.notes.some(note => note.includes('magic spear reset')) &&
      !scored.notes.some(note => note.includes('prefers')),
    `score=${scored.score.toFixed(1)}, notes=${scored.notes.join('|')}`
  );
}

function testMagicSpearAttackNeedsResetSupportIntoLargeDefender(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const unsupportedSpear = unit({
    id: '101130440',
    fullName: 'Temple Knight Magic Spear',
    power: 2000,
    damage: 2,
    playedTurn: 1,
  });
  const supportedSpear = unit({
    id: '101130440',
    fullName: 'Temple Knight Magic Spear',
    power: 2000,
    damage: 2,
    playedTurn: 1,
  });
  const resetSource = unit({
    id: '101130439',
    fullName: 'Hall Knight Shenyu',
    power: 2000,
    damage: 1,
    isExhausted: false,
    playedTurn: 1,
    effects: [effect({ id: '101130439_reset_hall', type: 'ACTIVATE', description: 'reset a hall unit', cost: {} })],
  });
  const blockerA = unit({ id: 'BLOCKER_A', fullName: '2500 Blocker A', power: 2500, damage: 1, playedTurn: 1 });
  const blockerB = unit({ id: 'BLOCKER_B', fullName: '2500 Blocker B', power: 2500, damage: 1, playedTurn: 1 });
  const unsupportedState = game(
    { unitZone: [unsupportedSpear, null, null, null, null, null], botDeckProfileId: 'white-temple' },
    { unitZone: [blockerA, null, null, null, null, null] }
  );
  const supportedState = game(
    { unitZone: [supportedSpear, resetSource, null, null, null, null], botDeckProfileId: 'white-temple' },
    { unitZone: [blockerB, null, null, null, null, null] }
  );

  const unsupportedScore = scoreAttackCandidate(unsupportedState, unsupportedState.players.BOT, unsupportedSpear as any, profile);
  const supportedScore = scoreAttackCandidate(supportedState, supportedState.players.BOT, supportedSpear as any, profile);

  return assertScenario(
    'magic spear attack is held without reset support but allowed with support',
    unsupportedScore <= 0 && supportedScore > unsupportedScore + 20 && supportedScore > 0,
    `unsupported=${unsupportedScore.toFixed(1)}, supported=${supportedScore.toFixed(1)}`
  );
}

function testMagicSpearHeldWhenResetOnlyTrades(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const spear = unit({
    id: '101130440',
    fullName: 'Temple Knight Magic Spear',
    power: 2000,
    damage: 2,
    playedTurn: 1,
  });
  const resetSource = unit({
    id: '101130439',
    fullName: 'Hall Knight Shenyu',
    power: 2000,
    damage: 1,
    isExhausted: false,
    playedTurn: 1,
    effects: [effect({ id: '101130439_reset_hall', type: 'ACTIVATE', description: 'reset a hall unit', cost: {} })],
  });
  const blocker = unit({ id: 'BLOCKER_3000', fullName: '3000 Blocker', power: 3000, damage: 1, playedTurn: 1 });
  const state = game(
    { unitZone: [spear, resetSource, null, null, null, null], botDeckProfileId: 'white-temple' },
    { unitZone: [blocker, null, null, null, null, null] }
  );

  const score = scoreAttackCandidate(state, state.players.BOT, spear as any, profile);

  return assertScenario(
    'magic spear does not attack when reset only creates a trade',
    score <= 0,
    `score=${score.toFixed(1)}`
  );
}

function testWhiteTemplePlaysArcherBeforeHandTargets(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const archer = unit({
    id: '101130202',
    fullName: '南征军的弓兵',
    faction: '圣王国',
    acValue: 3,
    baseAcValue: 3,
    damage: 2,
    cardlocation: 'HAND',
  });
  const rookie = unit({
    id: '101130233',
    fullName: '坚定的新人卫士',
    faction: '圣王国',
    acValue: 3,
    baseAcValue: 3,
    damage: 1,
    feijingMark: true,
    cardlocation: 'HAND',
  });
  const shield = unit({
    id: '101130200',
    fullName: '圣王国的盾兵',
    faction: '圣王国',
    acValue: 2,
    baseAcValue: 2,
    damage: 1,
    cardlocation: 'HAND',
  });
  const state = game({ hand: [rookie, shield, archer], unitZone: [null, null, null, null, null, null] });
  const chosen = choosePlayableCard(state, state.players.BOT, profile, 'hard', () => true);
  const archerScore = scorePlayableCard(state, state.players.BOT, archer as any, profile);
  const rookieScore = scorePlayableCard(state, state.players.BOT, rookie as any, profile);
  return assertScenario(
    'white temple plays archer before its hand-to-field targets',
    chosen?.id === '101130202' && archerScore > rookieScore + 25,
    `chosen=${chosen?.fullName || 'none'}, archer=${archerScore.toFixed(1)}, rookie=${rookieScore.toFixed(1)}`
  );
}

function testWhiteTempleOptionalArcherTriggerSelectsTarget(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const archer = unit({
    id: '101130202',
    fullName: '南征军的弓兵',
    faction: '圣王国',
    cardlocation: 'UNIT',
  });
  const rookie = unit({
    id: '101130233',
    fullName: '坚定的新人卫士',
    faction: '圣王国',
    acValue: 3,
    baseAcValue: 3,
    damage: 1,
    cardlocation: 'HAND',
  });
  const magicSpear = unit({
    id: '101130440',
    fullName: '殿堂骑士·魔枪',
    faction: '圣王国',
    acValue: 2,
    baseAcValue: 2,
    damage: 2,
    cardlocation: 'HAND',
  });
  const state = game({
    hand: [rookie, magicSpear],
    unitZone: [archer, null, null, null, null, null],
  });
  const query = {
    id: 'white_archer_hand_to_field',
    type: 'SELECT_CARD',
    playerUid: 'BOT',
    title: '选择放置到战场的单位',
    description: '选择你的手牌中的1张AC+3以下<圣王国>非神蚀单位卡，将其放置到战场。',
    callbackKey: 'EFFECT_RESOLVE',
    minSelections: 0,
    maxSelections: 1,
    context: { sourceCardId: archer.gamecardId, effectId: '101130202_hand_to_field' },
    options: [
      { card: rookie, isMine: true },
      { card: magicSpear, isMine: true },
    ],
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  const selectedCard = [rookie, magicSpear].find(card => card.gamecardId === selected[0]);
  return assertScenario(
    'white temple optional archer trigger chooses the best hand target',
    selectedCard?.id === '101130440',
    `selected=${selectedCard?.fullName || selected.join(',') || 'none'}`
  );
}

function testWhiteTempleProtectsArcherLineFromPayment(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const archer = unit({
    id: '101130202',
    fullName: '南征军的弓兵',
    faction: '圣王国',
    cardlocation: 'HAND',
  });
  const rookie = unit({
    id: '101130233',
    fullName: '坚定的新人卫士',
    faction: '圣王国',
    acValue: 3,
    baseAcValue: 3,
    damage: 1,
    feijingMark: true,
    cardlocation: 'HAND',
  });
  const expendableFeijing = unit({
    id: 'WHITE_EXPENDABLE_FEIJING',
    fullName: 'Expendable Feijing',
    faction: '女神教会',
    acValue: 3,
    baseAcValue: 3,
    damage: 1,
    feijingMark: true,
    cardlocation: 'HAND',
  });
  const state = game({ hand: [archer, rookie, expendableFeijing] });
  const rookieScore = scorePaymentSacrificeValue(rookie as any, profile, state, state.players.BOT);
  const expendableScore = scorePaymentSacrificeValue(expendableFeijing as any, profile, state, state.players.BOT);
  return assertScenario(
    'white temple payment keeps archer hand-to-field target in hand',
    rookieScore > expendableScore + 20,
    `rookie=${rookieScore.toFixed(1)}, expendable=${expendableScore.toFixed(1)}`
  );
}

function testWhiteTempleEscortTargetsOpponentFirst(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const escort = unit({ id: '101140151', fullName: '教会的押送人', faction: '女神教会', cardlocation: 'UNIT' });
  const ownKeyUnit = unit({
    id: '101130440',
    fullName: '殿堂骑士·魔枪',
    faction: '圣王国',
    damage: 2,
    power: 2500,
    cardlocation: 'UNIT',
  });
  const opponentThreat = unit({
    id: 'OPPONENT_THREAT',
    fullName: 'Opponent Threat',
    damage: 2,
    power: 3000,
    cardlocation: 'UNIT',
  });
  const state = game(
    { unitZone: [escort, ownKeyUnit, null, null, null, null] },
    { unitZone: [opponentThreat, null, null, null, null, null] }
  );
  const query = {
    id: 'white_escort_exile',
    type: 'SELECT_CARD',
    playerUid: 'BOT',
    title: '选择放逐目标',
    description: '选择战场上的1张《教会的押送人》以外的卡。',
    callbackKey: 'EFFECT_RESOLVE',
    minSelections: 1,
    maxSelections: 1,
    context: { sourceCardId: escort.gamecardId, effectId: '101140151_enter_exile' },
    options: [
      { card: ownKeyUnit, isMine: true },
      { card: opponentThreat, isMine: false },
    ],
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  const selectedCard = [ownKeyUnit, opponentThreat].find(card => card.gamecardId === selected[0]);
  return assertScenario(
    'white temple escort exiles opponent target before own unit',
    selectedCard?.gamecardId === opponentThreat.gamecardId,
    `selected=${selectedCard?.fullName || selected.join(',') || 'none'}`
  );
}

function testBotDoesNotAlwaysSpendFeijing(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const feijing = unit({
    id: '101130233',
    fullName: '坚定的新人卫士',
    faction: '圣王国',
    color: 'WHITE',
    feijingMark: true,
    cardlocation: 'HAND',
  });
  const sourceCard = story({
    id: 'WHITE_COST_ONE_STORY',
    fullName: 'White Cost One Story',
    color: 'WHITE',
    acValue: 1,
    baseAcValue: 1,
    cardlocation: 'HAND',
  });
  const state = game({
    hand: [sourceCard, feijing],
    deck: deckCards(20, 'BOT_FEIJING_PAYMENT'),
    botDifficulty: 'hard',
    botDeckProfileId: profile.id,
  }, {}, {
    botDifficulty: 'hard',
    botDeckProfiles: { BOT: profile.id },
  });
  const payment = ServerGameService.buildBotPaymentSelectionForPlayer(state, 'BOT', {
    paymentCost: 1,
    paymentColor: 'WHITE',
    context: {
      cardId: sourceCard.gamecardId,
      sourceCardId: sourceCard.gamecardId,
      paymentTargetId: sourceCard.gamecardId,
    },
  }) as any;
  return assertScenario(
    'hard AI does not spend feijing for every small payment',
    !payment.feijingCardId,
    `payment=${JSON.stringify(payment)}`
  );
}

function testEffectPaymentUsesActivationCostNotSourcePlayCost(): ScenarioResult {
  const source = unit({
    id: 'HIGH_COST_EFFECT_SOURCE',
    fullName: 'High Cost Effect Source',
    color: 'BLUE',
    acValue: 5,
    baseAcValue: 5,
    power: 2000,
    damage: 1,
  });
  const state = game(
    {
      unitZone: [source, null, null, null, null, null],
      deck: deckCards(2, 'BOT_EFFECT_PAYMENT_DECK'),
      erosionFront: [],
      erosionBack: [],
      botDeckProfileId: 'blue-adventurer',
    },
    {}
  );
  const query = {
    type: 'SELECT_PAYMENT',
    playerUid: 'BOT',
    paymentCost: 1,
    paymentColor: 'BLUE',
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'ACTIVATE_COST_RESOLVE',
    context: { sourceCardId: source.gamecardId },
  };
  const canPay = ServerGameService.canBotPayQueryCost(state as any, 'BOT', query as any);
  const payment = canPay ? ServerGameService.buildBotPaymentSelectionForPlayer(state as any, 'BOT', query as any) : undefined;

  return assertScenario(
    'effect payment uses activation cost instead of source play cost',
    canPay && !!payment,
    `canPay=${canPay}, payment=${JSON.stringify(payment)}`
  );
}

function testEffectCostFunctionPrecheckSkipsUnaffordableActivation(): ScenarioResult {
  const profile = getDeckAiProfile('big-salala');
  const paidCost = (async () => true) as any;
  paidCost.paymentCost = 1;
  paidCost.paymentColor = 'GREEN';
  const source = unit({
    id: '103090078',
    fullName: 'Windmill Cannon',
    color: 'GREEN',
    faction: 'Green Engine',
    power: 2500,
    damage: 2,
    effects: [effect({
      id: '103090078_destroy_later',
      type: 'ACTIVATE',
      triggerLocation: ['UNIT'],
      description: 'pay 1 cost and exhaust this: destroy later',
      condition: () => true,
      cost: paidCost,
      targetSpec: { controller: 'OPPONENT', zones: ['UNIT'], minSelections: 1, maxSelections: 1 },
    })],
  });
  const target = unit({
    id: 'OPPONENT_TARGET_FOR_WINDMILL',
    fullName: 'Opponent Target',
    power: 1500,
    damage: 1,
  });
  const state = game(
    {
      deck: [],
      unitZone: [source, null, null, null, null, null],
      erosionBack: erosionCards(9, 'BOT_EFFECT_COST_EROSION'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    { unitZone: [target, null, null, null, null, null] },
    {
      phase: 'MAIN',
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );
  const candidates = ServerGameService.getBotActivatableEffectCandidates(state, 'BOT') as any[];
  const included = candidates.some(candidate => candidate.effect?.id === '103090078_destroy_later');
  return assertScenario(
    'effect cost function precheck skips unaffordable activation',
    !included,
    `included=${included}, candidates=${candidates.map(candidate => `${candidate.effect?.id}:${candidate.paymentCost}`).join(',')}`
  );
}

function testOpeningFirstPlayerPaymentUsesUnitAgainstNonAggro(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const payer = unit({
    id: 'OPENING_PAYMENT_UNIT',
    fullName: 'Opening Payment Unit',
    color: 'WHITE',
    power: 1000,
    damage: 1,
    playedTurn: 1,
  });
  const sourceCard = story({
    id: 'OPENING_PAYMENT_SOURCE',
    fullName: 'Opening Payment Source',
    color: 'WHITE',
    acValue: 1,
    baseAcValue: 1,
  });
  const state = game(
    {
      isFirst: true,
      hand: [sourceCard],
      unitZone: [payer, null, null, null, null, null],
      deck: deckCards(20, 'BOT_OPENING_PAY_NON_AGGRO'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    {
      botDeckProfileId: 'white-temple',
      deck: deckCards(20, 'P1_OPENING_PAY_NON_AGGRO'),
    },
    {
      turnCount: 1,
      phase: 'MAIN',
      currentTurnPlayer: 0,
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id, P1: 'white-temple' },
    }
  );
  const payment = ServerGameService.buildBotPaymentSelectionForPlayer(state, 'BOT', {
    paymentCost: 1,
    paymentColor: 'WHITE',
    context: {
      cardId: sourceCard.gamecardId,
      sourceCardId: sourceCard.gamecardId,
      paymentTargetId: sourceCard.gamecardId,
    },
  }) as any;
  return assertScenario(
    'opening first-player payment uses unit against non-aggro',
    (payment.exhaustUnitIds || []).includes(payer.gamecardId),
    `payment=${JSON.stringify(payment)}`
  );
}

function testOpeningFirstPlayerPaymentStillRespectsAggro(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const payer = unit({
    id: 'OPENING_PAYMENT_AGGRO_UNIT',
    fullName: 'Opening Payment Aggro Unit',
    color: 'WHITE',
    power: 1000,
    damage: 1,
    playedTurn: 1,
  });
  const sourceCard = story({
    id: 'OPENING_PAYMENT_AGGRO_SOURCE',
    fullName: 'Opening Payment Aggro Source',
    color: 'WHITE',
    acValue: 1,
    baseAcValue: 1,
  });
  const state = game(
    {
      isFirst: true,
      hand: [sourceCard],
      unitZone: [payer, null, null, null, null, null],
      deck: deckCards(20, 'BOT_OPENING_PAY_AGGRO'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    {
      botDeckProfileId: 'red-dikai',
      deck: deckCards(20, 'P1_OPENING_PAY_AGGRO'),
    },
    {
      turnCount: 1,
      phase: 'MAIN',
      currentTurnPlayer: 0,
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id, P1: 'red-dikai' },
    }
  );
  const payment = ServerGameService.buildBotPaymentSelectionForPlayer(state, 'BOT', {
    paymentCost: 1,
    paymentColor: 'WHITE',
    context: {
      cardId: sourceCard.gamecardId,
      sourceCardId: sourceCard.gamecardId,
      paymentTargetId: sourceCard.gamecardId,
    },
  }) as any;
  return assertScenario(
    'opening first-player payment still respects aggro',
    !(payment.exhaustUnitIds || []).includes(payer.gamecardId),
    `payment=${JSON.stringify(payment)}`
  );
}

function testPaymentProtectsGodMark(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const god = unit({ id: 'PAY_GOD', fullName: 'Pay God', godMark: true, power: 5000, damage: 2 });
  const low = unit({ id: 'PAY_LOW', fullName: 'Pay Low', power: 500, damage: 0 });
  const state = game({ unitZone: [god, low, null, null, null, null] });
  const godScore = scorePaymentExhaustValue(state, god as any, profile, 'hard');
  const lowScore = scorePaymentExhaustValue(state, low as any, profile, 'hard');
  return assertScenario(
    'payment scoring protects god/high value unit',
    godScore > lowScore + 100,
    `god=${Math.round(godScore)}, low=${Math.round(lowScore)}`
  );
}

function testDiscardCostUsesFeijingBeforeProtectionCard(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const feijing = unit({
    id: 'WHITE_HAND_FEIJING',
    fullName: 'White Hand Feijing',
    color: 'WHITE',
    cardlocation: 'HAND',
    damage: 0,
    power: 500,
    feijingMark: true,
  });
  const protection = story({
    id: '201000059',
    fullName: "Knight's Oath",
    color: 'WHITE',
    effects: [effect({ id: '201000059_prevent_destroy', description: 'prevent destroy protect unit' })],
  });
  const state = game({ hand: [feijing, protection], botDeckProfileId: 'white-temple' });
  const query = {
    type: 'SELECT_CARD',
    title: 'discard as cost',
    description: 'discard a card as cost',
    options: [
      { card: feijing, source: 'HAND', isMine: true },
      { card: protection, source: 'HAND', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { costType: 'DISCARD_HAND_COST', step: 'DISCARD' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'discard cost uses feijing before protection card',
    selected[0] === feijing.gamecardId,
    `selected=${selected[0]}`
  );
}

function testCostAvoidsCurrentBattleUnit(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const currentDefender = unit({ id: 'COST_CURRENT_DEFENDER', color: 'WHITE', fullName: 'Cost Current Defender', power: 2500, damage: 1 });
  const expendable = unit({ id: 'COST_EXPENDABLE_UNIT', color: 'WHITE', fullName: 'Cost Expendable Unit', power: 500, damage: 0 });
  const attacker = unit({ id: 'COST_OPP_ATTACKER', color: 'RED', fullName: 'Cost Opponent Attacker', power: 2000, damage: 2 });
  const state = game(
    { unitZone: [currentDefender, expendable, null, null, null, null], botDeckProfileId: 'white-temple' },
    { unitZone: [attacker, null, null, null, null, null] },
    {
      phase: 'BATTLE_FREE',
      currentTurnPlayer: 1,
      battleState: {
        attackers: [attacker.gamecardId],
        defender: currentDefender.gamecardId,
      },
    }
  );
  state.players.BOT.isTurn = false;
  state.players.P1.isTurn = true;
  const query = {
    type: 'SELECT_CARD',
    title: 'send unit as cost',
    description: 'send one of your units to grave as cost',
    options: [
      { card: currentDefender, source: 'UNIT', isMine: true },
      { card: expendable, source: 'UNIT', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { costType: 'SEND_FIELD_COST', step: 'SEND_UNIT' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'cost avoids sacrificing current battle unit',
    selected[0] === expendable.gamecardId,
    `selected=${selected[0]}`
  );
}

function testPaymentExhaustUsesLowUnitBeforeClosingAttacker(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const attacker = unit({ id: 'PAY_CLOSING_ATTACKER', color: 'RED', fullName: 'Pay Closing Attacker', damage: 2, power: 2500, playedTurn: 1 });
  const expendable = unit({ id: 'PAY_EXPENDABLE_UNIT', color: 'RED', fullName: 'Pay Expendable Unit', damage: 0, power: 500, playedTurn: 1 });
  const sourceCard = story({ id: 'RED_PAYMENT_SOURCE', color: 'RED', acValue: 1, baseAcValue: 1 });
  const state = game(
    {
      hand: [sourceCard],
      unitZone: [attacker, expendable, null, null, null, null],
      erosionBack: erosionCards(9, 'BOT_PAYMENT_HIGH_EROSION'),
      deck: deckCards(20, 'BOT_PAYMENT_LOW_DECK'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    { erosionBack: erosionCards(8, 'P1_PAYMENT_CLOSE') },
    {
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );
  const payment = ServerGameService.buildBotPaymentSelectionForPlayer(state, 'BOT', {
    paymentCost: 1,
    paymentColor: 'RED',
    context: {
      cardId: sourceCard.gamecardId,
      sourceCardId: sourceCard.gamecardId,
      paymentTargetId: sourceCard.gamecardId,
    },
  }) as any;
  return assertScenario(
    'payment exhaust uses low unit before closing attacker',
    (payment.exhaustUnitIds || []).includes(expendable.gamecardId) &&
      !(payment.exhaustUnitIds || []).includes(attacker.gamecardId),
    `payment=${JSON.stringify(payment)}`
  );
}

function testBigSalalaPaymentPreservesCradleUnderPressure(): ScenarioResult {
  const profile = getDeckAiProfile('big-salala');
  const cradle = unit({
    id: '105000481',
    fullName: 'Cradle Girl',
    color: 'YELLOW',
    damage: 0,
    power: 0,
    playedTurn: 1,
  });
  const captain = unit({
    id: '101140099',
    fullName: 'Church Knight Captain',
    color: 'WHITE',
    damage: 2,
    power: 1500,
    playedTurn: 1,
  });
  const opponentA = unit({ id: 'P1_PAYMENT_PRESSURE_A', color: 'BLUE', damage: 3, power: 3000, playedTurn: 1 });
  const opponentB = unit({ id: 'P1_PAYMENT_PRESSURE_B', color: 'BLUE', damage: 3, power: 2500, playedTurn: 1 });
  const sourceCard = story({ id: 'BIG_SALALA_PAYMENT_SOURCE', color: 'GREEN', acValue: 1, baseAcValue: 1 });
  const state = game(
    {
      hand: [sourceCard],
      unitZone: [cradle, captain, null, null, null, null],
      erosionBack: erosionCards(4, 'BOT_BIG_PAYMENT_EROSION'),
      deck: deckCards(9, 'BOT_BIG_PAYMENT_DECK'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    {
      unitZone: [opponentA, opponentB, null, null, null, null],
      botDeckProfileId: 'blue-adventurer',
    },
    {
      phase: 'END',
      turnCount: 5,
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id, P1: 'blue-adventurer' },
    }
  );
  const payment = ServerGameService.buildBotPaymentSelectionForPlayer(state, 'BOT', {
    paymentCost: 1,
    paymentColor: 'GREEN',
    context: {
      cardId: sourceCard.gamecardId,
      sourceCardId: sourceCard.gamecardId,
      paymentTargetId: sourceCard.gamecardId,
    },
  }) as any;
  const cradleScore = scorePaymentExhaustValue(state, cradle as any, profile, 'hard');
  const captainScore = scorePaymentExhaustValue(state, captain as any, profile, 'hard');
  return assertScenario(
    'big salala payment preserves cradle under pressure',
    !(payment.exhaustUnitIds || []).includes(cradle.gamecardId) &&
      cradleScore > captainScore,
    `payment=${JSON.stringify(payment)}, cradle=${cradleScore.toFixed(1)}, captain=${captainScore.toFixed(1)}`
  );
}

function testNegativeCostProtectsErosionGodmark(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const low = unit({
    id: 'LOW_EROSION_COST',
    fullName: 'Low Erosion Cost',
    color: 'WHITE',
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
    damage: 0,
    power: 500,
  });
  const godmark = unit({
    id: '101000501',
    fullName: 'White Tiger',
    color: 'WHITE',
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
    godMark: true,
    damage: 3,
    power: 3500,
  });
  const state = game(
    {
      erosionFront: [godmark, low],
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    {},
    {
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );
  const payment = ServerGameService.buildBotPaymentSelectionForPlayer(state, 'BOT', {
    paymentCost: -1,
    paymentColor: 'WHITE',
    context: {},
  }) as any;
  return assertScenario(
    'negative cost protects erosion godmark',
    payment.erosionFrontIds?.[0] === low.gamecardId,
    `payment=${JSON.stringify(payment)}`
  );
}

function testDefenseDoesNotThrowGodMarkOnNonLethalHit(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const god = unit({ id: 'DEF_GOD', fullName: 'Def God', godMark: true, power: 1000, damage: 2 });
  const low = unit({ id: 'DEF_LOW', fullName: 'Def Low', power: 1000, damage: 0 });
  const attacker = unit({ id: 'ATTACKER', fullName: 'Attacker', power: 1000, damage: 1 });
  const state = game(
    { unitZone: [god, low, null, null, null, null], erosionFront: [], erosionBack: [] },
    { unitZone: [attacker, null, null, null, null, null] },
    { phase: 'DEFENSE_DECLARATION' }
  );
  const chosen = chooseDefender(state, state.players.BOT, [attacker] as any, [god, low] as any, profile, 'hard');
  return assertScenario(
    'defense avoids trading god mark on non-lethal hit',
    !chosen || chosen.gamecardId !== god.gamecardId,
    `chosen=${chosen?.fullName || 'none'}`
  );
}

function testDefenseDeclinesLowImpactChumpBlock(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const low = unit({ id: 'CHUMP_LOW', fullName: 'Chump Low', color: 'RED', power: 500, damage: 0 });
  const attacker = unit({ id: 'LOW_IMPACT_ATTACKER', fullName: 'Low Impact Attacker', color: 'WHITE', power: 2500, damage: 1 });
  const state = game(
    {
      unitZone: [low, null, null, null, null, null],
      erosionFront: [],
      erosionBack: [],
      deck: deckCards(20, 'BOT_CHUMP_SAFE'),
    },
    { unitZone: [attacker, null, null, null, null, null] },
    { phase: 'DEFENSE_DECLARATION' }
  );
  const chosen = chooseDefender(state, state.players.BOT, [attacker] as any, [low] as any, profile, 'hard');
  return assertScenario(
    'defense declines low-impact chump block',
    !chosen,
    `chosen=${chosen?.fullName || 'none'}`
  );
}

function testMagicSpearDeclinesNonLethalDefenseLoss(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const spear = unit({
    id: '101130440',
    fullName: 'Temple Knight Magic Spear',
    color: 'WHITE',
    power: 2000,
    damage: 2,
  });
  const attacker = unit({
    id: 'RED_3000_ATTACKER',
    fullName: '3000 Attacker',
    color: 'RED',
    power: 3000,
    damage: 1,
  });
  const state = game(
    {
      unitZone: [spear, null, null, null, null, null],
      erosionFront: [],
      erosionBack: [],
      deck: deckCards(20, 'BOT_SPEAR_DEF_SAFE'),
      botDeckProfileId: 'white-temple',
    },
    { unitZone: [attacker, null, null, null, null, null] },
    { phase: 'DEFENSE_DECLARATION' }
  );
  const chosen = chooseDefender(state, state.players.BOT, [attacker] as any, [spear] as any, profile, 'hard');
  return assertScenario(
    'magic spear declines non-lethal defense that would destroy it',
    !chosen,
    `chosen=${chosen?.fullName || 'none'}`
  );
}

function testDefenseSacrificesLowValueUnitToPreventLethalHit(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const god = unit({ id: 'LETHAL_DEF_GOD', fullName: 'Lethal Def God', godMark: true, power: 500, damage: 2 });
  const low = unit({ id: 'LETHAL_DEF_LOW', fullName: 'Lethal Def Low', power: 500, damage: 0 });
  const attacker = unit({ id: 'LETHAL_ATTACKER', fullName: 'Lethal Attacker', color: 'RED', power: 3000, damage: 1 });
  const state = game(
    {
      unitZone: [god, low, null, null, null, null],
      erosionFront: [],
      erosionBack: erosionCards(9, 'BOT_DEF_LETHAL'),
      deck: deckCards(20, 'BOT_DEF_LETHAL_DECK'),
    },
    { unitZone: [attacker, null, null, null, null, null] },
    { phase: 'DEFENSE_DECLARATION' }
  );
  const chosen = chooseDefender(state, state.players.BOT, [attacker] as any, [god, low] as any, profile, 'hard');
  return assertScenario(
    'defense sacrifices low-value unit to prevent lethal hit',
    chosen?.gamecardId === low.gamecardId,
    `chosen=${chosen?.fullName || 'none'}`
  );
}

function testDefenseHighValueUnitBlocksLethalWhenOnlyOption(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const god = unit({ id: 'ONLY_LETHAL_GOD', fullName: 'Only Lethal God', godMark: true, power: 1000, damage: 2 });
  const attacker = unit({ id: 'ONLY_LETHAL_ATTACKER', fullName: 'Only Lethal Attacker', color: 'RED', power: 1000, damage: 1 });
  const state = game(
    {
      unitZone: [god, null, null, null, null, null],
      erosionFront: [],
      erosionBack: erosionCards(9, 'BOT_ONLY_LETHAL'),
      deck: deckCards(20, 'BOT_ONLY_LETHAL_DECK'),
    },
    { unitZone: [attacker, null, null, null, null, null] },
    { phase: 'DEFENSE_DECLARATION' }
  );
  const chosen = chooseDefender(state, state.players.BOT, [attacker] as any, [god] as any, profile, 'hard');
  return assertScenario(
    'defense uses high-value unit when it is the only lethal block',
    chosen?.gamecardId === god.gamecardId,
    `chosen=${chosen?.fullName || 'none'}`
  );
}

function testDefensePreservesHighValueIfBlockCannotStopFollowupLethal(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const cocoa = unit({
    id: '104030126',
    fullName: 'Twin Star Cocoa',
    color: 'BLUE',
    godMark: true,
    power: 3000,
    damage: 3,
    playedTurn: 11,
  });
  const salala = unit({
    id: '103000426',
    fullName: 'Big Salala',
    color: 'GREEN',
    godMark: true,
    power: 4000,
    damage: 3,
    playedTurn: 1,
    isExhausted: true,
  });
  const unicorn = unit({
    id: '103000189',
    fullName: 'Clean Unicorn',
    color: 'WHITE',
    power: 3500,
    damage: 3,
    playedTurn: 1,
  });
  const state = game(
    {
      unitZone: [cocoa, null, null, null, null, null],
      erosionBack: erosionCards(7, 'BOT_COCOA_DOOMED_EROSION'),
      deck: deckCards(10, 'BOT_COCOA_DOOMED_DECK'),
      botDeckProfileId: 'blue-adventurer',
    },
    {
      unitZone: [salala, unicorn, null, null, null, null],
      botDeckProfileId: 'big-salala',
    },
    {
      phase: 'DEFENSE_DECLARATION',
      currentTurnPlayer: 1,
      battleState: { attackers: [salala.gamecardId], isAlliance: false },
      botDeckProfiles: { BOT: 'blue-adventurer', P1: 'big-salala' },
    }
  );
  state.players.BOT.isTurn = false;
  state.players.P1.isTurn = true;

  const chosen = chooseDefender(state, state.players.BOT, [salala] as any, [cocoa] as any, profile, 'hard');
  return assertScenario(
    'defense preserves high-value unit if block cannot stop follow-up lethal',
    !chosen,
    `chosen=${chosen?.fullName || 'none'}`
  );
}

function testDefenseTakesProfitableWinAgainstHighValueAttacker(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const defender = unit({ id: 'PROFITABLE_DEFENDER', fullName: 'Profitable Defender', color: 'RED', power: 3500, damage: 0 });
  const attacker = unit({
    id: 'PROFITABLE_GOD_ATTACKER',
    fullName: 'Profitable God Attacker',
    color: 'WHITE',
    godMark: true,
    power: 1000,
    damage: 2,
  });
  const state = game(
    {
      unitZone: [defender, null, null, null, null, null],
      erosionFront: [],
      erosionBack: [],
      deck: deckCards(20, 'BOT_PROFIT_DEF'),
    },
    { unitZone: [attacker, null, null, null, null, null] },
    { phase: 'DEFENSE_DECLARATION' }
  );
  const chosen = chooseDefender(state, state.players.BOT, [attacker] as any, [defender] as any, profile, 'hard');
  return assertScenario(
    'defense takes profitable win against high-value attacker',
    chosen?.gamecardId === defender.gamecardId,
    `chosen=${chosen?.fullName || 'none'}`
  );
}

function testActiveDeckProfilesProduceTurnPlans(): ScenarioResult {
  const ids = ['white-temple', 'blue-adventurer', 'red-dikai', 'big-salala'];
  const failures: string[] = [];
  for (const id of ids) {
    const profile = getDeckAiProfile(id);
    const attacker = unit({ id: `${id}_ATTACKER`, damage: id === 'red-dikai' ? 2 : 1, playedTurn: 1 });
    const state = game({ unitZone: [attacker, null, null, null, null, null] });
    const plan = buildTurnPlan(state, state.players.BOT, profile);
    if (!plan.tacticalLine || !plan.mode) failures.push(id);
  }
  return assertScenario(
    'all active hard AI deck profiles produce tactical turn plans',
    failures.length === 0,
    failures.length ? `failed=${failures.join(',')}` : `profiles=${ids.length}`
  );
}

function testActiveHardAiDeckProfileList(): ScenarioResult {
  const activeIds = AI_DECK_PROFILES.map(profile => profile.id);
  const legacyYellow = getDeckAiProfile('yellow-alchemy');
  const legacyTotem = getDeckAiProfile('overlord-totem');
  const activeMatches =
    activeIds.join(',') === 'white-temple,blue-adventurer,red-dikai,big-salala' &&
    !activeIds.includes('yellow-alchemy') &&
    !activeIds.includes('overlord-totem') &&
    legacyYellow.id === 'yellow-alchemy' &&
    legacyTotem.id === 'overlord-totem';

  return assertScenario(
    'active hard AI deck list replaces yellow and totem with big salala',
    activeMatches,
    `active=${activeIds.join(',')}, legacyYellow=${legacyYellow.id}, legacyTotem=${legacyTotem.id}`
  );
}

async function testHardAiProfilesOpponentFromHiddenDeckAndHand(): Promise<ScenarioResult> {
  const whiteProfile = getDeckAiProfile('white-temple');
  const redProfile = getDeckAiProfile('red-dikai');
  await initServerCardLibrary();
  const catalogRefs = Object.keys(SERVER_CARD_LIBRARY).filter(ref => ref.includes(':')).sort();
  const redRefs = decodeDeckShareCode(redProfile.shareCode || '', catalogRefs);
  const redCards = redRefs.map((ref, index) => ({
    ...SERVER_CARD_LIBRARY[ref],
    uniqueId: ref,
    gamecardId: `HIDDEN_RED_${index}`,
    cardlocation: index < 4 ? 'HAND' : 'DECK',
  }));
  const state = game(
    {
      unitZone: [unit({ id: 'WHITE_SCOUT', color: 'WHITE', damage: 1, playedTurn: 1 }), null, null, null, null, null],
      botDeckProfileId: whiteProfile.id,
    },
    {
      hand: redCards.slice(0, 4),
      deck: redCards.slice(4),
    },
    { botDeckProfiles: { BOT: whiteProfile.id }, turnCount: 2 }
  );

  const opponentProfile = inferPlayerDeckProfile(state, 'P1');
  const plan = buildTurnPlan(state, state.players.BOT, whiteProfile);
  return assertScenario(
    'hard AI profiles opponent from hidden deck and hand',
    opponentProfile?.knownProfileId === 'red-dikai' &&
      plan.opponentProfileId === 'red-dikai' &&
      plan.notes.some(note => note === 'matchup=red-dikai'),
    `known=${opponentProfile?.knownProfileId || 'none'}, planOpponent=${plan.opponentProfileId || 'none'}, notes=${plan.notes.join('|')}`
  );
}

async function testBigSalalaShareCodeDeckIsValid(): Promise<ScenarioResult> {
  const profile = getDeckAiProfile('big-salala');
  await initServerCardLibrary();
  const catalogRefs = (await loadServerCards())
    .map(card => card.uniqueId)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const refs = decodeDeckShareCode(profile.shareCode || '', catalogRefs);
  const cards = refs.map(ref => SERVER_CARD_LIBRARY[ref]).filter(Boolean);
  const validation = ServerGameService.validateDeck(cards as any);
  const hasSalala = cards.some(card => card?.id === '103000426');

  return assertScenario(
    'big salala share code resolves to a valid hard AI deck',
    refs.length === 50 && cards.length === refs.length && validation.valid && hasSalala,
    `refs=${refs.length}, cards=${cards.length}, valid=${validation.valid}, hasSalala=${hasSalala}`
  );
}

function testWhiteTempleConvertsHallPressure(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const spear = unit({ id: '101130440', fullName: 'Temple Knight Magic Spear', damage: 2, power: 2500, playedTurn: 1 });
  const sword = unit({ id: '101130458', fullName: 'Temple Knight Hero Sword', damage: 2, power: 2500, playedTurn: 1 });
  const state = game(
    { unitZone: [spear, sword, null, null, null, null] },
    { erosionBack: erosionCards(6, 'P1_WHITE_ROUTE') }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  const hasRouteNote = plan.notes.some(note => note.includes('white route:'));
  return assertScenario(
    'white temple route turns hall board into reset pressure',
    plan.attackBeforeDeveloping && hasRouteNote,
    `attackBefore=${plan.attackBeforeDeveloping}, notes=${plan.notes.join('|')}`
  );
}

function testBlueAdventurerConvertsTempoPressure(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const adventurer = unit({ id: 'BLUE_ROUTE_ATTACKER', color: 'BLUE', damage: 2, power: 2000, playedTurn: 1 });
  const state = game(
    { unitZone: [adventurer, null, null, null, null, null] },
    { erosionBack: erosionCards(4, 'P1_BLUE_ROUTE') }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  const hasRouteNote = plan.notes.some(note => note.includes('blue route:'));
  return assertScenario(
    'blue adventurer route converts tempo unit into erosion pressure',
    plan.attackBeforeDeveloping && hasRouteNote,
    `attackBefore=${plan.attackBeforeDeveloping}, notes=${plan.notes.join('|')}`
  );
}

function testBlockedErosionLineStabilizesUnderIncomingLethal(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const tempoAttacker = unit({ id: 'BLUE_BLOCKED_PRESSURE', color: 'BLUE', damage: 1, power: 2000, playedTurn: 1 });
  const whiteThreatA = unit({ id: 'WHITE_THREAT_A', color: 'WHITE', damage: 4, power: 3500, playedTurn: 1 });
  const whiteThreatB = unit({ id: 'WHITE_THREAT_B', color: 'WHITE', damage: 4, power: 3500, playedTurn: 1 });
  const state = game(
    {
      unitZone: [tempoAttacker, null, null, null, null, null],
      erosionBack: erosionCards(2, 'BOT_BLOCKED_PRESSURE'),
      botDeckProfileId: profile.id,
    },
    {
      unitZone: [whiteThreatA, whiteThreatB, null, null, null, null],
      erosionBack: erosionCards(9, 'P1_BLOCKED_PRESSURE'),
    },
    { botDeckProfiles: { BOT: profile.id } }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  return assertScenario(
    'blocked erosion line stabilizes under incoming lethal',
    plan.mode === 'defense' &&
      !plan.attackBeforeDeveloping &&
      plan.tacticalLine === 'stabilize' &&
      plan.reserveDefenders >= 1 &&
      plan.notes.some(note => note.includes('incoming lethal overrides')),
    `mode=${plan.mode}, attackBefore=${plan.attackBeforeDeveloping}, reserve=${plan.reserveDefenders}, tactical=${plan.tacticalLine}, notes=${plan.notes.join('|')}`
  );
}

async function testClosingPlanCommitsAfterOnePrecombatPlay(): Promise<ScenarioResult> {
  const profile = getDeckAiProfile('blue-adventurer');
  const attackerA = unit({ id: 'BLUE_PRECOMBAT_A', color: 'BLUE', damage: 2, power: 2500, playedTurn: 1 });
  const attackerB = unit({ id: 'BLUE_PRECOMBAT_B', color: 'BLUE', damage: 1, power: 1500, playedTurn: 1 });
  const rushUnit = unit({
    id: 'BLUE_PRECOMBAT_RUSH',
    color: 'BLUE',
    fullName: 'Precombat Rush Unit',
    damage: 1,
    power: 2000,
    acValue: 0,
    baseAcValue: 0,
    colorReq: {},
    isrush: true,
    cardlocation: 'HAND',
  });
  const blocker = unit({ id: 'P1_PRECOMBAT_BLOCKER', color: 'WHITE', damage: 1, power: 1000, playedTurn: 1 });
  const state = game(
    {
      hand: [rushUnit],
      unitZone: [attackerA, attackerB, null, null, null, null],
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    {
      unitZone: [blocker, null, null, null, null, null],
      erosionBack: erosionCards(9, 'P1_PRECOMBAT_CLOSE'),
    },
    {
      turnCount: 3,
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  await ServerGameService.botMoveForPlayer(state, 'BOT');
  const playedCards = state.aiDecisionLogs?.filter((log: any) => log.action === 'PLAY_CARD') || [];

  return assertScenario(
    'closing plan commits after one precombat play',
    isClosingTurnPlan(plan) &&
      !plan.attackBeforeDeveloping &&
      playedCards.length === 1 &&
      (state.players.BOT as any).botClosingAttackTurn === state.turnCount,
    `closing=${isClosingTurnPlan(plan)}, attackBefore=${plan.attackBeforeDeveloping}, plays=${playedCards.length}, committed=${(state.players.BOT as any).botClosingAttackTurn}, phase=${state.phase}`
  );
}

async function testClosingPlayDoesNotExhaustLethalAttackers(): Promise<ScenarioResult> {
  const profile = getDeckAiProfile('blue-adventurer');
  const attackerA = unit({ id: 'BLUE_CLOSE_ATTACKER_A', color: 'BLUE', damage: 3, power: 3000, playedTurn: 1 });
  const attackerB = unit({ id: 'BLUE_CLOSE_ATTACKER_B', color: 'BLUE', damage: 2, power: 2500, playedTurn: 1 });
  const expensiveRush = unit({
    id: 'BLUE_CLOSE_EXPENSIVE_RUSH',
    color: 'BLUE',
    fullName: 'Expensive Closing Distraction',
    damage: 1,
    power: 3500,
    acValue: 2,
    baseAcValue: 2,
    colorReq: {},
    isrush: true,
    cardlocation: 'HAND',
  });
  const blocker = unit({ id: 'P1_CLOSE_BLOCKER', color: 'WHITE', damage: 0, power: 1000, playedTurn: 1 });
  const state = game(
    {
      hand: [expensiveRush],
      unitZone: [attackerA, attackerB, null, null, null, null],
      deck: [],
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    {
      deck: deckCards(1, 'P1_CLOSE_PAYOFF_DECK'),
      unitZone: [blocker, null, null, null, null, null],
      erosionBack: erosionCards(5, 'P1_CLOSE_PAYOFF_EROSION'),
    },
    {
      turnCount: 13,
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  await ServerGameService.botMoveForPlayer(state, 'BOT');
  const playedDistraction = state.aiDecisionLogs?.some((log: any) =>
    log.action === 'PLAY_CARD' &&
    log.subject === 'Expensive Closing Distraction'
  );
  const enteredBattle = state.aiDecisionLogs?.some((log: any) => log.action === 'ENTER_BATTLE');

  return assertScenario(
    'closing play does not exhaust lethal attackers',
    isClosingTurnPlan(plan) &&
      !plan.attackBeforeDeveloping &&
      !playedDistraction &&
      enteredBattle &&
      state.phase === 'BATTLE_DECLARATION',
    `closing=${isClosingTurnPlan(plan)}, attackBefore=${plan.attackBeforeDeveloping}, played=${!!playedDistraction}, battle=${!!enteredBattle}, phase=${state.phase}, notes=${plan.notes.join('|')}`
  );
}

async function testClosingPlayDoesNotOverdevelopLowImpactUnit(): Promise<ScenarioResult> {
  const profile = getDeckAiProfile('big-salala');
  const salala = unit({ id: '103000426', fullName: 'Big Salala', color: 'GREEN', godMark: true, damage: 3, power: 4000, playedTurn: 1 });
  const angel = unit({ id: '101140435', fullName: 'War Angel', color: 'WHITE', damage: 2, power: 3000, playedTurn: 1 });
  const lowUnit = unit({
    id: '105000481',
    fullName: 'Low Impact Watcher',
    color: 'GREEN',
    damage: 1,
    power: 1000,
    acValue: 2,
    baseAcValue: 2,
    colorReq: {},
    cardlocation: 'HAND',
  });
  const tempoStory = story({
    id: 'BIG_CLOSE_TEMPO_STORY',
    fullName: 'Closing Cannot Defend Setup',
    color: 'GREEN',
    acValue: 0,
    baseAcValue: 0,
    effects: [effect({ id: 'big_close_cannot_defend', description: 'target opponent unit cannot defend this turn' })],
  });
  const blocker = unit({ id: 'P1_BIG_CLOSE_BLOCKER', color: 'BLUE', damage: 1, power: 1500, playedTurn: 1 });
  const state = game(
    {
      hand: [lowUnit, tempoStory],
      unitZone: [salala, angel, null, null, null, null],
      deck: deckCards(20, 'BOT_BIG_CLOSE_DECK'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    {
      unitZone: [blocker, null, null, null, null, null],
      erosionBack: erosionCards(7, 'P1_BIG_CLOSE_EROSION'),
      deck: deckCards(20, 'P1_BIG_CLOSE_DECK'),
    },
    {
      turnCount: 6,
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  await ServerGameService.botMoveForPlayer(state, 'BOT');
  const playedLowUnit = state.aiDecisionLogs?.some((log: any) =>
    log.action === 'PLAY_CARD' &&
    log.subject === 'Low Impact Watcher'
  );
  const enteredBattle = state.aiDecisionLogs?.some((log: any) => log.action === 'ENTER_BATTLE');

  return assertScenario(
    'closing play does not overdevelop low-impact unit',
    !plan.attackBeforeDeveloping &&
      !playedLowUnit &&
      (enteredBattle || state.players.BOT.playZone.some((card: any) => card.gamecardId === tempoStory.gamecardId)),
    `closing=${isClosingTurnPlan(plan)}, pressure=${plan.totalAvailableDamage}/${plan.damageToCritical}, attackBefore=${plan.attackBeforeDeveloping}, played=${!!playedLowUnit}, battle=${!!enteredBattle}, phase=${state.phase}, notes=${plan.notes.join('|')}`
  );
}

async function testHardAiPlaysTargetedStoryOnlyOnce(): Promise<ScenarioResult> {
  const profile = getDeckAiProfile('white-temple');
  const targetEffect = effect({
    id: 'targeted_story_effect',
    type: 'ALWAYS',
    description: 'destroy target opponent unit',
    content: 'DESTROY TARGET OPPONENT UNIT',
    targetSpec: {
      title: 'choose opponent unit',
      description: 'choose opponent unit',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'OPPONENT',
    },
  });
  const targetedStory = story({
    id: 'TARGETED_STORY',
    fullName: 'Targeted Story',
    color: 'WHITE',
    acValue: 1,
    baseAcValue: 1,
    effects: [targetEffect],
  });
  const threat = unit({ id: 'TARGETED_STORY_THREAT', fullName: 'Targeted Story Threat', color: 'RED', damage: 2, power: 3500 });
  const state = game(
    {
      hand: [targetedStory],
      unitZone: [unit({ id: 'WHITE_COLOR_SOURCE', color: 'WHITE', damage: 1, playedTurn: 1 }), null, null, null, null, null],
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    { unitZone: [threat, null, null, null, null, null] },
    {
      turnCount: 3,
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );

  await ServerGameService.botMoveForPlayer(state, 'BOT');
  const failure = state.aiDecisionLogs?.find((log: any) =>
    log.action === 'PLAY_CARD_FAILED' &&
    log.subject === 'Targeted Story'
  );
  const playLog = state.aiDecisionLogs?.find((log: any) =>
    log.action === 'PLAY_CARD' &&
    log.subject === 'Targeted Story'
  );
  const inPlayZone = state.players.BOT.playZone.some((card: any) => card.gamecardId === targetedStory.gamecardId);
  const stillInHand = state.players.BOT.hand.some((card: any) => card.gamecardId === targetedStory.gamecardId);
  const paymentQuery = state.pendingQuery?.type === 'SELECT_PAYMENT';

  return assertScenario(
    'hard AI plays paid targeted story once with declared target',
    !failure && !!playLog && inPlayZone && !stillInHand && !paymentQuery,
    `failed=${failure?.details?.error || 'none'}, played=${!!playLog}, inPlay=${inPlayZone}, stillInHand=${stillInHand}, paymentQuery=${paymentQuery}, hand=${state.players.BOT.hand.length}, playZone=${state.players.BOT.playZone.length}`
  );
}

function testBigSalalaMillWaitsForDeckPressure(): ScenarioResult {
  const profile = getDeckAiProfile('big-salala');
  const millEffect = effect({
    id: '103000426_mill_three',
    type: 'ACTIVATE',
    description: 'main phase: mill opponent deck top 3',
    content: 'mill opponent deck top 3',
  });
  const earlySource = unit({
    id: '103000426',
    fullName: 'Salala',
    color: 'GREEN',
    godMark: true,
    damage: 3,
    power: 4000,
    acValue: 5,
    baseAcValue: 5,
    effects: [millEffect],
  });
  const lateSource = unit({
    id: '103000426',
    fullName: 'Salala',
    color: 'GREEN',
    godMark: true,
    damage: 3,
    power: 4000,
    acValue: 5,
    baseAcValue: 5,
    effects: [millEffect],
  });
  const salalaDeckCopies = [
    unit({ id: '103000426', fullName: 'Salala Deck Copy A', cardlocation: 'DECK', color: 'GREEN', godMark: true }),
    unit({ id: '103000426', fullName: 'Salala Deck Copy B', cardlocation: 'DECK', color: 'GREEN', godMark: true }),
  ];
  const earlyState = game(
    {
      unitZone: [earlySource, null, null, null, null, null],
      deck: [...salalaDeckCopies, ...deckCards(20, 'BOT_SALALA_EARLY')],
      botDeckProfileId: profile.id,
    },
    { deck: deckCards(18, 'P1_SALALA_EARLY') },
    { botDeckProfiles: { BOT: profile.id }, turnCount: 3 }
  );
  const lateState = game(
    {
      unitZone: [lateSource, null, null, null, null, null],
      hand: [unit({ id: '103000426', fullName: 'Salala Hand Copy', color: 'GREEN', godMark: true })],
      grave: [unit({ id: '103000426', fullName: 'Salala Grave Copy', cardlocation: 'GRAVE', color: 'GREEN', godMark: true })],
      deck: deckCards(14, 'BOT_SALALA_LATE'),
      botDeckProfileId: profile.id,
    },
    { deck: deckCards(3, 'P1_SALALA_LATE') },
    { botDeckProfiles: { BOT: profile.id }, turnCount: 7 }
  );

  const earlyScore = scoreActivatableEffect(
    earlyState,
    earlyState.players.BOT,
    earlySource as any,
    millEffect as any,
    profile,
    {}
  );
  const lateScore = scoreActivatableEffect(
    lateState,
    lateState.players.BOT,
    lateSource as any,
    millEffect as any,
    profile,
    {}
  );

  return assertScenario(
    'big salala mill waits for deck pressure',
    earlyScore.score < 18 && lateScore.score >= 18,
    `early=${earlyScore.score.toFixed(1)} notes=${earlyScore.notes.join('|')} late=${lateScore.score.toFixed(1)} notes=${lateScore.notes.join('|')}`
  );
}

function testRedDikaiCommitsNearKillPressure(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const dikaiA = unit({ id: 'RED_ROUTE_A', color: 'RED', damage: 2, power: 2500, playedTurn: 1 });
  const dikaiB = unit({ id: 'RED_ROUTE_B', color: 'RED', damage: 1, power: 1500, playedTurn: 1 });
  const state = game(
    { unitZone: [dikaiA, dikaiB, null, null, null, null], deck: deckCards(5, 'BOT_RED_ROUTE') },
    { erosionBack: erosionCards(7, 'P1_RED_ROUTE') }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  const hasRouteNote = plan.notes.some(note => note.includes('red route: commit'));
  return assertScenario(
    'red dikai route commits attackers in near-kill window',
    plan.attackBeforeDeveloping && plan.reserveDefenders === 0 && hasRouteNote,
    `attackBefore=${plan.attackBeforeDeveloping}, reserve=${plan.reserveDefenders}, notes=${plan.notes.join('|')}`
  );
}

function testRedPursuitUsesAllianceAttackForTrigger(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const pursuit = unit({
    id: '102050085',
    fullName: 'Pursuit Troop',
    color: 'RED',
    damage: 1,
    power: 500,
    isrush: true,
    playedTurn: 3,
  });
  const partner = unit({
    id: '102050086',
    fullName: 'Royal Guard',
    color: 'RED',
    damage: 1,
    power: 2000,
    playedTurn: 1,
  });
  const defender = unit({
    id: 'P1_PURSUIT_BLOCKER',
    fullName: 'Pursuit Blocker',
    color: 'WHITE',
    damage: 1,
    power: 1500,
    playedTurn: 1,
  });
  const state = game(
    { unitZone: [pursuit, partner, null, null, null, null], botDeckProfileId: 'red-dikai' },
    { unitZone: [defender, null, null, null, null, null] },
    { phase: 'BATTLE_DECLARATION', turnCount: 3 }
  );
  const attackCandidates = state.players.BOT.unitZone.filter(unit => canUnitAttack(state, unit)) as any[];
  const plan = getComboAllianceAttack(state as any, state.players.BOT as any, profile, attackCandidates);

  return assertScenario(
    'red pursuit uses alliance attack for trigger',
    !!plan &&
      plan.comboId === 'red-pursuit-alliance-damage' &&
      plan.attackers.some(card => card.gamecardId === pursuit.gamecardId),
    plan ? `combo=${plan.comboId}, attackers=${plan.attackers.map(card => card.id).join(',')}, score=${plan.score.toFixed(1)}` : 'no alliance plan'
  );
}

function testPrecombatCannotDefendDelaysAttack(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const attacker = unit({ id: 'RED_SEQUENCE_ATTACKER', color: 'RED', damage: 1, power: 2500, playedTurn: 1 });
  const cannotDefendStory = story({
    id: 'RED_SEQUENCE_CANNOT_DEFEND',
    color: 'RED',
    fullName: 'Precombat Cannot Defend',
    effects: [effect({ id: 'sequence_cannot_defend', description: 'target opponent unit cannot defend this turn' })],
  });
  const blocker = unit({ id: 'WHITE_SEQUENCE_BLOCKER', color: 'WHITE', damage: 0, power: 1000 });
  const state = game(
    { hand: [cannotDefendStory], unitZone: [attacker, null, null, null, null, null], botDeckProfileId: profile.id },
    { unitZone: [blocker, null, null, null, null, null], erosionBack: erosionCards(8, 'P1_SEQUENCE_BLOCKER') },
    { botDeckProfiles: { BOT: profile.id } }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  return assertScenario(
    'precombat cannot-defend action delays attack',
    !plan.attackBeforeDeveloping && plan.notes.some(note => note.includes('sequence pre-combat action')),
    `attackBefore=${plan.attackBeforeDeveloping}, notes=${plan.notes.join('|')}`
  );
}

function testBlueErosionSummonSequencedBeforeAttack(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const attacker = unit({ id: 'BLUE_SEQUENCE_ATTACKER', color: 'BLUE', damage: 1, power: 2000, playedTurn: 1 });
  const summonStory = story({
    id: 'BLUE_SEQUENCE_COMMISSION',
    color: 'BLUE',
    fullName: 'Accept Commission Sequence',
    effects: [effect({ id: 'sequence_play_from_erosion', description: 'play from erosion summon a blue adventurer to field' })],
  });
  const state = game(
    { hand: [summonStory], unitZone: [attacker, null, null, null, null, null], botDeckProfileId: profile.id },
    { erosionBack: erosionCards(5, 'P1_BLUE_SEQUENCE') },
    { botDeckProfiles: { BOT: profile.id } }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  const summonScore = scorePlayableCard(state, state.players.BOT, summonStory as any, profile);
  return assertScenario(
    'blue erosion summon is sequenced before attack',
    !plan.attackBeforeDeveloping && summonScore > 0,
    `attackBefore=${plan.attackBeforeDeveloping}, summon=${summonScore.toFixed(1)}, notes=${plan.notes.join('|')}`
  );
}

function testDirectLethalDoesNotWaitForSetup(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const attacker = unit({ id: 'DIRECT_LETHAL_ATTACKER', color: 'RED', damage: 2, power: 2500, playedTurn: 1 });
  const setupStory = story({
    id: 'DIRECT_LETHAL_SETUP',
    color: 'RED',
    fullName: 'Unneeded Setup',
    effects: [effect({ id: 'sequence_summon_setup', description: 'summon a unit from deck to field' })],
  });
  const state = game(
    { hand: [setupStory], unitZone: [attacker, null, null, null, null, null], botDeckProfileId: profile.id },
    { deck: deckCards(20, 'P1_DIRECT_LETHAL'), erosionBack: erosionCards(9, 'P1_DIRECT_LETHAL_EROSION') },
    { botDeckProfiles: { BOT: profile.id } }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  return assertScenario(
    'direct lethal does not wait for setup',
    plan.attackBeforeDeveloping,
    `attackBefore=${plan.attackBeforeDeveloping}, notes=${plan.notes.join('|')}`
  );
}

function testClosingPlanHelperRecognizesErosionLethal(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const attackerA = unit({ id: 'CLOSING_A', damage: 3, power: 3500, playedTurn: 1 });
  const attackerB = unit({ id: 'CLOSING_B', damage: 2, power: 2500, playedTurn: 1 });
  const state = game(
    { unitZone: [attackerA, attackerB, null, null, null, null] },
    { erosionBack: erosionCards(6, 'P1_CLOSING') }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  return assertScenario(
    'closing helper recognizes erosion lethal attack line',
    isClosingTurnPlan(plan),
    `mode=${plan.mode}, tactical=${plan.tacticalLine}, damage=${plan.totalAvailableDamage}/${plan.damageToCritical}`
  );
}

function testComboAllianceDoesNotOverrideDirectLethal(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const smile = unit({
    id: KNOWN_COMBO_CARD_IDS.smileKoriel,
    uniqueId: `${KNOWN_COMBO_CARD_IDS.smileKoriel}:N`,
    fullName: 'Smile Koriel',
    damage: 1,
    color: 'WHITE',
    playedTurn: 1,
    godMark: true,
  });
  const tiger = unit({ id: '101000501', fullName: 'White Tiger', damage: 3, power: 3500, color: 'WHITE', playedTurn: 1 });
  const spear = unit({ id: '101130440', fullName: 'Temple Spear', damage: 2, power: 2500, color: 'WHITE', playedTurn: 1 });
  const guard = unit({ id: '101130233', fullName: 'Temple Guard', damage: 2, power: 1500, color: 'WHITE', playedTurn: 1 });
  const eclipse = story({
    id: KNOWN_COMBO_CARD_IDS.eclipse,
    uniqueId: `${KNOWN_COMBO_CARD_IDS.eclipse}:N`,
    fullName: 'Eclipse',
    effects: [{ id: KNOWN_COMBO_CARD_IDS.eclipseEffect, type: 'ACTIVATE', description: 'combo board wipe' }],
  });
  const state = game(
    {
      hand: [eclipse],
      unitZone: [smile, tiger, spear, guard, null, null],
      erosionBack: erosionCards(3, 'BOT_DIRECT_LETHAL'),
    },
    {
      deck: deckCards(7, 'P1_DIRECT_LETHAL'),
      unitZone: [null, null, null, null, null, null],
    },
    { phase: 'BATTLE_DECLARATION' }
  );
  const plan = getComboAllianceAttack(state, state.players.BOT, profile, [smile, tiger, spear, guard] as any);
  return assertScenario(
    'combo alliance yields to direct no-blocker lethal',
    !plan,
    plan ? `combo=${plan.attackers.map(card => card.id).join(',')}` : 'direct lethal preferred'
  );
}

function testWhiteTigerBattleExileNeedsCurrentBattleThreat(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const tigerEffect = effect({
    id: '101000501_battle_exile_return',
    description: 'battle phase discard a white unit: exile this unit, return it after battle',
    cost: { type: 'DISCARD', amount: 1 },
  });
  const tiger = unit({
    id: '101000501',
    fullName: 'White Tiger',
    damage: 3,
    power: 3500,
    color: 'WHITE',
    godMark: true,
    effects: [tigerEffect],
    playedTurn: 1,
  });
  const discardUnit = unit({ id: 'WHITE_DISCARD_UNIT', color: 'WHITE', cardlocation: 'HAND' });
  const defender = unit({ id: 'RED_BIG_DEFENDER', color: 'RED', power: 5000, damage: 2 });
  const noThreatState = game(
    { hand: [discardUnit], unitZone: [tiger, null, null, null, null, null] },
    { deck: deckCards(20, 'P1_TIGER_SAFE') },
    { phase: 'BATTLE_FREE', battleState: { attackers: [tiger.gamecardId] } }
  );
  const threatenedTiger = { ...tiger, gamecardId: `${tiger.gamecardId}_threat` } as any;
  const threatState = game(
    { hand: [discardUnit], unitZone: [threatenedTiger, null, null, null, null, null] },
    { unitZone: [defender, null, null, null, null, null] },
    { phase: 'BATTLE_FREE', battleState: { attackers: [threatenedTiger.gamecardId], defender: defender.gamecardId } }
  );
  const noThreatScore = scoreActivatableEffect(noThreatState, noThreatState.players.BOT, tiger as any, tigerEffect as any, profile, {}).score;
  const threatScore = scoreActivatableEffect(threatState, threatState.players.BOT, threatenedTiger as any, tigerEffect as any, profile, {}).score;
  return assertScenario(
    'white tiger battle exile waits for a real battle threat',
    noThreatScore < 18 && threatScore > noThreatScore + 45,
    `safe=${noThreatScore.toFixed(1)}, threatened=${threatScore.toFixed(1)}`
  );
}

function testFutureReadBottomAttackerOnlyAnswersOpponentGodmark(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const bottomEffect = effect({
    id: '101140152_bottom_attacker',
    description: 'put attacking godmark unit on deck bottom',
    content: 'BOTTOM ATTACKING GODMARK UNIT',
    cost: { type: 'EROSION', amount: 2 },
  });
  const liwei = unit({
    id: '101140152',
    fullName: 'Future Read Liwei',
    color: 'WHITE',
    power: 2500,
    damage: 2,
    godMark: true,
    effects: [bottomEffect],
  });
  const ownGodAttacker = unit({ id: '101000501', fullName: 'Own White Tiger', color: 'WHITE', power: 3500, damage: 3, godMark: true, playedTurn: 1 });
  const oppGodAttacker = unit({ id: 'OPP_GOD_ATTACKER', fullName: 'Opponent God Attacker', color: 'RED', power: 4000, damage: 3, godMark: true, playedTurn: 1 });
  const ownAttackState = game(
    { unitZone: [liwei, ownGodAttacker, null, null, null, null], erosionBack: erosionCards(10, 'BOT_LIWEI_OWN') },
    {},
    { phase: 'BATTLE_FREE', currentTurnPlayer: 0, battleState: { attackers: [ownGodAttacker.gamecardId] } }
  );
  const oppAttackState = game(
    { unitZone: [liwei, null, null, null, null, null], erosionBack: erosionCards(10, 'BOT_LIWEI_OPP'), isTurn: false },
    { unitZone: [oppGodAttacker, null, null, null, null, null], isTurn: true },
    { phase: 'BATTLE_FREE', currentTurnPlayer: 1, battleState: { attackers: [oppGodAttacker.gamecardId] } }
  );
  const ownScore = scoreActivatableEffect(
    ownAttackState,
    ownAttackState.players.BOT,
    liwei as any,
    bottomEffect as any,
    profile,
    { opponent: ownAttackState.players.P1, targetCount: 1, hasTargetSpec: true }
  ).score;
  const oppScore = scoreActivatableEffect(
    oppAttackState,
    oppAttackState.players.BOT,
    liwei as any,
    bottomEffect as any,
    profile,
    { opponent: oppAttackState.players.P1, targetCount: 1, hasTargetSpec: true }
  ).score;
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: ownGodAttacker, source: 'UNIT', isMine: true },
      { card: oppGodAttacker, source: 'UNIT', isMine: false },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '101140152_bottom_attacker' },
  };
  const selected = chooseQuerySelections(oppAttackState, 'BOT', query as any, profile, 'hard');

  return assertScenario(
    'future read bottom attacker only answers opponent godmark',
    ownScore < 18 && oppScore >= 18 && selected[0] === oppGodAttacker.gamecardId,
    `own=${ownScore.toFixed(1)}, opp=${oppScore.toFixed(1)}, selected=${selected[0]}`
  );
}

function testPaymentPreservesClosingAttacker(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const attacker = unit({ id: 'RED_CLOSING_ATTACKER', color: 'RED', damage: 2, power: 2500, playedTurn: 1 });
  const sourceCard = story({ id: 'RED_COST_ONE_STORY', color: 'RED', acValue: 1, baseAcValue: 1 });
  const state = game(
    {
      hand: [sourceCard],
      unitZone: [attacker, null, null, null, null, null],
      deck: deckCards(20, 'BOT_CLOSING_PAYMENT'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    { erosionBack: erosionCards(8, 'P1_CLOSING_PAYMENT') },
    {
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );
  const payment = ServerGameService.buildBotPaymentSelectionForPlayer(state, 'BOT', {
    paymentCost: 1,
    paymentColor: 'RED',
    context: {
      cardId: sourceCard.gamecardId,
      sourceCardId: sourceCard.gamecardId,
      paymentTargetId: sourceCard.gamecardId,
    },
  }) as any;
  return assertScenario(
    'payment preserves ready attacker in closing window',
    !(payment.exhaustUnitIds || []).includes(attacker.gamecardId),
    `payment=${JSON.stringify(payment)}`
  );
}

function testLowAttackHeldIntoStrongerReadyDefender(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const lowAttacker = unit({
    id: 'RED_LOW_ATTACKER',
    fullName: 'Red Low Attacker',
    color: 'RED',
    damage: 1,
    power: 500,
    playedTurn: 1,
  });
  const strongDefender = unit({
    id: 'WHITE_STRONG_READY_DEFENDER',
    fullName: 'White Strong Ready Defender',
    color: 'WHITE',
    damage: 3,
    power: 8000,
    playedTurn: 1,
  });
  const state = game(
    { unitZone: [lowAttacker, null, null, null, null, null] },
    {
      unitZone: [strongDefender, null, null, null, null, null],
      deck: deckCards(20, 'P1_SAFE_ATTACK'),
      erosionFront: [],
      erosionBack: [],
    },
    { phase: 'BATTLE_DECLARATION' }
  );

  const score = scoreAttackCandidate(state, state.players.BOT, lowAttacker as any, profile);
  const chosen = chooseAttacker(state, state.players.BOT, profile);
  return assertScenario(
    'low attacker is held into stronger ready defender',
    score < 0 && !chosen,
    `score=${score.toFixed(1)}, chosen=${chosen ? chosen.fullName : 'none'}`
  );
}

function testHighValueAttackerHeldIntoReadyDefenderWithoutClosing(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const highValueAttacker = unit({
    id: '104020068',
    fullName: 'Nine Tail High Value',
    color: 'BLUE',
    damage: 1,
    power: 2500,
    playedTurn: 1,
    godMark: true,
  });
  const readyDefender = unit({
    id: 'RED_READY_DEFENDER',
    fullName: 'Red Ready Defender',
    color: 'RED',
    damage: 2,
    power: 2600,
    playedTurn: 1,
  });
  const state = game(
    { unitZone: [highValueAttacker, null, null, null, null, null] },
    {
      unitZone: [readyDefender, null, null, null, null, null],
      deck: deckCards(20, 'P1_HIGH_VALUE_ATTACK_SAFE_DECK'),
      erosionFront: [],
      erosionBack: [],
    },
    { phase: 'BATTLE_DECLARATION' }
  );

  const score = scoreAttackCandidate(state, state.players.BOT, highValueAttacker as any, profile);
  const chosen = chooseAttacker(state, state.players.BOT, profile);
  return assertScenario(
    'high-value attacker is held into ready defender without closing purpose',
    score < 0 && !chosen,
    `score=${score.toFixed(1)}, chosen=${chosen ? chosen.fullName : 'none'}`
  );
}

function testAketiHeldIntoReadyDefenderDuringLoosePressure(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const aketi = unit({
    id: '104020068',
    fullName: '九尾天狐【阿克蒂】',
    color: 'BLUE',
    damage: 1,
    power: 2500,
    playedTurn: 1,
    godMark: true,
  });
  const supportAttacker = unit({
    id: 'BLUE_LOW_SUPPORT_ATTACKER',
    fullName: 'Blue Low Support Attacker',
    color: 'BLUE',
    damage: 1,
    power: 1000,
    playedTurn: 1,
  });
  const readyDefender = unit({
    id: 'GREEN_READY_TRADE_DEFENDER',
    fullName: 'Green Ready Trade Defender',
    color: 'GREEN',
    damage: 2,
    power: 2500,
    playedTurn: 1,
  });
  const state = game(
    { unitZone: [aketi, supportAttacker, null, null, null, null], botDeckProfileId: profile.id },
    {
      unitZone: [readyDefender, null, null, null, null, null],
      deck: deckCards(20, 'P1_AKETI_PRESSURE_DECK'),
      erosionBack: erosionCards(8, 'P1_AKETI_PRESSURE_EROSION'),
    },
    { phase: 'BATTLE_DECLARATION', botDeckProfiles: { BOT: profile.id, P1: 'big-salala' } }
  );

  const score = scoreAttackCandidate(state, state.players.BOT, aketi as any, profile);
  const chosen = chooseAttacker(state, state.players.BOT, profile);
  return assertScenario(
    'aketi is held into ready defender during loose pressure',
    score < 0 && chosen?.gamecardId !== aketi.gamecardId,
    `score=${score.toFixed(1)}, chosen=${chosen ? chosen.fullName : 'none'}`
  );
}

function testSaintKingdomArcherHeldIntoReadyDefenderDuringLoosePressure(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const archer = unit({
    id: '101130202',
    fullName: '南征军的弓兵',
    color: 'WHITE',
    damage: 1,
    power: 1500,
    playedTurn: 1,
  });
  const supportAttacker = unit({
    id: 'WHITE_LOW_SUPPORT_ATTACKER',
    fullName: 'White Low Support Attacker',
    color: 'WHITE',
    damage: 1,
    power: 1000,
    playedTurn: 1,
  });
  const readyDefender = unit({
    id: 'BLUE_READY_TRADE_DEFENDER',
    fullName: 'Blue Ready Trade Defender',
    color: 'BLUE',
    damage: 2,
    power: 2000,
    playedTurn: 1,
  });
  const state = game(
    { unitZone: [archer, supportAttacker, null, null, null, null], botDeckProfileId: profile.id },
    {
      unitZone: [readyDefender, null, null, null, null, null],
      deck: deckCards(20, 'P1_ARCHER_PRESSURE_DECK'),
      erosionBack: erosionCards(8, 'P1_ARCHER_PRESSURE_EROSION'),
    },
    { phase: 'BATTLE_DECLARATION', botDeckProfiles: { BOT: profile.id, P1: 'blue-adventurer' } }
  );

  const score = scoreAttackCandidate(state, state.players.BOT, archer as any, profile);
  const chosen = chooseAttacker(state, state.players.BOT, profile);
  return assertScenario(
    'saint kingdom archer is held into ready defender during loose pressure',
    score < 0 && chosen?.gamecardId !== archer.gamecardId,
    `score=${score.toFixed(1)}, chosen=${chosen ? chosen.fullName : 'none'}`
  );
}

function testMidrangeLowAttackHeldAtLowPositiveValue(): ScenarioResult {
  const profile = getDeckAiProfile('big-salala');
  const lowAttacker = unit({
    id: '105000481',
    fullName: 'Steadfast New Guard',
    color: 'GREEN',
    damage: 1,
    power: 1500,
    playedTurn: 1,
  });
  const readyDefender = unit({
    id: 'WHITE_READY_DEFENDER',
    fullName: 'White Ready Defender',
    color: 'WHITE',
    damage: 1,
    power: 2000,
    playedTurn: 1,
  });
  const state = game(
    { unitZone: [lowAttacker, null, null, null, null, null], botDeckProfileId: 'big-salala' },
    {
      unitZone: [readyDefender, null, null, null, null, null],
      deck: deckCards(20, 'P1_MIDRANGE_SAFE_DECK'),
      erosionFront: [],
      erosionBack: [],
    },
    { phase: 'BATTLE_DECLARATION' }
  );

  const score = scoreAttackCandidate(state, state.players.BOT, lowAttacker as any, profile);
  const chosen = chooseAttacker(state, state.players.BOT, profile);
  return assertScenario(
    'midrange low-value attack is held into ready defender',
    score < 0 && !chosen,
    `score=${score.toFixed(1)}, chosen=${chosen ? chosen.fullName : 'none'}`
  );
}

function testGoddessModeDoesNotCreateFalseErosionAttackPressure(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const lowAttacker = unit({
    id: 'RED_LOW_GODDESS_ATTACKER',
    fullName: 'Red Low Goddess Attacker',
    color: 'RED',
    damage: 1,
    power: 500,
    playedTurn: 1,
  });
  const strongDefender = unit({
    id: 'GODDESS_READY_DEFENDER',
    fullName: 'Goddess Ready Defender',
    color: 'WHITE',
    damage: 3,
    power: 8000,
    playedTurn: 1,
  });
  const state = game(
    { unitZone: [lowAttacker, null, null, null, null, null] },
    {
      unitZone: [strongDefender, null, null, null, null, null],
      deck: deckCards(20, 'P1_GODDESS_SAFE_DECK'),
      erosionBack: erosionCards(10, 'P1_GODDESS_EROSION'),
      isGoddessMode: true,
    },
    { phase: 'BATTLE_DECLARATION' }
  );

  const score = scoreAttackCandidate(state, state.players.BOT, lowAttacker as any, profile);
  const chosen = chooseAttacker(state, state.players.BOT, profile);
  return assertScenario(
    'goddess mode does not create false erosion attack pressure',
    score < 0 && !chosen,
    `score=${score.toFixed(1)}, chosen=${chosen ? chosen.fullName : 'none'}`
  );
}

function testGoddessModeDeckLethalStillAttacks(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const attacker = unit({
    id: 'RED_GODDESS_DECK_LETHAL',
    fullName: 'Red Goddess Deck Lethal',
    color: 'RED',
    damage: 2,
    power: 2500,
    playedTurn: 1,
  });
  const state = game(
    { unitZone: [attacker, null, null, null, null, null] },
    {
      unitZone: [null, null, null, null, null, null],
      deck: deckCards(3, 'P1_GODDESS_LOW_DECK'),
      erosionBack: erosionCards(10, 'P1_GODDESS_LOW_EROSION'),
      isGoddessMode: true,
    },
    { phase: 'BATTLE_DECLARATION' }
  );

  const chosen = chooseAttacker(state, state.players.BOT, profile);
  const score = scoreAttackCandidate(state, state.players.BOT, attacker as any, profile);
  return assertScenario(
    'goddess mode deck lethal still attacks',
    chosen?.gamecardId === attacker.gamecardId && score > 0,
    `score=${score.toFixed(1)}, chosen=${chosen ? chosen.fullName : 'none'}`
  );
}

async function testDefensePlanRequiresClearAttackScoreEvenWhenDesperate(): Promise<ScenarioResult> {
  const profile = getDeckAiProfile('blue-adventurer');
  const attacker = unit({
    id: '104010220',
    fullName: 'Blue Soul Pressure',
    color: 'BLUE',
    damage: 2,
    power: 3000,
    playedTurn: 1,
    godMark: true,
  });
  const backup = unit({
    id: '104020068',
    fullName: 'Blue Backup Attacker',
    color: 'BLUE',
    damage: 1,
    power: 2500,
    playedTurn: 1,
  });
  const guardA = unit({
    id: 'P1_DEFENSE_GUARD_A',
    color: 'GREEN',
    damage: 3,
    power: 2800,
    playedTurn: 1,
  });
  const guardB = unit({
    id: 'P1_DEFENSE_GUARD_B',
    color: 'GREEN',
    damage: 3,
    power: 2500,
    playedTurn: 1,
  });
  const guardC = unit({
    id: 'P1_DEFENSE_GUARD_C',
    color: 'GREEN',
    damage: 2,
    power: 1800,
    playedTurn: 1,
  });
  const state = game(
    {
      unitZone: [attacker, backup, null, null, null, null],
      deck: deckCards(1, 'BOT_DESPERATE_HOLD_ATTACK_DECK'),
      erosionBack: erosionCards(4, 'BOT_DESPERATE_HOLD_ATTACK_EROSION'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    {
      unitZone: [guardA, guardB, guardC, null, null, null],
      deck: deckCards(20, 'P1_DESPERATE_HOLD_ATTACK_DECK'),
      erosionBack: erosionCards(4, 'P1_DESPERATE_HOLD_ATTACK_EROSION'),
    },
    {
      phase: 'BATTLE_DECLARATION',
      turnCount: 8,
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id, P1: 'big-salala' },
    }
  );

  const score = scoreAttackCandidate(state, state.players.BOT, attacker as any, profile);
  await ServerGameService.botMoveForPlayer(state, 'BOT');
  const attacked = state.aiDecisionLogs?.some((log: any) => log.action === 'ATTACK' || log.action === 'COMBO_ALLIANCE_ATTACK');
  const hold = state.aiDecisionLogs?.find((log: any) => log.action === 'HOLD_ATTACKERS');
  return assertScenario(
    'defense plan requires clear attack score even when desperate',
    score > 0 && score < 30 && !attacked && !!hold,
    `score=${score.toFixed(1)}, attacked=${!!attacked}, phase=${state.phase}, hold=${hold?.reason || 'none'}`
  );
}

function testExpendableBaitAttackAllowedForClosingPressure(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const baitAttacker = unit({
    id: 'RED_EXPENDABLE_BAIT',
    fullName: 'Red Expendable Bait',
    color: 'RED',
    damage: 1,
    power: 500,
    playedTurn: 1,
  });
  const closingAttacker = unit({
    id: 'RED_CLOSING_SUPPORT',
    fullName: 'Red Closing Support',
    color: 'RED',
    damage: 1,
    power: 3000,
    playedTurn: 1,
  });
  const strongDefender = unit({
    id: 'WHITE_SINGLE_READY_DEFENDER',
    fullName: 'White Single Ready Defender',
    color: 'WHITE',
    damage: 2,
    power: 7000,
    playedTurn: 1,
  });
  const state = game(
    { unitZone: [baitAttacker, closingAttacker, null, null, null, null] },
    {
      unitZone: [strongDefender, null, null, null, null, null],
      deck: deckCards(20, 'P1_NEAR_CRITICAL'),
      erosionBack: erosionCards(9, 'P1_NEAR_CRITICAL_EROSION'),
    },
    { phase: 'BATTLE_DECLARATION' }
  );

  const score = scoreAttackCandidate(state, state.players.BOT, baitAttacker as any, profile);
  return assertScenario(
    'expendable bait attack is allowed when it opens closing pressure',
    score > 0,
    `score=${score.toFixed(1)}`
  );
}

function testAllianceMarkedUnitIsNotNormalAttackCandidate(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const tiger = unit({
    id: '101000501',
    fullName: 'White Tiger',
    color: 'WHITE',
    damage: 3,
    power: 3500,
    playedTurn: 1,
    inAllianceGroup: true,
  });
  const partner = unit({
    id: 'WHITE_READY_PARTNER',
    fullName: 'Ready Partner',
    color: 'WHITE',
    damage: 1,
    power: 1500,
    playedTurn: 1,
  });
  const state = game(
    { unitZone: [tiger, partner, null, null, null, null], botDeckProfileId: 'white-temple' },
    { deck: deckCards(20, 'P1_ALLIANCE_MARKER') },
    { phase: 'BATTLE_DECLARATION' }
  );

  const tigerCanAttack = canUnitAttack(state, tiger as any);
  const chosen = chooseAttacker(state, state.players.BOT, profile);
  return assertScenario(
    'alliance-marked unit is not chosen for normal attack',
    !tigerCanAttack && chosen?.gamecardId === partner.gamecardId,
    `tigerCanAttack=${tigerCanAttack}, chosen=${chosen?.id || 'none'}`
  );
}

function testBattleCleanupClearsAllianceMarkersAcrossZones(): ScenarioResult {
  const tiger = unit({
    id: '101000501',
    fullName: 'White Tiger',
    color: 'WHITE',
    damage: 3,
    power: 3500,
    playedTurn: 1,
    inAllianceGroup: true,
  });
  const exiledPartner = unit({
    id: 'WHITE_EXILED_ALLIANCE_PARTNER',
    fullName: 'Exiled Alliance Partner',
    color: 'WHITE',
    damage: 1,
    power: 1500,
    cardlocation: 'EXILE',
    inAllianceGroup: true,
  });
  const state = game({
    unitZone: [tiger, null, null, null, null, null],
    exile: [exiledPartner],
    botDeckProfileId: 'white-temple',
  });

  ServerGameService.clearAllianceAttackMarkers(state as any, [tiger.gamecardId, exiledPartner.gamecardId]);
  return assertScenario(
    'battle cleanup clears alliance markers across zones',
    !(tiger as any).inAllianceGroup && !(exiledPartner as any).inAllianceGroup,
    `field=${!!(tiger as any).inAllianceGroup}, exile=${!!(exiledPartner as any).inAllianceGroup}`
  );
}

async function testErosionRecoveryPrefersHighValueGodmark(): Promise<ScenarioResult> {
  const profile = getDeckAiProfile('white-temple');
  const colorSourceA = unit({ id: 'WHITE_COLOR_SOURCE_A', color: 'WHITE', damage: 0, isExhausted: true });
  const colorSourceB = unit({ id: 'WHITE_COLOR_SOURCE_B', color: 'WHITE', damage: 0, isExhausted: true });
  const godmark = unit({
    id: '101000501',
    fullName: 'White Tiger',
    color: 'WHITE',
    colorReq: { WHITE: 2 },
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
    godMark: true,
    damage: 3,
    power: 3500,
    acValue: 1,
    baseAcValue: 1,
  });
  const lowDefender = unit({
    id: 'LOW_EROSION_DEFENDER',
    fullName: 'Low Erosion Defender',
    color: 'WHITE',
    colorReq: { WHITE: 1 },
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
    damage: 0,
    power: 4500,
    acValue: 1,
    baseAcValue: 1,
  });
  const threat = unit({ id: 'OPP_LETHAL_THREAT', color: 'RED', damage: 2, power: 2500 });
  const state = game(
    {
      unitZone: [colorSourceA, colorSourceB, null, null, null, null],
      erosionFront: [lowDefender, godmark],
      erosionBack: erosionCards(6, 'BOT_EROSION_BACK'),
      deck: deckCards(20, 'BOT_EROSION_RECOVERY'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    { unitZone: [threat, null, null, null, null, null] },
    {
      phase: 'EROSION',
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );

  await ServerGameService.botMoveForPlayer(state, 'BOT');
  const recoveredGodmark = state.players.BOT.hand.some((card: any) => card.gamecardId === godmark.gamecardId);
  const decision = state.aiDecisionLogs?.find((log: any) => log.action === 'EROSION_CHOICE');
  return assertScenario(
    'erosion emergency recovery prefers high-value godmark unit',
    recoveredGodmark && decision?.details?.selected === 'White Tiger',
    `selected=${decision?.details?.selected}, hand=${state.players.BOT.hand.map((card: any) => card.fullName).join(',')}`
  );
}

async function testLowDeckErosionCanRecoverHighValueCard(): Promise<ScenarioResult> {
  const profile = getDeckAiProfile('white-temple');
  const colorSourceA = unit({ id: 'WHITE_LOW_DECK_COLOR_A', color: 'WHITE', damage: 0, isExhausted: true });
  const colorSourceB = unit({ id: 'WHITE_LOW_DECK_COLOR_B', color: 'WHITE', damage: 0, isExhausted: true });
  const godmark = unit({
    id: '101000501',
    fullName: 'White Tiger',
    color: 'WHITE',
    colorReq: { WHITE: 2 },
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
    godMark: true,
    damage: 3,
    power: 3500,
    acValue: 1,
    baseAcValue: 1,
  });
  const state = game(
    {
      hand: [],
      unitZone: [colorSourceA, colorSourceB, null, null, null, null],
      erosionFront: [godmark],
      erosionBack: erosionCards(3, 'BOT_LOW_DECK_BACK'),
      deck: deckCards(6, 'BOT_LOW_DECK_RECOVERY'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    { unitZone: [unit({ id: 'OPP_LOW_DECK_NONLETHAL', color: 'RED', damage: 1, power: 1500 }), null, null, null, null, null] },
    {
      phase: 'EROSION',
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );

  await ServerGameService.botMoveForPlayer(state, 'BOT');
  const recoveredGodmark = state.players.BOT.hand.some((card: any) => card.gamecardId === godmark.gamecardId);
  const decision = state.aiDecisionLogs?.find((log: any) => log.action === 'EROSION_CHOICE');
  return assertScenario(
    'low deck erosion can still recover high-value card',
    recoveredGodmark && decision?.subject === 'C',
    `choice=${decision?.subject}, selected=${decision?.details?.selected}, reason=${decision?.details?.erosionReason}, deck=${state.players.BOT.deck.length}`
  );
}

async function testErosionRecoveryChoosesHighValueOverLowPlayable(): Promise<ScenarioResult> {
  const profile = getDeckAiProfile('red-dikai');
  const lowPlayable = unit({
    id: '102050086',
    fullName: 'Royal Direct Guard',
    color: 'RED',
    colorReq: { RED: 1 },
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
    damage: 1,
    power: 1500,
    acValue: 1,
    baseAcValue: 1,
  });
  const scadi = story({
    id: '302050013',
    fullName: 'Scadi',
    color: 'RED',
    type: 'ITEM',
    isEquip: true,
    godMark: true,
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
    acValue: 3,
    baseAcValue: 3,
  });
  const colorSource = unit({ id: 'RED_EROSION_COLOR_SOURCE', color: 'RED', damage: 0, isExhausted: true });
  const state = game(
    {
      hand: [],
      unitZone: [colorSource, null, null, null, null, null],
      erosionFront: [lowPlayable, scadi],
      erosionBack: erosionCards(2, 'BOT_RED_EROSION_BACK'),
      deck: deckCards(20, 'BOT_RED_EROSION_RECOVERY'),
      botDifficulty: 'hard',
      botDeckProfileId: profile.id,
    },
    {},
    {
      phase: 'EROSION',
      botDifficulty: 'hard',
      botDeckProfiles: { BOT: profile.id },
    }
  );

  await ServerGameService.botMoveForPlayer(state, 'BOT');
  const recoveredScadi = state.players.BOT.hand.some((card: any) => card.gamecardId === scadi.gamecardId);
  const recoveredLow = state.players.BOT.hand.some((card: any) => card.gamecardId === lowPlayable.gamecardId);
  const decision = state.aiDecisionLogs?.find((log: any) => log.action === 'EROSION_CHOICE');
  return assertScenario(
    'erosion recovery chooses high-value card over low playable',
    recoveredScadi && !recoveredLow && decision?.details?.selected === 'Scadi',
    `selected=${decision?.details?.selected}, choice=${decision?.subject}, hand=${state.players.BOT.hand.map((card: any) => card.fullName).join(',')}, score=${decision?.details?.selectedScore}`
  );
}

function testYellowAlchemyConvertsEnginePressure(): ScenarioResult {
  const profile = getDeckAiProfile('yellow-alchemy');
  const alchemistA = unit({ id: 'YELLOW_ROUTE_A', color: 'YELLOW', damage: 1, power: 1500, playedTurn: 1 });
  const alchemistB = unit({ id: 'YELLOW_ROUTE_B', color: 'YELLOW', damage: 2, power: 2000, playedTurn: 1 });
  const state = game(
    {
      unitZone: [alchemistA, alchemistB, null, null, null, null],
      deck: deckCards(14, 'BOT_YELLOW_ROUTE'),
      hand: [story({ id: 'YELLOW_RESOURCE_CARD', color: 'YELLOW' })],
    },
    { erosionBack: erosionCards(5, 'P1_YELLOW_ROUTE') }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  const hasRouteNote = plan.notes.some(note => note.includes('yellow route:'));
  return assertScenario(
    'yellow alchemy route converts engine resources before deck pressure',
    plan.attackBeforeDeveloping && hasRouteNote,
    `attackBefore=${plan.attackBeforeDeveloping}, notes=${plan.notes.join('|')}`
  );
}

function testOverlordTotemConvertsRecursiveBoard(): ScenarioResult {
  const profile = getDeckAiProfile('overlord-totem');
  const totemA = unit({ id: 'TOTEM_ROUTE_A', color: 'WHITE', damage: 1, power: 1500, playedTurn: 1 });
  const totemB = unit({ id: 'TOTEM_ROUTE_B', color: 'WHITE', damage: 2, power: 2000, playedTurn: 1 });
  const state = game(
    { unitZone: [totemA, totemB, null, null, null, null] },
    { erosionBack: erosionCards(5, 'P1_TOTEM_ROUTE') }
  );
  const plan = buildTurnPlan(state, state.players.BOT, profile);
  const hasRouteNote = plan.notes.some(note => note.includes('totem route:'));
  return assertScenario(
    'overlord totem route shifts recursive board into pressure',
    plan.attackBeforeDeveloping && hasRouteNote,
    `attackBefore=${plan.attackBeforeDeveloping}, notes=${plan.notes.join('|')}`
  );
}

function testYellowTurretTargetsOpponentUnit(): ScenarioResult {
  const profile = getDeckAiProfile('yellow-alchemy');
  const ownCore = unit({ id: '105120167', color: 'YELLOW', fullName: 'Great Alchemist Core', power: 2000, damage: 1, godMark: true });
  const opponentThreat = unit({ id: 'OPP_TURRET_TARGET', color: 'RED', fullName: 'Opponent Attacker', power: 3500, damage: 3 });
  const state = game(
    { unitZone: [ownCore, null, null, null, null, null], botDeckProfileId: 'yellow-alchemy' },
    { unitZone: [opponentThreat, null, null, null, null, null] }
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: ownCore, source: 'UNIT', isMine: true },
      { card: opponentThreat, source: 'UNIT', isMine: false },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '305110029_activate' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'yellow turret targets opponent instead of own core',
    selected[0] === opponentThreat.gamecardId,
    `selected=${selected[0]}`
  );
}

function testCannotDefendTargetsReadyBlockerInClosingWindow(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const attacker = unit({ id: 'RED_READY_ATTACKER', color: 'RED', fullName: 'Ready Red Attacker', damage: 1, power: 2500, playedTurn: 1 });
  const readyBlocker = unit({ id: 'READY_BLOCKER', color: 'WHITE', fullName: 'Ready Blocker', damage: 0, power: 1000 });
  const exhaustedThreat = unit({
    id: 'EXHAUSTED_THREAT',
    color: 'WHITE',
    fullName: 'Exhausted Threat',
    damage: 4,
    power: 5000,
    isExhausted: true,
  });
  const state = game(
    { unitZone: [attacker, null, null, null, null, null], botDeckProfileId: 'red-dikai' },
    {
      unitZone: [readyBlocker, exhaustedThreat, null, null, null, null],
      erosionBack: erosionCards(8, 'P1_CANNOT_DEFEND_TARGET'),
    },
    { phase: 'MAIN' }
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: readyBlocker, source: 'UNIT', isMine: false },
      { card: exhaustedThreat, source: 'UNIT', isMine: false },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '102050427_cannot_defend', step: 'TARGET' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'cannot-defend effect targets ready blocker in closing window',
    selected[0] === readyBlocker.gamecardId,
    `selected=${selected[0]}`
  );
}

function testCombatBuffTargetsCurrentDefender(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const currentDefender = unit({ id: 'CURRENT_DEFENDER', color: 'WHITE', fullName: 'Current Defender', damage: 0, power: 1500 });
  const spareAttacker = unit({ id: 'SPARE_ATTACKER', color: 'WHITE', fullName: 'Spare Attacker', damage: 3, power: 3500, playedTurn: 1 });
  const opponentAttacker = unit({ id: 'OPP_BATTLE_ATTACKER', color: 'RED', fullName: 'Opponent Battle Attacker', damage: 2, power: 3000 });
  const state = game(
    { unitZone: [currentDefender, spareAttacker, null, null, null, null], botDeckProfileId: 'white-temple' },
    { unitZone: [opponentAttacker, null, null, null, null, null] },
    {
      phase: 'BATTLE_FREE',
      currentTurnPlayer: 1,
      battleState: {
        attackers: [opponentAttacker.gamecardId],
        defender: currentDefender.gamecardId,
      },
    }
  );
  state.players.BOT.isTurn = false;
  state.players.P1.isTurn = true;
  const query = {
    type: 'SELECT_CARD',
    title: 'combat boost power blessing',
    description: 'choose a unit to gain power in battle',
    options: [
      { card: currentDefender, source: 'UNIT', isMine: true },
      { card: spareAttacker, source: 'UNIT', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '201130038_blessing', step: 'BOOST_POWER' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'combat buff targets the current defender',
    selected[0] === currentDefender.gamecardId,
    `selected=${selected[0]}`
  );
}

function testRemovalTargetsLethalCurrentAttacker(): ScenarioResult {
  const profile = getDeckAiProfile('yellow-alchemy');
  const currentAttacker = unit({ id: 'CURRENT_LETHAL_ATTACKER', color: 'RED', fullName: 'Current Lethal Attacker', damage: 1, power: 1000 });
  const sideGodmark = unit({
    id: 'SIDE_GODMARK',
    color: 'RED',
    fullName: 'Side Godmark',
    damage: 3,
    power: 4500,
    godMark: true,
  });
  const state = game(
    {
      unitZone: [unit({ id: 'YELLOW_DEFENSE_SOURCE', color: 'YELLOW', damage: 0, power: 1000 }), null, null, null, null, null],
      erosionBack: erosionCards(9, 'BOT_LETHAL_ATTACK_TARGET'),
      botDeckProfileId: 'yellow-alchemy',
    },
    { unitZone: [currentAttacker, sideGodmark, null, null, null, null] },
    {
      phase: 'BATTLE_FREE',
      currentTurnPlayer: 1,
      battleState: { attackers: [currentAttacker.gamecardId] },
    }
  );
  state.players.BOT.isTurn = false;
  state.players.P1.isTurn = true;
  const query = {
    type: 'SELECT_CARD',
    title: 'destroy or weaken target',
    description: 'choose an opponent unit during battle',
    options: [
      { card: currentAttacker, source: 'UNIT', isMine: false },
      { card: sideGodmark, source: 'UNIT', isMine: false },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '305110029_activate', step: 'TARGET' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'removal targets the lethal current attacker',
    selected[0] === currentAttacker.gamecardId,
    `selected=${selected[0]}`
  );
}

function testYellowAlchemyCostPreservesCore(): ScenarioResult {
  const profile = getDeckAiProfile('yellow-alchemy');
  const core = unit({ id: '105120167', color: 'YELLOW', fullName: 'Great Alchemist Core', power: 2000, damage: 1, godMark: true });
  const expendable = unit({ id: '105110224', color: 'YELLOW', fullName: 'Alchemy Feijing Material', power: 500, damage: 0, feijingMark: true });
  const state = game(
    { unitZone: [core, expendable, null, null, null, null], botDeckProfileId: 'yellow-alchemy' },
    {}
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: core, source: 'UNIT', isMine: true },
      { card: expendable, source: 'UNIT', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '305120030_activate', step: 'SEND_UNIT' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'yellow alchemy cost preserves engine core',
    selected[0] === expendable.gamecardId,
    `selected=${selected[0]}`
  );
}

function testRedDuelKeepsCommander(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const commander = unit({ id: '102050432', color: 'RED', fullName: 'Knight Captain Dikai', power: 3500, damage: 4, godMark: true });
  const small = unit({ id: '102050085', color: 'RED', fullName: 'Pursuit Troop', power: 1000, damage: 1 });
  const state = game(
    { unitZone: [small, commander, null, null, null, null], botDeckProfileId: 'red-dikai' },
    {}
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: small, source: 'UNIT', isMine: true },
      { card: commander, source: 'UNIT', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '202000131_duel', step: 'SELF' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'red duel keeps the commander',
    selected[0] === commander.gamecardId,
    `selected=${selected[0]}`
  );
}

function testDikaiDeclinesLowValueUnitTarget(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const dikai = unit({
    id: '102050432',
    color: 'RED',
    fullName: 'Knight Captain Dikai',
    power: 4000,
    damage: 4,
    godMark: true,
    playedTurn: 1,
    data: { canAttackAnyUnit: true },
  });
  const lowTarget = unit({
    id: 'P1_LOW_DIKAI_TARGET',
    color: 'WHITE',
    fullName: 'Low Exhausted Target',
    power: 1000,
    damage: 1,
    isExhausted: true,
  });
  const state = game(
    { unitZone: [dikai, null, null, null, null, null], botDeckProfileId: 'red-dikai' },
    { unitZone: [lowTarget, null, null, null, null, null], deck: deckCards(20, 'P1_DIKAI_LOW_TARGET') },
    { phase: 'BATTLE_DECLARATION' }
  );
  const query = {
    type: 'SELECT_CHOICE',
    options: [
      { id: 'YES', label: 'attack unit' },
      { id: 'NO', label: 'attack player' },
    ],
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'DIKAI_ATTACK_TARGET_CHOICE',
    context: { attackerIds: [dikai.gamecardId], isAlliance: false, targetMode: 'ANY', sourceCardId: dikai.gamecardId },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'dikai declines low-value unit target',
    selected[0] === 'NO',
    `selected=${selected[0]}`
  );
}

function testDikaiPrioritizesHighValueUnitTarget(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const dikai = unit({
    id: '102050432',
    color: 'RED',
    fullName: 'Knight Captain Dikai',
    power: 4500,
    damage: 4,
    godMark: true,
    playedTurn: 1,
    data: { canAttackAnyUnit: true },
  });
  const lowTarget = unit({
    id: 'P1_LOW_DIKAI_SELECT',
    color: 'WHITE',
    fullName: 'Low Dikai Select',
    power: 1000,
    damage: 1,
    isExhausted: true,
  });
  const highTarget = unit({
    id: 'P1_HIGH_DIKAI_SELECT',
    color: 'WHITE',
    fullName: 'High Dikai Select',
    power: 3000,
    damage: 3,
    godMark: true,
  });
  const state = game(
    { unitZone: [dikai, null, null, null, null, null], botDeckProfileId: 'red-dikai' },
    { unitZone: [lowTarget, highTarget, null, null, null, null], deck: deckCards(20, 'P1_DIKAI_HIGH_TARGET') },
    { phase: 'BATTLE_DECLARATION' }
  );
  const choiceQuery = {
    type: 'SELECT_CHOICE',
    options: [
      { id: 'YES', label: 'attack unit' },
      { id: 'NO', label: 'attack player' },
    ],
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'DIKAI_ATTACK_TARGET_CHOICE',
    context: { attackerIds: [dikai.gamecardId], isAlliance: false, targetMode: 'ANY', sourceCardId: dikai.gamecardId },
  };
  const targetQuery = {
    type: 'SELECT_CARD',
    options: [
      { card: lowTarget, source: 'UNIT', isMine: false },
      { card: highTarget, source: 'UNIT', isMine: false },
    ],
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'DIKAI_ATTACK_TARGET_SELECT',
    context: { attackerIds: [dikai.gamecardId], isAlliance: false, targetMode: 'ANY', sourceCardId: dikai.gamecardId },
  };
  const choice = chooseQuerySelections(state, 'BOT', choiceQuery as any, profile, 'hard');
  const selected = chooseQuerySelections(state, 'BOT', targetQuery as any, profile, 'hard');
  return assertScenario(
    'dikai prioritizes high-value unit target',
    choice[0] === 'YES' && selected[0] === highTarget.gamecardId,
    `choice=${choice[0]}, selected=${selected[0]}`
  );
}

function testDikaiPrefersDirectDamageWhenOpponentCannotDefend(): ScenarioResult {
  const profile = getDeckAiProfile('red-dikai');
  const dikai = unit({
    id: '102050432',
    color: 'RED',
    fullName: 'Knight Captain Dikai',
    power: 4500,
    damage: 4,
    godMark: true,
    playedTurn: 1,
    data: { canAttackAnyUnit: true },
  });
  const highTarget = unit({
    id: 'P1_HIGH_CANNOT_DEFEND_DIKAI',
    color: 'WHITE',
    fullName: 'High Cannot Defend Target',
    power: 3000,
    damage: 3,
    godMark: true,
    data: { cannotDefendTurn: 5 },
  });
  const state = game(
    { unitZone: [dikai, null, null, null, null, null], botDeckProfileId: 'red-dikai' },
    {
      unitZone: [highTarget, null, null, null, null, null],
      erosionBack: erosionCards(8, 'P1_DIKAI_DIRECT_DAMAGE'),
      deck: deckCards(20, 'P1_DIKAI_DIRECT_DECK'),
    },
    { phase: 'BATTLE_DECLARATION', turnCount: 5 }
  );
  const choiceQuery = {
    type: 'SELECT_CHOICE',
    options: [
      { id: 'YES', label: 'attack unit' },
      { id: 'NO', label: 'attack player' },
    ],
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'DIKAI_ATTACK_TARGET_CHOICE',
    context: { attackerIds: [dikai.gamecardId], isAlliance: false, targetMode: 'ANY', sourceCardId: dikai.gamecardId },
  };
  const choice = chooseQuerySelections(state, 'BOT', choiceQuery as any, profile, 'hard');
  return assertScenario(
    'dikai prefers direct damage when opponent cannot defend',
    choice[0] === 'NO',
    `choice=${choice[0]}`
  );
}

function testBlueSwapChoosesErosionPayoff(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const lowValue = unit({ id: 'BLUE_LOW_EROSION', color: 'BLUE', fullName: 'Low Erosion Unit', power: 500, damage: 0, cardlocation: 'EROSION_FRONT' });
  const batla = unit({ id: '104030453', color: 'BLUE', fullName: 'Batla Payoff', power: 2500, damage: 2, cardlocation: 'EROSION_FRONT' });
  const state = game(
    { erosionFront: [lowValue, batla], botDeckProfileId: 'blue-adventurer' },
    {}
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: lowValue, source: 'EROSION_FRONT', isMine: true },
      { card: batla, source: 'EROSION_FRONT', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '104030459_swap_activate', step: 'TARGET' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'blue swap chooses erosion payoff',
    selected[0] === batla.gamecardId,
    `selected=${selected[0]}`
  );
}

function testBlueReceptionistHoldsEmptySwapBeforeAttack(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const swapEffect = effect({
    id: 'dragon_wing_receptionist_activate',
    description: 'summon swap play from erosion',
  });
  const receptionist = unit({
    id: '104030451',
    color: 'BLUE',
    fullName: 'Dragon Wing Receptionist',
    power: 1500,
    damage: 1,
    playedTurn: 1,
    effects: [swapEffect],
  });
  const fieldUnit = unit({
    id: 'BLUE_FIELD_LOW_SWAP',
    color: 'BLUE',
    fullName: 'Blue Field Low Swap',
    power: 1000,
    damage: 1,
    playedTurn: 1,
  });
  const erosionUnit = unit({
    id: 'BLUE_EROSION_LOW_SWAP',
    color: 'BLUE',
    fullName: 'Blue Erosion Low Swap',
    power: 500,
    damage: 0,
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
  });
  const state = game(
    {
      unitZone: [receptionist, fieldUnit, null, null, null, null],
      erosionFront: [erosionUnit],
      botDeckProfileId: 'blue-adventurer',
    },
    { deck: deckCards(20, 'P1_BLUE_EMPTY_SWAP') }
  );
  const effectScore = scoreActivatableEffect(state, state.players.BOT, receptionist as any, swapEffect as any, profile, {
    opponent: state.players.P1,
    targetCount: 1,
    hasTargetSpec: true,
  });
  const attacker = chooseAttacker(state, state.players.BOT, profile);
  return assertScenario(
    'blue receptionist holds empty swap before attack',
    effectScore.score < 0 && !!attacker,
    `effect=${effectScore.score.toFixed(1)}, attacker=${attacker ? attacker.fullName : 'none'}, notes=${effectScore.notes.join('|')}`
  );
}

function testBlueReceptionistUsesHighValueErosionUpgrade(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const swapEffect = effect({
    id: 'dragon_wing_receptionist_activate',
    description: 'summon swap play from erosion',
  });
  const receptionist = unit({
    id: '104030451',
    color: 'BLUE',
    fullName: 'Dragon Wing Receptionist',
    power: 1500,
    damage: 1,
    playedTurn: 1,
    effects: [swapEffect],
  });
  const fieldUnit = unit({
    id: 'BLUE_FIELD_LOW_UPGRADE',
    color: 'BLUE',
    fullName: 'Blue Field Low Upgrade',
    power: 500,
    damage: 0,
    playedTurn: 1,
  });
  const payoff = unit({
    id: '104030453',
    color: 'BLUE',
    fullName: 'Batla Payoff Upgrade',
    power: 2500,
    damage: 2,
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
  });
  const state = game(
    {
      unitZone: [receptionist, fieldUnit, null, null, null, null],
      erosionFront: [payoff],
      botDeckProfileId: 'blue-adventurer',
    },
    { deck: deckCards(20, 'P1_BLUE_GOOD_SWAP') }
  );
  const effectScore = scoreActivatableEffect(state, state.players.BOT, receptionist as any, swapEffect as any, profile, {
    opponent: state.players.P1,
    targetCount: 1,
    hasTargetSpec: true,
  });
  return assertScenario(
    'blue receptionist uses high-value erosion upgrade',
    effectScore.score >= 12,
    `effect=${effectScore.score.toFixed(1)}, notes=${effectScore.notes.join('|')}`
  );
}

function testAketiBounceTargetsOpponentThreats(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const ownCore = unit({ id: '104020068', color: 'BLUE', fullName: 'Aketi Core', power: 3500, damage: 2, cardlocation: 'EROSION_FRONT', godMark: true });
  const ownLow = unit({ id: 'BLUE_LOW_FRONT', color: 'BLUE', fullName: 'Blue Low Front', power: 500, damage: 0, cardlocation: 'EROSION_FRONT' });
  const ownField = unit({ id: 'BLUE_OWN_FIELD', color: 'BLUE', fullName: 'Own Field Engine', power: 2500, damage: 2 });
  const opponentThreat = unit({ id: 'OPP_AKETI_THREAT', color: 'RED', fullName: 'Opponent Threat', power: 4000, damage: 3, godMark: true });
  const state = game(
    {
      erosionFront: [ownCore, ownLow],
      unitZone: [ownField, null, null, null, null, null],
      botDeckProfileId: 'blue-adventurer',
    },
    { unitZone: [opponentThreat, null, null, null, null, null] }
  );
  const costQuery = {
    type: 'SELECT_CARD',
    options: [
      { card: ownCore, source: 'EROSION_FRONT', isMine: true },
      { card: ownLow, source: 'EROSION_FRONT', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: 'aketi_goddess_bounce', step: 'COST' },
  };
  const bounceQuery = {
    type: 'SELECT_CARD',
    options: [
      { card: ownField, source: 'UNIT', isMine: true },
      { card: opponentThreat, source: 'UNIT', isMine: false },
    ],
    minSelections: 1,
    maxSelections: 2,
    context: { effectId: 'aketi_goddess_bounce', step: 'BOUNCE' },
  };

  const costSelected = chooseQuerySelections(state, 'BOT', costQuery as any, profile, 'hard');
  const bounceSelected = chooseQuerySelections(state, 'BOT', bounceQuery as any, profile, 'hard');

  return assertScenario(
    'aketi bounce pays low erosion and targets opponent threat',
    costSelected[0] === ownLow.gamecardId &&
      bounceSelected.includes(opponentThreat.gamecardId) &&
      !bounceSelected.includes(ownField.gamecardId),
    `cost=${costSelected.join(',')}, bounce=${bounceSelected.join(',')}`
  );
}

function testTotemHawkDestroyTargetsOpponentThreat(): ScenarioResult {
  const profile = getDeckAiProfile('overlord-totem');
  const ownCore = unit({ id: '103080183', color: 'GREEN', fullName: 'Totem Hawk', power: 2000, damage: 1 });
  const ownLow = unit({ id: 'GREEN_LOW_FIELD', color: 'GREEN', fullName: 'Own Low Field', power: 500, damage: 0 });
  const opponentThreat = unit({ id: 'OPP_TOTEM_TARGET', color: 'RED', fullName: 'Opponent Non-God Threat', power: 3000, damage: 2 });
  const state = game(
    { unitZone: [ownCore, ownLow, null, null, null, null], botDeckProfileId: 'overlord-totem' },
    { unitZone: [opponentThreat, null, null, null, null, null] }
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: ownLow, source: 'UNIT', isMine: true },
      { card: opponentThreat, source: 'UNIT', isMine: false },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '103080183_destroy' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'totem hawk destroy targets opponent threat',
    selected[0] === opponentThreat.gamecardId,
    `selected=${selected[0]}`
  );
}

function testPendingSimeteReturnReservesLastUnitSlot(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const fieldUnits = Array.from({ length: 5 }, (_, index) =>
    unit({ id: `FIELD_UNIT_${index}`, fullName: `Field Unit ${index}`, power: 1500 + index * 100 })
  );
  const returning = unit({
    id: '101140437_EXILED_CORE',
    fullName: 'Exiled Core',
    cardlocation: 'EXILE',
    data: { returnToOwnerFieldAtTurnEndSourceName: '神罚天使丝梅特' },
  });
  const handUnit = unit({
    id: 'LAST_SLOT_FILLER',
    fullName: 'Last Slot Filler',
    cardlocation: 'HAND',
    power: 5000,
    damage: 3,
  });
  const state = game(
    { hand: [handUnit], exile: [returning], unitZone: [...fieldUnits, null], botDeckProfileId: 'white-temple' },
    {}
  );

  const pending = countPendingUnitReturnSlots(state as any, state.players.BOT as any);
  const score = scorePlayableCard(state as any, state.players.BOT as any, handUnit as any, profile);
  const chosen = choosePlayableCard(state as any, state.players.BOT as any, profile, 'hard', () => true);

  return assertScenario(
    'pending simete exile return reserves last unit slot',
    pending === 1 && score < 0 && !chosen,
    `pending=${pending}, score=${score.toFixed(1)}, chosen=${chosen?.id || 'none'}`
  );
}

function testEscortReturnQueueReservesOwnerUnitSlot(): ScenarioResult {
  const profile = getDeckAiProfile('big-salala');
  const fieldUnits = Array.from({ length: 5 }, (_, index) =>
    unit({ id: `ESCORT_FIELD_${index}`, fullName: `Escort Field ${index}`, color: 'WHITE' })
  );
  const escorted = unit({
    id: 'ESCORTED_UNIT',
    fullName: 'Escorted Unit',
    cardlocation: 'EXILE',
  });
  const handUnit = unit({
    id: 'ESCORT_LAST_SLOT_FILLER',
    fullName: 'Escort Last Slot Filler',
    cardlocation: 'HAND',
    color: 'WHITE',
    power: 4500,
    damage: 2,
  });
  const state = game(
    { hand: [handUnit], exile: [escorted], unitZone: [...fieldUnits, null], botDeckProfileId: 'big-salala' },
    {}
  );
  (state.players.P1 as any).escortReturns = [{
    cardId: escorted.gamecardId,
    ownerUid: 'BOT',
    zone: 'UNIT',
    afterTurn: state.turnCount,
  }];

  const pending = countPendingUnitReturnSlots(state as any, state.players.BOT as any);
  const score = scorePlayableCard(state as any, state.players.BOT as any, handUnit as any, profile);

  return assertScenario(
    'escort return queue reserves owner unit slot',
    pending === 1 && score < 0,
    `pending=${pending}, score=${score.toFixed(1)}`
  );
}

function testPendingReturnPenalizesSummonStoryLastSlot(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const fieldUnits = Array.from({ length: 5 }, (_, index) =>
    unit({ id: `SUMMON_STORY_FIELD_${index}`, fullName: `Summon Story Field ${index}`, color: 'BLUE' })
  );
  const returning = unit({
    id: 'PENDING_STORY_RETURN',
    fullName: 'Pending Story Return',
    cardlocation: 'EXILE',
    data: { escortReturn: { ownerUid: 'BOT', zone: 'UNIT', returnOnOpponentEndAfterTurn: 5 } },
  });
  const summonStory = story({
    id: 'PENDING_SUMMON_STORY',
    fullName: 'Pending Summon Story',
    color: 'BLUE',
    effects: [effect({ id: 'pending_summon_story', description: 'summon a unit from deck to field' })],
  });
  const state = game(
    { hand: [summonStory], exile: [returning], unitZone: [...fieldUnits, null], botDeckProfileId: 'blue-adventurer' },
    {}
  );

  const score = scorePlayableCard(state as any, state.players.BOT as any, summonStory as any, profile);

  return assertScenario(
    'pending return penalizes summon story using last slot',
    score < 0,
    `score=${score.toFixed(1)}`
  );
}

function testPendingReturnPenalizesSummonEffectLastSlot(): ScenarioResult {
  const profile = getDeckAiProfile('blue-adventurer');
  const summonEffect = effect({ id: 'pending_summon_effect', description: 'summon a unit from deck to field' });
  const source = unit({ id: 'SUMMON_SOURCE', fullName: 'Summon Source', color: 'BLUE', effects: [summonEffect] });
  const fieldUnits = Array.from({ length: 4 }, (_, index) =>
    unit({ id: `SUMMON_EFFECT_FIELD_${index}`, fullName: `Summon Effect Field ${index}`, color: 'BLUE' })
  );
  const returning = unit({
    id: 'PENDING_EFFECT_RETURN',
    fullName: 'Pending Effect Return',
    cardlocation: 'EXILE',
    data: { returnFromExileAfterBattleTurn: 5, returnFromExileAfterBattleOwnerUid: 'BOT' },
  });
  const state = game(
    { exile: [returning], unitZone: [source, ...fieldUnits, null], botDeckProfileId: 'blue-adventurer' },
    {}
  );

  const scored = scoreActivatableEffect(
    state as any,
    state.players.BOT as any,
    source as any,
    summonEffect as any,
    profile,
    { targetCount: 1, hasTargetSpec: true }
  );

  return assertScenario(
    'pending return penalizes summon effect using last slot',
    scored.score < 0 && scored.notes.some(note => note.includes('pending exile return')),
    `score=${scored.score.toFixed(1)}, notes=${scored.notes.join('|')}`
  );
}

function testLastUnitSlotDevelopsWithoutPendingReturn(): ScenarioResult {
  const profile = getDeckAiProfile('white-temple');
  const fieldUnits = Array.from({ length: 5 }, (_, index) =>
    unit({ id: `SAFE_FIELD_${index}`, fullName: `Safe Field ${index}`, color: 'WHITE' })
  );
  const handUnit = unit({
    id: 'SAFE_LAST_SLOT_UNIT',
    fullName: 'Safe Last Slot Unit',
    cardlocation: 'HAND',
    color: 'WHITE',
    power: 5000,
    damage: 3,
  });
  const state = game(
    { hand: [handUnit], unitZone: [...fieldUnits, null], botDeckProfileId: 'white-temple' },
    {}
  );

  const pending = countPendingUnitReturnSlots(state as any, state.players.BOT as any);
  const score = scorePlayableCard(state as any, state.players.BOT as any, handUnit as any, profile);
  const chosen = choosePlayableCard(state as any, state.players.BOT as any, profile, 'hard', () => true);

  return assertScenario(
    'last unit slot develops without pending return',
    pending === 0 && score > 0 && chosen?.gamecardId === handUnit.gamecardId,
    `pending=${pending}, score=${score.toFixed(1)}, chosen=${chosen?.id || 'none'}`
  );
}

async function testSelfPlayCounterStackSkipsVisualDelay(): Promise<ScenarioResult> {
  const source = unit({
    id: 'SELF_PLAY_STACK_SOURCE',
    fullName: 'Self Play Stack Source',
    effects: [effect({ id: 'self_play_stack_effect', description: 'test stack delay' })],
  });
  const state = game(
    { unitZone: [source, null, null, null, null, null] },
    {},
    {
      phase: 'COUNTERING',
      previousPhase: 'MAIN',
      isCountering: 1,
      mode: 'ai-selfplay',
      skipResolutionDelay: true,
      counterStack: [{
        type: 'EFFECT',
        ownerUid: 'BOT',
        card: source,
        effectIndex: 0,
        isNegated: true,
        timestamp: Date.now(),
      }],
    }
  );

  const startedAt = Date.now();
  await ServerGameService.resolveCounterStack(state as any);
  const elapsedMs = Date.now() - startedAt;

  return assertScenario(
    'self-play counter stack skips visual delay',
    elapsedMs < 500 && state.counterStack.length === 0 && !state.isResolvingStack && state.phase === 'MAIN',
    `elapsed=${elapsedMs}ms, stack=${state.counterStack.length}, resolving=${!!state.isResolvingStack}, phase=${state.phase}`
  );
}

function testTotemRitualChoosesOverlord(): ScenarioResult {
  const profile = getDeckAiProfile('overlord-totem');
  const lowTotem = unit({ id: '103080312', color: 'GREEN', fullName: 'Winged Totem', power: 1000, damage: 1, cardlocation: 'DECK' });
  const overlord = unit({ id: '103000139', color: 'GREEN', fullName: 'Jungle Overlord', power: 4000, damage: 3, cardlocation: 'DECK' });
  const state = game(
    { deck: [lowTotem, overlord], botDeckProfileId: 'overlord-totem' },
    {}
  );
  const query = {
    type: 'SELECT_CARD',
    options: [
      { card: lowTotem, source: 'DECK', isMine: true },
      { card: overlord, source: 'DECK', isMine: true },
    ],
    minSelections: 1,
    maxSelections: 1,
    context: { effectId: '203000126_ritual' },
  };
  const selected = chooseQuerySelections(state, 'BOT', query as any, profile, 'hard');
  return assertScenario(
    'totem ritual chooses overlord payoff',
    selected[0] === overlord.gamecardId,
    `selected=${selected[0]}`
  );
}

const scenarios: ScenarioRun[] = [
  testLethalTurnPlan,
  testSmileEclipseCombo,
  testSmileKorielProtectedAllianceWithoutEclipse,
  testProtectHighValueFromSelfDestroy,
  testOnlyHighValueSelfDestroyAborts,
  testElementInstructorAvoidsDestroyMode,
  testEffectTimingWindows,
  testBattleFreeHoldsSetupStory,
  testMainRemovalStoryNeedsTarget,
  testBattleCombatStoryBeatsSetupStory,
  testEclipseWaitsForProtectedAllianceWindow,
  testBlueCounterStoryRequiresCounterWindow,
  testHardAiUsesConfrontationStory,
  testHardAiPassesLowValueConfrontationStory,
  testHardAiChoosesConfrontationFieldEffect,
  testPreventDestroyWaitsForThreatWindow,
  testPreventDestroyConfrontationRequiresHighValueThreat,
  testPreventDestroySelectsThreatenedHighValueUnit,
  testPreventBattleDestroyEffectRequiresCombatThreat,
  testPreventBattleDestroySelectsThreatenedCombatUnit,
  testDikaiResetCostChoosesNonFieldGodmarkCosts,
  testDikaiResetHeldInCountering,
  testDikaiResetRequiresPostAttackExhaustedUnit,
  testDikaiResetRejectsPreAttackExhaustedUnit,
  testRedCannotDefendNeedsTargetInClosingWindow,
  testYellowReviveMainPhaseNotBattleSetup,
  testTotemPrepareStoryMainNotBattleFiller,
  testWhiteTemplePrefersKeyResetTargets,
  testWhiteTempleMultiResetTakesBothKeyTargets,
  testWhiteTempleFixedOpeningHand,
  testRedDikaiFixedOpeningHand,
  testRedDikaiHoldsRushUnitOnFirstTurn,
  testRedScadiHeldUntilDikaiField,
  testRedScadiEquipTargetsDikai,
  testRedScadiStaysEquippedToDikai,
  testRedScadiPaymentBuildsErosionWindow,
  testRedScadiPaymentAvoidsLeavingErosionWindow,
  testRedScadiDelaysAttackUntilErosionWindow,
  testRedScadiAttackRewardsActiveErosionWindow,
  testBlueAdventurerFixedOpeningHand,
  testBlueGuildChoosesExhaustOptionForBlocker,
  testBlueGuildExhaustTargetsHighestThreat,
  testBigSalalaFixedOpeningHand,
  testBigSalalaWarSongEquipsSalala,
  testBigSalalaWarSongStaysEquipped,
  testMagicSpearResetEffectScoresWhenAttackWouldLose,
  testShenyuResetSequencedBeforeOwnAttack,
  testHolyPrinceResetHeldInLooseCountering,
  testHolyPrinceResetSupportsMagicSpearCountering,
  testMagicSpearAttackNeedsResetSupportIntoLargeDefender,
  testMagicSpearHeldWhenResetOnlyTrades,
  testWhiteTemplePlaysArcherBeforeHandTargets,
  testWhiteTempleOptionalArcherTriggerSelectsTarget,
  testWhiteTempleProtectsArcherLineFromPayment,
  testWhiteTempleEscortTargetsOpponentFirst,
  testBotDoesNotAlwaysSpendFeijing,
  testEffectPaymentUsesActivationCostNotSourcePlayCost,
  testEffectCostFunctionPrecheckSkipsUnaffordableActivation,
  testOpeningFirstPlayerPaymentUsesUnitAgainstNonAggro,
  testOpeningFirstPlayerPaymentStillRespectsAggro,
  testPaymentProtectsGodMark,
  testDiscardCostUsesFeijingBeforeProtectionCard,
  testCostAvoidsCurrentBattleUnit,
  testPaymentExhaustUsesLowUnitBeforeClosingAttacker,
  testBigSalalaPaymentPreservesCradleUnderPressure,
  testNegativeCostProtectsErosionGodmark,
  testDefenseDoesNotThrowGodMarkOnNonLethalHit,
  testDefenseDeclinesLowImpactChumpBlock,
  testMagicSpearDeclinesNonLethalDefenseLoss,
  testDefenseSacrificesLowValueUnitToPreventLethalHit,
  testDefenseHighValueUnitBlocksLethalWhenOnlyOption,
  testDefensePreservesHighValueIfBlockCannotStopFollowupLethal,
  testDefenseTakesProfitableWinAgainstHighValueAttacker,
  testActiveDeckProfilesProduceTurnPlans,
  testActiveHardAiDeckProfileList,
  testHardAiProfilesOpponentFromHiddenDeckAndHand,
  testBigSalalaShareCodeDeckIsValid,
  testWhiteTempleConvertsHallPressure,
  testBlueAdventurerConvertsTempoPressure,
  testBlockedErosionLineStabilizesUnderIncomingLethal,
  testClosingPlanCommitsAfterOnePrecombatPlay,
  testClosingPlayDoesNotExhaustLethalAttackers,
  testClosingPlayDoesNotOverdevelopLowImpactUnit,
  testHardAiPlaysTargetedStoryOnlyOnce,
  testRedDikaiCommitsNearKillPressure,
  testRedPursuitUsesAllianceAttackForTrigger,
  testPrecombatCannotDefendDelaysAttack,
  testBlueErosionSummonSequencedBeforeAttack,
  testDirectLethalDoesNotWaitForSetup,
  testClosingPlanHelperRecognizesErosionLethal,
  testComboAllianceDoesNotOverrideDirectLethal,
  testWhiteTigerBattleExileNeedsCurrentBattleThreat,
  testFutureReadBottomAttackerOnlyAnswersOpponentGodmark,
  testPaymentPreservesClosingAttacker,
  testLowAttackHeldIntoStrongerReadyDefender,
  testHighValueAttackerHeldIntoReadyDefenderWithoutClosing,
  testAketiHeldIntoReadyDefenderDuringLoosePressure,
  testSaintKingdomArcherHeldIntoReadyDefenderDuringLoosePressure,
  testMidrangeLowAttackHeldAtLowPositiveValue,
  testGoddessModeDoesNotCreateFalseErosionAttackPressure,
  testGoddessModeDeckLethalStillAttacks,
  testDefensePlanRequiresClearAttackScoreEvenWhenDesperate,
  testExpendableBaitAttackAllowedForClosingPressure,
  testAllianceMarkedUnitIsNotNormalAttackCandidate,
  testBattleCleanupClearsAllianceMarkersAcrossZones,
  testBigSalalaMillWaitsForDeckPressure,
  testErosionRecoveryPrefersHighValueGodmark,
  testLowDeckErosionCanRecoverHighValueCard,
  testErosionRecoveryChoosesHighValueOverLowPlayable,
  testYellowAlchemyConvertsEnginePressure,
  testOverlordTotemConvertsRecursiveBoard,
  testYellowTurretTargetsOpponentUnit,
  testCannotDefendTargetsReadyBlockerInClosingWindow,
  testCombatBuffTargetsCurrentDefender,
  testRemovalTargetsLethalCurrentAttacker,
  testYellowAlchemyCostPreservesCore,
  testRedDuelKeepsCommander,
  testDikaiDeclinesLowValueUnitTarget,
  testDikaiPrioritizesHighValueUnitTarget,
  testDikaiPrefersDirectDamageWhenOpponentCannotDefend,
  testBlueSwapChoosesErosionPayoff,
  testBlueReceptionistHoldsEmptySwapBeforeAttack,
  testBlueReceptionistUsesHighValueErosionUpgrade,
  testAketiBounceTargetsOpponentThreats,
  testTotemHawkDestroyTargetsOpponentThreat,
  testPendingSimeteReturnReservesLastUnitSlot,
  testEscortReturnQueueReservesOwnerUnitSlot,
  testPendingReturnPenalizesSummonStoryLastSlot,
  testPendingReturnPenalizesSummonEffectLastSlot,
  testLastUnitSlotDevelopsWithoutPendingReturn,
  testSelfPlayCounterStackSkipsVisualDelay,
  testTotemRitualChoosesOverlord,
];

const results: ScenarioResult[] = [];
for (const run of scenarios) {
  results.push(await run());
}
for (const result of results) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}: ${result.detail}`);
}

const failed = results.filter(result => !result.passed);
if (failed.length > 0) {
  console.error(`Hard AI scenario tests failed: ${failed.length}/${results.length}`);
  process.exit(1);
}

console.log(`Hard AI scenario tests passed: ${results.length}/${results.length}`);
