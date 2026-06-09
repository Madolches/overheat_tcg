import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, Hash, Loader2, LogIn, Play, Plus, Save, Search, Timer, Trash2, Upload, Users, X, ArrowRightLeft, Radio, Network, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCardCatalog } from '../hooks/useCardCatalog';
import { Card, CardType, GamePhase, GameState, PlayerState, SandboxCardSetup, SandboxEditableZone, SandboxFile, SandboxPlayerKey, SandboxPlayerSetup } from '../types/game';
import { cn, getCardColorLabel, getCardImageUrl, getCardTypeLabel, getPhaseLabel, getLocationLabel } from '../lib/utils';
import { PageFallback } from './PageFallback';
import { getAuthToken } from '../socket';
import { PlayField } from './PlayField';

const AI_OPPONENT_DECKS = [
  { id: 'adventurer-guild', name: '冒险家公会', detail: '换位铺场并持续进攻' },
  { id: 'pure-yellow-steel', name: '纯黄钢兵', detail: '蓝图展开与钢兵压制' },
] as const;

const SANDBOX_PHASES: GamePhase[] = ['START', 'DRAW', 'EROSION', 'MAIN', 'DECLARE_END', 'DISCARD', 'END'];
const PLAYER_KEYS: SandboxPlayerKey[] = ['player', 'opponent'];

const ZONES: { id: SandboxEditableZone; label: string; fixed?: number; stack?: boolean }[] = [
  { id: 'deck', label: '牌库', stack: true },
  { id: 'hand', label: '手牌' },
  { id: 'erosionBack', label: '侵蚀背面', fixed: 10 },
  { id: 'erosionFront', label: '侵蚀正面', fixed: 10 },
  { id: 'unitZone', label: '单位区', fixed: 6 },
  { id: 'itemZone', label: '道具区' },
  { id: 'grave', label: '墓地' },
  { id: 'exile', label: '放逐区' },
];

const zoneLocation: Record<SandboxEditableZone, Card['cardlocation']> = {
  deck: 'DECK',
  hand: 'HAND',
  grave: 'GRAVE',
  exile: 'EXILE',
  itemZone: 'ITEM',
  unitZone: 'UNIT',
  erosionFront: 'EROSION_FRONT',
  erosionBack: 'EROSION_BACK'
};

const zoneLabels: Record<SandboxEditableZone, string> = {
  deck: '牌库',
  hand: '手牌',
  grave: '墓地',
  exile: '放逐区',
  itemZone: '道具区',
  unitZone: '单位区',
  erosionFront: '侵蚀正面',
  erosionBack: '侵蚀背面'
};

const emptyPlayer = (displayName: string): SandboxPlayerSetup => ({
  displayName,
  deck: [],
  hand: [],
  grave: [],
  exile: [],
  itemZone: [],
  unitZone: Array(6).fill(null),
  erosionFront: Array(10).fill(null),
  erosionBack: Array(10).fill(null)
});

const createEmptySandbox = (): SandboxFile => ({
  version: 1,
  name: 'sandbox',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  turnCount: 1,
  currentTurn: 'player',
  phase: 'MAIN',
  turnTimerLimit: 300,
  players: {
    player: emptyPlayer('玩家'),
    opponent: emptyPlayer('对手')
  }
});

type EditingTarget = {
  playerKey: SandboxPlayerKey;
  zone: SandboxEditableZone;
  index?: number;
};

type SelectedCardTarget = EditingTarget & {
  card: SandboxCardSetup;
};

