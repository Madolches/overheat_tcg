import { clearAuthSession, getAuthUser, setAuthToken, setAuthUser } from '../socket';
import { socket } from '../socket';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Settings, Image, Layout, Heart, Save, Loader2, X, Search, LogOut, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { RAY_CARDS, CARD_BACKS } from '../data/customization';
import { readJsonResponse } from '../lib/http';
import { useCardSkinSettings } from '../hooks/useCardSkinSettings';

export const Profile: React.FC = () => {
  const user = getAuthUser();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(user?.displayName || '玩家');
  const [favoriteCardId, setFavoriteCardId] = useState<string | null>(null);
  const [favoriteBackId, setFavoriteBackId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSelectingCard, setIsSelectingCard] = useState(false);
  const [isSelectingBack, setIsSelectingBack] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { showOpponentCardSkins, setShowOpponentCardSkins } = useCardSkinSettings();

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
        const token = localStorage.getItem('token');
        const res = await fetch(`${BACKEND_URL}/api/user/profile`, { headers: { 'Authorization': `Bearer ${token}` }});
        const data = await readJsonResponse(res);
        setFavoriteCardId(data?.favoriteCardId || 'fav_card');
        setFavoriteBackId(data?.favoriteBackId || 'default');
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    loadProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/api/user/profile`, { 
          method: 'PUT', 
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ favoriteCardId, favoriteBackId }) 
      });
      const data = await readJsonResponse(res);
      if (data?.token) {
        setAuthToken(data.token);
        socket.emit('authenticate', data.token);
      }
      if (data?.user) {
        setAuthUser(data.user);
      }
      alert('个人信息已保存');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    socket.disconnect();
    window.location.href = '/';
  };

  const favoriteCard = RAY_CARDS.find(c => c.id === favoriteCardId);
  const favoriteBack = CARD_BACKS.find(b => b.id === favoriteBackId);

  if (loading) {
    return (
      <div className="pt-24 flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-black text-white">
      {/* Background - Leiya Card */}
      <div 
        className="fixed inset-0 z-0 opacity-20 transition-all duration-1000"
        style={{
          backgroundImage: `url("${favoriteCard?.url || '/assets/fav_card/fav_card.jpg'}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(3px)',
        }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black z-[1]" />

      {/* Content */}
      <div className="relative z-10 pt-24 px-4 md:px-12 pb-20">
        <div className="max-w-4xl mx-auto">
          {/* Header with back & logout */}
          <div className="flex flex-col md:flex-row items-center justify-between mb-8 md:mb-16 gap-6">
            <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 w-full md:w-auto">
              <div className="flex items-center justify-between w-full md:w-auto px-2">
                <button onClick={() => navigate('/')} className="p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="md:hidden flex items-center gap-2">
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="p-2 bg-red-600 rounded-lg"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-white" />}
                  </button>
                  <button onClick={handleLogout} className="p-2 bg-zinc-800 rounded-lg">
                    <LogOut className="w-4 h-4 text-zinc-300" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto px-2">
                <div className="w-20 h-20 md:w-28 md:h-28 rounded-full bg-red-600 flex items-center justify-center overflow-hidden border-4 border-zinc-800 shadow-[0_0_50px_rgba(220,38,38,0.2)] shrink-0">
                  {user?.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <img src="assets/icons/myself.JPG" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1">
                  <input 
                    className="text-xl md:text-3xl font-black italic tracking-tighter mb-1 bg-transparent border-b-2 border-transparent focus:border-red-600 focus:outline-none transition-all w-full"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                  />
                  <p className="text-zinc-500 tracking-widest text-[10px] md:text-xs">编号：{user?.uid?.slice(0, 8) || user?.uid}</p>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-3">
              <button 
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 rounded-full font-bold text-sm tracking-tighter flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存修改
              </button>
              <button 
                onClick={handleLogout}
                className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-full font-bold text-sm tracking-tighter flex items-center gap-2 transition-all text-zinc-300 hover:text-white"
              >
                <LogOut className="w-4 h-4" />
                登出
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div onClick={() => setIsSelectingCard(true)}>
              <SettingCard 
                title="设置背景" 
                icon={<Heart className="w-6 h-6" />} 
                description={favoriteCard ? `当前: ${favoriteCard.name}` : "选择主界面背景图片"} 
              />
            </div>
            <div onClick={() => setIsSelectingBack(true)}>
              <SettingCard 
                title="设置卡背图案" 
                icon={<Layout className="w-6 h-6" />} 
                description={favoriteBack ? `当前: ${favoriteBack.name}` : "在对战中展示你的个性化卡背"} 
              />
            </div>
            <PreferenceToggleCard
              title="显示对手卡牌皮肤"
              icon={<Settings className="w-6 h-6" />}
              description={showOpponentCardSkins ? '对局中显示对手使用的卡牌皮肤' : '对局中忽略对手卡牌皮肤，仅显示原卡图'}
              checked={showOpponentCardSkins}
              onChange={setShowOpponentCardSkins}
            />
          </div>
        </div>
      </div>

      {/* Card Selection Modal */}
      <AnimatePresence>
        {isSelectingCard && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <h2 className="text-lg md:text-2xl font-black italic tracking-tighter shrink-0">选择背景</h2>
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input 
                      className="w-full bg-black border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs md:text-sm focus:outline-none focus:border-red-600 transition-all"
                      placeholder="搜索..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <button onClick={() => setIsSelectingCard(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                {RAY_CARDS.filter(c => c.name.includes(searchTerm)).map((card, index) => (
                  <div 
                    key={card.id || `ray-${index}`} 
                    onClick={() => { setFavoriteCardId(card.id); setIsSelectingCard(false); }}
                    className={cn(
                      "cursor-pointer transition-all hover:scale-[1.02] group relative rounded-2xl overflow-hidden border-2",
                      favoriteCardId === card.id ? "border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.3)]" : "border-zinc-800 hover:border-zinc-600"
                    )}
                  >
                    <div className="aspect-video">
                      <img src={card.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-4">
                      <p className="font-black italic tracking-tighter text-lg">{card.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card Back Selection Modal */}
      <AnimatePresence>
        {isSelectingBack && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl h-[90vh] md:h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <h2 className="text-lg md:text-2xl font-black italic tracking-tighter shrink-0">选择卡背</h2>
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input 
                      className="w-full bg-black border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs md:text-sm focus:outline-none focus:border-red-600 transition-all"
                      placeholder="搜索..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <button onClick={() => setIsSelectingBack(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                {CARD_BACKS.filter(b => b.name.includes(searchTerm)).map((back, index) => (
                  <div 
                    key={back.id || `back-${index}`} 
                    onClick={() => { setFavoriteBackId(back.id); setIsSelectingBack(false); }}
                    className={cn(
                      "cursor-pointer transition-all hover:scale-[1.02] group relative rounded-2xl overflow-hidden border-2",
                      favoriteBackId === back.id ? "border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.3)]" : "border-zinc-800 hover:border-zinc-600"
                    )}
                  >
                    <div className="aspect-video relative">
                      <img src={back.url} className="w-full h-full object-contain bg-zinc-800 group-hover:scale-105 transition-transform duration-500" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-4">
                      <p className="font-black italic tracking-tighter text-lg">{back.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SettingCard = ({ title, icon, description }: any) => (
  <motion.div 
    whileHover={{ scale: 1.02 }}
    className="p-6 rounded-2xl bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 hover:border-red-500/50 transition-all cursor-pointer group"
  >
    <div className="flex items-center gap-4 mb-3">
      <div className="p-3 rounded-xl bg-black/60 group-hover:bg-red-600 transition-colors">{icon}</div>
      <h2 className="text-lg font-bold italic tracking-tighter">{title}</h2>
    </div>
    <p className="text-zinc-500 text-sm">{description}</p>
  </motion.div>
);

const PreferenceToggleCard = ({
  title,
  icon,
  description,
  checked,
  onChange
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    className="p-6 rounded-2xl bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 hover:border-red-500/50 transition-all group"
  >
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-4 mb-3">
          <div className="p-3 rounded-xl bg-black/60 group-hover:bg-red-600 transition-colors">{icon}</div>
          <h2 className="text-lg font-bold italic tracking-tighter">{title}</h2>
        </div>
        <p className="text-zinc-500 text-sm">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
          checked ? 'border-red-400/50 bg-red-600' : 'border-zinc-600 bg-zinc-900'
        )}
        title={checked ? '关闭后将忽略对手卡牌皮肤' : '开启后将显示对手卡牌皮肤'}
      >
        <span
          className={cn(
            'absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-lg transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  </motion.div>
);
