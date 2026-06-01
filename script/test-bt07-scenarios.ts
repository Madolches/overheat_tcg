import { ServerGameService } from '../server/ServerGameService';
import { initServerCardLibrary } from '../server/card_loader';
import { GameService } from '../src/services/gameService';
import { EventEngine } from '../src/services/EventEngine';
import { AtomicEffectExecutor } from '../src/services/AtomicEffectExecutor';
import { Card, TriggerLocation } from '../src/types/game';
import bt07W01 from '../src/scripts/101140374';
import bt07W02 from '../src/scripts/101130375';
import bt07W03 from '../src/scripts/101130376';
import bt07W04 from '../src/scripts/101130377';
import bt07W05 from '../src/scripts/101130378';
import bt07W06 from '../src/scripts/101000379';
import bt07W07 from '../src/scripts/201130109';
import bt07W08 from '../src/scripts/201000110';
import bt07W09 from '../src/scripts/301140059';
import bt07W10 from '../src/scripts/301130060';
import bt07W11 from '../src/scripts/101130380';
import bt07W12 from '../src/scripts/201000114';
import prSnowFantasy from '../src/scripts/202000113';
import prOtherworldFantasy from '../src/scripts/205000117';
import prDeepSeaFantasy from '../src/scripts/204000115';
import prConveyedThoughts from '../src/scripts/203000116';
import bt07B01 from '../src/scripts/104020304';
import bt07B02 from '../src/scripts/104030305';
import bt07B03 from '../src/scripts/104030306';
import bt07B04 from '../src/scripts/104030307';
import bt07B05 from '../src/scripts/104010308';
import bt07B06 from '../src/scripts/104000309';
import bt07B07 from '../src/scripts/204000091';
import bt07B08 from '../src/scripts/204000092';
import bt07B09 from '../src/scripts/304020050';
import bt07B10 from '../src/scripts/304010051';
import bt07B11 from '../src/scripts/104020310';
import bt07G01 from '../src/scripts/103090311';
import bt07G02 from '../src/scripts/103080312';
import bt07G03 from '../src/scripts/103080313';
import bt07G04 from '../src/scripts/103080314';
import bt07G05 from '../src/scripts/103080315';
import bt07G06 from '../src/scripts/103080316';
import bt07G07 from '../src/scripts/103080317';
import bt07G08 from '../src/scripts/203000093';
import bt07G09 from '../src/scripts/203000094';
import bt07G10 from '../src/scripts/303000052';
import bt07G11 from '../src/scripts/103000318';
import bt05G05 from '../src/scripts/103080213';
import bt07R01 from '../src/scripts/102050319';
import bt07R02 from '../src/scripts/102060320';
import bt07R03 from '../src/scripts/102060321';
import bt07R04 from '../src/scripts/102060369';
import bt07R05 from '../src/scripts/102070370';
import bt07R06 from '../src/scripts/102070371';
import bt07R07 from '../src/scripts/102000372';
import bt07R08 from '../src/scripts/202000107';
import bt07R09 from '../src/scripts/202000108';
import bt07R10 from '../src/scripts/302000058';
import bt07R11 from '../src/scripts/102060373';
import bt05R07 from '../src/scripts/102060244';
import bt04R07 from '../src/scripts/102060433';
import bt07Y01 from '../src/scripts/105110381';
import bt07Y02 from '../src/scripts/105110382';
import bt07Y03 from '../src/scripts/105110383';
import bt07Y04 from '../src/scripts/105000384';
import bt07Y05 from '../src/scripts/105000385';
import bt07Y06 from '../src/scripts/205000111';
import bt07Y07 from '../src/scripts/205000112';
import bt07Y08 from '../src/scripts/305110061';
import bt07Y09 from '../src/scripts/305000062';
import bt07Y10 from '../src/scripts/305000063';
import bt07Y11 from '../src/scripts/105110386';
import bt08G05 from '../src/scripts/103000419';
import bt03R03 from '../src/scripts/102060192';
import bt03R04 from '../src/scripts/102060193';
import bt03R07 from '../src/scripts/102060196';
import rafa from '../src/scripts/102060244';
import annihilationAngels from '../src/scripts/101130104';
import {
  addContinuousPower,
  awakenUnit,
  destroyByEffect,
  markReturnToDeckBottomAtEnd,
  moveCardAsCost,
  revealDeckCards,
  totalUnitsSentFromFieldToGraveThisTurn,
  wealthCount
} from '../src/scripts/BaseUtil';

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

async function processTurnEndDelayedEffects(state: any, playerUid = 'BOT') {
  EventEngine.dispatchEvent(state, { type: 'TURN_END' as any, playerUid });
  ServerGameService.enqueueMandatoryEndTurnDelayedEffects(state, playerUid);
  await ServerGameService.checkTriggeredEffects(state);
  await ServerGameService.checkTriggeredEffects(state);
}

function optionIdByValue(state: any, value: string): string {
  const option = (state.pendingQuery?.options || []).find((entry: any) =>
    entry.value === value || entry.id === value || entry.optionCode === value
  );
  if (!option) throw new Error(`No option ${value} in pending query`);
  return option.id;
}

async function testPrepWorkerDestroysAfterShingiCostExile(): Promise<ScenarioResult> {
  const name = 'BT07-W01 prep worker pays 2 to destroy non-god unit after Shingi cost exile';
  const worker = cloneScriptCard(bt07W01 as Card, 'UNIT');
  const shingi = testCard({ id: 'SHINGI_STORY', fullName: '神仪：测试', type: 'STORY', cardlocation: 'PLAY' });
  const payer = testCard({ id: 'W01_PAYER', fullName: 'Payer', acValue: 2, cardlocation: 'UNIT' });
  const target = testCard({ id: 'AC3_TARGET', fullName: 'AC3 Target', acValue: 3, cardlocation: 'UNIT' });
  const godTarget = testCard({ id: 'GOD_TARGET', fullName: 'God Target', acValue: 1, godMark: true, cardlocation: 'UNIT' });
  const state = game({
    unitZone: [worker, payer, null, null, null, null],
    playZone: [shingi],
  }, {
    unitZone: [target, godTarget, null, null, null, null],
  });

  moveCardAsCost(state, 'BOT', worker, 'EXILE', shingi);
  await confirmTrigger(state, 'BOT');

  if (state.pendingQuery?.type !== 'SELECT_PAYMENT') {
    return fail(name, `expected payment query, got ${state.pendingQuery?.type || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [JSON.stringify({ exhaustUnitIds: [payer.gamecardId] })]);

  if (state.pendingQuery?.context?.effectId !== '101140374_shingi_cost_destroy') {
    return fail(name, `expected destroy query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  const optionIds = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
  if (!optionIds.includes(target.gamecardId) || optionIds.includes(godTarget.gamecardId)) {
    return fail(name, `options=${optionIds.join(',')}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const destroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId);
  const paid = !!payer.isExhausted;
  return destroyed && paid
    ? pass(name, `destroyed=${destroyed}, paid=${paid}, options=${optionIds.length}`)
    : fail(name, `destroyed=${destroyed}, paid=${paid}, grave=${state.players.P1.grave.map((card: Card) => card.fullName).join(',')}`);
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

async function testHeavyKnightRecruitedAngelsDealAnnihilationDamage(): Promise<ScenarioResult> {
  const name = 'BT07-W04 Heavy Knight recruited Annihilation Angels deals annihilation damage';
  const heavy = cloneScriptCard(bt07W04 as Card, 'UNIT', {
    power: 1000,
    basePower: 1000,
    playedTurn: 1,
  });
  const angels = cloneScriptCard(annihilationAngels as Card, 'DECK', {
    power: 2500,
    basePower: 2500,
    damage: 2,
    baseDamage: 2,
    isAnnihilation: false,
    baseAnnihilation: false,
    playedTurn: 1,
  });
  const defender = testCard({
    id: 'HEAVY_ANGELS_DEFENDER',
    fullName: 'Heavy Angels Defender',
    cardlocation: 'UNIT',
    power: 1500,
    basePower: 1500,
  });
  const state = game({
    deck: [angels, ...deckCards(3, 'HEAVY_ANGELS_FILL')],
    grave: [testCard({ id: 'HEAVY_ANGELS_GRAVE', cardlocation: 'GRAVE' })],
    unitZone: [heavy, null, null, null, null, null],
  }, {
    unitZone: [defender, null, null, null, null, null],
  }, {
    phase: 'BATTLE_DECLARATION',
    battleState: {
      attackers: [heavy.gamecardId],
      defender: defender.gamecardId,
      unitTargetId: defender.gamecardId,
      isAlliance: false,
      resolvedUnitIds: [],
      battleId: 'heavy_recruited_angels_annihilation',
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
    return fail(name, `expected recruit query, got ${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [angels.gamecardId]);

  const liveAngels = state.players.BOT.unitZone.find((card: Card | null) => card?.gamecardId === angels.gamecardId);
  EventEngine.recalculateContinuousEffects(state);
  const gainedAnnihilation = !!liveAngels?.isAnnihilation;
  state.phase = 'DAMAGE_CALCULATION';
  await ServerGameService.resolveDamage(state);

  const defenderDestroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === defender.gamecardId);
  const heavySurvived = state.players.BOT.unitZone.some((card: Card | null) => card?.gamecardId === heavy.gamecardId);
  const angelsSurvived = state.players.BOT.unitZone.some((card: Card | null) => card?.gamecardId === angels.gamecardId);
  const annihilationDamage = state.players.P1.erosionFront.filter(Boolean).length === 2;
  const angelsTriggerPending = state.pendingQuery?.context?.effectId === '101130104_damage_bottom';

  return defenderDestroyed && heavySurvived && angelsSurvived && gainedAnnihilation && annihilationDamage && angelsTriggerPending
    ? pass(name, `damage=${state.players.P1.erosionFront.filter(Boolean).length}, pending=${state.pendingQuery?.context?.effectId}`)
    : fail(name, `destroyed=${defenderDestroyed}, heavy=${heavySurvived}, angels=${angelsSurvived}, annihilation=${gainedAnnihilation}, damage=${state.players.P1.erosionFront.filter(Boolean).length}, pending=${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}`);
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

async function testDawnChapelDrawsAndBlocksConfrontingShingi(): Promise<ScenarioResult> {
  const name = 'BT07-W09 Dawn Chapel makes Shingi plays uncounterable and draws on Shingi entry';
  const uncounterChapel = cloneScriptCard(bt07W09 as Card, 'ITEM');
  const shingi = testCard({ id: 'SHINGI_PLAY', fullName: '神仪：测试', type: 'STORY', color: 'WHITE', cardlocation: 'HAND', acValue: 0 });
  const uncounterState = game({
    hand: [shingi],
    itemZone: [uncounterChapel],
  }, {}, {
    phase: 'MAIN',
    turnCount: 6,
  });

  await ServerGameService.playCard(uncounterState, 'BOT', shingi.gamecardId, {});
  const uncounterable = uncounterState.phase === 'COUNTERING' && uncounterState.priorityPlayerId === 'BOT';

  const chapel = cloneScriptCard(bt07W09 as Card, 'ITEM');
  const shingiSource = testCard({ id: 'SHINGI_SOURCE', fullName: '神仪：测试', type: 'STORY', cardlocation: 'GRAVE' });
  const placed = testCard({
    id: 'SHINGI_PLACED',
    fullName: 'Shingi Placed',
    type: 'UNIT',
    color: 'WHITE',
    cardlocation: 'DECK',
    data: { placedByShingiEffectSourceName: '神仪：测试' },
  } as any);
  const state = game({
    grave: [shingiSource],
    deck: [placed, ...deckCards(3, 'W09_DRAW_FILL')],
    itemZone: [chapel],
  }, {}, {
    phase: 'MAIN',
    turnCount: 6,
  });

  ServerGameService.moveCard(state, 'BOT', 'DECK', 'BOT', 'UNIT', placed.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'BOT',
    effectSourceCardId: shingiSource.gamecardId,
  });
  await confirmTrigger(state, 'BOT');

  const drew = state.players.BOT.hand.length === 1;
  return uncounterable && drew
    ? pass(name, `priority=${uncounterState.priorityPlayerId}, hand=${state.players.BOT.hand.length}`)
    : fail(name, `priority=${uncounterState.priorityPlayerId}, hand=${state.players.BOT.hand.length}`);
}

async function testDuskBarracksRecruitAndSubstitute(): Promise<ScenarioResult> {
  const name = 'BT07-W10 Dusk Barracks recruits and exhausts to substitute opponent effect destroy';
  const barracks = cloneScriptCard(bt07W10 as Card, 'ITEM');
  const discard = testCard({ id: 'W10_DISCARD', fullName: 'Discard', cardlocation: 'HAND' });
  const recruit = testCard({ id: 'W10_RECRUIT', fullName: '圣王国 Recruit', faction: '圣王国', acValue: 3, godMark: false, cardlocation: 'DECK' });
  const high = testCard({ id: 'W10_HIGH', fullName: '圣王国 High', faction: '圣王国', acValue: 4, godMark: false, cardlocation: 'DECK' });
  const state = game({
    hand: [discard],
    deck: [recruit, high, ...deckCards(3, 'W10_FILL')],
    itemZone: [barracks],
  });
  const effectIndex = barracks.effects?.findIndex(effect => effect.id === '301130060_recruit_holy_kingdom') ?? -1;
  await ServerGameService.activateEffect(state, 'BOT', barracks.gamecardId, effectIndex);
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(state, 'BOT', [discard.gamecardId]);
  }
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  if (state.pendingQuery?.context?.effectId === '301130060_recruit_holy_kingdom') {
    const optionIds = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
    if (!optionIds.includes(recruit.gamecardId) || optionIds.includes(high.gamecardId)) {
      return fail(name, `recruit options=${optionIds.join(',')}`);
    }
    await answerPendingQuery(state, 'BOT', [recruit.gamecardId]);
  }
  const recruited = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === recruit.gamecardId);

  const substituteBarracks = cloneScriptCard(bt07W10 as Card, 'ITEM');
  const units = [0, 1, 2].map(index => testCard({ id: `W10_UNIT_${index}`, fullName: `圣王国 Unit ${index}`, faction: '圣王国', cardlocation: 'UNIT' }));
  const victim = testCard({ id: 'W10_VICTIM', fullName: 'Victim', faction: 'Other', cardlocation: 'UNIT' });
  const destroySource = testCard({ id: 'W10_SOURCE', fullName: 'Opponent Destroy', cardlocation: 'UNIT' });
  const subState = game({
    unitZone: [victim, ...units, null, null],
    itemZone: [substituteBarracks],
    erosionFront: [
      testCard({ id: 'W10_EF_0', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'W10_EF_1', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'W10_EF_2', cardlocation: 'EROSION_FRONT' }),
    ],
  }, {
    unitZone: [destroySource, null, null, null, null, null],
  });
  EventEngine.recalculateContinuousEffects(subState);
  await ServerGameService.destroyUnit(subState, 'BOT', victim.gamecardId, true, 'P1');
  if (subState.pendingQuery?.callbackKey === 'SUBSTITUTION_CHOICE') {
    await answerPendingQuery(subState, 'BOT', ['YES']);
  }
  const protectedVictim = subState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === victim.gamecardId);
  const barracksExhausted = substituteBarracks.isExhausted;

  return recruited && protectedVictim && barracksExhausted
    ? pass(name, `recruited=${recruited}, protected=${protectedVictim}, exhausted=${barracksExhausted}`)
    : fail(name, `recruited=${recruited}, protected=${protectedVictim}, exhausted=${barracksExhausted}`);
}

async function testYukatiaAllianceProtectionAndDestroy(): Promise<ScenarioResult> {
  const name = 'BT07-W11 Yukatia protects itself on alliance attack and destroys non-god field card';
  const yukatia = cloneScriptCard(bt07W11 as Card, 'UNIT');
  const partner = testCard({ id: 'W11_PARTNER', fullName: '圣王国 Partner', faction: '圣王国', cardlocation: 'UNIT' });
  const target = testCard({ id: 'W11_TARGET', fullName: 'Target Item', type: 'ITEM', godMark: false, cardlocation: 'ITEM' });
  const godTarget = testCard({ id: 'W11_GOD', fullName: 'God Target', type: 'ITEM', godMark: true, cardlocation: 'ITEM' });
  const state = game({
    unitZone: [yukatia, partner, null, null, null, null],
    erosionBack: [
      testCard({ id: 'W11_EB_0', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'W11_EB_1', cardlocation: 'EROSION_BACK' }),
    ],
  }, {
    itemZone: [target, godTarget],
  }, {
    phase: 'BATTLE_DECLARATION',
  });
  await ServerGameService.declareAttack(state, 'BOT', [yukatia.gamecardId, partner.gamecardId], true, 'NO_PROMPT', true);
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  const protectedUntil = (yukatia as any).data?.preventNextBattleDestroyUntilTurn;
  const effectIndex = yukatia.effects?.findIndex(effect => effect.id === '101130380_alliance_destroy') ?? -1;
  await ServerGameService.activateEffect(state, 'BOT', yukatia.gamecardId, effectIndex);
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  if (state.pendingQuery?.context?.effectId === '101130380_alliance_destroy') {
    const optionIds = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
    if (!optionIds.includes(target.gamecardId) || optionIds.includes(godTarget.gamecardId)) {
      return fail(name, `destroy options=${optionIds.join(',')}`);
    }
    await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  }
  const destroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === target.gamecardId);

  const frontOnlyYukatia = cloneScriptCard(bt07W11 as Card, 'UNIT', { gamecardId: 'W11_FRONT_ONLY' });
  const frontOnlyPartner = testCard({ id: 'W11_FRONT_PARTNER', fullName: '圣王国 Partner', faction: '圣王国', cardlocation: 'UNIT' });
  const frontOnlyTarget = testCard({ id: 'W11_FRONT_TARGET', type: 'ITEM', godMark: false, cardlocation: 'ITEM' });
  const frontOnlyState = game({
    unitZone: [frontOnlyYukatia, frontOnlyPartner, null, null, null, null],
    erosionFront: [
      testCard({ id: 'W11_FRONT_EF_0', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'W11_FRONT_EF_1', cardlocation: 'EROSION_FRONT' }),
    ],
  }, {
    itemZone: [frontOnlyTarget],
  }, {
    phase: 'BATTLE_FREE',
    battleState: {
      attackers: [frontOnlyYukatia.gamecardId, frontOnlyPartner.gamecardId],
      isAlliance: true,
    },
  });
  const frontOnlyBlocked = !ServerGameService.checkEffectLimitsAndReqs(
    frontOnlyState,
    'BOT',
    frontOnlyYukatia,
    frontOnlyYukatia.effects![effectIndex],
    'UNIT'
  ).valid;

  return protectedUntil !== undefined && destroyed && frontOnlyBlocked
    ? pass(name, `protectedUntil=${protectedUntil}, destroyed=${destroyed}, frontOnlyBlocked=${frontOnlyBlocked}`)
    : fail(name, `protectedUntil=${protectedUntil}, destroyed=${destroyed}, frontOnlyBlocked=${frontOnlyBlocked}`);
}

