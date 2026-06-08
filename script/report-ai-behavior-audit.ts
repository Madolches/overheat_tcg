import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

type Severity = 'error' | 'warning' | 'info';

type BehaviorFinding = {
  code: string;
  severity: Severity;
  gameId: string;
  matchup: string;
  deck?: string;
  turn?: number;
  phase?: string;
  action?: string;
  subject?: string;
  detail: string;
  recommendation: string;
};

type FindingGroup = {
  key: string;
  priority: 'P0' | 'P1' | 'P2';
  severity: Severity;
  deck: string;
  code: string;
  subject: string;
  count: number;
  games: string[];
  firstTurn?: number;
  latestTurn?: number;
  recommendation: string;
  sampleDetail: string;
};

type SuggestedRegressionScenario = {
  priority: 'P0' | 'P1' | 'P2';
  deck: string;
  code: string;
  gameId: string;
  turn?: number;
  phase?: string;
  action?: string;
  subject?: string;
  failure: string;
  expectation: string;
};

const SEVERITY_RANK: Record<Severity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

const DEFAULT_EVALUATE_ARGS = {
  games: '1',
  matchLimit: '12',
  maxSteps: '1000',
  maxTurns: '40',
  stepTimeoutMs: '5000',
  decisionLogLimit: '260',
};

const failOn = (() => {
  const value = argValue('fail-on') as Severity | undefined;
  return value && SEVERITY_RANK[value] ? value : undefined;
})();

const ISSUE_META: Record<string, { severity: Severity; recommendation: string }> = {
  STEP_LIMIT_COUNTERING_PENDING: {
    severity: 'error',
    recommendation: 'Inspect the latest COUNTERING decisions and failed effect/story attempts; the AI may be holding priority or retrying an illegal action.',
  },
  STEP_TIMEOUT_COUNTERING: {
    severity: 'error',
    recommendation: 'Inspect COUNTERING priority, stack resolution, and pass/failure handling. This is the highest-risk stall class.',
  },
  STEP_TIMEOUT: {
    severity: 'error',
    recommendation: 'Inspect the final phase and active player. Add a focused regression once the repeated decision pattern is identified.',
  },
  SIMULATION_ERROR: {
    severity: 'error',
    recommendation: 'Check the thrown error first; if it is a timeout, classify the final phase and add a focused scenario.',
  },
  STEP_LIMIT_CONFRONTATION: {
    severity: 'error',
    recommendation: 'Check confrontation stack resolution and pass behavior; add a scenario for the last recorded stack state.',
  },
  STEP_LIMIT_QUERY_PENDING: {
    severity: 'warning',
    recommendation: 'Check the pending query callback and options. Add query scoring or skip the effect when no safe target exists.',
  },
  STEP_LIMIT_MAIN: {
    severity: 'warning',
    recommendation: 'Look for repeated low-value play/effect choices in MAIN. Tighten action thresholds or mark the effect as once-per-window skipped after failure.',
  },
  STEP_LIMIT_BATTLE_DECLARATION_READY_ATTACKERS: {
    severity: 'warning',
    recommendation: 'Attack selection may be indecisive. Inspect ATTACK candidates and unfavorable-attack holding rules.',
  },
  MISSED_LETHAL: {
    severity: 'warning',
    recommendation: 'Convert the match turn into a hard scenario and make lethal/erosion-lethal attack plans override development.',
  },
  UNDER_PRESSURE_NO_STABILIZE: {
    severity: 'warning',
    recommendation: 'Increase defender reserve or defensive effect priority for this matchup and deck profile.',
  },
  BAD_PAYMENT: {
    severity: 'warning',
    recommendation: 'Raise payment preservation value for ready defenders, current attackers, and godmark units.',
  },
  OVER_DEVELOP: {
    severity: 'info',
    recommendation: 'If repeated, make attack-before-developing stricter in closing windows.',
  },
  BAD_EFFECT_TIMING: {
    severity: 'warning',
    recommendation: 'Add an effect timing override or explicit deck strategy so the effect waits for its tactical window.',
  },
  QUERY_FAILED: {
    severity: 'error',
    recommendation: 'Add target-count gating before activation, or teach chooseQuerySelections how to safely answer this query.',
  },
  EFFECT_FAILED: {
    severity: 'error',
    recommendation: 'Check effect legality, costs, targetSpec, and failure skip handling for the effect id.',
  },
  LOW_VALUE_COUNTERING_ACTION: {
    severity: 'warning',
    recommendation: 'Raise the COUNTERING threshold or penalize setup/resource tags outside a concrete battle/chain payoff.',
  },
  BAD_ATTACK_INTO_STRONG_DEFENDER: {
    severity: 'warning',
    recommendation: 'Tighten attack scoring when the opponent has ready defenders and the attack is not lethal or erosion-critical.',
  },
  BAD_ATTACK_LOST_UNIT: {
    severity: 'warning',
    recommendation: 'Protect high-value attackers from non-lethal trades; add a card-specific attack window if this unit needs a setup effect first.',
  },
  EFFECT_WITH_NO_PAYOFF: {
    severity: 'warning',
    recommendation: 'Add an effect timing override or require a concrete payoff tag before activating this effect in battle/counter windows.',
  },
  BAD_EQUIP_TARGET: {
    severity: 'warning',
    recommendation: 'Inspect the equip query choice and add a preferred host rule for the deck/card profile.',
  },
  BAD_ALLIANCE_CHOICE: {
    severity: 'warning',
    recommendation: 'Prefer higher-value alliance attack plans when their payoff is ready; penalize ordinary attacks that spend key attackers.',
  },
  OVERCOMMIT_BOARD: {
    severity: 'warning',
    recommendation: 'When the plan says attack before developing, move to battle before playing extra cards unless the card immediately creates lethal or defense.',
  },
  MISSED_ATTACK_WINDOW: {
    severity: 'info',
    recommendation: 'Inspect whether development, low score thresholds, or defender reservation prevented a planned attack window.',
  },
  WASTED_PROTECTION: {
    severity: 'warning',
    recommendation: 'Hold protection stories/effects until a valuable unit is actually threatened by battle, destruction, or a chain effect.',
  },
  REPEATED_EFFECT_FAILURE: {
    severity: 'error',
    recommendation: 'Add a per-window failure skip or fix the effect condition/target precheck.',
  },
  HIGH_PAYMENT_RISK: {
    severity: 'warning',
    recommendation: 'Tune payment scoring to protect defenders and core resources under pressure.',
  },
  LOW_DECK_PAYMENT: {
    severity: 'warning',
    recommendation: 'Reduce deck-payment willingness at low deck or high erosion unless the action is immediately lethal.',
  },
  HIGH_VALUE_BATTLE_LOSS: {
    severity: 'warning',
    recommendation: 'Inspect the preceding ATTACK/DEFEND decision; add a card-specific safe-attack or safe-defense rule.',
  },
};

