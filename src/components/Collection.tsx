import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Search, Loader2, Layout, CreditCard, Image as ImageIcon, Trash2, Plus, Check, Save, Sparkles, Share2, UploadCloud } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getCardImageUrl } from '../lib/utils';
import { CARD_BACKS, RAY_CARDS } from '../data/customization';
import { FACTIONS } from '../data/factions';
import { Card, Deck } from '../types/game';
import { CardComponent } from './Card';
import { useCardCatalog } from '../hooks/useCardCatalog';
import { KeywordBadges } from './KeywordBadges';
import { readJsonResponse } from '../lib/http';
import { SEARCHABLE_CARD_PACKAGES, matchesCardPackageFilter, matchesCardTypeFilter } from '../lib/cardCatalogFilters';
import { validateDeckForBattle } from '../lib/deckValidation';
import { encodeDeckShareCode } from '../lib/deckShareCode';
import { getCardSkinUrl } from '../data/cardSkins';
import { useCardSkinSettings } from '../hooks/useCardSkinSettings';
import { CardSkinToggle } from './CardSkinToggle';
import { getDeckCardIds } from '../lib/deckEntries';

const RARITY_BADGE: Record<string, string> = {
  C: 'bg-zinc-700 text-zinc-300', U: 'bg-emerald-900 text-emerald-300', R: 'bg-blue-900 text-blue-300',
  SR: 'bg-purple-900 text-purple-300', UR: 'bg-amber-900 text-amber-300', SER: 'bg-amber-800 text-amber-200', PR: 'bg-rose-900 text-rose-300',
};


type CollectionTab = 'DECKS' | 'CARDS' | 'BACKS' | 'RAY_CARDS';
const INITIAL_VISIBLE_CARD_COUNT = 48;