async function testEmptyFantasyRecoverAndPreventEffectDamage(): Promise<ScenarioResult> {
  const name = 'BT07-02W Empty Fantasy recovers or prevents opponent effect damage';
  const fantasy = cloneScriptCard(bt07W12 as Card, 'PLAY');
  const whiteDiscard = testCard({ id: 'W12_WHITE', fullName: 'White Discard', color: 'WHITE', cardlocation: 'HAND' });
  const erosionCards = [0, 1, 2, 3].map(index => testCard({ id: `W12_EROSION_${index}`, cardlocation: 'EROSION_FRONT' }));
  const recoverState = game({
    hand: [whiteDiscard],
    playZone: [fantasy],
    erosionFront: erosionCards,
  });
  const effect = fantasy.effects?.[0];
  if (!effect?.execute) return fail(name, 'missing Empty Fantasy effect');
  await effect.execute(fantasy, recoverState, recoverState.players.BOT);
  if (recoverState.pendingQuery?.context?.step === 'MODE') {
    const optionId = recoverState.pendingQuery.options?.find((option: any) => option.value === 'RECOVER_4' || option.id === 'RECOVER_4')?.id || 'RECOVER_4';
    await answerPendingQuery(recoverState, 'BOT', [optionId]);
  }
  if (recoverState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(recoverState, 'BOT', [whiteDiscard.gamecardId]);
  }
  const recovered = recoverState.players.BOT.deck.some((card: Card) => card.id === 'W12_EROSION_0');
  const exiled = recoverState.players.BOT.exile.some((card: Card) => card.gamecardId === fantasy.gamecardId);

  const preventFantasy = cloneScriptCard(bt07W12 as Card, 'PLAY');
  const discard = testCard({ id: 'W12_ANY', fullName: 'Any Discard', color: 'RED', cardlocation: 'HAND' });
  const graveCards = [0, 1].map(index => testCard({ id: `W12_GRAVE_${index}`, cardlocation: 'GRAVE' }));
  const damageSource = testCard({ id: 'W12_DAMAGE', fullName: 'Opponent Damage', cardlocation: 'UNIT' });
  const preventState = game({
    hand: [discard],
    grave: graveCards,
    playZone: [preventFantasy],
  }, {
    unitZone: [damageSource, null, null, null, null, null],
  });
  const preventEffect = preventFantasy.effects?.[0];
  await preventEffect?.execute?.(preventFantasy, preventState, preventState.players.BOT);
  if (preventState.pendingQuery?.context?.step === 'MODE') {
    const optionId = preventState.pendingQuery.options?.find((option: any) => option.value === 'PREVENT_EFFECT_DAMAGE' || option.id === 'PREVENT_EFFECT_DAMAGE')?.id || 'PREVENT_EFFECT_DAMAGE';
    await answerPendingQuery(preventState, 'BOT', [optionId]);
  }
  if (preventState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(preventState, 'BOT', [discard.gamecardId]);
  }
  const beforeDeck = preventState.players.BOT.deck.length;
  await AtomicEffectExecutor.execute(preventState, 'P1', { type: 'DEAL_EFFECT_DAMAGE', value: 2 } as any, damageSource);
  const prevented = preventState.players.BOT.deck.length === beforeDeck + 2 &&
    Number((preventState.players.BOT as any).preventedOpponentEffectDamageThisTurn || 0) === 2 &&
    preventState.players.BOT.grave.length === 1;

  return recovered && exiled && prevented
    ? pass(name, `recovered=${recovered}, exiled=${exiled}, prevented=${prevented}`)
    : fail(name, `recovered=${recovered}, exiled=${exiled}, prevented=${prevented}`);
}

async function testPrFantasyStories(): Promise<ScenarioResult> {
  const name = 'PR fantasy stories resolve confirmed modes';

  const snow = cloneScriptCard(prSnowFantasy as Card, 'PLAY');
  const snowDiscard = testCard({ id: 'PR_SNOW_DISCARD', fullName: 'Snow Discard', color: 'RED', cardlocation: 'HAND' });
  const opponentGrave = testCard({ id: 'PR_SNOW_GRAVE', fullName: 'Returned Grave', cardlocation: 'GRAVE' });
  const opponentSource = testCard({ id: 'PR_SNOW_SOURCE', fullName: 'Opponent Source', cardlocation: 'UNIT' });
  const snowState = game({
    hand: [snowDiscard],
    playZone: [snow],
  }, {
    grave: [opponentGrave],
    unitZone: [opponentSource, null, null, null, null, null],
  });
  await snow.effects?.[0]?.execute?.(snow, snowState, snowState.players.BOT);
  if (snowState.pendingQuery?.context?.step === 'MODE') {
    await answerPendingQuery(snowState, 'BOT', [optionIdByValue(snowState, 'REPLACE_GRAVE_TO_DECK')]);
  }
  if (snowState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(snowState, 'BOT', [snowDiscard.gamecardId]);
  }
  const beforeSnowDeck = snowState.players.P1.deck.length;
  ServerGameService.moveCard(snowState, 'P1', 'GRAVE', 'P1', 'DECK', opponentGrave.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: opponentSource.gamecardId,
  });
  const snowResolved = snowState.players.P1.exile.some((card: Card) => card.gamecardId === opponentGrave.gamecardId) &&
    snowState.players.P1.deck.length === beforeSnowDeck - 1;

  const otherworld = cloneScriptCard(prOtherworldFantasy as Card, 'PLAY');
  const yellowDiscard = testCard({ id: 'PR_OTHERWORLD_DISCARD', color: 'YELLOW', cardlocation: 'HAND' });
  const targetName = testCard({ id: 'PR_TARGET_NAME', fullName: 'Named Card', cardlocation: 'GRAVE' });
  const sameDeck = testCard({ id: 'PR_TARGET_NAME', fullName: 'Named Card', cardlocation: 'DECK' });
  const sameHand = testCard({ id: 'PR_TARGET_NAME', fullName: 'Named Card', cardlocation: 'HAND' });
  const otherworldState = game({
    hand: [yellowDiscard],
    playZone: [otherworld],
    erosionBack: [
      testCard({ id: 'PR_OTHERWORLD_BACK_1', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'PR_OTHERWORLD_BACK_2', cardlocation: 'EROSION_BACK' }),
    ],
  }, {
    grave: [targetName],
    deck: [sameDeck],
    hand: [sameHand],
  });
  await otherworld.effects?.[0]?.execute?.(otherworld, otherworldState, otherworldState.players.BOT);
  if (otherworldState.pendingQuery?.context?.step === 'TARGET') {
    await answerPendingQuery(otherworldState, 'BOT', [targetName.gamecardId]);
  }
  if (otherworldState.pendingQuery?.context?.step === 'MODE') {
    await answerPendingQuery(otherworldState, 'BOT', [optionIdByValue(otherworldState, 'EXILE_ALL_SAME_NAME')]);
  }
  if (otherworldState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(otherworldState, 'BOT', [yellowDiscard.gamecardId]);
  }
  const otherworldResolved = [targetName, sameDeck, sameHand].every(card =>
    otherworldState.players.P1.exile.some((exiled: Card) => exiled.gamecardId === card.gamecardId)
  );

  const deepSea = cloneScriptCard(prDeepSeaFantasy as Card, 'PLAY');
  const deepDiscard = testCard({ id: 'PR_DEEP_DISCARD', color: 'BLUE', cardlocation: 'HAND' });
  const placedUnit = testCard({ id: 'PR_DEEP_UNIT', fullName: 'Placed Unit', color: 'BLUE', cardlocation: 'GRAVE' });
  const deepSource = testCard({ id: 'PR_DEEP_SOURCE', fullName: 'Opponent Revive', cardlocation: 'UNIT' });
  const deepState = game({
    hand: [deepDiscard],
    playZone: [deepSea],
  }, {
    grave: [placedUnit],
    unitZone: [deepSource, null, null, null, null, null],
  });
  await deepSea.effects?.[0]?.execute?.(deepSea, deepState, deepState.players.BOT);
  if (deepState.pendingQuery?.context?.step === 'MODE') {
    await answerPendingQuery(deepState, 'BOT', [optionIdByValue(deepState, 'LOCK_OPPONENT_PUT_UNITS')]);
  }
  if (deepState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(deepState, 'BOT', [deepDiscard.gamecardId]);
  }
  if (deepState.pendingQuery?.context?.step === 'DRAW_CHOICE') {
    await answerPendingQuery(deepState, 'BOT', [optionIdByValue(deepState, 'NO_DRAW')]);
  }
  ServerGameService.moveCard(deepState, 'P1', 'GRAVE', 'P1', 'UNIT', placedUnit.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: deepSource.gamecardId,
  });
  const enteredDeepUnit = deepState.players.P1.unitZone.find((unit: Card | null) => unit?.gamecardId === placedUnit.gamecardId);
  const deepSeaResolved = !!enteredDeepUnit?.isExhausted &&
    (enteredDeepUnit as any).data?.fullEffectSilencedTurn === deepState.turnCount;

  const thoughts = cloneScriptCard(prConveyedThoughts as Card, 'PLAY');
  const greenDiscard = testCard({ id: 'PR_THOUGHTS_DISCARD', color: 'GREEN', cardlocation: 'HAND' });
  const boostTarget = testCard({ id: 'PR_THOUGHTS_TARGET', fullName: 'Boost Target', color: 'GREEN', power: 1000, basePower: 1000, cardlocation: 'UNIT' });
  const thoughtsState = game({
    hand: [greenDiscard],
    playZone: [thoughts],
    unitZone: [boostTarget, null, null, null, null, null],
  });
  await thoughts.effects?.[0]?.execute?.(thoughts, thoughtsState, thoughtsState.players.BOT);
  if (thoughtsState.pendingQuery?.context?.step === 'MODE') {
    await answerPendingQuery(thoughtsState, 'BOT', [optionIdByValue(thoughtsState, 'BOOST_GREEN')]);
  }
  if (thoughtsState.pendingQuery?.context?.step === 'TARGET') {
    await answerPendingQuery(thoughtsState, 'BOT', [boostTarget.gamecardId]);
  }
  if (thoughtsState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(thoughtsState, 'BOT', [greenDiscard.gamecardId]);
  }
  const thoughtsResolved = boostTarget.power === 1500 && boostTarget.isAnnihilation === true;
  const protectThoughts = cloneScriptCard(prConveyedThoughts as Card, 'PLAY', { gamecardId: 'PR_THOUGHTS_PROTECT' });
  const protectDiscard = testCard({ id: 'PR_THOUGHTS_PROTECT_DISCARD', cardlocation: 'HAND' });
  const protectedA = testCard({ id: 'PR_THOUGHTS_PROTECTED_A', fullName: 'Protected A', cardlocation: 'UNIT' });
  const protectedB = testCard({ id: 'PR_THOUGHTS_PROTECTED_B', fullName: 'Protected B', cardlocation: 'UNIT' });
  const destroySource = testCard({ id: 'PR_THOUGHTS_DESTROY_SOURCE', fullName: 'Opponent Destroy Source', cardlocation: 'UNIT' });
  const drawA = testCard({ id: 'PR_THOUGHTS_DRAW_A', cardlocation: 'DECK' });
  const drawB = testCard({ id: 'PR_THOUGHTS_DRAW_B', cardlocation: 'DECK' });
  const protectState = game({
    hand: [protectDiscard],
    deck: [drawA, drawB],
    playZone: [protectThoughts],
    unitZone: [protectedA, protectedB, null, null, null, null],
  }, {
    unitZone: [destroySource, null, null, null, null, null],
  });
  await protectThoughts.effects?.[0]?.execute?.(protectThoughts, protectState, protectState.players.BOT);
  if (protectState.pendingQuery?.context?.step === 'MODE') {
    await answerPendingQuery(protectState, 'BOT', [optionIdByValue(protectState, 'PROTECT_DESTROY_DRAW')]);
  }
  if (protectState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(protectState, 'BOT', [protectDiscard.gamecardId]);
  }
  protectState.currentProcessingItem = {
    type: 'EFFECT',
    card: destroySource,
    ownerUid: 'P1',
    effectIndex: 0,
    timestamp: Date.now(),
  };
  const preventA = await ServerGameService.destroyUnit(protectState, 'BOT', protectedA.gamecardId, true, 'P1');
  const preventB = await ServerGameService.destroyUnit(protectState, 'BOT', protectedB.gamecardId, true, 'P1');
  protectState.currentProcessingItem = null;
  const protectDrawQueueCount = protectState.triggeredEffectsQueue.filter((record: any) =>
    record.effect?.id === '203000116_prevented_destroy_draw'
  ).length;
  await confirmTrigger(protectState, 'BOT');
  if (protectState.pendingQuery?.context?.step === 'DRAW_CHOICE') {
    await answerPendingQuery(protectState, 'BOT', [optionIdByValue(protectState, 'DRAW_TWO')]);
  }
  await ServerGameService.checkTriggeredEffects(protectState);
  const thoughtsDraw = protectState.players.BOT.hand.some((card: Card) => card.gamecardId === drawA.gamecardId) &&
    protectState.players.BOT.hand.some((card: Card) => card.gamecardId === drawB.gamecardId) &&
    protectState.players.BOT.hand.length === 2 &&
    protectState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === protectedA.gamecardId) &&
    protectState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === protectedB.gamecardId) &&
    preventA === false &&
    preventB === false &&
    protectDrawQueueCount === 1 &&
    !protectState.pendingQuery;

  return snowResolved && otherworldResolved && deepSeaResolved && thoughtsResolved && thoughtsDraw
    ? pass(name, `snow=${snowResolved}, otherworld=${otherworldResolved}, deep=${deepSeaResolved}, thoughts=${thoughtsResolved}/${thoughtsDraw}`)
    : fail(name, `snow=${snowResolved}, otherworld=${otherworldResolved}, deep=${deepSeaResolved}, thoughts=${thoughtsResolved}/${thoughtsDraw}`);
}

async function testBlueMerchantPutsOnlyKyubiNonGodItems(): Promise<ScenarioResult> {
  const name = 'BT07-B01 White Tail Merchant puts only Kyubi non-god items';
  const merchant = cloneScriptCard(bt07B01 as Card, 'UNIT');
  const validDeckItem = testCard({ id: 'B01_VALID_DECK', fullName: 'Kyubi Item', type: 'ITEM', faction: '九尾商会联盟', color: 'BLUE', godMark: false, cardlocation: 'DECK' });
  const validErosionItem = testCard({ id: 'B01_VALID_EROSION', fullName: 'Kyubi Erosion Item', type: 'ITEM', faction: '九尾商会联盟', color: 'BLUE', godMark: false, cardlocation: 'EROSION_FRONT' });
  const godItem = testCard({ id: 'B01_GOD', fullName: 'God Item', type: 'ITEM', faction: '九尾商会联盟', godMark: true, cardlocation: 'DECK' });
  const wrongFaction = testCard({ id: 'B01_WRONG', fullName: 'Wrong Item', type: 'ITEM', faction: 'Other', godMark: false, cardlocation: 'DECK' });
  const state = game({
    unitZone: [merchant, null, null, null, null, null],
    deck: [validDeckItem, godItem, wrongFaction, ...deckCards(3, 'B01_FILL')],
    erosionFront: [validErosionItem],
  });
  EventEngine.dispatchEvent(state, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: merchant,
    sourceCardId: merchant.gamecardId,
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' }
  });
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId === '104020304_enter_put_kyubi_item') {
    const optionIds = (state.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
    if (!optionIds.includes(validDeckItem.gamecardId) || !optionIds.includes(validErosionItem.gamecardId) || optionIds.includes(godItem.gamecardId) || optionIds.includes(wrongFaction.gamecardId)) {
      return fail(name, `options=${optionIds.join(',')}`);
    }
    await answerPendingQuery(state, 'BOT', [validDeckItem.gamecardId]);
  }
  const placed = state.players.BOT.itemZone.some((item: Card | null) => item?.gamecardId === validDeckItem.gamecardId);
  return placed && merchant.isExhausted
    ? pass(name, `placed=${placed}, exhausted=${merchant.isExhausted}`)
    : fail(name, `placed=${placed}, exhausted=${merchant.isExhausted}`);
}

