import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Coins, Sparkles, ArrowLeft, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getCardImageUrl } from '../lib/utils';
import { Card } from '../types/game';
import { prefetchCardCatalog, useCardCatalog } from '../hooks/useCardCatalog';
import { readJsonResponse } from '../lib/http';
import { DEFAULT_CARD_BACK_URL } from '../data/customization';

const RARITY_COLORS: Record<string, string> = {
  C: 'border-zinc-500 shadow-zinc-500/20',
  U: 'border-emerald-500 shadow-emerald-500/30',
  R: 'border-blue-500 shadow-blue-500/30',
  SR: 'border-purple-500 shadow-purple-500/40',
  UR: 'border-amber-400 shadow-amber-400/50',
  SER: 'border-amber-400 shadow-amber-400/50',
  PR: 'border-rose-400 shadow-rose-400/40',
};
const RARITY_BG: Record<string, string> = {
  C: 'from-zinc-800', U: 'from-emerald-900/40', R: 'from-blue-900/40',
  SR: 'from-purple-900/50', UR: 'from-amber-900/50', SER: 'from-amber-900/50', PR: 'from-rose-900/40',
};
const RARITY_TEXT: Record<string, string> = {
  C: 'text-zinc-400', U: 'text-emerald-400', R: 'text-blue-400',
  SR: 'text-purple-400', UR: 'text-amber-400', SER: 'text-amber-300', PR: 'text-rose-400',
};

type DrawnCard = {
  id: string;
  uniqueId: string;
  rarity: string;
  revealed: boolean;
};

