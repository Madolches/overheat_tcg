import { Card, CardColor, GameState, PlayerState } from '../types/game';

export const FIVE_COLORS: CardColor[] = ['RED', 'WHITE', 'YELLOW', 'BLUE', 'GREEN'];

export const hasRainbowHarmonizer = (player?: PlayerState | null) =>
  !!player?.unitZone.some(unit =>
    !!unit &&
    String(unit.id) === '105000503' &&
    unit.cardlocation === 'UNIT'
  );

export const isSingleFlexibleColorProvider = (card?: Card | null) =>
  !!card &&
  (
    String(card.id) === '105000481' ||
    !!card.effects?.some(effect => effect.id === '105000481_omni')
  );

export const getEffectiveColors = (
  card?: Card | null,
  context?: { player?: PlayerState | null; gameState?: GameState | null }
) => {
  const colors = new Set<CardColor>();
  if (!card) return colors;

  if (card.color && card.color !== 'NONE') colors.add(card.color);

  [
    ...((card as any).temporaryExtraColors || []),
    ...((card as any).persistentExtraColors || []),
  ].forEach(color => {
    if (typeof color === 'string' && color !== 'NONE') colors.add(color as CardColor);
  });

  const rainbowApplies =
    !!card.feijingMark &&
    (card.cardlocation === 'UNIT' || card.cardlocation === 'HAND') &&
    hasRainbowHarmonizer(context?.player);

  if (isSingleFlexibleColorProvider(card) || rainbowApplies) {
    FIVE_COLORS.forEach(color => colors.add(color));
  }

  return colors;
};

export const cardHasEffectiveColor = (
  card: Card | null | undefined,
  color?: string,
  context?: { player?: PlayerState | null; gameState?: GameState | null }
) => {
  if (!color || color === 'NONE') return true;
  return getEffectiveColors(card, context).has(color as CardColor);
};

export const getColorRequirementResult = (
  player: PlayerState,
  req: Record<string, number> = {},
  gameState?: GameState | null
) => {
  const availableColors: Record<string, number> = { RED: 0, WHITE: 0, YELLOW: 0, BLUE: 0, GREEN: 0, NONE: 0 };
  let omniColorCount = 0;

  player.unitZone.forEach(card => {
    if (!card) return;
    if (isSingleFlexibleColorProvider(card)) {
      omniColorCount += 1;
      return;
    }
    getEffectiveColors(card, { player, gameState }).forEach(color => {
      availableColors[color] = (availableColors[color] || 0) + 1;
    });
  });

  let totalDeficit = 0;
  for (const [color, reqCount] of Object.entries(req)) {
    totalDeficit += Math.max(0, Number(reqCount || 0) - (availableColors[color] || 0));
  }

  return { valid: totalDeficit <= omniColorCount, totalDeficit, omniColorCount, availableColors };
};
