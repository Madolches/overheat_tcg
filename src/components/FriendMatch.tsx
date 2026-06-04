import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, LogIn, Loader2, Copy, Check, Eye, Swords, ChevronDown, UserRound, UsersRound, Clock3, RefreshCw, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { validateDeckForBattle } from '../lib/deckValidation';
import { getAuthToken, getAuthUser, socket } from '../socket';
import { Deck } from '../types/game';
import { useCardCatalog } from '../hooks/useCardCatalog';

type LobbySeat = 'player1' | 'player2' | 'spectator';

interface FriendLobby {
  gameId: string;
  roomCode: string;
  isPublic?: boolean;
  turnTimerLimit?: number;
  playerIds: [string | null, string | null];
  spectatorIds: string[];
  participantIds: string[];
  hostUid?: string;
  participantNames?: Record<string, string>;
  friendDeckSelections: Record<string, string>;
  friendReady: Record<string, boolean>;
  status: string;
  started: boolean;
  mySeat: LobbySeat;
}

interface FriendLobbySummary {
  gameId: string;
  roomCode: string;
  isPublic?: boolean;
  turnTimerLimit?: number;
  playerIds: [string | null, string | null];
  spectatorCount: number;
  hostUid?: string;
  participantNames?: Record<string, string>;
  status: string;
  started: boolean;
  hasOpenSeat: boolean;
  playerCount: number;
  mySeat: LobbySeat | null;
}

interface OnlinePlayer {
  uid: string;
  username?: string;
  displayName: string;
}

type InviteStatus = {
  status: 'sending' | 'sent' | 'accepted' | 'declined' | 'expired' | 'error';
  message?: string;
};

