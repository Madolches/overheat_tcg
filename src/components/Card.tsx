import React from 'react';
import { motion } from 'motion/react';
import { Card as CardType, Rarity } from '../types/game';
import { clsx } from 'clsx';
import { Sword, Shield, Zap, Plus } from 'lucide-react';
import { cn, getCardColorHanzi, getCardImageUrl, getGainedCardColors } from '../lib/utils';
import { KeywordBadges } from './KeywordBadges';
import { DEFAULT_CARD_BACK_URL } from '../data/customization';

interface CardProps {
  card?: CardType;
  onClick?: () => void;
  className?: string;
  showDetails?: boolean;
  count?: number;
  isBack?: boolean;
  isExhausted?: boolean;
  disableZoom?: boolean;
  statusBorder?: 'red' | 'blue';
  displayMode?: 'deck' | 'unit' | 'erosion_item' | 'hand' | 'none';
  cardBackUrl?: string;
  isHighlighted?: boolean;
  hideKeywords?: boolean;
  effectiveAcValue?: number;
}

const getRarityClass = (rarity: Rarity) => {
  switch (rarity) {
    case 'C':
    case 'U':
      return 'rarity-border-cu';
    case 'R':
      return 'rarity-border-r';
    case 'SR':
      return 'rarity-border-sr';
    case 'UR':
      return 'rarity-border-ur';
    case 'SER':
      return 'rarity-border-ser';
    case 'PR':
      return 'rarity-border-pr';
    default:
      return 'border-zinc-700';
  }
};

const colorBadgeClass: Record<string, string> = {
  RED: 'border-red-200/80 bg-red-600/90 text-white',
  YELLOW: 'border-yellow-100/80 bg-yellow-400/95 text-zinc-950',
  WHITE: 'border-white/90 bg-zinc-100/95 text-zinc-950',
  GREEN: 'border-green-100/80 bg-green-600/90 text-white',
  BLUE: 'border-sky-100/80 bg-blue-600/90 text-white'
};

