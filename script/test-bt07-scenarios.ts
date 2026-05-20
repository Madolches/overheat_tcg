import { ServerGameService } from '../server/ServerGameService';
import { EventEngine } from '../src/services/EventEngine';
import { Card, TriggerLocation } from '../src/types/game';
import bt07W01 from '../src/scripts/101140374';
import bt07W02 from '../src/scripts/101130375';
import bt07W03 from '../src/scripts/101130376';
import bt07W04 from '../src/scripts/101130377';
import bt07W05 from '../src/scripts/101130378';
import bt07W06 from '../src/scripts/101000379';
import bt07W07 from '../src/scripts/201130109';
import bt07W08 from '../src/scripts/201000110';
import { moveCardAsCost } from '../src/scripts/BaseUtil';

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
    gameId: nextId('bt07_scenario'),
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

async function confirmTrigger(state: any, playerUid: string) {
  await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, playerUid, ['YES']);
  }
}

async function testPrepWorkerDestroysAfterShingiCostExile(): Promise<ScenarioResult> {
  const name = 'BT07-W01 prep worker destroys AC2 non-god after Shingi cost exile';
  const worker = cloneScriptCard(bt07W01 as Card, 'UNIT');
  const shingi = testCard({ id: 'SHINGI_STORY', fullName: '神仪：测试', type: 'STORY', cardlocation: 'PLAY' });
  const target = testCard({ id: 'AC2_TARGET', fullName: 'AC2 Target', acValue: 2, cardlocation: 'UNIT' });
  const high = testCard({ id: 'AC3_TARGET', fullName: 'AC3 Target', acValue: 3, cardlocation: 'UNIT' });
  const state = game({
    unitZone: [worker, null, null, null, null, null],
    playZone: [shingi],
  }, {
    unitZone: [target, high, null, null, null, null],
  });

  moveCardAsCost(state, 'BOT', worker, 'EXILE', shingi);
  await confirmTrigger(state, 'BOT');

  if (state.pendingQuery?.context?.effectId !== '101140374_shingi_cost_destroy') {
    return fail(name, `expected destroy query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const optionIds = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!optionIds.includes(target.gamecardId) || optionIds.includes(high.gamecardId)) {
    return fail(name, `options=${optionIds.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const destroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId);
  return destroyed
    ? pass(name, `destroyed=${destroyed}, options=${optionIds.length}`)
    : fail(name, `grave=${state.players.P1.grave.map((card: Card) => card.fullName).join(',')}`);
}

function testTwilightGuardProtectsAlliance(): ScenarioResult {
  const name = 'BT07-W02 Twilight Guard protects allied attackers from battle destruction';
  const guard = cloneScriptCard(bt07W02 as Card, 'UNIT');
  const partner = testCard({ id: 'ALLY_PARTNER', fullName: 'Alliance Partner', cardlocation: 'UNIT' });
  const defender = testCard({ id: 'BIG_DEFENDER', fullName: 'Big Defender', cardlocation: 'UNIT', power: 5000, basePower: 5000 });
  const state = game(
    { unitZone: [guard, partner, null, null, null, null] },
    { unitZone: [defender, null, null, null, null, null] },
    {
      phase: 'BATTLE_FREE',
      battleState: {
        attackers: [guard.gamecardId, partner.gamecardId],
        defender: defender.gamecardId,
        isAlliance: true,
        resolvedUnitIds: [],
      },
    }
  );

  EventEngine.recalculateContinuousEffects(state);
  const protectedAll = !!(guard as any).battleImmuneByEffect && !!(partner as any).battleImmuneByEffect;
  return protectedAll
    ? pass(name, `guard=${!!(guard as any).battleImmuneByEffect}, partner=${!!(partner as any).battleImmuneByEffect}`)
    : fail(name, `guard=${!!(guard as any).battleImmuneByEffect}, partner=${!!(partner as any).battleImmuneByEffect}`);
}

async function testNightMageRecoversAfterOpponentBounce(): Promise<ScenarioResult> {
  const name = 'BT07-W03 Night Mage bottoms grave/front cards after opponent bounce';
  const mage = cloneScriptCard(bt07W03 as Card, 'UNIT');
  const bounced = testCard({ id: 'BOUNCED_UNIT', fullName: 'Bounced Unit', cardlocation: 'UNIT' });
  const opponentSource = testCard({ id: 'OPP_BOUNCE', fullName: 'Opponent Bounce', cardlocation: 'UNIT' });
  const graveCard = testCard({ id: 'GRAVE_RECOVER', fullName: 'Grave Recover', cardlocation: 'GRAVE' });
  const erosionCard = testCard({ id: 'EROSION_RECOVER', fullName: 'Erosion Recover', cardlocation: 'EROSION_FRONT', displayState: 'FRONT_UPRIGHT' });
  const state = game({
    unitZone: [mage, bounced, null, null, null, null],
    grave: [graveCard],
    erosionFront: [erosionCard],
  }, {
    unitZone: [opponentSource, null, null, null, null, null],
  });

  ServerGameService.moveCard(state, 'BOT', 'UNIT', 'BOT', 'HAND', bounced.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: opponentSource.gamecardId,
  });
  await confirmTrigger(state, 'BOT');

  if (state.pendingQuery?.context?.effectId !== '101130376_opponent_bounce_recover') {
    return fail(name, `expected recover query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [graveCard.gamecardId, erosionCard.gamecardId]);

  const recovered = state.players.BOT.deck.slice(0, 2).map((card: Card) => card.id);
  const condition = recovered.includes(graveCard.id) && recovered.includes(erosionCard.id);
  return condition
    ? pass(name, `bottom=${recovered.join(',')}`)
    : fail(name, `bottom=${recovered.join(',')}, grave=${state.players.BOT.grave.length}, erosion=${state.players.BOT.erosionFront.filter(Boolean).length}`);
}

async function testHeavyKnightRecruitsAlliancePartner(): Promise<ScenarioResult> {
  const name = 'BT07-W04 Heavy Knight recruits exhausted alliance partner on solo attack';
  const heavy = cloneScriptCard(bt07W04 as Card, 'UNIT');
  const partner = cloneScriptCard(bt07W02 as Card, 'DECK');
  const filler = testCard({ id: 'NON_TARGET', fullName: 'Non Target', faction: 'Other', cardlocation: 'DECK' });
  const state = game({
    deck: [partner, filler, ...deckCards(3, 'BOT_FILL')],
    unitZone: [heavy, null, null, null, null, null],
  }, {}, {
    phase: 'BATTLE_DECLARATION',
    battleState: {
      attackers: [heavy.gamecardId],
      isAlliance: false,
      resolvedUnitIds: [],
    },
  });

  EventEngine.dispatchEvent(state, {
    type: 'CARD_ATTACK_DECLARED',
    playerUid: 'BOT',
    sourceCard: heavy,
    sourceCardId: heavy.gamecardId,
    data: { attackerIds: [heavy.gamecardId], isAlliance: false },
  });
  await confirmTrigger(state, 'BOT');

  if (state.pendingQuery?.context?.effectId !== '101130377_recruit_alliance_partner') {
    return fail(name, `expected recruit query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [partner.gamecardId]);

  const livePartner = state.players.BOT.unitZone.find((card: Card | null) => card?.gamecardId === partner.gamecardId);
  const battle = state.battleState;
  const condition =
    !!livePartner &&
    livePartner.isExhausted &&
    battle.isAlliance &&
    battle.attackers.includes(heavy.gamecardId) &&
    battle.attackers.includes(partner.gamecardId);
  return condition
    ? pass(name, `attackers=${battle.attackers.join(',')}, exhausted=${livePartner?.isExhausted}`)
    : fail(name, `live=${!!livePartner}, attackers=${battle.attackers?.join(',')}, alliance=${battle.isAlliance}`);
}

async function testHeavyKnightPreventsFirstBattleDestroy(): Promise<ScenarioResult> {
  const name = 'BT07-W04 Heavy Knight prevents first battle destruction each turn';
  const heavy = cloneScriptCard(bt07W04 as Card, 'UNIT');
  const state = game({
    unitZone: [heavy, null, null, null, null, null],
  });

  EventEngine.recalculateContinuousEffects(state);
  const first = await ServerGameService.destroyUnit(state, 'BOT', heavy.gamecardId);
  const second = await ServerGameService.destroyUnit(state, 'BOT', heavy.gamecardId);
  const condition = first === false && second === true && state.players.BOT.grave.some((card: Card) => card.gamecardId === heavy.gamecardId);
  return condition
    ? pass(name, `first=${first}, second=${second}`)
    : fail(name, `first=${first}, second=${second}, grave=${state.players.BOT.grave.length}`);
}

async function testWhiteWingExilesGodmarkToPutItem(): Promise<ScenarioResult> {
  const name = 'BT07-W05 White Wing exiles grave godmark to put low non-god item';
  const whiteWing = cloneScriptCard(bt07W05 as Card, 'UNIT');
  const graveGod = testCard({ id: 'GOD_GRAVE', fullName: 'God Grave', godMark: true, cardlocation: 'GRAVE' });
  const item = testCard({ id: 'LOW_ITEM', fullName: 'Low Item', type: 'ITEM', acValue: 3, godMark: false, cardlocation: 'DECK' });
  const highItem = testCard({ id: 'HIGH_ITEM', fullName: 'High Item', type: 'ITEM', acValue: 4, godMark: false, cardlocation: 'DECK' });
  const state = game({
    grave: [graveGod],
    deck: [item, highItem, ...deckCards(3, 'BOT_FILL')],
    unitZone: [whiteWing, null, null, null, null, null],
  });

  EventEngine.dispatchEvent(state, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: whiteWing,
    sourceCardId: whiteWing.gamecardId,
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' },
  });
  await confirmTrigger(state, 'BOT');

  if (state.pendingQuery?.context?.step !== 'COST') {
    return fail(name, `expected cost query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [graveGod.gamecardId]);

  if (state.pendingQuery?.context?.step !== 'PUT_ITEM') {
    return fail(name, `expected put item query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  const optionIds = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!optionIds.includes(item.gamecardId) || optionIds.includes(highItem.gamecardId)) {
    return fail(name, `options=${optionIds.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [item.gamecardId]);

  const costExiled = state.players.BOT.exile.some((card: Card) => card.gamecardId === graveGod.gamecardId);
  const itemPlaced = state.players.BOT.itemZone.some((card: Card) => card.gamecardId === item.gamecardId);
  return costExiled && itemPlaced
    ? pass(name, `costExiled=${costExiled}, itemPlaced=${itemPlaced}`)
    : fail(name, `exile=${costExiled}, item=${itemPlaced}`);
}

async function testSnowGirlRecoversShingiOnEffectLeave(): Promise<ScenarioResult> {
  const name = 'BT07-W06 Snow Girl recovers Shingi card after effect leave';
  const snow = cloneScriptCard(bt07W06 as Card, 'UNIT');
  const shingi = testCard({ id: 'SHINGI_GRAVE', fullName: '\u795e\u4eea\uff1a\u6d4b\u8bd5', type: 'STORY', cardlocation: 'GRAVE' });
  const source = testCard({ id: 'BOUNCE_SOURCE', fullName: 'Bounce Source', cardlocation: 'UNIT' });
  const state = game({
    unitZone: [snow, null, null, null, null, null],
    grave: [shingi],
  }, {
    unitZone: [source, null, null, null, null, null],
  });

  ServerGameService.moveCard(state, 'BOT', 'UNIT', 'BOT', 'HAND', snow.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: source.gamecardId,
  });
  await confirmTrigger(state, 'BOT');

  if (state.pendingQuery?.context?.effectId !== '101000379_leave_recover_shingi') {
    return fail(name, `expected recover query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [shingi.gamecardId]);

  const recovered = state.players.BOT.hand.some((card: Card) => card.gamecardId === shingi.gamecardId);
  return recovered
    ? pass(name, 'recovered Shingi card')
    : fail(name, `hand=${state.players.BOT.hand.map((card: Card) => card.fullName).join(',')}`);
}

async function testSnowGirlFreezesAfterShingiEntry(): Promise<ScenarioResult> {
  const name = 'BT07-W06 Snow Girl freezes low non-god unit after Shingi entry';
  const snow = cloneScriptCard(bt07W06 as Card, 'UNIT');
  const shingiSource = testCard({ id: 'SHINGI_SOURCE', fullName: '\u795e\u4eea\uff1a\u6d4b\u8bd5', type: 'STORY', cardlocation: 'GRAVE' });
  const target = testCard({ id: 'FREEZE_TARGET', fullName: 'Freeze Target', color: 'BLUE', acValue: 3, cardlocation: 'UNIT' });
  const payer = testCard({ id: 'WHITE_PAYER', fullName: 'White Payer', color: 'WHITE', cardlocation: 'UNIT' });
  (snow as any).data = {
    lastMovedByEffectTurn: 6,
    lastMoveEffectSourceCardId: shingiSource.gamecardId,
    placedByShingiEffectSourceCardId: shingiSource.gamecardId,
  };
  const state = game({
    unitZone: [snow, payer, null, null, null, null],
  }, {
    unitZone: [target, null, null, null, null, null],
  }, {
    turnCount: 6,
  });
  const effectIndex = (snow.effects || []).findIndex(effect => effect.id === '101000379_shingi_freeze');
  await ServerGameService.activateEffect(state, 'BOT', snow.gamecardId, effectIndex, undefined, { resumeFromQuery: true });

  if (state.pendingQuery?.type !== 'SELECT_PAYMENT') {
    return fail(name, `expected payment query, got ${state.pendingQuery?.type || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [JSON.stringify({ exhaustUnitIds: [payer.gamecardId] })]);

  await ServerGameService.resolveCounterStack(state);

  if (state.pendingQuery?.context?.effectId !== '101000379_shingi_freeze') {
    return fail(name, `expected freeze query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const frozen = (target as any).data?.freezeUntilTurn !== undefined;
  return frozen
    ? pass(name, `freezeUntil=${(target as any).data.freezeUntilTurn}`)
    : fail(name, `targetData=${JSON.stringify((target as any).data || {})}`);
}

async function testDefenseShieldPreventsOnlyNextBattleDestroy(): Promise<ScenarioResult> {
  const name = 'BT07-W07 Defense Shield prevents next battle destruction only';
  const shield = cloneScriptCard(bt07W07 as Card, 'PLAY');
  const target = testCard({ id: 'SHIELD_TARGET', fullName: 'Shield Target', cardlocation: 'UNIT' });
  const state = game({
    unitZone: [target, null, null, null, null, null],
    playZone: [shield],
  });
  const effect = shield.effects?.[0];
  if (!effect?.onQueryResolve) return fail(name, 'missing shield effect');

  await effect.onQueryResolve(shield, state, state.players.BOT, [target.gamecardId], { step: 'TARGET' });
  const first = await ServerGameService.destroyUnit(state, 'BOT', target.gamecardId);
  const second = await ServerGameService.destroyUnit(state, 'BOT', target.gamecardId);
  const condition = first === false && second === true && state.players.BOT.grave.some((card: Card) => card.gamecardId === target.gamecardId);
  return condition
    ? pass(name, `first=${first}, second=${second}`)
    : fail(name, `first=${first}, second=${second}, grave=${state.players.BOT.grave.length}`);
}

async function testTempleOrderDestroysBlueLowNonGod(): Promise<ScenarioResult> {
  const name = 'BT07-W08 Temple Order destroys blue low non-god field card';
  const order = cloneScriptCard(bt07W08 as Card, 'PLAY');
  const blue = testCard({ id: 'BLUE_LOW', fullName: 'Blue Low', color: 'BLUE', acValue: 3, cardlocation: 'UNIT' });
  const high = testCard({ id: 'BLUE_HIGH', fullName: 'Blue High', color: 'BLUE', acValue: 4, cardlocation: 'UNIT' });
  const state = game({
    playZone: [order],
  }, {
    unitZone: [blue, high, null, null, null, null],
  });
  const effect = order.effects?.[0];
  if (!effect?.onQueryResolve) return fail(name, 'missing temple order effect');

  await effect.onQueryResolve(order, state, state.players.BOT, [blue.gamecardId], { step: 'DESTROY_TARGET' });

  const destroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === blue.gamecardId);
  const highAlive = state.players.P1.unitZone.some((card: Card | null) => card?.gamecardId === high.gamecardId);
  return destroyed && highAlive
    ? pass(name, `destroyed=${destroyed}, highAlive=${highAlive}`)
    : fail(name, `destroyed=${destroyed}, highAlive=${highAlive}`);
}

async function testTempleOrderCountersBlueLowNonGodPlay(): Promise<ScenarioResult> {
  const name = 'BT07-W08 Temple Order counters opponent blue low non-god play';
  const order = cloneScriptCard(bt07W08 as Card, 'PLAY');
  const opponentCard = testCard({ id: 'BLUE_PLAY', fullName: 'Blue Play', type: 'UNIT', color: 'BLUE', acValue: 3, cardlocation: 'PLAY' });
  const erosion = testCard({ id: 'EROSION_BACK', fullName: 'Erosion Back', cardlocation: 'EROSION_BACK' });
  const state = game({
    playZone: [order],
    erosionBack: [erosion],
  }, {
    playZone: [opponentCard],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    counterStack: [{
      type: 'PLAY',
      card: opponentCard,
      ownerUid: 'P1',
      timestamp: Date.now(),
    }],
  });
  const effect = order.effects?.[0];
  if (!effect?.onQueryResolve) return fail(name, 'missing temple order effect');

  await effect.onQueryResolve(order, state, state.players.BOT, ['COUNTER'], { step: 'MODE' });

  const negated = !!state.counterStack[0]?.isNegated;
  return negated
    ? pass(name, 'opponent play negated')
    : fail(name, `negated=${negated}`);
}

const scenarios: ScenarioRun[] = [
  testPrepWorkerDestroysAfterShingiCostExile,
  testTwilightGuardProtectsAlliance,
  testNightMageRecoversAfterOpponentBounce,
  testHeavyKnightRecruitsAlliancePartner,
  testHeavyKnightPreventsFirstBattleDestroy,
  testWhiteWingExilesGodmarkToPutItem,
  testSnowGirlRecoversShingiOnEffectLeave,
  testSnowGirlFreezesAfterShingiEntry,
  testDefenseShieldPreventsOnlyNextBattleDestroy,
  testTempleOrderDestroysBlueLowNonGod,
  testTempleOrderCountersBlueLowNonGodPlay,
];

const results: ScenarioResult[] = [];
for (const scenario of scenarios) {
  try {
    results.push(await scenario());
  } catch (err) {
    results.push({
      name: scenario.name || 'anonymous',
      passed: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

for (const result of results) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}: ${result.detail}`);
}

const failed = results.filter(result => !result.passed);
if (failed.length > 0) {
  console.error(`\nBT07 scenarios failed: ${failed.length}/${results.length}`);
  process.exit(1);
}

console.log(`\nBT07 scenarios: ${results.length}/${results.length} passed`);
