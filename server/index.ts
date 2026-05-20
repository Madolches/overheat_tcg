// VERSION: 2026-04-07-IND-FIX-01
import express from 'express';
console.log('[Server] index.ts is starting up...');
import { createServer } from 'http';

import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { pool, dbInit } from './db';
import { generateToken, verifyToken } from './auth';
import { initServerCardLibrary, SERVER_CARD_LIBRARY } from './card_loader';
import { getLiveCardVariations } from './card_inventory';
import { isCardVisibleInCatalog } from '../src/lib/cardCatalogFilters';
import { decodeDeckShareCode } from '../src/lib/deckShareCode';
import { AI_DECK_PROFILES } from './ai/deckProfiles';
import { saveAiMatchSample } from './ai/liveMatchSamples';
import {
    createVerificationCode,
    getVerificationCodeExpireMs,
    getVerificationCodeResendMs,
    normalizeEmail,
    seedStarterResources,
    sendRegistrationVerificationEmail,
    validateEmail,
    validatePassword,
    validateUsername
} from './registration';
import { ServerGameService } from './ServerGameService';
import { PlayerState, Card, GAME_TIMEOUTS, GameState, BattleLogEntry } from '../src/types/game';
import { EventEngine } from '../src/services/EventEngine';
import { addBattleLog, battleLogText, normalizeBattleLogs } from '../src/lib/battleLog';
import fs from 'fs';
import path from 'path';

// Initialize Game Library
// Initialize Game Library will be awaited below.


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// In-memory locks to prevent concurrent modifications of the same game state
const gameLocks = new Map<string, Promise<any>>();

// In-memory match log history (not persisted to DB 'state' blob)
const matchLogHistory = new Map<string, BattleLogEntry[]>();
const lastSyncedLogIndex = new Map<string, number>();
const botMovingGames = new Set<string>();
const lastTimerBroadcast = new Map<string, number>();
const STARTER_COINS = 100000;
const STARTER_CARD_CRYSTALS = 100000;
const TIMER_BROADCAST_INTERVAL_MS = Number(process.env.TIMER_BROADCAST_INTERVAL_MS || 1000);
const FORCE_LOGOUT_REASON = '账号已在其他设备登录';

function getDefaultTurnTime(gameState: any) {
    return gameState.turnTimerLimit ? gameState.turnTimerLimit * 1000 : 300000;
}

function getActiveTimerPlayerUid(gameState: any): string | undefined {
    if (gameState.phase === 'INIT' || gameState.phase === 'RPS' || gameState.phase === 'FIRST_PLAYER_CHOICE' || gameState.phase === 'MULLIGAN') {
        return undefined;
    }
    if (gameState.pendingQuery) return gameState.pendingQuery.playerUid;
    if (gameState.priorityPlayerId) return gameState.priorityPlayerId;
    if (gameState.phase === 'DISCARD') return gameState.playerIds[gameState.currentTurnPlayer];
    return gameState.playerIds[gameState.currentTurnPlayer];
}

function getRuntimeTimedState(gameState: any, now = Date.now()) {
    const elapsed = now - (gameState.phaseTimerStart || now);
    const players = Object.fromEntries(
        Object.entries(gameState.players || {}).map(([uid, player]: [string, any]) => [
            uid,
            { timeRemaining: player?.timeRemaining }
        ])
    ) as Record<string, { timeRemaining: number | undefined }>;

    if (gameState.phase === 'MULLIGAN') {
        for (const [uid, player] of Object.entries(gameState.players || {}) as [string, any][]) {
            if (!player?.mulliganDone) {
                players[uid] = {
                    timeRemaining: Math.max(0, (player.timeRemaining ?? getDefaultTurnTime(gameState)) - elapsed)
                };
            }
        }
        return players;
    }

    const activePlayerUid = getActiveTimerPlayerUid(gameState);
    if (activePlayerUid && gameState.players?.[activePlayerUid]) {
        const player = gameState.players[activePlayerUid];
        players[activePlayerUid] = {
            timeRemaining: Math.max(0, (player.timeRemaining ?? getDefaultTurnTime(gameState)) - elapsed)
        };
    }

    return players;
}

async function withGameLock<T>(gameId: string, action: () => Promise<T>): Promise<T> {
    const existingLock = gameLocks.get(gameId) || Promise.resolve();
    const newLock = existingLock.then(async () => {
        try {
            return await action();
        } catch (err) {
            // console.error(`[Lock] Error in locked action for game ${gameId}:`, err);
            // Re-throw to allow the caller to handle it, but the lock chain continues
            throw err;
        }
    });
    gameLocks.set(gameId, newLock.catch(() => { })); // Ensure chain doesn't break on errors
    return newLock;
}

function buildAuthUser(user: any) {
    return {
        uid: user.id,
        username: user.username,
        displayName: user.display_name,
        email: user.email || null
    };
}

