// VERSION: 2026-04-07-IND-FIX-01
import express from 'express';
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
import { isAdjustedCard } from '../src/lib/cardAdjustments';
import { AI_DECK_PROFILES } from './ai/deckProfiles';
import { saveAiMatchSample } from './ai/liveMatchSamples';
import {
    createVerificationCode,
    getVerificationCodeExpireMs,
    getVerificationCodeResendMs,
    normalizeEmail,
    seedStarterResources,
    sendPasswordResetVerificationEmail,
    sendRegistrationVerificationEmail,
    validateEmail,
    validatePassword,
    validateUsername
} from './registration';
import { getHardAiOpeningCardIds, ServerGameService } from './ServerGameService';
import { PlayerState, Card, GAME_TIMEOUTS, GameState, BattleLogEntry, SandboxFile, SandboxPlayerKey, SandboxPlayerSetup, SandboxCardSetup, GamePhase, TriggerLocation } from '../src/types/game';
import { EventEngine } from '../src/services/EventEngine';
import { addBattleLog, battleLogText, normalizeBattleLogs } from '../src/lib/battleLog';
import { clearBattlefieldState, shouldClearBattlefieldStateOnMove } from '../src/lib/cardState';
import fs from 'fs';
import path from 'path';
import { expressStaticCompressed } from '../src/lib/staticCompression';
import { applyDeckEntrySkin, getDeckCardIds, normalizeDeckCardEntries } from '../src/lib/deckEntries';

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
const ACTIVE_GAME_SCAN_WINDOW_MS = Number(process.env.ACTIVE_GAME_SCAN_WINDOW_MS || 6 * 60 * 60 * 1000);
const ENABLE_PERF_LOGS = process.env.ENABLE_PERF_LOGS === '1';
const SLOW_GAME_ACTION_MS = Number(process.env.SLOW_GAME_ACTION_MS || 500);
const SLOW_STATE_SYNC_MS = Number(process.env.SLOW_STATE_SYNC_MS || 250);
const FORCE_LOGOUT_REASON = '账号已在其他设备登录';

function getBotVisualAnimationDelayMs(gameState: any, now = Date.now()) {
    if (ServerGameService.shouldSkipVisualDelay(gameState)) return 0;
    const animationUntil = gameState.animationHint?.type === 'CONFRONTATION_CHAIN'
        ? 0
        : Number(gameState.animationUntil || 0);
    const drawResumeAt = Number(gameState.drawAnimationResume?.resumeAt || 0);
    const waitUntil = Math.max(animationUntil, drawResumeAt);
    if (waitUntil > now) return waitUntil - now + 250;
    return gameState.drawAnimationResume ? 250 : 0;
}

function scheduleBotMoveRetry(gameId: string, delayMs: number) {
    if (botMovingGames.has(gameId)) return;
    botMovingGames.add(gameId);
    setTimeout(async () => {
        try {
            const stateRows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
            if (stateRows.length === 0) return;
            const latestState = typeof stateRows[0].state === 'string' ? JSON.parse(stateRows[0].state) : stateRows[0].state;
            ServerGameService.hydrateGameState(latestState);
            botMovingGames.delete(gameId);
            handleBotMove(latestState, gameId);
        } catch (err) {
            console.error('[Bot] scheduleBotMoveRetry error:', err);
            botMovingGames.delete(gameId);
        }
    }, Math.max(250, delayMs));
}

async function insertGame(gameId: string, gameState: any, status = 0) {
    const now = Date.now();
    await pool.query(
        'INSERT INTO games (id, state, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [gameId, JSON.stringify(gameState), status, now, now]
    );
}

async function persistGameState(gameId: string, gameState: any, status?: number, timings?: Record<string, number>) {
    const now = Date.now();
    const stringifyStart = process.hrtime.bigint();
    const serializedState = JSON.stringify(gameState);
    if (timings) timings.stringifyMs = elapsedMs(stringifyStart);

    const dbStart = process.hrtime.bigint();
    if (status === undefined) {
        await pool.query('UPDATE games SET state = ?, updated_at = ? WHERE id = ?', [serializedState, now, gameId]);
        if (timings) timings.dbUpdateMs = elapsedMs(dbStart);
        return;
    }
    await pool.query('UPDATE games SET state = ?, status = ?, updated_at = ? WHERE id = ?', [serializedState, status, now, gameId]);
    if (timings) timings.dbUpdateMs = elapsedMs(dbStart);
}

function formatMb(bytes: number) {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
}

function getMemorySnapshot() {
    const memory = process.memoryUsage();
    return {
        heapUsed: formatMb(memory.heapUsed),
        heapTotal: formatMb(memory.heapTotal),
        rss: formatMb(memory.rss)
    };
}

