import { Faction } from '../data/factions';

export const GAME_TIMEOUTS = {
  MAIN_PHASE_TOTAL: 300000, // 300 seconds (5 minutes)
  INDEPENDENT_PHASE: 30000,  // 30 seconds
  CHECK_INTERVAL: 1000      // 1 seconds
};

export type CardType = 'UNIT' | 'STORY' | 'ITEM';
export type CardColor = 'RED' | 'WHITE' | 'YELLOW' | 'BLUE' | 'GREEN' | 'NONE';
export type EffectType = 'CONTINUOUS' | 'TRIGGERED' | 'ACTIVATED' | 'ALWAYS' | 'TRIGGER' | 'ACTIVATE';
export type TriggerLocation = 'HAND' | 'UNIT' | 'ITEM' | 'GRAVE' | 'EXILE' | 'EROSION_FRONT' | 'EROSION_BACK' | 'PLAY' | 'DECK';

export type GameEventType =
  | 'PHASE_CHANGED'
  | 'CARD_ROTATED'
  | 'CARD_DRAWN'
  | 'CARD_PLAYED'
  | 'CARD_ENTERED_ZONE'
  | 'CARD_LEFT_ZONE'
  | 'EFFECT_ACTIVATED'
  | 'EFFECT_TRIGGERED'
  | 'CARD_POWER_CHANGED'
  | 'CARD_DAMAGE_CHANGED'
  | 'CARD_AC_CHANGED'
  | 'CARD_DESTROYED_BATTLE'
  | 'CARD_DESTROYED_EFFECT'
  | 'CARD_TO_EROSION_FRONT'
  | 'CARD_DECK_TO_EROSION_UP'
  | 'CARD_EROSION_TO_FIELD'
  | 'CARD_EROSION_TO_HAND'
  | 'CARD_DECK_TO_EROSION_DOWN'
  | 'CARD_HAND_TO_EROSION_UP'
  | 'CARD_FIELD_TO_HAND'
  | 'CARD_ATTACK_DECLARED'
  | 'CARD_SELECTED_ALLIANCE'
  | 'CARD_DEFENSE_DECLARED'
  | 'BATTLE_ENDED'
  | 'COMBAT_DAMAGE_CAUSED'
  | 'EFFECT_DAMAGE_CAUSED'
  | 'GODDESS_TRANSFORMATION'
  | 'GODDESS_EXIT'
  | 'EFFECT_COUNTERED'
  | 'CARD_SELECTED_TARGET'
  | 'CARD_EQUIPPED'
  | 'CARD_EXILED'
  | 'CARD_LEFT_FIELD'
  | 'CARD_DISCARDED'
  | 'REVEAL_HAND'
  | 'REVEAL_DECK'
  | 'DECK_SHUFFLED';

export type AtomicEffectType =
  | 'DRAW'
  | 'ROTATE_HORIZONTAL'
  | 'ROTATE_VERTICAL'
  | 'SHUFFLE_DECK'
  | 'REVEAL_DECK'
  | 'SEARCH_DECK'
  | 'BOTH_PLAYERS_DRAW'
  | 'TURN_EROSION_FACE_DOWN'
  | 'SET_CAN_RESET_COUNT'
  | 'MOVE_FROM_HAND'
  | 'MOVE_FROM_EROSION'
  | 'MOVE_FROM_EROSION_BACK'
  | 'MOVE_FROM_DECK'
  | 'MOVE_FROM_FIELD'
  | 'MOVE_FROM_GRAVE'
  | 'COUNTER_EFFECT'
  | 'NEGATE_EFFECT'
  | 'IMMUNE_COMBAT_DESTRUCTION'
  | 'IMMUNE_EFFECT'
  | 'CHANGE_DAMAGE'
  | 'CHANGE_POWER'
  | 'CHANGE_AC'
  | 'CHANGE_GOD_MARK'
  | 'DYNAMIC_POWER'
  | 'DEAL_EFFECT_DAMAGE'
  | 'DEAL_COMBAT_DAMAGE'
  | 'DESTROY_CARD'
  | 'BANISH_CARD'
  | 'DISCARD_CARD'
  | 'IMMUNE_SPECIFIC'
  | 'GAIN_EFFECT'
  | 'REVEAL_HAND'
  | 'FORCE_PLAY'
  | 'SKIP_PHASE'
  | 'FORCE_END_PHASE'
  | 'EXECUTE_CARD_EFFECTS'
  | 'PAY_CARD_COST'
  | 'CHANGE_CAN_ACTIVATE'
  | 'IMMUNE_UNIT_EFFECTS'
  | 'DEAL_EFFECT_DAMAGE_SELF'
  | 'GAIN_KEYWORD';

