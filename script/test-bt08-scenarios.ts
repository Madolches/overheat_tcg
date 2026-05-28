import { ServerGameService } from '../server/ServerGameService';
import { EventEngine } from '../src/services/EventEngine';
import { Card, TriggerLocation } from '../src/types/game';
import bt08W01 from '../src/scripts/101140395';
import bt08W02 from '../src/scripts/101140396';
import bt08W03 from '../src/scripts/101140397';
import bt08W04 from '../src/scripts/101140398';
import bt08W05 from '../src/scripts/101130399';
import bt08W06 from '../src/scripts/101000400';
import bt08W07 from '../src/scripts/201140119';
import bt08W08 from '../src/scripts/201150120';
import bt08W09 from '../src/scripts/201000121';
import bt08W10 from '../src/scripts/301130066';
import bt08W11 from '../src/scripts/101150401';
import bt08R01 from '../src/scripts/102050387';
import bt08R02 from '../src/scripts/102050388';
import bt08R03 from '../src/scripts/102050389';
import bt08R04 from '../src/scripts/102050390';
import bt08R05 from '../src/scripts/102050391';
import bt08R06 from '../src/scripts/102050392';
import bt08R07 from '../src/scripts/102060393';
import bt08R08 from '../src/scripts/202050118';
import bt08R09 from '../src/scripts/302050064';
import bt08R10 from '../src/scripts/302050065';
import bt08R11 from '../src/scripts/102050394';
import bt08G01 from '../src/scripts/103090417';
import bt08G02 from '../src/scripts/103090422';
import bt08G03 from '../src/scripts/103090423';
import bt08G04 from '../src/scripts/103000418';
import bt08G05 from '../src/scripts/103000419';
import bt08G06 from '../src/scripts/103000420';
import bt08G07 from '../src/scripts/203080124';
import bt08G08 from '../src/scripts/203000125';
import bt08G09 from '../src/scripts/303090069';
import bt08G10 from '../src/scripts/303080070';
import bt08G11 from '../src/scripts/103090421';
import bt07G05 from '../src/scripts/103080315';
import bt08B01 from '../src/scripts/104020410';
import bt08B02 from '../src/scripts/104020411';
import bt08B03 from '../src/scripts/104030412';
import bt08B04 from '../src/scripts/104030413';
import bt08B05 from '../src/scripts/104030414';
import bt08B06 from '../src/scripts/104030415';
import bt08B07 from '../src/scripts/204020122';
import bt08B08 from '../src/scripts/204030123';
import bt08B09 from '../src/scripts/304020067';
import bt08B10 from '../src/scripts/304010068';
import bt08B11 from '../src/scripts/104010416';
import bt08Y01 from '../src/scripts/105110402';
import bt08Y02 from '../src/scripts/105110403';
import bt08Y03 from '../src/scripts/105110404';
import bt08Y04 from '../src/scripts/105000405';
import bt08Y05 from '../src/scripts/105000406';
import bt08Y06 from '../src/scripts/105000407';
import bt08Y07 from '../src/scripts/105000408';
import bt08Y08 from '../src/scripts/205000152';
import bt08Y09 from '../src/scripts/205000153';
import bt08Y10 from '../src/scripts/305110083';
import bt08Y11 from '../src/scripts/105110409';
import bt07Y04 from '../src/scripts/105000384';
import bt07Y09 from '../src/scripts/305000062';
import highAlchemy from '../src/scripts/205000103';
import bt04R07 from '../src/scripts/102060433';
import bt04R09 from '../src/scripts/202060130';
import bt05R07 from '../src/scripts/102060244';
import bt07R04 from '../src/scripts/102060369';
import bt07R11 from '../src/scripts/102060373';
import { canPutUnitOntoBattlefield, destroyByEffect, ensureData, moveCard, moveCardAsCost, wealthCount } from '../src/scripts/BaseUtil';

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
    gameId: nextId('bt08_scenario'),
    mode: 'ai-evaluation',
    skipResolutionDelay: true,
    phase: stateOverrides.phase || 'MAIN',
    previousPhase: undefined,
    currentTurnPlayer: 0,
    turnCount: stateOverrides.turnCount ?? 6,
    playerIds: ['BOT', 'P1'],
    players: { BOT: bot, P1: opponent },
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

async function answerDeclaredTargetQueries(state: any, effectIds?: string[]) {
  while (state.pendingQuery?.callbackKey === 'DECLARE_EFFECT_TARGET_MODE' || state.pendingQuery?.callbackKey === 'DECLARE_EFFECT_TARGETS') {
    const query = state.pendingQuery;
    if (effectIds && !effectIds.includes(query.context?.effectId)) break;
    const min = query.minSelections || 1;
    const selections = (query.options || [])
      .slice(0, min)
      .map((option: any) => option.card?.gamecardId || option.id || option.value)
      .filter(Boolean);
    await answerPendingQuery(state, query.playerUid, selections);
  }
}

async function confirmTrigger(state: any, playerUid: string) {
  await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, playerUid, ['YES']);
  }
}

function optionIdByValue(state: any, value: string): string {
  const option = (state.pendingQuery?.options || []).find((entry: any) =>
    entry.value === value || entry.id === value || entry.optionCode === value
  );
  if (!option) throw new Error(`No option ${value} in pending query`);
  return option.id;
}

type ActivationHelperOptions = {
  autoDeclare?: boolean;
};

async function activateAndResolveByOpponentPass(
  state: any,
  playerUid: string,
  card: Card,
  effectIndex: number,
  options: ActivationHelperOptions = {}
) {
  const autoDeclare = options.autoDeclare !== false;
  const effectId = card.effects?.[effectIndex]?.id;
  await ServerGameService.activateEffect(state, playerUid, card.gamecardId, effectIndex);
  if (!autoDeclare && (
    state.pendingQuery?.callbackKey === 'DECLARE_EFFECT_TARGET_MODE' ||
    state.pendingQuery?.callbackKey === 'DECLARE_EFFECT_TARGETS'
  )) {
    return;
  }
  if (autoDeclare) await answerDeclaredTargetQueries(state, effectId ? [effectId] : undefined);
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    const optionIds = (state.pendingQuery.options || []).map((option: any) => option.card?.gamecardId || option.id || option.value);
    const min = state.pendingQuery.minSelections || 1;
    await answerPendingQuery(state, state.pendingQuery.playerUid, optionIds.slice(0, min));
  }
  if (autoDeclare) await answerDeclaredTargetQueries(state, effectId ? [effectId] : undefined);
  if (state.phase !== 'COUNTERING') {
    throw new Error(`Expected COUNTERING after activation, got ${state.phase}`);
  }
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
}

async function activateAndPassWithPayment(
  state: any,
  playerUid: string,
  card: Card,
  effectIndex: number,
  payment: Record<string, any> = {},
  options: ActivationHelperOptions = {}
) {
  const autoDeclare = options.autoDeclare !== false;
  const effectId = card.effects?.[effectIndex]?.id;
  await ServerGameService.activateEffect(state, playerUid, card.gamecardId, effectIndex);
  if (autoDeclare) await answerDeclaredTargetQueries(state, effectId ? [effectId] : undefined);
  if (state.pendingQuery?.type === 'SELECT_PAYMENT') {
    await answerPendingQuery(state, state.pendingQuery.playerUid, [JSON.stringify(payment)]);
  }
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    const optionIds = (state.pendingQuery.options || []).map((option: any) => option.card?.gamecardId || option.id || option.value);
    const min = state.pendingQuery.minSelections || 1;
    await answerPendingQuery(state, state.pendingQuery.playerUid, optionIds.slice(0, min));
  }
  if (autoDeclare) await answerDeclaredTargetQueries(state, effectId ? [effectId] : undefined);
  if (state.phase !== 'COUNTERING') {
    throw new Error(`Expected COUNTERING after activation, got ${state.phase}`);
  }
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
}

async function confirmAllTriggers(state: any, playerUid: string) {
  await ServerGameService.checkTriggeredEffects(state);
  while (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE' || state.pendingQuery?.callbackKey === 'TRIGGER_ORDER_CHOICE') {
    if (state.pendingQuery.callbackKey === 'TRIGGER_ORDER_CHOICE') {
      const selected = state.pendingQuery.options?.[0]?.id;
      await answerPendingQuery(state, state.pendingQuery.playerUid, [selected]);
    } else {
      await answerPendingQuery(state, playerUid, ['YES']);
    }
  }
}

async function testPrayerDestroysItemAfterShingiCost(): Promise<ScenarioResult> {
  const name = 'BT08-W01 destroys non-god item after Shingi story cost exile';
  const prayer = cloneScriptCard(bt08W01 as Card, 'UNIT');
  const shingi = testCard({ id: 'SHINGI_STORY', fullName: '神仪：测试', type: 'STORY', cardlocation: 'PLAY' });
  const target = testCard({ id: 'TARGET_ITEM', fullName: 'Target Item', type: 'ITEM', cardlocation: 'ITEM', godMark: false });
  const godItem = testCard({ id: 'GOD_ITEM', fullName: 'God Item', type: 'ITEM', cardlocation: 'ITEM', godMark: true });
  const state = game({
    unitZone: [prayer, null, null, null, null, null],
    playZone: [shingi],
  }, {
    itemZone: [target, godItem],
  });

  moveCardAsCost(state, 'BOT', prayer, 'EXILE', shingi);
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId !== '101140395_shingi_cost_destroy_item') {
    return fail(name, `expected destroy item query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(target.gamecardId) || options.includes(godItem.gamecardId)) {
    return fail(name, `options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  const destroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId);
  return destroyed
    ? pass(name, `destroyed=${destroyed}`)
    : fail(name, `destroyed=${destroyed}`);
}

function testEliteWarriorGetsShingiStats(): ScenarioResult {
  const name = 'BT08-W02 gains stats and heroic after Shingi effect entry';
  const warrior = cloneScriptCard(bt08W02 as Card, 'UNIT', {
    data: { placedByShingiEffectSourceCardId: 'SHINGI_SOURCE' },
    baseHeroic: false,
    isHeroic: false,
  } as any);
  const state = game({
    unitZone: [warrior, null, null, null, null, null],
  });

  EventEngine.recalculateContinuousEffects(state);
  const boosted = warrior.power === (warrior.basePower || 0) + 500 &&
    warrior.damage === (warrior.baseDamage || 0) + 1 &&
    warrior.isHeroic === true;

  return boosted
    ? pass(name, `stats=${warrior.power}/${warrior.damage}, heroic=${warrior.isHeroic}`)
    : fail(name, `stats=${warrior.power}/${warrior.damage}, heroic=${warrior.isHeroic}`);
}

async function testEliteWarriorDestroysOpponentCardWhenDestroyed(): Promise<ScenarioResult> {
  const name = 'BT08-W02 destroys opponent field card when destroyed';
  const warrior = cloneScriptCard(bt08W02 as Card, 'GRAVE');
  const target = testCard({ id: 'W02_TARGET', fullName: 'W02 Target', type: 'ITEM', cardlocation: 'ITEM' });
  const state = game({}, {
    itemZone: [target],
  });
  state.players.BOT.grave.push(warrior);

  EventEngine.dispatchEvent(state, {
    type: 'CARD_DESTROYED_EFFECT',
    playerUid: 'BOT',
    targetCardId: warrior.gamecardId,
    sourceCard: warrior,
    sourceCardId: warrior.gamecardId,
  });
  await confirmTrigger(state, 'BOT');

  const triggered = state.pendingQuery?.context?.effectId === '101140396_destroy_destroy_opponent_card';
  if (triggered) {
    await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  }
  const destroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId);

  return triggered && destroyed
    ? pass(name, `triggered=${triggered}, destroyed=${destroyed}`)
    : fail(name, `triggered=${triggered}, destroyed=${destroyed}, pending=${state.pendingQuery?.context?.effectId || 'none'}`);
}