async function testBlueAishaRecoversAfterOpponentExileAndHouseRevives(): Promise<ScenarioResult> {
  const name = 'BT07-B02/B09 Aisha recovers after exile and House revives on leave';
  const aisha = cloneScriptCard(bt07B02 as Card, 'UNIT');
  const victim = testCard({ id: 'B02_VICTIM', fullName: 'Victim Unit', cardlocation: 'UNIT' });
  const opponentSource = testCard({ id: 'B02_OPP_SOURCE', fullName: 'Opponent Exile Source', cardlocation: 'UNIT' });
  const erosionUnit = testCard({ id: 'B02_EROSION_UNIT', fullName: 'Recoverable Unit', cardlocation: 'EROSION_FRONT', displayState: 'FRONT_UPRIGHT' });
  const state = game({
    unitZone: [aisha, victim, null, null, null, null],
    erosionFront: [erosionUnit],
  }, {
    unitZone: [opponentSource, null, null, null, null, null],
  });

  ServerGameService.moveCard(state, 'BOT', 'UNIT', 'BOT', 'EXILE', victim.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: opponentSource.gamecardId,
  });
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId !== '104030305_recover_after_own_unit_exiled' || state.pendingQuery.context.step !== 'TARGET') {
    return fail(name, `expected Aisha target query, got ${state.pendingQuery?.context?.effectId || 'none'}:${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [erosionUnit.gamecardId]);
  if (state.pendingQuery?.context?.step !== 'MODE') {
    return fail(name, `expected Aisha mode query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', ['FIELD']);
  const aishaRecoveredToField = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === erosionUnit.gamecardId);

  const house = cloneScriptCard(bt07B09 as Card, 'ITEM');
  const wealthCarrier = testCard({
    id: 'B09_WEALTH_CARRIER',
    fullName: 'Wealth Carrier',
    type: 'UNIT',
    cardlocation: 'UNIT',
    data: { grantedWealthValue: 1 },
  } as any);
  const reviveTarget = testCard({
    id: 'B09_REVIVE_TARGET',
    fullName: 'Kyubi Revive Target',
    type: 'UNIT',
    faction: (bt07B11 as Card).faction,
    cardlocation: 'GRAVE',
  });
  const leaveSource = testCard({ id: 'B09_OPP_SOURCE', fullName: 'Opponent Destroy Source', cardlocation: 'UNIT' });
  const houseState = game({
    unitZone: [wealthCarrier, null, null, null, null, null],
    itemZone: [house],
    grave: [reviveTarget],
  }, {
    unitZone: [leaveSource, null, null, null, null, null],
  });
  EventEngine.recalculateContinuousEffects(houseState);
  ServerGameService.moveCard(houseState, 'BOT', 'ITEM', 'BOT', 'GRAVE', house.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: leaveSource.gamecardId,
  });
  await confirmTrigger(houseState, 'BOT');
  if (houseState.pendingQuery?.context?.effectId === '304020050_revive_on_opponent_effect_leave') {
    await answerPendingQuery(houseState, 'BOT', [reviveTarget.gamecardId]);
  }
  const houseRevived = houseState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === reviveTarget.gamecardId);

  return aishaRecoveredToField && houseRevived
    ? pass(name, `aishaRecovered=${aishaRecoveredToField}, houseRevived=${houseRevived}`)
    : fail(name, `aishaRecovered=${aishaRecoveredToField}, houseRevived=${houseRevived}, pending=${houseState.pendingQuery?.context?.effectId || 'none'}`);
}

async function testBlueAdventurerSupportAndErosionEntry(): Promise<ScenarioResult> {
  const name = 'BT07-B03/B04 adventurer pair support and erosion entry';
  const hammo = cloneScriptCard(bt07B03 as Card, 'UNIT');
  const amy = cloneScriptCard(bt07B04 as Card, 'UNIT');
  const ally = testCard({ id: 'B03_ALLY', fullName: 'Adventurer Ally', faction: '冒险家公会', cardlocation: 'UNIT' });
  const state = game({
    unitZone: [hammo, amy, ally, null, null, null],
  });
  EventEngine.recalculateContinuousEffects(state);
  const amyDamage = amy.damage;
  const amyBattleProtected = !!(amy as any).battleImmuneByEffect;
  const destroyed = await ServerGameService.destroyUnit(state, 'BOT', ally.gamecardId, true, 'P1');
  const allyProtected = destroyed === false && state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === ally.gamecardId);
  ServerGameService.moveCard(state, 'BOT', 'UNIT', 'BOT', 'GRAVE', hammo.gamecardId, { isEffect: true });
  EventEngine.recalculateContinuousEffects(state);
  const afterHammoLeft = await ServerGameService.destroyUnit(state, 'BOT', ally.gamecardId, true, 'P1');
  const allyDestroyedAfterHammoLeft = afterHammoLeft === true &&
    state.players.BOT.grave.some((card: Card) => card.gamecardId === ally.gamecardId);

  const erosionHammo = cloneScriptCard(bt07B03 as Card, 'EROSION_FRONT', { gamecardId: 'B03_EROSION_HAMMO' });
  const discard = testCard({ id: 'B03_DISCARD', cardlocation: 'HAND' });
  const entryState = game({
    hand: [discard],
    unitZone: [
      testCard({ id: 'B03_FIELD_1', faction: '冒险家公会', cardlocation: 'UNIT' }),
      testCard({ id: 'B03_FIELD_2', faction: '冒险家公会', cardlocation: 'UNIT' }),
      null, null, null, null
    ],
    erosionFront: [
      erosionHammo,
      testCard({ id: 'B03_EF_1', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'B03_EF_2', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'B03_EF_3', cardlocation: 'EROSION_FRONT' }),
    ],
  });
  const effectIndex = erosionHammo.effects?.findIndex(effect => effect.id === '104030306_enter_from_erosion') ?? -1;
  await ServerGameService.activateEffect(entryState, 'BOT', erosionHammo.gamecardId, effectIndex);
  if (entryState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(entryState, 'BOT', [discard.gamecardId]);
  }
  await ServerGameService.passConfrontation(entryState, entryState.priorityPlayerId);
  const entered = entryState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === erosionHammo.gamecardId);

  return amyDamage === 3 && amyBattleProtected && allyProtected && allyDestroyedAfterHammoLeft && entered
    ? pass(name, `amyDamage=${amyDamage}, allyProtected=${allyProtected}, afterHammoLeft=${allyDestroyedAfterHammoLeft}, entered=${entered}`)
    : fail(name, `amyDamage=${amyDamage}, battleProtected=${amyBattleProtected}, allyProtected=${allyProtected}, afterHammoLeft=${allyDestroyedAfterHammoLeft}, entered=${entered}`);
}

async function testBlueElenaReplacesDeckSearchAndTriggers(): Promise<ScenarioResult> {
  const name = 'BT07-B05 Elena replaces deck-to-hand search and triggers from discard';
  const elena = cloneScriptCard(bt07B05 as Card, 'UNIT');
  const searched = testCard({ id: 'B05_SEARCHED', cardlocation: 'DECK' });
  const state = game({
    unitZone: [elena, null, null, null, null, null],
    deck: [searched, ...deckCards(3, 'B05_FILL')],
  });
  AtomicEffectExecutor.moveCard(state, 'BOT', 'DECK', 'BOT', 'HAND', searched.gamecardId, true, { effectSourcePlayerUid: 'BOT', effectSourceCardId: elena.gamecardId });
  const replacedToGrave = state.players.BOT.grave.some((card: Card) => card.gamecardId === searched.gamecardId);

  const discardedElena = cloneScriptCard(bt07B05 as Card, 'HAND', { gamecardId: 'B05_DISCARDED_ELENA' });
  const triggerState = game({
    hand: [discardedElena],
    deck: deckCards(3, 'B05_DRAW'),
    erosionFront: [
      testCard({ id: 'B05_EF_0', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'B05_EF_1', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'B05_EF_2', cardlocation: 'EROSION_FRONT' }),
    ],
  });
  AtomicEffectExecutor.moveCard(triggerState, 'BOT', 'HAND', 'BOT', 'GRAVE', discardedElena.gamecardId, true, { effectSourcePlayerUid: 'BOT', effectSourceCardId: discardedElena.gamecardId });
  await confirmTrigger(triggerState, 'BOT');
  if (triggerState.pendingQuery?.context?.step === 'MODE') {
    const optionId = triggerState.pendingQuery.options?.find((option: any) => option.value === 'PUT_EXHAUSTED' || option.id === 'PUT_EXHAUSTED')?.id || 'PUT_EXHAUSTED';
    await answerPendingQuery(triggerState, 'BOT', [optionId]);
  }
  const putExhausted = triggerState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === discardedElena.gamecardId && unit.isExhausted);

  return replacedToGrave && putExhausted
    ? pass(name, `replaced=${replacedToGrave}, putExhausted=${putExhausted}`)
    : fail(name, `replaced=${replacedToGrave}, putExhausted=${putExhausted}`);
}

async function testBlueMahoragaMeditationAndTenkoOrder(): Promise<ScenarioResult> {
  const name = 'BT07-B06/B07/B08 Mahoraga Meditation and Tenko Order resolve';
  const mahoraga = cloneScriptCard(bt07B06 as Card, 'UNIT');
  const nonGodTarget = testCard({ id: 'B06_TARGET', fullName: 'Non God Target', type: 'ITEM', godMark: false, cardlocation: 'ITEM' });
  const state = game({
    unitZone: [mahoraga, null, null, null, null, null],
    erosionBack: [testCard({ id: 'B06_BACK_0', cardlocation: 'EROSION_BACK' }), testCard({ id: 'B06_BACK_1', cardlocation: 'EROSION_BACK' })],
    isGoddessMode: true,
  }, {
    itemZone: [nonGodTarget],
  });
  (state.players.BOT as any).drawnByEffectTurn = state.turnCount;
  const destroyIndex = mahoraga.effects?.findIndex(effect => effect.id === '104000309_draw_effect_destroy') ?? -1;
  await ServerGameService.activateEffect(state, 'BOT', mahoraga.gamecardId, destroyIndex);
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  if (state.pendingQuery?.context?.effectId === '104000309_draw_effect_destroy') {
    await answerPendingQuery(state, 'BOT', [nonGodTarget.gamecardId]);
  }
  const destroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === nonGodTarget.gamecardId);

  const ohTarget = testCard({ id: 'B06_OH_TARGET', fullName: 'OH Target', cardlocation: 'UNIT' });
  const ohState = game({
    unitZone: [cloneScriptCard(bt07B06 as Card, 'UNIT'), null, null, null, null, null],
    erosionFront: deckCards(10, 'B06_GODDESS_EROSION').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' })),
    isGoddessMode: true,
  }, {
    deck: deckCards(4, 'B06_OPP_DECK'),
    unitZone: [ohTarget, null, null, null, null, null],
  });
  const ohSource = ohState.players.BOT.unitZone[0] as Card;
  const ohIndex = ohSource.effects?.findIndex(effect => effect.id === '104000309_oh_exhaust_mill') ?? -1;
  await ServerGameService.activateEffect(ohState, 'BOT', ohSource.gamecardId, ohIndex);
  await ServerGameService.passConfrontation(ohState, ohState.priorityPlayerId);
  if (ohState.pendingQuery?.context?.effectId === '104000309_oh_exhaust_mill') {
    await answerPendingQuery(ohState, 'BOT', [ohTarget.gamecardId]);
  }
  const ohResolved = ohTarget.isExhausted &&
    ohState.players.P1.deck.length === 2 &&
    ohState.players.P1.grave.length === 2 &&
    !!(ohSource as any).data?.ohEffectDisabledUntilOwnStartUid;

  const meditation = cloneScriptCard(bt07B07 as Card, 'PLAY');
  const meditateTarget = testCard({ id: 'B07_TARGET', fullName: 'Meditate Target', cardlocation: 'UNIT' });
  const meditateState = game({
    deck: deckCards(3, 'B07_DRAW'),
    playZone: [meditation],
  }, {
    unitZone: [meditateTarget, null, null, null, null, null],
  });
  const meditationEffect = meditation.effects?.[0];
  await meditationEffect?.execute?.(meditation, meditateState, meditateState.players.BOT);
  if (meditateState.pendingQuery?.context?.effectId === '204000091_meditation') {
    await answerPendingQuery(meditateState, 'BOT', [meditateTarget.gamecardId]);
  }
  const meditated = meditateTarget.isExhausted && !!(meditateTarget as any).data?.fullEffectSilencedUntilOwnStartUid && meditateState.players.BOT.hand.length === 1;

  const order = cloneScriptCard(bt07B08 as Card, 'PLAY');
  const yellow = testCard({ id: 'B08_YELLOW', color: 'YELLOW', acValue: 3, godMark: false, cardlocation: 'UNIT' });
  const highYellow = testCard({ id: 'B08_HIGH', color: 'YELLOW', acValue: 4, godMark: false, cardlocation: 'UNIT' });
  const orderState = game({
    playZone: [order],
  }, {
    unitZone: [yellow, highYellow, null, null, null, null],
  });
  const orderEffect = order.effects?.[0];
  await orderEffect?.execute?.(order, orderState, orderState.players.BOT);
  if (orderState.pendingQuery?.context?.step === 'DESTROY_TARGET') {
    const optionIds = (orderState.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
    if (!optionIds.includes(yellow.gamecardId) || optionIds.includes(highYellow.gamecardId)) {
      return fail(name, `order options=${optionIds.join(',')}`);
    }
    await answerPendingQuery(orderState, 'BOT', [yellow.gamecardId]);
  }
  const orderDestroyed = orderState.players.P1.grave.some((card: Card) => card.gamecardId === yellow.gamecardId);

  const counterOrder = cloneScriptCard(bt07B08 as Card, 'PLAY', { gamecardId: 'B08_COUNTER_ORDER' });
  const opponentPlay = testCard({ id: 'B08_YELLOW_PLAY', fullName: 'Yellow Play', type: 'UNIT', color: 'YELLOW', acValue: 3, godMark: false, cardlocation: 'PLAY' });
  const counterState = game({
    playZone: [counterOrder],
    erosionBack: [testCard({ id: 'B08_BACK', cardlocation: 'EROSION_BACK' })],
  }, {
    playZone: [opponentPlay],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    counterStack: [{
      type: 'PLAY',
      card: opponentPlay,
      ownerUid: 'P1',
      timestamp: Date.now(),
    }],
  });
  const counterEffect = counterOrder.effects?.[0];
  await counterEffect?.onQueryResolve?.(counterOrder, counterState, counterState.players.BOT, ['COUNTER'], { step: 'MODE' });
  const orderCountered = !!counterState.counterStack[0]?.isNegated;

  return destroyed && ohResolved && meditated && orderDestroyed && orderCountered
    ? pass(name, `destroyed=${destroyed}, oh=${ohResolved}, meditated=${meditated}, orderDestroyed=${orderDestroyed}, countered=${orderCountered}`)
    : fail(name, `destroyed=${destroyed}, oh=${ohResolved}, meditated=${meditated}, orderDestroyed=${orderDestroyed}, countered=${orderCountered}`);
}

