import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Edit3, Heart, Loader2, Save, Search, Trash2, UserRound, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../types/game';
import { useCardCatalog } from '../hooks/useCardCatalog';
import { CardComponent } from './Card';
import { KeywordBadges } from './KeywordBadges';
import { CardEffectList } from './CardEffectList';
import { cn } from '../lib/utils';
import { getAuthUser } from '../socket';
import { isAdjustedCard } from '../lib/cardAdjustments';

const DECK_PREVIEW_TYPE_ORDER: Record<string, number> = {
  UNIT: 0,
  STORY: 1,
  ITEM: 2
};

interface DeckSquarePost {
  id: string;
  sourceDeckId?: string;
  authorUid: string;
  authorName: string;
  name: string;
  description?: string;
  cards: string[];
  tags?: string[];
  likes: number;
  likedByMe: boolean;
  createdAt: number;
  updatedAt: number;
}

export const DeckSquare: React.FC = () => {
  const navigate = useNavigate();
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
  const token = localStorage.getItem('token');
  const currentUser = getAuthUser();
  const { getCardByReference, loading: cardsLoading } = useCardCatalog({ includeEffects: true });

  const [posts, setPosts] = useState<DeckSquarePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPost, setSelectedPost] = useState<DeckSquarePost | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [editingPost, setEditingPost] = useState<DeckSquarePost | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [actionPostId, setActionPostId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [notice, setNotice] = useState('');

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/deck-square`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (e) {
      console.error('Failed to load deck square:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [BACKEND_URL, token]);

  const resolveDeckCards = (post: DeckSquarePost) =>
    post.cards.map(id => getCardByReference(id)).filter((card): card is Card => !!card);

  const filteredPosts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return posts;
    return posts.filter(post =>
      post.name.toLowerCase().includes(term) ||
      (post.description || '').toLowerCase().includes(term) ||
      post.authorName.toLowerCase().includes(term) ||
      (post.tags || []).some(tag => tag.toLowerCase().includes(term)) ||
      post.cards.some(cardId => getCardByReference(cardId)?.fullName.toLowerCase().includes(term))
    );
  }, [posts, searchTerm, getCardByReference]);

  const groupedPreview = (post: DeckSquarePost) => {
    const counts = new Map<string, { card: Card; count: number }>();
    resolveDeckCards(post).forEach(card => {
      const key = card.uniqueId || card.id;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { card, count: 1 });
    });
    return Array.from(counts.values()).sort((a, b) => {
      const godA = a.card.godMark ? 0 : 1;
      const godB = b.card.godMark ? 0 : 1;
      if (godA !== godB) return godA - godB;

      const typeA = DECK_PREVIEW_TYPE_ORDER[a.card.type] ?? 99;
      const typeB = DECK_PREVIEW_TYPE_ORDER[b.card.type] ?? 99;
      if (typeA !== typeB) return typeA - typeB;

      if (a.card.acValue !== b.card.acValue) return a.card.acValue - b.card.acValue;

      const nameCompare = a.card.fullName.localeCompare(b.card.fullName, 'zh-Hans-CN');
      if (nameCompare !== 0) return nameCompare;

      return a.card.uniqueId.localeCompare(b.card.uniqueId);
    });
  };

  const openEditPost = (post: DeckSquarePost) => {
    if (post.authorUid !== currentUser?.uid) return;
    setEditingPost(post);
    setEditName(post.name);
    setEditDescription(post.description || '');
  };

  const savePostMeta = async () => {
    if (!editingPost) return;
    const nextName = editName.trim();
    const nextDescription = editDescription.trim();
    if (!nextName) {
      setNotice('套牌名称不能为空');
      return;
    }

    setSavingEdit(true);
    setNotice('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/deck-square/${editingPost.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: nextName,
          description: nextDescription
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '保存失败');
      const nextPost = data.post as DeckSquarePost;
      setPosts(current => current.map(item => item.id === nextPost.id ? nextPost : item));
      setSelectedPost(current => current?.id === nextPost.id ? nextPost : current);
      setEditingPost(null);
      setNotice(`已更新《${nextPost.name}》`);
    } catch (e: any) {
      setNotice(e.message || '保存失败');
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleLike = async (post: DeckSquarePost) => {
    setActionPostId(post.id);
    try {
      const res = await fetch(`${BACKEND_URL}/api/deck-square/${post.id}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        setPosts(current => current.map(item => item.id === post.id ? { ...item, likedByMe: data.liked, likes: data.likes } : item));
        setSelectedPost(current => current?.id === post.id ? { ...current, likedByMe: data.liked, likes: data.likes } : current);
      }
    } finally {
      setActionPostId(null);
    }
  };

  const copyDeck = async (post: DeckSquarePost) => {
    setActionPostId(post.id);
    setNotice('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/deck-square/${post.id}/copy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '复制失败');
      setNotice(`已复制《${post.name}》到我的卡组`);
    } catch (e: any) {
      setNotice(e.message || '复制失败');
    } finally {
      setActionPostId(null);
    }
  };

  const deletePost = async (post: DeckSquarePost) => {
    if (post.authorUid !== currentUser?.uid) return;
    if (isBugCupPost(post)) {
      setNotice('bug杯参赛卡组不能从套牌广场删除');
      return;
    }
    if (!window.confirm(`确定要删除《${post.name}》吗？`)) return;

    setActionPostId(post.id);
    setNotice('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/deck-square/${post.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '删除失败');
      setPosts(current => current.filter(item => item.id !== post.id));
      setSelectedPost(current => current?.id === post.id ? null : current);
      setNotice(`已删除《${post.name}》`);
    } catch (e: any) {
      setNotice(e.message || '删除失败');
    } finally {
      setActionPostId(null);
    }
  };

  const isBugCupPost = (post: DeckSquarePost) =>
    post.sourceDeckId?.startsWith('bugcup:') || (post.tags || []).includes('第1届bug杯杯赛');

  if (loading || cardsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black pt-20 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-6 pb-20 pt-20 text-white md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center gap-4">
          <button onClick={() => navigate('/')} className="rounded-full bg-zinc-900 p-2 transition-colors hover:bg-zinc-800">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter">套牌广场</h1>
            <p className="text-xs font-bold tracking-widest text-zinc-500">浏览全服玩家发布的卡组</p>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索卡组、作者或卡牌"
              className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-11 py-3 text-sm font-bold outline-none transition-colors focus:border-red-500/60"
            />
          </div>
          {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">{notice}</div>}
        </div>

        {filteredPosts.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-zinc-800 bg-zinc-950/40 py-20 text-center text-zinc-500">
            暂无发布的卡组
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredPosts.map(post => {
              const preview = groupedPreview(post).slice(0, 8);
              const busy = actionPostId === post.id;
              const isAuthor = post.authorUid === currentUser?.uid;
              const protectedBugCupPost = isBugCupPost(post);
              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 transition-colors hover:border-red-500/40"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-black italic tracking-tight">{post.name}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold text-zinc-500">
                        <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{post.authorName}</span>
                        <span>{post.cards.length} 张</span>
                        <span>{new Date(post.updatedAt || post.createdAt).toLocaleDateString()}</span>
                      </div>
                      {post.description && (
                        <p className="mt-3 line-clamp-2 text-sm font-bold leading-relaxed text-zinc-300">
                          {post.description}
                        </p>
                      )}
                      {!!post.tags?.length && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {post.tags.map(tag => (
                            <span key={tag} className="rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-black text-red-200">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {isAuthor && (
                        <button
                          onClick={() => openEditPost(post)}
                          disabled={busy}
                          className="flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-black text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-60"
                        >
                          <Edit3 className="h-4 w-4" />
                          编辑
                        </button>
                      )}
                      {isAuthor && !protectedBugCupPost && (
                        <button
                          onClick={() => deletePost(post)}
                          disabled={busy}
                          className="flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-black text-zinc-300 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-60"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          删除
                        </button>
                      )}
                      {isAuthor && protectedBugCupPost && (
                        <span className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-black text-red-200">
                          参赛锁定
                        </span>
                      )}
                      <button
                        onClick={() => toggleLike(post)}
                        disabled={busy}
                        className={cn(
                          'flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition-colors',
                          post.likedByMe ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                        )}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className={cn('h-4 w-4', post.likedByMe && 'fill-current')} />}
                        {post.likes}
                      </button>
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-8">
                    {preview.map(({ card, count }) => (
                      <button
                        key={card.uniqueId || card.id}
                        onClick={() => {
                          setSelectedPost(post);
                          setSelectedCard(card);
                        }}
                        className="relative transition-transform hover:scale-105"
                        title={`查看 ${card.fullName}`}
                      >
                        <CardComponent card={card} displayMode="deck" disableZoom hideKeywords />
                        {isAdjustedCard(card) && (
                          <span className="absolute left-1 top-1 rounded-md bg-cyan-500/90 px-1.5 py-0.5 text-[9px] font-black text-white">
                            {card.adjustmentLabel || '调整后'}
                          </span>
                        )}
                        <span className="absolute bottom-1 right-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-black">x{count}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPost(post)}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black transition-colors hover:bg-white/10"
                    >
                      预览卡组
                    </button>
                    <button
                      onClick={() => copyDeck(post)}
                      disabled={busy}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black transition-colors hover:bg-red-500 disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                      复制到我的卡组
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            onClick={() => setSelectedPost(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
            >
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-black italic tracking-tight">{selectedPost.name}</h2>
                  <p className="mt-1 text-xs font-bold text-zinc-500">{selectedPost.authorName} · {selectedPost.cards.length} 张卡牌</p>
                  {selectedPost.description && (
                    <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm font-bold leading-relaxed text-zinc-300">
                      {selectedPost.description}
                    </p>
                  )}
                  {!!selectedPost.tags?.length && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selectedPost.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-black text-red-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {selectedPost.authorUid === currentUser?.uid && (
                    <button onClick={() => openEditPost(selectedPost)} className="flex items-center gap-2 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-black hover:bg-zinc-700">
                      <Edit3 className="h-4 w-4" />
                      编辑
                    </button>
                  )}
                  {selectedPost.authorUid === currentUser?.uid && !isBugCupPost(selectedPost) && (
                    <button onClick={() => deletePost(selectedPost)} className="flex items-center gap-2 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-black hover:bg-red-600">
                      <Trash2 className="h-4 w-4" />
                      删除
                    </button>
                  )}
                  {selectedPost.authorUid === currentUser?.uid && isBugCupPost(selectedPost) && (
                    <span className="flex items-center rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-black text-red-200">
                      参赛锁定
                    </span>
                  )}
                  <button onClick={() => toggleLike(selectedPost)} className="flex items-center gap-2 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-black hover:bg-zinc-700">
                    <Heart className={cn('h-4 w-4', selectedPost.likedByMe && 'fill-current text-red-400')} />
                    {selectedPost.likes}
                  </button>
                  <button onClick={() => copyDeck(selectedPost)} className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-black hover:bg-red-500">
                    <Copy className="h-4 w-4" />
                    复制
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10">
                {groupedPreview(selectedPost).map(({ card, count }) => (
                  <button
                    key={card.uniqueId || card.id}
                    onClick={() => setSelectedCard(card)}
                    className="relative text-left transition-transform hover:scale-105"
                    title={`查看 ${card.fullName}`}
                  >
                    <CardComponent card={card} displayMode="deck" disableZoom />
                    {isAdjustedCard(card) && (
                      <span className="absolute left-1 top-1 rounded-md bg-cyan-500/90 px-1.5 py-0.5 text-[9px] font-black text-white">
                        {card.adjustmentLabel || '调整后'}
                      </span>
                    )}
                    <span className="absolute bottom-1 right-1 rounded-md bg-black/85 px-2 py-1 text-xs font-black">x{count}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
            onClick={() => setEditingPost(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black italic tracking-tight">编辑套牌说明</h2>
                  <p className="mt-1 text-xs font-bold text-zinc-500">名称和说明会显示在套牌广场，不会改动你的本地卡组内容。</p>
                </div>
                <button
                  onClick={() => setEditingPost(null)}
                  className="rounded-xl bg-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                  title="关闭"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-widest text-zinc-500">套牌名称</span>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    maxLength={80}
                    className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-red-500/60"
                    placeholder="给这套牌一个容易理解的名字"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-widest text-zinc-500">注释说明</span>
                  <textarea
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    maxLength={1200}
                    rows={9}
                    className="w-full resize-none rounded-xl border border-white/10 bg-black px-4 py-3 text-sm font-bold leading-relaxed outline-none transition-colors focus:border-red-500/60"
                    placeholder="写下核心思路、起手留牌、展开路线、常见对局注意点..."
                  />
                  <span className="mt-2 block text-right text-xs font-bold text-zinc-500">{editDescription.length}/1200</span>
                </label>
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setEditingPost(null)}
                  className="flex-1 rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm font-black transition-colors hover:bg-zinc-800"
                >
                  取消
                </button>
                <button
                  onClick={savePostMeta}
                  disabled={savingEdit}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black transition-colors hover:bg-red-500 disabled:opacity-60"
                >
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
            onClick={() => setSelectedCard(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-500">{selectedCard.id}</p>
                  <h2 className="mt-1 text-2xl font-black italic tracking-tight text-white md:text-4xl">{selectedCard.fullName}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-zinc-500">
                    <span>{selectedCard.cardPackage || '未知卡包'} · {selectedCard.rarity}</span>
                    {isAdjustedCard(selectedCard) && (
                      <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-black text-cyan-100">
                        {selectedCard.adjustmentLabel || '调整后'}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCard(null)}
                  className="rounded-xl bg-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
                  title="关闭"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid gap-6 md:grid-cols-[260px_1fr]">
                <div className="mx-auto w-full max-w-[260px]">
                  <CardComponent card={selectedCard} displayMode="deck" disableZoom />
                </div>
                <div className="space-y-5">
                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-zinc-500">关键词</p>
                    <KeywordBadges card={selectedCard} variant="detail" />
                  </div>

                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-widest text-zinc-500">效果</p>
                    <CardEffectList card={selectedCard} />
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
