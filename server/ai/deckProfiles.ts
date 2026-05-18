import { DeckAiProfile, DEFAULT_AI_WEIGHTS } from './types';
import { whiteTempleProfile } from './decks/whiteTemple';
import { blueAdventurerProfile } from './decks/blueAdventurer';
import { redDikaiProfile } from './decks/redDikai';
import { yellowAlchemyProfile } from './decks/yellowAlchemy';
import { overlordTotemProfile } from './decks/overlordTotem';
import { bigSalalaProfile } from './decks/bigSalala';

export const genericProfile: DeckAiProfile = {
  id: 'generic',
  displayName: '通用困难AI',
  notes: '没有命中特定卡组时使用的通用评分。',
  weights: DEFAULT_AI_WEIGHTS,
};

export const AI_DECK_PROFILES: DeckAiProfile[] = [
  whiteTempleProfile,
  blueAdventurerProfile,
  redDikaiProfile,
  bigSalalaProfile,
];

export const ALL_DECK_AI_PROFILES: DeckAiProfile[] = [
  ...AI_DECK_PROFILES,
  yellowAlchemyProfile,
  overlordTotemProfile,
];

export function getDeckAiProfile(profileId?: string | null) {
  if (!profileId) return genericProfile;
  return ALL_DECK_AI_PROFILES.find(profile => profile.id === profileId) || genericProfile;
}

export function getDeckAiProfileByShareCode(shareCode?: string | null) {
  if (!shareCode) return genericProfile;
  return ALL_DECK_AI_PROFILES.find(profile => profile.shareCode === shareCode) || genericProfile;
}
