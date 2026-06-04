import React, { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Flame, Play, RefreshCw, Shield, Sparkles, Swords, Trophy, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Card, CardType, Rarity } from '../types/game';

export type BattleAnimationType =
  | 'card-played'
  | 'damage'
  | 'attack'
  | 'confrontation'
  | 'resolving'
  | 'goddess'
  | 'defeat'
  | 'erosion-flip'
  | 'card-draw';

export interface BattleAnimationEvent {
  id: string;
  type: BattleAnimationType;
  side: 'player' | 'opponent' | 'neutral';
  title: string;
  subtitle?: string;
  cardName?: string;
  cardImageUrl?: string;
  sourceCardId?: string;
  amount?: number;
  cardType?: CardType;
  rarity?: Rarity;
  sourceAnchor?: string;
  targetAnchor?: string;
  playerUid?: string;
  chainLength?: number;
  targetZone?: string;
  revealTo?: 'owner' | 'all' | 'hidden';
  cardBackUrl?: string;
  chainItems?: BattleAnimationChainItem[];
}

export interface BattleAnimationChainItem {
  linkNumber: number;
  side: 'player' | 'opponent' | 'neutral';
  type: 'PLAY' | 'EFFECT' | 'ATTACK' | 'PHASE_END';
  title: string;
  subtitle?: string;
  cardName?: string;
  cardImageUrl?: string;
  sourceCardId?: string;
}

interface BattleAnimationLayerProps {
  events: BattleAnimationEvent[];
  enabled: boolean;
  onEventComplete: (eventId: string) => void;
  hoverPreview?: Card | null;
}

const DISPLAY_MS: Record<BattleAnimationType, number> = {
  'card-played': 1100,
  damage: 950,
  attack: 1000,
  confrontation: 3000,
  resolving: 1000,
  goddess: 1800,
  defeat: 1700,
  'erosion-flip': 1500,
  'card-draw': 2000
};

const CARD_MOVE_TYPES = new Set<BattleAnimationType>(['card-played', 'erosion-flip', 'card-draw']);

export const isBlockingBattleAnimation = (event: BattleAnimationEvent) => CARD_MOVE_TYPES.has(event.type);

export const battleAnimationGroupDuration = (events: BattleAnimationEvent[]) => {
  if (!events.length) return 0;
  const firstType = events[0].type;
  if (firstType === 'erosion-flip') return 1500;
  if (firstType === 'card-draw') return 2000 + (events.length - 1) * 120;
  return DISPLAY_MS[firstType] + (events.length - 1) * 120;
};

const EVENT_TONE: Record<BattleAnimationType, string> = {
  'card-played': 'from-[#f27d26] via-amber-300 to-white',
  damage: 'from-red-600 via-rose-300 to-white',
  attack: 'from-red-500 via-orange-300 to-white',
  confrontation: 'from-sky-400 via-white to-red-400',
  resolving: 'from-violet-400 via-white to-[#f27d26]',
  goddess: 'from-amber-200 via-[#f27d26] to-red-600',
  defeat: 'from-zinc-500 via-white to-red-500',
  'erosion-flip': 'from-zinc-800 via-purple-500 to-black',
  'card-draw': 'from-blue-400 via-cyan-300 to-white'
};

const ParallelEventPlayer: React.FC<{
  event: BattleAnimationEvent;
  index: number;
  total: number;
  layerRef: React.RefObject<HTMLDivElement | null>;
  onComplete: (id: string) => void;
  enabled: boolean;
}> = ({ event, index, total, layerRef, onComplete, enabled }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled) return;

    const groupDuration = event.type === 'erosion-flip'
      ? 1500
      : DISPLAY_MS[event.type] + index * 120;
    const exitDuration = 150; // duration of exit fade out

    const hideTimeout = window.setTimeout(() => {
      setVisible(false);
    }, Math.max(50, groupDuration - exitDuration));

    const completeTimeout = window.setTimeout(() => {
      onComplete(event.id);
    }, groupDuration);

    return () => {
      window.clearTimeout(hideTimeout);
      window.clearTimeout(completeTimeout);
    };
  }, [event.id, enabled, onComplete, event.type, index]);

  return (
    <AnimatePresence>
      {visible && (
        <AnimationScene
          key={event.id}
          event={event}
          layerRef={layerRef}
          index={index}
          total={total}
        />
      )}
    </AnimatePresence>
  );
};

export const BattleAnimationLayer: React.FC<BattleAnimationLayerProps> = ({
  events,
  enabled,
  onEventComplete,
  hoverPreview
}) => {
  const layerRef = useRef<HTMLDivElement>(null);

  // Group parallel events: contiguous 'card-played' events at the front can play simultaneously
  const parallelEvents = React.useMemo(() => {
    const list: BattleAnimationEvent[] = [];
    let groupType: string | null = null;
    
    for (const event of events) {
      if (!groupType) {
        groupType = event.type === 'card-played' || event.type === 'erosion-flip' || event.type === 'card-draw' ? event.type : 'cinematic';
      }
      
      if (groupType === 'cinematic') {
        if (list.length === 0) list.push(event);
        break;
      } else if (event.type === groupType) {
        list.push(event);
      } else {
        break;
      }
    }
    return list;
  }, [events]);

  useEffect(() => {
    if (enabled) return;
    events.forEach(event => onEventComplete(event.id));
  }, [enabled, events, onEventComplete]);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-[180] overflow-hidden">
      {enabled && parallelEvents.map((event, idx) => (
        <ParallelEventPlayer
          key={event.id}
          event={event}
          index={idx}
          total={parallelEvents.length}
          layerRef={layerRef}
          onComplete={onEventComplete}
          enabled={enabled}
        />
      ))}
      <CardHoverPreviewPortal enabled={enabled} card={hoverPreview} />
    </div>
  );
};