async function testKuriSacrificesAndExilesTargets(): Promise<ScenarioResult> {
  const name = 'BT08-W03 sacrifices Shingi-entered self to draw and exile targets';
  const kuri = cloneScriptCard(bt08W03 as Card, 'UNIT', {
    data: { placedByShingiEffectSourceCardId: 'SHINGI_SOURCE' },
  } as any);
  const draw = testCard({ id: 'DRAW_CARD', fullName: 'Draw Card', cardlocation: 'DECK' });
  const erosionA = testCard({ id: 'EROSION_BACK_A', fullName: 'Erosion Back A', cardlocation: 'EROSION_BACK', displayState: 'BACK_UPRIGHT' });
  const erosionB = testCard({ id: 'EROSION_BACK_B', fullName: 'Erosion Back B', cardlocation: 'EROSION_BACK', displayState: 'BACK_UPRIGHT' });
  const godTarget = testCard({ id: 'GOD_TARGET', fullName: 'God Target', type: 'UNIT', cardlocation: 'UNIT', godMark: true });
  const nonGodA = testCard({ id: 'NON_GOD_A', fullName: 'Non God A', type: 'UNIT', cardlocation: 'UNIT', godMark: false });
  const nonGodB = testCard({ id: 'NON_GOD_B', fullName: 'Non God B', type: 'ITEM', cardlocation: 'ITEM', godMark: false });
  const state = game({
    deck: [draw],
    unitZone: [kuri, null, null, null, null, null],
    erosionBack: [erosionA, erosionB],
  }, {
    unitZone: [godTarget, nonGodA, null, null, null, null],
    itemZone: [nonGodB],
  });

  await ServerGameService.activateEffect(state, 'BOT', kuri.gamecardId, 0);
  if (state.pendingQuery?.context?.step !== 'MODE') {
    return fail(name, `expected mode query, got ${state.pendingQuery?.context?.step || state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [optionIdByValue(state, 'NON_GOD')]);
  if (state.pendingQuery?.context?.step !== 'NON_GOD') {
    return fail(name, `expected non-god query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [nonGodA.gamecardId, nonGodB.gamecardId]);
  if (state.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${state.phase}`);
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);

  const selfInGrave = state.players.BOT.grave.some((card: Card) => card.gamecardId === kuri.gamecardId);
  const drew = state.players.BOT.hand.some((card: Card) => card.gamecardId === draw.gamecardId);
  const targetsExiled = [nonGodA, nonGodB].every(target =>
    state.players.P1.exile.some((card: Card) => card.gamecardId === target.gamecardId)
  );
  const godStillOnField = state.players.P1.unitZone.some((unit: Card | null) => unit?.gamecardId === godTarget.gamecardId);

  return selfInGrave && drew && targetsExiled && godStillOnField
    ? pass(name, `drew=${drew}, exiled=${targetsExiled}`)
    : fail(name, `self=${selfInGrave}, drew=${drew}, exiled=${targetsExiled}, god=${godStillOnField}`);
}

async function testDuluExilesAndReturnsNonGodUnit(): Promise<ScenarioResult> {
  const name = 'BT08-W04 discards two to exile a non-god unit until turn end';
  const dulu = cloneScriptCard(bt08W04 as Card, 'UNIT');
  const discardA = testCard({ id: 'DISCARD_A', fullName: 'Discard A', cardlocation: 'HAND' });
  const discardB = testCard({ id: 'DISCARD_B', fullName: 'Discard B', cardlocation: 'HAND' });
  const erosion = testCard({ id: 'EROSION_BACK', fullName: 'Erosion Back', cardlocation: 'EROSION_BACK', displayState: 'BACK_UPRIGHT' });
  const target = testCard({ id: 'NON_GOD_UNIT', fullName: 'Non God Unit', type: 'UNIT', cardlocation: 'UNIT', godMark: false });
  const state = game({
    hand: [discardA, discardB],
    unitZone: [dulu, null, null, null, null, null],
    erosionBack: [erosion],
  }, {
    unitZone: [target, null, null, null, null, null],
  });

  EventEngine.recalculateContinuousEffects(state);
  const boosted = dulu.power === (dulu.basePower || 0) + 500 && dulu.isHeroic === true;
  const highErosionDulu = cloneScriptCard(bt08W04 as Card, 'UNIT', { gamecardId: 'W04_DULU_HIGH' });
  const stateHigh = game({
    unitZone: [highErosionDulu, null, null, null, null, null],
    erosionFront: deckCards(5, 'W04_HIGH_EROSION', 'WHITE').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  EventEngine.recalculateContinuousEffects(stateHigh);
  const gatedHeroic = highErosionDulu.isHeroic !== true &&
    highErosionDulu.power === (highErosionDulu.basePower || 0);

  await ServerGameService.activateEffect(state, 'BOT', dulu.gamecardId, 0);
  if (state.pendingQuery?.context?.effectId !== '101140398_exile_non_god_unit_until_end') {
    return fail(name, `expected exile query, got ${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(state, 'BOT', [discardA.gamecardId, discardB.gamecardId]);
  }
  if (state.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${state.phase}`);
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  const discarded = [discardA, discardB].every(card =>
    state.players.BOT.grave.some((grave: Card) => grave.gamecardId === card.gamecardId)
  );
  const exiled = state.players.P1.exile.some((card: Card) => card.gamecardId === target.gamecardId);

  EventEngine.dispatchEvent(state, { type: 'TURN_END' as any, playerUid: 'BOT' });
  ServerGameService.enqueueMandatoryEndTurnDelayedEffects(state, 'BOT');
  await confirmTrigger(state, 'BOT');
  const returned = state.players.P1.unitZone.some((unit: Card | null) => unit?.gamecardId === target.gamecardId);

  return boosted && gatedHeroic && discarded && exiled && returned
    ? pass(name, `boosted=${boosted}, gated=${gatedHeroic}, returned=${returned}`)
    : fail(name, `boosted=${boosted}, gated=${gatedHeroic}, discarded=${discarded}, exiled=${exiled}, returned=${returned}`);
}

async function testPatrolReadiesHolyKingdomAllianceTarget(): Promise<ScenarioResult> {
  const name = 'BT08-W05 readies another Holy Kingdom non-god unit after alliance battle';
  const patrol = cloneScriptCard(bt08W05 as Card, 'UNIT');
  const target = testCard({
    id: 'HOLY_TARGET',
    fullName: 'Holy Kingdom Target',
    type: 'UNIT',
    faction: patrol.faction,
    cardlocation: 'UNIT',
    isExhausted: true,
  });
  const godTarget = testCard({
    id: 'HOLY_GOD_TARGET',
    fullName: 'Holy Kingdom God Target',
    type: 'UNIT',
    faction: patrol.faction,
    cardlocation: 'UNIT',
    godMark: true,
    isExhausted: true,
  });
  const state = game({
    unitZone: [patrol, target, godTarget, null, null, null],
  });

  EventEngine.dispatchEvent(state, {
    type: 'BATTLE_ENDED' as any,
    sourceCard: patrol,
    sourceCardId: patrol.gamecardId,
    playerUid: 'BOT',
    data: {
      attackerIds: [patrol.gamecardId, 'ALLY_ATTACKER'],
      isAlliance: true,
    },
  });
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId !== '101130399_alliance_end_ready') {
    return fail(name, `expected ready query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(target.gamecardId) || options.includes(godTarget.gamecardId) || options.includes(patrol.gamecardId)) {
    return fail(name, `options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  const ready = !target.isExhausted;

  const battlePatrol = cloneScriptCard(bt08W05 as Card, 'UNIT', { gamecardId: 'PATROL_BATTLE' });
  const battleAlly = testCard({
    id: 'PATROL_BATTLE_ALLY',
    fullName: 'Patrol Battle Ally',
    type: 'UNIT',
    faction: battlePatrol.faction,
    cardlocation: 'UNIT',
    power: 1000,
    basePower: 1000,
  });
  const battleTarget = testCard({
    id: 'PATROL_BATTLE_TARGET',
    fullName: 'Patrol Battle Target',
    type: 'UNIT',
    faction: battlePatrol.faction,
    cardlocation: 'UNIT',
    isExhausted: true,
  });
  const defender = testCard({
    id: 'PATROL_DEFENDER',
    fullName: 'Patrol Defender',
    type: 'UNIT',
    cardlocation: 'UNIT',
    power: 500,
    basePower: 500,
  });
  const battleState = game({
    unitZone: [battlePatrol, battleAlly, battleTarget, null, null, null],
  }, {
    unitZone: [defender, null, null, null, null, null],
  }, {
    phase: 'DAMAGE_CALCULATION',
    battleState: {
      attackers: [battlePatrol.gamecardId, battleAlly.gamecardId],
      defender: defender.gamecardId,
      isAlliance: true,
      resolvedUnitIds: []
    }
  });
  await ServerGameService.resolveDamage(battleState);
  if (battleState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(battleState, 'BOT', ['YES']);
  }
  await answerPendingQuery(battleState, 'BOT', [battleTarget.gamecardId]);
  const battleEndedCleanly = battleState.phase === 'MAIN' && !battleState.battleState;

  return ready && battleEndedCleanly
    ? pass(name, `ready=${ready}, battleClean=${battleEndedCleanly}`)
    : fail(name, `ready=${ready}, battleClean=${battleEndedCleanly}, phase=${battleState.phase}`);
}

function testSculptorKeepsHeroicThroughContinuous(): ScenarioResult {
  const name = 'BT08-W06 has explicit heroic continuous effect';
  const sculptor = cloneScriptCard(bt08W06 as Card, 'UNIT', {
    isHeroic: false,
    baseHeroic: false,
  } as any);
  const state = game({
    unitZone: [sculptor, null, null, null, null, null],
  });

  EventEngine.recalculateContinuousEffects(state);
  return sculptor.isHeroic === true
    ? pass(name, `heroic=${sculptor.isHeroic}`)
    : fail(name, `heroic=${sculptor.isHeroic}`);
}

async function testBaptismExilesAccessFiveAndPlacesWhiteUnit(): Promise<ScenarioResult> {
  const name = 'BT08-W07 exiles AC total 5 and puts deck AC5 white unit onto field';
  const baptism = cloneScriptCard(bt08W07 as Card, 'PLAY');
  const costA = testCard({ id: 'WHITE_COST_A', fullName: 'White Cost A', type: 'UNIT', color: 'WHITE', acValue: 3, cardlocation: 'UNIT' });
  const costB = testCard({ id: 'WHITE_COST_B', fullName: 'White Cost B', type: 'UNIT', color: 'WHITE', acValue: 2, cardlocation: 'UNIT' });
  const target = cloneScriptCard(bt08W02 as Card, 'DECK', { acValue: 5, baseAcValue: 5 });
  const wrongAccess = testCard({ id: 'WHITE_AC4', fullName: 'White AC4', type: 'UNIT', color: 'WHITE', acValue: 4, cardlocation: 'DECK' });
  const state = game({
    playZone: [baptism],
    unitZone: [costA, costB, null, null, null, null],
    deck: [target, wrongAccess],
  });
  const effect = baptism.effects?.[0];
  if (!effect?.condition?.(state, state.players.BOT, baptism)) {
    return fail(name, 'condition=false');
  }

  await effect.execute?.(baptism, state, state.players.BOT);
  if (state.pendingQuery?.context?.step !== 'EXILE_UNITS') {
    return fail(name, `expected EXILE_UNITS, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [costA.gamecardId, costB.gamecardId]);
  if (state.pendingQuery?.context?.step !== 'PUT_UNIT') {
    return fail(name, `expected PUT_UNIT, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(target.gamecardId) || options.includes(wrongAccess.gamecardId)) {
    return fail(name, `options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const costsExiled = [costA, costB].every(card =>
    state.players.BOT.exile.some((exiled: Card) => exiled.gamecardId === card.gamecardId)
  );
  const placed = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === target.gamecardId);
  const marked = (target as any).data?.placedByShingiEffectSourceCardId === baptism.gamecardId;
  return costsExiled && placed && marked
    ? pass(name, `placed=${placed}, marked=${marked}`)
    : fail(name, `costs=${costsExiled}, placed=${placed}, marked=${marked}`);
}

async function testSnowstormFreezeAndNikolasSendToGrave(): Promise<ScenarioResult> {
  const name = 'BT08-W08 freezes a non-god unit and W11 sends frozen unit to grave';
  const snowstorm = cloneScriptCard(bt08W08 as Card, 'PLAY');
  const nikolas = cloneScriptCard(bt08W11 as Card, 'UNIT');
  const target = testCard({ id: 'FREEZE_TARGET', fullName: 'Freeze Target', type: 'UNIT', cardlocation: 'UNIT', godMark: false });
  const godTarget = testCard({ id: 'FREEZE_GOD_TARGET', fullName: 'Freeze God Target', type: 'UNIT', cardlocation: 'UNIT', godMark: true });
  const state = game({
    unitZone: [nikolas, null, null, null, null, null],
    playZone: [snowstorm],
  }, {
    unitZone: [target, godTarget, null, null, null, null],
  });

  await snowstorm.effects?.[0]?.execute?.(snowstorm, state, state.players.BOT);
  if (state.pendingQuery?.context?.effectId !== '201150120_freeze_non_god_unit') {
    return fail(name, `expected freeze query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const freezeOptions = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!freezeOptions.includes(target.gamecardId) || freezeOptions.includes(godTarget.gamecardId)) {
    return fail(name, `freezeOptions=${freezeOptions.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  const frozen = (target as any).data?.freezeUntilTurn === state.turnCount &&
    (target as any).data?.cannotActivateUntilTurn === state.turnCount &&
    (target as any).data?.cannotAttackOrDefendUntilTurn === state.turnCount;

  await activateAndResolveByOpponentPass(state, 'BOT', nikolas, 0);
  if (state.pendingQuery?.context?.effectId !== '101150401_send_frozen_non_god_to_grave') {
    return fail(name, `expected frozen send query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  const sent = state.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId);

  return frozen && sent
    ? pass(name, `frozen=${frozen}, sent=${sent}`)
    : fail(name, `frozen=${frozen}, sent=${sent}`);
}

async function testAlarmReadiesOnOpponentAttackStack(): Promise<ScenarioResult> {
  const name = 'BT08-W09 readies own non-god unit during opponent attack confrontation';
  const alarm = cloneScriptCard(bt08W09 as Card, 'PLAY');
  const target = testCard({ id: 'ALARM_TARGET', fullName: 'Alarm Target', type: 'UNIT', cardlocation: 'UNIT', godMark: false, isExhausted: true });
  const godTarget = testCard({ id: 'ALARM_GOD_TARGET', fullName: 'Alarm God Target', type: 'UNIT', cardlocation: 'UNIT', godMark: true, isExhausted: true });
  const state = game({
    playZone: [alarm],
    unitZone: [target, godTarget, null, null, null, null],
  }, {}, {
    phase: 'COUNTERING',
    counterStack: [{
      id: 'ATTACK_STACK',
      type: 'ATTACK',
      ownerUid: 'P1',
      attackerIds: ['P1_ATTACKER'],
      isAlliance: false,
      timestamp: 1,
    }],
  });
  const effect = alarm.effects?.[0];
  if (!effect?.condition?.(state, state.players.BOT, alarm)) {
    return fail(name, 'condition=false');
  }

  await effect.execute?.(alarm, state, state.players.BOT);
  if (state.pendingQuery?.context?.effectId !== '201000121_ready_on_opponent_attack') {
    return fail(name, `expected ready query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(target.gamecardId) || options.includes(godTarget.gamecardId)) {
    return fail(name, `options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  const ready = !target.isExhausted;
  return ready
    ? pass(name, `ready=${ready}`)
    : fail(name, `ready=${ready}`);
}

function testGloriousCityProtectsAndBoostsHolyKingdom(): ScenarioResult {
  const name = 'BT08-W10 protects first Holy Kingdom destruction and boosts at erosion 3-6';
  const city = cloneScriptCard(bt08W10 as Card, 'ITEM');
  const unit = testCard({
    id: 'HOLY_UNIT',
    fullName: 'Holy Kingdom Unit',
    type: 'UNIT',
    faction: city.faction,
    cardlocation: 'UNIT',
    basePower: 2500,
    power: 2500,
  });
  const item = testCard({
    id: 'HOLY_ITEM',
    fullName: 'Holy Kingdom Item',
    type: 'ITEM',
    faction: city.faction,
    cardlocation: 'ITEM',
  });
  const nonHoly = testCard({
    id: 'NON_HOLY_UNIT',
    fullName: 'Non Holy Unit',
    type: 'UNIT',
    faction: 'OTHER',
    cardlocation: 'UNIT',
    basePower: 2500,
    power: 2500,
  });
  const erosionA = testCard({ id: 'EROSION_A', fullName: 'Erosion A', cardlocation: 'EROSION_FRONT' });
  const erosionB = testCard({ id: 'EROSION_B', fullName: 'Erosion B', cardlocation: 'EROSION_FRONT' });
  const erosionC = testCard({ id: 'EROSION_C', fullName: 'Erosion C', cardlocation: 'EROSION_BACK' });
  const opponentSource = testCard({ id: 'OPPONENT_SOURCE', fullName: 'Opponent Source', type: 'UNIT', cardlocation: 'UNIT' });
  const state = game({
    unitZone: [unit, nonHoly, null, null, null, null],
    itemZone: [city, item],
    erosionFront: [erosionA, erosionB],
    erosionBack: [erosionC],
  }, {
    unitZone: [opponentSource, null, null, null, null, null],
  });

  EventEngine.recalculateContinuousEffects(state);
  const boosted = unit.power === 3000 && nonHoly.power === 2500;
  ServerGameService.destroyUnit(state, 'BOT', unit.gamecardId, false, 'P1');
  const battleDestroyed = state.players.BOT.grave.some((card: Card) => card.gamecardId === unit.gamecardId);
  const effectUnit = testCard({
    id: 'HOLY_UNIT_EFFECT',
    fullName: 'Holy Kingdom Effect Unit',
    type: 'UNIT',
    faction: city.faction,
    cardlocation: 'UNIT',
    basePower: 2500,
    power: 2500,
  });
  state.players.BOT.unitZone[0] = effectUnit;
  EventEngine.recalculateContinuousEffects(state);
  destroyByEffect(state, effectUnit, opponentSource);
  const unitProtected = state.players.BOT.unitZone.some((slot: Card | null) => slot?.gamecardId === effectUnit.gamecardId);
  destroyByEffect(state, item, opponentSource);
  const itemProtected = state.players.BOT.itemZone.some((slot: Card | null) => slot?.gamecardId === item.gamecardId);
  destroyByEffect(state, effectUnit, opponentSource);
  const secondDestroyed = state.players.BOT.grave.some((card: Card) => card.gamecardId === effectUnit.gamecardId);

  return boosted && battleDestroyed && unitProtected && itemProtected && secondDestroyed
    ? pass(name, `boosted=${boosted}, battleDestroyed=${battleDestroyed}, protected=${unitProtected && itemProtected}, secondDestroyed=${secondDestroyed}`)
    : fail(name, `boosted=${boosted}, battleDestroyed=${battleDestroyed}, unitProtected=${unitProtected}, itemProtected=${itemProtected}, secondDestroyed=${secondDestroyed}`);
}

async function testNikolasSendsFrozenNonGodToGrave(): Promise<ScenarioResult> {
  const name = 'BT08-W11 sends a frozen non-god unit to grave';
  const nikolas = cloneScriptCard(bt08W11 as Card, 'UNIT');
  const target = testCard({
    id: 'FROZEN_TARGET',
    fullName: 'Frozen Target',
    type: 'UNIT',
    cardlocation: 'UNIT',
    godMark: false,
    data: {
      freezeUntilTurn: 6,
      cannotActivateUntilTurn: 6,
      cannotAttackOrDefendUntilTurn: 6,
    },
  } as any);
  const godTarget = testCard({
    id: 'FROZEN_GOD_TARGET',
    fullName: 'Frozen God Target',
    type: 'UNIT',
    cardlocation: 'UNIT',
    godMark: true,
    data: {
      freezeUntilTurn: 6,
      cannotActivateUntilTurn: 6,
      cannotAttackOrDefendUntilTurn: 6,
    },
  } as any);
  const state = game({
    unitZone: [nikolas, null, null, null, null, null],
  }, {
    unitZone: [target, godTarget, null, null, null, null],
  }, {
    turnCount: 6,
  });

  await activateAndResolveByOpponentPass(state, 'BOT', nikolas, 0);
  if (state.pendingQuery?.context?.effectId !== '101150401_send_frozen_non_god_to_grave') {
    return fail(name, `expected frozen send query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(target.gamecardId) || options.includes(godTarget.gamecardId)) {
    return fail(name, `options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const sent = state.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId);
  return sent
    ? pass(name, `sent=${sent}`)
    : fail(name, `sent=${sent}`);
}

async function testRedTurnStartPromotion(): Promise<ScenarioResult> {
  const name = 'BT08-R01/R03 promote at turn start after discarding Ileu hand';
  const rookie = cloneScriptCard(bt08R01 as Card, 'UNIT');
  const rose = cloneScriptCard(bt08R03 as Card, 'UNIT');
  const discardA = testCard({ id: 'ILEU_HAND_A', fullName: 'Ileu Hand A', color: 'RED', faction: rookie.faction, cardlocation: 'HAND' });
  const discardB = testCard({ id: 'ILEU_HAND_B', fullName: 'Ileu Hand B', color: 'RED', faction: rose.faction, cardlocation: 'HAND' });
  const targetA = testCard({ id: 'PROMOTE_AC3', fullName: 'Promote AC3', type: 'UNIT', color: 'RED', faction: rookie.faction, acValue: 3, cardlocation: 'DECK' });
  const targetB = testCard({ id: 'PROMOTE_AC4', fullName: 'Promote AC4', type: 'UNIT', color: 'RED', faction: rose.faction, acValue: 4, cardlocation: 'DECK' });

  const stateA = game({
    hand: [discardA],
    deck: [targetA],
    unitZone: [rookie, null, null, null, null, null],
  }, {}, { phase: 'START' });
  EventEngine.dispatchEvent(stateA, { type: 'PHASE_CHANGED', playerUid: 'BOT', data: { phase: 'START' } });
  await confirmTrigger(stateA, 'BOT');
  await answerPendingQuery(stateA, 'BOT', [discardA.gamecardId]);
  await answerPendingQuery(stateA, 'BOT', [targetA.gamecardId]);
  const promotedA = stateA.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === targetA.gamecardId && (unit as any).data?.placedByPromotionSourceCardId === rookie.gamecardId
  );

  const stateB = game({
    hand: [discardB],
    deck: [targetB],
    unitZone: [rose, null, null, null, null, null],
  }, {}, { phase: 'START' });
  EventEngine.dispatchEvent(stateB, { type: 'PHASE_CHANGED', playerUid: 'BOT', data: { phase: 'START' } });
  await confirmTrigger(stateB, 'BOT');
  await answerPendingQuery(stateB, 'BOT', [discardB.gamecardId]);
  await answerPendingQuery(stateB, 'BOT', [targetB.gamecardId]);
  const promotedB = stateB.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === targetB.gamecardId && (unit as any).data?.placedByPromotionSourceCardId === rose.gamecardId
  );
  const rookieAccess = rookie.acValue === 2 && rookie.baseAcValue === 2;

  return promotedA && promotedB && rookieAccess
    ? pass(name, `promotedA=${promotedA}, promotedB=${promotedB}, rookieAccess=${rookieAccess}`)
    : fail(name, `promotedA=${promotedA}, promotedB=${promotedB}, rookieAccess=${rookieAccess}`);
}

async function testRedEndTurnPromotionAndDraw(): Promise<ScenarioResult> {
  const name = 'BT08-R04/R05 promote after attacking at turn end and R05 draws';
  const captain = cloneScriptCard(bt08R04 as Card, 'UNIT', { hasAttackedThisTurn: true });
  const hundred = cloneScriptCard(bt08R05 as Card, 'UNIT', { hasAttackedThisTurn: true });
  const targetA = testCard({ id: 'R04_PROMOTE_AC4', fullName: 'R04 Promote AC4', type: 'UNIT', color: 'RED', faction: captain.faction, acValue: 4, cardlocation: 'DECK' });
  const targetB = testCard({ id: 'R05_PROMOTE_AC5', fullName: 'R05 Promote AC5', type: 'UNIT', color: 'RED', faction: hundred.faction, acValue: 5, cardlocation: 'DECK' });
  const draw = testCard({ id: 'R05_DRAW', fullName: 'R05 Draw', color: 'RED', cardlocation: 'DECK' });

  const stateA = game({
    deck: [targetA],
    unitZone: [captain, null, null, null, null, null],
  });
  EventEngine.dispatchEvent(stateA, { type: 'TURN_END' as any, playerUid: 'BOT' });
  await confirmTrigger(stateA, 'BOT');
  await answerPendingQuery(stateA, 'BOT', [targetA.gamecardId]);
  const promotedA = stateA.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === targetA.gamecardId);

  const stateB = game({
    deck: [targetB, draw],
    unitZone: [hundred, null, null, null, null, null],
  });
  EventEngine.dispatchEvent(stateB, { type: 'TURN_END' as any, playerUid: 'BOT' });
  await confirmTrigger(stateB, 'BOT');
  await answerPendingQuery(stateB, 'BOT', [targetB.gamecardId]);
  const promotedB = stateB.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === targetB.gamecardId);
  const drew = stateB.players.BOT.hand.some((card: Card) => card.gamecardId === draw.gamecardId);

  return promotedA && promotedB && drew
    ? pass(name, `promotedA=${promotedA}, promotedB=${promotedB}, drew=${drew}`)
    : fail(name, `promotedA=${promotedA}, promotedB=${promotedB}, drew=${drew}`);
}

async function testRedRecoveryAndPromotionStory(): Promise<ScenarioResult> {
  const name = 'BT08-R02 recovers grave units and R08 story draws then promotes';
  const swordsman = cloneScriptCard(bt08R02 as Card, 'UNIT');
  const graveA = testCard({ id: 'ILEU_GRAVE_A', fullName: 'Ileu Grave A', type: 'UNIT', color: 'RED', faction: swordsman.faction, cardlocation: 'GRAVE' });
  const graveB = testCard({ id: 'ILEU_GRAVE_B', fullName: 'Ileu Grave B', type: 'UNIT', color: 'RED', faction: swordsman.faction, cardlocation: 'GRAVE' });
  const stateA = game({
    unitZone: [swordsman, null, null, null, null, null],
    grave: [graveA, graveB],
  });
  await activateAndResolveByOpponentPass(stateA, 'BOT', swordsman, 0);
  await answerPendingQuery(stateA, 'BOT', [graveA.gamecardId, graveB.gamecardId]);
  const exiledSelf = stateA.players.BOT.exile.some((card: Card) => card.gamecardId === swordsman.gamecardId);
  const recovered = stateA.players.BOT.deck.slice(0, 2).every((card: Card) => [graveA.gamecardId, graveB.gamecardId].includes(card.gamecardId));

  const storyCard = cloneScriptCard(bt08R08 as Card, 'PLAY');
  const costUnit = testCard({ id: 'R08_COST', fullName: 'R08 Cost', type: 'UNIT', color: 'RED', faction: storyCard.faction, acValue: 2, cardlocation: 'UNIT' });
  const promoted = testCard({ id: 'R08_PROMOTE', fullName: 'R08 Promote', type: 'UNIT', color: 'RED', faction: storyCard.faction, acValue: 3, cardlocation: 'DECK' });
  const draw = testCard({ id: 'R08_DRAW', fullName: 'R08 Draw', color: 'RED', cardlocation: 'DECK' });
  const stateB = game({
    deck: [promoted, draw],
    playZone: [storyCard],
    unitZone: [costUnit, null, null, null, null, null],
  });
  const effect = storyCard.effects?.[0];
  if (!effect?.condition?.(stateB, stateB.players.BOT, storyCard)) {
    return fail(name, 'R08 condition=false');
  }
  await effect.execute?.(storyCard, stateB, stateB.players.BOT);
  await answerPendingQuery(stateB, 'BOT', [costUnit.gamecardId]);
  await answerPendingQuery(stateB, 'BOT', [promoted.gamecardId]);
  const storyPromoted = stateB.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === promoted.gamecardId && (unit as any).data?.placedByPromotionSourceCardId === storyCard.gamecardId
  );
  const storyDrew = stateB.players.BOT.hand.some((card: Card) => card.gamecardId === draw.gamecardId);

  return exiledSelf && recovered && storyPromoted && storyDrew
    ? pass(name, `recovered=${recovered}, storyPromoted=${storyPromoted}, drew=${storyDrew}`)
    : fail(name, `exiledSelf=${exiledSelf}, recovered=${recovered}, storyPromoted=${storyPromoted}, drew=${storyDrew}`);
}

async function testRedPromotionDestroyModes(): Promise<ScenarioResult> {
  const name = 'BT08-R03/R11 destroy only on promotion turn and filter god/non-god targets';
  const rose = cloneScriptCard(bt08R03 as Card, 'UNIT', { data: { placedByPromotionTurn: 6, placedByPromotionSourceCardId: 'PROMO' } } as any);
  const pay = testCard({ id: 'PAY_UNIT', fullName: 'Pay Unit', type: 'UNIT', color: 'RED', faction: rose.faction, cardlocation: 'UNIT' });
  const nonGod = testCard({ id: 'R03_TARGET', fullName: 'R03 Target', type: 'ITEM', godMark: false, cardlocation: 'ITEM' });
  const god = testCard({ id: 'R03_GOD', fullName: 'R03 God', type: 'UNIT', godMark: true, cardlocation: 'UNIT' });
  const stateA = game({
    unitZone: [rose, pay, null, null, null, null],
  }, {
    unitZone: [god, null, null, null, null, null],
    itemZone: [nonGod],
  }, { turnCount: 6 });
  await ServerGameService.activateEffect(stateA, 'BOT', rose.gamecardId, 1);
  const r03Options = (stateA.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!r03Options.includes(nonGod.gamecardId) || r03Options.includes(god.gamecardId)) {
    return fail(name, `R03 options=${r03Options.join(',')}`);
  }
  await answerPendingQuery(stateA, 'BOT', [nonGod.gamecardId]);
  if (stateA.pendingQuery?.type === 'SELECT_PAYMENT') {
    await answerPendingQuery(stateA, 'BOT', [JSON.stringify({ exhaustUnitIds: [pay.gamecardId] })]);
  }
  if (stateA.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateA.phase}`);
  await ServerGameService.passConfrontation(stateA, stateA.priorityPlayerId);
  const r03Destroyed = stateA.players.P1.grave.some((card: Card) => card.gamecardId === nonGod.gamecardId);

  const andrea = cloneScriptCard(bt08R11 as Card, 'UNIT', { data: { placedByPromotionTurn: 6, placedByPromotionSourceCardId: 'PROMO' } } as any);
  const discard = testCard({ id: 'R11_DISCARD', fullName: 'R11 Discard', color: 'RED', faction: andrea.faction, cardlocation: 'HAND' });
  const targetA = testCard({ id: 'R11_NONGOD_A', fullName: 'R11 NonGod A', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });
  const targetB = testCard({ id: 'R11_NONGOD_B', fullName: 'R11 NonGod B', type: 'ITEM', godMark: false, cardlocation: 'ITEM' });
  const targetGod = testCard({ id: 'R11_GOD', fullName: 'R11 God', type: 'UNIT', godMark: true, cardlocation: 'UNIT' });
  const erosion = deckCards(3, 'R11_EROSION', 'RED').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any }));
  const stateB = game({
    hand: [discard],
    unitZone: [andrea, null, null, null, null, null],
    erosionFront: erosion,
  }, {
    unitZone: [targetA, targetGod, null, null, null, null],
    itemZone: [targetB],
  }, { turnCount: 6 });
  await ServerGameService.activateEffect(stateB, 'BOT', andrea.gamecardId, 0);
  if (stateB.pendingQuery?.context?.step !== 'MODE') return fail(name, `R11 expected mode, got ${stateB.pendingQuery?.context?.step}`);
  await answerPendingQuery(stateB, 'BOT', [optionIdByValue(stateB, 'NON_GOD')]);
  const r11Options = (stateB.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!r11Options.includes(targetA.gamecardId) || !r11Options.includes(targetB.gamecardId) || r11Options.includes(targetGod.gamecardId)) {
    return fail(name, `R11 options=${r11Options.join(',')}`);
  }
  await answerPendingQuery(stateB, 'BOT', [targetA.gamecardId, targetB.gamecardId]);
  if (stateB.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(stateB, 'BOT', [discard.gamecardId]);
  }
  if (stateB.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateB.phase}`);
  await ServerGameService.passConfrontation(stateB, stateB.priorityPlayerId);
  const r11Destroyed = stateB.players.P1.grave.filter((card: Card) =>
    [targetA.gamecardId, targetB.gamecardId].includes(card.gamecardId)
  ).length === 2;

  return r03Destroyed && r11Destroyed
    ? pass(name, `r03Destroyed=${r03Destroyed}, r11Destroyed=${r11Destroyed}`)
    : fail(name, `r03Destroyed=${r03Destroyed}, r11Destroyed=${r11Destroyed}`);
}

async function testRedAttackUnitGrants(): Promise<ScenarioResult> {
  const name = 'BT08-R05/R06 grant attacking opponent units after promotion or hand reveal';
  const hundred = cloneScriptCard(bt08R05 as Card, 'UNIT', { data: { placedByPromotionTurn: 6, placedByPromotionSourceCardId: 'PROMO' } } as any);
  const crimson = cloneScriptCard(bt08R06 as Card, 'UNIT', { data: { placedByPromotionTurn: 6, placedByPromotionSourceCardId: 'PROMO' } } as any);
  const ally = testCard({ id: 'R06_ALLY', fullName: 'R06 Ally', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });
  const stateA = game({
    unitZone: [hundred, crimson, ally, null, null, null],
  }, {}, { turnCount: 6 });
  EventEngine.recalculateContinuousEffects(stateA);
  const hundredCan = !!(hundred as any).data?.canAttackAnyUnit;
  const allyCan = !!(ally as any).data?.canAttackAnyUnit;

  const handCrimson = cloneScriptCard(bt08R06 as Card, 'HAND');
  const discard = testCard({ id: 'R06_RED_HAND', fullName: 'R06 Red Hand', color: 'RED', cardlocation: 'HAND' });
  const target = testCard({ id: 'R06_TARGET', fullName: 'R06 Target', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });
  const stateB = game({
    hand: [handCrimson, discard],
    unitZone: [target, null, null, null, null, null],
  });
  await ServerGameService.activateEffect(stateB, 'BOT', handCrimson.gamecardId, 1);
  await answerPendingQuery(stateB, 'BOT', [target.gamecardId]);
  if (stateB.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(stateB, 'BOT', [discard.gamecardId]);
  }
  if (stateB.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateB.phase}`);
  await ServerGameService.passConfrontation(stateB, stateB.priorityPlayerId);
  const handGranted = !!(target as any).data?.canAttackAnyUnit && (target as any).data?.canAttackAnyUnitUntilTurn === stateB.turnCount;

  return hundredCan && allyCan && handGranted
    ? pass(name, `hundred=${hundredCan}, ally=${allyCan}, handGranted=${handGranted}`)
    : fail(name, `hundred=${hundredCan}, ally=${allyCan}, handGranted=${handGranted}`);
}

async function testSoulDevourPowerAndDraw(): Promise<ScenarioResult> {
  const name = 'BT08-R07 sends own non-god as cost, boosts units, and draws at erosion 5-8';
  const devourer = cloneScriptCard(bt08R07 as Card, 'UNIT');
  const cost = testCard({ id: 'SOUL_COST', fullName: 'Soul Cost', type: 'UNIT', godMark: false, cardlocation: 'UNIT', basePower: 1500, power: 1500 });
  const draw = testCard({ id: 'SOUL_DRAW', fullName: 'Soul Draw', cardlocation: 'DECK' });
  const erosion = deckCards(5, 'SOUL_EROSION', 'RED').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any }));
  const state = game({
    deck: [draw],
    unitZone: [devourer, cost, null, null, null, null],
    erosionFront: erosion,
  });
  await activateAndResolveByOpponentPass(state, 'BOT', devourer, 0);
  await answerPendingQuery(state, 'BOT', [cost.gamecardId]);
  await confirmTrigger(state, 'BOT');
  const sent = state.players.BOT.grave.some((card: Card) => card.gamecardId === cost.gamecardId);
  const boosted = devourer.power === (devourer.basePower || 0) + 500;
  const drew = state.players.BOT.hand.some((card: Card) => card.gamecardId === draw.gamecardId);

  const lowDraw = testCard({ id: 'SOUL_LOW_DRAW', fullName: 'Soul Low Draw', cardlocation: 'DECK' });
  const lowDevourer = cloneScriptCard(bt08R07 as Card, 'UNIT', { gamecardId: 'SOUL_LOW_DEVOURER' });
  const lowCost = testCard({ id: 'SOUL_LOW_COST', fullName: 'Soul Low Cost', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });
  const lowState = game({
    deck: [lowDraw],
    unitZone: [lowDevourer, lowCost, null, null, null, null],
    erosionFront: deckCards(4, 'SOUL_LOW_EROSION', 'RED').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  await activateAndResolveByOpponentPass(lowState, 'BOT', lowDevourer, 0);
  await answerPendingQuery(lowState, 'BOT', [lowCost.gamecardId]);
  await confirmTrigger(lowState, 'BOT');
  const lowNoDraw = !lowState.players.BOT.hand.some((card: Card) => card.gamecardId === lowDraw.gamecardId);

  const effectDraw = testCard({ id: 'SOUL_EFFECT_DRAW', fullName: 'Soul Effect Draw', cardlocation: 'DECK' });
  const effectDevourer = cloneScriptCard(bt08R07 as Card, 'UNIT', { gamecardId: 'SOUL_EFFECT_DEVOURER' });
  const effectMoved = testCard({ id: 'SOUL_EFFECT_MOVED', fullName: 'Soul Effect Moved', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });
  const effectSource = testCard({ id: 'SOUL_EFFECT_SOURCE', fullName: 'Soul Effect Source', type: 'UNIT', cardlocation: 'UNIT' });
  const effectState = game({
    deck: [effectDraw],
    unitZone: [effectDevourer, effectMoved, null, null, null, null],
    erosionFront: deckCards(5, 'SOUL_EFFECT_EROSION', 'RED').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  }, {
    unitZone: [effectSource, null, null, null, null, null],
  });
  moveCard(effectState, 'BOT', effectMoved, 'GRAVE', effectSource);
  await confirmTrigger(effectState, 'BOT');
  const effectMoveNoDraw = !effectState.players.BOT.hand.some((card: Card) => card.gamecardId === effectDraw.gamecardId);

  return sent && boosted && drew && lowNoDraw && effectMoveNoDraw
    ? pass(name, `sent=${sent}, boosted=${boosted}, drew=${drew}, gated=${lowNoDraw}, effectNoDraw=${effectMoveNoDraw}`)
    : fail(name, `sent=${sent}, boosted=${boosted}, drew=${drew}, gated=${lowNoDraw}, effectNoDraw=${effectMoveNoDraw}`);
}

async function testThunderLeaderPowerSearch(): Promise<ScenarioResult> {
  const name = 'BT04-R07 searches Thunder when power reaches 3500';
  const leader = cloneScriptCard(bt04R07 as Card, 'UNIT');
  const story = cloneScriptCard(bt04R09 as Card, 'PLAY');
  const thunder = testCard({
    id: 'THUNDER_SEARCH',
    fullName: 'Thunder Search',
    type: 'UNIT',
    faction: leader.faction,
    cardlocation: 'DECK',
  });
  const state = game({
    deck: [thunder],
    unitZone: [leader, null, null, null, null, null],
    playZone: [story],
  });
  await story.effects?.[0]?.execute?.(story, state, state.players.BOT);
  await answerPendingQuery(state, 'BOT', [leader.gamecardId]);
  await confirmTrigger(state, 'BOT');
  const triggered = state.pendingQuery?.context?.effectId === '102060433_power_search';
  if (triggered) {
    await answerPendingQuery(state, 'BOT', [thunder.gamecardId]);
  }
  const searched = state.players.BOT.hand.some((card: Card) => card.gamecardId === thunder.gamecardId);

  const continuousLeader = cloneScriptCard(bt04R07 as Card, 'UNIT', {
    gamecardId: 'CONTINUOUS_THUNDER_LEADER',
    power: 2500,
    basePower: 2500,
  });
  const tami = cloneScriptCard(bt07R11 as Card, 'UNIT', { gamecardId: 'CONTINUOUS_TAMI' });
  const continuousThunder = testCard({
    id: 'THUNDER_CONTINUOUS_SEARCH',
    fullName: 'Thunder Continuous Search',
    type: 'UNIT',
    faction: continuousLeader.faction,
    cardlocation: 'DECK',
  });
  const continuousState = game({
    deck: [continuousThunder],
    unitZone: [continuousLeader, tami, null, null, null, null],
  });
  (continuousState as any)[`unitsSentFromFieldToGraveTurn_${continuousState.turnCount}_global`] = 1;

  EventEngine.recalculateContinuousEffects(continuousState);
  await confirmTrigger(continuousState, 'BOT');
  const continuousTriggered = continuousState.pendingQuery?.context?.effectId === '102060433_power_search';
  if (continuousTriggered) {
    await answerPendingQuery(continuousState, 'BOT', [continuousThunder.gamecardId]);
  }
  const continuousSearched = continuousState.players.BOT.hand.some((card: Card) => card.gamecardId === continuousThunder.gamecardId);

  return triggered && searched && continuousTriggered && continuousSearched
    ? pass(name, `triggered=${triggered}, searched=${searched}, continuous=${continuousTriggered}/${continuousSearched}`)
    : fail(name, `triggered=${triggered}, searched=${searched}, continuous=${continuousTriggered}/${continuousSearched}, pending=${continuousState.pendingQuery?.context?.effectId || state.pendingQuery?.context?.effectId || 'none'}`);
}

function testThunderWarriorRushAfterTamiBoost(): ScenarioResult {
  const name = 'BT07-R04 gains damage/rush after Tami+Rafa and Tami attack permission expires';
  const warrior = cloneScriptCard(bt07R04 as Card, 'UNIT');
  const tami = cloneScriptCard(bt07R11 as Card, 'UNIT');
  const rafa = cloneScriptCard(bt05R07 as Card, 'UNIT');
  const ally = testCard({ id: 'TAMI_ALLY', fullName: 'Tami Ally', type: 'UNIT', cardlocation: 'UNIT' });
  const state = game({
    unitZone: [warrior, tami, rafa, ally, null, null],
  });
  (state as any)[`unitsSentFromFieldToGraveTurn_${state.turnCount}_global`] = 4;

  EventEngine.recalculateContinuousEffects(state);

  const boostedByTamiAndRafa = warrior.power === (warrior.basePower || 0) + 1500;
  const thresholdApplied = warrior.damage === (warrior.baseDamage || 0) + 1 && warrior.isrush === true;
  const attackPermissionThisTurn = !!(ally as any).data?.canAttackAnyUnit;
  const activeStats = `${warrior.power}/${warrior.damage}`;
  const activeRush = !!warrior.isrush;

  state.turnCount += 1;
  EventEngine.recalculateContinuousEffects(state);
  const attackPermissionExpired = !(ally as any).data?.canAttackAnyUnit;

  return boostedByTamiAndRafa && thresholdApplied && attackPermissionThisTurn && attackPermissionExpired
    ? pass(name, `active=${activeStats}, rush=${activeRush}, any=${attackPermissionThisTurn}->expired:${attackPermissionExpired}`)
    : fail(name, `active=${activeStats}, base=${warrior.basePower}/${warrior.baseDamage}, rush=${activeRush}, any=${attackPermissionThisTurn}->expired:${attackPermissionExpired}`);
}

async function testPromotionEquipmentAndSquare(): Promise<ScenarioResult> {
  const name = 'BT08-R09 equips promoted unit and R10 protects first opponent-effect leave/draws';
  const badge = cloneScriptCard(bt08R09 as Card, 'ITEM');
  const promoted = testCard({
    id: 'EQUIP_PROMOTED',
    fullName: 'Equip Promoted',
    type: 'UNIT',
    faction: badge.faction,
    cardlocation: 'UNIT',
    basePower: 2000,
    power: 2000,
    baseDamage: 1,
    damage: 1,
    data: { placedByPromotionSourceCardId: 'PROMO', placedByPromotionTurn: 5 },
  } as any);
  const opponentSource = testCard({ id: 'OPP_EFFECT', fullName: 'Opponent Effect', type: 'UNIT', cardlocation: 'UNIT' });
  const stateA = game({
    unitZone: [promoted, null, null, null, null, null],
    itemZone: [badge],
  }, {
    unitZone: [opponentSource, null, null, null, null, null],
  }, { turnCount: 6 });
  await activateAndResolveByOpponentPass(stateA, 'BOT', badge, 0);
  await answerPendingQuery(stateA, 'BOT', [promoted.gamecardId]);
  EventEngine.recalculateContinuousEffects(stateA);
  const equipped = badge.equipTargetId === promoted.gamecardId;
  const buffed = promoted.power === 2500 && promoted.damage === 2;
  moveCard(stateA, 'BOT', promoted, 'GRAVE', opponentSource);
  const protectedByBadge = stateA.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === promoted.gamecardId);

  const square = cloneScriptCard(bt08R10 as Card, 'ITEM');
  const cityPromoted = testCard({
    id: 'CITY_PROMOTED',
    fullName: 'City Promoted',
    type: 'UNIT',
    faction: square.faction,
    cardlocation: 'UNIT',
    data: { placedByPromotionSourceCardId: 'PROMO', placedByPromotionTurn: 6 },
  } as any);
  const draw = testCard({ id: 'CITY_DRAW', fullName: 'City Draw', cardlocation: 'DECK' });
  const erosion = deckCards(4, 'CITY_EROSION', 'RED').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any }));
  const stateB = game({
    deck: [draw],
    unitZone: [cityPromoted, null, null, null, null, null],
    itemZone: [square],
    erosionFront: erosion,
  }, {
    unitZone: [opponentSource, null, null, null, null, null],
  }, { turnCount: 6 });
  EventEngine.recalculateContinuousEffects(stateB);
  moveCard(stateB, 'BOT', cityPromoted, 'GRAVE', opponentSource);
  const protectedBySquare = stateB.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === cityPromoted.gamecardId);
  moveCard(stateB, 'BOT', cityPromoted, 'GRAVE', opponentSource);
  const secondLeft = stateB.players.BOT.grave.some((card: Card) => card.gamecardId === cityPromoted.gamecardId);

  const wrongFactionPromoted = testCard({
    id: 'CITY_WRONG_FACTION',
    fullName: 'City Wrong Faction',
    type: 'UNIT',
    faction: 'Other',
    cardlocation: 'UNIT',
    data: { placedByPromotionSourceCardId: 'PROMO', placedByPromotionTurn: 6 },
  } as any);
  const stateNoIleu = game({
    unitZone: [wrongFactionPromoted, null, null, null, null, null],
    itemZone: [cloneScriptCard(bt08R10 as Card, 'ITEM', { gamecardId: 'CITY_SQUARE_NO_ILEU' })],
  }, {
    unitZone: [opponentSource, null, null, null, null, null],
  }, { turnCount: 6 });
  EventEngine.recalculateContinuousEffects(stateNoIleu);
  moveCard(stateNoIleu, 'BOT', wrongFactionPromoted, 'GRAVE', opponentSource);
  const noIleuNoProtect = stateNoIleu.players.BOT.grave.some((card: Card) => card.gamecardId === wrongFactionPromoted.gamecardId);

  const entered = testCard({
    id: 'CITY_ENTERED',
    fullName: 'City Entered',
    type: 'UNIT',
    faction: square.faction,
    cardlocation: 'DECK',
    data: { placedByPromotionSourceCardId: 'PROMO', placedByPromotionTurn: 6 },
  } as any);
  stateB.players.BOT.deck.push(entered);
  moveCard(stateB, 'BOT', entered, 'UNIT', square);
  await confirmTrigger(stateB, 'BOT');
  const drew = stateB.players.BOT.hand.some((card: Card) => card.gamecardId === draw.gamecardId);

  const promotedByStory = testCard({
    id: 'CITY_STORY_PROMOTED',
    fullName: 'City Story Promoted',
    type: 'UNIT',
    faction: square.faction,
    acValue: 2,
    cardlocation: 'HAND',
  });
  const promotionSource = testCard({
    id: 'CITY_STORY_SOURCE',
    fullName: 'City Story Source',
    type: 'UNIT',
    faction: square.faction,
    acValue: 1,
    cardlocation: 'UNIT',
  });
  const promotionStory = cloneScriptCard(bt08R08 as Card, 'PLAY', { gamecardId: 'CITY_PROMOTION_STORY' });
  const realDraw = testCard({ id: 'CITY_REAL_DRAW', fullName: 'City Real Draw', cardlocation: 'DECK' });
  const storyState = game({
    deck: [realDraw],
    hand: [promotedByStory],
    unitZone: [promotionSource, null, null, null, null, null],
    itemZone: [cloneScriptCard(bt08R10 as Card, 'ITEM', { gamecardId: 'CITY_REAL_SQUARE' })],
    playZone: [promotionStory],
    erosionFront: deckCards(4, 'CITY_REAL_EROSION', 'RED').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  await promotionStory.effects?.[0]?.execute?.(promotionStory, storyState, storyState.players.BOT);
  await answerPendingQuery(storyState, 'BOT', [promotionSource.gamecardId]);
  await answerPendingQuery(storyState, 'BOT', [promotedByStory.gamecardId]);
  await confirmTrigger(storyState, 'BOT');
  const realPromotionDrew = storyState.players.BOT.hand.some((card: Card) => card.gamecardId === realDraw.gamecardId);

  return equipped && buffed && protectedByBadge && protectedBySquare && secondLeft && noIleuNoProtect && drew && realPromotionDrew
    ? pass(name, `equipped=${equipped}, buffed=${buffed}, badge=${protectedByBadge}, square=${protectedBySquare}, noIleu=${noIleuNoProtect}, second=${secondLeft}, drew=${drew}, realDrew=${realPromotionDrew}`)
    : fail(name, `equipped=${equipped}, buffed=${buffed}, badge=${protectedByBadge}, square=${protectedBySquare}, noIleu=${noIleuNoProtect}, second=${secondLeft}, drew=${drew}, realDrew=${realPromotionDrew}`);
}

async function testGreenSilverMusicDestroyAndBonuses(): Promise<ScenarioResult> {
  const name = 'BT08-G01/G03/G04/G05/G06 silver music destroy, stats, combat and awaken gate';
  const conductor = cloneScriptCard(bt08G01 as Card, 'UNIT');
  const costA = testCard({ id: 'G01_COST_A', fullName: 'Silver Cost A', type: 'UNIT', faction: '瑟诺布', cardlocation: 'UNIT' });
  const costB = testCard({ id: 'G01_COST_B', fullName: 'Silver Cost B', type: 'UNIT', faction: '瑟诺布', cardlocation: 'UNIT' });
  const target = testCard({ id: 'G01_TARGET', fullName: 'G01 Target', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });
  const stateA = game({
    unitZone: [conductor, costA, costB, null, null, null],
  }, {
    unitZone: [target, null, null, null, null, null],
  });
  await ServerGameService.activateEffect(stateA, 'BOT', conductor.gamecardId, 0);
  await answerPendingQuery(stateA, 'BOT', [target.gamecardId]);
  if (stateA.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateA.phase}`);
  await ServerGameService.passConfrontation(stateA, stateA.priorityPlayerId);
  await answerPendingQuery(stateA, 'BOT', [costA.gamecardId, costB.gamecardId]);
  const conductorDestroyed = stateA.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId) &&
    stateA.players.BOT.grave.filter((card: Card) => [costA.gamecardId, costB.gamecardId].includes(card.gamecardId)).length === 2;

  const dancer = cloneScriptCard(bt08G03 as Card, 'UNIT', { baseAnnihilation: false, isAnnihilation: false });
  const silverA = testCard({ id: 'G03_A', fullName: '银乐 A', type: 'UNIT', faction: '瑟诺布', cardlocation: 'UNIT' });
  const silverB = testCard({ id: 'G03_B', fullName: '银乐 B', type: 'UNIT', faction: '瑟诺布', cardlocation: 'UNIT' });
  const erosion = deckCards(5, 'G03_EROSION', 'GREEN').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any }));
  const stateB = game({
    unitZone: [dancer, silverA, silverB, null, null, null],
    erosionFront: erosion,
  });
  EventEngine.recalculateContinuousEffects(stateB);
  const dancerBuffed = dancer.power === (dancer.basePower || 0) + 1000 &&
    dancer.damage === (dancer.baseDamage || 0) + 1 &&
    dancer.isAnnihilation === true;
  const lowDancer = cloneScriptCard(bt08G03 as Card, 'UNIT', {
    gamecardId: 'G03_LOW_DANCER',
    baseAnnihilation: false,
    isAnnihilation: false
  });
  const stateLowDancer = game({
    unitZone: [
      lowDancer,
      testCard({ id: 'G03_LOW_A', fullName: '银乐 Low A', type: 'UNIT', faction: '瑟诺布', cardlocation: 'UNIT' }),
      testCard({ id: 'G03_LOW_B', fullName: '银乐 Low B', type: 'UNIT', faction: '瑟诺布', cardlocation: 'UNIT' }),
      null,
      null,
      null
    ],
    erosionFront: deckCards(4, 'G03_LOW_EROSION', 'GREEN').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  EventEngine.recalculateContinuousEffects(stateLowDancer);
  const dancerGated = lowDancer.power === (lowDancer.basePower || 0) &&
    lowDancer.damage === (lowDancer.baseDamage || 0) &&
    lowDancer.isAnnihilation !== true;

  const girls = cloneScriptCard(bt08G04 as Card, 'UNIT');
  const stateC = game({
    unitZone: [girls, null, null, null, null, null],
    erosionBack: deckCards(3, 'G04_EROSION_BACK', 'GREEN').map(card => ({ ...card, cardlocation: 'EROSION_BACK' as any })),
  });
  EventEngine.recalculateContinuousEffects(stateC);
  const girlsBuffed = girls.power === (girls.basePower || 0) + 1000 && girls.damage === (girls.baseDamage || 0) + 1;
  const lowGirls = cloneScriptCard(bt08G04 as Card, 'UNIT', { gamecardId: 'G04_LOW_GIRLS' });
  const stateLowGirls = game({
    unitZone: [lowGirls, null, null, null, null, null],
    erosionFront: deckCards(3, 'G04_LOW_EROSION', 'GREEN').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  EventEngine.recalculateContinuousEffects(stateLowGirls);
  const girlsGated = lowGirls.power === (lowGirls.basePower || 0) &&
    lowGirls.damage === (lowGirls.baseDamage || 0);
  const frontOnlyGirls = cloneScriptCard(bt08G04 as Card, 'UNIT', { gamecardId: 'G04_FRONT_ONLY_GIRLS' });
  const stateFrontOnlyGirls = game({
    unitZone: [frontOnlyGirls, null, null, null, null, null],
    erosionFront: deckCards(3, 'G04_FRONT_ONLY_EROSION', 'GREEN').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  EventEngine.recalculateContinuousEffects(stateFrontOnlyGirls);
  const girlsFrontOnlyGated = frontOnlyGirls.power === (frontOnlyGirls.basePower || 0) &&
    frontOnlyGirls.damage === (frontOnlyGirls.baseDamage || 0);
  const ownDestroyTarget = testCard({ id: 'G04_OWN_DESTROY_TARGET', fullName: 'G04 Own Target', type: 'UNIT', cardlocation: 'UNIT' });
  const opponentDestroyer = testCard({ id: 'G04_DESTROYER', fullName: 'G04 Destroyer', type: 'UNIT', cardlocation: 'UNIT' });
  const destroyEffect = {
    id: 'G04_DESTROY_EFFECT',
    type: 'ACTIVATE',
    description: '选择你战场上的1张卡破坏。'
  } as any;
  const counterState = game({
    unitZone: [cloneScriptCard(bt08G04 as Card, 'UNIT', { gamecardId: 'G04_COUNTER_GIRLS' }), ownDestroyTarget, null, null, null, null],
  }, {
    unitZone: [opponentDestroyer, null, null, null, null, null],
  }, {
    phase: 'COUNTERING',
    counterStack: [{
      type: 'EFFECT',
      ownerUid: 'P1',
      card: opponentDestroyer,
      effect: destroyEffect,
      effectIndex: 0,
      declaredTargets: [{ gamecardId: ownDestroyTarget.gamecardId, ownerUid: 'BOT', zone: 'UNIT' }],
      timestamp: Date.now(),
    }],
  });
  const counterGirls = counterState.players.BOT.unitZone[0]!;
  const counterValid = ServerGameService.checkEffectLimitsAndReqs(counterState, 'BOT', counterGirls, counterGirls.effects![0], 'UNIT').valid;
  await counterGirls.effects?.[0]?.execute?.(counterGirls, counterState, counterState.players.BOT);
  const counteredOwnDestroy = counterValid && counterState.counterStack[0].isNegated === true;
  const opponentTarget = testCard({ id: 'G04_OPP_TARGET', fullName: 'G04 Opp Target', type: 'UNIT', cardlocation: 'UNIT' });
  const invalidCounterState = game({
    unitZone: [cloneScriptCard(bt08G04 as Card, 'UNIT', { gamecardId: 'G04_INVALID_COUNTER_GIRLS' }), null, null, null, null, null],
  }, {
    unitZone: [opponentDestroyer, opponentTarget, null, null, null, null],
  }, {
    phase: 'COUNTERING',
    counterStack: [{
      type: 'EFFECT',
      ownerUid: 'P1',
      card: opponentDestroyer,
      effect: destroyEffect,
      effectIndex: 0,
      declaredTargets: [{ gamecardId: opponentTarget.gamecardId, ownerUid: 'P1', zone: 'UNIT' }],
      timestamp: Date.now(),
    }],
  });
  const invalidGirls = invalidCounterState.players.BOT.unitZone[0]!;
  const rejectsNonOwnDestroy = !ServerGameService.checkEffectLimitsAndReqs(invalidCounterState, 'BOT', invalidGirls, invalidGirls.effects![0], 'UNIT').valid;

  const yasha = cloneScriptCard(bt08G05 as Card, 'UNIT');
  const opponent = testCard({ id: 'G05_OPP', fullName: 'G05 Opponent', type: 'UNIT', godMark: false, cardlocation: 'UNIT', power: 3000, basePower: 3000 });
  const stateD = game({
    unitZone: [yasha, null, null, null, null, null],
  }, {
    unitZone: [opponent, null, null, null, null, null],
  }, {
    battleState: { attackers: [yasha.gamecardId], defender: opponent.gamecardId },
    phase: 'DAMAGE_CALCULATION',
  });
  EventEngine.recalculateContinuousEffects(stateD);
  const battleZero = opponent.power === 0;

  const gladiator = cloneScriptCard(bt08G06 as Card, 'UNIT');
  const returnSource = testCard({ id: 'G06_RETURN_SOURCE', fullName: 'Return Source', type: 'UNIT', cardlocation: 'UNIT' });
  const stateE = game({ unitZone: [gladiator, null, null, null, null, null] }, {
    unitZone: [returnSource, null, null, null, null, null],
  });
  EventEngine.recalculateContinuousEffects(stateE);
  const gated = (gladiator as any).data?.cannotAttackThisTurn === stateE.turnCount &&
    (gladiator as any).data?.cannotDefendTurn === stateE.turnCount;
  const returnedByEffect = ServerGameService.moveCard(stateE, 'BOT', 'UNIT', 'BOT', 'DECK', gladiator.gamecardId, {
    isEffect: true,
    insertAtBottom: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: returnSource.gamecardId,
  });
  const preventedDeckReturn = returnedByEffect === false &&
    stateE.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === gladiator.gamecardId) &&
    !stateE.players.BOT.deck.some((card: Card) => card.gamecardId === gladiator.gamecardId);
  ensureData(gladiator).awakenedTurn = stateE.turnCount;
  EventEngine.recalculateContinuousEffects(stateE);
  const awakenedAllowed = (gladiator as any).data?.cannotAttackThisTurn !== stateE.turnCount;

  return conductorDestroyed && dancerBuffed && dancerGated && girlsBuffed && girlsGated && girlsFrontOnlyGated && counteredOwnDestroy && rejectsNonOwnDestroy && battleZero && gated && preventedDeckReturn && awakenedAllowed
    ? pass(name, `destroy=${conductorDestroyed}, dancer=${dancerBuffed}/${dancerGated}, girls=${girlsBuffed}/${girlsGated}/${girlsFrontOnlyGated}/${counteredOwnDestroy}/${rejectsNonOwnDestroy}, battle=${battleZero}, gate=${gated}, return=${preventedDeckReturn}`)
    : fail(name, `destroy=${conductorDestroyed}, dancer=${dancerBuffed}/${dancerGated}, girls=${girlsBuffed}/${girlsGated}/${girlsFrontOnlyGated}/${counteredOwnDestroy}/${rejectsNonOwnDestroy}, battle=${battleZero}, gate=${gated}, return=${preventedDeckReturn}, awakened=${awakenedAllowed}`);
}

async function testGreenResonanceAndSilverRecovery(): Promise<ScenarioResult> {
  const name = 'BT08-G02/G08/G09 resonance and silver music recovery';
  const singer = cloneScriptCard(bt08G02 as Card, 'UNIT');
  const cello = cloneScriptCard(bt08G09 as Card, 'GRAVE');
  const recover = testCard({ id: 'G09_RECOVER', fullName: '瑟诺布 Recover', type: 'UNIT', faction: '瑟诺布', acValue: 3, cardlocation: 'GRAVE' });
  const discard = testCard({ id: 'G09_DISCARD', fullName: 'G09 Discard', cardlocation: 'HAND' });
  const stateA = game({
    hand: [discard],
    unitZone: [singer, null, null, null, null, null],
    grave: [cello, recover],
  });
  await ServerGameService.activateEffect(stateA, 'BOT', singer.gamecardId, 0);
  await answerPendingQuery(stateA, 'BOT', [cello.gamecardId]);
  if (stateA.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateA.phase}`);
  await ServerGameService.passConfrontation(stateA, stateA.priorityPlayerId);
  await confirmTrigger(stateA, 'BOT');
  if (stateA.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(stateA, 'BOT', [discard.gamecardId]);
  }
  if (!stateA.pendingQuery) {
    await ServerGameService.checkTriggeredEffects(stateA);
  }
  await answerPendingQuery(stateA, 'BOT', [recover.gamecardId]);
  const resonanceRecovered = stateA.players.BOT.exile.some((card: Card) => card.gamecardId === cello.gamecardId) &&
    stateA.players.BOT.hand.some((card: Card) => card.gamecardId === recover.gamecardId);

  const song = cloneScriptCard(bt08G08 as Card, 'PLAY');
  const silver = testCard({ id: 'G08_SILVER', fullName: '银乐回收者', type: 'UNIT', godMark: false, cardlocation: 'DECK' });
  const fillerA = testCard({ id: 'G08_FILL_A', fullName: 'Filler A', cardlocation: 'DECK' });
  const fillerB = testCard({ id: 'G08_FILL_B', fullName: 'Filler B', cardlocation: 'DECK' });
  const erosionA = testCard({ id: 'G08_EROSION_A', fullName: 'G08 Erosion A', cardlocation: 'EROSION_FRONT', displayState: 'FRONT_UPRIGHT' });
  const erosionB = testCard({ id: 'G08_EROSION_B', fullName: 'G08 Erosion B', cardlocation: 'EROSION_FRONT', displayState: 'FRONT_UPRIGHT' });
  const stateB = game({
    deck: [fillerA, fillerB, silver],
    playZone: [song],
    erosionFront: [erosionA, erosionB],
  });
  await song.effects?.[0]?.execute?.(song, stateB, stateB.players.BOT);
  if (stateB.pendingQuery?.context?.step !== 'EROSION_COST' || stateB.pendingQuery.maxSelections !== 2) {
    return fail(name, `expected G08 erosion cost query, got ${stateB.pendingQuery?.context?.step || 'none'}/${stateB.pendingQuery?.maxSelections}`);
  }
  await answerPendingQuery(stateB, 'BOT', [erosionA.gamecardId, erosionB.gamecardId]);
  if (stateB.pendingQuery?.context?.step !== 'RECOVER') {
    return fail(name, `expected G08 recovery query, got ${stateB.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(stateB, 'BOT', [silver.gamecardId]);
  const songRecovered = stateB.players.BOT.hand.some((card: Card) => card.gamecardId === silver.gamecardId) &&
    stateB.players.BOT.grave.some((card: Card) => card.gamecardId === fillerB.gamecardId) &&
    stateB.players.BOT.grave.some((card: Card) => card.gamecardId === erosionA.gamecardId) &&
    stateB.players.BOT.grave.some((card: Card) => card.gamecardId === erosionB.gamecardId) &&
    stateB.players.BOT.grave.length === 3;

  const celloItem = cloneScriptCard(bt08G09 as Card, 'ITEM');
  const silverDeckA = testCard({ id: 'G09_SILVER_A', fullName: '银乐 Alpha', cardlocation: 'DECK' });
  const silverDeckB = testCard({ id: 'G09_SILVER_B', fullName: '银乐 Beta', cardlocation: 'DECK' });
  const silverDeckSame = testCard({ id: 'G09_SILVER_A2', fullName: '银乐 Alpha', cardlocation: 'DECK' });
  const stateC = game({
    itemZone: [celloItem],
    deck: [silverDeckA, silverDeckSame, silverDeckB],
  });
  await activateAndResolveByOpponentPass(stateC, 'BOT', celloItem, 0);
  await answerPendingQuery(stateC, 'BOT', [silverDeckA.gamecardId]);
  const secondOptions = (stateC.pendingQuery?.options || []).map((option: any) => option.card.gamecardId);
  if (secondOptions.includes(silverDeckSame.gamecardId) || !secondOptions.includes(silverDeckB.gamecardId)) {
    return fail(name, `G09 second options=${secondOptions.join(',')}`);
  }
  await answerPendingQuery(stateC, 'BOT', [silverDeckB.gamecardId]);
  const celloMilled = stateC.players.BOT.grave.filter((card: Card) =>
    [silverDeckA.gamecardId, silverDeckB.gamecardId].includes(card.gamecardId)
  ).length === 2 && celloItem.isExhausted;

  return resonanceRecovered && songRecovered && celloMilled
    ? pass(name, `resonance=${resonanceRecovered}, song=${songRecovered}, cello=${celloMilled}`)
    : fail(name, `resonance=${resonanceRecovered}, song=${songRecovered}, cello=${celloMilled}`);
}

async function testGreenAwakenStoryAndSquare(): Promise<ScenarioResult> {
  const name = 'BT08-G07/G10 awaken story, deck return count, and Shinboku recruit';
  const ritual = cloneScriptCard(bt08G07 as Card, 'PLAY');
  const awakenDeck = cloneScriptCard(bt08G06 as Card, 'DECK', { gamecardId: 'G07_AWAKEN_DECK' });
  const trueAwakenDeck = cloneScriptCard(bt07G05 as Card, 'DECK', { gamecardId: 'G07_TRUE_AWAKEN_DECK' });
  const millA = testCard({ id: 'G07_MILL_A', cardlocation: 'DECK' });
  const millB = testCard({ id: 'G07_MILL_B', cardlocation: 'DECK' });
  const millC = testCard({ id: 'G07_MILL_C', cardlocation: 'DECK' });
  const stateA = game({
    playZone: [ritual],
    deck: [awakenDeck, trueAwakenDeck, millA, millB, millC],
  });
  await ritual.effects?.[0]?.execute?.(ritual, stateA, stateA.players.BOT);
  await answerPendingQuery(stateA, 'BOT', [optionIdByValue(stateA, 'PUT_AWAKEN')]);
  const ritualAwakenOptions = (stateA.pendingQuery?.options || []).map((option: any) => option.card.gamecardId);
  const ritualOnlyTrueAwakenTargets = ritualAwakenOptions.includes(trueAwakenDeck.gamecardId) &&
    !ritualAwakenOptions.includes(awakenDeck.gamecardId);
  await answerPendingQuery(stateA, 'BOT', [trueAwakenDeck.gamecardId]);
  const ritualPut = ritualOnlyTrueAwakenTargets &&
    stateA.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === trueAwakenDeck.gamecardId) &&
    stateA.players.BOT.grave.length === 3;

  const square = cloneScriptCard(bt08G10 as Card, 'ITEM');
  const awakened = testCard({ id: 'G10_AWAKENED', fullName: 'Awakened', type: 'UNIT', cardlocation: 'UNIT', baseDamage: 1, damage: 1, data: { awakenedTurn: 6 } } as any);
  const returnedA = testCard({ id: 'G10_RET_A', fullName: 'Returned A', type: 'UNIT', cardlocation: 'UNIT' });
  const returnedB = testCard({ id: 'G10_RET_B', fullName: 'Returned B', type: 'UNIT', cardlocation: 'UNIT' });
  const recruit = testCard({ id: 'G10_RECRUIT', fullName: '神木森 Recruit', type: 'UNIT', faction: '神木森', godMark: false, cardlocation: 'DECK' });
  const payUnit = testCard({ id: 'G10_PAY', fullName: 'Pay Unit', type: 'UNIT', cardlocation: 'UNIT' });
  const stateB = game({
    itemZone: [square],
    unitZone: [awakened, returnedA, returnedB, payUnit, null, null],
    deck: [recruit],
    erosionFront: deckCards(2, 'G10_EROSION', 'GREEN').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  EventEngine.recalculateContinuousEffects(stateB);
  const damageBuff = awakened.damage === 2;
  moveCard(stateB, 'BOT', returnedA, 'DECK', square, { insertAtBottom: true });
  moveCard(stateB, 'BOT', returnedB, 'DECK', square, { insertAtBottom: true });
  EventEngine.dispatchEvent(stateB, { type: 'TURN_END' as any, playerUid: 'BOT' });
  await confirmTrigger(stateB, 'BOT');
  if (stateB.pendingQuery?.type === 'SELECT_PAYMENT') {
    await answerPendingQuery(stateB, 'BOT', [JSON.stringify({ exhaustUnitIds: [payUnit.gamecardId] })]);
  }
  await answerPendingQuery(stateB, 'BOT', [recruit.gamecardId]);
  const recruited = stateB.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === recruit.gamecardId);

  return ritualPut && damageBuff && recruited
    ? pass(name, `ritual=${ritualPut}, damage=${damageBuff}, recruited=${recruited}`)
    : fail(name, `ritual=${ritualPut}, damage=${damageBuff}, recruited=${recruited}`);
}

async function testGreenG11ResonanceModes(): Promise<ScenarioResult> {
  const name = 'BT08-G11 silences on Sernobu god resonance and revives silver music';
  const singer = cloneScriptCard(bt08G02 as Card, 'UNIT');
  const sharo = cloneScriptCard(bt08G11 as Card, 'UNIT');
  const godCost = testCard({ id: 'G11_GOD_COST', fullName: 'Sernobu God Cost', type: 'UNIT', faction: '瑟诺布', godMark: true, cardlocation: 'GRAVE' });
  const opponent = testCard({ id: 'G11_OPP', fullName: 'Opponent Unit', type: 'UNIT', cardlocation: 'UNIT' });
  const stateA = game({
    unitZone: [singer, sharo, null, null, null, null],
    grave: [godCost],
  }, {
    unitZone: [opponent, null, null, null, null, null],
  });
  await ServerGameService.activateEffect(stateA, 'BOT', singer.gamecardId, 0);
  await answerPendingQuery(stateA, 'BOT', [godCost.gamecardId]);
  if (stateA.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateA.phase}`);
  await ServerGameService.passConfrontation(stateA, stateA.priorityPlayerId);
  await confirmTrigger(stateA, 'BOT');
  await answerPendingQuery(stateA, 'BOT', [opponent.gamecardId]);
  const silencedThisTurn = ServerGameService.isFullEffectSilencedThisTurn(stateA, opponent);
  const markedThisTurn = stateA.players.BOT.markedUnitAttackTarget === opponent.gamecardId &&
    !!(singer as any).data?.canAttackAnyUnit;
  await ServerGameService.finishTurnTransition(stateA);
  const silencedOnOpponentTurn = stateA.turnCount === 7 &&
    stateA.players.P1.isTurn &&
    ServerGameService.isFullEffectSilencedThisTurn(stateA, opponent);
  await ServerGameService.finishTurnTransition(stateA);
  const silenceExpiredAfterOpponentTurn = stateA.turnCount === 8 &&
    stateA.players.BOT.isTurn &&
    !ServerGameService.isFullEffectSilencedThisTurn(stateA, opponent) &&
    (opponent as any).data?.fullEffectSilencedTurn === undefined;
  const silencedAndMarked = silencedThisTurn &&
    markedThisTurn &&
    silencedOnOpponentTurn &&
    silenceExpiredAfterOpponentTurn;

  const selfSharo = cloneScriptCard(bt08G11 as Card, 'GRAVE');
  const silver = testCard({ id: 'G11_SILVER', fullName: '银乐 Revive', type: 'UNIT', cardlocation: 'GRAVE' });
  const discard = testCard({ id: 'G11_DISCARD', fullName: 'G11 Discard', cardlocation: 'HAND' });
  const source = cloneScriptCard(bt08G02 as Card, 'UNIT', { gamecardId: 'G11_SOURCE' });
  const stateB = game({
    hand: [discard],
    unitZone: [source, null, null, null, null, null],
    grave: [selfSharo, silver],
    erosionFront: deckCards(5, 'G11_EROSION', 'GREEN').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  await ServerGameService.activateEffect(stateB, 'BOT', source.gamecardId, 0);
  await answerPendingQuery(stateB, 'BOT', [selfSharo.gamecardId]);
  if (stateB.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateB.phase}`);
  await ServerGameService.passConfrontation(stateB, stateB.priorityPlayerId);
  await confirmTrigger(stateB, 'BOT');
  if (stateB.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(stateB, 'BOT', [discard.gamecardId]);
  }
  await answerPendingQuery(stateB, 'BOT', [silver.gamecardId]);
  const revived = stateB.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === silver.gamecardId);

  return silencedAndMarked && revived
    ? pass(name, `silenced=${silencedThisTurn}/${silencedOnOpponentTurn}/${silenceExpiredAfterOpponentTurn}, revived=${revived}`)
    : fail(name, `silenced=${silencedThisTurn}/${silencedOnOpponentTurn}/${silenceExpiredAfterOpponentTurn}, marked=${markedThisTurn}, revived=${revived}`);
}

async function testBlueWealthStealRecoverAndStory(): Promise<ScenarioResult> {
  const name = 'BT08-B01/B02/B07 wealth steal, dream recovery, and story modes';
  const branch = cloneScriptCard(bt08B01 as Card, 'UNIT');
  const jeweler = cloneScriptCard(bt08B02 as Card, 'UNIT');
  const wealthSupport = cloneScriptCard(bt08B01 as Card, 'UNIT', { gamecardId: 'B01_WEALTH_SUPPORT' });
  const discardA = testCard({ id: 'B01_DISCARD_A', fullName: 'B01 Discard A', cardlocation: 'HAND' });
  const discardB = testCard({ id: 'B01_DISCARD_B', fullName: 'B01 Discard B', cardlocation: 'HAND' });
  const discardC = testCard({ id: 'B01_DISCARD_C', fullName: 'B01 Discard C', cardlocation: 'HAND' });
  const target = testCard({ id: 'B01_TARGET', fullName: 'B01 Target', type: 'UNIT', godMark: false, acValue: 3, cardlocation: 'UNIT' });
  const godTarget = testCard({ id: 'B01_GOD', fullName: 'B01 God', type: 'UNIT', godMark: true, acValue: 3, cardlocation: 'UNIT' });
  const stateA = game({
    hand: [discardA, discardB, discardC],
    unitZone: [branch, jeweler, wealthSupport, null, null, null],
    erosionFront: deckCards(3, 'B01_EROSION', 'BLUE').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  }, {
    unitZone: [target, godTarget, null, null, null, null],
  });
  EventEngine.recalculateContinuousEffects(stateA);
  const wealthInRange = wealthCount(stateA.players.BOT, stateA) === 3;
  const lowWealthBranch = cloneScriptCard(bt08B01 as Card, 'UNIT', { gamecardId: 'B01_LOW_BRANCH' });
  const stateLowWealth = game({
    unitZone: [
      lowWealthBranch,
      cloneScriptCard(bt08B02 as Card, 'UNIT', { gamecardId: 'B01_LOW_JEWELER' }),
      null,
      null,
      null,
      null
    ],
    erosionFront: deckCards(2, 'B01_LOW_EROSION', 'BLUE').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  EventEngine.recalculateContinuousEffects(stateLowWealth);
  const wealthGated = wealthCount(stateLowWealth.players.BOT, stateLowWealth) === 1;
  await activateAndResolveByOpponentPass(stateA, 'BOT', branch, 1, { autoDeclare: false });
  if (stateA.pendingQuery?.context?.effectId !== '104020410_take_opponent_unit') {
    return fail(name, `expected B01 target query, got ${stateA.pendingQuery?.context?.effectId || 'none'}`);
  }
  const stealOptions = (stateA.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!stealOptions.includes(target.gamecardId) || stealOptions.includes(godTarget.gamecardId)) {
    return fail(name, `B01 options=${stealOptions.join(',')}`);
  }
  await answerPendingQuery(stateA, 'BOT', [target.gamecardId]);
  if (stateA.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(stateA, 'BOT', [discardA.gamecardId, discardB.gamecardId, discardC.gamecardId]);
  }
  if (stateA.phase === 'COUNTERING') {
    await ServerGameService.passConfrontation(stateA, stateA.priorityPlayerId);
  }
  const stole = stateA.players.BOT.hand.some((card: Card) => card.fullName === target.fullName);

  const dream = cloneScriptCard(bt08B07 as Card, 'GRAVE');
  const stateB = game({
    unitZone: [
      cloneScriptCard(bt08B02 as Card, 'UNIT', { gamecardId: 'B02_SELF_TRIGGER' }),
      cloneScriptCard(bt08B01 as Card, 'UNIT', { gamecardId: 'B02_WEALTH_A' }),
      cloneScriptCard(bt08B01 as Card, 'UNIT', { gamecardId: 'B02_WEALTH_B' }),
      null,
      null,
      null
    ],
    grave: [dream],
    erosionFront: deckCards(3, 'B02_EROSION', 'BLUE').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  EventEngine.recalculateContinuousEffects(stateB);
  EventEngine.dispatchEvent(stateB, { type: 'TURN_END' as any, playerUid: 'BOT' });
  await confirmTrigger(stateB, 'BOT');
  if (stateB.pendingQuery?.context?.effectId !== '104020411_recover_money_dream') {
    return fail(name, `expected B02 recovery query, got ${stateB.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(stateB, 'BOT', [dream.gamecardId]);
  const recoveredDream = stateB.players.BOT.hand.some((card: Card) => card.fullName === '金钱美梦');

  const story = cloneScriptCard(bt08B07 as Card, 'PLAY');
  const wealthA = cloneScriptCard(bt08B01 as Card, 'UNIT');
  const wealthB = cloneScriptCard(bt08B02 as Card, 'UNIT');
  const drawA = testCard({ id: 'B07_DRAW_A', fullName: 'B07 Draw A', cardlocation: 'DECK' });
  const drawB = testCard({ id: 'B07_DRAW_B', fullName: 'B07 Draw B', cardlocation: 'DECK' });
  const stateC = game({
    hand: [testCard({ id: 'B07_HAND', fullName: 'B07 Hand', cardlocation: 'HAND' })],
    deck: [drawA, drawB],
    unitZone: [wealthA, wealthB, null, null, null, null],
    playZone: [story],
    erosionFront: deckCards(3, 'B07_EROSION', 'BLUE').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  EventEngine.recalculateContinuousEffects(stateC);
  await story.effects?.[0]?.execute?.(story, stateC, stateC.players.BOT);
  await answerPendingQuery(stateC, 'BOT', [optionIdByValue(stateC, 'DRAW_TO_FOUR')]);
  const drewToFourOrDeckEmpty = stateC.players.BOT.hand.length === 3 && stateC.players.BOT.deck.length === 0;

  return wealthInRange && wealthGated && stole && recoveredDream && drewToFourOrDeckEmpty
    ? pass(name, `wealth=${wealthInRange}/${wealthGated}, stole=${stole}, recovered=${recoveredDream}, drew=${drewToFourOrDeckEmpty}`)
    : fail(name, `wealth=${wealthInRange}/${wealthGated}, stole=${stole}, recovered=${recoveredDream}, drew=${drewToFourOrDeckEmpty}`);
}

async function testBlueErosionEntryAndAdventurers(): Promise<ScenarioResult> {
  const name = 'BT08-B03/B04/B05/B06 erosion entry and Adventurer bonuses';
  const albert = cloneScriptCard(bt08B06 as Card, 'UNIT');
  const sodo = cloneScriptCard(bt08B03 as Card, 'GRAVE');
  const freya = cloneScriptCard(bt08B05 as Card, 'GRAVE');
  const payA = testCard({ id: 'B03_PAY_A', fullName: 'B03 Pay A', type: 'UNIT', color: 'BLUE', cardlocation: 'UNIT' });
  const payB = testCard({ id: 'B03_PAY_B', fullName: 'B03 Pay B', type: 'UNIT', color: 'BLUE', cardlocation: 'UNIT' });
  const discard = testCard({ id: 'B06_DISCARD', fullName: 'B06 Discard Adventurer', type: 'UNIT', faction: albert.faction, godMark: false, cardlocation: 'HAND' });
  const bounceTarget = testCard({ id: 'B03_TARGET', fullName: 'B03 Target', type: 'UNIT', godMark: false, acValue: 3, cardlocation: 'UNIT' });
  const draw = testCard({ id: 'B05_DRAW', fullName: 'B05 Draw', cardlocation: 'DECK' });
  const stateA = game({
    hand: [discard],
    deck: [draw],
    unitZone: [albert, payA, payB, null, null, null],
    grave: [sodo, freya],
  }, {
    unitZone: [bounceTarget, null, null, null, null, null],
  });

  await ServerGameService.activateEffect(stateA, 'BOT', albert.gamecardId, 0);
  const albertOptions = (stateA.pendingQuery?.options || []).map((option: any) => option.card?.gamecardId || option.id);
  const albertTargetLockedBeforeCost = stateA.pendingQuery?.callbackKey === 'DECLARE_EFFECT_TARGETS' &&
    albertOptions.includes(sodo.gamecardId) &&
    !albertOptions.includes(discard.gamecardId);
  await answerPendingQuery(stateA, 'BOT', [sodo.gamecardId]);
  if (stateA.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(stateA, 'BOT', [discard.gamecardId]);
  }
  if (stateA.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateA.phase}`);
  await ServerGameService.passConfrontation(stateA, stateA.priorityPlayerId);
  const sodoOnField = stateA.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === sodo.gamecardId);
  const albertDiscarded = albertTargetLockedBeforeCost &&
    stateA.players.BOT.grave.some((card: Card) => card.gamecardId === discard.gamecardId) &&
    !stateA.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === discard.gamecardId) &&
    !stateA.players.BOT.itemZone.some((item: Card | null) => item?.gamecardId === discard.gamecardId);

  const albertField = cloneScriptCard(bt08B06 as Card, 'UNIT', { gamecardId: 'B06_ALBERT_FIELD' });
  const fieldTarget = testCard({
    id: 'B06_FIELD_TARGET',
    fullName: 'B06 Field Adventurer',
    type: 'UNIT',
    faction: albertField.faction,
    godMark: false,
    specialName: 'B06 Shared',
    cardlocation: 'UNIT',
  });
  const graveDuplicate = testCard({
    id: 'B06_GRAVE_DUP',
    fullName: 'B06 Grave Duplicate Adventurer',
    type: 'UNIT',
    faction: albertField.faction,
    godMark: false,
    specialName: 'B06 Shared',
    cardlocation: 'GRAVE',
  });
  const stateField = game({
    hand: [testCard({ id: 'B06_FIELD_DISCARD', fullName: 'B06 Field Discard', cardlocation: 'HAND' })],
    unitZone: [albertField, fieldTarget, null, null, null, null],
    grave: [graveDuplicate],
  });
  await ServerGameService.activateEffect(stateField, 'BOT', albertField.gamecardId, 0);
  const fieldOptions = (stateField.pendingQuery?.options || []).map((option: any) => option.card.gamecardId);
  const fieldTargetAllowed = fieldOptions.includes(fieldTarget.gamecardId);
  const graveDuplicateBlocked = !fieldOptions.includes(graveDuplicate.gamecardId);
  await answerPendingQuery(stateField, 'BOT', [fieldTarget.gamecardId]);
  if (stateField.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(stateField, 'BOT', [stateField.players.BOT.hand[0].gamecardId]);
  }
  if (stateField.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateField.phase}`);
  await ServerGameService.passConfrontation(stateField, stateField.priorityPlayerId);
  const fieldTargetCycled = stateField.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === fieldTarget.gamecardId);

  await ServerGameService.activateEffect(stateA, 'BOT', sodo.gamecardId, 0);
  await answerPendingQuery(stateA, 'BOT', [bounceTarget.gamecardId]);
  if (stateA.pendingQuery?.type === 'SELECT_PAYMENT') {
    await answerPendingQuery(stateA, 'BOT', [JSON.stringify({ exhaustUnitIds: [payA.gamecardId, payB.gamecardId] })]);
  }
  if (stateA.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateA.phase}`);
  await ServerGameService.passConfrontation(stateA, stateA.priorityPlayerId);
  const bounced = stateA.players.P1.hand.some((card: Card) => card.fullName === bounceTarget.fullName);

  const albertB = cloneScriptCard(bt08B06 as Card, 'UNIT', { gamecardId: 'B06_ALBERT_B' });
  const freyaPay = testCard({ id: 'B05_PAY', fullName: 'B05 Pay', type: 'UNIT', color: 'BLUE', cardlocation: 'UNIT' });
  const freyaDraw = testCard({ id: 'B05_DRAW_B', fullName: 'B05 Draw B', cardlocation: 'DECK' });
  const stateB = game({
    hand: [testCard({ id: 'B06_DISCARD_B', fullName: 'B06 Discard B', cardlocation: 'HAND' })],
    deck: [freyaDraw],
    unitZone: [albertB, freyaPay, null, null, null, null],
    grave: [freya],
  });
  await ServerGameService.activateEffect(stateB, 'BOT', albertB.gamecardId, 0);
  await answerPendingQuery(stateB, 'BOT', [freya.gamecardId]);
  if (stateB.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(stateB, 'BOT', [stateB.players.BOT.hand[0].gamecardId]);
  }
  if (stateB.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateB.phase}`);
  await ServerGameService.passConfrontation(stateB, stateB.priorityPlayerId);
  await confirmTrigger(stateB, 'BOT');
  if (stateB.pendingQuery?.type === 'SELECT_PAYMENT') {
    await answerPendingQuery(stateB, 'BOT', [JSON.stringify({ exhaustUnitIds: [freyaPay.gamecardId] })]);
  }
  const drew = stateB.players.BOT.hand.some((card: Card) => card.gamecardId === freyaDraw.gamecardId);

  const feast = cloneScriptCard(bt08B04 as Card, 'UNIT');
  const adventurerA = testCard({ id: 'B04_ADV_A', fullName: 'B04 Adventurer A', type: 'UNIT', faction: '冒险家公会', cardlocation: 'UNIT' });
  const adventurerB = testCard({ id: 'B04_ADV_B', fullName: 'B04 Adventurer B', type: 'UNIT', faction: '冒险家公会', cardlocation: 'UNIT' });
  const erosion = deckCards(4, 'B04_EROSION', 'BLUE').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any }));
  const stateC = game({
    unitZone: [feast, adventurerA, adventurerB, null, null, null],
    erosionFront: erosion,
  });
  EventEngine.recalculateContinuousEffects(stateC);
  const buffed = feast.power === (feast.basePower || 0) + 1000 && feast.damage === (feast.baseDamage || 0) + 1;

  return sodoOnField && albertDiscarded && fieldTargetAllowed && graveDuplicateBlocked && fieldTargetCycled && bounced && drew && buffed
    ? pass(name, `sodo=${sodoOnField}, albertDiscard=${albertDiscarded}, field=${fieldTargetAllowed}/${graveDuplicateBlocked}/${fieldTargetCycled}, bounced=${bounced}, drew=${drew}, buffed=${buffed}`)
    : fail(name, `sodo=${sodoOnField}, albertDiscard=${albertDiscarded}, field=${fieldTargetAllowed}/${graveDuplicateBlocked}/${fieldTargetCycled}, bounced=${bounced}, drew=${drew}, buffed=${buffed}`);
}

async function testBlueCounterAndCarriage(): Promise<ScenarioResult> {
  const name = 'BT08-B08/B09 counters ACCESS 3 non-god and carriage mills/wins';
  const escort = cloneScriptCard(bt08B08 as Card, 'PLAY');
  const opponentPlay = testCard({ id: 'B08_PLAY', fullName: 'B08 Play', type: 'UNIT', color: 'RED', acValue: 3, godMark: false, cardlocation: 'PLAY' });
  const stateA = game({
    playZone: [escort],
    erosionBack: [testCard({ id: 'B08_BACK', fullName: 'B08 Back', cardlocation: 'EROSION_BACK', displayState: 'BACK_UPRIGHT' })],
  }, {
    playZone: [opponentPlay],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    counterStack: [{ type: 'PLAY', ownerUid: 'P1', card: opponentPlay, timestamp: Date.now() }],
  });
  await escort.effects?.[0]?.execute?.(escort, stateA, stateA.players.BOT);
  const countered = stateA.counterStack[0].isNegated === true;

  const carriage = cloneScriptCard(bt08B09 as Card, 'ITEM');
  const searched = testCard({ id: 'B09_SEARCHED', fullName: 'B09 Searched', cardlocation: 'DECK' });
  const oppMillA = testCard({ id: 'B09_MILL_A', fullName: 'B09 Mill A', cardlocation: 'DECK' });
  const oppMillB = testCard({ id: 'B09_MILL_B', fullName: 'B09 Mill B', cardlocation: 'DECK' });
  const searchSource = testCard({ id: 'B09_SOURCE', fullName: 'B09 Source', type: 'UNIT', cardlocation: 'UNIT' });
  const stateB = game({
    itemZone: [carriage],
  }, {
    deck: [oppMillA, oppMillB, searched],
    unitZone: [searchSource, null, null, null, null, null],
  });
  moveCard(stateB, 'P1', searched, 'HAND', searchSource);
  await confirmTrigger(stateB, 'BOT');
  const milled = stateB.players.P1.grave.filter((card: Card) => [oppMillA.gamecardId, oppMillB.gamecardId].includes(card.gamecardId)).length === 2;

  const richCarriage = cloneScriptCard(bt08B09 as Card, 'ITEM', { gamecardId: 'B09_WIN' });
  const wealthyUnits = Array.from({ length: 15 }, (_, index) => testCard({
    id: `B09_WEALTH_${index}`,
    fullName: `B09 Wealth ${index}`,
    type: 'UNIT',
    color: 'BLUE',
    faction: '九尾商会联盟',
    cardlocation: 'UNIT',
    data: { grantedWealthValue: 1 },
  } as any));
  const stateC = game({
    unitZone: wealthyUnits,
    itemZone: [richCarriage],
  });
  EventEngine.dispatchEvent(stateC, { type: 'TURN_END' as any, playerUid: 'BOT' });
  await confirmAllTriggers(stateC, 'BOT');
  const won = stateC.gameStatus === 2 && stateC.winnerId === 'BOT';

  return countered && milled && won
    ? pass(name, `countered=${countered}, milled=${milled}, won=${won}`)
    : fail(name, `countered=${countered}, milled=${milled}, won=${won}`);
}

async function testBlueSwordImmortalPackage(): Promise<ScenarioResult> {
  const name = 'BT08-B10/B11 Sword Immortal search, boost, hand entry, and equipment bonus';
  const manor = cloneScriptCard(bt08B10 as Card, 'ITEM');
  const eastern = cloneScriptCard(bt08B11 as Card, 'HAND');
  const costSword = testCard({ id: 'B10_COST', fullName: '剑仙 Cost', type: 'UNIT', color: 'BLUE', cardlocation: 'HAND' });
  const deckSword = testCard({ id: 'B10_SEARCH', fullName: '剑仙 Search', type: 'UNIT', color: 'BLUE', cardlocation: 'DECK' });
  const stateA = game({
    hand: [costSword],
    deck: [deckSword],
    itemZone: [manor],
    erosionFront: deckCards(2, 'B10_EROSION', 'BLUE').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  await activateAndResolveByOpponentPass(stateA, 'BOT', manor, 0);
  await answerPendingQuery(stateA, 'BOT', [costSword.gamecardId]);
  await answerPendingQuery(stateA, 'BOT', [deckSword.gamecardId]);
  const searched = stateA.players.BOT.grave.some((card: Card) => card.gamecardId === costSword.gamecardId) &&
    stateA.players.BOT.hand.some((card: Card) => card.gamecardId === deckSword.gamecardId);

  stateA.players.BOT.hand.push(eastern);
  eastern.cardlocation = 'HAND';
  await activateAndResolveByOpponentPass(stateA, 'BOT', eastern, 1);
  await answerPendingQuery(stateA, 'BOT', [deckSword.gamecardId]);
  const entered = stateA.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === eastern.gamecardId);
  EventEngine.recalculateContinuousEffects(stateA);
  const boostedByManor = eastern.power === (eastern.basePower || 0) + 500;
  const noEquipmentHeroic = eastern.isHeroic !== true;

  const equip = testCard({ id: 'B11_EQUIP', fullName: 'B11 Equip', type: 'ITEM', color: 'BLUE', cardlocation: 'ITEM', equipTargetId: eastern.gamecardId, isEquip: true });
  stateA.players.BOT.itemZone.push(equip);
  EventEngine.recalculateContinuousEffects(stateA);
  const equippedBonus = eastern.power === (eastern.basePower || 0) + 1500 && eastern.isHeroic === true;

  return searched && entered && boostedByManor && noEquipmentHeroic && equippedBonus
    ? pass(name, `searched=${searched}, entered=${entered}, boost=${boostedByManor}, noEquipHeroic=${noEquipmentHeroic}, equipped=${equippedBonus}`)
    : fail(name, `searched=${searched}, entered=${entered}, boost=${boostedByManor}, noEquipHeroic=${noEquipmentHeroic}, equipped=${equippedBonus}`);
}

async function testYellowFaceDownExileAndFeijingReturn(): Promise<ScenarioResult> {
  const name = 'BT08-Y01/Y02/Y08 face-down exile and Feijing delayed return';
  const researcher = cloneScriptCard(bt08Y01 as Card, 'UNIT');
  const top = testCard({ id: 'Y01_TOP', fullName: 'Y01 Top', cardlocation: 'DECK' });
  const stateA = game({
    deck: [top],
    unitZone: [researcher, null, null, null, null, null],
  });
  EventEngine.dispatchEvent(stateA, {
    type: 'CARD_ENTERED_ZONE',
    sourceCard: researcher,
    sourceCardId: researcher.gamecardId,
    playerUid: 'BOT',
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT', isEffect: false }
  });
  await confirmAllTriggers(stateA, 'BOT');
  const y01Exiled = stateA.players.BOT.exile.some((card: Card) =>
    card.gamecardId === top.gamecardId && card.displayState === 'FRONT_FACEDOWN'
  );

  const planner = cloneScriptCard(bt08Y02 as Card, 'UNIT');
  const blueprint = cloneScriptCard(bt08Y10 as Card, 'GRAVE');
  const stateB = game({
    grave: [blueprint],
    unitZone: [planner, null, null, null, null, null],
  });
  await ServerGameService.activateEffect(stateB, 'BOT', planner.gamecardId, 0);
  await answerPendingQuery(stateB, 'BOT', [blueprint.gamecardId]);
  if (stateB.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(stateB, 'BOT', ['PAY']);
  }
  if (stateB.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateB.phase}`);
  await ServerGameService.passConfrontation(stateB, stateB.priorityPlayerId);
  const y02Exiled = stateB.players.BOT.exile.some((card: Card) =>
    card.gamecardId === blueprint.gamecardId && card.displayState === 'FRONT_FACEDOWN'
  ) && planner.isExhausted === true;

  const excavation = cloneScriptCard(bt08Y08 as Card, 'PLAY');
  const feijingA = testCard({ id: 'Y08_FEIJING_A', fullName: 'Y08 Feijing A', feijingMark: true, cardlocation: 'DECK' });
  const feijingB = testCard({ id: 'Y08_FEIJING_B', fullName: 'Y08 Feijing B', feijingMark: true, cardlocation: 'DECK' });
  const stateC = game({
    deck: [feijingA, feijingB],
    playZone: [excavation],
  });
  await excavation.effects?.[0]?.execute?.(excavation, stateC, stateC.players.BOT);
  await answerPendingQuery(stateC, 'BOT', [feijingA.gamecardId, feijingB.gamecardId]);
  const y08Exiled = stateC.players.BOT.exile.length === 2;
  stateC.turnCount = 7;
  stateC.phase = 'START';
  EventEngine.dispatchEvent(stateC, { type: 'PHASE_CHANGED', playerUid: 'BOT', data: { phase: 'START' } });
  await confirmAllTriggers(stateC, 'BOT');
  const y08Returned = stateC.players.BOT.hand.filter((card: Card) =>
    [feijingA.gamecardId, feijingB.gamecardId].includes(card.gamecardId)
  ).length === 2;

  return y01Exiled && y02Exiled && y08Exiled && y08Returned
    ? pass(name, `y01=${y01Exiled}, y02=${y02Exiled}, y08=${y08Exiled}/${y08Returned}`)
    : fail(name, `y01=${y01Exiled}, y02=${y02Exiled}, y08=${y08Exiled}/${y08Returned}`);
}

async function testYellowHighAlchemyPlacements(): Promise<ScenarioResult> {
  const name = 'BT08-Y03/Y09 high alchemy places deck units and records materials';
  const cecilia = cloneScriptCard(bt08Y03 as Card, 'UNIT');
  const red = testCard({ id: 'Y03_RED', fullName: 'Y03 Red', color: 'RED', cardlocation: 'HAND' });
  const white = testCard({ id: 'Y03_WHITE', fullName: 'Y03 White', color: 'WHITE', cardlocation: 'HAND' });
  const green = testCard({ id: 'Y03_GREEN', fullName: 'Y03 Green', color: 'GREEN', cardlocation: 'UNIT' });
  const kode = cloneScriptCard(bt08Y05 as Card, 'DECK');
  const stateA = game({
    hand: [red, white],
    deck: [kode],
    unitZone: [cecilia, green, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(stateA, 'BOT', cecilia, 0);
  await answerPendingQuery(stateA, 'BOT', [red.gamecardId, white.gamecardId, green.gamecardId]);
  await answerPendingQuery(stateA, 'BOT', [kode.gamecardId]);
  const y03Placed = stateA.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === kode.gamecardId &&
    (unit as any).data?.enteredFromDeckByAlchemySourceCardId === cecilia.gamecardId &&
    (unit as any).data?.highAlchemyMaterialColors?.includes('RED')
  );
  const triggerCecilia = cloneScriptCard(bt08Y03 as Card, 'UNIT', { gamecardId: 'Y03_TRIGGER_CECILIA' });
  const rawStoneMaterial = cloneScriptCard(bt07Y04 as Card, 'UNIT');
  const triggerWhite = testCard({ id: 'Y03_TRIGGER_WHITE', fullName: 'Y03 Trigger White', color: 'WHITE', cardlocation: 'HAND' });
  const triggerGreen = testCard({ id: 'Y03_TRIGGER_GREEN', fullName: 'Y03 Trigger Green', color: 'GREEN', cardlocation: 'HAND' });
  const triggerTarget = testCard({ id: 'Y03_TRIGGER_TARGET', fullName: 'Y03 Trigger Target', type: 'UNIT', color: 'RED', godMark: false, cardlocation: 'DECK' });
  const searchedStone = cloneScriptCard(bt07Y09 as Card, 'DECK', { gamecardId: 'Y03_SEARCHED_STONE' });
  const payUnitA = testCard({ id: 'Y03_TRIGGER_PAY_A', fullName: 'Y03 Trigger Pay A', color: 'YELLOW', cardlocation: 'UNIT' });
  const payUnitB = testCard({ id: 'Y03_TRIGGER_PAY_B', fullName: 'Y03 Trigger Pay B', color: 'YELLOW', cardlocation: 'UNIT' });
  const triggerState = game({
    hand: [triggerWhite, triggerGreen],
    deck: [triggerTarget, searchedStone],
    unitZone: [triggerCecilia, rawStoneMaterial, payUnitA, payUnitB, null, null],
  });
  await activateAndResolveByOpponentPass(triggerState, 'BOT', triggerCecilia, 0);
  await answerPendingQuery(triggerState, 'BOT', [rawStoneMaterial.gamecardId, triggerWhite.gamecardId, triggerGreen.gamecardId]);
  await answerPendingQuery(triggerState, 'BOT', [triggerTarget.gamecardId]);
  await confirmAllTriggers(triggerState, 'BOT');
  if (triggerState.pendingQuery?.type === 'SELECT_PAYMENT') {
    await answerPendingQuery(triggerState, 'BOT', [JSON.stringify({ exhaustUnitIds: [payUnitA.gamecardId, payUnitB.gamecardId] })]);
  }
  if (triggerState.pendingQuery?.context?.effectId === '105000384_effect_grave_search_immortal_stone') {
    await answerPendingQuery(triggerState, 'BOT', [searchedStone.gamecardId]);
  }
  const rawStoneTriggered = triggerState.players.BOT.hand.some((card: Card) => card.gamecardId === searchedStone.gamecardId);

  const fullCecilia = cloneScriptCard(bt08Y03 as Card, 'UNIT');
  const fullFieldA = testCard({ id: 'Y03_FULL_FIELD_A', fullName: 'Y03 Full Field A', color: 'RED', cardlocation: 'UNIT' });
  const fullFieldB = testCard({ id: 'Y03_FULL_FIELD_B', fullName: 'Y03 Full Field B', color: 'WHITE', cardlocation: 'UNIT' });
  const fullFieldC = testCard({ id: 'Y03_FULL_FIELD_C', fullName: 'Y03 Full Field C', color: 'GREEN', cardlocation: 'UNIT' });
  const fullFieldD = testCard({ id: 'Y03_FULL_FIELD_D', fullName: 'Y03 Full Field D', color: 'BLUE', cardlocation: 'UNIT' });
  const fullFieldE = testCard({ id: 'Y03_FULL_FIELD_E', fullName: 'Y03 Full Field E', color: 'YELLOW', cardlocation: 'UNIT' });
  const fullTarget = testCard({ id: 'Y03_FULL_TARGET', fullName: 'Y03 Full Target', type: 'UNIT', color: 'RED', godMark: false, cardlocation: 'DECK' });
  const fullState = game({
    deck: [fullTarget],
    unitZone: [fullCecilia, fullFieldA, fullFieldB, fullFieldC, fullFieldD, fullFieldE],
  });
  const fullCanActivate = ServerGameService.checkEffectLimitsAndReqs(
    fullState,
    'BOT',
    fullCecilia,
    fullCecilia.effects![0],
    'UNIT'
  ).valid;
  await activateAndResolveByOpponentPass(fullState, 'BOT', fullCecilia, 0);
  await answerPendingQuery(fullState, 'BOT', [fullFieldA.gamecardId, fullFieldB.gamecardId, fullFieldC.gamecardId]);
  await answerPendingQuery(fullState, 'BOT', [fullTarget.gamecardId]);
  const fullFieldPlaced = fullState.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === fullTarget.gamecardId &&
    (unit as any).data?.enteredFromDeckByAlchemySourceCardId === fullCecilia.gamecardId
  );

  const rainbow = cloneScriptCard(bt08Y09 as Card, 'PLAY');
  const fieldMaterial = testCard({ id: 'Y09_FIELD', fullName: 'Y09 Field', type: 'UNIT', color: 'WHITE', godMark: false, cardlocation: 'UNIT' });
  const deckGod = testCard({ id: 'Y09_GOD', fullName: 'Y09 God', type: 'UNIT', color: 'GREEN', godMark: true, cardlocation: 'DECK' });
  const fieldMaterialB = testCard({ id: 'Y09_FIELD_B', fullName: 'Y09 Field B', type: 'UNIT', color: 'YELLOW', godMark: false, cardlocation: 'UNIT' });
  const crow = cloneScriptCard(bt08Y07 as Card, 'DECK');
  const stateB = game({
    deck: [deckGod, crow],
    playZone: [rainbow],
    unitZone: [fieldMaterial, fieldMaterialB, null, null, null, null],
    erosionBack: deckCards(2, 'Y09_BACK', 'YELLOW').map(card => ({ ...card, cardlocation: 'EROSION_BACK' as any })),
  });
  await rainbow.effects?.[0]?.execute?.(rainbow, stateB, stateB.players.BOT);
  await answerPendingQuery(stateB, 'BOT', [fieldMaterial.gamecardId, fieldMaterialB.gamecardId, deckGod.gamecardId]);
  await answerPendingQuery(stateB, 'BOT', [crow.gamecardId]);
  const y09Placed = stateB.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === crow.gamecardId &&
    (unit as any).data?.enteredFromDeckByAlchemySourceCardId === rainbow.gamecardId &&
    (unit as any).data?.highAlchemyMaterialColors?.includes('GREEN')
  );
  const materialsSent = stateB.players.BOT.grave.some((card: Card) => card.gamecardId === fieldMaterial.gamecardId) &&
    stateB.players.BOT.grave.some((card: Card) => card.gamecardId === fieldMaterialB.gamecardId) &&
    stateB.players.BOT.grave.some((card: Card) => card.gamecardId === deckGod.gamecardId);

  return y03Placed && rawStoneTriggered && fullCanActivate && fullFieldPlaced && y09Placed && materialsSent
    ? pass(name, `y03=${y03Placed}, rawTrigger=${rawStoneTriggered}, full=${fullCanActivate}/${fullFieldPlaced}, y09=${y09Placed}, materials=${materialsSent}`)
    : fail(name, `y03=${y03Placed}, rawTrigger=${rawStoneTriggered}, full=${fullCanActivate}/${fullFieldPlaced}, y09=${y09Placed}, materials=${materialsSent}`);
}

async function testYellowHighAlchemyPhantomBeastEntryRestriction(): Promise<ScenarioResult> {
  const name = 'BT08-Y05/Y06/Y07 phantom beasts require matching 3-card High Alchemy';
  const kodeHand = cloneScriptCard(bt08Y05 as Card, 'HAND');
  const directState = game({
    hand: [kodeHand],
    unitZone: [
      testCard({ id: 'DIRECT_YELLOW_A', color: 'YELLOW', cardlocation: 'UNIT' }),
      testCard({ id: 'DIRECT_RED_A', color: 'RED', cardlocation: 'UNIT' }),
      testCard({ id: 'DIRECT_RED_B', color: 'RED', cardlocation: 'UNIT' }),
      testCard({ id: 'DIRECT_RED_C', color: 'RED', cardlocation: 'UNIT' }),
      null,
      null,
    ],
  });
  const directBlocked = !ServerGameService.canPlayCard(directState, directState.players.BOT, kodeHand).canPlay;
  const noContextBlocked = !canPutUnitOntoBattlefield(directState.players.BOT, kodeHand);

  const cecilia = cloneScriptCard(bt08Y03 as Card, 'UNIT');
  const redA = testCard({ id: 'Y03_RESTRICT_RED_A', color: 'RED', cardlocation: 'HAND' });
  const redB = testCard({ id: 'Y03_RESTRICT_RED_B', color: 'RED', cardlocation: 'HAND' });
  const redC = testCard({ id: 'Y03_RESTRICT_RED_C', color: 'RED', cardlocation: 'HAND' });
  const kode = cloneScriptCard(bt08Y05 as Card, 'DECK');
  const bahamut = cloneScriptCard(bt08Y06 as Card, 'DECK');
  const stateA = game({
    hand: [redA, redB, redC],
    deck: [kode, bahamut],
    unitZone: [cecilia, null, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(stateA, 'BOT', cecilia, 0);
  await answerPendingQuery(stateA, 'BOT', [redA.gamecardId, redB.gamecardId, redC.gamecardId]);
  const y03Options = (stateA.pendingQuery?.options || []).map((option: any) => option.card.gamecardId);
  const redGateOnly = y03Options.includes(kode.gamecardId) && !y03Options.includes(bahamut.gamecardId);
  await answerPendingQuery(stateA, 'BOT', [kode.gamecardId]);
  const kodePlaced = stateA.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === kode.gamecardId &&
    (unit as any).data?.highAlchemyMaterialColors?.includes('RED') &&
    (unit as any).data?.enteredFromDeckByAlchemySourceCardId === cecilia.gamecardId
  );

  const rainbow = cloneScriptCard(bt08Y09 as Card, 'PLAY');
  const fieldMaterial = testCard({ id: 'Y09_RESTRICT_FIELD', fullName: 'Y09 Field', type: 'UNIT', color: 'WHITE', godMark: false, cardlocation: 'UNIT' });
  const deckGod = testCard({ id: 'Y09_RESTRICT_GOD', fullName: 'Y09 God', type: 'UNIT', color: 'GREEN', godMark: true, cardlocation: 'DECK' });
  const crow = cloneScriptCard(bt08Y07 as Card, 'DECK');
  const stateB = game({
    deck: [deckGod, crow],
    playZone: [rainbow],
    unitZone: [fieldMaterial, null, null, null, null, null],
    erosionBack: deckCards(2, 'Y09_RESTRICT_BACK', 'YELLOW').map(card => ({ ...card, cardlocation: 'EROSION_BACK' as any })),
  });
  await rainbow.effects?.[0]?.execute?.(rainbow, stateB, stateB.players.BOT);
  await answerPendingQuery(stateB, 'BOT', [fieldMaterial.gamecardId, deckGod.gamecardId]);
  const twoMaterialOptions = (stateB.pendingQuery?.options || []).map((option: any) => option.card.gamecardId);
  const twoMaterialsBlocked = !twoMaterialOptions.includes(crow.gamecardId);

  const highAlchemyStory = cloneScriptCard(highAlchemy as Card, 'PLAY');
  const immortalStone = cloneScriptCard(bt07Y09 as Card, 'ITEM');
  const yellowA = testCard({ id: 'Y09_STONE_YELLOW_A', color: 'YELLOW', cardlocation: 'UNIT' });
  const yellowB = testCard({ id: 'Y09_STONE_YELLOW_B', color: 'YELLOW', cardlocation: 'ITEM', type: 'ITEM' });
  const stoneKode = cloneScriptCard(bt08Y05 as Card, 'DECK', { gamecardId: 'Y09_STONE_KODE' });
  const stoneCrow = cloneScriptCard(bt08Y07 as Card, 'DECK', { gamecardId: 'Y09_STONE_CROW' });
  const stoneState = game({
    deck: [stoneKode, stoneCrow],
    playZone: [highAlchemyStory],
    unitZone: [yellowA, null, null, null, null, null],
    itemZone: [immortalStone, yellowB],
  });
  await highAlchemyStory.effects?.[0]?.execute?.(highAlchemyStory, stoneState, stoneState.players.BOT);
  await answerPendingQuery(stoneState, 'BOT', [immortalStone.gamecardId, yellowA.gamecardId, yellowB.gamecardId]);
  const stoneOptions = (stoneState.pendingQuery?.options || []).map((option: any) => option.card.gamecardId);
  const stoneOpensAllColors = stoneOptions.includes(stoneKode.gamecardId) && stoneOptions.includes(stoneCrow.gamecardId);
  await answerPendingQuery(stoneState, 'BOT', [stoneCrow.gamecardId]);
  const stoneCrowPlaced = stoneState.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === stoneCrow.gamecardId &&
    (unit as any).data?.highAlchemyMaterialColors?.includes('GREEN') &&
    (unit as any).data?.highAlchemyMaterialColors?.includes('RED')
  );

  const rawStory = cloneScriptCard(highAlchemy as Card, 'PLAY', { gamecardId: 'RAW_STONE_HIGH_ALCHEMY' });
  const rawStone = cloneScriptCard(bt07Y04 as Card, 'UNIT');
  const rawYellowA = testCard({ id: 'Y04_RAW_YELLOW_A', color: 'YELLOW', cardlocation: 'UNIT' });
  const rawYellowB = testCard({ id: 'Y04_RAW_YELLOW_B', color: 'YELLOW', cardlocation: 'ITEM', type: 'ITEM' });
  const rawKode = cloneScriptCard(bt08Y05 as Card, 'DECK', { gamecardId: 'Y04_RAW_KODE' });
  const rawState = game({
    deck: [rawKode],
    playZone: [rawStory],
    unitZone: [rawStone, rawYellowA, null, null, null, null],
    itemZone: [rawYellowB],
  });
  await rawStory.effects?.[0]?.execute?.(rawStory, rawState, rawState.players.BOT);
  await answerPendingQuery(rawState, 'BOT', [rawStone.gamecardId, rawYellowA.gamecardId, rawYellowB.gamecardId]);
  const rawOptions = (rawState.pendingQuery?.options || []).map((option: any) => option.card.gamecardId);
  const rawOpensRed = rawOptions.includes(rawKode.gamecardId);

  return directBlocked && noContextBlocked && redGateOnly && kodePlaced && twoMaterialsBlocked && stoneOpensAllColors && stoneCrowPlaced && rawOpensRed
    ? pass(name, `direct=${directBlocked}/${noContextBlocked}, redGate=${redGateOnly}, placed=${kodePlaced}, two=${twoMaterialsBlocked}, stone=${stoneOpensAllColors}/${stoneCrowPlaced}, raw=${rawOpensRed}`)
    : fail(name, `direct=${directBlocked}/${noContextBlocked}, redGate=${redGateOnly}, placed=${kodePlaced}, two=${twoMaterialsBlocked}, stone=${stoneOpensAllColors}/${stoneCrowPlaced}, raw=${rawOpensRed}`);
}

async function testYellowPhantomBeastContinuous(): Promise<ScenarioResult> {
  const name = 'BT08-Y05/Y06/Y07 phantom beast continuous effects';
  const kode = cloneScriptCard(bt08Y05 as Card, 'UNIT', {
    data: { enteredFromDeckByAlchemyTurn: 6, highAlchemyMaterialColors: ['RED'] },
  } as any);
  const bahamut = cloneScriptCard(bt08Y06 as Card, 'UNIT', {
    data: { enteredFromDeckByAlchemyTurn: 6, highAlchemyMaterialColors: ['WHITE'] },
  } as any);
  const crow = cloneScriptCard(bt08Y07 as Card, 'UNIT', {
    data: { enteredFromDeckByAlchemyTurn: 6, highAlchemyMaterialColors: ['GREEN'] },
  } as any);
  const defender = testCard({ id: 'Y05_DEFENDER', fullName: 'Y05 Defender', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });
  const stateA = game({
    unitZone: [kode, bahamut, crow, null, null, null],
    erosionFront: deckCards(3, 'Y_BEAST_EROSION', 'YELLOW').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  }, {
    unitZone: [defender, null, null, null, null, null],
  }, {
    phase: 'BATTLE_DECLARATION',
    turnCount: 6
  });
  EventEngine.recalculateContinuousEffects(stateA);
  const bahamutProtected = (kode as any).battleImmuneByEffect === true &&
    (kode as any).data?.cannotBeEffectTargetByOpponentAcLe === 4 &&
    (bahamut as any).battleImmuneByEffect === true &&
    (crow as any).battleImmuneByEffect === true;
  EventEngine.dispatchEvent(stateA, {
    type: 'CARD_ATTACK_DECLARED',
    sourceCard: kode,
    sourceCardId: kode.gamecardId,
    playerUid: 'BOT',
    data: { attackerIds: [kode.gamecardId], isAlliance: false }
  });
  await confirmAllTriggers(stateA, 'BOT');
  const cannotDefend = (defender as any).data?.cannotDefendTurn === stateA.turnCount;

  const lost = testCard({ id: 'Y07_LOST', fullName: 'Y07 Lost', type: 'UNIT', color: 'RED', godMark: false, cardlocation: 'UNIT' });
  const millA = testCard({ id: 'Y07_MILL_A', fullName: 'Y07 Mill A', cardlocation: 'DECK' });
  const millB = testCard({ id: 'Y07_MILL_B', fullName: 'Y07 Mill B', cardlocation: 'DECK' });
  const stateB = game({
    unitZone: [crow, null, null, null, null, null],
    erosionFront: deckCards(3, 'Y07_EROSION', 'YELLOW').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  }, {
    deck: [millA, millB],
    unitZone: [lost, null, null, null, null, null],
  });
  moveCard(stateB, 'P1', lost, 'GRAVE', crow);
  await confirmAllTriggers(stateB, 'BOT');
  const exiledInstead = stateB.players.P1.exile.some((card: Card) => card.gamecardId === lost.gamecardId);
  const milled = stateB.players.P1.grave.filter((card: Card) =>
    [millA.gamecardId, millB.gamecardId].includes(card.gamecardId)
  ).length === 2;

  return bahamutProtected && cannotDefend && exiledInstead && milled
    ? pass(name, `protect=${bahamutProtected}, noDef=${cannotDefend}, exileMill=${exiledInstead}/${milled}`)
    : fail(name, `protect=${bahamutProtected}, noDef=${cannotDefend}, exileMill=${exiledInstead}/${milled}`);
}

async function testYellowPuppetDesignerBlueprintAndDominic(): Promise<ScenarioResult> {
  const name = 'BT08-Y04/Y10/Y11 puppet designer, blueprint recruit, and Dominic transform';
  const designer = cloneScriptCard(bt08Y04 as Card, 'UNIT');
  const topA = testCard({ id: 'Y04_TOP_A', fullName: 'Y04 Top A', cardlocation: 'DECK' });
  const topB = testCard({ id: 'Y04_TOP_B', fullName: 'Y04 Top B', cardlocation: 'DECK' });
  const topC = testCard({ id: 'Y04_TOP_C', fullName: 'Y04 Top C', cardlocation: 'DECK' });
  const topD = testCard({ id: 'Y04_TOP_D', fullName: 'Y04 Top D', cardlocation: 'DECK' });
  const bottomHand = testCard({ id: 'Y04_HAND', fullName: 'Y04 Hand', cardlocation: 'HAND' });
  const draw = testCard({ id: 'Y04_DRAW', fullName: 'Y04 Draw', cardlocation: 'DECK' });
  const stateA = game({
    hand: [bottomHand],
    deck: [draw, topD, topC, topB, topA],
    unitZone: [designer, null, null, null, null, null],
  }, {}, { phase: 'START' });
  EventEngine.dispatchEvent(stateA, { type: 'PHASE_CHANGED', playerUid: 'BOT', data: { phase: 'START' } });
  await confirmAllTriggers(stateA, 'BOT');
  await answerPendingQuery(stateA, 'BOT', [topB.gamecardId, topA.gamecardId, topD.gamecardId, topC.gamecardId]);
  const reorderedTop = stateA.players.BOT.hand.some((card: Card) => card.gamecardId === topB.gamecardId) &&
    stateA.players.BOT.deck[stateA.players.BOT.deck.length - 1].gamecardId === topA.gamecardId;
  stateA.phase = 'MAIN';
  await activateAndResolveByOpponentPass(stateA, 'BOT', designer, 1);
  await answerPendingQuery(stateA, 'BOT', [bottomHand.gamecardId]);
  const drew = stateA.players.BOT.hand.some((card: Card) => card.gamecardId === topB.gamecardId) &&
    stateA.players.BOT.hand.some((card: Card) => card.gamecardId === topA.gamecardId) &&
    stateA.players.BOT.deck[0].gamecardId === bottomHand.gamecardId;

  const blueprint = cloneScriptCard(bt08Y10 as Card, 'ITEM');
  const facedownA = testCard({ id: 'Y10_FACE_A', fullName: 'Y10 Face A', cardlocation: 'EXILE', displayState: 'FRONT_FACEDOWN' });
  const facedownB = testCard({ id: 'Y10_FACE_B', fullName: 'Y10 Face B', cardlocation: 'EXILE', displayState: 'FRONT_FACEDOWN' });
  const puppet = testCard({ id: 'Y10_PUPPET', fullName: '测试魔偶', type: 'UNIT', color: 'YELLOW', cardlocation: 'DECK' });
  const stateB = game({
    deck: [puppet],
    exile: [facedownA, facedownB],
    itemZone: [blueprint],
  });
  EventEngine.dispatchEvent(stateB, { type: 'TURN_END' as any, playerUid: 'BOT' });
  await confirmTrigger(stateB, 'BOT');
  await answerPendingQuery(stateB, 'BOT', [puppet.gamecardId]);
  const recruited = stateB.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === puppet.gamecardId);
  const facedownBottomed = stateB.players.BOT.deck.slice(0, 2).filter((card: Card) =>
    [facedownA.gamecardId, facedownB.gamecardId].includes(card.gamecardId)
  ).length === 2;

  const dominic = cloneScriptCard(bt08Y11 as Card, 'UNIT');
  const target = testCard({ id: 'Y11_TARGET', fullName: 'Y11 Target', type: 'UNIT', color: 'YELLOW', godMark: false, cardlocation: 'UNIT' });
  const discard = testCard({ id: 'Y11_DISCARD', fullName: 'Y11 Discard', cardlocation: 'HAND' });
  const stateC = game({
    hand: [discard],
    unitZone: [dominic, target, null, null, null, null],
    erosionFront: deckCards(2, 'Y11_FRONT', 'YELLOW').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as any })),
  });
  const dominicTotalErosionValid = ServerGameService.checkEffectLimitsAndReqs(
    stateC,
    'BOT',
    dominic,
    dominic.effects![0],
    'UNIT'
  ).valid;
  await ServerGameService.activateEffect(stateC, 'BOT', dominic.gamecardId, 0);
  await answerPendingQuery(stateC, 'BOT', [target.gamecardId]);
  if (stateC.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(stateC, 'BOT', [discard.gamecardId]);
  }
  if (stateC.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${stateC.phase}`);
  await ServerGameService.passConfrontation(stateC, stateC.priorityPlayerId);
  const transformed = target.power === 3500 &&
    target.damage === 3 &&
    (target as any).data?.permanentEffectSilenced === true &&
    (target as any).data?.extraNameContainsMagicalDollBy === dominic.fullName;

  return reorderedTop && drew && recruited && facedownBottomed && dominicTotalErosionValid && transformed
    ? pass(name, `designer=${reorderedTop}/${drew}, blueprint=${recruited}/${facedownBottomed}, dominic=${dominicTotalErosionValid}/${transformed}`)
    : fail(name, `designer=${reorderedTop}/${drew}, blueprint=${recruited}/${facedownBottomed}, dominic=${dominicTotalErosionValid}/${transformed}`);
}

const scenarios: { name: string; run: ScenarioRun }[] = [
  { name: 'BT08-W01 destroys non-god item after Shingi story cost exile', run: testPrayerDestroysItemAfterShingiCost },
  { name: 'BT08-W02 gains stats and heroic after Shingi effect entry', run: testEliteWarriorGetsShingiStats },
  { name: 'BT08-W02 destroys opponent field card when destroyed', run: testEliteWarriorDestroysOpponentCardWhenDestroyed },
  { name: 'BT08-W03 sacrifices Shingi-entered self to draw and exile targets', run: testKuriSacrificesAndExilesTargets },
  { name: 'BT08-W04 discards two to exile a non-god unit until turn end', run: testDuluExilesAndReturnsNonGodUnit },
  { name: 'BT08-W05 readies another Holy Kingdom non-god unit after alliance battle', run: testPatrolReadiesHolyKingdomAllianceTarget },
  { name: 'BT08-W06 has explicit heroic continuous effect', run: testSculptorKeepsHeroicThroughContinuous },
  { name: 'BT08-W07 exiles AC total 5 and puts deck AC5 white unit onto field', run: testBaptismExilesAccessFiveAndPlacesWhiteUnit },
  { name: 'BT08-W08 freezes a non-god unit and W11 sends frozen unit to grave', run: testSnowstormFreezeAndNikolasSendToGrave },
  { name: 'BT08-W09 readies own non-god unit during opponent attack confrontation', run: testAlarmReadiesOnOpponentAttackStack },
  { name: 'BT08-W10 protects first Holy Kingdom destruction and boosts at erosion 3-6', run: testGloriousCityProtectsAndBoostsHolyKingdom },
  { name: 'BT08-W11 sends a frozen non-god unit to grave', run: testNikolasSendsFrozenNonGodToGrave },
  { name: 'BT08-R01/R03 promote at turn start after discarding Ileu hand', run: testRedTurnStartPromotion },
  { name: 'BT08-R04/R05 promote after attacking at turn end and R05 draws', run: testRedEndTurnPromotionAndDraw },
  { name: 'BT08-R02 recovers grave units and R08 story draws then promotes', run: testRedRecoveryAndPromotionStory },
  { name: 'BT08-R03/R11 destroy only on promotion turn and filter god/non-god targets', run: testRedPromotionDestroyModes },
  { name: 'BT08-R05/R06 grant attacking opponent units after promotion or hand reveal', run: testRedAttackUnitGrants },
  { name: 'BT08-R07 sends own non-god as cost, boosts units, and draws at erosion 5-8', run: testSoulDevourPowerAndDraw },
  { name: 'BT04-R07 searches Thunder when power reaches 3500', run: testThunderLeaderPowerSearch },
  { name: 'BT07-R04 gains damage/rush after Tami+Rafa and Tami attack permission expires', run: testThunderWarriorRushAfterTamiBoost },
  { name: 'BT08-R09 equips promoted unit and R10 protects first opponent-effect leave/draws', run: testPromotionEquipmentAndSquare },
  { name: 'BT08-G01/G03/G04/G05/G06 silver music destroy, stats, combat and awaken gate', run: testGreenSilverMusicDestroyAndBonuses },
  { name: 'BT08-G02/G08/G09 resonance and silver music recovery', run: testGreenResonanceAndSilverRecovery },
  { name: 'BT08-G07/G10 awaken story, deck return count, and Shinboku recruit', run: testGreenAwakenStoryAndSquare },
  { name: 'BT08-G11 silences on Sernobu god resonance and revives silver music', run: testGreenG11ResonanceModes },
  { name: 'BT08-B01/B02/B07 wealth steal, dream recovery, and story modes', run: testBlueWealthStealRecoverAndStory },
  { name: 'BT08-B03/B04/B05/B06 erosion entry and Adventurer bonuses', run: testBlueErosionEntryAndAdventurers },
  { name: 'BT08-B08/B09 counters ACCESS 3 non-god and carriage mills/wins', run: testBlueCounterAndCarriage },
  { name: 'BT08-B10/B11 Sword Immortal search, boost, hand entry, and equipment bonus', run: testBlueSwordImmortalPackage },
  { name: 'BT08-Y01/Y02/Y08 face-down exile and Feijing delayed return', run: testYellowFaceDownExileAndFeijingReturn },
  { name: 'BT08-Y03/Y09 high alchemy places deck units and records materials', run: testYellowHighAlchemyPlacements },
  { name: 'BT08-Y05/Y06/Y07 phantom beasts require matching 3-card High Alchemy', run: testYellowHighAlchemyPhantomBeastEntryRestriction },
  { name: 'BT08-Y05/Y06/Y07 phantom beast continuous effects', run: testYellowPhantomBeastContinuous },
  { name: 'BT08-Y04/Y10/Y11 puppet designer, blueprint recruit, and Dominic transform', run: testYellowPuppetDesignerBlueprintAndDominic },
];

async function main() {
  let passed = 0;
  for (const scenario of scenarios) {
    try {
      const result = await scenario.run();
      if (result.passed) passed += 1;
      console.log(`${result.passed ? 'PASS' : 'FAIL'} ${scenario.name}: ${result.detail}`);
    } catch (error: any) {
      console.log(`FAIL ${scenario.name}: ${error?.stack || error?.message || String(error)}`);
    }
  }

  console.log(`\nBT08 scenarios: ${passed}/${scenarios.length} passed`);
  if (passed !== scenarios.length) process.exit(1);
}

main();
