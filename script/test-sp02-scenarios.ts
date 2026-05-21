import { ServerGameService } from '../server/ServerGameService';
import { EventEngine } from '../src/services/EventEngine';
import { Card, CardEffect, TriggerLocation } from '../src/types/game';
import sp02W03 from '../src/scripts/101000282';
import sp02Y01 from '../src/scripts/105110284';
import sp02Y03 from '../src/scripts/105000323';
import sp02Y09 from '../src/scripts/105000325';

type ScenarioResult = {
  name: string;
  passed: boolean;
  detail: string;
};

type ScenarioRun = () => ScenarioResult | Promise<ScenarioResult>;

let seq = 0;

function nextId(prefix: string) {
  seq += 1;
  return `${prefix}_${seq}`;
}

function cloneScriptCard(base: Card, location: TriggerLocation, overrides: Partial<Card> = {}): Card {
  const gamecardId = overrides.gamecardId || nextId(base.id);
  return {
    ...base,
    uniqueId: overrides.uniqueId || `${base.id}:TEST`,
    gamecardId,
    cardlocation: location,
    colorReq: { ...(base.colorReq || {}) },
    baseColorReq: { ...(base.baseColorReq || base.colorReq || {}) },
    effects: [...(overrides.effects || base.effects || [])],
    displayState: overrides.displayState || base.displayState || 'FRONT_UPRIGHT',
    isExhausted: overrides.isExhausted ?? base.isExhausted ?? false,
    canAttack: overrides.canAttack ?? base.canAttack ?? true,
    ...overrides,
  } as Card;
}

function testCard(overrides: Partial<Card> = {}): Card {
  const id = overrides.id || nextId('TEST_CARD');
  return {
    id,
    uniqueId: overrides.uniqueId || `${id}:TEST`,
    gamecardId: overrides.gamecardId || nextId(id),
    fullName: overrides.fullName || id,
    specialName: overrides.specialName || '',
    type: overrides.type || 'UNIT',
    color: overrides.color || 'WHITE',
    cardlocation: overrides.cardlocation || 'DECK',
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
    isExhausted: overrides.isExhausted ?? false,
    canAttack: overrides.canAttack ?? true,
    canResetCount: overrides.canResetCount ?? 0,
    feijingMark: overrides.feijingMark ?? false,
    effects: overrides.effects || [],
    rarity: overrides.rarity || 'C',
    availableRarities: overrides.availableRarities || ['C'],
    cardPackage: overrides.cardPackage || 'TEST',
    ...overrides,
  } as Card;
}

function deckCards(count: number, prefix: string, color: Card['color'] = 'WHITE') {
  return Array.from({ length: count }, (_, index) => testCard({
    id: `${prefix}_${index}`,
    fullName: `${prefix} ${index}`,
    gamecardId: `${prefix}_${index}_${nextId('G')}`,
    type: 'UNIT',
    color,
    cardlocation: 'DECK',
  }));
}

function player(uid: string, overrides: Record<string, any> = {}) {
  return {
    uid,
    displayName: uid,
    deck: overrides.deck || deckCards(20, `${uid}_DECK`),
    hand: overrides.hand || [],
    grave: overrides.grave || [],
    exile: overrides.exile || [],
    unitZone: overrides.unitZone || [null, null, null, null, null, null],
    itemZone: overrides.itemZone || [],
    erosionFront: overrides.erosionFront || [],
    erosionBack: overrides.erosionBack || [],
    playZone: overrides.playZone || [],
    isTurn: overrides.isTurn ?? uid === 'BOT',
    isFirst: overrides.isFirst ?? false,
    mulliganDone: true,
    hasExhaustedThisTurn: [],
    timeRemaining: 999,
    factionsUsedThisTurn: [],
    ...overrides,
  };
}

