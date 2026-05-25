import { ServerGameService } from '../server/ServerGameService';
import { EventEngine } from '../src/services/EventEngine';
import { Card, TriggerLocation } from '../src/types/game';
import { getCardWealthValue, getPlayerWealthCount } from '../src/lib/wealth';
import { moveCardAsCost } from '../src/scripts/BaseUtil';
import bt06W01 from '../src/scripts/101100342';
import bt06W02 from '../src/scripts/101140343';
import bt06W03 from '../src/scripts/101140362';
import bt06W04 from '../src/scripts/101140344';
import bt06W05 from '../src/scripts/101140345';
import bt06W06 from '../src/scripts/101130346';
import bt06W08 from '../src/scripts/201140100';
import bt06W09 from '../src/scripts/201140101';
import bt06W11 from '../src/scripts/101140347';
import bt06B01 from '../src/scripts/104020335';
import bt06B02 from '../src/scripts/104020336';
import bt06B03 from '../src/scripts/104020337';
import bt06B04 from '../src/scripts/104020338';
import bt06B05 from '../src/scripts/104020339';
import bt06B06 from '../src/scripts/104020340';
import bt06B08 from '../src/scripts/204000097';
import bt06B09 from '../src/scripts/204000098';
import bt06B10 from '../src/scripts/304010054';
import bt06B11 from '../src/scripts/104010341';
import aketiCore from '../src/scripts/104020068';
import bt06G01 from '../src/scripts/103090327';
import bt06G02 from '../src/scripts/103090328';
import bt06G04 from '../src/scripts/103090330';
import bt06G05 from '../src/scripts/103000331';
import bt06G06 from '../src/scripts/103000332';
import bt06G07 from '../src/scripts/103000333';
import bt06G08 from '../src/scripts/203000095';
import bt06G09 from '../src/scripts/203000096';
import bt06G10 from '../src/scripts/303090053';
import bt06G11 from '../src/scripts/103000334';
import bt06R01 from '../src/scripts/102050363';
import bt06R02 from '../src/scripts/102050356';
import bt06R03 from '../src/scripts/102140364';
import bt06R04 from '../src/scripts/102070357';
import bt06R05 from '../src/scripts/102070358';
import bt06R06 from '../src/scripts/102070359';
import bt06R07 from '../src/scripts/102000360';
import bt06R08 from '../src/scripts/202000104';
import bt06R09 from '../src/scripts/202000105';
import bt06R10 from '../src/scripts/302050056';
import bt06R11 from '../src/scripts/102050365';
import bt06Y01 from '../src/scripts/105110348';
import bt06Y02 from '../src/scripts/105110349';
import bt06Y03 from '../src/scripts/105110350';
import bt06Y04 from '../src/scripts/105110351';
import bt06Y05 from '../src/scripts/105120352';
import bt06Y06 from '../src/scripts/105000353';
import bt06Y07 from '../src/scripts/105000354';
import bt06Y08 from '../src/scripts/205000106';
import bt06Y09 from '../src/scripts/205000103';
import bt06Y10 from '../src/scripts/305000055';
import bt06Y11 from '../src/scripts/105110355';
import academyFeijingMerchant from '../src/scripts/105110223';
import greatAlchemist from '../src/scripts/105120167';
import alchemyKnightElmont from '../src/scripts/105120168';
import divineAlchemy from '../src/scripts/205000136';
import forbiddenAlchemy from '../src/scripts/205000064';
import escort from '../src/scripts/101140151';
import valkyrieZero from '../src/scripts/105110114';
import chocolate from '../src/scripts/205000149';
import devotion from '../src/scripts/201100099';
import prayer from '../src/scripts/201000102';
import annihilationAngels from '../src/scripts/101130104';
import tya from '../src/scripts/101130204';

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
    gameId: nextId('bt06_scenario'),
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

async function chooseQueuedTrigger(state: any, effectId: string) {
  if (state.pendingQuery?.callbackKey !== 'TRIGGER_ORDER_CHOICE') return false;
  const option = (state.pendingQuery.options || []).find((candidate: any) => {
    const queueId = candidate.id || candidate.selectionId || candidate.value;
    const record = (state.triggeredEffectsQueue || []).find((entry: any) =>
      ServerGameService.getTriggerQueueId(entry) === queueId
    );
    return record?.effect?.id === effectId;
  });
  if (!option) return false;
  await answerPendingQuery(state, state.pendingQuery.playerUid, [option.id || option.selectionId || option.value]);
  return true;
}

async function playStoryAndResolve(state: any, playerUid: string, card: Card) {
  await ServerGameService.playCard(state, playerUid, card.gamecardId, {});
  if (state.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after story play, got ${state.phase}`);
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
}

async function activateAndResolveByOpponentPass(state: any, playerUid: string, card: Card, effectIndex: number) {
  await ServerGameService.activateEffect(state, playerUid, card.gamecardId, effectIndex);
  if (state.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    const required = Math.max(1, state.pendingQuery.minSelections || 1);
    const optionIds = (state.pendingQuery.options || [])
      .slice(0, required)
      .map((option: any) => option.id)
      .filter(Boolean);
    await answerPendingQuery(state, state.pendingQuery.playerUid, optionIds.length >= required ? optionIds : [optionIds[0] || 'PAY']);
  }
  if (state.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after activation, got ${state.phase}`);
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
}

async function activateTriggerAndAnswerYes(state: any, playerUid: string) {
  await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_ORDER_CHOICE') {
    const optionId = state.pendingQuery.options?.[0]?.id;
    if (optionId) await answerPendingQuery(state, state.pendingQuery.playerUid, [optionId]);
  }
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, playerUid, ['YES']);
  }
}

async function testCorielEndSearch(): Promise<ScenarioResult> {
  const name = 'BT06-W01 Coriel end trigger searches Prayer or Devotion';
  const coriel = cloneScriptCard(bt06W01 as Card, 'UNIT');
  const prayerCard = cloneScriptCard(prayer as Card, 'DECK');
  const state = game({
    deck: [prayerCard, ...deckCards(5, 'BOT_FILL')],
    unitZone: [coriel, null, null, null, null, null],
  }, {}, { phase: 'END' });

  EventEngine.dispatchEvent(state, { type: 'TURN_END' as any, playerUid: 'BOT' });
  await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.context?.effectId !== '101100342_end_search') {
    return fail(name, `expected search query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [prayerCard.gamecardId]);

  const inHand = state.players.BOT.hand.some((card: Card) => card.id === prayerCard.id);
  return inHand && coriel.isExhausted
    ? pass(name, `hand=${state.players.BOT.hand.length}, exhausted=${coriel.isExhausted}`)
    : fail(name, `inHand=${inHand}, exhausted=${coriel.isExhausted}`);
}

async function testCorielStoryCheatUnit(): Promise<ScenarioResult> {
  const name = 'BT06-W01 Coriel cheats colorless non-god unit on story play and silences it';
  const coriel = cloneScriptCard(bt06W01 as Card, 'UNIT');
  const story = testCard({
    id: 'BT06_W01_BLANK_STORY',
    fullName: '测试故事',
    type: 'STORY',
    color: 'WHITE',
    colorReq: {},
    acValue: 0,
    cardlocation: 'HAND',
    effects: [],
  });
  const target = testCard({
    id: 'BT06_W01_TARGET',
    fullName: 'Colorless Target',
    type: 'UNIT',
    color: 'NONE',
    colorReq: {},
    godMark: false,
    cardlocation: 'DECK',
    effects: [{
      id: 'dummy_effect',
      type: 'ACTIVATE',
      triggerLocation: ['UNIT'],
      description: 'dummy',
      execute: async () => undefined,
    }],
  });
  const state = game({
    hand: [story],
    deck: [target, ...deckCards(10, 'BOT_FILL')],
    unitZone: [coriel, null, null, null, null, null],
    erosionBack: [testCard({ id: 'EB1', cardlocation: 'EROSION_BACK' }), testCard({ id: 'EB2', cardlocation: 'EROSION_BACK' })],
  });

  await playStoryAndResolve(state, 'BOT', story);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  if (state.pendingQuery?.context?.effectId !== '101100342_story_cheat_unit') {
    return fail(name, `expected cheat query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const live = state.players.BOT.unitZone.find((unit: Card | null) => unit?.id === target.id);
  const silenced = !!(live as any)?.data?.permanentEffectSilenced;
  return live && silenced
    ? pass(name, `unit=${live.fullName}, silenced=${silenced}`)
    : fail(name, `live=${!!live}, silenced=${silenced}`);
}

async function testDawnFollowerDrawsWhenExiledForShingiCost(): Promise<ScenarioResult> {
  const name = 'BT06-W02 Dawn follower draws when exiled for Shingi cost';
  const follower = cloneScriptCard(bt06W02 as Card, 'UNIT');
  const shingiSource = testCard({ id: 'SHINGI_SOURCE', fullName: '神仪：测试', type: 'STORY', cardlocation: 'PLAY' });
  const state = game({
    deck: deckCards(3, 'BOT_DRAW'),
    unitZone: [follower, null, null, null, null, null],
    playZone: [shingiSource],
  });

  moveCardAsCost(state, 'BOT', follower, 'EXILE', shingiSource);
  await ServerGameService.checkTriggeredEffects(state);

  return state.players.BOT.hand.length === 1 && state.players.BOT.exile.some((card: Card) => card.gamecardId === follower.gamecardId)
    ? pass(name, `hand=${state.players.BOT.hand.length}, exile=${state.players.BOT.exile.length}`)
    : fail(name, `hand=${state.players.BOT.hand.length}, exile=${state.players.BOT.exile.length}`);
}

async function testWakaEnterSearchesShingiStory(): Promise<ScenarioResult> {
  const name = 'BT06-W03 Waka enters and searches Shingi story';
  const waka = cloneScriptCard(bt06W03 as Card, 'UNIT');
  const whiteAlly = testCard({ id: 'WHITE_ALLY', fullName: 'White Ally', color: 'WHITE', cardlocation: 'UNIT' });
  const shingiStory = cloneScriptCard(devotion as Card, 'DECK', { id: '201140100', fullName: '神仪：天使降临' });
  const state = game({
    deck: [shingiStory, ...deckCards(8, 'BOT_FILL')],
    unitZone: [waka, whiteAlly, null, null, null, null],
  });

  EventEngine.dispatchEvent(state, {
    type: 'CARD_ENTERED_ZONE',
    sourceCard: waka,
    sourceCardId: waka.gamecardId,
    playerUid: 'BOT',
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' },
  });
  await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.context?.effectId !== '101140362_enter_search_shingi') {
    return fail(name, `expected search query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [shingiStory.gamecardId]);

  const inHand = state.players.BOT.hand.some((card: Card) => card.gamecardId === shingiStory.gamecardId);
  return inHand && waka.isExhausted
    ? pass(name, `hand=${state.players.BOT.hand.length}, exhausted=${waka.isExhausted}`)
    : fail(name, `inHand=${inHand}, exhausted=${waka.isExhausted}`);
}

async function testKuriRevivesAfterLeavingField(): Promise<ScenarioResult> {
  const name = 'BT06-W04 Kuri draws and revives exhausted after leaving field';
  const kuri = cloneScriptCard(bt06W04 as Card, 'UNIT');
  const godA = testCard({ id: 'GOD_A', fullName: 'God A', godMark: true, cardlocation: 'GRAVE' });
  const godB = testCard({ id: 'GOD_B', fullName: 'God B', godMark: true, cardlocation: 'GRAVE' });
  const state = game({
    deck: deckCards(3, 'BOT_DRAW'),
    grave: [godA, godB],
    unitZone: [kuri, null, null, null, null, null],
  });

  ServerGameService.moveCard(state, 'BOT', 'UNIT', 'BOT', 'GRAVE', kuri.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: undefined,
  });
  await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.context?.effectId !== '101140344_leave_revive') {
    return fail(name, `expected cost query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [godA.gamecardId, godB.gamecardId]);

  const live = state.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === kuri.gamecardId);
  return live && live.isExhausted && state.players.BOT.hand.length === 1 && state.players.BOT.exile.length === 2
    ? pass(name, `hand=${state.players.BOT.hand.length}, exile=${state.players.BOT.exile.length}, exhausted=${live.isExhausted}`)
    : fail(name, `live=${!!live}, hand=${state.players.BOT.hand.length}, exile=${state.players.BOT.exile.length}, exhausted=${live?.isExhausted}`);
}

async function testKuriTenPlusPreventsDamage(): Promise<ScenarioResult> {
  const name = 'BT06-W04 Kuri 10+ exiles itself and prevents all damage';
  const kuri = cloneScriptCard(bt06W04 as Card, 'UNIT');
  const salala = testCard({ id: 'SALALA', fullName: '瑟族少女「萨拉拉」', specialName: '萨拉拉', color: 'GREEN', cardlocation: 'UNIT' });
  const erosion = Array.from({ length: 10 }, (_, index) => testCard({ id: `EROSION_${index}`, cardlocation: 'EROSION_BACK' }));
  const state = game({
    unitZone: [kuri, salala, null, null, null, null],
    erosionBack: erosion,
  });

  await activateAndResolveByOpponentPass(state, 'BOT', kuri, 1);

  return state.players.BOT.exile.some((card: Card) => card.gamecardId === kuri.gamecardId) &&
    (state.players.BOT as any).preventAllDamageTurn === state.turnCount
    ? pass(name, `exile=${state.players.BOT.exile.length}, preventTurn=${(state.players.BOT as any).preventAllDamageTurn}`)
    : fail(name, `exile=${state.players.BOT.exile.length}, preventTurn=${(state.players.BOT as any).preventAllDamageTurn}`);
}

async function testBishopAuraAndDawnFollowers(): Promise<ScenarioResult> {
  const name = 'BT06-W05 Bishop gains Shingi aura and calls Dawn Followers';
  const bishop = cloneScriptCard(bt06W05 as Card, 'UNIT');
  const shingiPlaced = testCard({
    id: 'SHINGI_PLACED',
    fullName: '神仪放置单位',
    type: 'UNIT',
    cardlocation: 'UNIT',
    data: { placedByShingiEffectSourceCardId: 'SHINGI_SOURCE' },
  } as any);
  const shingiStory = cloneScriptCard(bt06W08 as Card, 'HAND');
  const dawnA = cloneScriptCard(bt06W02 as Card, 'HAND');
  const dawnB = cloneScriptCard(bt06W02 as Card, 'DECK');
  const dawnC = cloneScriptCard(bt06W02 as Card, 'GRAVE');
  const state = game({
    hand: [shingiStory, dawnA],
    deck: [dawnB, ...deckCards(5, 'BOT_FILL')],
    grave: [dawnC],
    unitZone: [bishop, shingiPlaced, null, null, null, null],
    erosionBack: [testCard({ id: 'EB_W05', cardlocation: 'EROSION_BACK' })],
  });

  EventEngine.recalculateContinuousEffects(state);
  if ((bishop.power || 0) !== 3500 || (bishop.damage || 0) !== 3 || !(bishop as any).battleImmuneByEffect) {
    return fail(name, `aura power=${bishop.power}, damage=${bishop.damage}, battleImmune=${!!(bishop as any).battleImmuneByEffect}`);
  }

  await activateAndResolveByOpponentPass(state, 'BOT', bishop, 1);
  if (state.pendingQuery?.context?.step !== 'PUT_DAWN_FOLLOWERS') {
    return fail(name, `expected Dawn follower query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [dawnA.gamecardId, dawnB.gamecardId, dawnC.gamecardId]);

  const dawnFollowers = state.players.BOT.unitZone.filter((unit: Card | null): unit is Card => !!unit && unit.id === bt06W02.id);
  const allExhaustedAndMarked = dawnFollowers.length === 3 &&
    dawnFollowers.every(unit => unit.isExhausted && (unit as any).data?.returnToExileAtEndTurn === state.turnCount);
  return allExhaustedAndMarked
    ? pass(name, `followers=${dawnFollowers.length}, marked=${allExhaustedAndMarked}`)
    : fail(name, `followers=${dawnFollowers.length}, marked=${allExhaustedAndMarked}`);
}

async function testChantSingerReadiesOnOpponentAttack(): Promise<ScenarioResult> {
  const name = 'BT06-W06 Chant Singer readies on opponent attack';
  const singer = cloneScriptCard(bt06W06 as Card, 'UNIT', { isExhausted: true });
  const attacker = testCard({ id: 'OPP_ATTACKER', fullName: 'Opponent Attacker', cardlocation: 'UNIT', power: 2500, basePower: 2500 });
  const state = game({
    unitZone: [singer, null, null, null, null, null],
  }, {
    unitZone: [attacker, null, null, null, null, null],
  });

  EventEngine.dispatchEvent(state, {
    type: 'CARD_ATTACK_DECLARED',
    playerUid: 'P1',
    sourceCard: attacker,
    sourceCardId: attacker.gamecardId,
    data: { attackerIds: [attacker.gamecardId], isAlliance: false },
  });
  await ServerGameService.checkTriggeredEffects(state);

  return !singer.isExhausted
    ? pass(name, `exhausted=${singer.isExhausted}`)
    : fail(name, `exhausted=${singer.isExhausted}`);
}

async function testChantSingerCannotBeBattleDestroyedByPower2500OrLess(): Promise<ScenarioResult> {
  const name = 'BT06-W06 Chant Singer is immune to 2500 or lower non-alliance battle destruction';

  const defendingSinger = cloneScriptCard(bt06W06 as Card, 'UNIT');
  const attacker2500 = testCard({ id: 'ATTACKER_2500', fullName: '2500 Attacker', cardlocation: 'UNIT', power: 2500, basePower: 2500 });
  const defenseState = game({
    unitZone: [attacker2500, null, null, null, null, null],
  }, {
    unitZone: [defendingSinger, null, null, null, null, null],
  }, {
    phase: 'DAMAGE_CALCULATION',
    battleState: {
      attackers: [attacker2500.gamecardId],
      defender: defendingSinger.gamecardId,
      isAlliance: false,
      resolvedUnitIds: [],
    },
  });

  await ServerGameService.resolveDamage(defenseState);
  const survivedDefense = defenseState.players.P1.unitZone.some((unit: Card | null) => unit?.gamecardId === defendingSinger.gamecardId);

  const attackingSinger = cloneScriptCard(bt06W06 as Card, 'UNIT');
  const defender2500 = testCard({ id: 'DEFENDER_2500', fullName: '2500 Defender', cardlocation: 'UNIT', power: 2500, basePower: 2500 });
  const attackState = game({
    unitZone: [attackingSinger, null, null, null, null, null],
  }, {
    unitZone: [defender2500, null, null, null, null, null],
  }, {
    phase: 'DAMAGE_CALCULATION',
    battleState: {
      attackers: [attackingSinger.gamecardId],
      defender: defender2500.gamecardId,
      isAlliance: false,
      resolvedUnitIds: [],
    },
  });

  await ServerGameService.resolveDamage(attackState);
  const survivedAttack = attackState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === attackingSinger.gamecardId);

  return survivedDefense && survivedAttack
    ? pass(name, `defense=${survivedDefense}, attack=${survivedAttack}`)
    : fail(name, `defense=${survivedDefense}, attack=${survivedAttack}`);
}

async function testDevotionProtectsFromOpponentLeaveEffect(): Promise<ScenarioResult> {
  const name = 'BT06-W07 Devotion protects units from opponent leave-field effects';
  const devotionCard = cloneScriptCard(devotion as Card, 'HAND');
  const costUnit = testCard({ id: 'GOD_COST', fullName: 'God Cost', godMark: true, cardlocation: 'UNIT' });
  const protectedUnit = testCard({ id: 'PROTECTED_UNIT', fullName: 'Protected Unit', godMark: false, cardlocation: 'UNIT' });
  const opponentSource = testCard({ id: 'OPP_SOURCE', fullName: 'Opponent Removal', cardlocation: 'UNIT' });
  const state = game({
    hand: [devotionCard],
    unitZone: [costUnit, protectedUnit, null, null, null, null],
    erosionBack: [
      testCard({ id: 'EB_W07_A', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'EB_W07_B', cardlocation: 'EROSION_BACK' }),
    ],
  }, {
    unitZone: [opponentSource, null, null, null, null, null],
  });

  await playStoryAndResolve(state, 'BOT', devotionCard);
  if (state.pendingQuery?.context?.effectId !== '201100099_devotion') {
    return fail(name, `expected Devotion cost query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [costUnit.gamecardId]);
  const liveProtected = state.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === protectedUnit.gamecardId);
  if (!liveProtected || !(liveProtected as any).data?.cannotLeaveFieldByOpponentEffectTurn) {
    return fail(name, `protected marker missing, live=${!!liveProtected}`);
  }

  ServerGameService.moveCard(state, 'BOT', 'UNIT', 'BOT', 'GRAVE', protectedUnit.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
    effectSourceCardId: opponentSource.gamecardId,
  });
  const stillOnField = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === protectedUnit.gamecardId);
  const storyExiled = state.players.BOT.exile.some((card: Card) => card.gamecardId === devotionCard.gamecardId);
  return stillOnField && storyExiled && (state.players.BOT as any).preventAllDamageTurn === state.turnCount
    ? pass(name, `stillOnField=${stillOnField}, storyExiled=${storyExiled}`)
    : fail(name, `stillOnField=${stillOnField}, storyExiled=${storyExiled}, prevent=${(state.players.BOT as any).preventAllDamageTurn}`);
}

