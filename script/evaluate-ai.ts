import fs from 'fs';
import path from 'path';
import { decodeDeckShareCode } from '../src/lib/deckShareCode';
import { AiDecisionLog, Card, GameState } from '../src/types/game';
import { summarizeCardKnowledge } from '../server/ai/cardKnowledge';
import { AI_DECK_PROFILES } from '../server/ai/deckProfiles';
import { DeckAiProfile } from '../server/ai/types';
import { chooseMulliganCards, scoreCardValue } from '../server/ai/hardStrategy';
import { initServerCardLibrary, loadServerCards, SERVER_CARD_LIBRARY } from '../server/card_loader';
import { ServerGameService } from '../server/ServerGameService';

type Seat = 0 | 1;

interface MatchResult {
  gameId: string;
  deckA: string;
  deckB: string;
  first: string;
  winner: string | null;
  winnerDeck: string | null;
  winReason: string;
  turnCount: number;
  steps: number;
  finalPhase: string;
  activePlayer?: string;
  pendingQuery?: {
    type: string;
    playerUid: string;
    title: string;
    callbackKey: string;
    options: number;
  };
  finalBoard: ReturnType<typeof describeBoard>;
  lastLogs: string[];
  aiDecisionLogs: AiDecisionLog[];
  decisionStats: Record<string, number>;
  deckDecisionStats: Record<string, DeckDecisionStats>;
  diagnosis: MatchDiagnosis;
  error?: string;
}

interface DeckDecisionStats {
  actions: Record<string, number>;
  effectActivations: Record<string, number>;
  effectFailures: Record<string, number>;
  failureReasons: Record<string, number>;
  queryFailures: number;
  attacks: number;
  turnsSeen: number[];
}

interface MatchDiagnosis {
  code: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  tags?: string[];
  metrics?: Record<string, number>;
}

interface EvaluationLimits {
  maxSteps: number;
  maxTurns: number;
}

