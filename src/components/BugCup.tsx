import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, ChevronDown, Eye, Loader2, RefreshCw, Swords, Trophy, UploadCloud, UsersRound, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Deck } from '../types/game';
import { cn } from '../lib/utils';
import { validateDeckForBattle } from '../lib/deckValidation';
import { getAuthToken, getAuthUser, socket } from '../socket';
import { useCardCatalog } from '../hooks/useCardCatalog';

interface BugCupCurrent {
  edition: number;
  name: string;
  tag: string;
  phase: 'PAUSED' | 'UPCOMING' | 'PRELIM' | 'SWISS' | 'ELIMINATION' | 'FINISHED';
  canEditDecks: boolean;
  paused?: boolean;
  pauseMessage?: string;
  now?: number;
  simulated?: boolean;
  swissRound: number;
  eliminationRound: number;
  schedule: Record<string, number>;
}

interface BugCupRegistration {
  deckSourceIds: string[];
  deckNames: string[];
  deckCards: string[][];
  registeredAt: number;
  updatedAt: number;
  lockedAt?: number | null;
}

interface BugCupMatch {
  id: string;
  phase: 'PRELIM' | 'SWISS' | 'ELIMINATION';
  round: number;
  player1Id: string;
  player2Id: string | null;
  player1DeckIndex: number | null;
  player2DeckIndex: number | null;
  player1Ready: boolean;
  player2Ready: boolean;
  gameId: string | null;
  winnerId: string | null;
  resultStatus: string;
  scheduledFor: number;
  opponentId?: string | null;
  player1Name?: string;
  player2Name?: string;
  winnerName?: string;
}

interface BugCupMeResponse {
  current?: BugCupCurrent;
  registration?: BugCupRegistration | null;
  matches?: BugCupMatch[];
  isAdmin?: boolean;
}

interface Standing {
  rank: number;
  userId: string;
  displayName: string;
  wins: number;
  losses: number;
  opponentWins: number;
  simulated?: boolean;
}

const phaseLabel: Record<BugCupCurrent['phase'], string> = {
  PAUSED: '暂停',
  UPCOMING: '即将开始',
  PRELIM: '预赛',
  SWISS: '瑞士轮',
  ELIMINATION: '单淘',
  FINISHED: '已结束'
};

