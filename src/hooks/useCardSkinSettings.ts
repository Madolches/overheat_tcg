import { useCallback, useSyncExternalStore } from 'react';
import type { Card } from '../types/game';
import { hasCardSkin } from '../data/cardSkins';

interface CardSkinSettings {
  enabledCardKeys: string[];
  showOpponentCardSkins: boolean;
}

const STORAGE_KEY = 'ohr_card_skin_settings_v2';
const CHANGE_EVENT = 'ohr-card-skin-settings-change';
const DEFAULT_SETTINGS: CardSkinSettings = {
  enabledCardKeys: [],
  showOpponentCardSkins: true
};

const isBrowser = typeof window !== 'undefined';

const getCardSkinSettingKey = (card?: Card | null): string | undefined => {
  if (!card) return undefined;
  return card.id || card.uniqueId;
};

const normalizeSettings = (value: unknown): CardSkinSettings => {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;

  const raw = value as Partial<CardSkinSettings>;
  const enabledCardKeys = Array.isArray(raw.enabledCardKeys) ? raw.enabledCardKeys : [];

  return {
    enabledCardKeys: Array.from(new Set(enabledCardKeys.filter((key): key is string => typeof key === 'string'))),
    showOpponentCardSkins: raw.showOpponentCardSkins !== false
  };
};

export const getStoredCardSkinSettings = (): CardSkinSettings => {
  if (!isBrowser) return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const writeCardSkinSettings = (settings: CardSkinSettings) => {
  if (!isBrowser) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const subscribe = (callback: () => void) => {
  if (!isBrowser) return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };

  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
  };
};

const getSnapshot = () => JSON.stringify(getStoredCardSkinSettings());
const getServerSnapshot = () => JSON.stringify(DEFAULT_SETTINGS);

export const isCardSkinEnabledWithSettings = (card: Card | null | undefined, settings: CardSkinSettings) => {
  const key = getCardSkinSettingKey(card);
  return !!key && hasCardSkin(card) && settings.enabledCardKeys.includes(key);
};

export const setCardSkinEnabled = (card: Card, enabled: boolean) => {
  const key = getCardSkinSettingKey(card);
  if (!key) return;

  const settings = getStoredCardSkinSettings();
  const enabledKeys = new Set(settings.enabledCardKeys);

  if (enabled) enabledKeys.add(key);
  else enabledKeys.delete(key);

  writeCardSkinSettings({ ...settings, enabledCardKeys: Array.from(enabledKeys) });
};

export const setShowOpponentCardSkins = (enabled: boolean) => {
  const settings = getStoredCardSkinSettings();
  writeCardSkinSettings({ ...settings, showOpponentCardSkins: enabled });
};

export const useCardSkinSettings = () => {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const settings = normalizeSettings(JSON.parse(snapshot));

  const isCardSkinEnabled = useCallback(
    (card: Card | null | undefined) => isCardSkinEnabledWithSettings(card, settings),
    [settings]
  );

  const updateCardSkinEnabled = useCallback((card: Card, enabled: boolean) => {
    setCardSkinEnabled(card, enabled);
  }, []);

  const toggleCardSkin = useCallback((card: Card) => {
    setCardSkinEnabled(card, !isCardSkinEnabledWithSettings(card, getStoredCardSkinSettings()));
  }, []);

  const updateShowOpponentCardSkins = useCallback((enabled: boolean) => {
    setShowOpponentCardSkins(enabled);
  }, []);

  return {
    settings,
    isCardSkinEnabled,
    setCardSkinEnabled: updateCardSkinEnabled,
    toggleCardSkin,
    showOpponentCardSkins: settings.showOpponentCardSkins,
    setShowOpponentCardSkins: updateShowOpponentCardSkins
  };
};