export interface CardFilter {
  id?: string;
  name?: string;
  type?: CardType;
  color?: CardColor;
  faction?: Faction | string;
  godMark?: boolean;
  minPower?: number;
  maxPower?: number;
  minDamage?: number;
  maxDamage?: number;
  minAc?: number;
  maxAc?: number;
  tags?: string[];
  zone?: TriggerLocation[];
  onField?: boolean;
  excludeColor?: CardColor;
  excludeSelf?: boolean;
  excludeId?: string;
  excludeGamecardId?: string;
  fuzzyName?: string;
  querySelection?: boolean; // If true, only target cards selected in the current query context
  gamecardId?: string; // Specific instance ID
  isExhausted?: boolean; // New: Filter by exhaustion status (horizontal/rotational)
}

export interface AtomicEffect {
  type: AtomicEffectType;
  value?: number;
  turnDuration?: number; // 0 for instant, -1 for infinite, >0 for specific turns
  targetFilter?: CardFilter;
  targetCount?: number;
  destinationZone?: TriggerLocation;
  faceDown?: boolean;
  params?: any;
}

export interface EffectTargetCandidate {
  card: Card;
  source?: TriggerLocation;
}

export interface EffectTargetShape {
  title: string;
  description: string;
  minSelections: number;
  maxSelections: number;
  zones?: TriggerLocation[];
  controller?: 'SELF' | 'OPPONENT' | 'ANY';
  filter?: CardFilter;
  step?: string;
  getCandidates?: (gameState: GameState, playerState: PlayerState, card: Card, declaredTargets?: DeclaredEffectTarget[]) => EffectTargetCandidate[];
}

export interface EffectTargetModeOption extends EffectTargetShape {
  id: string;
  label: string;
  modeDescription?: string;
  condition?: (gameState: GameState, playerState: PlayerState, card: Card) => boolean;
}

export interface EffectTargetSpec extends Partial<EffectTargetShape> {
  preselect?: boolean;
  modeTitle?: string;
  modeDescription?: string;
  modeOptions?: EffectTargetModeOption[];
  targetGroups?: EffectTargetShape[];
}

export interface DeclaredEffectTarget {
  gamecardId: string;
  ownerUid: string;
  zone: TriggerLocation;
  sourceCardId: string;
  sourceCardName: string;
  effectIndex?: number;
  linkNumber?: number;
  modeId?: string;
  step?: string;
  capturedContext?: any;
}

export interface DeclaredTargetMarker {
  sourceCardId: string;
  sourceCardName: string;
  effectIndex?: number;
  linkNumber?: number;
  modeId?: string;
  step?: string;
}

export interface GameEvent {
  type: GameEventType;
  sourceCard?: Card;
  sourceCardId?: string;
  targetCardId?: string;
  playerUid?: string;
  data?: any;
}

export type BattleLogCategory =
  | 'SYSTEM'
  | 'TURN'
  | 'PHASE'
  | 'CARD_PLAYED'
  | 'TRIGGERED_EFFECT'
  | 'CONTINUOUS_EFFECT'
  | 'EFFECT_ACTIVATED'
  | 'TARGET_DECLARED'
  | 'CONFRONTATION'
  | 'BATTLE'
  | 'DAMAGE'
  | 'DESTROYED'
  | 'MOVED'
  | 'CHAT';

export interface BattleLogCardRef {
  gamecardId?: string;
  cardId?: string;
  name?: string;
  ownerUid?: string;
  ownerName?: string;
  zone?: TriggerLocation | string;
  zoneLabel?: string;
  slotNumber?: number;
}

export interface BattleLogEntry {
  id: string;
  timestamp: number;
  turn: number;
  phase: GamePhase;
  category: BattleLogCategory;
  text: string;
  actorUid?: string;
  actorName?: string;
  sourceCard?: BattleLogCardRef;
  targets?: BattleLogCardRef[];
  metadata?: Record<string, any>;
}

export interface CardEffect {
  id?: string;
  type: EffectType;
  limitCount?: number; // For ONCE_PER_TURN and ONCE_PER_GAME, this should be 1. For MULTI_PER_TURN and MULTI_PER_GAME, this can be any positive integer.
  limitNowCount?: number;  //at the start of turn,reset to limitCount，each time use this effect,limitNowCount-1,when limitNowCount is 0,can't use this effect
  limitGlobal?: boolean; //0:use every turn,1:only use once in the whole game
  limitNameType?: boolean; //0:check gameid，1:check cardid
  erosionFrontLimit?: [number, number];   //scope:[2,8] means "this effect can only be triggered when there are 2 to 8 cards in the front erosion zone",[0,11] means not limited
  erosionBackLimit?: [number, number];
  erosionTotalLimit?: [number, number];
  playCost?: number;
  playColorReq?: { [color in CardColor]?: number };
  triggerLocation?: TriggerLocation[];
  factionReq?: Faction | string;
  godUnitReq?: boolean;
  targetcost?: [number, number]; // [min, max]

