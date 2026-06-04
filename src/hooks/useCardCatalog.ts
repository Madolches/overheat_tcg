import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../types/game';
import { isCardVisibleInCatalog } from '../lib/cardCatalogFilters';

type CardCatalogMode = 'with-effects' | 'no-effects';

const CARD_CATALOG_STORAGE_KEYS: Record<CardCatalogMode, string> = {
  'with-effects': 'card_catalog_v7_with_effects',
  'no-effects': 'card_catalog_v7_no_effects'
};

const OLD_CARD_CATALOG_STORAGE_KEYS = [
  'card_catalog_v6_with_effects',
  'card_catalog_v6_no_effects',
  'card_catalog_v5_with_effects',
  'card_catalog_v5_no_effects',
  'card_catalog_v4_with_effects',
  'card_catalog_v4_no_effects',
  'card_catalog_v3_with_effects',
  'card_catalog_v3_no_effects'
];

const cachedCards = new Map<CardCatalogMode, Card[]>();
const cachedLookup = new Map<CardCatalogMode, Map<string, Card>>();
const inFlightRequests = new Map<CardCatalogMode, Promise<Card[]>>();

function buildLookup(cards: Card[]) {
  const lookup = new Map<string, Card>();

  for (const card of cards) {
    lookup.set(card.uniqueId, card);

    if (!lookup.has(card.id)) {
      lookup.set(card.id, card);
    }
  }

  return lookup;
}

function resolveMode(includeEffects: boolean) {
  return includeEffects ? 'with-effects' : 'no-effects';
}

async function fetchCardCatalog(includeEffects: boolean) {
  const mode = resolveMode(includeEffects);
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
  const res = await fetch(`${BACKEND_URL}/api/cards/meta?includeEffects=${includeEffects ? '1' : '0'}&catalogVersion=7`, {
    cache: 'no-store'
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch card catalog: ${res.status}`);
  }

  const data = await res.json();
  const cards = ((data.cards || []) as Card[]).filter(isCardVisibleInCatalog);

  cachedCards.set(mode, cards);
  cachedLookup.set(mode, buildLookup(cards));

  if (typeof window !== 'undefined') {
    try {
      OLD_CARD_CATALOG_STORAGE_KEYS.forEach(key => window.sessionStorage.removeItem(key));
      window.sessionStorage.setItem(CARD_CATALOG_STORAGE_KEYS[mode], JSON.stringify(cards));
    } catch {
      // Ignore storage quota / privacy mode failures.
    }
  }

  return cards;
}

function hydrateCardCatalogFromStorage(includeEffects: boolean) {
  const mode = resolveMode(includeEffects);

  if (cachedCards.has(mode) || typeof window === 'undefined') {
    return;
  }

  try {
    const stored = window.sessionStorage.getItem(CARD_CATALOG_STORAGE_KEYS[mode]);
    if (!stored) {
      return;
    }

    const cards = (JSON.parse(stored) as Card[]).filter(isCardVisibleInCatalog);
    cachedCards.set(mode, cards);
    cachedLookup.set(mode, buildLookup(cards));
  } catch {
    window.sessionStorage.removeItem(CARD_CATALOG_STORAGE_KEYS[mode]);
  }
}

export async function prefetchCardCatalog(options?: { includeEffects?: boolean }) {
  const includeEffects = options?.includeEffects ?? false;
  const mode = resolveMode(includeEffects);
  hydrateCardCatalogFromStorage(includeEffects);

  if (cachedCards.has(mode)) {
    return cachedCards.get(mode)!;
  }

  if (!inFlightRequests.has(mode)) {
    inFlightRequests.set(
      mode,
      fetchCardCatalog(includeEffects).finally(() => {
        inFlightRequests.delete(mode);
      })
    );
  }

  return inFlightRequests.get(mode)!;
}

export function useCardCatalog(options?: { includeEffects?: boolean; enabled?: boolean }) {
  const includeEffects = options?.includeEffects ?? false;
  const enabled = options?.enabled ?? true;
  const mode = resolveMode(includeEffects);
  hydrateCardCatalogFromStorage(includeEffects);

  const [cards, setCards] = useState<Card[]>(cachedCards.get(mode) || []);
  const [loading, setLoading] = useState(enabled && !cachedCards.has(mode));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = cachedCards.get(mode);
    if (cached) {
      setCards(cached);
      setLoading(false);
      setError(null);
      if (!enabled) {
        return;
      }

      let active = true;
      fetchCardCatalog(includeEffects)
        .then(nextCards => {
          if (active) {
            setCards(nextCards);
          }
        })
        .catch(err => {
          console.error('Failed to refresh card catalog:', err);
        });

      return () => {
        active = false;
      };
    }

    if (!enabled) {
      setCards([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    prefetchCardCatalog({ includeEffects })
      .then(nextCards => {
        if (!active) {
          return;
        }

        setCards(nextCards);
        setLoading(false);
      })
      .catch(err => {
        if (!active) {
          return;
        }

        console.error('Failed to load card catalog:', err);
        setError(err instanceof Error ? err.message : 'Failed to load card catalog');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, includeEffects, mode]);

  const cardByReference = useMemo(
    () => cachedLookup.get(mode) || buildLookup(cards),
    [cards, mode]
  );

  const getCardByReference = useCallback(
    (cardId?: string | null) => {
      if (!cardId) {
        return undefined;
      }

      return cardByReference.get(cardId);
    },
    [cardByReference]
  );

  return {
    cards,
    cardByReference,
    getCardByReference,
    loading,
    error
  };
}
