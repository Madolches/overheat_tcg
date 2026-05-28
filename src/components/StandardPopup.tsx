import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Shield,
  Sword,
  Zap,
  Trash2,
  Loader2,
  Sparkles,
  PackagePlus,
  RotateCcw,
  Undo2,
  Hand,
  User,
  Users,
  FileText,
  Box,
  Flame,
  Layers,
  LucideIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Card } from '../types/game';
import { CardComponent } from './Card';

type PopupOption = {
  id?: string;
  selectionId?: string;
  value?: string;
  sourceCardNo?: string;
  optionCode?: string;
  label?: string;
  icon?: string;
  detail?: string;
  card?: Card;
  source?: string;
  ownerName?: string;
  isMine?: boolean;
  slotNumber?: number;
  slotLabel?: string;
  zoneLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
};

type VisualOptionMeta = {
  eyebrow: string;
  title: string;
  detail?: string;
  Icon: LucideIcon;
  accent: string;
  glow: string;
};

const STANDARD_CHOICE_VISUALS: Record<string, Partial<VisualOptionMeta>> = {
  '105110112_option_A': {
    detail: '抽取新的手牌资源',
    Icon: PackagePlus,
    accent: 'from-sky-500 via-cyan-500 to-blue-600',
    glow: 'shadow-[0_0_35px_rgba(14,165,233,0.3)]'
  },
  '105110112_option_B': {
    detail: '对目标造成伤害',
    Icon: Sword,
    accent: 'from-red-500 via-rose-500 to-orange-500',
    glow: 'shadow-[0_0_35px_rgba(244,63,94,0.3)]'
  },
  '105110112_option_C': {
    detail: '破坏指定目标',
    Icon: Trash2,
    accent: 'from-zinc-600 via-red-700 to-orange-600',
    glow: 'shadow-[0_0_35px_rgba(220,38,38,0.3)]'
  },
  '304030075_option_A': {
    detail: '强化进入战场的单位',
    Icon: Flame,
    accent: 'from-amber-500 via-orange-500 to-red-500',
    glow: 'shadow-[0_0_35px_rgba(249,115,22,0.32)]'
  },
  '304030075_option_B': {
    detail: '横置对手单位',
    Icon: RotateCcw,
    accent: 'from-cyan-500 via-sky-500 to-blue-600',
    glow: 'shadow-[0_0_35px_rgba(14,165,233,0.32)]'
  },
  '304030075_option_C': {
    detail: '从墓地移动卡牌',
    Icon: Layers,
    accent: 'from-emerald-500 via-teal-500 to-green-600',
    glow: 'shadow-[0_0_35px_rgba(16,185,129,0.32)]'
  },
  '204020023_option_A': {
    detail: '抽卡与侵蚀区操作',
    Icon: PackagePlus,
    accent: 'from-violet-500 via-fuchsia-500 to-pink-500',
    glow: 'shadow-[0_0_35px_rgba(217,70,239,0.3)]'
  },
  '204020023_option_B': {
    detail: '破坏指定目标',
    Icon: Trash2,
    accent: 'from-rose-500 via-red-500 to-orange-600',
    glow: 'shadow-[0_0_35px_rgba(244,63,94,0.3)]'
  },
  '204020024_option_A': {
    detail: '横置目标单位',
    Icon: RotateCcw,
    accent: 'from-cyan-500 via-sky-500 to-blue-600',
    glow: 'shadow-[0_0_35px_rgba(14,165,233,0.32)]'
  },
  '204020024_option_B': {
    detail: '返回手牌',
    Icon: Undo2,
    accent: 'from-emerald-500 via-teal-500 to-green-600',
    glow: 'shadow-[0_0_35px_rgba(16,185,129,0.32)]'
  }
};

interface StandardPopupProps {
  isOpen: boolean;
  onClose?: () => void;
  title: string;
  description?: string;
  mode: 'double_selection' | 'card_selection' | 'card_display' | 'payment_selection' | 'player_selection' | 'choice_selection';
  
  // Double Selection props
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmType?: 'primary' | 'danger' | 'warning';
  confirmDisabled?: boolean;
  
