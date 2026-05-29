import { ServerGameService } from '../server/ServerGameService';
import { Card, TriggerLocation } from '../src/types/game';
import flameBomb from '../src/scripts/202000147';

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
    gameId: nextId('sp01_scenario'),
    mode: 'ai-evaluation',
    skipResolutionDelay: true,
    phase: stateOverrides.phase || 'MAIN',
    previousPhase: undefined,
    currentTurnPlayer: 0,
    turnCount: stateOverrides.turnCount ?? 2,
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

async function acceptOptionalTrigger(state: any, playerUid: string) {
  if (!state.pendingQuery) await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.callbackKey !== 'TRIGGER_CHOICE') {
    throw new Error(`Expected optional trigger choice, got ${state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, playerUid, ['YES']);
}

async function testFlameBombDrawRevealMainStartDamage(): Promise<ScenarioResult> {
  const name = 'SP01-R02 reveals from draw and damages at main start';
  const bomb = cloneScriptCard(flameBomb as Card, 'DECK', { gamecardId: 'FLAME_BOMB_DRAWN' });
  const backErosion = deckCards(2, 'BOT_BACK_EROSION').map(card => ({
    ...card,
    cardlocation: 'EROSION_BACK' as TriggerLocation,
    displayState: 'BACK_UPRIGHT' as Card['displayState'],
  }));
  const redUnits = deckCards(3, 'BOT_RED_SOURCE', 'RED').map(card => ({
    ...card,
    cardlocation: 'UNIT' as TriggerLocation,
  }));
  const state = game(
    {
      deck: [...deckCards(3, 'BOT_DRAW_FILL'), bomb],
      erosionBack: backErosion,
      unitZone: [redUnits[0], redUnits[1], redUnits[2], null, null, null],
    },
    {
      deck: deckCards(10, 'P1_DAMAGE_DECK'),
    },
    {
      phase: 'DRAW',
      turnCount: 2,
    }
  );

  await ServerGameService.executeDrawPhase(state, state.players.BOT);
  const drewBomb = state.players.BOT.hand.some((card: Card) => card.gamecardId === bomb.gamecardId);
  const reachedMain = state.phase === 'MAIN';

  await acceptOptionalTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.step !== 'REVEAL') {
    return fail(name, `expected reveal choice, got ${state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', ['YES']);

  const revealed = (bomb as any).data?.flameBombRevealedTurn === state.turnCount &&
    state.players.BOT.revealedHandCardIds?.includes(bomb.gamecardId);
  if (state.pendingQuery?.callbackKey !== 'TRIGGER_CHOICE' || state.pendingQuery.context?.effectId !== '202000147_main_start_damage') {
    return fail(name, `expected main-start damage trigger, got ${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}`);
  }

  await acceptOptionalTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.step !== 'DAMAGE') {
    return fail(name, `expected damage target query, got ${state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', ['PLAYER_OPPONENT']);

  const expectedDamage = 6;
  const damaged = state.players.P1.deck.length === 10 - expectedDamage &&
    state.players.P1.erosionFront.filter(Boolean).length === expectedDamage;
  const usedGlobal = state.effectUsage?.[`game_BOT_name_${bomb.id}_202000147_main_start_damage`] === 1;

  return drewBomb && reachedMain && revealed && damaged && usedGlobal
    ? pass(name, `damage=${expectedDamage}, p1Erosion=${state.players.P1.erosionFront.filter(Boolean).length}`)
    : fail(name, `drew=${drewBomb}, main=${reachedMain}, revealed=${revealed}, damaged=${damaged}, used=${usedGlobal}, query=${state.pendingQuery?.callbackKey || 'none'}`);
}

async function testFlameBombRequiresThreeRed(): Promise<ScenarioResult> {
  const name = 'SP01-R02 requires three red sources for main start damage';
  const bomb = cloneScriptCard(flameBomb as Card, 'DECK', { gamecardId: 'FLAME_BOMB_NO_RED' });
  const redUnits = deckCards(2, 'BOT_LOW_RED_SOURCE', 'RED').map(card => ({
    ...card,
    cardlocation: 'UNIT' as TriggerLocation,
  }));
  const state = game(
    {
      deck: [...deckCards(3, 'BOT_LOW_RED_FILL'), bomb],
      unitZone: [redUnits[0], redUnits[1], null, null, null, null],
    },
    {},
    {
      phase: 'DRAW',
      turnCount: 2,
    }
  );

  await ServerGameService.executeDrawPhase(state, state.players.BOT);
  await acceptOptionalTrigger(state, 'BOT');
  await answerPendingQuery(state, 'BOT', ['YES']);

  const noDamageTrigger = state.pendingQuery?.context?.effectId !== '202000147_main_start_damage' &&
    !(state.triggeredEffectsQueue || []).some((record: any) => record.effect?.id === '202000147_main_start_damage');
  return noDamageTrigger
    ? pass(name, 'damage trigger not queued without 3 red')
    : fail(name, `unexpected damage trigger: ${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'queue'}`);
}

const scenarios: { name: string; run: ScenarioRun }[] = [
  { name: 'SP01-R02 reveals from draw and damages at main start', run: testFlameBombDrawRevealMainStartDamage },
  { name: 'SP01-R02 requires three red sources for main start damage', run: testFlameBombRequiresThreeRed },
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
  console.log(`\nSP01 scenarios: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