const AnimationScene: React.FC<{
  event: BattleAnimationEvent;
  layerRef: RefObject<HTMLDivElement>;
  index?: number;
  total?: number;
}> = ({ event, layerRef, index = 0, total = 1 }) => {
  if (event.type === 'damage') return <DamageAnimation event={event} layerRef={layerRef} />;
  if (event.type === 'goddess') return <GoddessAnimation event={event} />;
  if (event.type === 'defeat') return <DefeatAnimation event={event} />;
  if (event.type === 'confrontation') return <ConfrontationAnimation event={event} />;
  if (event.type === 'resolving') return <ResolvingAnimation event={event} />;
  if (event.type === 'attack') return <AttackAnimation event={event} />;
  if (event.type === 'erosion-flip') return <ErosionFlipAnimation event={event} layerRef={layerRef} index={index} total={total} />;
  if (event.type === 'card-draw') return <CardDrawAnimation event={event} layerRef={layerRef} index={index} total={total} />;
  return <CardPlayedAnimation event={event} layerRef={layerRef} index={index} total={total} />;
};

const sideOrigin = (side: BattleAnimationEvent['side']) => {
  if (side === 'opponent') return { x: 0, y: -280, rotate: 180 };
  if (side === 'player') return { x: 0, y: 280, rotate: 0 };
  return { x: -360, y: 0, rotate: -10 };
};

const sideLabel = (side: BattleAnimationEvent['side']) => {
  if (side === 'player') return '我方';
  if (side === 'opponent') return '敌方';
  return '战场';
};

type LocalRect = { x: number; y: number; width: number; height: number };