const CardComponentImpl: React.FC<CardProps> = ({
  card,
  onClick,
  className,
  count,
  isBack,
  isExhausted,
  disableZoom,
  statusBorder,
  displayMode,
  cardBackUrl,
  isHighlighted,
  hideKeywords = false,
  effectiveAcValue
}) => {
  if (isBack || !card) {
    const backExhausted = !!isExhausted;
    return (
      <motion.div
        className={clsx(
          'relative aspect-[3/4] w-full rounded-xl overflow-hidden border-2 border-zinc-700 cursor-default bg-zinc-900 shadow-xl',
          backExhausted && 'opacity-85 saturate-75',
          className
        )}
      >
        <div className={clsx('absolute inset-0 transition-transform duration-300', backExhausted && 'rotate-90 scale-75')}>
          <img
            src={cardBackUrl || DEFAULT_CARD_BACK_URL}
            alt="卡背"
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            draggable={false}
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="absolute inset-0 bg-black/20" />
      </motion.div>
    );
  }

  const displayedAcValue = effectiveAcValue ?? card.acValue;
  const isNegativeCost = displayedAcValue < 0;
  const fullImageUrl = card.fullImageUrl || getCardImageUrl(card.id, card.rarity, false, card.availableRarities);
  const imageUrl = card.imageUrl || fullImageUrl;
  const exhausted = isExhausted ?? !!card.isExhausted;
  const showStats = displayMode !== 'erosion_item' && displayMode !== 'none';
  const showAC = showStats && (displayMode === 'hand' || displayMode === 'deck' || displayMode === 'erosion_item');
  const showUnitStats = showStats && displayMode === 'unit' && card.type === 'UNIT';
  const isHand = displayMode === 'hand';
  const gainedColors = card.type === 'UNIT' && displayMode === 'unit'
    ? getGainedCardColors(card)
    : [];

  const handleCardClick = (_e: React.MouseEvent) => {
    // Zoom logic removed
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) onClick();
  };

  return (
    <motion.div
      initial={false}
      whileTap={disableZoom ? undefined : { scale: 0.98 }}
      onClick={handleCardClick}
      className={clsx(
        'relative aspect-[3/4] w-full rounded-xl cursor-pointer group transition-[border-color,box-shadow,opacity,filter] duration-300 bg-zinc-900 shadow-xl',
        statusBorder
          ? statusBorder === 'red'
            ? 'border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)]'
            : 'border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.6)]'
          : `${getRarityClass(card.rarity)} border-2`,
        isHighlighted && '!border-yellow-400 !border-2 shadow-[0_0_20px_rgba(250,204,21,1)] z-50 scale-105',
        exhausted && 'opacity-85 saturate-75 shadow-[inset_0_0_0_2px_rgba(251,191,36,0.35)]',
        className
      )}
    >
      <div className={clsx('absolute inset-0 overflow-hidden rounded-xl transition-transform duration-300', exhausted && 'rotate-90 scale-75')}>
        <img
          src={imageUrl}
          alt={card.fullName || fullImageUrl}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={(event) => {
            const img = event.currentTarget;
            if (img.src !== fullImageUrl) img.src = fullImageUrl;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
      </div>

      {!hideKeywords && (
        <div className="absolute top-0.5 right-0.5 md:top-1 md:right-1 z-10 flex flex-col items-end gap-0.5">
          <KeywordBadges card={card} />
        </div>
      )}

      {gainedColors.length > 0 && (
        <div className="pointer-events-none absolute top-0.5 left-0.5 z-20 flex max-h-[calc(100%-0.25rem)] flex-col gap-0.5 md:top-1 md:left-1">
          {gainedColors.map(color => (
            <span
              key={color}
              className={cn(
                'flex h-4 min-w-4 items-center justify-center rounded-sm border px-0.5 text-[9px] font-black leading-none shadow-lg md:h-5 md:min-w-5 md:text-[10px]',
                colorBadgeClass[color]
              )}
            >
              {getCardColorHanzi(color)}
            </span>
          ))}
        </div>
      )}

      {showAC && (
        <div className="absolute top-0.5 left-0.5 md:top-1 md:left-1 z-10">
          <div
            className={clsx(
              'w-5 h-5 md:w-7 md:h-7 rounded-full border-1 md:border-1.5 flex flex-col items-center justify-center font-bold shadow-lg',
              isNegativeCost ? 'bg-blue-600/90 border-blue-200 text-white' : 'bg-red-600/90 border-red-200 text-white'
            )}
          >
            <span className="text-[4px] md:text-[6px] leading-none opacity-80 font-black">AC</span>
            <span className="text-[10px] md:text-xs leading-none mt-0 md:mt-0.5">
              {isHand ? Math.abs(displayedAcValue) : displayedAcValue >= 0 ? `+${displayedAcValue}` : displayedAcValue}
            </span>
          </div>
        </div>
      )}

      {showUnitStats && (
        <>
          <div className="absolute bottom-1 right-1/2 translate-x-[-2px] md:bottom-1.5 md:left-1.5 md:translate-x-0">
            <div className="flex items-center gap-0.5 md:gap-1 bg-black/60 backdrop-blur-md border border-red-500/40 rounded-sm md:rounded-md px-1 md:px-1.5 py-0.5 shadow-lg">
              <Sword className="w-2.5 h-2.5 md:w-3 md:h-3 text-red-500" />
              <span className="text-[10px] md:text-xs font-black text-white">{card.damage}</span>
            </div>
          </div>

          <div className="absolute bottom-1 left-1/2 translate-x-[2px] md:bottom-1.5 md:right-1.5 md:translate-x-0">
            <div className="flex items-center gap-0.5 md:gap-1 bg-black/60 backdrop-blur-md border border-blue-400/40 rounded-sm md:rounded-md px-1 md:px-1.5 py-0.5 shadow-lg">
              <Shield className="w-2.5 h-2.5 md:w-3 md:h-3 text-blue-400" />
              <span className="text-[10px] md:text-xs font-black text-white">{card.power}</span>
            </div>
          </div>
        </>
      )}

      {card.godMark && (
        <div className="absolute bottom-6 md:bottom-2 left-1/2 -translate-x-1/2">
          <div className="w-5 h-5 md:w-7 md:h-7 rounded-full bg-zinc-950 border-1.5 md:border-2 border-red-500 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.6)]">
            <Zap className="w-3 h-3 md:w-4 md:h-4 text-red-500 fill-red-500" />
          </div>
        </div>
      )}

      {onClick && (
        <button
          onClick={handleActionClick}
          className="absolute top-2 left-2 w-8 h-8 rounded-full bg-red-600 border border-white/20 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <Plus className="w-4 h-4 text-white" />
        </button>
      )}

      {count !== undefined && count > 0 && (
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-xs font-bold z-10 shadow-lg">
          {count}
        </div>
      )}
    </motion.div>
  );
};

export const CardComponent = React.memo(CardComponentImpl);
CardComponent.displayName = 'CardComponent';
