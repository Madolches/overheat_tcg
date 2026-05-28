import { ServerGameService } from '../server/ServerGameService';
import { EventEngine } from '../src/services/EventEngine';
import { Card, TriggerLocation } from '../src/types/game';
import sp03W01 from '../src/scripts/101000291';
import sp03W02 from '../src/scripts/101000292';
import sp03W03 from '../src/scripts/101000293';
import sp03W04 from '../src/scripts/301000048';
import sp03R01 from '../src/scripts/102000288';
import sp03R02 from '../src/scripts/102000289';
import sp03R03 from '../src/scripts/102060290';
import sp03R07 from '../src/scripts/102000367';
import sp03G01 from '../src/scripts/103000299';
import sp03G02 from '../src/scripts/103000300';
import sp03G03 from '../src/scripts/103000301';
import sp03G04 from '../src/scripts/103000302';
import sp03G05 from '../src/scripts/103000303';
import sp03B01 from '../src/scripts/104000297';
import sp03B02 from '../src/scripts/104000298';
import sp03B03 from '../src/scripts/104000368';
import sp03B04 from '../src/scripts/304000057';
import sp03Y01 from '../src/scripts/105000294';
import sp03Y02 from '../src/scripts/105000295';
import sp03Y03 from '../src/scripts/105000296';
import sp03Y04 from '../src/scripts/305000049';
import { destroyByEffect } from '../src/scripts/BaseUtil';

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
    gameId: nextId('sp03_scenario'),
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

async function activateAndResolveByOpponentPass(state: any, playerUid: string, card: Card, effectIndex: number) {
  await ServerGameService.activateEffect(state, playerUid, card.gamecardId, effectIndex);
  if (
    state.pendingQuery?.callbackKey === 'DECLARE_EFFECT_TARGETS' ||
    state.pendingQuery?.callbackKey === 'DECLARE_EFFECT_TARGET_MODE'
  ) {
    return;
  }
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    const optionIds = (state.pendingQuery.options || []).map((option: any) => option.card?.gamecardId || option.id || option.value);
    const min = state.pendingQuery.minSelections || 1;
    await answerPendingQuery(state, state.pendingQuery.playerUid, optionIds.slice(0, min));
  }
  if (state.phase !== 'COUNTERING') {
    throw new Error(`Expected COUNTERING after activation, got ${state.phase}`);
  }
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
}

async function passIfCountering(state: any) {
  if (state.phase === 'COUNTERING') {
    await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  }
}

