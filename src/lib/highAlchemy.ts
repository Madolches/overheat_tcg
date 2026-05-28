import { Card } from '../types/game';

export type HighAlchemyEntryContext = {
  highAlchemyMaterialColors?: string[];
  highAlchemyMaterialCount?: number;
  allowedByOwnEntryAbilityCardId?: string;
};

export const HIGH_ALCHEMY_LOCKED_UNIT_REQUIRED_COLORS: Record<string, string> = {
  '105000406': 'RED',
  '105000407': 'WHITE',
  '105000408': 'GREEN',
};

const OWN_ENTRY_ABILITY_LOCKED_UNIT_IDS = new Set(['102070359']);

export const getHighAlchemyLockedUnitRequiredColor = (card: Card) =>
  HIGH_ALCHEMY_LOCKED_UNIT_REQUIRED_COLORS[String(card.id)];

export const getEntryRestrictionMessage = (card: Card) =>
  OWN_ENTRY_ABILITY_LOCKED_UNIT_IDS.has(String(card.id))
    ? '这张卡只能通过自身的【启】能力进入战场。'
    : '这张卡只能通过满足素材颜色与数量的《高位炼金》效果进入战场。';

export const satisfiesHighAlchemyEntryRestriction = (
  card: Card,
  context?: HighAlchemyEntryContext
) => {
  if (
    OWN_ENTRY_ABILITY_LOCKED_UNIT_IDS.has(String(card.id)) &&
    context?.allowedByOwnEntryAbilityCardId !== String(card.id)
  ) {
    return false;
  }

  const requiredColor = getHighAlchemyLockedUnitRequiredColor(card);
  if (!requiredColor) return true;
  return Array.isArray(context?.highAlchemyMaterialColors) &&
    Number(context.highAlchemyMaterialCount || 0) >= 3 &&
    context.highAlchemyMaterialColors.includes(requiredColor);
};
