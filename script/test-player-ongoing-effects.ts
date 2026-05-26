import { GameState, PlayerState, Card } from '../src/types/game';
import { getPlayerOngoingEffects } from '../src/lib/playerOngoingEffects';
import salala from '../src/scripts/103000426';
import dikai from '../src/scripts/102050432';
import rafa from '../src/scripts/102060244';
import yadila from '../src/scripts/102000199';
import celia from '../src/scripts/102050427';
import mart from '../src/scripts/105110160';
import wealthUnit from '../src/scripts/104020410';
import whiteTailHouse from '../src/scripts/304020050';

const cloneCard = (card: Card, gamecardId: string, location: Card['cardlocation'] = 'UNIT'): Card => ({
  ...card,
  gamecardId,
  uniqueId: `${card.id}_${gamecardId}`,
  cardlocation: location,
  effects: card.effects,
  data: { ...((card as any).data || {}) } as any
} as Card);

const emptyPlayer = (uid: string, displayName: string): PlayerState => ({
  uid,
  displayName,
  deck: [],
  hand: [],
  grave: [],
  exile: [],
  itemZone: [],
  erosionFront: [],
  erosionBack: [],
  unitZone: [null, null, null, null, null, null],
  playZone: [],
  isTurn: false,
  isFirst: false,
  mulliganDone: true,
  hasExhaustedThisTurn: [],
  timeRemaining: 300
});

const makeGame = () => {
  const p1 = emptyPlayer('p1', 'P1');
  const p2 = emptyPlayer('p2', 'P2');
  return {
    gameId: 'test',
    phase: 'MAIN',
    currentTurnPlayer: 0,
    turnCount: 1,
    isCountering: 0,
    counterStack: [],
    triggeredEffectsQueue: [],
    pendingResolutions: [],
    passCount: 0,
    playerIds: ['p1', 'p2'],
    gameStatus: 1,
    logs: [],
    players: { p1, p2 }
  } as GameState;
};

const descriptions = (game: GameState, uid: string) =>
  getPlayerOngoingEffects(game, uid).map(effect => `${effect.sourceCardName}:${effect.description}`);

const assertIncludes = (name: string, list: string[], text: string) => {
  if (!list.some(item => item.includes(text))) {
    throw new Error(`${name} missing ${text}. Got: ${list.join(' | ')}`);
  }
};

const assertExcludes = (name: string, list: string[], text: string) => {
  if (list.some(item => item.includes(text))) {
    throw new Error(`${name} should exclude ${text}. Got: ${list.join(' | ')}`);
  }
};

const run = () => {
  const game = makeGame();
  const p1 = game.players.p1;
  const p2 = game.players.p2;

  p1.unitZone[0] = cloneCard(salala, 'salala');
  p1.unitZone[1] = cloneCard(dikai, 'dikai');
  p1.unitZone[2] = cloneCard(rafa, 'rafa');
  p1.unitZone[3] = cloneCard(yadila, 'yadila');
  p1.unitZone[4] = cloneCard(celia, 'celia');
  p1.unitZone[5] = cloneCard(mart, 'mart');

  p2.unitZone[0] = cloneCard(wealthUnit, 'wealth');
  p2.erosionFront = [cloneCard(whiteTailHouse, 'erosion-a', 'EROSION_FRONT'), cloneCard(whiteTailHouse, 'erosion-b', 'EROSION_FRONT'), cloneCard(whiteTailHouse, 'erosion-c', 'EROSION_FRONT')];
  (p2.unitZone[0] as any).data = {
    grantedWealthValue: 1,
    grantedWealthSourceName: whiteTailHouse.fullName,
    grantedWealthSourceCardId: 'white-tail-house'
  };

  p1.snowstormTurn = game.turnCount;
  p1.snowstormSourceName = '暴风雪';
  p2.snowstormTurn = game.turnCount;
  p2.snowstormSourceName = '暴风雪';

  const p1Effects = descriptions(game, 'p1');
  const p2Effects = descriptions(game, 'p2');

  assertIncludes('p1', p1Effects, '你的战场上只能有1个神蚀单位');
  assertIncludes('p2', p2Effects, '所有对手只能在他自己的回合中使用故事卡');
  assertIncludes('p1', p1Effects, '处理将你的单位力量值上升的卡效果时');
  assertIncludes('p1', p1Effects, '所有卡失去');
  assertIncludes('p2', p2Effects, '所有卡失去');
  assertIncludes('p1', p1Effects, '暴风雪');
  assertIncludes('p2', p2Effects, '暴风雪');
  assertIncludes('p2', p2Effects, '白尾之家');

  assertExcludes('p1', p1Effects, '你的所有参与攻击的单位力量上升');
  assertExcludes('p1', p1Effects, '那个单位ACCESS+5以上');
};

run();
console.log('player ongoing effects scenarios passed');