function createUserId() {
    return `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// Helper: Validate User Deck
async function validateUserDeck(uId: string, dId: string): Promise<{ valid: boolean; cards?: Card[]; error?: string }> {
    try {
        const dRows = await pool.query('SELECT cards FROM decks WHERE id = ? AND user_id = ?', [dId, uId]);
        if (dRows.length === 0) return { valid: false, error: '未找到卡组' };

        let cIds = typeof dRows[0].cards === 'string' ? JSON.parse(dRows[0].cards) : dRows[0].cards;
        if (!Array.isArray(cIds)) cIds = [];

        const cObjs = cIds.map((idVal: string) => {
            return (SERVER_CARD_LIBRARY as any)[idVal];
        }).filter(Boolean);

        if (cObjs.length !== cIds.length) {
            return { valid: false, error: '部分卡牌在服务器库中未找到' };
        }

        const vRes = ServerGameService.validateDeck(cObjs as any);
        if (!vRes.valid) return { valid: false, error: vRes.error };

        return { valid: true, cards: cObjs as any };
    } catch (err) {
        // console.error('Validate deck error:', err);
        return { valid: false, error: '数据库错误' };
    }
}

function getServerCatalogRefs() {
    return [...new Set(
        Object.values(SERVER_CARD_LIBRARY)
            .map(card => card?.uniqueId)
            .filter((ref): ref is string => !!ref)
    )].sort((a, b) => a.localeCompare(b));
}

function resolveAiOpponentDeck(profileId?: string): { valid: boolean; profileId?: string; displayName?: string; cards?: Card[]; error?: string } {
    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === profileId) || AI_DECK_PROFILES[0];
    if (!profile?.shareCode) {
        return { valid: false, error: '未找到可用的人机卡组' };
    }

    try {
        const refs = decodeDeckShareCode(profile.shareCode, getServerCatalogRefs());
        const cards = refs
            .map(ref => SERVER_CARD_LIBRARY[ref])
            .filter((card): card is Card => !!card);
        if (cards.length !== refs.length) {
            return { valid: false, error: `${profile.displayName} 包含服务器未找到的卡牌` };
        }

        const validation = ServerGameService.validateDeck(cards);
        if (!validation.valid) {
            return { valid: false, error: `${profile.displayName} 卡组不合法：${validation.error}` };
        }

        return {
            valid: true,
            profileId: profile.id,
            displayName: profile.displayName,
            cards,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { valid: false, error: `${profile.displayName} 分享码解析失败：${message}` };
    }
}

async function handleBotMove(gameState: any, gameId: string) {
    if (botMovingGames.has(gameId)) {
        // console.log(`[Bot] Bot is already moving for game ${gameId}, skipping trigger`);
        return;
    }

    const bot = gameState.players['BOT_PLAYER'];
    if (!bot) return;
    if (gameState.pendingQuery && gameState.pendingQuery.playerUid !== 'BOT_PLAYER') return;

    // The bot should move if it's its turn, if it's being asked for a confrontation response, if it has priority, or has a query
    const isBotAsked = gameState.battleState && gameState.battleState.askConfront === 'ASKING_OPPONENT';
    const isBotPriority = gameState.priorityPlayerId === 'BOT_PLAYER';
    const isBotQuery = gameState.pendingQuery && gameState.pendingQuery.playerUid === 'BOT_PLAYER';
    const isBotDefending = gameState.phase === 'DEFENSE_DECLARATION' && !bot.isTurn;
    const shouldBotMove = bot.isTurn || isBotAsked || isBotPriority || isBotQuery || isBotDefending;

    if (!shouldBotMove) return;

    botMovingGames.add(gameId);

    // Use a delay to simulate thinking and allow final state propagation
    setTimeout(async () => {
        try {
            await withGameLock(gameId, async () => {
                try {
                    // Re-fetch state inside the lock to get the most recent version
                    const stateRows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
                    if (stateRows.length === 0) {
                        botMovingGames.delete(gameId);
                        return;
                    }
                    const currentGameState = typeof stateRows[0].state === 'string' ? JSON.parse(stateRows[0].state) : stateRows[0].state;
                    ServerGameService.hydrateGameState(currentGameState);

                    const syncCallback = async (state: any) => {
                        await syncAndSaveState(gameId, state);
                    };

                    await ServerGameService.botMove(currentGameState, syncCallback);
                    await ServerGameService.applyConfrontationStrategy(currentGameState, syncCallback);

                    await syncAndSaveState(gameId, currentGameState);

                    // Re-trigger if bot still needs to move
                    const nextState = currentGameState;
                    const botObj = nextState.players['BOT_PLAYER'];
                    if (botObj) {
                        const currentPlayerId = nextState.playerIds[nextState.currentTurnPlayer];
                        const isBotAskedNext = nextState.battleState && nextState.battleState.askConfront === 'ASKING_OPPONENT';
                        const isBotPriorityNext = nextState.priorityPlayerId === 'BOT_PLAYER';
                        const isBotQueryNext = nextState.pendingQuery && nextState.pendingQuery.playerUid === 'BOT_PLAYER';

                        const isBotDefendingNext = nextState.phase === 'DEFENSE_DECLARATION' && !botObj.isTurn;
                        if (currentPlayerId === 'BOT_PLAYER' || isBotAskedNext || isBotPriorityNext || isBotQueryNext || isBotDefendingNext) {
                            // Release before recursive call to allow the next move to be scheduled
                            botMovingGames.delete(gameId);
                            handleBotMove(nextState, gameId);
                        } else {
                            botMovingGames.delete(gameId);
                        }
                    } else {
                        botMovingGames.delete(gameId);
                    }
                } catch (err: any) {
                    console.error('[Bot] handleBotMove inner error:', err);
                    try {
                        const stateRows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
                        if (stateRows.length > 0) {
                            const failedState = typeof stateRows[0].state === 'string' ? JSON.parse(stateRows[0].state) : stateRows[0].state;
                            const query = failedState?.pendingQuery;
                            if (query?.playerUid === 'BOT_PLAYER') {
                                failedState.logs = failedState.logs || [];
                                failedState.logs.push(`[Bot错误] 自动处理效果失败：${err?.message || '未知错误'}`);
                                await syncAndSaveState(gameId, failedState);
                            }
                        }
                    } catch (logErr) {
                        console.error('[Bot] failed to persist bot error state:', logErr);
                    }
                    botMovingGames.delete(gameId);
                }
            });
        } catch (err) {
            console.error('[Bot] handleBotMove outer error:', err);
            botMovingGames.delete(gameId);
        }
    }, 1000);
}

function triggerBotIfNeeded(gameState: any, gameId: string) {
    const bot = gameState.players['BOT_PLAYER'];
    if (!bot) return;
    if (gameState.pendingQuery && gameState.pendingQuery.playerUid !== 'BOT_PLAYER') return;

    const currentPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
    const isBotAsked = gameState.battleState && gameState.battleState.askConfront === 'ASKING_OPPONENT';
    const isBotPriority = gameState.priorityPlayerId === 'BOT_PLAYER';
    const isBotQuery = gameState.pendingQuery && gameState.pendingQuery.playerUid === 'BOT_PLAYER';
    const isBotDefending = gameState.phase === 'DEFENSE_DECLARATION' && !bot.isTurn;

    if (currentPlayerId === 'BOT_PLAYER' || isBotAsked || isBotPriority || isBotQuery || isBotDefending) {
        // console.log(`[Bot] Triggering bot move for game ${gameId}. Reason: ${currentPlayerId === 'BOT_PLAYER' ? 'Turn' : isBotAsked ? 'Confrontation' : isBotPriority ? 'Priority' : 'Query'}`);
        handleBotMove(gameState, gameId);
    }
}

type FriendSeatTarget = 'player' | 'player1' | 'player2' | 'spectator';

const normalizeOptionalUid = (uid: any) => {
    if (uid === undefined || uid === null || uid === '') return null;
    return uid.toString();
};

function getUserDisplayLabel(user: any) {
    const displayName = typeof user?.displayName === 'string' ? user.displayName.trim() : '';
    const username = typeof user?.username === 'string' ? user.username.trim() : '';
    return displayName || username || user?.userId?.toString() || '玩家';
}

function clearGameRuntime(gameId: string) {
    matchLogHistory.delete(gameId);
    lastSyncedLogIndex.delete(gameId);
    lastTimerBroadcast.delete(gameId);
    botMovingGames.delete(gameId);
    gameLocks.delete(gameId);
}

async function getAuthenticatedUserFromHeader(req: express.Request, res: express.Response) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }

    const user = await verifyToken(authHeader.split(' ')[1]);
    if (!user) {
        res.status(401).json({ error: 'Invalid token' });
        return null;
    }

    return user;
}

async function issueTokenForUser(userId: string) {
    const rows = await pool.query(
        'SELECT id, username, display_name, email, role, session_version FROM users WHERE id = ? LIMIT 1',
        [userId]
    );
    if (!rows.length) return null;

    const user = rows[0];
    return {
        token: generateToken(
            user.id,
            user.username,
            user.display_name,
            user.role,
            Number(user.session_version ?? 0),
            user.email || null
        ),
        user: buildAuthUser(user)
    };
}

function getRequestSocketId(req: express.Request) {
    const socketId = req.headers['x-socket-id'];
    return typeof socketId === 'string' && socketId.trim() ? socketId.trim() : undefined;
}

function getUserUsernameLabel(user: any) {
    const username = typeof user?.username === 'string' ? user.username.trim() : '';
    return username || getUserDisplayLabel(user);
}

function canUserChatInGame(gameState: any, userId: string) {
    const userIdStr = userId.toString();
    if ((gameState.playerIds || []).map((uid: any) => uid?.toString()).includes(userIdStr)) return true;
    if (gameState.players?.[userIdStr]) return true;

    if (gameState.mode === 'friend') {
        normalizeFriendRoomState(gameState);
        return (gameState.participantIds || []).includes(userIdStr) || (gameState.spectatorIds || []).includes(userIdStr);
    }

    return (gameState.spectatorIds || []).map((uid: any) => uid?.toString()).includes(userIdStr);
}

function resolveGameDisplayName(gameState: any, user: any) {
    const userIdStr = user.userId?.toString();
    return gameState.players?.[userIdStr]?.displayName ||
        gameState.participantNames?.[userIdStr] ||
        getUserDisplayLabel(user);
}

function isFriendGameStarted(gameState: any) {
    return gameState.status === 'STARTING' || gameState.status === 'ACTIVE' || (gameState.phase && gameState.phase !== 'INIT');
}

function normalizeFriendRoomState(gameState: any) {
    if (!Array.isArray(gameState.playerIds)) gameState.playerIds = [];
    const p1 = normalizeOptionalUid(gameState.playerIds[0]);
    const p2Raw = normalizeOptionalUid(gameState.playerIds[1]);
    const p2 = p2Raw && p2Raw !== p1 ? p2Raw : null;
    gameState.playerIds = [p1, p2];

    if (!Array.isArray(gameState.participantIds)) {
        gameState.participantIds = gameState.playerIds.filter(Boolean).map((uid: any) => uid.toString());
    }
    if (!Array.isArray(gameState.spectatorIds)) gameState.spectatorIds = [];
    if (!gameState.friendDeckSelections || typeof gameState.friendDeckSelections !== 'object') gameState.friendDeckSelections = {};
    if (!gameState.friendReady || typeof gameState.friendReady !== 'object') gameState.friendReady = {};
    if (!gameState.participantNames || typeof gameState.participantNames !== 'object') gameState.participantNames = {};

    gameState.participantIds = Array.from(new Set(gameState.participantIds.map((uid: any) => uid.toString())));
    gameState.spectatorIds = Array.from(new Set(gameState.spectatorIds.map((uid: any) => uid.toString())));

    for (const uid of gameState.playerIds.filter(Boolean)) {
        if (!gameState.participantIds.includes(uid)) gameState.participantIds.push(uid);
    }

    const playerSet = new Set(gameState.playerIds.filter(Boolean));
    gameState.spectatorIds = gameState.spectatorIds.filter((uid: string) => !playerSet.has(uid));
    for (const uid of gameState.spectatorIds) {
        if (!gameState.participantIds.includes(uid)) gameState.participantIds.push(uid);
    }

    for (const uid of Object.keys(gameState.friendDeckSelections)) {
        if (!playerSet.has(uid)) delete gameState.friendDeckSelections[uid];
    }
    for (const uid of Object.keys(gameState.friendReady)) {
        if (!playerSet.has(uid)) delete gameState.friendReady[uid];
    }
    for (const uid of Object.keys(gameState.participantNames)) {
        if (!gameState.participantIds.includes(uid)) delete gameState.participantNames[uid];
    }

    if (!gameState.hostUid || !gameState.participantIds.includes(gameState.hostUid.toString())) {
        gameState.hostUid = gameState.participantIds[0] || undefined;
    }
}

function getFriendSeat(gameState: any, userId: string): 'player1' | 'player2' | 'spectator' | null {
    normalizeFriendRoomState(gameState);
    const userIdStr = userId.toString();
    if (gameState.playerIds[0] === userIdStr) return 'player1';
    if (gameState.playerIds[1] === userIdStr) return 'player2';
    if (gameState.spectatorIds.includes(userIdStr)) return 'spectator';
    return null;
}

function ensureFriendParticipant(gameState: any, userId: string) {
    normalizeFriendRoomState(gameState);
    const userIdStr = userId.toString();
    if (!gameState.participantIds.includes(userIdStr)) {
        gameState.participantIds.push(userIdStr);
    }
    if (!gameState.hostUid) gameState.hostUid = userIdStr;
}

function rememberFriendParticipantName(gameState: any, userId: string, displayLabel?: string) {
    normalizeFriendRoomState(gameState);
    const userIdStr = userId.toString();
    const label = displayLabel?.trim();
    gameState.participantNames[userIdStr] = label || gameState.participantNames[userIdStr] || userIdStr;
}

function clearFriendPlayerMeta(gameState: any, userId: string) {
    if (gameState.friendDeckSelections) delete gameState.friendDeckSelections[userId];
    if (gameState.friendReady) delete gameState.friendReady[userId];
    if (gameState.players?.[userId] && !isFriendGameStarted(gameState)) delete gameState.players[userId];
}

function setFriendSeat(gameState: any, userId: string, seat: FriendSeatTarget) {
    normalizeFriendRoomState(gameState);
    ensureFriendParticipant(gameState, userId);

    const userIdStr = userId.toString();
    const currentSeat = getFriendSeat(gameState, userIdStr);
    const started = isFriendGameStarted(gameState);

    if (started && currentSeat !== 'player1' && currentSeat !== 'player2' && seat !== 'spectator') {
        throw new Error('对局已开始，无法加入对战席');
    }

    if (seat === 'player') {
        if (currentSeat === 'player1' || currentSeat === 'player2') return;
        seat = !gameState.playerIds[1] ? 'player2' : !gameState.playerIds[0] ? 'player1' : 'spectator';
    }

    if (seat === 'spectator') {
        if (currentSeat === 'player1') gameState.playerIds[0] = null;
        if (currentSeat === 'player2') gameState.playerIds[1] = null;
        clearFriendPlayerMeta(gameState, userIdStr);
        if (!gameState.spectatorIds.includes(userIdStr)) gameState.spectatorIds.push(userIdStr);
    } else {
        if (started && currentSeat !== seat) throw new Error('对局已开始，无法切换对战席');
        const slotIndex = seat === 'player1' ? 0 : 1;
        const occupiedBy = gameState.playerIds[slotIndex];
        if (occupiedBy && occupiedBy !== userIdStr) throw new Error(`${seat === 'player1' ? '玩家1' : '玩家2'} 已有人`);

        if (currentSeat === 'player1') gameState.playerIds[0] = null;
        if (currentSeat === 'player2') gameState.playerIds[1] = null;
        gameState.spectatorIds = gameState.spectatorIds.filter((uid: string) => uid !== userIdStr);
        gameState.playerIds[slotIndex] = userIdStr;
        gameState.friendReady[userIdStr] = false;
    }

    normalizeFriendRoomState(gameState);
    if (!started) {
        gameState.status = gameState.playerIds[0] && gameState.playerIds[1] ? 'READY' : 'WAITING';
    }
}

function removeFriendParticipant(gameState: any, userId: string) {
    normalizeFriendRoomState(gameState);
    const userIdStr = userId.toString();
    const currentSeat = getFriendSeat(gameState, userIdStr);

    gameState.participantIds = gameState.participantIds.filter((uid: string) => uid !== userIdStr);
    gameState.spectatorIds = gameState.spectatorIds.filter((uid: string) => uid !== userIdStr);

    if (!isFriendGameStarted(gameState)) {
        if (currentSeat === 'player1') gameState.playerIds[0] = null;
        if (currentSeat === 'player2') gameState.playerIds[1] = null;
        clearFriendPlayerMeta(gameState, userIdStr);
    }

    gameState.hostUid = gameState.participantIds[0] || undefined;
    if (!isFriendGameStarted(gameState)) {
        gameState.status = gameState.playerIds[0] && gameState.playerIds[1] ? 'READY' : 'WAITING';
    }
}

function isFriendRoomEmpty(gameState: any) {
    normalizeFriendRoomState(gameState);
    return gameState.playerIds.filter(Boolean).length === 0 && gameState.spectatorIds.length === 0;
}

async function removeFriendParticipantAndCloseIfEmpty(gameId: string, userId: string) {
    let closed = false;
    await withGameLock(gameId, async () => {
        const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
        if (rows.length === 0) return;

        const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
        if (gameState?.mode !== 'friend') return;

        removeFriendParticipant(gameState, userId);
        if (isFriendRoomEmpty(gameState)) {
            await pool.query('DELETE FROM games WHERE id = ?', [gameId]);
            io.to(gameId).emit('friendRoomClosed', { gameId });
            io.to(gameId).emit('gameError', { message: '房间已关闭' });
            closed = true;
            return;
        }

        await syncAndSaveState(gameId, gameState);
    });
    return closed;
}

async function removeFriendParticipantFromAllRooms(userId: string) {
    const rows = await pool.query("SELECT id FROM games WHERE id LIKE 'friend_%'");
    await Promise.all(rows.map((row: any) => removeFriendParticipantAndCloseIfEmpty(row.id, userId)));
}

function buildFriendLobbyResponse(gameId: string, gameState: any, userId: string) {
    normalizeFriendRoomState(gameState);
    return {
        gameId,
        roomCode: gameState.roomCode,
        isPublic: !!gameState.isPublic,
        turnTimerLimit: gameState.turnTimerLimit,
        playerIds: gameState.playerIds,
        spectatorIds: gameState.spectatorIds,
        participantIds: gameState.participantIds,
        hostUid: gameState.hostUid,
        participantNames: gameState.participantNames || {},
        friendDeckSelections: gameState.friendDeckSelections || {},
        friendReady: gameState.friendReady || {},
        status: gameState.status || 'WAITING',
        started: isFriendGameStarted(gameState),
        mySeat: getFriendSeat(gameState, userId) || 'spectator'
    };
}

function buildFriendLobbySummary(gameId: string, gameState: any, userId?: string) {
    normalizeFriendRoomState(gameState);
    const [player1, player2] = gameState.playerIds;
    const started = isFriendGameStarted(gameState);
    return {
        gameId,
        roomCode: gameState.roomCode,
        isPublic: !!gameState.isPublic,
        turnTimerLimit: gameState.turnTimerLimit,
        playerIds: gameState.playerIds,
        spectatorCount: gameState.spectatorIds.length,
        hostUid: gameState.hostUid,
        participantNames: gameState.participantNames || {},
        status: gameState.status || 'WAITING',
        started,
        hasOpenSeat: !started && (!player1 || !player2),
        playerCount: gameState.playerIds.filter(Boolean).length,
        mySeat: userId ? getFriendSeat(gameState, userId) : null
    };
}

function getFriendPlayerDeckId(gameState: any, userId: string) {
    normalizeFriendRoomState(gameState);
    return gameState.friendDeckSelections?.[userId.toString()];
}

function normalizeTurnTimerLimit(value: any) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 300;
    return Math.min(999, Math.max(180, Math.round(parsed)));
}

type RpsChoice = 'ROCK' | 'PAPER' | 'SCISSORS';

const RPS_LABELS: Record<RpsChoice, string> = {
    ROCK: '石头',
    PAPER: '布',
    SCISSORS: '剪刀'
};
const RPS_CHOICES: RpsChoice[] = ['ROCK', 'PAPER', 'SCISSORS'];
const PREGAME_DECISION_TIMEOUT_MS = 30000;

function createRpsState(round = 1) {
    return {
        round,
        startedAt: Date.now(),
        timeoutMs: PREGAME_DECISION_TIMEOUT_MS,
        choices: {}
    };
}

function getRpsWinner(choiceA: RpsChoice, choiceB: RpsChoice): RpsChoice | null {
    if (choiceA === choiceB) return null;
    if (
        (choiceA === 'ROCK' && choiceB === 'SCISSORS') ||
        (choiceA === 'SCISSORS' && choiceB === 'PAPER') ||
        (choiceA === 'PAPER' && choiceB === 'ROCK')
    ) {
        return choiceA;
    }
    return choiceB;
}

function enterMulliganPhase(gameState: any, reason: string) {
    gameState.phase = 'MULLIGAN';
    gameState.phaseTimerStart = Date.now();
    gameState.rps = undefined;
    gameState.firstPlayerChoice = undefined;
    if (reason) gameState.logs.push(reason);
}

function setFirstPlayer(gameState: any, firstUid: string) {
    const firstUidStr = firstUid.toString();
    const firstIdx = gameState.playerIds.findIndex((uid: string) => uid.toString() === firstUidStr);
    if (firstIdx === -1) throw new Error('Invalid first player');
    gameState.currentTurnPlayer = firstIdx as 0 | 1;
    gameState.playerIds.forEach((uid: string, index: number) => {
        const player = gameState.players[uid] || gameState.players[uid.toString()];
        if (!player) return;
        player.isFirst = index === firstIdx;
        player.isTurn = false;
    });
}

function beginFirstPlayerChoice(gameState: any, chooserUid: string, source: 'RPS' | 'PRACTICE') {
    gameState.phase = 'FIRST_PLAYER_CHOICE';
    gameState.phaseTimerStart = Date.now();
    gameState.firstPlayerChoice = {
        chooserUid,
        winnerUid: source === 'RPS' ? chooserUid : undefined,
        source,
        startedAt: Date.now(),
        timeoutMs: PREGAME_DECISION_TIMEOUT_MS
    };
}

function submitRpsChoice(gameState: any, playerUid: string, choice: RpsChoice) {
    if (gameState.phase !== 'RPS') throw new Error('当前不在猜拳阶段');
    if (!gameState.playerIds.includes(playerUid)) throw new Error('玩家不在此对局中');
    if (!['ROCK', 'PAPER', 'SCISSORS'].includes(choice)) throw new Error('无效的猜拳选择');

    if (!gameState.rps) gameState.rps = createRpsState(1);
    if (gameState.rps.choices[playerUid]) return;

    gameState.rps.choices[playerUid] = choice;
    const [uidA, uidB] = gameState.playerIds;
    const choiceA = gameState.rps.choices[uidA];
    const choiceB = gameState.rps.choices[uidB];
    if (!choiceA || !choiceB) return;

    const winningChoice = getRpsWinner(choiceA, choiceB);
    if (!winningChoice) {
        gameState.logs.push(`猜拳第 ${gameState.rps.round} 轮：双方都出了${RPS_LABELS[choiceA]}，平局重开。`);
        gameState.rps = createRpsState((gameState.rps.round || 1) + 1);
        return;
    }

    const winnerUid = winningChoice === choiceA ? uidA : uidB;
    gameState.rps.winnerUid = winnerUid;
    gameState.rps.chooserUid = winnerUid;
    gameState.logs.push(`猜拳第 ${gameState.rps.round} 轮：${gameState.players[uidA].displayName} 出${RPS_LABELS[choiceA]}，${gameState.players[uidB].displayName} 出${RPS_LABELS[choiceB]}。${gameState.players[winnerUid].displayName} 获胜。`);
    beginFirstPlayerChoice(gameState, winnerUid, 'RPS');
}

function decideRpsTimeout(gameState: any) {
    if (gameState.phase !== 'RPS' || !gameState.rps) return;
    const [uidA, uidB] = gameState.playerIds;
    const choiceA = gameState.rps.choices?.[uidA];
    const choiceB = gameState.rps.choices?.[uidB];

    if (choiceA && choiceB) return;

    let winnerUid: string;
    if (choiceA && !choiceB) {
        winnerUid = uidA;
        gameState.logs.push(`${gameState.players[uidB]?.displayName || '玩家'} 猜拳超时，${gameState.players[uidA]?.displayName || '玩家'} 获胜。`);
    } else if (!choiceA && choiceB) {
        winnerUid = uidB;
        gameState.logs.push(`${gameState.players[uidA]?.displayName || '玩家'} 猜拳超时，${gameState.players[uidB]?.displayName || '玩家'} 获胜。`);
    } else {
        winnerUid = Math.random() < 0.5 ? uidA : uidB;
        gameState.logs.push(`双方猜拳超时，系统随机判定 ${gameState.players[winnerUid]?.displayName || '玩家'} 获胜。`);
    }

    gameState.rps.winnerUid = winnerUid;
    gameState.rps.chooserUid = winnerUid;
    beginFirstPlayerChoice(gameState, winnerUid, 'RPS');
}

function beginRpsPhase(gameState: any, reason: string) {
    gameState.phase = 'RPS';
    gameState.phaseTimerStart = Date.now();
    gameState.rps = createRpsState(1);
    gameState.playerIds.forEach((uid: string) => {
        if (gameState.players[uid]) gameState.players[uid].isTurn = false;
    });
    gameState.logs.push(reason);
}

function chooseFirstPlayer(gameState: any, chooserUid: string, firstUid: string) {
    if (gameState.phase !== 'FIRST_PLAYER_CHOICE') throw new Error('当前不在先后攻选择阶段');
    const normalizedChooserUid = chooserUid?.toString();
    const normalizedFirstUid = firstUid?.toString();
    if (gameState.firstPlayerChoice?.chooserUid?.toString() !== normalizedChooserUid) throw new Error('只有猜拳胜者可以选择先后攻');
    if (!gameState.playerIds.some((uid: string) => uid.toString() === normalizedFirstUid)) throw new Error('无效的先攻玩家');

    setFirstPlayer(gameState, normalizedFirstUid);
    enterMulliganPhase(gameState, '');
}

function decideFirstPlayerChoiceTimeout(gameState: any) {
    if (gameState.phase !== 'FIRST_PLAYER_CHOICE') return;
    const chooserUid = gameState.firstPlayerChoice?.chooserUid || gameState.playerIds[0];
    const opponentUid = gameState.playerIds.find((uid: string) => uid !== chooserUid) || chooserUid;
    gameState.logs.push(`${gameState.players[chooserUid]?.displayName || '玩家'} 选择先后攻超时，默认选择后攻。`);
    chooseFirstPlayer(gameState, chooserUid, opponentUid);
}

async function finishMulliganAfterReveal(gameId: string, expectedStartedAt: number) {
    setTimeout(async () => {
        await withGameLock(gameId, async () => {
            const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
            if (rows.length === 0) return;

            const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
            ServerGameService.hydrateGameState(gameState);

            if (
                gameState.phase !== 'MULLIGAN' ||
                gameState.mulliganRevealStartedAt !== expectedStartedAt ||
                !Object.values(gameState.players || {}).every((p: any) => p.mulliganDone)
            ) {
                return;
            }

            gameState.phase = 'START';
            gameState.turnCount = 1;
            delete gameState.mulliganRevealStartedAt;

            const currentUid = gameState.playerIds[gameState.currentTurnPlayer];
            gameState.playerIds.forEach((uid: string) => {
                gameState.players[uid].isTurn = (uid === currentUid);
                if (gameState.players[uid]?.mulliganReveal) {
                    delete gameState.players[uid].mulliganReveal;
                }
            });

            const firstPlayerName = gameState.players[currentUid]?.displayName || '玩家';
            const playerNames = gameState.playerIds.map((uid: string) => gameState.players[uid]?.displayName || '玩家');
            addBattleLog(gameState, {
                category: 'SYSTEM',
                actorUid: currentUid,
                actorName: firstPlayerName,
                text: `对战开始：${playerNames[0]} vs ${playerNames[1]}，${firstPlayerName} 先攻。`
            });
            await advancePhase(gameState, gameId, currentUid);
        });
    }, 3600);
}

async function saveMatchLog(gameState: any, gameId?: string): Promise<boolean> {
    if (gameState.gameStatus !== 2 || gameState.logsSaved) return false;
    if (gameState.mode !== 'friend' && gameState.mode !== 'match') return false;

    const matchNumber = gameState.gameId || gameId;
    if (!matchNumber) return false;

    const p1 = gameState.playerIds[0] || 'Unknown';
    const p2 = gameState.playerIds[1] || 'Unknown';
    const winner = gameState.winnerId || 'Draw/None';
    const reason = gameState.winReason || 'Unknown';

    const history = matchLogHistory.get(gameId) || [];
    const logContent = [
        `Player1: ${p1}`,
        `Player2: ${p2}`,
        `Match: ${matchNumber}`,
        `Winner: ${winner}`,
        `Reason: ${reason}`,
        '-----------------------------------',
        ...history.map(battleLogText)
    ].join('\n');

    let savedAny = false;
    for (const uid of gameState.playerIds || []) {
        if (!uid || uid === 'BOT_PLAYER') continue;

        try {
            const rows = await pool.query('SELECT username FROM users WHERE id = ?', [uid]);
            if (rows.length === 0) continue;
            const username = rows[0].username;

            const logDir = path.join(process.cwd(), username, 'matchlog');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            const filePath = path.join(logDir, `${matchNumber}.log`);
            fs.writeFileSync(filePath, logContent);
            // console.log(`[Log] Match log saved for ${username}: ${filePath}`);
            savedAny = true;
        } catch (err) {
            console.error(`[Log] Failed to save match log for user ${uid}:`, err);
        }
    }

    if (savedAny) {
        gameState.logsSaved = true;
        await pool.query('DELETE FROM games WHERE id = ?', [matchNumber]);
        clearGameRuntime(matchNumber);
        return true;
    }

    gameState.logs = history;
    await pool.query('UPDATE games SET state = ? WHERE id = ?', [JSON.stringify(gameState), matchNumber]);
    return false;
}

async function syncAndSaveState(gameId: string, gameState: any) {
    if (!gameState) return;

    // Ensure gameId is always set for client identification
    gameState.gameId = gameId;

    // Ensure logs exist
    if (!gameState.logs) gameState.logs = [];

    EventEngine.recalculateContinuousEffects(gameState);
    normalizeBattleLogs(gameState);

    // 1. Get or create history for this match
    let history = matchLogHistory.get(gameId) || [];
    let lastIdx = lastSyncedLogIndex.get(gameId) || 0;

    // 2. Capture new logs added in this step
    const newLogs = gameState.logs.slice(lastIdx);
    if (newLogs.length > 0) {
        history = history.concat(newLogs);
        matchLogHistory.set(gameId, history);
        lastSyncedLogIndex.set(gameId, history.length);
    }

    // 3. Emit full state to clients (they need logs for display)
    io.to(gameId).emit('gameStateUpdate', gameState);

    // 4. Prune logs in gameState to keep the DB 'state' blob small
    // satisfies "It should not be pushed to the backend (DB)"
    const MAX_DB_LOGS = 1000;
    if (gameState.logs.length > MAX_DB_LOGS) {
        gameState.logs = gameState.logs.slice(-MAX_DB_LOGS);
        // Update lastIdx so the next sync knows where to start from the pruned array
        lastSyncedLogIndex.set(gameId, MAX_DB_LOGS);
    }

    if (gameState.gameStatus === 2) {
        if (gameState.mode === 'bugCup' && gameState.bugCupMatchId) {
            try {
                await recordBugCupGameResult(gameState, gameId);
            } catch (err) {
                console.error(`[BugCup] Failed to record result for ${gameId}:`, err);
            }
        }
        try {
            await saveAiMatchSample(gameState, gameId, history);
        } catch (err) {
            console.error(`[AI Sample] Failed to save sample for ${gameId}:`, err);
        }
    }

    // 5. Persist the pruned state to MariaDB
    await pool.query('UPDATE games SET state = ? WHERE id = ?', [JSON.stringify(gameState), gameId]);

    // 6. If game ended, write full history to file
    if (gameState.gameStatus === 2) {
        const cleanedUp = await saveMatchLog(gameState, gameId);
        if (cleanedUp) {
            clearGameRuntime(gameId);
        }
    }
}

function emitTimerUpdate(gameId: string, gameState: any) {
    const now = Date.now();
    const lastBroadcastAt = lastTimerBroadcast.get(gameId) || 0;
    if (now - lastBroadcastAt < TIMER_BROADCAST_INTERVAL_MS) return;

    lastTimerBroadcast.set(gameId, now);
    io.to(gameId).emit('gameTimerUpdate', {
        gameId,
        phaseTimerStart: now,
        players: getRuntimeTimedState(gameState, now)
    });
}

async function advancePhase(gameState: any, gameId: string, playerId?: string, socket?: any, action?: any) {
    try {
        // console.log(`[Socket] advancePhase for game ${gameId}, action: ${action}, playerId: ${playerId}`);
        await ServerGameService.advancePhase(gameState, action, playerId, async (state) => {
            await syncAndSaveState(gameId, state);
        });
        await ServerGameService.applyConfrontationStrategy(gameState, async (state) => {
            await syncAndSaveState(gameId, state);
        });

        await syncAndSaveState(gameId, gameState);

        triggerBotIfNeeded(gameState, gameId);
    } catch (err: any) {
        // console.error('Game Action Error:', err);
        if (socket) socket.emit('gameError', { message: err.message || 'Action failed' });
    }
}

app.use(cors());
app.use('/assets', express.static(path.join(process.cwd(), 'assets'), {
    maxAge: '30d'
}));
app.use('/pics', express.static(path.join(process.cwd(), 'pics'), {
    maxAge: '30d'
}));

// Background Unified Timer Loop
setInterval(async () => {
    try {
        await ensureBugCupSchedule();
        const games = await pool.query('SELECT id FROM games WHERE status = 0');
        for (const row of games) {
            const gameId = row.id;

            await withGameLock(gameId, async () => {
                const stateRows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
                if (stateRows.length === 0) return;

                const gameState = typeof stateRows[0].state === 'string' ? JSON.parse(stateRows[0].state) : stateRows[0].state;
                if (!gameState || gameState.gameStatus === 2) return;
                if (gameState.mode === 'friend' && !isFriendGameStarted(gameState)) return;
                ServerGameService.hydrateGameState(gameState);

                const now = Date.now();
                // Identify active player(s) for the timer
                let activePlayerUid: string | undefined;
                let stateChanged = false;

                if (gameState.phase === 'RPS') {
                    const rpsElapsed = now - (gameState.rps?.startedAt || gameState.phaseTimerStart || now);
                    if (rpsElapsed >= (gameState.rps?.timeoutMs || PREGAME_DECISION_TIMEOUT_MS)) {
                        decideRpsTimeout(gameState);
                        stateChanged = true;
                    }
                } else if (gameState.phase === 'FIRST_PLAYER_CHOICE') {
                    const choiceElapsed = now - (gameState.firstPlayerChoice?.startedAt || gameState.phaseTimerStart || now);
                    if (choiceElapsed >= (gameState.firstPlayerChoice?.timeoutMs || PREGAME_DECISION_TIMEOUT_MS)) {
                        decideFirstPlayerChoiceTimeout(gameState);
                        stateChanged = true;
                    }
                } else if (gameState.phase === 'MULLIGAN') {
                    // Mulligan countdown is visual-only here; player choices still drive state transitions.
                } else {
                    activePlayerUid = getActiveTimerPlayerUid(gameState);
                }

                if (activePlayerUid && gameState.players[activePlayerUid]) {
                    const player = gameState.players[activePlayerUid];
                    const runtimeRemaining = getRuntimeTimedState(gameState, now)[activePlayerUid]?.timeRemaining ?? player.timeRemaining;

                    if (runtimeRemaining <= 0) {
                        // TIMEOUT LOSS
                        gameState.gameStatus = 2;
                        gameState.winnerId = gameState.playerIds.find(id => id !== activePlayerUid);
                        gameState.winReason = 'TIMEOUT_LOSS';
                        player.timeRemaining = 0;
                        gameState.logs.push(`[对局结束] ${player.displayName} 时间已耗尽，判负。`);

                        await syncAndSaveState(gameId, gameState);
                        return;
                    }
                }

                emitTimerUpdate(gameId, gameState);
                if (stateChanged) {
                    await syncAndSaveState(gameId, gameState);
                }

                // Bot action check
                const currentPlayerId = gameState.playerIds[gameState.currentTurnPlayer];
                const isBotQuery = gameState.pendingQuery && gameState.pendingQuery.playerUid === 'BOT_PLAYER';
                const isBotDefending = gameState.phase === 'DEFENSE_DECLARATION' && !gameState.players['BOT_PLAYER']?.isTurn;
                if (isBotQuery || (!gameState.pendingQuery && (currentPlayerId === 'BOT_PLAYER' || gameState.priorityPlayerId === 'BOT_PLAYER' || isBotDefending))) {
                    const syncCallback = async (state: any) => {
                        await syncAndSaveState(gameId, state);
                    };
                    handleBotMove(gameState, gameId); // handleBotMove already does its own lock/fetch
                }
            });
        }
    } catch (err) {
        console.error('[Timer] Error in unified timer loop:', err);
    }
}, GAME_TIMEOUTS.CHECK_INTERVAL);

app.use(express.json());

// Initialize MariaDB Connection
// Initialize MariaDB Connection and then start server
// dbInit() was moved to start() below

app.post('/api/register/send-code', async (req, res): Promise<void> => {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body.email === 'string' ? normalizeEmail(req.body.email) : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    const usernameError = validateUsername(username);
    if (usernameError) {
        res.status(400).json({ error: usernameError });
        return;
    }

    const emailError = validateEmail(email);
    if (emailError) {
        res.status(400).json({ error: emailError });
        return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
        res.status(400).json({ error: passwordError });
        return;
    }

    try {
        const existingUsers = await pool.query(
            'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
            [username, email]
        );
        if (existingUsers.length > 0) {
            res.status(409).json({ error: '用户名或邮箱已被注册' });
            return;
        }

        const existingCodeRows = await pool.query(
            'SELECT created_at FROM email_verification_codes WHERE email = ?',
            [email]
        );
        if (existingCodeRows.length > 0) {
            const lastSentAt = Number(existingCodeRows[0].created_at || 0);
            const retryAfterMs = getVerificationCodeResendMs() - (Date.now() - lastSentAt);
            if (retryAfterMs > 0) {
                res.status(429).json({
                    error: `验证码发送过于频繁，请在 ${Math.ceil(retryAfterMs / 1000)} 秒后重试`
                });
                return;
            }
        }

        const code = createVerificationCode();
        const now = Date.now();
        const expiresAt = now + getVerificationCodeExpireMs();

        await pool.query(
            `INSERT INTO email_verification_codes (email, username, code, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE username = VALUES(username), code = VALUES(code), expires_at = VALUES(expires_at), created_at = VALUES(created_at)`,
            [email, username, code, expiresAt, now]
        );

        try {
            await sendRegistrationVerificationEmail(email, code);
        } catch (mailErr: any) {
            await pool.query('DELETE FROM email_verification_codes WHERE email = ?', [email]);
            console.error('Send verification email error:', mailErr);
            res.status(500).json({ error: mailErr?.message || '验证码发送失败' });
            return;
        }

        res.json({
            success: true,
            message: '验证码已发送，请前往邮箱查收',
            expiresInMs: getVerificationCodeExpireMs()
        });
    } catch (err) {
        console.error('Send register code error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/register', async (req, res): Promise<void> => {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body.email === 'string' ? normalizeEmail(req.body.email) : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const verificationCode = typeof req.body.verificationCode === 'string' ? req.body.verificationCode.trim() : '';

    const usernameError = validateUsername(username);
    if (usernameError) {
        res.status(400).json({ error: usernameError });
        return;
    }

    const emailError = validateEmail(email);
    if (emailError) {
        res.status(400).json({ error: emailError });
        return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
        res.status(400).json({ error: passwordError });
        return;
    }

    if (!/^\d{6}$/.test(verificationCode)) {
        res.status(400).json({ error: '请输入 6 位验证码' });
        return;
    }

    let conn;
    try {
        const verificationRows = await pool.query(
            'SELECT username, code, expires_at FROM email_verification_codes WHERE email = ?',
            [email]
        );
        if (verificationRows.length === 0) {
            res.status(400).json({ error: '请先获取邮箱验证码' });
            return;
        }

        const verificationRow = verificationRows[0];
        if (verificationRow.username !== username) {
            res.status(400).json({ error: '验证码与当前用户名不匹配，请重新获取验证码' });
            return;
        }
        if (Number(verificationRow.expires_at) < Date.now()) {
            await pool.query('DELETE FROM email_verification_codes WHERE email = ?', [email]);
            res.status(400).json({ error: '验证码已过期，请重新获取' });
            return;
        }
        if (verificationRow.code !== verificationCode) {
            res.status(400).json({ error: '验证码错误' });
            return;
        }

        conn = await pool.getConnection();
        await conn.beginTransaction();

        const duplicateRows = await conn.query(
            'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
            [username, email]
        );
        if (duplicateRows.length > 0) {
            await conn.rollback();
            res.status(409).json({ error: '用户名或邮箱已被注册' });
            return;
        }

        const userId = createUserId();
        const passwordHash = await bcrypt.hash(password, 10);

        await conn.query(
            `INSERT INTO users (
                id, username, email, password_hash, display_name, role, coins, card_crystals,
                favorite_card_id, favorite_back_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'fav_card', 'default', ?)`,
            [
                userId,
                username,
                email,
                passwordHash,
                username,
                'user',
                STARTER_COINS,
                STARTER_CARD_CRYSTALS,
                Date.now()
            ]
        );

        await seedStarterResources(conn, userId);
        await conn.query('DELETE FROM email_verification_codes WHERE email = ?', [email]);
        await conn.commit();

        const issued = await issueTokenForUser(userId);
        if (!issued) {
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(201).json({
            token: issued.token,
            user: issued.user
        });
    } catch (err) {
        if (conn) {
            await conn.rollback();
        }
        console.error('Register error:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        if (conn) conn.release();
    }
});

// Login Endpoint
app.post('/api/login', async (req, res): Promise<void> => {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ error: 'Username and password required' });
        return;
    }

    try {
        const rows = await pool.query(
            'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1',
            [username, normalizeEmail(username)]
        );
        if (rows.length === 0) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        const user = rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        await pool.query('UPDATE users SET session_version = COALESCE(session_version, 0) + 1 WHERE id = ?', [user.id]);
        await forceLogoutOtherSockets(String(user.id));
        const issued = await issueTokenForUser(String(user.id));
        if (!issued) {
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.json({ token: issued.token, user: issued.user });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create Practice Game
app.post('/api/games/practice', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { deckId, turnTimerLimit } = req.body;
    const botDifficulty = req.body?.botDifficulty === 'hard' ? 'hard' : 'simple';
    const requestedBotDeckProfileId = typeof req.body?.botDeckProfileId === 'string' ? req.body.botDeckProfileId : undefined;
    if (!deckId) { res.status(400).json({ error: '请选择卡组' }); return; }

    try {
        const validation = await validateUserDeck(user.userId, deckId);
        if (!validation.valid) { res.status(400).json({ error: validation.error }); return; }

        const aiOpponentDeck = botDifficulty === 'hard'
            ? resolveAiOpponentDeck(requestedBotDeckProfileId)
            : undefined;
        if (aiOpponentDeck && !aiOpponentDeck.valid) {
            res.status(400).json({ error: aiOpponentDeck.error || '人机卡组不可用' });
            return;
        }

        const gameId = 'practice_' + Math.random().toString(36).substring(2, 9);
        const gameState = await ServerGameService.createPracticeGameState(
            validation.cards!,
            user.userId,
            user.displayName,
            turnTimerLimit,
            botDifficulty,
            aiOpponentDeck?.profileId,
            aiOpponentDeck?.cards
        );
        gameState.gameId = gameId;
        ServerGameService.applyHardAiSoftOpeningCompensation(gameState, 'BOT_PLAYER');

        await pool.query('INSERT INTO games (id, state, status) VALUES (?, ?, 0)', [gameId, JSON.stringify(gameState)]);
        res.json({ gameId, botDeckProfileId: aiOpponentDeck?.profileId, botDeckName: aiOpponentDeck?.displayName });
    } catch (err) {
        console.error('Create practice game error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create Friend Match (generates 8-digit room code)
app.post('/api/games/friend', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const roomCode = Math.random().toString(10).substring(2, 10).padEnd(8, '0');
        const gameId = 'friend_' + roomCode;
        const userIdStr = user.userId.toString();
        const isPublic = !!req.body?.isPublic;
        const initialState = {
            gameId: gameId,
            playerIds: [userIdStr, null],
            participantIds: [userIdStr],
            spectatorIds: [],
            hostUid: userIdStr,
            participantNames: { [userIdStr]: getUserUsernameLabel(user) },
            friendDeckSelections: {},
            friendReady: { [userIdStr]: false },
            players: {},
            status: 'WAITING',
            phase: 'INIT',
            turnCount: 0,
            currentTurnPlayer: 0,
            logs: [],
            mode: 'friend',
            roomCode: roomCode,
            isPublic,
            counterStack: [],
            isCountering: 0,
            effectUsage: {},
            turnTimerLimit: normalizeTurnTimerLimit(req.body?.turnTimerLimit)
        };

        await pool.query('INSERT INTO games (id, state, status) VALUES (?, ?, 0)', [gameId, JSON.stringify(initialState)]);
        res.json(buildFriendLobbyResponse(gameId, initialState, userIdStr));
    } catch (err) {
        console.error('Create friend game error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/games/friend/lobby', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const rows = await pool.query("SELECT id, state FROM games WHERE id LIKE 'friend_%' ORDER BY id DESC LIMIT 60");
        const userIdStr = user.userId.toString();
        const rooms = rows
            .map((row: any) => {
                const gameState = typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
                if (!gameState || gameState.mode !== 'friend' || gameState.gameStatus === 2) return null;
                normalizeFriendRoomState(gameState);
                if (!gameState.isPublic) return null;
                return buildFriendLobbySummary(row.id, gameState, userIdStr);
            })
            .filter(Boolean)
            .filter((room: any) => room.started || room.hasOpenSeat || room.mySeat)
            .sort((a: any, b: any) => {
                if (!!a.mySeat !== !!b.mySeat) return a.mySeat ? -1 : 1;
                if (a.started !== b.started) return a.started ? 1 : -1;
                return b.roomCode.localeCompare(a.roomCode);
            });

        res.json({ rooms });
    } catch (err) {
        console.error('Friend lobby list error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Join Friend Match by room code
app.post('/api/games/friend/join', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { roomCode } = req.body;
    if (!roomCode) { res.status(400).json({ error: '请输入房间码' }); return; }

    try {
        const gameId = 'friend_' + roomCode;
        const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
        if (rows.length === 0) {
            res.status(404).json({ error: '未找到该房间' });
            return;
        }
        const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
        const userIdStr = user.userId.toString();
        ensureFriendParticipant(gameState, userIdStr);
        rememberFriendParticipantName(gameState, userIdStr, getUserUsernameLabel(user));
        if (!isFriendGameStarted(gameState) && !getFriendSeat(gameState, userIdStr)) {
            setFriendSeat(gameState, userIdStr, gameState.playerIds[1] ? 'spectator' : 'player2');
        } else if (isFriendGameStarted(gameState) && !getFriendSeat(gameState, userIdStr)) {
            setFriendSeat(gameState, userIdStr, 'spectator');
        }

        await syncAndSaveState(gameId, gameState);
        res.json(buildFriendLobbyResponse(gameId, gameState, userIdStr));
    } catch (err) {
        console.error('Join friend game error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/games/friend/:gameId/status', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const { gameId } = req.params;
        if (!gameId || !gameId.startsWith('friend_')) {
            res.status(400).json({ error: 'Invalid friend game id' });
            return;
        }

        const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
        if (rows.length === 0) {
            res.status(404).json({ error: 'Game not found' });
            return;
        }

        const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
        normalizeFriendRoomState(gameState);
        const playerIds = Array.isArray(gameState.playerIds) ? gameState.playerIds : [];
        const spectatorIds = Array.isArray(gameState.spectatorIds) ? gameState.spectatorIds : [];
        const participantIds = Array.isArray(gameState.participantIds) ? gameState.participantIds : [];
        const userIdStr = user.userId.toString();
        rememberFriendParticipantName(gameState, userIdStr, getUserUsernameLabel(user));

        if (!participantIds.includes(userIdStr)) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }

        res.json(buildFriendLobbyResponse(gameId, gameState, userIdStr));
    } catch (err) {
        console.error('Friend game status error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/games/friend/:gameId/seat', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { gameId } = req.params;
    const seat = req.body?.seat as FriendSeatTarget;
    if (!['player1', 'player2', 'spectator'].includes(seat)) {
        res.status(400).json({ error: '无效的席位' });
        return;
    }

    try {
        await withGameLock(gameId, async () => {
            const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
            if (rows.length === 0) { res.status(404).json({ error: '未找到该房间' }); return; }
            const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
            rememberFriendParticipantName(gameState, user.userId.toString(), getUserUsernameLabel(user));
            setFriendSeat(gameState, user.userId.toString(), seat);
            await syncAndSaveState(gameId, gameState);
            res.json(buildFriendLobbyResponse(gameId, gameState, user.userId.toString()));
        });
    } catch (err: any) {
        res.status(400).json({ error: err.message || '切换席位失败' });
    }
});

app.post('/api/games/friend/:gameId/timer', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { gameId } = req.params;
    const turnTimerLimit = normalizeTurnTimerLimit(req.body?.turnTimerLimit);

    try {
        await withGameLock(gameId, async () => {
            const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
            if (rows.length === 0) { res.status(404).json({ error: '未找到该房间' }); return; }
            const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
            normalizeFriendRoomState(gameState);
            if (isFriendGameStarted(gameState)) { res.status(400).json({ error: '对局已开始，无法修改时间' }); return; }
            if (gameState.hostUid?.toString() !== user.userId.toString()) { res.status(403).json({ error: '只有房主可以修改时间' }); return; }

            gameState.turnTimerLimit = turnTimerLimit;
            await syncAndSaveState(gameId, gameState);
            res.json(buildFriendLobbyResponse(gameId, gameState, user.userId.toString()));
        });
    } catch (err) {
        console.error('Friend timer update error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/games/friend/:gameId/deck', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { gameId } = req.params;
    const { deckId } = req.body || {};
    if (!deckId) { res.status(400).json({ error: '请选择卡组' }); return; }

    try {
        await withGameLock(gameId, async () => {
            const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
            if (rows.length === 0) { res.status(404).json({ error: '未找到该房间' }); return; }
            const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
            if (isFriendGameStarted(gameState)) { res.status(400).json({ error: '对局已开始' }); return; }

            const userIdStr = user.userId.toString();
            const seat = getFriendSeat(gameState, userIdStr);
            if (seat !== 'player1' && seat !== 'player2') { res.status(400).json({ error: '只有对战席需要选择卡组' }); return; }

            const validation = await validateUserDeck(user.userId, deckId);
            if (!validation.valid) { res.status(400).json({ error: validation.error }); return; }

            gameState.friendDeckSelections[userIdStr] = deckId;
            gameState.friendReady[userIdStr] = false;
            await syncAndSaveState(gameId, gameState);
            res.json(buildFriendLobbyResponse(gameId, gameState, userIdStr));
        });
    } catch (err) {
        console.error('Friend deck selection error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/games/friend/:gameId/ready', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { gameId } = req.params;
    const ready = !!req.body?.ready;

    try {
        await withGameLock(gameId, async () => {
            const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
            if (rows.length === 0) { res.status(404).json({ error: '未找到该房间' }); return; }
            const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
            if (isFriendGameStarted(gameState)) { res.json(buildFriendLobbyResponse(gameId, gameState, user.userId.toString())); return; }

            normalizeFriendRoomState(gameState);
            const userIdStr = user.userId.toString();
            const seat = getFriendSeat(gameState, userIdStr);
            if (seat !== 'player1' && seat !== 'player2') { res.status(400).json({ error: '观众无需准备' }); return; }
            const deckId = gameState.friendDeckSelections?.[userIdStr];
            if (ready) {
                if (!deckId) { res.status(400).json({ error: '请先选择卡组' }); return; }
                const validation = await validateUserDeck(user.userId, deckId);
                if (!validation.valid) { res.status(400).json({ error: validation.error }); return; }
            }

            gameState.friendReady[userIdStr] = ready;
            const [p1, p2] = gameState.playerIds;
            if (
                p1 && p2 &&
                gameState.friendDeckSelections[p1] &&
                gameState.friendDeckSelections[p2] &&
                gameState.friendReady[p1] &&
                gameState.friendReady[p2]
            ) {
                gameState.status = 'STARTING';
            } else {
                gameState.status = p1 && p2 ? 'READY' : 'WAITING';
            }

            await syncAndSaveState(gameId, gameState);
            res.json(buildFriendLobbyResponse(gameId, gameState, userIdStr));
        });
    } catch (err) {
        console.error('Friend ready error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/games/friend/:gameId/leave', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { gameId } = req.params;

    try {
        const closed = await removeFriendParticipantAndCloseIfEmpty(gameId, user.userId.toString());
        res.json({ ok: true, closed });
    } catch (err) {
        console.error('Friend leave error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Matchmaking Queue
const matchmakingQueue: { userId: string; socketId?: string; timestamp: number; deck?: Card[]; turnTimerLimit?: number }[] = [];
// Matchmaking results map: userId -> gameId
const matchmakingResults = new Map<string, string>();
const authenticatedSockets = new Map<string, Set<string>>();
const onlineSockets = new Map<string, { userId: string; username?: string; displayName?: string }>();

function getAuthenticatedSocketIds(userId: string) {
    return Array.from(authenticatedSockets.get(userId) || []);
}

function addAuthenticatedSocket(userId: string, socketId: string) {
    const socketIds = authenticatedSockets.get(userId) || new Set<string>();
    socketIds.add(socketId);
    authenticatedSockets.set(userId, socketIds);
}

function removeAuthenticatedSocket(userId: string, socketId: string) {
    const socketIds = authenticatedSockets.get(userId);
    if (!socketIds) return;
    socketIds.delete(socketId);
    if (socketIds.size === 0) authenticatedSockets.delete(userId);
}

async function forceLogoutOtherSockets(userId: string, keepSocketId?: string) {
    for (const socketId of getAuthenticatedSocketIds(userId)) {
        if (socketId === keepSocketId) continue;

        const target = io.sockets.sockets.get(socketId);
        if (!target) {
            removeAuthenticatedSocket(userId, socketId);
            onlineSockets.delete(socketId);
            continue;
        }

        target.emit('forceLogout', { reason: FORCE_LOGOUT_REASON });
        target.disconnect(true);
    }
}

const getMatchmakingQueueIndex = (userId: string | number) => matchmakingQueue.findIndex(q => q.userId === userId.toString());
const removeMatchmakingQueueEntries = (userId: string | number) => {
    const userIdStr = userId.toString();
    for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
        if (matchmakingQueue[i].userId === userIdStr) {
            matchmakingQueue.splice(i, 1);
        }
    }
};
const popMatchmakingOpponent = (userId: string | number) => {
    const userIdStr = userId.toString();
    const opponentIndex = matchmakingQueue.findIndex(q => q.userId !== userIdStr);
    if (opponentIndex === -1) return null;
    const [opponent] = matchmakingQueue.splice(opponentIndex, 1);
    return opponent || null;
};

function getOnlinePlayers() {
    const users = new Map<string, { uid: string; username?: string; displayName: string }>();
    for (const onlineUser of onlineSockets.values()) {
        if (!onlineUser.userId) continue;
        users.set(onlineUser.userId, {
            uid: onlineUser.userId,
            username: onlineUser.username,
            displayName: getUserDisplayLabel(onlineUser)
        });
    }
    return Array.from(users.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function emitOnlinePlayers() {
    const players = getOnlinePlayers();
    io.emit('onlinePlayers', {
        players,
        count: players.length
    });
}


app.post('/api/games/matchmaking', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const { deckId, turnTimerLimit } = req.body;
        
        // 1. Check if user is already matched in a pending result
        const existingGameId = matchmakingResults.get(user.userId.toString());
        if (existingGameId) {
            res.json({ gameId: existingGameId, matched: true });
            return;
        }

        if (!deckId) { res.status(400).json({ error: '请选择卡组' }); return; }

        const validation = await validateUserDeck(user.userId, deckId);
        if (!validation.valid) { res.status(400).json({ error: validation.error }); return; }

        // Remove self from queue if already there (to avoid duplicates or refresh timestamp)
        const userIdStr = user.userId.toString();
        removeMatchmakingQueueEntries(userIdStr);

        // 2. Try to match with someone else
        const opponent = popMatchmakingOpponent(userIdStr);
        if (opponent) {
            // Create a match
            const gameId = 'match_' + Math.random().toString(36).substring(2, 9);
            const gameState = await ServerGameService.createMatchGameState(opponent.userId, opponent.deck!, userIdStr, validation.cards!, turnTimerLimit || opponent.turnTimerLimit);
            gameState.gameId = gameId;

            await pool.query('INSERT INTO games (id, state, status) VALUES (?, ?, 0)', [gameId, JSON.stringify(gameState)]);

            // Store results for both players to allow discovery via polling
            matchmakingResults.set(userIdStr, gameId);
            matchmakingResults.set(opponent.userId, gameId);

            // Notify via socket as well (as an optimization)
            if (opponent.socketId) {
                io.to(opponent.socketId).emit('matchFound', { gameId });
            }
            const currentSocketIds = getAuthenticatedSocketIds(userIdStr);
            if (currentSocketIds.length > 0) {
                currentSocketIds.forEach(socketId => io.to(socketId).emit('matchFound', { gameId }));
            }

            res.json({ gameId, matched: true });
        } else {
            // Add to queue
            matchmakingQueue.push({
                userId: userIdStr,
                socketId: getAuthenticatedSocketIds(userIdStr)[0],
                deck: validation.cards,
                timestamp: Date.now(),
                turnTimerLimit
            });
            res.json({ matched: false, position: matchmakingQueue.length });
        }
    } catch (err) {
        console.error('Matchmaking error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/games/matchmaking/status', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const userIdStr = user.userId.toString();
    const existingGameId = matchmakingResults.get(userIdStr);
    if (existingGameId) {
        res.json({ gameId: existingGameId, matched: true });
        return;
    }

    const queueIndex = getMatchmakingQueueIndex(userIdStr);
    res.json({
        matched: false,
        queued: queueIndex !== -1,
        position: queueIndex === -1 ? null : queueIndex + 1
    });
});

// Cancel matchmaking
app.post('/api/games/matchmaking/cancel', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    removeMatchmakingQueueEntries(user.userId);
    res.json({ success: true });
});

// Legacy create game (kept for compatibility)
app.post('/api/games', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const mode = req.body?.practice ? 'practice' : 'match';
        const botDifficulty = req.body?.botDifficulty === 'hard' ? 'hard' : 'simple';
        const prefix = mode === 'practice' ? 'practice_' : 'match_';
        const gameId = prefix + Math.random().toString(36).substring(2, 9);
        const initialState = {
            playerIds: mode === 'practice' ? [user.userId, 'BOT_PLAYER'] : [user.userId],
            players: {},
            status: mode === 'practice' ? 'READY' : 'WAITING',
            phase: 'INIT',
            turnCount: 0,
            currentTurnPlayer: 0,
            logs: [],
            mode,
            botDifficulty: mode === 'practice' ? botDifficulty : undefined,
            counterStack: [],
            isCountering: 0,
            effectUsage: {}
        };
        await pool.query('INSERT INTO games (id, state, status) VALUES (?, ?, 0)', [gameId, JSON.stringify(initialState)]);
        res.json({ gameId });
    } catch (err) {
        console.error('Create game error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


// Profile Endpoint
app.get('/api/user/profile', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const rows = await pool.query('SELECT favorite_card_id, favorite_back_id, coins, card_crystals FROM users WHERE id = ?', [user.userId]);
        res.json({
            favoriteCardId: rows.length > 0 ? rows[0].favorite_card_id : null,
            favoriteBackId: rows.length > 0 ? rows[0].favorite_back_id : 'default',
            coins: rows.length > 0 ? Number(rows[0].coins) : 0,
            cardCrystals: rows.length > 0 ? Number(rows[0].card_crystals) : 0
        });
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

app.put('/api/user/profile', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const { favoriteCardId, favoriteBackId, username } = req.body || {};
        const nextUsername = typeof username === 'string' ? username.trim() : undefined;

        if (nextUsername !== undefined && !nextUsername) {
            res.status(400).json({ error: '用户名不能为空' });
            return;
        }
        if (nextUsername !== undefined) {
            const usernameError = validateUsername(nextUsername);
            if (usernameError) {
                res.status(400).json({ error: usernameError });
                return;
            }

            const exists = await pool.query('SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1', [nextUsername, user.userId]);
            if (exists.length > 0) {
                res.status(400).json({ error: '用户名已存在' });
                return;
            }
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (favoriteCardId !== undefined) {
            updates.push('favorite_card_id = ?');
            params.push(favoriteCardId);
        }
        if (favoriteBackId !== undefined) {
            updates.push('favorite_back_id = ?');
            params.push(favoriteBackId);
        }
        if (nextUsername !== undefined) {
            updates.push('username = ?');
            params.push(nextUsername);
            updates.push('display_name = ?');
            params.push(nextUsername);
        }

        const shouldRotateSession = nextUsername !== undefined;
        const currentSocketId = getRequestSocketId(req);

        if (updates.length === 0) {
            const issued = await issueTokenForUser(user.userId);
            if (!issued) {
                res.status(500).json({ error: 'DB Error' });
                return;
            }
            res.json({ success: true, user: issued.user, token: issued.token });
            return;
        }

        if (shouldRotateSession) {
            await pool.query('UPDATE users SET session_version = COALESCE(session_version, 0) + 1 WHERE id = ?', [user.userId]);
            await forceLogoutOtherSockets(user.userId.toString(), currentSocketId);
        }
        params.push(user.userId);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        const issued = await issueTokenForUser(user.userId);
        if (!issued) {
            res.status(500).json({ error: 'DB Error' });
            return;
        }

        for (const [socketId, onlineUser] of onlineSockets.entries()) {
            if (onlineUser.userId === user.userId.toString()) {
                onlineSockets.set(socketId, {
                    ...onlineUser,
                    username: issued.user.username,
                    displayName: issued.user.displayName
                });
            }
        }
        emitOnlinePlayers();

        res.json({ success: true, user: issued.user, token: issued.token });
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

app.post('/api/games/friend/:gameId/visibility', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { gameId } = req.params;
    const isPublic = !!req.body?.isPublic;

    try {
        await withGameLock(gameId, async () => {
            const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
            if (rows.length === 0) { res.status(404).json({ error: '未找到该房间' }); return; }
            const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
            normalizeFriendRoomState(gameState);
            if (isFriendGameStarted(gameState)) { res.status(400).json({ error: '对局已开始，无法修改公开状态' }); return; }
            if (gameState.hostUid?.toString() !== user.userId.toString()) { res.status(403).json({ error: '只有房主可以修改公开状态' }); return; }

            gameState.isPublic = isPublic;
            await syncAndSaveState(gameId, gameState);
            res.json(buildFriendLobbyResponse(gameId, gameState, user.userId.toString()));
        });
    } catch (err) {
        console.error('Friend visibility update error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Decks Endpoints
app.get('/api/user/decks', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const rows = await pool.query('SELECT * FROM decks WHERE user_id = ?', [user.userId]);
        const decks = rows.map((r: any) => ({
            id: r.id,
            name: r.name,
            cards: typeof r.cards === 'string' ? JSON.parse(r.cards) : r.cards,
            createdAt: Number(r.created_at),
            updatedAt: Number(r.updated_at)
        }));
        res.json({ decks });
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

app.post('/api/user/decks', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const deckData = req.body;
        const deckId = Math.random().toString(36).substring(2, 10);

        // Ensure we only store IDs
        let cardIds = deckData.cards || [];
        if (cardIds.length > 0 && typeof cardIds[0] === 'object') {
            cardIds = cardIds.map((c: any) => c.id);
        }

        await pool.query(
            'INSERT INTO decks (id, user_id, name, cards, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [deckId, user.userId, deckData.name, JSON.stringify(cardIds), Date.now(), Date.now()]
        );
        res.json({ id: deckId });
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

app.put('/api/user/decks/:id', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const deckId = req.params.id;
        const deckData = req.body;

        if (deckData.cards) {
            let cardIds = deckData.cards;
            if (cardIds.length > 0 && typeof cardIds[0] === 'object') {
                cardIds = cardIds.map((c: any) => c.id);
            }
            await pool.query('UPDATE decks SET name = ?, cards = ?, updated_at = ? WHERE id = ? AND user_id = ?',
                [deckData.name, JSON.stringify(cardIds), Date.now(), deckId, user.userId]);
        } else {
            await pool.query('UPDATE decks SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?',
                [deckData.name, Date.now(), deckId, user.userId]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

app.delete('/api/user/decks/:id', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const deckId = req.params.id;
        await pool.query('DELETE FROM decks WHERE id = ? AND user_id = ?', [deckId, user.userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

app.post('/api/user/decks/:id/copy', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const deckId = req.params.id;
        const rows = await pool.query('SELECT * FROM decks WHERE id = ? AND user_id = ?', [deckId, user.userId]);
        if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }

        const original = rows[0];
        const newDeckId = Math.random().toString(36).substring(2, 10);
        await pool.query(
            'INSERT INTO decks (id, user_id, name, cards, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [newDeckId, user.userId, original.name + ' (副本)', typeof original.cards === 'string' ? original.cards : JSON.stringify(original.cards), Date.now(), Date.now()]
        );
        res.json({ id: newDeckId });
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

const parseStoredDeckCards = (cards: any): string[] => {
    const parsed = typeof cards === 'string' ? JSON.parse(cards) : cards;
    return Array.isArray(parsed) ? parsed.map((card: any) => typeof card === 'string' ? card : card?.id).filter(Boolean) : [];
};

const buildDeckSquarePost = (row: any, likedPostIds: Set<string>) => ({
    id: row.id,
    sourceDeckId: row.source_deck_id,
    authorUid: row.user_id,
    authorName: row.author_name,
    name: row.name,
    cards: parseStoredDeckCards(row.cards),
    tags: parseStoredDeckCards(row.tags),
    likes: Number(row.like_count || 0),
    likedByMe: likedPostIds.has(row.id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
});

const BUG_CUP_EDITION = 1;
const BUG_CUP_NAME = 'bug杯';
const BUG_CUP_TAG = '第1届bug杯杯赛';
const DAY_MS = 24 * 60 * 60 * 1000;
const BUG_CUP_START = Date.parse('2026-05-18T00:00:00+08:00');
const BUG_CUP_SWISS_START = BUG_CUP_START + 7 * DAY_MS;
const BUG_CUP_ELIM_SEMI_START = BUG_CUP_SWISS_START + 5 * DAY_MS;
const BUG_CUP_ELIM_FINAL_START = BUG_CUP_ELIM_SEMI_START + DAY_MS;
const BUG_CUP_END = BUG_CUP_ELIM_FINAL_START + DAY_MS;
const BUG_CUP_SIMULATED_OPPONENTS = [
    { userId: 'bugcup_mock_rank_2', displayName: '模拟对手 2名', rank: 2 },
    { userId: 'bugcup_mock_rank_3', displayName: '模拟对手 3名', rank: 3 }
];

const bugCupPrelimQueue: { userId: string; socketId?: string; deckIndex: number; timestamp: number }[] = [];
const bugCupPrelimResults = new Map<string, string>();

function getBugCupMockNow() {
    const envNow = Number(process.env.BUG_CUP_MOCK_NOW_MS || '');
    return Number.isFinite(envNow) && envNow > 0 ? envNow : null;
}

function getBugCupNow() {
    return getBugCupMockNow() ?? Date.now();
}

function shouldInjectBugCupSimulatedOpponents() {
    const mockNow = getBugCupMockNow();
    return !!mockNow && mockNow >= BUG_CUP_ELIM_SEMI_START;
}

function safeJsonArray(value: any): any[] {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function getBugCupPhase(now = getBugCupNow()) {
    if (now < BUG_CUP_START) return 'UPCOMING';
    if (now < BUG_CUP_SWISS_START) return 'PRELIM';
    if (now < BUG_CUP_ELIM_SEMI_START) return 'SWISS';
    if (now < BUG_CUP_END) return 'ELIMINATION';
    return 'FINISHED';
}

function buildBugCupCurrent(now = getBugCupNow()) {
    const phase = getBugCupPhase(now);
    const swissRound = phase === 'SWISS'
        ? Math.min(5, Math.max(1, Math.floor((now - BUG_CUP_SWISS_START) / DAY_MS) + 1))
        : phase === 'ELIMINATION' || phase === 'FINISHED' ? 5 : 0;
    const eliminationRound = phase === 'ELIMINATION'
        ? (now < BUG_CUP_ELIM_FINAL_START ? 1 : 2)
        : phase === 'FINISHED' ? 2 : 0;

    return {
        edition: BUG_CUP_EDITION,
        name: BUG_CUP_NAME,
        tag: BUG_CUP_TAG,
        phase,
        canEditDecks: now < BUG_CUP_SWISS_START,
        now,
        simulated: getBugCupMockNow() === now,
        swissRound,
        eliminationRound,
        schedule: {
            startAt: BUG_CUP_START,
            prelimEndAt: BUG_CUP_SWISS_START,
            swissEndAt: BUG_CUP_ELIM_SEMI_START,
            semiFinalAt: BUG_CUP_ELIM_SEMI_START,
            finalAt: BUG_CUP_ELIM_FINAL_START,
            endAt: BUG_CUP_END
        }
    };
}

function serializeBugCupMatch(row: any) {
    if (!row) return null;
    return {
        id: row.id,
        edition: Number(row.edition),
        phase: row.phase,
        round: Number(row.round),
        player1Id: row.player1_id,
        player2Id: row.player2_id || null,
        player1DeckIndex: row.player1_deck_index === null || row.player1_deck_index === undefined ? null : Number(row.player1_deck_index),
        player2DeckIndex: row.player2_deck_index === null || row.player2_deck_index === undefined ? null : Number(row.player2_deck_index),
        player1Ready: !!row.player1_ready,
        player2Ready: !!row.player2_ready,
        gameId: row.game_id || null,
        winnerId: row.winner_id || null,
        resultStatus: row.result_status,
        scheduledFor: Number(row.scheduled_for),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at)
    };
}

async function getBugCupRegistration(userId: string, edition = BUG_CUP_EDITION) {
    const rows = await pool.query('SELECT * FROM bug_cup_registrations WHERE edition = ? AND user_id = ? LIMIT 1', [edition, userId]);
    if (!rows.length) return null;
    const row = rows[0];
    return {
        edition: Number(row.edition),
        userId: row.user_id,
        displayName: row.display_name,
        deckSourceIds: safeJsonArray(row.deck_source_ids).map(String),
        deckNames: safeJsonArray(row.deck_names).map(String),
        deckCards: safeJsonArray(row.deck_cards).map((cards: any) => Array.isArray(cards) ? cards.map(String) : []),
        deckSquarePostIds: safeJsonArray(row.deck_square_post_ids).map(String),
        registeredAt: Number(row.registered_at),
        updatedAt: Number(row.updated_at),
        lockedAt: row.locked_at ? Number(row.locked_at) : null
    };
}

async function upsertBugCupDeckSquarePost(user: any, slot: number, sourceDeckId: string, deckName: string, cardIds: string[], existingPostId?: string) {
    const now = Date.now();
    const sourceId = `bugcup:${BUG_CUP_EDITION}:${user.userId}:${slot}:${sourceDeckId}`;
    const postName = `${BUG_CUP_TAG} - ${deckName}`;
    const existingRows = existingPostId
        ? await pool.query('SELECT id FROM deck_square_posts WHERE id = ? AND user_id = ? LIMIT 1', [existingPostId, user.userId])
        : await pool.query('SELECT id FROM deck_square_posts WHERE source_deck_id = ? AND user_id = ? LIMIT 1', [sourceId, user.userId]);

    if (existingRows.length > 0) {
        await pool.query(
            'UPDATE deck_square_posts SET source_deck_id = ?, author_name = ?, name = ?, cards = ?, tags = ?, updated_at = ? WHERE id = ?',
            [sourceId, getUserDisplayLabel(user), postName, JSON.stringify(cardIds), JSON.stringify([BUG_CUP_TAG]), now, existingRows[0].id]
        );
        return existingRows[0].id;
    }

    const postId = `bugcup_${BUG_CUP_EDITION}_${Math.random().toString(36).slice(2, 10)}`;
    await pool.query(
        'INSERT INTO deck_square_posts (id, source_deck_id, user_id, author_name, name, cards, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [postId, sourceId, user.userId, getUserDisplayLabel(user), postName, JSON.stringify(cardIds), JSON.stringify([BUG_CUP_TAG]), now, now]
    );
    return postId;
}

async function readAndValidateBugCupDecks(user: any, deckIds: string[]) {
    const uniqueDeckIds = deckIds.map(id => String(id || '').trim()).filter(Boolean).slice(0, 2);
    if (uniqueDeckIds.length < 1 || uniqueDeckIds.length > 2) {
        throw new Error('请选择 1 到 2 套卡组');
    }

    const decks: { sourceId: string; name: string; cards: string[] }[] = [];
    for (const deckId of uniqueDeckIds) {
        const rows = await pool.query('SELECT id, name, cards FROM decks WHERE id = ? AND user_id = ? LIMIT 1', [deckId, user.userId]);
        if (!rows.length) throw new Error('未找到选择的卡组');

        const cardIds = parseStoredDeckCards(rows[0].cards);
        const cardObjects = cardIds.map(id => SERVER_CARD_LIBRARY[id]).filter(Boolean);
        if (cardObjects.length !== cardIds.length) throw new Error(`《${rows[0].name}》包含服务器未找到的卡牌`);

        const validation = ServerGameService.validateDeck(cardObjects as any);
        if (!validation.valid) throw new Error(`《${rows[0].name}》不合法：${validation.error}`);

        decks.push({ sourceId: rows[0].id, name: rows[0].name, cards: cardIds });
    }
    return decks;
}

async function saveBugCupRegistration(user: any, deckIds: string[]) {
    if (!buildBugCupCurrent().canEditDecks) {
        throw new Error('瑞士轮开始后卡组已锁定，无法修改');
    }

    const existing = await getBugCupRegistration(user.userId.toString());
    const decks = await readAndValidateBugCupDecks(user, deckIds);
    const postIds: string[] = [];
    for (let i = 0; i < decks.length; i++) {
        postIds.push(await upsertBugCupDeckSquarePost(user, i, decks[i].sourceId, decks[i].name, decks[i].cards, existing?.deckSquarePostIds?.[i]));
    }

    const now = Date.now();
    await pool.query(
        `REPLACE INTO bug_cup_registrations
         (edition, user_id, display_name, deck_source_ids, deck_names, deck_cards, deck_square_post_ids, registered_at, updated_at, locked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            BUG_CUP_EDITION,
            user.userId,
            getUserDisplayLabel(user),
            JSON.stringify(decks.map(deck => deck.sourceId)),
            JSON.stringify(decks.map(deck => deck.name)),
            JSON.stringify(decks.map(deck => deck.cards)),
            JSON.stringify(postIds),
            existing?.registeredAt || now,
            now,
            null
        ]
    );
    return getBugCupRegistration(user.userId.toString());
}

