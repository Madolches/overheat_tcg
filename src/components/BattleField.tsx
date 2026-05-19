import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

import { GameState, PlayerState, Card, StackItem, CardEffect, TriggerLocation, GAME_TIMEOUTS } from '../types/game';
import { socket, getAuthUser, onceAuthenticated, isSocketAuthenticated } from '../socket';

import { GameService } from '../services/gameService';
import { hydrateGameState } from '../services/cardLoader';
import { CARD_BACKS, DEFAULT_CARD_BACK_URL } from '../data/customization';
import { readJsonResponse } from '../lib/http';

import { CardComponent } from './Card';
import { PlayField } from './PlayField';
import { Rulebook } from './Rulebook';
import { motion, AnimatePresence } from 'motion/react';
import { StandardPopup } from './StandardPopup';
import { Flag, Trophy, Frown, Home, Sword, Shield, Zap, LogOut, BookOpen, Send, Loader2, Trash2, X, Play, Search, ChevronRight, ShieldCheck, Layers, Sparkles, Flame, AlertTriangle, PackagePlus, Scissors, Circle, FileText } from 'lucide-react';
import { cn, getCardColorLabel, getCardImageUrl, getCardIdentity, getCardTypeLabel, getLocationLabel, getPhaseLabel } from '../lib/utils';
import { KeywordBadges } from './KeywordBadges';
import { BattleLogPanel } from './BattleLogPanel';
import { battleLogText } from '../lib/battleLog';

const EFFECT_TYPE_LABELS: Record<string, string> = {
  ACTIVATE: '主动',
  ACTIVATED: '主动',
  TRIGGER: '触发',
  CONTINUOUS: '永续'
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  PHASE_END: '阶段结束请求'
};

const getEffectTypeLabel = (type?: string | null) => {
  if (!type) return '效果';
  return EFFECT_TYPE_LABELS[type] || type;
};

const getActionTypeLabel = (type?: string | null) => {
  if (!type) return '处理中';
  return ACTION_TYPE_LABELS[type] || type.replace(/_/g, ' ');
};

const getPhaseRequestMeta = (item?: StackItem | null) => {
  if (!item || item.type !== 'PHASE_END') {
    return {
      title: getActionTypeLabel(item?.type),
      subtitle: '行动请求',
      Icon: Send,
      tone: 'orange'
    };
  }

  if (item.nextPhase === 'DAMAGE_CALCULATION') {
    return {
      title: '结束战斗自由',
      subtitle: '进入伤害计算',
      Icon: Sword,
      tone: 'red'
    };
  }

  if (item.nextPhase === 'DISCARD') {
    return {
      title: '结束回合',
      subtitle: '进入结束处理',
      Icon: Flag,
      tone: 'blue'
    };
  }

  return {
    title: '阶段切换请求',
    subtitle: item.nextPhase ? getPhaseLabel(item.nextPhase) : '等待响应',
    Icon: Send,
    tone: 'orange'
  };
};

const PhaseRequestCard: React.FC<{ item: StackItem; className?: string }> = ({ item, className }) => {
  const meta = getPhaseRequestMeta(item);
  const Icon = meta.Icon;
  const toneClass = meta.tone === 'red'
    ? 'border-red-400/70 bg-red-950/80 text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.35)]'
    : meta.tone === 'blue'
      ? 'border-sky-400/70 bg-sky-950/80 text-sky-100 shadow-[0_0_24px_rgba(56,189,248,0.3)]'
      : 'border-[#f27d26]/70 bg-zinc-950/90 text-orange-100 shadow-[0_0_24px_rgba(242,125,38,0.28)]';

  return (
    <div className={cn(
      'relative flex aspect-[3/4] w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 p-2 text-center',
      toneClass,
      className
    )}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),transparent_36%,rgba(255,255,255,0.05))]" />
      <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/35 shadow-inner md:h-12 md:w-12">
        <Icon className="h-5 w-5 md:h-7 md:w-7" />
      </div>
      <div className="relative mt-2 text-[10px] font-black leading-tight md:text-sm">
        {meta.title}
      </div>
      <div className="relative mt-1 text-[7px] font-bold uppercase tracking-widest text-white/55 md:text-[9px]">
        {meta.subtitle}
      </div>
    </div>
  );
};

const AttackRequestCard: React.FC<{ item: StackItem; className?: string }> = ({ item, className }) => {
  const isAlliance = !!item.isAlliance || (item.attackerIds?.length || 0) > 1;

  return (
    <div className={cn(
      'relative flex aspect-[3/4] w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-red-400/70 bg-red-950/80 p-2 text-center text-red-100 shadow-[0_0_24px_rgba(239,68,68,0.35)]',
      className
    )}>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),transparent_36%,rgba(255,255,255,0.05))]" />
      <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/35 shadow-inner md:h-12 md:w-12">
        <Sword className="h-5 w-5 md:h-7 md:w-7" />
      </div>
      <div className="relative mt-2 text-[10px] font-black leading-tight md:text-sm">
        {isAlliance ? '联军攻击' : '宣告攻击'}
      </div>
      <div className="relative mt-1 text-[7px] font-bold uppercase tracking-widest text-white/55 md:text-[9px]">
        单位攻击
      </div>
    </div>
  );
};

