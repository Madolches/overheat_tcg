import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Loader2, Play, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { validateDeckForBattle } from '../lib/deckValidation';
import { getAuthUser } from '../socket';
import { Deck } from '../types/game';
import { PageFallback } from './PageFallback';

const AI_OPPONENT_DECKS = [
  { id: 'white-temple', name: '纯白殿堂', detail: '稳健防守与场面控制' },
  { id: 'blue-adventurer', name: '纯蓝冒险家', detail: '节奏展开与灵活交换' },
  { id: 'red-dikai', name: '纯红迪凯', detail: '高速进攻与连续压制' },
  { id: 'big-salala', name: '大萨拉拉', detail: '绿白中速压制与高质量战斗' },
] as const;

export const PracticeSetup: React.FC = () => {
  const navigate = useNavigate();
  const [myDecks, setMyDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [deckDropdownOpen, setDeckDropdownOpen] = useState(false);
  const [turnTime, setTurnTime] = useState(300);
  const [botDifficulty, setBotDifficulty] = useState<'simple' | 'hard'>('simple');
  const [botDeckProfileId, setBotDeckProfileId] = useState<(typeof AI_OPPONENT_DECKS)[number]['id']>('white-temple');

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
  const token = localStorage.getItem('token');
  const selectedDeck = myDecks.find(deck => deck.id === selectedDeckId) || null;
  const selectedDeckValidation = validateDeckForBattle(selectedDeck);
  const selectedOpponentDeck = AI_OPPONENT_DECKS.find(deck => deck.id === botDeckProfileId) || AI_OPPONENT_DECKS[0];

  useEffect(() => {
    const loadDecks = async () => {
      if (!getAuthUser()) return;
      try {
        const res = await fetch(`${BACKEND_URL}/api/user/decks`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setMyDecks(data.decks || []);
        if (data.decks?.length > 0) setSelectedDeckId(data.decks[0].id);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    loadDecks();
  }, []);

  const handleStart = async () => {
    if (!selectedDeckValidation.valid) {
      alert(selectedDeckValidation.error || '请选择合法的卡组');
      return;
    }
    setStarting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/games/practice`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          deckId: selectedDeckId,
          turnTimerLimit: turnTime,
          botDifficulty,
          botDeckProfileId: botDifficulty === 'hard' ? botDeckProfileId : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '创建练习对局失败');
      }
      navigate(`/battle/${data.gameId}`, { state: { deckId: selectedDeckId } });
    } catch (e: any) {
      console.error(e);
      alert(e.message || '创建练习对局失败');
    } finally {
      setStarting(false);
    }
  };

  const renderDeckDropdown = () => (
    <div className="relative mb-8">
      <button
        type="button"
        onClick={() => setDeckDropdownOpen(open => !open)}
        className={cn(
          'flex w-full items-center justify-between rounded-xl border px-5 py-4 text-left transition-all',
          selectedDeckValidation.valid ? 'border-zinc-700 bg-zinc-950/70' : 'border-red-500/40 bg-red-950/20'
        )}
      >
        <div>
          <div className="text-base font-black text-white">{selectedDeck?.name || '请选择卡组'}</div>
          <div className="mt-1 text-xs font-bold text-zinc-500">
            {selectedDeck ? `${selectedDeck.cards.length} 张卡牌` : '练习前需要选择合法卡组'}
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
            className="absolute left-0 right-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2 shadow-2xl"
          >
            {myDecks.map((deck, index) => {
              const validation = validateDeckForBattle(deck);
              const active = selectedDeckId === deck.id;
              return (
                <button
                  key={deck.id || `deck-${index}`}
                  type="button"
                  onClick={() => {
                    setSelectedDeckId(deck.id);
                    setDeckDropdownOpen(false);
                  }}
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

  if (loading) {
    return (
      <PageFallback
        title="练习模式加载中"
        description="正在加载卡组列表和练习配置，请稍候..."
      />
    );
  }

  return (
    <div className="pt-20 px-8 min-h-screen bg-black text-white pb-20">
      <PageFallback
        title="正在创建练习对局"
        description="正在准备机器人、卡组和战场数据，请稍候..."
        open={starting}
      />
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        {/* Header */}
        <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-10 px-2 md:px-0">
          <button onClick={() => navigate('/')} className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          <div>
            <h1 className="text-xl md:text-3xl font-black italic tracking-tighter uppercase">练习模式</h1>
            <p className="text-zinc-500 text-[10px] md:text-sm font-bold tracking-widest leading-none">选择人机对手练习</p>
          </div>
        </div>

        {/* Bot Info */}
        {/* Bot Info */}
        <div className="mb-8 md:mb-10 p-4 md:p-6 rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-950 border border-zinc-800 flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 text-center md:text-left">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.3)] shrink-0">
            <Bot className="w-8 h-8 md:w-10 md:h-10 text-white" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-black italic tracking-tighter">人机对手</h2>
            <p className="text-zinc-500 text-[10px] md:text-sm mt-1">
              {botDifficulty === 'hard'
                ? `困难人机将使用「${selectedOpponentDeck.name}」作为对手卡组`
                : '简单人机会镜像你的卡组进行对战'}
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
              <span className="px-2 py-0.5 bg-white/5 rounded text-[8px] md:text-[10px] text-zinc-500 font-bold uppercase tracking-widest">• 自动出牌</span>
              <span className="px-2 py-0.5 bg-white/5 rounded text-[8px] md:text-[10px] text-zinc-500 font-bold uppercase tracking-widest">• 无限重赛</span>
              <span className="px-2 py-0.5 bg-white/5 rounded text-[8px] md:text-[10px] text-zinc-500 font-bold uppercase tracking-widest">• 不影响排名</span>
            </div>
          </div>
        </div>

        {/* Deck Selection */}
        <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">选择你的卡组</h2>
        {renderDeckDropdown()}

        {selectedDeckId && !selectedDeckValidation.valid && (
          <div className="mb-6 p-3 rounded-xl border border-red-500/30 bg-red-900/20 text-red-300 text-sm">
            当前选中的卡组不可用于机器人对战：{selectedDeckValidation.error}
          </div>
        )}

        <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">人机难度</h2>
            <span className="text-xs font-bold text-zinc-500">
              {botDifficulty === 'hard' ? '困难人机 Beta' : '简单策略'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: 'simple', label: '简单', detail: '保持当前逻辑' },
              { id: 'hard', label: '困难人机 Beta', detail: '启用评分策略' },
            ] as const).map(option => {
              const active = botDifficulty === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setBotDifficulty(option.id)}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-left transition-colors',
                    active ? 'border-red-500/60 bg-red-600/20 text-white' : 'border-zinc-800 bg-black/20 text-zinc-400 hover:bg-white/5'
                  )}
                >
                  <div className="text-sm font-black">{option.label}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{option.detail}</div>
                </button>
              );
            })}
          </div>
        </div>

        {botDifficulty === 'hard' && (
          <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500">人机卡组</h2>
              <span className="text-xs font-bold text-red-300">{selectedOpponentDeck.name}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {AI_OPPONENT_DECKS.map(option => {
                const active = botDeckProfileId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setBotDeckProfileId(option.id)}
                    className={cn(
                      'rounded-xl border px-4 py-3 text-left transition-colors',
                      active ? 'border-red-500/60 bg-red-600/20 text-white' : 'border-zinc-800 bg-black/20 text-zinc-400 hover:bg-white/5'
                    )}
                  >
                    <div className="text-sm font-black">{option.name}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{option.detail}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Turn Time Setting */}
        <div className="mb-10 p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">回合对局时间 (秒)</h2>
            <span className="text-2xl font-black italic tracking-tighter text-red-500">{turnTime}秒</span>
          </div>
          <input
            type="range"
            min="180"
            max="999"
            step="10"
            value={turnTime}
            onChange={(e) => setTurnTime(parseInt(e.target.value))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
          />
          <div className="flex justify-between mt-2 text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
            <span>最短 180 秒</span>
            <span>默认 300 秒</span>
            <span>最长 999 秒</span>
          </div>
        </div>

        {/* Start Button */}
        {/* Start Button */}
        <div className="flex justify-center mt-8 px-4 md:px-0">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleStart}
            disabled={starting || !selectedDeckId}
            className="w-full md:w-auto px-8 md:px-12 py-3 md:py-4 bg-gradient-to-r from-red-600 to-orange-600 rounded-2xl font-black italic text-base md:text-xl tracking-tighter flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(220,38,38,0.3)] disabled:opacity-50 transition-all uppercase"
          >
            {starting ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <Play className="w-5 h-5 md:w-6 md:h-6" />}
            开始练习
          </motion.button>
        </div>
      </div>
    </div>
  );
};