function elapsedMs(start: bigint) {
    return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function canSkipFinalRecalcForAction(action: string) {
    return action === 'CHAT_MESSAGE' ||
        action === 'RPS_CHOICE' ||
        action === 'CHOOSE_FIRST_PLAYER' ||
        action === 'MULLIGAN' ||
        action === 'SET_CONFRONTATION_STRATEGY';
}

function getDefaultTurnTime(gameState: any) {
    return gameState.turnTimerLimit ? gameState.turnTimerLimit * 1000 : 300000;
}

function getActiveTimerPlayerUid(gameState: any): string | undefined {
    if (gameState.phase === 'INIT' || gameState.phase === 'RPS' || gameState.phase === 'FIRST_PLAYER_CHOICE' || gameState.phase === 'MULLIGAN') {
        return undefined;
    }
    if (gameState.pendingQuery) return gameState.pendingQuery.playerUid;
    if (gameState.priorityPlayerId) return gameState.priorityPlayerId;
    if (gameState.phase === 'DEFENSE_DECLARATION') {
        return gameState.playerIds.find((uid: string) => uid !== gameState.playerIds[gameState.currentTurnPlayer]);
    }
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

        const entries = normalizeDeckCardEntries(typeof dRows[0].cards === 'string' ? JSON.parse(dRows[0].cards) : dRows[0].cards);
        const cIds = getDeckCardIds(entries);

        const cObjs = entries.map(entry => {
            const card = (SERVER_CARD_LIBRARY as any)[entry.id];
            return card ? applyDeckEntrySkin(card, entry) : undefined;
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
    if (AI_DECK_PROFILES.length === 0) {
        return { valid: false, error: '暂无可用困难人机卡组' };
    }

    const profile = AI_DECK_PROFILES.find(candidate => candidate.id === profileId) || AI_DECK_PROFILES[0];
    if (!profile?.shareCode) {
        return { valid: false, error: '暂无可用困难人机卡组' };
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

const SANDBOX_FILE_VERSION = 1;
const SANDBOX_PHASES: GamePhase[] = ['START', 'DRAW', 'EROSION', 'MAIN', 'DECLARE_END', 'DISCARD', 'END'];

function sanitizeSandboxFileName(name: unknown) {
    const raw = String(name || '').trim();
    const base = raw.replace(/\.sbx$/i, '').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').slice(0, 80);
    return `${base || `sandbox_${Date.now()}`}.sbx`;
}

function getSandboxDirForUser(user: any) {
    const username = String(user?.username || user?.userId || 'user')
        .trim()
        .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_') || 'user';
    return path.join(process.cwd(), username, 'sandbox');
}

function resolveSandboxFilePath(user: any, name: string) {
    const dir = getSandboxDirForUser(user);
    const safeName = sanitizeSandboxFileName(name);
    const resolved = path.resolve(dir, safeName);
    const resolvedDir = path.resolve(dir);
    if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== path.join(resolvedDir, safeName)) {
        throw new Error('非法文件名');
    }
    return { dir, filePath: resolved, fileName: safeName };
}

function normalizeSandboxCardSetup(value: any): SandboxCardSetup {
    const cardRef = typeof value?.cardRef === 'string'
        ? value.cardRef
        : typeof value?.uniqueId === 'string'
            ? value.uniqueId
            : typeof value?.id === 'string'
                ? value.id
                : '';
    if (!cardRef) throw new Error('沙盒卡牌缺少 cardRef');
    const displayState = ['FRONT_UPRIGHT', 'FRONT_HORIZONTAL', 'FRONT_FACEDOWN', 'BACK_UPRIGHT'].includes(value?.displayState)
        ? value.displayState
        : undefined;
    return {
        cardRef,
        displayState,
        isExhausted: !!value?.isExhausted
    };
}

function normalizeSandboxCardList(value: any, max = 200): SandboxCardSetup[] {
    if (!Array.isArray(value)) return [];
    return value.filter(Boolean).slice(0, max).map(normalizeSandboxCardSetup);
}

function normalizeSandboxSlotList(value: any, length: number): Array<SandboxCardSetup | null> {
    const source = Array.isArray(value) ? value : [];
    return Array.from({ length }, (_, index) => {
        const entry = source[index];
        return entry ? normalizeSandboxCardSetup(entry) : null;
    });
}

function normalizeSandboxPlayerSetup(value: any, fallbackName: string): SandboxPlayerSetup {
    return {
        displayName: typeof value?.displayName === 'string' && value.displayName.trim()
            ? value.displayName.trim().slice(0, 40)
            : fallbackName,
        deck: normalizeSandboxCardList(value?.deck, 200),
        hand: normalizeSandboxCardList(value?.hand, 100),
        grave: normalizeSandboxCardList(value?.grave, 200),
        exile: normalizeSandboxCardList(value?.exile, 200),
        itemZone: normalizeSandboxCardList(value?.itemZone, 60),
        unitZone: normalizeSandboxSlotList(value?.unitZone, 6),
        erosionFront: normalizeSandboxSlotList(value?.erosionFront, 10),
        erosionBack: normalizeSandboxSlotList(value?.erosionBack, 10)
    };
}

function normalizeSandboxFile(input: any, fallbackName?: string): SandboxFile {
    if (!input || typeof input !== 'object') {
        throw new Error('无效的沙盒文件');
    }
    const phase = SANDBOX_PHASES.includes(input.phase) ? input.phase : 'MAIN';
    const currentTurn: SandboxPlayerKey = input.currentTurn === 'opponent' ? 'opponent' : 'player';
    return {
        version: SANDBOX_FILE_VERSION,
        name: typeof input.name === 'string' ? input.name.slice(0, 80) : fallbackName,
        createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
        updatedAt: Date.now(),
        turnCount: Math.max(1, Math.min(999, Number(input.turnCount) || 1)),
        currentTurn,
        phase,
        turnTimerLimit: normalizeTurnTimerLimit(input.turnTimerLimit),
        players: {
            player: normalizeSandboxPlayerSetup(input.players?.player, '玩家'),
            opponent: normalizeSandboxPlayerSetup(input.players?.opponent, '对手')
        }
    };
}

function resolveSandboxCard(ref: string) {
    const card = SERVER_CARD_LIBRARY[ref] || SERVER_CARD_LIBRARY[String(ref).split(':')[0]];
    if (!card) throw new Error(`未找到卡牌：${ref}`);
    return card;
}

function createSandboxRuntimeCard(setup: SandboxCardSetup, location: Card['cardlocation'], index: number, ownerKey: SandboxPlayerKey): Card {
    const source = resolveSandboxCard(setup.cardRef);
    const uniqueSeed = `${ownerKey}_${location}_${index}_${Math.random().toString(36).slice(2, 8)}`;
    const isFaceDown = location === 'DECK' || location === 'EROSION_BACK';
    const displayState = setup.displayState || (isFaceDown ? 'BACK_UPRIGHT' : 'FRONT_UPRIGHT');
    return {
        ...source,
        baseColorReq: source.baseColorReq ?? { ...(source.colorReq || {}) },
        basePower: source.basePower ?? source.power,
        baseDamage: source.baseDamage ?? source.damage,
        baseIsrush: source.baseIsrush ?? source.isrush,
        baseAnnihilation: source.baseAnnihilation ?? source.isAnnihilation,
        baseShenyi: source.baseShenyi ?? source.isShenyi,
        baseHeroic: source.baseHeroic ?? source.isHeroic,
        baseCanAttack: source.baseCanAttack ?? source.canAttack ?? true,
        baseGodMark: source.baseGodMark ?? source.godMark,
        baseAcValue: source.baseAcValue ?? source.acValue,
        baseCanActivateEffect: source.baseCanActivateEffect ?? source.canActivateEffect ?? true,
        gamecardId: uniqueSeed,
        runtimeFingerprint: `SBX_${uniqueSeed}_${Date.now()}`,
        cardlocation: location,
        displayState,
        isExhausted: !!setup.isExhausted || displayState === 'FRONT_HORIZONTAL',
        hasAttackedThisTurn: false,
        usedShenyiThisTurn: false,
        canAttack: source.canAttack ?? true,
        canActivateEffect: source.canActivateEffect ?? true
    };
}

function sandboxCardsToZone(cards: SandboxCardSetup[], location: Card['cardlocation'], ownerKey: SandboxPlayerKey) {
    return cards.map((card, index) => createSandboxRuntimeCard(card, location, index, ownerKey));
}

function sandboxSlotsToZone(cards: Array<SandboxCardSetup | null>, location: Card['cardlocation'], ownerKey: SandboxPlayerKey, length: number) {
    return Array.from({ length }, (_, index) => {
        const card = cards[index];
        return card ? createSandboxRuntimeCard(card, location, index, ownerKey) : null;
    });
}

function createSandboxPlayerState(uid: string, setup: SandboxPlayerSetup, ownerKey: SandboxPlayerKey, isFirst: boolean, isTurn: boolean, turnTimerLimit?: number): PlayerState {
    return {
        uid,
        displayName: setup.displayName || (ownerKey === 'player' ? '玩家' : '对手'),
        deck: sandboxCardsToZone(setup.deck, 'DECK', ownerKey),
        hand: sandboxCardsToZone(setup.hand, 'HAND', ownerKey),
        grave: sandboxCardsToZone(setup.grave, 'GRAVE', ownerKey),
        exile: sandboxCardsToZone(setup.exile, 'EXILE', ownerKey),
        itemZone: sandboxCardsToZone(setup.itemZone, 'ITEM', ownerKey),
        erosionFront: sandboxSlotsToZone(setup.erosionFront, 'EROSION_FRONT', ownerKey, 10),
        erosionBack: sandboxSlotsToZone(setup.erosionBack, 'EROSION_BACK', ownerKey, 10),
        unitZone: sandboxSlotsToZone(setup.unitZone, 'UNIT', ownerKey, 6),
        playZone: [],
        isTurn,
        isFirst,
        mulliganDone: true,
        hasExhaustedThisTurn: [],
        isGoddessMode: false,
        isHandPublic: 0,
        timeRemaining: turnTimerLimit ? turnTimerLimit * 1000 : GAME_TIMEOUTS.MAIN_PHASE_TOTAL,
        confrontationStrategy: 'AUTO'
    };
}

function createSandboxGameState(options: {
    sandbox: SandboxFile;
    gameId: string;
    playerUid: string;
    playerName: string;
    opponentUid: string;
    opponentName: string;
    roomCode?: string;
    hostUid?: string;
    participantNames?: Record<string, string>;
    botDifficulty?: 'simple' | 'hard';
    botDeckProfileId?: string;
}): GameState {
    const firstKey = options.sandbox.currentTurn;
    const playerIds: [string, string] = firstKey === 'player'
        ? [options.playerUid, options.opponentUid]
        : [options.opponentUid, options.playerUid];
    const playerState = createSandboxPlayerState(
        options.playerUid,
        { ...options.sandbox.players.player, displayName: options.sandbox.players.player.displayName || options.playerName },
        'player',
        playerIds[0] === options.playerUid,
        options.sandbox.currentTurn === 'player',
        options.sandbox.turnTimerLimit
    );
    const opponentState = createSandboxPlayerState(
        options.opponentUid,
        { ...options.sandbox.players.opponent, displayName: options.sandbox.players.opponent.displayName || options.opponentName },
        'opponent',
        playerIds[0] === options.opponentUid,
        options.sandbox.currentTurn === 'opponent',
        options.sandbox.turnTimerLimit
    );
    opponentState.botDifficulty = options.opponentUid === 'BOT_PLAYER' ? options.botDifficulty : undefined;
    opponentState.botDeckProfileId = options.opponentUid === 'BOT_PLAYER' ? options.botDeckProfileId : undefined;

    return {
        gameId: options.gameId,
        phase: options.sandbox.phase,
        currentTurnPlayer: playerIds[0] === (options.sandbox.currentTurn === 'player' ? options.playerUid : options.opponentUid) ? 0 : 1,
        turnCount: options.sandbox.turnCount,
        isCountering: 0,
        counterStack: [],
        passCount: 0,
        playerIds,
        gameStatus: 1,
        logs: ['沙盒对局开始。'],
        mode: 'sandbox',
        status: 'ACTIVE',
        roomCode: options.roomCode,
        participantIds: options.hostUid ? [options.hostUid] : undefined,
        spectatorIds: [],
        hostUid: options.hostUid,
        participantNames: options.participantNames,
        players: {
            [options.playerUid]: playerState,
            [options.opponentUid]: opponentState
        },
        botDifficulty: options.botDifficulty,
        botDeckProfiles: options.botDeckProfileId ? { BOT_PLAYER: options.botDeckProfileId } : undefined,
        phaseTimerStart: Date.now(),
        turnTimerLimit: options.sandbox.turnTimerLimit,
        triggeredEffectsQueue: [],
        pendingResolutions: [],
        effectUsage: {}
    };
}

async function handleBotMove(gameState: any, gameId: string) {
    if (botMovingGames.has(gameId)) {
        // console.log(`[Bot] Bot is already moving for game ${gameId}, skipping trigger`);
        return;
    }

    const bot = gameState.players['BOT_PLAYER'];
    if (!bot) return;
    if (gameState.pendingQuery && gameState.pendingQuery.playerUid !== 'BOT_PLAYER') return;
    const visualDelayMs = getBotVisualAnimationDelayMs(gameState);
    if (visualDelayMs > 0) {
        scheduleBotMoveRetry(gameId, visualDelayMs);
        return;
    }

    // The bot should move if it's its turn, if it's being asked for a confrontation response, if it has priority, or has a query
    const isBotAsked = gameState.battleState && gameState.battleState.askConfront === 'ASKING_OPPONENT';
    const isBotPriority = gameState.priorityPlayerId === 'BOT_PLAYER';
    const isBotQuery = gameState.pendingQuery && gameState.pendingQuery.playerUid === 'BOT_PLAYER';
    const isBotDefending = gameState.phase === 'DEFENSE_DECLARATION' && !bot.isTurn;
    const shouldBotMove = bot.isTurn || isBotAsked || isBotPriority || isBotQuery || isBotDefending;

    if (!shouldBotMove) return;

    botMovingGames.add(gameId);

    // Use a delay to simulate thinking and allow final state propagation
    const now = Date.now();
    const animationUntil = gameState.animationHint?.type === 'CONFRONTATION_CHAIN' ? 0 : Number(gameState.animationUntil || 0);
    const delay = animationUntil && animationUntil > now
        ? Math.max(1600, animationUntil - now + 500)
        : 1600;

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
                    const visualDelayMs = getBotVisualAnimationDelayMs(currentGameState);
                    if (visualDelayMs > 0) {
                        botMovingGames.delete(gameId);
                        scheduleBotMoveRetry(gameId, visualDelayMs);
                        return;
                    }

                    const syncCallback = async (state: any) => {
                        await syncGameStateForCallback(gameId, state, 'botMove:callback');
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
    }, delay);
}

function triggerBotIfNeeded(gameState: any, gameId: string) {
    const bot = gameState.players['BOT_PLAYER'];
    if (!bot) return;
    if (gameState.pendingQuery && gameState.pendingQuery.playerUid !== 'BOT_PLAYER') return;
    if (getBotVisualAnimationDelayMs(gameState) > 0) {
        handleBotMove(gameState, gameId);
        return;
    }

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

function isAdminUser(user: any) {
    return String(user?.role || '').toUpperCase() === 'ADMIN';
}

async function getAuthenticatedAdminFromHeader(req: express.Request, res: express.Response) {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) return null;
    if (!isAdminUser(user)) {
        res.status(403).json({ error: '需要管理员权限' });
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

const DEBUG_ALLOWED_MODES = new Set(['practice', 'friend', 'sandbox']);
const DEBUG_ZONES: TriggerLocation[] = ['HAND', 'UNIT', 'ITEM', 'GRAVE', 'EXILE', 'EROSION_FRONT', 'EROSION_BACK', 'PLAY', 'DECK'];
const DEBUG_SLOT_ZONES = new Set<TriggerLocation>(['UNIT', 'ITEM', 'EROSION_FRONT', 'EROSION_BACK']);
const DEBUG_ZONE_LABELS: Partial<Record<TriggerLocation, string>> = {
    HAND: '手牌',
    UNIT: '单位区',
    ITEM: '道具区',
    GRAVE: '墓地',
    EXILE: '除外区',
    EROSION_FRONT: '侵蚀区正面',
    EROSION_BACK: '侵蚀区背面',
    PLAY: '使用区',
    DECK: '牌库'
};
const DEBUG_PATCH_LABELS: Record<string, string> = {
    power: '力量',
    damage: '伤害',
    acValue: 'AC费用',
    godMark: '神蚀',
    canAttack: '可攻击',
    canActivateEffect: '可发效',
    isrush: '速攻',
    isAnnihilation: '歼灭',
    isShenyi: '神依',
    isHeroic: '英勇',
    isExhausted: '横置',
    displayState: '显示状态'
};
const DEBUG_DISPLAY_STATE_LABELS: Partial<Record<Card['displayState'], string>> = {
    FRONT_UPRIGHT: '正面竖置',
    FRONT_HORIZONTAL: '正面横置',
    FRONT_FACEDOWN: '正面背置',
    BACK_UPRIGHT: '背面'
};

function normalizeDebugZone(value: unknown): TriggerLocation {
    const zone = String(value || '').toUpperCase();
    if (!DEBUG_ZONES.includes(zone as TriggerLocation)) {
        throw new Error('无效的调试区域');
    }
    return zone as TriggerLocation;
}

function isDebugGameModeAllowed(gameState: GameState) {
    return DEBUG_ALLOWED_MODES.has(String(gameState.mode || ''));
}

function getDebugControllerUid(gameState: GameState, userUid: string) {
    const mode = String(gameState.mode || '');
    if (mode === 'friend') return gameState.hostUid?.toString();
    if (mode === 'sandbox') {
        if (gameState.hostUid) return gameState.hostUid.toString();
        return gameState.playerIds.find(uid => uid?.toString() !== 'BOT_PLAYER')?.toString();
    }
    if (mode === 'practice') {
        return gameState.playerIds.find(uid => uid?.toString() !== 'BOT_PLAYER')?.toString() || userUid;
    }
    return undefined;
}

function ensureDebugController(gameState: GameState, userUid: string) {
    if (!isDebugGameModeAllowed(gameState)) {
        throw new Error('该对局不允许开启调试模式');
    }
    const controllerUid = getDebugControllerUid(gameState, userUid);
    if (!controllerUid || controllerUid !== userUid) {
        throw new Error('只有房主/本人可以操作调试模式');
    }
}

function ensureDebugIdle(gameState: GameState) {
    if (gameState.pendingQuery || gameState.isResolvingStack || gameState.currentProcessingItem) {
        throw new Error('当前有待处理操作，调试操作只能在空闲状态执行');
    }
}

function ensureDebugEnabled(gameState: GameState, userUid: string) {
    ensureDebugController(gameState, userUid);
    if (!gameState.debugMode?.enabled || gameState.debugMode.controllerUid !== userUid) {
        throw new Error('请先开启调试模式');
    }
    ensureDebugIdle(gameState);
}

function getDebugZoneCards(player: PlayerState, zone: TriggerLocation): Array<Card | null> {
    switch (zone) {
        case 'HAND': return player.hand;
        case 'UNIT': return player.unitZone;
        case 'ITEM': return player.itemZone;
        case 'GRAVE': return player.grave;
        case 'EXILE': return player.exile;
        case 'EROSION_FRONT': return player.erosionFront;
        case 'EROSION_BACK': return player.erosionBack;
        case 'PLAY': return player.playZone;
        case 'DECK': return player.deck;
        default: return [];
    }
}

function findDebugCard(gameState: GameState, gamecardId: string) {
    for (const [ownerUid, player] of Object.entries(gameState.players || {})) {
        for (const zone of DEBUG_ZONES) {
            const cards = getDebugZoneCards(player, zone);
            const index = cards.findIndex(card => card?.gamecardId === gamecardId);
            if (index >= 0) {
                return { ownerUid, player, zone, cards, index, card: cards[index] as Card };
            }
        }
    }
    return undefined;
}

function getDebugPlayerName(gameState: GameState, uid: string) {
    return gameState.players?.[uid]?.displayName || gameState.participantNames?.[uid] || uid;
}

function getDebugZoneLabel(zone: TriggerLocation) {
    return DEBUG_ZONE_LABELS[zone] || zone;
}

function getDebugPatchLabel(key: string) {
    return DEBUG_PATCH_LABELS[key] || key;
}

function formatDebugBoolean(value: boolean) {
    return value ? '开启' : '关闭';
}

function addDebugBattleLog(gameState: GameState, actorUid: string, text: string, targets?: Card[]) {
    addBattleLog(gameState, {
        category: 'MOVED',
        actorUid,
        actorName: getDebugPlayerName(gameState, actorUid),
        text,
        targets: targets?.map(card => ({
            gamecardId: card.gamecardId,
            cardId: card.id,
            name: card.fullName,
            ownerUid: actorUid
        })),
        metadata: { debug: true }
    });
}

function removeDebugCardFromZone(found: ReturnType<typeof findDebugCard>) {
    if (!found) return;
    if (DEBUG_SLOT_ZONES.has(found.zone)) {
        found.cards[found.index] = null;
    } else {
        found.cards.splice(found.index, 1);
    }
}

function normalizeDebugDisplayState(zone: TriggerLocation, value?: unknown): Card['displayState'] {
    if (value === 'FRONT_UPRIGHT' || value === 'FRONT_HORIZONTAL' || value === 'FRONT_FACEDOWN' || value === 'BACK_UPRIGHT') {
        return value;
    }
    if (zone === 'DECK' || zone === 'EROSION_BACK') return 'BACK_UPRIGHT';
    return 'FRONT_UPRIGHT';
}

function placeDebugCard(targetPlayer: PlayerState, targetZone: TriggerLocation, card: Card, options: { targetIndex?: number; insertAtBottom?: boolean }) {
    const targetCards = getDebugZoneCards(targetPlayer, targetZone);
    if (DEBUG_SLOT_ZONES.has(targetZone)) {
        const targetIndex = Number.isInteger(options.targetIndex) ? Number(options.targetIndex) : -1;
        if (targetIndex >= 0) {
            while (targetCards.length <= targetIndex) targetCards.push(null);
            const existing = targetCards[targetIndex];
            if (existing) throw new Error('目标槽位已有卡牌');
            targetCards[targetIndex] = card;
            return;
        }
        const emptyIndex = targetCards.findIndex(slot => slot === null);
        if (emptyIndex >= 0) {
            targetCards[emptyIndex] = card;
            return;
        }
        targetCards.push(card);
        return;
    }

    if (options.insertAtBottom) {
        targetCards.unshift(card);
    } else {
        targetCards.push(card);
    }
}

function debugSetMode(gameState: GameState, userUid: string, enabled: boolean) {
    ensureDebugController(gameState, userUid);
    ensureDebugIdle(gameState);
    if (enabled) {
        gameState.debugMode = { enabled: true, controllerUid: userUid, enabledAt: Date.now() };
    } else {
        gameState.debugMode = { enabled: false, controllerUid: userUid, enabledAt: gameState.debugMode?.enabledAt || Date.now() };
    }
    addDebugBattleLog(gameState, userUid, `[调试] ${getDebugPlayerName(gameState, userUid)} ${enabled ? '开启' : '关闭'}了调试模式。`);
}

function debugDraw(gameState: GameState, actorUid: string, targetPlayerUid: string, countInput: unknown) {
    ensureDebugEnabled(gameState, actorUid);
    const targetPlayer = gameState.players[targetPlayerUid];
    if (!targetPlayer) throw new Error('未找到目标玩家');
    const count = Math.max(1, Math.min(20, Number(countInput) || 1));
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
        const card = targetPlayer.deck.pop();
        if (!card) break;
        card.cardlocation = 'HAND';
        card.displayState = 'FRONT_UPRIGHT';
        card.isExhausted = false;
        targetPlayer.hand.push(card);
        drawn.push(card);
    }
    addDebugBattleLog(
        gameState,
        actorUid,
        `[调试] ${getDebugPlayerName(gameState, actorUid)} 让 ${targetPlayer.displayName} 抽牌 ${drawn.length}/${count} 张。`,
        drawn
    );
}

function debugShuffle(gameState: GameState, actorUid: string, targetPlayerUid: string) {
    ensureDebugEnabled(gameState, actorUid);
    const targetPlayer = gameState.players[targetPlayerUid];
    if (!targetPlayer) throw new Error('未找到目标玩家');
    ServerGameService.shuffle(targetPlayer.deck);
    addDebugBattleLog(gameState, actorUid, `[调试] ${getDebugPlayerName(gameState, actorUid)} 洗切了 ${targetPlayer.displayName} 的牌库。`);
}

function debugMoveCard(gameState: GameState, actorUid: string, payload: any) {
    ensureDebugEnabled(gameState, actorUid);
    const cardId = String(payload?.cardId || payload?.gamecardId || '');
    if (!cardId) throw new Error('缺少卡牌 ID');
    const found = findDebugCard(gameState, cardId);
    if (!found) throw new Error('未找到要移动的卡牌');

    const targetPlayerUid = String(payload?.targetPlayerUid || payload?.toPlayerId || found.ownerUid);
    const targetPlayer = gameState.players[targetPlayerUid];
    if (!targetPlayer) throw new Error('未找到目标玩家');
    const targetZone = normalizeDebugZone(payload?.targetZone || payload?.toZone);
    const fromZone = found.zone;
    const fromOwnerUid = found.ownerUid;
    const card = found.card;

    removeDebugCardFromZone(found);
    if (shouldClearBattlefieldStateOnMove(fromZone, targetZone)) {
        clearBattlefieldState(card);
    }
    if ((targetZone === 'HAND' || targetZone === 'DECK') && fromZone !== 'HAND' && fromZone !== 'DECK') {
        ServerGameService.refreshCardAsNewInstance(card);
    }

    card.cardlocation = targetZone;
    card.displayState = normalizeDebugDisplayState(targetZone, payload?.displayState);
    card.isExhausted = payload?.isExhausted !== undefined
        ? !!payload.isExhausted
        : card.displayState === 'FRONT_HORIZONTAL';
    if (targetZone === 'GRAVE' || targetZone === 'EXILE' || targetZone === 'HAND' || targetZone === 'DECK' || targetZone === 'EROSION_FRONT' || targetZone === 'EROSION_BACK') {
        card.isExhausted = false;
    }
    if (targetZone === 'UNIT' || targetZone === 'ITEM') {
        if (payload?.isExhausted === undefined) card.isExhausted = false;
        card.displayState = card.isExhausted ? 'FRONT_HORIZONTAL' : normalizeDebugDisplayState(targetZone, payload?.displayState);
    }

    placeDebugCard(targetPlayer, targetZone, card, {
        targetIndex: Number.isInteger(payload?.targetIndex) ? Number(payload.targetIndex) : undefined,
        insertAtBottom: !!payload?.insertAtBottom
    });

    addDebugBattleLog(
        gameState,
        actorUid,
        `[调试] ${getDebugPlayerName(gameState, actorUid)} 将 [${card.fullName}] 从 ${getDebugPlayerName(gameState, fromOwnerUid)}的${getDebugZoneLabel(fromZone)}移动到 ${targetPlayer.displayName}的${getDebugZoneLabel(targetZone)}。`,
        [card]
    );
}

function debugPatchCard(gameState: GameState, actorUid: string, payload: any) {
    ensureDebugEnabled(gameState, actorUid);
    const cardId = String(payload?.cardId || payload?.gamecardId || '');
    if (!cardId) throw new Error('缺少卡牌 ID');
    const found = findDebugCard(gameState, cardId);
    if (!found) throw new Error('未找到要修改的卡牌');
    const card = found.card;
    const patch = payload?.patch || {};
    const changes: string[] = [];

    const setNumber = (key: 'power' | 'damage' | 'acValue', baseKey: 'basePower' | 'baseDamage' | 'baseAcValue') => {
        if (patch[key] === undefined) return;
        const rawValue = Math.max(-99999, Math.min(99999, Number(patch[key]) || 0));
        const value = key === 'power' ? Math.round(rawValue / 500) * 500 : rawValue;
        (card as any)[key] = value;
        (card as any)[baseKey] = value;
        changes.push(`${getDebugPatchLabel(key)}=${value}`);
    };
    const setBoolean = (
        key: 'godMark' | 'canAttack' | 'canActivateEffect' | 'isrush' | 'isAnnihilation' | 'isShenyi' | 'isHeroic',
        baseKey: 'baseGodMark' | 'baseCanAttack' | 'baseCanActivateEffect' | 'baseIsrush' | 'baseAnnihilation' | 'baseShenyi' | 'baseHeroic'
    ) => {
        if (patch[key] === undefined) return;
        const value = !!patch[key];
        (card as any)[key] = value;
        (card as any)[baseKey] = value;
        changes.push(`${getDebugPatchLabel(key)}=${formatDebugBoolean(value)}`);
    };

    setNumber('power', 'basePower');
    setNumber('damage', 'baseDamage');
    setNumber('acValue', 'baseAcValue');
    setBoolean('godMark', 'baseGodMark');
    setBoolean('canAttack', 'baseCanAttack');
    setBoolean('canActivateEffect', 'baseCanActivateEffect');
    setBoolean('isrush', 'baseIsrush');
    setBoolean('isAnnihilation', 'baseAnnihilation');
    setBoolean('isShenyi', 'baseShenyi');
    setBoolean('isHeroic', 'baseHeroic');

    if (patch.isExhausted !== undefined) {
        card.isExhausted = !!patch.isExhausted;
        card.displayState = card.isExhausted ? 'FRONT_HORIZONTAL' : 'FRONT_UPRIGHT';
        changes.push(`${getDebugPatchLabel('isExhausted')}=${formatDebugBoolean(card.isExhausted)}`);
    }
    if (patch.displayState !== undefined) {
        card.displayState = normalizeDebugDisplayState(found.zone, patch.displayState);
        card.isExhausted = card.displayState === 'FRONT_HORIZONTAL';
        changes.push(`${getDebugPatchLabel('displayState')}=${DEBUG_DISPLAY_STATE_LABELS[card.displayState] || card.displayState}`);
    }

    if (!changes.length) throw new Error('没有可修改的调试字段');
    addDebugBattleLog(
        gameState,
        actorUid,
        `[调试] ${getDebugPlayerName(gameState, actorUid)} 修改了 [${card.fullName}]：${changes.join(', ')}。`,
        [card]
    );
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

const MULLIGAN_REVEAL_TOTAL_MS = 3600;

async function finalizeMulliganReveal(gameId: string, expectedStartedAt?: number): Promise<boolean> {
    const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
    if (rows.length === 0) return false;

    const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
    ServerGameService.hydrateGameState(gameState);

    const startedAt = Number(gameState.mulliganRevealStartedAt || 0);
    const allDone = Object.values(gameState.players || {}).every((p: any) => p.mulliganDone);
    if (
        gameState.phase !== 'MULLIGAN' ||
        !startedAt ||
        (expectedStartedAt !== undefined && startedAt !== expectedStartedAt) ||
        Date.now() - startedAt < MULLIGAN_REVEAL_TOTAL_MS ||
        !allDone
    ) {
        return false;
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
    return true;
}

async function finishMulliganAfterReveal(gameId: string, expectedStartedAt: number) {
    setTimeout(async () => {
        await withGameLock(gameId, async () => {
            await finalizeMulliganReveal(gameId, expectedStartedAt);
        });
    }, MULLIGAN_REVEAL_TOTAL_MS);
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
    await persistGameState(matchNumber, gameState);
    return false;
}

type SyncStateOptions = {
    recalc?: boolean;
    source?: string;
    persist?: boolean;
};

function cloneStateForEmit(gameState: any) {
    return JSON.parse(JSON.stringify(gameState));
}

async function syncAndSaveState(gameId: string, gameState: any, options: SyncStateOptions = {}) {
    if (!gameState) return;
    const totalStart = process.hrtime.bigint();
    const timings: Record<string, number> = {};

    // Ensure gameId is always set for client identification
    gameState.gameId = gameId;

    // Ensure logs exist
    if (!gameState.logs) gameState.logs = [];

    if (options.recalc !== false) {
        const recalcStart = process.hrtime.bigint();
        EventEngine.recalculateContinuousEffects(gameState);
        timings.recalcMs = elapsedMs(recalcStart);
    }
    const normalizeStart = process.hrtime.bigint();
    normalizeBattleLogs(gameState);
    timings.normalizeLogsMs = elapsedMs(normalizeStart);

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
    const emitStart = process.hrtime.bigint();
    const emitState = cloneStateForEmit(gameState);
    if (emitState.animationHint) {
    }
    io.to(gameId).emit('gameStateUpdate', emitState);
    timings.emitMs = elapsedMs(emitStart);

    if (options.persist === false) {
        const totalMs = elapsedMs(totalStart);
        if (ENABLE_PERF_LOGS && totalMs >= SLOW_STATE_SYNC_MS) {
            console.warn('[Perf] slow state sync', {
                gameId,
                source: options.source || 'unknown',
                phase: gameState.phase,
                totalMs: Math.round(totalMs),
                ...Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, Math.round(value)])),
                memory: getMemorySnapshot()
            });
        }
        return;
    }

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
    const persistStart = process.hrtime.bigint();
    await persistGameState(gameId, gameState, gameState.gameStatus === 2 ? 2 : undefined, timings);
    timings.persistMs = elapsedMs(persistStart);

    // 6. If game ended, write full history to file
    if (gameState.gameStatus === 2) {
        const cleanedUp = await saveMatchLog(gameState, gameId);
        if (cleanedUp) {
            clearGameRuntime(gameId);
        }
    }

    const totalMs = elapsedMs(totalStart);
    if (ENABLE_PERF_LOGS && totalMs >= SLOW_STATE_SYNC_MS) {
        console.warn('[Perf] slow state sync', {
            gameId,
            source: options.source || 'unknown',
            phase: gameState.phase,
            totalMs: Math.round(totalMs),
            ...Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, Math.round(value)])),
            memory: getMemorySnapshot()
        });
    }
}