function game(botOverrides: Record<string, any> = {}, opponentOverrides: Record<string, any> = {}, stateOverrides: Record<string, any> = {}) {
  const bot = player('BOT', botOverrides);
  const opponent = player('P1', { isTurn: false, ...opponentOverrides });
  return {
    gameId: nextId('sp02_scenario'),
    mode: 'ai-evaluation',
    skipResolutionDelay: true,
    phase: stateOverrides.phase || 'MAIN',
    previousPhase: undefined,
    currentTurnPlayer: 0,
    turnCount: stateOverrides.turnCount ?? 6,
    playerIds: ['BOT', 'P1'],
    players: {
      BOT: bot,
      P1: opponent,
    },
    counterStack: [],
    passCount: 0,
    isCountering: 0,
    gameStatus: 1,
    logs: [],
    triggeredEffectsQueue: [],
    pendingResolutions: [],
    phaseTimerStart: Date.now(),
    ...stateOverrides,
  } as any;
}

function pass(name: string, detail: string): ScenarioResult {
  return { name, passed: true, detail };
}

function fail(name: string, detail: string): ScenarioResult {
  return { name, passed: false, detail };
}

async function answerPendingQuery(state: any, playerUid: string, selections: string[]) {
  if (!state.pendingQuery) throw new Error('No pending query to answer');
  await ServerGameService.handleQueryChoice(state, playerUid, state.pendingQuery.id, selections);
}

async function activateAndResolveByOpponentPass(state: any, playerUid: string, card: Card, effectIndex: number) {
  await ServerGameService.activateEffect(state, playerUid, card.gamecardId, effectIndex);
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    const selection = state.pendingQuery.options?.[0]?.id || 'PAY';
    await answerPendingQuery(state, state.pendingQuery.playerUid, [selection]);
  }
  if (state.phase !== 'COUNTERING') {
    throw new Error(`Expected COUNTERING after activation, got ${state.phase}`);
  }
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
}

async function testStephanieRedBranch(): Promise<ScenarioResult> {
  const name = 'SP02-Y01 red reveal mills opponent after creation-scar cost';
  const stephanie = cloneScriptCard(sp02Y01 as Card, 'UNIT', { playedTurn: 1 });
  const revealRed = testCard({ id: 'REVEAL_RED', fullName: 'Reveal Red', color: 'RED', cardlocation: 'DECK' });
  const costCard = testCard({ id: 'COST_FACE_DOWN', fullName: 'Cost Face Down', color: 'BLUE', cardlocation: 'DECK' });
  const opponentDeck = deckCards(5, 'P1_MILL', 'GREEN');
  const state = game(
    {
      deck: [revealRed, costCard],
      unitZone: [stephanie, null, null, null, null, null],
    },
    {
      deck: opponentDeck,
    }
  );

  await activateAndResolveByOpponentPass(state, 'BOT', stephanie, 0);

  const condition =
    state.players.BOT.exile.some((card: Card) => card.id === 'COST_FACE_DOWN' && card.displayState === 'FRONT_FACEDOWN') &&
    state.players.BOT.deck.some((card: Card) => card.id === 'REVEAL_RED') &&
    state.players.P1.grave.length === 3 &&
    state.players.P1.deck.length === 2 &&
    !state.pendingQuery;

  return condition
    ? pass(name, `exile=${state.players.BOT.exile.length}, opponentGrave=${state.players.P1.grave.length}`)
    : fail(name, `exile=${state.players.BOT.exile.length}, botDeck=${state.players.BOT.deck.length}, opponentDeck=${state.players.P1.deck.length}, opponentGrave=${state.players.P1.grave.length}, query=${state.pendingQuery?.callbackKey}`);
}

