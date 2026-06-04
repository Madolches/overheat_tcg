import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { getAuthToken } from '../socket';
import { readJsonResponse } from '../lib/http';
import { cn } from '../lib/utils';

type CardComment = {
  id: string;
  cardId: string;
  userId: string;
  authorName: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  canDelete: boolean;
};

type CardCommentsResponse = {
  comments?: CardComment[];
  comment?: CardComment;
  error?: string;
};

const MAX_COMMENT_LENGTH = 500;

const formatCommentTime = (value: number) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(value));
};

export const CardCommentsPanel: React.FC<{ cardId: string; className?: string }> = ({ cardId, className }) => {
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
  const [comments, setComments] = useState<CardComment[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const token = getAuthToken();
  const remaining = MAX_COMMENT_LENGTH - draft.length;

  const sortedComments = useMemo(
    () => comments.slice().sort((a, b) => b.createdAt - a.createdAt),
    [comments]
  );

  const loadComments = async () => {
    if (!cardId || !token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/cards/${encodeURIComponent(cardId)}/comments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await readJsonResponse<CardCommentsResponse>(res);
      if (!res.ok || data?.error) {
        throw new Error(data?.error || '读取评论失败');
      }
      setComments(data?.comments || []);
    } catch (err: any) {
      setError(err.message || '读取评论失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setComments([]);
    setDraft('');
    void loadComments();
  }, [cardId]);

  const submitComment = async () => {
    const content = draft.trim();
    if (!content || submitting || !token) return;
    if (content.length > MAX_COMMENT_LENGTH) {
      setError(`评论不能超过 ${MAX_COMMENT_LENGTH} 字`);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/cards/${encodeURIComponent(cardId)}/comments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      });
      const data = await readJsonResponse<CardCommentsResponse>(res);
      if (!res.ok || data?.error || !data?.comment) {
        throw new Error(data?.error || '发表评论失败');
      }
      setComments(current => [data.comment!, ...current.filter(comment => comment.id !== data.comment!.id)]);
      setDraft('');
    } catch (err: any) {
      setError(err.message || '发表评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!commentId || deletingId || !token) return;
    setDeletingId(commentId);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/cards/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await readJsonResponse<{ error?: string }>(res);
      if (!res.ok || data?.error) {
        throw new Error(data?.error || '删除评论失败');
      }
      setComments(current => current.filter(comment => comment.id !== commentId));
    } catch (err: any) {
      setError(err.message || '删除评论失败');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className={cn('rounded-3xl border border-white/5 bg-zinc-800/40 p-4 md:p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-red-400" />
          <h3 className="text-sm font-black tracking-widest text-white">卡牌评论</h3>
        </div>
        <span className="rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-black text-zinc-400">
          {comments.length}
        </span>
      </div>

      <div className="space-y-3">
        <textarea
          value={draft}
          maxLength={MAX_COMMENT_LENGTH}
          onChange={event => setDraft(event.target.value)}
          placeholder="写下对这张卡的评价、使用心得或调整建议"
          className="min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold leading-6 text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-red-500/60"
        />
        <div className="flex items-center justify-between gap-3">
          <span className={cn('text-[10px] font-bold', remaining < 0 ? 'text-red-400' : remaining < 50 ? 'text-amber-300' : 'text-zinc-500')}>
            还可输入 {Math.max(0, remaining)} 字
          </span>
          <button
            type="button"
            onClick={submitComment}
            disabled={submitting || !draft.trim() || draft.trim().length > MAX_COMMENT_LENGTH}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            发表
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-xs font-bold text-red-200">
          {error}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl bg-black/20 py-8 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : sortedComments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center text-sm font-bold text-zinc-500">
            暂无评论
          </div>
        ) : (
          sortedComments.map(comment => (
            <article key={comment.id} className="rounded-2xl border border-white/5 bg-black/25 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-white">{comment.authorName || '玩家'}</div>
                  <div className="mt-0.5 text-[10px] font-bold text-zinc-500">{formatCommentTime(comment.createdAt)}</div>
                </div>
                {comment.canDelete && (
                  <button
                    type="button"
                    onClick={() => deleteComment(comment.id)}
                    disabled={deletingId === comment.id}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-red-500/20 hover:text-red-200 disabled:opacity-50"
                    title="删除评论"
                  >
                    {deletingId === comment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-zinc-200">
                {comment.content}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
};