const attrSelector = (name: string, value: string) => `[${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;

const isUsableRect = (rect: DOMRect) => rect.width > 4 && rect.height > 4;

const rectFromElement = (element: Element, layer: HTMLElement): LocalRect | null => {
  const rect = element.getBoundingClientRect();
  if (!isUsableRect(rect)) return null;
  const layerRect = layer.getBoundingClientRect();
  return {
    x: rect.left - layerRect.left + rect.width / 2,
    y: rect.top - layerRect.top + rect.height / 2,
    width: rect.width,
    height: rect.height
  };
};

const resolveAnchorRect = (layer: HTMLElement | null, anchor?: string, cardId?: string): LocalRect | null => {
  if (!layer || typeof document === 'undefined') return null;
  const selectors = [
    cardId ? attrSelector('data-animation-card-id', cardId) : '',
    anchor ? attrSelector('data-animation-anchor', anchor) : ''
  ].filter(Boolean);

  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    for (const element of elements) {
      const rect = rectFromElement(element, layer);
      if (rect) return rect;
    }
  }

  // Fallback to base zone anchor if slot-indexed anchor was not found in DOM
  if (anchor) {
    let baseAnchor = anchor;
    if (anchor.includes(':erosion:')) {
      baseAnchor = anchor.split(':erosion:')[0] + ':erosion';
    } else if (anchor.includes(':unit:')) {
      baseAnchor = anchor.split(':unit:')[0] + ':unit-row';
    }

    if (baseAnchor !== anchor) {
      const selector = attrSelector('data-animation-anchor', baseAnchor);
      const elements = Array.from(document.querySelectorAll(selector));
      for (const element of elements) {
        const rect = rectFromElement(element, layer);
        if (rect) return rect;
      }
    }
  }

  return null;
};

const zoneFallbackPoint = (side: BattleAnimationEvent['side'], layer: HTMLElement | null, target = false): LocalRect => {
  const width = layer?.clientWidth || 960;
  const height = layer?.clientHeight || 540;
  const y = side === 'opponent' ? height * (target ? 0.34 : 0.12) : side === 'player' ? height * (target ? 0.66 : 0.9) : height * 0.5;
  return { x: width * 0.5, y, width: 90, height: 120 };
};

const cardBackFace = (cardBackUrl?: string) => cardBackUrl ? (
  <img
    src={cardBackUrl}
    alt="卡背"
    className="h-full w-full object-cover"
    draggable={false}
    referrerPolicy="no-referrer"
  />
) : (
  <div className="h-full w-full overflow-hidden border-4 border-[#2a2a2a] bg-[#1a1a1a] flex items-center justify-center">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-50" />
    <div className="w-10 h-10 border-4 border-zinc-700 rotate-45" />
  </div>
);

const cardFrontFace = (event: BattleAnimationEvent, toneClass: string) => (
  <div className={cn("absolute inset-0 aspect-[3/4] overflow-hidden rounded-lg border bg-zinc-950 [backface-visibility:hidden]", toneClass)}>
    {event.cardImageUrl ? (
      <img src={event.cardImageUrl} alt={event.cardName || event.title} className="h-full w-full object-cover" draggable={false} referrerPolicy="no-referrer" />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-zinc-900">
        <Sparkles className="h-8 w-8 text-[#f27d26]" />
      </div>
    )}
  </div>
);

const cardBackFaceElement = (toneClass: string) => (
  <div className={cn("absolute inset-0 aspect-[3/4] overflow-hidden rounded-lg border bg-zinc-950 [transform:rotateY(180deg)] [backface-visibility:hidden]", toneClass)}>
    {cardBackFace()}
  </div>
);

const CardPlayedAnimation: React.FC<{
  event: BattleAnimationEvent;
  layerRef: RefObject<HTMLDivElement>;
  index?: number;
  total?: number;
}> = ({ event, layerRef, index = 0, total = 1 }) => {
  const layer = layerRef.current;
  const start = resolveAnchorRect(layer, event.sourceAnchor) || resolveAnchorRect(layer, undefined, event.sourceCardId) || zoneFallbackPoint(event.side, layer);
  const end = resolveAnchorRect(layer, event.targetAnchor) || zoneFallbackPoint(event.side, layer, true);
  const hasAnchors = !!layer && (!!event.sourceAnchor || !!event.targetAnchor);
  const cardWidth = Math.max(58, Math.min(128, (start.width || 96) * 0.9));

  const staggerDelay = index * 0.12; // 120ms stagger delay
  // Add horizontal and vertical path offsets to prevent overlapping
  const pathOffsetX = total > 1 ? (index - (total - 1) / 2) * 16 : 0;
  const pathOffsetY = total > 1 ? (index - (total - 1) / 2) * -10 : 0;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const arc = Math.min(170, Math.max(76, Math.abs(dx) * 0.18 + Math.abs(dy) * 0.22));
  const isSr = event.rarity === 'SR';
  const isSer = event.rarity === 'SER';

  if (!hasAnchors) return <CenteredCardPlayedAnimation event={event} />;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0"
    >
      <motion.div
        initial={{ opacity: 0, x: 0, y: 0, rotate: event.side === 'opponent' ? 14 : -10, scale: 0.75 }}
        animate={{
          opacity: [0, 1, 1, 0],
          x: [0, dx * 0.45 + pathOffsetX, dx],
          y: [0, dy - arc + pathOffsetY, dy],
          rotate: [event.side === 'opponent' ? 14 : -10, dx > 0 ? 10 : -10, 0],
          scale: [0.75, isSer ? 1.18 : isSr ? 1.08 : 1, 0.94]
        }}
        transition={{
          duration: isSer ? 0.86 : isSr ? 0.78 : 0.68,
          delay: staggerDelay,
          times: [0, 0.55, 1],
          ease: 'easeOut'
        }}
        className="absolute"
        style={{ left: start.x - cardWidth / 2, top: start.y - (cardWidth * 4 / 3) / 2, width: cardWidth }}
      >
        {(isSr || isSer) && (
          <motion.div
            className={cn(
              "absolute -inset-3 rounded-xl blur-sm",
              isSer ? "bg-[conic-gradient(from_0deg,#f87171,#facc15,#4ade80,#38bdf8,#a78bfa,#f87171)]" : "bg-amber-300/55"
            )}
            animate={isSer ? { rotate: 360, opacity: [0, 0.85, 0.65, 0] } : { opacity: [0, 0.75, 0.4, 0] }}
            transition={{ duration: isSer ? 0.86 : 0.78, delay: staggerDelay, ease: 'linear' }}
          />
        )}
        <div className={cn(
          "relative aspect-[3/4] overflow-hidden rounded-lg border bg-zinc-950 shadow-2xl",
          isSer ? "border-white shadow-[0_0_44px_rgba(56,189,248,0.75)]" : isSr ? "border-amber-200 shadow-[0_0_34px_rgba(251,191,36,0.7)]" : "border-white/20 shadow-[0_0_24px_rgba(242,125,38,0.4)]"
        )}>
          {event.cardImageUrl ? (
            <img src={event.cardImageUrl} alt={event.cardName || event.title} className="h-full w-full object-cover" draggable={false} referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-900">
              <Sparkles className="h-8 w-8 text-[#f27d26]" />
            </div>
          )}
          {isSer && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/55 to-transparent mix-blend-screen" />}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.25 }}
        animate={{ opacity: [0, isSer ? 0.95 : 0.65, 0], scale: [0.25, isSer ? 2.4 : 1.8, isSer ? 3.1 : 2.3] }}
        transition={{ duration: 0.72, delay: staggerDelay + 0.46, ease: 'easeOut' }}
        className={cn(
          "absolute h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-4",
          isSer ? "border-sky-200 shadow-[0_0_50px_rgba(56,189,248,0.9)]" : isSr ? "border-amber-200 shadow-[0_0_44px_rgba(251,191,36,0.8)]" : "border-[#f27d26]/80 shadow-[0_0_34px_rgba(242,125,38,0.55)]"
        )}
        style={{ left: end.x, top: end.y }}
      />
      {isSer && (
        <motion.div
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{ opacity: [0, 0.8, 0], scale: [0.2, 1.7, 2.5] }}
          transition={{ duration: 0.65, delay: staggerDelay + 0.58, ease: 'easeOut' }}
          className="absolute h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fuchsia-200 shadow-[0_0_52px_rgba(217,70,239,0.85)]"
          style={{ left: end.x, top: end.y }}
        />
      )}
    </motion.div>
  );
};

const ErosionFlipAnimation: React.FC<{
  event: BattleAnimationEvent;
  layerRef: RefObject<HTMLDivElement>;
  index: number;
  total: number;
}> = ({ event, layerRef, index, total }) => {
  const start = useMemo(() => resolveAnchorRect(layerRef.current, event.sourceAnchor, event.sourceCardId) || zoneFallbackPoint(event.side, layerRef.current), [layerRef, event.sourceAnchor, event.sourceCardId, event.side]);
  const end = useMemo(() => resolveAnchorRect(layerRef.current, event.targetAnchor, event.sourceCardId) || zoneFallbackPoint(event.side, layerRef.current, true), [layerRef, event.targetAnchor, event.sourceCardId, event.side]);

  const cardWidth = Math.max(58, Math.min(128, (start.width || 96) * 0.9));
  const totalCards = Math.max(1, total);
  const travelDuration = 0.72;
  const staggerDelay = totalCards === 1 ? 0 : (index * (1.5 - travelDuration) / Math.max(1, totalCards - 1));
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const arc = Math.min(150, Math.max(58, Math.abs(dx) * 0.16 + Math.abs(dy) * 0.18));
  const targetIsFaceDown = event.targetZone === 'EROSION_BACK';
  const finalRotateY = targetIsFaceDown ? 180 : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50">
      <motion.div
        initial={{ opacity: 0, x: 0, y: 0, scale: 0.75, rotateY: 180, rotateZ: event.side === 'opponent' ? 14 : -10 }}
        animate={{
          opacity: [0, 1, 1, 0],
          x: [0, dx * 0.48, dx],
          y: [0, dy * 0.48 - arc, dy],
          scale: [0.75, 1.06, 0.94],
          rotateY: [180, targetIsFaceDown ? 180 : 70, finalRotateY],
          rotateZ: [event.side === 'opponent' ? 14 : -10, 0, 0]
        }}
        transition={{ duration: travelDuration, delay: staggerDelay, times: [0, 0.52, 1], ease: 'easeOut' }}
        className="absolute [transform-style:preserve-3d]"
        style={{ left: start.x - cardWidth / 2, top: start.y - (cardWidth * 4 / 3) / 2, width: cardWidth }}
      >
        {cardFrontFace(event, "border-purple-400/50 shadow-[0_0_34px_rgba(168,85,247,0.6)]")}
        {cardBackFaceElement("border-purple-400/50 shadow-[0_0_34px_rgba(168,85,247,0.6)]")}
      </motion.div>
    </motion.div>
  );
};

const CardDrawAnimation: React.FC<{
  event: BattleAnimationEvent;
  layerRef: RefObject<HTMLDivElement>;
  index: number;
  total: number;
}> = ({ event, layerRef, index, total }) => {
  const end = useMemo(() => resolveAnchorRect(layerRef.current, event.targetAnchor, event.sourceCardId) || zoneFallbackPoint(event.side, layerRef.current, true), [layerRef, event.targetAnchor, event.sourceCardId, event.side]);
  const layer = layerRef.current;
  const center = useMemo((): LocalRect => {
    const width = layer?.clientWidth || 960;
    const height = layer?.clientHeight || 540;
    return { x: width * 0.5, y: height * 0.5, width: 124, height: 165 };
  }, [layer]);
  const cardWidth = Math.max(84, Math.min(152, (center.width || 124) * 0.98));
  const staggerDelay = index * 0.12;
  const dx = end.x - center.x;
  const dy = end.y - center.y;
  
  const hideFront = event.revealTo === 'hidden' || (event.revealTo !== 'all' && event.side === 'opponent');
  const frontContent = hideFront || !event.cardImageUrl
    ? cardBackFace(event.cardBackUrl)
    : <img src={event.cardImageUrl} alt={event.cardName || event.title} className="h-full w-full object-cover" draggable={false} referrerPolicy="no-referrer" />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50">
      <motion.div
        initial={{ opacity: 0, x: 0, y: 0, scale: 0.72, rotateY: 180 }}
        animate={{
          opacity: [0, 1, 1, 1, 0],
          x: [0, 0, 0, dx, dx],
          y: [0, 0, 0, dy, dy],
          scale: [0.72, 1, 1, 0.72, 0.72],
          rotateY: hideFront ? [180, 180, 180, 180, 180] : [180, 0, 0, 0, 0]
        }}
        transition={{ duration: 1.8, delay: staggerDelay, times: [0, 0.16, 0.72, 0.94, 1], ease: 'easeInOut' }}
        className="absolute [transform-style:preserve-3d]"
        style={{ left: center.x - cardWidth / 2, top: center.y - (cardWidth * 4 / 3) / 2, width: cardWidth }}
      >
        <div className="absolute inset-0 aspect-[3/4] overflow-hidden rounded-lg border border-cyan-300/50 shadow-[0_0_24px_rgba(34,211,238,0.5)] bg-zinc-950 [backface-visibility:hidden]">
          {frontContent}
        </div>
        <div className="absolute inset-0 aspect-[3/4] overflow-hidden rounded-lg border border-cyan-300/50 shadow-[0_0_24px_rgba(34,211,238,0.5)] bg-zinc-950 [transform:rotateY(180deg)] [backface-visibility:hidden]">
          {cardBackFace(event.cardBackUrl)}
        </div>
      </motion.div>
    </motion.div>
  );
};

const CenteredCardPlayedAnimation: React.FC<{ event: BattleAnimationEvent }> = ({ event }) => {
  const origin = sideOrigin(event.side);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.55, x: origin.x, y: origin.y, rotate: origin.rotate }}
        animate={{ opacity: [0, 1, 1, 0], scale: [0.55, 1.06, 1, 1.18], x: 0, y: 0, rotate: 0 }}
        transition={{ duration: 1.05, times: [0, 0.22, 0.78, 1], ease: 'easeOut' }}
        className="relative flex flex-col items-center"
      >
        <div className="absolute -inset-8 rounded-full bg-[#f27d26]/20 blur-2xl" />
        <div className="absolute inset-1 rounded-2xl border border-[#f27d26]/70 shadow-[0_0_48px_rgba(242,125,38,0.7)]" />
        {event.cardImageUrl ? (
          <img
            src={event.cardImageUrl}
            alt={event.cardName || event.title}
            className="relative aspect-[3/4] w-28 rounded-xl border-2 border-white/20 object-cover shadow-2xl md:w-40"
            draggable={false}
          />
        ) : (
          <div className="relative flex aspect-[3/4] w-28 items-center justify-center rounded-xl border-2 border-[#f27d26]/70 bg-zinc-950/90 shadow-2xl md:w-40">
            <Sparkles className="h-9 w-9 text-[#f27d26]" />
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.25 }}
          className="mt-3 max-w-[72vw] rounded-full border border-[#f27d26]/40 bg-black/80 px-5 py-2 text-center shadow-2xl backdrop-blur-md"
        >
          <div className="text-[10px] font-black tracking-[0.28em] text-[#f27d26]">CARD PLAYED</div>
          <div className="truncate text-sm font-black italic text-white md:text-lg">{event.cardName || event.title}</div>
        </motion.div>
      </motion.div>
      <ImpactRing tone={EVENT_TONE[event.type]} />
    </motion.div>
  );
};

const DamageAnimation: React.FC<{ event: BattleAnimationEvent; layerRef: RefObject<HTMLDivElement> }> = ({ event, layerRef }) => {
  const isOpponent = event.side === 'opponent';
  const layer = layerRef.current;
  const source = resolveAnchorRect(layer, event.sourceAnchor) || zoneFallbackPoint(event.side, layer);
  const target = resolveAnchorRect(layer, event.targetAnchor) || zoneFallbackPoint(event.side, layer, true);
  const damage = Math.max(1, Number(event.amount || 1));
  const flyCount = Math.min(damage, 6);
  const spread = Math.min(170, 42 + damage * 18);
  const cardWidth = Math.max(34, Math.min(56, (source.width || 72) * 0.58));

  return (
    <motion.div
      initial={{ opacity: 0, x: 0 }}
      animate={{ opacity: 1, x: [0, -10, 10, -6, 6, 0] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.42 }}
      className={cn(
        'absolute inset-0 flex items-center justify-center',
        isOpponent ? 'items-start pt-[12vh]' : 'items-end pb-[12vh]'
      )}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.95, 0.4, 0] }}
        transition={{ duration: 0.85, times: [0, 0.18, 0.55, 1] }}
        className={cn(
          'absolute inset-x-0 h-1/2 bg-red-600/25 blur-sm',
          isOpponent ? 'top-0' : 'bottom-0'
        )}
      />
      <motion.div
        initial={{ scale: 0.4, y: isOpponent ? -24 : 24, opacity: 0 }}
        animate={{ scale: [0.4, 1.22, 1], y: 0, opacity: [0, 1, 0] }}
        transition={{ duration: 0.95, ease: 'easeOut' }}
        className="relative flex flex-col items-center opacity-90"
      >
        <div className="absolute -inset-12 rounded-full bg-red-500/30 blur-3xl" />
        <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-red-200/80 bg-red-950/80 shadow-[0_0_54px_rgba(239,68,68,0.8)] md:h-36 md:w-36">
          <Flame className="absolute h-16 w-16 text-red-500/35 md:h-20 md:w-20" />
          <span className="text-5xl font-black italic tabular-nums text-white drop-shadow-[0_6px_0_rgba(127,29,29,0.8)] md:text-7xl">
            {event.amount ?? '!'}
          </span>
        </div>
        <div className="mt-3 rounded-full border border-red-300/30 bg-black/80 px-5 py-2 text-xs font-black tracking-[0.24em] text-red-100 backdrop-blur-md">
          {sideLabel(event.side)}受到伤害
        </div>
      </motion.div>
      {Array.from({ length: flyCount }).map((_, index) => {
        const progress = flyCount === 1 ? 0 : (index / (flyCount - 1)) - 0.5;
        const scatterX = progress * spread;
        const scatterY = (index % 2 === 0 ? -1 : 1) * Math.min(70, spread * 0.36);
        const dx = target.x - source.x + scatterX;
        const dy = target.y - source.y + scatterY;
        const lift = Math.min(130, 56 + damage * 10 + index * 4);
        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 0, y: 0, rotateX: 0, rotateZ: index % 2 ? -10 : 10, scale: 0.86 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: [0, dx * 0.45, dx],
              y: [0, dy - lift, dy],
              rotateX: [0, 145 + damage * 10, 220 + index * 18],
              rotateZ: [index % 2 ? -10 : 10, progress * 45, progress * 100],
              scale: [0.86, 1, 0.82]
            }}
            transition={{ duration: 0.72 + index * 0.045, delay: index * 0.045, ease: 'easeOut', times: [0, 0.56, 1] }}
            className="absolute rounded-md border border-red-200/35 bg-gradient-to-br from-zinc-900 via-zinc-950 to-red-950 shadow-[0_0_18px_rgba(239,68,68,0.55)]"
            style={{
              left: source.x - cardWidth / 2,
              top: source.y - (cardWidth * 4 / 3) / 2,
              width: cardWidth,
              aspectRatio: '3 / 4',
              transformStyle: 'preserve-3d'
            }}
          >
            <div className="absolute inset-1 rounded border border-white/10 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.35),transparent_58%)]" />
          </motion.div>
        );
      })}
    </motion.div>
  );
};

const AttackAnimation: React.FC<{ event: BattleAnimationEvent }> = ({ event }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="absolute inset-0 flex items-center justify-center"
  >
    <motion.div
      initial={{ x: event.side === 'opponent' ? -260 : 260, opacity: 0, rotate: event.side === 'opponent' ? -18 : 18 }}
      animate={{ x: [event.side === 'opponent' ? -260 : 260, 0, 0], opacity: [0, 1, 0], rotate: [event.side === 'opponent' ? -18 : 18, 0, 0] }}
      transition={{ duration: 1, times: [0, 0.36, 1], ease: 'easeOut' }}
      className="relative flex items-center gap-4 rounded-3xl border border-red-300/30 bg-red-950/70 px-8 py-5 shadow-[0_0_60px_rgba(239,68,68,0.55)] backdrop-blur-md"
    >
      {event.cardImageUrl ? (
        <img
          src={event.cardImageUrl}
          alt={event.cardName || event.title}
          className="relative aspect-[3/4] w-14 rounded-lg border border-white/15 object-cover shadow-2xl md:w-20"
          draggable={false}
          referrerPolicy="no-referrer"
        />
      ) : (
        <Swords className="h-10 w-10 text-red-200 md:h-14 md:w-14" />
      )}
      <div>
        <div className="text-[10px] font-black tracking-[0.32em] text-red-200">ATTACK</div>
        <div className="max-w-[62vw] truncate text-2xl font-black italic text-white md:text-4xl">{event.cardName || event.title}</div>
        {event.subtitle && (
          <div className="text-[10px] text-white/50 tracking-wider mt-1">{event.subtitle}</div>
        )}
      </div>
    </motion.div>
    <ImpactRing tone={EVENT_TONE[event.type]} />
  </motion.div>
);

const ConfrontationAnimation: React.FC<{ event: BattleAnimationEvent }> = ({ event }) => {
  const items = event.chainItems?.length
    ? event.chainItems
    : [{
        linkNumber: event.chainLength || 1,
        side: 'neutral' as const,
        type: 'EFFECT' as const,
        title: event.title || '对抗链',
        subtitle: event.subtitle,
        cardName: event.cardName,
        cardImageUrl: event.cardImageUrl,
        sourceCardId: event.sourceCardId
      }];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 3, times: [0, 0.08, 0.88, 1], ease: 'easeOut' }}
      className="absolute inset-0 flex items-end justify-center bg-black/5 px-3 pb-[18vh] md:pb-[13vh]"
    >
      <motion.div
        initial={{ y: 42, scale: 0.98 }}
        animate={{ y: [42, 0, 8], scale: [0.98, 1, 0.99] }}
        transition={{ duration: 3, times: [0, 0.2, 1], ease: 'easeOut' }}
        className="relative w-full max-w-[min(96vw,980px)] overflow-hidden rounded-lg border border-white/12 bg-zinc-950/90 px-3 py-3 shadow-[0_0_38px_rgba(0,0,0,0.55)] backdrop-blur-md md:px-4"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        <div className="mb-2 text-left text-sm font-black italic tracking-widest text-white md:text-base">
          对抗链
        </div>
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {items.map((item, index) => (
            <ConfrontationChainNode
              key={`${item.linkNumber}-${item.sourceCardId || item.title}-${index}`}
              item={item}
              index={index}
              isLatest={index === items.length - 1}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

const ConfrontationChainNode: React.FC<{ item: BattleAnimationChainItem; index: number; isLatest: boolean }> = ({ item, index, isLatest }) => {
  const isMine = item.side === 'player';
  const isOpponent = item.side === 'opponent';
  const hasCard = !!item.cardImageUrl;
  const Icon = item.type === 'ATTACK'
    ? Swords
    : item.type === 'PHASE_END'
      ? RefreshCw
      : item.type === 'PLAY'
        ? Play
        : Zap;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: [0, 1, 1, 0], y: [24, 0, 0, 12], scale: [0.94, isLatest ? 1.03 : 1, isLatest ? 1.01 : 1, 0.98] }}
      transition={{ duration: 2.72, delay: index * 0.1, times: [0, 0.14, 0.88, 1], ease: 'easeOut' }}
      className={cn(
        "relative flex min-w-[16rem] max-w-[18rem] shrink-0 items-center gap-3 overflow-hidden rounded-md border bg-black/72 p-2.5 shadow-lg md:min-w-[19rem] md:max-w-[21rem]",
        isMine ? "border-emerald-300/55 shadow-emerald-500/20" : isOpponent ? "border-red-300/55 shadow-red-500/20" : "border-white/20",
        isLatest && "ring-1 ring-white/35"
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1", isMine ? "bg-emerald-400/80" : isOpponent ? "bg-red-500/80" : "bg-white/35")} />
      <div className="relative flex h-20 aspect-[3/4] shrink-0 items-center justify-center overflow-visible rounded border border-white/15 bg-zinc-950 md:h-24">
        {hasCard ? (
          <img
            src={item.cardImageUrl}
            alt={item.cardName || item.title}
            className="h-full w-full object-cover"
            draggable={false}
            referrerPolicy="no-referrer"
          />
        ) : (
          <Icon className={cn("h-7 w-7", isOpponent ? "text-red-100" : isMine ? "text-emerald-100" : "text-white")} />
        )}
        <motion.div
          initial={{ y: 12, opacity: 0, scale: 0.85 }}
          animate={{ y: [12, -2, -8], opacity: [0, 1, 0], scale: [0.85, 1, 1.05] }}
          transition={{ duration: 1.45, delay: index * 0.1 + 0.18, times: [0, 0.35, 1], ease: 'easeOut' }}
          className={cn(
            "absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center border-2 bg-black text-base font-black leading-none shadow-lg",
            isMine ? "border-emerald-300 text-emerald-100 shadow-emerald-500/30" : isOpponent ? "border-red-300 text-red-100 shadow-red-500/30" : "border-white/45 text-white"
          )}
        >
          {item.linkNumber}
        </motion.div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-xs font-black leading-tight text-white md:text-sm">
          {item.cardName || item.title}
        </div>
        {item.subtitle && (
          <div className={cn("mt-2 text-[11px] font-black tracking-wider", isMine ? "text-emerald-200" : isOpponent ? "text-red-200" : "text-white/60")}>
            {item.subtitle}
          </div>
        )}
      </div>
      {index > 0 && (
        <div className="absolute -left-2 top-1/2 hidden h-px w-4 -translate-y-1/2 bg-white/35 md:block" />
      )}
    </motion.div>
  );
};

const ResolvingAnimation: React.FC<{ event: BattleAnimationEvent }> = ({ event }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="absolute inset-0 flex items-center justify-center"
  >
    <motion.div
      initial={{ opacity: 0, y: 34, scale: 0.9 }}
      animate={{ opacity: [0, 1, 1, 0], y: [34, 0, 0, -18], scale: [0.9, 1.03, 1, 0.98] }}
      transition={{ duration: 0.82, times: [0, 0.24, 0.72, 1], ease: 'easeOut' }}
      className="relative flex max-w-[78vw] items-center gap-4 rounded-3xl border border-violet-200/25 bg-zinc-950/82 px-5 py-4 shadow-[0_0_58px_rgba(168,85,247,0.42)] backdrop-blur-md md:px-7"
    >
      <div className="absolute -inset-8 rounded-full bg-violet-500/15 blur-3xl" />
      {event.cardImageUrl ? (
        <img
          src={event.cardImageUrl}
          alt={event.cardName || event.title}
          className="relative aspect-[3/4] w-14 rounded-lg border border-white/15 object-cover shadow-2xl md:w-20"
          draggable={false}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/8 md:h-20 md:w-20">
          <Zap className="h-8 w-8 text-violet-200" />
        </div>
      )}
      <div className="relative min-w-0">
        <div className="text-[10px] font-black tracking-[0.32em] text-violet-200">RESOLVE</div>
        <div className="truncate text-lg font-black italic text-white md:text-2xl">{event.cardName || event.title}</div>
        <div className="mt-1 truncate text-[10px] font-bold tracking-[0.24em] text-white/45 md:text-xs">
          {event.subtitle || '效果结算'}
        </div>
      </div>
    </motion.div>
    <ImpactRing tone={EVENT_TONE.resolving} />
  </motion.div>
);

const GoddessAnimation: React.FC<{ event: BattleAnimationEvent }> = ({ event }) => {
  const isOpponent = event.side === 'opponent';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center bg-black/50"
    >
      <motion.div
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: [0, 1, 1, 0], opacity: [0, 1, 0.85, 0] }}
        transition={{ duration: 1.7, times: [0, 0.2, 0.75, 1], ease: 'easeInOut' }}
        className={cn(
          'absolute left-1/2 h-[70vh] w-24 -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent via-amber-200/60 to-transparent blur-xl',
          isOpponent ? 'top-0 origin-top' : 'bottom-0 origin-bottom'
        )}
      />
      <motion.div
        initial={{ scale: 0.8, opacity: 0, rotate: -8 }}
        animate={{ scale: [0.8, 1.08, 1], opacity: [0, 1, 0], rotate: [ -8, 0, 4 ] }}
        transition={{ duration: 1.75, times: [0, 0.35, 1], ease: 'easeOut' }}
        className="relative max-w-[88vw] rounded-[2rem] border border-amber-200/30 bg-zinc-950/85 px-8 py-7 text-center shadow-[0_0_90px_rgba(242,125,38,0.65)] backdrop-blur-md md:px-14 md:py-10"
      >
        <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.2),transparent_58%)]" />
        <Sparkles className="relative mx-auto h-12 w-12 text-amber-200 md:h-16 md:w-16" />
        <div className="relative mt-3 text-[10px] font-black tracking-[0.4em] text-[#f27d26]">GODDESS MODE</div>
        <div className="relative mt-1 text-4xl font-black italic tracking-tight text-white md:text-6xl">女神化</div>
        <div className="relative mt-3 text-xs font-black tracking-[0.28em] text-amber-100/80 md:text-sm">
          {event.subtitle || `${sideLabel(event.side)}进入女神化状态`}
        </div>
      </motion.div>
      <ImpactRing tone={EVENT_TONE[event.type]} />
    </motion.div>
  );
};

const DefeatAnimation: React.FC<{ event: BattleAnimationEvent }> = ({ event }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="absolute inset-0 flex items-center justify-center bg-black/65 backdrop-grayscale"
  >
    <motion.div
      initial={{ scale: 1.2, opacity: 0, y: 30 }}
      animate={{ scale: [1.2, 1, 0.98], opacity: [0, 1, 0], y: [30, 0, -20] }}
      transition={{ duration: 1.65, times: [0, 0.28, 1] }}
      className="relative flex max-w-[86vw] flex-col items-center rounded-[2rem] border border-white/10 bg-zinc-950/90 px-9 py-8 text-center shadow-[0_0_90px_rgba(0,0,0,0.9)] backdrop-blur-md md:px-16 md:py-10"
    >
      <Trophy className="h-14 w-14 text-zinc-300 md:h-20 md:w-20" />
      <div className="mt-3 text-[10px] font-black tracking-[0.4em] text-red-300">MATCH END</div>
      <div className="mt-1 text-4xl font-black italic text-white md:text-6xl">{event.title}</div>
      {event.subtitle && (
        <div className="mt-3 text-xs font-black tracking-[0.24em] text-white/55 md:text-sm">{event.subtitle}</div>
      )}
    </motion.div>
  </motion.div>
);

const ImpactRing: React.FC<{ tone: string }> = ({ tone }) => (
  <motion.div
    initial={{ scale: 0.2, opacity: 0.9 }}
    animate={{ scale: 3.4, opacity: 0 }}
    transition={{ duration: 0.85, ease: 'easeOut' }}
    className={cn('absolute h-28 w-28 rounded-full border-4 bg-gradient-to-br opacity-70 blur-[1px] md:h-40 md:w-40', tone)}
  />
);

const CardHoverPreviewPortal: React.FC<{ enabled: boolean; card?: Card | null }> = ({ enabled, card }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {enabled && card && (
        <CardHoverPreview key={card.gamecardId || card.id} card={card} />
      )}
    </AnimatePresence>,
    document.body
  );
};

const CardHoverPreview: React.FC<{ card: Card }> = ({ card }) => {
  const imageUrl = card.fullImageUrl || card.imageUrl;

  if (!imageUrl) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 18, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 18, scale: 0.97 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="pointer-events-none fixed right-4 top-20 z-[2300] hidden w-[300px] rounded-2xl border border-white/10 bg-black/78 p-3 shadow-2xl backdrop-blur-md lg:block"
    >
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
        <img
          src={imageUrl}
          alt={card.fullName}
          className="aspect-[3/4] w-full object-contain"
          draggable={false}
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="mt-3">
        <div className="text-sm font-black text-white">{card.fullName}</div>
        <div className="mt-1 text-[10px] font-bold tracking-widest text-white/45">
          {card.id} · {card.type} · {card.color}
        </div>
        {card.description && (
          <div className="mt-2 max-h-28 overflow-hidden text-xs leading-relaxed text-white/70">
            {card.description}
          </div>
        )}
      </div>
    </motion.div>
  );
};