const HIGH_VALUE_NAME_PATTERNS = [
  /God|Goddess|神|神蚀|高价值|核心|主轴|ace|boss|core|key/i,
];

function argValue(name: string) {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
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

function hasTimingWarningText(text: string) {
  if (/\bprefers\s+(?:MAIN|BATTLE|BATTLE_FREE|COUNTERING|DEFENSE_DECLARATION|DAMAGE_CALCULATION)\b/i.test(text)) return true;
  return text.split(/[、,|]/).some(part => /timing\s+[^、,|]*-[0-9]/i.test(part));
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function countBy<T>(items: T[], keyOf: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function topEntries(record: Record<string, number>, limit = 20) {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function priorityFor(severity: Severity, count: number): 'P0' | 'P1' | 'P2' {
  if (severity === 'error') return 'P0';
  if (count >= 3 || severity === 'warning') return 'P1';
  return 'P2';
}

function normalizeSubject(value: unknown) {
  return String(value || 'UNKNOWN').slice(0, 120);
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function detail(log: any, key: string) {
  const value = log?.details?.[key];
  return value === undefined || value === null ? '' : String(value);
}

function scoreOf(log: any) {
  const score = Number(log?.score);
  return Number.isFinite(score) ? score : undefined;
}

function numericDetail(log: any, key: string, fallback = 0) {
  const value = Number(log?.details?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanDetail(log: any, key: string) {
  const value = log?.details?.[key];
  return value === true || value === 'true' || value === 1 || value === '1';
}

function candidateText(log: any) {
  if (!Array.isArray(log?.candidates)) return '';
  return log.candidates
    .slice(0, 5)
    .map((candidate: any) => `${candidate?.name || ''} ${candidate?.score ?? ''}`)
    .join(' ');
}

function decisionText(log: any, extraDetailKeys: string[] = []) {
  const detailPart = extraDetailKeys.map(key => detail(log, key)).filter(Boolean).join(' ');
  return `${log?.subject || ''} ${log?.reason || ''} ${detailPart} ${candidateText(log)}`;
}

function hasClearTacticalPayoff(text: string) {
  return /lethal|closing|close|threat|save|saves|protect|prevent|counter|combat|battle|attack|defend|defender|damage|destroy|remove|removal|bounce|stun|silence|cannot defend|combo|alliance|reset|boost|tempo|pressure|race/i.test(text);
}

function looksLikeSetupOnly(text: string) {
  return /draw|search|setup|engine|resource|cycle|recycle|revive|summon|develop|value|hand|deck.*hand|main-phase/i.test(text);
}

function looksLikeProtection(text: string) {
  return /protect|prevent|prevent-destroy|indestructible|save|barrier|battle save|damage replacement/i.test(text);
}

function looksLikeEquip(text: string) {
  return /equip|equip_universal|host/i.test(text);
}

function isAttackAction(action: string) {
  return action === 'ATTACK';
}

function isSubstantiveTurnAction(action: string) {
  return [
    'PLAY_CARD',
    'ACTIVATE_EFFECT',
    'PLAY_BATTLE_STORY',
    'PLAY_CONFRONTATION_STORY',
    'ENTER_BATTLE',
    'ATTACK',
    'HOLD_ATTACKERS',
    'RETURN_MAIN',
    'END_TURN',
  ].includes(action);
}

function severityFor(code: string, fallback: Severity = 'warning') {
  return ISSUE_META[code]?.severity || fallback;
}

function recommendationFor(code: string) {
  return ISSUE_META[code]?.recommendation || 'Inspect the nearby decision logs and add a focused hard AI scenario if this repeats.';
}

function matchupOf(result: any) {
  return `${result.deckA || 'A'} vs ${result.deckB || 'B'}`;
}

function addFinding(findings: BehaviorFinding[], result: any, code: string, fields: Partial<BehaviorFinding>) {
  findings.push({
    code,
    severity: fields.severity || severityFor(code),
    gameId: result.gameId || '(unknown game)',
    matchup: matchupOf(result),
    detail: fields.detail || '',
    recommendation: fields.recommendation || recommendationFor(code),
    deck: fields.deck,
    turn: fields.turn,
    phase: fields.phase,
    action: fields.action,
    subject: fields.subject,
  });
}

function highValueName(text: string) {
  return HIGH_VALUE_NAME_PATTERNS.some(pattern => pattern.test(text));
}

function analyzeBattleLogText(findings: BehaviorFinding[], result: any) {
  const logs = Array.isArray(result.lastLogs) ? result.lastLogs : [];
  for (const text of logs) {
    const line = String(text || '');
    if (!highValueName(line)) continue;
    if (!/破坏|同归于尽|被破坏|destroy/i.test(line)) continue;
    addFinding(findings, result, 'HIGH_VALUE_BATTLE_LOSS', {
      severity: 'warning',
      detail: `Recent battle log mentions a high-value card being destroyed: ${line}`,
    });
  }
}

function analyzeDiagnosis(findings: BehaviorFinding[], result: any) {
  const diagnosis = result.diagnosis || {};
  const detailText = `${diagnosis.title || ''}: ${diagnosis.detail || ''}`;
  const timeoutPhaseMatch = detailText.match(/Step timeout .* phase ([A-Z_]+)/i);
  const code = timeoutPhaseMatch
    ? timeoutPhaseMatch[1] === 'COUNTERING'
      ? 'STEP_TIMEOUT_COUNTERING'
      : 'STEP_TIMEOUT'
    : String(diagnosis.code || '');
  if (code !== 'FINISHED' && (diagnosis.severity === 'warning' || diagnosis.severity === 'error' || /^STEP_LIMIT/i.test(code))) {
    addFinding(findings, result, code || 'MATCH_DIAGNOSIS', {
      severity: diagnosis.severity === 'error' ? 'error' : severityFor(code, 'warning'),
      detail: detailText,
    });
  }

  for (const [metric, count] of Object.entries(diagnosis.metrics || {})) {
    if (metric === 'BAD_EFFECT_TIMING') continue;
    const numeric = Number(count);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    addFinding(findings, result, metric, {
      severity: severityFor(metric, numeric >= 3 ? 'error' : 'warning'),
      detail: `${metric} occurred ${numeric} time(s) in decision diagnostics.`,
    });
  }
}

function analyzeTurnWindows(findings: BehaviorFinding[], result: any) {
  const logs = Array.isArray(result.aiDecisionLogs) ? result.aiDecisionLogs : [];
  const grouped = new Map<string, { plan?: any; logs: any[] }>();

  logs.forEach((rawLog: any, index: number) => {
    if (rawLog?.turn === undefined || rawLog?.turn === null) return;
    const log = { ...rawLog, __index: index };
    const key = `${log.playerUid || log.playerName || log.profileId || 'unknown'}:${log.turn}`;
    const entry = grouped.get(key) || { logs: [] };
    entry.logs.push(log);
    if (log.action === 'TURN_PLAN') entry.plan = log;
    grouped.set(key, entry);
  });

  for (const trace of grouped.values()) {
    const plan = trace.plan;
    if (!plan) continue;
    const deck = plan.playerName || plan.profileId || plan.playerUid;
    const afterPlan = trace.logs.filter(log => log.__index > plan.__index);
    const actionsAfterPlan = afterPlan.map(log => String(log.action || ''));
    const ended = actionsAfterPlan.includes('END_TURN');
    const attackLogs = afterPlan.filter(log => isAttackAction(String(log.action || '')));
    const planText = decisionText(plan, ['notes', 'tacticalNotes', 'tacticalLine']);
    const totalDamage = numericDetail(plan, 'totalDamage');
    const damageToCritical = numericDetail(plan, 'damageToCritical');
    const hasLikelyDefenders = plan.details?.likelyDefenders !== undefined && plan.details?.likelyDefenders !== null;
    const likelyDefenders = hasLikelyDefenders ? numericDetail(plan, 'likelyDefenders') : Number.POSITIVE_INFINITY;
    const damageThroughLikelyDefenders = numericDetail(plan, 'damageThroughLikelyDefenders');
    const lethalWindow =
      booleanDetail(plan, 'lethalWindow') ||
      (likelyDefenders === 0 && damageToCritical > 0 && totalDamage >= damageToCritical && totalDamage > 0) ||
      (damageThroughLikelyDefenders > 0 && damageToCritical > 0 && damageThroughLikelyDefenders >= damageToCritical);
    const attackBeforeDeveloping = booleanDetail(plan, 'attackBeforeDeveloping');
    const firstSubstantive = afterPlan.find(log => isSubstantiveTurnAction(String(log.action || '')));

    if (lethalWindow && ended && attackLogs.length === 0) {
      addFinding(findings, result, 'MISSED_LETHAL', {
        deck,
        turn: plan.turn,
        phase: plan.phase,
        action: plan.action,
        subject: plan.subject,
        detail: `${deck} planned a closing window but ended without attacking: totalDamage=${totalDamage}, damageToCritical=${damageToCritical}, tactical=${detail(plan, 'tacticalLine') || plan.subject || ''}.`,
      });
    }

    if (attackBeforeDeveloping && firstSubstantive) {
      const action = String(firstSubstantive.action || '');
      const firstText = decisionText(firstSubstantive, ['notes', 'effectId', 'type']);
      const immediatePayoff = hasClearTacticalPayoff(firstText) && (scoreOf(firstSubstantive) ?? 0) >= 30;
      if (['PLAY_CARD', 'ACTIVATE_EFFECT', 'PLAY_BATTLE_STORY'].includes(action) && !immediatePayoff) {
        addFinding(findings, result, 'OVERCOMMIT_BOARD', {
          deck,
          turn: firstSubstantive.turn,
          phase: firstSubstantive.phase,
          action,
          subject: firstSubstantive.subject,
          detail: `${deck} plan asked to attack before developing, but first action was ${action} (${firstSubstantive.subject || ''}) with score=${scoreOf(firstSubstantive) ?? 'n/a'}.`,
        });
      }
    }

    if (attackBeforeDeveloping && ended && attackLogs.length === 0) {
      addFinding(findings, result, 'MISSED_ATTACK_WINDOW', {
        deck,
        turn: plan.turn,
        phase: plan.phase,
        action: plan.action,
        subject: plan.subject,
        detail: `${deck} marked attackBeforeDeveloping but ended without an ATTACK.`,
      });
    }
  }
}

function analyzeDecisionLogs(findings: BehaviorFinding[], result: any) {
  const logs = Array.isArray(result.aiDecisionLogs) ? result.aiDecisionLogs : [];
  const failedEffects = new Map<string, { count: number; log: any }>();

  for (const log of logs) {
    const action = String(log.action || '');
    const score = scoreOf(log);
    const deck = log.playerName || log.profileId || log.playerUid;
    const effectId = detail(log, 'effectId') || log.subject || 'UNKNOWN_EFFECT';

    if (action === 'QUERY_FAILED') {
      addFinding(findings, result, 'QUERY_FAILED', {
        deck,
        turn: log.turn,
        phase: log.phase,
        action,
        subject: log.subject,
        detail: `${deck} failed query ${log.subject || ''}: ${log.reason || ''}`,
      });
    }

    if (action === 'ACTIVATE_EFFECT_FAILED') {
      const key = `${deck}:${effectId}`;
      const current = failedEffects.get(key) || { count: 0, log };
      current.count++;
      current.log = log;
      failedEffects.set(key, current);
      addFinding(findings, result, 'EFFECT_FAILED', {
        deck,
        turn: log.turn,
        phase: log.phase,
        action,
        subject: effectId,
        detail: `${deck} failed to activate ${effectId}: ${log.reason || ''}`,
      });
    }

    if (
      log.phase === 'COUNTERING' &&
      ['ACTIVATE_EFFECT', 'PLAY_CONFRONTATION_STORY', 'PLAY_BATTLE_STORY'].includes(action) &&
      score !== undefined &&
      score < 18
    ) {
      addFinding(findings, result, 'LOW_VALUE_COUNTERING_ACTION', {
        deck,
        turn: log.turn,
        phase: log.phase,
        action,
        subject: log.subject,
        detail: `${deck} used ${action} in COUNTERING below threshold: score=${score.toFixed(1)}, subject=${log.subject || ''}.`,
      });
    }

    if (action === 'ATTACK') {
      const likelyDefenders = numericDetail(log, 'likelyDefenders');
      const lethalWindow = booleanDetail(log, 'lethalWindow');
      const erosionPressureWindow = booleanDetail(log, 'erosionPressureWindow');
      const reservedDefenders = numericDetail(log, 'reservedDefenders');
      if (
        likelyDefenders > 0 &&
        !lethalWindow &&
        !erosionPressureWindow &&
        score !== undefined &&
        score < 12
      ) {
        addFinding(findings, result, 'BAD_ATTACK_INTO_STRONG_DEFENDER', {
          deck,
          turn: log.turn,
          phase: log.phase,
          action,
          subject: log.subject,
          detail: `${deck} attacked into ${likelyDefenders} ready defender(s) without a closing window: score=${score.toFixed(1)}, reservedDefenders=${reservedDefenders}.`,
        });
      }
      if (
        likelyDefenders > 0 &&
        !lethalWindow &&
        score !== undefined &&
        score < 24 &&
        highValueName(`${log.subject || ''} ${candidateText(log)}`)
      ) {
        addFinding(findings, result, 'BAD_ATTACK_LOST_UNIT', {
          deck,
          turn: log.turn,
          phase: log.phase,
          action,
          subject: log.subject,
          detail: `${deck} risked a high-value attacker into ready defenders with a low score (${score.toFixed(1)}).`,
        });
      }
    }

    if (['ACTIVATE_EFFECT', 'PLAY_CONFRONTATION_STORY', 'PLAY_BATTLE_STORY'].includes(action)) {
      const text = decisionText(log, ['notes', 'effectId', 'type', 'selected']);
      const clearPayoff = hasClearTacticalPayoff(text);
      const setupOnly = looksLikeSetupOnly(text);
      const lowScore = score !== undefined && score < (log.phase === 'MAIN' ? 10 : 18);
      if ((setupOnly && !clearPayoff && log.phase !== 'MAIN') || (lowScore && setupOnly && !clearPayoff)) {
        addFinding(findings, result, 'EFFECT_WITH_NO_PAYOFF', {
          deck,
          turn: log.turn,
          phase: log.phase,
          action,
          subject: log.subject,
          detail: `${deck} used a setup/resource-looking action without a clear payoff: score=${score ?? 'n/a'}, text=${text.slice(0, 220)}.`,
        });
      }
      if (looksLikeProtection(text) && score !== undefined && score < 35 && !/threat|destroy|damage|battle|combat|counter|chain|save/i.test(text)) {
        addFinding(findings, result, 'WASTED_PROTECTION', {
          deck,
          turn: log.turn,
          phase: log.phase,
          action,
          subject: log.subject,
          detail: `${deck} used protection at a low score without an obvious threatened unit: score=${score.toFixed(1)}, text=${text.slice(0, 220)}.`,
        });
      }
      if (looksLikeEquip(text) && score !== undefined && score < 20) {
        addFinding(findings, result, 'BAD_EQUIP_TARGET', {
          deck,
          turn: log.turn,
          phase: log.phase,
          action,
          subject: log.subject,
          detail: `${deck} activated or chose an equip line at low value: score=${score.toFixed(1)}, text=${text.slice(0, 220)}.`,
        });
      }
    }

    if (action === 'ACTIVATE_EFFECT') {
      const notes = `${detail(log, 'notes')} ${log.reason || ''}`;
      const hasClearPayoff = /lethal|close|closing|saves|beats|threat|alliance|reset|斩杀|保|威胁/i.test(notes);
      if (hasTimingWarningText(notes) && !(hasClearPayoff && score !== undefined && score >= 18)) {
        addFinding(findings, result, 'BAD_EFFECT_TIMING', {
          deck,
          turn: log.turn,
          phase: log.phase,
          action,
          subject: log.subject,
          detail: `${deck} activated ${log.subject || effectId} despite timing warning: ${notes.slice(0, 220)}`,
        });
      }
    }

    if (action === 'PAYMENT') {
      const paymentRisk = normalizeNumber(log.details?.paymentRisk);
      const estimatedDeckPayment = normalizeNumber(log.details?.estimatedDeckPayment);
      const readyDefendersAfter = normalizeNumber(log.details?.readyDefendersAfterPayment);
      const paymentCost = normalizeNumber(log.details?.paymentCost);
      if (paymentRisk >= 35 || (paymentCost > 0 && readyDefendersAfter === 0 && /defense|防御|reserve/i.test(`${log.reason} ${log.subject}`))) {
        addFinding(findings, result, 'HIGH_PAYMENT_RISK', {
          deck,
          turn: log.turn,
          phase: log.phase,
          action,
          subject: log.subject,
          detail: `${deck} made a risky payment: risk=${paymentRisk.toFixed(1)}, selection=${detail(log, 'selection')}`,
        });
      }
      if (estimatedDeckPayment > 0 && /low deck|critical deck|牌库|deck payment risk/i.test(`${log.reason} ${detail(log, 'selection')}`)) {
        addFinding(findings, result, 'LOW_DECK_PAYMENT', {
          deck,
          turn: log.turn,
          phase: log.phase,
          action,
          subject: log.subject,
          detail: `${deck} paid from deck under possible deck pressure: estimatedDeckPayment=${estimatedDeckPayment}.`,
        });
      }
    }
  }

  for (const [key, entry] of failedEffects.entries()) {
    if (entry.count < 2) continue;
    const log = entry.log;
    addFinding(findings, result, 'REPEATED_EFFECT_FAILURE', {
      deck: log.playerName || log.profileId || log.playerUid,
      turn: log.turn,
      phase: log.phase,
      action: log.action,
      subject: key,
      detail: `${key} failed ${entry.count} time(s) in the captured decision log.`,
    });
  }
}

function buildFixPriorityGroups(findings: BehaviorFinding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup & { gameSet: Set<string> }>();

  for (const finding of findings) {
    const deck = finding.deck || 'UNKNOWN';
    const subject = normalizeSubject(finding.subject || finding.action || finding.phase || finding.code);
    const key = `${deck}|${finding.code}|${subject}`;
    const current = groups.get(key) || {
      key,
      priority: 'P2' as const,
      severity: finding.severity,
      deck,
      code: finding.code,
      subject,
      count: 0,
      games: [],
      gameSet: new Set<string>(),
      firstTurn: finding.turn,
      latestTurn: finding.turn,
      recommendation: finding.recommendation,
      sampleDetail: finding.detail,
    };

    current.count++;
    current.gameSet.add(finding.gameId);
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current.severity]) current.severity = finding.severity;
    if (finding.turn !== undefined) {
      current.firstTurn = current.firstTurn === undefined ? finding.turn : Math.min(current.firstTurn, finding.turn);
      current.latestTurn = current.latestTurn === undefined ? finding.turn : Math.max(current.latestTurn, finding.turn);
    }
    current.priority = priorityFor(current.severity, current.count);
    current.recommendation = finding.recommendation || current.recommendation;
    current.sampleDetail = finding.detail || current.sampleDetail;
    groups.set(key, current);
  }

  return [...groups.values()]
    .map(({ gameSet, ...group }) => ({
      ...group,
      games: [...gameSet].slice(0, 5),
    }))
    .sort((a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.count - a.count ||
      a.deck.localeCompare(b.deck) ||
      a.code.localeCompare(b.code)
    );
}

function expectationForFinding(finding: BehaviorFinding) {
  if (finding.code === 'QUERY_FAILED') return 'AI should produce a legal selection or skip the effect before opening an unanswerable query.';
  if (finding.code === 'EFFECT_FAILED' || finding.code === 'REPEATED_EFFECT_FAILURE') return 'AI should not attempt this effect unless costs, timing, and targets are legal.';
  if (finding.code === 'MISSED_LETHAL') return 'AI should attack or choose the lethal line before ending/developing.';
  if (finding.code === 'BAD_ATTACK_INTO_STRONG_DEFENDER' || finding.code === 'BAD_ATTACK_LOST_UNIT') return 'AI should hold the attacker unless the attack is lethal, erosion-critical, or trades favorably.';
  if (finding.code === 'HIGH_PAYMENT_RISK' || finding.code === 'LOW_DECK_PAYMENT' || finding.code === 'BAD_PAYMENT') return 'AI should choose a safer payment or decline the action under defensive/deck pressure.';
  if (finding.code === 'LOW_VALUE_COUNTERING_ACTION') return 'AI should pass the countering window unless the action has clear tactical payoff.';
  if (finding.code === 'OVERCOMMIT_BOARD' || finding.code === 'MISSED_ATTACK_WINDOW') return 'AI should enter battle before extra development once the turn plan says to attack.';
  return 'AI should avoid repeating this finding in a focused hard-AI scenario.';
}

function buildSuggestedRegressionScenarios(findings: BehaviorFinding[]): SuggestedRegressionScenario[] {
  const selected: SuggestedRegressionScenario[] = [];
  const seen = new Set<string>();
  const ranked = [...findings].sort((a, b) =>
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    String(a.deck || '').localeCompare(String(b.deck || '')) ||
    a.code.localeCompare(b.code)
  );

  for (const finding of ranked) {
    if (!finding.deck) continue;
    if (![
      'QUERY_FAILED',
      'EFFECT_FAILED',
      'REPEATED_EFFECT_FAILURE',
      'MISSED_LETHAL',
      'BAD_ATTACK_INTO_STRONG_DEFENDER',
      'BAD_ATTACK_LOST_UNIT',
      'HIGH_PAYMENT_RISK',
      'LOW_DECK_PAYMENT',
      'BAD_PAYMENT',
      'LOW_VALUE_COUNTERING_ACTION',
      'OVERCOMMIT_BOARD',
      'MISSED_ATTACK_WINDOW',
    ].includes(finding.code)) continue;

    const key = `${finding.deck}|${finding.code}|${normalizeSubject(finding.subject)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({
      priority: priorityFor(finding.severity, 1),
      deck: finding.deck,
      code: finding.code,
      gameId: finding.gameId,
      turn: finding.turn,
      phase: finding.phase,
      action: finding.action,
      subject: finding.subject,
      failure: finding.detail,
      expectation: expectationForFinding(finding),
    });
    if (selected.length >= 20) break;
  }

  return selected;
}

function buildBehaviorReport(evalReport: any, sourcePath: string, findings: BehaviorFinding[]) {
  const severityCounts = countBy(findings, finding => finding.severity);
  const codeCounts = countBy(findings, finding => finding.code);
  const deckCounts = countBy(findings.filter(finding => finding.deck), finding => finding.deck || 'UNKNOWN');
  const sortedFindings = [...findings].sort((a, b) =>
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    a.code.localeCompare(b.code) ||
    a.matchup.localeCompare(b.matchup)
  );

  const fixPriorityGroups = buildFixPriorityGroups(sortedFindings);
  const suggestedRegressionScenarios = buildSuggestedRegressionScenarios(sortedFindings);

  return {
    createdAt: new Date().toISOString(),
    sourcePath,
    sourceCreatedAt: evalReport.createdAt,
    games: Array.isArray(evalReport.results) ? evalReport.results.length : 0,
    summary: {
      errors: severityCounts.error || 0,
      warnings: severityCounts.warning || 0,
      info: severityCounts.info || 0,
      totalFindings: findings.length,
    },
    codeCounts,
    deckCounts,
    fixPriorityGroups,
    suggestedRegressionScenarios,
    findings: sortedFindings,
  };
}

function buildMarkdown(report: ReturnType<typeof buildBehaviorReport>) {
  const lines: string[] = [];
  lines.push('# AI Behavior Audit');
  lines.push('');
  lines.push(`- Created: ${report.createdAt}`);
  lines.push(`- Source: ${report.sourcePath}`);
  lines.push(`- Source created: ${report.sourceCreatedAt || 'unknown'}`);
  lines.push(`- Games analyzed: ${report.games}`);
  lines.push(`- Findings: ${report.summary.totalFindings} (errors ${report.summary.errors}, warnings ${report.summary.warnings}, info ${report.summary.info})`);
  lines.push('');

  lines.push('## Issue Counts');
  lines.push('');
  const issueRows = topEntries(report.codeCounts, 30).map(([code, count]) => [code, count]);
  lines.push(issueRows.length ? markdownTable(['Code', 'Count'], issueRows) : '- No behavior anomalies detected.');
  lines.push('');

  lines.push('## Deck Counts');
  lines.push('');
  const deckRows = topEntries(report.deckCounts, 20).map(([deck, count]) => [deck, count]);
  lines.push(deckRows.length ? markdownTable(['Deck', 'Count'], deckRows) : '- No deck-specific anomalies detected.');
  lines.push('');

  lines.push('## Fix Priority Leaderboard');
  lines.push('');
  if (report.fixPriorityGroups.length === 0) {
    lines.push('- No fix priorities generated.');
  } else {
    lines.push(markdownTable(
      ['Priority', 'Severity', 'Deck', 'Code', 'Subject', 'Count', 'Games', 'Turns', 'Recommendation', 'Sample'],
      report.fixPriorityGroups.slice(0, 30).map(group => [
        group.priority,
        group.severity,
        group.deck,
        group.code,
        group.subject,
        group.count,
        group.games.join(', '),
        group.firstTurn === undefined ? '' : `${group.firstTurn}-${group.latestTurn ?? group.firstTurn}`,
        group.recommendation,
        group.sampleDetail,
      ])
    ));
  }
  lines.push('');

  lines.push('## Suggested Regression Scenarios');
  lines.push('');
  if (report.suggestedRegressionScenarios.length === 0) {
    lines.push('- No regression scenarios suggested.');
  } else {
    lines.push(markdownTable(
      ['Priority', 'Deck', 'Code', 'Game', 'Turn', 'Phase', 'Action', 'Subject', 'Failure', 'Expected'],
      report.suggestedRegressionScenarios.slice(0, 20).map(scenario => [
        scenario.priority,
        scenario.deck,
        scenario.code,
        scenario.gameId,
        scenario.turn ?? '',
        scenario.phase || '',
        scenario.action || '',
        scenario.subject || '',
        scenario.failure,
        scenario.expectation,
      ])
    ));
  }
  lines.push('');

  lines.push('## Findings');
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('- No findings.');
  } else {
    lines.push(markdownTable(
      ['Severity', 'Code', 'Matchup', 'Deck', 'Turn', 'Phase', 'Action', 'Subject', 'Detail', 'Recommendation'],
      report.findings.slice(0, 80).map(finding => [
        finding.severity,
        finding.code,
        finding.matchup,
        finding.deck || '',
        finding.turn ?? '',
        finding.phase || '',
        finding.action || '',
        finding.subject || '',
        finding.detail,
        finding.recommendation,
      ])
    ));
  }
  lines.push('');

  lines.push('## How To Use');
  lines.push('');
  lines.push('- Convert repeated warnings into focused scenarios in `script/test-hard-ai-scenarios.ts`.');
  lines.push('- Treat `STEP_LIMIT_*`, `QUERY_FAILED`, repeated `ACTIVATE_EFFECT_FAILED`, and low-score COUNTERING actions as first-priority fixes.');
  lines.push('- Treat `BAD_ATTACK_*`, `EFFECT_WITH_NO_PAYOFF`, and `OVERCOMMIT_BOARD` as card-understanding gaps to feed back into explicit deck strategy or effect timing knowledge.');
  lines.push('- Use `npm run ai:behavior-audit -- --no-run` to re-read the latest evaluation without running new games.');

  return lines.join('\n');
}

function evaluateArgsFromCli() {
  const args: string[] = [];
  for (const [name, fallback] of Object.entries(DEFAULT_EVALUATE_ARGS)) {
    args.push(`--${name}=${argValue(name) || fallback}`);
  }
  for (const optional of ['deck', 'deckId', 'matchOffset']) {
    const value = argValue(optional);
    if (value) args.push(`--${optional}=${value}`);
  }
  return args;
}

function runEvaluation() {
  const args = ['--import', 'tsx', 'script/evaluate-ai.ts', ...evaluateArgsFromCli()];
  const command = process.execPath;
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`evaluate-ai failed with status ${result.status ?? 'unknown'}${result.error ? `: ${result.error.message}` : ''}`);
  }
}

function resolveInputPath() {
  const explicit = argValue('input');
  if (explicit) return path.resolve(process.cwd(), explicit);
  return path.join(process.cwd(), 'reports', 'ai-eval-latest.json');
}

function main() {
  if (!hasFlag('no-run') && !argValue('input')) {
    runEvaluation();
  }

  const inputPath = resolveInputPath();
  const raw = fs.readFileSync(inputPath, 'utf8');
  const evalReport = JSON.parse(raw);
  const findings: BehaviorFinding[] = [];
  for (const result of evalReport.results || []) {
    analyzeDiagnosis(findings, result);
    analyzeTurnWindows(findings, result);
    analyzeDecisionLogs(findings, result);
    analyzeBattleLogText(findings, result);
  }

  const report = buildBehaviorReport(evalReport, path.relative(process.cwd(), inputPath), findings);
  const markdown = buildMarkdown(report);
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const id = Date.now();
  const jsonPath = path.join(reportsDir, `ai-behavior-audit-${id}.json`);
  const mdPath = path.join(reportsDir, `ai-behavior-audit-${id}.md`);
  const latestJsonPath = path.join(reportsDir, 'ai-behavior-audit-latest.json');
  const latestMdPath = path.join(reportsDir, 'ai-behavior-audit-latest.md');

  fs.writeFileSync(jsonPath, stringifyJson(report), 'utf8');
  fs.writeFileSync(mdPath, markdown, 'utf8');
  fs.writeFileSync(latestJsonPath, stringifyJson(report), 'utf8');
  fs.writeFileSync(latestMdPath, markdown, 'utf8');

  console.log(`AI behavior audit finished: ${report.summary.totalFindings} findings`);
  console.log(`Report: ${mdPath}`);
  if (failOn && report.findings.some(finding => SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[failOn])) {
    process.exitCode = 1;
  }
}

main();