async function testAngelAdventPlacesShingiMarkedUnit(): Promise<ScenarioResult> {
  const name = 'BT06-W08 Angel Advent places AC5+ white unit with Shingi marker';
  const storyCard = cloneScriptCard(bt06W08 as Card, 'HAND');
  const fodder = [0, 1, 2].map(index => testCard({ id: `W08_FODDER_${index}`, fullName: `Fodder ${index}`, cardlocation: 'UNIT' }));
  const extraFodder = [3, 4, 5].map(index => testCard({ id: `W08_FODDER_${index}`, fullName: `Fodder ${index}`, cardlocation: 'UNIT' }));
  const target = cloneScriptCard(bt06W11 as Card, 'DECK');
  const state = game({
    hand: [storyCard],
    deck: [target, ...deckCards(5, 'BOT_FILL')],
    unitZone: [fodder[0], fodder[1], fodder[2], extraFodder[0], extraFodder[1], extraFodder[2]],
  });

  await playStoryAndResolve(state, 'BOT', storyCard);
  if (state.pendingQuery?.context?.step !== 'EXILE_UNITS') {
    return fail(name, `expected cost query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', fodder.map(card => card.gamecardId));
  if (state.pendingQuery?.context?.step !== 'PUT_UNIT') {
    return fail(name, `expected put query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const live = state.players.BOT.unitZone.find((unit: Card | null) => unit?.id === target.id);
  return live && (live as any).data?.placedByShingiEffectSourceCardId === storyCard.gamecardId && state.players.BOT.exile.length === 3
    ? pass(name, `unit=${live.fullName}, exile=${state.players.BOT.exile.length}`)
    : fail(name, `live=${!!live}, marker=${(live as any)?.data?.placedByShingiEffectSourceCardId}, exile=${state.players.BOT.exile.length}`);
}

async function testDawnRitualPlacesGoddessChurchAc3(): Promise<ScenarioResult> {
  const name = 'BT06-W09 Dawn Ritual places Betis or Goddess Church AC3 unit';
  const storyCard = cloneScriptCard(bt06W09 as Card, 'HAND');
  const fodder = [0, 1, 2].map(index => testCard({ id: `W09_FODDER_${index}`, fullName: `Fodder ${index}`, cardlocation: 'UNIT' }));
  const extraFodder = [3, 4, 5].map(index => testCard({ id: `W09_FODDER_${index}`, fullName: `Fodder ${index}`, cardlocation: 'UNIT' }));
  const target = testCard({
    id: 'W09_TARGET',
    fullName: '女神教会目标',
    type: 'UNIT',
    faction: '女神教会',
    acValue: 3,
    baseAcValue: 3,
    cardlocation: 'DECK',
  });
  const state = game({
    hand: [storyCard],
    deck: [target, ...deckCards(5, 'BOT_FILL')],
    unitZone: [fodder[0], fodder[1], fodder[2], extraFodder[0], extraFodder[1], extraFodder[2]],
  });

  await playStoryAndResolve(state, 'BOT', storyCard);
  await answerPendingQuery(state, 'BOT', fodder.map(card => card.gamecardId));
  if (state.pendingQuery?.context?.step !== 'PUT_UNIT') {
    return fail(name, `expected put query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const live = state.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === target.gamecardId);
  return live && (live as any).data?.placedByShingiEffectSourceCardId === storyCard.gamecardId
    ? pass(name, `unit=${live.fullName}`)
    : fail(name, `live=${!!live}, marker=${(live as any)?.data?.placedByShingiEffectSourceCardId}`);
}

async function testPrayerSearchesKeyUnit(): Promise<ScenarioResult> {
  const name = 'BT06-W10 Prayer searches Coriel Dikai or Celia';
  const prayerCard = cloneScriptCard(prayer as Card, 'HAND');
  const target = testCard({
    id: 'PRAYER_TARGET',
    fullName: '骑士团长「迪凯」',
    specialName: '迪凯',
    type: 'UNIT',
    cardlocation: 'DECK',
  });
  const state = game({
    hand: [prayerCard],
    deck: [target, ...deckCards(5, 'BOT_FILL')],
    erosionBack: [testCard({ id: 'EB_W10', cardlocation: 'EROSION_BACK' })],
  });

  await playStoryAndResolve(state, 'BOT', prayerCard);
  if (state.pendingQuery?.context?.effectId !== '201000102_prayer_search') {
    return fail(name, `expected prayer query, got ${state.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [target.gamecardId]);

  const inHand = state.players.BOT.hand.some((card: Card) => card.gamecardId === target.gamecardId);
  return inHand
    ? pass(name, `hand=${state.players.BOT.hand.length}`)
    : fail(name, `inHand=${inHand}, hand=${state.players.BOT.hand.length}`);
}

async function testLivianLeaveAndCounterWhenShingiPlaced(): Promise<ScenarioResult> {
  const name = 'BT06-W11 Livian mills exiles recovers and counters when Shingi placed';
  const livian = cloneScriptCard(bt06W11 as Card, 'UNIT', {
    data: { placedByShingiEffectSourceCardId: 'SHINGI_SOURCE' },
  } as any);
  const graveA = testCard({ id: 'GRAVE_A', fullName: 'Grave A', cardlocation: 'GRAVE' });
  const graveB = testCard({ id: 'GRAVE_B', fullName: 'Grave B', cardlocation: 'GRAVE' });
  const state = game({
    grave: [graveA, graveB],
    unitZone: [livian, null, null, null, null, null],
  }, {
    deck: deckCards(4, 'P1_DECK'),
  });

  ServerGameService.moveCard(state, 'BOT', 'UNIT', 'BOT', 'GRAVE', livian.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'P1',
  });
  await ServerGameService.checkTriggeredEffects(state);
  if (state.players.P1.exile.length !== 2 || state.players.BOT.deck.length !== 22) {
    return fail(name, `leave trigger exile=${state.players.P1.exile.length}, botDeck=${state.players.BOT.deck.length}`);
  }

  const counterLivian = cloneScriptCard(bt06W11 as Card, 'UNIT', {
    data: { placedByShingiEffectSourceCardId: 'SHINGI_SOURCE_2' },
  } as any);
  const opponentStory = testCard({ id: 'OPP_STORY', fullName: 'Opponent Story', type: 'STORY', cardlocation: 'PLAY' });
  const stackItem = { type: 'PLAY', ownerUid: 'P1', card: opponentStory, timestamp: Date.now() } as any;
  const counterState = game({
    unitZone: [counterLivian, null, null, null, null, null],
  }, {
    playZone: [opponentStory],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    currentTurnPlayer: 1,
    priorityPlayerId: 'BOT',
    isCountering: 1,
    counterStack: [stackItem],
  });
  await ServerGameService.activateEffect(counterState, 'BOT', counterLivian.gamecardId, 1);
  const counterStackItem = counterState.counterStack.find((item: any) =>
    item.type === 'EFFECT' &&
    item.card?.gamecardId === counterLivian.gamecardId
  );
  const negatedOnStack = !!counterStackItem && counterState.counterStack.some((item: any) =>
    item.type === 'PLAY' &&
    item.card?.gamecardId === opponentStory.gamecardId &&
    !item.isNegated
  );
  await ServerGameService.passConfrontation(counterState, counterState.priorityPlayerId);

  const opponentStoryInGrave = counterState.players.P1.grave.some((card: Card) => card.gamecardId === opponentStory.gamecardId);
  const exiledSelf = counterState.players.BOT.exile.some((card: Card) => card.id === bt06W11.id);
  return negatedOnStack && exiledSelf && opponentStoryInGrave
    ? pass(name, `negated=${negatedOnStack}, exiledSelf=${exiledSelf}`)
    : fail(name, `negated=${negatedOnStack}, exiledSelf=${exiledSelf}, storyInGrave=${opponentStoryInGrave}, stack=${counterState.counterStack.length}`);
}

async function testBlueWealthCounterAndLogistics(): Promise<ScenarioResult> {
  const name = 'BT06-B01/B03/B04 wealth enables counter and logistics recruit';
  const logistics = cloneScriptCard(bt06B01 as Card, 'UNIT');
  const rolys = cloneScriptCard(bt06B03 as Card, 'UNIT');
  const caravan = cloneScriptCard(bt06B04 as Card, 'UNIT');
  const handCosts = [0, 1, 2].map(index => testCard({ id: `B03_COST_${index}`, color: 'BLUE', cardlocation: 'HAND' }));
  const opponentStory = testCard({
    id: 'B03_OPP_STORY',
    fullName: '非神蚀故事',
    type: 'STORY',
    color: 'RED',
    godMark: false,
    cardlocation: 'PLAY',
    effects: [],
  });
  const counterState = game({
    hand: handCosts,
    unitZone: [logistics, rolys, caravan, null, null, null],
  }, {
    playZone: [opponentStory],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    currentTurnPlayer: 1,
    priorityPlayerId: 'BOT',
    isCountering: 1,
    counterStack: [{ type: 'PLAY', ownerUid: 'P1', card: opponentStory, timestamp: Date.now() }],
  });

  await ServerGameService.activateEffect(counterState, 'BOT', rolys.gamecardId, 1);
  if (counterState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(counterState, 'BOT', handCosts.map(card => card.gamecardId));
  }
  await ServerGameService.passConfrontation(counterState, counterState.priorityPlayerId);
  const counteredToHand = counterState.players.BOT.hand.some((card: Card) => card.id === opponentStory.id);
  const costPaid = counterState.players.BOT.grave.length === 3;

  const recruited = cloneScriptCard(bt06B01 as Card, 'DECK');
  const recruitState = game({
    deck: [recruited, ...deckCards(4, 'B04_FILL', 'BLUE')],
    unitZone: [caravan, null, null, null, null, null],
    erosionBack: [
      testCard({ id: 'B04_EB_1', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'B04_EB_2', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'B04_EB_3', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'B04_EB_4', cardlocation: 'EROSION_BACK' }),
    ],
  });
  await activateAndResolveByOpponentPass(recruitState, 'BOT', caravan, 1);
  if (recruitState.pendingQuery?.context?.effectId !== '104020338_put_logistics') {
    return fail(name, `countered=${counteredToHand}, costPaid=${costPaid}, recruitQuery=${recruitState.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(recruitState, 'BOT', [recruited.gamecardId]);
  const recruitedLive = recruitState.players.BOT.unitZone.some((unit: Card | null) => unit?.id === bt06B01.id);

  return counteredToHand && costPaid && recruitedLive
    ? pass(name, `counteredToHand=${counteredToHand}, recruited=${recruitedLive}`)
    : fail(name, `countered=${counteredToHand}, costPaid=${costPaid}, recruited=${recruitedLive}`);
}

async function testBlueWealthCountUsesContinuousOnly(): Promise<ScenarioResult> {
  const name = 'BT06-B wealth counter counts only Wealth continuous effects';
  const logistics = cloneScriptCard(bt06B01 as Card, 'UNIT');
  const rolys = cloneScriptCard(bt06B03 as Card, 'UNIT');
  const caravan = cloneScriptCard(bt06B04 as Card, 'UNIT');
  const aketi = cloneScriptCard(bt06B05 as Card, 'UNIT');
  const tradeExpert = cloneScriptCard(bt06B02 as Card, 'UNIT');
  const silencedLogistics = cloneScriptCard(bt06B01 as Card, 'UNIT');
  const state = game({
    unitZone: [logistics, rolys, caravan, aketi, tradeExpert, null],
  });
  const silencedState = game({
    unitZone: [silencedLogistics, null, null, null, null, null],
  });
  (silencedLogistics as any).data = { fullEffectSilencedTurn: silencedState.turnCount };

  const totalWealth = getPlayerWealthCount(state.players.BOT);
  const tradeExpertWealth = getCardWealthValue(tradeExpert);
  const silencedWealth = getPlayerWealthCount(silencedState.players.BOT, { turnCount: silencedState.turnCount });

  return totalWealth === 5 && tradeExpertWealth === 0 && silencedWealth === 0
    ? pass(name, `wealth=${totalWealth}, tradeExpert=${tradeExpertWealth}, silenced=${silencedWealth}`)
    : fail(name, `wealth=${totalWealth}, tradeExpert=${tradeExpertWealth}, silenced=${silencedWealth}`);
}

async function testTradeExpertPreventsThisBattleDestroy(): Promise<ScenarioResult> {
  const name = 'BT06-B02 Trade Expert prevents battle destruction for this battle';
  const logistics = cloneScriptCard(bt06B01 as Card, 'UNIT');
  const rolys = cloneScriptCard(bt06B03 as Card, 'UNIT');
  const caravan = cloneScriptCard(bt06B04 as Card, 'UNIT');
  const tradeExpert = cloneScriptCard(bt06B02 as Card, 'UNIT');
  const attacker = testCard({
    id: 'B02_ATTACKER',
    fullName: 'B02 Attacker',
    type: 'UNIT',
    color: 'BLUE',
    cardlocation: 'UNIT',
    power: 1000,
    basePower: 1000,
  });
  const defender = testCard({
    id: 'B02_DEFENDER',
    fullName: 'B02 Defender',
    type: 'UNIT',
    color: 'RED',
    cardlocation: 'UNIT',
    power: 3000,
    basePower: 3000,
  });
  const handCosts = [0, 1].map(index => testCard({ id: `B02_COST_${index}`, color: 'BLUE', cardlocation: 'HAND' }));
  const state = game({
    hand: handCosts,
    unitZone: [logistics, rolys, caravan, tradeExpert, attacker, null],
  }, {
    unitZone: [defender, null, null, null, null, null],
  }, {
    phase: 'BATTLE_FREE',
    previousPhase: 'BATTLE_FREE',
    battleState: {
      attackers: [attacker.gamecardId],
      defender: defender.gamecardId,
      isAlliance: false,
      resolvedUnitIds: [],
      battleId: 'B02_TEST_BATTLE',
    },
  });

  await activateAndResolveByOpponentPass(state, 'BOT', tradeExpert, 0);
  state.phase = 'DAMAGE_CALCULATION';
  await ServerGameService.resolveDamage(state);

  const attackerLive = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === attacker.gamecardId);
  const attackerDestroyed = state.players.BOT.grave.some((card: Card) => card.gamecardId === attacker.gamecardId);
  const costsPaid = handCosts.every(cost => state.players.BOT.grave.some((card: Card) => card.gamecardId === cost.gamecardId));

  return attackerLive && !attackerDestroyed && costsPaid
    ? pass(name, `attackerLive=${attackerLive}, costsPaid=${costsPaid}`)
    : fail(name, `attackerLive=${attackerLive}, destroyed=${attackerDestroyed}, costsPaid=${costsPaid}`);
}

async function testBlueAketiTeteruAndRecord(): Promise<ScenarioResult> {
  const name = 'BT06-B05/B06/B09 destroy recover and put field cards';
  const aketi = cloneScriptCard(bt06B05 as Card, 'UNIT');
  const fodder = cloneScriptCard(bt06B01 as Card, 'UNIT');
  const record = cloneScriptCard(bt06B09 as Card, 'GRAVE');
  const state = game({
    grave: [record],
    unitZone: [aketi, fodder, null, null, null, null],
    erosionBack: [
      testCard({ id: 'B05_EB_1', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'B05_EB_2', cardlocation: 'EROSION_BACK' }),
    ],
  });

  await activateAndResolveByOpponentPass(state, 'BOT', aketi, 1);
  if (state.pendingQuery?.context?.step !== 'DESTROY') {
    return fail(name, `expected destroy query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [fodder.gamecardId]);
  if (state.pendingQuery?.context?.step !== 'RECORD') {
    return fail(name, `expected record query, got ${state.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(state, 'BOT', [record.gamecardId]);
  const recordInHand = state.players.BOT.hand.some((card: Card) => card.id === bt06B09.id);
  const fodderDestroyed = state.players.BOT.grave.some((card: Card) => card.id === bt06B01.id);

  const teteru = cloneScriptCard(bt06B06 as Card, 'UNIT');
  const feijingCost = testCard({ id: 'B06_FEIJING_COST', fullName: '菲晶费用', color: 'BLUE', feijingMark: true, cardlocation: 'HAND' });
  const sheath = cloneScriptCard(bt06B10 as Card, 'DECK');
  const itemState = game({
    hand: [feijingCost],
    deck: [sheath, ...deckCards(5, 'B06_FILL', 'BLUE')],
    unitZone: [teteru, null, null, null, null, null],
    erosionBack: [
      testCard({ id: 'B06_EB_1', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'B06_EB_2', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'B06_EB_3', cardlocation: 'EROSION_BACK' }),
    ],
  });
  await activateAndResolveByOpponentPass(itemState, 'BOT', teteru, 1);
  if (itemState.pendingQuery?.context?.effectId !== '104020340_put_item') {
    return fail(name, `recordInHand=${recordInHand}, expected item query got ${itemState.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(itemState, 'BOT', [sheath.gamecardId]);
  const itemLive = itemState.players.BOT.itemZone.some((item: Card | null) => item?.id === bt06B10.id);

  const recordStory = cloneScriptCard(bt06B09 as Card, 'HAND');
  const erosionUnit = cloneScriptCard(bt06B01 as Card, 'EROSION_FRONT');
  const recordState = game({
    hand: [recordStory],
    unitZone: [cloneScriptCard(bt06B01 as Card, 'UNIT'), cloneScriptCard(bt06B01 as Card, 'UNIT'), cloneScriptCard(bt06B01 as Card, 'UNIT'), null, null, null],
    erosionFront: [erosionUnit],
  });
  await playStoryAndResolve(recordState, 'BOT', recordStory);
  if (recordState.pendingQuery?.context?.step !== 'MODE') {
    return fail(name, `expected record mode query, got ${recordState.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(recordState, 'BOT', ['PUT_EROSION']);
  if (recordState.pendingQuery?.context?.step !== 'PUT') {
    return fail(name, `expected record put query, got ${recordState.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(recordState, 'BOT', [erosionUnit.gamecardId]);
  const erosionPutLive = recordState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === erosionUnit.gamecardId);

  return recordInHand && fodderDestroyed && itemLive && erosionPutLive
    ? pass(name, `record=${recordInHand}, item=${itemLive}, erosionPut=${erosionPutLive}`)
    : fail(name, `record=${recordInHand}, destroyed=${fodderDestroyed}, item=${itemLive}, erosionPut=${erosionPutLive}`);
}

async function testAketiErosionPlayCountsExtraUnitColors(): Promise<ScenarioResult> {
  const name = 'BT01 Aketi can be used from erosion with feather-granted color';
  const aketi = cloneScriptCard(aketiCore as Card, 'EROSION_FRONT');
  const blueUnit = testCard({
    id: 'BLUE_SOURCE',
    fullName: 'Blue Source',
    type: 'UNIT',
    color: 'BLUE',
    cardlocation: 'UNIT',
    isExhausted: false,
  });
  const feather = cloneScriptCard(bt06G05 as Card, 'UNIT', {
    color: 'GREEN',
    persistentExtraColors: ['BLUE'] as any,
    isExhausted: false,
  } as Partial<Card>);
  const state = game({
    deck: deckCards(8, 'AKETI_COST_FILL', 'BLUE'),
    unitZone: [blueUnit, feather, null, null, null, null],
    erosionFront: [aketi],
  });

  const canActivate = ServerGameService.checkEffectLimitsAndReqs(state, 'BOT', aketi, aketi.effects![2], 'EROSION_FRONT').valid;
  await ServerGameService.activateEffect(state, 'BOT', aketi.gamecardId, 2);
  if (state.pendingQuery?.type === 'SELECT_PAYMENT') {
    await answerPendingQuery(state, 'BOT', [JSON.stringify({ exhaustUnitIds: [blueUnit.gamecardId, feather.gamecardId] })]);
  }
  if (state.phase !== 'COUNTERING') {
    return fail(name, `canActivate=${canActivate}, expected COUNTERING got ${state.phase}, pending=${state.pendingQuery?.callbackKey || 'none'}`);
  }
  await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  const moved = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === aketi.gamecardId);

  return canActivate && moved
    ? pass(name, `canActivate=${canActivate}, moved=${moved}`)
    : fail(name, `canActivate=${canActivate}, moved=${moved}, pending=${state.pendingQuery?.callbackKey || 'none'}`);
}

async function testBlueUntilNextOwnTurnStartLocksExpireOnOwnStart(): Promise<ScenarioResult> {
  const name = 'BT06-B02/B09 option locks expire at next own turn start';
  const wealthUnits = () => [
    cloneScriptCard(bt06B01 as Card, 'UNIT'),
    cloneScriptCard(bt06B01 as Card, 'UNIT'),
    cloneScriptCard(bt06B01 as Card, 'UNIT'),
    null,
    null,
    null,
  ];

  const caravan = cloneScriptCard(bt06B02 as Card, 'UNIT');
  const caravanCosts = [0, 1].map(index => testCard({ id: `B02_COST_${index}`, color: 'BLUE', cardlocation: 'HAND' }));
  const caravanState = game({
    hand: caravanCosts,
    unitZone: [caravan, ...wealthUnits().slice(0, 5)],
  }, {
    deck: deckCards(6, 'B02_OPP_DECK', 'RED'),
  });

  await activateAndResolveByOpponentPass(caravanState, 'BOT', caravan, 1);
  const caravanLockedAfterUse = !caravan.effects?.[1].condition?.(caravanState, caravanState.players.BOT, caravan, undefined);
  caravanState.turnCount = 7;
  caravanState.currentTurnPlayer = 1;
  caravanState.players.BOT.isTurn = false;
  caravanState.players.P1.isTurn = true;
  const caravanLockedOnOpponentTurn = !caravan.effects?.[1].condition?.(caravanState, caravanState.players.BOT, caravan, undefined);
  caravanState.players.BOT.hand = [0, 1].map(index => testCard({ id: `B02_NEXT_COST_${index}`, color: 'BLUE', cardlocation: 'HAND' }));
  await ServerGameService.finishTurnTransition(caravanState);
  const caravanUnlockedOnOwnStart =
    caravanState.players.BOT.isTurn &&
    !(caravan as any).data?.tradeEffectDisabledUntilOwnStartUid;

  const record = cloneScriptCard(bt06B09 as Card, 'PLAY');
  const recordState = game({
    deck: deckCards(8, 'B09_DRAW_DECK', 'BLUE'),
    grave: deckCards(2, 'B09_GRAVE', 'BLUE').map(card => ({ ...card, cardlocation: 'GRAVE' })),
    unitZone: wealthUnits(),
    playZone: [record],
  });

  await record.effects?.[0].execute?.(record, recordState, recordState.players.BOT, undefined as any);
  if (recordState.pendingQuery?.context?.step !== 'MODE') {
    return fail(name, `expected record mode query, got ${recordState.pendingQuery?.context?.step || 'none'}`);
  }
  await record.effects?.[0].onQueryResolve?.(record, recordState, recordState.players.BOT, ['RECOVER_DRAW'], {
    sourceCardId: record.gamecardId,
    effectId: '204000098_record_modes',
    step: 'MODE',
  });
  const recoverDrawLockedAfterUse =
    (record as any).data?.disabledAketiRecordModesUntilOwnStart?.RECOVER_DRAW === 'BOT';
  recordState.turnCount = 7;
  recordState.currentTurnPlayer = 1;
  recordState.players.BOT.isTurn = false;
  recordState.players.P1.isTurn = true;
  const recoverDrawLockedOnOpponentTurn =
    (record as any).data?.disabledAketiRecordModesUntilOwnStart?.RECOVER_DRAW === 'BOT';
  await ServerGameService.finishTurnTransition(recordState);
  const recoverDrawUnlockedOnOwnStart =
    recordState.players.BOT.isTurn &&
    !(record as any).data?.disabledAketiRecordModesUntilOwnStart?.RECOVER_DRAW;

  return caravanLockedAfterUse &&
    caravanLockedOnOpponentTurn &&
    caravanUnlockedOnOwnStart &&
    recoverDrawLockedAfterUse &&
    recoverDrawLockedOnOpponentTurn &&
    recoverDrawUnlockedOnOwnStart
    ? pass(name, `caravanUnlocked=${!!caravanUnlockedOnOwnStart}, recordUnlocked=${!!recoverDrawUnlockedOnOwnStart}`)
    : fail(name, `caravan after=${caravanLockedAfterUse} opp=${caravanLockedOnOpponentTurn} own=${!!caravanUnlockedOnOwnStart}; record after=${recoverDrawLockedAfterUse} opp=${recoverDrawLockedOnOpponentTurn} own=${!!recoverDrawUnlockedOnOwnStart}`);
}

async function testBlueCheckLetsOpponentPayOrCounters(): Promise<ScenarioResult> {
  const name = 'BT06-B08 Check lets opponent pay tax or returns non-god play';
  const checkCard = cloneScriptCard(bt06B08 as Card, 'HAND');
  const opponentStory = testCard({
    id: 'B08_OPP_STORY',
    fullName: '可被检查的卡',
    type: 'STORY',
    color: 'RED',
    acValue: 0,
    godMark: false,
    cardlocation: 'PLAY',
  });
  const taxPayer = testCard({ id: 'B08_TAX_UNIT', color: 'RED', cardlocation: 'UNIT', isExhausted: false });
  const payState = game({
    hand: [checkCard],
    unitZone: [testCard({ id: 'B08_BLUE_SOURCE', color: 'BLUE', cardlocation: 'UNIT' }), null, null, null, null, null],
    erosionBack: [testCard({ id: 'B08_EB', cardlocation: 'EROSION_BACK' })],
  }, {
    unitZone: [taxPayer, null, null, null, null, null],
    playZone: [opponentStory],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    currentTurnPlayer: 1,
    priorityPlayerId: 'BOT',
    isCountering: 1,
    counterStack: [{ type: 'PLAY', ownerUid: 'P1', card: opponentStory, timestamp: Date.now() }],
  });
  await ServerGameService.playCard(payState, 'BOT', checkCard.gamecardId, {});
  await ServerGameService.passConfrontation(payState, payState.priorityPlayerId);
  if (payState.pendingQuery?.context?.step !== 'PAY_TAX') {
    return fail(name, `expected tax query, got ${payState.pendingQuery?.context?.step || 'none'}`);
  }
  await answerPendingQuery(payState, 'P1', [JSON.stringify({ exhaustUnitIds: [taxPayer.gamecardId] })]);
  const paidAndNotCountered = taxPayer.isExhausted === true &&
    payState.players.P1.grave.some((card: Card) => card.id === opponentStory.id) &&
    !payState.players.P1.hand.some((card: Card) => card.id === opponentStory.id);

  const noPayCheck = cloneScriptCard(bt06B08 as Card, 'HAND');
  const noPayStory = testCard({
    id: 'B08_NO_PAY_STORY',
    fullName: '无费用目标',
    type: 'STORY',
    color: 'RED',
    acValue: 3,
    godMark: false,
    cardlocation: 'PLAY',
  });
  const noPayState = game({
    hand: [noPayCheck],
    unitZone: [testCard({ id: 'B08_BLUE_SOURCE_2', color: 'BLUE', cardlocation: 'UNIT' }), null, null, null, null, null],
    erosionBack: [testCard({ id: 'B08_EB_2', cardlocation: 'EROSION_BACK' })],
  }, {
    deck: deckCards(1, 'P1_LOW_DECK', 'RED'),
    playZone: [noPayStory],
  }, {
    phase: 'COUNTERING',
    previousPhase: 'MAIN',
    currentTurnPlayer: 1,
    priorityPlayerId: 'BOT',
    isCountering: 1,
    counterStack: [{ type: 'PLAY', ownerUid: 'P1', card: noPayStory, timestamp: Date.now() }],
  });
  await ServerGameService.playCard(noPayState, 'BOT', noPayCheck.gamecardId, {});
  await ServerGameService.passConfrontation(noPayState, noPayState.priorityPlayerId);
  const returned = noPayState.players.P1.hand.some((card: Card) => card.id === noPayStory.id);
  const notResolved = !noPayState.players.P1.grave.some((card: Card) => card.id === noPayStory.id);

  return paidAndNotCountered && returned && notResolved
    ? pass(name, `paid=${paidAndNotCountered}, returned=${returned}`)
    : fail(name, `paid=${paidAndNotCountered}, returned=${returned}, notResolved=${notResolved}`);
}

async function testBlueSheathAndFuka(): Promise<ScenarioResult> {
  const name = 'BT06-B10/B11 sheath equips and Fuka draws/topdecks';
  const fuka = cloneScriptCard(bt06B11 as Card, 'UNIT');
  const sheath = cloneScriptCard(bt06B10 as Card, 'HAND');
  const momoseUnit = cloneScriptCard(bt06B11 as Card, 'UNIT', { gamecardId: nextId('MOMOSE_UNIT') });
  const state = game({
    hand: [sheath],
    deck: deckCards(4, 'B11_DRAW', 'BLUE'),
    unitZone: [momoseUnit, null, null, null, null, null],
  });

  EventEngine.dispatchEvent(state, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: momoseUnit,
    sourceCardId: momoseUnit.gamecardId,
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' },
  });
  await ServerGameService.checkTriggeredEffects(state);

  const equippedSheath = state.players.BOT.itemZone.find((item: Card | null) => item?.id === bt06B10.id);
  const equipped = !!equippedSheath && equippedSheath.equipTargetId === momoseUnit.gamecardId;

  const equipState = game({
    deck: deckCards(3, 'B11_DRAW_2', 'BLUE'),
    unitZone: [fuka, null, null, null, null, null],
    itemZone: [cloneScriptCard(bt06B10 as Card, 'ITEM')],
  });
  const manualSheath = equipState.players.BOT.itemZone[0] as Card;
  manualSheath.equipTargetId = fuka.gamecardId;
  EventEngine.dispatchEvent(equipState, {
    type: 'CARD_EQUIPPED',
    playerUid: 'BOT',
    sourceCard: manualSheath,
    sourceCardId: manualSheath.gamecardId,
    targetCardId: fuka.gamecardId,
    data: { itemId: manualSheath.gamecardId, unitId: fuka.gamecardId },
  });
  await ServerGameService.checkTriggeredEffects(equipState);
  if (equipState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(equipState, 'BOT', ['YES']);
  }
  const drew = equipState.players.BOT.hand.length === 1;

  const topTarget = cloneScriptCard(bt06B01 as Card, 'UNIT');
  const costA = testCard({ id: 'B11_COST_A', color: 'BLUE', cardlocation: 'HAND' });
  const costB = testCard({ id: 'B11_COST_B', color: 'BLUE', cardlocation: 'HAND' });
  const topState = game({
    hand: [costA, costB],
    unitZone: [fuka, topTarget, null, null, null, null],
    erosionBack: [
      testCard({ id: 'B11_EB_1', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'B11_EB_2', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'B11_EB_3', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'B11_EB_4', cardlocation: 'EROSION_BACK' }),
    ],
  });
  await activateAndResolveByOpponentPass(topState, 'BOT', fuka, 1);
  if (topState.pendingQuery?.context?.effectId !== '104010341_top_non_god') {
    return fail(name, `equipped=${equipped}, drew=${drew}, topQuery=${topState.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(topState, 'BOT', [topTarget.gamecardId]);
  const topdecked = topState.players.BOT.deck[topState.players.BOT.deck.length - 1]?.id === bt06B01.id;

  return equipped && drew && topdecked
    ? pass(name, `equipped=${equipped}, drew=${drew}, topdecked=${topdecked}`)
    : fail(name, `equipped=${equipped}, drew=${drew}, topdecked=${topdecked}`);
}

async function testGreenResonanceDrawBoostAndSearch(): Promise<ScenarioResult> {
  const name = 'BT06-G01/G02/G04 resonance draw boost and trapper search';
  const organist = cloneScriptCard(bt06G01 as Card, 'UNIT');
  const silverCost = cloneScriptCard(bt06G10 as Card, 'GRAVE');
  const fillerHand = testCard({ id: 'G01_DISCARD', color: 'GREEN', cardlocation: 'HAND' });
  const organistState = game({
    hand: [fillerHand],
    deck: deckCards(3, 'G01_DRAW', 'GREEN'),
    grave: [silverCost],
    unitZone: [organist, null, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(organistState, 'BOT', organist, 0);
  if (organistState.pendingQuery?.context?.effectId !== '103090327_resonance') {
    return fail(name, `expected resonance query, got ${organistState.pendingQuery?.context?.effectId || 'none'}`);
  }
  await answerPendingQuery(organistState, 'BOT', [silverCost.gamecardId]);
  await ServerGameService.checkTriggeredEffects(organistState);
  await chooseQueuedTrigger(organistState, '103090327_draw_discard');
  if (organistState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(organistState, 'BOT', ['YES']);
  }
  if (organistState.pendingQuery?.context?.step === 'DISCARD') {
    await answerPendingQuery(organistState, 'BOT', [organistState.players.BOT.hand[0].gamecardId]);
  }
  const organistDrewAndDiscarded = organistState.players.BOT.exile.some((card: Card) => card.id === bt06G10.id) &&
    organistState.players.BOT.grave.length >= 1;

  const poet = cloneScriptCard(bt06G02 as Card, 'UNIT');
  const boostCost = cloneScriptCard(bt06G10 as Card, 'GRAVE');
  const boostTarget = testCard({ id: 'G02_TARGET', type: 'UNIT', color: 'GREEN', cardlocation: 'UNIT', power: 1000, basePower: 1000, damage: 1, baseDamage: 1 });
  const boostState = game({
    grave: [boostCost],
    unitZone: [poet, boostTarget, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(boostState, 'BOT', poet, 0);
  await answerPendingQuery(boostState, 'BOT', [boostCost.gamecardId]);
  await ServerGameService.checkTriggeredEffects(boostState);
  await chooseQueuedTrigger(boostState, '103090328_boost');
  if (boostState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(boostState, 'BOT', ['YES']);
  }
  if (boostState.pendingQuery?.context?.effectId === '103090328_boost') {
    await answerPendingQuery(boostState, 'BOT', [boostTarget.gamecardId]);
  }
  const boosted = boostTarget.power === 2500 && boostTarget.damage === 2;

  const trapper = cloneScriptCard(bt06G04 as Card, 'UNIT');
  const handCost = testCard({ id: 'G04_COST', color: 'GREEN', cardlocation: 'HAND' });
  const searchTarget = cloneScriptCard(bt06G01 as Card, 'DECK');
  const searchState = game({
    hand: [handCost],
    deck: [searchTarget, ...deckCards(4, 'G04_FILL', 'GREEN')],
    unitZone: [trapper, null, null, null, null, null],
  });
  EventEngine.dispatchEvent(searchState, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: trapper,
    sourceCardId: trapper.gamecardId,
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' },
  });
  await ServerGameService.checkTriggeredEffects(searchState);
  if (searchState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(searchState, 'BOT', ['YES']);
  }
  if (searchState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(searchState, 'BOT', [handCost.gamecardId]);
  }
  if (searchState.pendingQuery?.context?.effectId === '103090330_enter_search') {
    await answerPendingQuery(searchState, 'BOT', [searchTarget.gamecardId]);
  }
  const searched = searchState.players.BOT.hand.some((card: Card) => card.id === bt06G01.id);

  return organistDrewAndDiscarded && boosted && searched
    ? pass(name, `drawDiscard=${organistDrewAndDiscarded}, boosted=${boosted}, searched=${searched}`)
    : fail(name, `drawDiscard=${organistDrewAndDiscarded}, boosted=${boosted}, searched=${searched}`);
}

async function testGreenBirdSalalaAndAccordion(): Promise<ScenarioResult> {
  const name = 'BT06-G05/G06/G07/G10 bird feather lock and accordion silence';
  const bird = cloneScriptCard(bt06G06 as Card, 'UNIT');
  const feather = cloneScriptCard(bt06G05 as Card, 'DECK');
  const birdState = game({
    deck: [feather, ...deckCards(4, 'G06_FILL', 'GREEN')],
    unitZone: [bird, null, null, null, null, null],
    erosionBack: [testCard({ id: 'G06_EB_1', cardlocation: 'EROSION_BACK' })],
  });
  EventEngine.dispatchEvent(birdState, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: bird,
    sourceCardId: bird.gamecardId,
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' },
  });
  await ServerGameService.checkTriggeredEffects(birdState);
  if (birdState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(birdState, 'BOT', ['YES']);
  }
  if (birdState.pendingQuery?.context?.effectId === '103000332_enter_put_feather') {
    await answerPendingQuery(birdState, 'BOT', [feather.gamecardId]);
  }
  await ServerGameService.checkTriggeredEffects(birdState);
  if (birdState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(birdState, 'BOT', ['YES']);
  }
  if (birdState.pendingQuery?.context?.effectId === '103000331_enter_color') {
    await answerPendingQuery(birdState, 'BOT', ['RED']);
  }
  const liveFeather = birdState.players.BOT.unitZone.find((unit: Card | null) => unit?.id === bt06G05.id);
  const featherPlaced = !!liveFeather && liveFeather.isExhausted && !(liveFeather as any).data?.returnToDeckBottomAtTurnEnd;
  const featherColorBeforeTurnEnd = !!(liveFeather as any)?.persistentExtraColors?.includes('RED');
  const featherPaysRedRequirement = !!liveFeather && ServerGameService.getColorRequirementResult(
    birdState.players.BOT,
    { RED: 1 }
  ).valid;
  const redRequirementCard = testCard({
    id: 'G05_RED_REQ',
    fullName: 'Feather Red Requirement',
    type: 'STORY',
    color: 'RED',
    colorReq: { RED: 1 },
    baseColorReq: { RED: 1 },
    acValue: 0,
    baseAcValue: 0,
    cardlocation: 'HAND',
    effects: [],
  });
  birdState.players.BOT.hand.push(redRequirementCard);
  let featherCanPlayRedRequirement = false;
  try {
    await ServerGameService.playCard(birdState, 'BOT', redRequirementCard.gamecardId, {});
    await ServerGameService.passConfrontation(birdState, birdState.priorityPlayerId);
    featherCanPlayRedRequirement = birdState.players.BOT.grave.some((card: Card) => card.gamecardId === redRequirementCard.gamecardId);
  } catch {
    featherCanPlayRedRequirement = false;
  }
  if (liveFeather) {
    await ServerGameService.executeEndPhase(birdState, birdState.players.BOT);
  }
  const featherColorAfterTurnEnd = !!(liveFeather as any)?.persistentExtraColors?.includes('RED');

  const salala = cloneScriptCard(bt06G07 as Card, 'UNIT');
  const chimeraCost = cloneScriptCard(bt06G11 as Card, 'GRAVE');
  const recover = cloneScriptCard(bt06G01 as Card, 'GRAVE');
  const oppUnit = testCard({ id: 'G07_OPP', type: 'UNIT', color: 'RED', cardlocation: 'UNIT' });
  const salalaState = game({
    grave: [chimeraCost, recover],
    unitZone: [salala, null, null, null, null, null],
    erosionBack: [testCard({ id: 'G07_EB', cardlocation: 'EROSION_BACK' })],
  }, {
    unitZone: [oppUnit, null, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(salalaState, 'BOT', salala, 0);
  await answerPendingQuery(salalaState, 'BOT', [chimeraCost.gamecardId]);
  await ServerGameService.checkTriggeredEffects(salalaState);
  if (salalaState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(salalaState, 'BOT', ['YES']);
  }
  if (salalaState.pendingQuery?.context?.step === 'LOCK') {
    await answerPendingQuery(salalaState, 'BOT', [oppUnit.gamecardId]);
  }
  if (salalaState.pendingQuery?.context?.step === 'RECOVER') {
    await answerPendingQuery(salalaState, 'BOT', [recover.gamecardId]);
  }
  const lockedAndRecovered = !!(oppUnit as any).data?.cannotExhaustUntilTurn &&
    salalaState.players.BOT.hand.some((card: Card) => card.id === bt06G01.id);

  const accordion = cloneScriptCard(bt06G10 as Card, 'ITEM');
  const target = testCard({
    id: 'G10_TARGET',
    type: 'UNIT',
    color: 'RED',
    cardlocation: 'UNIT',
    godMark: false,
    effects: [{ id: 'G10_DUMMY_ACTIVATE', type: 'ACTIVATE', triggerLocation: ['UNIT'], description: 'dummy', execute: async () => undefined }],
  });
  const accordionState = game({
    itemZone: [accordion],
  }, {
    unitZone: [target, null, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(accordionState, 'BOT', accordion, 1);
  if (accordionState.pendingQuery?.context?.step === 'TARGET') {
    await answerPendingQuery(accordionState, 'BOT', [target.gamecardId]);
  }
  if (accordionState.pendingQuery?.context?.step === 'EFFECT') {
    await answerPendingQuery(accordionState, 'BOT', ['G10_DUMMY_ACTIVATE']);
  }
  const silenced = target.silencedEffectIds?.includes('G10_DUMMY_ACTIVATE') === true;

  return featherPlaced && featherColorBeforeTurnEnd && featherColorAfterTurnEnd && featherPaysRedRequirement && featherCanPlayRedRequirement && lockedAndRecovered && silenced
    ? pass(name, `feather=${featherPlaced}, color=${featherColorAfterTurnEnd}, play=${featherCanPlayRedRequirement}, lockedRecovered=${lockedAndRecovered}, silenced=${silenced}`)
    : fail(name, `feather=${featherPlaced}, colorBefore=${featherColorBeforeTurnEnd}, colorAfter=${featherColorAfterTurnEnd}, pays=${featherPaysRedRequirement}, play=${featherCanPlayRedRequirement}, lockedRecovered=${lockedAndRecovered}, silenced=${silenced}`);
}

async function testCannotExhaustUnitIsNotAvailableDefender(): Promise<ScenarioResult> {
  const name = 'cannot-exhaust unit is not treated as an available defender';
  const attacker = testCard({ id: 'LOCK_ATTACKER', type: 'UNIT', color: 'GREEN', cardlocation: 'UNIT', power: 1000, damage: 1 });
  const lockedDefender = testCard({
    id: 'LOCKED_DEFENDER',
    type: 'UNIT',
    color: 'RED',
    cardlocation: 'UNIT',
    power: 5000,
    damage: 2,
    data: {
      cannotExhaustUntilTurn: 7,
      cannotExhaustSourceName: '瑟族少女「萨拉拉」',
    },
  } as any);
  const state = game({
    unitZone: [attacker, null, null, null, null, null],
  }, {
    displayName: 'P1',
    botDifficulty: 'hard',
    botDeckProfileId: 'generic',
    unitZone: [lockedDefender, null, null, null, null, null],
  }, {
    turnCount: 6,
    phase: 'DEFENSE_DECLARATION',
    battleState: {
      attackers: [attacker.gamecardId],
      isAlliance: false,
      defensePowerRestriction: 0,
    },
  });
  state.currentTurnPlayer = 0;
  state.players.BOT.isTurn = true;
  state.players.P1.isTurn = false;

  await ServerGameService.botMoveForPlayer(state, 'P1');

  const declinedDefense = state.phase === 'BATTLE_FREE' && !state.battleState?.defender && !lockedDefender.isExhausted;
  return declinedDefense
    ? pass(name, `phase=${state.phase}, defender=${state.battleState?.defender || 'none'}`)
    : fail(name, `phase=${state.phase}, defender=${state.battleState?.defender || 'none'}, exhausted=${lockedDefender.isExhausted}`);
}

async function testGreenStoriesAndChimera(): Promise<ScenarioResult> {
  const name = 'BT06-G08/G09/G11 stories destroy revive and Chimera grave entry';
  const spell = cloneScriptCard(bt06G08 as Card, 'HAND');
  const godCost = testCard({ id: 'G08_GOD_COST', godMark: true, color: 'GREEN', cardlocation: 'GRAVE' });
  const itemTarget = testCard({ id: 'G08_ITEM', type: 'ITEM', color: 'BLUE', godMark: false, cardlocation: 'ITEM' });
  const destroyState = game({
    hand: [spell],
    grave: [godCost],
    erosionFront: [
      testCard({ id: 'G08_EF_1', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'G08_EF_2', cardlocation: 'EROSION_FRONT' }),
    ],
    unitZone: [testCard({ id: 'G08_GREEN_SOURCE', color: 'GREEN', cardlocation: 'UNIT' }), null, null, null, null, null],
  }, {
    itemZone: [itemTarget],
  });
  await ServerGameService.playCard(destroyState, 'BOT', spell.gamecardId, {
    erosionFrontIds: [
      destroyState.players.BOT.erosionFront[0].gamecardId,
      destroyState.players.BOT.erosionFront[1].gamecardId,
    ],
  });
  if (destroyState.phase !== 'COUNTERING') throw new Error(`Expected COUNTERING after story play, got ${destroyState.phase}`);
  await ServerGameService.passConfrontation(destroyState, destroyState.priorityPlayerId);
  if (destroyState.pendingQuery?.context?.step === 'TARGET') {
    await answerPendingQuery(destroyState, 'BOT', [itemTarget.gamecardId]);
  }
  if (destroyState.pendingQuery?.context?.step === 'COST') {
    await answerPendingQuery(destroyState, 'BOT', [godCost.gamecardId]);
  }
  const itemDestroyed = destroyState.players.P1.grave.some((card: Card) => card.id === itemTarget.id);

  const resonanceSource = cloneScriptCard(bt06G01 as Card, 'UNIT');
  const resonanceSpell = cloneScriptCard(bt06G08 as Card, 'GRAVE');
  const sernobuAttacker = cloneScriptCard(bt06G02 as Card, 'UNIT');
  const attackTarget = testCard({ id: 'G08_ATTACK_TARGET', type: 'UNIT', color: 'RED', godMark: false, cardlocation: 'UNIT' });
  const resonanceState = game({
    grave: [resonanceSpell],
    unitZone: [resonanceSource, sernobuAttacker, null, null, null, null],
  }, {
    unitZone: [attackTarget, null, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(resonanceState, 'BOT', resonanceSource, 0);
  if (resonanceState.pendingQuery?.context?.effectId === '103090327_resonance') {
    await answerPendingQuery(resonanceState, 'BOT', [resonanceSpell.gamecardId]);
  }
  for (let guard = 0; guard < 8; guard++) {
    if (!resonanceState.pendingQuery) {
      await ServerGameService.checkTriggeredEffects(resonanceState);
    }
    if (!resonanceState.pendingQuery) break;

    if (resonanceState.pendingQuery.callbackKey === 'TRIGGER_ORDER_CHOICE') {
      await chooseQueuedTrigger(resonanceState, '203000095_exiled_by_resonance_attack');
      continue;
    }

    if (resonanceState.pendingQuery.callbackKey === 'TRIGGER_CHOICE') {
      const isSilverSpellTrigger = resonanceState.pendingQuery.context?.sourceCardId === resonanceSpell.gamecardId;
      await answerPendingQuery(resonanceState, 'BOT', [isSilverSpellTrigger ? 'YES' : 'NO']);
      continue;
    }

    if (resonanceState.pendingQuery.context?.effectId === '203000095_exiled_by_resonance_attack') {
      await answerPendingQuery(resonanceState, 'BOT', [attackTarget.gamecardId]);
    }
    break;
  }
  const resonanceAttackEnabled =
    resonanceState.players.BOT.markedUnitAttackTarget === attackTarget.gamecardId &&
    !!(sernobuAttacker as any).data?.canAttackAnyUnit;

  const ambush = cloneScriptCard(bt06G09 as Card, 'HAND');
  const chimera = cloneScriptCard(bt06G11 as Card, 'GRAVE');
  const greenCost = testCard({ id: 'G09_COST', color: 'GREEN', cardlocation: 'HAND' });
  const reviveState = game({
    hand: [ambush, greenCost],
    grave: [chimera],
  });
  await playStoryAndResolve(reviveState, 'BOT', ambush);
  if (reviveState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(reviveState, 'BOT', [greenCost.gamecardId]);
  }
  if (reviveState.pendingQuery?.context?.effectId === '203000096_revive_chimera') {
    await answerPendingQuery(reviveState, 'BOT', [chimera.gamecardId]);
  }
  const liveChimera = reviveState.players.BOT.unitZone.find((unit: Card | null) => unit?.id === bt06G11.id);
  const revived = !!liveChimera && (liveChimera as any).data?.enteredFromGraveTurn === reviveState.turnCount;

  const salala = cloneScriptCard(bt06G07 as Card, 'UNIT');
  const victim = testCard({ id: 'G11_VICTIM', type: 'UNIT', color: 'RED', godMark: false, cardlocation: 'UNIT' });
  if (!liveChimera) {
    return fail(name, `itemDestroyed=${itemDestroyed}, revived=${revived}, no live chimera`);
  }
  reviveState.players.BOT.unitZone[1] = salala;
  reviveState.players.P1.unitZone[0] = victim;
  await activateAndResolveByOpponentPass(reviveState, 'BOT', liveChimera, 1);
  if (reviveState.pendingQuery?.context?.effectId === '103000334_grave_entry_destroy') {
    await answerPendingQuery(reviveState, 'BOT', [victim.gamecardId]);
  }
  const chimeraResolved = reviveState.players.P1.grave.some((card: Card) => card.id === victim.id) &&
    liveChimera.isrush === true &&
    liveChimera.isHeroic === true &&
    liveChimera.isAnnihilation === true;

  return itemDestroyed && resonanceAttackEnabled && revived && chimeraResolved
    ? pass(name, `itemDestroyed=${itemDestroyed}, resonance=${resonanceAttackEnabled}, revived=${revived}, chimera=${chimeraResolved}`)
    : fail(name, `itemDestroyed=${itemDestroyed}, resonance=${resonanceAttackEnabled}, revived=${revived}, chimera=${chimeraResolved}`);
}

async function testRedDikaiTrackExplore(): Promise<ScenarioResult> {
  const name = 'BT06-R01/R08/R09 Dikai searches Track Explore and stories resolve';
  const dikai = cloneScriptCard(bt06R01 as Card, 'UNIT');
  const track = cloneScriptCard(bt06R08 as Card, 'DECK');
  const enterState = game({
    deck: [track, ...deckCards(5, 'R01_FILL', 'RED')],
    unitZone: [dikai, null, null, null, null, null],
  });
  EventEngine.dispatchEvent(enterState, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: dikai,
    sourceCardId: dikai.gamecardId,
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' },
  });
  await activateTriggerAndAnswerYes(enterState, 'BOT');
  if (enterState.pendingQuery?.context?.effectId === '102050363_enter_leave_search_story') {
    await answerPendingQuery(enterState, 'BOT', [track.gamecardId]);
  }
  const searched = enterState.players.BOT.hand.some((card: Card) => card.id === bt06R08.id);

  const trackStory = cloneScriptCard(bt06R08 as Card, 'HAND');
  const redSource = cloneScriptCard(bt06R02 as Card, 'UNIT');
  const enemy = testCard({ id: 'R08_ENEMY', type: 'UNIT', color: 'BLUE', godMark: false, cardlocation: 'UNIT' });
  const trackState = game({
    hand: [trackStory],
    unitZone: [redSource, null, null, null, null, null],
    erosionFront: [
      testCard({ id: 'R08_EF1', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'R08_EF2', cardlocation: 'EROSION_FRONT' }),
    ],
  }, {
    unitZone: [enemy, null, null, null, null, null],
  });
  await ServerGameService.playCard(trackState, 'BOT', trackStory.gamecardId, {
    erosionFrontIds: [
      trackState.players.BOT.erosionFront[0].gamecardId,
      trackState.players.BOT.erosionFront[1].gamecardId,
    ],
  });
  await ServerGameService.passConfrontation(trackState, trackState.priorityPlayerId);
  if (trackState.pendingQuery?.context?.effectId === '202000104_track_attack_target') {
    await answerPendingQuery(trackState, 'BOT', [enemy.gamecardId]);
  }
  const tracked = trackState.players.BOT.markedUnitAttackTarget === enemy.gamecardId &&
    trackState.players.BOT.exile.some((card: Card) => card.id === bt06R08.id) &&
    !(redSource as any).data?.canAttackAnyUnit;

  const explore = cloneScriptCard(bt06R09 as Card, 'HAND');
  const handUnit = cloneScriptCard(bt06R02 as Card, 'HAND');
  const exploreSource = testCard({ id: 'R09_RED_SOURCE', color: 'RED', cardlocation: 'UNIT' });
  const exploreState = game({
    hand: [explore, handUnit],
    unitZone: [exploreSource, null, null, null, null, null],
    erosionFront: [
      testCard({ id: 'R09_EF1', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'R09_EF2', cardlocation: 'EROSION_FRONT' }),
    ],
  });
  await ServerGameService.playCard(exploreState, 'BOT', explore.gamecardId, {
    erosionFrontIds: [
      exploreState.players.BOT.erosionFront[0].gamecardId,
      exploreState.players.BOT.erosionFront[1].gamecardId,
    ],
  });
  await ServerGameService.passConfrontation(exploreState, exploreState.priorityPlayerId);
  if (exploreState.pendingQuery?.context?.effectId === '202000105_explore_put_unit') {
    await answerPendingQuery(exploreState, 'BOT', [handUnit.gamecardId]);
  }
  const explored = exploreState.players.BOT.unitZone.some((unit: Card | null) => unit?.id === bt06R02.id) &&
    exploreState.players.BOT.exile.some((card: Card) => card.id === bt06R09.id);

  return searched && tracked && explored
    ? pass(name, `searched=${searched}, tracked=${tracked}, explored=${explored}`)
    : fail(name, `searched=${searched}, tracked=${tracked}, explored=${explored}`);
}

async function testRedBatsBetisAndGiantBat(): Promise<ScenarioResult> {
  const name = 'BT06-R03/R04/R05/R06 bats Betis and Giant Bat resolve';
  const cultist = cloneScriptCard(bt06R03 as Card, 'GRAVE');
  const batA = cloneScriptCard(bt06R04 as Card, 'DECK');
  const batB = cloneScriptCard(bt06R04 as Card, 'HAND');
  const cultState = game({
    hand: [batB],
    deck: [batA, ...deckCards(4, 'R03_FILL', 'RED')],
    grave: [cultist],
  });
  EventEngine.dispatchEvent(cultState, {
    type: 'CARD_DESTROYED_BATTLE',
    playerUid: 'BOT',
    targetCardId: cultist.gamecardId,
  } as any);
  await activateTriggerAndAnswerYes(cultState, 'BOT');
  if (cultState.pendingQuery?.context?.effectId === '102140364_destroyed_put_bats') {
    await answerPendingQuery(cultState, 'BOT', [batA.gamecardId, batB.gamecardId]);
  }
  const batsPlaced = cultState.players.BOT.unitZone.filter((unit: Card | null) => unit?.id === bt06R04.id).length === 2 &&
    cultState.players.BOT.unitZone.filter((unit: Card | null) => unit?.id === bt06R04.id).every((unit: Card) => unit.isExhausted);

  const damageBat = cloneScriptCard(bt06R04 as Card, 'UNIT');
  const graveCard = testCard({ id: 'R04_RECOVER', cardlocation: 'GRAVE' });
  const damageState = game({
    grave: [graveCard],
    unitZone: [damageBat, null, null, null, null, null],
  });
  EventEngine.dispatchEvent(damageState, {
    type: 'COMBAT_DAMAGE_CAUSED',
    playerUid: 'P1',
    data: { attackerIds: [damageBat.gamecardId], amount: 1 },
  } as any);
  await activateTriggerAndAnswerYes(damageState, 'BOT');
  const recovered = damageState.players.BOT.grave.length === 0 &&
    damageState.players.BOT.deck.some((card: Card) => card.id === graveCard.id);

  const betis = cloneScriptCard(bt06R05 as Card, 'UNIT');
  (betis as any).data = {
    placedByShingiEffectTurn: 6,
    placedByShingiEffectSourceName: '神仪：测试'
  };
  const enemy = testCard({ id: 'R05_ENEMY', type: 'UNIT', color: 'BLUE', godMark: false, cardlocation: 'UNIT' });
  const betisState = game({
    unitZone: [betis, null, null, null, null, null],
  }, {
    unitZone: [enemy, null, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(betisState, 'BOT', betis, 2);
  if (betisState.pendingQuery?.context?.effectId === '102070358_shingi_turn_destroy') {
    await answerPendingQuery(betisState, 'BOT', [enemy.gamecardId]);
  }
  const newBat = cloneScriptCard(bt06R04 as Card, 'DECK');
  betisState.players.BOT.deck.push(newBat);
  await activateTriggerAndAnswerYes(betisState, 'BOT');
  if (betisState.pendingQuery?.context?.effectId === '102070358_opponent_destroyed_exile_and_put_bat') {
    await answerPendingQuery(betisState, 'BOT', [newBat.gamecardId]);
  }
  const betisResolved = betisState.players.P1.exile.some((card: Card) => card.id === enemy.id);

  const giantBetis = cloneScriptCard(bt06R05 as Card, 'UNIT');
  (giantBetis as any).data = {
    placedByShingiEffectTurn: 6,
    placedByShingiEffectSourceName: '神仪：测试'
  };
  const giant = cloneScriptCard(bt06R06 as Card, 'HAND');
  const giantBat = cloneScriptCard(bt06R04 as Card, 'DECK');
  const giantState = game({
    hand: [giant],
    deck: [giantBat, ...deckCards(3, 'R06_FILL', 'RED')],
    unitZone: [giantBetis, null, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(giantState, 'BOT', giant, 1);
  if (giantState.pendingQuery?.context?.step === 'COST_BETIS') {
    await answerPendingQuery(giantState, 'BOT', [giantBetis.gamecardId]);
  }
  if (giantState.pendingQuery?.context?.step === 'PUT_BATS') {
    await answerPendingQuery(giantState, 'BOT', [giantBat.gamecardId]);
  }
  const giantResolved = giantState.players.BOT.exile.some((card: Card) => card.id === bt06R05.id) &&
    giantState.players.BOT.unitZone.some((unit: Card | null) => unit?.id === bt06R06.id) &&
    giantState.players.BOT.unitZone.some((unit: Card | null) => unit?.id === bt06R04.id);

  return batsPlaced && recovered && betisResolved && giantResolved
    ? pass(name, `bats=${batsPlaced}, recovered=${recovered}, betis=${betisResolved}, giant=${giantResolved}`)
    : fail(name, `bats=${batsPlaced}, recovered=${recovered}, betis=${betisResolved}, giant=${giantResolved}`);
}

async function testRedTrainerLockAndCelia(): Promise<ScenarioResult> {
  const name = 'BT06-R07/R10/R11 trainer lock item and Celia resolve';
  const trainer = cloneScriptCard(bt06R07 as Card, 'UNIT');
  const feijingA = cloneScriptCard(bt06R02 as Card, 'DECK');
  const feijingB = cloneScriptCard(bt06R02 as Card, 'HAND');
  const discardA = testCard({ id: 'R07_DISCARD_A', cardlocation: 'HAND' });
  const discardB = testCard({ id: 'R07_DISCARD_B', cardlocation: 'HAND' });
  const trainerState = game({
    hand: [feijingB, discardA, discardB],
    deck: [feijingA, ...deckCards(4, 'R07_FILL', 'RED')],
    unitZone: [trainer, null, null, null, null, null],
  });
  EventEngine.dispatchEvent(trainerState, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: trainer,
    sourceCardId: trainer.gamecardId,
    data: { zone: 'UNIT', sourceZone: 'HAND', targetZone: 'UNIT' },
  } as any);
  await activateTriggerAndAnswerYes(trainerState, 'BOT');
  if (trainerState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(trainerState, 'BOT', [discardA.gamecardId, discardB.gamecardId]);
  }
  if (trainerState.pendingQuery?.context?.effectId === '102000360_enter_discard_put_feijing') {
    await answerPendingQuery(trainerState, 'BOT', [feijingA.gamecardId, feijingB.gamecardId]);
  }
  const trainerPlaced = trainerState.players.BOT.unitZone.filter((unit: Card | null) => unit?.id === bt06R02.id).length === 2;

  const lock = cloneScriptCard(bt06R10 as Card, 'ITEM');
  const enemy = testCard({ id: 'R10_ENEMY', type: 'UNIT', color: 'BLUE', godMark: false, cardlocation: 'UNIT' });
  const lockState = game({
    itemZone: [lock],
  }, {
    deck: deckCards(5, 'P1_R10_DECK', 'BLUE'),
    unitZone: [enemy, null, null, null, null, null],
  });
  EventEngine.dispatchEvent(lockState, {
    type: 'CARD_ENTERED_ZONE',
    playerUid: 'BOT',
    sourceCard: lock,
    sourceCardId: lock.gamecardId,
    data: { zone: 'ITEM', sourceZone: 'HAND', targetZone: 'ITEM' },
  } as any);
  await activateTriggerAndAnswerYes(lockState, 'BOT');
  if (lockState.pendingQuery?.context?.effectId === '302050056_enter_lock_unit') {
    await answerPendingQuery(lockState, 'BOT', [enemy.gamecardId]);
  }
  EventEngine.recalculateContinuousEffects(lockState);
  const locked = !!(enemy as any).data?.cannotExhaustUntilTurn;
  const lockedCantAttack = ServerGameService.getForcedAttackUnits(lockState, 'BOT').length === 0;
  lockState.players.BOT.isTurn = false;
  lockState.players.P1.isTurn = true;
  lockState.currentTurnPlayer = 1;
  await activateAndResolveByOpponentPass(lockState, 'P1', lock, 2);
  const broken = lockState.players.BOT.grave.some((card: Card) => card.id === bt06R10.id) &&
    lockState.players.P1.grave.length === 3;

  const celia = cloneScriptCard(bt06R11 as Card, 'UNIT', { playedTurn: 1 });
  const cost = testCard({ id: 'R11_COST', type: 'ITEM', color: 'RED', godMark: false, cardlocation: 'ITEM' });
  const celiaState = game({
    unitZone: [celia, null, null, null, null, null],
    itemZone: [cost],
  });
  EventEngine.recalculateContinuousEffects(celiaState);
  const initiallyLocked = !!(celia as any).data?.cannotAttackOrDefendUntilTurn && !!(celia as any).cannotBeEffectTargetByEffect;
  await activateAndResolveByOpponentPass(celiaState, 'BOT', celia, 1);
  if (celiaState.pendingQuery?.context?.effectId === '102050365_disable_continuous') {
    await answerPendingQuery(celiaState, 'BOT', [cost.gamecardId]);
  }
  EventEngine.recalculateContinuousEffects(celiaState);
  const celiaFreed = !(celia as any).data?.cannotAttackOrDefendUntilTurn && !(celia as any).cannotBeEffectTargetByEffect;

  return trainerPlaced && locked && lockedCantAttack && broken && initiallyLocked && celiaFreed
    ? pass(name, `trainer=${trainerPlaced}, locked=${locked}, lockedCantAttack=${lockedCantAttack}, broken=${broken}, celia=${celiaFreed}`)
    : fail(name, `trainer=${trainerPlaced}, locked=${locked}, lockedCantAttack=${lockedCantAttack}, broken=${broken}, initial=${initiallyLocked}, celia=${celiaFreed}`);
}

async function testYellowPartsHickAndValkyrie(): Promise<ScenarioResult> {
  const name = 'BT06-Y01/Y02/Y03/Y04 parts, Hick protection and Valkyrie boost';
  const maker = cloneScriptCard(bt06Y02 as Card, 'UNIT');
  const part = cloneScriptCard(bt06Y01 as Card, 'DECK');
  const graveA = testCard({ id: 'Y02_GA', cardlocation: 'GRAVE', color: 'YELLOW' });
  const graveB = testCard({ id: 'Y02_GB', cardlocation: 'GRAVE', color: 'YELLOW' });
  const state = game({
    deck: [part, ...deckCards(4, 'Y02_FILL', 'YELLOW')],
    grave: [graveA, graveB],
    unitZone: [maker, null, null, null, null, null],
    erosionBack: [testCard({ id: 'Y02_EB', cardlocation: 'EROSION_BACK' })],
  });
  await ServerGameService.activateEffect(state, 'BOT', maker.gamecardId, 0);
  if (state.pendingQuery?.context?.step === 'EXILE_COST') {
    await answerPendingQuery(state, 'BOT', [graveA.gamecardId, graveB.gamecardId]);
  }
  if (state.pendingQuery?.context?.step === 'PUT_PART') {
    await answerPendingQuery(state, 'BOT', [part.gamecardId]);
  }
  const partLive = state.players.BOT.unitZone.find((unit: Card | null) => unit?.id === bt06Y01.id);
  const makerPaid = maker.isExhausted && state.players.BOT.exile.length === 2;

  const hick = cloneScriptCard(bt06Y03 as Card, 'UNIT');
  const handPart = cloneScriptCard(bt06Y01 as Card, 'HAND');
  const hickState = game({
    hand: [handPart],
    unitZone: [hick, partLive ? cloneScriptCard(bt06Y01 as Card, 'UNIT') : null, null, null, null, null],
    erosionBack: [
      testCard({ id: 'Y03_EB_A', cardlocation: 'EROSION_BACK' }),
      testCard({ id: 'Y03_EB_B', cardlocation: 'EROSION_BACK' })
    ],
  });
  EventEngine.recalculateContinuousEffects(hickState);
  const protectedPart = hickState.players.BOT.unitZone[1] as Card;
  const protectedFromOpponent = !!(protectedPart as any).data?.cannotBeEffectTargetByOpponent;
  await ServerGameService.activateEffect(hickState, 'BOT', hick.gamecardId, 1);
  if (hickState.phase === 'COUNTERING') {
    await ServerGameService.passConfrontation(hickState, hickState.priorityPlayerId);
  }
  if (hickState.pendingQuery?.context?.step === 'PUT_FEIJING') {
    await answerPendingQuery(hickState, 'BOT', [handPart.gamecardId]);
  }
  const hickPlaced = hickState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === handPart.gamecardId);

  const valkyrie = cloneScriptCard(bt06Y04 as Card, 'UNIT');
  const fodder = cloneScriptCard(bt06Y01 as Card, 'UNIT');
  const valkyrieState = game({
    unitZone: [valkyrie, fodder, null, null, null, null],
  });
  await activateAndResolveByOpponentPass(valkyrieState, 'BOT', valkyrie, 1);
  if (valkyrieState.pendingQuery?.context?.step === 'DESTROY_COST') {
    await answerPendingQuery(valkyrieState, 'BOT', [fodder.gamecardId]);
  }
  const fodderDestroyed = valkyrieState.players.BOT.grave.some((card: Card) => card.gamecardId === fodder.gamecardId);
  const boosted = valkyrie.power === 4000 && !!valkyrie.temporaryAnnihilation;

  const oneScarHick = cloneScriptCard(bt06Y03 as Card, 'UNIT');
  const oneScarTarget = cloneScriptCard(bt06Y01 as Card, 'HAND');
  const oneScarState = game({
    hand: [oneScarTarget],
    unitZone: [oneScarHick, null, null, null, null, null],
    erosionBack: [testCard({ id: 'Y03_ONE_EB', cardlocation: 'EROSION_BACK' })],
  });
  let hickRequiresScar2 = false;
  try {
    await ServerGameService.activateEffect(oneScarState, 'BOT', oneScarHick.gamecardId, 1);
  } catch {
    hickRequiresScar2 = true;
  }

  return partLive && makerPaid && protectedFromOpponent && hickPlaced && hickRequiresScar2 && fodderDestroyed && boosted
    ? pass(name, `part=${!!partLive}, hickPlaced=${hickPlaced}, scar2=${hickRequiresScar2}, boosted=${boosted}`)
    : fail(name, `part=${!!partLive}, makerPaid=${makerPaid}, protected=${protectedFromOpponent}, hick=${hickPlaced}, scar2=${hickRequiresScar2}, fodder=${fodderDestroyed}, boosted=${boosted}`);
}

async function testYellowHighAlchemyChipAndGiant(): Promise<ScenarioResult> {
  const name = 'BT06-Y06/Y07/Y09 high alchemy marks costs and deck-entry bonuses';
  const storyCard = cloneScriptCard(bt06Y09 as Card, 'HAND');
  const chip = cloneScriptCard(bt06Y06 as Card, 'DECK');
  const chipCopy = cloneScriptCard(bt06Y06 as Card, 'DECK');
  const giant = cloneScriptCard(bt06Y07 as Card, 'DECK');
  const feijingCost = cloneScriptCard(bt06Y01 as Card, 'UNIT');
  const invalidFeijingCost = cloneScriptCard(bt06Y01 as Card, 'GRAVE', { gamecardId: 'Y09_INVALID_FEIJING_COST' });
  const itemCost = testCard({ id: 'Y09_ITEM_COST', type: 'ITEM', color: 'YELLOW', cardlocation: 'ITEM' });
  const state = game({
    hand: [storyCard],
    deck: [chipCopy, giant, chip, ...deckCards(4, 'Y09_FILL', 'YELLOW')],
    unitZone: [feijingCost, null, null, null, null, null],
    itemZone: [itemCost],
    grave: [invalidFeijingCost],
  });
  (invalidFeijingCost as any).data = {
    sentToGraveFromFieldByEffectTurn: state.turnCount,
    sentToGraveFromFieldByEffectSourceCardId: itemCost.gamecardId,
  };
  await playStoryAndResolve(state, 'BOT', storyCard);
  if (state.pendingQuery?.context?.step !== 'SEND_FIELD') return fail(name, `expected SEND_FIELD, got ${state.pendingQuery?.context?.step || 'none'}`);
  await answerPendingQuery(state, 'BOT', [feijingCost.gamecardId, itemCost.gamecardId]);
  if (state.pendingQuery?.context?.step !== 'PUT_CARD') return fail(name, `expected PUT_CARD, got ${state.pendingQuery?.context?.step || 'none'}`);
  await answerPendingQuery(state, 'BOT', [chip.gamecardId]);
  await ServerGameService.checkTriggeredEffects(state);
  await chooseQueuedTrigger(state, '105000353_alchemy_power');
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  const costOptionsText = JSON.stringify(state.pendingQuery?.options || []);
  const chipOnlyAlchemyFeijingCost = costOptionsText.includes(feijingCost.gamecardId) &&
    !costOptionsText.includes(invalidFeijingCost.gamecardId);
  if (state.pendingQuery?.context?.step === 'EXILE_COST') {
    await answerPendingQuery(state, 'BOT', [feijingCost.gamecardId]);
  }
  await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  const chipLive = state.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === chip.gamecardId);
  const chipCopyLive = state.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === chipCopy.gamecardId);
  const chipPowered = chipLive?.power === 3000;
  const chipCostExiled = state.players.BOT.exile.some((card: Card) => card.gamecardId === feijingCost.gamecardId);
  const chipCopyExhausted = !!chipCopyLive?.isExhausted;
  const chipCopyFromDeck = chipCopyLive?.cardlocation === 'UNIT';
  const storyResolved = state.players.BOT.grave.some((card: Card) => card.gamecardId === storyCard.gamecardId);

  const giantSource = cloneScriptCard(bt06Y09 as Card, 'GRAVE');
  const giantState = game({
    deck: [giant, ...deckCards(4, 'Y07_FILL', 'YELLOW')],
    grave: [giantSource],
  });
  ServerGameService.moveCard(giantState, 'BOT', 'DECK', 'BOT', 'UNIT', giant.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'BOT',
    effectSourceCardId: giantSource.gamecardId,
    suppressLog: true,
  });
  const liveGiant = giantState.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === giant.gamecardId);
  (liveGiant as any).data = {
    ...((liveGiant as any).data || {}),
    enteredFromDeckByAlchemyTurn: giantState.turnCount,
    enteredFromDeckByAlchemySourceCardId: giantSource.gamecardId,
  };
  EventEngine.recalculateContinuousEffects(giantState);
  const giantBoosted = liveGiant?.power === 4000 && !!liveGiant?.isHeroic;

  return chipPowered && chipCostExiled && chipOnlyAlchemyFeijingCost && chipCopyExhausted && chipCopyFromDeck && storyResolved && giantBoosted
    ? pass(name, `chip=${chipPowered}, costFilter=${chipOnlyAlchemyFeijingCost}, copy=${chipCopyExhausted}, giant=${giantBoosted}`)
    : fail(name, `chip=${chipPowered}, cost=${chipCostExiled}/${chipOnlyAlchemyFeijingCost}, copy=${chipCopyExhausted}/${chipCopyFromDeck}, story=${storyResolved}, giant=${giantBoosted}`);
}

async function testAcademyFeijingMerchantLeaveTrigger(): Promise<ScenarioResult> {
  const name = 'BT05-Y01 Academy Feijing Merchant triggers when leaving field';
  const merchant = cloneScriptCard(academyFeijingMerchant as Card, 'UNIT');
  const target = cloneScriptCard(bt06Y01 as Card, 'DECK', { godMark: false, baseGodMark: false });
  const state = game({
    deck: [target, ...deckCards(3, 'Y01_LEAVE_FILL', 'YELLOW')],
    unitZone: [merchant, null, null, null, null, null],
  });

  ServerGameService.moveCard(state, 'BOT', 'UNIT', 'BOT', 'GRAVE', merchant.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'BOT',
    effectSourceCardId: merchant.gamecardId,
  });
  await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(state, 'BOT', ['YES']);
  }
  if (state.pendingQuery?.context?.effectId === '105110223_enter_leave_search') {
    await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  }

  const searched = state.players.BOT.hand.some((card: Card) => card.gamecardId === target.gamecardId);
  return searched
    ? pass(name, `searched=${searched}`)
    : fail(name, `searched=${searched}, pending=${state.pendingQuery?.context?.effectId || state.pendingQuery?.callbackKey || 'none'}`);
}

async function testDivineAlchemyDamageAndEndsTurn(): Promise<ScenarioResult> {
  const name = 'BT04 Divine Alchemy deals AC damage then ends turn';
  const story = cloneScriptCard(divineAlchemy as Card, 'HAND', { colorReq: {}, baseColorReq: {}, acValue: 0, baseAcValue: 0 });
  const target = testCard({
    id: 'DIVINE_ALCHEMY_TARGET',
    fullName: 'Divine Alchemy Target',
    type: 'UNIT',
    color: 'YELLOW',
    cardlocation: 'DECK',
    colorReq: {},
    baseColorReq: {},
    acValue: 3,
    baseAcValue: 3,
  });
  const damageCards = deckCards(5, 'DIVINE_ALCHEMY_DAMAGE', 'YELLOW');
  const state = game({
    hand: [story],
    deck: [...damageCards, target],
    erosionBack: [testCard({ id: 'DIVINE_ALCHEMY_EB', cardlocation: 'EROSION_BACK' })],
  });

  await playStoryAndResolve(state, 'BOT', story);
  if (state.pendingQuery?.context?.effectId === '205000136_activate') {
    await answerPendingQuery(state, 'BOT', [target.gamecardId]);
  }

  const targetLive = state.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === target.gamecardId);
  const damageTaken = state.players.BOT.erosionFront.filter((card: Card | null) => !!card).length;
  const turnEnded = state.turnCount === 7 && state.currentTurnPlayer === 1 && state.players.P1.isTurn;
  const storyInGrave = state.players.BOT.grave.some((card: Card) => card.gamecardId === story.gamecardId);

  return targetLive && damageTaken === 3 && turnEnded && storyInGrave
    ? pass(name, `damage=${damageTaken}, turn=${state.turnCount}/${state.phase}`)
    : fail(name, `targetLive=${targetLive}, damage=${damageTaken}, turnEnded=${turnEnded}, storyInGrave=${storyInGrave}, phase=${state.phase}, turn=${state.turnCount}, current=${state.currentTurnPlayer}`);
}

async function testGreatAlchemistLoseAtEndOfTurn(): Promise<ScenarioResult> {
  const name = 'BT02 Great Alchemist loses at end of turn';
  const alchemist = cloneScriptCard(greatAlchemist as Card, 'UNIT');
  const graveCards = deckCards(2, 'GREAT_ALCHEMIST_GRAVE', 'YELLOW').map(card => ({ ...card, cardlocation: 'GRAVE' as TriggerLocation }));
  const erosion = deckCards(10, 'GREAT_ALCHEMIST_EROSION', 'YELLOW').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as TriggerLocation }));
  const state = game({
    deck: deckCards(5, 'GREAT_ALCHEMIST_DECK', 'YELLOW'),
    grave: graveCards,
    unitZone: [alchemist, null, null, null, null, null],
    erosionFront: erosion,
    isGoddessMode: true,
  });

  await activateAndResolveByOpponentPass(state, 'BOT', alchemist, 1);
  const markerSet = (state.players.BOT as any).loseAtEndOfTurn === state.turnCount;
  await ServerGameService.executeEndPhase(state, state.players.BOT);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_ORDER_CHOICE') {
    const loseOption = state.pendingQuery.options?.find((option: any) => String(option.id || '').startsWith('lose_at_end_'));
    await answerPendingQuery(state, state.pendingQuery.playerUid, [loseOption?.id || state.pendingQuery.options?.[0]?.id]);
  }

  const lost = state.gameStatus === 2 && state.winnerId === 'P1';
  const graveBottomed = graveCards.every(card => state.players.BOT.deck.some((deckCard: Card) => deckCard.gamecardId === card.gamecardId));

  return markerSet && lost && graveBottomed
    ? pass(name, `lost=${lost}, graveBottomed=${graveBottomed}`)
    : fail(name, `marker=${markerSet}, lost=${lost}, winner=${state.winnerId || 'none'}, graveBottomed=${graveBottomed}`);
}

async function testGreatAlchemistLoseAfterLeavingField(): Promise<ScenarioResult> {
  const name = 'BT02 Great Alchemist end loss still triggers after leaving field';
  const alchemist = cloneScriptCard(greatAlchemist as Card, 'UNIT');
  const graveCards = deckCards(2, 'GREAT_ALCHEMIST_LEAVE_GRAVE', 'YELLOW').map(card => ({ ...card, cardlocation: 'GRAVE' as TriggerLocation }));
  const erosion = deckCards(10, 'GREAT_ALCHEMIST_LEAVE_EROSION', 'YELLOW').map(card => ({ ...card, cardlocation: 'EROSION_FRONT' as TriggerLocation }));
  const state = game({
    deck: deckCards(5, 'GREAT_ALCHEMIST_LEAVE_DECK', 'YELLOW'),
    grave: graveCards,
    unitZone: [alchemist, null, null, null, null, null],
    erosionFront: erosion,
    isGoddessMode: true,
  });

  await activateAndResolveByOpponentPass(state, 'BOT', alchemist, 1);
  const markerSet = (state.players.BOT as any).loseAtEndOfTurn === state.turnCount;
  ServerGameService.moveCard(state, 'BOT', 'UNIT', 'BOT', 'GRAVE', alchemist.gamecardId, {
    isEffect: true,
    effectSourcePlayerUid: 'BOT',
    effectSourceCardId: alchemist.gamecardId
  });

  await ServerGameService.executeEndPhase(state, state.players.BOT);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_ORDER_CHOICE') {
    const loseOption = state.pendingQuery.options?.find((option: any) => String(option.id || '').startsWith('lose_at_end_'));
    await answerPendingQuery(state, state.pendingQuery.playerUid, [loseOption?.card?.gamecardId || loseOption?.id || state.pendingQuery.options?.[0]?.id]);
  }

  const lost = state.gameStatus === 2 && state.winnerId === 'P1';
  const sourceCardShown = state.logs.some((log: any) => String(log?.text || log).includes('大炼金术士「伊丽瑟薇」')) ||
    state.winSourceCardName === alchemist.fullName;

  return markerSet && lost && sourceCardShown
    ? pass(name, `lost=${lost}, source=${state.winSourceCardName}`)
    : fail(name, `marker=${markerSet}, lost=${lost}, winner=${state.winnerId || 'none'}, source=${state.winSourceCardName || 'none'}, phase=${state.phase}`);
}

async function testElmontEnterTriggerIsOptional(): Promise<ScenarioResult> {
  const name = 'BT02 Alchemy Knight Elmont enter trigger is optional';
  const buildState = () => {
    const elmont = cloneScriptCard(alchemyKnightElmont as Card, 'UNIT');
    const graveA = testCard({
      id: 'ELMONT_GRAVE_A',
      fullName: '炼金素材 A',
      specialName: '素材A',
      type: 'UNIT',
      color: 'YELLOW',
      cardlocation: 'GRAVE',
    });
    const graveB = testCard({
      id: 'ELMONT_GRAVE_B',
      fullName: '炼金素材 B',
      specialName: '素材B',
      type: 'UNIT',
      color: 'YELLOW',
      cardlocation: 'GRAVE',
    });
    const drawCard = testCard({
      id: 'ELMONT_DRAW',
      fullName: 'Elmont draw card',
      type: 'UNIT',
      color: 'YELLOW',
      cardlocation: 'DECK',
    });
    const state = game({
      deck: [drawCard, ...deckCards(2, 'ELMONT_DECK', 'YELLOW')],
      grave: [graveA, graveB],
      unitZone: [elmont, null, null, null, null, null],
    });
    EventEngine.dispatchEvent(state, {
      type: 'CARD_ENTERED_ZONE' as any,
      playerUid: 'BOT',
      sourceCardId: elmont.gamecardId,
      data: { zone: 'UNIT' },
    });
    return { state, elmont, graveA, graveB };
  };

  const noState = buildState();
  await ServerGameService.checkTriggeredEffects(noState.state);
  const asksOptional = noState.state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE' &&
    noState.state.pendingQuery.playerUid === 'BOT' &&
    noState.state.pendingQuery.context?.sourceCardId === noState.elmont.gamecardId;
  const noBeforeGrave = noState.state.players.BOT.grave.length;
  const noBeforeDeck = noState.state.players.BOT.deck.length;
  const noBeforeHand = noState.state.players.BOT.hand.length;
  await answerPendingQuery(noState.state, 'BOT', ['NO']);
  const noSkipped = noState.state.players.BOT.grave.length === noBeforeGrave &&
    noState.state.players.BOT.deck.length === noBeforeDeck &&
    noState.state.players.BOT.hand.length === noBeforeHand &&
    !noState.state.pendingQuery;

  const yesState = buildState();
  await ServerGameService.checkTriggeredEffects(yesState.state);
  await answerPendingQuery(yesState.state, 'BOT', ['YES']);
  const asksSelection = yesState.state.pendingQuery?.callbackKey === 'EFFECT_RESOLVE' &&
    yesState.state.pendingQuery.context?.effectId === '105120168_enter' &&
    yesState.state.pendingQuery.options?.length === 2;
  await answerPendingQuery(yesState.state, 'BOT', [yesState.graveA.gamecardId, yesState.graveB.gamecardId]);
  const graveBottomed = [yesState.graveA, yesState.graveB].every(card =>
    yesState.state.players.BOT.deck.some((deckCard: Card) => deckCard.gamecardId === card.gamecardId)
  );
  const drewCard = yesState.state.players.BOT.hand.length === 1;
  const yesResolved = graveBottomed && drewCard && !yesState.state.pendingQuery;

  return asksOptional && noSkipped && asksSelection && yesResolved
    ? pass(name, `optional=${asksOptional}, no=${noSkipped}, yes=${yesResolved}`)
    : fail(name, `optional=${asksOptional}, no=${noSkipped}, select=${asksSelection}, yes=${yesResolved}, pending=${yesState.state.pendingQuery?.callbackKey || 'none'}`);
}

async function testYellowDailyBlueprintTruthAndIly(): Promise<ScenarioResult> {
  const name = 'BT06-Y05/Y08/Y10/Y11 silence bodies, blueprint and Truth';
  const daily = cloneScriptCard(bt06Y08 as Card, 'HAND');
  const discard = testCard({ id: 'Y08_DISCARD', type: 'UNIT', color: 'YELLOW', cardlocation: 'HAND' });
  const dailyTarget = testCard({ id: 'Y08_TARGET', type: 'UNIT', color: 'GREEN', cardlocation: 'DECK', colorReq: {}, power: 2500, basePower: 2500, damage: 2, baseDamage: 2 });
  const dailyTargetB = testCard({ id: 'Y08_TARGET_B', type: 'UNIT', color: 'GREEN', cardlocation: 'DECK', colorReq: {}, power: 1500, basePower: 1500, damage: 1, baseDamage: 1 });
  const dailyState = game({
    hand: [daily, discard],
    deck: [dailyTargetB, dailyTarget, ...deckCards(4, 'Y08_FILL', 'YELLOW')],
    erosionBack: [testCard({ id: 'Y08_EB', cardlocation: 'EROSION_BACK' })],
  });
  await playStoryAndResolve(dailyState, 'BOT', daily);
  if (dailyState.pendingQuery?.callbackKey === 'ACTIVATE_COST_RESOLVE') {
    await answerPendingQuery(dailyState, 'BOT', [discard.gamecardId]);
  }
  if (dailyState.pendingQuery?.context?.step === 'PUT_UNIT') {
    await answerPendingQuery(dailyState, 'BOT', [dailyTarget.gamecardId, dailyTargetB.gamecardId]);
  }
  const dailyLive = dailyState.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === dailyTarget.gamecardId);
  const dailyLiveB = dailyState.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === dailyTargetB.gamecardId);
  const dailySilenced = dailyLive?.power === 0 && dailyLive.damage === 1 && !!(dailyLive as any).data?.permanentEffectSilenced &&
    dailyLiveB?.power === 0 && dailyLiveB.damage === 1 && !!(dailyLiveB as any).data?.permanentEffectSilenced;
  if (dailyLive) {
    ServerGameService.moveCard(dailyState, 'BOT', 'UNIT', 'BOT', 'GRAVE', dailyLive.gamecardId, { isEffect: true, effectSourcePlayerUid: 'BOT', effectSourceCardId: daily.gamecardId });
  }
  const dailyExiledOnLeave = dailyState.players.BOT.exile.some((card: Card) => card.gamecardId === dailyTarget.gamecardId);

  const blueprintStart = cloneScriptCard(bt06Y10 as Card, 'ITEM');
  const blueprintTop = testCard({ id: 'Y10_TOP', type: 'UNIT', color: 'YELLOW', cardlocation: 'DECK' });
  const blueprintStartState = game({
    deck: [blueprintTop],
    itemZone: [blueprintStart],
  }, {}, { phase: 'START' });
  EventEngine.dispatchEvent(blueprintStartState, { type: 'PHASE_CHANGED' as any, playerUid: 'BOT', data: { phase: 'START' } });
  await activateTriggerAndAnswerYes(blueprintStartState, 'BOT');
  const blueprintStartFacedown = blueprintStartState.players.BOT.exile.some((card: Card) =>
    card.gamecardId === blueprintTop.gamecardId && card.displayState === 'FRONT_FACEDOWN'
  );

  const blueprint = cloneScriptCard(bt06Y10 as Card, 'ITEM');
  const valkyrie = cloneScriptCard(bt06Y04 as Card, 'DECK');
  const enemy = testCard({ id: 'Y10_ENEMY', type: 'UNIT', color: 'RED', godMark: false, cardlocation: 'UNIT' });
  const faceDownA = testCard({ id: 'Y10_FD_A', cardlocation: 'EXILE', displayState: 'FRONT_FACEDOWN' });
  const faceDownB = testCard({ id: 'Y10_FD_B', cardlocation: 'EXILE', displayState: 'FRONT_FACEDOWN' });
  const blueprintState = game({
    deck: [valkyrie, ...deckCards(4, 'Y10_FILL', 'YELLOW')],
    exile: [faceDownA, faceDownB],
    itemZone: [blueprint],
  }, {
    unitZone: [enemy, null, null, null, null, null],
  }, { phase: 'END' });
  EventEngine.dispatchEvent(blueprintState, { type: 'TURN_END' as any, playerUid: 'BOT' });
  await activateTriggerAndAnswerYes(blueprintState, 'BOT');
  if (blueprintState.pendingQuery?.context?.step === 'PUT_UNIT') {
    await answerPendingQuery(blueprintState, 'BOT', [valkyrie.gamecardId]);
  }
  await ServerGameService.checkTriggeredEffects(blueprintState);
  if (blueprintState.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') {
    await answerPendingQuery(blueprintState, 'BOT', ['YES']);
  }
  if (blueprintState.pendingQuery?.context?.step === 'DESTROY') {
    await answerPendingQuery(blueprintState, 'BOT', [enemy.gamecardId]);
  }
  const blueprintPulled = blueprintState.players.BOT.unitZone.some((unit: Card | null) => unit?.gamecardId === valkyrie.gamecardId);
  const enemyDestroyed = blueprintState.players.P1.grave.some((card: Card) => card.gamecardId === enemy.gamecardId);
  const facedownBottomed = blueprintState.players.BOT.exile.filter((card: Card) => card.displayState === 'FRONT_FACEDOWN').length === 0 &&
    blueprintState.players.BOT.deck.some((card: Card) => card.gamecardId === faceDownA.gamecardId);

  const truth = cloneScriptCard(bt06Y11 as Card, 'UNIT');
  const truthFeijing = cloneScriptCard(bt06Y01 as Card, 'UNIT');
  const truthTarget = testCard({ id: 'Y11_TARGET', type: 'UNIT', color: 'RED', cardlocation: 'GRAVE', colorReq: {}, power: 2000, basePower: 2000, damage: 2, baseDamage: 2 });
  const truthState = game({
    grave: [truthTarget],
    unitZone: [truth, truthFeijing, null, null, null, null],
    erosionBack: [testCard({ id: 'Y11_EB', cardlocation: 'EROSION_BACK' })],
  }, {}, { phase: 'END' });
  EventEngine.recalculateContinuousEffects(truthState);
  const truthHasBlueUnit = (truthFeijing as any).temporaryExtraColors?.includes('BLUE');
  truthState.triggeredEffectsQueue = [];
  EventEngine.dispatchEvent(truthState, { type: 'TURN_END' as any, playerUid: 'BOT' });
  await activateTriggerAndAnswerYes(truthState, 'BOT');
  if (truthState.pendingQuery?.context?.step === 'PUT_UNIT') {
    await answerPendingQuery(truthState, 'BOT', [truthTarget.gamecardId]);
  }
  const truthLive = truthState.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === truthTarget.gamecardId);
  const truthNormalized = truthHasBlueUnit && truthLive?.power === 0 && truthLive.damage === 1 && !!(truthLive as any).data?.permanentEffectSilenced;

  const ily = cloneScriptCard(bt06Y05 as Card, 'UNIT');
  const fieldA = cloneScriptCard(bt06Y01 as Card, 'UNIT');
  const fieldB = testCard({ id: 'Y05_FIELD_B', type: 'ITEM', color: 'YELLOW', cardlocation: 'ITEM' });
  const ilyTarget = testCard({ id: 'Y05_TARGET', type: 'UNIT', color: 'GREEN', cardlocation: 'DECK', colorReq: {}, power: 3000, basePower: 3000 });
  const ilyState = game({
    deck: [ilyTarget, ...deckCards(4, 'Y05_FILL', 'YELLOW')],
    unitZone: [ily, fieldA, null, null, null, null],
    itemZone: [fieldB],
  }, {}, { phase: 'END' });
  EventEngine.dispatchEvent(ilyState, { type: 'TURN_END' as any, playerUid: 'BOT' });
  await activateTriggerAndAnswerYes(ilyState, 'BOT');
  if (ilyState.pendingQuery?.context?.step === 'SEND_FIELD') {
    await answerPendingQuery(ilyState, 'BOT', [fieldA.gamecardId, fieldB.gamecardId]);
  }
  if (ilyState.pendingQuery?.context?.step === 'PUT_CARD') {
    await answerPendingQuery(ilyState, 'BOT', [ilyTarget.gamecardId]);
  }
  const ilyLive = ilyState.players.BOT.unitZone.find((unit: Card | null) => unit?.gamecardId === ilyTarget.gamecardId);
  const ilyTempSilence = !!(ilyLive as any)?.data?.fullEffectSilencedUntilOwnStartUid;

  return dailySilenced && dailyExiledOnLeave && blueprintStartFacedown && blueprintPulled && enemyDestroyed && facedownBottomed && truthNormalized && ilyTempSilence
    ? pass(name, `daily=${dailySilenced}, blueprint=${blueprintStartFacedown}/${blueprintPulled}, truth=${truthNormalized}, ily=${ilyTempSilence}`)
    : fail(name, `daily=${dailySilenced}/${dailyExiledOnLeave}, blueprint=${blueprintStartFacedown}/${blueprintPulled}/${enemyDestroyed}/${facedownBottomed}, truth=${truthNormalized}, ily=${ilyTempSilence}`);
}

async function testYellowChocolate(): Promise<ScenarioResult> {
  const name = 'BT06/SP Yellow Chocolate resolves reveal destroy';
  const story = cloneScriptCard(chocolate as Card, 'HAND', { colorReq: {}, baseColorReq: {}, acValue: 0, baseAcValue: 0 });
  const revealGod = testCard({ id: 'CHOC_GOD', type: 'UNIT', color: 'YELLOW', godMark: true, baseGodMark: true, cardlocation: 'DECK' });
  const ownSmall = testCard({ id: 'CHOC_OWN_SMALL', type: 'UNIT', color: 'YELLOW', godMark: false, cardlocation: 'UNIT', power: 1000, basePower: 1000 });
  const enemySmall = testCard({ id: 'CHOC_ENEMY_SMALL', type: 'UNIT', color: 'RED', godMark: false, cardlocation: 'UNIT', power: 1500, basePower: 1500 });
  const enemyLarge = testCard({ id: 'CHOC_ENEMY_LARGE', type: 'UNIT', color: 'RED', godMark: false, cardlocation: 'UNIT', power: 2500, basePower: 2500 });
  const state = game({
    hand: [story],
    deck: [revealGod],
    unitZone: [ownSmall, null, null, null, null, null],
  }, {
    unitZone: [enemySmall, enemyLarge, null, null, null, null],
  });

  const oldRandom = Math.random;
  Math.random = () => 0;
  try {
    await playStoryAndResolve(state, 'BOT', story);
  } finally {
    Math.random = oldRandom;
  }

  const enemySmallDestroyed = state.players.P1.grave.some((card: Card) => card.gamecardId === enemySmall.gamecardId);
  const enemyLargeAlive = state.players.P1.unitZone.some((card: Card | null) => card?.gamecardId === enemyLarge.gamecardId);
  const ownSmallAlive = state.players.BOT.unitZone.some((card: Card | null) => card?.gamecardId === ownSmall.gamecardId);

  return enemySmallDestroyed && enemyLargeAlive && ownSmallAlive
    ? pass(name, `enemySmall=${enemySmallDestroyed}, enemyLargeAlive=${enemyLargeAlive}, ownSmallAlive=${ownSmallAlive}`)
    : fail(name, `enemySmall=${enemySmallDestroyed}, enemyLargeAlive=${enemyLargeAlive}, ownSmallAlive=${ownSmallAlive}`);
}

async function testEndTurnTriggerBucketOrder(): Promise<ScenarioResult> {
  const name = 'End turn trigger buckets resolve mandatory turn player before opponent then optional';
  const ily = cloneScriptCard(bt06Y05 as Card, 'UNIT');
  const materialA = cloneScriptCard(bt06Y01 as Card, 'UNIT');
  const materialB = testCard({ id: 'ILY_MAT_B', type: 'ITEM', color: 'YELLOW', cardlocation: 'ITEM' });
  const ilyDeckTarget = testCard({ id: 'ILY_DECK_TARGET', type: 'UNIT', color: 'GREEN', cardlocation: 'DECK', colorReq: {}, power: 3000, basePower: 3000 });
  const forbiddenSource = cloneScriptCard(forbiddenAlchemy as Card, 'GRAVE');
  const forbiddenTarget = testCard({ id: 'FORBIDDEN_TARGET', fullName: 'Forbidden non alchemy target', type: 'UNIT', color: 'RED', cardlocation: 'UNIT', colorReq: {}, power: 1000, basePower: 1000 });
  const escortCard = cloneScriptCard(escort as Card, 'UNIT');
  const escortedTarget = testCard({ id: 'ESCORTED_TARGET', fullName: 'Escorted target', type: 'UNIT', color: 'BLUE', cardlocation: 'EXILE', colorReq: {}, power: 2000, basePower: 2000 });

  (forbiddenTarget as any).data = {
    returnToExileAtEndTurn: 6,
    returnToExileSourceName: forbiddenSource.fullName,
    returnToExileSourceCardId: forbiddenSource.gamecardId,
    returnToExileEffectOwnerUid: 'BOT'
  };

  const state = game({
    deck: [ilyDeckTarget, ...deckCards(4, 'END_ORDER_FILL', 'YELLOW')],
    grave: [forbiddenSource],
    unitZone: [ily, materialA, forbiddenTarget, null, null, null],
    itemZone: [materialB],
  }, {
    unitZone: [escortCard, null, null, null, null, null],
    exile: [escortedTarget],
    escortReturns: [{ cardId: escortedTarget.gamecardId, ownerUid: 'P1', zone: 'UNIT', afterTurn: 6 }],
  }, { phase: 'END', turnCount: 6 });

  EventEngine.dispatchEvent(state, { type: 'TURN_END' as any, playerUid: 'BOT' });
  ServerGameService.enqueueMandatoryEndTurnDelayedEffects(state, 'BOT');
  await ServerGameService.checkTriggeredEffects(state);

  const firstWasForbidden = state.players.BOT.exile.some((card: Card) => card.gamecardId === forbiddenTarget.gamecardId);
  await ServerGameService.checkTriggeredEffects(state);

  const returnedByEscort = state.players.P1.unitZone.some((card: Card | null) => card?.gamecardId === escortedTarget.gamecardId);
  const optionalIlyPending = state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE' &&
    state.pendingQuery.playerUid === 'BOT' &&
    state.pendingQuery.context?.sourceCardId === ily.gamecardId;

  return firstWasForbidden && returnedByEscort && optionalIlyPending
    ? pass(name, `forbidden=${firstWasForbidden}, escort=${returnedByEscort}, optional=${optionalIlyPending}`)
    : fail(name, `forbidden=${firstWasForbidden}, escort=${returnedByEscort}, pending=${state.pendingQuery?.callbackKey || 'none'}/${state.pendingQuery?.context?.sourceCardId || 'none'}`);
}

async function testSameBucketTriggerOrderChoice(): Promise<ScenarioResult> {
  const name = 'Same bucket trigger order asks player to choose next trigger';
  const sourceA = testCard({ id: 'MAND_A', fullName: 'Mandatory A', type: 'UNIT', color: 'YELLOW', cardlocation: 'UNIT' });
  const sourceB = testCard({ id: 'MAND_B', fullName: 'Mandatory B', type: 'UNIT', color: 'YELLOW', cardlocation: 'UNIT' });
  const state = game({
    unitZone: [sourceA, sourceB, null, null, null, null],
  }, {}, { phase: 'END' });
  const resolved: string[] = [];
  state.triggeredEffectsQueue.push(
    {
      queueId: 'mandatory_a',
      card: sourceA,
      playerUid: 'BOT',
      effectIndex: -1,
      event: { type: 'TURN_END' as any, playerUid: 'BOT' },
      effect: {
        id: 'mandatory_a',
        type: 'TRIGGER',
        isMandatory: true,
        description: '必发 A',
        execute: async () => { resolved.push('A'); }
      }
    },
    {
      queueId: 'mandatory_b',
      card: sourceB,
      playerUid: 'BOT',
      effectIndex: -1,
      event: { type: 'TURN_END' as any, playerUid: 'BOT' },
      effect: {
        id: 'mandatory_b',
        type: 'TRIGGER',
        isMandatory: true,
        description: '必发 B',
        execute: async () => { resolved.push('B'); }
      }
    }
  );

  await ServerGameService.checkTriggeredEffects(state);
  const askedOrder = state.pendingQuery?.callbackKey === 'TRIGGER_ORDER_CHOICE' &&
    state.pendingQuery.playerUid === 'BOT' &&
    state.pendingQuery.options?.length === 2;
  await answerPendingQuery(state, 'BOT', ['mandatory_b']);

  return askedOrder && resolved.join(',') === 'B,A'
    ? pass(name, `resolved=${resolved.join(',')}`)
    : fail(name, `asked=${askedOrder}, resolved=${resolved.join(',')}, pending=${state.pendingQuery?.callbackKey || 'none'}`);
}

async function testNonEndTriggerBucketsUseUnifiedOrder(): Promise<ScenarioResult> {
  const name = 'Non-end triggers use unified bucket order';
  const turnOptional = testCard({ id: 'TURN_OPTIONAL', fullName: 'turn_optional', cardlocation: 'UNIT' });
  const opponentOptional = testCard({ id: 'OPPONENT_OPTIONAL', fullName: 'opponent_optional', cardlocation: 'UNIT' });
  const state = game({
    unitZone: [turnOptional, null, null, null, null, null],
  }, {
    unitZone: [opponentOptional, null, null, null, null, null],
  }, { phase: 'MAIN' });
  const resolved: string[] = [];
  const makeRecord = (queueId: string, playerUid: 'BOT' | 'P1', mandatory: boolean, eventType: any) => {
    const card = playerUid === 'BOT' ? turnOptional : opponentOptional;
    return {
      queueId,
      card,
      playerUid,
      effectIndex: -1,
      event: { type: eventType, playerUid },
      effect: {
        id: queueId,
        type: 'TRIGGER',
        isMandatory: mandatory,
        description: queueId,
        execute: async () => { resolved.push(queueId); }
      }
    };
  };
  state.triggeredEffectsQueue.push(
    makeRecord('turn_optional', 'BOT', false, 'CARD_ATTACK_DECLARED'),
    makeRecord('opponent_optional', 'P1', false, 'CARD_ATTACK_DECLARED'),
    makeRecord('opponent_mandatory', 'P1', true, 'CARD_ATTACK_DECLARED'),
    makeRecord('turn_mandatory', 'BOT', true, 'CARD_ATTACK_DECLARED')
  );

  await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') await answerPendingQuery(state, 'BOT', ['YES']);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') await answerPendingQuery(state, 'P1', ['YES']);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') await answerPendingQuery(state, 'BOT', ['YES']);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE') await answerPendingQuery(state, 'P1', ['YES']);

  const ordered = resolved.join(',') === 'turn_mandatory,opponent_mandatory,turn_optional,opponent_optional';
  return ordered
    ? pass(name, resolved.join(','))
    : fail(name, `resolved=${resolved.join(',')}, pending=${state.pendingQuery?.callbackKey || 'none'}`);
}

async function testMainPhaseStartTriggersBeforeActions(): Promise<ScenarioResult> {
  const name = 'Main phase start triggers before actions';
  const source = testCard({
    id: 'MAIN_START_TRIGGER',
    fullName: 'Main Start Trigger',
    cardlocation: 'UNIT',
    effects: [{
      id: 'main_start_optional',
      type: 'TRIGGER',
      triggerEvent: 'PHASE_CHANGED' as any,
      isMandatory: false,
      description: '主要阶段开始选发',
      condition: (_gameState: any, _player: any, _card: Card, event?: any) =>
        event?.type === 'PHASE_CHANGED' && event.data?.phase === 'MAIN',
      execute: async (_card: Card, gameState: any) => {
        (gameState as any).mainStartResolved = true;
      }
    } as any]
  });
  const state = game({
    unitZone: [source, null, null, null, null, null],
  }, {}, { phase: 'EROSION' });

  await ServerGameService.proceedAfterErosion(state, 'BOT');
  const asked = state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE' &&
    state.pendingQuery.context?.sourceCardId === source.gamecardId;
  await answerPendingQuery(state, 'BOT', ['YES']);
  const resolved = (state as any).mainStartResolved === true;

  return asked && resolved && state.phase === 'MAIN'
    ? pass(name, `asked=${asked}, resolved=${resolved}`)
    : fail(name, `asked=${asked}, resolved=${resolved}, phase=${state.phase}, pending=${state.pendingQuery?.callbackKey || 'none'}`);
}

async function testAttackAndDamageTriggersUseUnifiedFlow(): Promise<ScenarioResult> {
  const name = 'Attack and combat damage triggers use unified flow';
  const attacker = testCard({
    id: 'ATTACK_FLOW_ATTACKER',
    fullName: 'Attack Flow Attacker',
    color: 'YELLOW',
    cardlocation: 'UNIT',
    damage: 1,
    baseDamage: 1,
    playedTurn: 1,
    effects: [{
      id: 'attack_declared_optional',
      type: 'TRIGGER',
      triggerEvent: 'CARD_ATTACK_DECLARED' as any,
      isMandatory: false,
      description: '攻击宣言选发',
      condition: (_gameState: any, _player: any, card: Card, event?: any) =>
        event?.type === 'CARD_ATTACK_DECLARED' && event.sourceCardId === card.gamecardId,
      execute: async (_card: Card, gameState: any) => {
        (gameState as any).attackTriggerResolved = true;
      }
    }, {
      id: 'combat_damage_optional',
      type: 'TRIGGER',
      triggerEvent: 'COMBAT_DAMAGE_CAUSED' as any,
      isMandatory: false,
      description: '战斗伤害选发',
      isGlobal: true,
      condition: (_gameState: any, _player: any, card: Card, event?: any) =>
        event?.type === 'COMBAT_DAMAGE_CAUSED' && event.data?.attackerIds?.includes(card.gamecardId),
      execute: async (_card: Card, gameState: any) => {
        (gameState as any).damageTriggerResolved = true;
      }
    } as any]
  });
  const state = game({
    unitZone: [attacker, null, null, null, null, null],
  }, {}, { phase: 'BATTLE_DECLARATION', turnCount: 6 });

  await ServerGameService.declareAttack(state, 'BOT', [attacker.gamecardId], false);
  if (!state.pendingQuery && state.phase === 'COUNTERING') {
    await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  }
  const askedAttack = state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE' &&
    state.pendingQuery.context?.sourceCardId === attacker.gamecardId;
  await answerPendingQuery(state, 'BOT', ['YES']);
  const attackResolved = (state as any).attackTriggerResolved === true;
  if (state.phase === 'COUNTERING') {
    await ServerGameService.passConfrontation(state, state.priorityPlayerId);
  }
  await ServerGameService.declareDefense(state, 'P1');
  state.phase = 'DAMAGE_CALCULATION';
  await ServerGameService.resolveDamage(state);
  const askedDamage = state.pendingQuery?.callbackKey === 'TRIGGER_CHOICE' &&
    state.pendingQuery.context?.sourceCardId === attacker.gamecardId;
  await answerPendingQuery(state, 'BOT', ['YES']);
  const damageResolved = (state as any).damageTriggerResolved === true;

  return askedAttack && attackResolved && askedDamage && damageResolved
    ? pass(name, `attack=${attackResolved}, damage=${damageResolved}`)
    : fail(name, `askedAttack=${askedAttack}, attack=${attackResolved}, askedDamage=${askedDamage}, damage=${damageResolved}, phase=${state.phase}, pending=${state.pendingQuery?.callbackKey || 'none'}`);
}

async function testAnnihilationAngelsCombatDamageTriggerFinishesBattle(): Promise<ScenarioResult> {
  const name = 'BT01-W09 Annihilation Angels trigger resolves after direct and annihilation battle damage';
  const directAngel = cloneScriptCard(annihilationAngels as Card, 'UNIT', {
    playedTurn: 1,
    damage: 2,
    baseDamage: 2,
  });
  const graveA = testCard({ id: 'ANGELS_GRAVE_A', fullName: 'Angels grave A', cardlocation: 'GRAVE' });
  const graveB = testCard({ id: 'ANGELS_GRAVE_B', fullName: 'Angels grave B', cardlocation: 'GRAVE' });
  const directState = game({
    grave: [graveA, graveB],
    erosionFront: [testCard({ id: 'ANGELS_EROSION_1', cardlocation: 'EROSION_FRONT' })],
    unitZone: [directAngel, null, null, null, null, null],
  }, {}, {
    phase: 'DAMAGE_CALCULATION',
    battleState: {
      attackers: [directAngel.gamecardId],
      isAlliance: false,
      resolvedUnitIds: [],
      battleId: 'angels_direct_battle',
    },
  });

  await ServerGameService.resolveDamage(directState);
  const directAsked = directState.pendingQuery?.context?.effectId === '101130104_damage_bottom';
  if (directAsked) {
    await ServerGameService.handleQueryChoice(directState, 'BOT', directState.pendingQuery.id, ['YES']);
  }
  if (directState.pendingQuery?.context?.effectId === '101130104_damage_bottom') {
    await ServerGameService.handleQueryChoice(directState, 'BOT', directState.pendingQuery.id, [graveA.gamecardId, graveB.gamecardId]);
  }
  const directFinished = directState.phase === 'MAIN' && !directState.battleState && !directState.pendingQuery;
  const directBottomed = directState.players.BOT.deck.some((card: Card) => card.gamecardId === graveA.gamecardId) &&
    directState.players.BOT.deck.some((card: Card) => card.gamecardId === graveB.gamecardId);

  const allianceAngel = cloneScriptCard(annihilationAngels as Card, 'UNIT', {
    playedTurn: 1,
    damage: 2,
    baseDamage: 2,
    isAnnihilation: false,
    baseAnnihilation: false,
  });
  const ally = testCard({
    id: 'ANGELS_ALLY',
    fullName: 'Angels Ally',
    cardlocation: 'UNIT',
    color: 'WHITE',
    power: 500,
    basePower: 500,
    damage: 1,
    baseDamage: 1,
    playedTurn: 1,
  });
  const defender = testCard({
    id: 'ANGELS_DEFENDER',
    fullName: 'Angels Defender',
    cardlocation: 'UNIT',
    power: 1000,
    basePower: 1000,
  });
  const graveC = testCard({ id: 'ANGELS_GRAVE_C', fullName: 'Angels grave C', cardlocation: 'GRAVE' });
  const graveD = testCard({ id: 'ANGELS_GRAVE_D', fullName: 'Angels grave D', cardlocation: 'GRAVE' });
  const annihilationState = game({
    grave: [graveC, graveD],
    erosionFront: [testCard({ id: 'ANGELS_EROSION_2', cardlocation: 'EROSION_FRONT' })],
    unitZone: [allianceAngel, ally, null, null, null, null],
  }, {
    unitZone: [defender, null, null, null, null, null],
  }, {
    phase: 'DAMAGE_CALCULATION',
    battleState: {
      attackers: [allianceAngel.gamecardId, ally.gamecardId],
      defender: defender.gamecardId,
      unitTargetId: defender.gamecardId,
      isAlliance: true,
      resolvedUnitIds: [],
      battleId: 'angels_annihilation_battle',
    },
  });
  allianceAngel.inAllianceGroup = true;
  ally.inAllianceGroup = true;
  EventEngine.recalculateContinuousEffects(annihilationState);

  await ServerGameService.resolveDamage(annihilationState);
  const annihilationAsked = annihilationState.pendingQuery?.context?.effectId === '101130104_damage_bottom';
  const annihilationDamage = annihilationState.players.P1.erosionFront.length === 2;
  if (annihilationAsked) {
    await ServerGameService.handleQueryChoice(annihilationState, 'BOT', annihilationState.pendingQuery.id, ['YES']);
  }
  if (annihilationState.pendingQuery?.context?.effectId === '101130104_damage_bottom') {
    await ServerGameService.handleQueryChoice(annihilationState, 'BOT', annihilationState.pendingQuery.id, [graveC.gamecardId, graveD.gamecardId]);
  }
  const annihilationFinished = annihilationState.phase === 'MAIN' && !annihilationState.battleState && !annihilationState.pendingQuery;
  const annihilationBottomed = annihilationState.players.BOT.deck.some((card: Card) => card.gamecardId === graveC.gamecardId) &&
    annihilationState.players.BOT.deck.some((card: Card) => card.gamecardId === graveD.gamecardId);

  const sacrificeAngel = cloneScriptCard(annihilationAngels as Card, 'UNIT', {
    playedTurn: 1,
    power: 2500,
    basePower: 2500,
    damage: 2,
    baseDamage: 2,
    isAnnihilation: false,
    baseAnnihilation: false,
  });
  const sacrificeAlly = testCard({
    id: 'ANGELS_SACRIFICE_ALLY',
    fullName: 'Angels Sacrifice Ally',
    cardlocation: 'UNIT',
    color: 'WHITE',
    power: 1000,
    basePower: 1000,
    damage: 1,
    baseDamage: 1,
    playedTurn: 1,
  });
  const sacrificeDefender = testCard({
    id: 'ANGELS_SACRIFICE_DEFENDER',
    fullName: 'Angels Sacrifice Defender',
    cardlocation: 'UNIT',
    power: 3000,
    basePower: 3000,
  });
  const graveE = testCard({ id: 'ANGELS_GRAVE_E', fullName: 'Angels grave E', cardlocation: 'GRAVE' });
  const graveF = testCard({ id: 'ANGELS_GRAVE_F', fullName: 'Angels grave F', cardlocation: 'GRAVE' });
  const sacrificeState = game({
    grave: [graveE, graveF],
    erosionFront: [testCard({ id: 'ANGELS_EROSION_3', cardlocation: 'EROSION_FRONT' })],
    unitZone: [sacrificeAngel, sacrificeAlly, null, null, null, null],
  }, {
    unitZone: [sacrificeDefender, null, null, null, null, null],
  }, {
    phase: 'DAMAGE_CALCULATION',
    battleState: {
      attackers: [sacrificeAngel.gamecardId, sacrificeAlly.gamecardId],
      defender: sacrificeDefender.gamecardId,
      unitTargetId: sacrificeDefender.gamecardId,
      isAlliance: true,
      resolvedUnitIds: [],
      battleId: 'angels_alliance_sacrifice_battle',
    },
  });
  sacrificeAngel.inAllianceGroup = true;
  sacrificeAlly.inAllianceGroup = true;
  EventEngine.recalculateContinuousEffects(sacrificeState);

  await ServerGameService.resolveDamage(sacrificeState);
  const askedSacrifice = sacrificeState.pendingQuery?.callbackKey === 'ALLIANCE_DESTRUCTION_RESOLVE';
  if (askedSacrifice) {
    await ServerGameService.handleQueryChoice(sacrificeState, 'BOT', sacrificeState.pendingQuery.id, [sacrificeAlly.gamecardId]);
  }
  const sacrificeAskedTrigger = sacrificeState.pendingQuery?.context?.effectId === '101130104_damage_bottom';
  const sacrificeDamage = sacrificeState.players.P1.erosionFront.length === 2;
  if (sacrificeAskedTrigger) {
    await ServerGameService.handleQueryChoice(sacrificeState, 'BOT', sacrificeState.pendingQuery.id, ['YES']);
  }
  if (sacrificeState.pendingQuery?.context?.effectId === '101130104_damage_bottom') {
    await ServerGameService.handleQueryChoice(sacrificeState, 'BOT', sacrificeState.pendingQuery.id, [graveE.gamecardId, graveF.gamecardId]);
  }
  const sacrificeFinished = sacrificeState.phase === 'MAIN' && !sacrificeState.battleState && !sacrificeState.pendingQuery;
  const sacrificeAngelSurvived = sacrificeState.players.BOT.unitZone.some((card: Card | null) => card?.gamecardId === sacrificeAngel.gamecardId);

  return directAsked && directFinished && directBottomed && annihilationAsked && annihilationDamage && annihilationFinished && annihilationBottomed &&
    askedSacrifice && sacrificeAskedTrigger && sacrificeDamage && sacrificeFinished && sacrificeAngelSurvived
    ? pass(name, `direct=${directFinished}/${directBottomed}, annihilation=${annihilationDamage}/${annihilationFinished}/${annihilationBottomed}, sacrifice=${sacrificeDamage}/${sacrificeFinished}`)
    : fail(name, `directAsked=${directAsked}, directFinished=${directFinished}, directBottomed=${directBottomed}, annihilationAsked=${annihilationAsked}, damage=${annihilationDamage}, annihilationFinished=${annihilationFinished}, annihilationBottomed=${annihilationBottomed}, askedSacrifice=${askedSacrifice}, sacrificeTrigger=${sacrificeAskedTrigger}, sacrificeDamage=${sacrificeDamage}, sacrificeFinished=${sacrificeFinished}, survived=${sacrificeAngelSurvived}, phase=${sacrificeState.phase}, pending=${sacrificeState.pendingQuery?.callbackKey || annihilationState.pendingQuery?.callbackKey || directState.pendingQuery?.callbackKey || 'none'}`);
}

async function testTyaHeroicAuraStopsOutsideZeroToThree(): Promise<ScenarioResult> {
  const name = 'BT03-W05 Tya heroic aura stops outside 0-3 erosion';
  const tyaUnit = cloneScriptCard(tya as Card, 'UNIT', { baseHeroic: false, isHeroic: false });
  const ally = testCard({
    id: 'TYA_ALLY',
    fullName: 'Tya Ally',
    cardlocation: 'UNIT',
    color: 'WHITE',
    godMark: false,
    baseHeroic: false,
    isHeroic: false,
    power: 1000,
    basePower: 1000,
    damage: 1,
    baseDamage: 1,
  });
  const godAlly = testCard({
    id: 'TYA_GOD_ALLY',
    fullName: 'Tya God Ally',
    cardlocation: 'UNIT',
    color: 'WHITE',
    godMark: true,
    baseHeroic: false,
    isHeroic: false,
    power: 1000,
    basePower: 1000,
    damage: 1,
    baseDamage: 1,
  });
  const state = game({
    erosionFront: [
      testCard({ id: 'TYA_EROSION_1', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'TYA_EROSION_2', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'TYA_EROSION_3', cardlocation: 'EROSION_FRONT' }),
    ],
    unitZone: [tyaUnit, ally, godAlly, null, null, null],
  });

  EventEngine.recalculateContinuousEffects(state);
  const auraActive =
    tyaUnit.isHeroic === true &&
    ally.isHeroic === true &&
    tyaUnit.power === 3000 &&
    ally.power === 1500 &&
    tyaUnit.damage === 3 &&
    ally.damage === 2 &&
    godAlly.isHeroic !== true &&
    godAlly.power === 1000 &&
    godAlly.damage === 1;

  state.players.BOT.erosionFront.push(testCard({ id: 'TYA_EROSION_4', cardlocation: 'EROSION_FRONT' }));
  EventEngine.recalculateContinuousEffects(state);
  const auraExpired =
    tyaUnit.isHeroic !== true &&
    ally.isHeroic !== true &&
    tyaUnit.power === 2500 &&
    ally.power === 1000 &&
    tyaUnit.damage === 2 &&
    ally.damage === 1;

  return auraActive && auraExpired
    ? pass(name, `active=${auraActive}, expired=${auraExpired}`)
    : fail(name, `active=${auraActive}, expired=${auraExpired}, tya=${tyaUnit.isHeroic}/${tyaUnit.power}/${tyaUnit.damage}, ally=${ally.isHeroic}/${ally.power}/${ally.damage}, god=${godAlly.isHeroic}/${godAlly.power}/${godAlly.damage}`);
}

async function testMandatoryEndTurnOrderWithValkyrieAndGreatAlchemist(): Promise<ScenarioResult> {
  const name = 'Mandatory end triggers ask order for Valkyrie Zero Forbidden Alchemy and Great Alchemist loss';
  const zero = cloneScriptCard(valkyrieZero as Card, 'UNIT');
  const alchemist = cloneScriptCard(greatAlchemist as Card, 'UNIT');
  const forbiddenSource = cloneScriptCard(forbiddenAlchemy as Card, 'GRAVE');
  const forbiddenTarget = testCard({ id: 'FORBIDDEN_ZERO_TARGET', fullName: 'Forbidden Zero target', type: 'UNIT', color: 'RED', cardlocation: 'UNIT', colorReq: {}, power: 1000, basePower: 1000 });
  (zero as any).data = { enteredGoddessTurn_105110114: 6 };
  (forbiddenTarget as any).data = {
    returnToExileAtEndTurn: 6,
    returnToExileSourceName: forbiddenSource.fullName,
    returnToExileSourceCardId: forbiddenSource.gamecardId,
    returnToExileEffectOwnerUid: 'BOT'
  };
  const state = game({
    grave: [forbiddenSource],
    unitZone: [zero, alchemist, forbiddenTarget, null, null, null],
    isGoddessMode: true,
    loseAtEndOfTurn: 6,
    loseAtEndOfTurnSourceName: alchemist.fullName,
    loseAtEndOfTurnSourceCardId: alchemist.gamecardId,
  }, {}, { phase: 'END', turnCount: 6 });

  EventEngine.dispatchEvent(state, { type: 'TURN_END' as any, playerUid: 'BOT' });
  ServerGameService.enqueueMandatoryEndTurnDelayedEffects(state, 'BOT');
  await ServerGameService.checkTriggeredEffects(state);

  const askedOrder = state.pendingQuery?.callbackKey === 'TRIGGER_ORDER_CHOICE' &&
    state.pendingQuery.playerUid === 'BOT' &&
    state.pendingQuery.context?.mandatory === true;
  const optionDetails = (state.pendingQuery?.options || []).map((option: any) => `${option.id}:${option.label}:${option.detail}`).join('|');
  const hasZero = /瓦尔基里/.test(optionDetails);
  const hasForbidden = /禁忌炼金/.test(optionDetails);
  const hasLoss = /大炼金术士/.test(optionDetails);

  return askedOrder && hasZero && hasForbidden && hasLoss
    ? pass(name, optionDetails)
    : fail(name, `asked=${askedOrder}, options=${optionDetails}`);
}

async function testTriggerOrderAcceptsDisplayedCardIds(): Promise<ScenarioResult> {
  const name = 'Trigger order accepts displayed card ids for Forbidden Alchemy and Great Alchemist';
  const alchemist = cloneScriptCard(greatAlchemist as Card, 'UNIT');
  const forbiddenSource = cloneScriptCard(forbiddenAlchemy as Card, 'GRAVE');
  const forbiddenTarget = testCard({ id: 'FORBIDDEN_DISPLAY_TARGET', fullName: 'Forbidden display target', type: 'UNIT', color: 'RED', cardlocation: 'UNIT', colorReq: {}, power: 1000, basePower: 1000 });
  (forbiddenTarget as any).data = {
    returnToExileAtEndTurn: 6,
    returnToExileSourceName: forbiddenSource.fullName,
    returnToExileSourceCardId: forbiddenSource.gamecardId,
    returnToExileEffectOwnerUid: 'BOT'
  };
  const state = game({
    grave: [forbiddenSource],
    unitZone: [alchemist, forbiddenTarget, null, null, null, null],
    loseAtEndOfTurn: 6,
    loseAtEndOfTurnSourceName: alchemist.fullName,
    loseAtEndOfTurnSourceCardId: alchemist.gamecardId,
  }, {}, { phase: 'END', turnCount: 6 });

  ServerGameService.enqueueMandatoryEndTurnDelayedEffects(state, 'BOT');
  await ServerGameService.checkTriggeredEffects(state);

  const askedOrder = state.pendingQuery?.callbackKey === 'TRIGGER_ORDER_CHOICE';
  await answerPendingQuery(state, 'BOT', [forbiddenSource.gamecardId]);
  const forbiddenResolved = state.players.BOT.exile.some((card: Card) => card.gamecardId === forbiddenTarget.gamecardId);

  await ServerGameService.checkTriggeredEffects(state);
  if (state.pendingQuery?.callbackKey === 'TRIGGER_ORDER_CHOICE') {
    await answerPendingQuery(state, 'BOT', [alchemist.gamecardId]);
  }
  const lossResolved = state.gameStatus === 2 && state.winnerId === 'P1';

  return askedOrder && forbiddenResolved && lossResolved
    ? pass(name, `forbidden=${forbiddenResolved}, loss=${lossResolved}`)
    : fail(name, `asked=${askedOrder}, forbidden=${forbiddenResolved}, loss=${lossResolved}, pending=${state.pendingQuery?.callbackKey || 'none'}, logs=${state.logs.slice(-5).join(' / ')}`);
}

async function testSerializedVirtualEndTriggersResolve(): Promise<ScenarioResult> {
  const name = 'Serialized virtual end triggers still resolve Forbidden Alchemy and Great Alchemist';
  const alchemist = cloneScriptCard(greatAlchemist as Card, 'UNIT');
  const forbiddenSource = cloneScriptCard(forbiddenAlchemy as Card, 'GRAVE');
  const forbiddenTarget = testCard({ id: 'FORBIDDEN_SERIALIZED_TARGET', fullName: 'Forbidden serialized target', type: 'UNIT', color: 'RED', cardlocation: 'UNIT', colorReq: {}, power: 1000, basePower: 1000 });
  (forbiddenTarget as any).data = {
    returnToExileAtEndTurn: 6,
    returnToExileSourceName: forbiddenSource.fullName,
    returnToExileSourceCardId: forbiddenSource.gamecardId,
    returnToExileEffectOwnerUid: 'BOT',
    returnToExileAtEndPredicateKey: 'STILL_IN_UNIT'
  };
  const state = game({
    grave: [forbiddenSource],
    unitZone: [alchemist, forbiddenTarget, null, null, null, null],
    loseAtEndOfTurn: 6,
    loseAtEndOfTurnSourceName: alchemist.fullName,
    loseAtEndOfTurnSourceCardId: alchemist.gamecardId,
    loseAtEndOfTurnSourceCardSnapshot: { ...alchemist },
  }, {}, { phase: 'END', turnCount: 6 });

  ServerGameService.enqueueMandatoryEndTurnDelayedEffects(state, 'BOT');
  await ServerGameService.checkTriggeredEffects(state);
  const askedOrder = state.pendingQuery?.callbackKey === 'TRIGGER_ORDER_CHOICE';

  const rehydrated = JSON.parse(JSON.stringify(state));
  ServerGameService.hydrateGameState(rehydrated);
  await answerPendingQuery(rehydrated, 'BOT', [forbiddenSource.gamecardId]);
  const exiledForbidden = rehydrated.players.BOT.exile.find((card: Card) => card.gamecardId === forbiddenTarget.gamecardId);
  const forbiddenResolved = !!exiledForbidden && exiledForbidden.displayState === 'FRONT_UPRIGHT';

  await ServerGameService.checkTriggeredEffects(rehydrated);
  const rehydratedAgain = JSON.parse(JSON.stringify(rehydrated));
  ServerGameService.hydrateGameState(rehydratedAgain);
  if (rehydratedAgain.pendingQuery?.callbackKey === 'TRIGGER_ORDER_CHOICE') {
    await answerPendingQuery(rehydratedAgain, 'BOT', [alchemist.gamecardId]);
  }
  const lossResolved = rehydratedAgain.gameStatus === 2 && rehydratedAgain.winnerId === 'P1';
  const sourceNameKept = rehydratedAgain.winSourceCardName === alchemist.fullName;

  return askedOrder && forbiddenResolved && lossResolved && sourceNameKept
    ? pass(name, `forbidden=${forbiddenResolved}/${exiledForbidden?.displayState}, loss=${lossResolved}, source=${rehydratedAgain.winSourceCardName}`)
    : fail(name, `asked=${askedOrder}, forbidden=${forbiddenResolved}/${exiledForbidden?.displayState || 'none'}, loss=${lossResolved}, source=${rehydratedAgain.winSourceCardName || 'none'}, pending=${rehydratedAgain.pendingQuery?.callbackKey || 'none'}`);
}

const scenarios: ScenarioRun[] = [
  testCorielEndSearch,
  testCorielStoryCheatUnit,
  testDawnFollowerDrawsWhenExiledForShingiCost,
  testWakaEnterSearchesShingiStory,
  testKuriRevivesAfterLeavingField,
  testKuriTenPlusPreventsDamage,
  testBishopAuraAndDawnFollowers,
  testChantSingerReadiesOnOpponentAttack,
  testChantSingerCannotBeBattleDestroyedByPower2500OrLess,
  testDevotionProtectsFromOpponentLeaveEffect,
  testAngelAdventPlacesShingiMarkedUnit,
  testDawnRitualPlacesGoddessChurchAc3,
  testPrayerSearchesKeyUnit,
  testLivianLeaveAndCounterWhenShingiPlaced,
  testBlueWealthCounterAndLogistics,
  testBlueWealthCountUsesContinuousOnly,
  testTradeExpertPreventsThisBattleDestroy,
  testBlueAketiTeteruAndRecord,
  testAketiErosionPlayCountsExtraUnitColors,
  testBlueUntilNextOwnTurnStartLocksExpireOnOwnStart,
  testBlueCheckLetsOpponentPayOrCounters,
  testBlueSheathAndFuka,
  testGreenResonanceDrawBoostAndSearch,
  testGreenBirdSalalaAndAccordion,
  testCannotExhaustUnitIsNotAvailableDefender,
  testGreenStoriesAndChimera,
  testRedDikaiTrackExplore,
  testRedBatsBetisAndGiantBat,
  testRedTrainerLockAndCelia,
  testYellowPartsHickAndValkyrie,
  testYellowHighAlchemyChipAndGiant,
  testAcademyFeijingMerchantLeaveTrigger,
  testDivineAlchemyDamageAndEndsTurn,
  testGreatAlchemistLoseAtEndOfTurn,
  testGreatAlchemistLoseAfterLeavingField,
  testElmontEnterTriggerIsOptional,
  testYellowDailyBlueprintTruthAndIly,
  testYellowChocolate,
  testEndTurnTriggerBucketOrder,
  testSameBucketTriggerOrderChoice,
  testNonEndTriggerBucketsUseUnifiedOrder,
  testMainPhaseStartTriggersBeforeActions,
  testAttackAndDamageTriggersUseUnifiedFlow,
  testAnnihilationAngelsCombatDamageTriggerFinishesBattle,
  testTyaHeroicAuraStopsOutsideZeroToThree,
  testMandatoryEndTurnOrderWithValkyrieAndGreatAlchemist,
  testTriggerOrderAcceptsDisplayedCardIds,
  testSerializedVirtualEndTriggersResolve,
];

async function main() {
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    try {
      results.push(await scenario());
    } catch (error: any) {
      results.push({
        name: scenario.name,
        passed: false,
        detail: error?.stack || error?.message || String(error),
      });
    }
  }

  results.forEach(result => {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}: ${result.detail}`);
  });

  const passed = results.filter(result => result.passed).length;
  console.log(`\nBT06 scenarios: ${passed}/${results.length} passed`);
  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

main();
