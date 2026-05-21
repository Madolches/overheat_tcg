import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, PlayerState, StackItem, GameState, GAME_TIMEOUTS } from '../types/game';
import { CardComponent } from './Card';
import { StandardPopup } from './StandardPopup';
import { KeywordBadges } from './KeywordBadges';
import { ArrowDown, Shield, Sword, Zap, Trash2, Flag, BookOpen, Layers, AlertTriangle, Search, Play, X, LogOut, Coins } from 'lucide-react';
import { cn, getCardImageUrl } from '../lib/utils';
import { getPlayerWealthCount } from '../lib/wealth';

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
  onShowLogs?: () => void;
  onOpenRulebook?: () => void;
  onSurrender?: () => void;
  onPhaseClick?: () => void;
  confrontationStrategy?: 'ON' | 'AUTO' | 'OFF';
  onUpdateStrategy?: (strategy: 'ON' | 'AUTO' | 'OFF') => void;
  canConfront?: boolean;
  isConfrontPromptActive?: boolean;
  isCounteringPromptActive?: boolean;
  isDefensePromptActive?: boolean;
  onStartConfront?: () => void;
  onDeclineConfront?: () => void;
  onDeclineDefense?: () => void;
  showPhaseMenu?: boolean;
  isAnyPopupOpen?: boolean;
  isPopupHidden?: boolean;
  onHidePopup?: () => void;
  onExpand?: () => void;
  isSpectator?: boolean;
}

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
}> = ({ card, label, onClick, onPreview, onHover, className, isFaceUp = true, isExhausted, isSelectedForPayment, isDeck, count = 0, showCount = true, isAttacking, isDefending, isOpponent, isAllianceInitiator, displayMode, slotLabel, cardBackUrl, isHighlighted }) => {
  // Dynamic height scaling for stack areas (Deck, Grave, Exile)
  const isStackArea = isDeck || label === '墓地' || label === '放逐';
  const numericCount = typeof count === 'number' ? count : 0;
  const heightScale = isStackArea ? 1 + Math.min(numericCount / 100, 0.2) : 1;
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
        className={cn(
          "relative h-full w-full rounded-md border border-white/10 transition-all flex items-center justify-center group overflow-hidden cursor-pointer",
          (card || isDeck || count > 0) ? "bg-black/40 shadow-lg" : "bg-white/5",
          isSelectedForPayment ? "z-10 shadow-[0_0_20px_rgba(168,85,247,0.8)] ring-1 ring-purple-400" : "",
          isAllianceInitiator ? "z-10 shadow-[0_0_20px_rgba(220,38,38,0.8)] ring-2 ring-red-600" : "",
          isHighlighted ? "z-20 !border-yellow-400 ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.95)]" : "",
          (isAttacking || isDefending) ? "z-10" : "",
          className
        )}
        onClick={(e) => {
          if (onClick) onClick(e);
          if (!isFaceUp && card && onPreview && !isOpponent) onPreview(card);
        }}
        onMouseEnter={() => card && isFaceUp && onHover?.(card)}
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
              <CardComponent card={card} className="border-0" isExhausted={isExhausted} statusBorder={isAttacking ? 'red' : isDefending ? 'blue' : undefined} displayMode={displayMode} cardBackUrl={cardBackUrl} isHighlighted={isHighlighted} hideKeywords={isOpponent} />
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

        {(isAttacking || isDefending || isDeclaredEffectTarget) && (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-30 flex items-center justify-center",
              isOpponent && "rotate-180"
            )}
          >
            <div className="flex items-center justify-center gap-1 md:gap-1.5">
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
        {showCount && (count > 0 || typeof count === 'string') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="bg-black/60 backdrop-blur-sm text-[16px] font-black px-3 py-1 rounded-full border border-white/30 text-white shadow-2xl">
              {count}
            </div>
          </div>
        )}
      </div>

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

const WealthCounter: React.FC<{
  value: number;
  isOpponent?: boolean;
}> = ({ value, isOpponent }) => (
  <div
    className={cn(
      "flex min-w-[48px] items-center justify-center gap-1 rounded-full border px-2 py-1 shadow-inner md:min-w-[58px] md:px-3",
      value > 0
        ? "border-amber-300/40 bg-amber-400/15 text-amber-200 shadow-amber-500/10"
        : "border-white/5 bg-white/5 text-white/35",
      isOpponent && "md:flex-row-reverse"
    )}
    title={isOpponent ? '对方财富指示物' : '我方财富指示物'}
  >
    <Coins className={cn("h-3.5 w-3.5 md:h-4 md:w-4", value > 0 ? "text-amber-300" : "text-white/35")} />
    <span className="text-sm font-black italic tabular-nums md:text-base">{value}</span>
  </div>
);


