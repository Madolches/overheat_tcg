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

export interface WealthSource {
  id: string;
  sourceCardName: string;
  sourceCardId?: string;
  targetCardName?: string;
  targetCardId?: string;
  value: number;
  description: string;
}

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

export const getCardWealthSources = (card?: Card | null, context?: WealthContext): WealthSource[] => {
  if (!card || card.type !== 'UNIT') return [];
  if (isCardFullySilenced(card, context)) return [];

  const data = (card as any).data || {};
  const sources: WealthSource[] = [];
  const dataValue = Number(data.wealthValue || 0);
  const grantedValue = Number(data.grantedWealthValue || 0);

  if (dataValue > 0) {
    sources.push({
      id: `${card.gamecardId}:data-wealth`,
      sourceCardName: data.wealthSourceName || card.fullName,
      sourceCardId: data.wealthSourceCardId || card.gamecardId,
      targetCardName: card.fullName,
      targetCardId: card.gamecardId,
      value: dataValue,
      description: `财富${dataValue}`
    });
  }

  if (grantedValue > 0) {
    sources.push({
      id: `${card.gamecardId}:granted-wealth:${data.grantedWealthSourceCardId || data.grantedWealthSourceName || 'effect'}`,
      sourceCardName: data.grantedWealthSourceName || card.fullName,
      sourceCardId: data.grantedWealthSourceCardId,
      targetCardName: card.fullName,
      targetCardId: card.gamecardId,
      value: grantedValue,
      description: `${card.fullName} 获得财富${grantedValue}`
    });
  }

  (card.effects || []).forEach(effect => {
    const value = getEffectWealthValue(card, effect);
    if (value <= 0) return;
    sources.push({
      id: `${card.gamecardId}:${effect.id || effect.description}:wealth`,
      sourceCardName: card.fullName,
      sourceCardId: card.gamecardId,
      targetCardName: card.fullName,
      targetCardId: card.gamecardId,
      value,
      description: effect.description || `财富${value}`
    });
  });

  return sources;
};

export const getPlayerWealthSources = (player?: PlayerState | null, context?: WealthContext) =>
  (player?.unitZone || []).flatMap(unit => getCardWealthSources(unit, context));
