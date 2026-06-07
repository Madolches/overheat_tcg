import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, PlayerOngoingEffect, PlayerState, StackItem, GameState, SandboxEditableZone, SandboxPlayerKey } from '../types/game';
import { CardComponent } from './Card';
import { StandardPopup } from './StandardPopup';
import { KeywordBadges } from './KeywordBadges';
import { CardHoverPreviewPortal } from './CardHoverPreviewPortal';
import { GameService } from '../services/gameService';
import { ArrowDown, Shield, Sword, Zap, Flag, Play, X, LogOut, Coins, Sparkles, Hourglass } from 'lucide-react';
import { cn } from '../lib/utils';
import { getPlayerWealthCount } from '../lib/wealth';
import { getPlayerOngoingEffects } from '../lib/playerOngoingEffects';
import { getPlayZoneProjection } from '../lib/playZoneProjection';

export const AnimatingCardsContext = createContext<Set<string> | undefined>(undefined);
const StackOrderContext = createContext<Map<string, number> | undefined>(undefined);
const HandStackOrderContext = createContext<Map<string, number> | undefined>(undefined);

const StackOrderBadge: React.FC<{ order?: number; className?: string }> = ({ order, className }) => {
  if (!order) return null;

  return (
    <div className={cn(
      "pointer-events-none absolute inset-0 z-50 flex items-center justify-center",
      className
    )}>
      <div className="relative isolate flex aspect-square h-[28%] min-h-6 max-h-9 items-center justify-center rounded-full border border-sky-100/70 bg-sky-950/35 p-[2px] shadow-[0_7px_18px_rgba(0,0,0,0.5),0_0_14px_rgba(56,189,248,0.28),inset_0_1px_5px_rgba(255,255,255,0.22)] ring-1 ring-amber-200/20 backdrop-blur-md">
        <div className="absolute inset-[-3px] -z-10 rounded-full bg-sky-400/18 blur-[4px]" />
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/20 bg-[radial-gradient(circle_at_32%_18%,rgba(255,255,255,0.34),transparent_34%),radial-gradient(circle_at_72%_76%,rgba(251,191,36,0.26),transparent_38%),linear-gradient(145deg,rgba(14,116,144,0.72),rgba(12,74,110,0.64)_48%,rgba(9,9,11,0.78))] text-sky-50 shadow-[inset_0_1px_5px_rgba(255,255,255,0.28),inset_0_-3px_7px_rgba(2,132,199,0.32)]">
          <span className="text-sm font-black leading-none tabular-nums md:text-base">{order}</span>
        </div>
      </div>
    </div>
  );
};

interface PlayFieldProps {
  player: PlayerState;
  opponent: PlayerState;
  game: GameState;
  onCardClick?: (card: Card, zone: string, index?: number, e?: React.MouseEvent) => void;
  onPreviewCard?: (card: Card) => void;
  onPlayCard?: (card: Card) => void;
  paymentSelection?: { useFeijing: string[], exhaustIds: string[], erosionFrontIds?: string[] };
  pendingPlayCard?: Card | null;
  stack: StackItem[];
  myUid: string;
  selectedAttackers?: string[];
  selectedDefender?: string;
  allianceInitiator?: string;
  timer?: number;
  cardBackUrl?: string;
  viewingZone?: { title: string, type: string, isOpponentZone?: boolean } | null;
  setViewingZone?: (zone: { title: string, type: string, isOpponentZone?: boolean } | null) => void;
  highlightedCardIds?: Set<string>;
  selectedTargetIds?: Set<string>;
  selectedTargetCardIds?: string[];
  onSurrender?: () => void;
  onEndTurn?: () => void;
  onEndBattleFree?: () => void;
  onOpenPhaseMenu?: () => void;
  confrontationStrategy?: 'ON' | 'AUTO' | 'OFF';
  onUpdateStrategy?: (strategy: 'ON' | 'AUTO' | 'OFF') => void;
  canConfront?: boolean;
  isConfrontPromptActive?: boolean;
  isCounteringPromptActive?: boolean;
  isDefensePromptActive?: boolean;
  isCounteringPromptWaiting?: boolean;
  onStartConfront?: () => void;
  onDeclineConfront?: () => void;
  onDeclineDefense?: () => void;
  showPhaseMenu?: boolean;
  isAnyPopupOpen?: boolean;
  isPopupHidden?: boolean;
  onHidePopup?: () => void;
  onExpand?: () => void;
  isSpectator?: boolean;
  ignoreOpponentCardSkins?: boolean;
  handEffectsEnabled?: boolean;
  sandboxEditMode?: boolean;
  onSandboxZoneClick?: (target: { playerKey: SandboxPlayerKey; zone: SandboxEditableZone; index?: number; card?: Card | null }) => void;
  sandboxCenterControls?: React.ReactNode;
  onHoverPreview?: (card: Card | null) => void;
  animatingCardIds?: Set<string>;
}

type HandDragState = {
  cardId: string;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
};

const CardSlot: React.FC<{
  card: Card | null;
  label?: string;
  onClick?: (e: React.MouseEvent) => void;
  onPreview?: (card: Card) => void;
  onHover?: (card: Card | null) => void;
  className?: string;
  isFaceUp?: boolean;
  isExhausted?: boolean;
  isSelectedForPayment?: boolean;
  isDeck?: boolean;
  count?: number | string;
  showCount?: boolean;
  isAttacking?: boolean;
  isDefending?: boolean;
  isOpponent?: boolean;
  isAllianceInitiator?: boolean;
  displayMode?: 'deck' | 'unit' | 'erosion_item' | 'none';
  slotLabel?: string;
  cardBackUrl?: string;
  isHighlighted?: boolean;
  isSelectedForQuery?: boolean;
  querySelectionOrder?: number;
  allowFaceDownHover?: boolean;
  ignoreSkin?: boolean;
  animationAnchor?: string;
}> = ({ card, label, onClick, onPreview, onHover, className, isFaceUp = true, isExhausted, isSelectedForPayment, isDeck, count = 0, showCount = true, isAttacking, isDefending, isOpponent, isAllianceInitiator, displayMode, slotLabel, cardBackUrl, isHighlighted, isSelectedForQuery, querySelectionOrder, allowFaceDownHover = false, ignoreSkin = false, animationAnchor }) => {
  const animatingCardIds = useContext(AnimatingCardsContext);
  const stackOrders = useContext(StackOrderContext);
  const isAnimating = !!(card && animatingCardIds?.has(card.gamecardId));
  const stackOrder = card && isFaceUp ? stackOrders?.get(card.gamecardId) : undefined;
  const visibleStackOrder = isAnimating ? undefined : stackOrder;

  // Dynamic height scaling for stack areas. Do not stretch visible cards in grave/exile.
  const isStackArea = isDeck || label === '墓地' || label === '放逐';
  const numericCount = typeof count === 'number' ? count : 0;
  const shouldScaleStackHeight = isStackArea && (isDeck || !card);
  const heightScale = shouldScaleStackHeight ? 1 + Math.min(numericCount / 100, 0.2) : 1;
  const isDeclaredEffectTarget =
    !!card?.declaredTargetMarkers?.length ||
    !!card?.influencingEffects?.some(effect => effect.description.includes('指定为效果对象'));
  return (
    <div
      className={cn(
        "relative transition-all duration-300",
        displayMode === 'unit' ? "w-full aspect-[3/4] max-w-[130px]" : "w-full aspect-[3/4]"
      )}
      style={{ transform: `scaleY(${heightScale})`, transformOrigin: isOpponent ? 'top' : 'bottom' }}
    >
      <div
        data-animation-anchor={animationAnchor}
        data-animation-card-id={card?.gamecardId}
        className={cn(
          "relative h-full w-full rounded-md border border-white/10 transition-all flex items-center justify-center group overflow-hidden cursor-pointer",
          (card || isDeck || count > 0) ? "bg-black/40 shadow-lg" : "bg-white/5",
          isSelectedForPayment ? "z-10 shadow-[0_0_20px_rgba(168,85,247,0.8)] ring-1 ring-purple-400" : "",
          isAllianceInitiator ? "z-10 shadow-[0_0_20px_rgba(220,38,38,0.8)] ring-2 ring-red-600" : "",
          isHighlighted ? "z-20 !border-yellow-400 ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.95)]" : "",
          isSelectedForQuery ? "z-30 !border-[#f27d26] ring-4 ring-[#f27d26] shadow-[0_0_28px_rgba(242,125,38,0.95)]" : "",
          (isAttacking || isDefending) ? "z-10" : "",
          isAnimating && "!transition-none invisible pointer-events-none",
          className
        )}
        onClick={(e) => {
          if (onClick) onClick(e);
          if (!isFaceUp && card && onPreview && !isOpponent) onPreview(card);
        }}
        onMouseEnter={() => card && (isFaceUp || allowFaceDownHover) && onHover?.(card)}
        onMouseLeave={() => onHover?.(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (card && onPreview && (isFaceUp || !isOpponent)) onPreview(card);
        }}
      >
        {isDeck ? (
          <CardComponent isBack cardBackUrl={cardBackUrl} />
        ) : card ? (
          <div className={cn(
            "h-full w-full relative transition-[opacity,filter] duration-500",
            isOpponent && "rotate-180",
            isExhausted && "opacity-90"
          )}>
            {isFaceUp ? (
              <CardComponent card={card} className="border-0" isExhausted={isExhausted} statusBorder={isAttacking ? 'red' : isDefending ? 'blue' : undefined} displayMode={displayMode} cardBackUrl={cardBackUrl} isHighlighted={isHighlighted} hideKeywords={isOpponent} ignoreSkin={ignoreSkin} />
            ) : (
              <CardComponent isBack className="border-0" isExhausted={isExhausted} cardBackUrl={cardBackUrl} />
            )}
          </div>
        ) : count > 0 ? (
          <CardComponent isBack cardBackUrl={cardBackUrl} />
        ) : (
          <span className="text-[8px] uppercase font-bold opacity-20 tracking-widest text-center px-1">
            {label}
          </span>
        )}

        {card && isFaceUp && isOpponent && (
          <div className="pointer-events-none absolute bottom-0.5 right-0.5 z-20 md:bottom-1 md:right-1">
            <KeywordBadges card={card} />
          </div>
        )}

        {(isAttacking || isDefending || isDeclaredEffectTarget || isSelectedForQuery) && (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-30 flex items-center justify-center",
              isOpponent && "rotate-180"
            )}
          >
            <div className="flex items-center justify-center gap-1 md:gap-1.5">
              {isSelectedForQuery && (
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-orange-100/80 bg-gradient-to-br from-[#d7b45a] via-[#f27d26] to-zinc-950 text-xs font-black text-black shadow-[0_12px_24px_rgba(242,125,38,0.65),inset_0_2px_6px_rgba(255,255,255,0.35)] md:h-11 md:w-11 md:text-sm">
                  {querySelectionOrder || '选'}
                </div>
              )}
              {(isAttacking || isDefending) && (
                <div
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-full border shadow-2xl md:h-11 md:w-11",
                    isAttacking
                      ? "border-red-200/80 bg-gradient-to-br from-red-500 via-rose-600 to-zinc-950 shadow-[0_12px_24px_rgba(239,68,68,0.55),inset_0_2px_6px_rgba(255,255,255,0.35)]"
                      : "border-blue-100/80 bg-gradient-to-br from-sky-300 via-blue-600 to-zinc-950 shadow-[0_12px_24px_rgba(59,130,246,0.55),inset_0_2px_6px_rgba(255,255,255,0.35)]"
                  )}
                >
                  <div className="absolute inset-1 rounded-full bg-white/10 blur-[1px]" />
                  {isAttacking ? (
                    <Sword className="relative h-5 w-5 -rotate-45 text-white drop-shadow-[0_3px_2px_rgba(0,0,0,0.75)] md:h-6 md:w-6" />
                  ) : (
                    <Shield className="relative h-5 w-5 text-white drop-shadow-[0_3px_2px_rgba(0,0,0,0.75)] md:h-6 md:w-6" />
                  )}
                </div>
              )}
              {isDeclaredEffectTarget && (
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-amber-100/80 bg-gradient-to-br from-amber-300 via-orange-500 to-zinc-950 shadow-[0_12px_24px_rgba(245,158,11,0.55),inset_0_2px_6px_rgba(255,255,255,0.35)] md:h-11 md:w-11">
                  <div className="absolute inset-1 rounded-full bg-white/10 blur-[1px]" />
                  <ArrowDown className="relative h-5 w-5 text-white drop-shadow-[0_3px_2px_rgba(0,0,0,0.75)] md:h-6 md:w-6" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Count Badge - Repositioned to center and enlarged */}
        {showCount && !stackOrder && (count > 0 || typeof count === 'string') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="bg-black/60 backdrop-blur-sm text-[16px] font-black px-3 py-1 rounded-full border border-white/30 text-white shadow-2xl">
              {count}
            </div>
          </div>
        )}
      </div>

      <StackOrderBadge order={visibleStackOrder} />

      {slotLabel && (
        <div className={cn(
          "pointer-events-none absolute z-40 flex h-5 min-w-5 items-center justify-center rounded-full border border-white/20 bg-black/80 px-1.5 text-[10px] font-black leading-none text-white shadow-xl backdrop-blur-sm md:h-6 md:min-w-6 md:text-[11px]",
          displayMode === 'unit'
            ? isOpponent
              ? "-bottom-1 -left-1 rotate-180 md:-bottom-2 md:-left-2"
              : "-top-1 -left-1 md:-top-2 md:-left-2"
            : isOpponent
              ? "bottom-1 left-1 rotate-180"
              : "top-1 left-1"
        )}>
          {slotLabel}
        </div>
      )}
    </div>
  );
};