async function syncExistingBugCupDecks(user: any) {
    const registration = await getBugCupRegistration(user.userId.toString());
    if (!registration) throw new Error('尚未报名');
    return saveBugCupRegistration(user, registration.deckSourceIds);
}

function resolveBugCupDeckCards(registration: any, deckIndex: number) {
    const cardIds = registration?.deckCards?.[deckIndex];
    if (!Array.isArray(cardIds)) throw new Error('未找到提交卡组');
    const cards = cardIds.map((id: string) => SERVER_CARD_LIBRARY[id]).filter(Boolean);
    if (cards.length !== cardIds.length) throw new Error('提交卡组包含服务器未找到的卡牌');
    const validation = ServerGameService.validateDeck(cards as any);
    if (!validation.valid) throw new Error(`提交卡组不合法：${validation.error}`);
    return cards as Card[];
}

async function createBugCupGame(match: any, player1DeckIndex: number, player2DeckIndex: number) {
    const p1Reg = await getBugCupRegistration(match.player1_id, Number(match.edition));
    const p2Reg = await getBugCupRegistration(match.player2_id, Number(match.edition));
    if (!p1Reg || !p2Reg) throw new Error('双方都需要报名');

    const p1Cards = resolveBugCupDeckCards(p1Reg, player1DeckIndex);
    const p2Cards = resolveBugCupDeckCards(p2Reg, player2DeckIndex);
    const gameId = `bugcup_${match.id}_${Math.random().toString(36).slice(2, 7)}`;
    const gameState = await ServerGameService.createMatchGameState(match.player1_id, p1Cards, match.player2_id, p2Cards);
    gameState.gameId = gameId;
    gameState.mode = 'bugCup';
    (gameState as any).bugCupMatchId = match.id;
    (gameState as any).bugCupEdition = Number(match.edition);
    (gameState as any).bugCupPhase = match.phase;
    (gameState as any).bugCupRound = Number(match.round);
    gameState.players[match.player1_id].displayName = p1Reg.displayName || '玩家1';
    gameState.players[match.player2_id].displayName = p2Reg.displayName || '玩家2';
    gameState.logs = [`${BUG_CUP_NAME} ${match.phase === 'PRELIM' ? '预赛' : match.phase === 'SWISS' ? `瑞士轮第 ${match.round} 轮` : match.round === 1 ? '半决赛' : '决赛'}开始。`];

    await pool.query('INSERT INTO games (id, state, status) VALUES (?, ?, 0)', [gameId, JSON.stringify(gameState)]);
    return { gameId, gameState };
}

