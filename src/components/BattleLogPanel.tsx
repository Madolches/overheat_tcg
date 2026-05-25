import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import { motion } from 'motion/react';
import { BattleLogEntry, GameState } from '../types/game';
import { battleLogText, normalizeBattleLogEntry } from '../lib/battleLog';
import { cn } from '../lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  CHAT: '聊天',
  TURN: '回合',
  PHASE: '阶段',
  CARD_PLAYED: '打出',
  EFFECT_ACTIVATED: '效果',
  TRIGGERED_EFFECT: '诱发',
  CONTINUOUS_EFFECT: '永续',
  TARGET_DECLARED: '指定',
  CONFRONTATION: '对抗',
  BATTLE: '战斗',
  DAMAGE: '伤害',
  DESTROYED: '破坏',
  MOVED: '移动',
  SYSTEM: '系统'
};

const CATEGORY_TONE: Record<string, string> = {
  CHAT: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
  TURN: 'border-[#f27d26]/30 bg-[#f27d26]/15 text-[#f27d26]',
  PHASE: 'border-amber-300/20 bg-amber-300/10 text-amber-200',
  BATTLE: 'border-red-400/20 bg-red-400/10 text-red-200',
  DAMAGE: 'border-red-400/20 bg-red-400/10 text-red-200',
  DESTROYED: 'border-red-400/20 bg-red-400/10 text-red-200',
  TARGET_DECLARED: 'border-violet-300/20 bg-violet-300/10 text-violet-200'
};

const LOG_FILTERS = [
  { value: 'ALL', label: '全部' },
  { value: 'CHAT', label: '聊天' },
  { value: 'CARD_PLAYED', label: '打出' },
  { value: 'EFFECT_ACTIVATED', label: '效果' },
  { value: 'TRIGGERED_EFFECT', label: '诱发' },
  { value: 'BATTLE', label: '战斗' },
  { value: 'CONFRONTATION', label: '对抗' },
  { value: 'SYSTEM', label: '系统' }
] as const;

interface BattleLogPanelProps {
  game: GameState;
  onClose?: () => void;
  onSendChat: (content: string) => void;
  variant?: 'sidebar' | 'modal';
  canChat?: boolean;
}

export const BattleLogPanel: React.FC<BattleLogPanelProps> = ({
  game,
  onClose,
  onSendChat,
  variant = 'sidebar',
  canChat = true
}) => {
  const [chatText, setChatText] = useState('');
  const [logFilter, setLogFilter] = useState<(typeof LOG_FILTERS)[number]['value']>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);
  const logs = useMemo<BattleLogEntry[]>(() => {
    return (game.logs || []).map((log, index) => normalizeBattleLogEntry(log, game, index));
  }, [game]);
  const visibleLogs = useMemo(() => {
    if (logFilter === 'ALL') return logs;
    return logs.filter(log => log.category === logFilter);
  }, [logs, logFilter]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [logs.length]);

  const submit = () => {
    const content = chatText.trim();
    if (!content || content.length > 200) return;
    onSendChat(content);
    setChatText('');
  };

  return (
    <div className={cn(
      'flex h-full min-h-0 flex-col border-white/10 bg-zinc-950/95 text-white shadow-2xl',
      variant === 'sidebar'
        ? 'w-80 shrink-0 border-l'
        : 'w-full max-w-2xl overflow-hidden rounded-2xl border'
    )}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-[10px] font-black tracking-[0.32em] text-[#f27d26]">LOG</div>
          <h2 className="text-base font-black italic tracking-tight text-white">对局日志</h2>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={logFilter}
            onChange={event => setLogFilter(event.target.value as typeof logFilter)}
            className="h-9 rounded-lg border border-white/10 bg-black/40 px-2 text-xs font-black text-white/75 outline-none transition focus:border-[#f27d26]/60"
            title="筛选日志"
          >
            {LOG_FILTERS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              title="关闭日志"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {visibleLogs.length === 0 ? (
          <div className="py-10 text-center text-xs font-bold text-white/35">暂无日志</div>
        ) : visibleLogs.map(log => {
          const tone = CATEGORY_TONE[log.category] || 'border-white/10 bg-white/5 text-white/55';
          return (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="group flex gap-3"
            >
              <span className={cn('mt-0.5 h-fit rounded-md border px-1.5 py-0.5 text-[9px] font-black', tone)}>
                {CATEGORY_LABELS[log.category] || log.category}
              </span>
              <p className={cn(
                'min-w-0 flex-1 text-xs font-medium leading-relaxed transition-colors',
                log.category === 'CHAT' ? 'text-sky-100' : 'text-white/65 group-hover:text-white'
              )}>
                {battleLogText(log)}
              </p>
            </motion.div>
          );
        })}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          <input
            value={chatText}
            onChange={event => setChatText(event.target.value.slice(0, 200))}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            disabled={!canChat}
            placeholder={canChat ? '发送局内聊天' : '当前无法聊天'}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs font-bold text-white outline-none transition placeholder:text-white/25 focus:border-[#f27d26]/60 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canChat || chatText.trim().length === 0}
            className="rounded-lg bg-[#f27d26] p-2 text-black transition hover:bg-[#ff9b4f] disabled:cursor-not-allowed disabled:opacity-40"
            title="发送"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 text-right text-[10px] font-bold text-white/25">{chatText.length}/200</div>
      </div>
    </div>
  );
};
