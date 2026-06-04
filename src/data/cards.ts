/// <reference types="vite/client" />
import { Card } from '../types/game';
import { CardAdjustmentFactory, expandAdjustedCardVariants } from '../lib/cardAdjustments';

// Dynamically load all card scripts from the scripts directory
const cardModules = import.meta.glob('../scripts/*.ts', { eager: true });

const isCardModule = (module: any): module is { default: Card } =>
  !!module?.default &&
  typeof module.default === 'object' &&
  typeof module.default.id === 'string';

const getAdjustmentFactory = (module: any): CardAdjustmentFactory | undefined =>
  typeof module?.createAdjustedCards === 'function' ? module.createAdjustedCards : undefined;

const BASE_CARD_LIBRARY: Card[] = Object.values(cardModules).flatMap((module: any): Card[] => {
  if (!isCardModule(module)) {
    return [];
  }

  const baseCard = module.default;
  const factory = getAdjustmentFactory(module);
  const variants = baseCard.availableRarities && baseCard.availableRarities.length > 0
    ? baseCard.availableRarities.map((r: any) => ({
      ...baseCard,
      rarity: r,
      uniqueId: `${baseCard.id}:${r}`
    }))
    : [{
    ...baseCard,
    uniqueId: `${baseCard.id}:${baseCard.rarity}`
  }];

  return expandAdjustedCardVariants(variants, factory);
});

export const CARD_LIBRARY: Card[] = BASE_CARD_LIBRARY;

export const CARD_BY_UNIQUE_ID = new Map<string, Card>();
const CARD_BY_REFERENCE = new Map<string, Card>();

for (const card of CARD_LIBRARY) {
  CARD_BY_UNIQUE_ID.set(card.uniqueId, card);

  if (!CARD_BY_REFERENCE.has(card.uniqueId)) {
    CARD_BY_REFERENCE.set(card.uniqueId, card);
  }

  if (!CARD_BY_REFERENCE.has(card.id)) {
    CARD_BY_REFERENCE.set(card.id, card);
  }
}

export function getCardByReference(cardId?: string | null) {
  if (!cardId) {
    return undefined;
  }

  return CARD_BY_REFERENCE.get(cardId);
}