async function testBlueWealthCoreAndEquipment(): Promise<ScenarioResult> {
  const name = 'BT07-B09/B10/B11 wealth core and equipment resolve';
  const house = cloneScriptCard(bt07B09 as Card, 'ITEM');
  const kosako = cloneScriptCard(bt07B11 as Card, 'UNIT', { baseHeroic: false, isHeroic: false });
  const granted = testCard({ id: 'B09_GRANTED', fullName: 'Blue Unit', type: 'UNIT', color: 'BLUE', cardlocation: 'UNIT' });
  const state = game({
    unitZone: [kosako, granted, null, null, null, null],
    itemZone: [house],
    erosionFront: [
      testCard({ id: 'B09_EF_0', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'B09_EF_1', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'B09_EF_2', cardlocation: 'EROSION_FRONT' }),
    ],
  });
  EventEngine.recalculateContinuousEffects(state);
  EventEngine.dispatchEvent(state, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: granted,
    sourceCardId: granted.gamecardId,
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' }
  });
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId === '304020050_grant_wealth_to_blue_unit') {
    await answerPendingQuery(state, 'BOT', [granted.gamecardId]);
  }
  const grantedWealth = wealthCount(state.players.BOT, state) >= 2;
  EventEngine.recalculateContinuousEffects(state);
  const grantedWealthAfterRecalc = wealthCount(state.players.BOT, state) >= 2;
  const kosakoWealth = wealthCount(state.players.BOT, state) >= 2;
  const kosakoDoesNotBuffSelf = !kosako.isHeroic;

  const freshHouse = cloneScriptCard(bt07B09 as Card, 'ITEM', { gamecardId: 'B09_FRESH_HOUSE' });
  const freshBlue = testCard({ id: 'B09_FRESH_BLUE', fullName: 'Fresh Blue Unit', type: 'UNIT', color: 'BLUE', cardlocation: 'HAND' });
  const freshState = game({
    hand: [freshBlue],
    itemZone: [freshHouse],
    erosionFront: [
      testCard({ id: 'B09_FRESH_EF_0', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'B09_FRESH_EF_1', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'B09_FRESH_EF_2', cardlocation: 'EROSION_FRONT' }),
    ],
  });
  ServerGameService.moveCard(freshState, 'BOT', 'HAND', 'BOT', 'UNIT', freshBlue.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'BOT',
    effectSourceCardId: freshHouse.gamecardId
  });
  await confirmTrigger(freshState, 'BOT');
  const freshOptions = (freshState.pendingQuery?.options || []).map((option: any) => option.card?.gamecardId || option.id);
  const freshCanSelectEnteredUnit = freshState.pendingQuery?.context?.effectId === '304020050_grant_wealth_to_blue_unit' &&
    freshOptions.includes(freshBlue.gamecardId);
  if (freshCanSelectEnteredUnit) {
    await answerPendingQuery(freshState, 'BOT', [freshBlue.gamecardId]);
  }
  EventEngine.recalculateContinuousEffects(freshState);
  const freshGrantedWealth = wealthCount(freshState.players.BOT, freshState) >= 1;

  const lowErosionKosako = cloneScriptCard(bt07B11 as Card, 'UNIT', { gamecardId: 'B11_LOW_EROSION', baseHeroic: false, isHeroic: false });
  const lowErosionAlly = testCard({ id: 'B11_LOW_ALLY', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });
  const lowErosionWealth = testCard({ id: 'B11_LOW_WEALTH', type: 'UNIT', cardlocation: 'UNIT' } as Partial<Card> & { data: any });
  (lowErosionWealth as any).data = { grantedWealthValue: 2 };
  const lowErosionState = game({
    unitZone: [lowErosionKosako, lowErosionAlly, lowErosionWealth, null, null, null],
    erosionFront: [
      testCard({ id: 'B11_LOW_EF_0', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'B11_LOW_EF_1', cardlocation: 'EROSION_FRONT' }),
    ],
  });
  EventEngine.recalculateContinuousEffects(lowErosionState);
  const lowErosionNoBuff = lowErosionAlly.power === 1000 && !lowErosionAlly.isHeroic;

  const sword = cloneScriptCard(bt07B10 as Card, 'GRAVE');
  const equipDiscard = testCard({ id: 'B10_DISCARD', cardlocation: 'HAND' });
  const target = testCard({ id: 'B10_TARGET', fullName: '百濑之水城 Target', faction: (bt07B10 as Card).faction, godMark: true, cardlocation: 'UNIT' });
  const nonGodMomose = testCard({ id: 'B10_NON_GOD_MOMOSE', fullName: '百濑之水城 Non-God', faction: (bt07B10 as Card).faction, godMark: false, cardlocation: 'UNIT' });
  const swordSage = testCard({ id: 'B10_SWORD_SAGE', fullName: '剑仙 Target', specialName: '剑仙 Target', faction: 'Other', godMark: false, cardlocation: 'UNIT' });
  const equipState = game({
    hand: [equipDiscard],
    grave: [sword],
    unitZone: [target, nonGodMomose, swordSage, null, null, null],
  });
  const equipIndex = sword.effects?.findIndex(effect => effect.id === '304010051_revive_and_equip') ?? -1;
  await ServerGameService.activateEffect(equipState, 'BOT', sword.gamecardId, equipIndex);
  if (equipState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(equipState, 'BOT', [equipDiscard.gamecardId]);
  }
  await ServerGameService.passConfrontation(equipState, equipState.priorityPlayerId);
  if (equipState.pendingQuery?.context?.effectId === '304010051_revive_and_equip') {
    const optionIds = (equipState.pendingQuery.options || []).map((option: any) => option.card.gamecardId);
    if (!optionIds.includes(target.gamecardId) || !optionIds.includes(swordSage.gamecardId) || optionIds.includes(nonGodMomose.gamecardId)) {
      return fail(name, `sword target options=${optionIds.join(',')}`);
    }
    await answerPendingQuery(equipState, 'BOT', [target.gamecardId]);
  }
  EventEngine.recalculateContinuousEffects(equipState);
  const equipped = equipState.players.BOT.itemZone.some((item: Card | null) => item?.gamecardId === sword.gamecardId && item.equipTargetId === target.gamecardId);
  const targetDamage = target.damage;

  const discardedKosako = cloneScriptCard(bt07B11 as Card, 'HAND', { gamecardId: 'B11_DISCARD_KOSAKO' });
  const noBlueKosako = cloneScriptCard(bt07B11 as Card, 'HAND', { gamecardId: 'B11_NO_BLUE_KOSAKO' });
  const noBlueState = game({
    hand: [noBlueKosako],
  });
  AtomicEffectExecutor.moveCard(noBlueState, 'BOT', 'HAND', 'BOT', 'GRAVE', noBlueKosako.gamecardId, true, { effectSourcePlayerUid: 'BOT', effectSourceCardId: noBlueKosako.gamecardId });
  await ServerGameService.checkTriggeredEffects(noBlueState);
  const noBlueNoTrigger = !noBlueState.pendingQuery && !noBlueState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === noBlueKosako.gamecardId);

  const blueSource = testCard({ id: 'B11_BLUE_SOURCE', color: 'BLUE', cardlocation: 'UNIT' });
  const kosakoState = game({
    hand: [discardedKosako],
    unitZone: [blueSource, null, null, null, null, null],
  });
  AtomicEffectExecutor.moveCard(kosakoState, 'BOT', 'HAND', 'BOT', 'GRAVE', discardedKosako.gamecardId, true, { effectSourcePlayerUid: 'BOT', effectSourceCardId: discardedKosako.gamecardId });
  await confirmTrigger(kosakoState, 'BOT');
  const putKosako = kosakoState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === discardedKosako.gamecardId);

  return grantedWealth && grantedWealthAfterRecalc && freshCanSelectEnteredUnit && freshGrantedWealth && kosakoWealth && kosakoDoesNotBuffSelf && lowErosionNoBuff && equipped && targetDamage === 2 && noBlueNoTrigger && putKosako
    ? pass(name, `grantedWealth=${grantedWealth}, freshSelect=${freshCanSelectEnteredUnit}, equipped=${equipped}, damage=${targetDamage}, noBlueNoTrigger=${noBlueNoTrigger}, putKosako=${putKosako}`)
    : fail(name, `grantedWealth=${grantedWealth}, afterRecalc=${grantedWealthAfterRecalc}, freshSelect=${freshCanSelectEnteredUnit}, freshWealth=${freshGrantedWealth}, kosakoWealth=${kosakoWealth}, selfHeroic=${kosako.isHeroic}, lowErosionNoBuff=${lowErosionNoBuff}, equipped=${equipped}, damage=${targetDamage}, noBlueNoTrigger=${noBlueNoTrigger}, putKosako=${putKosako}`);
}

async function testHolyEightActivatesRequireGoddessMode(): Promise<ScenarioResult> {
  const name = 'Holy Eight activate effects require Goddess Mode';
  const target = testCard({ id: 'HOLY_EIGHT_TARGET', fullName: 'Non-God Target', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });

  const asura = cloneScriptCard(bt07R07 as Card, 'UNIT', { gamecardId: 'HOLY_ASURA' });
  const asuraState = game({
    unitZone: [asura, null, null, null, null, null],
    hand: [testCard({ id: 'HOLY_ASURA_COST', cardlocation: 'HAND' })],
  }, {
    unitZone: [target, null, null, null, null, null],
  });
  const asuraIndex = asura.effects?.findIndex(effect => effect.id === '102000372_oh_destroy_non_god') ?? -1;
  const asuraNoGoddess = ServerGameService.checkEffectLimitsAndReqs(asuraState, 'BOT', asura, asura.effects![asuraIndex], 'UNIT').valid;
  asuraState.players.BOT.isGoddessMode = true;
  const asuraGoddess = ServerGameService.checkEffectLimitsAndReqs(asuraState, 'BOT', asura, asura.effects![asuraIndex], 'UNIT').valid;

  const mahoraga = cloneScriptCard(bt07B06 as Card, 'UNIT', { gamecardId: 'HOLY_MAHORAGA' });
  const mahoragaState = game({
    unitZone: [mahoraga, null, null, null, null, null],
    erosionBack: [testCard({ id: 'HOLY_B06_BACK_0', cardlocation: 'EROSION_BACK' }), testCard({ id: 'HOLY_B06_BACK_1', cardlocation: 'EROSION_BACK' })],
  }, {
    unitZone: [testCard({ id: 'HOLY_B06_TARGET', godMark: false, cardlocation: 'UNIT' }), null, null, null, null, null],
  });
  (mahoragaState.players.BOT as any).drawnByEffectTurn = mahoragaState.turnCount;
  const drawDestroyIndex = mahoraga.effects?.findIndex(effect => effect.id === '104000309_draw_effect_destroy') ?? -1;
  const millIndex = mahoraga.effects?.findIndex(effect => effect.id === '104000309_oh_exhaust_mill') ?? -1;
  const mahoragaNoGoddess =
    ServerGameService.checkEffectLimitsAndReqs(mahoragaState, 'BOT', mahoraga, mahoraga.effects![drawDestroyIndex], 'UNIT').valid ||
    ServerGameService.checkEffectLimitsAndReqs(mahoragaState, 'BOT', mahoraga, mahoraga.effects![millIndex], 'UNIT').valid;
  mahoragaState.players.BOT.isGoddessMode = true;
  const mahoragaGoddess =
    ServerGameService.checkEffectLimitsAndReqs(mahoragaState, 'BOT', mahoraga, mahoraga.effects![drawDestroyIndex], 'UNIT').valid &&
    ServerGameService.checkEffectLimitsAndReqs(mahoragaState, 'BOT', mahoraga, mahoraga.effects![millIndex], 'UNIT').valid;

  const yasha = cloneScriptCard(bt08G05 as Card, 'UNIT', { gamecardId: 'HOLY_YASHA' });
  const yashaState = game({
    unitZone: [yasha, null, null, null, null, null],
    erosionFront: deckCards(10, 'HOLY_YASHA_EROSION').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' })),
  }, {
    unitZone: [testCard({ id: 'HOLY_YASHA_TARGET', cardlocation: 'UNIT' }), null, null, null, null, null],
  });
  const yashaIndex = yasha.effects?.findIndex(effect => effect.id === '103000419_set_unit_power_zero') ?? -1;
  const yashaNoGoddess = ServerGameService.checkEffectLimitsAndReqs(yashaState, 'BOT', yasha, yasha.effects![yashaIndex], 'UNIT').valid;
  yashaState.players.BOT.isGoddessMode = true;
  const yashaGoddess = ServerGameService.checkEffectLimitsAndReqs(yashaState, 'BOT', yasha, yasha.effects![yashaIndex], 'UNIT').valid;

  return !asuraNoGoddess && asuraGoddess && !mahoragaNoGoddess && mahoragaGoddess && !yashaNoGoddess && yashaGoddess
    ? pass(name, `asura=${asuraGoddess}, mahoraga=${mahoragaGoddess}, yasha=${yashaGoddess}`)
    : fail(name, `asuraNoGoddess=${asuraNoGoddess}, asuraGoddess=${asuraGoddess}, mahoragaNoGoddess=${mahoragaNoGoddess}, mahoragaGoddess=${mahoragaGoddess}, yashaNoGoddess=${yashaNoGoddess}, yashaGoddess=${yashaGoddess}`);
}

async function testGreenResonanceAndCubTigerChain(): Promise<ScenarioResult> {
  const name = 'BT07-G01/G03/G06 resonance and cub tiger chain';
  const elder = cloneScriptCard(bt07G01 as Card, 'UNIT');
  const graveCost = testCard({ id: 'G01_GRAVE_COST', fullName: 'Grave Cost', cardlocation: 'GRAVE' });
  const sernobuDeck = testCard({ id: 'G01_SERNOBU', fullName: '瑟诺布 Candidate', faction: '瑟诺布', godMark: false, cardlocation: 'DECK' });
  const state = game({
    unitZone: [elder, null, null, null, null, null],
    grave: [graveCost],
    deck: [sernobuDeck, ...deckCards(3, 'G01_FILL')],
  });
  const resonanceIndex = elder.effects?.findIndex(effect => effect.id === '103090311_resonance') ?? -1;
  await ServerGameService.activateEffect(state, 'BOT', elder.gamecardId, resonanceIndex);
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  if (state.pendingQuery?.context?.effectId === '103090311_resonance') {
    await answerPendingQuery(state, 'BOT', [graveCost.gamecardId]);
  }
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId === '103090311_mill_sernobu_after_grave_exile') {
    await answerPendingQuery(state, 'BOT', [sernobuDeck.gamecardId]);
  }
  const exiledByResonance = state.players.BOT.exile.some((card: Card) => card.gamecardId === graveCost.gamecardId);
  const milledSernobu = state.players.BOT.grave.some((card: Card) => card.gamecardId === sernobuDeck.gamecardId);

  const cub = cloneScriptCard(bt07G03 as Card, 'UNIT');
  const source = testCard({ id: 'G03_SOURCE', cardlocation: 'UNIT' });
  const swordTiger = cloneScriptCard(bt07G06 as Card, 'DECK');
  const cubState = game({
    unitZone: [cub, null, null, null, null, null],
    deck: [swordTiger, ...deckCards(3, 'G03_FILL')],
  }, {
    unitZone: [source, null, null, null, null, null],
  });
  ServerGameService.moveCard(cubState, 'BOT', 'UNIT', 'BOT', 'GRAVE', cub.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: source.gamecardId,
  });
  await confirmTrigger(cubState, 'BOT');
  if (cubState.pendingQuery?.context?.effectId === '103080313_effect_leave_put_sword_tiger') {
    await answerPendingQuery(cubState, 'BOT', [swordTiger.gamecardId]);
  }
  const tigerOnField = cubState.players.BOT.unitZone.find((unit: Card | null) => unit?.id === '103080316') as Card | undefined;
  const tigerNoBaseAnnihilation = !!tigerOnField && !tigerOnField.isAnnihilation;
  if (tigerOnField) {
    awakenUnit(cubState, 'BOT', tigerOnField, cub);
    await confirmTrigger(cubState, 'BOT');
  }
  const tigerReadyAnnihilation = !!tigerOnField && !tigerOnField.isExhausted && !!tigerOnField.isAnnihilation;

  return exiledByResonance && milledSernobu && tigerNoBaseAnnihilation && tigerReadyAnnihilation
    ? pass(name, `resonance=${exiledByResonance}, milled=${milledSernobu}, tigerBase=${tigerNoBaseAnnihilation}, tiger=${tigerReadyAnnihilation}`)
    : fail(name, `resonance=${exiledByResonance}, milled=${milledSernobu}, tigerBase=${tigerNoBaseAnnihilation}, tiger=${tigerReadyAnnihilation}`);
}

