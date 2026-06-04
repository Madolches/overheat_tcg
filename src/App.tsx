import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff, Mail, Lock, User, KeyRound, CheckCircle2, ShieldAlert, Sparkles, RefreshCw, ArrowLeft } from 'lucide-react';
import { socket, getAuthUser, setAuthUser, setAuthToken, getAuthToken, clearAuthSession } from './socket';
import { TopBar } from './components/TopBar';
import { OnlinePlayersSidebar } from './components/OnlinePlayersSidebar';
import { FriendInviteModal } from './components/FriendInviteModal';
import { Home } from './components/Home';
import { prefetchCardCatalog } from './hooks/useCardCatalog';
import { PageFallback } from './components/PageFallback';

const Matchmaking = lazy(() => import('./components/Matchmaking').then(module => ({ default: module.Matchmaking })));
const BattleField = lazy(() => import('./components/BattleField').then(module => ({ default: module.BattleField })));
const DeckBuilder = lazy(() => import('./components/DeckBuilder').then(module => ({ default: module.DeckBuilder })));
const Rulebook = lazy(() => import('./components/Rulebook').then(module => ({ default: module.Rulebook })));
const Profile = lazy(() => import('./components/Profile').then(module => ({ default: module.Profile })));
const Store = lazy(() => import('./components/Store').then(module => ({ default: module.Store })));
const Collection = lazy(() => import('./components/Collection').then(module => ({ default: module.Collection })));
const PracticeSetup = lazy(() => import('./components/PracticeSetup').then(module => ({ default: module.PracticeSetup })));
const SandboxSetup = lazy(() => import('./components/SandboxSetup').then(module => ({ default: module.SandboxSetup })));
const FriendMatch = lazy(() => import('./components/FriendMatch').then(module => ({ default: module.FriendMatch })));
const DeckSquare = lazy(() => import('./components/DeckSquare').then(module => ({ default: module.DeckSquare })));
const BugCup = lazy(() => import('./components/BugCup').then(module => ({ default: module.BugCup })));

