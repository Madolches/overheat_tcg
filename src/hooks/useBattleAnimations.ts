import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BattleLogEntry, Card, GameState, StackItem } from '../types/game';
import { battleLogText, normalizeBattleLogEntry } from '../lib/battleLog';
import { getCardImageUrl } from '../lib/utils';
import type { BattleAnimationEvent, BattleAnimationType } from '../components/BattleAnimationLayer';

const STORAGE_KEY = 'battleAnimationsEnabled';
const MAX_QUEUE_SIZE = 8;

export function useBattleAnimationPreference() {
  const [enabled, setEnabledState] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === null ? true : saved !== 'false';
  });

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    }
  }, []);

  return [enabled, setEnabled] as const;
}

function getCardLocations(game: GameState): Record<string, { zone: string; ownerUid: string; card: Card; slotIndex?: number }> {
  const locations: Record<string, { zone: string; ownerUid: string; card: Card; slotIndex?: number }> = {};
  if (!game?.players) return locations;

  Object.entries(game.players).forEach(([ownerUid, player]) => {
    if (!player) return;
    const zones: Array<[string, Card[]]> = [
      ['HAND', player.hand || []],
      ['DECK', player.deck || []],
      ['GRAVE', player.grave || []],
      ['EXILE', player.exile || []],
      ['PLAY', player.playZone || []],
      ['UNIT', (player.unitZone || []).filter((c): c is Card => c !== null)],
      ['ITEM', (player.itemZone || []).filter((c): c is Card => c !== null)],
      ['EROSION_FRONT', (player.erosionFront || []).filter((c): c is Card => c !== null)],
      ['EROSION_BACK', (player.erosionBack || []).filter((c): c is Card => c !== null)]
    ];

    const backCardsCount = (player.erosionBack || []).filter((c): c is Card => c !== null).length;

    zones.forEach(([zone, array]) => {
      array.forEach((card, idx) => {
        if (card && card.gamecardId) {
          let slotIndex = idx;
          if (zone === 'EROSION_FRONT') {
            slotIndex = backCardsCount + idx;
          }
          locations[card.gamecardId] = { zone, ownerUid, card, slotIndex };
        }
      });
    });
  });

  return locations;
}

function getAnchorForZone(uid: string, zone: string, slotIndex?: number): string {
  if (slotIndex !== undefined && zone === 'UNIT') {
    return `player:${uid}:unit:${slotIndex}`;
  }
  if (slotIndex !== undefined && (zone === 'EROSION_FRONT' || zone === 'EROSION_BACK')) {
    return slotIndex === 0 ? `player:${uid}:erosion` : `player:${uid}:erosion:${slotIndex}`;
  }
  
  if (zone === 'HAND') return `player:${uid}:hand`;
  if (zone === 'GRAVE') return `player:${uid}:grave`;
  if (zone === 'EXILE') return `player:${uid}:exile`;
  if (zone === 'PLAY') return `player:${uid}:play`;
  if (zone === 'DECK') return `player:${uid}:deck`;
  if (zone === 'ITEM') return `player:${uid}:item`;
  if (zone === 'UNIT') return `player:${uid}:unit-row`;
  if (zone === 'EROSION_FRONT' || zone === 'EROSION_BACK') return `player:${uid}:erosion`;
  
  return `player:${uid}:${zone.toLowerCase()}`;
}

