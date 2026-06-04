import fs from 'fs';
import path from 'path';
import { Card } from '../src/types/game';
import { bundledCardModules } from './generated/card_manifest';
import { CardAdjustmentFactory, expandAdjustedCardVariants } from '../src/lib/cardAdjustments';

const SCRIPTS_DIR = path.join(process.cwd(), 'src', 'scripts');

const isCardModule = (cardModule: any): cardModule is { default: Card } =>
  !!cardModule?.default &&
  typeof cardModule.default === 'object' &&
  typeof cardModule.default.id === 'string';

const getAdjustmentFactory = (cardModule: any): CardAdjustmentFactory | undefined =>
  typeof cardModule?.createAdjustedCards === 'function' ? cardModule.createAdjustedCards : undefined;

const expandCardModuleVariations = (cardModule: any): Card[] => {
  if (!isCardModule(cardModule)) {
    return [];
  }

  const baseCard = cardModule.default;
  const cards = baseCard.availableRarities && baseCard.availableRarities.length > 0
    ? baseCard.availableRarities.map((r: any) => ({
        ...baseCard,
        rarity: r,
        uniqueId: `${baseCard.id}:${r}`
      }))
    : [{
        ...baseCard,
        uniqueId: `${baseCard.id}:${baseCard.rarity}`
      }];

  return expandAdjustedCardVariants(cards, getAdjustmentFactory(cardModule));
};

export async function loadServerCards(): Promise<Card[]> {
  const cards: Card[] = [];
  if (bundledCardModules.length > 0) {
    for (const cardModule of bundledCardModules) {
      cards.push(...expandCardModuleVariations(cardModule));
    }
    return cards;
  }

  const files = fs.readdirSync(SCRIPTS_DIR);
  
  for (const file of files) {
    if (file.endsWith('.ts')) {
      const cardModule = await import(`../src/scripts/${file}`);
      cards.push(...expandCardModuleVariations(cardModule));
    }
  }
  return cards;
}

// Map by unique ID for fast lookup
export let SERVER_CARD_LIBRARY: Record<string, Card> = {};

export async function initServerCardLibrary() {
  const cards = await loadServerCards();
  for (const c of cards) {
    SERVER_CARD_LIBRARY[c.uniqueId] = c;
    // Map by base ID as well if it doesn't exist yet (for legacy compat)
    if (!SERVER_CARD_LIBRARY[c.id]) {
      SERVER_CARD_LIBRARY[c.id] = c;
    }
  }
  console.log(`[Server] Loaded ${cards.length} card variations into library.`);
}
