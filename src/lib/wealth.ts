import type { Card, CardEffect, PlayerState } from '../types/game';

interface WealthContext {
  turnCount?: number;
}

const parseWealthFromText = (text?: string | null) => {
  if (!text) return 0;
  const match = text.match(/(?:财富|璐㈠瘜)\s*(\d+)\s*(?:[（(锛]|$)/);
  return match ? Number(match[1]) || 0 : 0;
};

const isCardFullySilenced = (card: Card, context?: WealthContext) => {
  const data = (card as any).data;
  if (data?.permanentEffectSilenced) return true;
  if (data?.fullEffectSilencedUntilOwnStartUid) return true;
  if (card.canActivateEffect === false) return true;
  if (context?.turnCount === undefined) return false;
  if (data?.fullEffectSilencedTurn === undefined || data.fullEffectSilencedTurn < context.turnCount) return false;
  const zones = data.fullEffectSilencedZones as string[] | undefined;
  return !zones || zones.includes(card.cardlocation || '');
};

const getEffectWealthValue = (card: Card, effect: CardEffect) => {
  if (effect.type !== 'CONTINUOUS') return 0;
  if (card.silencedEffectIds?.includes(effect.id || '')) return 0;
  if (effect.wealthValue !== undefined) {
    return Math.max(0, Number(effect.wealthValue) || 0);
  }
  return parseWealthFromText(effect.description);
};

export const getCardWealthValue = (card?: Card | null, context?: WealthContext) => {
  if (!card || card.type !== 'UNIT') return 0;
  if (isCardFullySilenced(card, context)) return 0;

  const dataValue =
    Number((card as any).data?.wealthValue || 0) +
    Number((card as any).data?.grantedWealthValue || 0);
  const effectValue = (card.effects || []).reduce(
    (total, effect) => total + getEffectWealthValue(card, effect),
    0
  );

  return Math.max(0, dataValue + effectValue);
};

export const getPlayerWealthCount = (player?: PlayerState | null, context?: WealthContext) =>
  (player?.unitZone || []).reduce((total, unit) => total + getCardWealthValue(unit, context), 0);