export function useBattleAnimations(game: GameState | null, perspectiveUid?: string | null, isSpectator = false, cardBackUrl?: string) {
  const [events, setEvents] = useState<BattleAnimationEvent[]>([]);
  const seenLogIdsRef = useRef<Set<string>>(new Set());
  const previousGoddessRef = useRef<Record<string, boolean>>({});
  const previousWinnerRef = useRef<string | undefined>();
  const previousPlayZoneTopRef = useRef<Record<string, string | undefined>>({});
  const previousCardLocationsRef = useRef<Record<string, { zone: string; ownerUid: string; card: Card; slotIndex?: number }>>({});
  const seenAnimationHintsRef = useRef<Set<string>>(new Set());
  const hintedDrawCardsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const playersByName = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(game?.players || {}).forEach(player => {
      if (player.displayName) map.set(player.displayName, player.uid);
    });
    return map;
  }, [game?.players]);

  const enqueue = useCallback((nextEvents: BattleAnimationEvent[]) => {
    if (!nextEvents.length) return;
    setEvents(current => [...current, ...nextEvents].slice(-MAX_QUEUE_SIZE));
  }, []);

  const dismiss = useCallback((eventId: string) => {
    setEvents(current => current.filter(event => event.id !== eventId));
  }, []);

  useLayoutEffect(() => {
    if (!game) {
      setEvents([]);
      seenLogIdsRef.current.clear();
      previousGoddessRef.current = {};
      previousWinnerRef.current = undefined;
      previousCardLocationsRef.current = {};
      seenAnimationHintsRef.current.clear();
      hintedDrawCardsRef.current.clear();
      initializedRef.current = false;
      return;
    }

    if (!initializedRef.current) {
      (game.logs || []).forEach((log, index) => {
        const entry = normalizeBattleLogEntry(log, game, index);
        seenLogIdsRef.current.add(entry.id);
      });
      previousGoddessRef.current = Object.fromEntries(
        Object.values(game.players || {}).map(player => [player.uid, !!player.isGoddessMode])
      );
      previousPlayZoneTopRef.current = Object.fromEntries(
        Object.values(game.players || {}).map(player => [player.uid, topPlayZoneCard(player)?.gamecardId])
      );
      previousCardLocationsRef.current = getCardLocations(game);
      previousWinnerRef.current = game.winnerId;
      initializedRef.current = true;
      if (game.animationHint?.id) {
        seenAnimationHintsRef.current.add(game.animationHint.id);
        if (game.animationHint.type === 'DRAW_CARD' && game.animationHint.cardId) {
          hintedDrawCardsRef.current.add(`${game.animationHint.playerUid}:${game.animationHint.cardId}`);
        }
        if (game.animationHint.type === 'CONFRONTATION_CHAIN') {
          const chainItems = (game.counterStack || []).map((item, index) =>
            stackItemToChainAnimationItem(item, index + 1, game, perspectiveUid)
          );
          const visibleChainItems = lastChainItems(chainItems);
          if (visibleChainItems.length > 0) {
            enqueue([{
              id: `confrontation_hint_${game.animationHint.id}`,
              type: 'confrontation',
              side: 'neutral',
              title: '对抗链',
              chainLength: game.counterStack?.length || chainItems.length,
              chainItems: visibleChainItems,
              durationMs: game.animationHint.durationMs
            }]);
          }
        }
      }
      return;
    }

    const nextEvents: BattleAnimationEvent[] = [];
    if (game.animationHint?.type === 'DRAW_CARD' && !seenAnimationHintsRef.current.has(game.animationHint.id)) {
      seenAnimationHintsRef.current.add(game.animationHint.id);
      const ownerUid = game.animationHint.playerUid;
      const hintedCardId = game.animationHint.cardId;
      if (hintedCardId) {
        hintedDrawCardsRef.current.add(`${ownerUid}:${hintedCardId}`);
        const isNormalDrawPhase = game.phase === 'DRAW' && ownerUid === game.playerIds[game.currentTurnPlayer];
        const revealTo = game.animationHint.revealTo === 'all'
          ? 'all'
          : (!isSpectator && perspectiveUid && ownerUid === perspectiveUid ? 'owner' : 'hidden');
        const shouldRevealCard = revealTo !== 'hidden';
        const hintedCard = shouldRevealCard
          ? (game.animationHint.card || findCardByGamecardId(game, hintedCardId))
          : undefined;
        console.log('[BattleAnimationHint] enqueue draw animation', {
          hintId: game.animationHint.id,
          phase: game.phase,
          ownerUid,
          revealTo,
          hasCard: !!hintedCard
        });
        nextEvents.push({
          id: `card_draw_hint_${game.animationHint.id}`,
          type: 'card-draw',
          side: sideForUid(ownerUid, perspectiveUid, game),
          title: game.animationHint.revealTo === 'all' && !isNormalDrawPhase ? '卡组加入手牌' : '抽牌',
          cardName: hintedCard?.fullName || '抽到的卡',
          cardImageUrl: hintedCard ? getCardPreviewImage(hintedCard) : undefined,
          sourceCardId: hintedCardId,
          playerUid: ownerUid,
          sourceAnchor: getAnchorForZone(ownerUid, 'DECK'),
          targetAnchor: getAnchorForZone(ownerUid, 'HAND'),
          targetZone: 'HAND',
          revealTo,
          cardBackUrl
        });
      }
    }
    if (game.animationHint?.type === 'CONFRONTATION_CHAIN' && !seenAnimationHintsRef.current.has(game.animationHint.id)) {
      seenAnimationHintsRef.current.add(game.animationHint.id);
      const counterLength = game.counterStack?.length || 0;
      const chainItems = (game.counterStack || []).map((item, index) =>
        stackItemToChainAnimationItem(item, index + 1, game, perspectiveUid)
      );
      const visibleChainItems = lastChainItems(chainItems);
      if (counterLength > 0 && visibleChainItems.length > 0) {
        nextEvents.push({
          id: `confrontation_hint_${game.animationHint.id}`,
          type: 'confrontation',
          side: 'neutral',
          title: '对抗链',
          chainLength: counterLength,
          chainItems: visibleChainItems,
          durationMs: game.animationHint.durationMs
        });
      }
    }
    let isPaymentFeeState = false;
    (game.logs || []).forEach((log, index) => {
      const entry = normalizeBattleLogEntry(log, game, index);
      if (seenLogIdsRef.current.has(entry.id)) return;
      seenLogIdsRef.current.add(entry.id);

      const text = entry.text || '';
      if (/费用|作为费用|支付/.test(text)) {
        isPaymentFeeState = true;
      }

      const event = animationFromLog(entry, game, perspectiveUid, playersByName);
      if (event) nextEvents.push(event);
    });

    // Detect and trigger card movement animations
    const nextCardLocations = getCardLocations(game);

    Object.entries(nextCardLocations).forEach(([gamecardId, currentLoc]) => {
      const prevLoc = previousCardLocationsRef.current[gamecardId];
      if (prevLoc && prevLoc.zone !== currentLoc.zone) {
        const sourceZone = prevLoc.zone;
        const targetZone = currentLoc.zone;

        // Skip if this card's animation is already queued in nextEvents (e.g. by log or top played card)
        const isAlreadyQueued = nextEvents.some(event =>
          event.type === 'card-played' &&
          (event.sourceCardId === gamecardId || event.id.includes(gamecardId))
        );
        if (isAlreadyQueued) return;

        const isFromPlay = sourceZone === 'PLAY';
        const isFromErosion = sourceZone === 'EROSION_FRONT' || sourceZone === 'EROSION_BACK';
        const isFromGrave = sourceZone === 'GRAVE';
        const isFromExile = sourceZone === 'EXILE';
        const isFromHand = sourceZone === 'HAND';
        const isFromDeck = sourceZone === 'DECK';
        const isStoryLeavingPlay = isFromPlay && (targetZone === 'GRAVE' || targetZone === 'EXILE');
        const isToBattlefield = targetZone === 'UNIT' || targetZone === 'ITEM' || targetZone === 'PLAY';
        const shouldAnimateCardMove = isToBattlefield || isStoryLeavingPlay;

        // Exclusions:
        // a. Payment fees (only apply if the card is NOT entering the battlefield)
        if (isPaymentFeeState && !shouldAnimateCardMove) return;

        // c. Cards sent from the erosion zone to the cemetery during the erosion phase
        const isErosionPhaseGraveMove = game.phase === 'EROSION' && (sourceZone === 'EROSION_FRONT' || sourceZone === 'EROSION_BACK') && targetZone === 'GRAVE';
        if (isErosionPhaseGraveMove) return;

        // d. Addition to hand from Play, Erosion, Grave, Exile (which are non-DECK additions)
        if (targetZone === 'HAND' && sourceZone !== 'DECK') return;

        // Bug 2: Only animate cards entering battlefield
        if (shouldAnimateCardMove) {
          let moveTitle = '卡牌移动';
          if (isFromPlay) moveTitle = '打出区移动';
          else if (isFromErosion) moveTitle = '侵蚀区移动';
          else if (isFromGrave) moveTitle = '墓地移动';
          else if (isFromExile) moveTitle = '放逐区移动';
          else if (isFromHand) moveTitle = '手牌移动';
          else if (isFromDeck) moveTitle = '牌组移动';

          nextEvents.push({
            id: `card_move_${gamecardId}_${sourceZone}_${targetZone}_${Date.now()}_${Math.random()}`,
            type: 'card-played',
            side: sideForUid(currentLoc.ownerUid, perspectiveUid, game),
            title: moveTitle,
            cardName: currentLoc.card.fullName,
            cardImageUrl: getCardPreviewImage(currentLoc.card),
            sourceCardId: gamecardId,
            cardType: currentLoc.card.type,
            rarity: currentLoc.card.rarity,
            playerUid: currentLoc.ownerUid,
            sourceAnchor: getAnchorForZone(prevLoc.ownerUid, prevLoc.zone, prevLoc.slotIndex),
            targetAnchor: getAnchorForZone(currentLoc.ownerUid, currentLoc.zone, currentLoc.slotIndex)
          });
        }
        // Bug 3: Erosion Flip
        else if (isFromDeck && (targetZone === 'EROSION_FRONT' || targetZone === 'EROSION_BACK')) {
          nextEvents.push({
            id: `erosion_flip_${gamecardId}_${Date.now()}_${Math.random()}`,
            type: 'erosion-flip',
            side: sideForUid(currentLoc.ownerUid, perspectiveUid, game),
            title: '侵蚀翻牌',
            cardName: currentLoc.card.fullName,
            cardImageUrl: getCardPreviewImage(currentLoc.card),
            sourceCardId: gamecardId,
            playerUid: currentLoc.ownerUid,
            sourceAnchor: getAnchorForZone(prevLoc.ownerUid, prevLoc.zone, prevLoc.slotIndex),
            targetAnchor: getAnchorForZone(currentLoc.ownerUid, currentLoc.zone, currentLoc.slotIndex),
            targetZone
          });
        }
        // Bug 5: Card Draw
        else if (isFromDeck && targetZone === 'HAND') {
          if (game.phase === 'MULLIGAN') return;
          const hintedDrawKey = `${currentLoc.ownerUid}:${gamecardId}`;
          if (hintedDrawCardsRef.current.has(hintedDrawKey)) {
            hintedDrawCardsRef.current.delete(hintedDrawKey);
            return;
          }
          if (game.animationHint?.type === 'DRAW_CARD' && game.animationHint.cardId === gamecardId) return;
          const revealTo = !isSpectator && perspectiveUid && currentLoc.ownerUid === perspectiveUid ? 'owner' : 'hidden';
          const shouldRevealCard = revealTo !== 'hidden';
          nextEvents.push({
            id: `card_draw_${gamecardId}_${Date.now()}_${Math.random()}`,
            type: 'card-draw',
            side: sideForUid(currentLoc.ownerUid, perspectiveUid, game),
            title: '抽牌',
            cardName: shouldRevealCard ? currentLoc.card.fullName : '抽到的卡',
            cardImageUrl: shouldRevealCard ? getCardPreviewImage(currentLoc.card) : undefined,
            sourceCardId: gamecardId,
            playerUid: currentLoc.ownerUid,
            sourceAnchor: getAnchorForZone(prevLoc.ownerUid, prevLoc.zone, prevLoc.slotIndex),
            targetAnchor: getAnchorForZone(currentLoc.ownerUid, currentLoc.zone, currentLoc.slotIndex),
            targetZone,
            revealTo,
            cardBackUrl
          });
        }
      }
    });
    previousCardLocationsRef.current = nextCardLocations;

    Object.values(game.players || {}).forEach(player => {
      const topPlayedCard = topPlayZoneCard(player);
      const previousTopPlayedId = previousPlayZoneTopRef.current[player.uid];
      if (topPlayedCard?.gamecardId && topPlayedCard.gamecardId !== previousTopPlayedId) {
        const logAlreadyQueued = nextEvents.some(event =>
          event.type === 'card-played' &&
          (event.cardName === topPlayedCard.fullName || event.id.includes(topPlayedCard.gamecardId))
        );
        if (!logAlreadyQueued) {
          nextEvents.push({
            id: `play_zone_${player.uid}_${topPlayedCard.gamecardId}_${Date.now()}`,
            type: 'card-played',
            side: sideForUid(player.uid, perspectiveUid, game),
            title: '打出卡牌',
            cardName: topPlayedCard.fullName,
            cardImageUrl: getCardPreviewImage(topPlayedCard),
            sourceCardId: topPlayedCard.gamecardId,
            cardType: topPlayedCard.type,
            rarity: topPlayedCard.rarity,
            playerUid: player.uid,
            sourceAnchor: anchor(player.uid, 'hand'),
            targetAnchor: anchor(player.uid, 'play')
          });
        }
      }
      previousPlayZoneTopRef.current[player.uid] = topPlayedCard?.gamecardId;

      const wasGoddess = previousGoddessRef.current[player.uid] || false;
      const isGoddess = !!player.isGoddessMode;
      if (!wasGoddess && isGoddess) {
        nextEvents.push({
          id: `goddess_state_${player.uid}_${Date.now()}`,
          type: 'goddess',
          side: sideForUid(player.uid, perspectiveUid, game),
          title: '女神化',
          subtitle: `${player.displayName} 进入女神化状态`
        });
      }
      previousGoddessRef.current[player.uid] = isGoddess;
    });

    if (!previousWinnerRef.current && game.winnerId) {
      const winnerName = game.players[game.winnerId]?.displayName || '胜者';
      const isMine = perspectiveUid && game.winnerId === perspectiveUid;
      nextEvents.push({
        id: `defeat_${game.winnerId}_${Date.now()}`,
        type: 'defeat',
        side: isMine ? 'player' : 'opponent',
        title: isMine ? '胜利' : '战败',
        subtitle: `${winnerName} 获得胜利`
      });
    }
    previousWinnerRef.current = game.winnerId;

    enqueue(nextEvents);
  }, [enqueue, game, perspectiveUid, playersByName, isSpectator, cardBackUrl]);

  return { events, dismiss };
}