async function syncGameStateForCallback(gameId: string, gameState: any, source: string) {
    const isExplicitVisualFrame = !!gameState?.__visualOnlySync;
    if (gameState?.__visualOnlySync) {
        delete gameState.__visualOnlySync;
    }
    const isVisualFrame = isExplicitVisualFrame ||
        !!gameState?.currentProcessingItem ||
        (!!gameState?.isResolvingStack && gameState?.counterStack?.length > 0);
    await syncAndSaveState(gameId, gameState, {
        source,
        recalc: !isVisualFrame,
        persist: !isVisualFrame
    });
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
            await syncGameStateForCallback(gameId, state, 'advancePhase:callback');
        });
        await ServerGameService.applyConfrontationStrategy(gameState, async (state) => {
            await syncGameStateForCallback(gameId, state, 'advancePhase:confrontationCallback');
        });

        await syncAndSaveState(gameId, gameState);

        triggerBotIfNeeded(gameState, gameId);
    } catch (err: any) {
        // console.error('Game Action Error:', err);
        if (socket) socket.emit('gameError', { message: err.message || 'Action failed' });
    }
}

app.use(cors());
app.use(expressStaticCompressed(path.join(process.cwd(), 'dist')));
app.use(express.static(path.join(process.cwd(), 'dist'), {
    maxAge: '1h',
    setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));
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
        const activeRoomIds = Array.from(io.sockets.adapter.rooms.keys())
            .filter(roomId => /^(match|practice|friend|bugcup|sandbox)_/.test(roomId));
        const activeRoomParams = activeRoomIds.length > 0
            ? ` OR id IN (${activeRoomIds.map(() => '?').join(',')})`
            : '';
        const games = await pool.query(
            `SELECT id FROM games WHERE (status = 0 AND (updated_at IS NULL OR updated_at >= ?))${activeRoomParams}`,
            [Date.now() - ACTIVE_GAME_SCAN_WINDOW_MS, ...activeRoomIds]
        );
        for (const row of games) {
            const gameId = row.id;

            await withGameLock(gameId, async () => {
                const stateRows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
                if (stateRows.length === 0) return;

                const gameState = typeof stateRows[0].state === 'string' ? JSON.parse(stateRows[0].state) : stateRows[0].state;
                if (!gameState || gameState.gameStatus === 2) return;
                if (gameState.mode === 'friend' && !isFriendGameStarted(gameState)) return;
                if (gameState.mode === 'sandbox' && gameState.status === 'WAITING') return;
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
                    const revealStartedAt = Number(gameState.mulliganRevealStartedAt || 0);
                    const allMulliganDone = Object.values(gameState.players || {}).every((p: any) => p.mulliganDone);
                    if (revealStartedAt && allMulliganDone && now - revealStartedAt >= MULLIGAN_REVEAL_TOTAL_MS) {
                        await finalizeMulliganReveal(gameId, revealStartedAt);
                        return;
                    }
                } else if (gameState.phase === 'DRAW' && gameState.drawAnimationResume && !gameState.pendingQuery) {
                    const resumeAt = Number(gameState.drawAnimationResume.resumeAt || 0);
                    if (!gameState.drawAnimationResume.visualStateEmitted) {
                        gameState.drawAnimationResume.visualStateEmitted = true;
                        await syncAndSaveState(gameId, gameState, { source: 'drawAnimationResume:visualFrame' });
                        return;
                    }
                    if (resumeAt && now >= resumeAt) {
                        const playerUid = gameState.drawAnimationResume.playerUid || gameState.playerIds[gameState.currentTurnPlayer];
                        const player = gameState.players[playerUid];
                        if (!player) {
                            delete gameState.drawAnimationResume;
                            delete gameState.animationHint;
                            delete gameState.animationUntil;
                            await syncAndSaveState(gameId, gameState, { source: 'drawAnimationResume:missingPlayer' });
                            return;
                        }

                        await ServerGameService.completeDrawAnimationResume(gameState, player, async () => {});
                        await syncAndSaveState(gameId, gameState, { source: 'drawAnimationResume' });
                        triggerBotIfNeeded(gameState, gameId);
                        return;
                    }
                } else if (
                    gameState.phase === 'COUNTERING' &&
                    !gameState.pendingQuery &&
                    !gameState.isResolvingStack &&
                    !gameState.currentProcessingItem &&
                    gameState.animationHint?.type === 'CONFRONTATION_CHAIN'
                ) {
                    delete gameState.animationHint;
                    delete gameState.animationUntil;
                    await ServerGameService.applyConfrontationStrategy(gameState, async (state) => {
                        await syncGameStateForCallback(gameId, state, 'timer:confrontationAnimationComplete');
                    });
                    await syncAndSaveState(gameId, gameState, { source: 'confrontationAnimationComplete' });
                    triggerBotIfNeeded(gameState, gameId);
                    return;
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
                        await syncGameStateForCallback(gameId, state, 'timer:callback');
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

app.post('/api/password-reset/send-code', async (req, res): Promise<void> => {
    const email = typeof req.body.email === 'string' ? normalizeEmail(req.body.email) : '';

    const emailError = validateEmail(email);
    if (emailError) {
        res.status(400).json({ error: emailError });
        return;
    }

    try {
        const userRows = await pool.query(
            'SELECT id FROM users WHERE email = ? LIMIT 1',
            [email]
        );
        if (userRows.length === 0) {
            res.status(404).json({ error: '该邮箱尚未注册' });
            return;
        }

        const existingCodeRows = await pool.query(
            'SELECT created_at FROM password_reset_codes WHERE email = ?',
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
        const userId = String(userRows[0].id);

        await pool.query(
            `INSERT INTO password_reset_codes (email, user_id, code, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), code = VALUES(code), expires_at = VALUES(expires_at), created_at = VALUES(created_at)`,
            [email, userId, code, expiresAt, now]
        );

        try {
            await sendPasswordResetVerificationEmail(email, code);
        } catch (mailErr: any) {
            await pool.query('DELETE FROM password_reset_codes WHERE email = ?', [email]);
            console.error('Send password reset email error:', mailErr);
            res.status(500).json({ error: mailErr?.message || '验证码发送失败' });
            return;
        }

        res.json({
            success: true,
            message: '验证码已发送，请前往邮箱查收',
            expiresInMs: getVerificationCodeExpireMs()
        });
    } catch (err) {
        console.error('Send password reset code error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/password-reset', async (req, res): Promise<void> => {
    const email = typeof req.body.email === 'string' ? normalizeEmail(req.body.email) : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const verificationCode = typeof req.body.verificationCode === 'string' ? req.body.verificationCode.trim() : '';

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
            'SELECT user_id, code, expires_at FROM password_reset_codes WHERE email = ?',
            [email]
        );
        if (verificationRows.length === 0) {
            res.status(400).json({ error: '请先获取邮箱验证码' });
            return;
        }

        const verificationRow = verificationRows[0];
        if (Number(verificationRow.expires_at) < Date.now()) {
            await pool.query('DELETE FROM password_reset_codes WHERE email = ?', [email]);
            res.status(400).json({ error: '验证码已过期，请重新获取' });
            return;
        }
        if (verificationRow.code !== verificationCode) {
            res.status(400).json({ error: '验证码错误' });
            return;
        }

        conn = await pool.getConnection();
        await conn.beginTransaction();

        const userRows = await conn.query(
            'SELECT id FROM users WHERE id = ? AND email = ? LIMIT 1',
            [verificationRow.user_id, email]
        );
        if (userRows.length === 0) {
            await conn.rollback();
            await pool.query('DELETE FROM password_reset_codes WHERE email = ?', [email]);
            res.status(404).json({ error: '该邮箱尚未注册' });
            return;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = String(userRows[0].id);
        await conn.query(
            'UPDATE users SET password_hash = ?, session_version = COALESCE(session_version, 0) + 1 WHERE id = ?',
            [passwordHash, userId]
        );
        await conn.query('DELETE FROM password_reset_codes WHERE email = ?', [email]);
        await conn.commit();

        await forceLogoutOtherSockets(userId);
        res.json({ success: true, message: '密码已重置，请使用新密码登录' });
    } catch (err) {
        if (conn) {
            await conn.rollback();
        }
        console.error('Password reset error:', err);
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
        await insertGame(gameId, gameState);
        res.json({ gameId, botDeckProfileId: aiOpponentDeck?.profileId, botDeckName: aiOpponentDeck?.displayName });
    } catch (err) {
        console.error('Create practice game error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/sandbox/files', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const dir = getSandboxDirForUser(user);
        if (!fs.existsSync(dir)) {
            res.json({ files: [] });
            return;
        }
        const files = fs.readdirSync(dir, { withFileTypes: true })
            .filter(entry => entry.isFile() && entry.name.endsWith('.sbx'))
            .map(entry => {
                const stat = fs.statSync(path.join(dir, entry.name));
                return { name: entry.name, size: stat.size, updatedAt: stat.mtimeMs };
            })
            .sort((a, b) => b.updatedAt - a.updatedAt);
        res.json({ files });
    } catch (err) {
        console.error('List sandbox files error:', err);
        res.status(500).json({ error: '读取沙盒文件失败' });
    }
});

app.get('/api/sandbox/files/:name', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const { filePath } = resolveSandboxFilePath(user, req.params.name);
        if (!fs.existsSync(filePath)) {
            res.status(404).json({ error: '未找到沙盒文件' });
            return;
        }
        const raw = fs.readFileSync(filePath, 'utf8');
        const sandbox = normalizeSandboxFile(JSON.parse(raw), req.params.name);
        res.json({ sandbox });
    } catch (err: any) {
        console.error('Read sandbox file error:', err);
        res.status(400).json({ error: err.message || '读取沙盒文件失败' });
    }
});

app.post('/api/sandbox/files', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const sandbox = normalizeSandboxFile(req.body?.sandbox, req.body?.name);
        const { dir, filePath, fileName } = resolveSandboxFilePath(user, req.body?.name || sandbox.name || 'sandbox');
        fs.mkdirSync(dir, { recursive: true });
        sandbox.name = fileName.replace(/\.sbx$/i, '');
        sandbox.updatedAt = Date.now();
        fs.writeFileSync(filePath, JSON.stringify(sandbox, null, 2), 'utf8');
        res.json({ ok: true, name: fileName, sandbox });
    } catch (err: any) {
        console.error('Save sandbox file error:', err);
        res.status(400).json({ error: err.message || '保存沙盒文件失败' });
    }
});

app.post('/api/games/sandbox/bot', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const sandbox = normalizeSandboxFile(req.body?.sandbox);
        const botDifficulty = req.body?.botDifficulty === 'hard' ? 'hard' : 'simple';
        const requestedBotDeckProfileId = typeof req.body?.botDeckProfileId === 'string' ? req.body.botDeckProfileId : undefined;
        const botProfile = botDifficulty === 'hard'
            ? (AI_DECK_PROFILES.find(candidate => candidate.id === requestedBotDeckProfileId) || AI_DECK_PROFILES[0])
            : undefined;
        const gameId = 'sandbox_' + Math.random().toString(36).substring(2, 9);
        const gameState = createSandboxGameState({
            sandbox,
            gameId,
            playerUid: user.userId.toString(),
            playerName: user.displayName || user.username || '玩家',
            opponentUid: 'BOT_PLAYER',
            opponentName: botProfile ? `${botProfile.displayName} AI` : '神蚀 AI',
            botDifficulty,
            botDeckProfileId: botProfile?.id
        });
        await insertGame(gameId, gameState);
        res.json({ gameId, botDeckProfileId: botProfile?.id, botDeckName: botProfile?.displayName });
    } catch (err: any) {
        console.error('Create sandbox bot game error:', err);
        res.status(400).json({ error: err.message || '创建沙盒人机对局失败' });
    }
});

app.post('/api/games/sandbox/room', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const sandbox = normalizeSandboxFile(req.body?.sandbox);
        const roomCode = Math.random().toString(10).substring(2, 10).padEnd(8, '0');
        const gameId = 'sandbox_' + roomCode;
        const hostUid = user.userId.toString();
        const gameState = createSandboxGameState({
            sandbox,
            gameId,
            playerUid: hostUid,
            playerName: user.displayName || user.username || '玩家',
            opponentUid: 'SANDBOX_GUEST',
            opponentName: sandbox.players.opponent.displayName || '对手',
            roomCode,
            hostUid,
            participantNames: { [hostUid]: getUserUsernameLabel(user), SANDBOX_GUEST: sandbox.players.opponent.displayName || '等待加入' }
        });
        gameState.status = 'WAITING';
        gameState.participantIds = [hostUid];
        await insertGame(gameId, gameState);
        res.json({ gameId, roomCode });
    } catch (err: any) {
        console.error('Create sandbox room error:', err);
        res.status(400).json({ error: err.message || '创建沙盒房间失败' });
    }
});

