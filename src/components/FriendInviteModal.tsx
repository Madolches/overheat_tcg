import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Swords, X } from 'lucide-react';
import { getAuthToken, socket } from '../socket';

type FriendInvitePayload = {
  inviteId: string;
  gameId: string;
  roomCode: string;
  hostUid: string;
  hostName: string;
  targetUid?: string;
  turnTimerLimit?: number;
  expiresAt: number;
};

export const FriendInviteModal: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<FriendInvitePayload | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const isBattleRoute = location.pathname.startsWith('/battle/');

  useEffect(() => {
    const handleInvite = (payload: FriendInvitePayload) => {
      if (!payload?.inviteId || !payload.roomCode) return;
      if (location.pathname.startsWith('/battle/')) {
        socket.emit('friendInvite:declined', {
          inviteId: payload.inviteId,
          reason: '对方正在对局中。'
        });
        return;
      }
      setInvite(payload);
      setError('');
    };

    socket.on('friendInvite:received', handleInvite);
    return () => {
      socket.off('friendInvite:received', handleInvite);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!invite || invite.expiresAt <= Date.now()) return;
    const timer = window.setTimeout(() => {
      socket.emit('friendInvite:declined', {
        inviteId: invite.inviteId,
        reason: '邀请已超时。'
      });
      setInvite(current => current?.inviteId === invite.inviteId ? null : current);
    }, invite.expiresAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [invite]);

  useEffect(() => {
    if (!invite || !isBattleRoute) return;
    socket.emit('friendInvite:declined', {
      inviteId: invite.inviteId,
      reason: '对方正在对局中。'
    });
    setInvite(null);
  }, [invite, isBattleRoute]);

  const remainingSeconds = useMemo(() => {
    if (!invite) return 0;
    return Math.max(0, Math.ceil((invite.expiresAt - Date.now()) / 1000));
  }, [invite]);

  const closeInvite = (reason = '对方拒绝了邀请。') => {
    if (invite) {
      socket.emit('friendInvite:declined', {
        inviteId: invite.inviteId,
        reason
      });
    }
    setInvite(null);
    setJoining(false);
    setError('');
  };

  const acceptInvite = async () => {
    if (!invite || joining) return;
    const token = getAuthToken();
    if (!token) {
      setError('请先登录后再接受邀请。');
      return;
    }

    setJoining(true);
    setError('');
    try {
      const roomCode = invite.roomCode;
      await new Promise<void>((resolve, reject) => {
        const clear = () => {
          socket.off('friendInvite:accepted', handleAccepted);
          socket.off('friendInvite:error', handleError);
        };
        const timeout = window.setTimeout(() => {
          clear();
          reject(new Error('接受邀请超时，请重试。'));
        }, 5000);
        const handleAccepted = (payload: { inviteId?: string }) => {
          if (payload.inviteId !== invite.inviteId) return;
          window.clearTimeout(timeout);
          clear();
          resolve();
        };
        const handleError = (payload: { inviteId?: string; message?: string }) => {
          if (payload.inviteId && payload.inviteId !== invite.inviteId) return;
          window.clearTimeout(timeout);
          clear();
          reject(new Error(payload.message || '邀请已失效。'));
        };
        socket.on('friendInvite:accepted', handleAccepted);
        socket.on('friendInvite:error', handleError);
        socket.emit('friendInvite:accepted', { inviteId: invite.inviteId });
      });
      setInvite(null);
      navigate('/friend-match', { state: { invitedRoomCode: roomCode } });
    } catch (err: any) {
      setError(err.message || '加入房间失败。');
    } finally {
      setJoining(false);
    }
  };

  return (
    <AnimatePresence>
      {invite && !isBattleRoute && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="fixed inset-x-4 top-24 z-[121] mx-auto max-w-md rounded-2xl border border-red-400/30 bg-zinc-950 p-5 text-white shadow-2xl md:top-32"
          >
            <button
              type="button"
              onClick={() => closeInvite()}
              className="absolute right-3 top-3 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="关闭邀请"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-4 pr-8">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-600/20 text-red-200">
                <Swords className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black tracking-tight">好友约战邀请</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-zinc-300">
                  {invite.hostName} 邀请你加入好友房。
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="text-[10px] font-black tracking-widest text-zinc-500">房间码</div>
                <div className="mt-1 font-mono text-2xl font-black tracking-[0.18em] text-amber-300">{invite.roomCode}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="text-[10px] font-black tracking-widest text-zinc-500">回合时间</div>
                <div className="mt-1 text-2xl font-black text-white">{invite.turnTimerLimit || 300}秒</div>
              </div>
            </div>
            {error && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm font-bold text-red-200">
                {error}
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => closeInvite()}
                disabled={joining}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                拒绝
              </button>
              <button
                type="button"
                onClick={acceptInvite}
                disabled={joining || remainingSeconds <= 0}
                className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {joining && <Loader2 className="h-4 w-4 animate-spin" />}
                接受邀请
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