async function testGreenAwakenSnowRabbitAndCliffRescue(): Promise<ScenarioResult> {
  const name = 'BT07-G02/G04/G05/G08 awaken, snow rabbit and cliff rescue';
  const totem = cloneScriptCard(bt07G02 as Card, 'UNIT');
  const graveA = testCard({ id: 'G02_GRAVE_A', cardlocation: 'GRAVE' });
  const graveB = testCard({ id: 'G02_GRAVE_B', cardlocation: 'GRAVE' });
  const totemState = game({
    unitZone: [totem, null, null, null, null, null],
    grave: [graveA, graveB],
  });
  awakenUnit(totemState, 'BOT', totem, totem);
  await confirmTrigger(totemState, 'BOT');
  const recovered = totemState.players.BOT.grave.length === 0 &&
    totemState.players.BOT.deck.some((card: Card) => card.gamecardId === graveA.gamecardId) &&
    totemState.players.BOT.deck.some((card: Card) => card.gamecardId === graveB.gamecardId);

  const shinboku = cloneScriptCard(bt05G05 as Card, 'UNIT');
  const shinbokuAwakenSource = testCard({ id: 'G05_SHINBOKU_AWAKEN', cardlocation: 'UNIT' });
  const shinbokuDraw = testCard({ id: 'G05_SHINBOKU_DRAW', cardlocation: 'DECK' });
  const shinbokuState = game({
    unitZone: [shinboku, shinbokuAwakenSource, null, null, null, null],
    deck: [shinbokuDraw],
  });
  awakenUnit(shinbokuState, 'BOT', shinboku, shinbokuAwakenSource);
  markReturnToDeckBottomAtEnd(shinboku, shinbokuAwakenSource, shinbokuState, 'BOT');
  await processTurnEndDelayedEffects(shinbokuState, 'BOT');
  const shinbokuAsked = shinbokuState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE' &&
    shinbokuState.pendingQuery?.context?.effectId === '103080213_leave_draw';
  if (shinbokuAsked) {
    await answerPendingQuery(shinbokuState, 'BOT', ['YES']);
  }
  const shinbokuDrew = shinbokuState.players.BOT.hand.some((card: Card) => card.gamecardId === shinbokuDraw.gamecardId);

  const monkey = cloneScriptCard(bt07G04 as Card, 'UNIT');
  const ally = testCard({ id: 'G04_ALLY', fullName: 'Ally', cardlocation: 'UNIT', power: 1000, basePower: 1000 });
  const monkeyState = game({
    unitZone: [monkey, ally, null, null, null, null],
  });
  const monkeyAwakenIndex = monkey.effects?.findIndex(effect => effect.id === '103080314_awaken') ?? -1;
  await ServerGameService.activateEffect(monkeyState, 'BOT', monkey.gamecardId, monkeyAwakenIndex);
  await ServerGameService.passConfrontation(monkeyState, monkeyState.priorityPlayerId);
  if (monkeyState.pendingQuery?.context?.effectId === '103080314_awaken') {
    await answerPendingQuery(monkeyState, 'BOT', [ally.gamecardId]);
  }
  const boostedAndMarked = ally.power === 2000 && (ally as any).data?.returnToDeckBottomAtTurnEnd === monkeyState.turnCount;

  const selfMonkey = cloneScriptCard(bt07G04 as Card, 'UNIT', { gamecardId: 'G04_SELF_MONKEY' });
  const shinbokuMill = testCard({ id: 'G04_SELF_MILL', fullName: '神木森候补', faction: '神木森', godMark: false, cardlocation: 'DECK' });
  const selfMonkeyState = game({
    unitZone: [selfMonkey, null, null, null, null, null],
    deck: [shinbokuMill],
  });
  awakenUnit(selfMonkeyState, 'BOT', selfMonkey, selfMonkey);
  markReturnToDeckBottomAtEnd(selfMonkey, selfMonkey, selfMonkeyState, 'BOT');
  await processTurnEndDelayedEffects(selfMonkeyState, 'BOT');
  const selfMonkeyAsked = selfMonkeyState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE' &&
    selfMonkeyState.pendingQuery?.context?.effectId === '103080314_own_unit_effect_leave_mill_shinboku';
  if (selfMonkeyAsked) {
    await answerPendingQuery(selfMonkeyState, 'BOT', ['YES']);
  }
  if (selfMonkeyState.pendingQuery?.context?.effectId === '103080314_own_unit_effect_leave_mill_shinboku') {
    await answerPendingQuery(selfMonkeyState, 'BOT', [shinbokuMill.gamecardId]);
  }
  const selfMonkeyMilled = selfMonkeyState.players.BOT.grave.some((card: Card) => card.gamecardId === shinbokuMill.gamecardId);

  const snowRabbit = cloneScriptCard(bt07G05 as Card, 'UNIT');
  const returnedUnit = testCard({ id: 'G05_RETURNED', cardlocation: 'UNIT' });
  const revive = testCard({ id: 'G05_REVIVE', type: 'UNIT', godMark: false, cardlocation: 'GRAVE' });
  const discard = testCard({ id: 'G05_DISCARD', color: 'GREEN', cardlocation: 'HAND' });
  const rabbitState = game({
    hand: [discard],
    unitZone: [snowRabbit, returnedUnit, null, null, null, null],
    grave: [revive],
    erosionBack: [testCard({ id: 'G05_BACK', cardlocation: 'EROSION_BACK' })],
  });
  ServerGameService.moveCard(rabbitState, 'BOT', 'UNIT', 'BOT', 'DECK', returnedUnit.gamecardId, {
    insertAtBottom: true,
    isEffect: true,
    effectSourcePlayerUid: 'BOT',
    effectSourceCardId: snowRabbit.gamecardId,
  });
  await confirmTrigger(rabbitState, 'BOT');
  const rabbitOptions = (rabbitState.pendingQuery?.options || []).map((option: any) => option.card?.gamecardId || option.id);
  const rabbitTargetLockedBeforeCost = rabbitOptions.includes(revive.gamecardId) && !rabbitOptions.includes(discard.gamecardId);
  if (rabbitState.pendingQuery?.context?.effectId === '103080315_unit_to_deck_put_grave_unit' &&
    rabbitState.pendingQuery?.context?.step === 'TARGET') {
    await answerPendingQuery(rabbitState, 'BOT', [revive.gamecardId]);
  }
  if (rabbitState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(rabbitState, 'BOT', [discard.gamecardId]);
  }
  const rabbitRevived = rabbitTargetLockedBeforeCost &&
    rabbitState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === revive.gamecardId) &&
    rabbitState.players.BOT.grave.some((card: Card) => card.gamecardId === discard.gamecardId);

  const selfRabbit = cloneScriptCard(bt07G05 as Card, 'UNIT', { gamecardId: 'G05_SELF_RABBIT' });
  const selfRabbitRevive = testCard({ id: 'G05_SELF_REVIVE', type: 'UNIT', godMark: false, cardlocation: 'GRAVE' });
  const selfRabbitDiscard = testCard({ id: 'G05_SELF_DISCARD', color: 'GREEN', cardlocation: 'HAND' });
  const selfRabbitState = game({
    hand: [selfRabbitDiscard],
    unitZone: [selfRabbit, null, null, null, null, null],
    grave: [selfRabbitRevive],
    erosionBack: [testCard({ id: 'G05_SELF_BACK', cardlocation: 'EROSION_BACK' })],
  });
  awakenUnit(selfRabbitState, 'BOT', selfRabbit, selfRabbit);
  markReturnToDeckBottomAtEnd(selfRabbit, selfRabbit, selfRabbitState, 'BOT');
  await processTurnEndDelayedEffects(selfRabbitState, 'BOT');
  const selfRabbitAsked = selfRabbitState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE' &&
    selfRabbitState.pendingQuery?.context?.effectId === '103080315_unit_to_deck_put_grave_unit';
  if (selfRabbitAsked) {
    await answerPendingQuery(selfRabbitState, 'BOT', ['YES']);
  }
  const selfRabbitOptions = (selfRabbitState.pendingQuery?.options || []).map((option: any) => option.card?.gamecardId || option.id);
  const selfRabbitTargetLockedBeforeCost = selfRabbitOptions.includes(selfRabbitRevive.gamecardId) &&
    !selfRabbitOptions.includes(selfRabbitDiscard.gamecardId);
  if (selfRabbitState.pendingQuery?.context?.effectId === '103080315_unit_to_deck_put_grave_unit' &&
    selfRabbitState.pendingQuery?.context?.step === 'TARGET') {
    await answerPendingQuery(selfRabbitState, 'BOT', [selfRabbitRevive.gamecardId]);
  }
  if (selfRabbitState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(selfRabbitState, 'BOT', [selfRabbitDiscard.gamecardId]);
  }
  const selfRabbitRevived = selfRabbitTargetLockedBeforeCost &&
    selfRabbitState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === selfRabbitRevive.gamecardId) &&
    selfRabbitState.players.BOT.grave.some((card: Card) => card.gamecardId === selfRabbitDiscard.gamecardId);

  const rescue = cloneScriptCard(bt07G08 as Card, 'PLAY');
  const graveUnit = testCard({ id: 'G08_GRAVE_UNIT', type: 'UNIT', cardlocation: 'GRAVE' });
  const erosionUnit = testCard({ id: 'G08_EROSION', type: 'UNIT', cardlocation: 'EROSION_FRONT', displayState: 'FRONT_UPRIGHT' });
  const greenDiscard = testCard({ id: 'G08_DISCARD', color: 'GREEN', cardlocation: 'HAND' });
  const rescueState = game({
    playZone: [rescue],
    hand: [greenDiscard],
    grave: [graveUnit],
    erosionBack: [testCard({ id: 'G08_BACK', cardlocation: 'EROSION_BACK' })],
    erosionFront: [erosionUnit],
  });
  const rescueEffect = rescue.effects?.[0];
  await rescueEffect?.execute?.(rescue, rescueState, rescueState.players.BOT);
  if (rescueState.pendingQuery?.context?.step === 'TARGET') {
    await answerPendingQuery(rescueState, 'BOT', [graveUnit.gamecardId]);
  }
  if (rescueState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(rescueState, 'BOT', [greenDiscard.gamecardId]);
  }
  const rescued = rescueState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === graveUnit.gamecardId) &&
    rescueState.players.BOT.erosionFront.some((card: Card | null) => card?.gamecardId === erosionUnit.gamecardId) &&
    rescueState.players.BOT.exile.some((card: Card) => card.gamecardId === rescue.gamecardId);

  return recovered && shinbokuDrew && boostedAndMarked && selfMonkeyMilled && rabbitRevived && selfRabbitRevived && rescued
    ? pass(name, `recovered=${recovered}, shinboku=${shinbokuDrew}, boosted=${boostedAndMarked}, monkey=${selfMonkeyMilled}, rabbit=${rabbitRevived}/${selfRabbitRevived}, rescued=${rescued}`)
    : fail(name, `recovered=${recovered}, shinboku=${shinbokuDrew}/${shinbokuAsked}, boosted=${boostedAndMarked}, monkey=${selfMonkeyMilled}/${selfMonkeyAsked}, rabbit=${rabbitRevived}/${selfRabbitRevived}/${selfRabbitAsked}, rescued=${rescued}`);
}

async function testGreenGrienOrderSanctuaryAndMessenger(): Promise<ScenarioResult> {
  const name = 'BT07-G07/G09/G10/G11 Grien order sanctuary and messenger';
  const grien = cloneScriptCard(bt07G07 as Card, 'GRAVE');
  const colorSource = testCard({ id: 'G07_GREEN_SOURCE', color: 'GREEN', cardlocation: 'UNIT' });
  const millA = testCard({ id: 'G07_MILL_A', cardlocation: 'DECK' });
  const millB = testCard({ id: 'G07_MILL_B', cardlocation: 'DECK' });
  const selfState = game({
    unitZone: [testCard({ id: 'G07_LEAVER', cardlocation: 'UNIT' }), colorSource, null, null, null, null],
    grave: [grien],
    deck: [millA, millB],
  });
  ServerGameService.moveCard(selfState, 'BOT', 'UNIT', 'BOT', 'GRAVE', selfState.players.BOT.unitZone[0]!.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'BOT',
    effectSourceCardId: selfState.players.BOT.unitZone[0]!.gamecardId,
  });
  await confirmTrigger(selfState, 'BOT');
  const grienRevived = selfState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === grien.gamecardId) &&
    selfState.players.BOT.grave.some((card: Card) => card.gamecardId === millA.gamecardId) &&
    selfState.players.BOT.grave.some((card: Card) => card.gamecardId === millB.gamecardId);

  const grienActive = cloneScriptCard(bt07G07 as Card, 'HAND', { gamecardId: 'G07_ACTIVE' });
  const awakenDeckUnit = cloneScriptCard(bt07G05 as Card, 'DECK', { gamecardId: 'G07_AWAKEN_TARGET' });
  const awakenTextOnlyUnit = cloneScriptCard(bt07G06 as Card, 'DECK', { gamecardId: 'G07_TEXT_ONLY_AWAKEN' });
  const serializedGrien = JSON.parse(JSON.stringify(grienActive)) as Card;
  const awakenPutState = game({
    hand: [serializedGrien],
    deck: [awakenDeckUnit, awakenTextOnlyUnit],
    unitZone: [testCard({ id: 'G07_PAY', color: 'GREEN', cardlocation: 'UNIT' }), null, null, null, null, null],
    erosionBack: [testCard({ id: 'G07_BACK', cardlocation: 'EROSION_BACK' })],
  });
  ServerGameService.hydrateCard(serializedGrien);
  const awakenPutIndex = grienActive.effects?.findIndex(effect => effect.id === '103080317_put_awaken_unit') ?? -1;
  const grienHydratedCostHook = typeof (serializedGrien.effects?.[awakenPutIndex] as any)?.onCostResolve === 'function';
  const grienScar1Valid = ServerGameService.checkEffectLimitsAndReqs(
    awakenPutState,
    'BOT',
    serializedGrien,
    serializedGrien.effects![awakenPutIndex],
    'HAND'
  ).valid;
  await ServerGameService.activateEffect(awakenPutState, 'BOT', serializedGrien.gamecardId, awakenPutIndex);
  if (awakenPutState.pendingQuery?.type === 'SELECT_PAYMENT') {
    const payer = awakenPutState.players.BOT.unitZone.find((unit: Card | null) => unit?.id === 'G07_PAY');
    await answerPendingQuery(awakenPutState, 'BOT', [JSON.stringify({ exhaustUnitIds: payer ? [payer.gamecardId] : [] })]);
  }
  if (!awakenPutState.pendingQuery && awakenPutState.phase === 'COUNTERING') {
    await ServerGameService.passConfrontation(awakenPutState, awakenPutState.priorityPlayerId);
  }
  const grienAwakenOptions = (awakenPutState.pendingQuery?.options || []).map((option: any) => option.card.gamecardId);
  const grienOnlyTrueAwakenTargets = grienAwakenOptions.includes(awakenDeckUnit.gamecardId) &&
    !grienAwakenOptions.includes(awakenTextOnlyUnit.gamecardId);
  if (awakenPutState.pendingQuery?.context?.effectId === '103080317_put_awaken_unit') {
    await answerPendingQuery(awakenPutState, 'BOT', [awakenDeckUnit.gamecardId]);
  }
  const grienScar1Put = grienScar1Valid &&
    grienHydratedCostHook &&
    grienOnlyTrueAwakenTargets &&
    awakenPutState.players.BOT.grave.some((card: Card) => card.gamecardId === serializedGrien.gamecardId) &&
    awakenPutState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === awakenDeckUnit.gamecardId);

  const grienFieldActive = cloneScriptCard(bt07G07 as Card, 'UNIT', { gamecardId: 'G07_FIELD_ACTIVE' });
  const fieldAwakenDeckUnit = cloneScriptCard(bt07G05 as Card, 'DECK', { gamecardId: 'G07_FIELD_AWAKEN_TARGET' });
  const fieldPayer = testCard({ id: 'G07_FIELD_PAY', color: 'GREEN', cardlocation: 'UNIT' });
  const grienFullFieldState = game({
    unitZone: [
      grienFieldActive,
      fieldPayer,
      testCard({ id: 'G07_FILL_A', cardlocation: 'UNIT' }),
      testCard({ id: 'G07_FILL_B', cardlocation: 'UNIT' }),
      testCard({ id: 'G07_FILL_C', cardlocation: 'UNIT' }),
      testCard({ id: 'G07_FILL_D', cardlocation: 'UNIT' }),
    ],
    deck: [fieldAwakenDeckUnit, ...deckCards(3, 'G07_FIELD_PAY_DECK', 'GREEN')],
    erosionBack: [testCard({ id: 'G07_FIELD_BACK', cardlocation: 'EROSION_BACK' })],
  });
  const grienFullFieldValid = ServerGameService.checkEffectLimitsAndReqs(
    grienFullFieldState,
    'BOT',
    grienFieldActive,
    grienFieldActive.effects![awakenPutIndex],
    'UNIT'
  ).valid;
  await ServerGameService.activateEffect(grienFullFieldState, 'BOT', grienFieldActive.gamecardId, awakenPutIndex);
  if (grienFullFieldState.pendingQuery?.type === 'SELECT_PAYMENT') {
    await answerPendingQuery(grienFullFieldState, 'BOT', [JSON.stringify({ exhaustUnitIds: [fieldPayer.gamecardId] })]);
  }
  if (!grienFullFieldState.pendingQuery && grienFullFieldState.phase === 'COUNTERING') {
    await ServerGameService.passConfrontation(grienFullFieldState, grienFullFieldState.priorityPlayerId);
  }
  const grienFieldAskedTarget = grienFullFieldState.pendingQuery?.context?.effectId === '103080317_put_awaken_unit';
  if (grienFieldAskedTarget) {
    await answerPendingQuery(grienFullFieldState, 'BOT', [fieldAwakenDeckUnit.gamecardId]);
  }
  const grienFieldCostAndPut = grienFullFieldValid &&
    fieldPayer.isExhausted &&
    grienFullFieldState.players.BOT.grave.some((card: Card) => card.gamecardId === grienFieldActive.gamecardId) &&
    grienFullFieldState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === fieldAwakenDeckUnit.gamecardId);

  const order = cloneScriptCard(bt07G09 as Card, 'PLAY');
  const red = testCard({ id: 'G09_RED', color: 'RED', acValue: 3, godMark: false, cardlocation: 'UNIT' });
  const orderState = game({ playZone: [order] }, { unitZone: [red, null, null, null, null, null] });
  await order.effects?.[0]?.execute?.(order, orderState, orderState.players.BOT);
  if (orderState.pendingQuery?.context?.step === 'DESTROY_TARGET') {
    await answerPendingQuery(orderState, 'BOT', [red.gamecardId]);
  }
  const orderDestroyed = orderState.players.P1.grave.some((card: Card) => card.gamecardId === red.gamecardId);

  const counterOrder = cloneScriptCard(bt07G09 as Card, 'PLAY', { gamecardId: 'G09_COUNTER_ORDER' });
  const redPlay = testCard({ id: 'G09_RED_PLAY', type: 'UNIT', color: 'RED', acValue: 3, godMark: false, cardlocation: 'PLAY' });
  const counterState = game({
    playZone: [counterOrder],
    erosionBack: [testCard({ id: 'G09_BACK', cardlocation: 'EROSION_BACK' })],
  }, {
    playZone: [redPlay],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    counterStack: [{ type: 'PLAY', card: redPlay, ownerUid: 'P1', timestamp: Date.now() }],
  });
  await counterOrder.effects?.[0]?.onQueryResolve?.(counterOrder, counterState, counterState.players.BOT, ['COUNTER'], { step: 'MODE' });
  const orderCountered = !!counterState.counterStack[0]?.isNegated;

  const sanctuary = cloneScriptCard(bt07G10 as Card, 'ITEM');
  const protectedGrave = testCard({ id: 'G10_GRAVE', cardlocation: 'GRAVE' });
  const source = testCard({ id: 'G10_SOURCE', cardlocation: 'UNIT' });
  const shinboku = testCard({ id: 'G10_SHINBOKU', fullName: '神木森 Unit', faction: '神木森', cardlocation: 'UNIT', power: 1000, basePower: 1000 });
  const sanctuaryState = game({
    grave: [protectedGrave],
    itemZone: [sanctuary],
    unitZone: [shinboku, null, null, null, null, null],
    erosionFront: [testCard({ id: 'G10_EROSION', cardlocation: 'EROSION_FRONT' })],
  }, {
    unitZone: [source, null, null, null, null, null],
  });
  const moved = ServerGameService.moveCard(sanctuaryState, 'BOT', 'GRAVE', 'BOT', 'EXILE', protectedGrave.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: source.gamecardId,
  });
  EventEngine.recalculateContinuousEffects(sanctuaryState);
  const sanctuaryProtected = moved === false && sanctuaryState.players.BOT.grave.some((card: Card) => card.gamecardId === protectedGrave.gamecardId);
  const sanctuaryBuffed = shinboku.power === 1500;

  const messenger = cloneScriptCard(bt07G11 as Card, 'UNIT');
  const reviveTarget = testCard({ id: 'G11_REVIVE', type: 'UNIT', color: 'GREEN', godMark: false, cardlocation: 'GRAVE' });
  const messengerState = game({
    unitZone: [messenger, null, null, null, null, null],
    grave: [reviveTarget],
  });
  EventEngine.dispatchEvent(messengerState, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: messenger,
    sourceCardId: messenger.gamecardId,
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' }
  });
  await confirmTrigger(messengerState, 'BOT');
  if (messengerState.pendingQuery?.context?.effectId === '103000318_enter_or_leave_revive_green') {
    await answerPendingQuery(messengerState, 'BOT', [reviveTarget.gamecardId]);
  }
  const messengerRevived = messengerState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === reviveTarget.gamecardId);

  return grienRevived && grienScar1Put && grienFieldCostAndPut && orderDestroyed && orderCountered && sanctuaryProtected && sanctuaryBuffed && messengerRevived
    ? pass(name, `grien=${grienRevived}/${grienScar1Put}/${grienFieldCostAndPut}, order=${orderDestroyed}/${orderCountered}, sanctuary=${sanctuaryProtected}/${sanctuaryBuffed}, messenger=${messengerRevived}`)
    : fail(name, `grien=${grienRevived}/${grienScar1Put}/${grienFieldCostAndPut}, order=${orderDestroyed}/${orderCountered}, sanctuary=${sanctuaryProtected}/${sanctuaryBuffed}, messenger=${messengerRevived}`);
}