async function recordBugCupGameResult(gameState: any, gameId: string) {
    const matchId = gameState?.bugCupMatchId;
    if (!matchId) return;
    const rows = await pool.query('SELECT * FROM bug_cup_matches WHERE id = ? LIMIT 1', [matchId]);
    if (!rows.length || rows[0].result_status === 'COMPLETED' || rows[0].result_status === 'DOUBLE_LOSS') return;
    await pool.query(
        'UPDATE bug_cup_matches SET winner_id = ?, result_status = ?, updated_at = ? WHERE id = ?',
        [gameState.winnerId || null, gameState.winnerId ? 'COMPLETED' : 'DOUBLE_LOSS', Date.now(), matchId]
    );
    if (rows[0].phase === 'PRELIM') {
        bugCupPrelimResults.delete(rows[0].player1_id);
        if (rows[0].player2_id) bugCupPrelimResults.delete(rows[0].player2_id);
    }
}

async function getBugCupStandings(edition = BUG_CUP_EDITION, includeSimulatedOpponents = true) {
    const registrations = await pool.query('SELECT * FROM bug_cup_registrations WHERE edition = ? ORDER BY registered_at ASC, user_id ASC', [edition]);
    const table = new Map<string, any>();
    registrations.forEach((row: any) => {
        table.set(row.user_id, {
            userId: row.user_id,
            displayName: row.display_name,
            wins: 0,
            losses: 0,
            opponentWins: 0,
            registeredAt: Number(row.registered_at)
        });
    });

    const matches = await pool.query(
        "SELECT * FROM bug_cup_matches WHERE edition = ? AND phase = 'SWISS' AND result_status IN ('COMPLETED', 'DOUBLE_LOSS', 'BYE')",
        [edition]
    );
    for (const match of matches) {
        const p1 = table.get(match.player1_id);
        const p2 = match.player2_id ? table.get(match.player2_id) : null;
        if (!p1) continue;
        if (!p2) {
            if (match.winner_id === match.player1_id) p1.wins += 1;
            continue;
        }
        if (match.winner_id === match.player1_id) {
            p1.wins += 1;
            p2.losses += 1;
        } else if (match.winner_id === match.player2_id) {
            p2.wins += 1;
            p1.losses += 1;
        } else {
            p1.losses += 1;
            p2.losses += 1;
        }
    }

    for (const match of matches) {
        if (!match.player2_id) continue;
        const p1 = table.get(match.player1_id);
        const p2 = table.get(match.player2_id);
        if (p1 && p2) {
            p1.opponentWins += p2.wins;
            p2.opponentWins += p1.wins;
        }
    }

    const sorted = Array.from(table.values())
        .sort((a, b) =>
            b.wins - a.wins ||
            b.opponentWins - a.opponentWins ||
            a.registeredAt - b.registeredAt ||
            a.userId.localeCompare(b.userId)
        );

    if (includeSimulatedOpponents && shouldInjectBugCupSimulatedOpponents()) {
        const existingIds = new Set(sorted.map(entry => entry.userId));
        const baseWins = sorted[0]?.wins ?? 5;
        const baseOpponentWins = sorted[0]?.opponentWins ?? 0;
        const simulated = BUG_CUP_SIMULATED_OPPONENTS
            .filter(opponent => !existingIds.has(opponent.userId))
            .map((opponent, index) => ({
                userId: opponent.userId,
                displayName: opponent.displayName,
                wins: Math.max(0, baseWins - 1),
                losses: index,
                opponentWins: Math.max(0, baseOpponentWins - index),
                registeredAt: BUG_CUP_START + opponent.rank
            }));

        const first = sorted.slice(0, 1);
        const rest = sorted.slice(1);
        const injected = [...first, ...simulated, ...rest].slice(0, Math.max(4, sorted.length + simulated.length));
        return injected.map((entry, index) => ({ rank: index + 1, ...entry, simulated: BUG_CUP_SIMULATED_OPPONENTS.some(opponent => opponent.userId === entry.userId) }));
    }

    return sorted.map((entry, index) => ({ rank: index + 1, ...entry }));
}