  // Card Selection & Display props
  cards?: Card[];
  cardMeta?: Record<string, { ownerName?: string; slotLabel?: string; zoneLabel?: string; isMine?: boolean; isFaceDown?: boolean; effectiveAcValue?: number }>;
  options?: PopupOption[];
  selectedIds?: string[];
  highlightedIds?: string[];
  minSelections?: number;
  maxSelections?: number;
  onCardClick?: (card: Card, e?: React.MouseEvent) => void;
  onCardHover?: (card: Card | null) => void;
  onSelectionComplete?: () => void;
  cardBackUrl?: string;
  
  // Payment props
  paymentCost?: number;
  paymentCurrent?: number | string;
  
  // Custom children for specialized content (like payment area)
  children?: React.ReactNode;

  // Hiding functionality
  onHide?: () => void;
  isHidden?: boolean;
  squarePanel?: boolean;
}

const getOptionId = (option: PopupOption) => option.selectionId || option.card?.gamecardId || option.card?.id || option.id || '';

const isPlayerOption = (option: PopupOption) => {
  const id = option.card?.id || option.card?.gamecardId || option.id;
  return id === 'PLAYER_SELF' || id === 'PLAYER_OPPONENT';
};

const getChoiceIcon = (option: PopupOption): LucideIcon => {
  const value = `${option.icon || ''} ${option.value || ''} ${option.id || ''} ${option.label || ''}`.toUpperCase();
  if (value.includes('DRAW') || value.includes('抽')) return PackagePlus;
  if (value.includes('DESTROY') || value.includes('破坏')) return Trash2;
  if (value.includes('DAMAGE') || value.includes('伤害')) return Sword;
  if (value.includes('EXHAUST') || value.includes('横置') || value.includes('VERTICAL') || value.includes('重置')) return RotateCcw;
  if (value.includes('RETURN') || value.includes('BOUNCE') || value.includes('回手') || value.includes('返回') || value.includes('置底') || value.includes('置顶')) return Undo2;
  if (value.includes('UNIT') || value.includes('单位')) return Shield;
  if (value.includes('STORY') || value.includes('故事')) return FileText;
  if (value.includes('ITEM') || value.includes('道具')) return Box;
  if (value.includes('MILL') || value.includes('墓地')) return Layers;
  if (value.includes('YES') || value.includes('发动') || value.includes('使用')) return Zap;
  return Hand;
};