  // New Event System Properties
  triggerEvent?: GameEventType | GameEventType[];
  isMandatory?: boolean;
  isGlobal?: boolean; // If true, the effect triggers for any card meeting the criteria (e.g. any card entering), not just self.
  sourceSnapshotOnLeftField?: boolean; // Allows a left-field trigger to be queued from the source snapshot before refreshed instance IDs are applied.
  triggerPriority?: number; // Higher priority triggers are queued first for the same event.
  condition?: (gameState: GameState, playerState: PlayerState, card: Card, event?: GameEvent) => boolean;
  cost?: (gameState: GameState, playerState: PlayerState, card: Card) => boolean | Promise<boolean>;
  applyContinuous?: (gameState: GameState, card: Card) => void;
  removeContinuous?: (gameState: GameState, card: Card) => void;

  execute?: (card: Card, gameState: GameState, playerState: PlayerState, event?: GameEvent) => void | Promise<void>; // The function to execute when the effect is triggered
  onQueryResolve?: (card: Card, gameState: GameState, playerState: PlayerState, selections: string[], context?: any) => void | Promise<void>; // Resolve sequential steps after a query
  resolve?: (card: Card, gameState: GameState, playerState: PlayerState, event?: GameEvent) => void | Promise<void>; // Post-processing logic (e.g. end of turn)
  atomicEffects?: AtomicEffect[]; // Structured atomic effects
  targetSpec?: EffectTargetSpec;
  content?: string; // Description of the effect: Move, Draw, Add Power, etc.
  description: string; // Human readable text
  substitutionFilter?: CardFilter; // Filter for units this card can substitute/protect
  movementReplacementDestination?: TriggerLocation; // Destination if this card's movement is replaced
  erosionKeepReplacement?: boolean; // If true, allows keeping a card during erosion phase that would be moved to grave
  limitGodmarkCount?: number; // New: Limit on the number of Godmark units on the field
}

export type Rarity = 'C' | 'U' | 'R' | 'SR' | 'UR' | 'SER' | 'PR';

export interface Card {
  id: string; // Base ID
  uniqueId: string; // Unique ID (id + rarity)
  gamecardId: string; // Instance ID
  fullName: string;
  specialName?: string;
  type: CardType;
  color: CardColor;
  colorReq: { [color in CardColor]?: number };
  baseColorReq?: { [color in CardColor]?: number };
  acValue: number;
  baseAcValue?: number;
  power?: number;
  basePower?: number;
  damage?: number;
  baseDamage?: number;
  godMark: boolean;
  baseGodMark?: boolean;
  displayState: 'FRONT_UPRIGHT' | 'FRONT_FACEDOWN' | 'BACK_UPRIGHT';
  isrush?: boolean;
  baseIsrush?: boolean;
  isAnnihilation?: boolean;
  baseAnnihilation?: boolean;
  isShenyi?: boolean;
  baseShenyi?: boolean;
  isHeroic?: boolean;
  baseHeroic?: boolean;
  hasAttackedThisTurn?: boolean;
  usedShenyiThisTurn?: boolean;
  isExhausted?: boolean;
  canAttack?: boolean;
  baseCanAttack?: boolean;
  canActivateEffect?: boolean;
  baseCanActivateEffect?: boolean;
  playedTurn?: number;
  cardlocation?: 'HAND' | 'UNIT' | 'ITEM' | 'GRAVE' | 'EXILE' | 'EROSION_FRONT' | 'EROSION_BACK' | 'PLAY' | 'DECK';
  feijingMark: boolean;
  canResetCount?: number;    //only 0 can be reset,if not 0,at the start of turn,canResetCount-1
  isImmuneToUnitEffects?: boolean;
  baseIsImmuneToUnitEffects?: boolean;
  temporaryCanActivateEffect?: boolean;
  temporaryImmuneToUnitEffects?: boolean;
  temporaryPowerBuff?: number; // cleared at turn start
  temporaryDamageBuff?: number; // cleared at turn start
  temporaryRush?: boolean; // cleared at turn start
  temporaryAnnihilation?: boolean; // cleared at turn start
  temporaryHeroic?: boolean; // cleared at turn start
  temporaryCanAttackAny?: boolean; // cleared at turn start
  temporaryExtraColors?: CardColor[]; // cleared at turn start
  persistentExtraColors?: CardColor[]; // kept while this instance remains on field
  effects?: CardEffect[];
  influencingEffects?: { sourceCardName: string; description: string }[];
  inAllianceGroup?: boolean;
  imageUrl?: string;
  fullImageUrl?: string;
  rarity?: Rarity;
  availableRarities?: Rarity[];
  cardPackage?: string;
  faction: Faction | string;
  baseFaction?: Faction | string;
  runtimeFingerprint?: string;
  equipTargetId?: string;
  isEquip?: boolean;
  allowPlayFromErosionFront?: boolean;
  nextEffectProtection?: boolean;
  silencedEffectIds?: string[];
  temporaryBuffSources?: { [key: string]: string }; // Map of buff type to source card name
  temporaryBuffDetails?: { [key: string]: { sourceCardName: string; value?: number; description?: string }[] };
  declaredTargetMarkers?: DeclaredTargetMarker[];
}