type CenterPopover = 'settings' | 'phase' | 'bot' | 'export' | 'room' | null;

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export const SandboxSetup: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sandbox, setSandbox] = useState<SandboxFile>(() => createEmptySandbox());
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);
  const [selectedCard, setSelectedCard] = useState<SelectedCardTarget | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | CardType>('ALL');
  const [candidateOffset, setCandidateOffset] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [createdRoomCode, setCreatedRoomCode] = useState('');
  const [createdRoomGameId, setCreatedRoomGameId] = useState('');
  const [botDifficulty, setBotDifficulty] = useState<'simple' | 'hard'>('simple');
  const [botDeckProfileId, setBotDeckProfileId] = useState<(typeof AI_OPPONENT_DECKS)[number]['id']>('adventurer-guild');
  const [centerPopover, setCenterPopover] = useState<CenterPopover>(null);
  const token = getAuthToken();
  const { cards, cardByReference, loading, error } = useCardCatalog({ includeEffects: false });

  const effectiveTypeFilter = useMemo(() => {
    if (editingTarget?.zone === 'itemZone') return 'ITEM';
    if (editingTarget?.zone === 'unitZone') return 'UNIT';
    return typeFilter;
  }, [editingTarget?.zone, typeFilter]);

  const filteredCards = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return cards
      .filter(card => effectiveTypeFilter === 'ALL' || card.type === effectiveTypeFilter)
      .filter(card => {
        if (!keyword) return true;
        return [
          card.fullName,
          card.specialName
        ].some(value => String(value || '').toLowerCase().includes(keyword));
      })
      .slice(0, 120);
  }, [cards, search, effectiveTypeFilter]);

  const visibleCandidates = filteredCards.slice(candidateOffset, candidateOffset + 5);

  useEffect(() => {
    setCandidateOffset(0);
  }, [search, effectiveTypeFilter, editingTarget?.zone]);

  useEffect(() => {
    if (!successMessage) return;
    const timeout = window.setTimeout(() => setSuccessMessage(''), 1400);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const authHeaders = (json = true) => ({
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {})
  });

  const normalizeImportedSandbox = (input: any): SandboxFile => ({
    ...createEmptySandbox(),
    ...input,
    version: 1,
    turnCount: Math.max(1, Number(input?.turnCount) || 1),
    phase: SANDBOX_PHASES.includes(input?.phase) ? input.phase : 'MAIN',
    currentTurn: input?.currentTurn === 'opponent' ? 'opponent' : 'player',
    turnTimerLimit: Math.min(999, Math.max(180, Number(input?.turnTimerLimit) || 300)),
    players: {
      player: normalizePlayer(input?.players?.player, '玩家'),
      opponent: normalizePlayer(input?.players?.opponent, '对手')
    }
  });

  const normalizeCard = (value: any): SandboxCardSetup | null => {
    const cardRef = typeof value?.cardRef === 'string' ? value.cardRef : typeof value?.uniqueId === 'string' ? value.uniqueId : typeof value?.id === 'string' ? value.id : '';
    if (!cardRef) return null;
    return {
      cardRef,
      displayState: value?.displayState,
      isExhausted: !!value?.isExhausted
    };
  };

  const normalizeList = (value: any) => Array.isArray(value) ? value.map(normalizeCard).filter(Boolean) as SandboxCardSetup[] : [];

  const normalizeSlots = (value: any, length: number) => Array.from({ length }, (_, index) => {
    const raw = Array.isArray(value) ? value[index] : null;
    return raw ? normalizeCard(raw) : null;
  });

  const normalizePlayer = (value: any, displayName: string): SandboxPlayerSetup => ({
    displayName: typeof value?.displayName === 'string' ? value.displayName : displayName,
    deck: normalizeList(value?.deck),
    hand: normalizeList(value?.hand),
    grave: normalizeList(value?.grave),
    exile: normalizeList(value?.exile),
    itemZone: normalizeList(value?.itemZone),
    unitZone: normalizeSlots(value?.unitZone, 6),
    erosionFront: normalizeSlots(value?.erosionFront, 10),
    erosionBack: normalizeSlots(value?.erosionBack, 10)
  });

  const getCard = (setup?: SandboxCardSetup | null) => setup ? cardByReference.get(setup.cardRef) : undefined;

  const createPreviewCard = (setup: SandboxCardSetup, location: Card['cardlocation'], index: number, ownerKey: SandboxPlayerKey): Card | null => {
    const source = getCard(setup);
    if (!source) return null;
    const isFaceDown = location === 'DECK' || location === 'EROSION_BACK';
    const displayState = setup.displayState || (isFaceDown ? 'BACK_UPRIGHT' : 'FRONT_UPRIGHT');
    return {
      ...source,
      gamecardId: `sandbox_${ownerKey}_${location}_${index}_${setup.cardRef}`,
      runtimeFingerprint: `sandbox_${ownerKey}_${location}_${index}`,
      cardlocation: location,
      displayState,
      isExhausted: !!setup.isExhausted || displayState === 'FRONT_HORIZONTAL',
      hasAttackedThisTurn: false,
      usedShenyiThisTurn: false,
      canAttack: source.canAttack ?? true,
      canActivateEffect: source.canActivateEffect ?? true
    };
  };

  const createPreviewPlayer = (playerKey: SandboxPlayerKey, uid: string, isTurn: boolean): PlayerState => {
    const setup = sandbox.players[playerKey];
    return {
      uid,
      displayName: setup.displayName || (playerKey === 'player' ? '玩家' : '对手'),
      deck: setup.deck.map((card, index) => createPreviewCard(card, 'DECK', index, playerKey)).filter(Boolean) as Card[],
      hand: setup.hand.map((card, index) => createPreviewCard(card, 'HAND', index, playerKey)).filter(Boolean) as Card[],
      grave: setup.grave.map((card, index) => createPreviewCard(card, 'GRAVE', index, playerKey)).filter(Boolean) as Card[],
      exile: setup.exile.map((card, index) => createPreviewCard(card, 'EXILE', index, playerKey)).filter(Boolean) as Card[],
      itemZone: setup.itemZone.map((card, index) => createPreviewCard(card, 'ITEM', index, playerKey)).filter(Boolean) as Card[],
      unitZone: setup.unitZone.map((card, index) => card ? createPreviewCard(card, 'UNIT', index, playerKey) : null),
      erosionFront: setup.erosionFront.map((card, index) => card ? createPreviewCard(card, 'EROSION_FRONT', index, playerKey) : null),
      erosionBack: setup.erosionBack.map((card, index) => card ? createPreviewCard(card, 'EROSION_BACK', index, playerKey) : null),
      playZone: [],
      isTurn,
      isFirst: playerKey === sandbox.currentTurn,
      mulliganDone: true,
      hasExhaustedThisTurn: [],
      isGoddessMode: false,
      isHandPublic: 1,
      timeRemaining: (sandbox.turnTimerLimit || 300) * 1000,
      confrontationStrategy: 'AUTO'
    };
  };

  const previewGame = useMemo<GameState>(() => {
    const playerUid = 'SANDBOX_PLAYER';
    const opponentUid = 'SANDBOX_OPPONENT';
    const playerIds: [string, string] = sandbox.currentTurn === 'player'
      ? [playerUid, opponentUid]
      : [opponentUid, playerUid];
    const playerState = createPreviewPlayer('player', playerUid, sandbox.currentTurn === 'player');
    const opponentState = createPreviewPlayer('opponent', opponentUid, sandbox.currentTurn === 'opponent');
    return {
      gameId: 'sandbox_preview',
      phase: sandbox.phase,
      currentTurnPlayer: 0,
      turnCount: sandbox.turnCount,
      isCountering: 0,
      counterStack: [],
      passCount: 0,
      playerIds,
      gameStatus: 1,
      logs: [],
      mode: 'sandbox-preview',
      players: {
        [playerUid]: playerState,
        [opponentUid]: opponentState
      },
      triggeredEffectsQueue: [],
      pendingResolutions: [],
      effectUsage: {},
      turnTimerLimit: sandbox.turnTimerLimit
    };
  }, [sandbox, cardByReference]);

  const updatePlayer = (playerKey: SandboxPlayerKey, updater: (player: SandboxPlayerSetup) => SandboxPlayerSetup) => {
    setSandbox(prev => ({
      ...prev,
      updatedAt: Date.now(),
      players: {
        ...prev.players,
        [playerKey]: updater(prev.players[playerKey])
      }
    }));
  };

  const addCardToTarget = (card: Card) => {
    if (!editingTarget) return;
    let targetZone = editingTarget.zone;
    if (targetZone === 'erosionBack') {
      targetZone = 'erosionFront'; // Default to front side!
    }
    const setup: SandboxCardSetup = {
      cardRef: card.uniqueId || card.id,
      displayState: targetZone === 'deck' ? 'BACK_UPRIGHT' : 'FRONT_UPRIGHT',
      isExhausted: false
    };
    updatePlayer(editingTarget.playerKey, player => {
      const next = { ...player };
      if (targetZone === 'unitZone' || targetZone === 'erosionFront' || targetZone === 'erosionBack') {
        const zone = [...(next[targetZone] as Array<SandboxCardSetup | null>)];
        const targetIndex = editingTarget.index ?? zone.findIndex(slot => !slot);
        if (targetIndex >= 0 && targetIndex < zone.length) {
          zone[targetIndex] = setup;
        }
        (next as any)[targetZone] = zone;
      } else {
        (next as any)[targetZone] = [...((next as any)[targetZone] || []), setup];
      }
      return next;
    });
    setSuccessMessage(`已添加：${card.fullName}`);
  };

  const removeCard = (target: SelectedCardTarget) => {
    updatePlayer(target.playerKey, player => {
      const next = { ...player };
      if (target.zone === 'unitZone' || target.zone === 'erosionFront' || target.zone === 'erosionBack') {
        const zone = [...(next[target.zone] as Array<SandboxCardSetup | null>)];
        if (target.index !== undefined) zone[target.index] = null;
        (next as any)[target.zone] = zone;
      } else {
        const zone = [...((next as any)[target.zone] || [])];
        if (target.index !== undefined) zone.splice(target.index, 1);
        (next as any)[target.zone] = zone;
      }
      return next;
    });
    setSelectedCard(null);
  };

  const patchCard = (target: SelectedCardTarget, patch: Partial<SandboxCardSetup>) => {
    updatePlayer(target.playerKey, player => {
      const next = { ...player };
      if (target.zone === 'unitZone' || target.zone === 'erosionFront' || target.zone === 'erosionBack') {
        const zone = [...(next[target.zone] as Array<SandboxCardSetup | null>)];
        if (target.index !== undefined && zone[target.index]) zone[target.index] = { ...zone[target.index]!, ...patch };
        (next as any)[target.zone] = zone;
      } else {
        const zone = [...((next as any)[target.zone] || [])];
        if (target.index !== undefined && zone[target.index]) zone[target.index] = { ...zone[target.index], ...patch };
        (next as any)[target.zone] = zone;
      }
      return next;
    });
    setSelectedCard(prev => prev ? { ...prev, card: { ...prev.card, ...patch } } : prev);
  };

  const toggleErosionSide = (target: SelectedCardTarget) => {
    const fromZone = target.zone; // 'erosionFront' or 'erosionBack'
    const toZone = fromZone === 'erosionFront' ? 'erosionBack' : 'erosionFront';
    const nextDisplayState = toZone === 'erosionFront' ? 'FRONT_UPRIGHT' : 'BACK_UPRIGHT';
    
    updatePlayer(target.playerKey, player => {
      const next = { ...player };
      const sourceZone = [...(next[fromZone] as Array<SandboxCardSetup | null>)];
      const destZone = [...(next[toZone] as Array<SandboxCardSetup | null>)];
      
      const index = target.index;
      if (index !== undefined && index >= 0 && index < 10) {
        const cardSetup = sourceZone[index];
        if (cardSetup) {
          // Move card to destZone
          destZone[index] = {
            ...cardSetup,
            displayState: nextDisplayState,
            isExhausted: false
          };
          // Remove card from sourceZone
          sourceZone[index] = null;
        }
      }
      
      next[fromZone] = sourceZone as any;
      next[toZone] = destZone as any;
      return next;
    });

    setSelectedCard(prev => {
      if (!prev) return null;
      return {
        ...prev,
        zone: toZone,
        card: {
          ...prev.card,
          displayState: nextDisplayState,
          isExhausted: false
        }
      };
    });
  };

  const moveCard = (target: SelectedCardTarget, delta: number) => {
    if (target.zone === 'unitZone' || target.zone === 'erosionFront' || target.zone === 'erosionBack') return;
    updatePlayer(target.playerKey, player => {
      const zone = [...((player as any)[target.zone] || [])];
      const index = target.index ?? -1;
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= zone.length) return player;
      [zone[index], zone[nextIndex]] = [zone[nextIndex], zone[index]];
      return { ...player, [target.zone]: zone };
    });
    setSelectedCard(null);
  };

  const removeLatestFromListZone = (playerKey: SandboxPlayerKey, zone: 'deck' | 'hand') => {
    updatePlayer(playerKey, player => ({
      ...player,
      [zone]: player[zone].slice(0, -1)
    }));
    setSelectedCard(null);
  };

  const openSandboxTarget = (target: { playerKey: SandboxPlayerKey; zone: SandboxEditableZone; index?: number; card?: Card | null }) => {
    if (target.zone === 'deck' || target.zone === 'hand') {
      const zone = sandbox.players[target.playerKey][target.zone];
      const latestIndex = zone.length - 1;
      if (latestIndex >= 0) {
        setSelectedCard({ playerKey: target.playerKey, zone: target.zone, index: latestIndex, card: zone[latestIndex] });
        return;
      }
      setEditingTarget({ playerKey: target.playerKey, zone: target.zone });
      return;
    }
    const setup = findSetupForTarget(target);
    if (setup) {
      let finalIndex = target.index;
      if (finalIndex === undefined) {
        const zoneArray = sandbox.players[target.playerKey][target.zone] as Array<SandboxCardSetup | null>;
        finalIndex = zoneArray.findIndex(item => item?.cardRef === setup.cardRef);
      }
      setSelectedCard({ playerKey: target.playerKey, zone: target.zone, index: finalIndex >= 0 ? finalIndex : undefined, card: setup });
      return;
    }
    const targetZone = target.zone === 'erosionBack' ? 'erosionFront' : target.zone;
    setEditingTarget({ playerKey: target.playerKey, zone: targetZone, index: target.index });
  };

  const findSetupForTarget = (target: { playerKey: SandboxPlayerKey; zone: SandboxEditableZone; index?: number; card?: Card | null }): SandboxCardSetup | null => {
    const player = sandbox.players[target.playerKey];
    const zone = player[target.zone] as any;
    if (target.zone === 'deck') {
      return player.deck[player.deck.length - 1] || null;
    }
    if (Array.isArray(zone) && target.index !== undefined) {
      return zone[target.index] || null;
    }
    if (Array.isArray(zone)) {
      const compact = zone.filter(Boolean);
      return compact[compact.length - 1] || null;
    }
    return null;
  };

  const exportSandbox = () => {
    const file = normalizeImportedSandbox({ ...sandbox, updatedAt: Date.now() });
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${file.name || 'sandbox'}.sbx`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importSandboxFile = async (file: File) => {
    if (!file.name.endsWith('.sbx')) {
      alert('只允许上传 .sbx 格式的沙盒文件');
      return;
    }
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    setSandbox(normalizeImportedSandbox(parsed));
  };

  const saveSandbox = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/sandbox/files`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: sandbox.name || 'sandbox', sandbox })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      setSandbox(normalizeImportedSandbox(data.sandbox));
      alert(`已保存：${data.name}`);
    } catch (err: any) {
      alert(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const startBotGame = async () => {
    setStarting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/games/sandbox/bot`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          sandbox,
          botDifficulty,
          botDeckProfileId: botDifficulty === 'hard' ? botDeckProfileId : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建沙盒对局失败');
      navigate(`/battle/${data.gameId}`, { state: { seat: 'player' } });
    } catch (err: any) {
      alert(err.message || '创建沙盒对局失败');
    } finally {
      setStarting(false);
    }
  };

  const createRoom = async () => {
    setStarting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/games/sandbox/room`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sandbox })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建沙盒房间失败');
      setCreatedRoomCode(data.roomCode);
      setCreatedRoomGameId(data.gameId);
    } catch (err: any) {
      alert(err.message || '创建沙盒房间失败');
    } finally {
      setStarting(false);
    }
  };

  const joinRoom = async () => {
    setJoining(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/games/sandbox/join`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ roomCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加入沙盒房间失败');
      navigate(`/battle/${data.gameId}`, { state: { seat: 'player' } });
    } catch (err: any) {
      alert(err.message || '加入沙盒房间失败');
    } finally {
      setJoining(false);
    }
  };

  const centerIconButton = 'relative flex h-11 min-w-11 items-center justify-center rounded-xl border border-white/10 bg-black/70 px-3 text-xs font-black text-zinc-200 shadow-lg transition hover:border-red-500/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50';
  const centerPopoverClass = 'absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-950 p-3 text-left shadow-2xl';

  const sandboxCenterControls = (
    <div className="relative mx-auto flex w-fit max-w-[calc(100%-0.75rem)] flex-row items-center gap-1 rounded-2xl border border-white/10 bg-[#0c0c0e]/95 px-2 py-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl md:w-auto md:max-w-full md:gap-2 md:rounded-[2rem] md:px-4 md:py-2 scale-[0.85] md:scale-100 origin-center">
      <div className="flex flex-row flex-wrap items-center justify-center gap-1.5">
        <button title="对局设置" onClick={() => setCenterPopover(centerPopover === 'settings' ? null : 'settings')} className={centerIconButton}>
          <Settings className="h-4 w-4 text-blue-400" />
          <ChevronDown className="ml-1 h-3.5 w-3.5 text-zinc-500" />
        </button>

        <button title="设置阶段" onClick={() => setCenterPopover(centerPopover === 'phase' ? null : 'phase')} className={centerIconButton}>
          <Clock className="h-4 w-4 text-green-400" />
          <span className="ml-1.5">{getPhaseLabel(sandbox.phase)}</span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 text-zinc-500" />
        </button>

        <button title="人机设置" onClick={() => setCenterPopover(centerPopover === 'bot' ? null : 'bot')} className={centerIconButton}>
          <Bot className="h-4 w-4 text-orange-400" />
          <span className="ml-1.5">{botDifficulty === 'hard' ? '困难' : '简单'}</span>
          <ChevronDown className="ml-1 h-3.5 w-3.5 text-zinc-500" />
        </button>

        <button title="运行人机沙盒" onClick={startBotGame} disabled={starting} className={cn(centerIconButton, 'bg-red-600/90 text-white hover:bg-red-500')}>
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        </button>

        <button title="联机房间" onClick={() => setCenterPopover(centerPopover === 'room' ? null : 'room')} className={centerIconButton}>
          <Network className="h-4 w-4 text-cyan-400" />
          <ChevronDown className="ml-1 h-3.5 w-3.5 text-zinc-500" />
        </button>

        <button title="导出 .sbx" onClick={() => setCenterPopover(centerPopover === 'export' ? null : 'export')} className={centerIconButton}>
          <Download className="h-4 w-4 text-indigo-400" />
        </button>

        <button title="导入 .sbx" onClick={() => fileInputRef.current?.click()} className={centerIconButton}>
          <Upload className="h-4 w-4 text-pink-400" />
        </button>

        <button title="保存到我的沙盒" onClick={saveSandbox} disabled={saving} className={centerIconButton}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-emerald-400" />}
        </button>
      </div>

      <input ref={fileInputRef} type="file" accept=".sbx" className="hidden" onChange={event => {
        const file = event.target.files?.[0];
        if (file) importSandboxFile(file).catch(err => alert(err.message || '导入失败'));
        event.target.value = '';
      }} />

      {/* Pop-up windows displayed in the middle of the sandbox settings bar */}
      {centerPopover === 'settings' && (
        <div className={centerPopoverClass}>
          <div className="mb-3 text-[10px] font-black tracking-widest text-zinc-500">对局设置</div>
          
          <div className="mb-3 space-y-1">
            <label className="block text-xs font-bold text-zinc-400">当前回合数</label>
            <input
              type="number"
              min={1}
              max={999}
              value={sandbox.turnCount}
              onChange={event => setSandbox(prev => ({ ...prev, turnCount: Math.max(1, Math.min(999, Number(event.target.value) || 1)) }))}
              className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm font-black outline-none focus:border-red-500"
            />
          </div>

          <div className="mb-3 space-y-1">
            <label className="block text-xs font-bold text-zinc-400">当前回合玩家</label>
            <button
              onClick={() => setSandbox(prev => ({ ...prev, currentTurn: prev.currentTurn === 'player' ? 'opponent' : 'player' }))}
              className="flex w-full items-center justify-center rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm font-black hover:border-red-500"
            >
              <ArrowRightLeft className="mr-2 h-4 w-4 text-purple-400" />
              {sandbox.currentTurn === 'player' ? '我方' : '对手'}
            </button>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-zinc-400">回合时间 (秒)</label>
            <input
              type="number"
              min={30}
              max={999}
              value={sandbox.turnTimerLimit || 300}
              onChange={event => setSandbox(prev => ({ ...prev, turnTimerLimit: Math.max(30, Math.min(999, Number(event.target.value) || 300)) }))}
              className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm font-black outline-none focus:border-red-500"
            />
          </div>
        </div>
      )}

      {centerPopover === 'phase' && (
        <div className={centerPopoverClass}>
          <div className="mb-2 text-[10px] font-black tracking-widest text-zinc-500">阶段设置</div>
          <div className="grid gap-1">
            {SANDBOX_PHASES.map(phase => (
              <button
                key={phase}
                onClick={() => {
                  setSandbox(prev => ({ ...prev, phase }));
                  setCenterPopover(null);
                }}
                className={cn('rounded-lg px-3 py-2 text-left text-xs font-black transition', sandbox.phase === phase ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white')}
              >
                {getPhaseLabel(phase)}
              </button>
            ))}
          </div>
        </div>
      )}

      {centerPopover === 'bot' && (
        <div className="absolute left-1/2 top-full z-30 mt-2 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-950 p-3 text-left shadow-2xl">
          <div className="mb-2 text-[10px] font-black tracking-widest text-zinc-500">人机设置</div>
          <div className="grid gap-1">
            <button onClick={() => setBotDifficulty('simple')} className={cn('rounded-lg px-3 py-2 text-left text-xs font-black', botDifficulty === 'simple' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white')}>简单人机</button>
            <button onClick={() => setBotDifficulty('hard')} className={cn('rounded-lg px-3 py-2 text-left text-xs font-black', botDifficulty === 'hard' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white')}>困难人机</button>
          </div>
          {botDifficulty === 'hard' && (
            <div className="mt-2 grid gap-1 border-t border-white/10 pt-2">
              {AI_OPPONENT_DECKS.map(deck => (
                <button
                  key={deck.id}
                  onClick={() => setBotDeckProfileId(deck.id)}
                  className={cn('rounded-lg px-3 py-2 text-left text-xs font-black', botDeckProfileId === deck.id ? 'bg-white text-black' : 'text-zinc-400 hover:bg-white/10 hover:text-white')}
                >
                  {deck.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {centerPopover === 'room' && (
        <div className={centerPopoverClass}>
          <div className="mb-3 text-[10px] font-black tracking-widest text-zinc-500">联机房间</div>
          
          <div className="mb-4">
            <button 
              onClick={createRoom} 
              disabled={starting} 
              className="flex w-full items-center justify-center rounded-lg bg-cyan-600/90 px-3 py-2 text-xs font-black text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {starting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Network className="mr-1.5 h-3.5 w-3.5" />}
              生成房间码
            </button>
            {createdRoomCode && (
              <div className="mt-2 text-center">
                <p className="text-[10px] text-zinc-400">已生成房间:</p>
                <button
                  title="点击进入房间"
                  onClick={() => createdRoomGameId && navigate(`/battle/${createdRoomGameId}`, { state: { seat: 'player' } })}
                  className="mt-1 w-full truncate rounded border border-cyan-500/30 bg-cyan-950/40 py-1.5 font-mono text-sm font-black tracking-[0.25em] text-cyan-200 hover:border-cyan-500/60"
                >
                  {createdRoomCode}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 pt-3">
            <label className="mb-1 block text-[10px] font-bold text-zinc-400">加入其他房间</label>
            <div className="flex gap-2">
              <input
                value={roomCode}
                onChange={event => setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="输入8位房间码"
                className="w-full min-w-0 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-center font-mono text-xs font-black outline-none focus:border-cyan-500"
              />
              <button 
                title="加入" 
                onClick={joinRoom} 
                disabled={joining || roomCode.length !== 8} 
                className="flex shrink-0 items-center justify-center rounded-lg bg-zinc-800 px-3 text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4 text-teal-400" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {centerPopover === 'export' && (
        <div className={centerPopoverClass}>
          <div className="mb-2 text-[10px] font-black tracking-widest text-zinc-500">导出沙盒</div>
          <input
            autoFocus
            value={sandbox.name || ''}
            onChange={event => setSandbox(prev => ({ ...prev, name: event.target.value }))}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                exportSandbox();
                setCenterPopover(null);
              }
            }}
            className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm font-black outline-none focus:border-red-500"
            placeholder="输入沙盒名称"
          />
          <button
            onClick={() => {
              exportSandbox();
              setCenterPopover(null);
            }}
            className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-500"
          >
            确认导出
          </button>
        </div>
      )}
    </div>
  );

  if (loading) {
    return <PageFallback title="沙盒加载中" description="正在载入全卡池和沙盒工具..." />;
  }

  if (error) {
    return <PageFallback title="卡池加载失败" description={error} />;
  }

  return (
    <div className="min-h-screen bg-black px-3 pb-20 pt-20 text-white md:px-6">
      <PageFallback title="正在处理沙盒" description="正在创建对局或保存文件..." open={saving || starting} />
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="rounded-full bg-zinc-900 p-2 transition-colors hover:bg-zinc-800">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter md:text-3xl">沙盒模式</h1>
              <p className="text-[10px] font-bold tracking-widest text-zinc-500 md:text-sm">自定义局面并运行调试</p>
            </div>
          </div>
        </div>

        <div className="h-[calc(100vh-8.5rem)] min-h-[680px]">
          <PlayField
            player={previewGame.players.SANDBOX_PLAYER}
            opponent={previewGame.players.SANDBOX_OPPONENT}
            game={previewGame}
            stack={[]}
            myUid="SANDBOX_PLAYER"
            isSpectator
            sandboxEditMode
            onSandboxZoneClick={openSandboxTarget}
            sandboxCenterControls={sandboxCenterControls}
          />
        </div>
      </div>

      <AnimatePresence>
        {editingTarget && (
          <motion.div className="fixed inset-x-0 bottom-0 z-[1800] p-3 md:p-5" initial={{ y: 260, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 260, opacity: 0 }}>
            <div className="mx-auto max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-black">{editingTarget.playerKey === 'player' ? '我方' : '对手'} · {zoneLabels[editingTarget.zone]}</h2>
                  <p className="text-[10px] font-bold tracking-widest text-zinc-500">{editingTarget.zone === 'deck' ? '牌库底 -> 牌库顶' : getLocationLabel(zoneLocation[editingTarget.zone])}</p>
                </div>
                <button onClick={() => setEditingTarget(null)} className="rounded-lg border border-zinc-800 p-2 hover:bg-white/5"><X className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索卡名" className="w-full rounded-xl border border-zinc-800 bg-black py-3 pl-10 pr-4 text-sm font-bold outline-none focus:border-red-500" />
                </div>
                <select value={effectiveTypeFilter} disabled={editingTarget.zone === 'itemZone' || editingTarget.zone === 'unitZone'} onChange={event => setTypeFilter(event.target.value as any)} className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm font-bold outline-none focus:border-red-500 disabled:opacity-60">
                  <option value="ALL">全部类型</option>
                  <option value="UNIT">单位</option>
                  <option value="ITEM">道具</option>
                  <option value="STORY">故事</option>
                </select>
              </div>
              {successMessage && <div className="mt-3 rounded-lg border border-green-500/30 bg-green-950/40 px-3 py-2 text-center text-xs font-black text-green-200">{successMessage}</div>}
              <div className="mt-3 flex items-center gap-3">
                <button onClick={() => setCandidateOffset(offset => Math.max(0, offset - 5))} className="rounded-lg border border-zinc-800 p-2 hover:bg-white/5"><ChevronLeft className="h-5 w-5" /></button>
                <div className="grid flex-1 grid-cols-5 gap-2">
                  {visibleCandidates.map(card => (
                    <button key={card.uniqueId} onClick={() => addCardToTarget(card)} className="min-w-0 rounded-xl border border-zinc-800 bg-black/30 p-2 text-left transition-colors hover:border-red-500 hover:bg-red-950/20">
                      <img src={getCardImageUrl(card.id, card.rarity || 'C', true, card.availableRarities)} alt={card.fullName} className="mb-2 aspect-[3/4] w-full rounded-lg object-cover" />
                      <div className="truncate text-[10px] font-black">{card.fullName}</div>
                      <div className="mt-1 truncate text-[9px] font-bold text-zinc-500">{getCardTypeLabel(card.type)}</div>
                    </button>
                  ))}
                  {visibleCandidates.length === 0 && <div className="col-span-5 rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">没有候选卡牌</div>}
                </div>
                <button onClick={() => setCandidateOffset(offset => Math.min(Math.max(0, filteredCards.length - 5), offset + 5))} className="rounded-lg border border-zinc-800 p-2 hover:bg-white/5"><ChevronRight className="h-5 w-5" /></button>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, filteredCards.length - 5)}
                value={Math.min(candidateOffset, Math.max(0, filteredCards.length - 5))}
                onChange={event => setCandidateOffset(Number(event.target.value))}
                className="mt-3 w-full accent-red-600"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCard && (
          <motion.div className="fixed inset-x-0 bottom-0 z-[1900] p-3 md:p-5" initial={{ y: 220, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 220, opacity: 0 }}>
            <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black">{getCard(selectedCard.card)?.fullName || selectedCard.card.cardRef}</h2>
                  <p className="text-[10px] font-bold tracking-widest text-zinc-500">{zoneLabels[selectedCard.zone]}</p>
                </div>
                <button onClick={() => setSelectedCard(null)} className="rounded-lg border border-zinc-800 p-2 hover:bg-white/5"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    const targetZone = selectedCard.zone;
                    const targetPlayerKey = selectedCard.playerKey;
                    setSelectedCard(null);
                    setEditingTarget({ playerKey: targetPlayerKey, zone: targetZone });
                  }}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-500 flex items-center justify-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  继续添加卡牌
                </button>
                {selectedCard.zone !== 'deck' && selectedCard.zone !== 'grave' && (
                  <>
                    <button
                      onClick={() => {
                        if (selectedCard.zone === 'erosionFront' || selectedCard.zone === 'erosionBack') {
                          toggleErosionSide(selectedCard);
                        } else {
                          patchCard(selectedCard, { displayState: selectedCard.card.displayState === 'BACK_UPRIGHT' ? 'FRONT_UPRIGHT' : 'BACK_UPRIGHT' });
                        }
                      }}
                      className="rounded-lg border border-zinc-800 px-3 py-2 text-xs font-black hover:bg-white/5"
                    >
                      <ChevronDown className="mr-1 inline h-3.5 w-3.5" />
                      切换正背面
                    </button>
                    {selectedCard.zone !== 'erosionFront' && selectedCard.zone !== 'erosionBack' && (
                      <button onClick={() => patchCard(selectedCard, { isExhausted: !selectedCard.card.isExhausted, displayState: selectedCard.card.isExhausted ? 'FRONT_UPRIGHT' : 'FRONT_HORIZONTAL' })} className="rounded-lg border border-zinc-800 px-3 py-2 text-xs font-black hover:bg-white/5"><Check className="mr-1 inline h-3.5 w-3.5" />{selectedCard.card.isExhausted ? '设为竖置' : '设为横置'}</button>
                    )}
                  </>
                )}
                <button
                  onClick={() => selectedCard.zone === 'deck' || selectedCard.zone === 'hand' ? removeLatestFromListZone(selectedCard.playerKey, selectedCard.zone) : removeCard(selectedCard)}
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-500"
                >
                  <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                  {selectedCard.zone === 'deck' || selectedCard.zone === 'hand' ? '移除最新加入' : '移除卡牌'}
                </button>
                <button onClick={() => setSelectedCard(null)} className="rounded-lg border border-zinc-800 px-3 py-2 text-xs font-black hover:bg-white/5">关闭</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