async function testPowderSnowAttackDestroysAndBoosts(): Promise<ScenarioResult> {
  const name = 'SP03-W01 destroys another Seiso on attack and boosts AC3 units';
  const powder = cloneScriptCard(sp03W01 as Card, 'UNIT');
  const gray = cloneScriptCard(sp03W02 as Card, 'UNIT', { isExhausted: false });
  const booster = testCard({ id: 'BOOSTER', fullName: 'AC3 Booster', acValue: 3, power: 1000, basePower: 1000, cardlocation: 'UNIT' });
  const cake = testCard({ id: '103000299', fullName: '清霜饼雪', acValue: 3, cardlocation: 'UNIT' });
  const state = game({
    unitZone: [powder, gray, booster, cake, null, null],
  }, {}, { phase: 'BATTLE_DECLARATION' });

  EventEngine.dispatchEvent(state, {
    type: 'CARD_ATTACK_DECLARED',
    playerUid: 'BOT',
    sourceCard: powder,
    sourceCardId: powder.gamecardId,
    data: { attackerIds: [powder.gamecardId], isAlliance: false },
  });
  await confirmTrigger(state, 'BOT');

  if (state.pendingQuery?.context?.effectId !== '101000291_attack_destroy_boost') {
    return fail(name, `expected destroy query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(gray.gamecardId) || options.includes(powder.gamecardId) || options.includes(cake.gamecardId)) {
    return fail(name, `unexpected options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [gray.gamecardId]);

  const grayDestroyed = state.players.BOT.grave.some((card: Card) => card.gamecardId === gray.gamecardId);
  const powderBoosted = powder.power === (powder.basePower || 0) + 1000;
  const boosterBoosted = booster.power === (booster.basePower || 0) + 1000;
  return grayDestroyed && powderBoosted && boosterBoosted
    ? pass(name, `destroyed=${grayDestroyed}, powderPower=${powder.power}, boosterPower=${booster.power}`)
    : fail(name, `destroyed=${grayDestroyed}, powder=${powder.power}, booster=${booster.power}`);
}

async function testPowderSnowLeaveDestroysLowUnit(): Promise<ScenarioResult> {
  const name = 'SP03-W01 destroys AC3 non-god when leaving by own effect';
  const powder = cloneScriptCard(sp03W01 as Card, 'UNIT');
  const source = testCard({ id: 'OWN_SOURCE', fullName: 'Own Source', cardlocation: 'UNIT' });
  const target = testCard({ id: 'LOW_TARGET', fullName: 'Low Target', acValue: 3, godMark: false, cardlocation: 'UNIT' });
  const high = testCard({ id: 'HIGH_TARGET', fullName: 'High Target', acValue: 4, godMark: false, cardlocation: 'UNIT' });
  const state = game({
    unitZone: [powder, source, null, null, null, null],
  }, {
    unitZone: [target, high, null, null, null, null],
  });

  destroyByEffect(state, powder, source);
  await confirmTrigger(state, 'BOT');

  if (state.pendingQuery?.context?.effectId !== '101000291_leave_destroy') {
    return fail(name, `expected leave destroy query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(target.gamecardId) || options.includes(high.gamecardId)) {
    return fail(name, `unexpected options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const destroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId);
  return destroyed
    ? pass(name, `destroyed=${destroyed}`)
    : fail(name, `grave=${state.players.P1.grave.map((card: Card) => card.fullName).join(',')}`);
}

async function testGraySnowIrodoriReadiesTwoSeiso(): Promise<ScenarioResult> {
  const name = 'SP03-W02 enters by irodori 2 and readies two Seiso units';
  const gray = cloneScriptCard(sp03W02 as Card, 'HAND');
  const redCost = testCard({ id: 'RED_COST', fullName: 'Red Cost', color: 'RED', cardlocation: 'GRAVE' });
  const greenCost = testCard({ id: 'GREEN_COST', fullName: 'Green Cost', color: 'GREEN', cardlocation: 'GRAVE' });
  const seisoA = cloneScriptCard(sp03W01 as Card, 'UNIT', { isExhausted: true });
  const seisoB = cloneScriptCard(sp03W03 as Card, 'UNIT', { isExhausted: true });
  const state = game({
    hand: [gray],
    grave: [redCost, greenCost],
    unitZone: [seisoA, seisoB, null, null, null, null],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', gray, 0);
  const entered = state.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === gray.gamecardId &&
    (unit as any).data?.enteredByIrodoriTurn === state.turnCount
  );
  await confirmTrigger(state, 'BOT');

  if (state.pendingQuery?.context?.step !== 'MODE') {
    return fail(name, `expected mode query, got ${state.pendingQuery?.context?.step || state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', ['SEISO_UNITS']);
  if (state.pendingQuery?.context?.step !== 'TARGET') {
    return fail(name, `expected target query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [seisoA.gamecardId, seisoB.gamecardId]);

  const costsExiled = [redCost, greenCost].every(cost => state.players.BOT.exile.some((card: Card) => card.gamecardId === cost.gamecardId));
  return entered && costsExiled && !seisoA.isExhausted && !seisoB.isExhausted
    ? pass(name, `entered=${entered}, costs=${state.players.BOT.exile.length}`)
    : fail(name, `entered=${entered}, costs=${costsExiled}, seisoA=${seisoA.isExhausted}, seisoB=${seisoB.isExhausted}`);
}

async function testPeonySnowModes(): Promise<ScenarioResult> {
  const name = 'SP03-W03 destroys paired targets and can set up Seiso recruit';
  const peony = cloneScriptCard(sp03W03 as Card, 'UNIT');
  const ownTarget = cloneScriptCard(sp03W01 as Card, 'UNIT');
  const enemyTarget = testCard({ id: 'ENEMY_LOW', fullName: 'Enemy Low', acValue: 3, type: 'ITEM', godMark: false, cardlocation: 'ITEM' });
  const state = game({
    unitZone: [peony, ownTarget, null, null, null, null],
  }, {
    itemZone: [enemyTarget],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', peony, 1);
  if (state.pendingQuery?.context?.step !== 'OWN_TARGET') {
    return fail(name, `expected own target query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [ownTarget.gamecardId]);
  if (state.pendingQuery?.context?.step !== 'OPP_TARGET') {
    return fail(name, `expected opponent target query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [enemyTarget.gamecardId]);
  await passIfCountering(state);

  const pairDestroyed = state.players.BOT.grave.some((card: Card) => card.gamecardId === ownTarget.gamecardId) &&
    state.players.P1.grave.some((card: Card) => card.gamecardId === enemyTarget.gamecardId);

  const setupPeony = cloneScriptCard(sp03W03 as Card, 'UNIT');
  const setupTarget = testCard({ id: 'SEISO_MARKED', fullName: '清霜标记目标', acValue: 3, cardlocation: 'UNIT' });
  const recruit = cloneScriptCard(sp03W02 as Card, 'DECK');
  const source = testCard({ id: 'DESTROY_SOURCE', fullName: 'Destroy Source', cardlocation: 'UNIT' });
  const setupState = game({
    deck: [recruit, ...deckCards(3, 'BOT_FILL')],
    unitZone: [setupPeony, setupTarget, source, null, null, null],
  });

  await activateAndResolveByOpponentPass(setupState, 'BOT', setupPeony, 1);
  await answerPendingQuery(setupState, 'BOT', [setupTarget.gamecardId]);
  await answerPendingQuery(setupState, 'BOT', []);
  await passIfCountering(setupState);
  destroyByEffect(setupState, setupTarget, source);
  await confirmTrigger(setupState, 'BOT');
  if (setupState.pendingQuery?.context?.effectId !== '101000293_marked_recruit') {
    return fail(name, `pairDestroyed=${pairDestroyed}, expected recruit query got ${setupState.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(setupState, 'BOT', [recruit.gamecardId]);

  const recruited = setupState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === recruit.gamecardId && unit.isExhausted);
  return pairDestroyed && recruited
    ? pass(name, `pairDestroyed=${pairDestroyed}, recruited=${recruited}`)
    : fail(name, `pairDestroyed=${pairDestroyed}, recruited=${recruited}`);
}

async function testSnowHouseDrawAndDamage(): Promise<ScenarioResult> {
  const name = 'SP03-W04 draws on own AC3 destroy and gives irodori attacker damage';
  const house = cloneScriptCard(sp03W04 as Card, 'ITEM');
  const peony = cloneScriptCard(sp03W03 as Card, 'UNIT');
  const victim = testCard({ id: 'SEISO_VICTIM', fullName: '清霜被破坏单位', acValue: 3, godMark: false, cardlocation: 'UNIT' });
  const source = testCard({ id: 'DESTROY_SOURCE', fullName: 'Destroy Source', cardlocation: 'UNIT' });
  const erosionA = testCard({ id: 'EROSION_A', fullName: 'Erosion A', cardlocation: 'EROSION_FRONT', displayState: 'FRONT_UPRIGHT' });
  const erosionB = testCard({ id: 'EROSION_B', fullName: 'Erosion B', cardlocation: 'EROSION_FRONT', displayState: 'FRONT_UPRIGHT' });
  const erosionC = testCard({ id: 'EROSION_C', fullName: 'Erosion C', cardlocation: 'EROSION_FRONT', displayState: 'FRONT_UPRIGHT' });
  const drawCard = testCard({ id: 'DRAW_CARD', fullName: 'Draw Card', cardlocation: 'DECK' });
  const state = game({
    deck: [drawCard],
    unitZone: [peony, victim, source, null, null, null],
    itemZone: [house],
    erosionFront: [erosionA, erosionB, erosionC],
  });

  EventEngine.recalculateContinuousEffects(state);
  destroyByEffect(state, victim, source);
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  const drew = state.players.BOT.hand.some((card: Card) => card.gamecardId === drawCard.gamecardId);

  EventEngine.dispatchEvent(state, {
    type: 'CARD_ATTACK_DECLARED',
    playerUid: 'BOT',
    sourceCard: peony,
    sourceCardId: peony.gamecardId,
    data: { attackerIds: [peony.gamecardId], isAlliance: false },
  });
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId === '301000048_irodori_attack_damage') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  const damageUp = peony.damage === (peony.baseDamage || 0) + 1;

  return drew && damageUp
    ? pass(name, `drew=${drew}, damage=${peony.damage}`)
    : fail(name, `drew=${drew}, damage=${peony.damage}, query=${state.pendingQuery?.callbackKey || 'none'}`);
}

async function testMochiyukiLeaveBoostsAccessThreeArmy(): Promise<ScenarioResult> {
  const name = 'SP03-G01 leaving by own effect boosts AC3 army damage and power';
  const mochi = cloneScriptCard(sp03G01 as Card, 'UNIT');
  const source = testCard({ id: 'OWN_SOURCE', fullName: 'Own Source', cardlocation: 'UNIT' });
  const ally = testCard({ id: 'AC3_ALLY', fullName: 'AC3 Ally', acValue: 3, power: 1000, basePower: 1000, damage: 1, baseDamage: 1, cardlocation: 'UNIT' });
  const high = testCard({ id: 'AC5_ALLY', fullName: 'AC5 Ally', acValue: 5, power: 3000, basePower: 3000, damage: 2, baseDamage: 2, cardlocation: 'UNIT' });
  const state = game({
    unitZone: [mochi, source, ally, high, null, null],
  });

  destroyByEffect(state, mochi, source);
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }

  const allyBoosted = ally.power === 2000 && ally.damage === 2;
  const highUnchanged = high.power === 3000 && high.damage === 2;
  return allyBoosted && highUnchanged
    ? pass(name, `ally=${ally.power}/${ally.damage}, high=${high.power}/${high.damage}`)
    : fail(name, `ally=${ally.power}/${ally.damage}, high=${high.power}/${high.damage}`);
}

async function testTamayukiRevivesSeisoFromGrave(): Promise<ScenarioResult> {
  const name = 'SP03-G02 leaving revives AC3 Seiso unit from grave';
  const tama = cloneScriptCard(sp03G02 as Card, 'UNIT');
  const source = testCard({ id: 'OWN_SOURCE', fullName: 'Own Source', cardlocation: 'UNIT' });
  const revive = cloneScriptCard(sp03W02 as Card, 'GRAVE');
  const high = testCard({ id: 'HIGH_SEISO', fullName: '清霜高费', acValue: 5, cardlocation: 'GRAVE' });
  const state = game({
    grave: [revive, high],
    unitZone: [tama, source, null, null, null, null],
  });

  destroyByEffect(state, tama, source);
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  if (state.pendingQuery?.context?.effectId !== '103000300_leave_revive_seiso') {
    return fail(name, `expected revive query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(revive.gamecardId) || options.includes(high.gamecardId)) {
    return fail(name, `options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [revive.gamecardId]);

  const live = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === revive.gamecardId);
  return live
    ? pass(name, `revived=${live}`)
    : fail(name, `unitZone=${state.players.BOT.unitZone.filter(Boolean).map((card: Card) => card.fullName).join(',')}`);
}

async function testFuyioriRecoverAndTransform(): Promise<ScenarioResult> {
  const name = 'SP03-G03 recovers Kuya from erosion and transforms a non-god unit';
  const fuyiori = cloneScriptCard(sp03G03 as Card, 'UNIT');
  const kuya = cloneScriptCard(sp03G05 as Card, 'EROSION_FRONT', { displayState: 'FRONT_UPRIGHT' });
  const discard = testCard({ id: 'DISCARD', fullName: 'Discard', cardlocation: 'HAND' });
  const state = game({
    hand: [discard],
    unitZone: [fuyiori, null, null, null, null, null],
    erosionFront: [kuya],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', fuyiori, 0);
  if (state.pendingQuery?.context?.step !== 'TARGET') {
    return fail(name, `expected erosion target query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [kuya.gamecardId]);
  await passIfCountering(state);
  if (state.pendingQuery?.context?.step !== 'DISCARD') {
    return fail(name, `expected discard query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [discard.gamecardId]);
  const recovered = state.players.BOT.hand.some((card: Card) => card.gamecardId === kuya.gamecardId);

  const transformFuyiori = cloneScriptCard(sp03G03 as Card, 'UNIT');
  const target = testCard({ id: 'TRANSFORM_TARGET', fullName: 'Transform Target', cardlocation: 'UNIT', godMark: false, power: 1000, basePower: 1000, damage: 1, baseDamage: 1 });
  const red = testCard({ id: 'RED_COST', color: 'RED', cardlocation: 'GRAVE' });
  const blue = testCard({ id: 'BLUE_COST', color: 'BLUE', cardlocation: 'GRAVE' });
  const transformState = game({
    grave: [red, blue],
    unitZone: [transformFuyiori, target, null, null, null, null],
  });

  await activateAndResolveByOpponentPass(transformState, 'BOT', transformFuyiori, 1);
  if (transformState.pendingQuery?.context?.step !== 'TARGET') {
    return fail(name, `recovered=${recovered}, expected transform target query got ${transformState.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(transformState, 'BOT', [target.gamecardId]);
  await passIfCountering(transformState);
  if (transformState.pendingQuery?.context?.step !== 'COST') {
    return fail(name, `expected transform cost query got ${transformState.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(transformState, 'BOT', [red.gamecardId, blue.gamecardId]);

  const transformed = target.power === 3500 && target.damage === 2 && !!target.isAnnihilation;
  const costsExiled = [red, blue].every(cost => transformState.players.BOT.exile.some((card: Card) => card.gamecardId === cost.gamecardId));
  return recovered && transformed && costsExiled
    ? pass(name, `recovered=${recovered}, transformed=${target.power}/${target.damage}`)
    : fail(name, `recovered=${recovered}, transformed=${transformed}, costs=${costsExiled}`);
}

async function testBellIrodoriRevivesFromGrave(): Promise<ScenarioResult> {
  const name = 'SP03-G04 enters by irodori 2 and revives eligible grave unit';
  const bell = cloneScriptCard(sp03G04 as Card, 'HAND');
  const redCost = testCard({ id: 'RED_COST', fullName: 'Red Cost', color: 'RED', cardlocation: 'GRAVE' });
  const greenCost = testCard({ id: 'GREEN_COST', fullName: 'Green Cost', color: 'GREEN', cardlocation: 'GRAVE' });
  const discard = cloneScriptCard(sp03W02 as Card, 'HAND', { gamecardId: 'BELL_DISCARD_UNIT' });
  const revive = cloneScriptCard(sp03W02 as Card, 'GRAVE');
  const invalid = testCard({ id: 'INVALID_REVIVE', fullName: 'Invalid Revive', type: 'UNIT', color: 'RED', acValue: 4, godMark: false, cardlocation: 'GRAVE' });
  const state = game({
    hand: [bell, discard],
    grave: [redCost, greenCost, revive, invalid],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', bell, 0);
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  if (state.pendingQuery?.context?.effectId !== '103000302_irodori_revive') {
    return fail(name, `expected revive query, got ${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(revive.gamecardId) || options.includes(invalid.gamecardId) || options.includes(discard.gamecardId)) {
    return fail(name, `options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [revive.gamecardId]);
  if (state.pendingQuery?.context?.step !== 'DISCARD') {
    return fail(name, `expected discard query, got ${state.pendingQuery?.context?.step || state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [discard.gamecardId]);

  const liveBell = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === bell.gamecardId);
  const liveRevive = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === revive.gamecardId);
  const discardStayedGrave = state.players.BOT.grave.some((card: Card) => card.gamecardId === discard.gamecardId);
  return liveBell && liveRevive && discardStayedGrave
    ? pass(name, `bell=${liveBell}, revive=${liveRevive}`)
    : fail(name, `bell=${liveBell}, revive=${liveRevive}, discard=${discardStayedGrave}`);
}

async function testKuyaBeastGirlSearchAndGravePut(): Promise<ScenarioResult> {
  const name = 'SP03-G05 searches Kuya from hand and can enter from grave after cost discard';
  const beastGirl = cloneScriptCard(sp03G05 as Card, 'HAND');
  const otherDiscard = testCard({ id: 'OTHER_DISCARD', fullName: 'Other Discard', cardlocation: 'HAND' });
  const search = cloneScriptCard(sp03G03 as Card, 'DECK');
  const fillerA = testCard({ id: 'FILLER_A', fullName: 'Filler A', cardlocation: 'DECK' });
  const fillerB = testCard({ id: 'FILLER_B', fullName: 'Filler B', cardlocation: 'DECK' });
  const fillerC = testCard({ id: 'FILLER_C', fullName: 'Filler C', cardlocation: 'DECK' });
  const state = game({
    hand: [beastGirl, otherDiscard],
    deck: [search, fillerA, fillerB, fillerC],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', beastGirl, 0);
  if (state.pendingQuery?.context?.step !== 'DISCARD') {
    return fail(name, `expected discard query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [otherDiscard.gamecardId]);
  if (state.pendingQuery?.context?.step !== 'SEARCH') {
    return fail(name, `expected search query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [search.gamecardId]);

  const searched = state.players.BOT.hand.some((card: Card) => card.gamecardId === search.gamecardId);
  const inGrave = state.players.BOT.grave.some((card: Card) => card.gamecardId === beastGirl.gamecardId);
  if (!searched || !inGrave) {
    return fail(name, `searched=${searched}, inGrave=${inGrave}`);
  }

  const graveCountBeforeSelfPut = state.players.BOT.grave.length;
  await activateAndResolveByOpponentPass(state, 'BOT', beastGirl, 1);
  const live = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === beastGirl.gamecardId);
  const milled = [fillerA, fillerB, fillerC].every(card =>
    state.players.BOT.grave.some((grave: Card) => grave.gamecardId === card.gamecardId)
  );
  return live && milled
    ? pass(name, `searched=${searched}, live=${live}, grave=${state.players.BOT.grave.length}`)
    : fail(name, `live=${live}, graveBefore=${graveCountBeforeSelfPut}, grave=${state.players.BOT.grave.length}`);
}

async function testKuyaColdDewSearchAndDestroy(): Promise<ScenarioResult> {
  const name = 'SP03-R01 searches Kuya and destroys ACCESS 3 non-god from grave';
  const coldDew = cloneScriptCard(sp03R01 as Card, 'HAND');
  const otherDiscard = testCard({ id: 'OTHER_DISCARD', fullName: 'Other Discard', cardlocation: 'HAND' });
  const search = cloneScriptCard(sp03R02 as Card, 'DECK');
  const target = testCard({ id: 'ACCESS3_TARGET', fullName: 'Access 3 Target', acValue: 3, godMark: false, cardlocation: 'UNIT' });
  const invalidHigh = testCard({ id: 'ACCESS4_TARGET', fullName: 'Access 4 Target', acValue: 4, godMark: false, cardlocation: 'UNIT' });
  const invalidGod = testCard({ id: 'GOD_TARGET', fullName: 'God Target', acValue: 3, godMark: true, cardlocation: 'UNIT' });
  const payerA = testCard({ id: 'COLD_DEW_PAYER_A', fullName: 'Cold Dew Payer A', color: 'RED', cardlocation: 'UNIT', isExhausted: false });
  const payerB = testCard({ id: 'COLD_DEW_PAYER_B', fullName: 'Cold Dew Payer B', color: 'RED', cardlocation: 'UNIT', isExhausted: false });
  const state = game({
    hand: [coldDew, otherDiscard],
    deck: [search],
    unitZone: [payerA, payerB, null, null, null, null],
  }, {
    unitZone: [target, invalidHigh, invalidGod, null, null, null],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', coldDew, 0);
  if (state.pendingQuery?.context?.step !== 'DISCARD') {
    return fail(name, `expected discard query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [otherDiscard.gamecardId]);
  if (state.pendingQuery?.context?.step !== 'SEARCH') {
    return fail(name, `expected search query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [search.gamecardId]);

  const searched = state.players.BOT.hand.some((card: Card) => card.gamecardId === search.gamecardId);
  const inGrave = state.players.BOT.grave.some((card: Card) => card.gamecardId === coldDew.gamecardId);
  if (!searched || !inGrave) {
    return fail(name, `searched=${searched}, inGrave=${inGrave}`);
  }

  await ServerGameService.activateEffect(state, 'BOT', coldDew.gamecardId, 1);
  if (state.pendingQuery?.context?.effectId !== '102000288_grave_destroy_access_three') {
    return fail(name, `expected destroy target query, got ${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(target.gamecardId) || options.includes(invalidHigh.gamecardId) || options.includes(invalidGod.gamecardId)) {
    return fail(name, `options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  if (state.pendingQuery?.callbackKey !== 'ACTIVATE_COST_RESOLVE') {
    return fail(name, `expected payment query, got ${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [JSON.stringify({ exhaustUnitIds: [payerA.gamecardId, payerB.gamecardId] })]);
  if (state.phase !== 'COUNTERING') {
    return fail(name, `expected COUNTERING after payment, got ${state.phase}`);
  }
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);

  const paid = payerA.isExhausted === true && payerB.isExhausted === true;
  const destroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId);
  return paid && destroyed
    ? pass(name, `searched=${searched}, paid=${paid}, destroyed=${destroyed}`)
    : fail(name, `paid=${paid}, destroyed=${destroyed}`);
}

async function testKuyaFrostRiverSearchAndRecover(): Promise<ScenarioResult> {
  const name = 'SP03-R02 searches Kuya and recovers other Kuya from grave';
  const frostRiver = cloneScriptCard(sp03R02 as Card, 'HAND');
  const otherDiscard = testCard({ id: 'OTHER_DISCARD', fullName: 'Other Discard', cardlocation: 'HAND' });
  const search = cloneScriptCard(sp03R01 as Card, 'DECK');
  const recover = cloneScriptCard(sp03G05 as Card, 'GRAVE');
  const sameName = cloneScriptCard(sp03R02 as Card, 'GRAVE');
  const state = game({
    hand: [frostRiver, otherDiscard],
    deck: [search],
    grave: [recover, sameName],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', frostRiver, 0);
  if (state.pendingQuery?.context?.step !== 'DISCARD') {
    return fail(name, `expected discard query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [otherDiscard.gamecardId]);
  await answerPendingQuery(state, 'BOT', [search.gamecardId]);

  const searched = state.players.BOT.hand.some((card: Card) => card.gamecardId === search.gamecardId);
  await activateAndResolveByOpponentPass(state, 'BOT', frostRiver, 1);
  if (state.pendingQuery?.context?.effectId !== '102000289_grave_recover_kuya') {
    return fail(name, `searched=${searched}, expected recover query got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(recover.gamecardId) || options.includes(sameName.gamecardId) || options.includes(frostRiver.gamecardId)) {
    return fail(name, `options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [recover.gamecardId]);
  await passIfCountering(state);

  const recovered = state.players.BOT.hand.some((card: Card) => card.gamecardId === recover.gamecardId);
  return searched && recovered
    ? pass(name, `searched=${searched}, recovered=${recovered}`)
    : fail(name, `searched=${searched}, recovered=${recovered}`);
}

async function testFlameRayIrodoriDestroysWithSacrifice(): Promise<ScenarioResult> {
  const name = 'SP03-R03 enters by irodori 2 and destroys non-god card with sacrifice';
  const flameRay = cloneScriptCard(sp03R03 as Card, 'HAND');
  const redSourceA = testCard({ id: 'R03_RED_SOURCE_A', fullName: 'Red Source A', color: 'RED', cardlocation: 'UNIT' });
  const redSourceB = testCard({ id: 'R03_RED_SOURCE_B', fullName: 'Red Source B', color: 'RED', cardlocation: 'UNIT' });
  const colorState = game({
    hand: [flameRay],
    unitZone: [redSourceA, null, null, null, null, null],
  });
  const needsTwoRed = !ServerGameService.canPlayCard(colorState, colorState.players.BOT, flameRay).canPlay;
  colorState.players.BOT.unitZone[1] = redSourceB;
  const twoRedPlayable = ServerGameService.canPlayCard(colorState, colorState.players.BOT, flameRay).canPlay;

  const redCost = testCard({ id: 'RED_COST', fullName: 'Red Cost', color: 'RED', cardlocation: 'GRAVE' });
  const greenCost = testCard({ id: 'GREEN_COST', fullName: 'Green Cost', color: 'GREEN', cardlocation: 'GRAVE' });
  const sacrifice = testCard({ id: 'SAC_UNIT', fullName: 'Sac Unit', color: 'BLUE', cardlocation: 'UNIT', godMark: false });
  const target = testCard({ id: 'NON_GOD_ITEM', fullName: 'Non God Item', type: 'ITEM', color: 'NONE', cardlocation: 'ITEM', godMark: false });
  const godTarget = testCard({ id: 'GOD_ITEM', fullName: 'God Item', type: 'ITEM', color: 'NONE', cardlocation: 'ITEM', godMark: true });
  const state = game({
    hand: [flameRay],
    grave: [redCost, greenCost],
    unitZone: [sacrifice, null, null, null, null, null],
  }, {
    itemZone: [target, godTarget],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', flameRay, 0);
  const entered = state.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === flameRay.gamecardId &&
    (unit as any).data?.enteredByIrodoriTurn === state.turnCount
  );
  const costsExiled = [redCost, greenCost].every(cost => state.players.BOT.exile.some((card: Card) => card.gamecardId === cost.gamecardId));

  await activateAndResolveByOpponentPass(state, 'BOT', flameRay, 1);
  if (state.pendingQuery?.context?.step !== 'TARGET') {
    return fail(name, `entered=${entered}, expected target query got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  const targetOptions = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!targetOptions.includes(target.gamecardId) || targetOptions.includes(godTarget.gamecardId)) {
    return fail(name, `targetOptions=${targetOptions.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  if (state.pendingQuery?.callbackKey !== 'ACTIVATE_COST_RESOLVE') {
    return fail(name, `expected cost query, got ${state.pendingQuery?.context?.step || state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [sacrifice.gamecardId]);
  await passIfCountering(state);

  const sacrificed = state.players.BOT.grave.some((card: Card) => card.gamecardId === sacrifice.gamecardId);
  const destroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId);
  return needsTwoRed && twoRedPlayable && entered && costsExiled && sacrificed && destroyed
    ? pass(name, `color=${needsTwoRed}/${twoRedPlayable}, entered=${entered}, destroyed=${destroyed}`)
    : fail(name, `color=${needsTwoRed}/${twoRedPlayable}, entered=${entered}, costs=${costsExiled}, sacrificed=${sacrificed}, destroyed=${destroyed}`);
}

async function testRainbowCeliaIrodoriContinuousAndReady(): Promise<ScenarioResult> {
  const name = 'SP03-R07 enters by irodori 5 and gains grave-color bonuses plus ready effect';
  const celia = cloneScriptCard(sp03R07 as Card, 'HAND');
  const costCards = [
    testCard({ id: 'COST_RED', fullName: 'Cost Red', color: 'RED', cardlocation: 'GRAVE' }),
    testCard({ id: 'COST_WHITE', fullName: 'Cost White', color: 'WHITE', cardlocation: 'GRAVE' }),
    testCard({ id: 'COST_YELLOW', fullName: 'Cost Yellow', color: 'YELLOW', cardlocation: 'GRAVE' }),
    testCard({ id: 'COST_BLUE', fullName: 'Cost Blue', color: 'BLUE', cardlocation: 'GRAVE' }),
    testCard({ id: 'COST_GREEN', fullName: 'Cost Green', color: 'GREEN', cardlocation: 'GRAVE' }),
  ];
  const bonusCards = [
    testCard({ id: 'BONUS_RED', fullName: 'Bonus Red', color: 'RED', cardlocation: 'GRAVE' }),
    testCard({ id: 'BONUS_BLUE', fullName: 'Bonus Blue', color: 'BLUE', cardlocation: 'GRAVE' }),
    testCard({ id: 'BONUS_GREEN', fullName: 'Bonus Green', color: 'GREEN', cardlocation: 'GRAVE' }),
  ];
  const discardCards = [
    testCard({ id: 'READY_COST_A', fullName: 'Ready Cost A', cardlocation: 'HAND' }),
    testCard({ id: 'READY_COST_B', fullName: 'Ready Cost B', cardlocation: 'HAND' }),
    testCard({ id: 'READY_COST_C', fullName: 'Ready Cost C', cardlocation: 'HAND' }),
  ];
  const state = game({
    hand: [celia, ...discardCards],
    grave: [...costCards, ...bonusCards],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', celia, 0);
  EventEngine.recalculateContinuousEffects(state);
  const live = state.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === celia.gamecardId);
  if (!live) {
    return fail(name, 'Celia did not enter battlefield');
  }
  const costExiled = costCards.every(cost => state.players.BOT.exile.some((card: Card) => card.gamecardId === cost.gamecardId));
  const keyworded = !!live.isrush && !!live.isHeroic && !!live.isAnnihilation;
  const protectedByAc4 = (live as any).data?.unaffectedByOpponentAcLe === 4 && (live as any).data?.cannotLeaveFieldByOpponentAcLe === 4;
  const statBonus = live.power === 3000 && live.damage === 3;

  live.isExhausted = true;
  await activateAndResolveByOpponentPass(state, 'BOT', live, 2);
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(state, 'BOT', discardCards.map(card => card.gamecardId));
  }
  const readied = live.isExhausted === false;
  const discarded = discardCards.every(cost => state.players.BOT.grave.some((card: Card) => card.gamecardId === cost.gamecardId));

  return costExiled && keyworded && protectedByAc4 && statBonus && readied && discarded
    ? pass(name, `stats=${live.power}/${live.damage}, readied=${readied}`)
    : fail(name, `costs=${costExiled}, keyworded=${keyworded}, protected=${protectedByAc4}, stats=${live.power}/${live.damage}, readied=${readied}, discarded=${discarded}`);
}

async function testKuyaDinnerGirlsSearchAndDraw(): Promise<ScenarioResult> {
  const name = 'SP03-B01 searches Kuya and draws from grave after cost discard';
  const girls = cloneScriptCard(sp03B01 as Card, 'HAND');
  const otherDiscard = testCard({ id: 'OTHER_DISCARD', fullName: 'Other Discard', cardlocation: 'HAND' });
  const search = cloneScriptCard(sp03B02 as Card, 'DECK');
  const draw = testCard({ id: 'DRAW_CARD', fullName: 'Draw Card', cardlocation: 'DECK' });
  const state = game({
    hand: [girls, otherDiscard],
    deck: [draw, search],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', girls, 0);
  if (state.pendingQuery?.context?.step !== 'DISCARD') {
    return fail(name, `expected discard query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [otherDiscard.gamecardId]);
  if (state.pendingQuery?.context?.step !== 'SEARCH') {
    return fail(name, `expected search query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [search.gamecardId]);
  const searched = state.players.BOT.hand.some((card: Card) => card.gamecardId === search.gamecardId);

  await activateAndResolveByOpponentPass(state, 'BOT', girls, 1);
  const drew = state.players.BOT.hand.some((card: Card) => card.gamecardId === draw.gamecardId);
  return searched && drew
    ? pass(name, `searched=${searched}, drew=${drew}`)
    : fail(name, `searched=${searched}, drew=${drew}`);
}

async function testXiaoxueIrodoriRecoversGraveOrErosion(): Promise<ScenarioResult> {
  const name = 'SP03-B02 enters by irodori 2 and recovers eligible grave or erosion cards';
  const xiaoxue = cloneScriptCard(sp03B02 as Card, 'HAND');
  const redCost = testCard({ id: 'RED_COST', fullName: 'Red Cost', color: 'RED', cardlocation: 'GRAVE' });
  const greenCost = testCard({ id: 'GREEN_COST', fullName: 'Green Cost', color: 'GREEN', cardlocation: 'GRAVE' });
  const graveRecover = cloneScriptCard(sp03R01 as Card, 'GRAVE');
  const erosionRecover = testCard({ id: 'EROSION_GREEN', fullName: 'Green Erosion', type: 'UNIT', color: 'GREEN', cardlocation: 'EROSION_FRONT', godMark: false, displayState: 'FRONT_UPRIGHT' });
  const invalidFacedown = testCard({ id: 'FACEDOWN_RED', fullName: 'Facedown Red', type: 'UNIT', color: 'RED', cardlocation: 'EROSION_FRONT', godMark: false, displayState: 'FRONT_FACEDOWN' });
  const invalidGod = testCard({ id: 'GOD_GREEN', fullName: 'God Green', type: 'UNIT', color: 'GREEN', cardlocation: 'GRAVE', godMark: true });
  const state = game({
    hand: [xiaoxue],
    grave: [redCost, greenCost, graveRecover, invalidGod],
    erosionFront: [erosionRecover, invalidFacedown],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', xiaoxue, 0);
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  if (state.pendingQuery?.context?.effectId !== '104000298_irodori_recover') {
    return fail(name, `expected recover query, got ${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}`);
  }
  const options = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!options.includes(graveRecover.gamecardId) || !options.includes(erosionRecover.gamecardId) || options.includes(invalidFacedown.gamecardId) || options.includes(invalidGod.gamecardId)) {
    return fail(name, `options=${options.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [erosionRecover.gamecardId]);

  const entered = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === xiaoxue.gamecardId);
  const recovered = state.players.BOT.hand.some((card: Card) => card.gamecardId === erosionRecover.gamecardId);
  const costsExiled = [redCost, greenCost].every(cost => state.players.BOT.exile.some((card: Card) => card.gamecardId === cost.gamecardId));
  return entered && recovered && costsExiled
    ? pass(name, `entered=${entered}, recovered=${recovered}`)
    : fail(name, `entered=${entered}, recovered=${recovered}, costs=${costsExiled}`);
}

async function testCocolaModesDamageExileAndCounter(): Promise<ScenarioResult> {
  const name = 'SP03-B03 damages opponent, exiles grave, and counters colored non-god card';
  const cocola = cloneScriptCard(sp03B03 as Card, 'UNIT');
  const discard = cloneScriptCard(sp03R01 as Card, 'HAND');
  const oppGraveA = testCard({ id: 'OPP_GRAVE_A', fullName: 'Opp Grave A', cardlocation: 'GRAVE' });
  const oppGraveB = testCard({ id: 'OPP_GRAVE_B', fullName: 'Opp Grave B', cardlocation: 'GRAVE' });
  const state = game({
    hand: [discard],
    unitZone: [cocola, null, null, null, null, null],
  }, {
    grave: [oppGraveA, oppGraveB],
  });

  const opponentDeckBefore = state.players.P1.deck.length;
  await activateAndResolveByOpponentPass(state, 'BOT', cocola, 1);
  if (state.pendingQuery?.callbackKey !== 'DECLARE_EFFECT_TARGET_MODE') {
    return fail(name, `expected mode query, got ${state.pendingQuery?.context?.step || state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', ['DAMAGE_EXILE']);
  if (state.pendingQuery?.context?.step !== 'PLAYER') {
    return fail(name, `expected player query, got ${state.pendingQuery?.context?.step || state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', ['PLAYER_OPPONENT']);
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(state, 'BOT', [discard.gamecardId]);
  }
  await passIfCountering(state);
  if (state.pendingQuery?.context?.step !== 'EXILE_GRAVE') {
    return fail(name, `expected exile query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [oppGraveA.gamecardId, oppGraveB.gamecardId]);

  const damaged = state.players.P1.deck.length === opponentDeckBefore - 2 || state.players.P1.erosionFront.length >= 2;
  const exiledGrave = [oppGraveA, oppGraveB].every(card => state.players.P1.exile.some((exiled: Card) => exiled.gamecardId === card.gamecardId));

  const counterCocola = cloneScriptCard(sp03B03 as Card, 'UNIT');
  const counterDiscard = testCard({ id: 'GREEN_DISCARD', fullName: 'Green Discard', color: 'GREEN', cardlocation: 'HAND' });
  const coloredPlay = testCard({ id: 'COLORED_PLAY', fullName: 'Colored Play', type: 'UNIT', color: 'RED', colorReq: { RED: 1 }, godMark: false, cardlocation: 'PLAY' });
  const noReqPlay = testCard({ id: 'NO_REQ_PLAY', fullName: 'No Req Play', type: 'UNIT', color: 'RED', colorReq: {}, godMark: false, cardlocation: 'PLAY' });
  const counterState = game({
    hand: [counterDiscard],
    unitZone: [counterCocola, null, null, null, null, null],
  }, {
    playZone: [coloredPlay, noReqPlay],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    isCountering: 1,
    priorityPlayerId: 'BOT',
    counterStack: [
      { type: 'PLAY', ownerUid: 'P1', card: noReqPlay, timestamp: 1 },
      { type: 'PLAY', ownerUid: 'P1', card: coloredPlay, timestamp: 2 },
    ],
  });

  await ServerGameService.activateEffect(counterState, 'BOT', counterCocola.gamecardId, 1);
  if (counterState.pendingQuery?.callbackKey === 'DECLARE_EFFECT_TARGET_MODE') {
    await answerPendingQuery(counterState, 'BOT', ['COUNTER']);
  }
  if (counterState.pendingQuery?.callbackKey === 'DECLARE_EFFECT_TARGETS') {
    await answerPendingQuery(counterState, 'BOT', ['RESOLVE']);
  }
  if (counterState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(counterState, 'BOT', [counterDiscard.gamecardId]);
  }
  await ServerGameService.passConfrontation(counterState, counterState.priorityPlayerId);
  const coloredNegated = counterState.players.P1.grave.some((card: Card) => card.gamecardId === coloredPlay.gamecardId);
  const noReqUnnegated = counterState.players.P1.unitZone.some((unit: Card | null) => unit?.gamecardId === noReqPlay.gamecardId);

  return damaged && exiledGrave && coloredNegated && noReqUnnegated
    ? pass(name, `damaged=${damaged}, exiled=${exiledGrave}, countered=${coloredNegated}`)
    : fail(name, `damaged=${damaged}, exiled=${exiledGrave}, colored=${coloredNegated}, noReq=${noReqUnnegated}`);
}

async function testTreasureBoxCountersAndSendsErosion(): Promise<ScenarioResult> {
  const name = 'SP03-B04 protects itself, counters non-god cards, and sends erosion to grave';
  const box = cloneScriptCard(sp03B04 as Card, 'ITEM');
  const godIrodori = cloneScriptCard(sp03B03 as Card, 'UNIT');
  const redHand = testCard({ id: 'RED_HAND', fullName: 'Red Hand', color: 'RED', cardlocation: 'HAND' });
  const greenHand = testCard({ id: 'GREEN_HAND', fullName: 'Green Hand', color: 'GREEN', cardlocation: 'HAND' });
  const erosion = [0, 1, 2, 3, 4].map(index => testCard({
    id: `EROSION_${index}`,
    fullName: `Erosion ${index}`,
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
  }));
  const opponentPlay = testCard({ id: 'OPP_NON_GOD', fullName: 'Opponent Non God', type: 'UNIT', color: 'RED', colorReq: { RED: 1 }, godMark: false, cardlocation: 'PLAY' });
  const state = game({
    hand: [redHand, greenHand],
    unitZone: [godIrodori, null, null, null, null, null],
    itemZone: [box],
    erosionFront: [...erosion],
  }, {
    playZone: [opponentPlay],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    isCountering: 1,
    priorityPlayerId: 'BOT',
    counterStack: [{ type: 'PLAY', ownerUid: 'P1', card: opponentPlay, timestamp: 1 }],
  });

  EventEngine.recalculateContinuousEffects(state);
  const protectedByEffect = (box as any).data?.cannotLeaveFieldByOpponentEffectTurn === state.turnCount;

  await ServerGameService.activateEffect(state, 'BOT', box.gamecardId, 1);
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(state, 'BOT', [redHand.gamecardId, greenHand.gamecardId]);
  }
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  const countered = state.players.P1.grave.some((card: Card) => card.gamecardId === opponentPlay.gamecardId);
  const costsDiscarded = [redHand, greenHand].every(cost => state.players.BOT.grave.some((card: Card) => card.gamecardId === cost.gamecardId));

  const discard = testCard({ id: 'EROSION_DISCARD', fullName: 'Erosion Discard', cardlocation: 'HAND' });
  const sendBox = cloneScriptCard(sp03B04 as Card, 'ITEM');
  const sendGod = cloneScriptCard(sp03B03 as Card, 'UNIT');
  const sendErosion = [0, 1, 2, 3, 4].map(index => testCard({
    id: `SEND_EROSION_${index}`,
    fullName: `Send Erosion ${index}`,
    cardlocation: 'EROSION_FRONT',
    displayState: 'FRONT_UPRIGHT',
  }));
  const sendState = game({
    hand: [discard],
    unitZone: [sendGod, null, null, null, null, null],
    itemZone: [sendBox],
    erosionFront: [...sendErosion],
  });

  EventEngine.recalculateContinuousEffects(sendState);
  await activateAndResolveByOpponentPass(sendState, 'BOT', sendBox, 2);
  if (sendState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(sendState, 'BOT', [discard.gamecardId]);
  }
  if (sendState.pendingQuery?.context?.step !== 'EROSION') {
    return fail(name, `protected=${protectedByEffect}, countered=${countered}, expected erosion query got ${sendState.pendingQuery?.context?.step || sendState.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(sendState, 'BOT', sendErosion.slice(0, 3).map(card => card.gamecardId));
  const sent = sendErosion.slice(0, 3).every(card => sendState.players.BOT.grave.some((grave: Card) => grave.gamecardId === card.gamecardId));

  return protectedByEffect && countered && costsDiscarded && sent
    ? pass(name, `protected=${protectedByEffect}, countered=${countered}, sent=${sent}`)
    : fail(name, `protected=${protectedByEffect}, countered=${countered}, costs=${costsDiscarded}, sent=${sent}`);
}

async function testLayukiAttackBoostAndDeckRecruit(): Promise<ScenarioResult> {
  const name = 'SP03-Y01 destroys Seiso on attack, boosts AC3+ units, and recruits from deck on leave';
  const layuki = cloneScriptCard(sp03Y01 as Card, 'UNIT');
  const seiso = cloneScriptCard(sp03W02 as Card, 'UNIT');
  const highAc = testCard({ id: 'HIGH_AC', fullName: 'High AC', acValue: 4, power: 1000, basePower: 1000, cardlocation: 'UNIT' });
  const recruit = cloneScriptCard(sp03W01 as Card, 'DECK');
  const state = game({
    deck: [recruit, ...deckCards(3, 'LAYUKI_FILL')],
    unitZone: [layuki, seiso, highAc, null, null, null],
  }, {}, { phase: 'BATTLE_DECLARATION' });

  EventEngine.dispatchEvent(state, {
    type: 'CARD_ATTACK_DECLARED',
    playerUid: 'BOT',
    sourceCard: layuki,
    sourceCardId: layuki.gamecardId,
    data: { attackerIds: [layuki.gamecardId], isAlliance: false },
  });
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId !== '105000294_attack_destroy_boost') {
    return fail(name, `expected attack query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [seiso.gamecardId]);
  const destroyed = state.players.BOT.grave.some((card: Card) => card.gamecardId === seiso.gamecardId);
  const layukiBoosted = layuki.power === (layuki.basePower || 0) + 1000;
  const highBoosted = highAc.power === (highAc.basePower || 0) + 1000;

  const source = testCard({ id: 'OWN_SOURCE', fullName: 'Own Source', cardlocation: 'UNIT' });
  state.players.BOT.unitZone[3] = source;
  destroyByEffect(state, layuki, source);
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId !== '105000294_leave_put_seiso_from_deck') {
    return fail(name, `destroyed=${destroyed}, boost=${layukiBoosted}/${highBoosted}, expected recruit query got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [recruit.gamecardId]);
  const recruited = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === recruit.gamecardId);

  return destroyed && layukiBoosted && highBoosted && recruited
    ? pass(name, `destroyed=${destroyed}, recruited=${recruited}`)
    : fail(name, `destroyed=${destroyed}, layuki=${layuki.power}, high=${highAc.power}, recruited=${recruited}`);
}

async function testWatayukiRedirectAndDeckPut(): Promise<ScenarioResult> {
  const name = 'SP03-Y02 redirects opponent attack and puts Seiso from deck';
  const watayuki = cloneScriptCard(sp03Y02 as Card, 'UNIT');
  const redirectTarget = cloneScriptCard(sp03W01 as Card, 'UNIT');
  const whiteCost = testCard({ id: 'WHITE_COST', fullName: 'White Cost', color: 'WHITE', cardlocation: 'GRAVE' });
  const greenCost = testCard({ id: 'GREEN_COST', fullName: 'Green Cost', color: 'GREEN', cardlocation: 'GRAVE' });
  const attacker = testCard({ id: 'OPP_ATTACKER', fullName: 'Opp Attacker', color: 'RED', cardlocation: 'UNIT', isExhausted: true });
  const state = game({
    grave: [whiteCost, greenCost],
    unitZone: [watayuki, redirectTarget, null, null, null, null],
  }, {
    unitZone: [attacker, null, null, null, null, null],
  }, {
    phase: 'BATTLE_DECLARATION',
    currentTurnPlayer: 1,
    battleState: {
      attackers: [attacker.gamecardId],
      isAlliance: false,
      defensePowerRestriction: 0,
      battleId: 'sp03_y02_redirect',
    },
  });
  state.players.BOT.isTurn = false;
  state.players.P1.isTurn = true;

  EventEngine.dispatchEvent(state, {
    type: 'CARD_ATTACK_DECLARED',
    playerUid: 'P1',
    sourceCard: attacker,
    sourceCardId: attacker.gamecardId,
    data: { attackerIds: [attacker.gamecardId], isAlliance: false },
  });
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(state, 'BOT', [whiteCost.gamecardId, greenCost.gamecardId]);
  }
  if (state.pendingQuery?.context?.effectId !== '105000295_redirect_attack') {
    const recentLogs = state.logs.slice(-8).map((entry: any) => typeof entry === 'string' ? entry : entry.message).join(' | ');
    const queueSize = state.triggeredEffectsQueue?.length ?? 0;
    return fail(name, `expected redirect query, got ${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}, queue=${queueSize}, logs=${recentLogs}`);
  }
  await answerPendingQuery(state, 'BOT', [redirectTarget.gamecardId]);
  const redirected = state.battleState?.defender === redirectTarget.gamecardId &&
    state.battleState?.unitTargetId === redirectTarget.gamecardId &&
    state.phase === 'BATTLE_FREE';
  const costsExiled = [whiteCost, greenCost].every(cost => state.players.BOT.exile.some((card: Card) => card.gamecardId === cost.gamecardId));

  const putWatayuki = cloneScriptCard(sp03Y02 as Card, 'UNIT');
  const discard = testCard({ id: 'DISCARD', fullName: 'Discard', cardlocation: 'HAND' });
  const recruit = cloneScriptCard(sp03Y01 as Card, 'DECK');
  const putState = game({
    hand: [discard],
    deck: [recruit, ...deckCards(3, 'WATAYUKI_FILL')],
    unitZone: [putWatayuki, null, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(putState, 'BOT', putWatayuki, 1);
  if (putState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(putState, 'BOT', [discard.gamecardId]);
  }
  if (putState.pendingQuery?.context?.step !== 'PUT') {
    return fail(name, `redirected=${redirected}, expected put query got ${putState.pendingQuery?.context?.step || putState.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(putState, 'BOT', [recruit.gamecardId]);
  const put = putState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === recruit.gamecardId);

  return redirected && costsExiled && put
    ? pass(name, `redirected=${redirected}, put=${put}`)
    : fail(name, `redirected=${redirected}, costs=${costsExiled}, put=${put}`);
}

async function testYukiIrodoriBlinksEligibleUnit(): Promise<ScenarioResult> {
  const name = 'SP03-Y03 enters by irodori 2 and blinks eligible unit';
  const yuki = cloneScriptCard(sp03Y03 as Card, 'HAND');
  const redCost = testCard({ id: 'RED_COST', fullName: 'Red Cost', color: 'RED', cardlocation: 'GRAVE' });
  const greenCost = testCard({ id: 'GREEN_COST', fullName: 'Green Cost', color: 'GREEN', cardlocation: 'GRAVE' });
  const target = testCard({ id: 'YELLOW_TARGET', fullName: 'Yellow Target', color: 'YELLOW', type: 'UNIT', godMark: false, cardlocation: 'UNIT', playedTurn: 1 });
  const state = game({
    hand: [yuki],
    grave: [redCost, greenCost],
    unitZone: [target, null, null, null, null, null],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', yuki, 0);
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  if (state.pendingQuery?.context?.effectId !== '105000296_irodori_blink') {
    return fail(name, `expected blink query, got ${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const entered = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === yuki.gamecardId);
  const blinked = state.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === target.gamecardId &&
    unit.playedTurn === state.turnCount &&
    unit.cardlocation === 'UNIT'
  );
  const costsExiled = [redCost, greenCost].every(cost => state.players.BOT.exile.some((card: Card) => card.gamecardId === cost.gamecardId));
  return entered && blinked && costsExiled
    ? pass(name, `entered=${entered}, blinked=${blinked}`)
    : fail(name, `entered=${entered}, blinked=${blinked}, costs=${costsExiled}`);
}

async function testTwilightBeachBuffProtectAndDraw(): Promise<ScenarioResult> {
  const name = 'SP03-Y04 protects itself, buffs non-god units, and sacrifices to draw';
  const beach = cloneScriptCard(sp03Y04 as Card, 'ITEM');
  const godIrodori = cloneScriptCard(sp03B03 as Card, 'UNIT');
  const nonGod = cloneScriptCard(sp03Y01 as Card, 'UNIT', { power: 2500, basePower: 2500 });
  const godUnit = cloneScriptCard(sp03Y02 as Card, 'UNIT', { power: 2500, basePower: 2500 });
  const erosion = testCard({ id: 'EROSION', fullName: 'Erosion', cardlocation: 'EROSION_FRONT', displayState: 'FRONT_UPRIGHT' });
  const draw = testCard({ id: 'DRAW_CARD', fullName: 'Draw Card', cardlocation: 'DECK' });
  const state = game({
    deck: [draw],
    unitZone: [godIrodori, nonGod, godUnit, null, null, null],
    itemZone: [beach],
    erosionFront: [erosion],
  });

  EventEngine.recalculateContinuousEffects(state);
  const protectedByEffect = (beach as any).data?.cannotLeaveFieldByOpponentEffectTurn === state.turnCount;
  const nonGodBuffed = nonGod.power === (nonGod.basePower || 0) + 500;
  const godUnchanged = godUnit.power === (godUnit.basePower || 0);

  await activateAndResolveByOpponentPass(state, 'BOT', beach, 2);
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(state, 'BOT', [nonGod.gamecardId]);
  }
  const sacrificed = state.players.BOT.grave.some((card: Card) => card.gamecardId === nonGod.gamecardId);
  const drew = state.players.BOT.hand.some((card: Card) => card.gamecardId === draw.gamecardId);

  return protectedByEffect && nonGodBuffed && godUnchanged && sacrificed && drew
    ? pass(name, `protected=${protectedByEffect}, drew=${drew}`)
    : fail(name, `protected=${protectedByEffect}, nonGod=${nonGod.power}, god=${godUnit.power}, sacrificed=${sacrificed}, drew=${drew}`);
}

const scenarios: { name: string; run: ScenarioRun }[] = [
  { name: 'SP03-W01 destroys another Seiso on attack and boosts AC3 units', run: testPowderSnowAttackDestroysAndBoosts },
  { name: 'SP03-W01 destroys AC3 non-god when leaving by own effect', run: testPowderSnowLeaveDestroysLowUnit },
  { name: 'SP03-W02 enters by irodori 2 and readies two Seiso units', run: testGraySnowIrodoriReadiesTwoSeiso },
  { name: 'SP03-W03 destroys paired targets and can set up Seiso recruit', run: testPeonySnowModes },
  { name: 'SP03-W04 draws on own AC3 destroy and gives irodori attacker damage', run: testSnowHouseDrawAndDamage },
  { name: 'SP03-G01 leaving by own effect boosts AC3 army damage and power', run: testMochiyukiLeaveBoostsAccessThreeArmy },
  { name: 'SP03-G02 leaving revives AC3 Seiso unit from grave', run: testTamayukiRevivesSeisoFromGrave },
  { name: 'SP03-G03 recovers Kuya from erosion and transforms a non-god unit', run: testFuyioriRecoverAndTransform },
  { name: 'SP03-G04 enters by irodori 2 and revives eligible grave unit', run: testBellIrodoriRevivesFromGrave },
  { name: 'SP03-G05 searches Kuya from hand and can enter from grave after cost discard', run: testKuyaBeastGirlSearchAndGravePut },
  { name: 'SP03-R01 searches Kuya and destroys ACCESS 3 non-god from grave', run: testKuyaColdDewSearchAndDestroy },
  { name: 'SP03-R02 searches Kuya and recovers other Kuya from grave', run: testKuyaFrostRiverSearchAndRecover },
  { name: 'SP03-R03 enters by irodori 2 and destroys non-god card with sacrifice', run: testFlameRayIrodoriDestroysWithSacrifice },
  { name: 'SP03-R07 enters by irodori 5 and gains grave-color bonuses plus ready effect', run: testRainbowCeliaIrodoriContinuousAndReady },
  { name: 'SP03-B01 searches Kuya and draws from grave after cost discard', run: testKuyaDinnerGirlsSearchAndDraw },
  { name: 'SP03-B02 enters by irodori 2 and recovers eligible grave or erosion cards', run: testXiaoxueIrodoriRecoversGraveOrErosion },
  { name: 'SP03-B03 damages opponent, exiles grave, and counters colored non-god card', run: testCocolaModesDamageExileAndCounter },
  { name: 'SP03-B04 protects itself, counters non-god cards, and sends erosion to grave', run: testTreasureBoxCountersAndSendsErosion },
  { name: 'SP03-Y01 destroys Seiso on attack, boosts AC3+ units, and recruits from deck on leave', run: testLayukiAttackBoostAndDeckRecruit },
  { name: 'SP03-Y02 redirects opponent attack and puts Seiso from deck', run: testWatayukiRedirectAndDeckPut },
  { name: 'SP03-Y03 enters by irodori 2 and blinks eligible unit', run: testYukiIrodoriBlinksEligibleUnit },
  { name: 'SP03-Y04 protects itself, buffs non-god units, and sacrifices to draw', run: testTwilightBeachBuffProtectAndDraw },
];

async function main() {
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    try {
      results.push(await scenario.run());
    } catch (err: any) {
      results.push({ name: scenario.name, passed: false, detail: err?.stack || err?.message || String(err) });
    }
  }

  for (const result of results) {
    const marker = result.passed ? 'PASS' : 'FAIL';
    console.log(`[${marker}] ${result.name} - ${result.detail}`);
  }

  const failed = results.filter(result => !result.passed);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
