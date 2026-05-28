import { Card } from '../types/game';

export type HighAlchemyEntryContext = {
  highAlchemyMaterialColors?: string[];
  highAlchemyMaterialCount?: number;
  onlySelfActivateSourceCardId?: string;
};

export const HIGH_ALCHEMY_LOCKED_UNIT_REQUIRED_COLORS: Record<string, string> = {
  '105000406': 'RED',
  '105000407': 'WHITE',
  '105000408': 'GREEN',
};

export const isOnlySelfActivateEntryLockedUnit = (card: Card) =>
  String(card.id) === '102070359';

export const getEntryRestrictionReason = (card: Card) => {
  if (isOnlySelfActivateEntryLockedUnit(card)) {
    return '这张卡只能通过这张卡的【启】能力进入战场';
  }
  if (getHighAlchemyLockedUnitRequiredColor(card)) {
    return '这张卡只能通过满足素材颜色与数量的《高位炼金》效果进入战场';
  }
  return undefined;
};

export const getHighAlchemyLockedUnitRequiredColor = (card: Card) =>
  HIGH_ALCHEMY_LOCKED_UNIT_REQUIRED_COLORS[String(card.id)];

export const satisfiesHighAlchemyEntryRestriction = (
  card: Card,
  context?: HighAlchemyEntryContext
) => {
  if (isOnlySelfActivateEntryLockedUnit(card)) {
    return context?.onlySelfActivateSourceCardId === card.gamecardId;
  }

  const requiredColor = getHighAlchemyLockedUnitRequiredColor(card);
  if (!requiredColor) return true;
  return Array.isArray(context?.highAlchemyMaterialColors) &&
    Number(context.highAlchemyMaterialCount || 0) >= 3 &&
    context.highAlchemyMaterialColors.includes(requiredColor);
};
