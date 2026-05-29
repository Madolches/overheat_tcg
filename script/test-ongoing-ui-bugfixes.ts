import { ServerGameService } from '../server/ServerGameService';
import { EventEngine } from '../src/services/EventEngine';
import { GameService } from '../src/services/gameService';
import { Card, GameState, PlayerState, TriggerLocation } from '../src/types/game';
import { getPlayerOngoingEffects } from '../src/lib/playerOngoingEffects';
import tami from '../src/scripts/102060373';
import thunderPriest from '../src/scripts/102060321';
import sprout from '../src/scripts/203000074';
import cord from '../src/scripts/105000406';
import bahamut from '../src/scripts/105000407';
import crowQueen from '../src/scripts/105000408';

let seq = 0;

const nextId = (prefix: string) => `${prefix}_${++seq}`;

const cloneCard = (base: Card, location: TriggerLocation, overrides: Partial<Card> = {}): Card => ({
  ...base,
  uniqueId: overrides.uniqueId || `${base.id}:TEST`,
  gamecardId: overrides.gamecardId || nextId(base.id),
  cardlocation: location,
  colorReq: { ...(base.colorReq || {}) },
  baseColorReq: { ...(base.baseColorReq || base.colorReq || {}) },
  effects: [...(overrides.effects || base.effects || [])],
  displayState: overrides.displayState || base.displayState || 'FRONT_UPRIGHT',
  isExhausted: overrides.isExhausted ?? base.isExhausted ?? false,
  ...overrides
} as Card);

const testCard = (overrides: Partial<Card> = {}): Card => {
  const id = overrides.id || nextId('CARD');
  return {
    id,
    uniqueId: overrides.uniqueId || `${id}:TEST`,
    gamecardId: overrides.gamecardId || nextId(id),
    fullName: overrides.fullName || id,
    specialName: overrides.specialName || '',
    type: overrides.type || 'UNIT',
    color: overrides.color || 'RED',
    cardlocation: overrides.cardlocation || 'DECK',
    colorReq: overrides.colorReq || {},
    baseColorReq: overrides.baseColorReq || overrides.colorReq || {},
    acValue: overrides.acValue ?? 2,
    baseAcValue: overrides.baseAcValue ?? overrides.acValue ?? 2,
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
    ...overrides
  } as Card;
};

const player = (uid: string, overrides: Partial<PlayerState> = {}): PlayerState => ({
  uid,
  displayName: uid,
  deck: [],
  hand: [],
  grave: [],
  exile: [],
  unitZone: [null, null, null, null, null, null],
  itemZone: [],
  erosionFront: [],
  erosionBack: [],
  playZone: [],
  isTurn: uid === 'BOT',
  isFirst: false,
  mulliganDone: true,
  hasExhaustedThisTurn: [],
  timeRemaining: 999,
  ...overrides
});

const makeGame = (botOverrides: Partial<PlayerState> = {}, opponentOverrides: Partial<PlayerState> = {}, stateOverrides: Partial<GameState> = {}) => {
  const bot = player('BOT', botOverrides);
  const opponent = player('P1', { isTurn: false, ...opponentOverrides });
  return {
    gameId: nextId('bugfix'),
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
    ...stateOverrides
  } as GameState;
};

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const testThunderPriestDiscount = () => {
  const priest = cloneCard(thunderPriest, 'UNIT');
  const handCard = testCard({
    id: 'THUNDER_HAND',
    fullName: '雷霆手牌单位',
    type: 'UNIT',
    faction: '雷霆',
    acValue: 4,
    baseAcValue: 4,
    cardlocation: 'HAND'
  });
  const redUnit = testCard({
    id: 'RED_HAND_UNIT',
    fullName: '红色非神蚀单位',
    type: 'UNIT',
    color: 'RED',
    godMark: false,
    acValue: 4,
    baseAcValue: 4,
    cardlocation: 'HAND'
  });
  const redStory = testCard({
    id: 'RED_HAND_STORY',
    fullName: '红色故事卡',
    type: 'STORY',
    color: 'RED',
    godMark: false,
    acValue: 4,
    baseAcValue: 4,
    cardlocation: 'HAND'
  });
  const state = makeGame({
    unitZone: [priest, null, null, null, null, null],
    hand: [handCard, redUnit, redStory]
  });
  (state.players.BOT as any)[`soulDevourActivatedTurn_${state.turnCount}`] = 2;

  const details = GameService.getEffectivePlayCostDetails(state, state.players.BOT, handCard);
  assert(details.cost === 2, `expected effective cost 2, got ${details.cost}`);
  assert(details.sourceCardName === '炎雷祭司', `expected source 炎雷祭司, got ${details.sourceCardName}`);
  assert(GameService.getEffectivePlayCostDetails(state, state.players.BOT, redUnit).cost === 2, 'red non-god unit should be discounted');
  assert(GameService.getEffectivePlayCostDetails(state, state.players.BOT, redStory).cost === 4, 'red story should not be discounted');

  const effects = getPlayerOngoingEffects(state, 'BOT');
  assert(
    effects.some(effect => effect.sourceCardName === '炎雷祭司' && effect.description.includes('红色非神蚀单位卡ACCESS值-2')),
    `expected global ongoing discount ACCESS值-2, got ${effects.map(effect => effect.description).join(' | ')}`
  );
};