const getVisualOptionMeta = (option: PopupOption): VisualOptionMeta => {
  const id = option.card?.id || option.id || '';
  const semanticId = String(option.value || id).toUpperCase();
  const label = option.label || option.card?.fullName || id || '选项';
  const detail = option.detail || option.disabledReason;
  const standardEyebrow = option.sourceCardNo && option.optionCode
    ? `${option.sourceCardNo} / OPTION ${option.optionCode}`
    : undefined;
  const standardVisual = id ? STANDARD_CHOICE_VISUALS[id] : undefined;

  if (isPlayerOption(option)) {
    const self = id === 'PLAYER_SELF';
    return {
      eyebrow: self ? '我方玩家' : '对手玩家',
      title: option.card?.fullName || option.ownerName || (self ? '我方玩家' : '对手玩家'),
      detail: option.ownerName && option.ownerName !== option.card?.fullName ? option.ownerName : (self ? '选择我方作为目标' : '选择对手作为目标'),
      Icon: self ? User : Users,
      accent: self ? 'from-sky-500 via-blue-600 to-cyan-500' : 'from-rose-500 via-red-600 to-orange-500',
      glow: self ? 'shadow-[0_0_35px_rgba(14,165,233,0.28)]' : 'shadow-[0_0_35px_rgba(244,63,94,0.28)]'
    };
  }

  if (standardVisual) {
    const Icon = standardVisual.Icon || getChoiceIcon(option);
    return {
      eyebrow: standardEyebrow || standardVisual.eyebrow || '效果选项',
      title: label,
      detail: detail || standardVisual.detail,
      Icon,
      accent: standardVisual.accent || 'from-slate-700 via-cyan-700 to-blue-700',
      glow: standardVisual.glow || 'shadow-[0_0_35px_rgba(242,125,38,0.24)]'
    };
  }

  switch (semanticId) {
    case 'OPTION_A':
      return {
        eyebrow: standardEyebrow || '选项A',
        title: label,
        detail: detail || '强化进入战场的单位',
        Icon: Flame,
        accent: 'from-amber-500 via-orange-500 to-red-500',
        glow: 'shadow-[0_0_35px_rgba(249,115,22,0.32)]'
      };
    case 'OPTION_B':
      return {
        eyebrow: standardEyebrow || '选项B',
        title: label,
        detail: detail || '横置对手单位',
        Icon: RotateCcw,
        accent: 'from-cyan-500 via-sky-500 to-blue-600',
        glow: 'shadow-[0_0_35px_rgba(14,165,233,0.32)]'
      };
    case 'OPTION_C':
      return {
        eyebrow: standardEyebrow || '选项C',
        title: label,
        detail: detail || '从墓地移动卡牌',
        Icon: Layers,
        accent: 'from-emerald-500 via-teal-500 to-green-600',
        glow: 'shadow-[0_0_35px_rgba(16,185,129,0.32)]'
      };
    case 'MODE_A':
      return {
        eyebrow: standardEyebrow || '模式A',
        title: label,
        detail: detail || '抽卡与侵蚀区操作',
        Icon: PackagePlus,
        accent: 'from-violet-500 via-fuchsia-500 to-pink-500',
        glow: 'shadow-[0_0_35px_rgba(217,70,239,0.3)]'
      };
    case 'MODE_B':
      return {
        eyebrow: standardEyebrow || '模式B',
        title: label,
        detail: detail || '破坏指定目标',
        Icon: Trash2,
        accent: 'from-rose-500 via-red-500 to-orange-600',
        glow: 'shadow-[0_0_35px_rgba(244,63,94,0.3)]'
      };
    case 'MODE_EXHAUST':
      return {
        eyebrow: standardEyebrow || '模式A',
        title: label,
        detail: detail || '横置目标单位',
        Icon: RotateCcw,
        accent: 'from-cyan-500 via-sky-500 to-blue-600',
        glow: 'shadow-[0_0_35px_rgba(14,165,233,0.32)]'
      };
    case 'MODE_BOUNCE':
      return {
        eyebrow: standardEyebrow || '模式B',
        title: label,
        detail: detail || '返回手牌',
        Icon: Undo2,
        accent: 'from-emerald-500 via-teal-500 to-green-600',
        glow: 'shadow-[0_0_35px_rgba(16,185,129,0.32)]'
      };
    default: {
      const Icon = getChoiceIcon(option);
      const isType = semanticId === 'UNIT' || semanticId === 'STORY' || semanticId === 'ITEM';
      const isDanger = Icon === Trash2 || Icon === Sword;
      const isMove = Icon === RotateCcw || Icon === Undo2 || Icon === Layers;
      return {
        eyebrow: standardEyebrow || (isType ? '卡片种类' : '效果选项'),
        title: label,
        detail,
        Icon,
        accent: isDanger
          ? 'from-red-500 via-rose-500 to-orange-500'
          : isMove
            ? 'from-emerald-500 via-teal-500 to-sky-500'
            : isType
              ? 'from-indigo-500 via-sky-500 to-cyan-500'
              : 'from-slate-700 via-cyan-700 to-blue-700',
        glow: isDanger
          ? 'shadow-[0_0_35px_rgba(244,63,94,0.26)]'
          : isMove
            ? 'shadow-[0_0_35px_rgba(20,184,166,0.24)]'
            : 'shadow-[0_0_35px_rgba(242,125,38,0.24)]'
      };
    }
  }
};