async function bugCupPairingsAlreadyExist(phase: string, round: number) {
    const rows = await pool.query('SELECT id FROM bug_cup_matches WHERE edition = ? AND phase = ? AND round = ? LIMIT 1', [BUG_CUP_EDITION, phase, round]);
    return rows.length > 0;
}

async function createBugCupMatch(phase: string, round: number, player1Id: string, player2Id: string | null, scheduledFor: number, winnerId?: string | null, status = 'PENDING') {
    const now = Date.now();
    const id = `bc${BUG_CUP_EDITION}_${phase.toLowerCase()}_${round}_${Math.random().toString(36).slice(2, 10)}`;
    await pool.query(
        `INSERT INTO bug_cup_matches
         (id, edition, phase, round, player1_id, player2_id, winner_id, result_status, scheduled_for, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, BUG_CUP_EDITION, phase, round, player1Id, player2Id, winnerId || null, status, scheduledFor, now, now]
    );
}

async function settleExpiredBugCupMatches(now = Date.now()) {
    const rows = await pool.query(
        "SELECT * FROM bug_cup_matches WHERE edition = ? AND phase IN ('SWISS', 'ELIMINATION') AND result_status IN ('PENDING', 'ACTIVE') AND scheduled_for + ? <= ?",
        [BUG_CUP_EDITION, DAY_MS, now]
    );

    for (const match of rows) {
        let winnerId: string | null = null;
        let status = 'DOUBLE_LOSS';

        if (match.game_id) {
            const gameRows = await pool.query('SELECT state FROM games WHERE id = ? LIMIT 1', [match.game_id]);
            const state = gameRows.length ? (typeof gameRows[0].state === 'string' ? JSON.parse(gameRows[0].state) : gameRows[0].state) : null;
            if (state?.gameStatus === 2 && state.winnerId) {
                winnerId = state.winnerId;
                status = 'COMPLETED';
            }
        } else if (!!match.player1_ready !== !!match.player2_ready) {
            winnerId = match.player1_ready ? match.player1_id : match.player2_id;
            status = 'COMPLETED';
        }

        await pool.query(
            'UPDATE bug_cup_matches SET winner_id = ?, result_status = ?, updated_at = ? WHERE id = ?',
            [winnerId, status, now, match.id]
        );
    }
}

async function createSwissRoundIfNeeded(round: number) {
    if (await bugCupPairingsAlreadyExist('SWISS', round)) return;

    const scheduledFor = BUG_CUP_SWISS_START + (round - 1) * DAY_MS;
    const standings = await getBugCupStandings(BUG_CUP_EDITION, false);
    const remaining = standings.map(item => item.userId);

    while (remaining.length > 1) {
        const player1Id = remaining.shift()!;
        let opponentIndex = 0;
        if (round > 1) {
            const playedRows = await pool.query(
                "SELECT id FROM bug_cup_matches WHERE edition = ? AND phase = 'SWISS' AND ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?)) LIMIT 1",
                [BUG_CUP_EDITION, player1Id, remaining[0], remaining[0], player1Id]
            );
            if (playedRows.length > 0) {
                const found = await Promise.all(remaining.map(async (candidate, index) => {
                    const rows = await pool.query(
                        "SELECT id FROM bug_cup_matches WHERE edition = ? AND phase = 'SWISS' AND ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?)) LIMIT 1",
                        [BUG_CUP_EDITION, player1Id, candidate, candidate, player1Id]
                    );
                    return rows.length === 0 ? index : -1;
                }));
                opponentIndex = found.find(index => index >= 0) ?? 0;
            }
        }
        const [player2Id] = remaining.splice(opponentIndex, 1);
        await createBugCupMatch('SWISS', round, player1Id, player2Id, scheduledFor);
    }

    if (remaining.length === 1) {
        await createBugCupMatch('SWISS', round, remaining[0], null, scheduledFor, remaining[0], 'BYE');
    }
}

async function createEliminationIfNeeded(now = Date.now()) {
    if (now >= BUG_CUP_ELIM_SEMI_START && !(await bugCupPairingsAlreadyExist('ELIMINATION', 1))) {
        const top4 = (await getBugCupStandings()).slice(0, 4);
        if (top4.length >= 4) {
            await createBugCupMatch('ELIMINATION', 1, top4[0].userId, top4[3].userId, BUG_CUP_ELIM_SEMI_START);
            await createBugCupMatch('ELIMINATION', 1, top4[1].userId, top4[2].userId, BUG_CUP_ELIM_SEMI_START);
        }
    }

    if (now >= BUG_CUP_ELIM_FINAL_START && !(await bugCupPairingsAlreadyExist('ELIMINATION', 2))) {
        const semiRows = await pool.query(
            "SELECT * FROM bug_cup_matches WHERE edition = ? AND phase = 'ELIMINATION' AND round = 1 AND result_status = 'COMPLETED' AND winner_id IS NOT NULL ORDER BY created_at ASC",
            [BUG_CUP_EDITION]
        );
        if (semiRows.length >= 2) {
            await createBugCupMatch('ELIMINATION', 2, semiRows[0].winner_id, semiRows[1].winner_id, BUG_CUP_ELIM_FINAL_START);
        }
    }
}

async function ensureBugCupSchedule() {
    const now = getBugCupNow();
    if (now >= BUG_CUP_SWISS_START) {
        await pool.query('UPDATE bug_cup_registrations SET locked_at = COALESCE(locked_at, ?) WHERE edition = ?', [BUG_CUP_SWISS_START, BUG_CUP_EDITION]);
    }

    if (now >= BUG_CUP_SWISS_START) {
        const currentRound = Math.min(5, Math.floor((Math.min(now, BUG_CUP_ELIM_SEMI_START - 1) - BUG_CUP_SWISS_START) / DAY_MS) + 1);
        for (let round = 1; round <= currentRound; round++) {
            await createSwissRoundIfNeeded(round);
            await settleExpiredBugCupMatches(now);
        }
    } else {
        await settleExpiredBugCupMatches(now);
    }
    await createEliminationIfNeeded(now);
}

function getBugCupMatchOpponent(match: any, userId: string) {
    if (!match) return null;
    return match.player1_id === userId ? match.player2_id : match.player1_id;
}

function getBugCupDisplayName(userId?: string | null, fallback?: string | null) {
    if (!userId) return fallback || '待定';
    const simulated = BUG_CUP_SIMULATED_OPPONENTS.find(opponent => opponent.userId === userId);
    return simulated?.displayName || fallback || userId;
}

async function isProtectedBugCupDeckSquarePost(post: any) {
    if (!post) return false;
    if (String(post.source_deck_id || '').startsWith('bugcup:')) return true;
    if (safeJsonArray(post.tags).map(String).includes(BUG_CUP_TAG)) return true;

    const rows = await pool.query(
        'SELECT user_id FROM bug_cup_registrations WHERE edition = ? AND JSON_CONTAINS(deck_square_post_ids, JSON_QUOTE(?)) LIMIT 1',
        [BUG_CUP_EDITION, post.id]
    );
    return rows.length > 0;
}

app.get('/api/bug-cup/current', async (_req, res): Promise<void> => {
    try {
        await ensureBugCupSchedule();
        res.json(buildBugCupCurrent());
    } catch (err) {
        console.error('Bug cup current error:', err);
        res.status(500).json({ error: 'DB Error' });
    }
});

app.post('/api/bug-cup/register', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        await ensureBugCupSchedule();
        const deckIds = Array.isArray(req.body?.deckIds) ? req.body.deckIds : [];
        const registration = await saveBugCupRegistration(user, deckIds);
        res.json({ registration, current: buildBugCupCurrent() });
    } catch (err: any) {
        res.status(400).json({ error: err.message || '报名失败' });
    }
});

app.post('/api/bug-cup/decks/sync', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        await ensureBugCupSchedule();
        const deckIds = Array.isArray(req.body?.deckIds) ? req.body.deckIds : null;
        const registration = deckIds ? await saveBugCupRegistration(user, deckIds) : await syncExistingBugCupDecks(user);
        res.json({ registration, current: buildBugCupCurrent() });
    } catch (err: any) {
        res.status(400).json({ error: err.message || '同步失败' });
    }
});

app.get('/api/bug-cup/me', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        await ensureBugCupSchedule();
        const userId = user.userId.toString();
        const registration = await getBugCupRegistration(userId);
        const matches = await pool.query(
            `SELECT m.*,
                    u1.username AS player1_name,
                    u2.username AS player2_name
             FROM bug_cup_matches m
             LEFT JOIN users u1 ON u1.id = m.player1_id
             LEFT JOIN users u2 ON u2.id = m.player2_id
             WHERE m.edition = ? AND (m.player1_id = ? OR m.player2_id = ?)
             ORDER BY m.scheduled_for DESC, m.created_at DESC
             LIMIT 30`,
            [BUG_CUP_EDITION, userId, userId]
        );
        const standings = await getBugCupStandings();
        res.json({
            current: buildBugCupCurrent(),
            registration,
            myRank: standings.find(item => item.userId === userId) || null,
            matches: matches.map((row: any) => ({
                ...serializeBugCupMatch(row),
                opponentId: getBugCupMatchOpponent(row, userId),
                player1Name: row.player1_name || row.player1_id,
                player2Name: row.player2_name || row.player2_id
            }))
        });
    } catch (err) {
        console.error('Bug cup me error:', err);
        res.status(500).json({ error: 'DB Error' });
    }
});

app.get('/api/bug-cup/standings', async (_req, res): Promise<void> => {
    try {
        await ensureBugCupSchedule();
        const eliminationRows = await pool.query(
            `SELECT m.*,
                    u1.username AS player1_name,
                    u2.username AS player2_name
             FROM bug_cup_matches m
             LEFT JOIN users u1 ON u1.id = m.player1_id
             LEFT JOIN users u2 ON u2.id = m.player2_id
             WHERE m.edition = ? AND m.phase = 'ELIMINATION'
             ORDER BY m.round ASC, m.created_at ASC`,
            [BUG_CUP_EDITION]
        );
        res.json({
            current: buildBugCupCurrent(),
            standings: await getBugCupStandings(),
            eliminationMatches: eliminationRows.map((row: any) => ({
                ...serializeBugCupMatch(row),
                player1Name: getBugCupDisplayName(row.player1_id, row.player1_name),
                player2Name: getBugCupDisplayName(row.player2_id, row.player2_name),
                winnerName: row.winner_id === row.player1_id
                    ? getBugCupDisplayName(row.winner_id, row.player1_name)
                    : row.winner_id === row.player2_id
                        ? getBugCupDisplayName(row.winner_id, row.player2_name)
                        : getBugCupDisplayName(row.winner_id, null)
            }))
        });
    } catch (err) {
        console.error('Bug cup standings error:', err);
        res.status(500).json({ error: 'DB Error' });
    }
});

app.post('/api/bug-cup/prelim/matchmaking', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        await ensureBugCupSchedule();
        const current = buildBugCupCurrent();
        if (current.phase !== 'PRELIM') { res.status(400).json({ error: '当前不在预赛阶段' }); return; }

        const userId = user.userId.toString();
        if (req.body?.cancel) {
            for (let i = bugCupPrelimQueue.length - 1; i >= 0; i--) {
                if (bugCupPrelimQueue[i].userId === userId) bugCupPrelimQueue.splice(i, 1);
            }
            res.json({ matched: false, cancelled: true });
            return;
        }

        const existingGameId = bugCupPrelimResults.get(userId);
        if (existingGameId) {
            res.json({ matched: true, gameId: existingGameId });
            return;
        }

        const registration = await getBugCupRegistration(userId);
        if (!registration) { res.status(400).json({ error: '请先报名' }); return; }
        const deckIndex = Number(req.body?.deckIndex || 0);
        if (!Number.isInteger(deckIndex) || deckIndex < 0 || deckIndex >= registration.deckCards.length) {
            res.status(400).json({ error: '请选择已提交的卡组' });
            return;
        }
        resolveBugCupDeckCards(registration, deckIndex);

        for (let i = bugCupPrelimQueue.length - 1; i >= 0; i--) {
            if (bugCupPrelimQueue[i].userId === userId) bugCupPrelimQueue.splice(i, 1);
        }

        const opponentIndex = bugCupPrelimQueue.findIndex(entry => entry.userId !== userId);
        if (opponentIndex === -1) {
            bugCupPrelimQueue.push({
                userId,
                socketId: getAuthenticatedSocketIds(userId)[0],
                deckIndex,
                timestamp: Date.now()
            });
            res.json({ matched: false, position: bugCupPrelimQueue.length });
            return;
        }

        const [opponent] = bugCupPrelimQueue.splice(opponentIndex, 1);
        const matchId = `bc${BUG_CUP_EDITION}_prelim_${Math.random().toString(36).slice(2, 10)}`;
        const now = Date.now();
        await pool.query(
            `INSERT INTO bug_cup_matches
             (id, edition, phase, round, player1_id, player2_id, player1_deck_index, player2_deck_index, player1_ready, player2_ready, result_status, scheduled_for, created_at, updated_at)
             VALUES (?, ?, 'PRELIM', 0, ?, ?, ?, ?, TRUE, TRUE, 'ACTIVE', ?, ?, ?)`,
            [matchId, BUG_CUP_EDITION, opponent.userId, userId, opponent.deckIndex, deckIndex, now, now, now]
        );
        const matchRows = await pool.query('SELECT * FROM bug_cup_matches WHERE id = ?', [matchId]);
        const { gameId } = await createBugCupGame(matchRows[0], opponent.deckIndex, deckIndex);
        await pool.query('UPDATE bug_cup_matches SET game_id = ?, updated_at = ? WHERE id = ?', [gameId, Date.now(), matchId]);

        bugCupPrelimResults.set(userId, gameId);
        bugCupPrelimResults.set(opponent.userId, gameId);
        if (opponent.socketId) io.to(opponent.socketId).emit('bugCupMatchFound', { gameId });
        getAuthenticatedSocketIds(userId).forEach(socketId => io.to(socketId).emit('bugCupMatchFound', { gameId }));
        res.json({ matched: true, gameId });
    } catch (err: any) {
        console.error('Bug cup prelim matchmaking error:', err);
        res.status(500).json({ error: err.message || '匹配失败' });
    }
});

app.post('/api/bug-cup/matches/:id/ready', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const matchId = req.params.id;
    try {
        await ensureBugCupSchedule();
        await withGameLock(`bugcup:${matchId}`, async () => {
            const rows = await pool.query('SELECT * FROM bug_cup_matches WHERE id = ? AND edition = ? LIMIT 1', [matchId, BUG_CUP_EDITION]);
            if (!rows.length) { res.status(404).json({ error: '未找到比赛' }); return; }
            const match = rows[0];
            const userId = user.userId.toString();
            const isPlayer1 = match.player1_id === userId;
            const isPlayer2 = match.player2_id === userId;
            if (!isPlayer1 && !isPlayer2) { res.status(403).json({ error: '你不是该轮比赛选手' }); return; }
            if (match.result_status === 'COMPLETED' || match.result_status === 'DOUBLE_LOSS' || match.result_status === 'BYE') {
                res.json({ match: serializeBugCupMatch(match), gameId: match.game_id || null });
                return;
            }

            if (req.body?.ready === false || req.body?.cancel === true) {
                if (match.phase !== 'SWISS') {
                    res.status(400).json({ error: '只有瑞士轮可以取消准备' });
                    return;
                }
                if (match.game_id) {
                    res.status(400).json({ error: '对局已开始，无法取消准备' });
                    return;
                }

                const updateField = isPlayer1 ? 'player1' : 'player2';
                await pool.query(
                    `UPDATE bug_cup_matches
                     SET ${updateField}_ready = FALSE, ${updateField}_ready_at = NULL, ${updateField}_deck_index = NULL, updated_at = ?
                     WHERE id = ?`,
                    [Date.now(), matchId]
                );

                const nextRows = await pool.query('SELECT * FROM bug_cup_matches WHERE id = ? LIMIT 1', [matchId]);
                res.json({ match: serializeBugCupMatch(nextRows[0]), gameId: null });
                return;
            }

            const registration = await getBugCupRegistration(userId);
            if (!registration) { res.status(400).json({ error: '请先报名' }); return; }
            const deckIndex = Number(req.body?.deckIndex || 0);
            if (!Number.isInteger(deckIndex) || deckIndex < 0 || deckIndex >= registration.deckCards.length) {
                res.status(400).json({ error: '请选择已提交的卡组' });
                return;
            }
            resolveBugCupDeckCards(registration, deckIndex);

            const updateField = isPlayer1 ? 'player1' : 'player2';
            const now = Date.now();
            await pool.query(
                `UPDATE bug_cup_matches
                 SET ${updateField}_ready = TRUE, ${updateField}_ready_at = ?, ${updateField}_deck_index = ?, updated_at = ?
                 WHERE id = ?`,
                [now, deckIndex, now, matchId]
            );

            const nextRows = await pool.query('SELECT * FROM bug_cup_matches WHERE id = ? LIMIT 1', [matchId]);
            const nextMatch = nextRows[0];
            if (nextMatch.player1_ready && nextMatch.player2_ready && !nextMatch.game_id) {
                const { gameId } = await createBugCupGame(nextMatch, Number(nextMatch.player1_deck_index || 0), Number(nextMatch.player2_deck_index || 0));
                await pool.query(
                    "UPDATE bug_cup_matches SET game_id = ?, result_status = 'ACTIVE', updated_at = ? WHERE id = ?",
                    [gameId, Date.now(), matchId]
                );

                [nextMatch.player1_id, nextMatch.player2_id]
                    .filter(Boolean)
                    .forEach((uid: string) => {
                        getAuthenticatedSocketIds(uid.toString()).forEach(socketId => {
                            io.to(socketId).emit('bugCupMatchFound', { gameId, matchId });
                        });
                    });

                res.json({ match: { ...serializeBugCupMatch(nextMatch), gameId, resultStatus: 'ACTIVE' }, gameId });
                return;
            }

            res.json({ match: serializeBugCupMatch(nextMatch), gameId: nextMatch.game_id || null });
        });
    } catch (err: any) {
        console.error('Bug cup ready error:', err);
        res.status(500).json({ error: err.message || '准备失败' });
    }
});


app.get('/api/deck-square', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const rows = await pool.query(`
            SELECT p.*, COALESCE(l.like_count, 0) AS like_count
            FROM deck_square_posts p
            LEFT JOIN (
                SELECT post_id, COUNT(*) AS like_count
                FROM deck_square_likes
                GROUP BY post_id
            ) l ON l.post_id = p.id
            ORDER BY like_count DESC, p.created_at DESC
            LIMIT 100
        `);
        const likedRows = await pool.query('SELECT post_id FROM deck_square_likes WHERE user_id = ?', [user.userId]);
        const likedPostIds = new Set<string>(likedRows.map((row: any) => row.post_id));
        res.json({ posts: rows.map((row: any) => buildDeckSquarePost(row, likedPostIds)) });
    } catch (err) {
        console.error('Deck square list error:', err);
        res.status(500).json({ error: 'DB Error' });
    }
});

app.post('/api/deck-square/publish', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const { deckId } = req.body || {};
        const tags = Array.isArray(req.body?.tags)
            ? req.body.tags.map((tag: any) => String(tag).trim()).filter(Boolean).slice(0, 8)
            : [];
        if (!deckId) { res.status(400).json({ error: '请选择要发布的卡组' }); return; }

        const deckRows = await pool.query('SELECT * FROM decks WHERE id = ? AND user_id = ?', [deckId, user.userId]);
        if (deckRows.length === 0) { res.status(404).json({ error: '未找到卡组' }); return; }

        const deck = deckRows[0];
        const cardIds = parseStoredDeckCards(deck.cards);
        if (cardIds.length === 0) { res.status(400).json({ error: '空卡组不能发布' }); return; }

        const existingRows = await pool.query('SELECT id FROM deck_square_posts WHERE source_deck_id = ? AND user_id = ?', [deckId, user.userId]);
        const now = Date.now();
        if (existingRows.length > 0) {
            await pool.query(
                'UPDATE deck_square_posts SET author_name = ?, name = ?, cards = ?, tags = ?, updated_at = ? WHERE id = ?',
                [getUserDisplayLabel(user), deck.name, JSON.stringify(cardIds), JSON.stringify(tags), now, existingRows[0].id]
            );
            res.json({ id: existingRows[0].id, updated: true });
            return;
        }

        const postId = Math.random().toString(36).substring(2, 10);
        await pool.query(
            'INSERT INTO deck_square_posts (id, source_deck_id, user_id, author_name, name, cards, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [postId, deckId, user.userId, getUserDisplayLabel(user), deck.name, JSON.stringify(cardIds), JSON.stringify(tags), now, now]
        );
        res.json({ id: postId, published: true });
    } catch (err) {
        console.error('Deck square publish error:', err);
        res.status(500).json({ error: 'DB Error' });
    }
});

app.post('/api/deck-square/:id/like', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const postId = req.params.id;
        const postRows = await pool.query('SELECT id FROM deck_square_posts WHERE id = ?', [postId]);
        if (postRows.length === 0) { res.status(404).json({ error: '未找到发布的卡组' }); return; }

        const existingRows = await pool.query('SELECT post_id FROM deck_square_likes WHERE post_id = ? AND user_id = ?', [postId, user.userId]);
        if (existingRows.length > 0) {
            await pool.query('DELETE FROM deck_square_likes WHERE post_id = ? AND user_id = ?', [postId, user.userId]);
        } else {
            await pool.query(
                'INSERT INTO deck_square_likes (post_id, user_id, created_at) VALUES (?, ?, ?)',
                [postId, user.userId, Date.now()]
            );
        }

        const countRows = await pool.query('SELECT COUNT(*) AS count FROM deck_square_likes WHERE post_id = ?', [postId]);
        res.json({ liked: existingRows.length === 0, likes: Number(countRows[0]?.count || 0) });
    } catch (err) {
        console.error('Deck square like error:', err);
        res.status(500).json({ error: 'DB Error' });
    }
});

app.delete('/api/deck-square/:id', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const postId = req.params.id;
        const postRows = await pool.query('SELECT id, user_id, source_deck_id, tags FROM deck_square_posts WHERE id = ?', [postId]);
        if (postRows.length === 0) { res.status(404).json({ error: '未找到发布的卡组' }); return; }
        if (postRows[0].user_id !== user.userId) { res.status(403).json({ error: '只有发布者可以删除该卡组' }); return; }
        if (await isProtectedBugCupDeckSquarePost(postRows[0])) {
            res.status(400).json({ error: 'bug杯参赛卡组不能从套牌广场删除' });
            return;
        }

        await pool.query('DELETE FROM deck_square_likes WHERE post_id = ?', [postId]);
        await pool.query('DELETE FROM deck_square_posts WHERE id = ? AND user_id = ?', [postId, user.userId]);
        res.json({ deleted: true });
    } catch (err) {
        console.error('Deck square delete error:', err);
        res.status(500).json({ error: 'DB Error' });
    }
});

app.post('/api/deck-square/:id/copy', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const postRows = await pool.query('SELECT * FROM deck_square_posts WHERE id = ?', [req.params.id]);
        if (postRows.length === 0) { res.status(404).json({ error: '未找到发布的卡组' }); return; }

        const post = postRows[0];
        const newDeckId = Math.random().toString(36).substring(2, 10);
        await pool.query(
            'INSERT INTO decks (id, user_id, name, cards, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [newDeckId, user.userId, `${post.name} (广场复制)`, typeof post.cards === 'string' ? post.cards : JSON.stringify(post.cards), Date.now(), Date.now()]
        );
        res.json({ id: newDeckId });
    } catch (err) {
        console.error('Deck square copy error:', err);
        res.status(500).json({ error: 'DB Error' });
    }
});

app.get('/api/games', async (req, res): Promise<void> => {
    try {
        const rows = await pool.query('SELECT * FROM games WHERE status = 0');
        const games = rows.map((r: any) => ({
            id: r.id,
            ...(typeof r.state === 'string' ? JSON.parse(r.state) : r.state)
        }));
        res.json({ games });
    } catch (e) {
        res.status(500).json({ error: 'DB Error' });
    }
});

// Collection Endpoint
app.get('/api/user/collection', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const rows = await pool.query('SELECT card_id, quantity FROM user_cards WHERE user_id = ?', [user.userId]);
        const collection: Record<string, number> = {};
        for (const r of rows) {
            collection[r.card_id] = Number(r.quantity);
        }
        res.json({ collection });
    } catch (err) {
        res.status(500).json({ error: 'DB Error' });
    }
});

let CARD_POOL: string[] = [];
let CARD_RARITIES: Record<string, string> = {};

function syncStoreFromLibrary() {
    const newPool: string[] = [];
    const newRarities: Record<string, string> = {};

    for (const card of getLiveCardVariations().filter(isCardVisibleInCatalog)) {
        newPool.push(card.uniqueId);
        newRarities[card.uniqueId] = card.rarity;
    }

    CARD_POOL = newPool;
    CARD_RARITIES = newRarities;
    console.log(`[Store] Synced ${CARD_POOL.length} cards from script library.`);
}


const CRYSTAL_VALUES: Record<string, { decompose: number, produce: number }> = {
    C: { decompose: 1, produce: 5 },
    U: { decompose: 1, produce: 5 },
    R: { decompose: 5, produce: 20 },
    SR: { decompose: 20, produce: 80 },
    UR: { decompose: 100, produce: 400 },
    SER: { decompose: 400, produce: 1600 },
    PR: { decompose: 100, produce: 400 },
};

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function serializeCatalogCard(card: Card, includeEffects: boolean): Card {
    return {
        id: card.id,
        uniqueId: card.uniqueId,
        gamecardId: '',
        fullName: card.fullName,
        specialName: card.specialName,
        type: card.type,
        color: card.color,
        colorReq: { ...(card.colorReq || {}) },
        acValue: card.acValue,
        power: card.power,
        damage: card.damage,
        godMark: !!card.godMark,
        displayState: 'FRONT_UPRIGHT',
        feijingMark: !!card.feijingMark,
        effects: includeEffects
            ? card.effects?.map(effect => ({
                type: effect.type,
                description: effect.description,
                content: effect.content
            }))
            : undefined,
        imageUrl: card.imageUrl,
        fullImageUrl: card.fullImageUrl,
        rarity: card.rarity,
        availableRarities: card.availableRarities,
        cardPackage: card.cardPackage,
        faction: card.faction,
        isrush: !!card.isrush,
        isAnnihilation: !!card.isAnnihilation,
        isShenyi: !!card.isShenyi,
        isHeroic: !!card.isHeroic
    };
}

function getClientCardCatalog(includeEffects: boolean) {
    return getLiveCardVariations()
        .filter(isCardVisibleInCatalog)
        .map(card => serializeCatalogCard(card, includeEffects));
}

app.get('/api/cards/meta', async (req, res): Promise<void> => {
    try {
        const includeEffects = req.query.includeEffects === '1';
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.json({ cards: getClientCardCatalog(includeEffects) });
    } catch (err) {
        console.error('[CardsMeta] Failed to build card catalog:', err);
        res.status(500).json({ error: 'Failed to load card catalog' });
    }
});

app.post('/api/store/buy-pack', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { packType, count = 1 } = req.body;
    const isPrizePack = packType === 'prize';
    const singleCost = isPrizePack ? 20 : 10;
    const totalCost = singleCost * count;

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Check coins
        const userRows = await conn.query('SELECT coins FROM users WHERE id = ?', [user.userId]);
        const coins = Number(userRows[0].coins);
        if (coins < totalCost) {
            await conn.rollback();
            res.status(400).json({ error: '金币不足' });
            return;
        }

        const allCards = getLiveCardVariations().filter(isCardVisibleInCatalog);
        const drawnCards: Card[] = [];

        if (isPrizePack) {
            const prPool = allCards.filter(c => c.rarity === 'PR');
            if (prPool.length === 0) {
                await conn.rollback();
                res.status(400).json({ error: '奖品包暂无可抽卡牌' });
                return;
            }
            for (let i = 0; i < count; i++) {
                drawnCards.push(pickRandom(prPool));
            }
        } else {
            // Basic Pack Pity Setup
            let pityRows = await conn.query('SELECT * FROM pack_history WHERE user_id = ?', [user.userId]);
            if (pityRows.length === 0) {
                await conn.query('INSERT INTO pack_history (user_id, total_packs, packs_since_sr, packs_since_ur) VALUES (?, 0, 0, 0)', [user.userId]);
                pityRows = [{ total_packs: 0, packs_since_sr: 0, packs_since_ur: 0 }];
            }
            let packsSinceSR = Number(pityRows[0].packs_since_sr);
            let packsSinceUR = Number(pityRows[0].packs_since_ur);
            let totalPacks = Number(pityRows[0].total_packs);

            const cuPool = allCards.filter(c => c.rarity === 'C' || c.rarity === 'U');
            const rPool = allCards.filter(c => c.rarity === 'R');
            const srPool = allCards.filter(c => c.rarity === 'SR');
            const urPool = allCards.filter(c => c.rarity === 'UR' || c.rarity === 'SER');

            for (let p = 0; p < count; p++) {
                packsSinceSR++;
                packsSinceUR++;
                totalPacks++;

                // Pick 4 C/U cards
                for (let i = 0; i < 4; i++) {
                    drawnCards.push(pickRandom(cuPool));
                }

                // Pick 1 R+ card with pity
                let guaranteedCard: Card;
                if (packsSinceUR >= 50 && urPool.length > 0) {
                    guaranteedCard = pickRandom(urPool);
                    packsSinceUR = 0;
                    packsSinceSR = 0;
                } else if (packsSinceSR >= 10 && srPool.length > 0) {
                    guaranteedCard = pickRandom(srPool);
                    packsSinceSR = 0;
                } else {
                    const roll = Math.random();
                    if (roll < 0.02 && urPool.length > 0) {
                        guaranteedCard = pickRandom(urPool);
                        packsSinceUR = 0;
                        packsSinceSR = 0;
                    } else if (roll < 0.15 && srPool.length > 0) {
                        guaranteedCard = pickRandom(srPool);
                        packsSinceSR = 0;
                    } else if (rPool.length > 0) {
                        guaranteedCard = pickRandom(rPool);
                    } else {
                        guaranteedCard = pickRandom(cuPool);
                    }
                }
                drawnCards.push(guaranteedCard);
            }

            // Update pity counters once
            await conn.query(
                'UPDATE pack_history SET total_packs = ?, packs_since_sr = ?, packs_since_ur = ? WHERE user_id = ?',
                [totalPacks, packsSinceSR, packsSinceUR, user.userId]
            );
        }

        // Deduct coins
        await conn.query('UPDATE users SET coins = coins - ? WHERE id = ?', [totalCost, user.userId]);

        // Add cards to collection using batch logic (not really batch, but optimized loops)
        // Group by cardId to reduce queries
        const counts: Record<string, number> = {};
        drawnCards.forEach(c => counts[c.uniqueId] = (counts[c.uniqueId] || 0) + 1);

        for (const [cardId, qty] of Object.entries(counts)) {
            await conn.query(
                `INSERT INTO user_cards (user_id, card_id, quantity) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                [user.userId, cardId, qty, qty]
            );
        }

        await conn.commit();

        const newBalanceRow = await pool.query('SELECT coins, card_crystals FROM users WHERE id = ?', [user.userId]);
        const finalPityRows = await pool.query('SELECT * FROM pack_history WHERE user_id = ?', [user.userId]);

        res.json({
            cards: drawnCards.map(c => ({ id: c.id, uniqueId: c.uniqueId, rarity: c.rarity })),
            newCoins: Number(newBalanceRow[0].coins),
            newCardCrystals: Number(newBalanceRow[0].card_crystals),
            totalPacks: finalPityRows.length > 0 ? Number(finalPityRows[0].total_packs) : 0,
            packsSinceSR: finalPityRows.length > 0 ? Number(finalPityRows[0].packs_since_sr) : 0,
            packsSinceUR: finalPityRows.length > 0 ? Number(finalPityRows[0].packs_since_ur) : 0,
        });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error('Buy pack error:', err);
        res.status(500).json({ error: 'Internal error' });
    } finally {
        if (conn) conn.release();
    }
});