export interface PlayerState {
  uid: string;
  deck: Card[];
  hand: Card[];
  grave: Card[];
  exile: Card[];
  itemZone: Card[];
  erosionFront: (Card | null)[];
  erosionBack: (Card | null)[];
  unitZone: (Card | null)[];
  playZone: Card[];
  isTurn: boolean;
  isFirst: boolean;
  displayName: string;
  mulliganDone: boolean;
  mulliganReveal?: {
    id: string;
    replacedCount: number;
    cards: Card[];
    createdAt: number;
    animationMs: number;
    holdMs: number;
    allPlayersDone?: boolean;
  };
  hasExhaustedThisTurn: string[];
  isGoddessMode?: boolean;
  isHandPublic?: number;
  timeRemaining: number;
  negatedNames?: string[];
  effectDamageModifier?: number; // Bonus damage dealt by this player's card effects
  hasUnitReturnedThisTurn?: boolean; // Track if any unit returned from field (bounce)
  factionsUsedThisTurn?: string[]; // Log of factions used (played/activated) this turn
  factionLock?: string; // Active faction restriction for the current turn
  markedUnitAttackTarget?: string; // Target selected at start of Main Phase that can be attacked
  exiledFromErosionTurn?: number;
  unitFromGraveToFieldTurn?: number;
  skipDrawPhase?: boolean;
  confrontationStrategy?: 'ON' | 'AUTO' | 'OFF';
  botDifficulty?: 'simple' | 'hard';
  botDeckProfileId?: string;
}

export type StackItemType = 'PLAY' | 'EFFECT' | 'ATTACK' | 'PHASE_END';

export interface StackItem {
  card?: Card;
  ownerUid: string;
  type: StackItemType;
  effectIndex?: number;
  nextPhase?: GamePhase; // For PHASE_END
  attackerIds?: string[]; // For ATTACK
  isAlliance?: boolean; // For ATTACK
  data?: any; // Generic data for effects (e.g. query results)
  declaredTargets?: DeclaredEffectTarget[];
  timestamp: number;
  isNegated?: boolean;
  isInterrupted?: boolean;
  skipDefense?: boolean;
}


export interface EffectQuery {
  id: string; // Unique ID for this query to match response
  type: 'SELECT_CARD' | 'SELECT_PAYMENT' | 'ASK_TRIGGER' | 'SELECT_CHOICE';
  playerUid: string;
  options: {
    id?: string;
    value?: string;
    sourceCardNo?: string;
    optionCode?: string;
    label?: string;
    icon?: string;
    detail?: string;
    card?: Card;
    source?: TriggerLocation;
    ownerName?: string;
    isMine?: boolean;
    slotNumber?: number;
    slotLabel?: string;
    zoneLabel?: string;
    disabled?: boolean;
    disabledReason?: string;
  }[];
  title: string;
  description: string;
  minSelections: number;
  maxSelections: number;
  callbackKey: string; // Identifier for resolution logic (e.g. 'GENERIC_RESOLVE')
  context?: any; // Extra data like the card that triggered this
  afterSelectionEffects?: AtomicEffect[]; // Effects to run after choice is made
  executionMode?: 'IMMEDIATE' | 'ON_STACK'; // How to resolve the after effects
  // Payment Query specialized fields
  paymentCost?: number;
  paymentColor?: string;
}

