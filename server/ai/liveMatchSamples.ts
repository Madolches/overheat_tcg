import crypto from 'crypto';
import { pool } from '../db';
import { battleLogText } from '../../src/lib/battleLog';
import { AiDecisionLog, BattleLogEntry, Card, GameState, PlayerState } from '../../src/types/game';
import { analyzePlayerDeckProfile } from './playerDeckProfile';

const AI_SAMPLE_VERSION = 'hard-ai-beta-telemetry-v1';
const MAX_SAMPLE_BATTLE_LOGS = Number(process.env.AI_SAMPLE_MAX_BATTLE_LOGS || 500);
const MAX_SAMPLE_DECISION_LOGS = Number(process.env.AI_SAMPLE_MAX_DECISION_LOGS || 300);
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

function hashText(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function getPlayerCards(player: PlayerState | undefined) {
  if (!player) return [] as Card[];
  return [
    ...(player.deck || []),
    ...(player.hand || []),
    ...(player.grave || []),
    ...(player.exile || []),
    ...(player.playZone || []),
    ...(player.unitZone || []),
    ...(player.itemZone || []),
    ...(player.erosionFront || []),
    ...(player.erosionBack || []),
  ].filter((card): card is Card => !!card);
}

function deckHash(cards: Card[]) {
  return hashText(cards.map(card => card.uniqueId || card.id).sort().join('|'));
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function isNormalWinReason(reason: string | undefined) {
  if (!reason) return false;
  return !NON_NORMAL_WIN_REASON_PATTERNS.some(pattern => pattern.test(reason));
}

function isNormalFinishedGame(gameState: GameState) {
  return gameState.gameStatus === 2 &&
    !!gameState.winnerId &&
    isNormalWinReason(gameState.winReason);
}

function sanitizeText(text: string, gameState: GameState) {
  let sanitized = text;
  for (const uid of gameState.playerIds || []) {
    const player = gameState.players[uid];
    if (!player || uid === 'BOT_PLAYER') continue;
    sanitized = sanitized
      .split(player.displayName || '')
      .join('玩家')
      .split(uid)
      .join('PLAYER_HASH');
  }
  return sanitized;
}

function serializeBattleLogs(history: BattleLogEntry[] | undefined, gameState: GameState) {
  const source = history && history.length > 0
    ? history
    : (gameState.logs || []);
  return source
    .slice(-MAX_SAMPLE_BATTLE_LOGS)
    .map(log => typeof log === 'string' ? log : battleLogText(log as BattleLogEntry))
    .map(text => sanitizeText(String(text), gameState));
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

function describePlayer(player: PlayerState | undefined) {
  if (!player) return null;
  return {
    deck: player.deck.length,
    hand: player.hand.length,
    grave: player.grave.length,
    exile: player.exile.length,
    erosionFront: player.erosionFront.filter(Boolean).length,
    erosionBack: player.erosionBack.filter(Boolean).length,
    units: player.unitZone.map(describeCard).filter(Boolean),
    items: player.itemZone.map(describeCard).filter(Boolean),
  };
}

function sanitizeDecisionLog(log: AiDecisionLog, gameState: GameState): AiDecisionLog {
  const sanitized = { ...log };
  sanitized.playerUid = log.playerUid === 'BOT_PLAYER' ? 'BOT_PLAYER' : 'PLAYER_HASH';
  sanitized.playerName = log.playerUid === 'BOT_PLAYER' ? log.playerName : '玩家';
  sanitized.subject = log.subject ? sanitizeText(log.subject, gameState) : log.subject;
  sanitized.reason = sanitizeText(log.reason || '', gameState);
  sanitized.candidates = log.candidates?.map(candidate => ({
    ...candidate,
    name: sanitizeText(candidate.name, gameState),
    note: candidate.note ? sanitizeText(candidate.note, gameState) : candidate.note,
  }));
  return sanitized;
}

function buildDiagnosis(gameState: GameState, aiLogs: AiDecisionLog[]) {
  const queryFailures = aiLogs.filter(log => log.action === 'QUERY_FAILED').length;
  const effectFailures = aiLogs.filter(log => log.action === 'ACTIVATE_EFFECT_FAILED').length;
  const warnings: string[] = [];

  if (!gameState.winnerId) warnings.push('NO_WINNER');
  if (queryFailures > 0) warnings.push('QUERY_FAILED');
  if (effectFailures > 0) warnings.push('EFFECT_FAILED');
  if (/MAX_|SIMULATION|ERROR/i.test(gameState.winReason || '')) warnings.push('ABNORMAL_END');

  return {
    severity: warnings.length > 0 ? 'warning' : 'info',
    warnings,
    queryFailures,
    effectFailures,
    decisionCount: aiLogs.length,
  };
}

export async function saveAiMatchSample(gameState: GameState, gameId?: string, history?: BattleLogEntry[]) {
  const matchId = gameState.gameId || gameId;
  if (!matchId || (gameState as any).aiSampleSaved || (gameState as any).aiSampleSkipped) return false;
  if (gameState.gameStatus !== 2) return false;
  if (gameState.mode !== 'practice' || gameState.botDifficulty !== 'hard') return false;
  if (!isNormalFinishedGame(gameState)) {
    (gameState as any).aiSampleSkipped = true;
    return false;
  }

  const bot = gameState.players.BOT_PLAYER;
  if (!bot) return false;

  const humanUid = gameState.playerIds.find(uid => uid !== 'BOT_PLAYER');
  const human = humanUid ? gameState.players[humanUid] : undefined;
  if (!human) return false;

  const humanCards = getPlayerCards(human);
  const opponentProfile = analyzePlayerDeckProfile(humanCards, 'PLAYER_HASH');
  const botProfileId = bot.botDeckProfileId || gameState.botDeckProfiles?.BOT_PLAYER || 'generic';
  const aiLogs = (gameState.aiDecisionLogs || []).slice(-MAX_SAMPLE_DECISION_LOGS);
  const sanitizedAiLogs = aiLogs.map(log => sanitizeDecisionLog(log, gameState));
  const winnerSide = gameState.winnerId === 'BOT_PLAYER'
    ? 'bot'
    : gameState.winnerId === humanUid
      ? 'player'
      : 'draw';
  const finishedAt = Date.now();
  const createdAt = Number((gameState as any).createdAt || finishedAt);
  const sampleId = `ai_${hashText(matchId).slice(0, 24)}`;
  const diagnosis = buildDiagnosis(gameState, aiLogs);
  const finalBoard = {
    bot: describePlayer(bot),
    player: describePlayer(human),
  };

  await pool.query(
    `INSERT INTO ai_match_samples (
      id, game_id, created_at, finished_at, mode, bot_profile_id, bot_difficulty,
      opponent_archetype, opponent_traits, player_deck_hash, winner_side, win_reason,
      turn_count, final_phase, ai_decision_logs, battle_logs, final_board, diagnosis, ai_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      finished_at = VALUES(finished_at),
      winner_side = VALUES(winner_side),
      win_reason = VALUES(win_reason),
      turn_count = VALUES(turn_count),
      final_phase = VALUES(final_phase),
      ai_decision_logs = VALUES(ai_decision_logs),
      battle_logs = VALUES(battle_logs),
      final_board = VALUES(final_board),
      diagnosis = VALUES(diagnosis)`,
    [
      sampleId,
      matchId,
      createdAt,
      finishedAt,
      gameState.mode || 'practice',
      botProfileId,
      gameState.botDifficulty || bot.botDifficulty || 'hard',
      opponentProfile.archetype,
      safeJson(opponentProfile.traits),
      deckHash(humanCards),
      winnerSide,
      gameState.winReason || 'UNKNOWN',
      gameState.turnCount || 0,
      gameState.phase || 'UNKNOWN',
      safeJson(sanitizedAiLogs),
      safeJson(serializeBattleLogs(history, gameState)),
      safeJson(finalBoard),
      safeJson(diagnosis),
      AI_SAMPLE_VERSION,
    ]
  );

  (gameState as any).aiSampleSaved = true;
  return true;
}