// Card Crystallization Endpoints
app.post('/api/user/decompose', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { cardId, quantity = 1 } = req.body;
    const card = (SERVER_CARD_LIBRARY as any)[cardId];
    if (!card) { res.status(404).json({ error: '卡牌未找到' }); return; }

    const values = CRYSTAL_VALUES[card.rarity];
    if (!values) { res.status(400).json({ error: '该稀有度无法分解' }); return; }

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Check ownership
        const cardRows = await conn.query('SELECT quantity FROM user_cards WHERE user_id = ? AND card_id = ?', [user.userId, cardId]);
        if (cardRows.length === 0 || Number(cardRows[0].quantity) < quantity) {
            await conn.rollback();
            res.status(400).json({ error: '持有数量不足' });
            return;
        }

        const crystalsGained = values.decompose * quantity;

        // Update cards
        if (Number(cardRows[0].quantity) === quantity) {
            await conn.query('DELETE FROM user_cards WHERE user_id = ? AND card_id = ?', [user.userId, cardId]);
        } else {
            await conn.query('UPDATE user_cards SET quantity = quantity - ? WHERE user_id = ? AND card_id = ?', [quantity, user.userId, cardId]);
        }

        // Update crystals
        await conn.query('UPDATE users SET card_crystals = card_crystals + ? WHERE id = ?', [crystalsGained, user.userId]);

        await conn.commit();
        const newBalanceRow = await pool.query('SELECT coins, card_crystals FROM users WHERE id = ?', [user.userId]);
        res.json({ success: true, newCardCrystals: Number(newBalanceRow[0].card_crystals), crystalsGained });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error('Decompose error:', err);
        res.status(500).json({ error: 'Internal error' });
    } finally {
        if (conn) conn.release();
    }
});