export type GamePhase =
  | 'RPS'
  | 'FIRST_PLAYER_CHOICE'
  | 'START'
  | 'DRAW'
  | 'EROSION'
  | 'MAIN'
  | 'BATTLE_DECLARATION'
  | 'DEFENSE_DECLARATION'
  | 'BATTLE_FREE'
  | 'DAMAGE_CALCULATION'
  | 'BATTLE_END'
  | 'DISCARD'
  | 'COUNTERING'
  | 'END'
  | 'MULLIGAN'
  | 'INIT'
  | 'SHENYI_CHOICE';

export interface AiDecisionLog {
  id: string;
  turn: number;
  playerUid: string;
  playerName?: string;
  profileId?: string;
  difficulty?: 'simple' | 'hard';
  phase: GamePhase;
  action: string;
  subject?: string;
  score?: number;
  reason: string;
  details?: Record<string, string | number | boolean | null | undefined>;
  candidates?: {
    name: string;
    score?: number;
    note?: string;
  }[];
  createdAt: number;
}

export interface TriggeredEffectRecord {
  card: Card;
  effect: CardEffect;
  effectIndex: number;
  playerUid: string;
  event?: GameEvent;
}

export interface PendingShenyi {
  playerUid: string;
  cardIds: string[];
}

export interface GameState {
  gameId: string;
  phase: GamePhase;
  currentTurnPlayer: 0 | 1; // 0 for first, 1 for second
  turnCount: number; // Starts at 1
  isCountering: 0 | 1; // 1 if countering
  counterStack: StackItem[]; // LIFO
  priorityPlayerId?: string; // Player who currently has the option to respond
  isResolvingStack?: boolean; // True when chain is resolving
  currentProcessingItem?: StackItem | null; // Currently resolving item for visual feedback
  triggeredEffectsQueue: TriggeredEffectRecord[]; // Queue of effects met conditions during chain/resolution
  pendingResolutions: TriggeredEffectRecord[]; // Effects to be resolved at the end of the turn
  passCount: number; // Number of consecutive passes during identification
  playerIds: [string, string]; // [FirstPlayerID, SecondPlayerID]
  gameStatus: 1 | 2; // 1: Normal, 2: Interrupted
  winReason?: string;
  winnerId?: string;
  winSourceCardName?: string;
  logs: Array<string | BattleLogEntry>;
  mode?: string;
  botDifficulty?: 'simple' | 'hard';
  botDeckProfiles?: Record<string, string>;
  status?: string;
  roomCode?: string;
  participantIds?: string[];
  spectatorIds?: string[];
  hostUid?: string;
  participantNames?: Record<string, string>;
  friendDeckSelections?: Record<string, string>;
  friendReady?: Record<string, boolean>;
  players: {
    [uid: string]: PlayerState;
  };
  rps?: {
    round: number;
    startedAt: number;
    timeoutMs: number;
    choices: Record<string, 'ROCK' | 'PAPER' | 'SCISSORS'>;
    winnerUid?: string;
    chooserUid?: string;
  };
  firstPlayerChoice?: {
    chooserUid: string;
    winnerUid?: string;
    source: 'RPS' | 'PRACTICE';
    startedAt: number;
    timeoutMs: number;
  };
  battleState?: {
    attackers: string[]; // gamecardIds
    defender?: string; // gamecardId
    unitTargetId?: string; // Explicit target for the attack (forces unit combat)
    defenseLockedToTargetId?: string; // If set, only this unit can be declared as defender for this battle
    isAlliance: boolean;
    askConfront?: 'ASKING_OPPONENT' | 'ASKING_TURN_PLAYER';
    defensePowerRestriction?: number;
    defenseMaxPowerRestriction?: number;
    resolvedUnitIds?: string[];
    forcedGuardTargetId?: string;
    forcedGuardLogged?: boolean;
    skipAttackerExhaust?: boolean;
    autoResolveDamage?: boolean;
    keepResetUnitIds?: string[];
  };
  effectUsage?: Record<string, number>;
  phaseTimerStart?: number;
  mainPhaseTimeRemaining?: number;
  previousPhase?: GamePhase;
  pendingQuery?: EffectQuery;
  aiDecisionLogs?: AiDecisionLog[];
  pendingShenyi?: PendingShenyi;
  mulliganRevealStartedAt?: number;
  turnTimerLimit?: number; // Total seconds for turn timer (180-999)
  publicReveal?: {
    id: string;
    playerUid: string;
    playerName: string;
    cards: Card[];
    createdAt: number;
  };
}

export interface Deck {
  id: string;
  name: string;
  cards: string[];
  isFavorite: boolean;
  createdAt: number;
}
