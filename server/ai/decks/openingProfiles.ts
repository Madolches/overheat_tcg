import { Card, GameState, PlayerState } from '../../../src/types/game';
import { DeckAiProfile } from '../types';
import { ADVENTURER_GUILD_DEFAULT_OPENING_CARD_IDS, ADVENTURER_GUILD_FIRST_TURN_PLAY_CARD_IDS, ADVENTURER_GUILD_PROFILE_ID } from './adventurerGuildStrategy';
import { PURE_YELLOW_STEEL_CARD_IDS, PURE_YELLOW_STEEL_DEFAULT_OPENING_CARD_IDS, PURE_YELLOW_STEEL_FIRST_TURN_PLAY_CARD_IDS, PURE_YELLOW_STEEL_PROFILE_ID } from './pureYellowSteel';

export interface HardAiOpeningProfile {
  profileId: string;
  defaultOpeningCardIds: readonly string[];
  firstTurnPlayCardIds: readonly string[];
  stateKey: string;
}

const OPENING_PROFILES: Record<string, HardAiOpeningProfile> = {
  [ADVENTURER_GUILD_PROFILE_ID]: {
    profileId: ADVENTURER_GUILD_PROFILE_ID,
    defaultOpeningCardIds: ADVENTURER_GUILD_DEFAULT_OPENING_CARD_IDS,
    firstTurnPlayCardIds: ADVENTURER_GUILD_FIRST_TURN_PLAY_CARD_IDS,
    stateKey: 'adventurerGuildOpening',
  },
  [PURE_YELLOW_STEEL_PROFILE_ID]: {
    profileId: PURE_YELLOW_STEEL_PROFILE_ID,
    defaultOpeningCardIds: PURE_YELLOW_STEEL_DEFAULT_OPENING_CARD_IDS,
    firstTurnPlayCardIds: PURE_YELLOW_STEEL_FIRST_TURN_PLAY_CARD_IDS,
    stateKey: 'pureYellowSteelOpening',
  },
};

function hasCardId(cards: Array<Card | null | undefined>, cardId: string) {
  return cards.some(card => card?.id === cardId);
}

function hasFieldCard(player: PlayerState, cardId: string) {
  return hasCardId([...player.unitZone, ...player.itemZone], cardId);
}

function getProfile(profileOrId?: DeckAiProfile | string | null) {
  const profileId = typeof profileOrId === 'string' ? profileOrId : profileOrId?.id;
  return profileId ? OPENING_PROFILES[profileId] : undefined;
}

export function getHardAiOpeningCardIds(profileId?: string | null) {
  return getProfile(profileId)?.defaultOpeningCardIds;
}

export function getHardAiOpeningProfile(profileOrId?: DeckAiProfile | string | null) {
  return getProfile(profileOrId);
}

export function chooseHardAiForcedFirstTurnPlay(
  gameState: GameState,
  player: PlayerState,
  profile: DeckAiProfile,
  playableCards: Card[]
) {
  const openingProfile = getProfile(profile);
  if (!openingProfile) return undefined;
  if (!player.isTurn || gameState.phase !== 'MAIN') return undefined;

  const stateKey = openingProfile.stateKey;
  const turnKey = `${stateKey}Turn`;
  const completeKey = `${stateKey}Complete`;
  const playedKey = `${stateKey}PlayedCardIds`;

  if ((player as any)[turnKey] === undefined) {
    if (gameState.turnCount > 2) {
      (player as any)[completeKey] = true;
      return undefined;
    }
    (player as any)[turnKey] = gameState.turnCount;
  }
  if ((player as any)[completeKey]) return undefined;
  if ((player as any)[turnKey] !== gameState.turnCount) return undefined;

  const playedIds = new Set<string>((player as any)[playedKey] || []);
  const nextCardId = openingProfile.firstTurnPlayCardIds.find(cardId =>
    !playedIds.has(cardId) && !hasFieldCard(player, cardId)
  );
  if (!nextCardId) {
    (player as any)[completeKey] = true;
    return undefined;
  }

  return playableCards.find(card => card.id === nextCardId);
}

export function markHardAiForcedOpeningPlayed(player: PlayerState, profile: DeckAiProfile, card: Card) {
  const openingProfile = getProfile(profile);
  if (!openingProfile || !openingProfile.firstTurnPlayCardIds.includes(card.id)) return;

  const playedKey = `${openingProfile.stateKey}PlayedCardIds`;
  const completeKey = `${openingProfile.stateKey}Complete`;
  const openingPlayedIds = new Set<string>((player as any)[playedKey] || []);
  openingPlayedIds.add(card.id);
  (player as any)[playedKey] = [...openingPlayedIds];

  if (openingProfile.firstTurnPlayCardIds.every(cardId =>
    openingPlayedIds.has(cardId) ||
    player.unitZone.some(fieldCard => fieldCard?.id === cardId) ||
    player.itemZone.some(fieldCard => fieldCard?.id === cardId)
  )) {
    (player as any)[completeKey] = true;
  }
}

export function scoreHardAiOpeningQueryCard(profile: DeckAiProfile, effectId: string, card: Card) {
  if (profile.id === PURE_YELLOW_STEEL_PROFILE_ID && effectId === '105110381_hand_enter_search_blueprint_item') {
    if (card.id === PURE_YELLOW_STEEL_CARD_IDS.steelBlueprint) {
      return { score: 180, priority: 18, notes: ['蓝图绘师：优先检索钢铁蓝图'] };
    }
    if (card.id === PURE_YELLOW_STEEL_CARD_IDS.fortressBlueprint) {
      return { score: 80, priority: 8, notes: ['蓝图绘师：备用检索要塞蓝图'] };
    }
  }

  return undefined;
}