function animationFromLog(
  log: BattleLogEntry,
  game: GameState,
  perspectiveUid: string | null | undefined,
  playersByName: Map<string, string>
): BattleAnimationEvent | null {
  const text = battleLogText(log);
  const actorUid = log.actorUid || uidFromText(text, playersByName);
  const side = sideForUid(actorUid, perspectiveUid, game);
  const sourceCard = log.sourceCard;
  const sourceCardName = sourceCard?.name || parseBracketName(text);
  const sourceCardId = sourceCard?.gamecardId;
  const sourceCardDetails = findCardByLogRef(game, sourceCardId, sourceCard?.cardId, sourceCardName);
  const imageUrl = sourceCardDetails ? getCardPreviewImage(sourceCardDetails) : sourceCard?.cardId ? getCardImageUrl(sourceCard.cardId, 'C', false) : undefined;

  if (log.category === 'CARD_PLAYED' || text.includes('打出了')) {
    return buildEvent(log, 'card-played', side, '打出卡牌', {
      cardName: sourceCardName,
      cardImageUrl: imageUrl,
      sourceCardId,
      cardType: sourceCardDetails?.type,
      rarity: sourceCardDetails?.rarity,
      playerUid: actorUid,
      sourceAnchor: actorUid ? anchor(actorUid, 'hand') : undefined,
      targetAnchor: actorUid ? anchor(actorUid, 'play') : undefined
    });
  }

  if (log.category === 'CONFRONTATION' || text.startsWith('link') || text.includes('对抗')) {
    return null;
  }

  if (text.includes('宣告了攻击') || text.includes('[攻击宣言]')) {
    return buildEvent(log, 'attack', side, '攻击宣言', {
      subtitle: compactText(text),
      cardName: sourceCardName,
      cardImageUrl: imageUrl
    });
  }

  if (log.category === 'DAMAGE' || text.includes('受到了')) {
    const damagedUid =
      String(log.metadata?.defenderId || '') ||
      uidFromText(text, playersByName);
    return buildEvent(log, 'damage', sideForUid(damagedUid || actorUid, perspectiveUid, game), '受到伤害', {
      amount: parseDamageAmount(text, log.metadata),
      subtitle: compactText(text),
      playerUid: damagedUid || actorUid,
      sourceAnchor: damagedUid || actorUid ? anchor(damagedUid || actorUid, 'deck') : undefined,
      targetAnchor: damagedUid || actorUid ? anchor(damagedUid || actorUid, 'erosion') : undefined
    });
  }

  if (text.includes('进入女神化状态')) {
    const goddessUid = actorUid || uidFromText(text, playersByName);
    return buildEvent(log, 'goddess', sideForUid(goddessUid, perspectiveUid, game), '女神化', {
      subtitle: compactText(text)
    });
  }

  if (text.startsWith('[游戏结束]') || text.startsWith('[对局结束]')) {
    return buildEvent(log, 'defeat', 'neutral', game.winnerId === perspectiveUid ? '胜利' : '战败', {
      subtitle: compactText(text)
    });
  }

  return null;
}