const argValue = (name: string, fallback: number) => {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const parsed = Number(raw.split('=')[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const argString = (name: string) => {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : undefined;
};

const gamesPerSide = argValue('games', 1);
const maxSteps = argValue('maxSteps', 800);
const maxTurns = argValue('maxTurns', 40);
const matchLimit = argValue('matchLimit', Number.POSITIVE_INFINITY);
const matchOffset = argValue('matchOffset', 0);
const stepTimeoutMs = argValue('stepTimeoutMs', 5000);
const decisionLogLimit = argValue('decisionLogLimit', 160);
const deckFilter = argString('deck') || argString('deckId');

function uniqueCatalogRefs(cards: Card[]) {
  return cards.map(card => card.uniqueId).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function resolveDeck(profile: DeckAiProfile, catalogRefs: string[]) {
  if (!profile.shareCode) throw new Error(`Profile ${profile.id} is missing a share code`);
  const refs = decodeDeckShareCode(profile.shareCode, catalogRefs);
  const cards = refs.map(ref => SERVER_CARD_LIBRARY[ref]).filter(Boolean);
  if (cards.length !== refs.length) {
    throw new Error(`${profile.displayName} contains cards that are missing from the server library`);
  }
  const validation = ServerGameService.validateDeck(cards);
  if (!validation.valid) {
    throw new Error(`${profile.displayName} is not a valid deck: ${validation.error}`);
  }
  return cards;
}

async function createSelfPlayGame(
  profileA: DeckAiProfile,
  deckA: Card[],
  profileB: DeckAiProfile,
  deckB: Card[],
  firstSeat: Seat,
  gameIndex: number
) {
  const uidA = `AI_${profileA.id}`;
  const uidB = `AI_${profileB.id}`;
  const firstUid = firstSeat === 0 ? uidA : uidB;
  const state = await ServerGameService.createMatchGameState(uidA, deckA, uidB, deckB, 999);

  state.gameId = `ai_eval_${profileA.id}_vs_${profileB.id}_${firstSeat}_${gameIndex}`;
  state.mode = 'ai-selfplay';
  (state as any).skipResolutionDelay = true;
  state.phase = 'MULLIGAN';
  state.rps = undefined;
  state.firstPlayerChoice = undefined;
  state.turnCount = 0;
  state.currentTurnPlayer = firstSeat;
  state.logs = [];
  state.aiDecisionLogs = [];
  state.botDifficulty = 'hard';
  state.botDeckProfiles = {
    [uidA]: profileA.id,
    [uidB]: profileB.id,
  };

  for (const [uid, profile] of [[uidA, profileA], [uidB, profileB]] as const) {
    const player = state.players[uid];
    player.displayName = profile.displayName;
    player.mulliganDone = false;
    player.isFirst = uid === firstUid;
    player.isTurn = uid === firstUid;
    player.confrontationStrategy = 'AUTO';
    player.botDifficulty = 'hard';
    player.botDeckProfileId = profile.id;
  }

  for (const [uid, profile] of [[uidA, profileA], [uidB, profileB]] as const) {
    const player = state.players[uid];
    const returned = chooseMulliganCards(player, profile, 'hard');
    ServerGameService.recordAiDecision(state, uid, {
      action: 'MULLIGAN',
      subject: returned.length > 0 ? `${returned.length} cards` : 'keep',
      reason: 'Self-play hard AI uses deck profile to replace slow or unsupported opening cards before the game starts.',
      details: {
        returned: returned.length,
        handSize: player.hand.length,
        kept: player.hand.length - returned.length,
      },
      candidates: returned.slice(0, 4).map(card => ({
        name: ServerGameService.getAiCardName(card),
        score: scoreCardValue(card, profile),
      })),
    });
    await ServerGameService.performMulligan(state, returned.map(card => card.gamecardId), uid);
  }

  return state;
}

function currentTurnUid(state: GameState) {
  return state.playerIds[state.currentTurnPlayer];
}

function opponentUid(state: GameState, uid: string) {
  return state.playerIds.find(playerUid => playerUid !== uid)!;
}

function getActiveBotUid(state: GameState) {
  if (state.pendingQuery) return state.pendingQuery.playerUid;
  if (state.phase === 'COUNTERING') return state.priorityPlayerId;
  if (state.phase === 'SHENYI_CHOICE') return state.priorityPlayerId;
  if (state.phase === 'DEFENSE_DECLARATION') return opponentUid(state, currentTurnUid(state));
  if (state.phase === 'BATTLE_FREE' && state.battleState?.askConfront === 'ASKING_OPPONENT') {
    return opponentUid(state, currentTurnUid(state));
  }
  return currentTurnUid(state);
}

function getProgressFingerprint(state: GameState) {
  return JSON.stringify({
    phase: state.phase,
    turnCount: state.turnCount,
    currentTurnPlayer: state.currentTurnPlayer,
    pendingQuery: state.pendingQuery?.id,
    priorityPlayerId: state.priorityPlayerId,
    stack: state.counterStack?.length || 0,
    winnerId: state.winnerId,
    logs: state.logs.length,
    hands: state.playerIds.map(uid => state.players[uid]?.hand.length),
    units: state.playerIds.map(uid => state.players[uid]?.unitZone.filter(Boolean).length),
    erosion: state.playerIds.map(uid =>
      (state.players[uid]?.erosionFront.filter(Boolean).length || 0) +
      (state.players[uid]?.erosionBack.filter(Boolean).length || 0)
    ),
  });
}

function logToText(log: any) {
  if (typeof log === 'string') return log;
  if (log?.text) return String(log.text);
  return JSON.stringify(log);
}

function describeCard(card: Card | null | undefined) {
  if (!card) return null;
  return {
    id: card.id,
    name: card.fullName,
    type: card.type,
    power: card.power,
    damage: card.damage,
    cost: card.acValue,
    exhausted: !!card.isExhausted,
    location: card.cardlocation,
  };
}

function describeBoard(state: GameState) {
  return Object.fromEntries(state.playerIds.map(uid => {
    const player = state.players[uid];
    return [uid, {
      name: player?.displayName,
      hand: player?.hand.length || 0,
      deck: player?.deck.length || 0,
      grave: player?.grave.length || 0,
      exile: player?.exile.length || 0,
      erosionFront: player?.erosionFront.filter(Boolean).length || 0,
      erosionBack: player?.erosionBack.filter(Boolean).length || 0,
      units: (player?.unitZone || []).filter(Boolean).map(describeCard),
      items: (player?.itemZone || []).filter(Boolean).map(describeCard),
    }];
  }));
}

function describePendingQuery(state: GameState) {
  if (!state.pendingQuery) return undefined;
  return {
    type: state.pendingQuery.type,
    playerUid: state.pendingQuery.playerUid,
    title: state.pendingQuery.title,
    callbackKey: state.pendingQuery.callbackKey,
    options: state.pendingQuery.options?.length || 0,
  };
}

function rawLogDetail(log: AiDecisionLog, key: string) {
  const value = log.details?.[key];
  return value === undefined || value === null ? '' : String(value);
}

function truthyLogDetail(log: AiDecisionLog, key: string) {
  const value = log.details?.[key];
  return value === true || value === 'true' || value === 1 || value === '1';
}

function numericLogDetail(log: AiDecisionLog, key: string) {
  const value = Number(log.details?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function collectDecisionDiagnostics(logs: AiDecisionLog[]) {
  type TurnTrace = {
    plan?: AiDecisionLog;
    attacks: number;
    plays: number;
    effects: number;
    payments: number;
    exhaustedPayments: number;
    ended: boolean;
    comboActions: number;
  };
  const traces = new Map<string, TurnTrace>();
  const metrics: Record<string, number> = {
    MISSED_LETHAL: 0,
    MISSED_COMBO: 0,
    BAD_EFFECT_TIMING: 0,
    BAD_PAYMENT: 0,
    OVER_DEVELOP: 0,
    UNDER_PRESSURE_NO_STABILIZE: 0,
    QUERY_FAILED: 0,
    EFFECT_FAILED: 0,
  };

  const traceFor = (log: AiDecisionLog) => {
    const key = `${log.playerUid}:${log.turn}`;
    if (!traces.has(key)) {
      traces.set(key, {
        attacks: 0,
        plays: 0,
        effects: 0,
        payments: 0,
        exhaustedPayments: 0,
        ended: false,
        comboActions: 0,
      });
    }
    return traces.get(key)!;
  };

  for (const log of logs) {
    const trace = traceFor(log);
    if (log.action === 'TURN_PLAN') trace.plan = log;
    if (log.action === 'ATTACK' || log.action === 'COMBO_ALLIANCE_ATTACK') trace.attacks++;
    if (log.action === 'PLAY_CARD') trace.plays++;
    if (log.action === 'ACTIVATE_EFFECT' || log.action === 'PLAY_BATTLE_STORY') trace.effects++;
    if (log.action === 'PAYMENT') {
      trace.payments++;
      const structuredExhausts = numericLogDetail(log, 'paymentExhaustsUnits');
      if (structuredExhausts > 0) {
        trace.exhaustedPayments += structuredExhausts;
      } else {
        const text = `${rawLogDetail(log, 'selection')} ${rawLogDetail(log, 'projectedPayment')}`;
        if (/横置|妯疆|exhaust/i.test(text)) trace.exhaustedPayments++;
      }
    }
    if (log.action === 'END_TURN') trace.ended = true;
    if (
      log.action === 'COMBO_ALLIANCE_ATTACK' ||
      log.action === 'PLAY_BATTLE_STORY' ||
      /201100037|eclipse|日蚀|combo/i.test(`${rawLogDetail(log, 'effectId')} ${rawLogDetail(log, 'combo')} ${log.subject}`)
    ) {
      trace.comboActions++;
    }
    if (log.action === 'QUERY_FAILED') metrics.QUERY_FAILED++;
    if (log.action === 'ACTIVATE_EFFECT_FAILED') metrics.EFFECT_FAILED++;
    if (log.action === 'ACTIVATE_EFFECT') {
      const notes = rawLogDetail(log, 'notes');
      if (/prefers|timing .*-/i.test(notes)) metrics.BAD_EFFECT_TIMING++;
    }
  }

  for (const trace of traces.values()) {
    const plan = trace.plan;
    if (!plan) continue;
    const totalDamage = numericLogDetail(plan, 'totalDamage');
    const damageToCritical = Math.max(1, numericLogDetail(plan, 'damageToCritical'));
    const lethalPotential =
      truthyLogDetail(plan, 'lethalWindow') ||
      rawLogDetail(plan, 'tacticalLine') === 'lethal' ||
      rawLogDetail(plan, 'tacticalLine') === 'erosion-lethal' ||
      totalDamage >= damageToCritical;
    const comboReady = truthyLogDetail(plan, 'comboReady') || truthyLogDetail(plan, 'comboPayoffPlayable');
    const incomingLethal = truthyLogDetail(plan, 'incomingLethal');
    const reserveDefenders = numericLogDetail(plan, 'reserveDefenders');
    const defendersNeeded = numericLogDetail(plan, 'defendersNeededNextTurn');
    const mode = String(plan.subject || '');

    if (lethalPotential && trace.attacks === 0 && trace.ended) metrics.MISSED_LETHAL++;
    if (comboReady && trace.comboActions === 0 && trace.ended) metrics.MISSED_COMBO++;
    if (incomingLethal && !/defense|stabilize/i.test(mode)) metrics.UNDER_PRESSURE_NO_STABILIZE++;
    if (trace.exhaustedPayments > 0 && (incomingLethal || reserveDefenders > 0 || defendersNeeded > 0)) {
      metrics.BAD_PAYMENT += trace.exhaustedPayments;
    }
    if (lethalPotential && trace.plays >= 2 && trace.attacks > 0) metrics.OVER_DEVELOP++;
  }

  const tags = Object.entries(metrics)
    .filter(([, count]) => count > 0)
    .map(([tag]) => tag);

  return { metrics, tags };
}

function withDecisionDiagnostics(diagnosis: MatchDiagnosis, logs: AiDecisionLog[]): MatchDiagnosis {
  const decisionDiagnostics = collectDecisionDiagnostics(logs);
  const severe =
    (decisionDiagnostics.metrics.MISSED_LETHAL || 0) > 0 ||
    (decisionDiagnostics.metrics.MISSED_COMBO || 0) > 0 ||
    (decisionDiagnostics.metrics.UNDER_PRESSURE_NO_STABILIZE || 0) > 0;
  const severity = diagnosis.severity === 'info' && severe ? 'warning' : diagnosis.severity;
  const extraDetail = decisionDiagnostics.tags.length
    ? ` Decision diagnostics: ${decisionDiagnostics.tags.join(', ')}.`
    : '';

  return {
    ...diagnosis,
    severity,
    detail: `${diagnosis.detail}${extraDetail}`,
    tags: decisionDiagnostics.tags,
    metrics: decisionDiagnostics.metrics,
  };
}

function diagnoseMatch(result: Omit<MatchResult, 'diagnosis'>): MatchDiagnosis {
  if (result.error || result.winReason === 'SIMULATION_ERROR') {
    return {
      code: 'SIMULATION_ERROR',
      severity: 'error',
      title: '模拟执行错误',
      detail: result.error || '规则执行过程中抛出了未知错误。',
    };
  }

  if (result.pendingQuery) {
    if (result.winReason === 'MAX_STEPS_REACHED' && result.pendingQuery.callbackKey === 'TRIGGER_CHOICE') {
      return {
        code: 'STEP_LIMIT_TRIGGER_PENDING',
        severity: 'info',
        title: '触发选择中途截断',
        detail: `评测刚好停在 ${result.pendingQuery.type} / ${result.pendingQuery.callbackKey}，下一步通常会由 AI 自动确认触发。`,
      };
    }

    if (result.winReason === 'MAX_STEPS_REACHED') {
      return {
        code: 'STEP_LIMIT_QUERY_PENDING',
        severity: 'info',
        title: '效果选择中途截断',
        detail: `评测刚好停在 ${result.pendingQuery.type} / ${result.pendingQuery.callbackKey}，下一步通常会由 AI 自动处理该查询。`,
      };
    }

    return {
      code: 'WAITING_QUERY',
      severity: 'warning',
      title: '停在效果选择',
      detail: `最终仍有 ${result.pendingQuery.type} 查询等待 ${result.pendingQuery.playerUid} 处理，回调为 ${result.pendingQuery.callbackKey}。`,
    };
  }

  if (result.winnerDeck) {
    return {
      code: 'FINISHED',
      severity: 'info',
      title: '正常结束',
      detail: `${result.winnerDeck} 获胜，胜因 ${result.winReason}。`,
    };
  }

  if (result.winReason === 'MAX_STEPS_REACHED') {
    const activeBoard = result.activePlayer ? (result.finalBoard as any)[result.activePlayer] : undefined;
    const readyAttackers = (activeBoard?.units || []).filter((unit: any) =>
      unit && !unit.exhausted && Number(unit.damage || 0) > 0
    );
    const lastLog = result.lastLogs[result.lastLogs.length - 1] || '';

    if (result.finalPhase === 'BATTLE_DECLARATION' && result.activePlayer) {
      if (readyAttackers.length > 0) {
        return {
          code: 'STEP_LIMIT_BATTLE_DECLARATION_READY_ATTACKERS',
          severity: 'info',
          title: '战斗宣言中途截断',
          detail: `行动方仍有 ${readyAttackers.length} 个未横置且伤害大于 0 的单位，下一步通常会继续宣告攻击。`,
        };
      }
      return {
        code: 'STEP_LIMIT_BATTLE_DECLARATION_NO_ATTACKERS',
        severity: 'warning',
        title: '战斗宣言阶段没有明显攻击者',
        detail: '行动方没有明显可攻击单位，AI 应该更快返回主要阶段或结束回合。',
      };
    }

    if (result.finalPhase === 'DEFENSE_DECLARATION') {
      return {
        code: 'STEP_LIMIT_DEFENSE_PENDING',
        severity: 'info',
        title: '防御宣言中途截断',
        detail: '评测刚好停在防御宣言阶段，下一步通常会由防守方选择防御或不防御；可用更高 maxSteps 复跑确认。',
      };
    }

    if (result.finalPhase === 'BATTLE_FREE' && /选择不防御|宣告了防御/.test(lastLog)) {
      return {
        code: 'STEP_LIMIT_BATTLE_RESOLUTION_PENDING',
        severity: 'info',
        title: '战斗结算中途截断',
        detail: '评测刚好停在防御选择之后，下一步通常会进入伤害计算；可用更高 maxSteps 复跑确认。',
      };
    }

    if (result.finalPhase === 'DAMAGE_CALCULATION') {
      return {
        code: 'STEP_LIMIT_DAMAGE_PENDING',
        severity: 'info',
        title: '伤害结算中途截断',
        detail: '评测刚好停在伤害计算阶段，下一步通常会结算战斗伤害；可用更高 maxSteps 复跑确认。',
      };
    }

    if (result.finalPhase === 'COUNTERING') {
      return {
        code: 'STEP_LIMIT_COUNTERING_PENDING',
        severity: 'info',
        title: '对抗窗口中途截断',
        detail: '评测刚好停在对抗窗口，下一步通常会由优先权玩家自动通过；真正无进展会被 staleSteps 检测为错误。',
      };
    }

    if (result.finalPhase === 'BATTLE_FREE') {
      return {
        code: 'STEP_LIMIT_CONFRONTATION',
        severity: 'warning',
        title: '对抗/战斗自由阶段过长',
        detail: '评测在对抗窗口耗尽步数，优先检查自动通过、伤害结算提议和对抗策略。',
      };
    }

    if (result.finalPhase === 'MAIN') {
      if (/进入主要阶段 \(战斗结算后\)/.test(lastLog) && readyAttackers.length > 0) {
        return {
          code: 'STEP_LIMIT_BETWEEN_ATTACKS',
          severity: 'info',
          title: '多次攻击中途截断',
          detail: `行动方还有 ${readyAttackers.length} 个未横置且伤害大于 0 的单位，评测可能只是截在两次攻击之间。`,
        };
      }
      return {
        code: 'STEP_LIMIT_MAIN',
        severity: 'warning',
        title: '主要阶段过长',
        detail: 'AI 可能连续展开或没有及时转入战斗/结束回合，需要结合最后日志判断。',
      };
    }

    if (result.finalPhase === 'EROSION') {
      return {
        code: 'STEP_LIMIT_EROSION_PENDING',
        severity: 'info',
        title: '侵蚀阶段中途截断',
        detail: '评测刚好停在侵蚀阶段，下一步通常会由 AI 选择侵蚀处理方式。',
      };
    }

    return {
      code: 'STEP_LIMIT_OTHER',
      severity: 'warning',
      title: '步数上限截断',
      detail: `评测在 ${result.finalPhase} 阶段达到 maxSteps。`,
    };
  }

  if (result.winReason === 'MAX_TURNS_REACHED') {
    return {
      code: 'TURN_LIMIT',
      severity: 'warning',
      title: '回合上限截断',
      detail: '对局打到 maxTurns 仍未分胜负，可能是正常长局，也可能是双方进攻不足。',
    };
  }

  return {
    code: 'UNRESOLVED',
    severity: 'warning',
    title: '未分胜负',
    detail: `对局未产生胜者，结束原因为 ${result.winReason}。`,
  };
}

function buildMatchResult(
  state: GameState,
  profileA: DeckAiProfile,
  profileB: DeckAiProfile,
  firstSeat: Seat,
  steps: number,
  error?: unknown
): MatchResult {
  const winnerProfile = state.winnerId === `AI_${profileA.id}` ? profileA :
    state.winnerId === `AI_${profileB.id}` ? profileB :
      null;

  const result = {
    gameId: state.gameId,
    deckA: profileA.displayName,
    deckB: profileB.displayName,
    first: firstSeat === 0 ? profileA.displayName : profileB.displayName,
    winner: state.winnerId || null,
    winnerDeck: winnerProfile?.displayName || null,
    winReason: state.winReason || 'UNKNOWN',
    turnCount: state.turnCount,
    steps,
    finalPhase: state.phase,
    activePlayer: getActiveBotUid(state),
    pendingQuery: describePendingQuery(state),
    finalBoard: describeBoard(state),
    lastLogs: (state.logs || []).slice(-20).map(logToText),
    aiDecisionLogs: (state.aiDecisionLogs || []).slice(-decisionLogLimit),
    decisionStats: summarizeDecisionActions(state.aiDecisionLogs || []),
    deckDecisionStats: summarizeDeckDecisions(state.aiDecisionLogs || []),
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  };

  return {
    ...result,
    diagnosis: withDecisionDiagnostics(diagnoseMatch(result), result.aiDecisionLogs),
  };
}

async function stepGame(state: GameState) {
  ServerGameService.hydrateGameState(state);
  if (ServerGameService.checkWinConditions(state)) return;

  const activeUid = getActiveBotUid(state);
  if (!activeUid || !state.players[activeUid]) {
    throw new Error(`No active AI player for phase ${state.phase}`);
  }

  if (state.pendingQuery) {
    await ServerGameService.botMoveForPlayer(state, activeUid);
  } else if (state.phase === 'INIT' || state.phase === 'MULLIGAN' || state.phase === 'START' || state.phase === 'DRAW') {
    await ServerGameService.advancePhase(state, undefined, activeUid);
  } else {
    await ServerGameService.botMoveForPlayer(state, activeUid);
  }

  if (!state.pendingQuery && state.gameStatus !== 2) {
    await ServerGameService.applyConfrontationStrategy(state);
  }
  ServerGameService.checkWinConditions(state);
}

async function stepGameWithTimeout(state: GameState) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      stepGame(state),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Step timeout after ${stepTimeoutMs}ms at phase ${state.phase}`)),
          stepTimeoutMs
        );
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function runSingleMatch(
  profileA: DeckAiProfile,
  deckA: Card[],
  profileB: DeckAiProfile,
  deckB: Card[],
  firstSeat: Seat,
  gameIndex: number
): Promise<MatchResult> {
  const state = await createSelfPlayGame(profileA, deckA, profileB, deckB, firstSeat, gameIndex);
  let lastFingerprint = '';
  let staleSteps = 0;
  let steps = 0;

  try {
    while (state.gameStatus !== 2 && steps < maxSteps && state.turnCount <= maxTurns) {
      const before = getProgressFingerprint(state);
      await stepGameWithTimeout(state);
      const after = getProgressFingerprint(state);
      steps++;

      staleSteps = before === after || after === lastFingerprint ? staleSteps + 1 : 0;
      lastFingerprint = after;
      if (staleSteps >= 8) {
        throw new Error(`No progress for ${staleSteps} steps at phase ${state.phase}`);
      }
    }

    if (state.gameStatus !== 2) {
      state.gameStatus = 2;
      state.winReason = state.turnCount > maxTurns ? 'MAX_TURNS_REACHED' : 'MAX_STEPS_REACHED';
      state.winnerId = undefined;
    }
  } catch (err) {
    state.gameStatus = 2;
    state.winReason = 'SIMULATION_ERROR';
    state.winnerId = undefined;
    return buildMatchResult(state, profileA, profileB, firstSeat, steps, err);
  }

  return buildMatchResult(state, profileA, profileB, firstSeat, steps);
}

function buildSummary(results: MatchResult[]) {
  const summary = new Map<string, { wins: number; losses: number; draws: number; errors: number }>();

  for (const profile of AI_DECK_PROFILES) {
    summary.set(profile.displayName, { wins: 0, losses: 0, draws: 0, errors: 0 });
  }

  for (const result of results) {
    if (result.error) {
      summary.get(result.deckA)!.errors++;
      summary.get(result.deckB)!.errors++;
      continue;
    }

    if (!result.winnerDeck) {
      summary.get(result.deckA)!.draws++;
      summary.get(result.deckB)!.draws++;
      continue;
    }

    const loser = result.winnerDeck === result.deckA ? result.deckB : result.deckA;
    summary.get(result.winnerDeck)!.wins++;
    summary.get(loser)!.losses++;
  }

  return Object.fromEntries(summary.entries());
}

function escapeMarkdown(text: unknown) {
  return String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function markdownTable(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.map(escapeMarkdown).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(escapeMarkdown).join(' | ')} |`),
  ].join('\n');
}

function formatUnit(unit: any) {
  if (!unit) return '';
  const state = unit.exhausted ? '横置' : '重置';
  return `${unit.name}(${unit.power || 0}/${unit.damage || 0}, ${state})`;
}

function formatBoardSummary(board: any) {
  const units = (board.units || []).map(formatUnit).join('；') || '无';
  const items = (board.items || []).map((item: any) => item?.name).filter(Boolean).join('；') || '无';
  return [
    `手牌 ${board.hand}，卡组 ${board.deck}，墓地 ${board.grave}，除外 ${board.exile}`,
    `侵蚀 正${board.erosionFront}/背${board.erosionBack}`,
    `单位：${units}`,
    `道具：${items}`,
  ].join('\n');
}

function buildDiagnosisSummary(results: MatchResult[]) {
  const counts = new Map<string, { title: string; severity: string; count: number }>();
  for (const result of results) {
    const current = counts.get(result.diagnosis.code) || {
      title: result.diagnosis.title,
      severity: result.diagnosis.severity,
      count: 0,
    };
    current.count++;
    counts.set(result.diagnosis.code, current);
  }
  return [...counts.entries()].map(([code, item]) => [code, item.title, item.severity, item.count]);
}

function summarizeDecisionActions(logs: AiDecisionLog[]) {
  return logs.reduce<Record<string, number>>((stats, log) => {
    stats[log.action] = (stats[log.action] || 0) + 1;
    return stats;
  }, {});
}

function logDetail(log: AiDecisionLog, key: string) {
  const value = log.details?.[key];
  return value === undefined || value === null ? '' : String(value);
}

function classifyFailureReason(log: AiDecisionLog) {
  const text = `${log.reason || ''} ${logDetail(log, 'error')} ${logDetail(log, 'callback')} ${logDetail(log, 'type')}`;
  if (/费用|支付|不足|cost|payment/i.test(text)) return 'COST_FAILED';
  if (/没有|无.*对象|可选择|合法对象|目标|指定对象|target|option/i.test(text)) return 'NO_TARGET';
  if (/阶段|时点|不能.*发动|timing|phase/i.test(text)) return 'TIMING_FAILED';
  if (/未结算|等待|pending|query/i.test(text)) return 'PENDING_QUERY';
  return 'UNKNOWN';
}

function createDeckDecisionStats(): DeckDecisionStats {
  return {
    actions: {},
    effectActivations: {},
    effectFailures: {},
    failureReasons: {},
    queryFailures: 0,
    attacks: 0,
    turnsSeen: [],
  };
}

function summarizeDeckDecisions(logs: AiDecisionLog[]) {
  const byDeck: Record<string, DeckDecisionStats> = {};
  for (const log of logs) {
    const deck = log.playerName || log.profileId || log.playerUid;
    byDeck[deck] ??= createDeckDecisionStats();
    const stats = byDeck[deck];
    stats.actions[log.action] = (stats.actions[log.action] || 0) + 1;
    if (!stats.turnsSeen.includes(log.turn)) stats.turnsSeen.push(log.turn);

    if (log.action === 'ATTACK') stats.attacks++;
    if (log.action === 'QUERY_FAILED') {
      stats.queryFailures++;
      const reason = classifyFailureReason(log);
      stats.failureReasons[reason] = (stats.failureReasons[reason] || 0) + 1;
    }

    if (log.action === 'ACTIVATE_EFFECT' || log.action === 'ACTIVATE_EFFECT_FAILED') {
      const effectId = logDetail(log, 'effectId') || log.subject || 'UNKNOWN_EFFECT';
      if (log.action === 'ACTIVATE_EFFECT') {
        stats.effectActivations[effectId] = (stats.effectActivations[effectId] || 0) + 1;
      } else {
        stats.effectFailures[effectId] = (stats.effectFailures[effectId] || 0) + 1;
        const reason = classifyFailureReason(log);
        stats.failureReasons[reason] = (stats.failureReasons[reason] || 0) + 1;
      }
    }
  }
  return byDeck;
}

function buildDecisionActionSummary(results: MatchResult[]) {
  const counts = new Map<string, number>();
  for (const result of results) {
    for (const [action, count] of Object.entries(result.decisionStats || {})) {
      counts.set(action, (counts.get(action) || 0) + Number(count));
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function aggregateDeckStats(results: MatchResult[]) {
  const aggregate = new Map<string, DeckDecisionStats & { games: number; turnTotal: number; warnings: number; errors: number }>();

  const ensure = (deck: string) => {
    if (!aggregate.has(deck)) {
      aggregate.set(deck, {
        ...createDeckDecisionStats(),
        games: 0,
        turnTotal: 0,
        warnings: 0,
        errors: 0,
      });
    }
    return aggregate.get(deck)!;
  };

  for (const result of results) {
    for (const deck of [result.deckA, result.deckB]) {
      const stats = ensure(deck);
      stats.games++;
      stats.turnTotal += result.turnCount;
      if (result.diagnosis.severity === 'warning') stats.warnings++;
      if (result.diagnosis.severity === 'error') stats.errors++;
    }

    for (const [deck, source] of Object.entries(result.deckDecisionStats || {})) {
      const target = ensure(deck);
      target.queryFailures += source.queryFailures;
      target.attacks += source.attacks;
      for (const turn of source.turnsSeen) {
        if (!target.turnsSeen.includes(turn)) target.turnsSeen.push(turn);
      }
      for (const [action, count] of Object.entries(source.actions)) {
        target.actions[action] = (target.actions[action] || 0) + Number(count);
      }
      for (const [effectId, count] of Object.entries(source.effectActivations)) {
        target.effectActivations[effectId] = (target.effectActivations[effectId] || 0) + Number(count);
      }
      for (const [effectId, count] of Object.entries(source.effectFailures)) {
        target.effectFailures[effectId] = (target.effectFailures[effectId] || 0) + Number(count);
      }
      for (const [reason, count] of Object.entries(source.failureReasons)) {
        target.failureReasons[reason] = (target.failureReasons[reason] || 0) + Number(count);
      }
    }
  }

  return aggregate;
}

function buildDeckAiSummaryRows(results: MatchResult[]) {
  return [...aggregateDeckStats(results).entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([deck, stats]) => {
      const activated = Object.values(stats.effectActivations).reduce((sum, count) => sum + count, 0);
      const failed = Object.values(stats.effectFailures).reduce((sum, count) => sum + count, 0);
      const failRate = activated + failed > 0 ? `${Math.round((failed / (activated + failed)) * 100)}%` : '0%';
      return [
        deck,
        stats.games,
        stats.errors,
        stats.warnings,
        Number((stats.turnTotal / Math.max(1, stats.games)).toFixed(1)),
        stats.actions.PLAY_CARD || 0,
        stats.attacks,
        activated,
        failed,
        failRate,
        stats.queryFailures,
      ];
    });
}

function buildEffectRows(results: MatchResult[]) {
  const aggregate = aggregateDeckStats(results);
  const rows: Array<Array<string | number>> = [];
  for (const [deck, stats] of aggregate.entries()) {
    const effectIds = new Set([
      ...Object.keys(stats.effectActivations),
      ...Object.keys(stats.effectFailures),
    ]);
    for (const effectId of effectIds) {
      const activated = stats.effectActivations[effectId] || 0;
      const failed = stats.effectFailures[effectId] || 0;
      const total = activated + failed;
      const failRate = total > 0 ? `${Math.round((failed / total) * 100)}%` : '0%';
      rows.push([deck, effectId, activated, failed, failRate]);
    }
  }
  return rows.sort((a, b) =>
    Number(b[3]) - Number(a[3]) ||
    Number(b[2]) - Number(a[2]) ||
    String(a[0]).localeCompare(String(b[0]))
  );
}

function buildFailureReasonRows(results: MatchResult[]) {
  const aggregate = aggregateDeckStats(results);
  const rows: Array<Array<string | number>> = [];
  for (const [deck, stats] of aggregate.entries()) {
    for (const [reason, count] of Object.entries(stats.failureReasons)) {
      rows.push([deck, reason, count]);
    }
  }
  return rows.sort((a, b) => Number(b[2]) - Number(a[2]));
}

function buildDecisionDiagnosticRows(results: MatchResult[]) {
  const totals = new Map<string, { count: number; games: number }>();
  for (const result of results) {
    for (const [tag, count] of Object.entries(result.diagnosis.metrics || {})) {
      if (Number(count) <= 0) continue;
      const current = totals.get(tag) || { count: 0, games: 0 };
      current.count += Number(count);
      current.games += 1;
      totals.set(tag, current);
    }
  }

  return [...totals.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([tag, value]) => [tag, value.count, value.games]);
}

function buildProblemLeaderboardRows(results: MatchResult[]) {
  const rows: Array<Array<string | number>> = [];
  const aggregate = aggregateDeckStats(results);

  for (const [deck, stats] of aggregate.entries()) {
    const effectFailed = Object.values(stats.effectFailures).reduce((sum, count) => sum + count, 0);
    if (stats.errors > 0) rows.push(['error', deck, 'SIMULATION_ERROR', stats.errors, '规则流程或评测步进出错']);
    if (effectFailed > 0) rows.push(['warning', deck, 'ACTIVATE_EFFECT_FAILED', effectFailed, '主动效果发动入口拒绝，优先看 effectId 失败榜']);
    if (stats.queryFailures > 0) rows.push(['warning', deck, 'QUERY_FAILED', stats.queryFailures, '必选查询没有合法选择或选择器未覆盖']);
    if (stats.warnings > 0) rows.push(['warning', deck, 'UNRESOLVED_GAME', stats.warnings, '回合/步数上限或阶段截断']);
  }

  for (const result of results) {
    for (const [tag, count] of Object.entries(result.diagnosis.metrics || {})) {
      if (Number(count) <= 0) continue;
      rows.push(['warning', result.winnerDeck || `${result.deckA} vs ${result.deckB}`, tag, Number(count), 'Decision diagnostic from turn plans and action logs']);
    }
  }

  for (const [deck, effectId, , failed, failRate] of buildEffectRows(results)) {
    if (Number(failed) > 0) {
      rows.push(['warning', deck, `effect:${effectId}`, failed, `失败率 ${failRate}`]);
    }
  }

  return rows.sort((a, b) => {
    const severityRank = (value: string | number) => value === 'error' ? 2 : value === 'warning' ? 1 : 0;
    return severityRank(b[0]) - severityRank(a[0]) || Number(b[3]) - Number(a[3]);
  });
}

function isShortCapRun(limits?: EvaluationLimits) {
  return !!limits && (limits.maxTurns < 12 || limits.maxSteps < 200);
}

function buildCapWarningRows(results: MatchResult[], limits?: EvaluationLimits) {
  if (!isShortCapRun(limits)) return [];
  const unresolved = results.filter(result =>
    result.winReason === 'MAX_TURNS_REACHED' ||
    result.winReason === 'MAX_STEPS_REACHED'
  ).length;
  if (unresolved === 0) return [];
  return [[
    'short-cap',
    unresolved,
    `Current caps are maxTurns=${limits!.maxTurns}, maxSteps=${limits!.maxSteps}. Rerun decisive samples with --maxTurns=30 --maxSteps=500 before strategy tuning.`,
  ]];
}

function buildTuningSuggestionRows(results: MatchResult[], limits?: EvaluationLimits) {
  const rows: Array<Array<string | number>> = [];
  const seen = new Set<string>();
  const problemRows = buildProblemLeaderboardRows(results);
  const shortCapRun = isShortCapRun(limits);

  for (const [severity, deck, problem, count] of problemRows) {
    const problemText = String(problem);
    const key = `${deck}:${problemText}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let focus = problemText;
    let suggestion = 'Review this deck in the per-match key decision log.';

    if (problemText === 'SIMULATION_ERROR') {
      focus = 'rules/runtime';
      suggestion = 'Fix simulation errors before changing strategy weights.';
    } else if (problemText === 'ACTIVATE_EFFECT_FAILED') {
      focus = 'active effect gates';
      suggestion = 'Check failed effect ids, then add a pre-check or deck avoidEffectIds rule.';
    } else if (problemText.startsWith('effect:')) {
      focus = problemText.slice('effect:'.length);
      suggestion = 'Add a targeted pre-check, payment guard, or avoidEffectIds entry for this effect.';
    } else if (problemText === 'QUERY_FAILED') {
      focus = 'query chooser';
      suggestion = 'Add a chooser rule for the failed callback/type in hardStrategy.';
    } else if (problemText === 'UNRESOLVED_GAME') {
      focus = 'game closure';
      suggestion = shortCapRun
        ? 'Treat this as an evaluation-cap sample first; rerun with --maxTurns=30 --maxSteps=500 before changing strategy.'
        : 'Tune attack/lethal pressure first; if logs show real stalemates, raise evaluation caps separately.';
    } else if (problemText === 'MISSED_LETHAL') {
      focus = 'lethal search';
      suggestion = 'Prioritize one-turn lethal lines before play/effect development and add a scenario test for the missed turn.';
    } else if (problemText === 'MISSED_COMBO') {
      focus = 'combo execution';
      suggestion = 'Add a deck-specific combo hook or lower the battle effect threshold when the combo is ready.';
    } else if (problemText === 'BAD_PAYMENT') {
      focus = 'payment guard';
      suggestion = 'Increase payment preservation for ready attackers, blockers, god-marked units, and combo pieces.';
    } else if (problemText === 'BAD_EFFECT_TIMING') {
      focus = 'effect timing';
      suggestion = 'Add a static timing rule or observed timing override for this effect family.';
    } else if (problemText === 'UNDER_PRESSURE_NO_STABILIZE') {
      focus = 'defense/stabilize';
      suggestion = 'Raise defender reserve and defensive development when the opponent has a lethal next turn.';
    } else if (problemText === 'OVER_DEVELOP') {
      focus = 'attack sequencing';
      suggestion = 'Reduce development priority once a lethal or critical erosion attack line is available.';
    }

    const priority = severity === 'error'
      ? 'P0'
      : Number(count) >= 5
        ? 'P1'
        : 'P2';
    rows.push([priority, deck, focus, count, suggestion]);
  }

  return rows.slice(0, 20);
}

function buildAiDiagnostics(results: MatchResult[], limits?: EvaluationLimits) {
  return {
    capWarnings: buildCapWarningRows(results, limits),
    diagnosisCounts: buildDiagnosisSummary(results),
    decisionActions: buildDecisionActionSummary(results),
    decisionDiagnostics: buildDecisionDiagnosticRows(results),
    problemLeaderboard: buildProblemLeaderboardRows(results),
    tuningSuggestions: buildTuningSuggestionRows(results, limits),
    deckSummary: buildDeckAiSummaryRows(results),
    effectSummary: buildEffectRows(results),
    failureReasons: buildFailureReasonRows(results),
  };
}

function formatDecisionDetails(log: AiDecisionLog) {
  const details = Object.entries(log.details || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  const candidates = (log.candidates || [])
    .slice(0, 3)
    .map(candidate => candidate.score === undefined
      ? candidate.name
      : `${candidate.name}(${candidate.score.toFixed(1)})`)
    .join(', ');
  return [details, candidates ? `候选: ${candidates}` : ''].filter(Boolean).join('；');
}

function buildDecisionRows(result: MatchResult) {
  return result.aiDecisionLogs.map(log => [
    log.turn,
    log.playerName || log.playerUid,
    log.phase,
    log.action,
    log.subject || '',
    log.score === undefined ? '' : Number(log.score.toFixed(1)),
    log.reason,
    formatDecisionDetails(log),
  ]);
}

function buildMarkdownReport(report: any) {
  const lines: string[] = [];
  lines.push('# AI Evaluation Report');
  lines.push('');
  lines.push(`- Created: ${report.createdAt}`);
  lines.push(`- Games: ${report.results.length}`);
  lines.push(`- gamesPerSide: ${report.gamesPerSide}`);
  lines.push(`- matchLimit: ${report.matchLimit ?? 'none'}`);
  lines.push(`- matchOffset: ${report.matchOffset ?? 0}`);
  if (report.deckFilter) lines.push(`- deckFilter: ${report.deckFilter}`);
  lines.push(`- maxSteps: ${report.maxSteps}`);
  lines.push(`- maxTurns: ${report.maxTurns}`);
  lines.push(`- stepTimeoutMs: ${report.stepTimeoutMs}`);
  lines.push(`- decisionLogLimit: ${report.decisionLogLimit ?? 'default'}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(markdownTable(
    ['Deck', 'Wins', 'Losses', 'Draws', 'Errors'],
    Object.entries(report.summary).map(([deck, stats]: [string, any]) => [
      deck,
      stats.wins,
      stats.losses,
      stats.draws,
      stats.errors,
    ])
  ));
  lines.push('');

  lines.push('## Diagnosis Counts');
  lines.push('');
  lines.push(markdownTable(['Code', 'Title', 'Severity', 'Count'], buildDiagnosisSummary(report.results)));
  lines.push('');

  lines.push('## AI Action Counts');
  lines.push('');
  lines.push(markdownTable(['Action', 'Count'], buildDecisionActionSummary(report.results)));
  lines.push('');

  lines.push('## AI Decision Diagnostics');
  lines.push('');
  const decisionDiagnosticRows = report.aiDiagnostics?.decisionDiagnostics || buildDecisionDiagnosticRows(report.results);
  if (decisionDiagnosticRows.length === 0) {
    lines.push('- No decision diagnostics detected.');
  } else {
    lines.push(markdownTable(['Diagnostic', 'Count', 'Games'], decisionDiagnosticRows));
  }
  lines.push('');

  const capWarnings = report.aiDiagnostics?.capWarnings || [];
  if (capWarnings.length > 0) {
    lines.push('## Evaluation Cap Warnings');
    lines.push('');
    lines.push(markdownTable(['Code', 'Affected Games', 'Suggestion'], capWarnings));
    lines.push('');
  }

  lines.push('## AI Problem Leaderboard');
  lines.push('');
  const problemRows = buildProblemLeaderboardRows(report.results).slice(0, 20);
  if (problemRows.length === 0) {
    lines.push('- No problems detected.');
  } else {
    lines.push(markdownTable(['Severity', 'Deck', 'Problem', 'Count', 'Detail'], problemRows));
  }
  lines.push('');

  lines.push('## Auto Tuning Suggestions');
  lines.push('');
  const tuningRows = report.aiDiagnostics?.tuningSuggestions || buildTuningSuggestionRows(report.results);
  if (tuningRows.length === 0) {
    lines.push('- No tuning suggestions generated.');
  } else {
    lines.push(markdownTable(['Priority', 'Deck', 'Focus', 'Count', 'Suggestion'], tuningRows));
  }
  lines.push('');

  lines.push('## Deck AI Summary');
  lines.push('');
  lines.push(markdownTable(
    ['Deck', 'Games', 'Errors', 'Warnings', 'Avg Turns', 'Plays', 'Attacks', 'Effects OK', 'Effects Failed', 'Fail Rate', 'Query Failed'],
    buildDeckAiSummaryRows(report.results)
  ));
  lines.push('');

  lines.push('## Effect Success And Failure');
  lines.push('');
  const effectRows = buildEffectRows(report.results).slice(0, 30);
  if (effectRows.length === 0) {
    lines.push('- No active effects recorded.');
  } else {
    lines.push(markdownTable(['Deck', 'EffectId', 'Activated', 'Failed', 'Fail Rate'], effectRows));
  }
  lines.push('');

  lines.push('## Failure Reasons');
  lines.push('');
  const reasonRows = buildFailureReasonRows(report.results);
  if (reasonRows.length === 0) {
    lines.push('- No classified failures recorded.');
  } else {
    lines.push(markdownTable(['Deck', 'Reason', 'Count'], reasonRows));
  }
  lines.push('');

  lines.push('## Card Knowledge');
  lines.push('');
  lines.push(`- Cards analyzed: ${report.cardKnowledge.cards}`);
  lines.push('');
  lines.push(markdownTable(
    ['Role', 'Count'],
    Object.entries(report.cardKnowledge.roles).map(([role, count]) => [role, Number(count)])
  ));
  lines.push('');

  report.results.forEach((result: MatchResult, index: number) => {
    lines.push(`## Match ${index + 1}: ${result.deckA} vs ${result.deckB}`);
    lines.push('');
    lines.push(`- Game: ${result.gameId}`);
    lines.push(`- First: ${result.first}`);
    lines.push(`- Result: ${result.winnerDeck ? `${result.winnerDeck} wins` : 'No winner'} (${result.winReason})`);
    lines.push(`- Turns / Steps: ${result.turnCount} / ${result.steps}`);
    lines.push(`- Final phase: ${result.finalPhase}`);
    lines.push(`- Active player: ${result.activePlayer || 'n/a'}`);
    lines.push(`- Diagnosis: **${result.diagnosis.title}** [${result.diagnosis.code}, ${result.diagnosis.severity}]`);
    lines.push(`- Detail: ${result.diagnosis.detail}`);
    if (result.error) lines.push(`- Error: ${result.error}`);
    if (result.pendingQuery) {
      lines.push(`- Pending query: ${result.pendingQuery.type} / ${result.pendingQuery.callbackKey} / ${result.pendingQuery.title} / options ${result.pendingQuery.options}`);
    }
    lines.push('');
    lines.push('### Board');
    lines.push('');
    for (const [uid, board] of Object.entries(result.finalBoard as any)) {
      lines.push(`#### ${uid} - ${(board as any).name}`);
      lines.push('');
      lines.push(formatBoardSummary(board));
      lines.push('');
    }
    lines.push('### Key Decisions');
    lines.push('');
    const decisionRows = buildDecisionRows(result);
    if (decisionRows.length === 0) {
      lines.push('- No AI decisions captured.');
    } else {
      lines.push(markdownTable(
        ['Turn', 'Player', 'Phase', 'Action', 'Subject', 'Score', 'Reason', 'Details'],
        decisionRows
      ));
    }
    lines.push('');
    lines.push('### Last Logs');
    lines.push('');
    const logs = result.lastLogs.slice(-10);
    if (logs.length === 0) {
      lines.push('- No logs captured.');
    } else {
      logs.forEach(log => lines.push(`- ${log}`));
    }
    lines.push('');
  });

  return `${lines.join('\n').trim()}\n`;
}

async function main() {
  await initServerCardLibrary();
  const catalogRefs = uniqueCatalogRefs(await loadServerCards());
  const decks = new Map<string, Card[]>();

  for (const profile of AI_DECK_PROFILES) {
    decks.set(profile.id, resolveDeck(profile, catalogRefs));
  }

  const results: MatchResult[] = [];
  const schedule: Array<{ profileA: DeckAiProfile; profileB: DeckAiProfile; firstSeat: Seat; gameIndex: number }> = [];
  for (let i = 0; i < AI_DECK_PROFILES.length; i++) {
    for (let j = i + 1; j < AI_DECK_PROFILES.length; j++) {
      const profileA = AI_DECK_PROFILES[i];
      const profileB = AI_DECK_PROFILES[j];
      for (let gameIndex = 0; gameIndex < gamesPerSide; gameIndex++) {
        schedule.push({ profileA, profileB, firstSeat: 0, gameIndex });
        schedule.push({ profileA, profileB, firstSeat: 1, gameIndex });
      }
    }
  }

  const filteredSchedule = deckFilter
    ? schedule.filter(match =>
      match.profileA.id === deckFilter ||
      match.profileB.id === deckFilter ||
      match.profileA.displayName === deckFilter ||
      match.profileB.displayName === deckFilter
    )
    : schedule;

  for (const match of filteredSchedule.slice(matchOffset, matchOffset + matchLimit)) {
    console.log(`[AI Eval] ${match.profileA.displayName} vs ${match.profileB.displayName}, first: ${match.firstSeat === 0 ? match.profileA.displayName : match.profileB.displayName}`);
    results.push(await runSingleMatch(
      match.profileA,
      decks.get(match.profileA.id)!,
      match.profileB,
      decks.get(match.profileB.id)!,
      match.firstSeat,
      match.gameIndex
    ));
  }

  const report = {
    createdAt: new Date().toISOString(),
    gamesPerSide,
    matchLimit: Number.isFinite(matchLimit) ? matchLimit : null,
    matchOffset,
    deckFilter,
    maxSteps,
    maxTurns,
    stepTimeoutMs,
    decisionLogLimit,
    cardKnowledge: summarizeCardKnowledge(),
    deckProfiles: AI_DECK_PROFILES.map(({ id, displayName, shareCode }) => ({ id, displayName, shareCode })),
    summary: buildSummary(results),
    aiDiagnostics: buildAiDiagnostics(results, { maxSteps, maxTurns }),
    results,
  };

  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportId = Date.now();
  const reportPath = path.join(reportsDir, `ai-eval-${reportId}.json`);
  const latestPath = path.join(reportsDir, 'ai-eval-latest.json');
  const markdownReport = buildMarkdownReport(report);
  const markdownPath = path.join(reportsDir, `ai-eval-${reportId}.md`);
  const latestMarkdownPath = path.join(reportsDir, 'ai-eval-latest.md');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(markdownPath, markdownReport, 'utf8');
  fs.writeFileSync(latestMarkdownPath, markdownReport, 'utf8');

  console.log(`AI evaluation finished: ${results.length} games`);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report: ${reportPath}`);
  console.log(`Markdown: ${markdownPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
