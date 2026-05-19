import fs from 'fs';
import path from 'path';
import { pool } from '../server/db';

type SampleRow = {
  id: string;
  game_id: string;
  created_at: number;
  finished_at: number;
  mode: string;
  bot_profile_id: string;
  bot_difficulty: string;
  opponent_archetype: string;
  opponent_traits: any;
  player_deck_hash: string;
  winner_side: 'bot' | 'player' | 'draw';
  win_reason: string;
  turn_count: number;
  final_phase: string;
  ai_decision_logs: any;
  battle_logs: any;
  final_board: any;
  diagnosis: any;
  ai_version: string;
};

const argValue = (name: string, fallback?: string) => {
  const raw = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : fallback;
};

const days = Number(argValue('days', '7'));
const limit = Number(argValue('limit', '500'));
const botFilter = argValue('bot') || argValue('botProfile');
const since = Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000;
const NON_NORMAL_WIN_REASON_PATTERNS = [
  /SURRENDER/i,
  /CONCEDE/i,
  /FORFEIT/i,
  /TIMEOUT/i,
  /MAX_/i,
  /SIMULATION/i,
  /ERROR/i,
  /ABORT/i,
  /CANCEL/i,
  /^UNKNOWN$/i,
];

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function pct(value: number, total: number) {
  if (total <= 0) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
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

function jsonSafeReplacer(_key: string, value: unknown) {
  if (typeof value !== 'bigint') return value;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : value.toString();
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value, jsonSafeReplacer, 2);
}

function ensureStats<T extends { games: number; botWins: number; playerWins: number; draws: number; totalTurns: number; warnings: number }>(
  map: Map<string, T>,
  key: string,
  create: () => T
) {
  if (!map.has(key)) map.set(key, create());
  return map.get(key)!;
}

function createStats() {
  return {
    games: 0,
    botWins: 0,
    playerWins: 0,
    draws: 0,
    totalTurns: 0,
    warnings: 0,
    softCompensations: 0,
    queryFailures: 0,
    effectFailures: 0,
    winReasons: {} as Record<string, number>,
    actions: {} as Record<string, number>,
  };
}

function addActionCounts(target: Record<string, number>, logs: any[]) {
  for (const log of logs) {
    const action = String(log?.action || 'UNKNOWN');
    target[action] = (target[action] || 0) + 1;
  }
}

