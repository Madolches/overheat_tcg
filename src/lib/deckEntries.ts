import type { Card, DeckCardEntry, DeckCardReference } from '../types/game';

export const getDeckCardId = (entry?: DeckCardReference | null): string | undefined => {
  if (!entry) return undefined;
  if (typeof entry === 'string') return entry;
  return typeof entry.id === 'string' ? entry.id : undefined;
};

export const normalizeDeckCardEntry = (entry?: DeckCardReference | null): DeckCardEntry | null => {
  const id = getDeckCardId(entry);
  if (!id) return null;
  return {
    id,
    ...(typeof entry === 'object' && entry.skinEnabled === true ? { skinEnabled: true } : {})
  };
};

export const normalizeDeckCardEntries = (entries: unknown = []): DeckCardEntry[] => {
  const source = Array.isArray(entries) ? entries : [];
  return source
    .map(entry => normalizeDeckCardEntry(entry))
    .filter((entry): entry is DeckCardEntry => !!entry);
};

export const getDeckCardIds = (entries: unknown = []): string[] =>
  normalizeDeckCardEntries(entries).map(entry => entry.id);

export const applyDeckEntrySkin = <T extends Card>(card: T, entry?: DeckCardReference | null): T => {
  const skinEnabled = typeof entry === 'object' && entry?.skinEnabled === true;
  return {
    ...card,
    skinEnabled
  };
};