function buildEvent(
  log: BattleLogEntry,
  type: BattleAnimationType,
  side: BattleAnimationEvent['side'],
  title: string,
  extra: Partial<BattleAnimationEvent> = {}
): BattleAnimationEvent {
  return {
    id: `battle_animation_${log.id}_${type}`,
    type,
    side,
    title,
    ...extra
  };
}

function topPlayZoneCard(player?: GameState['players'][string]) {
  const playZone = player?.playZone || [];
  return playZone.length > 0 ? playZone[playZone.length - 1] : undefined;
}

function getCardPreviewImage(card: Card) {
  return card.fullImageUrl || card.imageUrl || getCardImageUrl(card.id, card.rarity, false, card.availableRarities);
}

function anchor(uid: string, zone: string) {
  return `player:${uid}:${zone}`;
}

function findCardByLogRef(game: GameState, gamecardId?: string, cardId?: string, cardName?: string) {
  const candidates: Card[] = [];
  Object.values(game.players || {}).forEach(player => {
    candidates.push(
      ...(player.hand || []),
      ...(player.deck || []),
      ...(player.grave || []),
      ...(player.exile || []),
      ...(player.playZone || []),
      ...((player.itemZone || []).filter(Boolean) as Card[]),
      ...((player.unitZone || []).filter(Boolean) as Card[]),
      ...((player.erosionFront || []).filter(Boolean) as Card[]),
      ...((player.erosionBack || []).filter(Boolean) as Card[])
    );
  });
  candidates.push(...((game.counterStack || []).map(item => item.card).filter(Boolean) as Card[]));
  if (game.currentProcessingItem?.card) candidates.push(game.currentProcessingItem.card);

  return candidates.find(card => gamecardId && card.gamecardId === gamecardId) ||
    candidates.find(card => cardId && card.id === cardId) ||
    candidates.find(card => cardName && card.fullName === cardName);
}