const HandZoneSlot: React.FC<{
  count: number;
  isOpponent?: boolean;
  isPublic?: boolean;
  onClick?: () => void;
}> = ({ count, isOpponent, isPublic, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={cn(
      "group relative flex aspect-[3/4] w-16 flex-col items-center justify-center rounded-md border border-white/10 bg-black/45 text-white shadow-lg transition-all md:w-24",
      onClick ? "cursor-pointer hover:border-[#f27d26]/60 hover:bg-[#f27d26]/10 hover:text-[#f27d26]" : "cursor-default",
      isOpponent && "rotate-180"
    )}
    title={isPublic ? "查看公开手牌" : "查看手牌"}
  >
    <span className="text-3xl font-black leading-none text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.85)] transition-transform group-hover:scale-105 md:text-5xl">
      {count}
    </span>
    <span className="mt-0.5 text-[9px] font-black tracking-widest text-white/70 md:mt-1 md:text-[11px]">手牌</span>
    {isPublic && (
      <span className="absolute bottom-1 rounded-full bg-[#f27d26]/90 px-2 py-0.5 text-[8px] font-black text-black">
        公开
      </span>
    )}
  </button>
);

const OngoingEffectButton: React.FC<{
  value: number;
  effectCount: number;
  isOpponent?: boolean;
  onClick?: () => void;
}> = ({ value, effectCount, isOpponent, onClick }) => {
  const isActive = value > 0 || effectCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[64px] items-center justify-center gap-1 rounded-full border px-2 py-1 shadow-inner transition-all md:min-w-[76px] md:px-3",
        isActive
          ? "border-amber-300/45 bg-amber-400/15 text-amber-100 shadow-amber-500/10 hover:border-amber-200/70 hover:bg-amber-400/25"
          : "border-white/5 bg-white/5 text-white/35 hover:border-white/15 hover:text-white/55",
        isOpponent && "md:flex-row-reverse"
      )}
      title={isOpponent ? '查看对方持续效果' : '查看我方持续效果'}
    >
      <Coins className={cn("h-3.5 w-3.5 md:h-4 md:w-4", value > 0 ? "text-amber-300" : "text-white/35")} />
      <span className="text-sm font-black italic tabular-nums md:text-base">{value}</span>
      <span className="h-4 w-px bg-white/15" />
      <Sparkles className={cn("h-3.5 w-3.5 md:h-4 md:w-4", effectCount > 0 ? "text-sky-300" : "text-white/35")} />
      <span className="text-sm font-black italic tabular-nums md:text-base">{effectCount}</span>
    </button>
  );
};

const EFFECT_CATEGORY_LABELS: Record<PlayerOngoingEffect['category'], string> = {
  CONTINUOUS: '永续效果',
  TEMPORARY: '临时持续影响',
  WEALTH: '财富来源'
};

const EFFECT_CATEGORY_STYLES: Record<PlayerOngoingEffect['category'], string> = {
  CONTINUOUS: 'border-sky-300/30 bg-sky-400/10 text-sky-100',
  TEMPORARY: 'border-rose-300/30 bg-rose-400/10 text-rose-100',
  WEALTH: 'border-amber-300/30 bg-amber-400/10 text-amber-100'
};