async function testEthelGraveCostTargetsRemainSelectable(): Promise<ScenarioResult> {
  const name = 'SP02-W03 Ethel keeps grave exile cost targets selectable after declared target';
  const ethel = cloneScriptCard(sp02W03 as Card, 'UNIT', { playedTurn: 1 });
  const blinkTarget = testCard({
    id: 'ETHEL_BLINK_TARGET',
    fullName: 'Ethel Blink Target',
    type: 'UNIT',
    color: 'RED',
    colorReq: {},
    baseColorReq: {},
    godMark: false,
    cardlocation: 'UNIT',
  });
  const redCost = testCard({ id: 'ETHEL_RED_COST', fullName: 'Ethel Red Cost', color: 'RED', cardlocation: 'GRAVE' });
  const whiteCost = testCard({ id: 'ETHEL_WHITE_COST', fullName: 'Ethel White Cost', color: 'WHITE', cardlocation: 'GRAVE' });
  const state = game({
    grave: [redCost, whiteCost],
    unitZone: [ethel, blinkTarget, null, null, null, null],
  });

  await ServerGameService.activateEffect(state, 'BOT', ethel.gamecardId, 1);
  if (state.pendingQuery?.callbackKey !== 'DECLARE_EFFECT_TARGETS') {
    return fail(name, `expected declared target query, got ${state.pendingQuery?.callbackKey || 'none'}`);
  }

  await answerPendingQuery(state, 'BOT', [blinkTarget.gamecardId]);
  const graveOptionIds = new Set((state.pendingQuery?.options || []).map((option: any) => option.id));
  const openedGraveCostQuery =
    state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE' &&
    graveOptionIds.has(redCost.gamecardId) &&
    graveOptionIds.has(whiteCost.gamecardId);

  if (!openedGraveCostQuery) {
    return fail(name, `expected grave cost options, got callback=${state.pendingQuery?.callbackKey || 'none'}, options=${Array.from(graveOptionIds).join(',')}`);
  }

  await answerPendingQuery(state, 'BOT', [redCost.gamecardId, whiteCost.gamecardId]);
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);

  const costsExiled = state.players.BOT.exile.some((card: Card) => card.id === redCost.id) &&
    state.players.BOT.exile.some((card: Card) => card.id === whiteCost.id);
  const targetReturned = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === blinkTarget.gamecardId);

  return costsExiled && targetReturned && !state.pendingQuery
    ? pass(name, `exile=${state.players.BOT.exile.length}, targetReturned=${targetReturned}`)
    : fail(name, `costsExiled=${costsExiled}, targetReturned=${targetReturned}, query=${state.pendingQuery?.callbackKey || 'none'}`);
}

async function testStephanieYellowBranch(): Promise<ScenarioResult> {
  const name = 'SP02-Y01 yellow reveal asks opponent to discard and resolves';
  const stephanie = cloneScriptCard(sp02Y01 as Card, 'UNIT', { playedTurn: 1 });
  const revealYellow = testCard({ id: 'REVEAL_YELLOW', fullName: 'Reveal Yellow', color: 'YELLOW', cardlocation: 'DECK' });
  const costCard = testCard({ id: 'COST_FACE_DOWN_Y', fullName: 'Cost Face Down Y', color: 'BLUE', cardlocation: 'DECK' });
  const discard = testCard({ id: 'P1_DISCARD', fullName: 'Opponent Discard', color: 'RED', cardlocation: 'HAND' });
  const state = game(
    {
      deck: [revealYellow, costCard],
      unitZone: [stephanie, null, null, null, null, null],
    },
    {
      hand: [discard],
    }
  );

  await activateAndResolveByOpponentPass(state, 'BOT', stephanie, 0);
  const openedDiscardQuery =
    state.pendingQuery?.playerUid === 'P1' &&
    state.pendingQuery?.callbackKey === 'EFFECT_RESOLVE' &&
    state.pendingQuery?.options?.some((option: any) => option.id === discard.gamecardId);

  if (!openedDiscardQuery) {
    return fail(name, `expected opponent discard query, got ${state.pendingQuery?.callbackKey || 'none'}`);
  }

  await answerPendingQuery(state, 'P1', [discard.gamecardId]);
  const discarded = state.players.P1.grave.some((card: Card) => card.id === 'P1_DISCARD');
  return discarded && !state.pendingQuery
    ? pass(name, `opponentHand=${state.players.P1.hand.length}, opponentGrave=${state.players.P1.grave.length}`)
    : fail(name, `opponentHand=${state.players.P1.hand.length}, opponentGrave=${state.players.P1.grave.length}, query=${state.pendingQuery?.callbackKey}`);
}