async function testRedShieldSoulDevourAndDiscounts(): Promise<ScenarioResult> {
  const name = 'BT07-R01/R02/R03 shield exile, soul devour and discounts';
  const shield = cloneScriptCard(bt07R01 as Card, 'UNIT');
  const priest = cloneScriptCard(bt07R03 as Card, 'UNIT');
  const goblin = cloneScriptCard(bt07R02 as Card, 'UNIT');
  const deckGoblin = cloneScriptCard(bt07R02 as Card, 'DECK', { gamecardId: 'R02_DECK_COPY' });
  const redHand = testCard({
    id: 'R03_RED_HAND',
    fullName: 'Red Discount Hand',
    type: 'STORY',
    color: 'RED',
    cardlocation: 'HAND',
    acValue: 2,
    baseAcValue: 2,
    godMark: false,
  });
  const thunderHand = cloneScriptCard(bt07R02 as Card, 'HAND', {
    gamecardId: 'R03_THUNDER_HAND',
    color: 'BLUE',
    acValue: 2,
    baseAcValue: 2,
  });
  const exileSource = testCard({ id: 'R01_SOURCE', fullName: 'Opponent Exile Source', cardlocation: 'UNIT' });
  const destroyTarget = testCard({ id: 'R01_TARGET', fullName: 'Opponent Non-God Target', godMark: false, cardlocation: 'UNIT' });
  const state = game({
    hand: [redHand, thunderHand],
    unitZone: [shield, priest, goblin, null, null, null],
    deck: [deckGoblin, ...deckCards(4, 'R02_FILL', 'RED')],
  }, {
    unitZone: [destroyTarget, exileSource, null, null, null, null],
  });

  ServerGameService.moveCard(state, 'BOT', 'UNIT', 'BOT', 'EXILE', shield.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: exileSource.gamecardId,
  });
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId === '102050319_exiled_by_opponent_destroy') {
    await answerPendingQuery(state, 'BOT', [destroyTarget.gamecardId]);
  }
  const shieldDestroyedTarget = state.players.P1.grave.some((card: Card) => card.gamecardId === destroyTarget.gamecardId);

  const soulIndex = priest.effects?.findIndex(effect => effect.id === '102060321_soul_devour_power') ?? -1;
  await priest.effects?.[soulIndex]?.execute?.(priest, state, state.players.BOT);
  if (state.pendingQuery?.context?.effectId === '102060321_soul_devour_power') {
    await answerPendingQuery(state, 'BOT', [goblin.gamecardId]);
  }
  await confirmTrigger(state, 'BOT');
  if (state.pendingQuery?.context?.effectId === '102060320_cost_grave_put_copy') {
    await answerPendingQuery(state, 'BOT', [deckGoblin.gamecardId]);
  }
  EventEngine.recalculateContinuousEffects(state);

  const soulCount = (state.players.BOT as any)[`soulDevourActivatedTurn_${state.turnCount}`] === 1;
  const sentCount = totalUnitsSentFromFieldToGraveThisTurn(state) >= 1;
  const copiedGoblin = state.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === deckGoblin.gamecardId);
  const copiedExhausted = !!copiedGoblin?.isExhausted;
  const discounted = redHand.acValue === 1 && thunderHand.acValue === 1;

  const priestA = cloneScriptCard(bt07R03 as Card, 'UNIT', { gamecardId: 'R03_STACK_PRIEST_A' });
  const priestB = cloneScriptCard(bt07R03 as Card, 'UNIT', { gamecardId: 'R03_STACK_PRIEST_B' });
  const fodderA = cloneScriptCard(bt07R02 as Card, 'UNIT', { gamecardId: 'R03_STACK_FODDER_A' });
  const fodderB = cloneScriptCard(bt07R02 as Card, 'UNIT', { gamecardId: 'R03_STACK_FODDER_B' });
  const stackRedHand = testCard({
    id: 'R03_STACK_RED_HAND',
    fullName: 'Red Stack Discount Hand',
    type: 'STORY',
    color: 'RED',
    cardlocation: 'HAND',
    acValue: 5,
    baseAcValue: 5,
    godMark: false,
  });
  const stackThunderHand = cloneScriptCard(bt07R02 as Card, 'HAND', {
    gamecardId: 'R03_STACK_THUNDER_HAND',
    acValue: 5,
    baseAcValue: 5,
  });
  const stackState = game({
    hand: [stackRedHand, stackThunderHand],
    unitZone: [priestA, priestB, fodderA, fodderB, null, null],
  });
  const stackSoulIndex = priestA.effects?.findIndex(effect => effect.id === '102060321_soul_devour_power') ?? -1;
  await priestA.effects?.[stackSoulIndex]?.execute?.(priestA, stackState, stackState.players.BOT);
  if (stackState.pendingQuery?.context?.effectId === '102060321_soul_devour_power') {
    await answerPendingQuery(stackState, 'BOT', [fodderA.gamecardId]);
  }
  await priestB.effects?.[stackSoulIndex]?.execute?.(priestB, stackState, stackState.players.BOT);
  if (stackState.pendingQuery?.context?.effectId === '102060321_soul_devour_power') {
    await answerPendingQuery(stackState, 'BOT', [fodderB.gamecardId]);
  }
  EventEngine.recalculateContinuousEffects(stackState);

  const stackedSoulCount = (stackState.players.BOT as any)[`soulDevourActivatedTurn_${stackState.turnCount}`] === 2;
  const stackedScriptDiscount = stackRedHand.acValue === 1 && stackThunderHand.acValue === 1;
  const stackedServerDiscount =
    ServerGameService.getEffectivePlayCost(stackState.players.BOT, stackRedHand, stackState) === 1 &&
    ServerGameService.getEffectivePlayCost(stackState.players.BOT, stackThunderHand, stackState) === 1;
  const stackedClientDiscount =
    GameService.getEffectivePlayCostDetails(stackState, stackState.players.BOT, stackRedHand).cost === 1 &&
    GameService.getEffectivePlayCostDetails(stackState, stackState.players.BOT, stackThunderHand).cost === 1;

  return shieldDestroyedTarget && soulCount && sentCount && copiedExhausted && discounted &&
    stackedSoulCount && stackedScriptDiscount && stackedServerDiscount && stackedClientDiscount
    ? pass(name, `shield=${shieldDestroyedTarget}, soul=${soulCount}, copy=${copiedExhausted}, discount=${redHand.acValue}/${thunderHand.acValue}, stacked=${stackRedHand.acValue}/${stackThunderHand.acValue}`)
    : fail(name, `shield=${shieldDestroyedTarget}, soul=${soulCount}, sent=${sentCount}, copy=${!!copiedGoblin}/${copiedGoblin?.isExhausted}, discount=${redHand.acValue}/${thunderHand.acValue}, stacked=${stackedSoulCount}/${stackRedHand.acValue}/${stackThunderHand.acValue}/${stackedServerDiscount}/${stackedClientDiscount}`);
}

async function testRedBatBladeItemAndTamiThresholds(): Promise<ScenarioResult> {
  const name = 'BT07-R05/R06/R10/R11 bat blade item and Tami thresholds';
  const bat = cloneScriptCard(bt07R05 as Card, 'UNIT', { playedTurn: 6 });
  const payer = testCard({ id: 'R05_PAYER', fullName: 'Red Payer', color: 'RED', cardlocation: 'UNIT' });
  const batTarget = testCard({ id: 'R05_TARGET', fullName: 'Bat Target', godMark: false, cardlocation: 'UNIT' });
  const batState = game({
    unitZone: [bat, payer, null, null, null, null],
    deck: deckCards(5, 'R05_PAY', 'RED'),
  }, {
    unitZone: [batTarget, null, null, null, null, null],
  });
  const batIndex = bat.effects?.findIndex(effect => effect.id === '102070370_entry_destroy') ?? -1;
  await ServerGameService.activateEffect(batState, 'BOT', bat.gamecardId, batIndex, undefined, { resumeFromQuery: true });
  if (batState.pendingQuery?.type === 'SELECT_PAYMENT') {
    await answerPendingQuery(batState, 'BOT', [JSON.stringify({ exhaustUnitIds: [payer.gamecardId] })]);
  }
  await ServerGameService.resolveCounterStack(batState);
  if (batState.pendingQuery?.context?.effectId === '102070370_entry_destroy') {
    await answerPendingQuery(batState, 'BOT', [batTarget.gamecardId]);
  }
  const batDestroyed = batState.players.P1.grave.some((card: Card) => card.gamecardId === batTarget.gamecardId);

  const blade = cloneScriptCard(bt07R06 as Card, 'UNIT');
  const vessel = cloneScriptCard(bt07R10 as Card, 'ITEM', { equipTargetId: blade.gamecardId });
  const recruit = cloneScriptCard(bt07R04 as Card, 'DECK', { gamecardId: 'R06_RECRUIT' });
  const bladeInDeck = cloneScriptCard(bt07R06 as Card, 'DECK', { gamecardId: 'R06_BLADE_IN_DECK' });
  const bladeState = game({
    unitZone: [blade, null, null, null, null, null],
    itemZone: [vessel],
    deck: [bladeInDeck, recruit, ...deckCards(3, 'R10_DRAW', 'RED')],
  });
  const bladeIndex = blade.effects?.findIndex(effect => effect.id === '102070371_self_cost_put_soul_devour') ?? -1;
  await blade.effects?.[bladeIndex]?.execute?.(blade, bladeState, bladeState.players.BOT);
  const bladeOptionIds = (bladeState.pendingQuery?.options || []).map((option: any) => option.card.gamecardId);
  if (bladeOptionIds.includes(bladeInDeck.gamecardId) || !bladeOptionIds.includes(recruit.gamecardId)) {
    return fail(name, `blade options=${bladeOptionIds.join(',')}`);
  }
  if (bladeState.pendingQuery?.context?.effectId === '102070371_self_cost_put_soul_devour') {
    await answerPendingQuery(bladeState, 'BOT', [recruit.gamecardId]);
  }
  await confirmTrigger(bladeState, 'BOT');
  const recruited = bladeState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === recruit.gamecardId);
  const itemDrew = bladeState.players.BOT.hand.length === 1;
  const bladeCounted = totalUnitsSentFromFieldToGraveThisTurn(bladeState) >= 1;

  const tami = cloneScriptCard(bt07R11 as Card, 'UNIT');
  const rafaUnit = cloneScriptCard(bt05R07 as Card, 'UNIT');
  const ally = testCard({ id: 'R11_ALLY', fullName: 'Tami Ally', color: 'RED', cardlocation: 'UNIT', power: 1000, basePower: 1000 });
  const tamiTarget = testCard({ id: 'R11_TARGET', fullName: 'Tami Target', cardlocation: 'UNIT' });
  const tamiState = game({
    unitZone: [tami, ally, rafaUnit, null, null, null],
  }, {
    unitZone: [tamiTarget, null, null, null, null, null],
  });
  (tamiState as any)[`unitsSentFromFieldToGraveTurn_${tamiState.turnCount}_global`] = 6;
  EventEngine.recalculateContinuousEffects(tamiState);
  const tamiThresholds =
    tami.power === 4500 &&
    rafaUnit.power === 4500 &&
    tami.power === 4500 &&
    ally.power === 2500 &&
    !!tami.isrush &&
    !!tami.isHeroic &&
    !!tami.isShenyi &&
    !!(ally as any).data?.canAttackAnyUnit;
  const tamiDestroyIndex = tami.effects?.findIndex(effect => effect.id === '102060373_six_destroy_card') ?? -1;
  await tami.effects?.[tamiDestroyIndex]?.execute?.(tami, tamiState, tamiState.players.BOT);
  if (tamiState.pendingQuery?.context?.effectId === '102060373_six_destroy_card') {
    await answerPendingQuery(tamiState, 'BOT', [tamiTarget.gamecardId]);
  }
  const tamiDestroyed = tamiState.players.P1.grave.some((card: Card) => card.gamecardId === tamiTarget.gamecardId);

  return batDestroyed && recruited && itemDrew && bladeCounted && tamiThresholds && tamiDestroyed
    ? pass(name, `bat=${batDestroyed}, blade=${recruited}/${itemDrew}, tami=${tamiThresholds}/${tamiDestroyed}`)
    : fail(name, `bat=${batDestroyed}, recruited=${recruited}, itemDrew=${itemDrew}, bladeCounted=${bladeCounted}, tami=${tamiThresholds}/${tamiDestroyed}`);
}

async function testSoulDevourTriggersThunderLeaderAndClearsInterruptedBattle(): Promise<ScenarioResult> {
  const name = 'Soul devour power change triggers leader and clears interrupted battle';
  const leader = cloneScriptCard(bt04R07 as Card, 'UNIT', { power: 3000, basePower: 3000 });
  const warrior = cloneScriptCard(bt07R04 as Card, 'UNIT');
  const cost = testCard({ id: 'SOUL_COST', fullName: 'Soul Cost', type: 'UNIT', color: 'RED', godMark: false, cardlocation: 'UNIT' });
  const thunderSearch = testCard({ id: 'THUNDER_SEARCH', fullName: 'Thunder Search', type: 'UNIT', faction: '雷霆', cardlocation: 'DECK' });
  const state = game({
    unitZone: [leader, warrior, cost, null, null, null],
    deck: [thunderSearch, ...deckCards(4, 'LEADER_FILL', 'RED')],
  });

  const soulIndex = warrior.effects?.findIndex(effect => effect.id === '102060369_soul_devour_power') ?? -1;
  await warrior.effects?.[soulIndex]?.execute?.(warrior, state, state.players.BOT);
  if (state.pendingQuery?.context?.effectId === '102060369_soul_devour_power') {
    await answerPendingQuery(state, 'BOT', [cost.gamecardId]);
  }
  await confirmTrigger(state, 'BOT');
  const leaderPrompted = state.pendingQuery?.context?.effectId === '102060433_power_search';

  const battleLeader = cloneScriptCard(bt04R07 as Card, 'UNIT', { gamecardId: 'BATTLE_LEADER', power: 3000, basePower: 3000, inAllianceGroup: true, isAttacking: true } as any);
  const battleWarrior = cloneScriptCard(bt07R04 as Card, 'UNIT', { gamecardId: 'BATTLE_WARRIOR' });
  const attackCost = testCard({ id: 'SOUL_ATTACK_COST', fullName: 'Soul Attack Cost', type: 'UNIT', color: 'RED', godMark: false, cardlocation: 'UNIT', isDefending: true } as any);
  const defender = testCard({ id: 'SOUL_DEFENDER', fullName: 'Soul Defender', type: 'UNIT', cardlocation: 'UNIT' });
  const battleState = game({
    unitZone: [battleLeader, battleWarrior, attackCost, null, null, null],
  }, {
    unitZone: [defender, null, null, null, null, null],
  }, {
    phase: 'BATTLE_FREE',
    battleState: {
      attackers: [battleLeader.gamecardId],
      defender: attackCost.gamecardId,
      unitTargetId: attackCost.gamecardId,
      isAlliance: false,
    },
  });
  const battleSoulIndex = battleWarrior.effects?.findIndex(effect => effect.id === '102060369_soul_devour_power') ?? -1;
  await battleWarrior.effects?.[battleSoulIndex]?.execute?.(battleWarrior, battleState, battleState.players.BOT);
  if (battleState.pendingQuery?.context?.effectId === '102060369_soul_devour_power') {
    await answerPendingQuery(battleState, 'BOT', [attackCost.gamecardId]);
  }
  const battleCleared =
    battleState.phase === 'MAIN' &&
    !battleState.battleState &&
    !battleLeader.inAllianceGroup &&
    !(battleLeader as any).isAttacking &&
    !(attackCost as any).isDefending;

  return leaderPrompted && battleCleared
    ? pass(name, `leaderPrompted=${leaderPrompted}, battleCleared=${battleCleared}`)
    : fail(name, `leaderPrompted=${leaderPrompted}, pending=${state.pendingQuery?.context?.effectId || 'none'}, phase=${battleState.phase}, battle=${!!battleState.battleState}, attacking=${!!(battleLeader as any).isAttacking}, defending=${!!(attackCost as any).isDefending}`);
}

async function testNormalBattleDestroyDoesNotCountAsInterruptedBattle(): Promise<ScenarioResult> {
  const name = 'Normal battle destruction does not count as interrupted battle';
  const attacker = testCard({
    id: 'NORMAL_ATTACKER',
    fullName: 'Normal Attacker',
    type: 'UNIT',
    cardlocation: 'UNIT',
    power: 3000,
    basePower: 3000,
    damage: 1,
    isAttacking: true,
  } as any);
  const defender = testCard({
    id: 'NORMAL_DEFENDER',
    fullName: 'Normal Defender',
    type: 'UNIT',
    cardlocation: 'UNIT',
    power: 1000,
    basePower: 1000,
    isDefending: true,
  } as any);
  const state = game({
    unitZone: [attacker, null, null, null, null, null],
  }, {
    unitZone: [defender, null, null, null, null, null],
  }, {
    phase: 'DAMAGE_CALCULATION',
    battleState: {
      attackers: [attacker.gamecardId],
      defender: defender.gamecardId,
      resolvedUnitIds: [],
    },
  });

  await ServerGameService.resolveDamage(state);

  const defenderDestroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === defender.gamecardId);
  const returnedMain = state.phase === 'MAIN' && !state.battleState;
  const exhaustedAttacker = !!state.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === attacker.gamecardId)?.isExhausted;
  const noInterruptedLog = !state.logs.some((log: any) =>
    String(typeof log === 'string' ? log : log?.text || '').includes('战斗中止')
  );

  return defenderDestroyed && returnedMain && exhaustedAttacker && noInterruptedLog
    ? pass(name, `destroyed=${defenderDestroyed}, phase=${state.phase}, exhausted=${exhaustedAttacker}`)
    : fail(name, `destroyed=${defenderDestroyed}, phase=${state.phase}, battle=${!!state.battleState}, exhausted=${exhaustedAttacker}, interruptedLog=${!noInterruptedLog}`);
}