export const Collection: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as CollectionTab) || 'CARDS';

  const [activeTab, setActiveTab] = useState<CollectionTab>(initialTab);
  const [collection, setCollection] = useState<Record<string, number>>({});
  const [decks, setDecks] = useState<Deck[]>([]);
  const [profile, setProfile] = useState<{ favoriteCardId: string; favoriteBackId: string; coins: number; cardCrystals: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [publishingDeckId, setPublishingDeckId] = useState<string | null>(null);
  const [deckNotice, setDeckNotice] = useState('');

  // Card Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRarity, setFilterRarity] = useState<string | null>(null);
  const [filterColor, setFilterColor] = useState<string | null>(null);
  const [visibleCardCount, setVisibleCardCount] = useState(INITIAL_VISIBLE_CARD_COUNT);
  const [filters, setFilters] = useState({
    ac: '', damage: '', power: '', cardPackage: 'ALL', cardType: 'ALL', faction: 'ALL', ownership: 'ALL', godMark: 'ALL'
  });
  const deferredSearchTerm = useDeferredValue(searchTerm.trim());
  const {
    cards: cardLibrary,
    getCardByReference,
    loading: cardsLoading
  } = useCardCatalog({ includeEffects: false });
  const { isCardSkinEnabled } = useCardSkinSettings();

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
  const token = localStorage.getItem('token');

  const getDisplayCardImageUrl = (card: Card) => {
    const baseUrl = card.fullImageUrl || getCardImageUrl(card.id, card.rarity, false, card.availableRarities);
    return (isCardSkinEnabled(card) && getCardSkinUrl(card)) || card.imageUrl || baseUrl;
  };

  const CRYSTAL_VALUES: Record<string, { decompose: number, produce: number }> = {
    C: { decompose: 1, produce: 5 },
    U: { decompose: 1, produce: 5 },
    R: { decompose: 5, produce: 20 },
    SR: { decompose: 20, produce: 80 },
    UR: { decompose: 100, produce: 400 },
    SER: { decompose: 400, produce: 1600 },
    PR: { decompose: 100, produce: 400 },
  };

  const fetchData = async () => {
    try {
      const [collRes, deckRes, profRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/user/collection`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BACKEND_URL}/api/user/decks`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BACKEND_URL}/api/user/profile`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const collData = await readJsonResponse(collRes);
      const deckData = await readJsonResponse(deckRes);
      const profData = await readJsonResponse(profRes);

      setCollection(collData?.collection || {});
      setDecks(deckData?.decks || []);
      setProfile({
        favoriteCardId: profData?.favoriteCardId || 'fav_card',
        favoriteBackId: profData?.favoriteBackId || 'default',
        coins: profData?.coins || 0,
        cardCrystals: profData?.cardCrystals || 0
      });
    } catch (e) {
      console.error('Failed to fetch collection data:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [BACKEND_URL, token]);

  useEffect(() => {
    setVisibleCardCount(INITIAL_VISIBLE_CARD_COUNT);
  }, [deferredSearchTerm, filterRarity, filterColor, filters]);

  const handleDecompose = async (cardId: string) => {
    if (!profile) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/decompose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ cardId })
      });
      const data = await res.json();
      if (data.success) {
        setProfile({ ...profile, cardCrystals: data.newCardCrystals });
        setCollection(prev => {
          const next = { ...prev };
          if (next[cardId] > 1) next[cardId]--;
          else delete next[cardId];
          return next;
        });
      } else {
        alert(data.error || '分解失败');
      }
    } catch (e) { console.error(e); }
    setActionLoading(false);
  };

  const handleCraft = async (cardId: string) => {
    if (!profile) return;
    const card = getCardByReference(cardId);
    if (!card) return;
    const cost = CRYSTAL_VALUES[card.rarity]?.produce || 0;
    if (profile.cardCrystals < cost) { alert('卡晶不足'); return; }

    setActionLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/craft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ cardId })
      });
      const data = await res.json();
      if (data.success) {
        setProfile({ ...profile, cardCrystals: data.newCardCrystals });
        setCollection(prev => ({
          ...prev,
          [cardId]: (prev[cardId] || 0) + 1
        }));
      } else {
        alert(data.error || '制作失败');
      }
    } catch (e) { console.error(e); }
    setActionLoading(false);
  };

  const deleteDeck = async (id: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/decks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDecks(prev => prev.filter(d => d.id !== id));
        setConfirmDeleteId(null);
      }
    } catch (e) {
      console.error('Failed to delete deck:', e);
    }
  };

  const handleUpdateProfile = async (updates: Partial<{ favoriteCardId: string; favoriteBackId: string }>) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        setProfile(prev => prev ? { ...prev, ...updates } : null);
      }
    } catch (e) {
      console.error('Failed to update profile:', e);
    }
  };

  const favoriteBackUrl = useMemo(
    () => CARD_BACKS.find(back => back.id === profile?.favoriteBackId)?.url,
    [profile?.favoriteBackId]
  );

  const catalogRefs = useMemo(
    () => cardLibrary.map(card => card.uniqueId).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [cardLibrary]
  );

  const copyTextToClipboard = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    throw new Error('当前浏览器不支持复制');
  };

  const shareDeck = async (deck: Deck) => {
    if (!catalogRefs.length) {
      alert('卡牌库尚未加载完成');
      return;
    }

    const validation = validateDeckForBattle(deck, getCardByReference);
    if (!validation.valid) {
      alert(validation.error || '只有合法卡组才能分享');
      return;
    }

    try {
      const code = encodeDeckShareCode(getDeckCardIds(deck.cards), catalogRefs);
      setShareCode(code);
      setShareCopied(false);
      setShowShareModal(true);

      try {
        await copyTextToClipboard(code);
        setShareCopied(true);
      } catch {
        // The modal remains available when clipboard access is blocked.
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '生成分享码失败');
    }
  };

  const publishDeck = async (deck: Deck) => {
    const validation = validateDeckForBattle(deck, getCardByReference);
    if (!validation.valid) {
      alert(validation.error || '只有合法卡组才能发布');
      return;
    }

    setPublishingDeckId(deck.id);
    setDeckNotice('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/deck-square/publish`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deckId: deck.id })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '发布失败');
      setDeckNotice(data.updated ? `已更新发布《${deck.name}》` : `已发布《${deck.name}》到套牌广场`);
    } catch (e: any) {
      alert(e.message || '发布失败');
    } finally {
      setPublishingDeckId(null);
    }
  };

  const ownedCardCount = useMemo(() =>
    cardLibrary.filter(card => (collection[card.uniqueId] || 0) > 0).length,
    [cardLibrary, collection]
  );

  const filteredCards = useMemo(() => cardLibrary.filter(card => {
    if (deferredSearchTerm && !card.fullName.includes(deferredSearchTerm) && !(card.specialName && card.specialName.includes(deferredSearchTerm))) return false;
    if (filterRarity && card.rarity !== filterRarity) return false;
    if (filterColor && card.color !== filterColor) return false;
    if (!matchesCardTypeFilter(card, filters.cardType)) return false;
    if (filters.ac !== '' && card.acValue.toString() !== filters.ac) return false;
    if (card.type === 'UNIT' && filters.damage !== '' && card.damage?.toString() !== filters.damage) return false;
    if (card.type === 'UNIT' && filters.power !== '' && card.power?.toString() !== filters.power) return false;
    if (!matchesCardPackageFilter(card.cardPackage, filters.cardPackage)) return false;
    if (filters.faction !== 'ALL' && card.faction !== filters.faction) return false;
    if (filters.godMark === 'GOD_MARK' && !card.godMark) return false;
    if (filters.godMark === 'NON_GOD_MARK' && card.godMark) return false;
    const isOwned = (collection[card.uniqueId] || 0) > 0;
    if (filters.ownership === 'OWNED' && !isOwned) return false;
    if (filters.ownership === 'NOT_OWNED' && isOwned) return false;
    return true;
  }), [cardLibrary, collection, deferredSearchTerm, filterColor, filterRarity, filters]);

  const visibleCards = useMemo(
    () => filteredCards.slice(0, visibleCardCount),
    [filteredCards, visibleCardCount]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pt-24 pb-20 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header and Tab Switcher */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="flex items-center gap-6">
            <button onClick={() => navigate('/')} className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 transition-all border border-white/5 group">
              <ArrowLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
            </button>
            <div>
              <h1 className="text-2xl md:text-4xl font-black italic tracking-tighter uppercase">我的收藏</h1>
              <div className="flex gap-2 mt-4 overflow-x-auto pb-2 custom-scrollbar">
                <TabButton active={activeTab === 'DECKS'} onClick={() => setActiveTab('DECKS')} icon={<Layout className="w-4 h-4" />} label="卡组" />
                <TabButton active={activeTab === 'CARDS'} onClick={() => setActiveTab('CARDS')} icon={<CreditCard className="w-4 h-4" />} label="卡牌" />
                <TabButton active={activeTab === 'BACKS'} onClick={() => setActiveTab('BACKS')} icon={<ImageIcon className="w-4 h-4" />} label="卡背" />
                <TabButton active={activeTab === 'RAY_CARDS'} onClick={() => setActiveTab('RAY_CARDS')} icon={<Plus className="w-4 h-4" />} label="雷亚卡" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 bg-zinc-900/50 p-2 rounded-2xl border border-white/5 overflow-x-auto">
            <div className="px-3 md:px-4 py-1 md:py-2 text-center shrink-0">
              <p className="text-[8px] md:text-[10px] text-zinc-500 uppercase font-bold">已拥有</p>
              <p className="text-sm md:text-xl font-black italic">{ownedCardCount}</p>
            </div>
            <div className="w-px h-6 md:h-8 bg-white/10 shrink-0" />
            <div className="px-3 md:px-4 py-1 md:py-2 text-center shrink-0">
              <p className="text-[8px] md:text-[10px] text-zinc-500 uppercase font-bold">金币</p>
              <p className="text-sm md:text-xl font-black italic text-amber-400">{(profile?.coins || 0).toLocaleString()}</p>
            </div>
            <div className="w-px h-6 md:h-8 bg-white/10 shrink-0" />
            <div className="px-3 md:px-4 py-1 md:py-2 text-center shrink-0">
              <p className="text-[8px] md:text-[10px] text-zinc-500 uppercase font-bold">卡晶</p>
              <p className="text-sm md:text-xl font-black italic text-cyan-400">{(profile?.cardCrystals || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {activeTab === 'DECKS' && (
            <motion.div key="decks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <button
                onClick={() => navigate('/deck-builder')}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-600/10 px-5 py-4 text-left transition-all hover:border-red-500 hover:bg-red-600/20"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-lg font-black italic tracking-tighter text-white">创建新卡组</span>
                    <span className="text-xs font-bold text-zinc-500">从空卡组开始构筑</span>
                  </span>
                </span>
                <ArrowLeft className="h-5 w-5 rotate-180 text-red-300" />
              </button>
              <div className="space-y-3">
                {decks.map((deck, index) => (
                  <DeckCard
                    key={deck.id || `deck-${index}`}
                    deck={deck}
                    onClick={() => navigate(`/deck-builder?id=${deck.id}`)}
                    onDelete={() => setConfirmDeleteId(deck.id)}
                    onShare={() => shareDeck(deck)}
                    onPublish={() => publishDeck(deck)}
                    publishing={publishingDeckId === deck.id}
                  />
                ))}
                {deckNotice && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
                    {deckNotice}
                  </div>
                )}
                {decks.length === 0 && (
                  <div className="py-20 bg-zinc-900/20 border-2 border-dashed border-zinc-800 rounded-3xl flex flex-col items-center justify-center text-zinc-500">
                    <Layout className="w-12 h-12 mb-4 opacity-20" />
                    <p>暂无卡组，快去创建一个吧</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'CARDS' && (
            <motion.div key="cards" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              {cardsLoading ? (
                <div className="flex min-h-[320px] items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-red-600" />
                </div>
              ) : (
                <>
              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="flex gap-4 flex-wrap w-full md:w-auto md:flex-1">
                  <div className="relative flex-1 min-w-[200px] md:min-w-[300px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-zinc-500" />
                    <input
                      className="w-full bg-zinc-900 border border-white/5 rounded-2xl pl-10 md:pl-12 pr-4 py-2 md:py-3.5 focus:outline-none focus:ring-2 focus:ring-red-600/50 transition-all font-medium text-sm"
                      placeholder="搜索卡牌名称..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1.5 p-1.5 bg-zinc-900/50 rounded-2xl border border-white/5 overflow-x-auto">
                    {['RED', 'BLUE', 'GREEN', 'YELLOW', 'WHITE'].map(c => (
                      <button
                        key={c}
                        onClick={() => setFilterColor(filterColor === c ? null : c)}
                        className={cn(
                          "w-8 h-8 md:w-10 md:h-10 rounded-xl border-2 transition-all flex items-center justify-center shrink-0",
                          filterColor === c ? 'border-white scale-105' : 'border-transparent hover:scale-105',
                          c === 'RED' && 'bg-red-700', c === 'BLUE' && 'bg-blue-700',
                          c === 'GREEN' && 'bg-green-700', c === 'YELLOW' && 'bg-yellow-600',
                          c === 'WHITE' && 'bg-zinc-300',
                        )}
                      >
                        {filterColor === c && <Check className={cn("w-4 h-4 md:w-5 md:h-5", c === 'WHITE' ? 'text-black' : 'text-white')} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-3">
                  {['C', 'U', 'R', 'SR', 'UR', 'SER', 'PR'].map(r => (
                    <button
                      key={r}
                      onClick={() => setFilterRarity(filterRarity === r ? null : r)}
                      className={cn(
                        "py-2 md:py-2.5 rounded-xl text-[10px] md:text-xs font-black transition-all border",
                        filterRarity === r ? `${RARITY_BADGE[r]} border-white` : "bg-zinc-900/50 border-white/5 text-zinc-500 hover:bg-zinc-800"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                  <select
                    className="bg-zinc-900/50 border border-white/5 rounded-xl px-2 md:px-3 py-2 md:py-2.5 text-[10px] md:text-xs font-bold text-white focus:outline-none"
                    value={filters.ownership}
                    onChange={e => setFilters({ ...filters, ownership: e.target.value })}
                  >
                    <option value="ALL">全部状态</option>
                    <option value="OWNED">已拥有</option>
                    <option value="NOT_OWNED">未拥有</option>
                  </select>

                  <select
                    className="bg-zinc-900/50 border border-white/5 rounded-xl px-2 md:px-3 py-2 md:py-2.5 text-[10px] md:text-xs font-bold text-white focus:outline-none"
                    value={filters.faction}
                    onChange={e => setFilters({ ...filters, faction: e.target.value })}
                  >
                    <option value="ALL">全部势力</option>
                    {FACTIONS.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>

                  <select
                    className="bg-zinc-900/50 border border-white/5 rounded-xl px-2 md:px-3 py-2 md:py-2.5 text-[10px] md:text-xs font-bold text-white focus:outline-none"
                    value={filters.godMark}
                    onChange={e => setFilters({ ...filters, godMark: e.target.value })}
                  >
                    <option value="ALL">全部神蚀</option>
                    <option value="GOD_MARK">神蚀卡</option>
                    <option value="NON_GOD_MARK">非神蚀卡</option>
                  </select>

                  <input
                    className="bg-zinc-900/50 border border-white/5 rounded-xl px-2 md:px-3 py-2 md:py-2.5 text-[10px] md:text-xs font-bold text-white focus:outline-none"
                    placeholder="AC费用"
                    value={filters.ac}
                    onChange={e => setFilters({ ...filters, ac: e.target.value })}
                  />
                  <select
                    className="bg-zinc-900/50 border border-white/5 rounded-xl px-2 md:px-3 py-2 md:py-2.5 text-[10px] md:text-xs font-bold text-white focus:outline-none"
                    value={filters.cardType}
                    onChange={e => setFilters({ ...filters, cardType: e.target.value, damage: '', power: '' })}
                  >
                    <option value="ALL">全部类型</option>
                    <option value="UNIT">单位卡</option>
                    <option value="STORY">故事卡</option>
                    <option value="ITEM">道具卡</option>
                  </select>
                  {filters.cardType !== 'STORY' && filters.cardType !== 'ITEM' && (
                    <>
                      <input
                        className="bg-zinc-900/50 border border-white/5 rounded-xl px-2 md:px-3 py-2 md:py-2.5 text-[10px] md:text-xs font-bold text-white focus:outline-none"
                        placeholder="伤害"
                        value={filters.damage}
                        onChange={e => setFilters({ ...filters, damage: e.target.value })}
                      />
                      <input
                        className="bg-zinc-900/50 border border-white/5 rounded-xl px-2 md:px-3 py-2 md:py-2.5 text-[10px] md:text-xs font-bold text-white focus:outline-none"
                        placeholder="力量"
                        value={filters.power}
                        onChange={e => setFilters({ ...filters, power: e.target.value })}
                      />
                    </>
                  )}
                  <select
                    className="bg-zinc-900/50 border border-white/5 rounded-xl px-2 md:px-3 py-2 md:py-2.5 text-[10px] md:text-xs font-bold text-white focus:outline-none"
                    value={filters.cardPackage}
                    onChange={e => setFilters({ ...filters, cardPackage: e.target.value })}
                  >
                    <option value="ALL">全部卡包</option>
                    {SEARCHABLE_CARD_PACKAGES.map(pack => (
                      <option key={pack} value={pack}>{pack}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {visibleCards.map((card, index) => {
                  const qty = collection[card.uniqueId] || 0;
                  const isOwned = qty > 0;
                  return (
                    <motion.div
                      key={card.uniqueId || card.id || `card-${index}`}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => setSelectedCard(card)}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: '220px 320px' }}
                      className={cn("relative group transition-all duration-300 cursor-pointer", !isOwned && "opacity-40 grayscale-[0.8] hover:grayscale-0 hover:opacity-80")}
                    >
                      <CardComponent
                        card={card}
                        displayMode="deck"
                        cardBackUrl={favoriteBackUrl}
                      />
                      <div className="absolute -top-2 -right-2 z-10">
                        <div className={cn(
                          "px-2.5 py-1 rounded-lg border font-black italic text-xs shadow-xl min-w-[30px] text-center",
                          isOwned ? "bg-red-600 border-red-400 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-500"
                        )}>
                          x{qty}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              {filteredCards.length > visibleCards.length && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={() => setVisibleCardCount(current => current + INITIAL_VISIBLE_CARD_COUNT)}
                    className="rounded-2xl border border-white/10 bg-zinc-900 px-8 py-3 text-sm font-black italic text-zinc-300 transition-all hover:border-red-500/40 hover:text-white"
                  >
                    加载更多卡牌 ({visibleCards.length}/{filteredCards.length})
                  </button>
                </div>
              )}
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'BACKS' && (
            <motion.div key="backs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {CARD_BACKS.map((back, index) => (
                  <div key={back.id || `back-${index}`} className="relative group flex flex-col gap-4">
                    <div className={cn(
                      "aspect-[2.5/3.5] rounded-2xl overflow-hidden border-4 transition-all duration-500 relative bg-zinc-900",
                      profile?.favoriteBackId === back.id ? "border-red-600 scale-[1.02] shadow-[0_0_30px_rgba(220,38,38,0.3)]" : "border-zinc-800 grayscale group-hover:grayscale-0 group-hover:border-zinc-600"
                    )}>
                      <img src={back.url} alt={back.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      {profile?.favoriteBackId === back.id && (
                        <div className="absolute top-4 right-4 bg-red-600 p-2 rounded-xl shadow-xl">
                          <Check className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="px-2 text-center">
                      <h3 className="font-black italic text-lg uppercase tracking-wider">{back.name}</h3>
                      <button
                        onClick={() => handleUpdateProfile({ favoriteBackId: back.id })}
                        disabled={profile?.favoriteBackId === back.id}
                        className={cn(
                          "mt-3 w-full py-3 rounded-xl font-bold text-sm transition-all",
                          profile?.favoriteBackId === back.id
                            ? "bg-zinc-900 text-zinc-600 cursor-default"
                            : "bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white"
                        )}
                      >
                        {profile?.favoriteBackId === back.id ? '使用中' : '点击使用'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'RAY_CARDS' && (
            <motion.div key="ray" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
                {RAY_CARDS.map((rc, index) => (
                  <div key={rc.id || `ray-${index}`} className="relative group">
                    <div className={cn(
                      "aspect-video rounded-3xl overflow-hidden border-4 transition-all duration-500 relative bg-zinc-900",
                      profile?.favoriteCardId === rc.id ? "border-red-600 scale-[1.02] shadow-[0_0_40px_rgba(220,38,38,0.4)]" : "border-zinc-800 grayscale group-hover:grayscale-0 group-hover:border-zinc-600"
                    )}>
                      <img src={rc.url} alt={rc.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" loading="lazy" decoding="async" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="mt-6 flex items-center justify-between px-2">
                      <div>
                        <h3 className="font-black italic text-xl uppercase tracking-tighter">{rc.name}</h3>
                        <p className="text-zinc-500 text-xs text-left">雷亚卡收藏 (背景模式)</p>
                      </div>
                      <button
                        onClick={() => handleUpdateProfile({ favoriteCardId: rc.id })}
                        className={cn(
                          "p-4 rounded-2xl transition-all shadow-xl",
                          profile?.favoriteCardId === rc.id
                            ? "bg-red-600 text-white cursor-default scale-110"
                            : "bg-zinc-900 text-zinc-500 hover:bg-red-600/20 hover:text-red-500"
                        )}
                      >
                        {profile?.favoriteCardId === rc.id ? <Check className="w-6 h-6" /> : <Save className="w-6 h-6" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Synthesis Modal */}
        <AnimatePresence>
          {selectedCard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md"
              onClick={() => setSelectedCard(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-zinc-900 border border-white/10 rounded-[2rem] md:rounded-[3rem] p-0 md:p-10 max-w-5xl w-full flex flex-col md:flex-row gap-0 md:gap-12 relative overflow-y-auto md:overflow-hidden shadow-2xl max-h-[92vh] md:max-h-[90vh] custom-scrollbar"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCard(null);
                  }}
                  className="absolute top-6 left-6 z-[110] px-4 py-2 bg-zinc-800/90 hover:bg-zinc-700 border border-white/20 rounded-xl text-white shadow-2xl transition-all group flex items-center gap-2"
                  title="返回"
                >
                  <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-[10px] font-black italic uppercase tracking-widest hidden md:block">返回</span>
                </button>
                {/* Large Card Image */}
                <div className="w-full md:w-2/5 flex items-center justify-center p-6 md:p-0 bg-zinc-800/20 md:bg-transparent">
                  <div className="relative group w-full max-w-[240px] md:max-w-none">
                    <div className={cn(
                      "absolute -inset-4 rounded-[2rem] blur-2xl opacity-10",
                      selectedCard.rarity === 'UR' || selectedCard.rarity === 'SER' ? 'bg-amber-500' : 'bg-red-600'
                    )} />
                    <img
                      src={getDisplayCardImageUrl(selectedCard)}
                      alt={selectedCard.fullName}
                      className="relative w-full object-contain rounded-[1.5rem] shadow-2xl border-4 border-white/10 max-h-[45vh] md:max-h-none"
                      decoding="async"
                      onError={(event) => {
                        const fallback = getCardImageUrl(selectedCard.id, selectedCard.rarity, false, selectedCard.availableRarities);
                        if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                      }}
                    />
                    <div className="absolute bottom-4 -right-2 bg-red-600 px-3 py-1.5 rounded-xl border border-red-400 font-black italic shadow-2xl rotate-12 z-20">
                      <span className="text-sm">x{collection[selectedCard.uniqueId] || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Console & Details */}
                <div className="flex-1 flex flex-col p-6 md:p-6 overflow-hidden md:overflow-visible">
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">{selectedCard.id}</span>
                      <div className="h-px w-12 bg-red-500/30" />
                    </div>
                    <h2 className="text-3xl md:text-5xl font-black italic text-white uppercase tracking-tighter leading-none mb-1">
                      {selectedCard.fullName}
                    </h2>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">关键词</p>
                    <KeywordBadges card={selectedCard} variant="detail" />
                  </div>

                  <CardSkinToggle card={selectedCard} className="mt-4" />

                  <div className="flex-1 md:overflow-y-auto pr-0 md:pr-2 custom-scrollbar space-y-6">

                    {/* Synthesis Console Area */}
                    <div className="space-y-4 pt-4">
                      {/* <h3 className="text-[11px] font-black text-cyan-400 uppercase tracking-[0.4em] flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                        Synthesis Console
                      </h3> */}

                      {/* Decompose */}
                      <div className="p-4 md:p-6 rounded-3xl bg-zinc-800/50 border border-white/5 flex items-center justify-between group hover:bg-zinc-800 transition-all">
                        <div>
                          <p className="text-[10px] font-black text-zinc-500 uppercase italic mb-1">分解</p>
                          <div className="flex items-center gap-2">
                            <Trash2 className="w-5 h-5 text-red-500" />
                            <span className="text-xl md:text-2xl font-black italic text-cyan-400">+{CRYSTAL_VALUES[selectedCard.rarity]?.decompose || 0}</span>
                            <Sparkles className="w-4 h-4 text-cyan-400" />
                          </div>
                        </div>
                        <button
                          onClick={() => handleDecompose(selectedCard.uniqueId)}
                          disabled={actionLoading || (collection[selectedCard.uniqueId] || 0) <= 0}
                          className={cn(
                            "px-6 md:px-8 py-2 md:py-3 rounded-2xl font-black italic text-xs md:text-sm transition-all uppercase",
                            (collection[selectedCard.uniqueId] || 0) > 0
                              ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20"
                              : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                          )}
                        >
                          {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '分解'}
                        </button>
                      </div>

                      {/* Craft */}
                      <div className="p-4 md:p-6 rounded-3xl bg-zinc-800/50 border border-white/5 flex items-center justify-between group hover:bg-zinc-800 transition-all">
                        <div>
                          <p className="text-[10px] font-black text-zinc-500 uppercase italic mb-1">制作</p>
                          <div className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-green-500" />
                            <span className="text-xl md:text-2xl font-black italic text-red-500">-{CRYSTAL_VALUES[selectedCard.rarity]?.produce || 0}</span>
                            <Sparkles className="w-4 h-4 text-cyan-400" />
                          </div>
                        </div>
                        <button
                          onClick={() => handleCraft(selectedCard.uniqueId)}
                          disabled={actionLoading || (profile?.cardCrystals || 0) < (CRYSTAL_VALUES[selectedCard.rarity]?.produce || 0)}
                          className={cn(
                            "px-6 md:px-8 py-2 md:py-3 rounded-2xl font-black italic text-xs md:text-sm transition-all uppercase",
                            (profile?.cardCrystals || 0) >= (CRYSTAL_VALUES[selectedCard.rarity]?.produce || 0)
                              ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20"
                              : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                          )}
                        >
                          {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '制作'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 md:mt-8 pt-6 md:pt-8 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-cyan-400" />
                      <div>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase">当前卡晶</p>
                        <p className="text-lg md:text-xl font-black italic text-cyan-400">{(profile?.cardCrystals || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    <button onClick={() => setSelectedCard(null)} className="text-zinc-500 hover:text-white font-black italic text-sm uppercase transition-colors">
                      关闭
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {confirmDeleteId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setConfirmDeleteId(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] max-w-md w-full shadow-2xl relative overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-50" />

                <div className="flex flex-col items-center text-center mb-8">
                  <div className="w-16 h-16 bg-red-600/10 rounded-2xl flex items-center justify-center mb-6 text-red-600 border border-red-600/20">
                    <Trash2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-black italic tracking-tighter uppercase mb-2">删除卡组?</h3>
                  <p className="text-zinc-500 font-medium">确定要永久删除这个卡组吗？<br />此操作无法被撤销。</p>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-black italic rounded-2xl transition-all uppercase tracking-widest text-xs"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => deleteDeck(confirmDeleteId)}
                    className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white font-black italic rounded-2xl transition-all shadow-lg shadow-red-600/20 uppercase tracking-widest text-xs"
                  >
                    确认删除
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showShareModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setShowShareModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-zinc-900 border border-white/10 p-6 rounded-[2rem] max-w-xl w-full shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600/15 text-red-400">
                    <Share2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black italic tracking-tighter text-white">分享卡组</h3>
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">复制下面这串分享码</p>
                  </div>
                </div>
                <textarea
                  readOnly
                  value={shareCode}
                  className="min-h-28 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 font-mono text-sm text-zinc-100 outline-none"
                />
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
                  <span>长度 {shareCode.length} / 64</span>
                  <span>{shareCopied ? '已复制到剪贴板' : '可复制后分享'}</span>
                </div>
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={async () => {
                      try {
                        await copyTextToClipboard(shareCode);
                        setShareCopied(true);
                      } catch {
                        alert('复制失败，请手动复制分享码');
                      }
                    }}
                    className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-black italic text-sm text-white transition-colors hover:bg-red-700"
                  >
                    重新复制
                  </button>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 font-black italic text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
                  >
                    关闭
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 md:py-3 rounded-2xl font-black text-[10px] md:text-sm transition-all border uppercase italic tracking-tighter shrink-0",
      active ? "bg-red-600 border-red-500 text-white shadow-lg shadow-red-600/40" : "bg-zinc-900 border-white/5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
    )}
  >
    {icon}
    {label}
  </button>
);

const DeckCard: React.FC<{
  deck: Deck;
  onClick: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onShare: () => void | Promise<void>;
  onPublish: () => void | Promise<void>;
  publishing?: boolean;
}> = ({ deck, onClick, onDelete, onShare, onPublish, publishing }) => (
  <div
    onClick={onClick}
    className="cursor-pointer rounded-2xl border border-white/5 bg-zinc-900/40 px-4 py-4 transition-all hover:border-red-600/40 hover:bg-zinc-900/60"
  >
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h3 className="truncate text-lg font-black italic tracking-tighter text-white md:text-xl">{deck.name}</h3>
        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
          创建日期 {new Date(deck.createdAt).toLocaleDateString()} · {deck.cards.length} 张卡牌
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 md:flex md:shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-black italic text-red-400 transition-colors hover:bg-red-900/50"
        >
          <Trash2 className="h-4 w-4" />
          删除
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onShare(); }}
          className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-black italic text-zinc-200 transition-colors hover:bg-zinc-700"
        >
          <Share2 className="h-4 w-4" />
          分享
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onPublish(); }}
          disabled={publishing}
          className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-black italic text-white transition-colors hover:bg-red-500 disabled:opacity-60"
        >
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          发布
        </button>
      </div>
    </div>
  </div>
);