app.post('/api/user/craft', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const { cardId } = req.body;
    const card = (SERVER_CARD_LIBRARY as any)[cardId];
    if (!card) { res.status(404).json({ error: '卡牌未找到' }); return; }

    const values = CRYSTAL_VALUES[card.rarity];
    if (!values) { res.status(400).json({ error: '该稀有度无法制作' }); return; }

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Check crystals
        const userRows = await conn.query('SELECT card_crystals FROM users WHERE id = ?', [user.userId]);
        const currentCrystals = Number(userRows[0].card_crystals);
        if (currentCrystals < values.produce) {
            await conn.rollback();
            res.status(400).json({ error: '卡晶不足' });
            return;
        }

        // Deduct crystals
        await conn.query('UPDATE users SET card_crystals = card_crystals - ? WHERE id = ?', [values.produce, user.userId]);

        // Add card
        await conn.query(
            `INSERT INTO user_cards (user_id, card_id, quantity) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE quantity = quantity + 1`,
            [user.userId, cardId]
        );

        await conn.commit();
        const newBalanceRow = await pool.query('SELECT coins, card_crystals FROM users WHERE id = ?', [user.userId]);
        res.json({ success: true, newCardCrystals: Number(newBalanceRow[0].card_crystals) });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error('Craft error:', err);
        res.status(500).json({ error: 'Internal error' });
    } finally {
        if (conn) conn.release();
    }
});

// Socket.IO logic
// Helper to create initial player state
function createInitialPlayer(deckCards: Card[], displayName: string, isFirst: boolean, turnTimerLimit?: number): PlayerState {
    const fullDeck: Card[] = deckCards.map(c => {
        const uniqueId = Math.random().toString(36).substring(2, 10);
        return {
            ...c,
            gamecardId: uniqueId,
            runtimeFingerprint: `FP_${uniqueId}_${Date.now()}`,
            isExhausted: false,
            displayState: 'FRONT_UPRIGHT',
            cardlocation: 'DECK'
        };
    });

    // Perform Durstenfeld shuffle (Fisher-Yates) 
    for (let i = fullDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fullDeck[i], fullDeck[j]] = [fullDeck[j], fullDeck[i]];
    }

    // Draw initial 4 cards
    const hand = fullDeck.splice(0, 4).map(c => ({ ...c, cardlocation: 'HAND' as any }));

    return {
        uid: '', // Will be set by caller
        displayName: displayName,
        hand: hand,
        deck: fullDeck,
        grave: [],
        exile: [],
        playZone: [],
        unitZone: new Array(6).fill(null),
        itemZone: new Array(2).fill(null),
        erosionFront: new Array(10).fill(null),
        erosionBack: new Array(10).fill(null),
        isFirst: isFirst,
        mulliganDone: false,
        hasExhaustedThisTurn: [],
        isGoddessMode: false,
        isTurn: isFirst,
        timeRemaining: turnTimerLimit ? turnTimerLimit * 1000 : 300000,
        confrontationStrategy: 'AUTO'
    };

}