const testErosionChoiceLogsCardNames = () => {
  const chosen = testCard({ id: 'EROSION_PICK', fullName: '被加入手牌的卡', cardlocation: 'EROSION_FRONT' });
  const grave = testCard({ id: 'EROSION_GRAVE', fullName: '被送墓的卡', cardlocation: 'EROSION_FRONT' });
  const topDeck = testCard({ id: 'DECK_BACK', fullName: '背面补充卡', cardlocation: 'DECK' });
  const state = makeGame({
    deck: [topDeck],
    erosionFront: [chosen, grave]
  }, {}, { phase: 'EROSION' });

  ServerGameService.executeErosionMovements(state, 'BOT', 'C', chosen.gamecardId);
  assert(state.players.BOT.hand.some(card => card.gamecardId === chosen.gamecardId), 'chosen erosion card should move to hand');
  assert(state.players.BOT.erosionBack.some(card => card?.gamecardId === topDeck.gamecardId), 'top deck card should move to erosion back');
  const logText = state.logs.join('\n');
  assert(logText.includes('[被加入手牌的卡]'), `expected chosen card name in log, got ${logText}`);
  assert(logText.includes('[背面补充卡]'), `expected face-down card name in log, got ${logText}`);
};

const testFinalizeBattleAfterPendingQueryClearsMarkers = async () => {
  const attacker = testCard({ id: 'ATTACKER', fullName: '攻击单位', cardlocation: 'UNIT' });
  const defender = testCard({ id: 'DEFENDER', fullName: '防御单位', cardlocation: 'UNIT' });
  (attacker as any).isAttacking = true;
  (defender as any).isDefending = true;
  const state = makeGame({
    unitZone: [attacker, null, null, null, null, null]
  }, {
    unitZone: [defender, null, null, null, null, null]
  }, {
    phase: 'DAMAGE_CALCULATION',
    battleState: {
      attackers: [attacker.gamecardId],
      defender: defender.gamecardId,
      isAlliance: false
    } as any
  });
  state.pendingQuery = {
    id: 'pending',
    type: 'SELECT_CHOICE',
    playerUid: 'BOT',
    options: [],
    title: 'pending',
    description: 'pending',
    minSelections: 0,
    maxSelections: 1
  } as any;

  ServerGameService.rememberBattleEndAfterPendingQuery(state, 'BOT');
  state.pendingQuery = undefined;
  await ServerGameService.finalizeBattleAfterPendingQuery(state);

  assert(!state.battleState, 'battleState should be cleared after pending query finalization');
  assert((attacker as any).isAttacking === false, 'attacker marker should be cleared');
  assert((defender as any).isDefending === false, 'defender marker should be cleared');
};

const testTamiShowsUnitsSentCount = () => {
  const card = cloneCard(tami, 'UNIT');
  const state = makeGame({
    unitZone: [card, null, null, null, null, null]
  });
  (state as any)[`unitsSentFromFieldToGraveTurn_${state.turnCount}_global`] = 3;

  EventEngine.recalculateContinuousEffects(state);

  assert(
    card.influencingEffects?.some(effect =>
      effect.sourceCardName === card.fullName &&
      effect.description === '本回合从战场送入墓地的单位数量：3'
    ),
    `expected Tami influenced by sent count, got ${card.influencingEffects?.map(effect => effect.description).join(' | ')}`
  );
};

