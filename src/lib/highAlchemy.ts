import { Card } from '../types/game';

export type HighAlchemyEntryContext = {
  highAlchemyMaterialColors?: string[];
  highAlchemyMaterialCount?: number;
};

export const HIGH_ALCHEMY_LOCKED_UNIT_REQUIRED_COLORS: Record<string, string> = {
  '105000406': 'RED',
  '105000407': 'WHITE',
  '105000408': 'GREEN',
};

export const getHighAlchemyLockedUnitRequiredColor = (card: Card) =>
  HIGH_ALCHEMY_LOCKED_UNIT_REQUIRED_COLORS[String(card.id)];

export const satisfiesHighAlchemyEntryRestriction = (
  card: Card,
  context?: HighAlchemyEntryContext
) => {
  const requiredColor = getHighAlchemyLockedUnitRequiredColor(card);
  if (!requiredColor) return true;
  return Array.isArray(context?.highAlchemyMaterialColors) &&
    Number(context.highAlchemyMaterialCount || 0) >= 3 &&
    context.highAlchemyMaterialColors.includes(requiredColor);
};