export const BugCup: React.FC = () => {
  const navigate = useNavigate();
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
  const token = getAuthToken();
  const myUid = getAuthUser()?.uid?.toString();
  const {
    getCardByReference,
    loading: cardsLoading
  } = useCardCatalog({ includeEffects: false });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [actionMatchId, setActionMatchId] = useState<string | null>(null);
  const [myDecks, setMyDecks] = useState<Deck[]>([]);
  const [current, setCurrent] = useState<BugCupCurrent | null>(null);
  const [registration, setRegistration] = useState<BugCupRegistration | null>(null);
  const [matches, setMatches] = useState<BugCupMatch[]>([]);
  const [eliminationMatches, setEliminationMatches] = useState<BugCupMatch[]>([]);
  const [spectatableMatches, setSpectatableMatches] = useState<BugCupMatch[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [selectedBattleDeckIndex, setSelectedBattleDeckIndex] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUpdating, setAdminUpdating] = useState(false);
  const [adminDeckUserId, setAdminDeckUserId] = useState('');
  const [adminDeckSlot, setAdminDeckSlot] = useState(0);
  const [adminDeckName, setAdminDeckName] = useState('');
  const [adminDeckCode, setAdminDeckCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [openPicker, setOpenPicker] = useState<number | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submittedDeckCount = registration?.deckCards?.length || 0;
  const selectedDecks = selectedDeckIds.map(id => myDecks.find(deck => deck.id === id) || null);
  const hasDuplicateSelectedDecks = new Set(selectedDeckIds.filter(Boolean)).size !== selectedDeckIds.filter(Boolean).length;
  const selectedDeckErrors = selectedDecks
    .filter(Boolean)
    .map(deck => validateDeckForBattle(deck, cardsLoading ? undefined : getCardByReference))
    .filter(result => !result.valid)
    .map(result => result.error || '卡组不合法');
  const deckSelectionErrors = hasDuplicateSelectedDecks ? ['不能提交相同的卡组'] : selectedDeckErrors;
  const canSubmitDecks = selectedDeckIds.filter(Boolean).length >= 1 && deckSelectionErrors.length === 0 && !!current?.canEditDecks;
  const registeredPlayerOptions = useMemo(
    () => [...standings].sort((a, b) => a.rank - b.rank),
    [standings]
  );

  const loadData = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const [deckRes, meRes, standingsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/user/decks`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BACKEND_URL}/api/bug-cup/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BACKEND_URL}/api/bug-cup/standings`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const deckData = await deckRes.json();
      const meData: BugCupMeResponse = await meRes.json();
      const standingData = await standingsRes.json();

      setMyDecks(deckData.decks || []);
      setCurrent(meData.current || standingData.current || null);
      setRegistration(meData.registration || null);
      setMatches(meData.matches || []);
      setEliminationMatches(standingData.eliminationMatches || []);
      setSpectatableMatches(standingData.spectatableMatches || []);
      setStandings(standingData.standings || []);
      setIsAdmin(!!meData.isAdmin);
      if (meData.isAdmin && standingData.standings?.length) {
        setAdminDeckUserId(currentId => (
          standingData.standings.some((item: Standing) => item.userId === currentId)
            ? currentId
            : standingData.standings[0].userId
        ));
      }
      if (meData.registration?.deckSourceIds?.length) {
        setSelectedDeckIds(meData.registration.deckSourceIds);
      } else if (!selectedDeckIds.length && deckData.decks?.length) {
        setSelectedDeckIds([deckData.decks[0].id]);
      }
    } catch (e) {
      setError('加载杯赛信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(true);
    void import('./BattleField');

    const handleMatchFound = (payload: { gameId: string }) => {
      clearPrelimPoll();
      setSearching(false);
      navigate(`/battle/${payload.gameId}`);
    };

    socket.on('bugCupMatchFound', handleMatchFound);
    if (token) {
      if (!socket.connected) socket.connect();
      socket.emit('authenticate', token);
    }

    return () => {
      socket.off('bugCupMatchFound', handleMatchFound);
      clearPrelimPoll();
    };
  }, [BACKEND_URL, navigate, token]);

  const clearPrelimPoll = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  const formatDate = (value?: number) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';

  const updateDeckSelection = (slot: number, deckId: string) => {
    setSelectedDeckIds(currentIds => {
      const next = [...currentIds];
      next[slot] = deckId;
      return next.filter(Boolean).slice(0, 2);
    });
    setOpenPicker(null);
  };

  const submitDecks = async (syncOnly = false) => {
    if (!canSubmitDecks && !syncOnly) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/bug-cup/${syncOnly ? 'decks/sync' : 'register'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: syncOnly ? JSON.stringify({}) : JSON.stringify({ deckIds: selectedDeckIds.filter(Boolean).slice(0, 2) })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '提交失败');
      setRegistration(data.registration || null);
      setCurrent(data.current || current);
      if (data.registration?.deckSourceIds) setSelectedDeckIds(data.registration.deckSourceIds);
      setNotice(syncOnly ? '已同步最新卡组内容，并更新套牌广场' : '报名信息已更新，并发布到套牌广场');
      await loadData(false);
    } catch (e: any) {
      setError(e.message || '提交失败');
    } finally {
      setSaving(false);
    }
  };

  const updateBugCupDeckByCode = async () => {
    if (!isAdmin || adminUpdating) return;
    setAdminUpdating(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/bug-cup/admin/deck-code`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adminDeckUserId.trim(),
          slot: adminDeckSlot,
          deckName: adminDeckName.trim(),
          deckCode: adminDeckCode.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '更新失败');
      setNotice('已用卡组码更新杯赛卡组，并同步套牌广场');
      setAdminDeckCode('');
      await loadData(false);
    } catch (e: any) {
      setError(e.message || '更新失败');
    } finally {
      setAdminUpdating(false);
    }
  };

  const requestPrelimMatch = async () => {
    if (!registration || searching) return;
    setSearching(true);
    setError('');
    setNotice('');

    const tick = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/bug-cup/prelim/matchmaking`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckIndex: selectedBattleDeckIndex })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || '匹配失败');
        if (data.matched && data.gameId) {
          clearPrelimPoll();
          setSearching(false);
          navigate(`/battle/${data.gameId}`);
          return;
        }
        pollRef.current = setTimeout(tick, 1200);
      } catch (e: any) {
        clearPrelimPoll();
        setSearching(false);
        setError(e.message || '匹配失败');
      }
    };

    await tick();
  };

  const cancelPrelimMatch = () => {
    clearPrelimPoll();
    setSearching(false);
    fetch(`${BACKEND_URL}/api/bug-cup/prelim/matchmaking`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel: true })
    }).catch(() => undefined);
  };

  const readyForMatch = async (match: BugCupMatch) => {
    setActionMatchId(match.id);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/bug-cup/matches/${match.id}/ready`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckIndex: selectedBattleDeckIndex })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '准备失败');
      if (data.gameId) {
        navigate(`/battle/${data.gameId}`);
        return;
      }
      setNotice('已准备，等待对手');
      await loadData(false);
    } catch (e: any) {
      setError(e.message || '准备失败');
    } finally {
      setActionMatchId(null);
    }
  };

  const cancelReadyForMatch = async (match: BugCupMatch) => {
    setActionMatchId(match.id);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/bug-cup/matches/${match.id}/ready`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ready: false })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '取消准备失败');
      setNotice('已取消准备');
      await loadData(false);
    } catch (e: any) {
      setError(e.message || '取消准备失败');
    } finally {
      setActionMatchId(null);
    }
  };

  const activeOfficialMatches = useMemo(() =>
    matches.filter(match => match.phase !== 'PRELIM' && ['PENDING', 'ACTIVE'].includes(match.resultStatus)),
    [matches]
  );
  const visibleSpectatableMatches = useMemo(() =>
    spectatableMatches.filter(match => !!match.gameId),
    [spectatableMatches]
  );

  const watchMatch = (gameId: string) => {
    navigate(`/battle/${gameId}?seat=spectator`, { state: { seat: 'spectator' } });
  };

  const renderDeckPicker = (slot: number) => {
    const selected = myDecks.find(deck => deck.id === selectedDeckIds[slot]);
    return (
      <div>
        <button
          type="button"
          disabled={!current?.canEditDecks}
          onClick={() => setOpenPicker(slot)}
          className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-left disabled:opacity-70"
        >
          <span>
            <span className="block text-sm font-black text-white">{selected?.name || `选择卡组 ${slot + 1}`}</span>
            <span className="text-[10px] font-bold text-zinc-500">{selected ? `${selected.cards.length} 张` : '可留空第二套'}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </button>
      </div>
    );
  };

  if (loading || cardsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-black px-4 pb-24 pt-20 text-white sm:px-6 md:px-10">
      {/* Dynamic Background Effects */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 h-[800px] w-[800px] rounded-full bg-red-900/20 blur-[120px]" />
        <div className="absolute -right-1/4 bottom-1/4 h-[600px] w-[600px] rounded-full bg-purple-900/20 blur-[100px]" />
        <div className="absolute inset-0 bg-white/[0.03] mix-blend-overlay" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="group flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-all hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              <ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
            </button>
            <div>
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-[10px] font-black tracking-widest text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]"
              >
                <Trophy className="h-4 w-4" />
                第{current?.edition || 1}届
              </motion.div>
              <div className="mt-1 flex flex-wrap items-center gap-3 sm:gap-4">
                <h1 className="bg-gradient-to-r from-red-500 via-rose-400 to-orange-500 bg-clip-text text-4xl font-black italic tracking-tighter text-transparent drop-shadow-[0_0_20px_rgba(239,68,68,0.3)] md:text-5xl">bug杯</h1>
                <button
                  type="button"
                  onClick={() => setRulesOpen(true)}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-zinc-100 transition-all hover:bg-white/10 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                >
                  <BookOpen className="h-4 w-4 text-red-400" />
                  规则
                </button>
              </div>
              <p className="text-xs font-bold tracking-widest text-zinc-500">{current ? phaseLabel[current.phase] : '加载中'} · {current?.tag}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadData(true)}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black transition-colors hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>

        {(notice || error) && (
          <div className={cn('rounded-xl border px-4 py-3 text-sm font-bold', error ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300')}>
            {error || notice}
          </div>
        )}

        {current?.simulated && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-black text-amber-200">
            模拟测试中：当前杯赛时间按 {formatDate(current.now)} 运行，阶段为 {phaseLabel[current.phase]}。
          </div>
        )}

        {current?.paused && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-4 text-sm font-black text-red-100">
            {current.pauseMessage || '杯赛目前暂停，请自由约战。'}
          </div>
        )}

        {current && <PhaseProgress current={current} />}

        {!current?.paused && (
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 p-5 shadow-2xl backdrop-blur-xl sm:p-6 md:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black italic tracking-tight">报名卡组</h2>
              <p className="mt-1 text-xs font-bold text-zinc-500">
                {current?.canEditDecks ? '预赛期间可以自由调整，提交后会同步到套牌广场' : '正式赛阶段已锁定最后一次提交快照'}
              </p>
            </div>
            {!!registration && (
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-black text-emerald-300">
                已报名
              </span>
            )}
          </div>

          <div className="relative grid gap-3 sm:gap-4 md:grid-cols-2">
            {current?.canEditDecks ? (
              <>
                {renderDeckPicker(0)}
                {renderDeckPicker(1)}
              </>
            ) : (
              (registration?.deckNames || []).map((name, index) => (
                <div key={`${name}-${index}`} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-5 py-4 transition-all hover:bg-white/10">
                  <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative z-10">
                    <div className="text-base font-black text-white sm:text-lg">{name}</div>
                    <div className="mt-1 text-[10px] font-bold text-zinc-400 sm:text-xs">{registration?.deckCards[index]?.length || 0} 张 · 第 {index + 1} 套</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {deckSelectionErrors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="relative mt-4 overflow-hidden rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300 sm:text-sm"
            >
              {deckSelectionErrors[0]}
            </motion.div>
          )}

          {current?.canEditDecks && (
            <div className="mt-4 flex flex-col gap-2 md:flex-row">
              <button
                type="button"
                onClick={() => submitDecks(false)}
                disabled={!canSubmitDecks || saving}
                className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {registration ? '更新报名卡组' : '报名 bug杯'}
              </button>
              {!!registration && (
                <button
                  type="button"
                  onClick={() => submitDecks(true)}
                  disabled={saving}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  同步原卡组内容
                </button>
              )}
            </div>
          )}
        </section>
        )}

        {!current?.paused && <DeckPickerModal
          slot={openPicker}
          decks={myDecks}
          selectedDeckIds={selectedDeckIds}
          selectedDeckId={openPicker === null ? undefined : selectedDeckIds[openPicker]}
          cardsLoading={cardsLoading}
          getCardByReference={getCardByReference}
          onSelect={deckId => openPicker !== null && updateDeckSelection(openPicker, deckId)}
          onClearSecond={() => {
            setSelectedDeckIds(ids => ids.slice(0, 1));
            setOpenPicker(null);
          }}
          onClose={() => setOpenPicker(null)}
        />}

        {!current?.paused && isAdmin && (
          <section className="relative overflow-hidden rounded-3xl border border-amber-400/20 bg-zinc-950/40 p-5 shadow-2xl backdrop-blur-xl sm:p-6 md:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.04] to-transparent pointer-events-none" />
            <div className="relative mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black italic tracking-tight">后台更新杯赛卡组</h2>
                <p className="mt-1 text-xs font-bold text-zinc-500">输入玩家ID和卡组码，直接覆盖该玩家已报名的杯赛卡组快照。</p>
              </div>
              <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[10px] font-black tracking-widest text-amber-200">
                ADMIN
              </span>
            </div>

            <div className="relative grid gap-3 lg:grid-cols-[1.2fr_0.7fr_1.2fr]">
              <select
                value={adminDeckUserId}
                onChange={event => setAdminDeckUserId(event.target.value)}
                disabled={registeredPlayerOptions.length === 0}
                className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-amber-400/50 disabled:opacity-50"
                title="已报名玩家"
              >
                {registeredPlayerOptions.length === 0 ? (
                  <option value="">暂无已报名玩家</option>
                ) : registeredPlayerOptions.map(player => (
                  <option key={player.userId} value={player.userId}>
                    #{player.rank} {player.displayName} · {player.userId}
                  </option>
                ))}
              </select>
              <select
                value={adminDeckSlot}
                onChange={event => setAdminDeckSlot(Number(event.target.value))}
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-amber-400/50"
                title="杯赛卡组槽位"
              >
                <option value={0}>第 1 套</option>
                <option value={1}>第 2 套</option>
              </select>
              <input
                value={adminDeckName}
                onChange={event => setAdminDeckName(event.target.value)}
                placeholder="卡组名（可选）"
                className="min-w-0 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-amber-400/50"
              />
            </div>

            <textarea
              value={adminDeckCode}
              onChange={event => setAdminDeckCode(event.target.value)}
              placeholder="粘贴卡组码"
              rows={3}
              className="relative mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50"
            />

            <div className="relative mt-4 flex justify-end">
              <button
                type="button"
                onClick={updateBugCupDeckByCode}
                disabled={adminUpdating || !adminDeckUserId.trim() || !adminDeckCode.trim()}
                className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
              >
                {adminUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                更新杯赛卡组
              </button>
            </div>
          </section>
        )}

        {!current?.paused && !!registration && submittedDeckCount > 0 && (
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 p-5 shadow-2xl backdrop-blur-xl sm:p-6 md:p-8">
            <div className="absolute inset-0 bg-gradient-to-tr from-rose-900/[0.03] to-transparent pointer-events-none" />
            <div className="relative mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black italic tracking-tight">比赛操作</h2>
                <p className="mt-1 text-xs font-bold text-zinc-500">比赛中从提交卡组中选择一套进行对战</p>
              </div>
              <DeckIndexSwitch
                names={registration.deckNames}
                value={Math.min(selectedBattleDeckIndex, submittedDeckCount - 1)}
                onChange={setSelectedBattleDeckIndex}
              />
            </div>

            {current?.phase === 'PRELIM' && (
              <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-black/25 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-black text-white">预赛自由匹配</div>
                  <div className="mt-1 text-xs font-bold text-zinc-500">只会匹配已经报名的玩家，战绩不影响瑞士轮</div>
                </div>
                {searching ? (
                  <button onClick={cancelPrelimMatch} className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-3 text-sm font-black hover:bg-zinc-700">
                    <X className="h-4 w-4" />
                    取消匹配
                  </button>
                ) : (
                  <button onClick={requestPrelimMatch} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black hover:bg-red-500">
                    <Swords className="h-4 w-4" />
                    开始预赛匹配
                  </button>
                )}
              </div>
            )}

            {activeOfficialMatches.length > 0 ? (
              <div className="mt-4 space-y-3">
                {activeOfficialMatches.map(match => {
                  const mineReady = myUid === match.player1Id ? match.player1Ready : match.player2Ready;
                  const opponentName = myUid === match.player1Id ? match.player2Name : match.player1Name;
                  return (
                    <div key={match.id} className="group relative grid gap-4 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-5 backdrop-blur-sm transition-all hover:border-white/10 hover:bg-white/[0.04] sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="relative z-10">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-white sm:text-base">{match.phase === 'SWISS' ? `瑞士轮第 ${match.round} 轮` : match.round === 1 ? '半决赛' : '决赛'}</span>
                          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black tracking-wider text-zinc-300 backdrop-blur-md">{match.resultStatus}</span>
                          {mineReady && <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-[10px] font-black tracking-wider text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]">已准备</span>}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs font-bold text-zinc-400 sm:text-sm">
                          <span className="flex items-center gap-1.5"><UsersRound className="h-3 w-3" /> 对手：<span className="text-white">{opponentName || match.opponentId || '轮空/待定'}</span></span>
                          <span className="text-zinc-600">·</span>
                          <span>{formatDate(match.scheduledFor)}</span>
                        </div>
                      </div>
                      <div className="relative z-10">
                      {match.gameId ? (
                        <button onClick={() => navigate(`/battle/${match.gameId}`)} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black hover:bg-red-500">
                          进入战场
                        </button>
                      ) : mineReady && match.phase === 'SWISS' ? (
                        <button
                          onClick={() => cancelReadyForMatch(match)}
                          disabled={actionMatchId === match.id}
                          className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black hover:bg-white/10 disabled:opacity-50"
                        >
                          {actionMatchId === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                          取消准备
                        </button>
                      ) : (
                        <button
                          onClick={() => readyForMatch(match)}
                          disabled={mineReady || actionMatchId === match.id}
                          className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black hover:bg-red-500 disabled:opacity-50"
                        >
                          {actionMatchId === match.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          {mineReady ? '等待对手' : '准备'}
                        </button>
                      )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              current?.phase !== 'PRELIM' && (
                <div className="mt-4 rounded-xl border border-zinc-800 bg-black/25 px-4 py-8 text-center text-sm font-bold text-zinc-500">
                  当前没有待完成比赛
                </div>
              )
            )}
          </section>
        )}

        {!current?.paused && visibleSpectatableMatches.length > 0 && (
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 p-5 shadow-2xl backdrop-blur-xl sm:p-6 md:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-sky-900/[0.04] to-transparent pointer-events-none" />
            <div className="relative mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black italic tracking-tight">可观战对局</h2>
                <p className="mt-1 text-xs font-bold tracking-widest text-zinc-500">正在进行中的 bug杯 比赛</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
                <Eye className="h-5 w-5 text-sky-300" />
              </div>
            </div>

            <div className="relative space-y-3">
              {visibleSpectatableMatches.map(match => (
                <div
                  key={match.id}
                  className="grid gap-4 rounded-2xl border border-white/5 bg-black/30 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-white sm:text-base">
                        {match.phase === 'SWISS' ? `瑞士轮第 ${match.round} 轮` : match.phase === 'ELIMINATION' ? (match.round === 1 ? '半决赛' : '决赛') : '预赛'}
                      </span>
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black text-emerald-300">对局中</span>
                    </div>
                    <div className="mt-2 text-xs font-bold text-zinc-400 sm:text-sm">
                      <span className="text-white">{match.player1Name || match.player1Id}</span>
                      <span className="px-2 text-zinc-600">vs</span>
                      <span className="text-white">{match.player2Name || match.player2Id || '待定'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => match.gameId && watchMatch(match.gameId)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm font-black text-sky-200 transition-colors hover:bg-sky-500/20"
                  >
                    <Eye className="h-4 w-4" />
                    观战
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {!current?.paused && (current?.phase === 'ELIMINATION' ? (
          <EliminationBracket matches={eliminationMatches} standings={standings} />
        ) : (
          <StandingsTable standings={standings} myUid={myUid} />
        ))}
      </div>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
};

const StandingsTable = ({ standings, myUid }: { standings: Standing[]; myUid?: string }) => (
  <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 p-5 shadow-2xl backdrop-blur-xl sm:p-6 md:p-8">
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/[0.03] to-transparent pointer-events-none" />
    <div className="relative mb-6 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-black italic tracking-tight sm:text-2xl">当前排名</h2>
        <p className="mt-1 text-xs font-bold tracking-widest text-zinc-500">瑞士轮战绩 · 同分按对手胜场排序</p>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
        <UsersRound className="h-5 w-5 text-indigo-400" />
      </div>
    </div>

    {standings.length > 0 ? (
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-black/40">
        {standings.map(item => {
          const isTop3 = item.rank <= 3;
          const rankColor = item.rank === 1 ? 'text-amber-300' : item.rank === 2 ? 'text-zinc-300' : item.rank === 3 ? 'text-amber-700/80' : 'text-zinc-500';
          
          return (
            <div
              key={item.userId}
              className={cn(
                'group relative grid grid-cols-[50px_1fr_60px_60px] items-center gap-2 border-b border-white/5 px-4 py-4 text-sm transition-colors last:border-b-0 hover:bg-white/[0.02] sm:grid-cols-[60px_1fr_86px_86px] sm:gap-3',
                item.userId === myUid ? 'bg-red-500/10' : ''
              )}
            >
              {isTop3 && (
                <div className={cn(
                  'absolute inset-0 opacity-[0.03] pointer-events-none',
                  item.rank === 1 ? 'bg-amber-400' : item.rank === 2 ? 'bg-zinc-300' : 'bg-amber-700'
                )} />
              )}
              <span className={cn('font-black text-lg', rankColor)}>#{item.rank}</span>
              <div className="min-w-0 relative z-10">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={cn('truncate font-black', isTop3 ? 'text-white' : 'text-zinc-300')}>{item.displayName}</span>
                  {item.simulated && (
                    <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-300">模拟</span>
                  )}
                  {item.userId === myUid && (
                    <span className="shrink-0 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-black text-red-300">我</span>
                  )}
                </div>
              </div>
              <span className="relative z-10 text-xs font-black text-emerald-400 sm:text-sm">{item.wins} <span className="text-[10px] text-zinc-500">胜</span></span>
              <span className="relative z-10 text-[10px] font-bold text-zinc-500 sm:text-xs">对手 {item.opponentWins}</span>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="relative rounded-2xl border border-white/5 bg-black/20 px-4 py-12 text-center text-sm font-bold text-zinc-500 backdrop-blur-sm">
        暂无排名
      </div>
    )}
  </section>
);

type BracketDisplayMatch = {
  id: string;
  round: number;
  player1Id?: string | null;
  player2Id?: string | null;
  player1Name?: string | null;
  player2Name?: string | null;
  winnerId?: string | null;
  winnerName?: string | null;
  resultStatus?: string;
};

const EliminationBracket = ({ matches, standings }: { matches: BugCupMatch[]; standings: Standing[] }) => {
  const topFour = [...standings].sort((a, b) => a.rank - b.rank).slice(0, 4);
  const findStandingName = (userId?: string | null) => standings.find(item => item.userId === userId)?.displayName || userId || '待定';
  const participantName = (match: BracketDisplayMatch, side: 1 | 2) => {
    const explicitName = side === 1 ? match.player1Name : match.player2Name;
    const userId = side === 1 ? match.player1Id : match.player2Id;
    return explicitName || findStandingName(userId);
  };
  const winnerName = (match: BracketDisplayMatch) => match.winnerName || findStandingName(match.winnerId);

  const generatedSemis: BracketDisplayMatch[] = topFour.length >= 4 ? [
    { id: 'planned-semi-1', round: 1, player1Id: topFour[0].userId, player2Id: topFour[3].userId, player1Name: topFour[0].displayName, player2Name: topFour[3].displayName, resultStatus: 'PENDING' },
    { id: 'planned-semi-2', round: 1, player1Id: topFour[1].userId, player2Id: topFour[2].userId, player1Name: topFour[1].displayName, player2Name: topFour[2].displayName, resultStatus: 'PENDING' }
  ] : [];
  const semis: BracketDisplayMatch[] = matches.filter(match => match.round === 1).length
    ? matches.filter(match => match.round === 1)
    : generatedSemis;
  const finalMatch = matches.find(match => match.round === 2);
  const finalDisplay: BracketDisplayMatch = finalMatch || {
    id: 'planned-final', round: 2, player1Name: semis[0]?.winnerId ? winnerName(semis[0]) : '半决赛 1 胜者', player2Name: semis[1]?.winnerId ? winnerName(semis[1]) : '半决赛 2 胜者', resultStatus: 'PENDING'
  };

  const MatchCard = ({ match, label }: { match: BracketDisplayMatch; label: string }) => {
    const p1Name = participantName(match, 1);
    const p2Name = participantName(match, 2);
    const p1Won = !!match.winnerId && match.winnerId === match.player1Id;
    const p2Won = !!match.winnerId && match.winnerId === match.player2Id;
    const resolvedWinner = match.winnerId ? winnerName(match) : '';

    return (
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-md shadow-lg">
        {match.winnerId && <div className="absolute inset-0 bg-emerald-500/[0.02] pointer-events-none" />}
        <div className="relative z-10 mb-3 flex items-center justify-between gap-3">
          <span className="text-[10px] font-black tracking-widest text-zinc-400">{label}</span>
          <span className={cn(
            'rounded-full px-2.5 py-1 text-[10px] font-black shadow-sm',
            match.winnerId ? 'bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-white/5 text-zinc-400'
          )}>
            {match.winnerId ? '已决出' : '待进行'}
          </span>
        </div>

        <div className="relative z-10 space-y-2">
          <div className={cn('flex items-center justify-between rounded-xl border px-4 py-3 transition-colors', p1Won ? 'border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-white/5 bg-black/40')}>
            <span className={cn('min-w-0 truncate text-sm font-black', p1Won ? 'text-white' : 'text-zinc-300')}>{p1Name}</span>
            {p1Won && <Trophy className="h-4 w-4 shrink-0 text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" />}
          </div>
          <div className={cn('flex items-center justify-between rounded-xl border px-4 py-3 transition-colors', p2Won ? 'border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'border-white/5 bg-black/40')}>
            <span className={cn('min-w-0 truncate text-sm font-black', p2Won ? 'text-white' : 'text-zinc-300')}>{p2Name}</span>
            {p2Won && <Trophy className="h-4 w-4 shrink-0 text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" />}
          </div>
        </div>

        <div className="relative z-10 mt-3 rounded-xl bg-black/30 px-3 py-2 text-xs font-bold text-zinc-400">
          获胜对手：<span className={match.winnerId ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.3)]' : 'text-zinc-500'}>{resolvedWinner || '待定'}</span>
        </div>
      </div>
    );
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 p-5 shadow-2xl backdrop-blur-xl sm:p-6 md:p-8">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-900/[0.03] to-transparent pointer-events-none" />
      <div className="relative mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black italic tracking-tight sm:text-2xl">单淘对战图</h2>
          <p className="mt-1 text-xs font-bold tracking-widest text-zinc-500">半决赛 1 vs 4、2 vs 3，胜者进入决赛</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
          <Trophy className="h-5 w-5 text-amber-400" />
        </div>
      </div>

      {semis.length > 0 ? (
        <div className="relative grid gap-6 lg:grid-cols-[1fr_120px_1fr] lg:items-center">
          <div className="space-y-6 relative z-10">
            <MatchCard match={semis[0]} label="半决赛 1" />
            {semis[1] && <MatchCard match={semis[1]} label="半决赛 2" />}
          </div>
          
          <div className="hidden lg:flex flex-col items-center justify-center relative z-0 h-full">
            <div className="h-full w-px bg-gradient-to-b from-transparent via-white/10 to-transparent absolute left-1/2 -translate-x-1/2" />
            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent relative z-10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 backdrop-blur-md">
              <Swords className="h-4 w-4 text-zinc-500" />
            </div>
          </div>
          
          <div className="relative z-10 lg:pl-4">
            <MatchCard match={finalDisplay} label="决赛" />
          </div>
        </div>
      ) : (
        <div className="relative rounded-2xl border border-white/5 bg-black/20 px-4 py-12 text-center text-sm font-bold text-zinc-500 backdrop-blur-sm">
          等待瑞士轮前四生成淘汰赛对阵
        </div>
      )}
    </section>
  );
};

const RulesModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-white shadow-2xl"
          onClick={event => event.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-red-300">
                <BookOpen className="h-4 w-4" />
                规则
              </div>
              <h2 className="mt-1 text-2xl font-black italic tracking-tight">bug杯杯赛</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 p-2 transition-colors hover:bg-white/10"
              aria-label="关闭规则"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 text-sm font-bold leading-6 text-zinc-300">
            <div className="rounded-xl border border-zinc-800 bg-black/25 p-4">
              <div className="text-sm font-black text-white">赛程</div>
              <p className="mt-2">第一届从北京时间 2026-05-18 00:00 开始，持续两周。预赛 1 周，瑞士轮 BO1 持续 5 天，最后 2 天进行单轮淘汰赛。</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-black/25 p-4">
              <div className="text-sm font-black text-white">卡组</div>
              <p className="mt-2">每名玩家报名提交 1 到 2 套合法卡组，并自动发布到套牌广场 tag：第1届bug杯杯赛。预赛阶段可以自由改选或同步卡组内容；进入瑞士轮和单淘后锁定最后提交快照。</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-black/25 p-4">
              <div className="text-sm font-black text-white">预赛</div>
              <p className="mt-2">预赛阶段可以和已报名玩家自由匹配，预赛战绩只作热身，不参与瑞士轮排名和四强判定。</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-black/25 p-4">
              <div className="text-sm font-black text-white">瑞士轮</div>
              <p className="mt-2">每天北京时间 0 点由服务器确认当轮对手，共 5 轮。双方准备后开始对局；双方当日都未准备则双败，只有一方准备则准备方获胜，双方都准备则以比赛结果为准。</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-black/25 p-4">
              <div className="text-sm font-black text-white">单淘</div>
              <p className="mt-2">瑞士轮按胜场和对手胜场决出前 4。半决赛为第 1 名对第 4 名、第 2 名对第 3 名；第二天半决赛胜者进行决赛，决出冠亚军。</p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const DeckPickerModal = ({
  slot,
  decks,
  selectedDeckIds,
  selectedDeckId,
  cardsLoading,
  getCardByReference,
  onSelect,
  onClearSecond,
  onClose
}: {
  slot: number | null;
  decks: Deck[];
  selectedDeckIds: string[];
  selectedDeckId?: string;
  cardsLoading: boolean;
  getCardByReference: Parameters<typeof validateDeckForBattle>[1];
  onSelect: (deckId: string) => void;
  onClearSecond: () => void;
  onClose: () => void;
}) => (
  <AnimatePresence>
    {slot !== null && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-white shadow-2xl"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
            <div>
              <div className="text-[10px] font-black tracking-widest text-red-300">报名卡组</div>
              <h2 className="mt-1 text-2xl font-black italic tracking-tight">选择第 {slot + 1} 套卡组</h2>
              <p className="mt-1 text-xs font-bold text-zinc-500">会提交当前卡组快照，并同步发布到套牌广场。</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 p-2 transition-colors hover:bg-white/10"
              aria-label="关闭卡组选择"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-3">
            {slot === 1 && (
              <button
                type="button"
                onClick={onClearSecond}
                className="mb-2 flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-black/25 px-4 py-3 text-left text-sm font-bold text-zinc-300 transition-colors hover:bg-white/5"
              >
                <span>
                  <span className="block text-white">不提交第二套</span>
                  <span className="text-[10px] text-zinc-500">只保留第 1 套报名卡组</span>
                </span>
                {!selectedDeckId && <Check className="h-4 w-4 text-red-400" />}
              </button>
            )}

            {decks.map(deck => {
              const validation = validateDeckForBattle(deck, cardsLoading ? undefined : getCardByReference);
              const alreadySelectedInOtherSlot = slot !== null && selectedDeckIds.some((id, index) => index !== slot && id === deck.id);
              const disabled = !validation.valid || alreadySelectedInOtherSlot;
              return (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => !disabled && onSelect(deck.id)}
                  disabled={disabled}
                  className={cn(
                    'mb-2 flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors',
                    selectedDeckId === deck.id
                      ? 'border-red-500/50 bg-red-500/10'
                      : 'border-zinc-800 bg-black/25 hover:bg-white/5',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-white">{deck.name}</span>
                    <span className={cn('text-[10px] font-bold', validation.valid ? 'text-zinc-500' : 'text-red-400')}>
                      {alreadySelectedInOtherSlot ? '已选择为另一套报名卡组' : validation.valid ? `${deck.cards.length} 张` : validation.error}
                    </span>
                  </span>
                  {selectedDeckId === deck.id && <Check className="h-4 w-4 shrink-0 text-red-400" />}
                </button>
              );
            })}

            {decks.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-black/25 px-4 py-8 text-center text-sm font-bold text-zinc-500">
                还没有可选择的卡组
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const PhaseProgress = ({ current }: { current: BugCupCurrent }) => {
  const steps = [
    { key: 'PAUSED', label: '暂停', value: current.pauseMessage || '自由约战', active: current.phase === 'PAUSED' },
    { key: 'PRELIM', label: '预赛', value: `至 ${new Date(current.schedule.prelimEndAt).toLocaleDateString('zh-CN')}`, active: current.phase === 'PRELIM' },
    { key: 'SWISS', label: '瑞士轮', value: current.phase === 'SWISS' ? `第 ${current.swissRound} 轮` : '5 轮 BO1', active: current.phase === 'SWISS' },
    { key: 'SEMI', label: '半决赛', value: new Date(current.schedule.semiFinalAt).toLocaleDateString('zh-CN'), active: current.phase === 'ELIMINATION' && current.eliminationRound === 1 },
    { key: 'FINAL', label: '决赛', value: new Date(current.schedule.finalAt).toLocaleDateString('zh-CN'), active: current.phase === 'ELIMINATION' && current.eliminationRound === 2 }
  ];

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/40 p-5 shadow-2xl backdrop-blur-xl sm:p-6 md:p-8">
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
      <div className="relative mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black italic tracking-tight sm:text-2xl">杯赛进程</h2>
          <p className="mt-1 text-[10px] font-bold tracking-widest text-zinc-500 sm:text-xs">当前阶段会高亮显示</p>
        </div>
        <span className="rounded-full border border-red-500/30 bg-red-500/20 px-4 py-1.5 text-xs font-black tracking-widest text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.2)] backdrop-blur-md">
          {phaseLabel[current.phase]}
        </span>
      </div>
      <div className="relative grid gap-4 md:grid-cols-5">
        {/* Connecting lines for desktop */}
        <div className="hidden absolute left-[12.5%] right-[12.5%] top-6 h-0.5 bg-white/5 md:block">
          <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-500 to-transparent opacity-50" style={{ width: `${(steps.findIndex(s => s.active) / (steps.length - 1)) * 100}%` }} />
        </div>
        
        {steps.map((step, index) => (
          <div
            key={step.key}
            className={cn(
              'group relative overflow-hidden rounded-2xl border px-5 py-4 transition-all duration-300',
              step.active 
                ? 'border-red-500/50 bg-red-500/10 shadow-[0_0_25px_rgba(239,68,68,0.15)] scale-[1.02]' 
                : 'border-white/5 bg-black/40 hover:bg-white/[0.02]'
            )}
          >
            {step.active && (
              <motion.div
                layoutId="active-phase-bg"
                className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent pointer-events-none"
                initial={false}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className={cn('text-[10px] font-black tracking-widest transition-colors', step.active ? 'text-red-400' : 'text-zinc-500')}>
                STEP {index + 1}
              </div>
              {step.active && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(248,113,113,0.8)]"></span>
                </span>
              )}
            </div>
            <div className={cn('relative z-10 mt-3 text-lg font-black transition-colors', step.active ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'text-zinc-300')}>{step.label}</div>
            <div className="relative z-10 mt-1 text-xs font-bold text-zinc-500">{step.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

const DeckIndexSwitch = ({ names, value, onChange }: { names: string[]; value: number; onChange: (value: number) => void }) => (
  <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
    {names.map((name, index) => (
      <button
        key={`${name}-${index}`}
        type="button"
        onClick={() => onChange(index)}
        className={cn(
          'min-w-0 rounded-lg px-3 py-2 text-xs font-black transition-colors',
          value === index ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'
        )}
      >
        <span className="block truncate">第 {index + 1} 套</span>
      </button>
    ))}
  </div>
);
