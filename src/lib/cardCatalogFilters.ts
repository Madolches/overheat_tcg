import type { Card, CardType } from '../types/game';

export const SEARCHABLE_CARD_PACKAGES = [
  'BT01',
  'BT02',
  'BT03',
  'BT04',
  'BT05',
  'BT06',
  'BT07',
  'BT08',
  'SP01',
  'SP02',
  'SP03',
  'PR'
] as const;
export type SearchableCardPackage = typeof SEARCHABLE_CARD_PACKAGES[number];
export type CardTypeFilter = 'ALL' | CardType;

const isSupportedSpCardPackageToken = (token: string) =>
  ['SP01', 'SP02', 'SP03'].some(cardPackage => token.startsWith(cardPackage));

export const tokenizeCardPackage = (value?: string | null) =>
  (value || '')
    .toUpperCase()
    .replace(/[，、]/g, ',')
    .split(/[,\s|/]+/)
    .map(token => token.trim())
    .filter(Boolean);

export const getBtPackageNumbers = (cardPackage?: string | null) =>
  tokenizeCardPackage(cardPackage)
    .map(token => token.match(/^BT(\d+)/)?.[1])
    .filter((value): value is string => !!value)
    .map(value => Number(value))
    .filter(value => Number.isFinite(value));

export const isCardVisibleInCatalog = (card: Pick<Card, 'cardPackage'>) => {
  const tokens = tokenizeCardPackage(card.cardPackage);
  return !tokens.some(token => /^SP\d+/.test(token) && !isSupportedSpCardPackageToken(token));
};

export const matchesCardPackageFilter = (cardPackage: string | undefined, selectedPackage: string) => {
  if (!selectedPackage || selectedPackage === 'ALL') {
    return true;
  }

  return tokenizeCardPackage(cardPackage).some(token => token.startsWith(selectedPackage));
};

export const matchesCardTypeFilter = (card: Pick<Card, 'type'>, selectedType: string) =>
  selectedType === 'ALL' || card.type === selectedType;
