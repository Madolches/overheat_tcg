import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BattleLogEntry, Card, GameState } from '../types/game';
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

export function useBattleAnimations(game: GameState | null, perspectiveUid?: string | null) {
  const [events, setEvents] = useState<BattleAnimationEvent[]>([]);
  const seenLogIdsRef = useRef<Set<string>>(new Set());
  const previousGoddessRef = useRef<Record<string, boolean>>({});
  const previousWinnerRef = useRef<string | undefined>();
  const previousPlayZoneTopRef = useRef<Record<string, string | undefined>>({});
  const previousProcessingKeyRef = useRef<string | undefined>();
  const previousCounterLengthRef = useRef(0);
  const previousResolvingStackRef = useRef(false);
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

  useEffect(() => {
    if (!game) {
      setEvents([]);
      seenLogIdsRef.current.clear();
      previousGoddessRef.current = {};
      previousWinnerRef.current = undefined;
      previousCounterLengthRef.current = 0;
      previousResolvingStackRef.current = false;
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
      previousWinnerRef.current = game.winnerId;
      previousProcessingKeyRef.current = processingItemKey(game);
      previousCounterLengthRef.current = game.counterStack?.length || 0;
      previousResolvingStackRef.current = !!game.isResolvingStack;
      initializedRef.current = true;
      return;
    }

    const nextEvents: BattleAnimationEvent[] = [];
    (game.logs || []).forEach((log, index) => {
      const entry = normalizeBattleLogEntry(log, game, index);
      if (seenLogIdsRef.current.has(entry.id)) return;
      seenLogIdsRef.current.add(entry.id);
      const event = animationFromLog(entry, game, perspectiveUid, playersByName);
      if (event) nextEvents.push(event);
    });

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
            targetAnchor: targetAnchorForCard(player.uid, topPlayedCard)
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

    const currentProcessingKey = processingItemKey(game);
    if (currentProcessingKey && currentProcessingKey !== previousProcessingKeyRef.current) {
      const item = game.currentProcessingItem;
      nextEvents.push({
        id: `resolving_${currentProcessingKey}_${Date.now()}`,
        type: 'resolving',
        side: sideForUid(item?.ownerUid, perspectiveUid, game),
        title: '效果结算',
        subtitle: item?.type === 'PHASE_END'
          ? '阶段请求'
          : item?.type === 'ATTACK'
            ? '攻击宣言'
            : '连锁处理中',
        cardName: item?.card?.fullName,
        cardImageUrl: item?.card ? getCardPreviewImage(item.card) : undefined,
        sourceCardId: item?.card?.gamecardId
      });
    }
    previousProcessingKeyRef.current = currentProcessingKey;

    const counterLength = game.counterStack?.length || 0;
    const startedLongChain = previousCounterLengthRef.current <= 1 && counterLength > 1;
    const startedResolvingLongChain = !previousResolvingStackRef.current && !!game.isResolvingStack && counterLength > 1;
    if (startedLongChain || startedResolvingLongChain) {
      nextEvents.push({
        id: `confrontation_chain_${counterLength}_${game.counterStack?.[counterLength - 1]?.timestamp || Date.now()}_${startedResolvingLongChain ? 'resolve' : 'build'}`,
        type: 'confrontation',
        side: 'neutral',
        title: startedResolvingLongChain ? '对抗结算' : '对抗连锁',
        subtitle: `L1-L${counterLength}`,
        chainLength: counterLength
      });
    }
    previousCounterLengthRef.current = counterLength;
    previousResolvingStackRef.current = !!game.isResolvingStack;

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
  }, [enqueue, game, perspectiveUid, playersByName]);

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
      targetAnchor: actorUid && sourceCardDetails ? targetAnchorForCard(actorUid, sourceCardDetails) : actorUid ? anchor(actorUid, 'play') : undefined
    });
  }

  if (log.category === 'CONFRONTATION' || text.startsWith('link') || text.includes('对抗')) {
    return null;
  }

  if (text.includes('宣告了攻击') || text.includes('[攻击宣言]')) {
    return buildEvent(log, 'attack', side, '攻击宣言', {
      subtitle: compactText(text),
      cardName: sourceCardName
    });
  }

  if (log.category === 'DAMAGE' || text.includes('受到了') || text.includes('造成了')) {
    const damagedUid =
      String(log.metadata?.defenderId || '') ||
      uidFromText(text.match(/对\s+(.+?)\s+造成了/)?.[1] || '', playersByName) ||
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

function targetAnchorForCard(uid: string, card: Card) {
  if (card.type === 'UNIT') return anchor(uid, 'unit-row');
  if (card.type === 'ITEM') return anchor(uid, 'item');
  return anchor(uid, 'play');
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

function processingItemKey(game: GameState) {
  const item = game.currentProcessingItem;
  if (!item) return undefined;
  return [
    item.timestamp,
    item.type,
    item.ownerUid,
    item.card?.gamecardId,
    item.effectIndex,
    item.attackerIds?.join(',')
  ].filter(value => value !== undefined && value !== null).join('_');
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