function findCardByGamecardId(game: GameState, gamecardId?: string) {
  if (!gamecardId) return undefined;
  return findCardByLogRef(game, gamecardId);
}

function stackItemToChainAnimationItem(
  item: StackItem,
  linkNumber: number,
  game: GameState,
  perspectiveUid: string | null | undefined
): NonNullable<BattleAnimationEvent['chainItems']>[number] {
  const side = sideForUid(item.ownerUid, perspectiveUid, game);
  const phaseTitle = phaseEndTitle(item);
  const title = item.card?.fullName || phaseTitle || (item.type === 'ATTACK' ? '攻击宣言' : '回合结束');
  const subtitle = item.type === 'PLAY'
    ? '打出卡牌'
    : item.type === 'EFFECT'
      ? '发动效果'
      : item.type === 'ATTACK'
        ? '宣言攻击'
        : phaseTitle || '回合结束';

  return {
    linkNumber,
    side,
    type: item.type,
    title,
    subtitle,
    cardName: item.card?.fullName,
    cardImageUrl: item.card ? getCardPreviewImage(item.card) : undefined,
    sourceCardId: item.card?.gamecardId
  };
}

function phaseEndTitle(item: StackItem) {
  if (item.type !== 'PHASE_END') return undefined;
  if (item.nextPhase === 'DAMAGE_CALCULATION') return '战斗自由阶段结束';
  if (item.nextPhase === 'BATTLE_DECLARATION' || item.nextPhase === 'DISCARD') return '宣言结束主要阶段';
  return '回合结束';
}

function lastChainItems<T>(items: T[], count = 3) {
  return items.slice(Math.max(0, items.length - count));
}

function sideForUid(uid: string | null | undefined, perspectiveUid: string | null | undefined, game: GameState): BattleAnimationEvent['side'] {
  if (!uid) return 'neutral';
  if (perspectiveUid && uid === perspectiveUid) return 'player';
  if (game.players?.[uid]) return 'opponent';
  return 'neutral';
}

function uidFromText(text: string, playersByName: Map<string, string>) {
  for (const [name, uid] of playersByName) {
    if (text.includes(name)) return uid;
  }
  return undefined;
}

function parseDamageAmount(text: string, metadata?: Record<string, any>) {
  const fromMetadata = Number(metadata?.damage || metadata?.amount);
  if (Number.isFinite(fromMetadata) && fromMetadata > 0) return fromMetadata;
  const match = text.match(/(\d+)\s*点/);
  return match ? Number(match[1]) : undefined;
}

function parseBracketName(text: string) {
  return text.match(/[［\[]([^［\]\[\]]+)[\]］]/)?.[1];
}

function compactText(text: string) {
  return text.replace(/\s+/g, ' ').slice(0, 64);
}