const PlayerHalf: React.FC<{
  player: PlayerState;
  isOpponent?: boolean;
  wealthValue?: number;
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
  isSpectator?: boolean;
}> = ({ player, isOpponent, wealthValue = 0, onCardClick, onPreviewCard, onHoverCard, onPlayCard, paymentSelection, pendingPlayCard, selectedAttackers, selectedDefender, game, allianceInitiator, cardBackUrl, viewingZone, setViewingZone, highlightedCardIds, isSpectator }) => {
  if (!player) return null;
  const unitZoneOffsetClass = ""; // Removed horizontal offset to prevent blocking exile area
  const getMobileErosionCount = (playerState: PlayerState): number | string => {
    const frontCount = playerState.erosionFront?.filter(Boolean).length || 0;
    const backCount = playerState.erosionBack?.filter(Boolean).length || 0;
    const totalCount = frontCount + backCount;
    return totalCount > 0 ? `${totalCount}(${backCount})` : 0;
  };
  const erosionSlotLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const shouldUseHandSlot = (player.hand?.length || 0) > 9;
  const canViewHand = isSpectator || !isOpponent || !!player.isHandPublic;
  const shouldRenderHandSlot = shouldUseHandSlot || (!isSpectator && !!player.isHandPublic);
  const openHandZone = () => {
    if (!canViewHand) return;
    setViewingZone?.({
      title: isSpectator ? `${isOpponent ? '玩家2' : '玩家1'}手牌` : isOpponent ? (player.isHandPublic ? '敌方公开手牌' : '敌方手牌') : '手牌',
      type: 'hand',
      isOpponentZone: !!isOpponent
    });
  };


  return (
    <div className={cn(
      "flex-1 md:grid md:grid-cols-[100px_1fr_100px] grid grid-cols-5 gap-0.5 md:gap-2 p-0.5 md:p-2 relative h-full min-h-0 perspective-[1000px]",
      isOpponent ? "bg-red-500/5 items-start" : "bg-blue-500/5 items-end"
    )}>

      {/* SIDEBAR 1: Left Columns */}
      <div className="flex flex-col gap-1 md:gap-4 h-full justify-center">
        {isOpponent ? (
          // Opponent Left: Deck, Grave, Exile
          <>
            <CardSlot
              card={null} isDeck label="牌库" count={player.deck?.length || 0}
              className="border-white/20 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
            />
            <CardSlot
              card={player.grave?.length > 0 ? player.grave[player.grave.length - 1] : null}
              label="墓地" count={player.grave?.length || 0}
              className="border-red-900/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={() => setViewingZone?.({ title: '墓地', type: 'grave', isOpponentZone: !!isOpponent })}
              onHover={onHoverCard}
              isFaceUp={true} isOpponent={isOpponent} displayMode="erosion_item"
            />
            <CardSlot
              card={player.exile?.length > 0 ? player.exile[player.exile.length - 1] : null}
              label="放逐" count={player.exile?.length || 0}
              className="border-purple-900/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={() => setViewingZone?.({ title: '放逐区', type: 'exile', isOpponentZone: !!isOpponent })}
              onHover={onHoverCard}
              isFaceUp={player.exile?.length > 0 ? player.exile[player.exile.length - 1]?.displayState !== 'FRONT_FACEDOWN' : true}
              isOpponent={isOpponent}
              displayMode="erosion_item"
            />
          </>
        ) : (
          // Player Left: Item, Erosion, Play
          <>
            <CardSlot
              card={player.itemZone?.filter(Boolean).slice(-1)[0] || null}
              label="道具区" count={player.itemZone?.filter(Boolean).length || 0}
              className="border-blue-500/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={() => setViewingZone?.({ title: '道具区', type: 'item', isOpponentZone: !!isOpponent })}
              onHover={onHoverCard}
              isFaceUp={true}
              isExhausted={!!(player.itemZone?.filter(Boolean).slice(-1)[0] as Card | undefined)?.isExhausted}
              isHighlighted={highlightedCardIds?.has((player.itemZone?.filter(Boolean).slice(-1)[0] as Card | undefined)?.gamecardId || '')}
              displayMode="erosion_item"
            />
            <div className="pointer-events-none flex justify-center">
              <WealthCounter value={wealthValue} />
            </div>
            <CardSlot
              card={player.erosionFront?.filter(Boolean).slice(-1)[0] || player.erosionBack?.filter(Boolean).slice(-1)[0] || null}
              label="侵蚀区"
              count={getMobileErosionCount(player)}
              className="border-red-500/30 scale-[0.8] md:scale-100 md:hidden" cardBackUrl={cardBackUrl}
              onClick={() => {
                setViewingZone?.({
                  title: '侵蚀区',
                  type: 'erosion',
                  isOpponentZone: !!isOpponent
                });
              }}
              isFaceUp={player.erosionFront?.some(c => c !== null)}
              isHighlighted={highlightedCardIds?.has((player.erosionFront?.filter(Boolean).slice(-1)[0] || null)?.gamecardId || '')}
              displayMode="erosion_item"
            />
            <CardSlot
              card={(player.playZone?.length || 0) > 0 ? player.playZone[player.playZone.length - 1] : null}
              label="出牌区" count={player.playZone?.length || 0}
              className="border-yellow-500/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
            />
          </>
        )}
      </div>

      {/* CENTER COLUMN (3 COLUMNS ON MOBILE): HAND, UNIT, EROSION */}
      <div className={cn(
        "col-span-3 md:col-span-1 flex flex-col min-h-0",
        isOpponent ? "justify-end gap-1 md:gap-12" : "justify-end gap-1 md:gap-4"
      )}>
        {isOpponent ? (
          <>
            {/* Opponent Hand Area */}
            <div className="flex items-center justify-center px-1 md:px-0 mb-1 md:mb-2">
              <div className="flex-1 h-14 md:h-20 flex items-center justify-center gap-1 overflow-x-auto bg-black/20 rounded-lg border border-white/5 custom-scrollbar">
                {shouldRenderHandSlot ? (
                  <HandZoneSlot
                    count={player.hand?.length || 0}
                    isOpponent={isOpponent}
                    isPublic={!!player.isHandPublic || !!isSpectator}
                    onClick={canViewHand ? openHandZone : undefined}
                  />
                ) : isSpectator ? (
                  player.hand?.map((card, i) => (
                    <div
                      key={card.gamecardId || i}
                      className="w-10 md:w-[76.8px] shrink-0 cursor-pointer shadow-lg drop-shadow-md transition-all hover:-translate-y-1"
                      onClick={(e) => onCardClick?.(card, 'hand', i, e)}
                      onMouseEnter={() => onHoverCard?.(card)}
                      onMouseLeave={() => onHoverCard?.(null)}
                    >
                      <CardComponent card={card} cardBackUrl={cardBackUrl} disableZoom displayMode="hand" />
                    </div>
                  ))
                ) : (
                  player.hand?.map((card, i) => (
                    <div
                      key={i}
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

            {/* Opponent Erosion Zone (Desktop) */}
            <div className="hidden md:grid grid-cols-10 gap-1 h-16 scale-90 origin-bottom mb-4">
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
                    <div key={i} className="flex flex-col gap-1 items-center">
                      <span className="text-[10px] font-black text-white/30">{num}</span>
                      <div className="relative aspect-[3/4] w-full">
                        {displayCard ? (
                          <CardSlot
                            card={displayCard} isFaceUp={displayCard.isFaceUp} onPreview={displayCard.isFaceUp ? onPreviewCard : undefined}
                            onHover={onHoverCard}
                            onClick={(e) => onCardClick?.(displayCard, displayCard.isFaceUp ? 'erosion_front' : 'erosion_back', i, e)}
                            isSelectedForPayment={displayCard.isFaceUp && paymentSelection?.erosionFrontIds?.includes(displayCard.gamecardId)}
                            className={displayCard.isFaceUp ? "border-red-600" : "border-red-900/50"}
                            isHighlighted={displayCard.isFaceUp && highlightedCardIds?.has(displayCard.gamecardId)}
                            showCount={false} isOpponent={isOpponent} displayMode="erosion_item" slotLabel={num} cardBackUrl={cardBackUrl}
                          />
                        ) : (
                          <div className="h-full w-full rounded-md border border-dashed border-white/5 bg-white/5 flex items-center justify-center">
                            <span className="text-[8px] opacity-20">{num}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Opponent Unit Zone */}
            <div className={cn("grid w-full grid-cols-3 md:grid-cols-6 gap-2 md:gap-2 items-center justify-items-center relative z-10 px-2 md:px-0 translate-y-2 md:translate-y-[60px] transition-transform duration-700", unitZoneOffsetClass)} style={{ transform: 'translateZ(-100px) rotateX(-5deg)' }}>
              {Array.from({ length: 6 }).map((_, i) => {
                const unit = player.unitZone?.[i];
                return (
                  <CardSlot
                    key={i} card={unit || null} label={`${6 - i}`}
                    onPreview={onPreviewCard} onClick={(e) => unit && onCardClick?.(unit, 'unit', i, e)}
                    onHover={onHoverCard}
                    className="scale-[0.9] origin-center md:scale-100"
                    isExhausted={unit ? unit.isExhausted : false}
                    isSelectedForPayment={unit ? paymentSelection?.exhaustIds.includes(unit.gamecardId) : false}
                    isAttacking={unit ? (selectedAttackers?.includes(unit.gamecardId) || game?.battleState?.attackers.includes(unit.gamecardId)) : false}
                    isDefending={unit ? (selectedDefender === unit.gamecardId || game?.battleState?.defender === unit.gamecardId || game?.battleState?.unitTargetId === unit.gamecardId) : false}
                    isHighlighted={unit ? highlightedCardIds?.has(unit.gamecardId) : false}
                    showCount={false} isOpponent={isOpponent} displayMode="unit" slotLabel={`${6 - i}`} cardBackUrl={cardBackUrl}
                  />
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* Player Unit Zone */}
            <div className={cn("grid w-full grid-cols-3 md:grid-cols-6 gap-2 md:gap-2 items-center justify-items-center relative z-10 px-2 md:px-0 -translate-y-4 md:-translate-y-[60px] transition-transform duration-700", unitZoneOffsetClass)} style={{ transform: 'translateZ(-100px) rotateX(5deg)' }}>
              {Array.from({ length: 6 }).map((_, i) => {
                const unit = player.unitZone?.[i];
                return (
                  <CardSlot
                    key={i} card={unit || null} label={`${i + 1}`}
                    onPreview={onPreviewCard} onClick={(e) => unit && onCardClick?.(unit, 'unit', i, e)}
                    onHover={onHoverCard}
                    className="scale-[0.9] origin-center md:scale-100"
                    isExhausted={unit ? unit.isExhausted : false}
                    isSelectedForPayment={unit ? paymentSelection?.exhaustIds.includes(unit.gamecardId) : false}
                    isAttacking={unit ? (selectedAttackers?.includes(unit.gamecardId) || game?.battleState?.attackers.includes(unit.gamecardId)) : false}
                    isDefending={unit ? (selectedDefender === unit.gamecardId || game?.battleState?.defender === unit.gamecardId || game?.battleState?.unitTargetId === unit.gamecardId) : false}
                    isAllianceInitiator={unit && allianceInitiator === unit.gamecardId}
                    isHighlighted={unit ? highlightedCardIds?.has(unit.gamecardId) : false}
                    showCount={false} displayMode="unit" slotLabel={`${i + 1}`} cardBackUrl={cardBackUrl}
                  />
                );
              })}
            </div>

            {/* Player Erosion Zone (Desktop) */}
            <div className="hidden md:grid grid-cols-10 gap-1 h-14 scale-90 origin-top mt-1 mb-2 -translate-y-[44px]" style={{ transform: 'translateZ(-50px) rotateX(2deg)' }}>
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
                    <div key={i} className="flex flex-col gap-1 items-center">
                      <div className="relative aspect-[3/4] w-full">
                        {displayCard ? (
                          <CardSlot
                            card={displayCard}
                            isFaceUp={displayCard.isFaceUp}
                            onPreview={onPreviewCard}
                            onHover={onHoverCard}
                            onClick={(e) => onCardClick?.(displayCard, displayCard.isFaceUp ? 'erosion_front' : 'erosion_back', i, e)}
                            isSelectedForPayment={displayCard.isFaceUp && paymentSelection?.erosionFrontIds?.includes(displayCard.gamecardId)}
                            className={displayCard.isFaceUp ? "border-red-600" : "border-red-900/50"}
                            isHighlighted={displayCard.isFaceUp && highlightedCardIds?.has(displayCard.gamecardId)}
                            showCount={false}
                            displayMode="erosion_item"
                            slotLabel={num}
                            cardBackUrl={cardBackUrl}
                          />
                        ) : (
                          <div className="h-full w-full rounded-md border border-dashed border-white/5 bg-white/5 flex items-center justify-center">
                            <span className="text-[8px] opacity-20">{num}</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-black text-white/30">{num}</span>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="flex items-center justify-center px-1 md:px-0 mt-0 -translate-y-2 md:mt-2 md:translate-y-0">
              <div className="flex-1 h-16 md:h-36 flex items-center justify-center gap-0.5 overflow-visible bg-black/20 rounded-lg border border-white/5 relative">
                {shouldUseHandSlot ? (
                  <HandZoneSlot count={player.hand?.length || 0} onClick={openHandZone} />
                ) : player.hand?.map((card, i) => {
                  const total = player.hand.length;
                  const middle = (total - 1) / 2;
                  const offset = i - middle;
                  const xPos = offset * (window.innerWidth < 768 ? 36 : 96);
                  const isFeijingSelected = paymentSelection?.useFeijing?.includes(card.gamecardId);

                  return (
                    <div
                      key={card.gamecardId || i}
                      className="absolute w-[38.4px] md:w-[115.2px] transition-all duration-300 cursor-pointer"
                      style={{
                        transform: `translateX(${xPos}px) ${isFeijingSelected ? 'translateY(-10px) md:translateY(-50px) scale(1.1)' : ''}`,
                        zIndex: isFeijingSelected ? 100 : i,
                        bottom: window.innerWidth < 768 ? '10px' : '0px'
                      }}
                      onClick={(e) => onCardClick?.(card, 'hand', i, e)}
                      onMouseEnter={() => onHoverCard?.(card)}
                      onMouseLeave={() => onHoverCard?.(null)}
                    >
                      <CardComponent
                        card={card} disableZoom displayMode="hand" cardBackUrl={cardBackUrl}
                        isHighlighted={highlightedCardIds?.has(card.gamecardId)}
                        className={cn("shadow-2xl transition-all duration-300", isFeijingSelected && "shadow-[#f27d26]/60 ring-2 ring-[#f27d26]")}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* SIDEBAR 2: Right Columns */}
      <div className={cn(
        "flex flex-col gap-1 md:gap-4 h-full",
        isOpponent ? "justify-center" : "justify-end pb-4"
      )}>
        {isOpponent ? (
          // Opponent Right: Play, Erosion, Item
          <>
            <CardSlot
              card={(player.playZone?.length || 0) > 0 ? player.playZone[player.playZone.length - 1] : null}
              label="出牌区" count={player.playZone?.length || 0}
              className="border-yellow-500/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onPreview={onPreviewCard} isOpponent={isOpponent}
              onHover={onHoverCard}
            />
            <CardSlot
              card={player.erosionFront?.filter(Boolean).slice(-1)[0] || player.erosionBack?.filter(Boolean).slice(-1)[0] || null}
              label="侵蚀区"
              count={getMobileErosionCount(player)}
              className="border-red-500/30 scale-[0.8] md:scale-100 md:hidden" cardBackUrl={cardBackUrl}
              onClick={() => {
                setViewingZone?.({
                  title: isOpponent ? '敌方侵蚀区' : '侵蚀区',
                  type: 'erosion',
                  isOpponentZone: !!isOpponent
                });
              }}
              isFaceUp={player.erosionFront?.some(c => c !== null)}
              isOpponent={isOpponent}
              displayMode="erosion_item"
            />
            <CardSlot
              card={player.itemZone?.filter(Boolean).slice(-1)[0] || null}
              label="道具区" count={player.itemZone?.filter(Boolean).length || 0}
              className="border-blue-500/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={() => setViewingZone?.({ title: '敌方道具区', type: 'item', isOpponentZone: !!isOpponent })}
              onHover={onHoverCard}
              isFaceUp={true}
              isExhausted={!!(player.itemZone?.filter(Boolean).slice(-1)[0] as Card | undefined)?.isExhausted}
              isHighlighted={highlightedCardIds?.has((player.itemZone?.filter(Boolean).slice(-1)[0] as Card | undefined)?.gamecardId || '')}
              isOpponent={isOpponent}
              displayMode="erosion_item"
            />
            <div className={cn("pointer-events-none flex justify-center", isOpponent && "rotate-180")}>
              <WealthCounter value={wealthValue} isOpponent={isOpponent} />
            </div>
          </>
        ) : (
          // Player Right: Exile, Grave, Deck
          <>
            <CardSlot
              card={player.exile?.length > 0 ? player.exile[player.exile.length - 1] : null}
              label="放逐" count={player.exile?.length || 0}
              className="border-purple-900/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={() => setViewingZone?.({ title: '放逐区', type: 'exile', isOpponentZone: !!isOpponent })}
              onHover={onHoverCard}
              isFaceUp={player.exile?.length > 0 ? player.exile[player.exile.length - 1]?.displayState !== 'FRONT_FACEDOWN' : true}
              displayMode="erosion_item"
            />
            <CardSlot
              card={player.grave?.length > 0 ? player.grave[player.grave.length - 1] : null}
              label="墓地" count={player.grave?.length || 0}
              className="border-red-900/30 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
              onClick={() => setViewingZone?.({ title: '墓地', type: 'grave', isOpponentZone: !!isOpponent })}
              onHover={onHoverCard}
              isFaceUp={true} displayMode="erosion_item"
            />
            <CardSlot
              card={null} isDeck label="牌库" count={player.deck?.length || 0}
              className="border-white/20 scale-[0.8] md:scale-100" cardBackUrl={cardBackUrl}
            />
          </>
        )}
      </div>
    </div>
  );
};

export const PlayField: React.FC<PlayFieldProps> = ({
  player, opponent, game, onCardClick, onPreviewCard, onPlayCard,
  paymentSelection, pendingPlayCard, stack, myUid, selectedAttackers,
  selectedDefender, allianceInitiator, timer, cardBackUrl, viewingZone,
  setViewingZone, highlightedCardIds, onShowLogs, onOpenRulebook,
  onSurrender, onPhaseClick, confrontationStrategy, onUpdateStrategy,
  canConfront, isConfrontPromptActive, isCounteringPromptActive, isDefensePromptActive, onStartConfront, onDeclineConfront, onDeclineDefense,
  showPhaseMenu, isAnyPopupOpen, isPopupHidden, onHidePopup, onExpand, isSpectator
}) => {
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : false);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!player || !opponent || !game) return null;
  const isCurrentPlayer = !isSpectator && game.playerIds[game.currentTurnPlayer] === myUid;
  const wealthContext = { turnCount: game.turnCount };
  const playerWealth = getPlayerWealthCount(player, wealthContext);
  const opponentWealth = getPlayerWealthCount(opponent, wealthContext);
  const phaseLabel =
    game.phase === 'COUNTERING' ? '对抗' :
      game.phase === 'MAIN' ? '主要' :
        game.phase === 'BATTLE_DECLARATION' ? '战斗宣言' :
          game.phase === 'DEFENSE_DECLARATION' ? '防御宣言' :
            game.phase === 'BATTLE_FREE' ? (isCurrentPlayer ? '结束战斗自由' : '战斗自由') : game.phase;
  const getPreviewFullImage = (card: Card) =>
    card.fullImageUrl || getCardImageUrl(card.id, card.rarity, false, card.availableRarities);
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
  return (
    <div className="relative w-full h-full max-w-full lg:max-w-7xl mx-auto bg-[#0a0a0a] border-y md:border-2 border-[#1a1a1a] md:rounded-xl shadow-2xl font-sans text-white select-none flex flex-col">
      {/* Background Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 via-transparent to-blue-500/5 pointer-events-none" />

      <StandardPopup
        isOpen={!!viewingZone}
        onClose={() => setViewingZone?.(null)}
        title={viewingZone?.title || ''}
        mode="card_display"
        cards={viewingZoneCards}
        cardMeta={Object.fromEntries(
          viewingZoneCards.map(card => {
            const isFaceDown = viewingZone?.type === 'erosion' && viewingZoneErosionBackIds.includes(card.gamecardId);
            const isHiddenExile = viewingZone?.type === 'exile' && card.displayState === 'FRONT_FACEDOWN';
            const isHiddenOpponentHand = !isSpectator && viewingZone?.type === 'hand' && viewingZone?.isOpponentZone && !viewingZoneOwner.isHandPublic;
            return [
              card.gamecardId || card.id,
              {
                zoneLabel: isFaceDown ? '侵蚀区背面' : isHiddenExile ? '放逐区背面' : viewingZone?.title,
                isFaceDown: isFaceDown || isHiddenExile || isHiddenOpponentHand
              }
            ];
          })
        )}
        onCardClick={(card, e) => {
          if (onCardClick && viewingZone) {
            if (viewingZone.type === 'hand' && viewingZone.isOpponentZone) {
              onPreviewCard?.(card);
              return;
            }
            const isHiddenErosionBack = viewingZone.type === 'erosion' && viewingZoneErosionBackIds.includes(card.gamecardId);
            const isHiddenExile = viewingZone.type === 'exile' && card.displayState === 'FRONT_FACEDOWN';
            if (isHiddenExile) return;
            const clickZone = viewingZone.type === 'erosion' ? (isHiddenErosionBack ? 'erosion_back' : 'erosion_front') : viewingZone.type;
            const index = viewingZoneCards.findIndex(c => c.gamecardId === card.gamecardId);
            onCardClick(card, clickZone, index, e);
          } else {
            onPreviewCard?.(card);
          }
        }}
        cardBackUrl={cardBackUrl}
        highlightedIds={Array.from(highlightedCardIds || [])}
      />
      {isDesktop && hoveredCard && (
        <div className="pointer-events-none absolute right-4 top-4 z-[120] hidden w-[300px] rounded-2xl border border-white/10 bg-black/75 p-3 shadow-2xl backdrop-blur-md lg:block">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <img
              src={getPreviewFullImage(hoveredCard)}
              alt={hoveredCard.fullName}
              className="aspect-[3/4] w-full object-contain"
              draggable={false}
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="mt-3">
            <div className="text-sm font-black text-white">{hoveredCard.fullName}</div>
            <div className="mt-1 text-[10px] font-bold tracking-widest text-white/45">
              {hoveredCard.id} · {hoveredCard.type} · {hoveredCard.color}
            </div>
            {hoveredCard.description && (
              <div className="mt-2 text-xs leading-relaxed text-white/70">
                {hoveredCard.description}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Opponent Half */}
      <div className="flex-1 min-h-0">
        <PlayerHalf
          player={opponent}
          isOpponent
          wealthValue={opponentWealth}
          onCardClick={onCardClick}
          onPreviewCard={onPreviewCard}
          onHoverCard={setHoveredCard}
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
          isSpectator={isSpectator}
        />
      </div>

      {/* Central Battle Info Panel */}
      <div className={cn(
        "relative h-16 md:h-20 w-full flex items-center justify-center z-[100] transition-all duration-300",
        (isAnyPopupOpen && !isPopupHidden) ? "opacity-0 pointer-events-none scale-95" : "opacity-100 scale-100"
      )}>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#f27d26]/10 to-transparent border-y border-white/5" />

        <div className="mx-auto flex w-fit max-w-[calc(100%-0.75rem)] flex-col items-center gap-1 rounded-2xl border border-white/10 bg-zinc-950/80 px-2 py-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl md:w-auto md:max-w-full md:flex-row md:gap-4 md:rounded-[2rem] md:px-4 md:py-2 scale-[0.85] md:scale-100 origin-center">
          <div className="flex w-fit max-w-full flex-wrap items-center justify-center gap-2 md:w-auto md:flex-nowrap md:gap-4">
            {/* Round & Surrender */}
            <div className="flex items-center gap-2 md:gap-4">
              <button
                onClick={onSurrender}
                disabled={isPopupHidden}
                className="rounded-full border border-white/5 bg-white/5 p-2 text-white/60 shadow-inner transition-all hover:bg-red-500/20 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/5 disabled:hover:text-white/60 md:p-2.5"
                title={isSpectator ? '退出观战' : '投降'}
              >
                {isSpectator ? <LogOut className="h-4 w-4 md:h-5 md:w-5" /> : <Flag className="h-4 w-4 md:h-5 md:w-5" />}
              </button>
              <div className="flex flex-col items-center">
                {/* <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">回合</span> */}
                <span className="text-lg font-black italic text-[#f27d26] md:text-xl">{game.turnCount}</span>
              </div>
            </div>

            <div className="h-7 w-px bg-white/10 md:h-8" />

            {/* Turn Indicator & Timer */}
            <div className="flex items-center gap-2 md:gap-4">
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl border-2 shadow-lg transition-all md:h-10 md:w-10",
                isCurrentPlayer
                  ? "bg-red-500/20 border-red-500 shadow-red-500/20"
                  : "bg-blue-500/20 border-blue-500 shadow-blue-500/20"
              )}>
                {isCurrentPlayer ? <Sword className="h-5 w-5 text-red-500 md:h-6 md:w-6" /> : <Shield className="h-5 w-5 text-blue-500 md:h-6 md:w-6" />}
              </div>

              {!isSpectator && (
                <div className="flex min-w-[44px] flex-col md:min-w-[60px]">
                  {/* <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">倒计时</span> */}
                  <span className={cn(
                    "text-lg font-black italic tabular-nums md:text-xl",
                    (timer || 0) < 30 ? "text-red-500 animate-pulse" : "text-white"
                  )}>
                    {timer}s
                  </span>
                </div>
              )}
            </div>

            {/* Phase transition */}
            <div
              className={cn(
                "relative flex min-w-[132px] flex-col items-center justify-center rounded-xl border border-transparent px-2 py-0.5 text-center transition-all md:min-w-[156px] md:px-4 md:py-1",
                (isConfrontPromptActive || isCounteringPromptActive || isDefensePromptActive)
                  ? "cursor-default"
                  : "cursor-pointer hover:bg-white/5",
                showPhaseMenu && "bg-white/10 border-white/20 shadow-lg",
                game.phase === 'BATTLE_FREE' && isCurrentPlayer && !isConfrontPromptActive && !isCounteringPromptActive &&
                  "bg-amber-500/15 border-amber-400/40 shadow-[0_0_24px_rgba(251,191,36,0.35)] animate-pulse"
              )}
              onClick={(e) => {
                if (isSpectator || isPopupHidden) return;
                if (isConfrontPromptActive || isCounteringPromptActive || isDefensePromptActive) return;
                onPhaseClick?.();
              }}
            >
              {(isConfrontPromptActive || isCounteringPromptActive || isDefensePromptActive) ? (
                <button
                  disabled={isPopupHidden}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isDefensePromptActive) {
                      onDeclineDefense?.();
                      return;
                    }
                    onDeclineConfront?.();
                  }}
                  className="absolute inset-[-0.15rem] z-10 flex min-w-[132px] items-center justify-center gap-1.5 rounded-xl border border-sky-400/60 bg-sky-500/25 px-3 py-1.5 text-sky-100 shadow-[0_0_26px_rgba(56,189,248,0.42)] transition-all hover:bg-sky-500/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-sky-500/25 md:inset-[-0.25rem] md:min-w-[156px] md:gap-2 md:px-4 md:py-2"
                >
                  {isDefensePromptActive ? <Shield className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                  <span className="text-xs font-black italic tracking-widest md:text-sm">
                    {isDefensePromptActive ? '放弃防御' : '忽略对抗'}
                  </span>
                </button>
              ) : (
                <span className={cn(
                  "flex w-full items-center justify-center gap-1.5 whitespace-nowrap text-center text-[15px] font-black italic uppercase tracking-tight md:gap-2 md:text-xl",
                  game.phase === 'BATTLE_FREE' && isCurrentPlayer ? "text-amber-200" : "text-white"
                )}>
                  {phaseLabel}
                  <Zap className={cn(
                    "h-3.5 w-3.5 animate-pulse md:h-4 md:w-4",
                    game.phase === 'BATTLE_FREE' && isCurrentPlayer ? "text-amber-300" : "text-[#f27d26]"
                  )} />
                </span>
              )}
            </div>
          </div>

          <div className="hidden h-8 w-px bg-white/10 md:block" />

          {/* Combat Strategy & Logs */}
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
              <button
                onClick={onOpenRulebook}
                disabled={isPopupHidden}
                className="rounded-full border border-white/5 bg-white/5 p-1.5 text-white/60 shadow-inner transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/5 disabled:hover:text-white/60 md:p-2.5"
                title="规则书"
              >
                <BookOpen className="h-4 w-4 md:h-5 md:w-5" />
              </button>
              <button
                onClick={onShowLogs}
                disabled={isPopupHidden}
                className="flex items-center gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 py-1.5 text-white/60 shadow-inner transition-all hover:bg-[#f27d26]/20 hover:text-[#f27d26] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/5 disabled:hover:text-white/60 md:px-4 md:py-2.5"
                title="战斗日志"
              >
                <span className="text-[9px] font-black tracking-widest md:text-[10px]">LOG</span>
                {/* <Layers className="w-4 h-4" /> */}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Player Half */}
      <div className="flex-1 min-h-0">
        <PlayerHalf
          player={player}
          wealthValue={playerWealth}
          onCardClick={onCardClick}
          onPreviewCard={onPreviewCard}
          onHoverCard={setHoveredCard}
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
          isSpectator={isSpectator}
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
  );
};