function topEntries(record: Record<string, number>, limit = 8) {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function normalizeRows(rows: SampleRow[]) {
  return rows.map(row => ({
    ...row,
    opponent_traits: parseJson<string[]>(row.opponent_traits, []),
    ai_decision_logs: parseJson<any[]>(row.ai_decision_logs, []),
    battle_logs: parseJson<string[]>(row.battle_logs, []),
    final_board: parseJson<Record<string, any>>(row.final_board, {}),
    diagnosis: parseJson<Record<string, any>>(row.diagnosis, {}),
  }));
}

function isNormalWinReason(reason: string | undefined) {
  if (!reason) return false;
  return !NON_NORMAL_WIN_REASON_PATTERNS.some(pattern => pattern.test(reason));
}

function isNormalWinSample(sample: SampleRow) {
  return (sample.winner_side === 'bot' || sample.winner_side === 'player') &&
    isNormalWinReason(sample.win_reason);
}

type NormalizedSample = ReturnType<typeof normalizeRows>[number];
type IssueSeverity = 'error' | 'warning' | 'info';

type IssueFinding = {
  code: string;
  severity: IssueSeverity;
  sample: string;
  bot: string;
  turn?: number;
  phase?: string;
  action?: string;
  subject?: string;
  detail: string;
};

const ISSUE_META: Record<string, { label: string; severity: IssueSeverity; recommendation: string }> = {
  PLAYER_LOSS: {
    label: '真人正常获胜',
    severity: 'info',
    recommendation: '从该局关键回合提取失败场景，优先看终局前两回合的 TURN_PLAN / ATTACK / DEFEND。',
  },
  LOST_TO_BATTLE_DAMAGE: {
    label: '被战斗伤害击败',
    severity: 'warning',
    recommendation: '检查防御保留、攻击后留防、是否过度支付横置单位，以及是否低估玩家反击伤害。',
  },
  LOST_TO_EFFECT_OR_SPECIAL: {
    label: '被效果或特殊胜利击败',
    severity: 'warning',
    recommendation: '检查对玩家卡组画像的威胁识别，补充关键效果的反制、解场或保留资源规则。',
  },
  QUERY_FAILED: {
    label: '目标/选项查询失败',
    severity: 'error',
    recommendation: '补 chooseQuerySelections 目标选择规则，或给对应 callback/effectId 增加无目标时不发动的前置判断。',
  },
  EFFECT_FAILED: {
    label: '效果发动入口失败',
    severity: 'error',
    recommendation: '检查失败 effectId 的条件、费用、时点和目标预选，补 effectTimingKnowledge 或 avoidEffectIds。',
  },
  BAD_EFFECT_TIMING: {
    label: '疑似错误发动时点',
    severity: 'warning',
    recommendation: '给该效果补静态时点规则：主阶段、战斗自由时段、对抗窗口或斩杀窗口。',
  },
  BAD_PAYMENT: {
    label: '防守压力下支付过重',
    severity: 'warning',
    recommendation: '提高待防守单位、神蚀单位、combo 件和可攻击单位的支付保护分。',
  },
  LOW_DECK_PAYMENT: {
    label: '低牌库仍支付牌库费用',
    severity: 'warning',
    recommendation: '低牌库或高侵蚀时提高费用风险，除非已经是明确斩杀线。',
  },
  MISSED_LETHAL: {
    label: '疑似错过斩杀',
    severity: 'warning',
    recommendation: '让一回合斩杀搜索优先于铺场/发动普通效果，并把该回合固化为场景测试。',
  },
  MISSED_COMBO: {
    label: '疑似错过 combo',
    severity: 'warning',
    recommendation: '降低 combo 就绪时的发动阈值，或给对应卡组补 combo hook。',
  },
  UNDER_PRESSURE_NO_STABILIZE: {
    label: '受压时未转入防守',
    severity: 'warning',
    recommendation: '对玩家快攻/爆发画像提高 reserveDefenders 和防守模式权重。',
  },
  OVER_DEVELOP: {
    label: '有进攻窗口仍过度展开',
    severity: 'warning',
    recommendation: '当 tacticalLine 为 lethal/erosion-lethal 时，先攻击，再考虑主阶段展开。',
  },
  STORY_TIMING_RISK: {
    label: '故事卡使用时点可疑',
    severity: 'warning',
    recommendation: '检查故事卡是否有明确目标、战斗收益或 combo 目的；否则加入故事卡纪律规则。',
  },
  DECLINED_DEFENSE_ON_LOSS: {
    label: '败局中多次不防御',
    severity: 'warning',
    recommendation: '检查防御评分是否低估了玩家战斗伤害，尤其是低牌库/高侵蚀时。',
  },
  HELD_ATTACKERS_WHILE_BEHIND: {
    label: '落后时保留攻击手',
    severity: 'info',
    recommendation: '确认 HOLD_ATTACKERS 是否真的需要留防；若终局仍输，考虑提高抢血/抢侵蚀优先级。',
  },
};

function issueMeta(code: string) {
  return ISSUE_META[code] || {
    label: code,
    severity: 'warning' as IssueSeverity,
    recommendation: '查看该问题的示例决策日志，并补充对应卡组策略或通用规则。',
  };
}

function logDetail(log: any, key: string) {
  const value = log?.details?.[key];
  return value === undefined || value === null ? '' : String(value);
}

function numericLogDetail(log: any, key: string) {
  const value = Number(log?.details?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function truthyLogDetail(log: any, key: string) {
  const value = log?.details?.[key];
  return value === true || value === 'true' || value === 1 || value === '1';
}

function addIssue(
  findings: IssueFinding[],
  sample: NormalizedSample,
  code: string,
  detail: string,
  log?: any
) {
  findings.push({
    code,
    severity: issueMeta(code).severity,
    sample: sample.game_id,
    bot: sample.bot_profile_id || 'unknown',
    turn: log?.turn,
    phase: log?.phase,
    action: log?.action,
    subject: log?.subject,
    detail,
  });
}

function collectSampleIssues(sample: NormalizedSample): IssueFinding[] {
  type TurnTrace = {
    plan?: any;
    attacks: number;
    plays: number;
    effects: number;
    storyPlays: number;
    declinedDefenses: number;
    heldAttackers: number;
    exhaustedPayments: number;
    deckPayments: number;
    playBeforeAttack: number;
    comboActions: number;
    ended: boolean;
    firstAttackIndex?: number;
  };

  const findings: IssueFinding[] = [];
  const logs = sample.ai_decision_logs || [];
  const traces = new Map<string, TurnTrace>();

  const traceFor = (log: any) => {
    const key = `${log?.playerUid || sample.bot_profile_id}:${log?.turn || 0}`;
    if (!traces.has(key)) {
      traces.set(key, {
        attacks: 0,
        plays: 0,
        effects: 0,
        storyPlays: 0,
        declinedDefenses: 0,
        heldAttackers: 0,
        exhaustedPayments: 0,
        deckPayments: 0,
        playBeforeAttack: 0,
        comboActions: 0,
        ended: false,
      });
    }
    return traces.get(key)!;
  };

  if (sample.winner_side === 'player') {
    addIssue(findings, sample, 'PLAYER_LOSS', `玩家以 ${sample.win_reason || 'UNKNOWN'} 正常获胜`);
    if (/BATTLE_DAMAGE/i.test(sample.win_reason || '')) {
      addIssue(findings, sample, 'LOST_TO_BATTLE_DAMAGE', '终局来源为战斗伤害，优先检查防御和留防策略');
    } else if (/EFFECT|SPECIAL|KATHERINE/i.test(sample.win_reason || '')) {
      addIssue(findings, sample, 'LOST_TO_EFFECT_OR_SPECIAL', `终局来源为 ${sample.win_reason}`);
    }
  }

  for (let index = 0; index < logs.length; index++) {
    const log = logs[index];
    const trace = traceFor(log);
    const action = String(log?.action || '');

    if (action === 'TURN_PLAN') trace.plan = log;
    if (action === 'ATTACK' || action === 'COMBO_ALLIANCE_ATTACK') {
      trace.attacks++;
      trace.firstAttackIndex ??= index;
    }
    if (action === 'PLAY_CARD') {
      trace.plays++;
      if (trace.firstAttackIndex === undefined) trace.playBeforeAttack++;
      trace.exhaustedPayments += numericLogDetail(log, 'paymentExhaustsUnits');
      trace.deckPayments += numericLogDetail(log, 'estimatedDeckPayment');
      if (logDetail(log, 'type') === 'STORY') {
        trace.storyPlays++;
        const rawScore = numericLogDetail(log, 'rawScore');
        if (rawScore < 10) {
          addIssue(findings, sample, 'STORY_TIMING_RISK', `主阶段故事卡 rawScore=${rawScore.toFixed(1)}，需要确认是否有明确收益`, log);
        }
      }
    }
    if (action === 'PAYMENT') {
      trace.exhaustedPayments += numericLogDetail(log, 'paymentExhaustsUnits');
      trace.deckPayments += numericLogDetail(log, 'estimatedDeckPayment');
    }
    if (action === 'ACTIVATE_EFFECT' || action === 'PLAY_BATTLE_STORY') {
      trace.effects++;
      if (action === 'PLAY_BATTLE_STORY') {
        trace.storyPlays++;
        const battleAttackers = numericLogDetail(log, 'battleAttackers');
        const combo = logDetail(log, 'combo');
        if (battleAttackers <= 0 || /none/i.test(combo)) {
          addIssue(findings, sample, 'STORY_TIMING_RISK', '战斗故事卡缺少攻击者或 combo 目的，需要复查使用窗口', log);
        }
      }
    }
    if (action === 'DECLINE_DEFENSE') trace.declinedDefenses++;
    if (action === 'HOLD_ATTACKERS') trace.heldAttackers++;
    if (action === 'END_TURN') trace.ended = true;
    if (
      action === 'COMBO_ALLIANCE_ATTACK' ||
      action === 'PLAY_BATTLE_STORY' ||
      /201100037|eclipse|日蚀|combo/i.test(`${logDetail(log, 'effectId')} ${logDetail(log, 'combo')} ${log?.subject || ''}`)
    ) {
      trace.comboActions++;
    }

    if (action === 'QUERY_FAILED') {
      addIssue(findings, sample, 'QUERY_FAILED', log?.reason || '查询失败', log);
    }
    if (action === 'ACTIVATE_EFFECT_FAILED') {
      addIssue(findings, sample, 'EFFECT_FAILED', log?.reason || '效果发动失败', log);
    }
    if (action === 'ACTIVATE_EFFECT') {
      const notes = logDetail(log, 'notes');
      if (hasTimingWarningText(notes)) {
        addIssue(findings, sample, 'BAD_EFFECT_TIMING', notes || '效果时点评分为负', log);
      }
    }
  }

  for (const trace of traces.values()) {
    const plan = trace.plan;
    if (!plan) continue;

    const totalDamage = numericLogDetail(plan, 'totalDamage');
    const damageToCritical = Math.max(1, numericLogDetail(plan, 'damageToCritical'));
    const tacticalLine = logDetail(plan, 'tacticalLine');
    const lethalPotential =
      truthyLogDetail(plan, 'lethalWindow') ||
      tacticalLine === 'lethal' ||
      tacticalLine === 'erosion-lethal' ||
      totalDamage >= damageToCritical;
    const comboReady = truthyLogDetail(plan, 'comboReady') || truthyLogDetail(plan, 'comboPayoffPlayable');
    const incomingLethal = truthyLogDetail(plan, 'incomingLethal');
    const reserveDefenders = numericLogDetail(plan, 'reserveDefenders');
    const defendersNeeded = numericLogDetail(plan, 'defendersNeededNextTurn');
    const ownDeck = numericLogDetail(plan, 'ownDeck');
    const ownErosion = numericLogDetail(plan, 'ownErosion');
    const mode = String(plan.subject || '');

    if (lethalPotential && trace.attacks === 0 && trace.ended) {
      addIssue(findings, sample, 'MISSED_LETHAL', `计划显示 ${tacticalLine || 'lethal'}，但本回合未攻击就结束`, plan);
    }
    if (comboReady && trace.comboActions === 0 && trace.ended) {
      addIssue(findings, sample, 'MISSED_COMBO', 'comboReady/comboPayoffPlayable 为真，但没有执行 combo 动作', plan);
    }
    if (incomingLethal && !lethalPotential && !truthyLogDetail(plan, 'desperationAttack') && !/defense|stabilize/i.test(mode)) {
      addIssue(findings, sample, 'UNDER_PRESSURE_NO_STABILIZE', `incomingLethal=true，但计划模式为 ${mode || 'unknown'}`, plan);
    }
    if (trace.exhaustedPayments > 0 && (incomingLethal || reserveDefenders > 0 || defendersNeeded > 0)) {
      addIssue(findings, sample, 'BAD_PAYMENT', `防守压力下横置支付 ${trace.exhaustedPayments} 个单位`, plan);
    }
    if (trace.deckPayments > 0 && (ownDeck <= 12 || ownErosion >= 7) && !lethalPotential) {
      addIssue(findings, sample, 'LOW_DECK_PAYMENT', `牌库=${ownDeck} 侵蚀=${ownErosion} 时仍支付牌库费用 ${trace.deckPayments}`, plan);
    }
    if (lethalPotential && trace.playBeforeAttack >= 2) {
      addIssue(findings, sample, 'OVER_DEVELOP', `已有进攻窗口但攻击前打出 ${trace.playBeforeAttack} 张牌`, plan);
    }
    if (sample.winner_side === 'player' && /BATTLE_DAMAGE/i.test(sample.win_reason || '') && trace.declinedDefenses >= 2) {
      addIssue(findings, sample, 'DECLINED_DEFENSE_ON_LOSS', `败局中本回合不防御 ${trace.declinedDefenses} 次`, plan);
    }
    if (sample.winner_side === 'player' && trace.heldAttackers > 0 && ownDeck <= 15) {
      addIssue(findings, sample, 'HELD_ATTACKERS_WHILE_BEHIND', `牌库=${ownDeck} 时仍保留攻击手 ${trace.heldAttackers} 次`, plan);
    }
  }

  return findings;
}

function severityRank(severity: IssueSeverity) {
  if (severity === 'error') return 3;
  if (severity === 'warning') return 2;
  return 1;
}

function summarizeLiveAiIssues(samples: NormalizedSample[]) {
  const allFindings = samples.flatMap(collectSampleIssues);
  const issueMap = new Map<string, {
    code: string;
    label: string;
    severity: IssueSeverity;
    count: number;
    games: Set<string>;
    bots: Set<string>;
    recommendation: string;
    examples: IssueFinding[];
  }>();
  const deckMap = new Map<string, {
    bot: string;
    games: number;
    botWins: number;
    playerWins: number;
    issueCounts: Record<string, number>;
    examples: IssueFinding[];
  }>();

  for (const sample of samples) {
    const bot = sample.bot_profile_id || 'unknown';
    if (!deckMap.has(bot)) {
      deckMap.set(bot, {
        bot,
        games: 0,
        botWins: 0,
        playerWins: 0,
        issueCounts: {},
        examples: [],
      });
    }
    const deck = deckMap.get(bot)!;
    deck.games++;
    if (sample.winner_side === 'bot') deck.botWins++;
    if (sample.winner_side === 'player') deck.playerWins++;
  }

  for (const finding of allFindings) {
    const meta = issueMeta(finding.code);
    if (!issueMap.has(finding.code)) {
      issueMap.set(finding.code, {
        code: finding.code,
        label: meta.label,
        severity: finding.severity,
        count: 0,
        games: new Set(),
        bots: new Set(),
        recommendation: meta.recommendation,
        examples: [],
      });
    }
    const issue = issueMap.get(finding.code)!;
    issue.count++;
    issue.games.add(finding.sample);
    issue.bots.add(finding.bot);
    if (issue.examples.length < 5) issue.examples.push(finding);

    if (!deckMap.has(finding.bot)) {
      deckMap.set(finding.bot, {
        bot: finding.bot,
        games: 0,
        botWins: 0,
        playerWins: 0,
        issueCounts: {},
        examples: [],
      });
    }
    const deck = deckMap.get(finding.bot)!;
    deck.issueCounts[finding.code] = (deck.issueCounts[finding.code] || 0) + 1;
    if (deck.examples.length < 6) deck.examples.push(finding);
  }

  const issueLeaderboard = [...issueMap.values()]
    .sort((a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      b.count - a.count ||
      a.code.localeCompare(b.code)
    )
    .map(issue => ({
      code: issue.code,
      label: issue.label,
      severity: issue.severity,
      count: issue.count,
      games: issue.games.size,
      bots: [...issue.bots].sort(),
      recommendation: issue.recommendation,
      examples: issue.examples,
    }));

  const deckRepairPriorities = [...deckMap.values()]
    .map(deck => {
      const topIssues = Object.entries(deck.issueCounts)
        .sort((a, b) =>
          severityRank(issueMeta(b[0]).severity) - severityRank(issueMeta(a[0]).severity) ||
          b[1] - a[1] ||
          a[0].localeCompare(b[0])
        );
      const [topIssueCode, topIssueCount] = topIssues[0] || ['NO_ISSUE_DETECTED', 0];
      const meta = issueMeta(topIssueCode);
      const lossRate = deck.games > 0 ? deck.playerWins / deck.games : 0;
      const priority = severityRank(meta.severity) >= 3
        ? 'P0'
        : lossRate >= 0.5 || Number(topIssueCount) >= 3
          ? 'P1'
          : Number(topIssueCount) > 0
            ? 'P2'
            : 'P3';
      return {
        priority,
        bot: deck.bot,
        games: deck.games,
        botWins: deck.botWins,
        playerWins: deck.playerWins,
        botWinRate: pct(deck.botWins, deck.games),
        topIssue: topIssueCode,
        topIssueLabel: topIssueCode === 'NO_ISSUE_DETECTED' ? '暂无明确失误' : meta.label,
        topIssueCount: Number(topIssueCount),
        issueCounts: deck.issueCounts,
        recommendation: topIssueCode === 'NO_ISSUE_DETECTED'
          ? '继续采集更多正常胜负局；样本太少时不要急着调权重。'
          : meta.recommendation,
        examples: deck.examples,
      };
    })
    .sort((a, b) =>
      a.priority.localeCompare(b.priority) ||
      b.playerWins - a.playerWins ||
      b.topIssueCount - a.topIssueCount ||
      a.bot.localeCompare(b.bot)
    );

  return {
    issueLeaderboard,
    deckRepairPriorities,
    issueExamples: allFindings.slice(0, 40),
  };
}

function buildReport(samples: ReturnType<typeof normalizeRows>) {
  const byBot = new Map<string, ReturnType<typeof createStats>>();
  const byArchetype = new Map<string, ReturnType<typeof createStats>>();
  const byBotVsArchetype = new Map<string, ReturnType<typeof createStats>>();
  const actionCounts: Record<string, number> = {};
  const warningCounts: Record<string, number> = {};
  const keyDecisions: Array<{ sample: string; bot: string; turn: number; phase: string; action: string; subject: string; reason: string }> = [];

  for (const sample of samples) {
    const groups = [
      ensureStats(byBot, sample.bot_profile_id || 'unknown', createStats),
      ensureStats(byArchetype, sample.opponent_archetype || 'unknown', createStats),
      ensureStats(byBotVsArchetype, `${sample.bot_profile_id || 'unknown'} vs ${sample.opponent_archetype || 'unknown'}`, createStats),
    ];
    const diagnosis = sample.diagnosis || {};
    const logs = sample.ai_decision_logs || [];

    for (const stats of groups) {
      stats.games++;
      stats.totalTurns += Number(sample.turn_count || 0);
      stats.botWins += sample.winner_side === 'bot' ? 1 : 0;
      stats.playerWins += sample.winner_side === 'player' ? 1 : 0;
      stats.draws += sample.winner_side === 'draw' ? 1 : 0;
      stats.warnings += diagnosis.severity === 'warning' ? 1 : 0;
      stats.softCompensations += Number(diagnosis.softCompensations || 0);
      stats.queryFailures += Number(diagnosis.queryFailures || 0);
      stats.effectFailures += Number(diagnosis.effectFailures || 0);
      stats.winReasons[sample.win_reason || 'UNKNOWN'] = (stats.winReasons[sample.win_reason || 'UNKNOWN'] || 0) + 1;
      addActionCounts(stats.actions, logs);
    }

    addActionCounts(actionCounts, logs);
    for (const warning of diagnosis.warnings || []) {
      warningCounts[warning] = (warningCounts[warning] || 0) + 1;
    }

    for (const log of logs) {
      if (!['SOFT_COMPENSATION', 'TURN_PLAN', 'QUERY_FAILED', 'ACTIVATE_EFFECT_FAILED', 'ATTACK', 'DEFEND'].includes(log?.action)) continue;
      keyDecisions.push({
        sample: sample.game_id,
        bot: sample.bot_profile_id,
        turn: log.turn,
        phase: log.phase,
        action: log.action,
        subject: log.subject || '',
        reason: log.reason || '',
      });
      if (keyDecisions.length >= 40) break;
    }
  }

  const aiIssueAnalysis = summarizeLiveAiIssues(samples);

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      days,
      since,
      limit,
      bot: botFilter || null,
      normalWinsOnly: true,
    },
    sampleCount: samples.length,
    byBot: Object.fromEntries(byBot.entries()),
    byArchetype: Object.fromEntries(byArchetype.entries()),
    byBotVsArchetype: Object.fromEntries(byBotVsArchetype.entries()),
    actionCounts,
    warningCounts,
    aiIssueLeaderboard: aiIssueAnalysis.issueLeaderboard,
    deckRepairPriorities: aiIssueAnalysis.deckRepairPriorities,
    issueExamples: aiIssueAnalysis.issueExamples,
    keyDecisions,
    samples,
  };
}

function statsRows(stats: Record<string, ReturnType<typeof createStats>>) {
  return Object.entries(stats)
    .sort((a, b) => b[1].games - a[1].games || a[0].localeCompare(b[0]))
    .map(([key, value]) => [
      key,
      value.games,
      pct(value.botWins, value.games),
      pct(value.playerWins, value.games),
      pct(value.draws, value.games),
      value.games > 0 ? (value.totalTurns / value.games).toFixed(1) : '0.0',
      value.warnings,
      value.softCompensations,
      value.queryFailures,
      value.effectFailures,
      topEntries(value.winReasons, 3).map(([reason, count]) => `${reason}:${count}`).join(', '),
    ]);
}

function issueLeaderboardRows(report: ReturnType<typeof buildReport>) {
  return report.aiIssueLeaderboard.slice(0, 20).map(issue => [
    issue.severity,
    issue.code,
    issue.label,
    issue.count,
    issue.games,
    issue.bots.join(', '),
    issue.recommendation,
  ]);
}

function deckRepairRows(report: ReturnType<typeof buildReport>) {
  return report.deckRepairPriorities.map(item => [
    item.priority,
    item.bot,
    item.games,
    item.botWinRate,
    item.playerWins,
    item.topIssue,
    item.topIssueLabel,
    item.topIssueCount,
    item.recommendation,
  ]);
}

function issueExampleRows(report: ReturnType<typeof buildReport>) {
  return report.issueExamples.slice(0, 30).map(item => [
    item.sample,
    item.bot,
    item.turn ?? '',
    item.phase || '',
    item.code,
    item.action || '',
    item.subject || '',
    item.detail,
  ]);
}

function buildMarkdownReport(report: ReturnType<typeof buildReport>) {
  const lines: string[] = [];
  lines.push('# Live Hard AI Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Samples: ${report.sampleCount}`);
  lines.push(`Window: last ${report.filters.days} day(s)`);
  lines.push('Included: normal completed wins only; surrender, timeout, simulation/error, unknown, and draw samples are excluded.');
  if (report.filters.bot) lines.push(`Bot filter: ${report.filters.bot}`);
  lines.push('');

  lines.push('## By Bot Deck');
  lines.push(markdownTable(
    ['Bot', 'Games', 'Bot Win', 'Player Win', 'Draw', 'Avg Turns', 'Warnings', 'SoftComp', 'QueryFail', 'EffectFail', 'Win Reasons'],
    statsRows(report.byBot)
  ));
  lines.push('');

  lines.push('## By Player Archetype');
  lines.push(markdownTable(
    ['Archetype', 'Games', 'Bot Win', 'Player Win', 'Draw', 'Avg Turns', 'Warnings', 'SoftComp', 'QueryFail', 'EffectFail', 'Win Reasons'],
    statsRows(report.byArchetype)
  ));
  lines.push('');

  lines.push('## Bot vs Archetype');
  lines.push(markdownTable(
    ['Matchup', 'Games', 'Bot Win', 'Player Win', 'Draw', 'Avg Turns', 'Warnings', 'SoftComp', 'QueryFail', 'EffectFail', 'Win Reasons'],
    statsRows(report.byBotVsArchetype)
  ));
  lines.push('');

  lines.push('## Decision Actions');
  lines.push(markdownTable(['Action', 'Count'], topEntries(report.actionCounts, 20)));
  lines.push('');

  lines.push('## Warnings');
  const warningRows = topEntries(report.warningCounts, 20);
  lines.push(warningRows.length > 0 ? markdownTable(['Warning', 'Count'], warningRows) : 'No warnings.');
  lines.push('');

  lines.push('## AI Issue Leaderboard');
  const issueRows = issueLeaderboardRows(report);
  lines.push(issueRows.length > 0
    ? markdownTable(['Severity', 'Code', 'Issue', 'Count', 'Games', 'Bot Decks', 'Recommended Fix'], issueRows)
    : 'No AI issues detected in the current sample window.');
  lines.push('');

  lines.push('## Deck Repair Priorities');
  const repairRows = deckRepairRows(report);
  lines.push(repairRows.length > 0
    ? markdownTable(['Priority', 'Bot Deck', 'Games', 'Bot Win', 'Player Wins', 'Top Issue', 'Issue Label', 'Count', 'Suggested Fix'], repairRows)
    : 'No deck repair priorities yet.');
  lines.push('');

  lines.push('## Issue Examples');
  const exampleRows = issueExampleRows(report);
  lines.push(exampleRows.length > 0
    ? markdownTable(['Game', 'Bot', 'Turn', 'Phase', 'Issue', 'Action', 'Subject', 'Detail'], exampleRows)
    : 'No issue examples captured.');
  lines.push('');

  lines.push('## Key Decisions');
  lines.push(report.keyDecisions.length > 0
    ? markdownTable(
      ['Game', 'Bot', 'Turn', 'Phase', 'Action', 'Subject', 'Reason'],
      report.keyDecisions.slice(0, 30).map(item => [
        item.sample,
        item.bot,
        item.turn,
        item.phase,
        item.action,
        item.subject,
        item.reason,
      ])
    )
    : 'No key decisions captured.');
  lines.push('');

  lines.push('## Suggested Next Checks');
  lines.push('- Start from AI Issue Leaderboard: fix error-level QUERY/EFFECT issues before tuning weights.');
  lines.push('- For each Deck Repair Priority, turn the top issue example into a scenario test before changing strategy.');
  lines.push('- Bot win rate below 40% in a matchup: inspect TURN_PLAN and ATTACK/DEFEND decisions for that bot.');
  lines.push('- QueryFail or EffectFail above 0: inspect failed callback/effect IDs before tuning deck weights.');
  lines.push('- SoftComp high but win rate low: opening smoothing helps consistency, but mid-game strategy still needs tuning.');
  lines.push('- Player win rate very low across all archetypes: reduce soft compensation or aggressive hooks before release.');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const conditions = ['finished_at >= ?'];
  const params: Array<string | number> = [since];

  if (botFilter) {
    conditions.push('bot_profile_id = ?');
    params.push(botFilter);
  }
  conditions.push(`winner_side IN ('bot', 'player')`);
  conditions.push(`win_reason IS NOT NULL`);
  conditions.push(`win_reason <> ''`);
  conditions.push(`UPPER(win_reason) NOT LIKE '%SURRENDER%'`);
  conditions.push(`UPPER(win_reason) NOT LIKE '%CONCEDE%'`);
  conditions.push(`UPPER(win_reason) NOT LIKE '%FORFEIT%'`);
  conditions.push(`UPPER(win_reason) NOT LIKE '%TIMEOUT%'`);
  conditions.push(`UPPER(win_reason) NOT LIKE '%MAX_%'`);
  conditions.push(`UPPER(win_reason) NOT LIKE '%SIMULATION%'`);
  conditions.push(`UPPER(win_reason) NOT LIKE '%ERROR%'`);
  conditions.push(`UPPER(win_reason) NOT LIKE '%ABORT%'`);
  conditions.push(`UPPER(win_reason) NOT LIKE '%CANCEL%'`);
  conditions.push(`UPPER(win_reason) <> 'UNKNOWN'`);

  params.push(Math.max(1, limit));
  const rows = await pool.query(
    `SELECT *
     FROM ai_match_samples
     WHERE ${conditions.join(' AND ')}
     ORDER BY finished_at DESC
     LIMIT ?`,
    params
  );

  const samples = normalizeRows(rows as SampleRow[]).filter(isNormalWinSample);
  const report = buildReport(samples);
  const markdown = buildMarkdownReport(report);
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const id = Date.now();
  const jsonPath = path.join(reportsDir, `live-ai-${id}.json`);
  const mdPath = path.join(reportsDir, `live-ai-${id}.md`);
  const latestJsonPath = path.join(reportsDir, 'live-ai-latest.json');
  const latestMdPath = path.join(reportsDir, 'live-ai-latest.md');

  fs.writeFileSync(jsonPath, stringifyJson(report), 'utf8');
  fs.writeFileSync(mdPath, markdown, 'utf8');
  fs.writeFileSync(latestJsonPath, stringifyJson(report), 'utf8');
  fs.writeFileSync(latestMdPath, markdown, 'utf8');

  console.log(`Live AI report finished: ${samples.length} samples`);
  console.log(`Report: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
  await pool.end();
}

main().catch(async err => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