export default function App() {
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRulebookOpen, setIsRulebookOpen] = useState(false);
  const [isDesktopOnlinePlayersOpen, setIsDesktopOnlinePlayersOpen] = useState(true);
  const [isMobileOnlinePlayersOpen, setIsMobileOnlinePlayersOpen] = useState(false);
  const [onlinePlayerCount, setOnlinePlayerCount] = useState(0);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerMessage, setRegisterMessage] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [sendCodeCooldown, setSendCodeCooldown] = useState(0);
  const [resetEmail, setResetEmail] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetVerificationCode, setResetVerificationCode] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [sendingResetCode, setSendingResetCode] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetCodeCooldown, setResetCodeCooldown] = useState(0);
  const [sessionMessage, setSessionMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  const closeOnlinePlayers = useCallback(() => {
    setIsMobileOnlinePlayersOpen(false);
  }, []);

  const toggleOnlinePlayers = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches) {
      setIsDesktopOnlinePlayersOpen(open => !open);
      return;
    }
    setIsMobileOnlinePlayersOpen(open => !open);
  }, []);

  useEffect(() => {
    const savedUser = getAuthUser();
    if (savedUser) {
      setUser(savedUser);
    }

    const authHandler = () => {
      const token = getAuthToken();
      if (!token) return;
      socket.emit('authenticate', token);
    };

    socket.on('connect', authHandler);

    if (savedUser && getAuthToken()) {
      if (!socket.connected) {
        socket.connect();
      } else {
        authHandler();
      }
    }

    setLoading(false);
    return () => {
      socket.off('connect', authHandler);
    };
  }, []);

  useEffect(() => {
    const handleForcedLogout = (payload?: { reason?: string }) => {
      clearAuthSession();
      setUser(null);
      setSessionMessage(payload?.reason || '账号已在其他设备登录');
      socket.disconnect();
    };

    const handleUnauthorized = () => {
      if (!getAuthToken() || !getAuthUser()) {
        return;
      }
      handleForcedLogout({ reason: '登录状态已失效，请重新登录' });
    };

    socket.on('forceLogout', handleForcedLogout);
    socket.on('unauthorized', handleUnauthorized);
    return () => {
      socket.off('forceLogout', handleForcedLogout);
      socket.off('unauthorized', handleUnauthorized);
    };
  }, []);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;

    const preloadRoutes = () => {
      void import('./components/Matchmaking');
      void import('./components/FriendMatch');
      void import('./components/DeckSquare');
      void import('./components/BugCup');
      void import('./components/PracticeSetup');
      void prefetchCardCatalog({ includeEffects: false });
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idleWindow.requestIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(preloadRoutes, { timeout: 1500 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(preloadRoutes, 800);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    if (sendCodeCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setSendCodeCooldown(current => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sendCodeCooldown]);

  useEffect(() => {
    if (resetCodeCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResetCodeCooldown(current => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resetCodeCooldown]);

  const handleAuthSuccess = (token: string, authUser: any) => {
    setAuthToken(token);
    setAuthUser(authUser);
    setUser(authUser);
    setSessionMessage('');
    setLoginError('');
    setRegisterError('');

    if (!socket.connected) {
      socket.connect();
      return;
    }

    socket.emit('authenticate', token);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setSessionMessage('');
    setLoginSubmitting(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();

      if (res.ok && data.token) {
        handleAuthSuccess(data.token, data.user);
      } else {
        setLoginError(data.error || '登录失败');
      }
    } catch (err) {
      setLoginError('网络错误');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleSendVerificationCode = async () => {
    setRegisterError('');
    setRegisterMessage('');
    setSessionMessage('');
    setSendingCode(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/register/send-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: registerUsername,
          email: registerEmail,
          password: registerPassword
        })
      });
      const data = await res.json();

      if (res.ok) {
        setRegisterMessage(data.message || '验证码已发送，请前往邮箱查收');
        setSendCodeCooldown(60);
      } else {
        setRegisterError(data.error || '验证码发送失败');
      }
    } catch (err) {
      setRegisterError('网络错误');
    } finally {
      setSendingCode(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    setRegisterMessage('');
    setSessionMessage('');
    setRegisterSubmitting(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: registerUsername,
          email: registerEmail,
          password: registerPassword,
          verificationCode
        })
      });
      const data = await res.json();

      if (res.ok && data.token) {
        handleAuthSuccess(data.token, data.user);
      } else {
        setRegisterError(data.error || '注册失败');
      }
    } catch (err) {
      setRegisterError('网络错误');
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const handleSendResetCode = async () => {
    setResetError('');
    setResetMessage('');
    setSessionMessage('');
    setSendingResetCode(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/password-reset/send-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: resetEmail })
      });
      const data = await res.json();

      if (res.ok) {
        setResetMessage(data.message || '验证码已发送，请前往邮箱查收');
        setResetCodeCooldown(60);
      } else {
        setResetError(data.error || '验证码发送失败');
      }
    } catch (err) {
      setResetError('网络错误');
    } finally {
      setSendingResetCode(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetMessage('');
    setSessionMessage('');
    setResetSubmitting(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: resetEmail,
          password: resetPassword,
          verificationCode: resetVerificationCode
        })
      });
      const data = await res.json();

      if (res.ok) {
        setAuthMode('login');
        setLoginUsername(resetEmail);
        setLoginPassword('');
        setLoginError('');
        setSessionMessage(data.message || '密码已重置，请使用新密码登录');
        setResetPassword('');
        setResetVerificationCode('');
        setResetMessage('');
      } else {
        setResetError(data.error || '重置密码失败');
      }
    } catch (err) {
      setResetError('网络错误');
    } finally {
      setResetSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    const isEmailValid = (emailStr: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr);
    const getPasswordStrength = (pass: string) => {
      if (!pass) return 0;
      let score = 0;
      if (pass.length >= 6) score += 1;
      if (/[0-9]/.test(pass) && /[a-zA-Z]/.test(pass)) score += 1;
      if (/[^A-Za-z0-9]/.test(pass) && pass.length >= 8) score += 1;
      return score;
    };
    
    const regStrength = getPasswordStrength(registerPassword);
    const regStrengthColors = ['bg-zinc-800', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500'];
    const regStrengthText = ['', '弱', '中', '强'];

    return (
      <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden px-4 py-8 text-white font-sans">
        {/* Immersive background image with cover/center, NO blur */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-[10s] ease-out scale-105"
          style={{ 
            backgroundImage: 'url("/assets/icons/login_bg.jpg")',
          }}
        />
        
        {/* Sleek radial black overlay, NO backdrop blur */}
        <div className="absolute inset-0 bg-black/60" />
        
        {/* Soft glowing ambient circles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div 
            animate={{ 
              x: [0, 40, -20, 0],
              y: [0, -30, 20, 0],
              scale: [1, 1.1, 0.95, 1]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/4 left-1/4 w-[280px] h-[280px] rounded-full bg-red-600/10 blur-[80px]"
          />
          <motion.div 
            animate={{ 
              x: [0, -30, 40, 0],
              y: [0, 20, -30, 0],
              scale: [1, 0.9, 1.05, 1]
            }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-1/4 right-1/4 w-[320px] h-[320px] rounded-full bg-orange-600/10 blur-[90px]"
          />
        </div>

        <div className="relative z-10 w-full max-w-md flex flex-col items-center justify-center py-6">
          {/* Glassmorphic card container with fixed height and width */}
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, type: 'spring', damping: 22 }}
            className="w-full h-[520px] rounded-[28px] border border-white/10 bg-zinc-950/70 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.05)] backdrop-blur-2xl flex flex-col justify-between select-none"
          >
            {/* Header Section inside Card */}
            <div className="relative flex items-center justify-center min-h-[40px] border-b border-white/5 pb-3">
              {authMode !== 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setLoginError('');
                    setRegisterError('');
                    setRegisterMessage('');
                    setResetError('');
                    setResetMessage('');
                  }}
                  className="absolute left-0 top-1/2 -translate-y-1/2 p-2 rounded-xl border border-white/10 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer flex items-center justify-center active:scale-95"
                  aria-label="返回"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <h2 className="text-xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.3)]">
                {authMode === 'login' ? '登录' : authMode === 'register' ? '创建账户' : '重置密码'}
              </h2>
            </div>

            {/* Form Section inside Card */}
            <AnimatePresence mode="wait">
              {authMode === 'login' ? (
                <motion.form
                  key="login"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleLogin}
                  className="flex-1 flex flex-col justify-center gap-5 pt-4 pb-2"
                >
                  <div className="flex flex-col gap-4">
                    <div className="relative group">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-red-500 transition-colors">
                        <User className="w-5 h-5" />
                      </span>
                      <input
                        type="text"
                        placeholder="用户名或邮箱"
                        value={loginUsername}
                        onChange={e => setLoginUsername(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/60 pl-12 pr-4 py-3.5 text-white placeholder:text-zinc-500 outline-none transition-all focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10 focus:bg-black/80"
                      />
                    </div>

                    <div className="relative group">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-red-500 transition-colors">
                        <Lock className="w-5 h-5" />
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="密码"
                        value={loginPassword}
                        onChange={e => setLoginPassword(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/60 pl-12 pr-12 py-3.5 text-white placeholder:text-zinc-500 outline-none transition-all focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10 focus:bg-black/80"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {sessionMessage && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5 flex items-start gap-2"
                    >
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{sessionMessage}</span>
                    </motion.div>
                  )}

                  {loginError && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 flex items-start gap-2"
                    >
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{loginError}</span>
                    </motion.div>
                  )}

                  <button
                    type="submit"
                    disabled={loginSubmitting}
                    className="w-full rounded-xl bg-white py-3.5 text-base font-black text-black transition-all shadow-[0_8px_24px_rgba(255,255,255,0.08)] hover:bg-zinc-200 hover:shadow-[0_8px_32px_rgba(255,255,255,0.18)] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loginSubmitting ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <span>登录</span>
                    )}
                  </button>

                  {/* Dynamic page switching links in the footer of Login mode */}
                  <div className="flex justify-between items-center px-1 text-xs select-none">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot');
                        setResetError('');
                        setResetMessage('');
                      }}
                      className="text-zinc-500 hover:text-red-400 transition-colors font-bold cursor-pointer"
                    >
                      忘记密码？
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setRegisterError('');
                        setRegisterMessage('');
                      }}
                      className="text-red-500 hover:text-red-400 transition-colors font-black tracking-wider cursor-pointer"
                    >
                      立即注册
                    </button>
                  </div>
                </motion.form>
              ) : authMode === 'register' ? (
                <motion.form
                  key="register"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleRegister}
                  className="flex-1 flex flex-col justify-center gap-4 pt-3 pb-1"
                >
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-red-500 transition-colors">
                      <User className="w-5 h-5" />
                    </span>
                    <input
                      type="text"
                      placeholder="用户名"
                      value={registerUsername}
                      onChange={e => setRegisterUsername(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/60 pl-12 pr-12 py-3 text-white placeholder:text-zinc-500 outline-none transition-all focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10 focus:bg-black/80"
                    />
                    {registerUsername.length >= 3 && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
                        <CheckCircle2 className="w-5 h-5" />
                      </span>
                    )}
                  </div>

                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-red-500 transition-colors">
                      <Mail className="w-5 h-5" />
                    </span>
                    <input
                      type="email"
                      placeholder="邮箱"
                      value={registerEmail}
                      onChange={e => setRegisterEmail(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/60 pl-12 pr-12 py-3 text-white placeholder:text-zinc-500 outline-none transition-all focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10 focus:bg-black/80"
                    />
                    {isEmailValid(registerEmail) && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
                        <CheckCircle2 className="w-5 h-5" />
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="relative group">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-red-500 transition-colors">
                        <Lock className="w-5 h-5" />
                      </span>
                      <input
                        type={showRegisterPassword ? "text" : "password"}
                        placeholder="密码"
                        value={registerPassword}
                        onChange={e => setRegisterPassword(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/60 pl-12 pr-12 py-3 text-white placeholder:text-zinc-500 outline-none transition-all focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10 focus:bg-black/80"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                        tabIndex={-1}
                      >
                        {showRegisterPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    
                    {registerPassword && (
                      <div className="px-1 mt-0.5">
                        <div className="flex justify-between items-center text-[9px] text-zinc-400 mb-0.5">
                          <span>密码强度: {regStrengthText[regStrength]}</span>
                          <span>至少6位，包含字母和数字</span>
                        </div>
                        <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden flex gap-0.5">
                          <div className={`h-full flex-1 transition-all duration-300 ${regStrength >= 1 ? regStrengthColors[regStrength] : 'bg-transparent'}`} />
                          <div className={`h-full flex-1 transition-all duration-300 ${regStrength >= 2 ? regStrengthColors[regStrength] : 'bg-transparent'}`} />
                          <div className={`h-full flex-1 transition-all duration-300 ${regStrength >= 3 ? regStrengthColors[regStrength] : 'bg-transparent'}`} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative group flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-red-500 transition-colors">
                        <KeyRound className="w-5 h-5" />
                      </span>
                      <input
                        type="text"
                        placeholder="6位验证码"
                        value={verificationCode}
                        onChange={e => setVerificationCode(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/60 pl-12 pr-4 py-3 text-white placeholder:text-zinc-500 outline-none transition-all focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10 focus:bg-black/80"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendVerificationCode}
                      disabled={sendingCode || sendCodeCooldown > 0}
                      className="w-full rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white transition-all shadow-[0_4px_12px_rgba(220,38,38,0.2)] hover:bg-red-500 hover:shadow-[0_4px_16px_rgba(220,38,38,0.35)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none sm:w-auto sm:min-w-[120px] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {sendingCode ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : sendCodeCooldown > 0 ? (
                        <span>{sendCodeCooldown}秒</span>
                      ) : (
                        <span>发送验证码</span>
                      )}
                    </button>
                  </div>

                  {registerMessage && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2 flex items-start gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{registerMessage}</span>
                    </motion.div>
                  )}

                  {registerError && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 flex items-start gap-2"
                    >
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{registerError}</span>
                    </motion.div>
                  )}

                  <button
                    type="submit"
                    disabled={registerSubmitting}
                    className="w-full rounded-xl bg-white py-3.5 text-base font-black text-black transition-all shadow-[0_8px_24px_rgba(255,255,255,0.08)] hover:bg-zinc-200 hover:shadow-[0_8px_32px_rgba(255,255,255,0.18)] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {registerSubmitting ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <span>完成注册</span>
                    )}
                  </button>
                </motion.form>
              ) : (
                <motion.form
                  key="forgot"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleResetPassword}
                  className="flex-1 flex flex-col justify-center gap-4 pt-3 pb-1"
                >
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-red-500 transition-colors">
                      <Mail className="w-5 h-5" />
                    </span>
                    <input
                      type="email"
                      placeholder="注册邮箱"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/60 pl-12 pr-12 py-3.5 text-white placeholder:text-zinc-500 outline-none transition-all focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10 focus:bg-black/80"
                    />
                    {isEmailValid(resetEmail) && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
                        <CheckCircle2 className="w-5 h-5" />
                      </span>
                    )}
                  </div>

                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-red-500 transition-colors">
                      <Lock className="w-5 h-5" />
                    </span>
                    <input
                      type={showResetPassword ? "text" : "password"}
                      placeholder="新密码"
                      value={resetPassword}
                      onChange={e => setResetPassword(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/60 pl-12 pr-12 py-3.5 text-white placeholder:text-zinc-500 outline-none transition-all focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10 focus:bg-black/80"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword(!showResetPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                      tabIndex={-1}
                    >
                      {showResetPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative group flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-red-500 transition-colors">
                        <KeyRound className="w-5 h-5" />
                      </span>
                      <input
                        type="text"
                        placeholder="6位验证码"
                        value={resetVerificationCode}
                        onChange={e => setResetVerificationCode(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/60 pl-12 pr-4 py-3 text-white placeholder:text-zinc-500 outline-none transition-all focus:border-red-500/50 focus:ring-2 focus:ring-red-500/10 focus:bg-black/80"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendResetCode}
                      disabled={sendingResetCode || resetCodeCooldown > 0}
                      className="w-full rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white transition-all shadow-[0_4px_12px_rgba(220,38,38,0.2)] hover:bg-red-500 hover:shadow-[0_4px_16px_rgba(220,38,38,0.35)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none sm:w-auto sm:min-w-[120px] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {sendingResetCode ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : resetCodeCooldown > 0 ? (
                        <span>{resetCodeCooldown}秒</span>
                      ) : (
                        <span>发送验证码</span>
                      )}
                    </button>
                  </div>

                  {resetMessage && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2 flex items-start gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{resetMessage}</span>
                    </motion.div>
                  )}

                  {resetError && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 flex items-start gap-2"
                    >
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{resetError}</span>
                    </motion.div>
                  )}

                  <button
                    type="submit"
                    disabled={resetSubmitting}
                    className="w-full rounded-xl bg-white py-3.5 text-base font-black text-black transition-all shadow-[0_8px_24px_rgba(255,255,255,0.08)] hover:bg-zinc-200 hover:shadow-[0_8px_32px_rgba(255,255,255,0.18)] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {resetSubmitting ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <span>重置密码</span>
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500 selection:text-white">
        <TopBar
          onOpenRulebook={() => setIsRulebookOpen(true)}
          onlinePlayerCount={onlinePlayerCount}
          onToggleOnlinePlayers={toggleOnlinePlayers}
        />
        <OnlinePlayersSidebar
          isDesktopOpen={isDesktopOnlinePlayersOpen}
          isMobileOpen={isMobileOnlinePlayersOpen}
          onClose={closeOnlinePlayers}
          onCountChange={setOnlinePlayerCount}
        />
        <FriendInviteModal />

        <main className="h-screen overflow-auto">
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/deck-builder" element={<DeckBuilder />} />
              <Route path="/battle" element={<Matchmaking />} />
              <Route path="/battle/:gameId" element={<BattleField />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/store" element={<Store />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/deck-square" element={<DeckSquare />} />
              <Route path="/bug-cup" element={<BugCup />} />
              <Route path="/practice" element={<PracticeSetup />} />
              <Route path="/sandbox" element={<SandboxSetup />} />
              <Route path="/friend-match" element={<FriendMatch />} />
              <Route path="/history" element={<div className="pt-24 px-12 text-zinc-500 uppercase tracking-widest text-center">对战历史即将上线</div>} />
            </Routes>
          </Suspense>
        </main>

        {isRulebookOpen && (
          <Suspense fallback={null}>
            <Rulebook isOpen={isRulebookOpen} onClose={() => setIsRulebookOpen(false)} />
          </Suspense>
        )}
      </div>
    </Router>
  );
}
