import { DeckAiProfile, DEFAULT_AI_WEIGHTS } from './types';
import { adventurerGuildProfile } from './decks/adventurerGuild';
import { pureYellowSteelProfile } from './decks/pureYellowSteel';

export const genericProfile: DeckAiProfile = {
  id: 'generic',
  displayName: '通用困难AI',
  notes: '没有命中特定卡组时使用的通用评分。',
  weights: DEFAULT_AI_WEIGHTS,
};

export const AI_DECK_PROFILES: DeckAiProfile[] = [
  adventurerGuildProfile,
  pureYellowSteelProfile,
];

export const ALL_DECK_AI_PROFILES: DeckAiProfile[] = [...AI_DECK_PROFILES];

export function getDeckAiProfile(profileId?: string | null) {
  if (!profileId) return genericProfile;
  return ALL_DECK_AI_PROFILES.find(profile => profile.id === profileId) || genericProfile;
}

export function getDeckAiProfileByShareCode(shareCode?: string | null) {
  if (!shareCode) return genericProfile;
  return ALL_DECK_AI_PROFILES.find(profile => profile.shareCode === shareCode) || genericProfile;
}
