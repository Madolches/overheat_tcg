import type { Card, DeckCardEntry, DeckCardReference } from '../types/game';

export const getDeckCardId = (entry?: unknown): string | undefined => {
  if (!entry) return undefined;
  if (typeof entry === 'string') return entry;
  if (typeof entry !== 'object') return undefined;

  const cardLike = entry as { id?: unknown; uniqueId?: unknown };
  if (typeof cardLike.uniqueId === 'string') return cardLike.uniqueId;
  return typeof cardLike.id === 'string' ? cardLike.id : undefined;
};

export const normalizeDeckCardEntry = (entry?: unknown): DeckCardEntry | null => {
  const id = getDeckCardId(entry);
  if (!id) return null;
  return {
    id,
    ...(typeof entry === 'object' && (entry as { skinEnabled?: unknown }).skinEnabled === true ? { skinEnabled: true } : {})
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