const VisualOptionCard: React.FC<{
  option: PopupOption;
  isSelected: boolean;
  selectionOrder: number;
  onClick?: () => void;
}> = ({ option, isSelected, selectionOrder, onClick }) => {
  const meta = getVisualOptionMeta(option);
  const Icon = meta.Icon;
  const metaLine = [option.ownerName, option.slotLabel || option.zoneLabel || option.source].filter(Boolean).join(' · ');

  return (
    <motion.button
      type="button"
      whileTap={option.disabled ? undefined : { scale: 0.95 }}
      onClick={option.disabled ? undefined : onClick}
      disabled={option.disabled}
      className={cn(
        "relative w-full aspect-[3/4] overflow-hidden rounded-xl md:rounded-2xl border-2 bg-zinc-950 text-left transition-all",
        option.disabled ? "cursor-not-allowed opacity-45 grayscale" : "cursor-pointer hover:opacity-100",
        isSelected
          ? "border-[#f27d26] shadow-[0_0_30px_rgba(242,125,38,0.45)] scale-105"
          : cn("border-white/10 opacity-85", meta.glow)
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", meta.accent)} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.28),_transparent_45%)]" />
      <div className="absolute inset-x-4 top-4 h-px bg-white/30" />
      <div className="absolute inset-x-4 bottom-4 h-px bg-black/25" />
      <div className="relative z-10 flex h-full flex-col items-center justify-between px-3 py-4 text-center text-white md:px-4 md:py-5">
        <div className="w-full">
          <div className="mx-auto inline-flex max-w-full items-center justify-center rounded-md border border-white/15 bg-zinc-950/55 px-2 py-1 text-center text-[8px] md:text-[10px] font-black uppercase leading-tight tracking-[0.12em] text-white/80 shadow-sm backdrop-blur-sm">
            {meta.eyebrow}
          </div>
          <div className="mt-2 line-clamp-3 text-sm md:text-base font-black leading-tight">
            {meta.title}
          </div>
        </div>
        <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-black/20 backdrop-blur-sm md:h-24 md:w-24">
          <Icon className="h-10 w-10 md:h-12 md:w-12" />
        </div>
        <div className="w-full rounded-xl border border-white/15 bg-black/25 px-2.5 py-2 backdrop-blur-sm">
          {(meta.detail || metaLine) && (
            <div className="line-clamp-3 text-[10px] md:text-xs font-bold leading-relaxed text-white/90">
              {meta.detail || metaLine}
            </div>
          )}
          {meta.detail && metaLine && (
            <div className="mt-1 line-clamp-1 text-[9px] md:text-[10px] font-black tracking-wide text-white/60">
              {metaLine}
            </div>
          )}
        </div>
      </div>
      {isSelected && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[2px] pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-[#f27d26] text-black flex items-center justify-center shadow-2xl">
            <span className="text-2xl font-black italic leading-none">{selectionOrder}</span>
          </div>
        </div>
      )}
    </motion.button>
  );
};

export const StandardPopup: React.FC<StandardPopupProps> = ({
  isOpen,
  onClose,
  title,
  description,
  mode,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  confirmType = 'primary',
  confirmDisabled = false,
  cards = [],
  cardMeta = {},
  options,
  selectedIds = [],
  highlightedIds = [],
  minSelections = 0,
  maxSelections = 0,
  onCardClick,
  onCardHover,
  onSelectionComplete,
  cardBackUrl,
  paymentCost,
  paymentCurrent,
  children,
  onHide,
  isHidden = false,
  squarePanel = false
}) => {
  if (!isOpen) return null;

  const renderedOptions: PopupOption[] = options || cards.map(card => ({
    id: card.gamecardId || card.id,
    card,
    ...(cardMeta[card.gamecardId || card.id] || {})
  }));

  const handleOptionClick = (option: PopupOption, e?: React.MouseEvent) => {
    if (option.disabled) return;
    if (option.card) {
      const optionId = getOptionId(option);
      onCardClick?.({ ...option.card, gamecardId: optionId, id: optionId } as Card, e);
      return;
    }
    const optionId = getOptionId(option);
    onCardClick?.({ gamecardId: optionId, id: optionId, fullName: option.label || optionId, type: 'UNIT', color: 'NONE' } as Card, e);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={cn(
          "fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 md:p-8 transition-all duration-500 ease-in-out",
          isHidden ? "opacity-0 pointer-events-none invisible" : "opacity-100 pointer-events-auto visible"
        )}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={isHidden ? { scale: 0.8, opacity: 0, y: 40 } : { scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className={cn(
            "relative w-full bg-zinc-900/90 border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-500 ease-in-out",
            squarePanel
              ? "max-w-[22rem] md:max-w-[24rem] max-h-[90vh]"
              : (mode === 'double_selection' && !children) ? "max-w-md" : "max-w-6xl max-h-[90vh]",
            isHidden && "scale-95 blur-sm"
          )}
          onClick={e => e.stopPropagation()}
        >

          {/* Background Accents */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#f27d26] blur-[100px] rounded-full" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-red-600 blur-[100px] rounded-full" />
          </div>

          {/* Header */}
          <div className="relative z-10 px-6 py-6 md:px-10 md:py-8 border-b border-white/5 flex flex-col items-center text-center shrink-0">
            {onHide && (
              <button 
                onClick={onHide}
                className="absolute left-6 top-6 p-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all flex items-center gap-2 group border border-white/5"
                title="隐藏窗口以查看战场"
              >
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Zap className="w-4 h-4" />
                </motion.div>
                <span className="text-[10px] font-black tracking-widest uppercase">隐藏</span>
              </button>
            )}

            {onClose && (
              <button 
                onClick={onClose}
                className="absolute right-4 top-4 p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all group"
              >
                <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
              </button>
            )}

            <div className="flex items-center justify-center gap-3 mb-2">
              {mode === 'double_selection' && <Sparkles className="w-6 h-6 text-[#f27d26] animate-pulse" />}
              {(mode === 'card_selection' || mode === 'player_selection' || mode === 'choice_selection') && <Zap className="w-6 h-6 text-[#f27d26]" />}
              {mode === 'payment_selection' && <Loader2 className="w-6 h-6 text-[#f27d26] animate-spin" />}
              <h2 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-white">
                {title}
              </h2>
            </div>
            
            {description && (
              <p className="text-zinc-400 text-xs md:text-sm tracking-widest uppercase max-w-2xl leading-relaxed">
                {description}
              </p>
            )}

            {/* Selection Status */}
            {(mode === 'card_selection' || mode === 'player_selection' || mode === 'choice_selection') && maxSelections > 0 && (
              <div className="mt-4 px-4 py-1.5 bg-white/5 rounded-full border border-white/10 text-[10px] md:text-xs font-black text-zinc-500 uppercase tracking-widest">
                选择进度: {selectedIds.length} / {maxSelections} (至少 {minSelections})
              </div>
            )}

            {/* Payment Status */}
            {mode === 'payment_selection' && paymentCost !== undefined && (
              <div className="mt-4 flex items-center justify-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-[10px] font-bold tracking-widest">需求</span>
                  <span className="text-2xl md:text-3xl font-black text-red-500">{paymentCost}</span>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 text-[10px] font-bold tracking-widest">已选</span>
                  <span className="text-2xl md:text-3xl font-black text-white">{paymentCurrent}</span>
                </div>
              </div>
            )}
          </div>

          {/* Content Body */}
          <div className="relative z-10 flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
            {children}
            {mode === 'double_selection' ? (
              <div className="flex flex-col gap-6 items-center">
                <div className="flex gap-4 w-full">
                  <button
                    onClick={onConfirm}
                    disabled={confirmDisabled}
                    className={cn(
                      "flex-1 py-4 rounded-2xl font-black italic uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-xl text-sm",
                      confirmDisabled 
                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50 shadow-none hover:scale-100" 
                        : confirmType === 'primary' ? "bg-[#f27d26] text-white shadow-[#f27d26]/20" :
                          confirmType === 'danger' ? "bg-red-600 text-white shadow-red-600/20" :
                          "bg-amber-500 text-black shadow-amber-500/20"
                    )}
                  >
                    {confirmText}
                  </button>
                  <button
                    onClick={onCancel || onClose}
                    className="flex-1 py-4 bg-zinc-800 text-white border border-white/10 rounded-2xl font-black italic uppercase tracking-widest transition-all hover:bg-zinc-700 hover:scale-105 active:scale-95 text-sm"
                  >
                    {cancelText}
                  </button>
                </div>
              </div>
            ) : (mode === 'card_selection' || mode === 'card_display' || mode === 'player_selection' || mode === 'choice_selection') ? (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-5 md:gap-8 place-items-center">
                {renderedOptions.map((option, i) => {
                  const card = option.card;
                  const optionId = getOptionId(option);
                  const isSelected = selectedIds.includes(optionId);
                  const selectionOrder = selectedIds.indexOf(optionId) + 1;
                  const meta = card ? (cardMeta[card.gamecardId || card.id] || option || {}) : option;
                  const shouldDrawOption = mode === 'player_selection' || isPlayerOption(option) || !card;

                  if (shouldDrawOption) {
                    return (
                      <VisualOptionCard
                        key={`${optionId || i}-${i}`}
                        option={option}
                        isSelected={isSelected}
                        selectionOrder={selectionOrder}
                        onClick={() => handleOptionClick(option)}
                      />
                    );
                  }

                  if (!card) return null;

                  const locationText = [meta.ownerName, meta.slotLabel || meta.zoneLabel].filter(Boolean).join(' · ');
                  const isFaceDown =
                    !!meta.isFaceDown ||
                    meta.zoneLabel === 'EROSION_BACK' ||
                    meta.zoneLabel === '侵蚀区背面';
                  
                  return (
                    <motion.div
                      key={`${card.gamecardId || card.id}-${i}`}
                      whileTap={option.disabled ? undefined : { scale: 0.95 }}
                      onClick={(e) => {
                        handleOptionClick(option, e);
                      }}
                      onMouseEnter={() => onCardHover?.(card)}
                      onMouseLeave={() => onCardHover?.(null)}
                      className={cn(
                        "w-full aspect-[3/4] rounded-xl md:rounded-2xl overflow-hidden border-2 transition-all relative shrink-0",
                        highlightedIds.includes(card.gamecardId) && "z-20 !border-yellow-400 ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.95)]",
                        option.disabled && "opacity-40 grayscale cursor-not-allowed",
                        isSelected
                          ? "border-[#f27d26] shadow-[0_0_30px_rgba(242,125,38,0.4)] scale-105" 
                          : cn("border-white/5 opacity-80 hover:opacity-100", "cursor-pointer")
                      )}
                    >
                      <CardComponent card={card} isBack={isFaceDown} disableZoom={true} cardBackUrl={cardBackUrl} effectiveAcValue={meta.effectiveAcValue} />
                      {locationText && (
                        <div className="absolute left-2 top-2 max-w-[calc(100%-1rem)] rounded-lg bg-black/80 px-2 py-1 text-[10px] font-black leading-tight text-white shadow-lg ring-1 ring-white/10">
                          {locationText}
                        </div>
                      )}
                      
                      {/* Selection Order Badge */}
                      {isSelected && (mode === 'card_selection' || mode === 'choice_selection') && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 rounded-full bg-[#f27d26] text-black flex items-center justify-center shadow-2xl relative">
                            <span className="text-2xl font-black italic leading-none">{selectionOrder}</span>
                            <motion.div
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ repeat: Infinity, duration: 2 }}
                              className="absolute inset-0 rounded-full border-2 border-current opacity-30"
                            />
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : mode === 'payment_selection' ? (
              null // children already rendered above
            ) : null}
          </div>

          {/* Footer Actions */}
          {(mode === 'card_selection' || mode === 'player_selection' || mode === 'choice_selection' || mode === 'payment_selection') && (
            <div className="relative z-10 p-6 md:p-8 border-t border-white/5 bg-black/20 flex flex-col items-center gap-4 shrink-0">
              <button
                onClick={onSelectionComplete}
                disabled={(mode === 'card_selection' || mode === 'player_selection' || mode === 'choice_selection') && selectedIds.length < minSelections}
                className="px-12 py-4 bg-[#f27d26] text-white font-black italic uppercase tracking-[0.2em] rounded-xl hover:bg-[#f27d26]/80 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-xl shadow-[#f27d26]/20 hover:scale-105 active:scale-95"
              >
                {mode === 'payment_selection' ? '确认支付' : confirmText}
              </button>
              <div className="flex items-center gap-2 text-zinc-600 uppercase text-[10px] font-black tracking-widest">
                <Loader2 className="w-3 h-3 animate-spin" />
                等待确认
              </div>
            </div>
          )}

          {mode === 'card_display' && (
            <div className="relative z-10 p-6 md:p-8 border-t border-white/5 bg-black/20 flex justify-center shrink-0">
              <button
                onClick={onClose}
                className="px-12 py-4 bg-zinc-800 text-white font-black italic uppercase tracking-widest rounded-xl hover:bg-zinc-700 transition-all border border-white/10"
              >
                关闭
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
