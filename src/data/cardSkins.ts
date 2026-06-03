/// <reference types="vite/client" />
import type { Card } from '../types/game';

export interface CardSkin {
  key: string;
  name: string;
  url: string;
}

const skinModules = import.meta.glob('../../pics/ohr/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>;

const normalizeSkinName = (value?: string | null) =>
  (value || '')
    .normalize('NFKC')
    .replace(/\.[^.]+$/, '')
    .replace(/[「」『』【】\[\]（）()《》〈〉<>“”"'\s·・,，.。:：;；!！?？\-_/\\]/g, '')
    .trim();

const getFileBaseName = (path: string) => {
  const fileName = path.split('/').pop() || path;
  return fileName.replace(/\.[^.]+$/, '');
};

const skinsByKey = new Map<string, CardSkin>();

Object.entries(skinModules).forEach(([path, url]) => {
  const name = getFileBaseName(path);
  const key = normalizeSkinName(name);
  if (!key) return;
  skinsByKey.set(key, { key, name, url });
});

const quotedNamePattern = /[「『【\[]([^」』】\]]+)[」』】\]]/g;

const getQuotedNames = (value: string) => {
  const names: string[] = [];
  for (const match of value.matchAll(quotedNamePattern)) {
    if (match[1]) names.push(match[1]);
  }
  return names;
};

const getCardSkinCandidates = (card: Card): string[] => {
  if (card.type !== 'UNIT') return [];

  const candidates: string[] = [];
  const fullName = card.fullName || '';
  const specialName = card.specialName || '';
  const normalizedFullName = normalizeSkinName(fullName);
  const normalizedSpecialName = normalizeSkinName(specialName);

  if (normalizedSpecialName) {
    if (normalizedFullName.includes('炉火')) candidates.push(`炉火${normalizedSpecialName}`);
    if (normalizedFullName.includes('魔女')) candidates.push(`魔女${normalizedSpecialName}`);
  }

  if (normalizedFullName) candidates.push(normalizedFullName);

  getQuotedNames(fullName).forEach(name => {
    const normalizedQuotedName = normalizeSkinName(name);
    if (normalizedQuotedName) {
      if (normalizedFullName.includes('炉火')) candidates.push(`炉火${normalizedQuotedName}`);
      if (normalizedFullName.includes('魔女')) candidates.push(`魔女${normalizedQuotedName}`);
      candidates.push(normalizedQuotedName);
    }
  });

  if (normalizedSpecialName) {
    candidates.push(normalizedSpecialName);
  }

  return Array.from(new Set(candidates));
};

export const getCardSkin = (card?: Card | null): CardSkin | null => {
  if (!card) return null;
  for (const key of getCardSkinCandidates(card)) {
    const skin = skinsByKey.get(key);
    if (skin) return skin;
  }
  return null;
};

export const getCardSkinUrl = (card?: Card | null): string | undefined =>
  getCardSkin(card)?.url;

export const getCardSkinKey = (card?: Card | null): string | undefined =>
  getCardSkin(card)?.key;

export const hasCardSkin = (card?: Card | null): boolean =>
  !!getCardSkin(card);

export const getAvailableCardSkins = (): CardSkin[] =>
  Array.from(skinsByKey.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
