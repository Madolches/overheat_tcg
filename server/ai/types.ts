import { Card, GameState, PlayerState } from '../../src/types/game';

export type BotDifficulty = 'simple' | 'hard';

export interface DeckAiWeights {
  unitPower: number;
  unitDamage: number;
  unitRush: number;
  unitGodMark: number;
  itemValue: number;
  storyValue: number;
  lowCost: number;
  effectText: number;
  attackBias: number;
  defenseBias: number;
  preserveHand: number;
}

export type EffectPreferenceTag =
  | 'engine'
  | 'draw'
  | 'search'
  | 'removal'
  | 'protection'
  | 'resource'
  | 'tempo'
  | 'combat'
  | 'buff'
  | 'summon'
  | 'revive'
  | 'reset'
  | 'finisher';

export interface DeckAiEffectPreferences {
  preferredEffectIds?: Record<string, number>;
  avoidEffectIds?: Record<string, number>;
  lowDeckAvoidEffectIds?: Record<string, number>;
  tagBias?: Partial<Record<EffectPreferenceTag, number>>;
  phaseBias?: Partial<Record<'MAIN' | 'BATTLE_FREE' | 'BATTLE_DECLARATION' | 'COUNTERING', number>>;
  highCostTolerance?: number;
}

export type DeckAiGamePlanMode = 'aggro' | 'tempo' | 'midrange' | 'control' | 'engine' | 'combo';
export type DeckAiPrimaryGoal = 'damage' | 'deckPressure' | 'boardControl' | 'resourceLoop' | 'comboSetup';

export interface DeckAiRiskThresholds {
  lowDeck?: number;
  criticalDeck?: number;
  stopSelfDrawAtDeck?: number;
  stopSearchAtDeck?: number;
  highErosion?: number;
  criticalErosion?: number;
  reserveDefendersAtDeck?: number;
}

export interface DeckAiGamePlan {
  mode: DeckAiGamePlanMode;
  primaryGoal: DeckAiPrimaryGoal;
  attackPriority?: number;
  defensePriority?: number;
  developmentPriority?: number;
  effectPriority?: number;
  closeGameBias?: number;
  defenderReserveBias?: number;
  notes?: string[];
}

export interface DeckAiMatchupPlan {
  attackBias?: number;
  defenseBias?: number;
  developmentBias?: number;
  effectBias?: number;
  closeGameBias?: number;
  defenderReserveBias?: number;
  stopSelfDrawAtDeck?: number;
  stopSearchAtDeck?: number;
  notes?: string[];
}

export type PlayerDeckArchetype = 'aggro' | 'tempo' | 'midrange' | 'control' | 'engine' | 'combo';

export interface PlayerDeckProfile {
  uid?: string;
  knownProfileId?: string;
  knownProfileName?: string;
  archetype: PlayerDeckArchetype;
  confidence: number;
  size: number;
  averageCost: number;
  colors: Record<string, number>;
  factions: Record<string, number>;
  typeCounts: Record<string, number>;
  roleCounts: Record<string, number>;
  scores: {
    aggression: number;
    defense: number;
    engine: number;
    combo: number;
    control: number;
    resource: number;
    recursion: number;
    removal: number;
    tempo: number;
  };
  traits: string[];
  summary: string;
}

export interface DeckAiStrategyContext {
  gameState?: GameState;
  player?: PlayerState;
  opponent?: PlayerState;
  opponentDeckProfile?: PlayerDeckProfile;
  matchupPlan?: DeckAiMatchupPlan;
}

export interface DeckAiTurnPlanSnapshot {
  mode: 'lethal' | 'pressure' | 'defense' | 'stabilize' | 'setup' | 'develop';
  ownDeck: number;
  opponentDeck: number;
  ownErosion: number;
  opponentErosion: number;
  attackers: number;
  totalAvailableDamage: number;
  damageThroughLikelyDefenders: number;
  likelyDefenders: number;
  opponentPotentialDamage: number;
  defendersNeededNextTurn: number;
  lethalWindow: boolean;
}

export interface DeckAiProfile {
  id: string;
  displayName: string;
  shareCode?: string;
  notes?: string;
  weights: DeckAiWeights;
  preferredFactions?: string[];
  preferredCardIds?: Record<string, number>;
  preserveCardIds?: Record<string, number>;
  effectPreferences?: DeckAiEffectPreferences;
  gamePlan?: DeckAiGamePlan;
  matchupPlans?: Record<string, DeckAiMatchupPlan>;
  riskThresholds?: DeckAiRiskThresholds;
}

export interface ScoredCard {
  card: Card;
  score: number;
}

export const DEFAULT_AI_WEIGHTS: DeckAiWeights = {
  unitPower: 1,
  unitDamage: 7,
  unitRush: 4,
  unitGodMark: 3,
  itemValue: 6,
  storyValue: 4,
  lowCost: 0.75,
  effectText: 1,
  attackBias: 1,
  defenseBias: 1,
  preserveHand: 1,
};