function testThunderHighPowerRushThresholds(): ScenarioResult {
  const name = 'BT03-R04/BT07-R04 thunder rush thresholds';
  const flyer = cloneScriptCard(bt03R04 as Card, 'UNIT');
  const warrior = cloneScriptCard(bt07R04 as Card, 'UNIT');
  const lowState = game({
    unitZone: [flyer, warrior, null, null, null, null],
  });
  EventEngine.recalculateContinuousEffects(lowState);
  const lowOk =
    !flyer.isrush &&
    flyer.damage === flyer.baseDamage &&
    !warrior.isrush &&
    warrior.damage === warrior.baseDamage;

  flyer.temporaryPowerBuff = 2000;
  warrior.temporaryPowerBuff = 1500;
  EventEngine.recalculateContinuousEffects(lowState);
  const highOk =
    flyer.power === 3500 &&
    !!flyer.isrush &&
    flyer.damage === (flyer.baseDamage || 0) + 1 &&
    warrior.power === 3500 &&
    !!warrior.isrush &&
    warrior.damage === (warrior.baseDamage || 0) + 1;

  const commander = cloneScriptCard(bt03R03 as Card, 'UNIT', { gamecardId: 'R_THRESHOLD_COMMANDER' });
  const auraFlyer = cloneScriptCard(bt03R04 as Card, 'UNIT', { gamecardId: 'R_THRESHOLD_FLYER' });
  const empress = cloneScriptCard(bt03R07 as Card, 'UNIT', { gamecardId: 'R_THRESHOLD_EMPRESS' });
  const auraWarrior = cloneScriptCard(bt07R04 as Card, 'UNIT', { gamecardId: 'R_THRESHOLD_WARRIOR' });
  const booster = testCard({
    id: 'R_THRESHOLD_BOOSTER',
    fullName: 'Threshold Booster',
    cardlocation: 'UNIT',
    effects: [{
      id: 'R_THRESHOLD_BOOSTER_POWER',
      type: 'CONTINUOUS',
      triggerLocation: ['UNIT'],
      applyContinuous: (state: any, source: Card) => {
        state.players.BOT.unitZone
          .filter((unit: Card | null): unit is Card => !!unit && unit.gamecardId !== source.gamecardId)
          .forEach((unit: Card) => addContinuousPower(unit, source, 2000));
      }
    } as any]
  });
  const continuousState = game({
    unitZone: [commander, auraFlyer, empress, auraWarrior, booster, null],
  });
  EventEngine.recalculateContinuousEffects(continuousState);
  const continuousOk =
    commander.power === 4000 &&
    !!commander.isrush &&
    commander.damage === (commander.baseDamage || 0) + 1 &&
    auraFlyer.power === 3500 &&
    !!auraFlyer.isrush &&
    auraFlyer.damage === (auraFlyer.baseDamage || 0) + 1 &&
    empress.power === 5000 &&
    !!empress.isrush &&
    !!empress.isAnnihilation &&
    !!empress.isShenyi &&
    auraWarrior.power === 4000 &&
    !!auraWarrior.isrush &&
    auraWarrior.damage === (auraWarrior.baseDamage || 0) + 1;

  return lowOk && highOk && continuousOk
    ? pass(name, `low=${lowOk}, high=${highOk}, continuous=${continuousOk}`)
    : fail(name, `flyer=${flyer.power}/${flyer.damage}/${flyer.isrush}, warrior=${warrior.power}/${warrior.damage}/${warrior.isrush}, continuous=${commander.power}/${commander.damage}/${commander.isrush};${auraFlyer.power}/${auraFlyer.damage}/${auraFlyer.isrush};${empress.power}/${empress.isrush}/${empress.isAnnihilation}/${empress.isShenyi};${auraWarrior.power}/${auraWarrior.damage}/${auraWarrior.isrush}, low=${lowOk}, high=${highOk}, continuousOk=${continuousOk}`);
}

async function testRedAsuraSacrificeAndHiyeOrder(): Promise<ScenarioResult> {
  const name = 'BT07-R07/R08/R09 Asura sacrifice and Hiye order';
  const asura = cloneScriptCard(bt07R07 as Card, 'UNIT');
  const destroyedByOwnEffect = testCard({ id: 'R07_DESTROYED', fullName: 'Asura Trigger Target', type: 'UNIT', cardlocation: 'UNIT' });
  const asuraState = game({
    unitZone: [asura, null, null, null, null, null],
  }, {
    unitZone: [destroyedByOwnEffect, null, null, null, null, null],
    deck: deckCards(5, 'R07_DAMAGE_DECK'),
  });
  destroyByEffect(asuraState, destroyedByOwnEffect, asura);
  await confirmTrigger(asuraState, 'BOT');
  const asuraDamaged = asuraState.players.P1.erosionFront.filter(Boolean).length === 2;

  const ohAsura = cloneScriptCard(bt07R07 as Card, 'UNIT', { gamecardId: 'R07_OH_ASURA' });
  const ohCost = testCard({ id: 'R07_OH_COST', color: 'RED', cardlocation: 'HAND' });
  const ohTarget = testCard({ id: 'R07_OH_TARGET', godMark: false, cardlocation: 'UNIT' });
  const ohState = game({
    hand: [ohCost],
    unitZone: [ohAsura, null, null, null, null, null],
    erosionFront: deckCards(10, 'R07_GODDESS_EROSION').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' })),
    isGoddessMode: true,
  }, {
    unitZone: [ohTarget, null, null, null, null, null],
  });
  const ohIndex = ohAsura.effects?.findIndex(effect => effect.id === '102000372_oh_destroy_non_god') ?? -1;
  await ServerGameService.activateEffect(ohState, 'BOT', ohAsura.gamecardId, ohIndex, undefined, { resumeFromQuery: true });
  if (ohState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(ohState, 'BOT', [ohCost.gamecardId]);
  }
  await ServerGameService.resolveCounterStack(ohState);
  if (ohState.pendingQuery?.context?.effectId === '102000372_oh_destroy_non_god') {
    await answerPendingQuery(ohState, 'BOT', [ohTarget.gamecardId]);
  }
  const asuraOhDestroyed = ohState.players.P1.grave.some((card: Card) => card.gamecardId === ohTarget.gamecardId);
  const asuraOhDisabled = !!(ohAsura as any).data?.ohEffectDisabledUntilOwnStartUid;

  const damageStory = cloneScriptCard(bt07R08 as Card, 'PLAY');
  const damageCost = testCard({ id: 'R08_DAMAGE_COST', color: 'RED', cardlocation: 'HAND' });
  const damageTarget = testCard({ id: 'R08_DAMAGE_TARGET', cardlocation: 'UNIT', damage: 1, baseDamage: 1 });
  const damageState = game({
    hand: [damageCost],
    playZone: [damageStory],
    unitZone: [damageTarget, null, null, null, null, null],
  });
  await damageStory.effects?.[0]?.execute?.(damageStory, damageState, damageState.players.BOT);
  if (damageState.pendingQuery?.context?.step === 'MODE') {
    await answerPendingQuery(damageState, 'BOT', [optionIdByValue(damageState, 'DAMAGE')]);
  }
  if (damageState.pendingQuery?.context?.step === 'DAMAGE_TARGET') {
    await answerPendingQuery(damageState, 'BOT', [damageTarget.gamecardId]);
  }
  if (damageState.pendingQuery?.context?.step === 'DAMAGE_COST') {
    await answerPendingQuery(damageState, 'BOT', [damageCost.gamecardId]);
  }
  const sacrificeDamage = damageTarget.damage === 3;

  const retaliationStory = cloneScriptCard(bt07R08 as Card, 'PLAY', { gamecardId: 'R08_RETALIATION' });
  const retaliationCost = testCard({ id: 'R08_RET_COST', color: 'BLUE', cardlocation: 'HAND' });
  const victim = testCard({ id: 'R08_VICTIM', type: 'UNIT', cardlocation: 'UNIT' });
  const retaliationSource = testCard({ id: 'R08_SOURCE', type: 'UNIT', cardlocation: 'UNIT' });
  const retaliationState = game({
    hand: [retaliationCost],
    playZone: [retaliationStory],
    unitZone: [victim, null, null, null, null, null],
    deck: deckCards(4, 'R08_DRAW'),
  }, {
    unitZone: [retaliationSource, null, null, null, null, null],
  });
  await retaliationStory.effects?.[0]?.execute?.(retaliationStory, retaliationState, retaliationState.players.BOT);
  if (retaliationState.pendingQuery?.context?.step === 'RETALIATION_COST') {
    await answerPendingQuery(retaliationState, 'BOT', [retaliationCost.gamecardId]);
  }
  ServerGameService.moveCard(retaliationState, 'BOT', 'UNIT', 'BOT', 'EXILE', victim.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: retaliationSource.gamecardId,
  });
  await confirmTrigger(retaliationState, 'BOT');
  const retaliationDestroyed = retaliationState.players.P1.grave.some((card: Card) => card.gamecardId === retaliationSource.gamecardId);
  const retaliationDrew = retaliationState.players.BOT.hand.length === 2;

  const order = cloneScriptCard(bt07R09 as Card, 'PLAY');
  const white = testCard({ id: 'R09_WHITE', type: 'UNIT', color: 'WHITE', acValue: 3, godMark: false, cardlocation: 'UNIT' });
  const orderState = game({ playZone: [order] }, { unitZone: [white, null, null, null, null, null] });
  await order.effects?.[0]?.execute?.(order, orderState, orderState.players.BOT);
  if (orderState.pendingQuery?.context?.step === 'DESTROY_TARGET') {
    await answerPendingQuery(orderState, 'BOT', [white.gamecardId]);
  }
  const orderDestroyed = orderState.players.P1.grave.some((card: Card) => card.gamecardId === white.gamecardId);

  const counterOrder = cloneScriptCard(bt07R09 as Card, 'PLAY', { gamecardId: 'R09_COUNTER_ORDER' });
  const whitePlay = testCard({ id: 'R09_WHITE_PLAY', type: 'UNIT', color: 'WHITE', acValue: 3, godMark: false, cardlocation: 'PLAY' });
  const counterState = game({
    playZone: [counterOrder],
    erosionBack: [testCard({ id: 'R09_BACK', cardlocation: 'EROSION_BACK' })],
  }, {
    playZone: [whitePlay],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    counterStack: [{ type: 'PLAY', card: whitePlay, ownerUid: 'P1', timestamp: Date.now() }],
  });
  await counterOrder.effects?.[0]?.onQueryResolve?.(counterOrder, counterState, counterState.players.BOT, ['COUNTER'], { step: 'MODE' });
  const orderCountered = !!counterState.counterStack[0]?.isNegated;

  return asuraDamaged && asuraOhDestroyed && asuraOhDisabled && sacrificeDamage && retaliationDestroyed && retaliationDrew && orderDestroyed && orderCountered
    ? pass(name, `asura=${asuraDamaged}/${asuraOhDestroyed}, sacrifice=${sacrificeDamage}/${retaliationDestroyed}/${retaliationDrew}, order=${orderDestroyed}/${orderCountered}`)
    : fail(name, `asura=${asuraDamaged}/${asuraOhDestroyed}/${asuraOhDisabled}, sacrifice=${sacrificeDamage}/${retaliationDestroyed}/${retaliationDrew}, order=${orderDestroyed}/${orderCountered}`);
}

async function testYellowPainterStephanieAndSteelPuppet(): Promise<ScenarioResult> {
  const name = 'BT07-Y01/Y03/Y05 painter Stephanie and steel puppet';
  const painter = cloneScriptCard(bt07Y01 as Card, 'UNIT');
  const blueprintItem = cloneScriptCard(bt07Y08 as Card, 'DECK');
  const painterState = game({
    unitZone: [painter, null, null, null, null, null],
    deck: [blueprintItem, ...deckCards(3, 'Y01_FILL', 'YELLOW')],
  });
  EventEngine.dispatchEvent(painterState, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: painter,
    sourceCardId: painter.gamecardId,
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' }
  });
  await confirmTrigger(painterState, 'BOT');
  if (painterState.pendingQuery?.context?.effectId === '105110381_hand_enter_search_blueprint_item') {
    await answerPendingQuery(painterState, 'BOT', [blueprintItem.gamecardId]);
  }
  const searchedBlueprint = painterState.players.BOT.hand.some((card: Card) => card.gamecardId === blueprintItem.gamecardId) && painter.isExhausted;

  const stephanie = cloneScriptCard(bt07Y03 as Card, 'UNIT');
  const costTop = testCard({ id: 'Y03_COST_TOP', cardlocation: 'DECK' });
  const puppetFromTop = testCard({
    id: 'Y03_NON_GOD_PUPPET',
    fullName: '魔偶 Target',
    type: 'UNIT',
    color: 'YELLOW',
    godMark: false,
    acValue: 2,
    cardlocation: 'DECK',
  });
  const otherReveal = testCard({ id: 'Y03_OTHER_REVEAL', fullName: 'Other Reveal', cardlocation: 'DECK' });
  const stephanieState = game({
    unitZone: [stephanie, null, null, null, null, null],
    deck: [otherReveal, puppetFromTop, costTop],
    erosionBack: [
      testCard({ id: 'Y03_BACK_1', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'Y03_BACK_2', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'Y03_BACK_3', cardlocation: 'EROSION_BACK' }),
    ],
  });
  const stephanieIndex = stephanie.effects?.findIndex(effect => effect.id === '105110383_creation_scar_put_top_blueprint_or_puppet') ?? -1;
  await stephanie.effects?.[stephanieIndex]?.cost?.(stephanieState, stephanieState.players.BOT, stephanie);
  await stephanie.effects?.[stephanieIndex]?.execute?.(stephanie, stephanieState, stephanieState.players.BOT);
  if (stephanieState.pendingQuery?.context?.effectId === '105110383_creation_scar_put_top_blueprint_or_puppet') {
    await answerPendingQuery(stephanieState, 'BOT', [puppetFromTop.gamecardId]);
  }
  EventEngine.recalculateContinuousEffects(stephanieState);
  const stephanieBuffed = stephanie.power === 4000 && stephanie.damage === 4 && !!stephanie.isHeroic;
  const stephaniePutPuppet = stephanieState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === puppetFromTop.gamecardId) &&
    stephanieState.players.BOT.exile.some((card: Card) => card.gamecardId === costTop.gamecardId && card.displayState === 'FRONT_FACEDOWN');
  const stephanieLow = cloneScriptCard(bt07Y03 as Card, 'UNIT', { gamecardId: 'Y03_LOW' });
  const stephanieLowState = game({
    unitZone: [stephanieLow, null, null, null, null, null],
    erosionBack: [
      testCard({ id: 'Y03_LOW_BACK_1', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'Y03_LOW_BACK_2', cardlocation: 'EROSION_BACK' }),
    ],
  });
  EventEngine.recalculateContinuousEffects(stephanieLowState);
  const stephanieNeedsScar3 = stephanieLow.power === 2500 && stephanieLow.damage === 2 && !stephanieLow.isHeroic;

  const revealedSteel = cloneScriptCard(bt07Y05 as Card, 'DECK', { gamecardId: 'Y05_REVEALED_TOP' });
  const revealTop = testCard({ id: 'Y05_REVEAL_TOP', cardlocation: 'DECK' });
  const revealState = game({
    deck: [testCard({ id: 'Y05_BOTTOM', cardlocation: 'DECK' }), revealedSteel, revealTop],
  });
  revealDeckCards(revealState, 'BOT', 2, revealedSteel);
  await confirmTrigger(revealState, 'BOT');
  EventEngine.recalculateContinuousEffects(revealState);
  const selfPutSteel = revealState.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === revealedSteel.gamecardId &&
    unit.power === 4000 &&
    !!unit.isHeroic
  );
  revealState.turnCount = 7;
  EventEngine.recalculateContinuousEffects(revealState);
  const selfPutSteelNextTurn = revealState.players.BOT.unitZone.some((unit: Card | null) =>
    unit?.gamecardId === revealedSteel.gamecardId &&
    unit.power === 4000 &&
    !!unit.isHeroic
  );

  return searchedBlueprint && stephanieBuffed && stephaniePutPuppet && stephanieNeedsScar3 && selfPutSteel && selfPutSteelNextTurn
    ? pass(name, `search=${searchedBlueprint}, stephanie=${stephanieBuffed}/${stephaniePutPuppet}/${stephanieNeedsScar3}, steel=${selfPutSteel}/${selfPutSteelNextTurn}`)
    : fail(name, `search=${searchedBlueprint}, stephanie=${stephanieBuffed}/${stephaniePutPuppet}/${stephanieNeedsScar3}, steel=${selfPutSteel}/${selfPutSteelNextTurn}`);
}

