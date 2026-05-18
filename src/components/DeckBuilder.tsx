import { getAuthUser } from '../socket';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Save, Trash2, Plus, Search, Loader2, X, ArrowLeft, Shuffle, ListFilter, Check, Share2, Upload, Eraser, Zap, Menu, ChevronDown, AlertTriangle, Edit3 } from 'lucide-react';
import { FACTIONS } from '../data/factions';
import { Card as CardType, Deck } from '../types/game';
import { CardComponent } from './Card';
import { cn, getCardImageUrl, getCardTypeLabel } from '../lib/utils';
import { CARD_BACKS } from '../data/customization';
import { useCardCatalog } from '../hooks/useCardCatalog';
import { LoadingOverlay } from './LoadingOverlay';
import { PageFallback } from './PageFallback';
import { KeywordBadges } from './KeywordBadges';
import { readJsonResponse } from '../lib/http';
import { SEARCHABLE_CARD_PACKAGES, matchesCardPackageFilter, matchesCardTypeFilter } from '../lib/cardCatalogFilters';
import { validateDeckForBattle } from '../lib/deckValidation';
import { decodeDeckShareCode, encodeDeckShareCode } from '../lib/deckShareCode';

const INITIAL_VISIBLE_CARD_COUNT = 48;

export const DeckBuilder: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [deck, setDeck] = useState<CardType[]>([]);
  const [deckName, setDeckName] = useState('我的新卡组');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [myDecks, setMyDecks] = useState<Deck[]>([]);
  const [zoomedCard, setZoomedCard] = useState<CardType | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [collection, setCollection] = useState<Record<string, number>>({});
  const [cardCrystals, setCardCrystals] = useState(0);
  const [favoriteBackId, setFavoriteBackId] = useState('default');
  const [actionLoading, setActionLoading] = useState(false);
  const [addSuccessToast, setAddSuccessToast] = useState<{ cardName: string; count: number } | null>(null);
  const [notice, setNotice] = useState<{ title: string; message?: string; tone?: 'success' | 'warning' | 'error' } | null>(null);
  const [shareCode, setShareCode] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showNewDeckModal, setShowNewDeckModal] = useState(false);
  const [isNewDeckDraft, setIsNewDeckDraft] = useState(false);
  const isNewDeckDraftRef = useRef(false);
  const [initialDataLoading, setInitialDataLoading] = useState(true);
  const [importCode, setImportCode] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [newDeckName, setNewDeckName] = useState('新卡组');
  const [visibleCardCount, setVisibleCardCount] = useState(INITIAL_VISIBLE_CARD_COUNT);
  const [filters, setFilters] = useState({
    ac: '',
    damage: '',
    power: '',
    cardPackage: 'ALL',
    cardType: 'ALL',
    color: 'ALL',
    faction: 'ALL',
    rarity: 'ALL',
    ownership: 'ALL' // ALL, OWNED, NOT_OWNED
  });
  const [showLibrary, setShowLibrary] = useState(false);
  const deferredSearchTerm = useDeferredValue(searchTerm.trim());
  const deckIdFromUrl = searchParams.get('id');
  const {
    cards: cardLibrary,
    getCardByReference,
    loading: cardsLoading
  } = useCardCatalog({ includeEffects: false });

  const CRYSTAL_VALUES: Record<string, { decompose: number, produce: number }> = {
    C: { decompose: 1, produce: 5 },
    U: { decompose: 1, produce: 5 },
    R: { decompose: 5, produce: 20 },
    SR: { decompose: 20, produce: 80 },
    UR: { decompose: 100, produce: 400 },
    SER: { decompose: 400, produce: 1600 },
    PR: { decompose: 100, produce: 400 },
  };

  const showNotice = (title: string, message?: string, tone: 'success' | 'warning' | 'error' = 'warning') => {
    setNotice({ title, message, tone });
  };

  useEffect(() => {
    let active = true;

    Promise.all([
      loadDecks(),
      loadCollection(),
      loadProfile()
    ]).finally(() => {
      if (active) setInitialDataLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!cardLibrary.length) {
      return;
    }

    if (isNewDeckDraftRef.current || isNewDeckDraft) {
      return;
    }

    if (!deckIdFromUrl) {
      if (selectedDeckId) {
        setSelectedDeckId(null);
      }
      return;
    }

    const targetDeck = myDecks.find(d => d.id === deckIdFromUrl);
    if (targetDeck && selectedDeckId !== targetDeck.id) {
      loadDeckToEditor(targetDeck);
    }
  }, [cardLibrary, myDecks, deckIdFromUrl, selectedDeckId, isNewDeckDraft]);

  const loadCollection = async () => {
    if (!getAuthUser()) return;
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/collection`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setCollection(data.collection || {});
    } catch (e) {
      console.error('Failed to load collection:', e);
    }
  };

  const loadProfile = async () => {
    if (!getAuthUser()) return;
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${BACKEND_URL}/api/user/profile`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await readJsonResponse(res);
      setCardCrystals(data?.cardCrystals || 0);
      setFavoriteBackId(data?.favoriteBackId || 'default');
    } catch (e) { console.error(e); }
  };

  const handleDecompose = async (cardId: string) => {
    setActionLoading(true);
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
    const token = localStorage.getItem('token');
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
        setCardCrystals(data.newCardCrystals);
        setCollection(prev => {
          const next = { ...prev };
          if (next[cardId] > 1) next[cardId]--;
          else delete next[cardId];
          return next;
        });
      } else {
        showNotice(data.error || '分解失败', undefined, 'error');
      }
    } catch (e) { console.error(e); }
    setActionLoading(false);
  };

  const handleCraft = async (cardId: string) => {
    const card = getCardByReference(cardId);
    if (!card) return;
    const cost = CRYSTAL_VALUES[card.rarity]?.produce || 0;
    if (cardCrystals < cost) { showNotice('卡晶不足', undefined, 'warning'); return; }

    setActionLoading(true);
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
    const token = localStorage.getItem('token');
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
        setCardCrystals(data.newCardCrystals);
        setCollection(prev => ({
          ...prev,
          [cardId]: (prev[cardId] || 0) + 1
        }));
      } else {
        showNotice(data.error || '制作失败', undefined, 'error');
      }
    } catch (e) { console.error(e); }
    setActionLoading(false);
  };

  const loadDecks = async () => {
    if (!getAuthUser()) return;
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(BACKEND_URL + '/api/user/decks', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      const decks: Deck[] = data.decks || [];
      setMyDecks(decks);
    } catch (e) {
      console.error('Failed to load decks:', e);
    }
  };

  const loadDeckToEditor = (savedDeck: Deck) => {
    const cards = savedDeck.cards.map(uid => getCardByReference(uid)).filter((c): c is CardType => !!c);

    if (isNewDeckDraftRef.current) {
      return;
    }

    setIsNewDeckDraft(false);
    setDeck(cards);
    setDeckName(savedDeck.name);
    setSelectedDeckId(savedDeck.id);
  };

  const handleSave = async () => {
    if (!getAuthUser()) return;
    setSaving(true);
    try {
      const deckData = {
        userId: getAuthUser().uid,
        name: deckName,
        cards: deck.map(c => c.uniqueId),
        isFavorite: false,
        updatedAt: Date.now()
      };

      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
      const token = localStorage.getItem('token');

      if (selectedDeckId) {
        await fetch(`${BACKEND_URL}/api/user/decks/${selectedDeckId}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(deckData)
        });
      } else {
        const res = await fetch(`${BACKEND_URL}/api/user/decks`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(deckData)
        });
        const data = await res.json();
        isNewDeckDraftRef.current = false;
        setIsNewDeckDraft(false);
        setSelectedDeckId(data.id);
        setSearchParams({ id: data.id });
      }
      loadDecks();
    } catch (e) {
      console.error('Failed to save deck:', e);
    } finally {
      setSaving(false);
    }
  };

  const createNewDeck = () => {
    isNewDeckDraftRef.current = true;
    setIsNewDeckDraft(true);
    setDeck([]);
    setDeckName('新卡组');
    setSelectedDeckId(null);
    setSearchParams({}, { replace: true });
    setShowManageModal(false);
  };

  const handleDeckSelect = (deckId: string) => {
    if (!deckId) return;
    isNewDeckDraftRef.current = false;
    setIsNewDeckDraft(false);
    setSearchParams({ id: deckId });
  };

  const openNewDeckModal = () => {
    setNewDeckName('新卡组');
    setShowManageModal(false);
    setShowNewDeckModal(true);
  };

  const createNamedDeck = (keepCards: boolean) => {
    const nextName = newDeckName.trim();
    if (!nextName) {
      showNotice('卡组名不能为空', undefined, 'warning');
      return;
    }

    isNewDeckDraftRef.current = true;
    setIsNewDeckDraft(true);
    setDeckName(nextName);
    setSelectedDeckId(null);
    setSearchParams({}, { replace: true });
    setDeck(currentDeck => keepCards ? currentDeck : []);
    setShowNewDeckModal(false);
  };

  const openRenameModal = () => {
    setRenameValue(deckName);
    setShowManageModal(false);
    setShowRenameModal(true);
  };

  const confirmRenameDeck = () => {
    const nextName = renameValue.trim();
    if (!nextName) {
      showNotice('卡组名不能为空', undefined, 'warning');
      return;
    }

    setDeckName(nextName);
    if (selectedDeckId) {
      setMyDecks(prev => prev.map(deck => deck.id === selectedDeckId ? { ...deck, name: nextName } : deck));
    }
    setShowRenameModal(false);
  };

  const clearCurrentDeck = () => {
    setDeck([]);
    setShowClearConfirm(false);
    setShowManageModal(false);
  };

  const buildCurrentDeckForValidation = (): Deck => ({
    id: selectedDeckId || 'current-deck',
    name: deckName,
    cards: deck.map(c => c.uniqueId),
    isFavorite: false,
    createdAt: Date.now()
  });

  const copyTextToClipboard = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    throw new Error('当前浏览器不支持复制');
  };

  const handleShareDeck = async () => {
    if (!catalogRefs.length) {
      showNotice('卡牌库尚未加载完成', undefined, 'warning');
      return;
    }

    const validation = validateDeckForBattle(buildCurrentDeckForValidation());
    if (!validation.valid) {
      showNotice(validation.error || '只有合法卡组才能分享', undefined, 'warning');
      return;
    }

    try {
      const code = encodeDeckShareCode(deck.map(card => card.uniqueId), catalogRefs);
      setShareCode(code);
      setShareCopied(false);
      setShowShareModal(true);

      try {
        await copyTextToClipboard(code);
        setShareCopied(true);
      } catch {
        // The modal still shows the code when clipboard access is unavailable.
      }
    } catch (e) {
      showNotice(e instanceof Error ? e.message : '生成分享码失败', undefined, 'error');
    }
  };

  const handleImportDeck = () => {
    if (!catalogRefs.length) {
      showNotice('卡牌库尚未加载完成', undefined, 'warning');
      return;
    }

    try {
      const importedRefs = decodeDeckShareCode(importCode, catalogRefs);
      const importedCards = importedRefs.map(ref => getCardByReference(ref));

      if (importedCards.some(card => !card)) {
        showNotice('分享码中包含当前卡牌库不存在的卡牌', undefined, 'error');
        return;
      }

      isNewDeckDraftRef.current = true;
      setIsNewDeckDraft(true);
      setDeck(importedCards as CardType[]);
      setDeckName('导入的卡组');
      setSelectedDeckId(null);
      setSearchParams({}, { replace: true });
      setShowImportModal(false);
      setImportCode('');
    } catch (e) {
      showNotice(e instanceof Error ? e.message : '导入分享码失败', undefined, 'error');
    }
  };

  const deleteDeck = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!getAuthUser()) return;
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
    const token = localStorage.getItem('token');
    try {
      await fetch(`${BACKEND_URL}/api/user/decks/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (selectedDeckId === id) createNewDeck();
      setConfirmDeleteId(null);
      loadDecks();
    } catch (e) {
      console.error('Failed to delete deck:', e);
    }
  };

  const addToDeck = (card: CardType) => {
    // Count per card ID (not uniqueId) for limit check
    const count = deckBaseCounts[card.id] || 0;

    if (count < 4 && deck.length < 50) {
      if (card.godMark && godMarkCount >= 10) {
        showNotice('神蚀卡已达上限', '卡组中带有神蚀标记的卡牌不能超过10张。', 'warning');
        return;
      }

      const ownedQty = collection[card.uniqueId] || collection[card.id] || 0;
      if (ownedQty <= count) {
        showNotice('卡牌数量不足', '你拥有的该卡牌数量不足。', 'warning');
        return;
      }

      setDeck([...deck, card]);
      setAddSuccessToast({
        cardName: card.fullName,
        count: count + 1
      });
    } else if (count >= 4) {
      showNotice('同名卡已达上限', '同名卡牌在卡组中不能超过4张。', 'warning');
    } else if (deck.length >= 50) {
      showNotice('卡组已满', '卡组上限为50张。', 'warning');
    }
  };

  const removeFromDeck = (index: number) => {
    const newDeck = [...deck];
    newDeck.splice(index, 1);
    setDeck(newDeck);
  };

  const sortDeck = () => {
    const rarityOrder: Record<string, number> = { 'SER': 0, 'UR': 1, 'PR': 2, 'SR': 3, 'R': 4, 'U': 5, 'C': 6 };
    const colorOrder: Record<string, number> = { 'RED': 0, 'WHITE': 1, 'YELLOW': 2, 'BLUE': 3, 'GREEN': 4, 'NONE': 5 };

    const sorted = [...deck].sort((a, b) => {
      // Rarity
      const rA = rarityOrder[a.rarity] ?? 10;
      const rB = rarityOrder[b.rarity] ?? 10;
      if (rA !== rB) return rA - rB;

      // Color
      const cA = colorOrder[a.color] ?? 10;
      const cB = colorOrder[b.color] ?? 10;
      if (cA !== cB) return cA - cB;

      // AC
      if (a.acValue !== b.acValue) return a.acValue - b.acValue;

      // Name
      return a.fullName.localeCompare(b.fullName);
    });
    setDeck(sorted);
  };

  useEffect(() => {
    setVisibleCardCount(INITIAL_VISIBLE_CARD_COUNT);
  }, [deferredSearchTerm, filters]);

  useEffect(() => {
    if (!addSuccessToast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAddSuccessToast(null);
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [addSuccessToast]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotice(null);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [notice]);

  const favoriteBackUrl = useMemo(
    () => CARD_BACKS.find(back => back.id === favoriteBackId)?.url,
    [favoriteBackId]
  );

  const catalogRefs = useMemo(
    () => cardLibrary.map(card => card.uniqueId).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [cardLibrary]
  );

  const deckBaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const card of deck) {
      counts[card.id] = (counts[card.id] || 0) + 1;
    }

    return counts;
  }, [deck]);

  const godMarkCount = useMemo(
    () => deck.reduce((total, card) => total + (card.godMark ? 1 : 0), 0),
    [deck]
  );

  const deckOwnership = useMemo(() => {
    const seenByCollectionKey: Record<string, number> = {};

    return deck.map(card => {
      const ownedQty = collection[card.uniqueId] || collection[card.id] || 0;
      const collectionKey = collection[card.uniqueId] ? card.uniqueId : card.id;
      const copyNumber = (seenByCollectionKey[collectionKey] || 0) + 1;
      seenByCollectionKey[collectionKey] = copyNumber;

      return {
        missing: copyNumber > ownedQty,
        ownedQty,
        copyNumber
      };
    });
  }, [collection, deck]);

  const shuffleDeck = () => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setDeck(shuffled);
  };

  const filteredCards = useMemo(() => cardLibrary.filter(c => {
    // Text search
    const matchesSearch = c.fullName.includes(deferredSearchTerm) ||
      (c.specialName && c.specialName.includes(deferredSearchTerm));
    if (!matchesSearch) return false;

    // Filters
    if (!matchesCardTypeFilter(c, filters.cardType)) return false;
    if (filters.ac !== '' && c.acValue.toString() !== filters.ac) return false;
    if (c.type === 'UNIT' && filters.damage !== '' && c.damage?.toString() !== filters.damage) return false;
    if (c.type === 'UNIT' && filters.power !== '' && c.power?.toString() !== filters.power) return false;
    if (!matchesCardPackageFilter(c.cardPackage, filters.cardPackage)) return false;
    if (filters.color !== 'ALL' && c.color !== filters.color) return false;
    if (filters.faction !== 'ALL' && c.faction !== filters.faction) return false;
    if (filters.rarity !== 'ALL' && c.rarity !== filters.rarity) return false;

    // Ownership
    const isOwned = (collection[c.uniqueId] || collection[c.id] || 0) > 0;
    if (filters.ownership === 'OWNED' && !isOwned) return false;
    if (filters.ownership === 'NOT_OWNED' && isOwned) return false;

    return true;
  }), [cardLibrary, collection, deferredSearchTerm, filters]);

  const visibleCards = useMemo(
    () => filteredCards.slice(0, visibleCardCount),
    [filteredCards, visibleCardCount]
  );

  const loadingOverlayTitle = saving ? '保存卡组中' : '处理中';
  const loadingOverlayDescription = saving
    ? '正在同步你的卡组配置，请稍候...'
    : '正在处理当前卡牌操作，请稍候...';

  if (cardsLoading || initialDataLoading) {
    return (
      <PageFallback
        title="卡组构筑加载中"
        description="正在加载卡牌库和收藏数据，首次进入可能需要多等一会儿..."
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 relative pt-4">
      <LoadingOverlay
        open={saving || actionLoading}
        title={loadingOverlayTitle}
        description={loadingOverlayDescription}
      />

      <AnimatePresence>
        {addSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="fixed left-1/2 top-24 z-[145] w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
          >
            <div className="rounded-2xl border border-emerald-400/20 bg-zinc-950/95 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-400">
                  <Check className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black italic text-white">已加入卡组</p>
                  <p className="truncate text-xs text-zinc-400">
                    {addSuccessToast.cardName} 已加入，当前 {addSuccessToast.count} / 4
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="fixed left-1/2 top-24 z-[160] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 cursor-pointer"
            onClick={() => setNotice(null)}
          >
            <div className={cn(
              "rounded-2xl border bg-zinc-950/95 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md",
              notice.tone === 'success' && "border-emerald-400/20",
              notice.tone === 'error' && "border-red-400/25",
              (!notice.tone || notice.tone === 'warning') && "border-amber-400/25"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  notice.tone === 'success' && "bg-emerald-500/12 text-emerald-400",
                  notice.tone === 'error' && "bg-red-500/12 text-red-400",
                  (!notice.tone || notice.tone === 'warning') && "bg-amber-500/12 text-amber-300"
                )}>
                  {notice.tone === 'success' ? <Check className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black italic text-white">{notice.title}</p>
                  {notice.message && <p className="truncate text-xs text-zinc-400">{notice.message}</p>}
                </div>
              </div>
            </div>
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
            className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-xl font-black italic tracking-tighter mb-4">删除卡组</h3>
              <p className="text-zinc-400 text-sm mb-6">确定要删除这个卡组吗？此操作无法撤销。</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => deleteDeck(confirmDeleteId)}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded-xl font-bold transition-colors"
                >
                  确定删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowClearConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-black italic tracking-tighter mb-4">清空卡组</h3>
              <p className="text-zinc-400 text-sm mb-6">确定要清空当前卡组中的所有卡牌吗？此操作不会删除已保存卡组。</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={clearCurrentDeck}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded-xl font-bold transition-colors"
                >
                  确定清空
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
            className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600/15 text-red-400">
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
                      showNotice('复制失败，请手动复制分享码', undefined, 'error');
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

      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowImportModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black italic tracking-tighter text-white">导入卡组</h3>
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">粘贴分享码后导入到当前编辑器</p>
                </div>
              </div>

              <textarea
                value={importCode}
                onChange={e => setImportCode(e.target.value.trim())}
                placeholder="在这里粘贴分享码"
                className="min-h-28 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
              />

              <div className="mt-3 text-xs text-zinc-500">
                导入后不会自动保存，你可以确认后再点保存卡组。
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  onClick={handleImportDeck}
                  className="flex-1 rounded-xl bg-cyan-600 px-4 py-3 font-black italic text-sm text-white transition-colors hover:bg-cyan-500"
                >
                  导入
                </button>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 font-black italic text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showManageModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowManageModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              className="relative w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setShowManageModal(false)}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                title="返回"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="mb-5">
                <h3 className="text-xl font-black italic tracking-tighter text-white">管理卡组</h3>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
                  {deckName} · {deck.length}/50 · 神蚀 {godMarkCount}/10
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button onClick={openNewDeckModal} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-2 text-sm font-black italic text-emerald-200 transition-colors hover:bg-emerald-500/20">
                  <Plus className="h-6 w-6 text-emerald-400" /> 新建
                </button>
                <button onClick={openRenameModal} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-lime-400/20 bg-lime-500/10 px-2 text-sm font-black italic text-lime-200 transition-colors hover:bg-lime-500/20">
                  <Edit3 className="h-6 w-6 text-lime-300" /> 重命名
                </button>
                <button
                  onClick={() => { void handleSave(); setShowManageModal(false); }}
                  disabled={saving}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-red-400/20 bg-red-600/90 px-2 text-sm font-black italic text-white transition-colors hover:bg-red-600 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />} 保存
                </button>
                <button onClick={() => { setShowClearConfirm(true); setShowManageModal(false); }} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-2 text-sm font-black italic text-amber-200 transition-colors hover:bg-amber-500/20">
                  <Eraser className="h-6 w-6 text-amber-300" /> 清空
                </button>
                <button
                  onClick={() => selectedDeckId ? (setConfirmDeleteId(selectedDeckId), setShowManageModal(false)) : showNotice('当前卡组尚未保存，无法删除', undefined, 'warning')}
                  disabled={!selectedDeckId}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-2 text-sm font-black italic text-rose-200 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-6 w-6 text-rose-400" /> 删除
                </button>
                <button onClick={() => { shuffleDeck(); setShowManageModal(false); }} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-2 text-sm font-black italic text-violet-200 transition-colors hover:bg-violet-500/20">
                  <Shuffle className="h-6 w-6 text-violet-300" /> 打乱
                </button>
                <button onClick={() => { sortDeck(); setShowManageModal(false); }} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-sky-400/20 bg-sky-500/10 px-2 text-sm font-black italic text-sky-200 transition-colors hover:bg-sky-500/20">
                  <ListFilter className="h-6 w-6 text-sky-300" /> 排序
                </button>
                <button
                  onClick={() => { setShowShareModal(false); setShowImportModal(true); setShowManageModal(false); }}
                  disabled={!catalogRefs.length}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-2 text-sm font-black italic text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
                >
                  <Upload className="h-6 w-6 text-cyan-300" /> 导入
                </button>
                <button
                  onClick={() => { setShowImportModal(false); setShowManageModal(false); void handleShareDeck(); }}
                  disabled={!catalogRefs.length}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-2 text-sm font-black italic text-fuchsia-200 transition-colors hover:bg-fuchsia-500/20 disabled:opacity-60"
                >
                  <Share2 className="h-6 w-6 text-fuchsia-300" /> 分享
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRenameModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowRenameModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lime-500/15 text-lime-300">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black italic tracking-tighter text-white">重命名卡组</h3>
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">保存卡组时会同步新的名称</p>
                </div>
              </div>
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmRenameDeck();
                  if (e.key === 'Escape') setShowRenameModal(false);
                }}
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm font-bold text-zinc-100 outline-none focus:border-lime-400/60"
                placeholder="输入新的卡组名"
              />
              <div className="mt-5 flex gap-3">
                <button
                  onClick={confirmRenameDeck}
                  className="flex-1 rounded-xl bg-lime-600 px-4 py-3 font-black italic text-sm text-white transition-colors hover:bg-lime-500"
                >
                  确认
                </button>
                <button
                  onClick={() => setShowRenameModal(false)}
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 font-black italic text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewDeckModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setShowNewDeckModal(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-black italic tracking-tighter text-white">新建卡组</h3>
                  <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">输入名称后选择如何创建</p>
                </div>
              </div>
              <input
                autoFocus
                value={newDeckName}
                onChange={e => setNewDeckName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setShowNewDeckModal(false);
                }}
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm font-bold text-zinc-100 outline-none focus:border-emerald-400/60"
                placeholder="输入新卡组名"
              />
              <div className="mt-5 grid gap-3">
                <button
                  onClick={() => createNamedDeck(true)}
                  className="rounded-xl bg-emerald-600 px-4 py-3 font-black italic text-sm text-white transition-colors hover:bg-emerald-500"
                >
                  保留卡牌并创建
                </button>
                <button
                  onClick={() => createNamedDeck(false)}
                  className="rounded-xl bg-red-600 px-4 py-3 font-black italic text-sm text-white transition-colors hover:bg-red-500"
                >
                  清空卡牌并创建
                </button>
                <button
                  onClick={() => setShowNewDeckModal(false)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 font-black italic text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  返回
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Middle: Deck Editor */}
      <div className="flex-1 flex flex-col bg-black overflow-hidden w-full">
        <div className="flex-shrink-0 border-b border-zinc-900 bg-zinc-950/50 px-4 pb-2 md:px-4 md:pb-3">
          <div className="flex items-center gap-2 pr-16 md:gap-3">
            <button
              onClick={() => navigate('/collection?tab=DECKS')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-zinc-900 text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white"
              title="返回收藏"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="relative min-w-[12rem] flex-[1_1_18rem] max-w-xl">
              <select
                value={selectedDeckId || ''}
                onChange={e => handleDeckSelect(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-zinc-300 bg-white px-4 pr-10 text-sm font-black text-black outline-none transition-colors hover:bg-zinc-100 md:text-base"
                title="切换卡组"
              >
                {!selectedDeckId && <option value="" hidden>{deckName || '当前卡组'}</option>}
                {myDecks.map(deckOption => (
                  <option key={deckOption.id} value={deckOption.id}>{deckOption.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black" />
            </div>
            <button
              onClick={() => setShowManageModal(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-sm font-black italic text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all hover:bg-red-700 sm:w-auto sm:gap-2 sm:px-4"
              title="管理"
            >
              <Menu className="h-5 w-5" />
              <span className="hidden sm:inline">管理</span>
            </button>
            <span className="hidden shrink-0 items-center gap-2 rounded-full bg-zinc-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-500 sm:flex">
              <span>{deck.length}/50</span>
              <span className="flex items-center gap-1 text-red-500">
                <Zap className="h-3.5 w-3.5 fill-red-500" />
                {godMarkCount}/10
              </span>
            </span>
            <button
              onClick={() => setShowLibrary(true)}
              className="flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/5 bg-zinc-900 px-3 py-2 text-zinc-400 transition-all hover:bg-zinc-800 lg:hidden"
            >
              <Search className="w-4 h-4" />
              <span className="hidden text-[10px] font-black uppercase tracking-widest sm:inline">搜索卡牌</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 md:p-4">
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10 md:gap-3">
            {deck.map((card, index) => {
              const ownership = deckOwnership[index];
              return (
                <div key={`${card.uniqueId}-${index}`} className="relative group">
                  <div
                    className={cn(
                      "transition-transform hover:scale-105 cursor-zoom-in [&_.rounded-xl]:rounded-md [&_.shadow-xl]:shadow-md",
                      ownership?.missing && "opacity-45 grayscale"
                    )}
                    onClick={() => setZoomedCard(card)}
                  >
                    <CardComponent
                      card={card}
                      disableZoom={true}
                      displayMode="deck"
                      cardBackUrl={favoriteBackUrl}
                    />
                  </div>
                  {ownership?.missing && (
                    <div className="absolute inset-x-2 bottom-2 z-10 rounded-lg border border-red-500/40 bg-black/85 px-2 py-1 text-center text-[10px] font-black text-red-300 shadow-lg">
                      数量不足 {ownership.ownedQty}/{ownership.copyNumber}
                    </div>
                  )}
                  <button
                    onClick={() => removeFromDeck(index)}
                    className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-red-600 shadow-2xl transition-all hover:scale-110 md:h-6 md:w-6 md:opacity-60 md:group-hover:opacity-100"
                  >
                    <X className="h-3 w-3 text-white md:h-4 md:w-4" />
                  </button>
                </div>
              );
            })}
            {deck.length === 0 && (
              <div className="col-span-full h-64 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-3xl text-zinc-600">
                <Plus className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-black italic tracking-tighter">从右侧添加卡牌开始构筑</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Card Library */}
      <div className={cn(
        "absolute right-0 z-40 flex h-full w-80 flex-col border-l border-zinc-800 bg-zinc-900 shadow-2xl transition-transform duration-300 lg:relative lg:translate-x-0 lg:shadow-none",
        showLibrary ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-4 border-b border-zinc-800 flex flex-col gap-4">
          <button
            onClick={() => setShowLibrary(false)}
            className="flex items-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl border border-white/10 transition-all w-full text-zinc-300 lg:hidden"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-black italic tracking-tighter uppercase text-sm">返回</span>
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              className="w-full bg-black border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-red-600 transition-all"
              placeholder="搜索卡牌..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 font-bold uppercase">AC</label>
              <input
                className="bg-black border border-zinc-800 rounded px-2 py-1 text-xs"
                placeholder="全部"
                value={filters.ac}
                onChange={e => setFilters({ ...filters, ac: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 font-bold uppercase">类型</label>
              <select
                className="bg-black border border-zinc-800 rounded px-2 py-1 text-xs text-white appearance-none"
                value={filters.cardType}
                onChange={e => setFilters({ ...filters, cardType: e.target.value, damage: '', power: '' })}
              >
                <option value="ALL">全部类型</option>
                <option value="UNIT">单位卡</option>
                <option value="STORY">故事卡</option>
                <option value="ITEM">道具卡</option>
              </select>
            </div>
            {filters.cardType !== 'STORY' && filters.cardType !== 'ITEM' && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase">伤害</label>
                  <input
                    className="bg-black border border-zinc-800 rounded px-2 py-1 text-xs"
                    placeholder="全部"
                    value={filters.damage}
                    onChange={e => setFilters({ ...filters, damage: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-zinc-500 font-bold uppercase">力量</label>
                  <input
                    className="bg-black border border-zinc-800 rounded px-2 py-1 text-xs"
                    placeholder="全部"
                    value={filters.power}
                    onChange={e => setFilters({ ...filters, power: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 font-bold uppercase">卡包</label>
              <select
                className="bg-black border border-zinc-800 rounded px-2 py-1 text-xs"
                value={filters.cardPackage}
                onChange={e => setFilters({ ...filters, cardPackage: e.target.value })}
              >
                <option value="ALL">全部卡包</option>
                {SEARCHABLE_CARD_PACKAGES.map(pack => (
                  <option key={pack} value={pack}>{pack}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 font-bold uppercase">颜色</label>
              <select
                className="bg-black border border-zinc-800 rounded px-2 py-1 text-xs text-white appearance-none"
                value={filters.color}
                onChange={e => setFilters({ ...filters, color: e.target.value })}
              >
                <option value="ALL">全部颜色</option>
                <option value="RED">红色</option>
                <option value="BLUE">蓝色</option>
                <option value="GREEN">绿色</option>
                <option value="YELLOW">黄色</option>
                <option value="WHITE">白色</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 font-bold uppercase">稀有度</label>
              <select
                className="bg-black border border-zinc-800 rounded px-2 py-1 text-xs text-white appearance-none"
                value={filters.rarity}
                onChange={e => setFilters({ ...filters, rarity: e.target.value })}
              >
                <option value="ALL">全部稀有度</option>
                <option value="C">C</option>
                <option value="U">U</option>
                <option value="R">R</option>
                <option value="SR">SR</option>
                <option value="UR">UR</option>
                <option value="SER">SER</option>
                <option value="PR">PR</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 font-bold uppercase">持有状态</label>
              <select
                className="bg-black border border-zinc-800 rounded px-2 py-1 text-xs text-white appearance-none"
                value={filters.ownership}
                onChange={e => setFilters({ ...filters, ownership: e.target.value })}
              >
                <option value="ALL">全部卡牌</option>
                <option value="OWNED">已拥有</option>
                <option value="NOT_OWNED">未拥有</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-500 font-bold uppercase">势力</label>
              <select
                className="bg-black border border-zinc-800 rounded px-2 py-1 text-xs text-white appearance-none"
                value={filters.faction}
                onChange={e => setFilters({ ...filters, faction: e.target.value })}
              >
                <option value="ALL">全部势力</option>
                {FACTIONS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {visibleCards.map((card, index) => {
            const isOwned = (collection[card.uniqueId] || collection[card.id] || 0) > 0;
            return (
              <div
                key={card.uniqueId || card.id || `card-${index}`}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '96px 148px' }}
                className={cn(
                  "bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 hover:border-zinc-600 transition-all group relative",
                  !isOwned && "opacity-60 grayscale-[0.5]"
                )}
              >
                <div className="flex gap-3">
                  <div
                    className="w-16 h-24 rounded-lg overflow-hidden flex-shrink-0 shadow-lg cursor-zoom-in"
                    onClick={() => setZoomedCard(card)}
                  >
                    <img src={getCardImageUrl(card.id, card.rarity, false, card.availableRarities)} className={cn("w-full h-full object-cover", !isOwned && "brightness-[0.4]")} loading="lazy" decoding="async" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black italic text-sm truncate">{card.fullName}</h4>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">{getCardTypeLabel(card.type)} - {card.rarity}</p>
                    <p className="text-[10px] text-zinc-500 mb-1">卡包：{card.cardPackage || '未知'}</p>
                    <p className="text-[10px] text-zinc-400 font-bold">数量：{collection[card.uniqueId] || collection[card.id] || 0}</p>
                  </div>
                </div>
                {isOwned && (
                  <button
                    onClick={() => addToDeck(card)}
                    className="absolute top-2 right-2 p-1 bg-red-600 hover:bg-red-700 rounded-full text-white shadow-lg opacity-60 group-hover:opacity-100 transition-all z-10"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
          {filteredCards.length > visibleCards.length && (
            <button
              onClick={() => setVisibleCardCount(current => current + INITIAL_VISIBLE_CARD_COUNT)}
              className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm font-black italic text-zinc-300 transition-all hover:border-red-500/40 hover:text-white"
            >
              加载更多卡牌 ({visibleCards.length}/{filteredCards.length})
            </button>
          )}
        </div>
      </div>

      {/* Zoom Modal (Synthesis Console) */}
      <AnimatePresence>
        {zoomedCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomedCard(null)}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 lg:p-24 cursor-default"
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
                  setZoomedCard(null);
                }}
                className="absolute top-6 left-6 z-[110] px-4 py-2 bg-zinc-800/90 hover:bg-zinc-700 border border-white/20 rounded-xl text-white shadow-2xl transition-all group flex items-center gap-2"
                title="返回"
              >
                <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-[10px] font-black italic uppercase tracking-widest hidden md:block">返回</span>
              </button>
              {/* Large Card Image */}
              <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-0 bg-zinc-800/20 md:bg-transparent">
                <div className="relative group w-full max-w-[240px] md:max-w-[320px]">
                  <div className={cn(
                    "absolute -inset-4 rounded-[2rem] blur-2xl opacity-20",
                    zoomedCard.rarity === 'UR' || zoomedCard.rarity === 'SER' ? 'bg-amber-500' : 'bg-red-600'
                  )} />
                  <img
                    src={getCardImageUrl(zoomedCard.id, zoomedCard.rarity, false, zoomedCard.availableRarities)}
                    alt={zoomedCard.fullName}
                    className="relative w-full object-contain rounded-[1.5rem] shadow-2xl border-4 border-white/10 max-h-[45vh] md:max-h-none"
                    decoding="async"
                  />
                  <div className="absolute bottom-4 -right-2 bg-red-600 px-3 py-1.5 rounded-xl border border-red-400 font-black italic shadow-2xl rotate-12 z-20">
                    <span className="text-sm">x{collection[zoomedCard.uniqueId] || 0}</span>
                  </div>
                  <div className="absolute -bottom-4 -left-4 bg-zinc-800 px-4 py-2 rounded-xl border border-white/10 font-black italic shadow-2xl -rotate-6 z-20 flex flex-col items-center">
                    <span>{deckBaseCounts[zoomedCard.id] || 0} / 4</span>
                  </div>
                </div>
              </div>

              {/* Console & Details */}
              <div className="flex-1 flex flex-col p-6 md:p-6 overflow-hidden md:overflow-visible">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">{zoomedCard.id}</span>
                    <div className="h-px w-12 bg-red-500/30" />
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black italic text-white uppercase tracking-tighter leading-none mb-1">
                    {zoomedCard.fullName}
                  </h2>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">关键词</p>
                  <KeywordBadges card={zoomedCard} variant="detail" />
                </div>

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
                          <span className="text-xl md:text-2xl font-black italic text-cyan-400">+{CRYSTAL_VALUES[zoomedCard.rarity]?.decompose || 0}</span>
                          <X className="w-4 h-4 text-cyan-400" />
                        </div>
                      </div>
                      <button
                        onClick={() => handleDecompose(zoomedCard.uniqueId)}
                        disabled={actionLoading || (collection[zoomedCard.uniqueId] || 0) <= 0}
                        className={cn(
                          "px-6 md:px-8 py-2 md:py-3 rounded-2xl font-black italic text-xs md:text-sm transition-all uppercase",
                          (collection[zoomedCard.uniqueId] || 0) > 0
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
                          <span className="text-xl md:text-2xl font-black italic text-red-500">-{CRYSTAL_VALUES[zoomedCard.rarity]?.produce || 0}</span>
                          <X className="w-4 h-4 text-cyan-400" />
                        </div>
                      </div>
                      <button
                        onClick={() => handleCraft(zoomedCard.uniqueId)}
                        disabled={actionLoading || cardCrystals < (CRYSTAL_VALUES[zoomedCard.rarity]?.produce || 0)}
                        className={cn(
                          "px-6 md:px-8 py-2 md:py-3 rounded-2xl font-black italic text-xs md:text-sm transition-all uppercase",
                          cardCrystals >= (CRYSTAL_VALUES[zoomedCard.rarity]?.produce || 0)
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
                    <Plus className="w-5 h-5 text-cyan-400" />
                    <div>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase">当前卡晶</p>
                      <p className="text-lg md:text-xl font-black italic text-cyan-400">{(cardCrystals || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  <button onClick={() => setZoomedCard(null)} className="text-zinc-500 hover:text-white font-black italic text-sm uppercase transition-colors">
                    关闭
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