export const Store: React.FC = () => {
  const navigate = useNavigate();
  const [coins, setCoins] = useState(0);
  const [cardCrystals, setCardCrystals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
  const [allDrawnPacks, setAllDrawnPacks] = useState<DrawnCard[][]>([]);
  const [currentPackIndex, setCurrentPackIndex] = useState(0);
  const [packOpenSessionId, setPackOpenSessionId] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [pityInfo, setPityInfo] = useState({ packsSinceSR: 0, packsSinceUR: 0, totalPacks: 0 });
  const [selectedBasicCount, setSelectedBasicCount] = useState<number | null>(null);
  const [selectedPrizeCount, setSelectedPrizeCount] = useState<number | null>(null);
  const latestBuyRequestRef = useRef(0);
  const { getCardByReference } = useCardCatalog({
    includeEffects: false,
    enabled: showResult || allDrawnPacks.length > 0
  });

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
  const token = localStorage.getItem('token');

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/user/profile`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await readJsonResponse(res);
        setCoins(data?.coins || 0);
        setCardCrystals(data?.cardCrystals || 0);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    loadProfile();
  }, []);

  const handleBuyPack = async (packType: 'basic' | 'prize', count: number) => {
    if (buying) return;

    const singleCost = packType === 'prize' ? 20 : 10;
    const totalCost = singleCost * count;
    if (coins < totalCost) { alert('金币不足！'); return; }

    const requestId = latestBuyRequestRef.current + 1;
    latestBuyRequestRef.current = requestId;
    setBuying(`${packType}-${count}`);
    setDrawnCards([]);
    setShowResult(false);

    try {
      const res = await fetch(`${BACKEND_URL}/api/store/buy-pack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ packType, count }),
      });
      const data = await res.json();
      if (requestId !== latestBuyRequestRef.current) return;
      if (data.error) { alert(data.error); return; }

      try {
        await prefetchCardCatalog({ includeEffects: false });
      } catch (catalogError) {
        console.error('Failed to preload store card catalog:', catalogError);
      }
      if (requestId !== latestBuyRequestRef.current) return;

      setCoins(data.newCoins);
      setCardCrystals(data.newCardCrystals);

      // Group cards into packs (Basic: 5, Prize: 1)
      const packSize = packType === 'prize' ? 1 : 5;
      const packs: DrawnCard[][] = [];
      for (let i = 0; i < data.cards.length; i += packSize) {
        packs.push(data.cards.slice(i, i + packSize).map((c: any) => ({
          id: String(c.id),
          uniqueId: String(c.uniqueId || `${c.id}:${c.rarity}`),
          rarity: String(c.rarity),
          revealed: false
        })));
      }

      setPackOpenSessionId(requestId);
      setAllDrawnPacks(packs);
      setCurrentPackIndex(0);
      setDrawnCards(packs[0] || []);

      setPityInfo({
        packsSinceSR: data.packsSinceSR,
        packsSinceUR: data.packsSinceUR,
        totalPacks: data.totalPacks
      });
      setShowResult(true);
    } catch (e) {
      console.error(e);
      if (requestId === latestBuyRequestRef.current) alert('购买失败');
    } finally {
      if (requestId === latestBuyRequestRef.current) {
        setBuying(null);
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showResult) return;
      if (e.key === 'Enter') {
        // Prevent default behavior to avoid issues if any input has focus
        e.preventDefault();

        const allRevealed = drawnCards.every(c => c.revealed);
        if (!allRevealed) {
          revealAll();
        } else {
          nextPack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResult, drawnCards, currentPackIndex, allDrawnPacks]);

  const revealCard = (index: number) => {
    setDrawnCards(prev => prev.map((c, i) => i === index ? { ...c, revealed: true } : c));
  };

  const revealAll = () => {
    setDrawnCards(prev => prev.map(c => ({ ...c, revealed: true })));
  };

  const nextPack = () => {
    if (!drawnCards.length || !drawnCards.every(c => c.revealed)) return;

    if (currentPackIndex < allDrawnPacks.length - 1) {
      const nextIdx = currentPackIndex + 1;
      setCurrentPackIndex(nextIdx);
      setDrawnCards(allDrawnPacks[nextIdx]);
    } else {
      setShowResult(false);
    }
  };

  const getCardInfo = (card: DrawnCard) => getCardByReference(card.uniqueId) || getCardByReference(card.id);
  const currentPackRevealed = drawnCards.length > 0 && drawnCards.every(c => c.revealed);

  if (loading) {
    return (
      <div className="pt-24 flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="pt-20 px-8 min-h-screen bg-black text-white pb-20 overflow-x-hidden">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 md:mb-12 gap-6">
          <div className="flex items-center gap-4 md:gap-6 w-full md:w-auto">
            <button onClick={() => navigate('/')} className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 transition-all border border-white/5 group">
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1" />
            </button>
            <div>
              <h1 className="text-2xl md:text-4xl font-black italic tracking-tighter">卡牌商店</h1>
              <p className="text-zinc-500 text-[10px] md:text-sm font-bold uppercase tracking-widest leading-none">扩充你的卡牌收藏</p>
            </div>
          </div>
          <div className="flex gap-2 md:gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <div className="flex items-center gap-2 bg-gradient-to-r from-amber-900/30 to-amber-800/10 border border-amber-500/30 rounded-full px-4 md:px-6 py-1.5 md:py-2.5 shrink-0">
              <Coins className="w-4 h-4 md:w-5 md:h-5 text-amber-400" />
              <span className="text-amber-300 font-bold text-base md:text-xl">{coins.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 bg-gradient-to-r from-cyan-900/30 to-cyan-800/10 border border-cyan-500/30 rounded-full px-4 md:px-6 py-1.5 md:py-2.5 shrink-0">
              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-cyan-400" />
              <span className="text-cyan-300 font-bold text-base md:text-xl">{cardCrystals.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Pack Purchase Options */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 max-w-5xl mx-auto">
          {/* Basic Pack */}
          <div className="flex flex-col items-center gap-8">
            <motion.div
              whileHover={{ rotateY: 5, scale: 1.02 }}
              className={cn(
                "relative w-64 md:w-72 h-80 md:h-96 rounded-3xl border-4 overflow-hidden transition-all group",
                "border-red-600/30 shadow-[0_0_50px_rgba(220,38,38,0.1)] hover:border-red-500 hover:shadow-[0_0_60px_rgba(220,38,38,0.3)]"
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-red-950/40 via-black to-red-950/20" />
              <img src="assets/cardpack/basic.JPG" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" loading="lazy" decoding="async" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 md:gap-6 z-10 text-center px-6">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter uppercase mb-1">基础包</h2>
                  <p className="text-zinc-500 text-[8px] md:text-[10px] font-black tracking-[0.2em]">基础卡包</p>
                </div>
                <div className="w-full h-px bg-gradient-to-r from-transparent via-red-600/50 to-transparent" />
                <p className="text-[10px] md:text-xs text-zinc-400 font-bold leading-relaxed px-4">包含5张卡牌<br />保底一张R及以上稀有度</p>
              </div>
              {buying?.startsWith('basic') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/80 backdrop-blur-sm">
                  <Loader2 className="w-12 h-12 animate-spin text-red-500 mb-4" />
                  <span className="text-xs font-black italic text-red-500">处理中...</span>
                </div>
              )}
            </motion.div>

            <div className="flex gap-2 w-full max-w-[288px]">
              {[1, 10, 50].map(n => (
                <button
                  key={n}
                  disabled={!!buying}
                  onClick={() => setSelectedBasicCount(n)}
                  className={cn(
                    "flex-1 py-4 border rounded-2xl font-black italic text-sm transition-all flex flex-col items-center justify-center gap-1 group",
                    buying && "opacity-60 cursor-not-allowed",
                    selectedBasicCount === n
                      ? "bg-red-600 border-red-500 text-white"
                      : "bg-zinc-900 border-white/5 text-zinc-400 hover:border-red-500/50"
                  )}
                >
                  <span>{n} 包</span>
                </button>
              ))}
            </div>

            <AnimatePresence>
              {selectedBasicCount && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  onClick={() => handleBuyPack('basic', selectedBasicCount)}
                  disabled={!!buying}
                  className={cn(
                    "w-full max-w-[288px] py-4 bg-red-600 hover:bg-red-500 rounded-2xl font-black italic text-sm transition-all flex items-center justify-center gap-2 group shadow-[0_0_30px_rgba(220,38,38,0.2)]",
                    buying && "opacity-60 cursor-not-allowed hover:bg-red-600"
                  )}
                >
                  <Coins className="w-4 h-4" />
                  <span>购买 {selectedBasicCount} 包（{selectedBasicCount * 10} 金币）</span>
                </motion.button>
              )}
            </AnimatePresence>


          </div>

          {/* Prize Pack */}
          <div className="flex flex-col items-center gap-8">
            <motion.div
              whileHover={{ rotateY: -5, scale: 1.02 }}
              className={cn(
                "relative w-64 md:w-72 h-80 md:h-96 rounded-3xl border-4 overflow-hidden transition-all group",
                "border-rose-600/30 shadow-[0_0_50px_rgba(244,63,94,0.1)] hover:border-rose-500 hover:shadow-[0_0_60px_rgba(244,63,94,0.3)]"
              )}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-rose-950/40 via-black to-rose-950/20" />
              <img src="assets/cardpack/prize.JPG" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-700" loading="lazy" decoding="async" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 md:gap-6 z-10 text-center px-6">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter uppercase mb-1">奖品包</h2>
                  <p className="text-zinc-500 text-[8px] md:text-[10px] font-black tracking-[0.2em]">奖品卡包</p>
                </div>
                <div className="w-full h-px bg-gradient-to-r from-transparent via-rose-600/50 to-transparent" />
                <p className="text-[10px] md:text-xs text-zinc-400 font-bold leading-relaxed px-4">包含1张卡牌<br />必得PR稀有度奖品卡</p>
              </div>
              {buying?.startsWith('prize') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/80 backdrop-blur-sm">
                  <Loader2 className="w-12 h-12 animate-spin text-rose-500 mb-4" />
                  <span className="text-xs font-black italic text-rose-500">处理中...</span>
                </div>
              )}
            </motion.div>

            <div className="flex gap-2 w-full max-w-[288px]">
              {[1, 10, 50].map(n => (
                <button
                  key={n}
                  disabled={!!buying}
                  onClick={() => setSelectedPrizeCount(n)}
                  className={cn(
                    "flex-1 py-4 border rounded-2xl font-black italic text-sm transition-all flex flex-col items-center justify-center gap-1 group",
                    buying && "opacity-60 cursor-not-allowed",
                    selectedPrizeCount === n
                      ? "bg-rose-600 border-rose-500 text-white"
                      : "bg-zinc-900 border-white/5 text-zinc-400 hover:border-rose-500/50"
                  )}
                >
                  <span>{n} 包</span>
                </button>
              ))}
            </div>

            <AnimatePresence>
              {selectedPrizeCount && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  onClick={() => handleBuyPack('prize', selectedPrizeCount)}
                  disabled={!!buying}
                  className={cn(
                    "w-full max-w-[288px] py-4 bg-rose-600 hover:bg-rose-500 rounded-2xl font-black italic text-sm transition-all flex items-center justify-center gap-2 group shadow-[0_0_30px_rgba(244,63,94,0.2)]",
                    buying && "opacity-60 cursor-not-allowed hover:bg-rose-600"
                  )}
                >
                  <Coins className="w-4 h-4" />
                  <span>购买 {selectedPrizeCount} 包（{selectedPrizeCount * 20} 金币）</span>
                </motion.button>
              )}
            </AnimatePresence>


          </div>
        </div>

        {/* Card Opening Portal */}
        <AnimatePresence>
          {showResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center p-4 md:p-8 overflow-y-auto"
            >
              {/* Portal Background Glow */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] md:w-[800px] h-[300px] md:h-[800px] bg-red-600/20 blur-[60px] md:blur-[120px] rounded-full animate-pulse" />
              </div>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-7xl flex-1 flex flex-col relative z-10"
              >
                {/* Result Info */}
                <div className="flex flex-col md:flex-row items-center justify-between mb-4 md:mb-8 gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-red-500" />
                    </div>
                    <div>
                      <h2 className="text-lg md:text-2xl font-black italic uppercase tracking-tighter">开包成果</h2>
                      <p className="text-zinc-500 text-[8px] md:text-[10px] font-black uppercase tracking-widest leading-none">
                        第 {currentPackIndex + 1} / {allDrawnPacks.length} 包
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={revealAll}
                    className="w-full md:w-auto px-6 py-3 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 rounded-2xl font-black italic text-xs md:text-sm transition-all uppercase"
                  >
                    全部揭开
                  </button>
                </div>

                {/* Cards Grid - Forcing 3+2 on mobile via width restriction */}
                <div className="flex-1 flex flex-col items-center justify-center my-4">
                  <div className="flex flex-wrap items-center justify-center gap-3 md:gap-10 p-2 md:p-4 max-w-[320px] md:max-w-6xl mx-auto">
                    {drawnCards.map((drawn, i) => {
                      const card = getCardInfo(drawn);
                      return (
                        <motion.div
                          key={`${packOpenSessionId}-${currentPackIndex}-${drawn.uniqueId}-${i}`}
                          layout
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{
                            scale: drawn.revealed ? 1.05 : 1,
                            opacity: 1,
                            y: drawn.revealed ? -10 : 0
                          }}
                          transition={{
                            type: 'spring',
                            damping: 15,
                            stiffness: 100,
                            delay: i * 0.05
                          }}
                          className="relative w-[90px] md:w-64 aspect-[3/4] perspective-1000 group cursor-pointer shrink-0"
                          onClick={() => revealCard(i)}
                        >
                          {/* Hover Halo */}
                          {!drawn.revealed && (
                            <div className="absolute -inset-2 bg-red-600/0 group-hover:bg-red-600/30 blur-xl rounded-2xl transition-all duration-300 scale-90 group-hover:scale-100" />
                          )}

                          <motion.div
                            animate={{ rotateY: drawn.revealed ? 180 : 0 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                            className="w-full h-full relative transform-style-3d preserve-3d"
                          >
                            {/* Card Back (Face Down) */}
                            <div className={cn(
                              "absolute inset-0 backface-hidden rounded-xl md:rounded-2xl border-2 border-white/10 bg-zinc-900 group-hover:border-red-500/50 flex flex-col items-center justify-center p-2 md:p-4 transition-colors",
                              "shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                            )}>
                              <img src={DEFAULT_CARD_BACK_URL} className="absolute inset-0 w-full h-full object-cover opacity-20 rounded-2xl grayscale" loading="lazy" decoding="async" />
                              <div className="relative z-10 flex flex-col items-center gap-2">
                                <ShoppingBag className="w-10 h-10 text-zinc-700 group-hover:text-red-500 animation-pulse" />
                                <span className="text-[10px] font-black text-zinc-700 tracking-widest">卡包内容</span>
                              </div>
                            </div>

                            {/* Card Front (Revealed) */}
                            <div className={cn(
                              "absolute inset-0 backface-hidden rotateY-180 rounded-xl md:rounded-2xl border-2 bg-zinc-900 overflow-hidden",
                              RARITY_COLORS[drawn.rarity] || "border-zinc-800",
                              drawn.revealed && "shadow-[0_0_40px_rgba(255,255,255,0.1)] ring-2 ring-white/10",
                              "shadow-[0_15px_40px_rgba(0,0,0,0.7)]"
                            )}>
                              {card ? (
                                <>
                                  <img
                                    src={card.fullImageUrl || getCardImageUrl(card.id, drawn.rarity, false, card.availableRarities)}
                                    className="w-full h-full object-cover"
                                    decoding="async"
                                  />
                                  <div className={cn("absolute inset-0 bg-gradient-to-t to-transparent", RARITY_BG[drawn.rarity])} />
                                  <div className="absolute bottom-0 left-0 right-0 p-2 text-center">
                                    <p className="text-[9px] font-black truncate text-white uppercase italic tracking-tighter">{card.fullName}</p>
                                    <span className={cn("text-[9px] font-black", RARITY_TEXT[drawn.rarity])}>{drawn.rarity}</span>
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-700 font-black">?</div>
                              )}
                            </div>
                          </motion.div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Confirm Button */}
                <div className="mt-12 text-center pb-8 border-t border-white/5 pt-8">
                  <button
                    onClick={nextPack}
                    disabled={!currentPackRevealed}
                    className={cn(
                      "px-10 md:px-20 py-3 md:py-5 rounded-full text-base md:text-xl font-black italic tracking-tighter uppercase transition-all hover:scale-110 active:scale-95",
                      currentPackRevealed
                        ? "bg-red-600 shadow-[0_0_50px_rgba(220,38,38,0.4)] text-white"
                        : "bg-zinc-900 text-zinc-500 cursor-not-allowed hover:scale-100"
                    )}
                  >
                    {currentPackIndex < allDrawnPacks.length - 1 ? "下一包" : "确认"}
                  </button>
                  <p className="text-[10px] text-zinc-600 mt-4 font-bold uppercase tracking-widest transition-opacity duration-300">
                    {currentPackRevealed
                      ? (currentPackIndex < allDrawnPacks.length - 1 ? `已揭开第 ${currentPackIndex + 1} 包` : "所有卡牌已入库")
                      : "请先揭开本包所有卡牌"}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Extraction Rules */}
        <div className="mt-24 p-8 rounded-3xl bg-zinc-900/40 border border-white/5 backdrop-blur-md">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-600/20 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-xl font-black italic tracking-tighter">抽取规则</h3>
              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">请在购买前仔细阅读</p>
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="flex gap-4 group">
              <span className="text-red-600 font-black italic">01</span>
              <p className="text-sm text-zinc-400 font-bold leading-relaxed">
                基础包每包花费 <span className="text-red-500">10</span> 金币，每包内包含 <span className="text-red-500">5</span> 张卡，每包必得一张 <span className="text-red-500 font-black">R</span> 或以上稀有度的卡牌。
              </p>
            </div>
            <div className="flex gap-4 group">
              <span className="text-red-600 font-black italic">02</span>
              <p className="text-sm text-zinc-400 font-bold leading-relaxed">
                奖品包每包花费 <span className="text-red-500">20</span> 金币，每包内包含 <span className="text-red-500">1</span> 张卡，每包必得一张 <span className="text-red-500 font-black">PR</span> 稀有度得卡牌。
              </p>
            </div>
            <div className="flex gap-4 group">
              <span className="text-red-600 font-black italic">03</span>
              <p className="text-sm text-zinc-400 font-bold leading-relaxed">
                基础包每 <span className="text-red-500">10</span> 包必得一张 <span className="text-red-500 font-black">SR</span> 稀有度的卡牌，当前剩余：<span className="text-red-500 font-black">{Math.max(0, 10 - pityInfo.packsSinceSR)}</span>
              </p>
            </div>
            <div className="flex gap-4 group">
              <span className="text-red-600 font-black italic">04</span>
              <p className="text-sm text-zinc-400 font-bold leading-relaxed">
                基础包每 <span className="text-red-500">50</span> 包必得一张 <span className="text-red-500 font-black">UR/SER</span> 稀有度的卡牌，当前剩余：<span className="text-red-500 font-black">{Math.max(0, 50 - pityInfo.packsSinceUR)}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .backface-hidden { backface-visibility: hidden; }
        .transform-style-3d { transform-style: preserve-3d; }
        .preserve-3d { transform-style: preserve-3d; }
        .rotateY-180 { transform: rotateY(180deg); }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
};
