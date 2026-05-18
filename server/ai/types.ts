import { Card, CardEffect, EffectQuery, GameState, PlayerState } from '../../src/types/game';

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

export interface DeckAiCardScoreContext extends DeckAiStrategyContext {
  card: Card;
  score: number;
  reason: 'value' | 'playable' | 'attack' | 'defense' | 'mulligan' | 'discard' | 'paymentSacrifice' | 'paymentExhaust';
  earlyUnitsInHand?: number;
  attackingUnits?: Card[];
  availableDefenders?: Card[];
}

export interface DeckAiEffectScoreContext extends DeckAiStrategyContext {
  card: Card;
  effect: CardEffect;
  score: number;
  tags: EffectPreferenceTag[];
  targetCount?: number;
  notes: string[];
}

export interface DeckAiQueryScoreContext extends DeckAiStrategyContext {
  query: EffectQuery;
  option: any;
  score: number;
  intent?: string;
}

export interface DeckAiTurnPlanSnapshot {
  mode: 'lethal' | 'pressure' | 'defense' | 'stabilize' | 'setup' | 'develop';
  ownDeck: number;
  opponentDeck: number;
  ownErosion: number;
  opponentErosion: number;
  attackers: number;
  totalAvailableDamage: number;
  likelyDefenders: number;
  opponentPotentialDamage: number;
  defendersNeededNextTurn: number;
  lethalWindow: boolean;
}

export interface DeckAiTurnPlanAdjustment {
  attackBeforeDeveloping?: boolean;
  reserveDefendersDelta?: number;
  minMainEffectScoreDelta?: number;
  minBattleEffectScoreDelta?: number;
  avoidSelfDraw?: boolean;
  avoidSearch?: boolean;
  mode?: DeckAiTurnPlanSnapshot['mode'];
  notes?: string[];
}

export interface DeckAiStrategyHooks {
  adjustTurnPlan?: (context: DeckAiStrategyContext & { plan: DeckAiTurnPlanSnapshot }) => DeckAiTurnPlanAdjustment | undefined;
  adjustCardValue?: (context: DeckAiCardScoreContext) => number;
  adjustPlayableScore?: (context: DeckAiCardScoreContext) => number;
  adjustAttackScore?: (context: DeckAiCardScoreContext) => number;
  adjustDefenseScore?: (context: DeckAiCardScoreContext) => number;
  adjustMulliganScore?: (context: DeckAiCardScoreContext) => number;
  adjustDiscardScore?: (context: DeckAiCardScoreContext) => number;
  adjustPaymentScore?: (context: DeckAiCardScoreContext) => number;
  adjustEffectScore?: (context: DeckAiEffectScoreContext) => number;
  adjustQueryScore?: (context: DeckAiQueryScoreContext) => number;
}

export interface DeckAiSoftCompensation {
  openingSmoothing?: boolean;
  fixedOpeningHandIds?: string[];
  openingLookahead?: number;
  maxOpeningReplacements?: number;
  extremeBrickRescueChance?: number;
  fullOpponentDeckProfile?: boolean;
  notes?: string[];
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
  strategyHooks?: DeckAiStrategyHooks;
  softCompensation?: DeckAiSoftCompensation;
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