io.on('connection', (socket) => {
    // console.log('Client connected:', socket.id);

    socket.on('authenticate', async (token) => {
        const user = await verifyToken(token);
        if (user) {
            (socket as any).user = user;
            addAuthenticatedSocket(user.userId.toString(), socket.id);
            await forceLogoutOtherSockets(user.userId.toString(), socket.id);
            onlineSockets.set(socket.id, {
                userId: user.userId.toString(),
                username: user.username,
                displayName: user.displayName
            });
            const queueEntry = matchmakingQueue.find(q => q.userId === user.userId.toString());
            if (queueEntry) queueEntry.socketId = socket.id;
            socket.emit('authenticated');
            socket.emit('onlinePlayers', {
                players: getOnlinePlayers(),
                count: getOnlinePlayers().length
            });
            emitOnlinePlayers();
        } else {
            socket.emit('unauthorized');
        }
    });

    socket.on('requestOnlinePlayers', () => {
        socket.emit('onlinePlayers', {
            players: getOnlinePlayers(),
            count: getOnlinePlayers().length
        });
    });

    socket.on('joinGame', async (data: { gameId: string, deckId?: string, seat?: 'player' | 'spectator' }) => {
        const user = (socket as any).user;
        if (!user) {
            // console.log('[Socket] joinGame failed: Socket not authenticated');
            socket.emit('error', '未授权，请重试');
            return;
        }

        const userIdStr = user.userId.toString();
        const gameId = typeof data === 'string' ? data : data.gameId;
        const deckId = typeof data === 'object' ? data.deckId : undefined;
        const requestedSeat = typeof data === 'object' && data.seat === 'spectator' ? 'spectator' : 'player';

        // console.log(`[Socket] Request gameId: ${gameId}`);
        if (!gameId || gameId === 'undefined') {
            // console.log('[Socket] joinGame failed: Missing or invalid gameId');
            socket.emit('error', '无效的房间ID');
            return;
        }

        socket.join(gameId);
        // console.log(`[Socket] User ${userIdStr} attempting to join game ${gameId}`);
        
        // Remove from match results once joined
        matchmakingResults.delete(userIdStr);


        try {
            await withGameLock(gameId, async () => {
                const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
                if (rows.length === 0) {
                    console.error(`[Socket] joinGame failed: Game ${gameId} not found`);
                    socket.emit('error', '未找到游戏战场');
                    return;
                }

                const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
                ServerGameService.hydrateGameState(gameState);
                if (!gameState.players) gameState.players = {};
                const isFriendGame = gameState.mode === 'friend';
                if (isFriendGame) normalizeFriendRoomState(gameState);
                let seat: FriendSeatTarget = isFriendGame ? requestedSeat : 'player';
                if (isFriendGame && (gameState.playerIds || []).includes(userIdStr)) seat = 'player';

                if (isFriendGame) {
                    try {
                        if (seat === 'spectator' || !(gameState.playerIds || []).includes(userIdStr)) {
                            setFriendSeat(gameState, userIdStr, seat);
                        }
                    } catch (err: any) {
                        socket.emit('error', err.message || '无法加入该席位');
                        socket.emit('gameStateUpdate', gameState);
                        return;
                    }
                }

                const initializedPlayers = Object.keys(gameState.players);
                // console.log(`[Socket] joinGame for ${userIdStr} in ${gameId}. Current players: ${initializedPlayers.join(',')}`);

                // Initialize human player if they haven't been initialized yet
                if (seat === 'player' && !gameState.players[userIdStr]) {
                    const effectiveDeckId = isFriendGame ? getFriendPlayerDeckId(gameState, userIdStr) : deckId;
                    if (effectiveDeckId) {
                        // console.log(`[Socket] Initializing player ${userIdStr} in game ${gameId}`);
                        const deckRows = await pool.query('SELECT * FROM decks WHERE id = ?', [effectiveDeckId]);
                        if (deckRows.length > 0) {
                            const deckCardsRaw = typeof deckRows[0].cards === 'string' ? JSON.parse(deckRows[0].cards) : deckRows[0].cards;

                            if (Object.keys(SERVER_CARD_LIBRARY).length === 0) {
                                await initServerCardLibrary();
                            }

                            const deckCards: Card[] = deckCardsRaw.map((id: string) => SERVER_CARD_LIBRARY[id]).filter(Boolean);

                            // Validate Deck
                            const validation = ServerGameService.validateDeck(deckCards);
                            if (!validation.valid) {
                                console.error(`[Socket] Deck validation failed for user ${userIdStr}`);
                                socket.emit('error', `卡组非法: ${validation.error}`);
                                return;
                            }

                            const isFirst = gameState.playerIds.map(id => id.toString()).indexOf(userIdStr) === 0;

                            const player = createInitialPlayer(deckCards, user.displayName || user.username || '玩家', isFirst, gameState.turnTimerLimit);
                            player.uid = userIdStr;
                            gameState.players[userIdStr] = player;

                            if (gameState.mode === 'practice' && !gameState.players['BOT_PLAYER']) {
                                const botPlayer = createInitialPlayer(deckCards, '机器人', !isFirst, gameState.turnTimerLimit);
                                botPlayer.uid = 'BOT_PLAYER';
                                botPlayer.mulliganDone = true;
                                botPlayer.botDifficulty = gameState.botDifficulty === 'hard' ? 'hard' : 'simple';
                                gameState.players['BOT_PLAYER'] = botPlayer;
                            }

                            await syncAndSaveState(gameId, gameState);
                        } else {
                            console.error(`[Socket] Deck ${effectiveDeckId} not found for user ${userIdStr}`);
                            socket.emit('error', '未找到选定的卡组');
                            return;
                        }
                    } else {
                        // Player not initialized and no deckId provided
                        // console.log(`[Socket] Player ${userIdStr} joinGame without deckId for uninitialized record`);
                    }
                } else {
                    // console.log(`[Socket] Player ${userIdStr} already initialized in ${gameId}`);
                }

                // Start the phase timer if it hasn't started yet and players are ready
                const isInitial = gameState.phase === 'INIT' || gameState.phase === 'RPS' || gameState.phase === 'FIRST_PLAYER_CHOICE' || gameState.phase === 'MULLIGAN';
                const initializedRealPlayerCount = gameState.playerIds.filter((uid: string) => !!gameState.players[uid]).length;
                const canStartFriendGame = !isFriendGame || gameState.status === 'STARTING' || gameState.status === 'ACTIVE';
                if (canStartFriendGame && isInitial && initializedRealPlayerCount >= 2 && (gameState.phase === 'INIT' || !gameState.phaseTimerStart || gameState.phaseTimerStart === 0)) {
                    if (gameState.phase === 'INIT') {
                        if (gameState.mode === 'practice') {
                            const humanUid = gameState.playerIds.find((uid: string) => uid !== 'BOT_PLAYER') || userIdStr;
                            beginFirstPlayerChoice(gameState, humanUid, 'PRACTICE');
                            gameState.logs.push('练习赛开始。请选择先攻或后攻。');
                        } else {
                            beginRpsPhase(gameState, '所有玩家已准备就绪。开始猜拳决定先后攻选择权。');
                        }
                        gameState.status = 'ACTIVE';
                    }
                    gameState.phaseTimerStart = Date.now();
                    await syncAndSaveState(gameId, gameState);
                }

                // Always emit current state to the joining socket so they don't get stuck on "Syncing Battlefield"
                socket.emit('gameStateUpdate', gameState);
            });
        } catch (err) {
            console.error('[Socket] joinGame exception:', err);
            socket.emit('error', '战场同步过程中发生错误');
        }
    });

    socket.on('gameAction', async (data: { gameId: string, action: string, payload?: any }) => {
        const user = (socket as any).user;
        if (!user) return;

        const { gameId, action, payload } = data;
        // console.log(`[Socket] received gameAction: ${action} for game ${gameId}`, payload);

        await withGameLock(gameId, async () => {
            try {
                const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
                if (rows.length === 0) return;

                let gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
                ServerGameService.hydrateGameState(gameState);
                const myUid = user.userId.toString();

                if (action === 'CHAT_MESSAGE') {
                    if (!canUserChatInGame(gameState, myUid)) {
                        socket.emit('error', { message: '你不在该对局中，无法发送聊天。' });
                        return;
                    }

                    const content = String(payload?.content ?? '').trim().replace(/\s+/g, ' ');
                    if (!content) return;
                    if (content.length > 200) {
                        socket.emit('error', { message: '聊天内容不能超过 200 个字符。' });
                        return;
                    }

                    const actorName = resolveGameDisplayName(gameState, user);
                    addBattleLog(gameState, {
                        category: 'CHAT',
                        actorUid: myUid,
                        actorName,
                        text: `[系统]${actorName}：${content}`,
                        metadata: { content }
                    });
                    await syncAndSaveState(gameId, gameState);
                    return;
                }

                const player = gameState.players[myUid];
                if (!player) {
                    // console.log(`[Socket] Action ${action} rejected: Player ${myUid} not found in game ${gameId}`);
                    return;
                }

                const syncCallback = async (state: GameState) => {
                    await syncAndSaveState(gameId, state);
                };

                if (action === 'RPS_CHOICE') {
                    submitRpsChoice(gameState, myUid, payload?.choice);
                } else if (action === 'CHOOSE_FIRST_PLAYER') {
                    chooseFirstPlayer(gameState, myUid, payload?.firstPlayerUid);
                } else if (action === 'MULLIGAN') {
                    if (gameState.phase !== 'MULLIGAN') return;
                    const selectedIds: string[] = payload || [];
                    if (player.mulliganDone) return;

                    const revealId = `${myUid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    const replacedCount = selectedIds.length;

                    if (selectedIds.length > 0) {
                        const cardsToSwap = player.hand.filter((c: any) => selectedIds.includes(c.gamecardId));
                        player.hand = player.hand.filter((c: any) => !selectedIds.includes(c.gamecardId));

                        cardsToSwap.forEach((c: any) => {
                            c.cardlocation = 'DECK';
                            player.deck.push(c);
                        });

                        for (let i = 0; i < selectedIds.length; i++) {
                            const newCard = player.deck.shift();
                            if (newCard) {
                                newCard.cardlocation = 'HAND';
                                player.hand.push(newCard);
                            }
                        }

                        for (let i = player.deck.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [player.deck[i], player.deck[j]] = [player.deck[j], player.deck[i]];
                        }

                    } else {
                    }

                    player.mulliganReveal = {
                        id: revealId,
                        replacedCount,
                        cards: player.hand.map((card: Card) => ({ ...card })),
                        createdAt: Date.now(),
                        animationMs: 1600,
                        holdMs: 2000
                    };
                    player.mulliganDone = true;

                    const allDone = Object.values(gameState.players).every((p: any) => p.mulliganDone);
                    if (allDone) {
                        const startedAt = Date.now();
                        gameState.mulliganRevealStartedAt = startedAt;
                        gameState.playerIds.forEach((uid: string) => {
                            if (gameState.players[uid]?.mulliganReveal) {
                                gameState.players[uid].mulliganReveal.allPlayersDone = true;
                            }
                        });

                        await syncAndSaveState(gameId, gameState);
                        finishMulliganAfterReveal(gameId, startedAt);
                        return;
                    }
                } else if (action === 'PLAY_CARD') {
                    const { cardId, paymentSelection } = payload;
                    await ServerGameService.playCard(gameState, myUid, cardId, paymentSelection);
                } else if (action === 'ATTACK') {
                    const { attackerIds, isAlliance, targetId, skipDefense } = payload;
                    await ServerGameService.declareAttack(gameState, myUid, attackerIds, isAlliance, targetId, skipDefense, syncCallback);
                } else if (action === 'DEFEND') {
                    const { defenderId } = payload;
                    await ServerGameService.declareDefense(gameState, myUid, defenderId);
                } else if (action === 'RESOLVE_DAMAGE') {
                    await ServerGameService.resolveDamage(gameState);
                } else if (action === 'EROSION_CHOICE') {
                    const { choice, selectedCardId } = payload;
                    await ServerGameService.handleErosionChoice(gameState, myUid, choice, selectedCardId);
                } else if (action === 'DISCARD') {
                    const { cardId } = payload;
                    await ServerGameService.discardCard(gameState, myUid, cardId);
                } else if (action === 'ACTIVATE_EFFECT') {
                    const { cardId, effectIndex } = payload;
                    await ServerGameService.activateEffect(gameState, myUid, cardId, effectIndex);
                } else if (action === 'PASS_CONFRONTATION') {
                    await ServerGameService.passConfrontation(gameState, myUid, syncCallback);
                } else if (action === 'RESOLVE_PLAY') {
                    if (gameState.phase === 'COUNTERING') {
                        await ServerGameService.resolveCounterStack(gameState, syncCallback);
                    }
                } else if (action === 'SUBMIT_QUERY_CHOICE') {
                    const { queryId, selections } = payload;
                    await ServerGameService.handleQueryChoice(gameState, myUid, queryId, selections, syncCallback);
                } else if (action === 'CONFIRM_SHENYI' || action === 'DECLINE_SHENYI') {
                    await advancePhase(gameState, gameId, myUid, socket, action);
                } else if (action === 'MOVE_CARD') {
                    const { fromZone, toPlayerId, toZone, cardId } = payload;
                    await ServerGameService.moveCard(gameState, myUid, fromZone, toPlayerId, toZone, cardId, { isEffect: true });
                } else if (action === 'SET_CONFRONTATION_STRATEGY') {
                    const strategy = payload?.strategy;
                    if (strategy === 'ON' || strategy === 'AUTO' || strategy === 'OFF') {
                        player.confrontationStrategy = strategy;
                        gameState.logs.push(`[设置] ${player.displayName} 将对抗策略设为 ${strategy === 'ON' ? '全开' : strategy === 'AUTO' ? '自动' : '全关'}。`);
                    }
                } else if (action === 'END_PHASE') {
                    if (player.isTurn || gameState.phase === 'BATTLE_FREE' || gameState.phase === 'COUNTERING') {
                        await advancePhase(gameState, gameId, myUid, socket, payload);
                        if (!gameState.pendingQuery) {
                            await ServerGameService.checkTriggeredEffects(gameState);
                        }
                        if (!gameState.pendingQuery) {
                            await ServerGameService.applyConfrontationStrategy(gameState, syncCallback);
                        }
                        await syncAndSaveState(gameId, gameState);
                        if (gameState.gameStatus !== 2) {
                            triggerBotIfNeeded(gameState, gameId);
                        }
                        return; // advancePhase already calls syncAndSaveState
                    }
                } else if (action === 'SURRENDER') {
                    await ServerGameService.surrender(gameState, myUid);
                }

                if (!gameState.pendingQuery) {
                    await ServerGameService.applyConfrontationStrategy(gameState, syncCallback);
                }

                // Ensure any dangling triggers are checked before saving state (Skip if game is over)
                if (gameState.gameStatus !== 2 && !gameState.pendingQuery) {
                    await ServerGameService.checkTriggeredEffects(gameState);
                    if (!gameState.pendingQuery) {
                        await ServerGameService.applyConfrontationStrategy(gameState, syncCallback);
                    }
                }

                // Final state sync and save
                await syncAndSaveState(gameId, gameState);
                if (gameState.gameStatus !== 2) {
                    triggerBotIfNeeded(gameState, gameId);
                }
            } catch (err: any) {
                console.error('[Socket] Game action error:', err);
                socket.emit('error', { message: err.message || 'Unknown game error' });
            }
        });
    });

    socket.on('leaveGame', async (gameId: string) => {
        if (!gameId) return;

        const userIdStr = ((socket as any).user?.userId ?? '').toString();
        if (userIdStr && gameId.startsWith('friend_')) {
            try {
                await removeFriendParticipantAndCloseIfEmpty(gameId, userIdStr);
                socket.leave(gameId);
                return;
            } catch (err) {
                console.error('[Socket] leaveGame friend cleanup error:', err);
            }
        }

        // console.log(`[Socket] User ${((socket as any).user?.userId) || socket.id} leaving game ${gameId}`);
        socket.leave(gameId);
    });

    socket.on('leaveGameRoom', async (gameId: string) => {
        if (!gameId) return;
        const userIdStr = ((socket as any).user?.userId ?? '').toString();
        if (userIdStr && gameId.startsWith('friend_')) {
            try {
                await removeFriendParticipantAndCloseIfEmpty(gameId, userIdStr);
            } catch (err) {
                console.error('[Socket] leaveGameRoom friend cleanup error:', err);
            }
        }
        socket.leave(gameId);
    });

    socket.on('disconnect', async () => {
        // console.log('Client disconnected:', socket.id);
        const userIdStr = ((socket as any).user?.userId ?? '').toString();
        if (userIdStr) {
            removeAuthenticatedSocket(userIdStr, socket.id);
        }
        onlineSockets.delete(socket.id);
        if (userIdStr) {
            try {
                await removeFriendParticipantFromAllRooms(userIdStr);
            } catch (err) {
                console.error('[Socket] disconnect friend cleanup error:', err);
            }
        }
        matchmakingQueue.forEach(entry => {
            if (entry.socketId === socket.id) {
                delete entry.socketId;
            }
        });
        emitOnlinePlayers();
    });
});

// Main bootstrap function
const start = async () => {
    try {
        console.log('[Server] Initializing card library...');
        await initServerCardLibrary();
        console.log('[Server] Syncing store from script library...');
        syncStoreFromLibrary();
        console.log('[Server] Connecting to database...');
        await dbInit();

        const PORT = process.env.PORT || 3001;
        httpServer.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('[Server] Fatal initialization error:', err);
        process.exit(1);
    }
};

start();
