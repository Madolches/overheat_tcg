import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Card, CardColor } from '../types/game';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LOCATION_LABELS: Record<string, string> = {
  HAND: '手牌',
  UNIT: '单位区',
  ITEM: '道具区',
  GRAVE: '墓地',
  EXILE: '放逐区',
  EROSION_FRONT: '侵蚀区(正)',
  EROSION_BACK: '侵蚀区(背)',
  PLAY: '处理中',
  DECK: '牌库'
};

const CARD_TYPE_LABELS: Record<string, string> = {
  UNIT: '单位',
  ITEM: '道具',
  STORY: '故事'
};

const CARD_COLOR_LABELS: Record<string, string> = {
  RED: '红',
  BLUE: '蓝',
  GREEN: '绿',
  YELLOW: '黄',
  WHITE: '白',
  NONE: '无'
};

const PHASE_LABELS: Record<string, string> = {
  RPS: '猜拳阶段',
  FIRST_PLAYER_CHOICE: '先后攻选择',
  START: '开始阶段',
  DRAW: '抽牌阶段',
  EROSION: '侵蚀阶段',
  MAIN: '主要阶段',
  BATTLE_DECLARATION: '攻击宣言',
  DEFENSE_DECLARATION: '防御宣言',
  BATTLE_FREE: '战斗自由',
  DAMAGE_CALCULATION: '伤害结算',
  COUNTERING: '对抗阶段',
  END: '结束阶段',
  DISCARD: '弃牌阶段',
  MULLIGAN: '调度阶段',
  SHENYI_CHOICE: '神依选择'
};

export function getCardImageUrl(
  cardId: string,
  rarity: string,
  _thumbnail: boolean = false,
  availableRarities: string[] = []
) {
  const rarityUpper = (rarity || 'C').toUpperCase();
  const normalizedRarities = availableRarities.map(r => (r || '').toUpperCase()).filter(Boolean);
  const hasMultipleRarities = normalizedRarities.length > 1;
  const baseRarity = normalizedRarities[0];
  const rarityPath = hasMultipleRarities && rarityUpper !== baseRarity ? `/${rarityUpper}` : '';
  const imageBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CARD_IMAGE_BASE_URL)
    ? import.meta.env.VITE_CARD_IMAGE_BASE_URL.replace(/\/$/, '')
    : '';

  return `${imageBaseUrl}/pics${rarityPath}/${cardId}.jpg`;
}

export function getLocationLabel(location?: string | null): string {
  if (!location) return '未知';
  return LOCATION_LABELS[location] || location;
}

export function getCardTypeLabel(type?: string | null): string {
  if (!type) return '未知';
  return CARD_TYPE_LABELS[type] || type;
}

export function getCardColorLabel(color?: string | null): string {
  if (!color) return '未知';
  return CARD_COLOR_LABELS[color] || color;
}

const EFFECTIVE_COLOR_ORDER: CardColor[] = ['RED', 'YELLOW', 'WHITE', 'GREEN', 'BLUE'];

const CARD_COLOR_HANZI: Record<CardColor, string> = {
  RED: '红',
  YELLOW: '黄',
  WHITE: '白',
  GREEN: '绿',
  BLUE: '蓝',
  NONE: '无'
};

export function getEffectiveCardColors(card?: Card | null): CardColor[] {
  if (!card) return [];
  const colors = new Set<CardColor>();
  if (card.color && card.color !== 'NONE') colors.add(card.color);

  const extraColors = [
    ...(card.temporaryExtraColors || []),
    ...(card.persistentExtraColors || [])
  ];
  extraColors.forEach(color => {
    if (color && color !== 'NONE') colors.add(color);
  });

  const isOmni =
    String(card.id) === '105000481' ||
    !!card.effects?.some(effect => effect.id === '105000481_omni');
  if (isOmni && ['UNIT', 'EROSION_FRONT'].includes(card.cardlocation || '')) {
    EFFECTIVE_COLOR_ORDER.forEach(color => colors.add(color));
  }

  return EFFECTIVE_COLOR_ORDER.filter(color => colors.has(color));
}

export function getGainedCardColors(card?: Card | null): CardColor[] {
  if (!card) return [];
  const gained = new Set<CardColor>();

  const extraColors = [
    ...(card.temporaryExtraColors || []),
    ...(card.persistentExtraColors || [])
  ];
  extraColors.forEach(color => {
    if (color && color !== 'NONE' && color !== card.color) gained.add(color);
  });

  const isOmni =
    String(card.id) === '105000481' ||
    !!card.effects?.some(effect => effect.id === '105000481_omni');
  if (isOmni && ['UNIT', 'EROSION_FRONT'].includes(card.cardlocation || '')) {
    EFFECTIVE_COLOR_ORDER.forEach(color => {
      if (color !== card.color) gained.add(color);
    });
  }

  return EFFECTIVE_COLOR_ORDER.filter(color => gained.has(color));
}

export function getCardColorHanzi(color?: string | null): string {
  return color ? CARD_COLOR_HANZI[color as CardColor] || color : '未知';
}

export function getPhaseLabel(phase?: string | null): string {
  if (!phase) return '未知阶段';
  return PHASE_LABELS[phase] || phase.replace(/_/g, ' ');
}

export function getCardIdentity(gameState: any, playerUid: string, card: any): string {
  if (!card) return '[未知]';

  const player = gameState.players[playerUid];
  const loc = getLocationLabel(card.cardlocation);
  const ownerLabel = player ? (player.displayName || '玩家') : '未知';

  return `[${ownerLabel}|${loc}]`;
}