async function testYellowGuardRawStoneAndStories(): Promise<ScenarioResult> {
  const name = 'BT07-Y02/Y04/Y06/Y07 guard raw stone and stories';
  const guard = cloneScriptCard(bt07Y02 as Card, 'UNIT');
  const recruit = testCard({ id: 'Y02_RECRUIT', fullName: 'Yellow Recruit', type: 'UNIT', color: 'YELLOW', godMark: false, acValue: 2, cardlocation: 'DECK' });
  const revived = testCard({ id: 'Y02_OPP_REVIVED', type: 'UNIT', cardlocation: 'GRAVE' });
  const reviveSource = testCard({ id: 'Y02_OPP_SOURCE', type: 'UNIT', cardlocation: 'UNIT' });
  const guardState = game({
    unitZone: [guard, null, null, null, null, null],
    erosionBack: [testCard({ id: 'Y02_BACK', cardlocation: 'EROSION_BACK' })],
    deck: [recruit, ...deckCards(3, 'Y02_FILL', 'YELLOW')],
  }, {
    grave: [revived],
    unitZone: [reviveSource, null, null, null, null, null],
  });
  ServerGameService.moveCard(guardState, 'P1', 'GRAVE', 'P1', 'UNIT', revived.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: reviveSource.gamecardId,
  });
  await confirmTrigger(guardState, 'BOT');
  if (guardState.pendingQuery?.context?.effectId === '105110382_opponent_grave_entry_recruit') {
    await answerPendingQuery(guardState, 'BOT', [recruit.gamecardId]);
  }
  const guardedRecruit = guardState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === recruit.gamecardId);

  const rawStone = cloneScriptCard(bt07Y04 as Card, 'UNIT');
  const immortalStone = cloneScriptCard(bt07Y09 as Card, 'DECK');
  const alchemySource = testCard({ id: 'Y04_ALCHEMY', fullName: '炼金 Source', type: 'UNIT', color: 'YELLOW', cardlocation: 'UNIT' });
  const rawColorState = game({
    unitZone: [cloneScriptCard(bt07Y04 as Card, 'UNIT', { gamecardId: 'Y04_COLOR_RAW' }), null, null, null, null, null],
  });
  const rawColorBeforeAlchemyMove = ServerGameService.getColorRequirementResult(rawColorState.players.BOT, { BLUE: 1 }).valid;
  const rawState = game({
    unitZone: [rawStone, alchemySource, null, null, null, null],
    deck: [immortalStone, ...deckCards(5, 'Y04_PAY', 'YELLOW')],
  });
  ServerGameService.moveCard(rawState, 'BOT', 'UNIT', 'BOT', 'GRAVE', rawStone.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'BOT',
    effectSourceCardId: alchemySource.gamecardId,
  });
  await confirmTrigger(rawState, 'BOT');
  if (rawState.pendingQuery?.type === 'SELECT_PAYMENT') {
    await answerPendingQuery(rawState, 'BOT', [JSON.stringify({})]);
  }
  if (rawState.pendingQuery?.context?.effectId === '105000384_effect_grave_search_immortal_stone') {
    await answerPendingQuery(rawState, 'BOT', [immortalStone.gamecardId]);
  }
  const rawPaymentAsked = rawState.players.BOT.erosionFront.length + rawState.players.BOT.erosionBack.length === 2;
  const rawSearched = rawPaymentAsked &&
    !rawColorBeforeAlchemyMove &&
    rawState.players.BOT.hand.some((card: Card) => card.gamecardId === immortalStone.gamecardId);

  const party = cloneScriptCard(bt07Y06 as Card, 'PLAY');
  const staleParty = { ...party, cardlocation: 'HAND' as const };
  const partyTarget = testCard({ id: 'Y06_TARGET', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });
  const partyState = game({
    playZone: [party],
    erosionBack: [testCard({ id: 'Y06_BACK', cardlocation: 'EROSION_BACK' })],
    deck: [
      testCard({ id: 'Y06_BOTTOM', cardlocation: 'DECK' }),
      testCard({ id: 'Y06_FILL_1', cardlocation: 'DECK' }),
      testCard({ id: 'Y06_GOD', type: 'UNIT', godMark: true, cardlocation: 'DECK' }),
      testCard({ id: 'Y06_FILL_2', cardlocation: 'DECK' }),
      testCard({ id: 'Y06_TOP', cardlocation: 'DECK' }),
    ],
  }, {
    unitZone: [partyTarget, null, null, null, null, null],
  });
  const noScarParty = cloneScriptCard(bt07Y06 as Card, 'PLAY', { gamecardId: 'Y06_NO_SCAR' });
  const noScarPartyState = game({
    playZone: [noScarParty],
    deck: deckCards(5, 'Y06_NO_SCAR_DECK', 'YELLOW'),
  }, {
    unitZone: [testCard({ id: 'Y06_NO_SCAR_TARGET', cardlocation: 'UNIT' }), null, null, null, null, null],
  });
  const partyNoScarBlocked = !ServerGameService.checkEffectLimitsAndReqs(
    noScarPartyState,
    'BOT',
    noScarParty,
    noScarParty.effects![0],
    'PLAY'
  ).valid;
  await staleParty.effects?.[0]?.execute?.(staleParty, partyState, partyState.players.BOT);
  if (partyState.pendingQuery?.context?.effectId === '205000111_puppet_party') {
    await answerPendingQuery(partyState, 'BOT', [partyTarget.gamecardId]);
  }
  const partyDestroyed = partyNoScarBlocked &&
    partyState.players.P1.grave.some((card: Card) => card.gamecardId === partyTarget.gamecardId) &&
    partyState.players.BOT.exile.some((card: Card) => card.gamecardId === party.gamecardId);

  const order = cloneScriptCard(bt07Y07 as Card, 'PLAY');
  const green = testCard({ id: 'Y07_GREEN', type: 'UNIT', color: 'GREEN', acValue: 3, godMark: false, cardlocation: 'UNIT' });
  const orderState = game({ playZone: [order] }, { unitZone: [green, null, null, null, null, null] });
  await order.effects?.[0]?.execute?.(order, orderState, orderState.players.BOT);
  if (orderState.pendingQuery?.context?.step === 'DESTROY_TARGET') {
    await answerPendingQuery(orderState, 'BOT', [green.gamecardId]);
  }
  const orderDestroyed = orderState.players.P1.grave.some((card: Card) => card.gamecardId === green.gamecardId);

  const counterOrder = cloneScriptCard(bt07Y07 as Card, 'PLAY', { gamecardId: 'Y07_COUNTER_ORDER' });
  const greenPlay = testCard({ id: 'Y07_GREEN_PLAY', type: 'UNIT', color: 'GREEN', acValue: 3, godMark: false, cardlocation: 'PLAY' });
  const counterState = game({
    playZone: [counterOrder],
    erosionBack: [testCard({ id: 'Y07_BACK', cardlocation: 'EROSION_BACK' })],
  }, {
    playZone: [greenPlay],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    counterStack: [{ type: 'PLAY', card: greenPlay, ownerUid: 'P1', timestamp: Date.now() }],
  });
  await counterOrder.effects?.[0]?.onQueryResolve?.(counterOrder, counterState, counterState.players.BOT, ['COUNTER'], { step: 'MODE' });
  const orderCountered = !!counterState.counterStack[0]?.isNegated;

  return guardedRecruit && rawSearched && partyDestroyed && orderDestroyed && orderCountered
    ? pass(name, `guard=${guardedRecruit}, raw=${rawSearched}, party=${partyDestroyed}, order=${orderDestroyed}/${orderCountered}`)
    : fail(name, `guard=${guardedRecruit}, raw=${rawSearched}, party=${partyDestroyed}, order=${orderDestroyed}/${orderCountered}`);
}

async function testYellowFortressBlueprintAnalysisAndImmortalStone(): Promise<ScenarioResult> {
  const name = 'BT07-Y08/Y09/Y10/Y11 fortress blueprint analysis and immortal stone';
  const fortressBlueprint = cloneScriptCard(bt07Y08 as Card, 'ITEM');
  const defenseEngine = cloneScriptCard(bt07Y11 as Card, 'DECK');
  const opponentNonGodA = testCard({ id: 'Y11_OPP_A', type: 'UNIT', godMark: false, cardlocation: 'UNIT' });
  const opponentNonGodB = testCard({ id: 'Y11_OPP_B', type: 'ITEM', godMark: false, cardlocation: 'ITEM' });
  const blueprintState = game({
    itemZone: [fortressBlueprint],
    deck: [defenseEngine, ...deckCards(3, 'Y08_FILL', 'YELLOW')],
    exile: [
      testCard({ id: 'Y08_EXILE_1', cardlocation: 'EXILE', displayState: 'FRONT_FACEDOWN' }),
      testCard({ id: 'Y08_EXILE_2', cardlocation: 'EXILE', displayState: 'FRONT_FACEDOWN' }),
      testCard({ id: 'Y08_EXILE_3', cardlocation: 'EXILE', displayState: 'FRONT_FACEDOWN' }),
      testCard({ id: 'Y08_EXILE_4', cardlocation: 'EXILE', displayState: 'FRONT_FACEDOWN' }),
    ],
    erosionBack: [
      testCard({ id: 'Y11_BACK_1', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'Y11_BACK_2', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'Y11_BACK_3', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'Y11_BACK_4', cardlocation: 'EROSION_BACK' }),
    ],
  }, {
    unitZone: [opponentNonGodA, null, null, null, null, null],
    itemZone: [opponentNonGodB],
  });
  const blueprintEffect = fortressBlueprint.effects?.find(effect => effect.id === '305110061_end_fortress_blueprint');
  await blueprintEffect?.execute?.(fortressBlueprint, blueprintState, blueprintState.players.BOT);
  if (blueprintState.pendingQuery?.context?.effectId === '305110061_end_fortress_blueprint') {
    await answerPendingQuery(blueprintState, 'BOT', [defenseEngine.gamecardId]);
  }
  await confirmTrigger(blueprintState, 'BOT');
  if (blueprintState.pendingQuery?.context?.effectId === '105110386_blueprint_entry_destroy') {
    if (blueprintState.pendingQuery.context.step === 'MODE') {
      await answerPendingQuery(blueprintState, 'BOT', [optionIdByValue(blueprintState, 'DESTROY_OPPONENT_NON_GOD')]);
    }
  }
  EventEngine.recalculateContinuousEffects(blueprintState);
  const defenseOnField = blueprintState.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === defenseEngine.gamecardId) as Card | undefined;
  const blueprintResolved = !!defenseOnField &&
    blueprintState.players.BOT.exile.filter((card: Card) => card.displayState === 'FRONT_FACEDOWN').length === 0 &&
    blueprintState.players.P1.grave.some((card: Card) => card.gamecardId === opponentNonGodA.gamecardId) &&
    blueprintState.players.P1.grave.some((card: Card) => card.gamecardId === opponentNonGodB.gamecardId) &&
    defenseOnField.power === 5000 &&
    defenseOnField.damage === 5 &&
    !!defenseOnField.isHeroic &&
    !!defenseOnField.isAnnihilation;
  const defenseLow = cloneScriptCard(bt07Y11 as Card, 'UNIT', { gamecardId: 'Y11_LOW' });
  const defenseLowState = game({
    unitZone: [defenseLow, null, null, null, null, null],
    erosionBack: [
      testCard({ id: 'Y11_LOW_BACK_1', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'Y11_LOW_BACK_2', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'Y11_LOW_BACK_3', cardlocation: 'EROSION_BACK' }),
    ],
  });
  EventEngine.recalculateContinuousEffects(defenseLowState);
  const defenseNeedsScar4 = defenseLow.power === 4000 &&
    defenseLow.damage === 4 &&
    !defenseLow.isHeroic &&
    !defenseLow.isAnnihilation;

  const immortalStone = cloneScriptCard(bt07Y09 as Card, 'ITEM');
  const alchemySource = testCard({ id: 'Y09_ALCHEMY', fullName: '炼金 Tool', type: 'ITEM', cardlocation: 'ITEM' });
  const alchemyGraveA = testCard({ id: 'Y09_ALCHEMY_A', fullName: '炼金 A', cardlocation: 'GRAVE' });
  const alchemyGraveB = testCard({ id: 'Y09_ALCHEMY_B', fullName: '炼金 B', cardlocation: 'GRAVE' });
  const stoneState = game({
    itemZone: [immortalStone, alchemySource],
    grave: [alchemyGraveA, alchemyGraveB],
    deck: deckCards(3, 'Y09_DRAW', 'YELLOW'),
  });
  ServerGameService.moveCard(stoneState, 'BOT', 'ITEM', 'BOT', 'GRAVE', immortalStone.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'BOT',
    effectSourceCardId: alchemySource.gamecardId,
  });
  await confirmTrigger(stoneState, 'BOT');
  if (stoneState.pendingQuery?.context?.effectId === '305000062_alchemy_grave_bottom_draw_exile') {
    await answerPendingQuery(stoneState, 'BOT', [alchemyGraveA.gamecardId, alchemyGraveB.gamecardId]);
  }
  const stoneResolved = stoneState.players.BOT.exile.some((card: Card) => card.gamecardId === immortalStone.gamecardId) &&
    stoneState.players.BOT.hand.length === 1 &&
    stoneState.players.BOT.deck.some((card: Card) => card.gamecardId === alchemyGraveA.gamecardId) &&
    stoneState.players.BOT.deck.some((card: Card) => card.gamecardId === alchemyGraveB.gamecardId);

  const analysis = cloneScriptCard(bt07Y10 as Card, 'ITEM');
  const graveTarget = testCard({ id: 'Y10_TARGET_NAME', fullName: 'Analyzed Card', cardlocation: 'GRAVE' });
  const sameHand = testCard({ id: 'Y10_TARGET_NAME', fullName: 'Analyzed Card', cardlocation: 'HAND' });
  const analysisTop = testCard({ id: 'Y10_TOP', cardlocation: 'DECK' });
  const analysisSecond = testCard({ id: 'Y10_SECOND', cardlocation: 'DECK' });
  const analysisState = game({
    itemZone: [analysis],
    deck: [analysisSecond, analysisTop],
    erosionFront: [
      testCard({ id: 'Y10_FRONT_1', cardlocation: 'EROSION_FRONT', displayState: 'FRONT_UPRIGHT' }),
    ],
    erosionBack: [
      testCard({ id: 'Y10_BACK_1', cardlocation: 'EROSION_BACK' }),
    ],
  }, {
    grave: [graveTarget],
    hand: [sameHand],
  });
  const analysisIndex = analysis.effects?.findIndex(effect => effect.id === '305000063_analyze_same_name') ?? -1;
  const analysisCanActivateAtTotalTwo = GameService.checkEffectLimitsAndReqs(
    analysisState,
    'BOT',
    analysis,
    analysis.effects![analysisIndex],
    'ITEM'
  ).valid;
  await analysis.effects?.[analysisIndex]?.cost?.(analysisState, analysisState.players.BOT, analysis);
  await analysis.effects?.[analysisIndex]?.execute?.(analysis, analysisState, analysisState.players.BOT);
  if (analysisState.pendingQuery?.context?.step === 'TARGET') {
    await answerPendingQuery(analysisState, 'BOT', [graveTarget.gamecardId]);
  }
  if (analysisState.pendingQuery?.context?.step === 'SAME_NAME') {
    await answerPendingQuery(analysisState, 'P1', [sameHand.gamecardId]);
  }
  const analysisResolved = analysis.isExhausted &&
    analysisCanActivateAtTotalTwo &&
    analysisState.players.BOT.exile.some((card: Card) => card.gamecardId === analysisTop.gamecardId && card.displayState === 'FRONT_FACEDOWN') &&
    analysisState.players.BOT.exile.some((card: Card) => card.gamecardId === analysisSecond.gamecardId && card.displayState === 'FRONT_FACEDOWN') &&
    analysisState.players.P1.grave.some((card: Card) => card.gamecardId === sameHand.gamecardId);

  const enterAnalysis = cloneScriptCard(bt07Y10 as Card, 'ITEM');
  const enterTop = testCard({ id: 'Y10_ENTER_TOP', cardlocation: 'DECK' });
  const enterSecond = testCard({ id: 'Y10_ENTER_SECOND', cardlocation: 'DECK' });
  const enterState = game({
    itemZone: [enterAnalysis],
    deck: [enterSecond, enterTop],
  });
  EventEngine.dispatchEvent(enterState, {
    type: 'CARD_ENTERED_ZONE',
    sourceCard: enterAnalysis,
    sourceCardId: enterAnalysis.gamecardId,
    playerUid: 'BOT',
    data: { zone: 'ITEM' }
  });
  await ServerGameService.checkTriggeredEffects(enterState);
  const enterMandatoryResolved =
    enterState.pendingQuery?.callbackKey !== 'TRIGGER_CHOICE' &&
    enterState.players.BOT.exile.some((card: Card) => card.gamecardId === enterTop.gamecardId && card.displayState === 'FRONT_FACEDOWN') &&
    enterState.players.BOT.exile.some((card: Card) => card.gamecardId === enterSecond.gamecardId && card.displayState === 'FRONT_FACEDOWN');

  return blueprintResolved && defenseNeedsScar4 && stoneResolved && analysisResolved && enterMandatoryResolved
    ? pass(name, `blueprint=${blueprintResolved}/${defenseNeedsScar4}, stone=${stoneResolved}, analysis=${analysisResolved}, enterMandatory=${enterMandatoryResolved}`)
    : fail(name, `blueprint=${blueprintResolved}/${defenseNeedsScar4}, stone=${stoneResolved}, analysis=${analysisResolved}, enterMandatory=${enterMandatoryResolved}`);
}

const scenarios: ScenarioRun[] = [
  testPrepWorkerDestroysAfterShingiCostExile,
  testTwilightGuardProtectsAlliance,
  testNightMageRecoversAfterOpponentBounce,
  testHeavyKnightRecruitsAlliancePartner,
  testHeavyKnightPreventsFirstBattleDestroy,
  testHeavyKnightRecruitedAngelsDealAnnihilationDamage,
  testWhiteWingExilesGodmarkToPutItem,
  testSnowGirlRecoversShingiOnEffectLeave,
  testSnowGirlFreezesAfterShingiEntry,
  testDefenseShieldPreventsOnlyNextBattleDestroy,
  testTempleOrderDestroysBlueLowNonGod,
  testTempleOrderCountersBlueLowNonGodPlay,
  testDawnChapelDrawsAndBlocksConfrontingShingi,
  testDuskBarracksRecruitAndSubstitute,
  testYukatiaAllianceProtectionAndDestroy,
  testEmptyFantasyRecoverAndPreventEffectDamage,
  testPrFantasyStories,
  testBlueMerchantPutsOnlyKyubiNonGodItems,
  testBlueAishaRecoversAfterOpponentExileAndHouseRevives,
  testBlueAdventurerSupportAndErosionEntry,
  testBlueElenaReplacesDeckSearchAndTriggers,
  testBlueMahoragaMeditationAndTenkoOrder,
  testBlueWealthCoreAndEquipment,
  testHolyEightActivatesRequireGoddessMode,
  testGreenResonanceAndCubTigerChain,
  testGreenAwakenSnowRabbitAndCliffRescue,
  testGreenGrienOrderSanctuaryAndMessenger,
  testRedShieldSoulDevourAndDiscounts,
  testRedBatBladeItemAndTamiThresholds,
  testSoulDevourTriggersThunderLeaderAndClearsInterruptedBattle,
  testNormalBattleDestroyDoesNotCountAsInterruptedBattle,
  testThunderHighPowerRushThresholds,
  testRedAsuraSacrificeAndHiyeOrder,
  testYellowPainterStephanieAndSteelPuppet,
  testYellowGuardRawStoneAndStories,
  testYellowFortressBlueprintAnalysisAndImmortalStone,
];

await initServerCardLibrary();

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
