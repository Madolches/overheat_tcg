import type { Card } from '../types/game';

export const ADJUSTED_SUFFIX = ':adjusted';

export type CardAdjustmentFactory = (card: Card) => Card | Card[] | null | undefined;

export const createAdjustedCardVariant = (card: Card, patch: Partial<Card>): Card => ({
  ...card,
  ...patch,
  uniqueId: patch.uniqueId || `${card.uniqueId}${ADJUSTED_SUFFIX}`,
  adjustmentGroupId: patch.adjustmentGroupId || card.adjustmentGroupId || card.id,
  adjustmentVersion: 'adjusted',
  adjustmentLabel: patch.adjustmentLabel || '调整后',
  ownershipUniqueId: patch.ownershipUniqueId || card.ownershipUniqueId || card.uniqueId
});

export const isAdjustedCard = (card: Pick<Card, 'adjustmentVersion' | 'uniqueId'> | undefined) =>
  !!card && (card.adjustmentVersion === 'adjusted' || card.uniqueId?.endsWith(ADJUSTED_SUFFIX));

export const getCardAdjustmentGroupId = (card: Pick<Card, 'adjustmentGroupId' | 'id'>) =>
  card.adjustmentGroupId || card.id;

export const getCardAdjustmentVersionKey = (card: Pick<Card, 'adjustmentVersion'>) =>
  card.adjustmentVersion || 'original';

export const getCardOwnershipKey = (card: Pick<Card, 'ownershipUniqueId' | 'uniqueId'>) =>
  card.ownershipUniqueId || card.uniqueId;

export const getCardVariantKey = (card: Pick<Card, 'adjustmentGroupId' | 'id' | 'rarity'>) =>
  `${getCardAdjustmentGroupId(card)}:${card.rarity || ''}`;

export const getOriginalCatalogRefs = (catalogRefs: string[]) =>
  catalogRefs.filter(ref => !ref.endsWith(ADJUSTED_SUFFIX));

export const buildAdjustedVariantLookup = (cards: Card[]) => {
  const variants = new Map<string, { original?: Card; adjusted?: Card }>();

  for (const card of cards) {
    const key = getCardVariantKey(card);
    const entry = variants.get(key) || {};
    if (isAdjustedCard(card)) {
      entry.adjusted = card;
    } else {
      entry.original = card;
    }
    variants.set(key, entry);
  }

  return variants;
};

export const getCounterpartAdjustedCard = (card: Card, cards: Card[]) => {
  const entry = buildAdjustedVariantLookup(cards).get(getCardVariantKey(card));
  return isAdjustedCard(card) ? entry?.original : entry?.adjusted;
};

const normalizeFactoryResult = (result: ReturnType<CardAdjustmentFactory>): Card[] => {
  if (!result) return [];
  return Array.isArray(result) ? result.filter(Boolean) : [result];
};

export const expandAdjustedCardVariants = (cards: Card[], factory?: CardAdjustmentFactory): Card[] => {
  const expanded: Card[] = [];

  for (const card of cards) {
    const adjustedCards = normalizeFactoryResult(factory?.(card));
    const original = adjustedCards.length > 0
      ? { ...card, adjustmentGroupId: card.adjustmentGroupId || card.id }
      : card;
    expanded.push(original);
    expanded.push(...adjustedCards);
  }

  return expanded;
};
