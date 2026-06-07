import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import type { Card } from '../types/game';
import { getCardImageUrl } from '../lib/utils';
import { KeywordBadges } from './KeywordBadges';
import { CardEffectList } from './CardEffectList';

const TABLE_ANCHOR_SELECTOR = '[data-card-preview-anchor="table"]';
const CENTER_AXIS_SELECTOR = '[data-card-preview-anchor="center-axis"]';

interface CardHoverPreviewPortalProps {
  card?: Card | null;
}

export const CardHoverPreviewPortal: React.FC<CardHoverPreviewPortalProps> = ({ card }) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {card && <CardHoverPreview key={card.gamecardId || card.id} card={card} />}
    </AnimatePresence>,
    document.body
  );
};

const CardHoverPreview: React.FC<{ card: Card }> = ({ card }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const imageUrl = card.fullImageUrl || card.imageUrl || getCardImageUrl(card.id, card.rarity, false, card.availableRarities);

  const updatePosition = useCallback(() => {
    if (typeof window === 'undefined') return;

    const panelRect = panelRef.current?.getBoundingClientRect();
    const panelWidth = panelRect?.width || 320;
    const panelHeight = panelRect?.height || Math.min(window.innerHeight - 24, 620);
    const margin = 8;
    const gap = 8;
    const tableElement = Array.from(document.querySelectorAll<HTMLElement>(TABLE_ANCHOR_SELECTOR))
      .find(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    const centerElement = Array.from(document.querySelectorAll<HTMLElement>(CENTER_AXIS_SELECTOR))
      .find(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    const tableRect = tableElement?.getBoundingClientRect();
    const centerRect = centerElement?.getBoundingClientRect();
    const idealLeft = tableRect ? tableRect.right + gap : window.innerWidth - panelWidth - margin;
    const maxLeft = window.innerWidth - panelWidth - margin;
    const left = Math.max(margin, Math.min(idealLeft, maxLeft));
    const centerY = centerRect ? centerRect.top + centerRect.height / 2 : window.innerHeight / 2;
    const maxHeight = Math.max(280, window.innerHeight - margin * 2);
    const measuredHeight = Math.min(panelHeight, maxHeight);
    const top = Math.max(margin, Math.min(centerY - measuredHeight / 2, window.innerHeight - measuredHeight - margin));

    setPosition({
      left: Math.round(left),
      top: Math.round(top),
      maxHeight: Math.round(maxHeight)
    });
  }, []);

  useLayoutEffect(() => {
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updatePosition)
      : null;
    if (observer) {
      if (panelRef.current) observer.observe(panelRef.current);
      document.querySelectorAll<HTMLElement>(`${TABLE_ANCHOR_SELECTOR}, ${CENTER_AXIS_SELECTOR}`)
        .forEach(element => observer.observe(element));
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      observer?.disconnect();
    };
  }, [card.gamecardId, card.id, updatePosition]);

  if (!imageUrl) return null;

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, x: 18, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 18, scale: 0.97 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={position ? { left: position.left, top: position.top, maxHeight: position.maxHeight } : undefined}
      className="pointer-events-none fixed right-2 top-24 z-[2300] hidden w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-black/88 p-2.5 shadow-2xl backdrop-blur-md lg:block"
    >
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
        <img
          src={imageUrl}
          alt={card.fullName}
          className="aspect-[3/4] max-h-[42vh] w-full object-contain"
          draggable={false}
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="mt-2 min-h-0 overflow-hidden">
        <div className="truncate text-sm font-black text-white">{card.fullName}</div>
        <div className="mt-1 text-[10px] font-bold tracking-widest text-white/45">
          {card.id} · {card.type} · {card.color}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className="rounded-lg border border-white/5 bg-white/5 px-2 py-1 text-center">
            <div className="text-[8px] font-black text-white/35">AC</div>
            <div className="text-xs font-black text-white">{card.acValue ?? '-'}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/5 px-2 py-1 text-center">
            <div className="text-[8px] font-black text-white/35">力量</div>
            <div className="text-xs font-black text-white">{card.type === 'UNIT' ? card.power : '-'}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-white/5 px-2 py-1 text-center">
            <div className="text-[8px] font-black text-white/35">伤害</div>
            <div className="text-xs font-black text-white">{card.type === 'UNIT' ? card.damage : '-'}</div>
          </div>
        </div>
        <div className="mt-2">
          <KeywordBadges card={card} variant="compact" />
        </div>
        {card.description && (
          <div className="mt-2 max-h-24 overflow-y-auto rounded-xl border border-white/5 bg-white/5 p-2 text-[11px] leading-relaxed text-white/55 custom-scrollbar">
            {card.description}
          </div>
        )}
        <CardEffectList
          card={card}
          compact
          className="mt-2 max-h-36 overflow-y-auto pr-1 custom-scrollbar"
        />
      </div>
    </motion.div>
  );
};