const testSproutRequiresValidGraveTarget = () => {
  const card = cloneCard(sprout, 'HAND', {
    acValue: 0,
    baseAcValue: 0,
    colorReq: {},
    baseColorReq: {}
  });
  const state = makeGame({
    hand: [card],
    deck: [testCard({ id: 'PAY_A' })]
  });

  const withoutTarget = GameService.canPlayCard(state, state.players.BOT, card);
  assert(!withoutTarget.canPlay, 'Sprout should not be playable without a legal grave target');
  const serverWithoutTarget = ServerGameService.canPlayCard(state, state.players.BOT, card);
  assert(!serverWithoutTarget.canPlay, 'Server Sprout check should reject without a legal grave target');

  const target = testCard({
    id: 'SPROUT_TARGET',
    fullName: '新芽对象',
    type: 'UNIT',
    godMark: true,
    power: 2000,
    basePower: 2000,
    cardlocation: 'GRAVE'
  });
  state.players.BOT.grave.push(target);
  const withTarget = GameService.canPlayCard(state, state.players.BOT, card);
  assert(withTarget.canPlay, `Sprout should be playable with a legal grave target, got ${withTarget.reason}`);
  const serverWithTarget = ServerGameService.canPlayCard(state, state.players.BOT, card);
  assert(serverWithTarget.canPlay, `Server Sprout check should allow a legal grave target, got ${serverWithTarget.reason}`);
};

const testAlchemyBeastsArePlayerOngoingEffects = () => {
  const kode = cloneCard(cord, 'UNIT', {
    data: { enteredFromDeckByAlchemyTurn: 6, highAlchemyMaterialColors: ['RED'] }
  } as any);
  const baha = cloneCard(bahamut, 'UNIT', {
    data: { enteredFromDeckByAlchemyTurn: 6, highAlchemyMaterialColors: ['WHITE'] }
  } as any);
  const crow = cloneCard(crowQueen, 'UNIT', {
    data: { enteredFromDeckByAlchemyTurn: 6, highAlchemyMaterialColors: ['GREEN'] }
  } as any);
  const defender = testCard({
    id: 'ALCHEMY_DEFENDER',
    fullName: '炼金测试防御者',
    type: 'UNIT',
    godMark: false,
    cardlocation: 'UNIT'
  });
  const lost = testCard({
    id: 'ALCHEMY_LOST',
    fullName: '炼金测试离场卡',
    type: 'UNIT',
    cardlocation: 'UNIT'
  });
  const state = makeGame({
    unitZone: [kode, baha, crow, null, null, null],
    erosionFront: [
      testCard({ id: 'EROSION_A', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'EROSION_B', cardlocation: 'EROSION_FRONT' }),
      testCard({ id: 'EROSION_C', cardlocation: 'EROSION_FRONT' })
    ]
  }, {
    unitZone: [defender, lost, null, null, null, null]
  }, {
    phase: 'DEFENSE_DECLARATION',
    battleState: {
      attackers: [kode.gamecardId],
      isAlliance: false
    } as any
  });

  EventEngine.recalculateContinuousEffects(state);

  const ownEffects = getPlayerOngoingEffects(state, 'BOT');
  const opponentEffects = getPlayerOngoingEffects(state, 'P1');

  assert(
    ownEffects.some(effect => effect.sourceCardName === '炼金幻兽「巴哈姆特」' && effect.description.includes('不会被战斗破坏')),
    `expected Bahamut in own global panel, got ${ownEffects.map(effect => `${effect.sourceCardName}:${effect.description}`).join(' | ')}`
  );
  assert(
    opponentEffects.some(effect => effect.sourceCardName === '炼金幻兽「寇德」' && effect.description.includes('不能用非神蚀单位防御')),
    `expected Cord in opponent global panel, got ${opponentEffects.map(effect => `${effect.sourceCardName}:${effect.description}`).join(' | ')}`
  );
  assert(
    opponentEffects.some(effect => effect.sourceCardName === '炼金幻兽「鸦女王」' && effect.description.includes('改为放逐')),
    `expected Crow Queen in opponent global panel, got ${opponentEffects.map(effect => `${effect.sourceCardName}:${effect.description}`).join(' | ')}`
  );
  assert((defender as any).data?.cannotDefendTurn === state.turnCount, 'Cord should mark non-god opponent units as unable to defend this battle');
  assert((lost as any).data?.exileWhenLeavesFieldSourceCardId === crow.gamecardId, 'Crow Queen should mark opponent field cards for exile replacement');
};

const run = async () => {
  testThunderPriestDiscount();
  testErosionChoiceLogsCardNames();
  await testFinalizeBattleAfterPendingQueryClearsMarkers();
  testTamiShowsUnitsSentCount();
  testSproutRequiresValidGraveTarget();
  testAlchemyBeastsArePlayerOngoingEffects();
};

run().then(() => {
  console.log('ongoing UI bugfix scenarios passed');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