const MulliganRevealOverlay: React.FC<{
  reveal?: PlayerState['mulliganReveal'];
  cardBackUrl: string;
  onPreview: (card: Card) => void;
}> = ({ reveal, cardBackUrl, onPreview }) => {
  if (!reveal) return null;

  const hasNewCards = reveal.cards.length > 0;
  const title = reveal.allPlayersDone ? '调度完成' : '调度替换';
  const subtitle = reveal.allPlayersDone
    ? '双方调度已完成，即将开始对局'
    : '查看调度后的全部手牌';

  return (
    <AnimatePresence>
      <motion.div
        key={reveal.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2400] flex items-center justify-center bg-black/[0.82] p-4 backdrop-blur-xl"
      >
        <motion.div
          initial={{ scale: 0.96, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.98, y: -12 }}
          className="flex w-full max-w-5xl flex-col items-center gap-6 text-center"
        >
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#f27d26]/35 bg-[#f27d26]/10 px-4 py-2 text-[10px] font-black tracking-widest text-[#f27d26]">
              <PackagePlus className="h-4 w-4" />
              {reveal.replacedCount > 0 ? `替换 ${reveal.replacedCount} 张` : '保留手牌'}
            </div>
            <h2 className="text-3xl font-black italic tracking-tight text-white md:text-5xl">{title}</h2>
            <p className="text-xs font-bold tracking-[0.24em] text-white/45 md:text-sm">{subtitle}</p>
          </div>

          {hasNewCards ? (
            <div className="grid w-full grid-cols-2 place-items-center gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {reveal.cards.map((card, index) => (
                <motion.button
                  key={`${reveal.id}-${card.gamecardId}`}
                  type="button"
                  initial={{ opacity: 0, x: -80, rotateY: 180, scale: 0.82 }}
                  animate={{ opacity: 1, x: 0, rotateY: 0, scale: 1 }}
                  transition={{
                    delay: index * 0.14,
                    duration: 0.62,
                    type: 'spring',
                    stiffness: 150,
                    damping: 18
                  }}
                  className="group relative isolate w-28 rounded-xl outline-none md:w-36"
                  onClick={() => onPreview(card)}
                >
                  <motion.div
                    initial={{ y: -28, opacity: 0.6 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: index * 0.14 + 0.16, duration: 0.35 }}
                    className="absolute -left-4 top-4 z-0 w-28 rotate-[-10deg] opacity-70 md:w-36"
                  >
                    <CardComponent isBack cardBackUrl={cardBackUrl} disableZoom />
                  </motion.div>
                  <div className="relative z-10">
                    <CardComponent card={card} cardBackUrl={cardBackUrl} displayMode="hand" disableZoom />
                  </div>
                  <div className="mt-2 line-clamp-1 text-[10px] font-black text-white/70 transition-colors group-hover:text-white">
                    {card.fullName}
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/10 bg-white/5 px-8 py-6 text-sm font-bold tracking-widest text-white/65"
            >
              调度后没有可显示的手牌
            </motion.div>
          )}

          {reveal.allPlayersDone && (
            <motion.div
              initial={{ opacity: 0, scaleX: 0.6 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 1.35, duration: 0.3 }}
              className="h-1 w-44 overflow-hidden rounded-full bg-white/10"
            >
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ delay: 1.6, duration: 2, ease: 'linear' }}
                className="h-full rounded-full bg-[#f27d26]"
              />
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const CONFRONTATION_STRATEGY_LABELS: Record<'ON' | 'AUTO' | 'OFF', string> = {
  ON: '全开',
  AUTO: '自动',
  OFF: '全关'
};

const RPS_OPTIONS = [
  { id: 'ROCK' as const, label: '石头', Icon: Circle },
  { id: 'SCISSORS' as const, label: '剪刀', Icon: Scissors },
  { id: 'PAPER' as const, label: '布', Icon: FileText }
];

export const BattleField: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const authUser = useMemo(() => getAuthUser(), []);
  const myUid = useMemo(() => authUser?.uid, [authUser]);
  const deckId = useMemo(() => location.state?.deckId || localStorage.getItem(`deck_${gameId}`), [gameId, location.state?.deckId]);
  const seat = useMemo<'player' | 'spectator'>(() => location.state?.seat === 'spectator' ? 'spectator' : 'player', [location.state?.seat]);

  const [game, setGame] = useState<GameState | null>(null);
  const [isRulebookOpen, setIsRulebookOpen] = useState(false);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const [selectedMulligan, setSelectedMulligan] = useState<string[]>([]);
  const [isMulliganSubmitting, setIsMulliganSubmitting] = useState(false);
  const [paymentSelection, setPaymentSelection] = useState<{ useFeijing: string[], exhaustIds: string[], erosionFrontIds: string[] }>({ useFeijing: [], exhaustIds: [], erosionFrontIds: [] });
  const [pendingPlayCard, setPendingPlayCard] = useState<Card | null>(null);
  const [selectedAttackers, setSelectedAttackers] = useState<string[]>([]);
  const [isAlliance, setIsAlliance] = useState(false);
  const [selectedDefender, setSelectedDefender] = useState<string | null>(null);
  const [discardSelection, setDiscardSelection] = useState<string[]>([]);
  const [showPhaseMenu, setShowPhaseMenu] = useState(false);
  const [showAttackModal, setShowAttackModal] = useState(false);
  const [selectedErosionCardId, setSelectedErosionCardId] = useState<string | null>(null);
  const [erosionChoice, setErosionChoice] = useState<'A' | 'B' | 'C' | null>(null);
  const [selectedQueryIds, setSelectedQueryIds] = useState<string[]>([]);
  const [favoriteBackId, setFavoriteBackId] = useState<string>('default');
  const [showLogSidebar, setShowLogSidebar] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [viewingZone, setViewingZone] = useState<{ title: string, type: string, erosionBackIds?: string[], isOpponentZone?: boolean } | null>(null);
  const [isHomeMenuOpen, setIsHomeMenuOpen] = useState(false);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [timer, setTimer] = useState<number>(30);
  // const [combatStrategy, setCombatStrategy] = useState<CombatStrategy>(() => {
  //   const saved = localStorage.getItem('combatStrategy') as CombatStrategy | null;
  //   return COMBAT_STRATEGY_OPTIONS.some(option => option.value === saved) ? saved! : 'automatic';
  // });
  const [cardMenu, setCardMenu] = useState<{
    card: Card;
    zone: string;
    index?: number;
    x: number;
    y: number;
  } | null>(null);
  const [allianceTargetSelection, setAllianceTargetSelection] = useState<string | null>(null);
  const [effectConfirmation, setEffectConfirmation] = useState<{
    card: Card;
    effect: CardEffect;
    effectIndex: number;
    triggerLocation: TriggerLocation;
  } | null>(null);
  const [effectSelection, setEffectSelection] = useState<{
    card: Card;
    effects: { effect: CardEffect; index: number }[];
    triggerLocation: TriggerLocation;
  } | null>(null);
  const [allianceConfirmation, setAllianceConfirmation] = useState<{
    attacker1: Card;
    attacker2: Card;
  } | null>(null);
  const [isConfronting, setIsConfronting] = useState(false);

  const lastAutoResolveRef = useRef<string | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const pendingPlayCardRef = useRef<Card | null>(null);
  const [interruptionNotice, setInterruptionNotice] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isPopupHidden, setIsPopupHidden] = useState(false);
  const [dismissedPublicRevealId, setDismissedPublicRevealId] = useState<string | null>(null);
  const [hoveredPopupCard, setHoveredPopupCard] = useState<Card | null>(null);
  const lastStrategyUpdateRef = useRef<number>(0);
  const lastJoinEmitRef = useRef<number>(0);
  const [pregameNow, setPregameNow] = useState(Date.now());

  const getPreviewFullImage = (card: Card) =>
    card.fullImageUrl || getCardImageUrl(card.id, card.rarity, false, card.availableRarities);



  const isSpectator = seat === 'spectator' || (!!game && !!myUid && !game.players[myUid.toString()] && (game.spectatorIds || []).map(String).includes(myUid.toString()));
  const spectatorAnchorUid = useMemo(() => game?.playerIds?.[0]?.toString(), [game?.playerIds]);
  const effectiveMyUid = isSpectator ? spectatorAnchorUid : myUid;
  const me = useMemo(() => (game && effectiveMyUid) ? game.players[effectiveMyUid.toString()] : null, [game, effectiveMyUid]);
  const opponentUid = useMemo(() => (game && effectiveMyUid) ? game.playerIds.find(uid => uid.toString() !== effectiveMyUid.toString()) || null : null, [game, effectiveMyUid]);
  const opponent = useMemo(() => (game && opponentUid) ? game.players[opponentUid] : null, [game, opponentUid]);
  const confrontationStrategy = (me?.confrontationStrategy || 'AUTO') as 'ON' | 'AUTO' | 'OFF';
  const [localStrategy, setLocalStrategy] = useState<'ON' | 'AUTO' | 'OFF'>(confrontationStrategy);
  const activeMulliganReveal = !isSpectator && game?.phase === 'MULLIGAN' ? me?.mulliganReveal : undefined;
  const handleToggleLogs = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
      setShowLogSidebar(current => !current);
      return;
    }
    setShowLogModal(true);
  };
  const handleSendChat = (content: string) => {
    if (!gameId) return;
    socket.emit('gameAction', { gameId, action: 'CHAT_MESSAGE', payload: { content } });
  };

  useEffect(() => {
    if (game?.phase !== 'RPS' && game?.phase !== 'FIRST_PLAYER_CHOICE') return;
    const interval = window.setInterval(() => setPregameNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [game?.phase]);

  // Sync local strategy with server state when it arrives, but ignore if we just updated it locally
  useEffect(() => {
    if (me?.confrontationStrategy && Date.now() - lastStrategyUpdateRef.current > 2000) {
      setLocalStrategy(me.confrontationStrategy);
    }
  }, [me?.confrontationStrategy]);


  const canActivateCardEffect = (card: Card | null | undefined, location: TriggerLocation) => {
    if (isSpectator || !game || !myUid || !card) return false;
    if (card.type === 'STORY' && location === 'HAND') return false;

    return !!card.effects?.some((effect) =>
      (effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED') &&
      GameService.checkEffectLimitsAndReqs(game, myUid, card, effect, location).valid
    );
  };

  const canConfront = useMemo(() => {
    if (isSpectator || !game || !me || !myUid) return false;
    if (game.pendingQuery || game.isResolvingStack || game.currentProcessingItem) return false;

    const isCounteringTurn = game.phase === 'COUNTERING' && game.priorityPlayerId === myUid;
    const isBattleFreeConfrontPrompt =
      game.phase === 'BATTLE_FREE' &&
      !!game.battleState?.askConfront &&
      (
        (game.battleState.askConfront === 'ASKING_OPPONENT' && !me.isTurn) ||
        (game.battleState.askConfront === 'ASKING_TURN_PLAYER' && me.isTurn)
      );

    if (!isCounteringTurn && !isBattleFreeConfrontPrompt) return false;

    const canPlayStory = (me.hand || []).some(card => {
      const canPlayInPhase =
        (isCounteringTurn && card.type === 'STORY') ||
        (game.phase === 'BATTLE_FREE' && card.type === 'STORY' && (me.isTurn || isBattleFreeConfrontPrompt));

      return canPlayInPhase && GameService.canPlayCard(game, me, card).canPlay;
    });
    if (canPlayStory) return true;

    const canActivateInPhase =
      isCounteringTurn ||
      isBattleFreeConfrontPrompt ||
      (me.isTurn && ['MAIN', 'BATTLE_DECLARATION', 'BATTLE_FREE'].includes(game.phase));
    if (!canActivateInPhase) return false;

    const activationZones: { cards: (Card | null)[]; location: TriggerLocation }[] = [
      { cards: me.unitZone || [], location: 'UNIT' },
      { cards: me.itemZone || [], location: 'ITEM' },
      { cards: me.erosionFront || [], location: 'EROSION_FRONT' },
      { cards: me.erosionBack || [], location: 'EROSION_BACK' },
      { cards: me.grave || [], location: 'GRAVE' },
      { cards: me.exile || [], location: 'EXILE' },
      { cards: me.hand || [], location: 'HAND' }
    ];

    return activationZones.some(({ cards, location }) =>
      cards.some(card => canActivateCardEffect(card, location))
    );
  }, [game, me, myUid, isSpectator]);




  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { pendingPlayCardRef.current = pendingPlayCard; }, [pendingPlayCard]);
  useEffect(() => {
    if (!previewCard || !game) return;

    const allCards = [
      ...((Object.values(game.players || {}) as PlayerState[]).flatMap(player => [
        ...player.hand,
        ...player.deck,
        ...player.grave,
        ...player.exile,
        ...player.unitZone,
        ...player.itemZone,
        ...player.erosionFront,
        ...player.erosionBack,
        ...player.playZone
      ])),
      ...game.counterStack.map(item => item.card).filter(Boolean),
      ...(game.pendingQuery?.options?.map(option => option.card).filter(Boolean) || [])
    ].filter(Boolean) as Card[];

    const latestCard = allCards.find(card => card.gamecardId === previewCard.gamecardId);
    if (latestCard && latestCard !== previewCard) {
      setPreviewCard(latestCard);
    }
  }, [game, previewCard]);

  // Error Toast timeout
  useEffect(() => {
    if (lastError) {
      const timer = setTimeout(() => setLastError(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [lastError]);

  useEffect(() => {
    const revealId = game?.publicReveal?.id;
    if (!revealId || dismissedPublicRevealId === revealId) return;

    const timer = setTimeout(() => {
      setDismissedPublicRevealId(revealId);
    }, 1500);
    return () => clearTimeout(timer);
  }, [game?.publicReveal?.id, dismissedPublicRevealId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsHomeMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // useEffect(() => {
  //   localStorage.setItem('combatStrategy', combatStrategy);
  // }, [combatStrategy]);

  // Fetch User Customization
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
        const res = await fetch(`${BACKEND_URL}/api/user/profile`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await readJsonResponse(res);
        if (data?.favoriteBackId) {
          setFavoriteBackId(data.favoriteBackId);
        }
      } catch (e) {
        console.error('Failed to fetch profile in BattleField:', e);
      }
    };
    fetchProfile();
  }, []);

  const cardBackUrl = useMemo(() => {
    return CARD_BACKS.find(b => b.id === favoriteBackId)?.url || DEFAULT_CARD_BACK_URL;
  }, [favoriteBackId]);

  // Universal Visual Timer Logic - Stabilized with gameRef
  useEffect(() => {
    if (!gameId || !myUid || isSpectator) return;

    const updateTimer = () => {
      const game = gameRef.current;
      if (!game) return;

      const now = Date.now();
      const elapsed = now - (game.phaseTimerStart || now);

      const me = game.players[myUid];
      const isWaiting = game.isResolvingStack ||
        game.currentProcessingItem ||
        game.pendingQuery ||
        (game.battleState && game.battleState.askConfront);

      let remaining = me ? Math.max(0, (me.timeRemaining || 0) - ((!isWaiting && me.uid === (game.priorityPlayerId || game.playerIds[game.currentTurnPlayer])) ? elapsed : 0)) : 0;

      const newTimerValue = Math.ceil(remaining / 1000);
      setTimer(prev => prev !== newTimerValue ? newTimerValue : prev);

      // Auto-resolve for player if timeout during Countering
      if (!game.pendingQuery && game.phase === 'COUNTERING' && game.priorityPlayerId === myUid && remaining <= 0) {
        const resolveKey = `${game.phase}-${game.priorityPlayerId}-${game.counterStack.length}`;
        if (lastAutoResolveRef.current !== resolveKey) {
          lastAutoResolveRef.current = resolveKey;
          handleResolve();
        }
      }
    };

    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [gameId, myUid, isSpectator]);

  useEffect(() => {
    if (isSpectator || !game || !gameId) return;
    if (game.pendingQuery || game.isResolvingStack || game.currentProcessingItem) return;
    
    // OFF Strategy: Always auto-pass
    // AUTO Strategy: Auto-pass ONLY if no cards/effects available
    const shouldAutoPass = localStrategy === 'OFF' || (localStrategy === 'AUTO' && !canConfront);

    if (shouldAutoPass) {
      if (game.phase === 'COUNTERING' && game.priorityPlayerId === myUid) {
        handleResolve();
      }
      if (game.phase === 'BATTLE_FREE' && game.battleState?.askConfront && 
         ((game.battleState.askConfront === 'ASKING_OPPONENT' && !me.isTurn) || 
          (game.battleState.askConfront === 'ASKING_TURN_PLAYER' && me.isTurn))) {
        GameService.advancePhase(gameId, 'DECLINE_CONFRONTATION');
      }
    }
  }, [game?.phase, game?.priorityPlayerId, game?.battleState?.askConfront, game?.pendingQuery?.id, game?.isResolvingStack, game?.currentProcessingItem, localStrategy, canConfront, isSpectator]);

  // Reset interaction states when phase or priority changes
  useEffect(() => {
    setIsConfronting(false);
    setIsPopupHidden(false);
  }, [game?.phase, game?.priorityPlayerId, game?.counterStack.length, game?.isResolvingStack]);


  useEffect(() => {
    const audio = new Audio('/assets/music_bg.wav');
    audio.loop = true;
    audio.volume = 0.3;

    const playAudio = () => {
      audio.play().catch(e => console.log("Audio play blocked by browser", e));
      window.removeEventListener('click', playAudio);
    };

    window.addEventListener('click', playAudio);

    return () => {
      audio.pause();
      window.removeEventListener('click', playAudio);
    };
  }, []);

  // deckId calculation removed, now memoized above

  useEffect(() => {
    if (location.state?.deckId) {
      localStorage.setItem(`deck_${gameId}`, location.state.deckId);
    }
  }, [gameId, location.state?.deckId]);

  // Listener management effect
  useEffect(() => {
    if (!gameId || gameId === 'undefined') return;

    console.log('[BattleField] Registering socket listeners for game:', gameId);

    const onGameStateUpdate = (newState: any) => {
      if (newState.gameId !== gameId) return;

      hydrateGameState(newState);
      setGame(newState);

      // Robust clearing of query-related state
      // Only clear if we are not in a local play card flow and there's no pending query
      if (!newState.pendingQuery && !pendingPlayCardRef.current) {
        setSelectedQueryIds([]);
        setPaymentSelection({ useFeijing: [], exhaustIds: [], erosionFrontIds: [] });
      }
    };

    const onGameTimerUpdate = (patch: any) => {
      if (patch.gameId !== gameId) return;
      setGame(prev => {
        if (!prev) return prev;
        const next = {
          ...prev,
          phaseTimerStart: patch.phaseTimerStart ? Date.now() : prev.phaseTimerStart,
          players: { ...prev.players }
        } as GameState;
        if (patch.players) {
          for (const [uid, playerPatch] of Object.entries(patch.players)) {
            if (next.players[uid]) {
              next.players[uid] = { ...next.players[uid], ...(playerPatch as any) };
            }
          }
        }
        return next;
      });
    };

    const onSocketError = (err: string | any) => {
      console.error('[BattleField] Socket Error:', err);
      const msg = typeof err === 'string' ? err : (err.message || '网络通讯错误');
      setLastError(msg);
    };

    socket.on('gameStateUpdate', onGameStateUpdate);
    socket.on('gameTimerUpdate', onGameTimerUpdate);
    socket.on('error', onSocketError);

    return () => {
      console.log('[BattleField] Unregistering socket listeners for game:', gameId);
      socket.off('gameStateUpdate', onGameStateUpdate);
      socket.off('gameTimerUpdate', onGameTimerUpdate);
      socket.off('error', onSocketError);
    };
  }, [gameId]);

  // Monitor logs for battle interruption
  useEffect(() => {
    if (game?.logs?.length > 0) {
      const lastLog = game.logs[game.logs.length - 1];
      const lastLogText = battleLogText(lastLog);
      if (lastLogText.includes('[战斗中止]') && !lastLogText.includes('战斗状态缺失')) {
        setInterruptionNotice(lastLogText);
      }
    }
  }, [game?.logs?.length]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && gameId && myUid) {
        console.log('[BattleField] App visible, re-joining game...');
        socket.emit('joinGame', { gameId, uid: myUid, seat });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [gameId, myUid, seat]);

  // Join game effect
  useEffect(() => {
    if (!gameId || gameId === 'undefined') return;
    if (seat === 'player' && !deckId && !gameId.startsWith('friend_') && !gameId.startsWith('bugcup_')) return;

    const performJoin = () => {
      console.log('[BattleField] Emitting joinGame:', gameId);
      lastJoinEmitRef.current = Date.now();
      socket.emit('joinGame', { gameId, deckId, seat });
    };

    const token = localStorage.getItem('token');
    const authAndJoin = () => {
      if (isSocketAuthenticated()) {
        performJoin();
      } else if (token) {
        if (!socket.connected) socket.connect();
        socket.once('authenticated', performJoin);
        socket.emit('authenticate', token);
      }
    };

    authAndJoin();

    return () => {
      console.log('[BattleField] Emitting leaveGame:', gameId);
      if (!gameId.startsWith('friend_')) {
        socket.emit('leaveGame', gameId);
      } else {
        socket.emit('leaveGameRoom', gameId);
      }
    };
  }, [gameId, deckId, seat]);

  useEffect(() => {
    if (!gameId || !gameId.startsWith('friend_')) return;
    if (!myUid || seat !== 'player') return;
    if (me && opponent) return;
    if (seat === 'player' && !deckId && !gameId.startsWith('friend_') && !gameId.startsWith('bugcup_')) return;

    const timeout = window.setTimeout(() => {
      if (Date.now() - lastJoinEmitRef.current < 1200) return;
      console.log('[BattleField] Friend game missing player state, requesting resync:', gameId);
      lastJoinEmitRef.current = Date.now();
      socket.emit('joinGame', { gameId, deckId, seat });
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [gameId, myUid, seat, deckId, me, opponent]);

  // Clear query selection when query changes
  useEffect(() => {
    // Always clear if a new query has arrived
    if (game?.pendingQuery) {
      setSelectedQueryIds([]);
      setPaymentSelection({ useFeijing: [], exhaustIds: [], erosionFrontIds: [] });
    } else if (!pendingPlayCard) {
      // Only clear if no query is active and we are not in a local play card flow
      setSelectedQueryIds([]);
      setPaymentSelection({ useFeijing: [], exhaustIds: [], erosionFrontIds: [] });
    }
  }, [game?.pendingQuery?.id]);

  // Clear alliance selection if we leave the selection phase
  useEffect(() => {
    if (game?.phase !== 'BATTLE_DECLARATION') {
      setAllianceTargetSelection(null);
      setAllianceConfirmation(null);
    }
  }, [game?.phase]);




  // Bot Logic
  useEffect(() => {
    if (!game || !gameId) return;
    const bot = game.players['BOT_PLAYER'];
    if (!bot) return;

    const isBotTurn = bot.isTurn;
    const isBotCountering = game.phase === 'COUNTERING' && game.counterStack.length > 0 && game.counterStack[game.counterStack.length - 1].ownerUid !== 'BOT_PLAYER';
    const isBotDefending = game.phase === 'DEFENSE_DECLARATION' && !isBotTurn;
    const isBotResolvingDamage = game.phase === 'DAMAGE_CALCULATION';

    if (isBotTurn || isBotCountering || isBotDefending || isBotResolvingDamage) {
      const timer = setTimeout(() => {
        // Bot moves must be moved to backend entirely based on game state loops, or emitted
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [
    game?.phase,
    game?.counterStack?.length,
    game?.priorityPlayerId,
    game?.pendingQuery?.id,
    gameId
  ]);

  // Effect Selection Keyboard Shortcuts
  useEffect(() => {
    if (!effectSelection) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num > 0 && num <= effectSelection.effects.length) {
        const selected = effectSelection.effects[num - 1];
        setEffectConfirmation({
          card: effectSelection.card,
          effect: selected.effect,
          effectIndex: selected.index,
          triggerLocation: effectSelection.triggerLocation
        });
        setEffectSelection(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [effectSelection]);

  const handleSurrender = async () => {
    if (isSpectator || !gameId) return;
    try {
      socket.emit('gameAction', { gameId, action: 'SURRENDER', payload: {} });
      setShowPhaseMenu(false);
    } catch (error: any) {
      setLastError(error.message);
    }
  };

  useEffect(() => {
    const onSurrender = () => handleSurrender();
    window.addEventListener('game:surrender', onSurrender);
    return () => window.removeEventListener('game:surrender', onSurrender);
  }, [gameId]);

  // const authUser = getAuthUser();
  // const myUid = authUser?.uid;


  const canUse204000145AsPaymentSubstitute = (card: Card, paymentColor?: string, paymentCost?: number, excludeCardId?: string) =>
    card.id === '204000145' &&
    card.gamecardId !== excludeCardId &&
    paymentColor === 'BLUE' &&
    !!paymentCost &&
    paymentCost > 0 &&
    paymentCost <= 3;

  const canUse205000136AsPaymentSubstitute = (card: Card, paymentColor?: string, paymentCost?: number, excludeCardId?: string) =>
    card.id === '205000136' &&
    card.gamecardId !== excludeCardId &&
    paymentColor === 'YELLOW' &&
    !!paymentCost &&
    paymentCost > 0 &&
    paymentCost <= 3;

  const canUseStoryPaymentSubstitute = (card: Card, paymentColor?: string, paymentCost?: number, excludeCardId?: string) =>
    card.gamecardId !== excludeCardId &&
    !!paymentCost &&
    paymentCost > 0 &&
    (
      ((card.id === '201000132' || card.id === '201000148' || card.id === '203000146') && paymentColor === 'WHITE' && (pendingPlayCard?.acValue || paymentCost) <= 3) ||
      (card.id === '202000151' && paymentColor === 'RED' && (pendingPlayCard?.acValue || paymentCost) <= 3) ||
      (card.id === '202060130' && pendingPlayCard?.faction === '雷霆')
    );

  const getHandPaymentValue = (card: Card, paymentColor?: string, paymentCost?: number, excludeCardId?: string) => {
    if (
      canUse204000145AsPaymentSubstitute(card, paymentColor, paymentCost, excludeCardId) ||
      canUse205000136AsPaymentSubstitute(card, paymentColor, paymentCost, excludeCardId) ||
      canUseStoryPaymentSubstitute(card, paymentColor, paymentCost, excludeCardId)
    ) {
      return paymentCost || 0;
    }
    const pendingRequiresFeijing = pendingPlayCard?.effects?.some(effect => effect.content === 'ONLY_FEIJING_PAYMENT');
    if (pendingRequiresFeijing && !card.feijingMark) {
      return 0;
    }
    if (card.feijingMark && (card.color === paymentColor || !paymentColor || paymentColor === 'NONE')) {
      return 3;
    }
    return 0;
  };

  const getHandPaymentOptions = (paymentColor?: string, paymentCost?: number, excludeCardId?: string) => {
    if (!me || !paymentCost || paymentCost <= 0) return [];
    return me.hand.filter(card =>
      card.gamecardId !== excludeCardId &&
      getHandPaymentValue(card, paymentColor, paymentCost, excludeCardId) > 0
    );
  };

  const getSelectedHandPaymentValue = (paymentColor?: string, paymentCost?: number, excludeCardId?: string) => {
    if (!me) return 0;
    return paymentSelection.useFeijing.reduce((total, gamecardId) => {
      const card = me.hand.find(c => c.gamecardId === gamecardId);
      return total + (card ? getHandPaymentValue(card, paymentColor, paymentCost, excludeCardId) : 0);
    }, 0);
  };

  const getAccessPaymentMinValue = (card: Card | null | undefined) =>
    card ? Math.max(1, Number((card as any).data?.accessTapMinValue || 1)) : 0;

  const getAccessPaymentValue = (card: Card | null | undefined, paymentColor?: string) => {
    if (!card) return 0;
    const data = (card as any).data || {};
    if (data.accessTapColor && data.accessTapColor !== paymentColor) return 1;
    return Math.max(getAccessPaymentMinValue(card), Number(data.accessTapValue || 1));
  };

  const getAccessPaymentLabel = (card: Card | null | undefined, paymentColor?: string) => {
    if (!card) return '+0';
    const minValue = getAccessPaymentMinValue(card);
    const maxValue = getAccessPaymentValue(card, paymentColor);
    return minValue < maxValue ? `+${minValue}/+${maxValue}` : `+${maxValue}`;
  };

  const getSelectedAccessPaymentValue = (exhaustIds: string[] = paymentSelection.exhaustIds, paymentColor?: string) => {
    if (!me) return 0;
    return exhaustIds.reduce((total, gamecardId) => {
      const card = me.unitZone.find(unit => unit?.gamecardId === gamecardId);
      return total + getAccessPaymentValue(card, paymentColor);
    }, 0);
  };

  const getSelectedAccessPaymentMinValue = (exhaustIds: string[] = paymentSelection.exhaustIds) => {
    if (!me) return 0;
    return exhaustIds.reduce((total, gamecardId) => {
      const card = me.unitZone.find(unit => unit?.gamecardId === gamecardId);
      return total + getAccessPaymentMinValue(card);
    }, 0);
  };

  const formatSelectedPaymentValue = (required: number, paymentColor?: string, excludeCardId?: string) => {
    if (required <= 0) return paymentSelection.erosionFrontIds.length;
    const handValue = getSelectedHandPaymentValue(paymentColor, required, excludeCardId);
    const minValue = handValue + getSelectedAccessPaymentMinValue();
    const maxValue = handValue + getSelectedAccessPaymentValue(paymentSelection.exhaustIds, paymentColor);
    return minValue < maxValue ? `${minValue}-${maxValue}` : maxValue;
  };

  const getPaymentExcludedExhaustIds = () =>
    (game.pendingQuery?.context?.paymentOptions?.excludeExhaustUnitIds || []) as string[];

  const getEffectiveCardCost = (card: Card, player: PlayerState | null = me) => {
    const baseCost = card.id === '202000080' ? 6 : (card.baseAcValue ?? card.acValue ?? 0);
    if (card.id === '101140062' && player) {
      const unitCount = player.unitZone.filter(Boolean).length;
      return Math.max(0, baseCost - unitCount);
    }
    if (card.id === '202050034' && player?.isGoddessMode) {
      return 0;
    }
    if (card.id === '105000117' && player) {
      const hasUnits = player.unitZone.some(Boolean);
      const hasFaceUpErosion = player.erosionFront.some(erosionCard => !!erosionCard && erosionCard.displayState === 'FRONT_UPRIGHT');
      if (!hasUnits && !hasFaceUpErosion) return 0;
    }
    if (card.id === '205110063' && player) {
      const itemCount = player.itemZone.filter(Boolean).length;
      return Math.max(0, baseCost - itemCount);
    }
    if (card.id === '103090247' && player) {
      const xenobuCount = player.unitZone.filter(unit => unit?.faction === '瑟诺布').length;
      return Math.max(0, baseCost - xenobuCount);
    }
    if (card.id === '202000080' && player?.unitZone.some(unit => unit?.isShenyi)) {
      return Math.max(0, baseCost - 4);
    }
    if ((card as any).data?.spiritCostTarget103080185) {
      return 0;
    }
    if (
      (card.id === '201000140' || card.id === '201000040' || card.fullName === '解放之光') &&
      player?.exile.some(exiled => exiled.id === card.id || exiled.id === '201000140' || exiled.id === '201000040' || exiled.fullName === card.fullName)
    ) {
      return 0;
    }
    return baseCost;
  };

  const pendingQuery = game?.pendingQuery;
  const normalizedPendingQueryType = pendingQuery?.type?.replace(/-/g, '_').toUpperCase();
  const rawPendingQueryOptions = Array.isArray(pendingQuery?.options) ? pendingQuery.options : [];
  const isSelectCardPendingQuery = normalizedPendingQueryType === 'SELECT_CARD';
  const pendingQueryOptions = useMemo(() => {
    if (normalizedPendingQueryType === 'ASK_TRIGGER') {
      return [
        { id: 'YES', value: 'YES', label: '是', icon: 'trigger', detail: '发动这个诱发效果' },
        { id: 'NO', value: 'NO', label: '否', icon: 'decline', detail: '跳过这个诱发效果' }
      ];
    }
    if (!game || !pendingQuery || normalizedPendingQueryType !== 'SELECT_CARD') return rawPendingQueryOptions;
    // Only target declaration queries should be narrowed by targetSpec. Scripted
    // cost/search choices may also carry sourceCardId/effectIndex, but their
    // options already come from the server-side script.
    if (pendingQuery.callbackKey !== 'DECLARE_EFFECT_TARGETS') return rawPendingQueryOptions;
    const context = pendingQuery.context || {};
    const sourceCardId = context.sourceCardId;
    const effectIndex = context.effectIndex;
    if (!sourceCardId || effectIndex === undefined || effectIndex === null) return rawPendingQueryOptions;

    const allCards = (Object.values(game.players || {}) as PlayerState[]).flatMap(player => [
      ...player.hand,
      ...player.deck,
      ...player.grave,
      ...player.exile,
      ...player.unitZone,
      ...player.itemZone,
      ...player.erosionFront,
      ...player.erosionBack,
      ...player.playZone
    ]).filter(Boolean) as Card[];
    const sourceCard = allCards.find(card => card.gamecardId === sourceCardId);
    const effect = sourceCard?.effects?.[effectIndex];
    const spec = effect?.targetSpec;
    if (!sourceCard || !effect || !spec) return rawPendingQueryOptions;

    const targetShape = context.modeId
      ? spec.modeOptions?.find(mode => mode.id === context.modeId)
      : spec.targetGroups?.[context.targetGroupIndex || 0] || spec;
    if (!targetShape) return rawPendingQueryOptions;

    const activationPlayerUid = context.activationPlayerUid || pendingQuery.playerUid;
    const activationPlayer = game.players[activationPlayerUid];
    if (!activationPlayer) return rawPendingQueryOptions;

    try {
      const candidates = targetShape.getCandidates
        ? targetShape.getCandidates(game, activationPlayer, sourceCard, context.declaredTargets)
        : [];
      if (!candidates.length) return rawPendingQueryOptions.filter(option => !option.card);
      const legalIds = new Set(candidates.map(candidate => candidate.card?.gamecardId).filter(Boolean));
      return rawPendingQueryOptions.filter(option => {
        const optionId = option.card?.gamecardId || option.card?.id || option.id;
        return !option.card || legalIds.has(optionId);
      });
    } catch (error) {
      console.warn('[Query] Failed to locally filter target candidates:', error);
      return rawPendingQueryOptions;
    }
  }, [game, pendingQuery, rawPendingQueryOptions, normalizedPendingQueryType]);
  const getPendingOptionId = (option?: any) => option?.card?.gamecardId || option?.card?.id || option?.id || '';
  const getPendingOptionText = (option?: any) =>
    `${option?.value || ''} ${option?.id || ''} ${option?.label || ''}`.toUpperCase();
  const isPositiveBinaryOption = (option?: any) => {
    const text = getPendingOptionText(option);
    if (/不发动|取消|否|跳过|不使用|通常/.test(text)) return false;
    return /\bYES\b/.test(text) || /\bY\b/.test(text) || /发动|确认|同意|是/.test(text);
  };
  const isNegativeBinaryOption = (option?: any) => {
    const text = getPendingOptionText(option);
    return /\bNO\b/.test(text) || /\bN\b/.test(text) || /不发动|取消|否|跳过|不使用|通常/.test(text);
  };
  const enabledPendingQueryOptions = pendingQueryOptions.filter(option => !option.disabled);
  const binaryConfirmOption = enabledPendingQueryOptions.find(isPositiveBinaryOption);
  const binaryCancelOption = enabledPendingQueryOptions.find(isNegativeBinaryOption);
  const isBinaryChoicePendingQuery =
    normalizedPendingQueryType !== 'ASK_TRIGGER' &&
    (
      normalizedPendingQueryType === 'SELECT_CHOICE' &&
      enabledPendingQueryOptions.length === 2 &&
      !!binaryConfirmOption &&
      !!binaryCancelOption &&
      (pendingQuery?.minSelections ?? 1) === 1 &&
      (pendingQuery?.maxSelections ?? 1) === 1
    );
  const pendingQueryPopupMode =
    normalizedPendingQueryType === 'SELECT_PAYMENT' ? 'payment_selection' :
    normalizedPendingQueryType === 'ASK_TRIGGER' ? 'double_selection' :
    isBinaryChoicePendingQuery ? 'double_selection' :
    normalizedPendingQueryType === 'SELECT_CHOICE' ? 'choice_selection' :
    normalizedPendingQueryType === 'SELECT_CARD' ? (pendingQueryOptions.some(o => o.card?.id === 'PLAYER_SELF' || o.card?.id === 'PLAYER_OPPONENT') ? 'player_selection' : 'card_selection') :
    'choice_selection';
  const binaryConfirmText =
    normalizedPendingQueryType === 'ASK_TRIGGER' || /是否发动/.test(`${pendingQuery?.title || ''} ${pendingQuery?.description || ''}`)
      ? '是'
      : binaryConfirmOption?.label || '确认';
  const binaryCancelText =
    normalizedPendingQueryType === 'ASK_TRIGGER' || /是否发动/.test(`${pendingQuery?.title || ''} ${pendingQuery?.description || ''}`)
      ? '否'
      : binaryCancelOption?.label || '取消';
  const selectablePendingQueryOptions = isSelectCardPendingQuery
    ? pendingQueryOptions.filter(option => !!option?.card && !option.disabled)
    : [];
  const selectablePendingQueryCardIds = useMemo(() => new Set(
    selectablePendingQueryOptions
      .map(option => option.card?.gamecardId || option.card?.id)
      .filter((id): id is string => !!id)
  ), [selectablePendingQueryOptions]);
  const isInspectOnlyPendingQuery = isSelectCardPendingQuery &&
    (pendingQuery?.minSelections ?? 0) === 0 &&
    selectablePendingQueryOptions.length === 0;
  const querySubmitLabel = isSelectCardPendingQuery
    ? (isInspectOnlyPendingQuery ? '确认' : '确认选择')
    : '确认支付';

  const highlightedCardIds = useMemo(() => {
    const ids = new Set<string>();
    if (isSpectator || !game || !me || !myUid) return ids;
    if (isSelectCardPendingQuery && game.pendingQuery?.playerUid === myUid) {
      selectablePendingQueryCardIds.forEach(id => ids.add(id));
      return ids;
    }
    if (game.pendingQuery || game.isResolvingStack || game.currentProcessingItem) return ids;

    if (game.phase === 'DEFENSE_DECLARATION' && !me.isTurn) {
      me.unitZone.forEach(unit => {
        if (canCardDefendInCurrentBattle(unit, game)) ids.add(unit.gamecardId);
      });
      return ids;
    }

    const isCounteringTurn = game.phase === 'COUNTERING' && game.priorityPlayerId === myUid;
    const isOwnSharedPhase = me.isTurn && ['MAIN', 'BATTLE_DECLARATION', 'BATTLE_FREE'].includes(game.phase);
    const isBattleFreeConfrontPrompt =
      game.phase === 'BATTLE_FREE' &&
      !!game.battleState?.askConfront &&
      (
        (game.battleState.askConfront === 'ASKING_OPPONENT' && !me.isTurn) ||
        (game.battleState.askConfront === 'ASKING_TURN_PLAYER' && me.isTurn)
      );
    const canPlayFromHand =
      (me.isTurn && game.phase === 'MAIN') ||
      (game.phase === 'BATTLE_FREE' && (me.isTurn || isBattleFreeConfrontPrompt)) ||
      isCounteringTurn;

    if (!isOwnSharedPhase && !isBattleFreeConfrontPrompt && !isCounteringTurn) return ids;

    if (canPlayFromHand) {
      me.hand.forEach(card => {
        const canPlayInPhase =
          (me.isTurn && game.phase === 'MAIN') ||
          (game.phase === 'BATTLE_FREE' && card.type === 'STORY' && (me.isTurn || isBattleFreeConfrontPrompt)) ||
          (isCounteringTurn && card.type === 'STORY');

        if (canPlayInPhase && GameService.canPlayCard(game, me, card).canPlay) {
          ids.add(card.gamecardId);
        }
      });
    }

    const activationZones: { cards: (Card | null)[]; location: TriggerLocation }[] = [
      { cards: me.unitZone, location: 'UNIT' },
      { cards: me.itemZone, location: 'ITEM' },
      { cards: me.erosionFront, location: 'EROSION_FRONT' },
      { cards: me.erosionBack, location: 'EROSION_BACK' },
      { cards: me.grave, location: 'GRAVE' },
      { cards: me.exile, location: 'EXILE' },
      { cards: me.hand, location: 'HAND' }
    ];

    activationZones.forEach(({ cards, location }) => {
      cards.forEach(card => {
        if (!card) return;
        if (card.type === 'STORY' && location === 'HAND') return;

        if (canActivateCardEffect(card, location)) {
          ids.add(card.gamecardId);
        }
      });
    });

    return ids;
  }, [game, me, myUid, isSpectator, isSelectCardPendingQuery, selectablePendingQueryCardIds]);



  const updateConfrontationStrategy = (strategy: 'ON' | 'AUTO' | 'OFF') => {
    if (!gameId || localStrategy === strategy) return;
    setLocalStrategy(strategy);
    lastStrategyUpdateRef.current = Date.now();
    GameService.setConfrontationStrategy(gameId, strategy);
  };



  if (!game || !myUid || !me || !opponent) {
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center p-8 text-center bg-[radial-gradient(circle_at_center,_#111_0%,_#000_100%)]">
        <div className="w-12 h-12 border-4 border-[#f27d26] border-t-transparent rounded-full animate-spin mb-6" />
        <h2 className="text-[#f27d26] font-bold text-xl mb-2 tracking-[0.2em] uppercase">同步战场中</h2>
        <p className="text-zinc-500 text-sm max-w-md leading-relaxed">
          正在加载对局数据并连接服务器，请稍候...
        </p>
      </div>
    );
  }


  const canUnitAttack = (card: Card) => {
    if (!card || card.isExhausted || card.canAttack === false || (card as any).battleForbiddenByEffect) return false;
    if ((me as any)?.cannotDeclareAttackTurn === game.turnCount) return false;
    if ((card as any).data?.cannotAttackThisTurn === game.turnCount) return false;
    if ((card as any).data?.cannotAttackOrDefendUntilTurn && (card as any).data.cannotAttackOrDefendUntilTurn >= game.turnCount) return false;
    const isRush = !!card.isrush;
    const wasPlayedThisTurn = card.playedTurn === game.turnCount;
    return isRush || !wasPlayedThisTurn;
  };

  const canUnitDefend = (card: Card | null) =>
    canCardDefendInCurrentBattle(card);

  const getForcedAttackIds = () => {
    const ids = new Set<string>();
    if (!game || !me) return ids;
    me.unitZone.forEach(unit => {
      if (!unit) return;
      if ((unit as any).data?.forcedAttackTurn !== game.turnCount) return;
      if ((unit as any).battleForbiddenByEffect) return;
      if ((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= game.turnCount) return;
      if (canUnitAttack(unit)) ids.add(unit.gamecardId);
    });
    return ids;
  };

  const hasForcedAttackUnits = () => getForcedAttackIds().size > 0;

  const canUnitAttackNow = (card: Card) => {
    if (!canUnitAttack(card)) return false;
    if (!['MAIN', 'BATTLE_DECLARATION'].includes(game.phase)) return true;
    const forcedAttackIds = getForcedAttackIds();
    return forcedAttackIds.size === 0 || forcedAttackIds.has(card.gamecardId);
  };

  const getAvailableAttackers = () => {
    return me.unitZone.filter(c => c !== null && canUnitAttackNow(c)) as Card[];
  };

  const canDeclareSelectedAttackers = () => {
    if (selectedAttackers.length === 0) return false;
    const forcedAttackIds = getForcedAttackIds();
    if (forcedAttackIds.size === 0) return true;
    return selectedAttackers.length === 1 && forcedAttackIds.has(selectedAttackers[0]);
  };

  const getAvailableDefenders = () => {
    return me.unitZone.filter(canUnitDefend) as Card[];
  };

  const getOwnedCardLocationLabel = (card: Card) => {
    const handIndex = me.hand.findIndex(c => c.gamecardId === card.gamecardId);
    if (handIndex !== -1) return `手牌 ${handIndex + 1}`;

    const unitIndex = me.unitZone.findIndex(c => c?.gamecardId === card.gamecardId);
    if (unitIndex !== -1) return `单位区 ${unitIndex + 1}`;

    const itemIndex = me.itemZone.findIndex(c => c?.gamecardId === card.gamecardId);
    if (itemIndex !== -1) return `道具区 ${itemIndex + 1}`;

    const erosionCards = [
      ...me.erosionBack.filter((c): c is Card => !!c),
      ...me.erosionFront.filter((c): c is Card => !!c)
    ];
    const erosionIndex = erosionCards.findIndex(c => c.gamecardId === card.gamecardId);
    if (erosionIndex !== -1) return `侵蚀区 ${erosionIndex + 1}`;

    return '';
  };

  function canCardDefendInCurrentBattle(card: Card | null | undefined, state: GameState | null = game) {
    if (!card || !state?.battleState) return false;
    if (card.isExhausted) return false;
    if ((card as any).battleForbiddenByEffect) return false;
    if ((card as any).data?.cannotDefendTurn === state.turnCount) return false;
    if ((card as any).data?.cannotAttackOrDefendUntilTurn && (card as any).data.cannotAttackOrDefendUntilTurn >= state.turnCount) return false;

    const lockedTargetId = state.battleState.defenseLockedToTargetId;
    if (lockedTargetId && card.gamecardId !== lockedTargetId) return false;

    const minPower = state.battleState.defensePowerRestriction || 0;
    if (minPower > 0 && (card.power || 0) < minPower) return false;

    const maxPower = state.battleState.defenseMaxPowerRestriction;
    if (maxPower !== undefined && (card.power || 0) >= maxPower) return false;

    const attackerPlayer = state.players[state.playerIds[state.currentTurnPlayer]];
    const attackers = (state.battleState.attackers || [])
      .map(id => attackerPlayer?.unitZone.find(attacker => attacker?.gamecardId === id))
      .filter(Boolean) as Card[];
    const minExclusive = Math.max(0, ...attackers.map(attacker => (attacker as any).data?.defenseMinPower || 0));
    if (minExclusive > 0 && (card.power || 0) <= minExclusive) return false;

    return true;
  }

  const handleDeclareAttack = async (attackers: string[] = selectedAttackers, alliance: boolean = isAlliance) => {
    if (!gameId || attackers.length === 0) return;
    try {
      await GameService.declareAttack(gameId, myUid, attackers, alliance);
      setSelectedAttackers([]);
      setIsAlliance(false);
      setShowAttackModal(false);
    } catch (error: any) {
      setLastError(error.message);
    }
  };


  const handleDeclareDefense = async (defenderId?: string) => {
    if (!gameId) return;
    try {
      await GameService.declareDefense(gameId, myUid, defenderId);
      setSelectedDefender(null);
    } catch (error: any) {
      setLastError(error.message);
    }
  };


  const handleEndBattleFree = async () => {
    if (!gameId) return;
    try {
      // Transition to damage calculation
      await GameService.advancePhase(gameId, 'PROPOSE_DAMAGE_CALCULATION');
    } catch (error: any) {
      setLastError(error.message);
    }
  };


  const handleResolveDamage = async () => {
    if (!gameId) return;
    try {
      await GameService.resolveDamage(gameId);
    } catch (error: any) {
      setLastError(error.message);
    }
  };



  const handleDiscardCard = async (cardId: string) => {
    if (!gameId) return;
    try {
      await GameService.discardCard(gameId, myUid, cardId);
    } catch (error: any) {
      setLastError(error.message);
    }
  };

  const handleEndTurn = async () => {
    if (gameId) {
      await GameService.advancePhase(gameId, 'DECLARE_END');
    }
  };

  const closeViewingZoneForCardAction = (zone: string) => {
    if (!viewingZone) return;
    if (viewingZone.type === 'hand' && zone === 'hand') {
      setViewingZone(null);
      return;
    }
    if (viewingZone.type === 'erosion' && ['erosion_front', 'erosion_back'].includes(zone)) {
      setViewingZone(null);
      return;
    }
    if (['item', 'grave', 'exile'].includes(zone)) {
      setViewingZone(null);
    }
  };



  const handleCardClick = (card: Card, zone: string, index?: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (isSpectator) {
      setPreviewCard(card);
      return;
    }

    if (isPopupHidden) {
      const rect = e?.currentTarget?.getBoundingClientRect();
      setCardMenu({
        card,
        zone,
        index,
        x: rect ? (rect.left + rect.width / 2) : (window.innerWidth / 2),
        y: rect ? (rect.top - 10) : (window.innerHeight / 2 - 100)
      });
      return;
    }

    // Guided Defense/Confrontation Selection - Just guides, menu handles completion
    if (isConfronting) {
      const isCounteringTurn = game.phase === 'COUNTERING' && game.priorityPlayerId === myUid;
      const isBattleFreeConfrontPrompt =
        game.phase === 'BATTLE_FREE' &&
        !!game.battleState?.askConfront &&
        (
          (game.battleState.askConfront === 'ASKING_OPPONENT' && !me.isTurn) ||
          (game.battleState.askConfront === 'ASKING_TURN_PLAYER' && me.isTurn)
        );

      if (!['unit', 'hand', 'item', 'erosion_front', 'erosion_back', 'grave', 'exile'].includes(zone)) {
        return;
      }

      const canPlayInPhase =
        zone === 'hand' &&
        card.type === 'STORY' &&
        (
          isCounteringTurn ||
          (game.phase === 'BATTLE_FREE' && (me.isTurn || isBattleFreeConfrontPrompt))
        ) &&
        GameService.canPlayCard(game, me, card).canPlay;

      if (canPlayInPhase) {
        playCardFromHand(card);
        closeViewingZoneForCardAction(zone);
        return;
      }

      const triggerLocation = (
        zone === 'unit' ? 'UNIT' :
        zone === 'item' ? 'ITEM' :
        zone === 'erosion_front' ? 'EROSION_FRONT' :
        zone === 'erosion_back' ? 'EROSION_BACK' :
        zone === 'grave' ? 'GRAVE' :
        zone === 'exile' ? 'EXILE' :
        'HAND'
      ) as TriggerLocation;

      const isMyCard = [
        ...me.unitZone, ...me.itemZone, ...me.erosionFront, ...me.erosionBack, ...me.grave, ...me.exile, ...me.hand
      ].some(c => c?.gamecardId === card.gamecardId);

      if (isMyCard) {
        const validEffects = (card.effects || [])
          .map((effect, effectIndex) => ({ effect, effectIndex }))
          .filter(({ effect }) =>
            (effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED') &&
            GameService.checkEffectLimitsAndReqs(game, myUid, card, effect, triggerLocation).valid
          );

        if (validEffects.length === 1) {
          setEffectConfirmation({
            card,
            effect: validEffects[0].effect,
            effectIndex: validEffects[0].effectIndex,
            triggerLocation
          });
          closeViewingZoneForCardAction(zone);
          return;
        }

        if (validEffects.length > 1) {
          setEffectSelection({
            card,
            effects: validEffects,
            triggerLocation
          });
          closeViewingZoneForCardAction(zone);
          return;
        }
      }
    }

    if (isConfronting) {
      if (['unit', 'hand', 'item', 'erosion_front', 'erosion_back', 'grave', 'exile'].includes(zone)) {
        // Fall through to show action menu
      } else {
        return;
      }
    }

    // High-priority selection modes (multi-step actions)
    if (pendingPlayCard) {
      if (zone === 'unit') {
        if (card.isExhausted) return;
        togglePaymentExhaust(card.gamecardId);
      } else if (zone === 'hand' && card.feijingMark) {
        if (card.gamecardId === pendingPlayCard.gamecardId) return;
        if (card.color !== pendingPlayCard.color) return;
        togglePaymentFeijing(card.gamecardId);
      } else if (zone === 'erosion_front') {
        if (card.displayState !== 'FRONT_UPRIGHT') return;
        togglePaymentErosionFront(card.gamecardId);
      }
      return;
    }

    if (allianceTargetSelection) {
      const isPartnerUnit =
        me.unitZone.some(c => c?.gamecardId === card.gamecardId) &&
        !hasForcedAttackUnits() &&
        canUnitAttackNow(card) &&
        card.gamecardId !== allianceTargetSelection;

      if (zone === 'unit' && isPartnerUnit) {
        const attacker1 = me.unitZone.find(c => c?.gamecardId === allianceTargetSelection);
        if (attacker1) {
          setAllianceConfirmation({ attacker1, attacker2: card });
          setAllianceTargetSelection(null);
          return;
        }
      } else if (zone === 'unit' && card.gamecardId === allianceTargetSelection) {
        setAllianceTargetSelection(null);
        return;
      } else {
        return;
      }
    }

    // Default: Show Action Menu
    const rect = e?.currentTarget?.getBoundingClientRect();
    setCardMenu({
      card,
      zone,
      index,
      x: rect ? (rect.left + rect.width / 2) : (window.innerWidth / 2),
      y: rect ? (rect.top - 10) : (window.innerHeight / 2 - 100)
    });
  };



  const activateAbility = async (card: Card, effect: CardEffect, effectIndex: number, triggerLocation?: TriggerLocation) => {
    if (!gameId) return;

    try {
      await GameService.activateEffect(gameId, myUid, card.gamecardId, effectIndex);
      setEffectConfirmation(null);
      setEffectSelection(null);
    } catch (error: any) {
      setLastError(error.message);
    }
  };

  const playCardFromHand = async (card: Card) => {
    const isCounteringTurn = game.phase === 'COUNTERING' && game.priorityPlayerId === myUid;
    const isMainTurn = me.isTurn && game.phase === 'MAIN';
    const isBattleFreeConfrontPrompt =
      game.phase === 'BATTLE_FREE' &&
      !!game.battleState?.askConfront &&
      (
        (game.battleState.askConfront === 'ASKING_OPPONENT' && !me.isTurn) ||
        (game.battleState.askConfront === 'ASKING_TURN_PLAYER' && me.isTurn)
      );
    const isBattleFreeTurn =
      game.phase === 'BATTLE_FREE' &&
      card.type === 'STORY' &&
      (me.isTurn || isBattleFreeConfrontPrompt);

    if (!gameId || (!isMainTurn && !isBattleFreeTurn && !isCounteringTurn)) return;
    if (isCounteringTurn && card.type !== 'STORY') return;

    const playEffect = card.type === 'STORY'
      ? card.effects?.find(e => e.type === 'ACTIVATE' || e.type === 'TRIGGER' || e.type === 'ALWAYS')
      : undefined;
    const needsPreselectedTarget = card.type === 'STORY' && !!playEffect?.targetSpec && playEffect.targetSpec.preselect !== false;
    const cost = getEffectiveCardCost(card);

    if (cost === 0 || needsPreselectedTarget) {
      try {
        await socket.emit('gameAction', { gameId, action: 'PLAY_CARD', payload: { cardId: card.gamecardId, paymentSelection: {} } });
      } catch (error: any) {
        setLastError(error.message);
      }
    } else {
      setPendingPlayCard(card);
      setPaymentSelection({ useFeijing: [], exhaustIds: [], erosionFrontIds: [] });
    }
  };

  const handleMulligan = async () => {
    if (!gameId) return;
    setIsMulliganSubmitting(true);
    try {
      await GameService.performMulligan(gameId, selectedMulligan);
      setSelectedMulligan([]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsMulliganSubmitting(false);
    }
  };

  const handleRpsChoice = async (choice: 'ROCK' | 'PAPER' | 'SCISSORS') => {
    if (!gameId) return;
    try {
      await GameService.submitRpsChoice(gameId, choice);
    } catch (error: any) {
      setLastError(error.message);
    }
  };

  const handleSpectatorExit = () => {
    if (gameId) {
      socket.emit('leaveGame', gameId);
    }
    navigate('/');
  };

  const handleChooseFirstPlayer = async (firstPlayerUid: string) => {
    if (!gameId) return;
    try {
      await GameService.chooseFirstPlayer(gameId, firstPlayerUid);
    } catch (error: any) {
      setLastError(error.message);
    }
  };



  const handleResolve = async () => {
    if (!gameId) return;
    if (game.pendingQuery || game.isResolvingStack || game.currentProcessingItem) return;
    try {
      setIsConfronting(false);
      if (game.phase === 'COUNTERING') {
        await GameService.passConfrontation(gameId);
      } else {
        await GameService.resolvePlay(gameId);
      }
    } catch (error: any) {
      setLastError(error.message);
    }
  };


  const handleConfirmPlay = async () => {
    if (!gameId || !pendingPlayCard) return;
    try {
      await GameService.playCard(gameId, myUid, pendingPlayCard.gamecardId, {
        feijingCardId: paymentSelection.useFeijing[0],
        exhaustUnitIds: paymentSelection.exhaustIds,
        erosionFrontIds: paymentSelection.erosionFrontIds
      });
      setPendingPlayCard(null);
      setPaymentSelection({ useFeijing: [], exhaustIds: [], erosionFrontIds: [] });
    } catch (error: any) {
      setLastError(error.message);
    }
  };


  const handleConfirmErosion = async () => {
    if (!gameId || !erosionChoice) return;
    if ((erosionChoice === 'B' || erosionChoice === 'C') && !selectedErosionCardId) {
      setLastError('请选择一张侵蚀区正面卡');
      return;
    }
    try {
      await GameService.handleErosionChoice(gameId, myUid, erosionChoice, selectedErosionCardId || undefined);
      setErosionChoice(null);
      setSelectedErosionCardId(null);
    } catch (error: any) {
      setLastError(error.message);
    }
  };

  const handleQuerySubmit = async () => {
    if (!gameId || !game?.pendingQuery) return;

    console.log(`[Query] Submitting choice for ${game.pendingQuery.type}:`, {
      id: game.pendingQuery.id,
      selectedIds: selectedQueryIds,
      payment: paymentSelection
    });

    try {
      let selections = selectedQueryIds;
      // Normalize type check to handle potential variations
      const queryType = game.pendingQuery.type?.replace(/-/g, '_').toUpperCase();

      if (queryType === 'SELECT_PAYMENT') {
        const mappedPayment = {
          feijingCardId: paymentSelection.useFeijing[0],
          exhaustUnitIds: paymentSelection.exhaustIds,
          erosionFrontIds: paymentSelection.erosionFrontIds
        };
        selections = [JSON.stringify(mappedPayment)];
      }

      await GameService.submitQueryChoice(gameId, game.pendingQuery.id, selections);
      setSelectedQueryIds([]);
    } catch (error: any) {
      console.error('[Query] Submission error:', error);
      setLastError(error.message);
    }
  };

  const togglePaymentExhaust = (gamecardId: string) => {
    setPaymentSelection(prev => {
      const isExhausted = prev.exhaustIds.includes(gamecardId);
      if (!isExhausted) {
        const required = pendingPlayCard ? getEffectiveCardCost(pendingPlayCard) : (game.pendingQuery?.paymentCost || 0);
        const paymentColor = pendingPlayCard ? pendingPlayCard.color : game.pendingQuery?.paymentColor;
        const excludeCardId = pendingPlayCard?.gamecardId;
        const currentHandValue = prev.useFeijing.reduce((total, selectedId) => {
          const selectedCard = me?.hand.find(c => c.gamecardId === selectedId);
          return total + (selectedCard ? getHandPaymentValue(selectedCard, paymentColor, required, excludeCardId) : 0);
        }, 0);
        const current = currentHandValue + getSelectedAccessPaymentMinValue(prev.exhaustIds);
        if (current >= required) return prev;
      }
      return {
        ...prev,
        exhaustIds: isExhausted
          ? prev.exhaustIds.filter(id => id !== gamecardId)
          : [...prev.exhaustIds, gamecardId]
      };
    });
  };

  const togglePaymentFeijing = (gamecardId: string) => {
    setPaymentSelection(prev => {
      const isUsed = prev.useFeijing.includes(gamecardId);
      // Feijing is always allowed if not already in use (allows overpayment up to 3)
      // Choosing Feijing no longer clears unit exhaustion selections
      return {
        ...prev,
        useFeijing: isUsed
          ? [] // Only allow one feijing card
          : [gamecardId]
      };
    });
  };

  const togglePaymentErosionFront = (gamecardId: string) => {
    setPaymentSelection(prev => {
      const isUsed = prev.erosionFrontIds.includes(gamecardId);
      if (!isUsed) {
        const required = pendingPlayCard ? Math.abs(getEffectiveCardCost(pendingPlayCard)) : Math.abs(game.pendingQuery?.paymentCost || 0);
        if (prev.erosionFrontIds.length >= required) return prev;
      }
      return {
        ...prev,
        erosionFrontIds: isUsed
          ? prev.erosionFrontIds.filter(id => id !== gamecardId)
          : [...prev.erosionFrontIds, gamecardId]
      };
    });
  };

  const handleShenyiChoice = async (action: 'CONFIRM_SHENYI' | 'DECLINE_SHENYI') => {
    if (!gameId) return;
    try {
      await GameService.handleShenyiChoice(gameId, action);
    } catch (error: any) {
      setLastError(error.message);
    }
  };

  if (game.phase === 'RPS') {
    const myChoice = myUid ? game.rps?.choices?.[myUid.toString()] : undefined;
    const round = game.rps?.round || 1;
    const remainingMs = Math.max(0, (game.rps?.timeoutMs || 30000) - (pregameNow - (game.rps?.startedAt || pregameNow)));
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f27d26]/35 bg-[#f27d26]/10 px-4 py-2 text-[10px] font-black tracking-widest text-[#f27d26]">
          第 {round} 轮
        </div>
        <h2 className="text-3xl md:text-5xl font-black italic text-white tracking-tight">猜拳决定选择权</h2>
        <p className="mt-3 max-w-lg text-xs md:text-sm font-bold tracking-[0.2em] text-white/45">
          猜拳获胜的人决定本局先攻或后攻
        </p>
        <div className="mt-5 text-4xl font-black tabular-nums text-white md:text-5xl">
          {remainingSeconds}
          <span className="ml-2 text-sm font-bold text-white/35">秒</span>
        </div>

        {!isSpectator ? (
          <>
            <div className="mt-10 grid grid-cols-3 gap-3 md:gap-5">
              {RPS_OPTIONS.map(({ id, label, Icon }) => (
                <motion.button
                  key={id}
                  whileHover={!myChoice ? { y: -6, scale: 1.03 } : undefined}
                  whileTap={!myChoice ? { scale: 0.98 } : undefined}
                  disabled={!!myChoice}
                  onClick={() => handleRpsChoice(id)}
                  className={cn(
                    "flex h-32 w-24 flex-col items-center justify-center gap-3 rounded-2xl border text-white transition-all md:h-44 md:w-36",
                    myChoice === id
                      ? "border-[#f27d26] bg-[#f27d26]/20 shadow-[0_0_30px_rgba(242,125,38,0.28)]"
                      : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10",
                    myChoice && myChoice !== id && "opacity-35"
                  )}
                >
                  <Icon className="h-9 w-9 md:h-12 md:w-12" />
                  <span className="text-sm md:text-base font-black tracking-widest">{label}</span>
                </motion.button>
              ))}
            </div>

            <p className="mt-8 text-xs font-bold tracking-widest text-zinc-500">
              {myChoice ? '已出拳，等待对手...' : '请选择你的出拳'}
            </p>
          </>
        ) : (
          <p className="mt-10 text-xs font-bold tracking-widest text-zinc-500">观众席正在等待双方出拳...</p>
        )}
      </div>
    );
  }

  if (game.phase === 'FIRST_PLAYER_CHOICE') {
    const chooserUid = game.firstPlayerChoice?.chooserUid;
    const isChooser = !isSpectator && myUid?.toString() === chooserUid?.toString();
    const chooserName = chooserUid ? game.players[chooserUid]?.displayName : '玩家';
    const otherUid = myUid ? game.playerIds.find(uid => uid.toString() !== myUid.toString())?.toString() : undefined;
    const firstSelfUid = myUid?.toString();
    const firstOpponentUid = otherUid;
    const remainingMs = Math.max(0, (game.firstPlayerChoice?.timeoutMs || 30000) - (pregameNow - (game.firstPlayerChoice?.startedAt || pregameNow)));
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/35 bg-sky-400/10 px-4 py-2 text-[10px] font-black tracking-widest text-sky-200">
          先后攻选择
        </div>
        <h2 className="text-3xl md:text-5xl font-black italic text-white tracking-tight">
          {isChooser ? '选择先攻或后攻' : `等待 ${chooserName} 选择`}
        </h2>
        <p className="mt-3 max-w-lg text-xs md:text-sm font-bold tracking-[0.2em] text-white/45">
          {game.firstPlayerChoice?.source === 'PRACTICE' ? '练习模式由玩家决定先后攻' : '猜拳胜者决定本局先攻或后攻'}
        </p>
        <div className="mt-5 text-4xl font-black tabular-nums text-white md:text-5xl">
          {remainingSeconds}
          <span className="ml-2 text-sm font-bold text-white/35">秒</span>
        </div>

        {isChooser && firstSelfUid && firstOpponentUid ? (
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleChooseFirstPlayer(firstSelfUid)}
              className="flex w-64 flex-col items-center gap-3 rounded-2xl border border-[#f27d26]/45 bg-[#f27d26]/15 px-8 py-7 text-white shadow-[0_0_26px_rgba(242,125,38,0.18)]"
            >
              <Sword className="h-9 w-9 text-[#f27d26]" />
              <span className="text-xl font-black">我先攻</span>
              <span className="text-xs font-bold text-white/45">第 1 回合由你开始</span>
            </motion.button>
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleChooseFirstPlayer(firstOpponentUid)}
              className="flex w-64 flex-col items-center gap-3 rounded-2xl border border-sky-400/45 bg-sky-400/15 px-8 py-7 text-white shadow-[0_0_26px_rgba(56,189,248,0.16)]"
            >
              <Shield className="h-9 w-9 text-sky-200" />
              <span className="text-xl font-black">我后攻</span>
              <span className="text-xs font-bold text-white/45">第 1 回合由对手开始</span>
            </motion.button>
          </div>
        ) : (
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full border-4 border-[#f27d26] border-t-transparent animate-spin" />
            <p className="text-xs font-bold tracking-widest text-zinc-500">等待选择完成...</p>
          </div>
        )}
      </div>
    );
  }

  if (game.phase === 'MULLIGAN' && !me.mulliganDone) {
    if (isSpectator) {
      const firstPlayerName = game.playerIds.map(uid => game.players[uid]).find(player => player?.isFirst)?.displayName || '先攻玩家';
      return (
        <div className="h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 border-4 border-[#f27d26] border-t-transparent rounded-full animate-spin mb-4" />
          <h2 className="text-2xl md:text-4xl font-black italic text-[#f27d26] mb-3 tracking-tighter">调度阶段</h2>
          <p className="text-zinc-400 uppercase tracking-widest text-sm">
            观众席正在等待双方调度完成，先攻玩家：{firstPlayerName}
          </p>
        </div>
      );
    }

    const firstPlayerName = game.playerIds.map(uid => game.players[uid]).find(player => player?.isFirst)?.displayName || '先攻玩家';
    const roleLabel = me.isFirst ? '你是先攻' : '你是后攻';
    const roleDescription = me.isFirst ? '第 1 回合由你开始' : `第 1 回合由 ${firstPlayerName} 开始`;
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center p-8">
        <h2 className="text-2xl md:text-4xl font-black italic text-[#f27d26] mb-2 md:mb-4 tracking-tighter">调度阶段</h2>
        <div className={cn(
          "mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-black tracking-widest",
          me.isFirst ? "border-[#f27d26]/40 bg-[#f27d26]/10 text-[#f27d26]" : "border-sky-400/40 bg-sky-400/10 text-sky-200"
        )}>
          {me.isFirst ? <Sword className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
          {roleLabel}
          <span className="text-white/35">/</span>
          <span className="text-white/55">{roleDescription}</span>
        </div>
        <p className="text-zinc-400 mb-8 md:mb-12 tracking-[0.2em] md:tracking-[0.3em] text-[10px] md:text-sm text-center">选择需要重抽的卡牌。</p>

        <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-12 max-w-full overflow-x-auto px-4">
          {me.hand.map((card, i) => {
            const isSelected = selectedMulligan.includes(card.gamecardId);
            return (
              <div key={`${card.gamecardId}-${i}`} className="flex flex-col items-center gap-2 md:gap-4 shrink-0">
                <motion.div
                  whileHover={{ y: -10 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCardMenu({ card, zone: 'hand', index: i, x: e.clientX, y: e.clientY });
                  }}
                  className={cn(
                    "w-28 md:w-40 cursor-pointer transition-all rounded-xl overflow-hidden border-2",
                    isSelected ? "border-[#f27d26] scale-105 shadow-[0_0_30px_rgba(242,125,38,0.3)]" : "border-transparent opacity-60"
                  )}
                >
                  <CardComponent card={card} disableZoom={true} cardBackUrl={cardBackUrl} />
                </motion.div>
                <button
                  onClick={() => {
                    setSelectedMulligan(prev =>
                      prev.includes(card.gamecardId) ? prev.filter(id => id !== card.gamecardId) : [...prev, card.gamecardId]
                    );
                  }}
                  className={cn(
                    "px-3 py-1.5 md:px-4 md:py-2 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest transition-colors",
                    isSelected ? "bg-[#f27d26] text-black" : "bg-white/10 text-white hover:bg-white/20"
                  )}
                >
                  {isSelected ? "重抽" : "保留"}
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleMulligan}
          disabled={isMulliganSubmitting}
          className="px-12 py-4 bg-[#f27d26] text-white font-black italic uppercase tracking-widest rounded-xl hover:bg-[#f27d26]/80 transition-all disabled:opacity-50"
        >
          {selectedMulligan.length > 0 ? `重抽 ${selectedMulligan.length} 张` : '保留初始手牌'}
        </button>

        {/* Full Image Overlay for Mulligan */}
        {/* Card Details Overlay - MOVED TO FINAL RETURN */}
        <AnimatePresence>
          {cardMenu && (
            <>
              <div className="fixed inset-0 z-[1990]" onClick={() => setCardMenu(null)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className={cn(
                  "fixed z-[2000] flex flex-col gap-3 w-[260px] md:w-40 bg-zinc-900/95 backdrop-blur-xl p-6 md:p-4 rounded-[2rem] md:rounded-3xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)]",
                  window.innerWidth < 768 ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : ""
                )}
                style={window.innerWidth < 768 ? {} : {
                  left: cardMenu.x + 85,
                  top: cardMenu.y,
                  transform: 'translate(0, -50%)'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="md:hidden w-12 h-1 bg-white/20 rounded-full mb-2 shrink-0" />
                <div className="md:hidden text-[10px] font-black text-white/40 tracking-[0.2em] mb-2 shrink-0">操作</div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  className="px-4 py-3 md:py-1.5 text-[12px] md:text-[10px] font-bold text-white bg-[#9333ea] rounded-full shadow-lg border border-white/20 flex items-center justify-center min-w-[100px] md:min-w-[70px]"
                  onClick={() => {
                    setPreviewCard(cardMenu.card);
                    setCardMenu(null);
                  }}
                >
                  详情
                </motion.button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {previewCard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[2600] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
              onClick={() => setPreviewCard(null)}
            >
              <div className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-5 overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-4 shadow-2xl md:grid md:grid-cols-[320px_1fr] md:p-6" onClick={e => e.stopPropagation()}>
                <img
                  src={getPreviewFullImage(previewCard)}
                  alt={previewCard.fullName}
                  className="aspect-[3/4] w-full rounded-2xl bg-black/40 object-contain"
                  draggable={false}
                  referrerPolicy="no-referrer"
                />
                <div className="flex min-h-0 flex-col gap-4 text-white">
                  <div>
                    <div className="text-[10px] font-black tracking-[0.2em] text-[#f27d26]">{previewCard.id}</div>
                    <div className="mt-1 text-2xl font-black italic tracking-tight">{previewCard.fullName}</div>
                    <div className="mt-2 text-[10px] font-bold tracking-widest text-white/45">
                      {getCardTypeLabel(previewCard.type)} / {getCardColorLabel(previewCard.color)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-3 text-center">
                      <div className="text-[9px] font-black text-white/40">AC</div>
                      <div className="text-xl font-black">{previewCard.acValue ?? '-'}</div>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-3 text-center">
                      <div className="text-[9px] font-black text-white/40">力量</div>
                      <div className="text-xl font-black">{previewCard.type === 'UNIT' ? previewCard.power : '-'}</div>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-3 text-center">
                      <div className="text-[9px] font-black text-white/40">伤害</div>
                      <div className="text-xl font-black">{previewCard.type === 'UNIT' ? previewCard.damage : '-'}</div>
                    </div>
                  </div>
                  <KeywordBadges card={previewCard} variant="detail" />
                  {previewCard.description && (
                    <div className="rounded-2xl border border-white/5 bg-white/5 p-4 text-sm leading-relaxed text-white/75">
                      {previewCard.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setPreviewCard(null)}
                  className="rounded-2xl bg-zinc-800 py-3 text-sm font-black text-white transition-all hover:bg-zinc-700 md:col-span-2"
                >
                  关闭
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <MulliganRevealOverlay
          reveal={activeMulliganReveal}
          cardBackUrl={cardBackUrl}
          onPreview={setPreviewCard}
        />
      </div>
    );
  }

  if (game.phase === 'MULLIGAN' && me.mulliganDone) {
    const firstPlayerName = game.playerIds.map(uid => game.players[uid]).find(player => player?.isFirst)?.displayName || '先攻玩家';
    const roleLabel = me.isFirst ? '你是先攻' : '你是后攻';
    const roleDescription = me.isFirst ? '第 1 回合由你开始' : `第 1 回合由 ${firstPlayerName} 开始`;
    return (
      <div className="h-screen bg-black flex flex-col items-center justify-center p-8 relative" onClick={() => setCardMenu(null)}>
        <MulliganRevealOverlay
          reveal={activeMulliganReveal}
          cardBackUrl={cardBackUrl}
          onPreview={setPreviewCard}
        />
        <AnimatePresence>
          {previewCard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[2600] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
              onClick={() => setPreviewCard(null)}
            >
              <img
                src={getPreviewFullImage(previewCard)}
                alt={previewCard.fullName}
                className="max-h-[92vh] max-w-[92vw] rounded-2xl bg-black/40 object-contain shadow-2xl"
                draggable={false}
                referrerPolicy="no-referrer"
                onClick={e => e.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="w-12 h-12 border-4 border-[#f27d26] border-t-transparent rounded-full animate-spin mb-4" />
        <div className={cn(
          "mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-black tracking-widest",
          me.isFirst ? "border-[#f27d26]/40 bg-[#f27d26]/10 text-[#f27d26]" : "border-sky-400/40 bg-sky-400/10 text-sky-200"
        )}>
          {me.isFirst ? <Sword className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
          {roleLabel}
          <span className="text-white/35">/</span>
          <span className="text-white/55">{roleDescription}</span>
        </div>
        <p className="text-zinc-400 uppercase tracking-widest text-sm">
          {activeMulliganReveal ? '等待双方调度完成...' : '等待对手完成调度...'}
        </p>
      </div>
    );
  }

  const activePublicReveal = game.publicReveal && dismissedPublicRevealId !== game.publicReveal.id
    ? game.publicReveal
    : null;

  return (
    <div
      className="battle-field h-screen pt-16 bg-[#050505] flex flex-col overflow-hidden select-none font-sans relative safe-area-inset"
      onClick={() => setCardMenu(null)}
    >
      <AnimatePresence>
        {activePublicReveal && (
          <motion.div
            key={activePublicReveal.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2500] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.94, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, y: -12 }}
              className="w-full max-w-6xl flex flex-col items-center gap-6"
            >
              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#f27d26]/30 bg-[#f27d26]/10 px-4 py-2 text-[10px] font-black tracking-widest text-[#f27d26]">
                  <Sparkles className="h-4 w-4" />
                  公开卡牌
                </div>
                <h3 className="text-2xl md:text-5xl font-black italic tracking-tight text-white">
                  {activePublicReveal.playerName} 公开了 {activePublicReveal.cards.length} 张卡
                </h3>
              </div>

              <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 md:gap-5 place-items-center">
                {activePublicReveal.cards.map((card, index) => (
                  <motion.div
                    key={`${activePublicReveal.id}-${card.gamecardId}-${index}`}
                    initial={{ opacity: 0, y: 18, rotate: -2 }}
                    animate={{ opacity: 1, y: 0, rotate: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="w-full max-w-[9.5rem] overflow-hidden rounded-xl border-2 border-white/15 bg-zinc-950 shadow-2xl"
                  >
                    <CardComponent card={card} disableZoom cardBackUrl={cardBackUrl} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Standardized Erosion Phase Popup */}
      {!isSpectator && <StandardPopup
        isOpen={!isSpectator && game.phase === 'EROSION' && me.isTurn && me.erosionFront.some(c => c !== null && c.displayState === 'FRONT_UPRIGHT')}
        title="侵蚀阶段"
        description="选择如何处理正面朝上的侵蚀卡"
        mode={erosionChoice === 'B' || erosionChoice === 'C' ? 'card_selection' : 'double_selection'}
        confirmText="确认选择"
        onConfirm={handleConfirmErosion}
        onSelectionComplete={handleConfirmErosion}
        cards={me.erosionFront.filter(c => c !== null && c.displayState === 'FRONT_UPRIGHT').map(c => c!)}
        selectedIds={selectedErosionCardId ? [selectedErosionCardId] : []}
        maxSelections={1}
        minSelections={(erosionChoice === 'B' || erosionChoice === 'C') ? 1 : 0}
        onCardClick={(card) => setSelectedErosionCardId(card.gamecardId)}
        onCardHover={setHoveredPopupCard}
        cardBackUrl={cardBackUrl}
        onHide={() => {
          setHoveredPopupCard(null);
          setIsPopupHidden(true);
        }}
        isHidden={isPopupHidden}
      >

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 w-full mb-8">
          <button
            onClick={() => { setErosionChoice('A'); setSelectedErosionCardId(null); }}
            className={cn(
              "p-3 md:p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 md:gap-4 text-center",
              erosionChoice === 'A' ? "border-[#f27d26] bg-[#f27d26]/10" : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg md:text-xl font-bold">A</div>
            <div className="font-bold text-white text-sm md:text-base">全部送入墓地</div>
            <div className="text-[10px] md:text-xs text-zinc-500">将侵蚀区所有正面卡送入墓地</div>
          </button>

          <button
            onClick={() => setErosionChoice('B')}
            className={cn(
              "p-3 md:p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 md:gap-4 text-center",
              erosionChoice === 'B' ? "border-[#f27d26] bg-[#f27d26]/10" : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg md:text-xl font-bold">B</div>
            <div className="font-bold text-white text-sm md:text-base">保留一张</div>
            <div className="text-[10px] md:text-xs text-zinc-500">选择一张保留，其余送入墓地</div>
          </button>

          <button
            onClick={() => setErosionChoice('C')}
            className={cn(
              "p-3 md:p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 md:gap-4 text-center",
              erosionChoice === 'C' ? "border-[#f27d26] bg-[#f27d26]/10" : "border-white/10 bg-white/5 hover:bg-white/10"
            )}
          >
            <div className="w-8 h-8 md:w-12 md:h-12 rounded-full bg-zinc-800 flex items-center justify-center text-lg md:text-xl font-bold">C</div>
            <div className="font-bold text-white text-sm md:text-base">加入手牌</div>
            <div className="text-[10px] md:text-xs text-zinc-500">选择一张加入手牌，其余送墓，并从牌库放置一张到侵蚀区背面</div>
          </button>
        </div>
      </StandardPopup>}

      <AnimatePresence>
        {hoveredPopupCard && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className="pointer-events-none fixed right-4 top-24 z-[1200] hidden w-[300px] rounded-2xl border border-white/10 bg-black/75 p-3 shadow-2xl backdrop-blur-md lg:block"
          >
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <img
                src={getPreviewFullImage(hoveredPopupCard)}
                alt={hoveredPopupCard.fullName}
                className="aspect-[3/4] w-full object-contain"
                draggable={false}
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="mt-3">
              <div className="text-sm font-black text-white">{hoveredPopupCard.fullName}</div>
              <div className="mt-1 text-[10px] font-bold tracking-widest text-white/45">
                {hoveredPopupCard.id} · {hoveredPopupCard.type} · {hoveredPopupCard.color}
              </div>
              {hoveredPopupCard.description && (
                <div className="mt-2 text-xs leading-relaxed text-white/70">
                  {hoveredPopupCard.description}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Selection Overlay */}
      <AnimatePresence>
        {pendingPlayCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md transition-all duration-300",
              isPopupHidden ? "pointer-events-none invisible opacity-0" : "pointer-events-auto visible opacity-100"
            )}
          >
            <div className="relative max-w-2xl w-[95vw] md:w-full bg-zinc-900/90 border border-white/10 rounded-[2rem] flex flex-col items-center gap-3 md:gap-4 p-4 md:p-6 overflow-y-auto max-h-[90vh] shadow-2xl">
              <button
                onClick={() => setIsPopupHidden(true)}
                className="absolute left-4 top-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="隐藏窗口以查看战场"
              >
                隐藏
              </button>
              <div className="text-center">
                <h3 className="text-lg md:text-2xl font-black italic text-[#f27d26] tracking-tighter mb-1">支付费用</h3>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-[10px] font-bold tracking-widest">需求</span>
                    <span className={cn(
                      "text-3xl font-black px-4 py-1 rounded-xl",
                      getEffectiveCardCost(pendingPlayCard) > 0 ? "bg-red-600/20 text-red-500" : "bg-green-600/20 text-green-500"
                    )}>
                      {getEffectiveCardCost(pendingPlayCard)}
                    </span>
                  </div>
                  <div className="h-8 w-px bg-white/10" />
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-[8px] font-bold tracking-widest">已选</span>
                    <span className="text-xl md:text-2xl font-black text-white">
                      {getEffectiveCardCost(pendingPlayCard) > 0
                        ? formatSelectedPaymentValue(getEffectiveCardCost(pendingPlayCard), pendingPlayCard.color, pendingPlayCard.gamecardId)
                        : paymentSelection.erosionFrontIds.length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:grid md:grid-cols-[300px_1fr] gap-6 md:gap-12 w-full items-center md:items-start">
                {/* Left: Card being played */}
                <div className="flex flex-col items-center gap-2 md:gap-4 w-48 md:w-full">
                  <div className="w-full aspect-[3/4] rounded-2xl border-2 border-[#f27d26] shadow-[0_0_50px_rgba(242,125,38,0.3)] overflow-hidden">
                    <CardComponent card={pendingPlayCard} disableZoom cardBackUrl={cardBackUrl} />
                  </div>
                  <div className="text-center">
                    <div className="text-sm md:text-lg font-black text-white uppercase italic tracking-tight">{pendingPlayCard.fullName}</div>
                    <div className="text-[8px] md:text-[10px] text-zinc-500 tracking-widest mt-1">{getCardTypeLabel(pendingPlayCard.type)} / {getCardColorLabel(pendingPlayCard.color)}</div>
                  </div>
                </div>

                {/* Right: Selection Area */}
                <div className="flex flex-col gap-8">
                  {getEffectiveCardCost(pendingPlayCard) > 0 ? (
                    <>
                      {/* Hand Replacement Section */}
                      {getHandPaymentOptions(pendingPlayCard.color, getEffectiveCardCost(pendingPlayCard), pendingPlayCard.gamecardId).length > 0 && (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2 text-blue-400 font-black uppercase italic tracking-widest text-sm">
                            <Zap className="w-4 h-4" />
                            手牌代替支付
                          </div>
                          <div className="grid grid-cols-2 gap-3 pb-2 justify-items-center">
                            {getHandPaymentOptions(pendingPlayCard.color, getEffectiveCardCost(pendingPlayCard), pendingPlayCard.gamecardId).map((card, i) => {
                              const isSelected = paymentSelection.useFeijing.includes(card.gamecardId);
                              return (
                                <motion.div
                                  key={`${card.gamecardId}-${i}`}
                                  whileHover={{ y: -3 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => togglePaymentFeijing(card.gamecardId)}
                                  className={cn(
                                    "aspect-[3/4] w-full max-w-[10.8rem] cursor-pointer transition-all rounded-lg overflow-hidden border-2 md:max-w-none",
                                    isSelected ? "border-blue-500 scale-105 shadow-[0_0_20px_rgba(59,130,246,0.5)]" : "border-white/5 opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                                  )}
                                >
                                  <div className="relative h-full w-full">
                                    <CardComponent card={card} disableZoom cardBackUrl={cardBackUrl} />
                                    <div className="absolute left-2 top-2 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-black text-white shadow-lg">
                                      {getOwnedCardLocationLabel(card)}
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Exhaust Section */}
                      {me.unitZone.some(c => c && !c.isExhausted) && (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2 text-green-400 font-black uppercase italic tracking-widest text-sm">
                            <Sword className="w-4 h-4" />
                            横置支付（按单位ACCESS值）
                          </div>
                          <div className="grid grid-cols-2 gap-3 pb-2 justify-items-center">
                          {me.unitZone.filter(c => c && !c.isExhausted).map((card, i) => {
                            const isSelected = paymentSelection.exhaustIds.includes(card!.gamecardId);
                            const accessValue = getAccessPaymentLabel(card, pendingPlayCard?.color);
                            return (
                                <motion.div
                                  key={`${card!.gamecardId}-${i}`}
                                  whileHover={{ y: -3 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => togglePaymentExhaust(card!.gamecardId)}
                                  className={cn(
                                    "aspect-[3/4] w-full max-w-[10.8rem] cursor-pointer transition-all rounded-lg overflow-hidden border-2 md:max-w-none",
                                    isSelected ? "border-green-500 scale-105 shadow-[0_0_20px_rgba(34,197,94,0.5)]" : "border-white/5 opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                                  )}
                                >
                                  <div className="relative h-full w-full">
                                    <CardComponent card={card!} disableZoom cardBackUrl={cardBackUrl} />
                                    <div className="absolute left-2 top-2 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-black text-white shadow-lg">
                                      {getOwnedCardLocationLabel(card!)} · {accessValue}
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Negative Cost Section */
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-red-500 font-black uppercase italic tracking-widest text-sm">
                        <Trash2 className="w-4 h-4" />
                        侵蚀区支付 (Erosion Payment - Select {Math.abs(getEffectiveCardCost(pendingPlayCard))} cards)
                      </div>
                      <div className="grid grid-cols-2 gap-3 pb-2 pt-2 justify-items-center">
                        {me.erosionFront.filter(c => c && c.displayState === 'FRONT_UPRIGHT').map((card, i) => {
                          const isSelected = paymentSelection.erosionFrontIds.includes(card!.gamecardId);
                          return (
                            <motion.div
                              key={`${card!.gamecardId}-${i}`}
                              whileHover={{ y: -3 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => togglePaymentErosionFront(card!.gamecardId)}
                              className={cn(
                                "aspect-[3/4] w-full max-w-[10.8rem] cursor-pointer transition-all rounded-lg overflow-hidden border-2 md:max-w-none",
                                isSelected ? "border-red-500 scale-105 shadow-[0_0_20px_rgba(239,68,68,0.5)]" : "border-white/5 opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                              )}
                            >
                              <div className="relative h-full w-full">
                                <CardComponent card={card!} disableZoom cardBackUrl={cardBackUrl} />
                                <div className="absolute left-2 top-2 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-black text-white shadow-lg">
                                  {getOwnedCardLocationLabel(card!)}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 md:gap-6 mt-4 md:mt-8 w-full md:w-auto">
                <button
                  onClick={handleConfirmPlay}
                  className="flex-1 md:flex-none px-10 md:px-20 py-3 md:py-4 bg-[#f27d26] text-black font-black italic uppercase tracking-widest rounded-xl hover:bg-[#f27d26]/80 transition-all shadow-2xl shadow-[#f27d26]/20"
                >
                  确认并使用
                </button>
                <button
                  onClick={() => setPendingPlayCard(null)}
                  className="flex-1 md:flex-none px-10 md:px-20 py-3 md:py-4 bg-zinc-800 text-white font-black italic uppercase tracking-widest rounded-xl hover:bg-zinc-700 transition-all border border-white/5"
                >
                  取消
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>





      {/* Main Arena */}
      <div className="flex-1 relative flex min-w-0 overflow-hidden bg-[#050505]">
        {/* Top Bar: Phase & Turn */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          {/* Playground Area */}
          <div className="flex-1 flex items-center justify-center p-0 md:p-4 bg-[radial-gradient(circle_at_center,_rgba(242,125,38,0.03)_0%,_transparent_70%)] overflow-auto">
            <div className="w-full lg:w-[1920px] h-full md:h-auto md:aspect-video lg:shrink-0 md:shadow-[0_0_80px_rgba(0,0,0,0.9)] md:rounded-2xl overflow-hidden md:border-2 border-white/10 relative bg-black">
              {opponent && (
                <PlayField
                  player={me}
                  opponent={opponent}
                  game={game}
                  onCardClick={handleCardClick}
                  onPreviewCard={setPreviewCard}
                  onPlayCard={playCardFromHand}
                  paymentSelection={paymentSelection}
                  pendingPlayCard={pendingPlayCard}
                  stack={game.counterStack || []}
                  myUid={myUid}
                  isSpectator={isSpectator}
                  selectedAttackers={selectedAttackers}
                  selectedDefender={selectedDefender || undefined}
                  allianceInitiator={allianceTargetSelection || undefined}
                  timer={timer}
                  cardBackUrl={cardBackUrl}
                  viewingZone={viewingZone}
                  setViewingZone={setViewingZone}
                  highlightedCardIds={highlightedCardIds}
                  onShowLogs={handleToggleLogs}
                  onOpenRulebook={() => setIsRulebookOpen(true)}
                  onSurrender={() => {
                    if (isSpectator) {
                      handleSpectatorExit();
                      return;
                    }
                    setShowSurrenderConfirm(true);
                  }}
                  onPhaseClick={() => {
                    if (isSpectator) return;
                    const isMyTurn = game.playerIds[game.currentTurnPlayer] === myUid;
                    if (isMyTurn && game.phase === 'BATTLE_FREE') {
                      GameService.advancePhase(gameId!, 'PROPOSE_DAMAGE_CALCULATION');
                      setShowPhaseMenu(false);
                    } else if (isMyTurn && ['MAIN', 'BATTLE_DECLARATION'].includes(game.phase)) {
                      setShowPhaseMenu(!showPhaseMenu);
                    } else if (!isMyTurn && game.phase === 'DEFENSE_DECLARATION') {
                      setShowPhaseMenu(!showPhaseMenu);
                    }
                  }}
                  confrontationStrategy={localStrategy}
                  onUpdateStrategy={updateConfrontationStrategy}
                  canConfront={canConfront}
                  isConfrontPromptActive={
                    !isSpectator &&
                    game.phase === 'BATTLE_FREE' &&
                    !!game.battleState?.askConfront &&
                    (
                      (game.battleState.askConfront === 'ASKING_OPPONENT' && !me.isTurn) ||
                      (game.battleState.askConfront === 'ASKING_TURN_PLAYER' && me.isTurn)
                    )
                  }
                  isCounteringPromptActive={
                    !isSpectator &&
                    game.phase === 'COUNTERING' &&
                    game.priorityPlayerId === myUid &&
                    !game.pendingQuery &&
                    !game.isResolvingStack &&
                    !game.currentProcessingItem
                  }
                  isDefensePromptActive={
                    !isSpectator &&
                    game.phase === 'DEFENSE_DECLARATION' &&
                    !me.isTurn &&
                    !game.pendingQuery &&
                    !game.isResolvingStack &&
                    !game.currentProcessingItem
                  }
                  onStartConfront={() => {
                    if (game.phase === 'BATTLE_FREE') {
                      GameService.advancePhase(gameId!, 'CONFIRM_CONFRONTATION');
                    }
                    setIsConfronting(true);
                  }}
                  onDeclineConfront={() => {
                    if (game.phase === 'COUNTERING') {
                      handleResolve();
                    } else {
                      GameService.advancePhase(gameId!, 'DECLINE_CONFRONTATION');
                    }
                  }}
                  onDeclineDefense={() => handleDeclareDefense(undefined)}
                  isPopupHidden={isPopupHidden}
                  onHidePopup={() => setIsPopupHidden(true)}
                  onExpand={() => setIsPopupHidden(false)}

                  showPhaseMenu={showPhaseMenu}
                  isAnyPopupOpen={
                    !!previewCard ||
                    !!viewingZone ||
                    isRulebookOpen ||
                    (!isSpectator && (
                      !!game.pendingQuery ||
                      game.phase === 'EROSION' ||
                      game.phase === 'DISCARD' ||
                      game.phase === 'END' ||
                      !!pendingPlayCard ||
                      !!effectSelection ||
                      !!effectConfirmation ||
                      !!allianceConfirmation ||
                      showPhaseMenu
                    )) ||
                    showLogModal ||
                    !!interruptionNotice ||
                    (!isSpectator && showSurrenderConfirm)
                  }
                />
              )}
            </div>
          </div>
        </div>
        {game && showLogSidebar && (
          <div className="hidden md:block">
            <BattleLogPanel
              game={game}
              onClose={() => setShowLogSidebar(false)}
              onSendChat={handleSendChat}
            />
          </div>
        )}

        <AnimatePresence>
          {game.currentProcessingItem && (
            <motion.div
              initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
              animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
              exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
              className="fixed inset-0 z-[600] bg-black/40 flex items-center justify-center pointer-events-auto"
            >
              <div className="flex flex-col items-center gap-12">
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="flex items-center gap-4 text-red-500">
                    <Zap className="w-5 h-5 md:w-8 md:h-8 animate-pulse text-red-500/50" />
                    <h2 className="text-lg md:text-3xl font-black italic uppercase tracking-tighter text-white/90">
                      效果结算中
                    </h2>
                    <Zap className="w-5 h-5 md:w-8 md:h-8 animate-pulse text-red-500/50" />
                  </div>
                  <div className="h-1 w-48 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
                </motion.div>

                <motion.div
                  initial={{ scale: 0.5, opacity: 0, rotateY: 90 }}
                  animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                  exit={{ scale: 1.5, opacity: 0, filter: "brightness(2)" }}
                  transition={{ type: "spring", damping: 15 }}
                  className="relative"
                >
                  <div className="absolute -inset-8 bg-red-600/10 blur-[40px] rounded-full animate-pulse" />
                  <div className="w-48 md:w-56 relative z-10 transition-all">
                    {game.currentProcessingItem.card ? (
                      <div className="relative group">
                        <CardComponent card={game.currentProcessingItem.card} isExhausted={false} disableZoom cardBackUrl={cardBackUrl} />
                        <div className="absolute -inset-0.5 bg-gradient-to-t from-red-600/50 to-transparent opacity-50 rounded-2xl" />

                        {/* UL/UR Labels for Resolving Card */}
                        <div className={cn(
                          "absolute -top-2 -left-2 px-3 py-1 rounded-full text-[10px] font-black uppercase italic shadow-lg z-[20] border border-white/20",
                          game.currentProcessingItem.ownerUid === myUid ? "bg-blue-600 text-white" : "bg-red-600 text-white"
                        )}>
                          {game.currentProcessingItem.ownerUid === myUid ? "我方" : "对方"}
                        </div>
                        <div className="absolute -top-2 -right-2 px-3 py-1 bg-black/80 rounded-full text-[10px] font-bold text-white uppercase z-[20] border border-white/20">
                          {getCardIdentity(game, game.currentProcessingItem.ownerUid, game.currentProcessingItem.card).split('|')[1].replace(']', '')}
                        </div>
                      </div>
                    ) : game.currentProcessingItem.type === 'PHASE_END' ? (
                      <PhaseRequestCard item={game.currentProcessingItem} className="shadow-2xl" />
                    ) : game.currentProcessingItem.type === 'ATTACK' ? (
                      <AttackRequestCard item={game.currentProcessingItem} className="shadow-2xl" />
                    ) : (
                      <div className="aspect-[3/4] bg-zinc-900 border-2 border-red-500/30 rounded-2xl flex flex-col items-center justify-center p-8 text-center shadow-2xl">
                        <Sword className="w-20 h-20 text-red-500/40 mb-6" />
                        <span className="text-2xl font-black text-white uppercase tracking-widest leading-none">
                          {getActionTypeLabel(game.currentProcessingItem.type)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Link Badge */}
                  <div className="absolute -top-6 -left-6 w-20 h-20 bg-red-600 rounded-full border-4 border-zinc-900 flex items-center justify-center shadow-2xl z-20">
                    <span className="text-2xl font-black italic text-white uppercase tracking-tighter">连锁</span>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.5em]">发起方</span>
                  <span className={cn(
                    "px-6 py-2 rounded-full border text-xs font-black uppercase tracking-widest italic shadow-lg flex items-center gap-3",
                    game.currentProcessingItem.ownerUid === myUid ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : "bg-red-600/20 border-red-500/50 text-red-400"
                  )}>
                    {game.currentProcessingItem.ownerUid === myUid ? "我方" : "对方"}
                    {game.currentProcessingItem.card && (
                      <span className="opacity-60 text-[10px] border-l border-current pl-3 ml-2">
                        {getCardIdentity(game, game.currentProcessingItem.ownerUid, game.currentProcessingItem.card).split('|')[1].replace(']', '')}
                      </span>
                    )}
                  </span>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!isSpectator && game.phase === 'COUNTERING' && (game.priorityPlayerId !== myUid || game.isResolvingStack) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed inset-x-0 bottom-32 z-[140] flex flex-col items-center pointer-events-none"
            >
              <div className="bg-zinc-900/90 border border-red-500/50 px-8 py-4 rounded-full shadow-[0_0_30px_rgba(239,68,68,0.3)] backdrop-blur-sm flex items-center gap-4">
                <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
                <span className="text-white font-black italic uppercase tracking-widest text-sm">
                  {game.isResolvingStack ? "正在结算连锁..." : `等待 ${game.players[game.priorityPlayerId!]?.displayName || '对手'} 响应...`}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!isSpectator && game.phase === 'DEFENSE_DECLARATION' && me.isTurn && (
            <motion.div
              key="waiting-defense"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-zinc-900/90 border border-blue-500/50 p-12 rounded-2xl flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(37,99,235,0.2)]"
              >
                <div className="w-16 h-16 relative">
                  <Shield className="w-full h-full text-blue-500 animate-pulse" />
                  <Loader2 className="absolute inset-0 w-full h-full text-blue-400 animate-spin opacity-50" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-black italic text-blue-500 uppercase tracking-widest mb-2">等待对手防御</h2>
                  <p className="text-blue-200/60 font-medium tracking-wide">对手正在选择单位阻挡你的攻击...</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <StandardPopup
          isOpen={!isSpectator && game.phase === 'DISCARD' && me.uid === getAuthUser()?.uid && me.isTurn && me.hand.length > 6}
          title="请选择弃牌"
          description={`你的手牌超过 6 张，请选择要弃置的卡牌（当前：${me.hand.length}，需弃置：${me.hand.length - 6}）`}
          mode="card_selection"
          cards={me.hand}
          selectedIds={discardSelection}
          minSelections={me.hand.length - 6}
          maxSelections={me.hand.length - 6}
          onCardClick={(card) => {
            const id = card.gamecardId;
            const required = me.hand.length - 6;
            setDiscardSelection(prev => {
              if (prev.includes(id)) return prev.filter(i => i !== id);
              if (prev.length >= required) return prev;
              return [...prev, id];
            });
          }}
          onSelectionComplete={async () => {
            for (const id of discardSelection) {
              await handleDiscardCard(id);
            }
            setDiscardSelection([]);
          }}
          confirmText="确认弃置"
          cardBackUrl={cardBackUrl}
          onHide={() => setIsPopupHidden(true)}
          isHidden={isPopupHidden}
        />

        {/* Standardized Shenyi Choice Popup */}
        <StandardPopup
          isOpen={!isSpectator && game.phase === 'SHENYI_CHOICE' && game.pendingShenyi && game.pendingShenyi.playerUid === myUid}
          title="女神之辉：神依"
          description="你已进入女神化状态。是否触发【神依】效果，将指定单位重置为竖直状态？"
          mode="double_selection"
          cards={game.pendingShenyi?.cardIds.map(cid => me.unitZone.find(u => u?.gamecardId === cid)!).filter(Boolean) || []}
          confirmText="确认触发 (CONFIRM)"
          cancelText="忽略 (SKIP)"
          onConfirm={() => handleShenyiChoice('CONFIRM_SHENYI')}
          onCancel={() => handleShenyiChoice('DECLINE_SHENYI')}
          cardBackUrl={cardBackUrl}
          onHide={() => setIsPopupHidden(true)}
          isHidden={isPopupHidden}
        />



      </div >
      {/* Rulebook Overlay */}
      <Rulebook
        isOpen={isRulebookOpen}
        onClose={() => setIsRulebookOpen(false)}
        onHide={() => setIsPopupHidden(true)}
        isHidden={isPopupHidden}
      />

      {/* Card Action Menu */}
      {/* Unified Card Action Menu */}
      <AnimatePresence>
        {cardMenu && (
          <>
            <div className="fixed inset-0 z-[1990]" onClick={() => setCardMenu(null)}></div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={cn(
                "fixed z-[2000] flex flex-col gap-3 w-[260px] md:w-40 bg-zinc-900/95 backdrop-blur-xl p-6 md:p-4 rounded-[2rem] md:rounded-3xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] max-h-[70vh] overflow-y-auto custom-scrollbar",
                window.innerWidth < 768 ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : ""
              )}
              style={window.innerWidth < 768 ? {} : {
                left: cardMenu.x + 85,
                top: cardMenu.y,
                transform: 'translate(0, -50%)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="md:hidden w-12 h-1 bg-white/20 rounded-full mb-2 shrink-0" />
              <div className="md:hidden text-[10px] font-black text-white/40 tracking-[0.2em] mb-2 shrink-0">操作</div>
              {isPopupHidden && isSelectCardPendingQuery && game.pendingQuery?.playerUid === myUid && (() => {
                const optionId = cardMenu.card.gamecardId || cardMenu.card.id;
                if (!selectablePendingQueryCardIds.has(optionId)) return null;
                const isSelected = selectedQueryIds.includes(optionId);
                return (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    className={cn(
                      "px-4 py-3 md:py-1.5 text-[12px] md:text-[10px] font-bold rounded-full shadow-lg border border-white/20 flex items-center justify-center w-full",
                      isSelected ? "bg-[#f27d26] text-black" : "bg-white text-black"
                    )}
                    onClick={() => {
                      setSelectedQueryIds(prev => {
                        if (prev.includes(optionId)) return prev.filter(id => id !== optionId);
                        if (prev.length >= (game.pendingQuery?.maxSelections || 1)) {
                          if (game.pendingQuery?.maxSelections === 1) return [optionId];
                          return prev;
                        }
                        return [...prev, optionId];
                      });
                      setCardMenu(null);
                    }}
                  >
                    {isSelected ? '取消选择' : '选择'}
                  </motion.button>
                );
              })()}
              {isPopupHidden && game.pendingQuery?.playerUid === myUid && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  className="px-4 py-3 md:py-1.5 text-[12px] md:text-[10px] font-bold text-black bg-[#f27d26] rounded-full shadow-lg border border-white/20 flex items-center justify-center w-full"
                  onClick={() => {
                    setIsPopupHidden(false);
                    setCardMenu(null);
                  }}
                >
                  展开窗口
                </motion.button>
              )}
              {isPopupHidden && isSelectCardPendingQuery && game.pendingQuery?.playerUid === myUid && selectedQueryIds.length >= (game.pendingQuery?.minSelections || 0) && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  className="px-4 py-3 md:py-1.5 text-[12px] md:text-[10px] font-bold text-white bg-[#22c55e] rounded-full shadow-lg border border-white/20 flex items-center justify-center w-full"
                  onClick={() => {
                    handleQuerySubmit();
                    setCardMenu(null);
                  }}
                >
                  确认选择
                </motion.button>
              )}
              {/* Action: Play (Yellow) */}
              {!isPopupHidden && (() => {
                const isCounteringTurn = game.phase === 'COUNTERING' && game.priorityPlayerId === myUid;
                const isMainTurn = me.isTurn && game.phase === 'MAIN';
                const isBattleFreeTurn = me.isTurn && game.phase === 'BATTLE_FREE' && cardMenu.card.type === 'STORY';
                const canPlayInPhase = isMainTurn || isBattleFreeTurn || (isCounteringTurn && cardMenu.card.type === 'STORY');

                if (cardMenu.zone === 'hand' && canPlayInPhase) {
                  const check = GameService.canPlayCard(game, me, cardMenu.card);
                  if (check.canPlay) {
                    return (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        className="px-4 py-3 md:py-1.5 text-[12px] md:text-[10px] font-bold text-black bg-[#facc15] rounded-full shadow-lg border border-white/20 flex items-center justify-center w-full"
                        onClick={() => {
                          playCardFromHand(cardMenu.card);
                          closeViewingZoneForCardAction(cardMenu.zone);
                          setCardMenu(null);
                        }}
                      >
                        出牌
                      </motion.button>
                    );
                  }
                }
                return null;
              })()}

              {/* Action: Activate Effect (Green) */}
              {!isPopupHidden && (() => {
                const isCounteringTurn = game.phase === 'COUNTERING' && game.priorityPlayerId === myUid;
                const isOwnSharedPhase =
                  me.isTurn &&
                  ['MAIN', 'BATTLE_DECLARATION', 'BATTLE_FREE'].includes(game.phase);
                const isBattleFreeConfrontPrompt =
                  game.phase === 'BATTLE_FREE' &&
                  !!game.battleState?.askConfront &&
                  (
                    (game.battleState.askConfront === 'ASKING_OPPONENT' && !me.isTurn) ||
                    (game.battleState.askConfront === 'ASKING_TURN_PLAYER' && me.isTurn)
                  );
                const canActivateInPhase = isOwnSharedPhase || isBattleFreeConfrontPrompt || isCounteringTurn;

                if (!canActivateInPhase) return null;
                const isMyCard = [
                  ...me.unitZone, ...me.itemZone, ...me.erosionFront, ...me.erosionBack, ...me.grave, ...me.exile, ...me.hand
                ].some(c => c?.gamecardId === cardMenu.card.gamecardId);
                if (!isMyCard) return null;

                const latestCard = [
                  ...me.unitZone, ...me.itemZone, ...me.erosionFront, ...me.erosionBack, ...me.grave, ...me.exile, ...me.hand,
                  ...(opponent?.unitZone || []), ...(opponent?.itemZone || []), ...(opponent?.erosionFront || []), ...(opponent?.erosionBack || [])
                ].find(c => c?.gamecardId === cardMenu.card.gamecardId) || cardMenu.card;

                const activateEffects = latestCard.effects?.map((effect, index) => ({ effect, index }))
                  .filter(e => e.effect.type === 'ACTIVATE' || e.effect.type === 'ACTIVATED') || [];

                // RULE: STORY cards in HAND can only be PLAYED, not ACTIVATED
                if (latestCard.type === 'STORY' && cardMenu.zone === 'hand') return null;

                const zoneMap: Record<string, string> = {
                  'unit': 'UNIT',
                  'item': 'ITEM',
                  'erosion_front': 'EROSION_FRONT',
                  'grave': 'GRAVE',
                  'exile': 'EXILE',
                  'erosion_back': 'EROSION_BACK',
                  'hand': 'HAND'
                };
                const validEffects = activateEffects.filter(e => {
                  const triggerLocation = zoneMap[cardMenu.zone] as TriggerLocation;
                  return GameService.checkEffectLimitsAndReqs(game, myUid, latestCard, e.effect, triggerLocation).valid;
                });

                if (validEffects.length > 0) {
                  return (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      className="px-4 py-3 md:py-1.5 text-[12px] md:text-[10px] font-bold text-white bg-[#22c55e] rounded-full shadow-lg border border-white/20 flex items-center justify-center w-full"
                      onClick={() => {
                        const triggerLocation = (
                          cardMenu.zone === 'unit' ? 'UNIT' :
                          cardMenu.zone === 'item' ? 'ITEM' :
                          cardMenu.zone === 'erosion_front' ? 'EROSION_FRONT' :
                          cardMenu.zone === 'erosion_back' ? 'EROSION_BACK' :
                          cardMenu.zone === 'grave' ? 'GRAVE' :
                          cardMenu.zone === 'exile' ? 'EXILE' :
                          'HAND'
                        ) as TriggerLocation;
                        if (validEffects.length === 1) {
                          setEffectConfirmation({
                            card: latestCard,
                            effect: validEffects[0].effect,
                            effectIndex: validEffects[0].index,
                            triggerLocation
                          });
                        } else {
                          setEffectSelection({
                            card: latestCard,
                            effects: validEffects,
                            triggerLocation
                          });
                        }
                        closeViewingZoneForCardAction(cardMenu.zone);
                        setCardMenu(null);
                      }}
                    >
                      发动
                    </motion.button>
                  );
                }
                return null;
              })()}

              {/* Action: Attack (Red) */}
              {!isSpectator && !isPopupHidden && ['MAIN', 'BATTLE_DECLARATION'].includes(game.phase) && me.isTurn && game.turnCount !== 1 && cardMenu.zone === 'unit' && (
                (() => {
                  const latestUnit = me.unitZone.find(c => c?.gamecardId === cardMenu.card.gamecardId);
                  if (latestUnit && canUnitAttackNow(latestUnit)) {
                    const forcedAttackActive = hasForcedAttackUnits();
                    const cannotAlliance = forcedAttackActive || !!(latestUnit as any).data?.cannotAllianceByEffect;
                    return (
                      <div className="flex flex-col gap-2 md:gap-1 items-center">
                        {(!latestUnit.inAllianceGroup || cannotAlliance) && (
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            className="px-4 py-3 md:py-1.5 text-[12px] md:text-[10px] font-bold text-white bg-[#ef4444] rounded-full shadow-lg border border-white/20 flex items-center justify-center w-full"
                            onClick={() => {
                              handleDeclareAttack([latestUnit.gamecardId], false);
                              closeViewingZoneForCardAction(cardMenu.zone);
                              setCardMenu(null);
                            }}
                          >
                            攻击
                          </motion.button>
                        )}
                        {!latestUnit.inAllianceGroup && !cannotAlliance && <motion.button
                          whileHover={{ scale: 1.1 }}
                          className="px-4 py-3 md:py-1.5 text-[12px] md:text-[10px] font-bold text-white bg-[#ef4444] rounded-full shadow-lg border border-white/20 flex items-center justify-center w-full"
                          onClick={() => {
                            setAllianceTargetSelection(latestUnit.gamecardId);
                            closeViewingZoneForCardAction(cardMenu.zone);
                            setCardMenu(null);
                          }}
                        >
                          联军
                        </motion.button>}
                      </div>
                    );
                  }
                  return null;
                })()
              )}

              {/* Action: Defend (Blue) */}
              {!isSpectator && !isPopupHidden && game.phase === 'DEFENSE_DECLARATION' && opponent?.isTurn && cardMenu.zone === 'unit' && (
                (() => {
                  const isMyCard = me.unitZone.some(c => c?.gamecardId === cardMenu.card.gamecardId);
                  if (isMyCard && canUnitDefend(cardMenu.card)) {
                    return (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        className="px-4 py-3 md:py-1.5 text-[12px] md:text-[10px] font-bold text-white bg-[#3b82f6] rounded-full shadow-lg border border-white/20 flex items-center justify-center min-w-[100px] md:min-w-[70px]"
                        onClick={() => {
                          handleDeclareDefense(cardMenu.card.gamecardId);
                          closeViewingZoneForCardAction(cardMenu.zone);
                          setCardMenu(null);
                        }}
                      >
                        防御
                      </motion.button>
                    );
                  }
                  return null;
                })()
              )}

              {/* Action: Discard (Special Phase) */}
              {!isSpectator && !isPopupHidden && game.phase === 'DISCARD' && cardMenu.zone === 'hand' && me.isTurn && (
                <motion.button
                  whileHover={{ scale: 1.1, x: -3 }}
                  className="px-3 py-1 text-[9px] font-black tracking-tighter text-red-50 bg-red-600 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.4)] flex items-center gap-2 border border-red-400/50"
                  onClick={() => {
                    handleDiscardCard(cardMenu.card.gamecardId);
                    closeViewingZoneForCardAction(cardMenu.zone);
                    setCardMenu(null);
                  }}
                >
                  <Trash2 className="w-2.5 h-2.5 fill-current" />
                  弃置
                </motion.button>
              )}

              {/* Action: Details (Purple) */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                className="px-4 py-3 md:py-1.5 text-[12px] md:text-[10px] font-bold text-white bg-[#9333ea] rounded-full shadow-lg border border-white/20 flex items-center justify-center min-w-[100px] md:min-w-[70px]"
                onClick={() => {
                  setPreviewCard(cardMenu.card);
                  setCardMenu(null);
                }}
              >
                详情
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>



      {/* Standardized Alliance Confirmation Popup */}
      <StandardPopup
        isOpen={!!(!isSpectator && allianceConfirmation)}
        onClose={() => setAllianceConfirmation(null)}
        title="确认联军宣告"
        description="是否宣告这两个单位进行联军攻击？"
        mode="card_selection"
        cards={allianceConfirmation ? [allianceConfirmation.attacker1, allianceConfirmation.attacker2] : []}
        selectedIds={allianceConfirmation ? [allianceConfirmation.attacker1.gamecardId, allianceConfirmation.attacker2.gamecardId] : []}
        minSelections={2}
        maxSelections={2}
        confirmText="确认宣告"
        cancelText="取消"
        onSelectionComplete={() => {
          if (allianceConfirmation) {
            handleDeclareAttack([allianceConfirmation.attacker1.gamecardId, allianceConfirmation.attacker2.gamecardId], true);
            setAllianceConfirmation(null);
          }
        }}
        onCancel={() => setAllianceConfirmation(null)}
        cardBackUrl={cardBackUrl}
        onHide={() => setIsPopupHidden(true)}
        isHidden={isPopupHidden}
      />

      {/* Alliance Target Selection Overlay */}
      <AnimatePresence>
        {allianceTargetSelection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-0 top-[15%] z-[140] flex flex-col items-center gap-4 pointer-events-none"
          >
            <div className="bg-zinc-900/90 border border-orange-500/50 px-8 py-4 rounded-full shadow-[0_0_30px_rgba(249,115,22,0.3)] backdrop-blur-sm">
              <p className="text-orange-400 font-bold tracking-widest uppercase flex items-center gap-3">
                <Sword className="w-5 h-5" />
                请选择另一名可联攻的待机单位
              </p>
            </div>
            <button
              onClick={() => setAllianceTargetSelection(null)}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-white font-bold tracking-widest pointer-events-auto transition-colors backdrop-blur-md border border-white/10"
            >
              取消
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Effect Selection Modal */}
      <AnimatePresence>
        {effectSelection && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isPopupHidden ? 0 : 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[160] flex items-center justify-center bg-black/80 p-8 backdrop-blur-md transition-all duration-300",
              isPopupHidden ? "pointer-events-none invisible" : "pointer-events-auto visible"
            )}
            onClick={() => setEffectSelection(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative bg-zinc-900 border border-white/10 rounded-2xl max-w-2xl w-full p-4 md:p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsPopupHidden(true)}
                className="absolute left-4 top-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="隐藏窗口以查看战场"
              >
                隐藏
              </button>
              <h3 className="text-xl md:text-2xl font-black italic text-red-500 mb-4 md:mb-6 uppercase tracking-tighter">选择要发动的效果</h3>
              <div className="space-y-4">
                {effectSelection.effects.map((e, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setEffectConfirmation({
                        card: effectSelection.card,
                        effect: e.effect,
                        effectIndex: e.index,
                        triggerLocation: effectSelection.triggerLocation
                      });
                      setEffectSelection(null);
                    }}
                    className="w-full text-left p-4 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 hover:border-red-500/50 transition-all group flex items-start gap-4"
                  >
                    <div className="shrink-0 w-6 h-6 md:w-8 md:h-8 bg-white/10 text-white rounded flex items-center justify-center font-bold text-xs md:text-base">
                      {i + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1 md:mb-2">
                        <span className="px-1.5 py-0.5 rounded text-[8px] md:text-[10px] font-bold text-white bg-red-600">
                          {e.effect.type}
                        </span>
                      </div>
                      <p className="text-[10px] md:text-sm text-zinc-300 leading-relaxed group-hover:text-white transition-colors">
                        {e.effect.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setEffectSelection(null)}
                  className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Effect Confirmation Modal */}
      <AnimatePresence>
        {effectConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isPopupHidden ? 0 : 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[170] flex items-center justify-center bg-black/80 p-8 backdrop-blur-md transition-all duration-300",
              isPopupHidden ? "pointer-events-none invisible" : "pointer-events-auto visible"
            )}
            onClick={() => setEffectConfirmation(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative bg-zinc-900 border border-red-500/30 rounded-2xl max-w-xl w-full p-5 md:p-8 shadow-[0_0_50px_rgba(220,38,38,0.15)] overflow-y-auto max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsPopupHidden(true)}
                className="absolute left-4 top-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="隐藏窗口以查看战场"
              >
                隐藏
              </button>
              <h3 className="text-xl md:text-2xl font-black italic text-red-500 mb-4 md:mb-6 uppercase tracking-tighter flex items-center gap-3">
                <Zap className="w-6 h-6" />
                确认效果
              </h3>

              <div className="bg-black/50 p-4 md:p-6 rounded-xl border border-white/5 mb-6 md:mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold text-white bg-red-600">
                    {getEffectTypeLabel(effectConfirmation.effect.type)}
                  </span>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                    {effectConfirmation.card.fullName}
                  </span>
                </div>
                <p className="text-sm md:text-base text-zinc-200 leading-relaxed">
                  {effectConfirmation.effect.description}
                </p>
              </div>

              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setEffectConfirmation(null)}
                  className="px-4 md:px-6 py-2 md:py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-colors text-xs md:text-base"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    activateAbility(
                      effectConfirmation.card,
                      effectConfirmation.effect,
                      effectConfirmation.effectIndex,
                      effectConfirmation.triggerLocation
                    );
                    setEffectConfirmation(null);
                  }}
                  className="px-5 md:px-8 py-2 md:py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest shadow-lg shadow-red-600/20 transition-all hover:scale-105 text-xs md:text-base"
                >
                  确认
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Confrontation Chain Overlay (Above Popups) */}
      <AnimatePresence>
        {!isSpectator && ((game.phase === 'BATTLE_FREE' && game.battleState?.askConfront) || game.phase === 'COUNTERING' || isConfronting) && 
         (game.counterStack.length > 0 || game.battleState?.attackerCardId) && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed inset-x-0 top-12 z-[1100] flex flex-col items-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-4 bg-black/60 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 shadow-2xl">
              <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-black uppercase tracking-widest mb-2">
                <Layers className="w-4 h-4 text-red-500" />
                完整对抗连锁
              </div>
              
              <div className="flex items-center gap-4">
                {/* Battle Context (The "Root" of the confrontation) */}
                {game.battleState?.attackerCardId && (
                  <>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 md:w-24 aspect-[3/4] rounded-xl overflow-hidden border-2 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)] relative">
                        {(() => {
                          const attackerUid = (game.battleState as any).attackerUid || game.playerIds[game.currentTurnPlayer];
                          const attacker = [...(game.players[attackerUid]?.unitZone || []), ...(game.players[attackerUid]?.itemZone || [])].find(c => c?.gamecardId === game.battleState!.attackerCardId);
                          return attacker ? <CardComponent card={attacker} disableZoom cardBackUrl={cardBackUrl} /> : <div className="w-full h-full bg-zinc-800" />;
                        })()}
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-red-600 rounded text-[8px] font-black italic text-white z-10 shadow-lg">
                          攻击者
                        </div>
                      </div>
                      <span className="text-[8px] font-bold text-red-400 uppercase">
                        {((game.battleState as any).attackerUid || game.playerIds[game.currentTurnPlayer]) === myUid ? "我方" : isSpectator ? "攻击方" : "对方"}
                      </span>
                    </div>

                    {game.battleState.defenderCardId && (
                      <div className="flex items-center gap-4">
                        <Sword className="w-4 h-4 text-zinc-500 animate-pulse" />
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-16 md:w-24 aspect-[3/4] rounded-xl overflow-hidden border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)] relative">
                            {(() => {
                              const defenderUid = (game.battleState as any).defenderUid || game.playerIds[game.currentTurnPlayer === 0 ? 1 : 0];
                              const defender = [...(game.players[defenderUid]?.unitZone || [])].find(c => c?.gamecardId === game.battleState!.defenderCardId);
                              return defender ? <CardComponent card={defender} disableZoom cardBackUrl={cardBackUrl} /> : <div className="w-full h-full bg-zinc-800" />;
                            })()}
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-blue-600 rounded text-[8px] font-black italic text-white z-10 shadow-lg">
                              防御者
                            </div>
                          </div>
                          <span className="text-[8px] font-bold text-blue-400 uppercase">
                            {((game.battleState as any).defenderUid || game.playerIds[game.currentTurnPlayer === 0 ? 1 : 0]) === myUid ? "我方" : isSpectator ? "防御方" : "对方"}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {(game.counterStack.length > 0) && (
                      <div className="h-12 w-px bg-white/10 mx-2" />
                    )}
                  </>
                )}

                {/* Counter Stack */}
                {game.counterStack.map((item, idx) => (
                  <div key={`${idx}-${item.timestamp}`} className="flex items-center gap-4">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 md:w-24 aspect-[3/4] rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl relative">
                        {item.card
                          ? <CardComponent card={item.card} disableZoom cardBackUrl={cardBackUrl} />
                          : item.type === 'PHASE_END'
                            ? <PhaseRequestCard item={item} />
                            : item.type === 'ATTACK'
                              ? <AttackRequestCard item={item} />
                            : <div className="w-full h-full bg-zinc-800" />}
                        <div className={cn(
                          "absolute top-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-black italic text-white z-10 shadow-lg",
                          item.ownerUid === myUid ? "bg-blue-600" : "bg-red-600"
                        )}>
                          L{idx + 1}
                        </div>
                      </div>
                      <span className={cn(
                        "text-[8px] font-bold uppercase",
                        item.ownerUid === myUid ? "text-blue-400" : "text-red-400"
                      )}>
                        {item.ownerUid === myUid ? "我方" : "对方"}
                      </span>
                    </div>
                    {idx < game.counterStack.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-zinc-700" />
                    )}
                  </div>
                ))}
              </div>

              {isConfronting && (
                <div className="mt-4 px-6 py-2 bg-red-600/20 border border-red-500/50 rounded-full animate-pulse">
                  <span className="text-red-400 text-xs font-black italic uppercase tracking-widest">
                    请点击卡牌来发动对抗
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Standardized Surrender Confirmation Popup */}
      <StandardPopup
        isOpen={!isSpectator && showSurrenderConfirm}
        onClose={() => setShowSurrenderConfirm(false)}
        title="确认投降"
        description="你确定要投降吗？这会立即结束当前对局。"
        mode="double_selection"
        confirmText="确认投降"
        cancelText="取消"
        onConfirm={() => {
          socket.emit('gameAction', { gameId, action: 'SURRENDER' });
          setShowSurrenderConfirm(false);
        }}
        onCancel={() => setShowSurrenderConfirm(false)}
        cardBackUrl={cardBackUrl}
        onHide={() => setIsPopupHidden(true)}
        isHidden={isPopupHidden}
      />


      {/* Waiting for Opponent Query Overlay */}
      <AnimatePresence>
        {!isSpectator && game.pendingQuery && game.pendingQuery.playerUid !== myUid && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[650] flex items-center justify-center bg-black/20 backdrop-blur-sm pointer-events-auto"
          >
            <div className="bg-black/80 px-8 py-4 rounded-full border border-[#f27d26]/30 flex items-center gap-4 shadow-[0_0_30px_rgba(242,125,38,0.2)]">
              <Loader2 className="w-5 h-5 text-[#f27d26] animate-spin" />
              <span className="text-[#f27d26] font-black tracking-widest uppercase italic text-sm">
                等待对手处理效果...
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Standardized My Pending Query Popup */}
      <StandardPopup
        key={`${game.pendingQuery?.id || 'no-query'}-${pendingQueryPopupMode}`}
        isOpen={!!(!isSpectator && game.pendingQuery && game.pendingQuery.playerUid === myUid)}
        title={game.pendingQuery?.title || ''}
        description={game.pendingQuery?.description || ''}
        mode={pendingQueryPopupMode}
        options={
          normalizedPendingQueryType === 'ASK_TRIGGER' || normalizedPendingQueryType === 'SELECT_CHOICE' || normalizedPendingQueryType === 'SELECT_CARD'
            ? pendingQueryOptions
            : undefined
        }
        cards={pendingQueryOptions.filter(o => !!o.card).map(o => o.card!)}
        cardMeta={Object.fromEntries(
          pendingQueryOptions
            .filter(o => !!o.card)
            .map(o => [
              o.card!.gamecardId || o.card!.id,
              {
                ownerName: o.ownerName,
                slotLabel: o.slotLabel,
                zoneLabel: o.zoneLabel || o.source,
                isMine: o.isMine
              }
            ])
        )}
        selectedIds={selectedQueryIds}
        minSelections={game.pendingQuery?.minSelections}
        maxSelections={game.pendingQuery?.maxSelections}
        onCardClick={(card) => {
          const optionId = card.gamecardId || card.id;
          const option = pendingQueryOptions.find(o => (o.card?.gamecardId || o.card?.id || o.id) === optionId);
          if (option?.disabled) return;

          setSelectedQueryIds(prev => {
            const alreadySelected = prev.includes(optionId);
            if (alreadySelected) return prev.filter(id => id !== optionId);
            if (prev.length >= (game.pendingQuery?.maxSelections || 1)) {
              if (game.pendingQuery?.maxSelections === 1) return [optionId];
              return prev;
            }
            return [...prev, optionId];
          });
        }}
        onSelectionComplete={handleQuerySubmit}
        paymentCost={game.pendingQuery?.paymentCost}
        paymentCurrent={
          (game.pendingQuery?.paymentCost || 0) > 0
            ? formatSelectedPaymentValue(game.pendingQuery?.paymentCost || 0, game.pendingQuery?.paymentColor)
            : paymentSelection.erosionFrontIds.length
        }
        squarePanel={normalizedPendingQueryType === 'ASK_TRIGGER'}
        confirmText={binaryConfirmText}
        cancelText={binaryCancelText}
        onConfirm={() => GameService.submitQueryChoice(gameId!, game.pendingQuery!.id, [getPendingOptionId(binaryConfirmOption) || 'YES'])}
        onCancel={() => GameService.submitQueryChoice(gameId!, game.pendingQuery!.id, [getPendingOptionId(binaryCancelOption) || 'NO'])}
        cardBackUrl={cardBackUrl}
        onHide={() => setIsPopupHidden(true)}
        isHidden={isPopupHidden}
      >
        {normalizedPendingQueryType === 'SELECT_PAYMENT' && (
          <div className="flex flex-col gap-8 w-full max-w-4xl max-h-[50vh] overflow-y-auto p-4 custom-scrollbar">
            {/* Hand Replacement Section */}
            {(game.pendingQuery!.paymentCost || 0) > 0 && getHandPaymentOptions(game.pendingQuery?.paymentColor, game.pendingQuery?.paymentCost).length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-blue-400 font-black uppercase italic tracking-widest text-sm">
                  <Zap className="w-4 h-4" />
                  手牌代替支付
                </div>
                <div className="grid grid-cols-2 gap-3 pb-2 pt-2 justify-items-center">
                  {getHandPaymentOptions(game.pendingQuery?.paymentColor, game.pendingQuery?.paymentCost).map((card, i) => {
                    const isSelected = paymentSelection.useFeijing.includes(card.gamecardId);
                    return (
                      <motion.div
                        key={`${card.gamecardId}-${i}`}
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => togglePaymentFeijing(card.gamecardId)}
                        className={cn(
                          "aspect-[3/4] w-full max-w-[10.8rem] cursor-pointer transition-all rounded-lg overflow-hidden border-2 md:max-w-none",
                          isSelected ? "border-blue-500 scale-105 shadow-[0_0_20px_rgba(59,130,246,0.5)]" : "border-white/5 opacity-60 hover:opacity-100"
                        )}
                      >
                        <div className="relative h-full w-full">
                          <CardComponent card={card} disableZoom displayMode="hand" cardBackUrl={cardBackUrl} />
                          <div className="absolute left-2 top-2 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-black text-white shadow-lg">
                            {getOwnedCardLocationLabel(card)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Exhaust Section */}
            {(game.pendingQuery!.paymentCost || 0) > 0 && me.unitZone.some(c => c && !c.isExhausted && !getPaymentExcludedExhaustIds().includes(c.gamecardId)) && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-green-400 font-black uppercase italic tracking-widest text-sm">
                  <Sword className="w-4 h-4" />
                  横置支付（按单位ACCESS值）
                </div>
                <div className="grid grid-cols-2 gap-3 pb-2 pt-2 justify-items-center">
                  {me.unitZone.filter(c => c && !c.isExhausted && !getPaymentExcludedExhaustIds().includes(c.gamecardId)).map((card, i) => {
                    const isSelected = paymentSelection.exhaustIds.includes(card!.gamecardId);
                    const accessValue = getAccessPaymentLabel(card, game.pendingQuery?.paymentColor);
                    return (
                      <motion.div
                        key={`${card!.gamecardId}-${i}`}
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => togglePaymentExhaust(card!.gamecardId)}
                        className={cn(
                          "aspect-[3/4] w-full max-w-[10.8rem] cursor-pointer transition-all rounded-lg overflow-hidden border-2 md:max-w-none",
                          isSelected ? "border-green-500 scale-105 shadow-[0_0_20px_rgba(34,197,94,0.5)]" : "border-white/5 opacity-60 hover:opacity-100"
                        )}
                      >
                        <div className="relative h-full w-full">
                          <CardComponent card={card!} disableZoom cardBackUrl={cardBackUrl} />
                          <div className="absolute left-2 top-2 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-black text-white shadow-lg">
                            {getOwnedCardLocationLabel(card!)} · {accessValue}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Erosion Front Section (Horizontal Units) - Only for negative costs */}
            {(game.pendingQuery!.paymentCost || 0) < 0 && me.erosionFront.some(c => c && c.displayState === 'FRONT_UPRIGHT') && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-red-400 font-black uppercase italic tracking-widest text-sm">
                  <Layers className="w-4 h-4" />
                  水平支付（费用 -1）
                </div>
                <div className="grid grid-cols-2 gap-3 pb-2 pt-2 justify-items-center">
                  {me.erosionFront.filter(c => c && c.displayState === 'FRONT_UPRIGHT').map((card, i) => {
                    const isSelected = paymentSelection.erosionFrontIds.includes(card!.gamecardId);
                    return (
                      <motion.div
                        key={`${card!.gamecardId}-${i}`}
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => togglePaymentErosionFront(card!.gamecardId)}
                        className={cn(
                          "aspect-[3/4] w-full max-w-[10.8rem] cursor-pointer transition-all rounded-lg overflow-hidden border-2 md:max-w-none",
                          isSelected ? "border-red-500 scale-105 shadow-[0_0_20px_rgba(239,68,68,0.5)]" : "border-white/5 opacity-60 hover:opacity-100"
                        )}
                      >
                        <div className="relative h-full w-full">
                          <CardComponent card={card!} disableZoom cardBackUrl={cardBackUrl} />
                          <div className="absolute left-2 top-2 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-black text-white shadow-lg">
                            {getOwnedCardLocationLabel(card!)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="text-zinc-500 text-xs italic text-center px-8">
              提示：剩余费用将自动以侵蚀伤害的形式从你的牌库中扣除。
            </p>
          </div>
        )}

      </StandardPopup>


      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,_rgba(242,125,38,0.05)_0%,_transparent_50%)]" />
      </div>




      {/* Central Phase Action Menu Modal */}
      <AnimatePresence>
        {showPhaseMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isPopupHidden ? 0 : 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[500] flex items-center justify-center bg-black/60 p-6 backdrop-blur-md transition-all duration-300",
              isPopupHidden ? "pointer-events-none invisible" : "pointer-events-auto visible"
            )}
            onClick={() => setShowPhaseMenu(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 40 }}
              className="bg-zinc-900 border border-white/10 p-12 rounded-[3.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.8),0_0_50px_rgba(242,125,38,0.1)] flex flex-col items-center gap-10 max-w-sm w-full relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setIsPopupHidden(true)}
                className="absolute left-6 top-6 z-20 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="隐藏窗口以查看战场"
              >
                隐藏
              </button>
              {/* Premium Glow effects */}
              <div className="absolute -top-32 -right-32 w-64 h-64 bg-[#f27d26]/10 blur-[100px] rounded-full" />
              <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-red-600/10 blur-[100px] rounded-full" />

              <div className="flex flex-col items-center gap-4 relative z-10">
                <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-[#f27d26] to-[#ff9d5c] flex items-center justify-center mb-2 shadow-[0_0_40px_rgba(242,125,38,0.5)]">
                  <Loader2 className="w-10 h-10 text-white animate-spin-slow" />
                </div>
                <h3 className="text-3xl font-black italic text-white uppercase tracking-tighter text-center leading-none">
                  阶段切换
                </h3>
                <div className="px-6 py-1.5 bg-white/5 rounded-full border border-white/10 backdrop-blur-sm">
                  <p className="text-[12px] text-[#f27d26] uppercase font-black tracking-[0.3em]">
                    当前阶段：{getPhaseLabel(game.phase)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 w-full relative z-10">
                {game.phase === 'MAIN' && (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.05, y: -5 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-full h-18 py-5 px-10 bg-gradient-to-r from-zinc-800 to-zinc-700 hover:from-zinc-700 hover:to-zinc-600 text-white rounded-3xl text-sm font-black uppercase italic tracking-widest transition-all border border-white/10 flex items-center justify-center gap-5 shadow-2xl"
                      onClick={() => {
                        GameService.advancePhase(gameId!, 'DECLARE_END');
                        setShowPhaseMenu(false);
                      }}
                    >
                      <LogOut className="w-6 h-6" />
                      结束回合
                    </motion.button>
                  </>
                )}


                {game.phase === 'BATTLE_DECLARATION' && (
                  <>
                    <motion.button
                      whileHover={{ scale: 1.05, y: -5 }}
                      whileTap={{ scale: 0.95 }}
                      disabled={!canDeclareSelectedAttackers()}
                      className="w-full h-18 py-5 px-10 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded-3xl text-sm font-black uppercase italic tracking-widest transition-all shadow-[0_20px_40px_rgba(220,38,38,0.4)] disabled:opacity-50 flex items-center justify-center gap-5 border-t border-white/20"
                      onClick={() => {
                        handleDeclareAttack();
                        setShowPhaseMenu(false);
                      }}
                    >
                      <Sword className="w-6 h-6" />
                      {selectedAttackers.length === 2 ? '联军攻击' : '宣告攻击'}
                    </motion.button>
                    {!hasForcedAttackUnits() && (
                      <motion.button
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-full h-18 py-5 px-10 bg-gradient-to-r from-zinc-800 to-zinc-700 hover:from-zinc-700 hover:to-zinc-600 text-white rounded-3xl text-sm font-black uppercase italic tracking-widest transition-all border border-white/10 flex items-center justify-center gap-5 shadow-2xl"
                        onClick={() => {
                          GameService.advancePhase(gameId!, 'RETURN_MAIN');
                          setShowPhaseMenu(false);
                        }}
                      >
                        <ChevronRight className="w-6 h-6 rotate-180" />
                        返回主要阶段
                      </motion.button>
                    )}
                  </>
                )}

                {game.phase === 'DEFENSE_DECLARATION' && (
                  <motion.button
                    whileHover={{ scale: 1.05, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-full h-18 py-5 px-10 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-3xl text-sm font-black uppercase italic tracking-widest transition-all shadow-[0_20px_40px_rgba(37,99,235,0.4)] flex items-center justify-center gap-5 border-t border-white/20"
                    onClick={() => {
                      handleDeclareDefense(undefined);
                      setShowPhaseMenu(false);
                    }}
                  >
                    <Shield className="w-6 h-6" />
                    放弃防御
                  </motion.button>
                )}

                {game.phase === 'BATTLE_FREE' && (
                  <>
                    {me.isTurn && (
                      <motion.button
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-full h-18 py-5 px-10 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-3xl text-sm font-black uppercase italic tracking-widest transition-all shadow-[0_20px_40px_rgba(242,125,38,0.4)] flex items-center justify-center gap-5 border-t border-white/20"
                        onClick={() => {
                          GameService.advancePhase(gameId!, 'PROPOSE_DAMAGE_CALCULATION');
                          setShowPhaseMenu(false);
                        }}
                      >
                        <ShieldCheck className="w-6 h-6" />
                        结束战斗自由
                      </motion.button>
                    )}
                  </>
                )}

                {game.phase === 'DAMAGE_CALCULATION' && (
                  <motion.button
                    whileHover={{ scale: 1.05, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-full h-18 py-5 px-10 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white rounded-3xl text-sm font-black uppercase italic tracking-widest transition-all shadow-[0_20px_40px_rgba(220,38,38,0.4)] flex items-center justify-center gap-5 border-t border-white/20"
                    onClick={() => {
                      handleResolveDamage();
                      setShowPhaseMenu(false);
                    }}
                  >
                    <Zap className="w-6 h-6" />
                    确认结果
                  </motion.button>
                )}

                <motion.button
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-full h-18 py-5 px-10 bg-gradient-to-r from-zinc-800 to-zinc-700 hover:from-zinc-700 hover:to-zinc-600 text-white rounded-3xl text-sm font-black uppercase italic tracking-widest transition-all border border-white/10 flex items-center justify-center gap-5 shadow-2xl mt-4"
                  onClick={() => setShowPhaseMenu(false)}
                >
                  <X className="w-6 h-6" />
                  取消
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over Modal */}
      <AnimatePresence>
        {game?.gameStatus === 2 && isSpectator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full rounded-[2rem] border border-white/10 bg-zinc-950 p-8 text-center shadow-2xl">
              <Trophy className="mx-auto mb-5 h-12 w-12 text-[#f27d26]" />
              <h2 className="text-3xl font-black italic tracking-tight text-white">对局已结束</h2>
              <p className="mt-3 text-sm font-bold tracking-widest text-zinc-500">
                胜者：{game.winnerId ? game.players[game.winnerId]?.displayName || game.winnerId : '未知'}
              </p>
              <button
                onClick={() => navigate('/')}
                className="mt-8 w-full rounded-2xl bg-white px-8 py-4 text-sm font-black italic tracking-widest text-black transition-all hover:bg-zinc-200"
              >
                返回主页
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {game?.gameStatus === 2 && !isSpectator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="max-w-md w-full bg-zinc-900 border-2 border-white/10 rounded-[3rem] p-12 shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col items-center gap-8 relative overflow-hidden text-center"
            >
              {/* Premium Background Effects */}
              <div className={cn(
                "absolute -top-24 -right-24 w-48 h-48 blur-[80px] rounded-full opacity-20",
                game.winnerId === myUid ? "bg-orange-500" : "bg-blue-600"
              )} />

              <motion.div
                initial={{ rotate: -10, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", damping: 12 }}
                className={cn(
                  "w-24 h-24 rounded-3xl flex items-center justify-center shadow-2xl relative z-10",
                  game.winnerId === myUid
                    ? "bg-gradient-to-br from-orange-400 to-red-600 shadow-orange-500/40"
                    : "bg-gradient-to-br from-zinc-700 to-zinc-900 shadow-black/40"
                )}
              >
                {game.winnerId === myUid ? (
                  <Trophy className="w-12 h-12 text-white" />
                ) : (
                  <Frown className="w-12 h-12 text-zinc-400" />
                )}
              </motion.div>

              <div className="space-y-2 relative z-10">
                <h2 className={cn(
                  "text-5xl font-black italic uppercase tracking-tighter leading-none",
                  game.winnerId === myUid ? "text-orange-500" : "text-white/40"
                )}>
                  {game.winnerId === myUid ? "胜利" : "失败"}
                </h2>
                <p className="text-zinc-500 font-bold uppercase tracking-[0.3em] text-[10px]">
                  对局已结束
                </p>
              </div>

              <div className="w-full h-px bg-white/5 relative z-10" />

              <div className="space-y-4 relative z-10">
                <p className="text-zinc-400 text-sm font-medium">
                  结算原因:
                </p>
                <div className="px-6 py-3 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
                  <span className="text-white font-black italic uppercase tracking-widest text-sm">
                    {game.winReason === 'SURRENDER' && game.winnerId === myUid
                      ? '对方投降'
                      : game.winReason === 'CARD_EFFECT_SPECIAL_WIN'
                        ? `由于${game.winSourceCardName || '卡牌效果'}的效果`
                        : (winReasonMap[game.winReason || ''] || game.winReason || '未知原因')}
                  </span>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/')}
                className="w-full py-5 px-10 bg-white text-black rounded-3xl font-black uppercase italic tracking-widest transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)] flex items-center justify-center gap-4 group relative z-10 mt-4"
              >
                <Home className="w-5 h-5" />
                返回主页
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Battle Interruption Modal */}
      <AnimatePresence>
        {interruptionNotice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isPopupHidden ? 0 : 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md transition-all duration-300",
              isPopupHidden ? "pointer-events-none invisible" : "pointer-events-auto visible"
            )}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="max-w-md w-full bg-zinc-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl flex flex-col items-center gap-6 text-center relative overflow-hidden"
            >
              <button
                onClick={() => setIsPopupHidden(true)}
                className="absolute left-4 top-4 z-10 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                title="隐藏窗口以查看战场"
              >
                隐藏
              </button>
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />

              <div className="w-16 h-16 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                <Flag className="w-8 h-8 text-orange-500" />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">战斗已中止</h3>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest leading-relaxed">
                  {interruptionNotice.replace('[战斗中止] ', '')}
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setInterruptionNotice(null)}
                className="w-full py-4 bg-white text-black rounded-2xl font-black uppercase italic tracking-widest text-sm"
              >
                确认
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card Details Overlay */}
      <AnimatePresence>
        {previewCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[2600] flex flex-col items-center justify-center bg-black/95 p-4 backdrop-blur-md md:flex-row md:p-12 transition-all duration-300",
              "pointer-events-auto visible cursor-pointer"
            )}
            onClick={() => setPreviewCard(null)}
          >
            <div
              className="relative w-full max-w-5xl max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-6rem)] bg-zinc-900/50 border border-white/10 rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-2xl animate-in fade-in zoom-in duration-300 pointer-events-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Left: Card Name & Image */}
              <div className="w-full md:w-2/5 p-4 md:p-8 flex flex-col items-center">
                <h2 className="text-2xl md:text-5xl font-black italic text-white uppercase tracking-tighter mb-4 text-center md:hidden">
                  {previewCard.fullName}
                </h2>
                <div className="relative aspect-[3/4] w-full max-w-[240px] md:max-w-none rounded-2xl overflow-hidden shadow-2xl ring-2 ring-[#f27d26]/30 bg-black/40">
                  <img
                    src={previewCard.fullImageUrl || getCardImageUrl(previewCard.id, previewCard.rarity, false, previewCard.availableRarities)}
                    alt={previewCard.fullName}
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Right: Card Information */}
              <div className="flex-1 min-h-0 flex flex-col p-4 md:p-10 overflow-hidden">
                <div className="hidden md:flex justify-between items-start mb-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-[#f27d26] uppercase tracking-[0.2em]">{previewCard.id}</span>
                      <div className="h-px w-12 bg-[#f27d26]/30" />
                      <span className="text-[10px] font-black text-white/40 tracking-[0.2em]">{getCardTypeLabel(previewCard.type)}</span>
                    </div>
                    <h2 className="text-5xl font-black italic text-white uppercase tracking-tighter leading-none">
                      {previewCard.fullName}
                    </h2>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                  {/* Registry Data Section */}
                  <div className="space-y-4">
                    <h3 className="text-[11px] font-black text-white/60 uppercase tracking-[0.4em] flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                      卡牌信息
                    </h3>

                    <div className="grid gap-2">
                      {/* Type Box */}
                      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-4 md:p-5 flex items-center justify-between">
                        <span className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase tracking-widest">类型</span>
                        <span className="text-lg md:text-xl font-black italic text-orange-500">{getCardTypeLabel(previewCard.type)}</span>
                      </div>

                      {/* AC Value Box */}
                      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-4 md:p-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Shield className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
                          <span className="text-[9px] md:text-[10px] font-black text-zinc-500 tracking-widest">ACESS值</span>
                        </div>
                        <span className="text-xl md:text-2xl font-black text-white">{previewCard.acValue}</span>
                      </div>

                      {/* God Mark Box */}
                      <div className="bg-zinc-900/80 border border-white/5 rounded-2xl p-4 md:p-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Zap className={cn("w-4 h-4 md:w-5 md:h-5", previewCard.godMark ? "text-red-500" : "text-zinc-600")} />
                          <span className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase tracking-widest">神蚀标记</span>
                        </div>
                        <span className={cn("text-lg md:text-xl font-black italic uppercase", previewCard.godMark ? "text-red-500" : "text-zinc-600")}>
                          {previewCard.godMark ? '已激活' : '未激活'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid (Only for Units) */}
                  {previewCard.type === 'UNIT' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-zinc-800/40 border border-white/5 rounded-2xl p-4 flex flex-col items-center">
                        <span className="text-[9px] font-black text-zinc-500 uppercase mb-1">力量</span>
                        <span className="text-2xl md:text-3xl font-black text-blue-400">{previewCard.power}</span>
                      </div>
                      <div className="bg-zinc-800/40 border border-white/5 rounded-2xl p-4 flex flex-col items-center">
                        <span className="text-[9px] font-black text-zinc-500 uppercase mb-1">伤害</span>
                        <span className="text-2xl md:text-3xl font-black text-red-500">{previewCard.damage}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h3 className="text-[11px] font-black text-white/60 uppercase tracking-[0.4em] flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                      关键词
                    </h3>
                    <KeywordBadges card={previewCard} variant="detail" />
                  </div>

                  {/* Influencing Effects Section (Renamed and Promoted) */}
                  {previewCard.influencingEffects && previewCard.influencingEffects.length > 0 ? (
                    <div className="space-y-4 pt-4">
                      <h3 className="text-[11px] font-black text-blue-400 uppercase tracking-[0.3em] flex items-center gap-3">
                        作用于 {previewCard.fullName} 的效果
                        <div className="h-px flex-1 bg-gradient-to-r from-blue-400/20 to-transparent" />
                      </h3>
                      <div className="grid gap-3">
                        {previewCard.influencingEffects.map((item, i) => (
                          <div key={i} className="bg-blue-500/5 rounded-2xl p-4 md:p-5 border border-blue-500/10 space-y-2 group hover:bg-blue-500/10 transition-all">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] md:text-[10px] font-black px-3 py-1 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded-full italic tracking-widest uppercase">
                                效果来源：{item.sourceCardName}
                              </span>
                            </div>
                            <p className="text-white/90 text-xs md:text-sm leading-relaxed font-medium">
                              {item.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 pt-4 opacity-30 italic text-center py-10">
                      <p className="text-xs tracking-widest text-[#f27d26]">当前没有生效中的外部影响</p>
                    </div>
                  )}

                  {/* Footer: Description */}
                  {previewCard.description && (
                    <div className="pt-8 border-t border-white/5 opacity-40">
                      <p className="text-[10px] md:text-[11px] font-medium leading-relaxed italic text-zinc-400">
                        {previewCard.description}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fixed Close Button for Mobile Accessibility */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewCard(null);
              }}
              className="fixed top-4 right-4 md:top-10 md:right-10 z-[2700] p-3 md:p-4 bg-black/60 backdrop-blur-xl border border-white/20 rounded-2xl text-white shadow-2xl hover:bg-white/10 transition-all group"
            >
              <X className="w-6 h-6 md:w-10 md:h-10 group-hover:scale-110 transition-transform" />
              <span className="sr-only">关闭详情</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLogModal && game && (
          <motion.div
            key="battle-logs"
            initial={{ opacity: 0 }}
            animate={{ opacity: isPopupHidden ? 0 : 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl transition-all duration-300",
              isPopupHidden ? "pointer-events-none invisible" : "pointer-events-auto visible"
            )}
            onClick={() => setShowLogModal(false)}
          >
            <div
              className="h-[82vh] w-full max-w-2xl"
              onClick={e => e.stopPropagation()}
            >
              <BattleLogPanel
                game={game}
                variant="modal"
                onClose={() => setShowLogModal(false)}
                onSendChat={handleSendChat}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Toast Notification */}
      <AnimatePresence>
        {lastError && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[3000] pointer-events-none"
          >
            <div className="bg-zinc-950/90 backdrop-blur-xl border border-red-500/50 px-8 py-4 rounded-2xl shadow-[0_20px_50px_rgba(239,68,68,0.3)] flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.6)]">
                <X className="w-5 h-5 text-white" strokeWidth={3} />
              </div>
              <p className="text-white font-black italic uppercase tracking-widest text-sm">
                {lastError}
              </p>
              <div className="absolute inset-0 rounded-2xl bg-red-500/5 animate-pulse pointer-events-none" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <style>{`
        .battle-field .rarity-border-cu,
        .battle-field .rarity-border-r,
        .battle-field .rarity-border-sr,
        .battle-field .rarity-border-ur,
        .battle-field .rarity-border-pr,
        .battle-field .rarity-border-ser {
          border-color: rgba(255, 255, 255, 0.12) !important;
          box-shadow: none;
        }

        .battle-field .rarity-border-ser::before {
          display: none;
        }
      `}</style>
    </div >
  );
};

const winReasonMap: Record<string, string> = {
  'DECK_OUT_DRAW': '抽牌阶段卡组已空',
  'DECK_OUT_DRAW_EFFECT': '由于效果抽牌时卡组已空',
  'DECK_OUT_DAMAGE': '受到伤害时卡组卡牌不足',
  'DECK_OUT_BATTLE_DAMAGE': '受到战斗伤害时卡组卡牌不足',
  'DECK_OUT_EFFECT_DAMAGE': '受到效果伤害时卡组卡牌不足',
  'DECK_OUT_DECK_MOVE': '从卡组移动卡牌时卡组数量不足',
  'DECK_OUT_COST': '支付费用时卡组卡牌不足',
  'EROSION_BACK_FULL': '侵蚀区背面卡牌达到10张',
  'SURRENDER': '投降',
  'CARD_EFFECT_SPECIAL_WIN': '由于卡牌效果'
};