const OngoingEffectsPanel: React.FC<{
  effects: PlayerOngoingEffect[];
}> = ({ effects }) => {
  const grouped = (['CONTINUOUS', 'TEMPORARY', 'WEALTH'] as const).map(category => ({
    category,
    effects: effects.filter(effect => effect.category === category)
  }));

  if (effects.length === 0) {
    return (
      <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-white/10 bg-black/25 px-6 text-center text-sm font-bold text-white/45">
        当前没有对该玩家生效的全局永续、临时持续影响或财富来源。
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:gap-5">
      {grouped.map(group => group.effects.length > 0 && (
        <section key={group.category} className="rounded-2xl border border-white/10 bg-black/25 p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-black tracking-widest text-white/80">{EFFECT_CATEGORY_LABELS[group.category]}</h3>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-black tabular-nums text-white/55">
              {group.effects.length}
            </span>
          </div>
          <div className="grid gap-2.5">
            {group.effects.map(effect => (
              <div
                key={effect.id}
                className={cn(
                  "rounded-xl border px-3 py-2.5 shadow-inner",
                  EFFECT_CATEGORY_STYLES[effect.category]
                )}
              >
                <div className="text-xs font-black text-white/90">{effect.sourceCardName}</div>
                <div className="mt-1 text-xs font-bold leading-relaxed text-white/70">{effect.description}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

const withEffectiveCostInfluence = (gameState: GameState | undefined, player: PlayerState | undefined, card: Card) => {
  if (!player) return { effectiveAcValue: card.acValue ?? 0, card };
  const baseCost = card.id === '202000080' ? 6 : (card.baseAcValue ?? card.acValue ?? 0);
  let effectiveAcValue = baseCost;
  let sourceCardName = card.fullName;
  let reason = '';
  const costDetails = GameService.getEffectivePlayCostDetails(gameState || null, player, card);

  if (costDetails.cost < costDetails.baseCost) {
    effectiveAcValue = costDetails.cost;
    sourceCardName = costDetails.sourceCardName || sourceCardName;
    reason = costDetails.description ? costDetails.description.replace(/：?ACCESS值(?:变为0|-\d+)$/, '') : '';
  } else if (card.id === '101140062') {
    const unitCount = player.unitZone.filter(Boolean).length;
    effectiveAcValue = Math.max(0, baseCost - unitCount);
  } else if (card.id === '202050034' && player.isGoddessMode) {
    effectiveAcValue = 0;
    reason = '女神化';
  } else if (card.id === '105000117') {
    const hasUnits = player.unitZone.some(Boolean);
    const hasFaceUpErosion = player.erosionFront.some(erosionCard => !!erosionCard && erosionCard.displayState === 'FRONT_UPRIGHT');
    if (!hasUnits && !hasFaceUpErosion) {
      effectiveAcValue = 0;
      reason = '没有单位且没有正面侵蚀';
    }
  } else if (card.id === '205110063') {
    const itemCount = player.itemZone.filter(Boolean).length;
    effectiveAcValue = Math.max(0, baseCost - itemCount);
  } else if (card.id === '103090247') {
    const xenobuCount = player.unitZone.filter(unit => unit?.faction === '瑟诺布').length;
    effectiveAcValue = Math.max(0, baseCost - xenobuCount);
  } else if (card.id === '202000080' && player.unitZone.some(unit => unit?.isShenyi)) {
    const source = player.unitZone.find(unit => unit?.isShenyi);
    effectiveAcValue = Math.max(0, baseCost - 4);
    sourceCardName = source?.fullName || '神依单位';
  } else if ((card as any).data?.spiritCostTarget103080185) {
    effectiveAcValue = 0;
    sourceCardName = '天鬼图腾「暴龙」';
    reason = '指定天鬼图腾「暴龙」';
  } else if (
    (card.id === '201000140' || card.id === '201000040' || card.fullName === '解放之光') &&
    player.exile.some(exiled => exiled.id === card.id || exiled.id === '201000140' || exiled.id === '201000040' || exiled.fullName === card.fullName)
  ) {
    effectiveAcValue = 0;
    sourceCardName = '解放之光';
    reason = '放逐区有《解放之光》';
  } else if (
    card.type === 'UNIT' &&
    card.faction === '圣王国' &&
    (player as any).holyKingdomUnitDiscountUsedTurn !== gameState?.turnCount &&
    player.unitZone.some(unit => unit?.id === '101130153')
  ) {
    const source = player.unitZone.find(unit => unit?.id === '101130153');
    effectiveAcValue = Math.max(0, baseCost - 1);
    sourceCardName = source?.fullName || '祷告的群众';
    reason = '每回合第1张<圣王国>单位';
  }

  if (effectiveAcValue >= baseCost) return { effectiveAcValue, card };

  const change = effectiveAcValue <= 0 ? 'ACCESS值变为0' : `ACCESS值-${baseCost - effectiveAcValue}`;
  const description = costDetails.description || (reason ? `${reason}：${change}` : change);
  const influencingEffects = [...(card.influencingEffects || [])];
  if (!influencingEffects.some(effect => effect.sourceCardName === sourceCardName && effect.description === description)) {
    influencingEffects.push({ sourceCardName, description });
  }
  return { effectiveAcValue, card: { ...card, influencingEffects } };
};

const animationZoneAnchor = (uid: string, zone: string) => `player:${uid}:${zone}`;
const animationUnitAnchor = (uid: string, index: number) => `player:${uid}:unit:${index}`;
const MIRRORED_UNIT_ROW_OFFSET_CLASS = {
  opponent: "translate-y-0",
  player: "translate-y-0"
} as const;
const MIRRORED_BATTLEFIELD_GROUP_CLASS = "flex flex-col gap-8 md:gap-12";
const MIRRORED_DESKTOP_EROSION_ROW_CLASS = "hidden md:grid grid-cols-10 gap-1 h-16 scale-90";
const MIRRORED_EROSION_EDGE_ALIGNMENT_CLASS = {
  opponent: "-translate-y-[90%]",
  player: "translate-y-0"
} as const;
const MIRRORED_HAND_WRAPPER_CLASS = {
  opponent: "flex items-center justify-center px-1 md:px-0 -translate-y-1 md:-translate-y-2",
  player: "flex items-center justify-center px-1 md:px-0 translate-y-1 md:translate-y-2"
} as const;
const MIRRORED_STACK_SIDEBAR_CLASS = {
  opponent: "flex flex-col gap-1 md:gap-4 h-full justify-start",
  player: "flex flex-col gap-1 md:gap-4 h-full justify-start"
} as const;
const MIRRORED_DECK_EDGE_CLASS = {
  opponent: "border-white/20 scale-[0.8] md:scale-100 -translate-y-1 md:-translate-y-2",
  player: "border-white/20 scale-[0.8] md:scale-100 translate-y-1 md:translate-y-2"
} as const;
const MIRRORED_AUX_SIDEBAR_CLASS = {
  opponent: "flex flex-col gap-1 md:gap-4 h-full justify-end",
  player: "flex flex-col gap-1 md:gap-4 h-full justify-start"
} as const;

const CentralStoryPlayPile: React.FC<{
  player: PlayerState;
  isOpponent?: boolean;
  projection: ReturnType<typeof getPlayZoneProjection>;
  cardBackUrl?: string;
  onCardClick?: (card: Card, zone: string, index?: number, e?: React.MouseEvent) => void;
  onPreviewCard?: (card: Card) => void;
  onHoverCard?: (card: Card | null) => void;
  ignoreCardSkins?: boolean;
}> = ({ player, isOpponent, projection, cardBackUrl, onCardClick, onPreviewCard, onHoverCard, ignoreCardSkins = false }) => {
  const storyCards = projection.storyCards;
  const visibleCards = storyCards.slice(-3);
  const hasCards = visibleCards.length > 0;
  const hiddenCount = Math.max(0, storyCards.length - visibleCards.length);

  return (
    <div
      data-animation-anchor={animationZoneAnchor(player.uid, 'play')}
      className={cn(
        "absolute left-1/2 top-1/2",
        isOpponent
          ? "-translate-x-1/2 translate-y-[calc(-6.25rem-120px)] md:translate-y-[calc(-7.25rem-154.667px)] lg:translate-y-[calc(-7.25rem-173.333px)]"
          : "-translate-x-1/2 translate-y-[6.25rem] md:translate-y-[7.25rem]",
        hasCards
          ? "pointer-events-auto flex items-center justify-center"
          : "pointer-events-none h-4 w-4 opacity-0"
      )}
    >
      {hasCards && visibleCards.map((card, index) => (
        <div
          key={card.gamecardId || `${card.id}-${index}`}
          className={cn("relative w-[90px] shrink-0 md:w-[116px] lg:w-[130px]", index > 0 && "-ml-10 md:-ml-14 lg:-ml-16")}
          style={{ zIndex: 20 + index }}
        >
          <CardSlot
            card={card}
            label="故事"
            count={storyCards.length}
            showCount={false}
            onPreview={onPreviewCard}
            onHover={onHoverCard}
            onClick={(e) => {
              if (onCardClick) {
                onCardClick(card, 'play', projection.playZoneIndexByCardId.get(card.gamecardId), e);
              } else {
                onPreviewCard?.(card);
              }
            }}
            isFaceUp
            isOpponent={isOpponent}
            displayMode="unit"
            cardBackUrl={cardBackUrl}
            ignoreSkin={ignoreCardSkins}
          />
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className={cn(
          "absolute -right-2 -top-2 z-50 flex h-5 min-w-5 items-center justify-center rounded-full border border-amber-100/60 bg-black/85 px-1.5 text-[10px] font-black text-amber-100 shadow-xl",
          isOpponent && "rotate-180"
        )}>
          +{hiddenCount}
        </div>
      )}
    </div>
  );
};

const CentralStoryPlayZone: React.FC<{
  player: PlayerState;
  opponent: PlayerState;
  playerProjection: ReturnType<typeof getPlayZoneProjection>;
  opponentProjection: ReturnType<typeof getPlayZoneProjection>;
  cardBackUrl?: string;
  onCardClick?: (card: Card, zone: string, index?: number, e?: React.MouseEvent) => void;
  onPreviewCard?: (card: Card) => void;
  onHoverCard?: (card: Card | null) => void;
  ignoreOpponentCardSkins?: boolean;
}> = ({ player, opponent, playerProjection, opponentProjection, cardBackUrl, onCardClick, onPreviewCard, onHoverCard, ignoreOpponentCardSkins }) => (
  <div className="pointer-events-none absolute inset-0 z-[95]">
    <CentralStoryPlayPile
      player={opponent}
      isOpponent
      projection={opponentProjection}
      cardBackUrl={cardBackUrl}
      onCardClick={onCardClick}
      onPreviewCard={onPreviewCard}
      onHoverCard={onHoverCard}
      ignoreCardSkins={ignoreOpponentCardSkins}
    />
    <CentralStoryPlayPile
      player={player}
      projection={playerProjection}
      cardBackUrl={cardBackUrl}
      onCardClick={onCardClick}
      onPreviewCard={onPreviewCard}
      onHoverCard={onHoverCard}
    />
  </div>
);

const PlayerHalf: React.FC<{
  player: PlayerState;
  isOpponent?: boolean;
  wealthValue?: number;
  ongoingEffects?: PlayerOngoingEffect[];
  onOpenOngoingEffects?: (player: PlayerState, isOpponent?: boolean) => void;
  onCardClick?: (card: Card, zone: string, index?: number, e?: React.MouseEvent) => void;
  onPreviewCard?: (card: Card) => void;
  onHoverCard?: (card: Card | null) => void;
  onPlayCard?: (card: Card) => void;
  paymentSelection?: { useFeijing: string[], exhaustIds: string[], erosionFrontIds?: string[] };
  pendingPlayCard?: Card | null;
  selectedAttackers?: string[];
  selectedDefender?: string;
  game?: GameState;
  allianceInitiator?: string;
  cardBackUrl?: string;
  viewingZone?: { title: string, type: string, isOpponentZone?: boolean } | null;
  setViewingZone?: (zone: { title: string, type: string, isOpponentZone?: boolean } | null) => void;
  highlightedCardIds?: Set<string>;
  selectedTargetIds?: Set<string>;
  selectedTargetCardIds?: string[];
  isSpectator?: boolean;
  sandboxEditMode?: boolean;
  onSandboxZoneClick?: (target: { playerKey: SandboxPlayerKey; zone: SandboxEditableZone; index?: number; card?: Card | null }) => void;
  ignoreCardSkins?: boolean;
  handEffectsEnabled?: boolean;
}> = ({ player, isOpponent, wealthValue = 0, ongoingEffects = [], onOpenOngoingEffects, onCardClick, onPreviewCard, onHoverCard, onPlayCard, paymentSelection, pendingPlayCard, selectedAttackers, selectedDefender, game, allianceInitiator, cardBackUrl, viewingZone, setViewingZone, highlightedCardIds, selectedTargetIds, selectedTargetCardIds, isSpectator, sandboxEditMode, onSandboxZoneClick, ignoreCardSkins = false, handEffectsEnabled = true }) => {
  const [hoveredHandCardId, setHoveredHandCardId] = useState<string | null>(null);
  const [draggingHandCard, setDraggingHandCard] = useState<HandDragState | null>(null);
  const suppressHandClickUntilRef = useRef(0);
  const stackOrders = useContext(HandStackOrderContext);

  if (!player) return null;
  const sandboxPlayerKey: SandboxPlayerKey = isOpponent ? 'opponent' : 'player';
  const clickSandboxZone = (zone: SandboxEditableZone, index?: number, card?: Card | null) => {
    if (!sandboxEditMode) return false;
    onSandboxZoneClick?.({ playerKey: sandboxPlayerKey, zone, index, card });
    return true;
  };
  const getCardCostDisplay = (card: Card) => withEffectiveCostInfluence(game, player, card);
  const ongoingEffectCount = ongoingEffects.filter(effect => effect.category !== 'WEALTH').length;
  const mirroredUnitRowOffsetClass = isOpponent
    ? MIRRORED_UNIT_ROW_OFFSET_CLASS.opponent
    : MIRRORED_UNIT_ROW_OFFSET_CLASS.player;
  const getMobileErosionCount = (playerState: PlayerState): number | string => {
    const frontCount = playerState.erosionFront?.filter(Boolean).length || 0;
    const backCount = playerState.erosionBack?.filter(Boolean).length || 0;
    const totalCount = frontCount + backCount;
    return totalCount > 0 ? `${totalCount}(${backCount})` : 0;
  };
  const isSelectedTargetCard = (card?: Card | null) => !!card && !!selectedTargetIds?.has(card.gamecardId);
  const getTargetSelectionOrder = (card?: Card | null) => {
    if (!card || !selectedTargetCardIds) return undefined;
    const index = selectedTargetCardIds.findIndex(id => id === card.gamecardId || id === card.id);
    return index === -1 ? undefined : index + 1;
  };
  const getStackOrder = (card?: Card | null) => card ? stackOrders?.get(card.gamecardId) : undefined;
  const hasHighlightedCardInZone = (cards?: (Card | null)[]) =>
    !!highlightedCardIds && !!cards?.some(card => !!card && highlightedCardIds.has(card.gamecardId));
  const playProjection = getPlayZoneProjection(player);
  const displayedItemCards = playProjection.itemZone;
  const topDisplayedItem = displayedItemCards[displayedItemCards.length - 1] || null;
  const topDisplayedItemIsProjected = !!topDisplayedItem && playProjection.projectedItemIds.has(topDisplayedItem.gamecardId);
  const topDisplayedItemIndex = topDisplayedItem
    ? (topDisplayedItemIsProjected
      ? playProjection.playZoneIndexByCardId.get(topDisplayedItem.gamecardId)
      : Math.max(0, (player.itemZone?.filter(Boolean).length || 1) - 1))
    : undefined;
  const erosionSlotLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const shouldUseHandSlot = (player.hand?.length || 0) > 9;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const isMobileViewport = viewportWidth < 768;
  const handEffectsActive = !!handEffectsEnabled && !isOpponent && !isSpectator && !pendingPlayCard && !sandboxEditMode;
  const shouldCollapseOwnHand = shouldUseHandSlot && !handEffectsActive;
  const canViewHand = isSpectator || !isOpponent || !!player.isHandPublic;
  const shouldRenderHandSlot = shouldUseHandSlot || (!isSpectator && !!player.isHandPublic);
  const openHandZone = () => {
    if (clickSandboxZone('hand')) return;
    if (!canViewHand) return;
    setViewingZone?.({
      title: isSpectator ? `${isOpponent ? '玩家2' : '玩家1'}手牌` : isOpponent ? (player.isHandPublic ? '敌方公开手牌' : '敌方手牌') : '手牌',
      type: 'hand',
      isOpponentZone: !!isOpponent
    });
  };
  const getHandEffectStyle = (index: number, total: number, cardId: string): React.CSSProperties => {
    const count = Math.max(total, 1);
    const cardWidth = Math.max(
      isMobileViewport ? 82 : 108,
      Math.min(isMobileViewport ? viewportWidth * 0.27 : viewportWidth * 0.12, isMobileViewport ? 118 : 156)
    );
    const maxHandWidth = viewportWidth * (isMobileViewport ? 0.94 : 0.76);
    const spacing = count > 1
      ? Math.max(isMobileViewport ? 22 : 52, Math.min(cardWidth * 0.72, (maxHandWidth - cardWidth) / (count - 1)))
      : 0;
    const center = (count - 1) / 2;
    const offset = index - center;
    const normalized = center === 0 ? 0 : offset / center;
    const baseX = offset * spacing;
    const baseDrop = Math.pow(normalized, 2) * Math.min(isMobileViewport ? 26 : 44, cardWidth * 0.24 + count * 0.5);
    const rotate = normalized * Math.min(18, 8 + count * 0.55);
    const drag = draggingHandCard?.cardId === cardId ? draggingHandCard : null;
    const hovered = hoveredHandCardId === cardId;
    const isActive = hovered || !!drag;
    const hoverLift = hovered ? -(cardWidth * (isMobileViewport ? 0.62 : 0.72)) : 0;
    const dragX = drag?.dx || 0;
    const dragY = drag?.dy || 0;
    const scale = drag ? 1.15 : hovered ? 1.75 : 1;
    const y = (isMobileViewport ? 8 : 10) + baseDrop + hoverLift + dragY;

    return {
      left: '50%',
      bottom: isMobileViewport ? '-12px' : '-4px',
      width: `${cardWidth}px`,
      transform: `translateX(calc(-50% + ${baseX + dragX}px)) translateY(${y}px) rotate(${isActive ? 0 : rotate}deg) scale(${scale})`,
      transformOrigin: 'bottom center',
      zIndex: drag ? 5000 : hovered ? 4200 : 100 + index,
      transition: drag ? 'none' : 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 260ms ease',
      touchAction: 'none',
      userSelect: 'none',
      willChange: 'transform'
    };
  };


  return (
    <div className={cn(
      "flex-1 md:grid md:grid-cols-[100px_1fr_100px] grid grid-cols-5 gap-0.5 md:gap-2 p-0.5 md:p-2 relative h-full min-h-0 items-stretch overflow-hidden",
      isOpponent ? "bg-red-500/5" : "bg-blue-500/5",
      player.isGoddessMode && (isOpponent
        ? "shadow-[inset_0_0_44px_rgba(242,125,38,0.24)]"
        : "shadow-[inset_0_0_44px_rgba(251,191,36,0.24)]")
    )}>
      {player.isGoddessMode && (
        <motion.div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-[2] h-1 bg-gradient-to-r from-transparent via-amber-200 to-transparent",
            isOpponent ? "bottom-0" : "top-0"
          )}
          initial={false}
          animate={{ opacity: [0.35, 1, 0.35], scaleX: [0.85, 1, 0.85] }}
          transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* SIDEBAR 1: Left Columns */}
      <div className={isOpponent ? MIRRORED_STACK_SIDEBAR_CLASS.opponent : MIRRORED_AUX_SIDEBAR_CLASS.player}>
        {isOpponent ? (
          // Opponent Left: Deck, Grave, Exile
          <>
            <CardSlot
              card={null} isDeck label="牌库" count={player.deck?.length || 0}
              className={MIRRORED_DECK_EDGE_CLASS.opponent} cardBackUrl={cardBackUrl}
              isOpponent={isOpponent}
              onClick={() => clickSandboxZone('deck')}
              animationAnchor={animationZoneAnchor(player.uid, 'deck')}
            />
            <div className="min-h-0 flex-1" />
            <CardSlot
              card={player.grave?.length > 0 ? player.grave[player.grave.length - 1] : null}
              label="墓地" count={player.grave?.length || 0}
              className="border-red-900/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={() => clickSandboxZone('grave', Math.max(0, (player.grave?.length || 1) - 1), player.grave?.[player.grave.length - 1] || null) || setViewingZone?.({ title: '墓地', type: 'grave', isOpponentZone: !!isOpponent })}
              onHover={onHoverCard}
              isFaceUp={true} isOpponent={isOpponent} displayMode="erosion_item" ignoreSkin={ignoreCardSkins}
              isHighlighted={hasHighlightedCardInZone(player.grave)}
              isSelectedForQuery={isSelectedTargetCard(player.grave?.[player.grave.length - 1])}
              querySelectionOrder={getTargetSelectionOrder(player.grave?.[player.grave.length - 1])}
              animationAnchor={animationZoneAnchor(player.uid, 'grave')}
            />
            <CardSlot
              card={player.exile?.length > 0 ? player.exile[player.exile.length - 1] : null}
              label="放逐" count={player.exile?.length || 0}
              className="border-purple-900/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={() => clickSandboxZone('exile', Math.max(0, (player.exile?.length || 1) - 1), player.exile?.[player.exile.length - 1] || null) || setViewingZone?.({ title: '放逐区', type: 'exile', isOpponentZone: !!isOpponent })}
              onHover={onHoverCard}
              isFaceUp={player.exile?.length > 0 ? player.exile[player.exile.length - 1]?.displayState !== 'FRONT_FACEDOWN' : true}
              isOpponent={isOpponent}
              displayMode="erosion_item"
              ignoreSkin={ignoreCardSkins}
              isHighlighted={hasHighlightedCardInZone(player.exile)}
              isSelectedForQuery={isSelectedTargetCard(player.exile?.[player.exile.length - 1])}
              querySelectionOrder={getTargetSelectionOrder(player.exile?.[player.exile.length - 1])}
              animationAnchor={animationZoneAnchor(player.uid, 'exile')}
            />
          </>
        ) : (
          // Player Left: Item, Ongoing Effects, Erosion
          <>
            <CardSlot
              card={topDisplayedItem}
              label="道具区" count={displayedItemCards.length}
              className="border-blue-500/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={(e) => {
                if (topDisplayedItemIsProjected && topDisplayedItem) {
                  onCardClick?.(topDisplayedItem, 'play', topDisplayedItemIndex, e);
                  return;
                }
                clickSandboxZone('itemZone', Math.max(0, (player.itemZone?.filter(Boolean).length || 1) - 1), (player.itemZone?.filter(Boolean).slice(-1)[0] as Card | undefined) || null) || setViewingZone?.({ title: '道具区', type: 'item', isOpponentZone: !!isOpponent });
              }}
              onHover={onHoverCard}
              isFaceUp={true}
              isExhausted={!topDisplayedItemIsProjected && !!topDisplayedItem?.isExhausted}
              isHighlighted={hasHighlightedCardInZone(displayedItemCards)}
              isSelectedForQuery={!topDisplayedItemIsProjected && isSelectedTargetCard(topDisplayedItem)}
              querySelectionOrder={!topDisplayedItemIsProjected ? getTargetSelectionOrder(topDisplayedItem) : undefined}
              displayMode="erosion_item"
              animationAnchor={animationZoneAnchor(player.uid, 'item')}
            />
            <div className="flex justify-center">
              <OngoingEffectButton
                value={wealthValue}
                effectCount={ongoingEffectCount}
                onClick={() => onOpenOngoingEffects?.(player, isOpponent)}
              />
            </div>
            <CardSlot
              card={player.erosionFront?.filter(Boolean).slice(-1)[0] || player.erosionBack?.filter(Boolean).slice(-1)[0] || null}
              label="侵蚀区"
              count={getMobileErosionCount(player)}
              className="border-red-500/30 scale-[0.8] md:scale-100 md:hidden" cardBackUrl={cardBackUrl}
              onClick={() => {
                if (clickSandboxZone('erosionFront')) return;
                setViewingZone?.({
                  title: '侵蚀区',
                  type: 'erosion',
                  isOpponentZone: !!isOpponent
                });
              }}
              isFaceUp={player.erosionFront?.some(c => c !== null)}
              isHighlighted={highlightedCardIds?.has((player.erosionFront?.filter(Boolean).slice(-1)[0] || null)?.gamecardId || '')}
              isSelectedForQuery={isSelectedTargetCard(player.erosionFront?.filter(Boolean).slice(-1)[0] || player.erosionBack?.filter(Boolean).slice(-1)[0] || null)}
              querySelectionOrder={getTargetSelectionOrder(player.erosionFront?.filter(Boolean).slice(-1)[0] || player.erosionBack?.filter(Boolean).slice(-1)[0] || null)}
              displayMode="erosion_item"
              animationAnchor={animationZoneAnchor(player.uid, 'erosion')}
            />
          </>
        )}
      </div>

      {/* CENTER COLUMN (3 COLUMNS ON MOBILE): HAND, UNIT, EROSION */}
      <div className={cn(
        "col-span-3 md:col-span-1 flex h-full min-h-0 flex-col gap-1 md:gap-4"
      )}>
        {isOpponent ? (
          <>
            {/* Opponent Hand Area */}
            <div className={MIRRORED_HAND_WRAPPER_CLASS.opponent}>
              <div
                className={cn(
                  "flex-1 h-14 md:h-20 flex items-center justify-center gap-1 overflow-x-auto bg-black/20 rounded-lg border border-white/5 custom-scrollbar",
                  sandboxEditMode && (player.hand?.length || 0) === 0 && "cursor-pointer hover:border-red-500/40"
                )}
                onClick={sandboxEditMode && (player.hand?.length || 0) === 0 ? () => clickSandboxZone('hand') : undefined}
                data-animation-anchor={animationZoneAnchor(player.uid, 'hand')}
              >
                {shouldRenderHandSlot ? (
                  <HandZoneSlot
                    count={player.hand?.length || 0}
                    isOpponent={isOpponent}
                    isPublic={!!player.isHandPublic || !!isSpectator}
                    onClick={sandboxEditMode || canViewHand ? openHandZone : undefined}
                  />
                ) : isSpectator ? (
                  player.hand?.map((card, i) => {
                    const costDisplay = getCardCostDisplay(card);
                    return (
                      <div
                        key={card.gamecardId || i}
                        data-animation-anchor={`card:${card.gamecardId}`}
                        data-animation-card-id={card.gamecardId}
                        className="relative w-10 shrink-0 cursor-pointer shadow-lg drop-shadow-md transition-all hover:-translate-y-1 md:w-[76.8px]"
                        onClick={(e) => clickSandboxZone('hand', i, costDisplay.card) || onCardClick?.(costDisplay.card, 'hand', i, e)}
                        onMouseEnter={() => onHoverCard?.(costDisplay.card)}
                        onMouseLeave={() => onHoverCard?.(null)}
                      >
                        <CardComponent card={costDisplay.card} cardBackUrl={cardBackUrl} disableZoom displayMode="hand" effectiveAcValue={costDisplay.effectiveAcValue} ignoreSkin={ignoreCardSkins} />
                        <StackOrderBadge order={getStackOrder(costDisplay.card)} />
                      </div>
                    );
                  })
                ) : (
                  player.hand?.map((card, i) => (
                    <div
                      key={i}
                      data-animation-anchor={`card:${card.gamecardId}`}
                      data-animation-card-id={card.gamecardId}
                      className={cn(
                        "w-10 md:w-[76.8px] aspect-[3/4] -ml-4 md:-ml-[38.4px] first:ml-0 shadow-lg drop-shadow-md transition-all shrink-0",
                        isOpponent && "rotate-180"
                      )}
                    >
                      <CardComponent isBack cardBackUrl={cardBackUrl} />
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1" />

            <div className={cn(MIRRORED_BATTLEFIELD_GROUP_CLASS, "justify-end")}>
              {/* Opponent Erosion Zone (Desktop) */}
              <div className={cn(MIRRORED_DESKTOP_EROSION_ROW_CLASS, MIRRORED_EROSION_EDGE_ALIGNMENT_CLASS.opponent)}>
                {(() => {
                  const backCards = player.erosionBack?.filter(c => c !== null) || [];
                  const frontCards = player.erosionFront?.filter(c => c !== null) || [];
                  const allCards = [
                    ...backCards.map(c => ({ ...c, isFaceUp: false })),
                    ...frontCards.map(c => ({ ...c, isFaceUp: true }))
                  ];

                  return erosionSlotLabels.map((num, i) => {
                    const displayCard = allCards[i];
                    return (
                      <div key={i} className="relative h-full">
                        <span className="pointer-events-none absolute -top-4 left-1/2 z-20 -translate-x-1/2 text-[10px] font-black text-white/30">{num}</span>
                        <div data-animation-anchor={i === 0 ? animationZoneAnchor(player.uid, 'erosion') : `player:${player.uid}:erosion:${i}`} className="relative aspect-[3/4] w-full">
                          {displayCard ? (
                            <CardSlot
                              card={displayCard} isFaceUp={displayCard.isFaceUp} onPreview={displayCard.isFaceUp ? onPreviewCard : undefined}
                              onHover={onHoverCard}
                              allowFaceDownHover={!displayCard.isFaceUp}
                              onClick={(e) => clickSandboxZone(displayCard.isFaceUp ? 'erosionFront' : 'erosionBack', i, displayCard) || onCardClick?.(displayCard, displayCard.isFaceUp ? 'erosion_front' : 'erosion_back', i, e)}
                              isSelectedForPayment={displayCard.isFaceUp && paymentSelection?.erosionFrontIds?.includes(displayCard.gamecardId)}
                              className={displayCard.isFaceUp ? "border-red-600" : "border-red-900/50"}
                              isHighlighted={displayCard.isFaceUp && highlightedCardIds?.has(displayCard.gamecardId)}
                              isSelectedForQuery={isSelectedTargetCard(displayCard)}
                              querySelectionOrder={getTargetSelectionOrder(displayCard)}
                              showCount={false} isOpponent={isOpponent} displayMode="erosion_item" slotLabel={num} cardBackUrl={cardBackUrl} ignoreSkin={ignoreCardSkins}
                            />
                          ) : (
                            <div className="h-full w-full rounded-md border border-dashed border-white/5 bg-white/5 flex items-center justify-center">
                              <button type="button" onClick={() => clickSandboxZone('erosionBack', i)} className="h-full w-full text-[8px] opacity-20">{num}</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Opponent Unit Zone */}
              <div data-animation-anchor={animationZoneAnchor(player.uid, 'unit-row')} className={cn("grid w-full grid-cols-3 md:grid-cols-6 gap-2 md:gap-2 items-center justify-items-center relative z-10 px-2 md:px-0 transition-transform duration-700", mirroredUnitRowOffsetClass)}>
                {Array.from({ length: 6 }).map((_, i) => {
                  const unit = playProjection.unitZone?.[i];
                  const isProjectedUnit = !!unit && playProjection.projectedUnitIds.has(unit.gamecardId);
                  return (
                    <CardSlot
                      key={i} card={unit || null} label={`${6 - i}`}
                      onPreview={onPreviewCard} onClick={(e) => {
                        if (isProjectedUnit && unit) {
                          onCardClick?.(unit, 'play', playProjection.playZoneIndexByCardId.get(unit.gamecardId), e);
                          return;
                        }
                        clickSandboxZone('unitZone', i, unit || null) || (unit && onCardClick?.(unit, 'unit', i, e));
                      }}
                      onHover={onHoverCard}
                      className="scale-[0.9] origin-center md:scale-100"
                      isExhausted={!isProjectedUnit && unit ? unit.isExhausted : false}
                      isSelectedForPayment={!isProjectedUnit && unit ? paymentSelection?.exhaustIds.includes(unit.gamecardId) : false}
                      isAttacking={!isProjectedUnit && unit ? (selectedAttackers?.includes(unit.gamecardId) || game?.battleState?.attackers.includes(unit.gamecardId)) : false}
                      isDefending={!isProjectedUnit && unit ? (selectedDefender === unit.gamecardId || game?.battleState?.defender === unit.gamecardId || game?.battleState?.unitTargetId === unit.gamecardId) : false}
                      isHighlighted={!isProjectedUnit && unit ? highlightedCardIds?.has(unit.gamecardId) : false}
                      isSelectedForQuery={!isProjectedUnit && isSelectedTargetCard(unit)}
                      querySelectionOrder={!isProjectedUnit ? getTargetSelectionOrder(unit) : undefined}
                      showCount={false} isOpponent={isOpponent} displayMode="unit" slotLabel={`${6 - i}`} cardBackUrl={cardBackUrl} ignoreSkin={ignoreCardSkins}
                      animationAnchor={animationUnitAnchor(player.uid, i)}
                    />
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={cn(MIRRORED_BATTLEFIELD_GROUP_CLASS, "justify-start")}>
              {/* Player Unit Zone */}
              <div data-animation-anchor={animationZoneAnchor(player.uid, 'unit-row')} className={cn("grid w-full grid-cols-3 md:grid-cols-6 gap-2 md:gap-2 items-center justify-items-center relative z-10 px-2 md:px-0 transition-transform duration-700", mirroredUnitRowOffsetClass)}>
                {Array.from({ length: 6 }).map((_, i) => {
                  const unit = playProjection.unitZone?.[i];
                  const isProjectedUnit = !!unit && playProjection.projectedUnitIds.has(unit.gamecardId);
                  return (
                    <CardSlot
                      key={i} card={unit || null} label={`${i + 1}`}
                      onPreview={onPreviewCard} onClick={(e) => {
                        if (isProjectedUnit && unit) {
                          onCardClick?.(unit, 'play', playProjection.playZoneIndexByCardId.get(unit.gamecardId), e);
                          return;
                        }
                        clickSandboxZone('unitZone', i, unit || null) || (unit && onCardClick?.(unit, 'unit', i, e));
                      }}
                      onHover={onHoverCard}
                      className="scale-[0.9] origin-center md:scale-100"
                      isExhausted={!isProjectedUnit && unit ? unit.isExhausted : false}
                      isSelectedForPayment={!isProjectedUnit && unit ? paymentSelection?.exhaustIds.includes(unit.gamecardId) : false}
                      isAttacking={!isProjectedUnit && unit ? (selectedAttackers?.includes(unit.gamecardId) || game?.battleState?.attackers.includes(unit.gamecardId)) : false}
                      isDefending={!isProjectedUnit && unit ? (selectedDefender === unit.gamecardId || game?.battleState?.defender === unit.gamecardId || game?.battleState?.unitTargetId === unit.gamecardId) : false}
                      isAllianceInitiator={!isProjectedUnit && unit && allianceInitiator === unit.gamecardId}
                      isHighlighted={!isProjectedUnit && unit ? highlightedCardIds?.has(unit.gamecardId) : false}
                      isSelectedForQuery={!isProjectedUnit && isSelectedTargetCard(unit)}
                      querySelectionOrder={!isProjectedUnit ? getTargetSelectionOrder(unit) : undefined}
                      showCount={false} displayMode="unit" slotLabel={`${i + 1}`} cardBackUrl={cardBackUrl}
                      animationAnchor={animationUnitAnchor(player.uid, i)}
                    />
                  );
                })}
              </div>

              {/* Player Erosion Zone (Desktop) */}
              <div className={cn(MIRRORED_DESKTOP_EROSION_ROW_CLASS, MIRRORED_EROSION_EDGE_ALIGNMENT_CLASS.player)}>
                {(() => {
                  const backCards = player.erosionBack?.filter(c => c !== null) || [];
                  const frontCards = player.erosionFront?.filter(c => c !== null) || [];
                  const allCards = [
                    ...backCards.map(c => ({ ...c, isFaceUp: false })),
                    ...frontCards.map(c => ({ ...c, isFaceUp: true }))
                  ];

                  return erosionSlotLabels.map((num, i) => {
                    const displayCard = allCards[i];
                    return (
                      <div key={i} className="relative h-full">
                        <div data-animation-anchor={i === 0 ? animationZoneAnchor(player.uid, 'erosion') : `player:${player.uid}:erosion:${i}`} className="relative aspect-[3/4] w-full">
                          {displayCard ? (
                            <CardSlot
                              card={displayCard}
                              isFaceUp={displayCard.isFaceUp}
                              onPreview={onPreviewCard}
                              onHover={onHoverCard}
                              allowFaceDownHover={!displayCard.isFaceUp}
                              onClick={(e) => clickSandboxZone(displayCard.isFaceUp ? 'erosionFront' : 'erosionBack', i, displayCard) || onCardClick?.(displayCard, displayCard.isFaceUp ? 'erosion_front' : 'erosion_back', i, e)}
                              isSelectedForPayment={displayCard.isFaceUp && paymentSelection?.erosionFrontIds?.includes(displayCard.gamecardId)}
                              className={displayCard.isFaceUp ? "border-red-600" : "border-red-900/50"}
                              isHighlighted={displayCard.isFaceUp && highlightedCardIds?.has(displayCard.gamecardId)}
                              isSelectedForQuery={isSelectedTargetCard(displayCard)}
                              querySelectionOrder={getTargetSelectionOrder(displayCard)}
                              showCount={false}
                              displayMode="erosion_item"
                              slotLabel={num}
                              cardBackUrl={cardBackUrl}
                            />
                          ) : (
                            <div className="h-full w-full rounded-md border border-dashed border-white/5 bg-white/5 flex items-center justify-center">
                              <button type="button" onClick={() => clickSandboxZone('erosionBack', i)} className="h-full w-full text-[8px] opacity-20">{num}</button>
                            </div>
                          )}
                        </div>
                        <span className="pointer-events-none absolute -bottom-4 left-1/2 z-20 -translate-x-1/2 text-[10px] font-black text-white/30">{num}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            <div className="min-h-0 flex-1" />

            <div className={MIRRORED_HAND_WRAPPER_CLASS.player}>
              <div
                className={cn(
                  "flex-1 h-14 md:h-20 flex items-center justify-center gap-0.5 overflow-visible bg-black/20 rounded-lg border border-white/5 relative",
                  sandboxEditMode && (player.hand?.length || 0) === 0 && "cursor-pointer hover:border-red-500/40"
                )}
                onClick={sandboxEditMode && (player.hand?.length || 0) === 0 ? () => clickSandboxZone('hand') : undefined}
                data-animation-anchor={animationZoneAnchor(player.uid, 'hand')}
              >
                {shouldUseHandSlot ? (
                  <HandZoneSlot count={player.hand?.length || 0} onClick={openHandZone} />
                ) : player.hand?.map((card, i) => {
                  const costDisplay = getCardCostDisplay(card);
                  const total = player.hand.length;
                  const middle = (total - 1) / 2;
                  const offset = i - middle;
                  const xPos = offset * (isMobileViewport ? 36 : 96);
                  const isFeijingSelected = paymentSelection?.useFeijing?.includes(card.gamecardId);
                  const cardKey = card.gamecardId || `${card.id || card.uniqueId || 'hand'}-${i}`;
                  const handDragState = draggingHandCard?.cardId === cardKey ? draggingHandCard : null;
                  const handleHandPointerDown = handEffectsActive
                    ? (e: React.PointerEvent<HTMLDivElement>) => {
                        if (e.button !== 0) return;
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                        setHoveredHandCardId(cardKey);
                        setDraggingHandCard({
                          cardId: cardKey,
                          startX: e.clientX,
                          startY: e.clientY,
                          dx: 0,
                          dy: 0,
                          moved: false
                        });
                      }
                    : undefined;
                  const handleHandPointerMove = handEffectsActive
                    ? (e: React.PointerEvent<HTMLDivElement>) => {
                        if (!handDragState) return;
                        const dx = e.clientX - handDragState.startX;
                        const dy = e.clientY - handDragState.startY;
                        const moved = handDragState.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
                        if (moved && e.cancelable) e.preventDefault();
                        setDraggingHandCard({ ...handDragState, dx, dy, moved });
                      }
                    : undefined;
                  const handleHandPointerUp = handEffectsActive
                    ? (e: React.PointerEvent<HTMLDivElement>) => {
                        if (!handDragState) return;
                        const cardHeight = e.currentTarget.getBoundingClientRect().height || 140;
                        const finalDx = e.clientX - handDragState.startX;
                        const finalDy = e.clientY - handDragState.startY;
                        const moved = handDragState.moved || Math.abs(finalDx) > 3 || Math.abs(finalDy) > 3;
                        const shouldPlay = moved && finalDy < -(cardHeight * 0.3);
                        setDraggingHandCard(null);
                        if (moved) {
                          suppressHandClickUntilRef.current = Date.now() + 180;
                          e.preventDefault();
                          e.stopPropagation();
                        }
                        if (!shouldPlay) return;
                        onPlayCard?.(costDisplay.card);
                      }
                    : undefined;
                  const handleHandPointerCancel = handEffectsActive
                    ? () => {
                        if (handDragState) setDraggingHandCard(null);
                      }
                    : undefined;

                  return (
                    <div
                      key={cardKey}
                      data-animation-anchor={`card:${card.gamecardId}`}
                      data-animation-card-id={card.gamecardId}
                      className={cn(
                        "absolute transition-all duration-300 cursor-pointer",
                        handEffectsActive ? "cursor-grab active:cursor-grabbing" : "w-[38.4px] md:w-[115.2px]"
                      )}
                      style={handEffectsActive ? getHandEffectStyle(i, total, cardKey) : {
                        transform: `translateX(${xPos}px) ${isFeijingSelected ? 'translateY(-10px) md:translateY(-50px) scale(1.1)' : ''}`,
                        zIndex: isFeijingSelected ? 100 : i,
                        bottom: isMobileViewport ? '10px' : '0px'
                      }}
                      onPointerDown={handleHandPointerDown}
                      onPointerMove={handleHandPointerMove}
                      onPointerUp={handleHandPointerUp}
                      onPointerCancel={handleHandPointerCancel}
                      onClick={(e) => {
                        if (Date.now() < suppressHandClickUntilRef.current) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        clickSandboxZone('hand', i, costDisplay.card) || onCardClick?.(costDisplay.card, 'hand', i, e);
                      }}
                      onMouseEnter={() => {
                        if (handEffectsActive) setHoveredHandCardId(cardKey);
                        onHoverCard?.(costDisplay.card);
                      }}
                      onMouseLeave={() => {
                        if (handEffectsActive && draggingHandCard?.cardId !== cardKey) setHoveredHandCardId(null);
                        onHoverCard?.(null);
                      }}
                    >
                      <CardComponent
                        card={costDisplay.card} disableZoom displayMode="hand" cardBackUrl={cardBackUrl}
                        effectiveAcValue={costDisplay.effectiveAcValue}
                        isHighlighted={highlightedCardIds?.has(card.gamecardId)}
                        className={cn(
                          "shadow-2xl transition-all duration-300",
                          handEffectsActive && hoveredHandCardId === cardKey && "drop-shadow-[0_24px_42px_rgba(0,0,0,0.68)]",
                          handDragState && "drop-shadow-[0_28px_50px_rgba(0,0,0,0.72)]",
                          isFeijingSelected && "shadow-[#f27d26]/60 ring-2 ring-[#f27d26]"
                        )}
                      />
                      <StackOrderBadge order={getStackOrder(costDisplay.card)} />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* SIDEBAR 2: Right Columns */}
      <div className={isOpponent ? MIRRORED_AUX_SIDEBAR_CLASS.opponent : MIRRORED_STACK_SIDEBAR_CLASS.player}>
        {isOpponent ? (
          // Opponent Right: Erosion, Item
          <>
            <CardSlot
              card={player.erosionFront?.filter(Boolean).slice(-1)[0] || player.erosionBack?.filter(Boolean).slice(-1)[0] || null}
              label="侵蚀区"
              count={getMobileErosionCount(player)}
              className="border-red-500/30 scale-[0.8] md:scale-100 md:hidden" cardBackUrl={cardBackUrl}
              onClick={() => {
                if (clickSandboxZone('erosionFront')) return;
                setViewingZone?.({
                  title: isOpponent ? '敌方侵蚀区' : '侵蚀区',
                  type: 'erosion',
                  isOpponentZone: !!isOpponent
                });
              }}
              isFaceUp={player.erosionFront?.some(c => c !== null)}
              isOpponent={isOpponent}
              ignoreSkin={ignoreCardSkins}
              displayMode="erosion_item"
              isSelectedForQuery={isSelectedTargetCard(player.erosionFront?.filter(Boolean).slice(-1)[0] || player.erosionBack?.filter(Boolean).slice(-1)[0] || null)}
              querySelectionOrder={getTargetSelectionOrder(player.erosionFront?.filter(Boolean).slice(-1)[0] || player.erosionBack?.filter(Boolean).slice(-1)[0] || null)}
              animationAnchor={animationZoneAnchor(player.uid, 'erosion')}
            />
            <div className={cn("flex justify-center", isOpponent && "rotate-180")}>
              <OngoingEffectButton
                value={wealthValue}
                effectCount={ongoingEffectCount}
                isOpponent={isOpponent}
                onClick={() => onOpenOngoingEffects?.(player, isOpponent)}
              />
            </div>
            <CardSlot
              card={topDisplayedItem}
              label="道具区" count={displayedItemCards.length}
              className="border-blue-500/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={(e) => {
                if (topDisplayedItemIsProjected && topDisplayedItem) {
                  onCardClick?.(topDisplayedItem, 'play', topDisplayedItemIndex, e);
                  return;
                }
                clickSandboxZone('itemZone', Math.max(0, (player.itemZone?.filter(Boolean).length || 1) - 1), (player.itemZone?.filter(Boolean).slice(-1)[0] as Card | undefined) || null) || setViewingZone?.({ title: '敌方道具区', type: 'item', isOpponentZone: !!isOpponent });
              }}
              onHover={onHoverCard}
              isFaceUp={true}
              isExhausted={!topDisplayedItemIsProjected && !!topDisplayedItem?.isExhausted}
              isHighlighted={hasHighlightedCardInZone(displayedItemCards)}
              isOpponent={isOpponent}
              ignoreSkin={ignoreCardSkins}
              isSelectedForQuery={!topDisplayedItemIsProjected && isSelectedTargetCard(topDisplayedItem)}
              querySelectionOrder={!topDisplayedItemIsProjected ? getTargetSelectionOrder(topDisplayedItem) : undefined}
              displayMode="erosion_item"
              animationAnchor={animationZoneAnchor(player.uid, 'item')}
            />
          </>
        ) : (
          // Player Right: Exile, Grave, Deck
          <>
            <CardSlot
              card={player.exile?.length > 0 ? player.exile[player.exile.length - 1] : null}
              label="放逐" count={player.exile?.length || 0}
              className="border-purple-900/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={() => clickSandboxZone('exile', Math.max(0, (player.exile?.length || 1) - 1), player.exile?.[player.exile.length - 1] || null) || setViewingZone?.({ title: '放逐区', type: 'exile', isOpponentZone: !!isOpponent })}
              onHover={onHoverCard}
              isFaceUp={player.exile?.length > 0 ? player.exile[player.exile.length - 1]?.displayState !== 'FRONT_FACEDOWN' : true}
              isHighlighted={hasHighlightedCardInZone(player.exile)}
              isSelectedForQuery={isSelectedTargetCard(player.exile?.[player.exile.length - 1])}
              querySelectionOrder={getTargetSelectionOrder(player.exile?.[player.exile.length - 1])}
              displayMode="erosion_item"
              animationAnchor={animationZoneAnchor(player.uid, 'exile')}
            />
            <CardSlot
              card={player.grave?.length > 0 ? player.grave[player.grave.length - 1] : null}
              label="墓地" count={player.grave?.length || 0}
              className="border-red-900/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={() => clickSandboxZone('grave', Math.max(0, (player.grave?.length || 1) - 1), player.grave?.[player.grave.length - 1] || null) || setViewingZone?.({ title: '墓地', type: 'grave', isOpponentZone: !!isOpponent })}
              onHover={onHoverCard}
              isFaceUp={true} displayMode="erosion_item"
              isHighlighted={hasHighlightedCardInZone(player.grave)}
              isSelectedForQuery={isSelectedTargetCard(player.grave?.[player.grave.length - 1])}
              querySelectionOrder={getTargetSelectionOrder(player.grave?.[player.grave.length - 1])}
              animationAnchor={animationZoneAnchor(player.uid, 'grave')}
            />
            <div className="min-h-0 flex-1" />
            <CardSlot
              card={null} isDeck label="牌库" count={player.deck?.length || 0}
              className={MIRRORED_DECK_EDGE_CLASS.player} cardBackUrl={cardBackUrl}
              onClick={() => clickSandboxZone('deck')}
              animationAnchor={animationZoneAnchor(player.uid, 'deck')}
            />
          </>
        )}
      </div>
    </div>
  );
};

export const PlayField: React.FC<PlayFieldProps> = ({
  player, opponent, game, onCardClick, onPreviewCard, onPlayCard,
  paymentSelection, pendingPlayCard, stack = [], myUid, selectedAttackers,
  selectedDefender, allianceInitiator, timer, cardBackUrl, viewingZone,
  setViewingZone, highlightedCardIds, selectedTargetIds, selectedTargetCardIds,
  onSurrender, onEndTurn, onEndBattleFree, onOpenPhaseMenu, confrontationStrategy, onUpdateStrategy,
  canConfront, isConfrontPromptActive, isCounteringPromptActive, isDefensePromptActive, isCounteringPromptWaiting, onStartConfront, onDeclineConfront, onDeclineDefense,
  showPhaseMenu, isAnyPopupOpen, isPopupHidden, onHidePopup, onExpand, isSpectator,
  ignoreOpponentCardSkins = false, handEffectsEnabled = true, sandboxEditMode, onSandboxZoneClick, sandboxCenterControls,
  onHoverPreview, animatingCardIds
}) => {
  const [ongoingEffectsPopup, setOngoingEffectsPopup] = useState<{
    title: string;
    effects: PlayerOngoingEffect[];
  } | null>(null);
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);

  if (!player || !opponent || !game) return null;
  const isCurrentPlayer = !isSpectator && game.playerIds[game.currentTurnPlayer] === myUid;
  const wealthContext = { turnCount: game.turnCount };
  const playerWealth = getPlayerWealthCount(player, wealthContext);
  const opponentWealth = getPlayerWealthCount(opponent, wealthContext);
  const playerOngoingEffects = getPlayerOngoingEffects(game, player.uid);
  const opponentOngoingEffects = getPlayerOngoingEffects(game, opponent.uid);
  const playerPlayProjection = getPlayZoneProjection(player);
  const opponentPlayProjection = getPlayZoneProjection(opponent);
  const isCounteringChainPromptWaiting = !!isCounteringPromptActive && !!isCounteringPromptWaiting;
  const stackItemsForOrdering = useMemo(() => {
    const activeChainId = stack[stack.length - 1]?.confrontationChainId;
    return activeChainId
      ? stack.filter(item => item.confrontationChainId === activeChainId)
      : stack;
  }, [stack]);
  const stackOrdersByCardId = useMemo(() => {
    const orders = new Map<string, number>();
    let order = 0;
    stackItemsForOrdering.forEach(item => {
      if (item.card?.gamecardId) {
        order += 1;
        orders.set(item.card.gamecardId, order);
      }
    });
    return orders;
  }, [stackItemsForOrdering]);
  const handStackOrdersByCardId = useMemo(() => {
    const orders = new Map<string, number>();
    let order = 0;
    stackItemsForOrdering.forEach(item => {
      if (item.card?.gamecardId) {
        order += 1;
        if (item.type !== 'PLAY') {
          orders.set(item.card.gamecardId, order);
        }
      }
    });
    return orders;
  }, [stackItemsForOrdering]);
  const phaseStackRequests = useMemo(() => {
    const requests = { attack: false, mainEnd: false, battleFreeEnd: false };
    stack.forEach(item => {
      if (item.type === 'ATTACK') {
        requests.attack = true;
      }
      if (item.type === 'PHASE_END' && item.nextPhase === 'DISCARD') {
        requests.mainEnd = true;
      }
      if (item.type === 'PHASE_END' && item.nextPhase === 'DAMAGE_CALCULATION') {
        requests.battleFreeEnd = true;
      }
    });
    return requests;
  }, [stack]);
  const openOngoingEffects = (targetPlayer: PlayerState, isOpponentTarget?: boolean) => {
    setOngoingEffectsPopup({
      title: isSpectator
        ? `${isOpponentTarget ? '玩家2' : '玩家1'}持续效果`
        : isOpponentTarget ? '对方持续效果' : '我方持续效果',
      effects: targetPlayer.uid === opponent.uid ? opponentOngoingEffects : playerOngoingEffects
    });
  };
  const displayedPhase = game.phase === 'COUNTERING' ? (game.previousPhase || 'MAIN') : game.phase;
  const phaseLabel =
    displayedPhase === 'MAIN' ? '主要阶段' :
      displayedPhase === 'START' ? '回合开始阶段' :
        displayedPhase === 'DRAW' ? '抽卡阶段' :
          displayedPhase === 'EROSION' ? '侵蚀阶段' :
            displayedPhase === 'BATTLE_DECLARATION' ? '战斗宣言' :
              displayedPhase === 'DEFENSE_DECLARATION' ? '防御宣言' :
                displayedPhase === 'BATTLE_FREE' ? '战斗自由时段' :
                  displayedPhase === 'DAMAGE_CALCULATION' ? '伤害判定步骤' :
                    displayedPhase === 'END' ? '回合结束阶段' : displayedPhase;
  const phaseDisplayNode =
    phaseStackRequests.mainEnd
      ? { label: '主要阶段结束', isConfrontTiming: true }
      : phaseStackRequests.battleFreeEnd
        ? { label: '战斗自由时段结束', isConfrontTiming: true }
        : phaseStackRequests.attack
          ? { label: '攻击宣言', isConfrontTiming: true }
          : { label: phaseLabel, isConfrontTiming: false };
  const phaseAction: {
    label: string;
    tone: 'blue' | 'green' | 'neutral' | 'red' | 'white';
    icon: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  } = (() => {
    const fallbackAction = {
      label: '等待操作',
      tone: 'neutral' as const,
      icon: <Hourglass className="h-3.5 w-3.5 md:h-4 md:w-4" />,
      disabled: true
    };

    if (isSpectator) return fallbackAction;
    if (isDefensePromptActive) {
      return {
        label: '放弃防御',
        tone: 'blue',
        icon: <Shield className="h-3.5 w-3.5 md:h-4 md:w-4" />,
        onClick: onDeclineDefense
      };
    }
    if (isConfrontPromptActive || isCounteringPromptActive) {
      return {
        label: isCounteringChainPromptWaiting ? '对抗链' : '忽略对抗',
        tone: 'green',
        icon: <Zap className="h-3.5 w-3.5 md:h-4 md:w-4" />,
        onClick: onDeclineConfront,
        disabled: isCounteringChainPromptWaiting
      };
    }
    if (game.phase === 'MAIN' && isCurrentPlayer) {
      return {
        label: '结束回合',
        tone: 'white',
        icon: <LogOut className="h-3.5 w-3.5 md:h-4 md:w-4" />,
        onClick: onEndTurn
      };
    }
    if (game.phase === 'BATTLE_FREE' && isCurrentPlayer) {
      return {
        label: '结束战斗',
        tone: 'red',
        icon: <Sword className="h-3.5 w-3.5 md:h-4 md:w-4" />,
        onClick: onEndBattleFree
      };
    }
    return fallbackAction;
  })();
  const viewingZoneOwner = viewingZone?.isOpponentZone ? opponent : player;
  const viewingZoneCards = !viewingZone ? [] : (
    viewingZone.type === 'item' ? ((viewingZoneOwner.itemZone?.filter(Boolean) as Card[]) || []) :
    viewingZone.type === 'hand' ? (viewingZoneOwner.hand || []) :
    viewingZone.type === 'grave' ? (viewingZoneOwner.grave || []) :
    viewingZone.type === 'exile' ? (viewingZoneOwner.exile || []) :
    viewingZone.type === 'erosion'
      ? [
          ...((viewingZoneOwner.erosionBack?.filter((c): c is Card => c !== null) || [])),
          ...((viewingZoneOwner.erosionFront?.filter((c): c is Card => c !== null) || []))
        ]
      : []
  );
  const viewingZoneErosionBackIds = viewingZone?.type === 'erosion'
    ? (viewingZoneOwner.erosionBack?.filter((c): c is Card => c !== null).map(card => card.gamecardId) || [])
    : [];
  const viewingZoneDisplayCards = viewingZone?.type === 'hand'
    ? viewingZoneCards.map(card => withEffectiveCostInfluence(game, viewingZoneOwner, card).card)
    : viewingZoneCards;
  const handleHoverPreview = (card: Card | null) => {
    setHoveredCard(card);
    onHoverPreview?.(card);
  };
  return (
    <StackOrderContext.Provider value={stackOrdersByCardId}>
    <HandStackOrderContext.Provider value={handStackOrdersByCardId}>
    <AnimatingCardsContext.Provider value={animatingCardIds}>
      <div
        data-card-preview-anchor="table"
        className="relative w-full h-full max-w-full lg:max-w-7xl mx-auto bg-[#0a0a0a] border-y md:border-2 border-[#1a1a1a] md:rounded-xl shadow-2xl font-sans text-white select-none flex flex-col"
      >
      {/* Background Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 via-transparent to-blue-500/5 pointer-events-none" />

      <StandardPopup
        isOpen={!!viewingZone}
        onClose={() => {
          setHoveredCard(null);
          setViewingZone?.(null);
        }}
        title={viewingZone?.title || ''}
        mode="card_display"
        cards={viewingZoneDisplayCards}
        cardMeta={Object.fromEntries(
          viewingZoneDisplayCards.map(card => {
            const isFaceDown = viewingZone?.type === 'erosion' && viewingZoneErosionBackIds.includes(card.gamecardId);
            const isHiddenExile = viewingZone?.type === 'exile' && !!viewingZone?.isOpponentZone && card.displayState === 'FRONT_FACEDOWN';
            const isHiddenOpponentHand = !isSpectator && viewingZone?.type === 'hand' && viewingZone?.isOpponentZone && !viewingZoneOwner.isHandPublic;
            const costDisplay = viewingZone?.type === 'hand' ? withEffectiveCostInfluence(game, viewingZoneOwner, card) : undefined;
            return [
              card.gamecardId || card.id,
              {
                zoneLabel: isFaceDown ? '侵蚀区背面' : isHiddenExile ? '放逐区背面' : viewingZone?.title,
                isFaceDown: isFaceDown || isHiddenExile || isHiddenOpponentHand,
                effectiveAcValue: costDisplay?.effectiveAcValue,
                ignoreSkin: !!viewingZone?.isOpponentZone && ignoreOpponentCardSkins
              }
            ];
          })
        )}
        onCardClick={(card, e) => {
          setHoveredCard(null);
          if (onCardClick && viewingZone) {
            if (viewingZone.type === 'hand' && viewingZone.isOpponentZone) {
              onPreviewCard?.(card);
              return;
            }
            const isHiddenErosionBack = viewingZone.type === 'erosion' && viewingZoneErosionBackIds.includes(card.gamecardId);
            const isHiddenExile = viewingZone.type === 'exile' && !!viewingZone.isOpponentZone && card.displayState === 'FRONT_FACEDOWN';
            if (isHiddenExile) return;
            const clickZone = viewingZone.type === 'erosion' ? (isHiddenErosionBack ? 'erosion_back' : 'erosion_front') : viewingZone.type;
            const index = viewingZoneCards.findIndex(c => c.gamecardId === card.gamecardId);
            onCardClick(card, clickZone, index, e);
          } else {
            onPreviewCard?.(card);
          }
        }}
        onCardHover={handleHoverPreview}
        cardBackUrl={cardBackUrl}
        selectedIds={selectedTargetCardIds || Array.from(selectedTargetIds || [])}
        highlightedIds={Array.from(highlightedCardIds || [])}
      />
      <AnimatePresence>
        {ongoingEffectsPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl md:p-8"
            onClick={() => setOngoingEffectsPopup(null)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 18 }}
              className="relative flex max-h-[90vh] w-full max-w-[28rem] flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/95 shadow-2xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="border-b border-white/5 px-6 py-5 text-center">
                <button
                  type="button"
                  onClick={() => setOngoingEffectsPopup(null)}
                  className="absolute right-4 top-4 rounded-full p-2 text-white/50 transition-all hover:bg-white/10 hover:text-white"
                  title="关闭"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5 text-[#f27d26]" />
                  <h2 className="text-xl font-black italic tracking-tight text-white">{ongoingEffectsPopup.title}</h2>
                </div>
                <p className="mt-2 text-xs font-bold leading-relaxed tracking-widest text-white/45">
                  当前对该玩家生效的玩家级持续效果与财富来源
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                <OngoingEffectsPanel effects={ongoingEffectsPopup.effects} />
              </div>
              <div className="border-t border-white/5 bg-black/20 p-4 text-center">
                <button
                  type="button"
                  onClick={() => setOngoingEffectsPopup(null)}
                  className="rounded-xl border border-white/10 bg-zinc-800 px-8 py-3 text-sm font-black italic tracking-widest text-white transition-all hover:bg-zinc-700"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <CardHoverPreviewPortal card={hoveredCard} />
      <CentralStoryPlayZone
        player={player}
        opponent={opponent}
        playerProjection={playerPlayProjection}
        opponentProjection={opponentPlayProjection}
        cardBackUrl={cardBackUrl}
        onCardClick={onCardClick}
        onPreviewCard={onPreviewCard}
        onHoverCard={handleHoverPreview}
        ignoreOpponentCardSkins={ignoreOpponentCardSkins}
      />
      {/* Opponent Half */}
      <div className="flex-1 min-h-0">
        <PlayerHalf
          player={opponent}
          isOpponent
          wealthValue={opponentWealth}
          ongoingEffects={opponentOngoingEffects}
          onOpenOngoingEffects={openOngoingEffects}
          onCardClick={onCardClick}
          onPreviewCard={onPreviewCard}
          onHoverCard={handleHoverPreview}
          game={game}
          selectedAttackers={selectedAttackers}
          selectedDefender={selectedDefender}
          paymentSelection={paymentSelection}
          pendingPlayCard={pendingPlayCard}
          allianceInitiator={allianceInitiator}
          timer={timer}
          cardBackUrl={cardBackUrl}
          viewingZone={viewingZone}
          setViewingZone={setViewingZone}
          highlightedCardIds={highlightedCardIds}
          selectedTargetIds={selectedTargetIds}
          selectedTargetCardIds={selectedTargetCardIds}
          isSpectator={isSpectator}
          sandboxEditMode={sandboxEditMode}
          onSandboxZoneClick={onSandboxZoneClick}
          ignoreCardSkins={ignoreOpponentCardSkins}
        />
      </div>

      {/* Central Battle Info Panel */}
      <div
        data-card-preview-anchor="center-axis"
        className={cn(
          "relative h-20 md:h-24 w-full flex items-center justify-center z-[100] transition-all duration-300",
          (isAnyPopupOpen && !isPopupHidden) ? "opacity-0 pointer-events-none scale-95" : "opacity-100 scale-100"
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f27d26]/10 to-transparent border-y border-white/5" />

        {sandboxEditMode && sandboxCenterControls ? (
          <div className="relative z-10 w-full max-w-5xl px-3">
            {sandboxCenterControls}
          </div>
        ) : (
        <div className="mx-auto flex w-fit max-w-[calc(100%-0.5rem)] flex-col items-center gap-1 rounded-2xl border border-white/10 bg-zinc-950/80 px-2 py-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl origin-center scale-[0.78] sm:scale-[0.88] md:w-auto md:max-w-full md:flex-row md:gap-3 md:rounded-[2rem] md:px-3 md:py-2 md:scale-100">
          <div className="flex w-fit max-w-full flex-wrap items-center justify-center gap-2 md:w-auto md:flex-nowrap md:gap-3">
            {/* Surrender */}
            <div className="flex items-center gap-2 md:gap-4">
              <button
                onClick={onSurrender}
                disabled={isPopupHidden}
                className="rounded-full border border-white/5 bg-white/5 p-2 text-white/60 shadow-inner transition-all hover:bg-red-500/20 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/5 disabled:hover:text-white/60 md:p-2.5"
                title={isSpectator ? '退出观战' : '投降'}
              >
                {isSpectator ? <LogOut className="h-4 w-4 md:h-5 md:w-5" /> : <Flag className="h-4 w-4 md:h-5 md:w-5" />}
              </button>
            </div>
            <div className="h-7 w-px bg-white/10 md:h-8" />

            {/* Timer & Turn */}
            <div className="flex items-center gap-2 md:gap-3">
              {!isSpectator && (
                <div className="flex min-w-[44px] flex-col md:min-w-[60px]">
                  <span className={cn(
                    "text-lg font-black italic tabular-nums md:text-xl",
                    (timer || 0) < 30 ? "text-red-500 animate-pulse" : "text-white"
                  )}>
                    {timer}s
                  </span>
                </div>
              )}
              <div className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 shadow-inner md:h-9 md:gap-2 md:px-3">
                <span className="text-[8px] font-black tracking-widest text-white/35 md:text-[9px]">TURN</span>
                <span className="text-base font-black italic tabular-nums text-[#f27d26] md:text-lg">{game.turnCount}</span>
              </div>
            </div>
            {/* Phase display */}
            <div
              className={cn(
                "relative flex min-w-[150px] max-w-full items-center justify-center rounded-xl border border-white/10 bg-black/30 px-2 py-1.5 text-center shadow-inner transition-all md:min-w-[220px] md:px-3",
                showPhaseMenu && "border-white/20 bg-white/10"
              )}
            >
              <div
                className="relative flex h-7 min-w-[128px] max-w-full items-center justify-center gap-1 rounded-full border border-[#f27d26]/60 bg-[#f27d26]/15 px-3 text-[11px] font-black italic leading-none text-white shadow-[0_0_14px_rgba(242,125,38,0.28)] transition-all md:h-8 md:min-w-[168px] md:px-4 md:text-sm"
              >
                <span className="inline-flex whitespace-nowrap px-1 leading-tight">{phaseDisplayNode.label}</span>
                {phaseDisplayNode.isConfrontTiming && (
                  <Zap className="h-3.5 w-3.5 animate-pulse text-[#f27d26] md:h-4 md:w-4" />
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (phaseAction.disabled) return;
                phaseAction.onClick?.();
              }}
              disabled={isPopupHidden || phaseAction.disabled || !phaseAction.onClick}
              title={phaseAction.label}
              className={cn(
                "flex h-8 min-w-[88px] items-center justify-center gap-1.5 rounded-xl border px-3 text-[10px] font-black italic tracking-widest shadow-lg transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:brightness-100 md:h-9 md:min-w-[104px] md:px-4 md:text-[11px]",
                phaseAction.tone === 'blue' && "border-blue-300/45 bg-blue-500/20 text-blue-100 shadow-[0_0_22px_rgba(59,130,246,0.24)]",
                phaseAction.tone === 'green' && "border-emerald-300/50 bg-emerald-500/20 text-emerald-100 shadow-[0_0_22px_rgba(16,185,129,0.24)]",
                phaseAction.tone === 'neutral' && "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                phaseAction.tone === 'red' && "border-red-300/45 bg-red-500/20 text-red-100 shadow-[0_0_22px_rgba(239,68,68,0.22)]",
                phaseAction.tone === 'white' && "border-white/45 bg-white/15 text-white shadow-[0_0_22px_rgba(255,255,255,0.18)] hover:bg-white/20",
                showPhaseMenu && phaseAction.label === '阶段操作' && !phaseAction.disabled && "border-white/25 bg-white/[0.12] text-white"
              )}
            >
              {phaseAction.icon}
              <span className="whitespace-nowrap">{phaseAction.label}</span>
            </button>
          </div>

          <div className="hidden h-8 w-px bg-white/10 md:block" />

          {/* Combat Strategy */}
          <div className="flex w-fit max-w-full items-center justify-center gap-2 md:w-auto md:gap-4">
            {!isSpectator && (
              <div className="flex items-center rounded-full border border-white/5 bg-black/40 p-0.5 md:p-1">
                {(['ON', 'AUTO', 'OFF'] as const).map(strategy => (
                  <button
                    key={strategy}
                    onClick={() => onUpdateStrategy?.(strategy)}
                    disabled={isPopupHidden}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[9px] font-black tracking-widest transition-all disabled:cursor-not-allowed disabled:opacity-35 md:px-3 md:py-1 md:text-[10px]",
                      confrontationStrategy === strategy
                        ? "bg-[#f27d26] text-black shadow-lg"
                        : "text-white/40 hover:text-white"
                    )}
                  >
                    {strategy}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5 md:gap-2">
              {isPopupHidden && (
                <button
                  onClick={onExpand}
                  className="flex items-center gap-1.5 rounded-full bg-[#f27d26] px-3 py-1.5 text-[9px] font-black italic tracking-widest text-black shadow-[0_0_20px_rgba(242,125,38,0.4)] transition-all hover:scale-105 active:scale-95 md:gap-2 md:px-4 md:py-2.5 md:text-[10px]"
                >
                  <Play className="h-3.5 w-3.5 fill-current md:h-4 md:w-4" />
                  展开窗口
                </button>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Player Half */}
      <div className="flex-1 min-h-0">
        <PlayerHalf
          player={player}
          wealthValue={playerWealth}
          ongoingEffects={playerOngoingEffects}
          onOpenOngoingEffects={openOngoingEffects}
          onCardClick={onCardClick}
          onPreviewCard={onPreviewCard}
          onHoverCard={handleHoverPreview}
          onPlayCard={onPlayCard}
          paymentSelection={paymentSelection}
          pendingPlayCard={pendingPlayCard}
          selectedDefender={selectedDefender}
          game={game}
          allianceInitiator={allianceInitiator}
          cardBackUrl={cardBackUrl}
          viewingZone={viewingZone}
          setViewingZone={setViewingZone}
          highlightedCardIds={highlightedCardIds}
          selectedTargetIds={selectedTargetIds}
          selectedTargetCardIds={selectedTargetCardIds}
          isSpectator={isSpectator}
          sandboxEditMode={sandboxEditMode}
          onSandboxZoneClick={onSandboxZoneClick}
          handEffectsEnabled={handEffectsEnabled}
        />
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(242, 125, 38, 0.2);
          border-radius: 10px;
        }
      `}</style>
      </div>
    </AnimatingCardsContext.Provider>
    </HandStackOrderContext.Provider>
    </StackOrderContext.Provider>
  );
};