app.post('/api/games/sandbox/join', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    const roomCode = String(req.body?.roomCode || '').replace(/\D/g, '');
    if (roomCode.length !== 8) {
        res.status(400).json({ error: '请输入 8 位房间码' });
        return;
    }

    try {
        const gameId = 'sandbox_' + roomCode;
        await withGameLock(gameId, async () => {
            const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
            if (rows.length === 0) { res.status(404).json({ error: '未找到该房间' }); return; }
            const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
            if (gameState.mode !== 'sandbox' || gameState.roomCode !== roomCode) {
                res.status(404).json({ error: '未找到该沙盒房间' });
                return;
            }
            const userIdStr = user.userId.toString();
            if (gameState.hostUid?.toString() === userIdStr) {
                res.json({ gameId, roomCode, seat: 'player' });
                return;
            }
            const guestIndex = gameState.playerIds.findIndex((uid: string) => uid === 'SANDBOX_GUEST');
            if (guestIndex === -1 && !gameState.playerIds.includes(userIdStr)) {
                res.status(400).json({ error: '该沙盒房间已有玩家加入' });
                return;
            }
            if (guestIndex !== -1) {
                gameState.playerIds[guestIndex] = userIdStr;
                gameState.players[userIdStr] = { ...gameState.players.SANDBOX_GUEST, uid: userIdStr, displayName: user.displayName || user.username || '玩家' };
                delete gameState.players.SANDBOX_GUEST;
            }
            gameState.participantIds = Array.from(new Set([...(gameState.participantIds || []), userIdStr]));
            gameState.participantNames = {
                ...(gameState.participantNames || {}),
                [userIdStr]: getUserUsernameLabel(user)
            };
            delete gameState.participantNames.SANDBOX_GUEST;
            gameState.status = 'ACTIVE';
            gameState.phaseTimerStart = Date.now();
            await syncAndSaveState(gameId, gameState);
            res.json({ gameId, roomCode, seat: 'player' });
        });
    } catch (err: any) {
        console.error('Join sandbox room error:', err);
        res.status(400).json({ error: err.message || '加入沙盒房间失败' });
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

        await insertGame(gameId, initialState);
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
type FriendInviteRecord = {
    inviteId: string;
    gameId: string;
    roomCode: string;
    hostUid: string;
    hostName: string;
    targetUid: string;
    targetName: string;
    turnTimerLimit?: number;
    createdAt: number;
    expiresAt: number;
};
const FRIEND_INVITE_TTL_MS = 60_000;
const friendInvites = new Map<string, FriendInviteRecord>();

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

function getOnlinePlayerByUid(userId: string) {
    return getOnlinePlayers().find(player => player.uid === userId);
}

function emitToAuthenticatedUser(userId: string, event: string, payload: any) {
    for (const socketId of getAuthenticatedSocketIds(userId)) {
        io.to(socketId).emit(event, payload);
    }
}

function removeFriendInvite(inviteId: string) {
    friendInvites.delete(inviteId);
}

function expireFriendInvite(inviteId: string) {
    const invite = friendInvites.get(inviteId);
    if (!invite || invite.expiresAt > Date.now()) return;
    friendInvites.delete(inviteId);
    emitToAuthenticatedUser(invite.hostUid, 'friendInvite:expired', {
        inviteId,
        targetUid: invite.targetUid,
        targetName: invite.targetName,
        gameId: invite.gameId,
        roomCode: invite.roomCode
    });
}

function pruneExpiredFriendInvites() {
    for (const [inviteId, invite] of friendInvites.entries()) {
        if (invite.expiresAt <= Date.now()) expireFriendInvite(inviteId);
    }
}

async function getFriendInviteLobby(gameId: string) {
    if (!gameId || !gameId.startsWith('friend_')) {
        throw new Error('无效的好友房间');
    }
    const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
    if (rows.length === 0) {
        throw new Error('好友房间不存在');
    }
    const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
    if (!gameState || gameState.mode !== 'friend') {
        throw new Error('无效的好友房间');
    }
    normalizeFriendRoomState(gameState);
    return gameState;
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

            await insertGame(gameId, gameState);

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
        await insertGame(gameId, initialState);
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

        const cardEntries = normalizeDeckCardEntries(deckData.cards || []);

        await pool.query(
            'INSERT INTO decks (id, user_id, name, cards, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [deckId, user.userId, deckData.name, JSON.stringify(cardEntries), Date.now(), Date.now()]
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
            const cardEntries = normalizeDeckCardEntries(deckData.cards);
            await pool.query('UPDATE decks SET name = ?, cards = ?, updated_at = ? WHERE id = ? AND user_id = ?',
                [deckData.name, JSON.stringify(cardEntries), Date.now(), deckId, user.userId]);
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
        const existingRows = await pool.query('SELECT id FROM decks WHERE id = ? AND user_id = ? LIMIT 1', [deckId, user.userId]);
        if (existingRows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }

        await pool.query('DELETE FROM decks WHERE id = ? AND user_id = ?', [deckId, user.userId]);
        await repairBugCupRegistrationAfterDeckDelete(user, deckId);
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
    return getDeckCardIds(Array.isArray(parsed) ? parsed : []);
};

const buildDeckSquarePost = (row: any, likedPostIds: Set<string>) => ({
    id: row.id,
    sourceDeckId: row.source_deck_id,
    authorUid: row.user_id,
    authorName: row.author_name,
    name: row.name,
    description: row.description || '',
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
const BUG_CUP_PAUSED = true;
const BUG_CUP_PAUSE_MESSAGE = '杯赛目前暂停，请自由约战。';
const BUG_CUP_TURN_TIMER_SECONDS = 600;
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
    if (BUG_CUP_PAUSED) return 'PAUSED';
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
        paused: BUG_CUP_PAUSED,
        pauseMessage: BUG_CUP_PAUSE_MESSAGE,
        phase,
        canEditDecks: !BUG_CUP_PAUSED && now < BUG_CUP_SWISS_START,
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
    const requestedDeckIds = deckIds.map(id => String(id || '').trim()).filter(Boolean).slice(0, 2);
    if (requestedDeckIds.length < 1 || requestedDeckIds.length > 2) {
        throw new Error('请选择 1 到 2 套卡组');
    }
    if (new Set(requestedDeckIds).size !== requestedDeckIds.length) {
        throw new Error('不能提交相同的卡组');
    }

    const decks: { sourceId: string; name: string; cards: string[] }[] = [];
    for (const deckId of requestedDeckIds) {
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

function decodeAndValidateBugCupDeckShareCode(deckCode: string, deckName?: string) {
    const refs = decodeDeckShareCode(String(deckCode || ''), getServerCatalogRefs());
    const cards = refs.map(ref => SERVER_CARD_LIBRARY[ref]).filter((card): card is Card => !!card);
    if (cards.length !== refs.length) throw new Error('卡组码包含服务器未找到的卡牌');

    const validation = ServerGameService.validateDeck(cards as any);
    if (!validation.valid) throw new Error(`卡组不合法：${validation.error}`);

    const name = String(deckName || '').trim() || `后台更新卡组 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
    return {
        sourceId: `admin-share:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        name,
        cards: refs
    };
}

async function adminUpdateBugCupDeckFromShareCode(userId: string, slot: number, deckCode: string, deckName?: string) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 1) throw new Error('卡组槽位必须是 1 或 2');

    const registration = await getBugCupRegistration(userId);
    if (!registration) throw new Error('未找到该玩家的杯赛报名');
    if (slot > 0 && !(registration.deckCards || [])[0]) throw new Error('更新第 2 套前，该玩家必须已有第 1 套杯赛卡组');

    const userRows = await pool.query('SELECT id, username, display_name FROM users WHERE id = ? LIMIT 1', [userId]);
    const targetUser = userRows[0] || {
        id: userId,
        username: registration.displayName || userId,
        display_name: registration.displayName || userId
    };
    const target = {
        userId,
        username: targetUser.username,
        displayName: targetUser.display_name || registration.displayName || targetUser.username || userId
    };

    const deck = decodeAndValidateBugCupDeckShareCode(deckCode, deckName);
    const deckSourceIds = [...(registration.deckSourceIds || [])];
    const deckNames = [...(registration.deckNames || [])];
    const deckCards = [...(registration.deckCards || [])];
    const deckSquarePostIds = [...(registration.deckSquarePostIds || [])];

    deckSourceIds[slot] = deck.sourceId;
    deckNames[slot] = deck.name;
    deckCards[slot] = deck.cards;
    deckSquarePostIds[slot] = await upsertBugCupDeckSquarePost(target, slot, deck.sourceId, deck.name, deck.cards);

    const nextLength = Math.max(1, Math.min(2, Math.max(deckSourceIds.length, slot + 1)));
    const trimToLength = (values: any[]) => values.slice(0, nextLength);
    const now = Date.now();

    await pool.query(
        `UPDATE bug_cup_registrations
         SET deck_source_ids = ?, deck_names = ?, deck_cards = ?, deck_square_post_ids = ?, updated_at = ?
         WHERE edition = ? AND user_id = ?`,
        [
            JSON.stringify(trimToLength(deckSourceIds)),
            JSON.stringify(trimToLength(deckNames)),
            JSON.stringify(trimToLength(deckCards)),
            JSON.stringify(trimToLength(deckSquarePostIds)),
            now,
            BUG_CUP_EDITION,
            userId
        ]
    );

    const stalePostIds = (registration.deckSquarePostIds || [])
        .filter((postId: string, index: number) => index === slot && postId && postId !== deckSquarePostIds[slot]);
    if (stalePostIds.length > 0) {
        await clearBugCupDeckSquarePosts(userId, stalePostIds);
    }

    return getBugCupRegistration(userId);
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

async function clearBugCupDeckSquarePosts(userId: string, postIds: string[]) {
    for (const postId of postIds.filter(Boolean)) {
        await pool.query('DELETE FROM deck_square_likes WHERE post_id = ?', [postId]);
        await pool.query('DELETE FROM deck_square_posts WHERE id = ? AND user_id = ?', [postId, userId]);
    }
}

async function repairBugCupRegistrationAfterDeckDelete(user: any, deletedDeckId: string) {
    const registration = await getBugCupRegistration(user.userId.toString());
    if (!registration || !registration.deckSourceIds.includes(deletedDeckId)) return;

    if (!buildBugCupCurrent().canEditDecks) return;

    const remainingDeckIds = registration.deckSourceIds.filter(sourceId => sourceId !== deletedDeckId);
    if (remainingDeckIds.length > 0) {
        const updatedRegistration = await saveBugCupRegistration(user, remainingDeckIds);
        const activePostIds = new Set(updatedRegistration?.deckSquarePostIds || []);
        await clearBugCupDeckSquarePosts(
            user.userId.toString(),
            (registration.deckSquarePostIds || []).filter(postId => !activePostIds.has(postId))
        );
        return;
    }

    await clearBugCupDeckSquarePosts(user.userId.toString(), registration.deckSquarePostIds || []);
    await pool.query('DELETE FROM bug_cup_registrations WHERE edition = ? AND user_id = ?', [BUG_CUP_EDITION, user.userId]);
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
    const gameState = await ServerGameService.createMatchGameState(match.player1_id, p1Cards, match.player2_id, p2Cards, BUG_CUP_TURN_TIMER_SECONDS);
    gameState.gameId = gameId;
    gameState.mode = 'bugCup';
    (gameState as any).bugCupMatchId = match.id;
    (gameState as any).bugCupEdition = Number(match.edition);
    (gameState as any).bugCupPhase = match.phase;
    (gameState as any).bugCupRound = Number(match.round);
    gameState.players[match.player1_id].displayName = p1Reg.displayName || '玩家1';
    gameState.players[match.player2_id].displayName = p2Reg.displayName || '玩家2';
    gameState.logs = [`${BUG_CUP_NAME} ${match.phase === 'PRELIM' ? '预赛' : match.phase === 'SWISS' ? `瑞士轮第 ${match.round} 轮` : match.round === 1 ? '半决赛' : '决赛'}开始。`];

    await insertGame(gameId, gameState);
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
    if (BUG_CUP_PAUSED) return;
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
        if (BUG_CUP_PAUSED) { res.status(423).json({ error: BUG_CUP_PAUSE_MESSAGE, current: buildBugCupCurrent() }); return; }
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
        if (BUG_CUP_PAUSED) { res.status(423).json({ error: BUG_CUP_PAUSE_MESSAGE, current: buildBugCupCurrent() }); return; }
        await ensureBugCupSchedule();
        const deckIds = Array.isArray(req.body?.deckIds) ? req.body.deckIds : null;
        const registration = deckIds ? await saveBugCupRegistration(user, deckIds) : await syncExistingBugCupDecks(user);
        res.json({ registration, current: buildBugCupCurrent() });
    } catch (err: any) {
        res.status(400).json({ error: err.message || '同步失败' });
    }
});

app.post('/api/bug-cup/admin/deck-code', async (req, res): Promise<void> => {
    const admin = await getAuthenticatedAdminFromHeader(req, res);
    if (!admin) { return; }

    try {
        if (BUG_CUP_PAUSED) { res.status(423).json({ error: BUG_CUP_PAUSE_MESSAGE, current: buildBugCupCurrent() }); return; }
        const userId = String(req.body?.userId || '').trim();
        const slot = Number(req.body?.slot);
        const deckCode = String(req.body?.deckCode || '').trim();
        const deckName = typeof req.body?.deckName === 'string' ? req.body.deckName.trim() : undefined;

        if (!userId) {
            res.status(400).json({ error: '请输入玩家ID' });
            return;
        }
        if (!deckCode) {
            res.status(400).json({ error: '请输入卡组码' });
            return;
        }

        const registration = await adminUpdateBugCupDeckFromShareCode(userId, slot, deckCode, deckName);
        res.json({ registration, current: buildBugCupCurrent() });
    } catch (err: any) {
        res.status(400).json({ error: err?.message || '更新杯赛卡组失败' });
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
            })),
            isAdmin: isAdminUser(user)
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
        const spectatableRows = await pool.query(
            `SELECT m.*,
                    u1.username AS player1_name,
                    u2.username AS player2_name
             FROM bug_cup_matches m
             LEFT JOIN users u1 ON u1.id = m.player1_id
             LEFT JOIN users u2 ON u2.id = m.player2_id
             WHERE m.edition = ?
               AND m.game_id IS NOT NULL
               AND m.result_status = 'ACTIVE'
             ORDER BY m.scheduled_for DESC, m.created_at DESC`,
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
            })),
            spectatableMatches: spectatableRows.map((row: any) => ({
                ...serializeBugCupMatch(row),
                player1Name: getBugCupDisplayName(row.player1_id, row.player1_name),
                player2Name: getBugCupDisplayName(row.player2_id, row.player2_name)
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
        if (BUG_CUP_PAUSED) { res.status(423).json({ error: BUG_CUP_PAUSE_MESSAGE, current: buildBugCupCurrent() }); return; }
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
        if (BUG_CUP_PAUSED) { res.status(423).json({ error: BUG_CUP_PAUSE_MESSAGE, current: buildBugCupCurrent() }); return; }
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
                'UPDATE deck_square_posts SET author_name = ?, cards = ?, tags = ?, updated_at = ? WHERE id = ?',
                [getUserDisplayLabel(user), JSON.stringify(cardIds), JSON.stringify(tags), now, existingRows[0].id]
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

app.put('/api/deck-square/:id', async (req, res): Promise<void> => {
    const user = await getAuthenticatedUserFromHeader(req, res);
    if (!user) { return; }

    try {
        const postId = req.params.id;
        const postRows = await pool.query('SELECT * FROM deck_square_posts WHERE id = ?', [postId]);
        if (postRows.length === 0) { res.status(404).json({ error: '未找到发布的卡组' }); return; }
        if (postRows[0].user_id !== user.userId) { res.status(403).json({ error: '只有发布者可以编辑该卡组' }); return; }

        const name = String(req.body?.name || '').trim();
        const description = String(req.body?.description || '').trim();
        if (!name) { res.status(400).json({ error: '套牌名称不能为空' }); return; }
        if (name.length > 80) { res.status(400).json({ error: '套牌名称不能超过 80 个字符' }); return; }
        if (description.length > 1200) { res.status(400).json({ error: '套牌说明不能超过 1200 个字符' }); return; }

        const now = Date.now();
        await pool.query(
            'UPDATE deck_square_posts SET name = ?, description = ?, updated_at = ? WHERE id = ? AND user_id = ?',
            [name, description, now, postId, user.userId]
        );

        const rows = await pool.query(`
            SELECT p.*, COALESCE(l.like_count, 0) AS like_count
            FROM deck_square_posts p
            LEFT JOIN (
                SELECT post_id, COUNT(*) AS like_count
                FROM deck_square_likes
                GROUP BY post_id
            ) l ON l.post_id = p.id
            WHERE p.id = ?
            LIMIT 1
        `, [postId]);
        const likedRows = await pool.query('SELECT post_id FROM deck_square_likes WHERE user_id = ?', [user.userId]);
        const likedPostIds = new Set<string>(likedRows.map((row: any) => row.post_id));
        res.json({ post: buildDeckSquarePost(rows[0], likedPostIds) });
    } catch (err) {
        console.error('Deck square update error:', err);
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
        const rows = await pool.query('SELECT card_id, rarity, quantity FROM user_cards WHERE user_id = ?', [user.userId]);
        const collection: Record<string, number> = {};
        for (const r of rows) {
            const uniqueId = `${r.card_id}:${r.rarity}`;
            collection[uniqueId] = Number(r.quantity);
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

    for (const card of getLiveCardVariations().filter(card => !isAdjustedCard(card)).filter(isCardVisibleInCatalog)) {
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

function resolveInventoryCard(cardReference: string): Card | undefined {
    if (!cardReference.includes(':')) {
        return undefined;
    }

    const card = (SERVER_CARD_LIBRARY as any)[cardReference] as Card | undefined;
    if (!card?.uniqueId || card.uniqueId !== cardReference || !card?.rarity || isAdjustedCard(card)) {
        return undefined;
    }

    return card;
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
                content: effect.content,
                wealthValue: effect.wealthValue,
                playerEffectScope: effect.playerEffectScope,
                playerEffectDescription: effect.playerEffectDescription,
                hideFromCardInfluence: effect.hideFromCardInfluence
            }))
            : undefined,
        imageUrl: card.imageUrl,
        fullImageUrl: card.fullImageUrl,
        rarity: card.rarity,
        availableRarities: card.availableRarities,
        adjustmentGroupId: card.adjustmentGroupId,
        adjustmentVersion: card.adjustmentVersion,
        adjustmentLabel: card.adjustmentLabel,
        adjustmentDescription: card.adjustmentDescription,
        ownershipUniqueId: card.ownershipUniqueId,
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
        const userRows = await conn.query('SELECT coins FROM users WHERE id = ? FOR UPDATE', [user.userId]);
        const coins = Number(userRows[0].coins);
        if (coins < totalCost) {
            await conn.rollback();
            res.status(400).json({ error: '金币不足' });
            return;
        }

        const allCards = getLiveCardVariations().filter(card => !isAdjustedCard(card)).filter(isCardVisibleInCatalog);
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
            let pityRows = await conn.query('SELECT * FROM pack_history WHERE user_id = ? FOR UPDATE', [user.userId]);
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

        const counts: Record<string, { cardId: string; rarity: string; quantity: number }> = {};
        drawnCards.forEach(c => {
            const key = c.uniqueId;
            if (!counts[key]) {
                counts[key] = { cardId: c.id, rarity: c.rarity, quantity: 0 };
            }
            counts[key].quantity++;
        });

        for (const item of Object.values(counts)) {
            await conn.query(
                `INSERT INTO user_cards (user_id, card_id, rarity, quantity) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
                [user.userId, item.cardId, item.rarity, item.quantity, item.quantity]
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
    const card = resolveInventoryCard(cardId);
    if (!card) { res.status(404).json({ error: '卡牌未找到' }); return; }

    const values = CRYSTAL_VALUES[card.rarity];
    if (!values) { res.status(400).json({ error: '该稀有度无法分解' }); return; }

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Check ownership
        const cardRows = await conn.query(
            'SELECT quantity FROM user_cards WHERE user_id = ? AND card_id = ? AND rarity = ?',
            [user.userId, card.id, card.rarity]
        );
        if (cardRows.length === 0 || Number(cardRows[0].quantity) < quantity) {
            await conn.rollback();
            res.status(400).json({ error: '持有数量不足' });
            return;
        }

        const crystalsGained = values.decompose * quantity;

        // Update cards
        if (Number(cardRows[0].quantity) === quantity) {
            await conn.query(
                'DELETE FROM user_cards WHERE user_id = ? AND card_id = ? AND rarity = ?',
                [user.userId, card.id, card.rarity]
            );
        } else {
            await conn.query(
                'UPDATE user_cards SET quantity = quantity - ? WHERE user_id = ? AND card_id = ? AND rarity = ?',
                [quantity, user.userId, card.id, card.rarity]
            );
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
    const card = resolveInventoryCard(cardId);
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
            `INSERT INTO user_cards (user_id, card_id, rarity, quantity) VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE quantity = quantity + 1`,
            [user.userId, card.id, card.rarity]
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
function createInitialPlayer(
    deckCards: Card[],
    displayName: string,
    isFirst: boolean,
    turnTimerLimit?: number,
    preferredOpeningCardIds?: readonly string[]
): PlayerState {
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

    const hand: Card[] = [];
    for (const cardId of preferredOpeningCardIds || []) {
        if (hand.length >= 4) break;
        const cardIndex = fullDeck.findIndex(card => card?.id === cardId);
        if (cardIndex === -1) continue;
        const [card] = fullDeck.splice(cardIndex, 1);
        if (card) hand.push({ ...card, cardlocation: 'HAND' as any });
    }

    while (hand.length < 4) {
        const card = fullDeck.shift();
        if (!card) break;
        hand.push({ ...card, cardlocation: 'HAND' as any });
    }

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

    socket.on('friendInvite:send', async (payload: { gameId?: string; targetUid?: string }) => {
        const user = (socket as any).user;
        if (!user) {
            socket.emit('friendInvite:error', { message: '请先登录后再邀请玩家。' });
            return;
        }

        pruneExpiredFriendInvites();
        const gameId = String(payload?.gameId || '');
        const targetUid = String(payload?.targetUid || '');
        const hostUid = user.userId.toString();
        if (!gameId || !targetUid) {
            socket.emit('friendInvite:error', { message: '邀请信息不完整。' });
            return;
        }
        if (targetUid === hostUid) {
            socket.emit('friendInvite:error', { targetUid, message: '不能邀请自己。' });
            return;
        }

        try {
            const gameState = await getFriendInviteLobby(gameId);
            if (isFriendGameStarted(gameState)) {
                socket.emit('friendInvite:error', { targetUid, message: '房间已开始，不能继续邀请。' });
                return;
            }
            if (gameState.hostUid?.toString() !== hostUid) {
                socket.emit('friendInvite:error', { targetUid, message: '只有房主可以邀请在线玩家。' });
                return;
            }
            if ((gameState.participantIds || []).map((uid: any) => uid?.toString()).includes(targetUid)) {
                socket.emit('friendInvite:error', { targetUid, message: '该玩家已经在房间内。' });
                return;
            }

            const targetPlayer = getOnlinePlayerByUid(targetUid);
            if (!targetPlayer || getAuthenticatedSocketIds(targetUid).length === 0) {
                socket.emit('friendInvite:error', { targetUid, message: '该玩家当前不在线。' });
                return;
            }

            const existingInvite = [...friendInvites.values()].find(invite =>
                invite.gameId === gameId &&
                invite.hostUid === hostUid &&
                invite.targetUid === targetUid &&
                invite.expiresAt > Date.now()
            );
            const inviteId = existingInvite?.inviteId || `friend_invite_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
            const hostName = getUserUsernameLabel(user);
            const invite: FriendInviteRecord = {
                inviteId,
                gameId,
                roomCode: gameState.roomCode,
                hostUid,
                hostName,
                targetUid,
                targetName: targetPlayer.displayName || targetPlayer.username || targetUid,
                turnTimerLimit: gameState.turnTimerLimit,
                createdAt: Date.now(),
                expiresAt: Date.now() + FRIEND_INVITE_TTL_MS
            };
            friendInvites.set(inviteId, invite);
            setTimeout(() => expireFriendInvite(inviteId), Math.max(0, invite.expiresAt - Date.now() + 50));

            const invitePayload = {
                inviteId: invite.inviteId,
                gameId: invite.gameId,
                roomCode: invite.roomCode,
                hostUid: invite.hostUid,
                hostName: invite.hostName,
                targetUid: invite.targetUid,
                turnTimerLimit: invite.turnTimerLimit,
                expiresAt: invite.expiresAt
            };
            emitToAuthenticatedUser(targetUid, 'friendInvite:received', invitePayload);
            socket.emit('friendInvite:sent', {
                inviteId,
                targetUid,
                targetName: invite.targetName,
                gameId,
                roomCode: invite.roomCode,
                expiresAt: invite.expiresAt
            });
        } catch (err: any) {
            socket.emit('friendInvite:error', { targetUid, message: err.message || '发送邀请失败。' });
        }
    });

    socket.on('friendInvite:declined', (payload: { inviteId?: string; reason?: string }) => {
        const user = (socket as any).user;
        if (!user) return;
        pruneExpiredFriendInvites();
        const inviteId = String(payload?.inviteId || '');
        const invite = friendInvites.get(inviteId);
        if (!invite || invite.targetUid !== user.userId.toString()) return;

        removeFriendInvite(inviteId);
        emitToAuthenticatedUser(invite.hostUid, 'friendInvite:declined', {
            inviteId,
            targetUid: invite.targetUid,
            targetName: invite.targetName,
            gameId: invite.gameId,
            roomCode: invite.roomCode,
            reason: payload?.reason || '对方拒绝了邀请。'
        });
    });

    socket.on('friendInvite:accepted', async (payload: { inviteId?: string }) => {
        const user = (socket as any).user;
        if (!user) {
            socket.emit('friendInvite:error', { message: '请先登录后再接受邀请。' });
            return;
        }

        pruneExpiredFriendInvites();
        const inviteId = String(payload?.inviteId || '');
        const invite = friendInvites.get(inviteId);
        if (!invite || invite.targetUid !== user.userId.toString()) {
            socket.emit('friendInvite:error', { inviteId, message: '邀请已失效。' });
            return;
        }

        try {
            const gameState = await getFriendInviteLobby(invite.gameId);
            if ((gameState.participantIds || []).map((uid: any) => uid?.toString()).includes(invite.targetUid)) {
                removeFriendInvite(inviteId);
                socket.emit('friendInvite:accepted', {
                    inviteId,
                    gameId: invite.gameId,
                    roomCode: invite.roomCode
                });
                return;
            }

            removeFriendInvite(inviteId);
            emitToAuthenticatedUser(invite.hostUid, 'friendInvite:accepted', {
                inviteId,
                targetUid: invite.targetUid,
                targetName: invite.targetName,
                gameId: invite.gameId,
                roomCode: invite.roomCode
            });
            socket.emit('friendInvite:accepted', {
                inviteId,
                gameId: invite.gameId,
                roomCode: invite.roomCode
            });
        } catch (err: any) {
            removeFriendInvite(inviteId);
            socket.emit('friendInvite:error', { inviteId, message: err.message || '接受邀请失败。' });
            emitToAuthenticatedUser(invite.hostUid, 'friendInvite:declined', {
                inviteId,
                targetUid: invite.targetUid,
                targetName: invite.targetName,
                gameId: invite.gameId,
                roomCode: invite.roomCode,
                reason: '邀请已失效。'
            });
        }
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
                const isSandboxGame = gameState.mode === 'sandbox';
                const isBugCupGame = gameState.mode === 'bugCup';
                if (isFriendGame) normalizeFriendRoomState(gameState);
                let seat: FriendSeatTarget = (isFriendGame || isBugCupGame || isSandboxGame) ? requestedSeat : 'player';
                if (isFriendGame && (gameState.playerIds || []).includes(userIdStr)) seat = 'player';
                if (isBugCupGame && (gameState.playerIds || []).map((uid: any) => uid?.toString()).includes(userIdStr)) seat = 'player';

                if (isFriendGame) {
                    try {
                        if (seat === 'spectator' || !(gameState.playerIds || []).includes(userIdStr)) {
                            setFriendSeat(gameState, userIdStr, seat);
                        }
                    } catch (err: any) {
                        socket.emit('error', err.message || '无法加入该席位');
                        socket.emit('gameStateUpdate', cloneStateForEmit(gameState));
                        return;
                    }
                }
                if (isBugCupGame && seat === 'spectator') {
                    if (!Array.isArray(gameState.spectatorIds)) gameState.spectatorIds = [];
                    if (!gameState.spectatorIds.map((uid: any) => uid?.toString()).includes(userIdStr)) {
                        gameState.spectatorIds.push(userIdStr);
                        await syncAndSaveState(gameId, gameState);
                    }
                }

                const initializedPlayers = Object.keys(gameState.players);
                // console.log(`[Socket] joinGame for ${userIdStr} in ${gameId}. Current players: ${initializedPlayers.join(',')}`);

                // Initialize human player if they haven't been initialized yet
                if (seat === 'player' && isSandboxGame && !gameState.playerIds.map((id: any) => id?.toString()).includes(userIdStr)) {
                    socket.emit('error', '你不在该沙盒对局中');
                    return;
                }

                if (seat === 'player' && !isSandboxGame && !gameState.players[userIdStr]) {
                    const effectiveDeckId = isFriendGame ? getFriendPlayerDeckId(gameState, userIdStr) : deckId;
                    if (effectiveDeckId) {
                        // console.log(`[Socket] Initializing player ${userIdStr} in game ${gameId}`);
                        const deckRows = await pool.query('SELECT * FROM decks WHERE id = ?', [effectiveDeckId]);
                        if (deckRows.length > 0) {
                            const deckCardsRaw = typeof deckRows[0].cards === 'string' ? JSON.parse(deckRows[0].cards) : deckRows[0].cards;
                            const deckEntries = normalizeDeckCardEntries(deckCardsRaw);

                            if (Object.keys(SERVER_CARD_LIBRARY).length === 0) {
                                await initServerCardLibrary();
                            }

                            const deckCards: Card[] = deckEntries
                                .map(entry => {
                                    const card = SERVER_CARD_LIBRARY[entry.id];
                                    return card ? applyDeckEntrySkin(card, entry) : undefined;
                                })
                                .filter((card): card is Card => !!card);

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
                                const botPlayer = createInitialPlayer(
                                    deckCards,
                                    '机器人',
                                    !isFirst,
                                    gameState.turnTimerLimit,
                                    gameState.botDifficulty === 'hard' ? getHardAiOpeningCardIds(gameState.botDeckProfiles?.BOT_PLAYER) : undefined
                                );
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
                const canStartSandboxGame = !isSandboxGame || gameState.status === 'ACTIVE';
                if (canStartFriendGame && canStartSandboxGame && isInitial && initializedRealPlayerCount >= 2 && (gameState.phase === 'INIT' || !gameState.phaseTimerStart || gameState.phaseTimerStart === 0)) {
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
                socket.emit('gameStateUpdate', cloneStateForEmit(gameState));
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
        const actionStart = process.hrtime.bigint();
        const actionTimings: Record<string, number> = {};
        let actionPhase = 'UNKNOWN';
        // console.log(`[Socket] received gameAction: ${action} for game ${gameId}`, payload);

        await withGameLock(gameId, async () => {
            try {
                const loadStart = process.hrtime.bigint();
                const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
                if (rows.length === 0) return;
                actionTimings.loadStateMs = elapsedMs(loadStart);

                const parseStart = process.hrtime.bigint();
                let gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
                actionTimings.parseStateMs = elapsedMs(parseStart);

                const hydrateStart = process.hrtime.bigint();
                ServerGameService.hydrateGameState(gameState);
                actionTimings.hydrateMs = elapsedMs(hydrateStart);
                actionPhase = gameState.phase;
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
                    await syncAndSaveState(gameId, gameState, { recalc: false, source: action });
                    return;
                }

                const executeStart = process.hrtime.bigint();
                if (action === 'DEBUG_SET_MODE') {
                    debugSetMode(gameState, myUid, !!payload?.enabled);
                    actionTimings.executeActionMs = elapsedMs(executeStart);
                    await syncAndSaveState(gameId, gameState, { source: action });
                    return;
                }
                if (action === 'DEBUG_DRAW') {
                    debugDraw(gameState, myUid, String(payload?.playerUid || myUid), payload?.count);
                    actionTimings.executeActionMs = elapsedMs(executeStart);
                    await syncAndSaveState(gameId, gameState, { source: action });
                    return;
                }
                if (action === 'DEBUG_SHUFFLE') {
                    debugShuffle(gameState, myUid, String(payload?.playerUid || myUid));
                    actionTimings.executeActionMs = elapsedMs(executeStart);
                    await syncAndSaveState(gameId, gameState, { source: action });
                    return;
                }
                if (action === 'DEBUG_MOVE_CARD') {
                    debugMoveCard(gameState, myUid, payload);
                    actionTimings.executeActionMs = elapsedMs(executeStart);
                    await syncAndSaveState(gameId, gameState, { source: action });
                    return;
                }
                if (action === 'DEBUG_PATCH_CARD') {
                    debugPatchCard(gameState, myUid, payload);
                    actionTimings.executeActionMs = elapsedMs(executeStart);
                    await syncAndSaveState(gameId, gameState, { source: action });
                    return;
                }

                const player = gameState.players[myUid];
                if (!player) {
                    // console.log(`[Socket] Action ${action} rejected: Player ${myUid} not found in game ${gameId}`);
                    return;
                }

                const syncCallback = async (state: GameState) => {
                    await syncGameStateForCallback(gameId, state, `${action}:callback`);
                };

                if (action === 'RPS_CHOICE') {
                    submitRpsChoice(gameState, myUid, payload?.choice);
                    actionTimings.executeActionMs = elapsedMs(executeStart);
                    await syncAndSaveState(gameId, gameState, {
                        recalc: false,
                        source: action
                    });
                    return;
                } else if (action === 'CHOOSE_FIRST_PLAYER') {
                    chooseFirstPlayer(gameState, myUid, payload?.firstPlayerUid);
                    actionTimings.executeActionMs = elapsedMs(executeStart);
                    await syncAndSaveState(gameId, gameState, {
                        recalc: false,
                        source: action
                    });
                    return;
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

                        actionTimings.executeActionMs = elapsedMs(executeStart);
                        await syncAndSaveState(gameId, gameState, {
                            recalc: !canSkipFinalRecalcForAction(action),
                            source: action
                        });
                        finishMulliganAfterReveal(gameId, startedAt);
                        return;
                    }
                } else if (action === 'PLAY_CARD') {
                    const { cardId, paymentSelection } = payload;
                    const wasInPlayZone = player.playZone?.some((card: Card | null) => card?.gamecardId === cardId);
                    await ServerGameService.playCard(gameState, myUid, cardId, paymentSelection);
                    const isNowInPlayZone = player.playZone?.some((card: Card | null) => card?.gamecardId === cardId);
                    if (!wasInPlayZone && isNowInPlayZone) {
                        const ackStart = process.hrtime.bigint();
                        await syncAndSaveState(gameId, gameState, {
                            recalc: false,
                            persist: false,
                            source: `${action}:playZoneAck`
                        });
                        actionTimings.ackEmitMs = elapsedMs(ackStart);
                    }
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
                    const ackStart = process.hrtime.bigint();
                    await syncAndSaveState(gameId, gameState, {
                        recalc: false,
                        persist: false,
                        source: `${action}:ack`
                    });
                    actionTimings.ackEmitMs = elapsedMs(ackStart);
                } else if (action === 'PASS_CONFRONTATION') {
                    await ServerGameService.passConfrontation(gameState, myUid, syncCallback);
                    const ackStart = process.hrtime.bigint();
                    await syncAndSaveState(gameId, gameState, {
                        recalc: false,
                        persist: false,
                        source: `${action}:ack`
                    });
                    actionTimings.ackEmitMs = elapsedMs(ackStart);
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
                            await ServerGameService.applyDefenseStrategy(gameState, syncCallback);
                        }
                        if (!gameState.pendingQuery) {
                            await ServerGameService.applyConfrontationStrategy(gameState, syncCallback);
                        }
                        actionTimings.executeActionMs = elapsedMs(executeStart);
                        await syncAndSaveState(gameId, gameState, {
                            recalc: !canSkipFinalRecalcForAction(action),
                            source: action
                        });
                        if (gameState.gameStatus !== 2) {
                            triggerBotIfNeeded(gameState, gameId);
                        }
                        return; // advancePhase already calls syncAndSaveState
                    }
                } else if (action === 'ADD_ANIMATION_TIME') {
                    const duration = Math.min(5000, Number(payload?.duration || 0));
                    if (duration > 0) {
                        gameState.phaseTimerStart = (gameState.phaseTimerStart || Date.now()) + duration;
                        gameState.animationUntil = Date.now() + duration;
                    }
                } else if (action === 'SURRENDER') {
                    await ServerGameService.surrender(gameState, myUid);
                }
                actionTimings.executeActionMs = elapsedMs(executeStart);

                const postActionStart = process.hrtime.bigint();
                if (!gameState.pendingQuery) {
                    await ServerGameService.applyDefenseStrategy(gameState, syncCallback);
                }
                if (!gameState.pendingQuery) {
                    await ServerGameService.applyConfrontationStrategy(gameState, syncCallback);
                }

                // Ensure any dangling triggers are checked before saving state (Skip if game is over)
                if (gameState.gameStatus !== 2 && !gameState.pendingQuery) {
                    await ServerGameService.checkTriggeredEffects(gameState);
                    if (!gameState.pendingQuery) {
                        await ServerGameService.applyDefenseStrategy(gameState, syncCallback);
                    }
                    if (!gameState.pendingQuery) {
                        await ServerGameService.applyConfrontationStrategy(gameState, syncCallback);
                    }
                }
                actionTimings.postActionMs = elapsedMs(postActionStart);

                // Final state sync and save
                const finalSyncStart = process.hrtime.bigint();
                await syncAndSaveState(gameId, gameState, {
                    recalc: !canSkipFinalRecalcForAction(action),
                    source: action
                });
                actionTimings.finalSyncMs = elapsedMs(finalSyncStart);
                if (gameState.gameStatus !== 2) {
                    triggerBotIfNeeded(gameState, gameId);
                }
            } catch (err: any) {
                console.error('[Socket] Game action error:', err);
                socket.emit('error', { message: err.message || 'Unknown game error' });
            } finally {
                const totalMs = elapsedMs(actionStart);
                if (ENABLE_PERF_LOGS && totalMs >= SLOW_GAME_ACTION_MS) {
                    console.warn('[Perf] slow game action', {
                        gameId,
                        action,
                        phase: actionPhase,
                        totalMs: Math.round(totalMs),
                        ...Object.fromEntries(Object.entries(actionTimings).map(([key, value]) => [key, Math.round(value)])),
                        memory: getMemorySnapshot()
                    });
                }
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
        if (userIdStr && gameId.startsWith('bugcup_')) {
            try {
                await withGameLock(gameId, async () => {
                    const rows = await pool.query('SELECT state FROM games WHERE id = ?', [gameId]);
                    if (!rows.length) return;
                    const gameState = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state;
                    if (!Array.isArray(gameState.spectatorIds) || !gameState.spectatorIds.map((uid: any) => uid?.toString()).includes(userIdStr)) return;
                    gameState.spectatorIds = gameState.spectatorIds.filter((uid: any) => uid?.toString() !== userIdStr);
                    await syncAndSaveState(gameId, gameState);
                });
            } catch (err) {
                console.error('[Socket] leaveGame bug cup spectator cleanup error:', err);
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