export const FriendMatch: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'select' | 'join' | 'lobby'>('select');
  const [myDecks, setMyDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [turnTime, setTurnTime] = useState(300);
  const [isPublicRoom, setIsPublicRoom] = useState(false);
  const [lobby, setLobby] = useState<FriendLobby | null>(null);
  const [publicRooms, setPublicRooms] = useState<FriendLobbySummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomActionId, setRoomActionId] = useState<string | null>(null);
  const [deckDropdownOpen, setDeckDropdownOpen] = useState(false);
  const [timerPopoverOpen, setTimerPopoverOpen] = useState(false);
  const [savingTimer, setSavingTimer] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [inviteStatuses, setInviteStatuses] = useState<Record<string, InviteStatus>>({});
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
  const token = getAuthToken();
  const authUser = useMemo(() => getAuthUser(), []);
  const {
    getCardByReference,
    loading: cardsLoading
  } = useCardCatalog({ includeEffects: false });
  const myUid = authUser?.uid?.toString();

  const mySeat = lobby?.mySeat;
  const selectedDeckId = myUid && lobby?.friendDeckSelections ? lobby.friendDeckSelections[myUid] : undefined;
  const selectedDeck = myDecks.find(deck => deck.id === selectedDeckId) || null;
  const selectedDeckValidation = validateDeckForBattle(selectedDeck, cardsLoading ? undefined : getCardByReference);
  const isPlayerSeat = mySeat === 'player1' || mySeat === 'player2';
  const isReady = !!(myUid && lobby?.friendReady?.[myUid]);
  const isHost = !!(myUid && lobby?.hostUid?.toString() === myUid);
  const invitedRoomCode = (location.state as { invitedRoomCode?: string } | null)?.invitedRoomCode;
  const inviteablePlayers = useMemo(() => {
    if (!lobby || !myUid) return [];
    const roomUserIds = new Set([
      ...(lobby.participantIds || []),
      ...(lobby.playerIds || []).filter((uid): uid is string => !!uid),
      ...(lobby.spectatorIds || [])
    ].map(uid => uid.toString()));

    return onlinePlayers.filter(player =>
      player.uid !== myUid &&
      !roomUserIds.has(player.uid)
    );
  }, [lobby, myUid, onlinePlayers]);
  const displayNameFor = (uid?: string | null) => {
    if (!uid) return '空位';
    return lobby?.participantNames?.[uid] || uid;
  };

  const clearPoll = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  const clearRoomPoll = () => {
    if (roomPollRef.current) {
      clearTimeout(roomPollRef.current);
      roomPollRef.current = null;
    }
  };

  const enterBattle = (targetLobby: FriendLobby) => {
    const seat = targetLobby.mySeat === 'player1' || targetLobby.mySeat === 'player2' ? 'player' : 'spectator';
    const deckId = myUid ? targetLobby.friendDeckSelections?.[myUid] : undefined;
    navigate(`/battle/${targetLobby.gameId}`, {
      state: seat === 'player' ? { seat, deckId } : { seat }
    });
  };

  const applyLobby = (nextLobby: FriendLobby) => {
    setLobby(nextLobby);
    setRoomCode(nextLobby.roomCode || '');
    setIsPublicRoom(!!nextLobby.isPublic);
    setMode('lobby');
    if (nextLobby.started) enterBattle(nextLobby);
  };

  useEffect(() => {
    const loadDecks = async () => {
      if (!getAuthUser()) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${BACKEND_URL}/api/user/decks`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setMyDecks(data.decks || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadDecks();
    void import('./BattleField');
    return () => {
      clearPoll();
      clearRoomPoll();
    };
  }, [BACKEND_URL, token]);

  useEffect(() => {
    if (!invitedRoomCode || !token) return;
    const joinInvitedRoom = async () => {
      setJoining(true);
      setError('');
      try {
        await requestLobby(`${BACKEND_URL}/api/games/friend/join`, { roomCode: invitedRoomCode });
        navigate('/friend-match', { replace: true, state: {} });
      } catch (e: any) {
        setMode('join');
        setRoomCode(invitedRoomCode);
        setError(e.message || '加入邀请房间失败');
      } finally {
        setJoining(false);
      }
    };
    joinInvitedRoom();
  }, [invitedRoomCode, token, BACKEND_URL]);

  useEffect(() => {
    const handleOnlinePlayers = (payload: { players?: OnlinePlayer[] }) => {
      setOnlinePlayers(payload.players || []);
    };
    const handleInviteSent = (payload: { targetUid?: string; targetName?: string; expiresAt?: number }) => {
      if (!payload.targetUid) return;
      setInviteStatuses(current => ({
        ...current,
        [payload.targetUid!]: {
          status: 'sent',
          message: `已邀请 ${payload.targetName || '玩家'}`
        }
      }));
    };
    const handleInviteAccepted = (payload: { targetUid?: string; targetName?: string }) => {
      if (!payload.targetUid) return;
      setInviteStatuses(current => ({
        ...current,
        [payload.targetUid!]: {
          status: 'accepted',
          message: `${payload.targetName || '玩家'} 已接受邀请`
        }
      }));
    };
    const handleInviteDeclined = (payload: { targetUid?: string; targetName?: string; reason?: string }) => {
      if (!payload.targetUid) return;
      setInviteStatuses(current => ({
        ...current,
        [payload.targetUid!]: {
          status: 'declined',
          message: payload.reason || `${payload.targetName || '玩家'} 拒绝了邀请`
        }
      }));
    };
    const handleInviteExpired = (payload: { targetUid?: string; targetName?: string }) => {
      if (!payload.targetUid) return;
      setInviteStatuses(current => ({
        ...current,
        [payload.targetUid!]: {
          status: 'expired',
          message: `${payload.targetName || '玩家'} 的邀请已超时`
        }
      }));
    };
    const handleInviteError = (payload: { targetUid?: string; message?: string }) => {
      if (payload.targetUid) {
        setInviteStatuses(current => ({
          ...current,
          [payload.targetUid!]: {
            status: 'error',
            message: payload.message || '邀请失败'
          }
        }));
      } else if (payload.message) {
        setError(payload.message);
      }
    };

    socket.on('onlinePlayers', handleOnlinePlayers);
    socket.on('friendInvite:sent', handleInviteSent);
    socket.on('friendInvite:accepted', handleInviteAccepted);
    socket.on('friendInvite:declined', handleInviteDeclined);
    socket.on('friendInvite:expired', handleInviteExpired);
    socket.on('friendInvite:error', handleInviteError);
    socket.emit('requestOnlinePlayers');

    return () => {
      socket.off('onlinePlayers', handleOnlinePlayers);
      socket.off('friendInvite:sent', handleInviteSent);
      socket.off('friendInvite:accepted', handleInviteAccepted);
      socket.off('friendInvite:declined', handleInviteDeclined);
      socket.off('friendInvite:expired', handleInviteExpired);
      socket.off('friendInvite:error', handleInviteError);
    };
  }, []);

  const loadPublicRooms = async (showSpinner = false) => {
    if (!token) return;
    if (showSpinner) setRoomsLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/games/friend/lobby`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        setPublicRooms(data.rooms || []);
      }
    } catch (e) {
      console.error('[FriendMatch] Public room list error:', e);
    } finally {
      if (showSpinner) setRoomsLoading(false);
    }
  };

  useEffect(() => {
    clearRoomPoll();
    if (mode !== 'select') return;

    const pollRooms = async () => {
      await loadPublicRooms(false);
      roomPollRef.current = setTimeout(pollRooms, 2500);
    };

    void loadPublicRooms(true);
    roomPollRef.current = setTimeout(pollRooms, 2500);
    return () => clearRoomPoll();
  }, [mode, BACKEND_URL, token]);

  useEffect(() => {
    clearPoll();
    if (mode !== 'lobby' || !lobby?.gameId) return;

    const poll = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/games/friend/${lobby.gameId}/status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && !data.error) {
          applyLobby(data);
        }
      } catch (e) {
        console.error('[FriendMatch] Lobby poll error:', e);
      } finally {
        pollRef.current = setTimeout(poll, 1000);
      }
    };

    pollRef.current = setTimeout(poll, 800);
    return () => clearPoll();
  }, [mode, lobby?.gameId, BACKEND_URL, token]);

  const requestLobby = async (url: string, body?: any) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: body ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || '操作失败');
    applyLobby(data);
    return data as FriendLobby;
  };

  const handleCreateRoom = async () => {
    setCreating(true);
    setError('');
    try {
      await requestLobby(`${BACKEND_URL}/api/games/friend`);
    } catch (e: any) {
      setError(e.message || '创建房间失败');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    const code = roomCode.trim();
    if (!code || code.length < 6) {
      setError('请输入有效的房间码');
      return;
    }

    setJoining(true);
    setError('');
    try {
      await requestLobby(`${BACKEND_URL}/api/games/friend/join`, { roomCode: code });
    } catch (e: any) {
      setError(e.message || '加入房间失败');
    } finally {
      setJoining(false);
    }
  };

  const joinPublicRoom = async (room: FriendLobbySummary, asSpectator = false) => {
    setRoomActionId(room.gameId);
    setError('');
    try {
      const nextLobby = await requestLobby(`${BACKEND_URL}/api/games/friend/join`, { roomCode: room.roomCode });
      if (asSpectator && nextLobby.mySeat !== 'spectator' && !nextLobby.started) {
        await requestLobby(`${BACKEND_URL}/api/games/friend/${nextLobby.gameId}/seat`, { seat: 'spectator' });
      }
    } catch (e: any) {
      setError(e.message || '加入房间失败');
      await loadPublicRooms(false);
    } finally {
      setRoomActionId(null);
    }
  };

  const switchSeat = async (seat: LobbySeat) => {
    if (!lobby || lobby.mySeat === seat) return;
    setError('');
    try {
      await requestLobby(`${BACKEND_URL}/api/games/friend/${lobby.gameId}/seat`, { seat });
      setDeckDropdownOpen(false);
    } catch (e: any) {
      setError(e.message || '切换席位失败');
    }
  };

  const chooseDeck = async (deckId: string) => {
    if (!lobby) return;
    setError('');
    try {
      await requestLobby(`${BACKEND_URL}/api/games/friend/${lobby.gameId}/deck`, { deckId });
      setDeckDropdownOpen(false);
    } catch (e: any) {
      setError(e.message || '选择卡组失败');
    }
  };

  const toggleReady = async () => {
    if (!lobby || !isPlayerSeat) return;
    if (!selectedDeckValidation.valid) {
      setError(selectedDeckValidation.error || '请选择合法的卡组');
      return;
    }

    setError('');
    try {
      await requestLobby(`${BACKEND_URL}/api/games/friend/${lobby.gameId}/ready`, { ready: !isReady });
    } catch (e: any) {
      setError(e.message || '准备失败');
    }
  };

  const saveTurnTimer = async () => {
    if (!lobby || !isHost) return;
    setSavingTimer(true);
    setError('');
    try {
      await requestLobby(`${BACKEND_URL}/api/games/friend/${lobby.gameId}/timer`, { turnTimerLimit: turnTime });
      setTimerPopoverOpen(false);
    } catch (e: any) {
      setError(e.message || '修改时间失败');
    } finally {
      setSavingTimer(false);
    }
  };

  const saveRoomVisibility = async (nextIsPublic: boolean) => {
    if (!lobby || !isHost || lobby.started) return;
    setError('');
    setIsPublicRoom(nextIsPublic);
    try {
      await requestLobby(`${BACKEND_URL}/api/games/friend/${lobby.gameId}/visibility`, { isPublic: nextIsPublic });
    } catch (e: any) {
      setIsPublicRoom(!!lobby.isPublic);
      setError(e.message || '修改公开状态失败');
    }
  };

  const sendInvite = (target: OnlinePlayer) => {
    if (!lobby || !isHost || lobby.started) return;
    setInviteStatuses(current => ({
      ...current,
      [target.uid]: {
        status: 'sending',
        message: '发送中...'
      }
    }));
    socket.emit('friendInvite:send', {
      gameId: lobby.gameId,
      targetUid: target.uid
    });
  };

  const renderInvitePanel = () => {
    if (!lobby || !isHost || lobby.started) return null;

    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black italic tracking-tighter md:text-xl">邀请在线玩家</h2>
            <p className="mt-1 text-[10px] font-bold tracking-widest text-zinc-500">仅房主可邀请，接受后优先加入玩家2</p>
          </div>
          <button
            type="button"
            onClick={() => socket.emit('requestOnlinePlayers')}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>

        {inviteablePlayers.length === 0 ? (
          <div className="rounded-xl bg-black/30 px-4 py-6 text-center text-sm font-bold text-zinc-500">
            暂无可邀请的在线玩家
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {inviteablePlayers.map(player => {
              const inviteStatus = inviteStatuses[player.uid];
              const busy = inviteStatus?.status === 'sending';
              const accepted = inviteStatus?.status === 'accepted';
              const statusTone = inviteStatus?.status === 'accepted'
                ? 'text-emerald-300'
                : inviteStatus?.status === 'sent'
                  ? 'text-amber-300'
                  : inviteStatus?.status === 'declined' || inviteStatus?.status === 'expired' || inviteStatus?.status === 'error'
                    ? 'text-red-300'
                    : 'text-zinc-500';

              return (
                <div key={player.uid} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-black text-zinc-100">
                    {(player.displayName || player.username || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-white">{player.displayName || player.username || player.uid}</div>
                    <div className={cn('mt-1 truncate text-[10px] font-bold', statusTone)}>
                      {inviteStatus?.message || '在线'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => sendInvite(player)}
                    disabled={busy || accepted}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : accepted ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                    {accepted ? '已加入' : busy ? '发送中' : '邀请'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const copyCode = () => {
    if (!lobby?.roomCode && !roomCode) return;
    navigator.clipboard.writeText(lobby?.roomCode || roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBack = () => {
    if (mode === 'select') {
      navigate('/');
      return;
    }
    if (mode === 'lobby') {
      clearPoll();
      if (lobby?.gameId) {
        fetch(`${BACKEND_URL}/api/games/friend/${lobby.gameId}/leave`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        }).catch(e => console.error('[FriendMatch] Leave lobby error:', e));
      }
      setLobby(null);
    }
    void loadPublicRooms(false);
    setMode('select');
    setError('');
    setTimerPopoverOpen(false);
  };

  const renderPublicRooms = () => (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black italic tracking-tighter md:text-xl">对战大厅</h2>
          <p className="mt-1 text-[10px] font-bold tracking-widest text-zinc-500">所有登录玩家可见的好友房间</p>
        </div>
        <button
          type="button"
          onClick={() => loadPublicRooms(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-white/10"
        >
          <RefreshCw className={cn('h-4 w-4', roomsLoading && 'animate-spin')} />
          刷新
        </button>
      </div>

      {publicRooms.length === 0 ? (
        <div className="rounded-xl bg-black/30 px-4 py-8 text-center text-sm font-bold text-zinc-500">
          暂无可加入或观战的房间
        </div>
      ) : (
        <div className="space-y-3">
          {publicRooms.map(room => {
            const busy = roomActionId === room.gameId;
            const hostName = room.hostUid ? (room.participantNames?.[room.hostUid] || room.hostUid) : '未知房主';
            const canJoinSeat = !room.started && room.hasOpenSeat;
            const statusText = room.started ? '对局中' : canJoinSeat ? '等待玩家' : '观战开放';
            return (
              <div key={room.gameId} className="grid gap-3 rounded-xl border border-zinc-800 bg-black/25 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xl font-black tracking-[0.18em] text-amber-400">{room.roomCode}</span>
                    <span className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-black',
                      room.started ? 'bg-sky-500/20 text-sky-300' : canJoinSeat ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-300'
                    )}>
                      {statusText}
                    </span>
                    {room.mySeat && <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-[10px] font-black text-red-300">已在房间</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-zinc-500">
                    <span>房主：{hostName}</span>
                    <span>玩家：{room.playerCount}/2</span>
                    <span>观战：{room.spectatorCount}</span>
                    <span>{room.turnTimerLimit || 300} 秒</span>
                  </div>
                </div>
                <div className="flex gap-2 md:justify-end">
                  {canJoinSeat && (
                    <button
                      type="button"
                      onClick={() => joinPublicRoom(room, false)}
                      disabled={busy}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-red-500 disabled:opacity-50 md:flex-none"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                      加入
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => joinPublicRoom(room, true)}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-black text-sky-100 transition-colors hover:bg-sky-500/20 disabled:opacity-50 md:flex-none"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    观战
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderDeckDropdown = () => {
    if (!isPlayerSeat) return null;

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setDeckDropdownOpen(open => !open)}
          className={cn(
            'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all',
            selectedDeckValidation.valid ? 'border-zinc-700 bg-zinc-950/70' : 'border-red-500/40 bg-red-950/20'
          )}
        >
          <div>
            <div className="text-sm font-black text-white">{selectedDeck?.name || '请选择卡组'}</div>
            <div className="mt-1 text-[10px] font-bold tracking-widest text-zinc-500">
              {selectedDeck ? `${selectedDeck.cards.length} 张卡牌` : '对战玩家需要准备卡组'}
            </div>
          </div>
          <ChevronDown className={cn('h-5 w-5 text-zinc-500 transition-transform', deckDropdownOpen && 'rotate-180')} />
        </button>

        <AnimatePresence>
          {deckDropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute left-0 right-0 top-full z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl"
            >
              {myDecks.map(deck => {
                const validation = validateDeckForBattle(deck, cardsLoading ? undefined : getCardByReference);
                const active = selectedDeckId === deck.id;
                return (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => chooseDeck(deck.id)}
                    className={cn(
                      'mb-1 flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors',
                      active ? 'bg-red-600/20 text-white' : 'hover:bg-white/5',
                      !validation.valid && 'opacity-60'
                    )}
                  >
                    <div>
                      <div className="text-sm font-bold">{deck.name}</div>
                      <div className={cn('mt-1 text-[10px] font-bold', validation.valid ? 'text-zinc-500' : 'text-red-400')}>
                        {validation.valid ? `${deck.cards.length} 张卡牌` : validation.error}
                      </div>
                    </div>
                    {active && <Check className="h-4 w-4 text-red-400" />}
                  </button>
                );
              })}
              {myDecks.length === 0 && (
                <div className="p-6 text-center text-sm text-zinc-500">
                  还没有卡组
                  <button onClick={() => navigate('/deck-builder')} className="ml-2 text-red-500 hover:underline">去创建</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderSeatCard = (seat: 'player1' | 'player2', title: string, uid: string | null) => {
    const occupied = !!uid;
    const mine = uid === myUid;
    const deckId = uid ? lobby?.friendDeckSelections?.[uid] : undefined;
    const deck = myDecks.find(d => d.id === deckId);
    const ready = !!(uid && lobby?.friendReady?.[uid]);
    const canSwitch = !!lobby && !lobby.started && (!occupied || mine);

    return (
      <div className={cn('rounded-2xl border p-5', mine ? 'border-red-500/70 bg-red-950/20' : 'border-zinc-800 bg-zinc-900/35')}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-red-500" />
            <h3 className="font-black italic">{title}</h3>
          </div>
          <span className={cn('rounded-full px-3 py-1 text-[10px] font-black', ready ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400')}>
            {ready ? '已准备' : '未准备'}
          </span>
        </div>

        <div className="mb-4 rounded-xl bg-black/30 px-4 py-3">
          <div className="text-[10px] font-black tracking-widest text-zinc-500">玩家</div>
          <div className="mt-1 break-all text-sm font-bold text-white">{displayNameFor(uid)}</div>
          {uid && uid === lobby?.hostUid && <div className="mt-2 text-[10px] font-black text-amber-400">房主</div>}
        </div>

        {mine ? (
          <div className="space-y-3">
            {renderDeckDropdown()}
            {selectedDeckId && !selectedDeckValidation.valid && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/25 p-3 text-xs text-red-300">
                {selectedDeckValidation.error}
              </div>
            )}
            <button
              onClick={toggleReady}
              disabled={!selectedDeckValidation.valid}
              className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              {isReady ? '取消准备' : '准备'}
            </button>
          </div>
        ) : (
          <div className="text-xs font-bold tracking-widest text-zinc-500">
            {deck ? `已选择：${deck.name}` : occupied ? '等待选择卡组' : '等待玩家加入'}
          </div>
        )}

        {canSwitch && !mine && (
          <button
            onClick={() => switchSeat(seat)}
            className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-white/10"
          >
            切换到{title}
          </button>
        )}
      </div>
    );
  };

  if (loading || cardsLoading) {
    return (
      <div className="pt-24 flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="pt-20 px-8 min-h-screen bg-black text-white pb-20">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-3 px-2 md:mb-10 md:gap-4 md:px-0">
          <button onClick={handleBack} className="shrink-0 rounded-full bg-zinc-900 p-2 transition-colors hover:bg-zinc-800">
            <ArrowLeft className="h-5 w-5 md:h-6 md:w-6" />
          </button>
          <div>
            <h1 className="text-xl font-black italic uppercase tracking-tighter md:text-3xl">好友约战</h1>
            <p className="text-[10px] font-bold leading-none tracking-widest text-zinc-500 md:text-sm">对局等待中</p>
          </div>
        </div>

        {mode === 'select' && (
          <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCreateRoom}
              className="group cursor-pointer rounded-2xl border border-zinc-800 bg-gradient-to-br from-red-900/10 to-zinc-900 p-8 text-center transition-all hover:border-red-600/50"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-600/10 transition-colors group-hover:bg-red-600">
                {creating ? <Loader2 className="h-8 w-8 animate-spin" /> : <Plus className="h-8 w-8" />}
              </div>
              <h3 className="mb-1 text-xl font-black italic uppercase tracking-tighter">创建房间</h3>
              <p className="text-xs font-bold leading-none tracking-widest text-zinc-500">直接进入等待页</p>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMode('join')}
              className="group cursor-pointer rounded-2xl border border-zinc-800 bg-gradient-to-br from-blue-900/10 to-zinc-900 p-8 text-center transition-all hover:border-blue-600/50"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600/10 transition-colors group-hover:bg-blue-600">
                <LogIn className="h-8 w-8" />
              </div>
              <h3 className="mb-1 text-xl font-black italic uppercase tracking-tighter">加入房间</h3>
              <p className="text-xs font-bold leading-none tracking-widest text-zinc-500">输入房间码加入等待页或观战</p>
            </motion.div>
          </div>
          {error && <div className="rounded-xl border border-red-500/30 bg-red-900/30 p-3 text-sm text-red-400">{error}</div>}
          {renderPublicRooms()}
          </div>
        )}

        {mode === 'join' && (
          <div className="mx-auto max-w-3xl space-y-6">
            <input
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-4 text-center font-mono text-2xl font-bold tracking-[0.3em] transition-all focus:border-red-600 focus:outline-none"
              placeholder="输入房间码"
              maxLength={8}
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.replace(/\D/g, ''))}
            />
            {error && <div className="rounded-xl border border-red-500/30 bg-red-900/30 p-3 text-sm text-red-400">{error}</div>}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-center text-xs font-bold tracking-widest text-zinc-500">
              也可以直接在对战大厅点击公开房间的加入按钮
            </div>
            <button
              onClick={handleJoinRoom}
              disabled={joining || roomCode.length < 6}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 px-10 py-3.5 text-lg font-black italic tracking-tighter shadow-[0_0_30px_rgba(37,99,235,0.3)] transition-all disabled:opacity-50"
            >
              {joining ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
              加入房间
            </button>
          </div>
        )}

        {mode === 'lobby' && lobby && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
              <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                <div>
                  <div className="text-[10px] font-black tracking-widest text-zinc-500">房间码</div>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="font-mono text-3xl font-black tracking-[0.25em] text-amber-400">{lobby.roomCode}</span>
                    <button onClick={copyCode} className="rounded-lg p-2 transition-colors hover:bg-zinc-800">
                      {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5 text-zinc-500" />}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => saveRoomVisibility(!lobby.isPublic)}
                  disabled={!isHost || lobby.started}
                  className={cn(
                    'rounded-xl bg-black/30 px-4 py-3 text-left transition-colors disabled:cursor-default',
                    isHost && !lobby.started && 'hover:bg-white/10'
                  )}
                >
                  <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-zinc-500">
                    <span className={cn(
                      'flex h-4 w-4 items-center justify-center rounded border',
                      lobby.isPublic ? 'border-red-500 bg-red-600 text-white' : 'border-zinc-600 bg-zinc-900 text-transparent'
                    )}>
                      <Check className="h-3 w-3" />
                    </span>
                    公开房间
                  </div>
                  <div className="mt-1 text-sm font-bold text-white">{lobby.isPublic ? '对战大厅可见' : '仅房间码加入'}</div>
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isHost || lobby.started) return;
                      setTurnTime(lobby.turnTimerLimit || 300);
                      setTimerPopoverOpen(open => !open);
                    }}
                    className={cn(
                      'w-full rounded-xl bg-black/30 px-4 py-3 text-left transition-colors',
                      isHost && !lobby.started && 'hover:bg-white/10'
                    )}
                  >
                    <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-zinc-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      对局时间
                    </div>
                    <div className="mt-1 text-xl font-black text-white">{lobby.turnTimerLimit || 300} 秒</div>
                  </button>
                  <AnimatePresence>
                    {timerPopoverOpen && isHost && !lobby.started && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs font-black tracking-widest text-zinc-500">回合时间</span>
                          <span className="text-xl font-black italic text-red-500">{turnTime}秒</span>
                        </div>
                        <input
                          type="range"
                          min="180"
                          max="999"
                          step="10"
                          value={turnTime}
                          onChange={(e) => setTurnTime(parseInt(e.target.value, 10))}
                          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-red-600"
                        />
                        <div className="mt-2 flex justify-between text-[9px] font-bold tracking-widest text-zinc-600">
                          <span>180</span>
                          <span>300</span>
                          <span>999</span>
                        </div>
                        <button
                          type="button"
                          onClick={saveTurnTimer}
                          disabled={savingTimer}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                        >
                          {savingTimer && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          保存时间
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="rounded-xl bg-black/30 px-4 py-3">
                  <div className="text-[10px] font-black tracking-widest text-zinc-500">房主</div>
                  <div className="mt-1 max-w-44 truncate text-sm font-bold text-white">{displayNameFor(lobby.hostUid)}</div>
                </div>
              </div>
            </div>

            {renderInvitePanel()}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {renderSeatCard('player1', '玩家1', lobby.playerIds[0])}
              {renderSeatCard('player2', '玩家2', lobby.playerIds[1])}
            </div>

            <div className={cn('rounded-2xl border p-5', mySeat === 'spectator' ? 'border-sky-500/60 bg-sky-950/15' : 'border-zinc-800 bg-zinc-900/35')}>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-sky-300" />
                  <h3 className="font-black italic">观战席</h3>
                </div>
                {mySeat !== 'spectator' && (
                  <button onClick={() => switchSeat('spectator')} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-white hover:bg-white/10">
                    切到观众席
                  </button>
                )}
              </div>
              {lobby.spectatorIds.length > 0 ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {lobby.spectatorIds.map(uid => (
                    <div key={uid} className="flex items-center gap-2 rounded-xl bg-black/30 px-4 py-3">
                      <UserRound className="h-4 w-4 text-sky-300" />
                      <span className="break-all text-sm font-bold">{displayNameFor(uid)}</span>
                      {uid === lobby.hostUid && <span className="ml-auto text-[10px] font-black text-amber-400">房主</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl bg-black/30 px-4 py-6 text-sm font-bold text-zinc-500">
                  <UsersRound className="h-5 w-5" />
                  暂无观众
                </div>
              )}
            </div>

            {error && <div className="rounded-xl border border-red-500/30 bg-red-900/30 p-3 text-sm text-red-400">{error}</div>}

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-center text-xs font-bold tracking-widest text-zinc-500">
              {lobby.status === 'STARTING'
                ? '双方已准备，正在进入战场...'
                : '玩家1与玩家2都选择合法卡组并准备后，将自动开始对局'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