async function testManagerCopiesOneShotActivate(): Promise<ScenarioResult> {
  const name = 'SP02-Y03 copies an eligible activate effect for one use';
  const manager = cloneScriptCard(sp02Y03 as Card, 'UNIT', { playedTurn: 1 });
  const sourceEffect: CardEffect = {
    id: 'TEST_COPY_SOURCE_ACTIVATE',
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    description: 'Mark copied activation',
    condition: (_gameState, _playerState, instance) => instance.cardlocation === 'UNIT',
    execute: async (instance) => {
      (instance as any).data = {
        ...((instance as any).data || {}),
        copiedSourceExecuted: true,
      };
    },
  };
  const source = testCard({
    id: 'COPY_SOURCE_RED',
    fullName: 'Copy Source Red',
    type: 'UNIT',
    color: 'RED',
    colorReq: {},
    baseColorReq: {},
    godMark: false,
    cardlocation: 'UNIT',
    effects: [sourceEffect],
  });
  const costCard = testCard({ id: 'MANAGER_COST', fullName: 'Manager Cost', cardlocation: 'DECK' });
  const state = game({
    deck: [costCard],
    unitZone: [manager, source, null, null, null, null],
  });

  const trigger = manager.effects?.[0];
  if (!trigger?.condition?.(state, state.players.BOT, manager, {
    type: 'CARD_ENTERED_ZONE',
    sourceCardId: manager.gamecardId,
    playerUid: 'BOT',
    data: { zone: 'UNIT' },
  } as any)) {
    return fail(name, 'entry copy trigger condition was false');
  }

  await trigger.execute?.(manager, state, state.players.BOT, {
    type: 'CARD_ENTERED_ZONE',
    sourceCardId: manager.gamecardId,
    playerUid: 'BOT',
    data: { zone: 'UNIT' },
  } as any);

  if (!state.pendingQuery?.options?.some((option: any) => option.id === source.gamecardId)) {
    return fail(name, `expected copy target query, got ${state.pendingQuery?.callbackKey || 'none'}`);
  }

  await answerPendingQuery(state, 'BOT', [source.gamecardId]);
  const copiedIndex = manager.effects?.findIndex(effect => effect.id === sourceEffect.id) ?? -1;
  if (copiedIndex < 0) {
    return fail(name, `copied effect missing; effectIds=${manager.effects?.map(effect => effect.id).join(',')}`);
  }

  await activateAndResolveByOpponentPass(state, 'BOT', manager, copiedIndex);
  const executed = !!(manager as any).data?.copiedSourceExecuted;

  let secondActivationBlocked = false;
  try {
    await ServerGameService.activateEffect(state, 'BOT', manager.gamecardId, copiedIndex);
  } catch {
    secondActivationBlocked = true;
  }

  return executed && secondActivationBlocked
    ? pass(name, `copiedIndex=${copiedIndex}, exile=${state.players.BOT.exile.length}`)
    : fail(name, `executed=${executed}, secondBlocked=${secondActivationBlocked}, query=${state.pendingQuery?.callbackKey}`);
}

