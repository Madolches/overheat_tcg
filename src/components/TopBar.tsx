import { clearAuthSession, getAuthToken, getAuthUser, setAuthToken, setAuthUser, socket } from '../socket';
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Check, Coins, Gem, Layers3, Loader2, LogOut, Menu, Settings, Trophy, UserRound, UsersRound, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { readJsonResponse } from '../lib/http';

export const TopBar: React.FC<{ onOpenRulebook: () => void; onlinePlayerCount?: number; onToggleOnlinePlayers?: () => void }> = ({ onOpenRulebook, onlinePlayerCount = 0, onToggleOnlinePlayers }) => {
  const [user, setUser] = useState<any | null>(() => getAuthUser());
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [coins, setCoins] = useState<number | null>(null);
  const [crystals, setCrystals] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(user?.username || user?.displayName || '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [bugCupPausedOpen, setBugCupPausedOpen] = useState(false);

  const isInGame = location.pathname.startsWith('/battle/');
  const isDeckBuilder = location.pathname === '/deck-builder';
  const displayName = user?.username || user?.displayName || '玩家';

  useEffect(() => {
    const loadAssets = async () => {
      if (!user) return;
      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
        const token = localStorage.getItem('token');
        const res = await fetch(`${BACKEND_URL}/api/user/profile`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await readJsonResponse(res);
        setCoins(data?.coins ?? 0);
        setCrystals(data?.cardCrystals ?? 0);
      } catch (e) { /* ignore */ }
    };
    loadAssets();
    const interval = setInterval(loadAssets, 10000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (isMenuOpen) {
      const currentUser = getAuthUser();
      setUser(currentUser);
      setUsernameDraft(currentUser?.username || currentUser?.displayName || '');
      setEditingName(false);
      setNameError('');
    }
  }, [isMenuOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSaveUsername = async () => {
    const nextUsername = usernameDraft.trim();
    if (!nextUsername) {
      setNameError('用户名不能为空');
      return;
    }

    setSavingName(true);
    setNameError('');
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
      const token = getAuthToken();
      const res = await fetch(`${BACKEND_URL}/api/user/profile`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(socket.id ? { 'X-Socket-Id': socket.id } : {})
        },
        body: JSON.stringify({ username: nextUsername })
      });
      const data = await readJsonResponse(res);
      if (!res.ok || data?.error) {
        setNameError(data?.error || '修改用户名失败');
        return;
      }

      if (data?.token) {
        setAuthToken(data.token);
        socket.emit('authenticate', data.token);
      }
      if (data?.user) {
        setAuthUser(data.user);
        setUser(data.user);
        setUsernameDraft(data.user.username || data.user.displayName || nextUsername);
      }
      setEditingName(false);
    } catch (e) {
      setNameError('网络错误');
    } finally {
      setSavingName(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    socket.disconnect();
    window.location.href = '/';
  };

  if (isInGame || isDeckBuilder) return null;

  return (
    <>
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setBugCupPausedOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-zinc-900/80 px-3 py-3 text-sm font-black text-white shadow-xl backdrop-blur-md transition-all hover:border-red-300/50 hover:bg-red-950/50"
          aria-label="bug杯"
        >
          <Trophy className="h-4 w-4 text-red-300" />
          <span className="hidden sm:inline">bug杯</span>
        </button>
        <button
          type="button"
          onClick={onToggleOnlinePlayers}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-3 text-sm font-black text-white shadow-xl backdrop-blur-md transition-all hover:border-white/30 hover:bg-zinc-800/90"
          aria-label="在线玩家"
        >
          <UsersRound className="h-4 w-4 text-emerald-300" />
          <span className="hidden sm:inline">在线玩家</span>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-300">
            {onlinePlayerCount}
          </span>
        </button>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label={isMenuOpen ? '关闭菜单' : '打开菜单'}
          aria-expanded={isMenuOpen}
          className="p-3 bg-zinc-900/80 backdrop-blur-md rounded-xl border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 hover:bg-zinc-800/90 transition-all shadow-xl"
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <AnimatePresence>
        {bugCupPausedOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/80 p-4 text-white backdrop-blur-xl"
            onClick={() => setBugCupPausedOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 16 }}
              className="w-full max-w-sm rounded-3xl border border-red-400/20 bg-zinc-950 p-6 text-center shadow-2xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
                <Trophy className="h-6 w-6 text-red-300" />
              </div>
              <h2 className="text-2xl font-black italic tracking-tighter">bug杯暂停</h2>
              <p className="mt-3 text-sm font-bold leading-6 text-zinc-300">杯赛目前暂停，请自由约战。</p>
              <button
                type="button"
                onClick={() => setBugCupPausedOpen(false)}
                className="mt-6 w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-red-500"
              >
                知道了
              </button>
            </motion.div>
          </motion.div>
        )}
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-zinc-950/90 p-3 text-white backdrop-blur-2xl md:items-center md:p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative my-3 flex w-full max-w-lg flex-col gap-4 md:my-0"
            >
              <div className="relative z-10 rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black italic tracking-tighter text-white">账户</h2>
                      <p className="text-[10px] font-bold tracking-widest text-zinc-500">ACCOUNT</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="关闭菜单"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="rounded-xl border border-white/10 bg-black/35 p-3">
                    {editingName ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={usernameDraft}
                            onChange={e => setUsernameDraft(e.target.value)}
                            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-bold text-white outline-none transition-colors focus:border-red-500"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleSaveUsername}
                            disabled={savingName}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                            aria-label="保存用户名"
                          >
                            {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingName(false);
                              setUsernameDraft(displayName);
                              setNameError('');
                            }}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                            aria-label="取消修改用户名"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {nameError && <div className="text-xs font-bold text-red-400">{nameError}</div>}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingName(true)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-black">
                          {displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-base font-black text-white">{displayName}</div>
                          <div className="text-[10px] font-bold tracking-widest text-zinc-500">点击修改用户名</div>
                        </div>
                      </button>
                    )}
                  </div>

                  <MenuLink to="/collection?tab=DECKS" icon={<Layers3 className="h-5 w-5 text-red-300" />} label="我的卡组" onClose={() => setIsMenuOpen(false)} />
                  <MenuButton icon={<BookOpen className="h-5 w-5 text-sky-300" />} label="简易规则书" onClick={() => { onOpenRulebook(); setIsMenuOpen(false); }} />
                  <MenuLink to="/profile" icon={<Settings className="h-5 w-5 text-zinc-300" />} label="设置" onClose={() => setIsMenuOpen(false)} />
                  <MenuButton icon={<LogOut className="h-5 w-5 text-red-300" />} label="登出" onClick={handleLogout} />

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/35 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Coins className="h-5 w-5 text-amber-400" />
                        <span className="text-xs font-black tracking-widest text-zinc-400">金币</span>
                      </div>
                      <span className="text-base font-black italic text-amber-400">{coins?.toLocaleString() ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/35 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Gem className="h-5 w-5 text-cyan-400" />
                        <span className="text-xs font-black tracking-widest text-zinc-400">卡晶</span>
                      </div>
                      <span className="text-base font-black italic text-cyan-400">{crystals?.toLocaleString() ?? 0}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-black text-black transition-colors hover:bg-zinc-200"
                >
                  <X className="h-5 w-5" />
                  关闭菜单
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const menuItemClass = 'flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-black text-white transition-colors hover:bg-white/10';

const MenuLink = ({ to, icon, label, onClose }: { to: string; icon: React.ReactNode; label: string; onClose: () => void }) => (
  <Link to={to} onClick={onClose} className={cn(menuItemClass)}>
    {icon}
    <span>{label}</span>
  </Link>
);

const MenuButton = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className={cn(menuItemClass)}>
    {icon}
    <span>{label}</span>
  </button>
);