async function testTruthResetAndExtraTurn(): Promise<ScenarioResult> {
  const name = 'SP02-Y09 enters from hand, resets zones, locks attacks, and queues extra turn';
  const truth = cloneScriptCard(sp02Y09 as Card, 'HAND');
  const fiveColorUnits = (['RED', 'WHITE', 'YELLOW', 'BLUE', 'GREEN'] as const).map(color => testCard({
    id: `COST_${color}`,
    fullName: `Cost ${color}`,
    type: 'UNIT',
    color,
    cardlocation: 'UNIT',
    isExhausted: false,
  }));
  const botHandExtra = testCard({ id: 'BOT_HAND_EXTRA', fullName: 'Bot Hand Extra', cardlocation: 'HAND' });
  const botGrave = testCard({ id: 'BOT_GRAVE_CARD', fullName: 'Bot Grave', cardlocation: 'GRAVE' });
  const botErosion = testCard({ id: 'BOT_EROSION_CARD', fullName: 'Bot Erosion', cardlocation: 'EROSION_BACK', displayState: 'FRONT_FACEDOWN' });
  const opponentHand = testCard({ id: 'P1_HAND_CARD', fullName: 'P1 Hand', cardlocation: 'HAND' });
  const opponentGrave = testCard({ id: 'P1_GRAVE_CARD', fullName: 'P1 Grave', cardlocation: 'GRAVE' });
  const state = game(
    {
      hand: [truth, botHandExtra],
      deck: deckCards(10, 'BOT_TRUTH_DECK'),
      grave: [botGrave],
      erosionBack: [botErosion],
      unitZone: [...fiveColorUnits, null],
    },
    {
      hand: [opponentHand],
      deck: deckCards(10, 'P1_TRUTH_DECK'),
      grave: [opponentGrave],
    }
  );

  await activateAndResolveByOpponentPass(state, 'BOT', truth, 0);
  if (state.triggeredEffectsQueue?.length) {
    await ServerGameService.checkTriggeredEffects(state);
  }

  const truthOnField = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === truth.gamecardId);
  const allCostsExhausted = fiveColorUnits.every(unit => unit.isExhausted);
  const botDrewFive = state.players.BOT.hand.length === 5;
  const opponentDrewFive = state.players.P1.hand.length === 5;
  const zonesCleared = state.players.BOT.grave.length === 0 &&
    state.players.BOT.erosionBack.filter(Boolean).length === 0 &&
    state.players.P1.grave.length === 0;
  const attackLocked = state.players.BOT.cannotDeclareAttackTurn === state.turnCount;
  const extraTurnQueued = state.players.BOT.extraTurnAfterCurrentTurn === state.turnCount;

  return truthOnField && allCostsExhausted && botDrewFive && opponentDrewFive && zonesCleared && attackLocked && extraTurnQueued
    ? pass(name, `botHand=${state.players.BOT.hand.length}, p1Hand=${state.players.P1.hand.length}, extraTurn=${state.players.BOT.extraTurnAfterCurrentTurn}`)
    : fail(name, `truth=${truthOnField}, costs=${allCostsExhausted}, botHand=${state.players.BOT.hand.length}, p1Hand=${state.players.P1.hand.length}, zones=${zonesCleared}, locked=${attackLocked}, extra=${extraTurnQueued}, queue=${state.triggeredEffectsQueue?.length}, query=${state.pendingQuery?.callbackKey}`);
}

const scenarios: { name: string; run: ScenarioRun }[] = [
  { name: 'SP02-W03 Ethel keeps grave exile cost targets selectable after declared target', run: testEthelGraveCostTargetsRemainSelectable },
  { name: 'SP02-Y01 red reveal mills opponent after creation-scar cost', run: testStephanieRedBranch },
  { name: 'SP02-Y01 yellow reveal asks opponent to discard and resolves', run: testStephanieYellowBranch },
  { name: 'SP02-Y03 copies an eligible activate effect for one use', run: testManagerCopiesOneShotActivate },
  { name: 'SP02-Y09 enters from hand, resets zones, locks attacks, and queues extra turn', run: testTruthResetAndExtraTurn },
];

async function main() {
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    try {
      results.push(await scenario.run());
    } catch (error: any) {
      results.push(fail(scenario.name, error?.stack || error?.message || String(error)));
    }
  }

  results.forEach(result => {
    const icon = result.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} ${result.name}: ${result.detail}`);
  });

  const failed = results.filter(result => !result.passed);
  console.log(`\nSP02 scenarios: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
