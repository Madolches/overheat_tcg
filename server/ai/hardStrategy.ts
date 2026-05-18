import { Card, CardEffect, EffectQuery, GameState, PlayerState } from '../../src/types/game';
import {
  BotDifficulty,
  DeckAiCardScoreContext,
  DeckAiEffectScoreContext,
  DeckAiQueryScoreContext,
  DeckAiProfile,
  DeckAiStrategyContext,
  DeckAiTurnPlanSnapshot,
  EffectPreferenceTag,
  PlayerDeckProfile,
  ScoredCard
} from './types';
import { getCardKnowledge, getCardKnowledgeValue } from './cardKnowledge';
import { buildDynamicMatchupPlan, inferPlayerDeckProfile, mergeMatchupPlans } from './playerDeckProfile';
import { scoreEffectTimingWindow } from './effectTimingKnowledge';
import {
  getBestComboOpportunity,
  scoreComboCard,
  scoreComboEffect,
} from './comboKnowledge';

const getCardCost = (card: Card) => Math.max(0, card.baseAcValue ?? card.acValue ?? 0);

export const countErosion = (player: PlayerState) =>
  player.erosionFront.filter(Boolean).length + player.erosionBack.filter(Boolean).length;

export interface IncomingThreatEstimate {
  attackers: number;
  attackDamages: number[];
  totalDamage: number;
  damageAfterOneBlock: number;
  damageAfterTwoBlocks: number;
  damageAfterThreeBlocks: number;
  defendersNeeded: number;
  lethalWithoutBlocks: boolean;
  lethalThroughOneBlock: boolean;
  deckOutRisk: boolean;
  erosionRisk: boolean;
}

export interface HardAiTurnPlan {
  mode: 'lethal' | 'pressure' | 'defense' | 'stabilize' | 'setup' | 'develop';
  opponentProfileId?: string;
  ownDeck: number;
  opponentDeck: number;
  ownErosion: number;
  opponentErosion: number;
  attackers: number;
  totalAvailableDamage: number;
  damageToCritical: number;
  lethalWindow: boolean;
  opponentArchetype?: string;
  opponentTraits?: string[];
  likelyDefenders: number;
  opponentPotentialDamage: number;
  opponentDamageAfterOneBlock: number;
  opponentDamageAfterTwoBlocks: number;
  defendersNeededNextTurn: number;
  opponentLethalWithoutBlocks: boolean;
  opponentLethalThroughOneBlock: boolean;
  desperationAttack: boolean;
  attackBeforeDeveloping: boolean;
  reserveDefenders: number;
  minMainEffectScore: number;
  minBattleEffectScore: number;
  avoidSelfDraw: boolean;
  avoidSearch: boolean;
  comboId?: string;
  comboReady?: boolean;
  comboPayoffPlayable?: boolean;
  comboNotes?: string[];
  tacticalLine?: string;
  tacticalScore?: number;
  tacticalNotes?: string[];
  reason: string;
  notes: string[];
}

export function isClosingTurnPlan(plan: Pick<HardAiTurnPlan, 'mode' | 'lethalWindow' | 'tacticalLine' | 'totalAvailableDamage' | 'damageToCritical'> | undefined) {
  if (!plan) return false;
  return plan.lethalWindow ||
    plan.mode === 'lethal' ||
    plan.tacticalLine === 'lethal' ||
    plan.tacticalLine === 'erosion-lethal' ||
    plan.totalAvailableDamage >= Math.max(1, plan.damageToCritical);
}

function isDamageFatal(damage: number, deckCount: number, erosionCount: number) {
  if (damage <= 0) return false;
  return damage >= deckCount || damage >= Math.max(1, 10 - erosionCount);
}

function canThreatenNextTurn(gameState: GameState, unit: Card | null | undefined) {
  if (!unit || unit.canAttack === false || (unit.damage || 0) < 1) return false;
  if ((unit as any).battleForbiddenByEffect) return false;
  if ((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount + 1) return false;
  if ((unit as any).data?.cannotAttackThisTurn && (unit as any).data.cannotAttackThisTurn >= gameState.turnCount + 1) return false;
  return true;
}

export function estimateIncomingThreat(gameState: GameState, defender: PlayerState, profile?: DeckAiProfile): IncomingThreatEstimate {
  const opponent = getOpponent(gameState, defender);
  const attackDamages = (opponent?.unitZone || [])
    .filter(unit => canThreatenNextTurn(gameState, unit))
    .map(unit => Math.max(0, unit?.damage || 0))
    .sort((a, b) => b - a);
  const totalDamage = attackDamages.reduce((sum, damage) => sum + damage, 0);
  const damageAfterBlocks = (blocks: number) =>
    Math.max(0, totalDamage - attackDamages.slice(0, blocks).reduce((sum, damage) => sum + damage, 0));
  const ownErosion = countErosion(defender);
  const criticalDeck = profile ? riskValue(profile, 'criticalDeck', 3) : 3;
  const deckCount = defender.deck.length;
  const damageAfterOneBlock = damageAfterBlocks(1);
  const damageAfterTwoBlocks = damageAfterBlocks(2);
  const damageAfterThreeBlocks = damageAfterBlocks(3);
  const lethalWithoutBlocks = isDamageFatal(totalDamage, deckCount, ownErosion);
  const lethalThroughOneBlock = isDamageFatal(damageAfterOneBlock, deckCount, ownErosion);
  let defendersNeeded = 0;

  for (let blocks = 0; blocks <= Math.min(3, attackDamages.length); blocks++) {
    if (!isDamageFatal(damageAfterBlocks(blocks), deckCount, ownErosion)) {
      defendersNeeded = blocks;
      break;
    }
    defendersNeeded = Math.min(3, blocks + 1);
  }

  const deckOutRisk =
    totalDamage > deckCount ||
    damageAfterOneBlock > deckCount ||
    deckCount <= criticalDeck;
  const erosionRisk =
    totalDamage >= Math.max(1, 10 - ownErosion) ||
    damageAfterOneBlock >= Math.max(1, 10 - ownErosion);

  return {
    attackers: attackDamages.length,
    attackDamages,
    totalDamage,
    damageAfterOneBlock,
    damageAfterTwoBlocks,
    damageAfterThreeBlocks,
    defendersNeeded,
    lethalWithoutBlocks,
    lethalThroughOneBlock,
    deckOutRisk,
    erosionRisk,
  };
}

function opponentProfileId(gameState: GameState, opponentUid?: string) {
  if (!opponentUid) return undefined;
  return (gameState as any).botDeckProfiles?.[opponentUid] ||
    (gameState.players[opponentUid] as any)?.botDeckProfileId;
}

function getOpponentDeckProfile(gameState: GameState, opponentUid?: string) {
  return inferPlayerDeckProfile(gameState, opponentUid);
}

function getActiveMatchupPlan(
  gameState: GameState,
  player: PlayerState,
  profile: DeckAiProfile,
  opponentDeckProfile?: PlayerDeckProfile
) {
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const profileId = opponentProfileId(gameState, opponentUid);
  const presetPlan = profileId ? profile.matchupPlans?.[profileId] : undefined;
  const dynamicPlan = buildDynamicMatchupPlan(opponentDeckProfile || getOpponentDeckProfile(gameState, opponentUid), profile);
  return mergeMatchupPlans(presetPlan, dynamicPlan);
}

function buildStrategyContext(
  gameState: GameState,
  player: PlayerState,
  profile: DeckAiProfile,
  matchupPlan?: ReturnType<typeof getActiveMatchupPlan>,
  opponentDeckProfile?: PlayerDeckProfile
): DeckAiStrategyContext {
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
  const resolvedOpponentProfile = opponentDeckProfile || getOpponentDeckProfile(gameState, opponentUid);
  return {
    gameState,
    player,
    opponent,
    opponentDeckProfile: resolvedOpponentProfile,
    matchupPlan: matchupPlan || getActiveMatchupPlan(gameState, player, profile, resolvedOpponentProfile),
  };
}

function safeHookNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function applyCardScoreHook(
  profile: DeckAiProfile,
  hookName: keyof Pick<
    NonNullable<DeckAiProfile['strategyHooks']>,
    | 'adjustCardValue'
    | 'adjustPlayableScore'
    | 'adjustAttackScore'
    | 'adjustDefenseScore'
    | 'adjustMulliganScore'
    | 'adjustDiscardScore'
    | 'adjustPaymentScore'
  >,
  context: DeckAiCardScoreContext
) {
  try {
    return safeHookNumber(profile.strategyHooks?.[hookName]?.(context));
  } catch {
    return 0;
  }
}

function applyEffectScoreHook(profile: DeckAiProfile, context: DeckAiEffectScoreContext) {
  try {
    return safeHookNumber(profile.strategyHooks?.adjustEffectScore?.(context));
  } catch {
    return 0;
  }
}

function applyQueryScoreHook(profile: DeckAiProfile, context: DeckAiQueryScoreContext) {
  try {
    return safeHookNumber(profile.strategyHooks?.adjustQueryScore?.(context));
  } catch {
    return 0;
  }
}

function selectScoredEntries<T extends { score: number }>(scored: T[], requiredCount: number, maxCount: number) {
  const selected: T[] = [];
  for (const entry of scored) {
    if (selected.length < requiredCount || (selected.length < maxCount && entry.score > 0)) {
      selected.push(entry);
    }
    if (selected.length >= maxCount) break;
  }
  return selected;
}

function riskValue(profile: DeckAiProfile, key: keyof NonNullable<DeckAiProfile['riskThresholds']>, fallback: number) {
  const value = profile.riskThresholds?.[key];
  return typeof value === 'number' ? value : fallback;
}

function matchupRiskValue(
  gameState: GameState,
  player: PlayerState,
  profile: DeckAiProfile,
  key: 'stopSelfDrawAtDeck' | 'stopSearchAtDeck',
  fallback: number
) {
  const matchup = getActiveMatchupPlan(gameState, player, profile);
  const value = matchup?.[key] ?? profile.riskThresholds?.[key];
  return typeof value === 'number' ? value : fallback;
}

export interface TacticalTurnSearchResult {
  line: 'lethal' | 'erosion-lethal' | 'combo' | 'stabilize' | 'pressure' | 'develop';
  score: number;
  forceAttackBeforeDeveloping?: boolean;
  reserveDefenders?: number;
  minMainEffectScoreDelta?: number;
  minBattleEffectScoreDelta?: number;
  notes: string[];
}

export function analyzeOneTurnTactics(
  gameState: GameState,
  player: PlayerState,
  profile: DeckAiProfile
): TacticalTurnSearchResult {
  const opponent = getOpponent(gameState, player);
  const attackers = player.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
  const attackerDamage = attackers
    .map(unit => Math.max(0, unit.damage || 0))
    .sort((a, b) => b - a);
  const totalDamage = attackerDamage.reduce((sum, damage) => sum + damage, 0);
  const opponentErosion = opponent ? countErosion(opponent) : 0;
  const damageToCritical = Math.max(1, 10 - opponentErosion);
  const likelyDefenders = countLikelyDefenders(gameState, opponent);
  const damageThroughLikelyDefenders = Math.max(
    0,
    totalDamage - attackerDamage.slice(0, likelyDefenders).reduce((sum, damage) => sum + damage, 0)
  );
  const incomingThreat = estimateIncomingThreat(gameState, player, profile);
  const combo = getBestComboOpportunity(gameState, player, profile);
  const notes: string[] = [];

  if (opponent && totalDamage > opponent.deck.length) {
    notes.push(`deck lethal damage=${totalDamage}/${opponent.deck.length}`);
    return {
      line: 'lethal',
      score: 130 + totalDamage * 5,
      forceAttackBeforeDeveloping: true,
      reserveDefenders: 0,
      minMainEffectScoreDelta: -2,
      minBattleEffectScoreDelta: -3,
      notes,
    };
  }

  if (totalDamage >= damageToCritical || damageThroughLikelyDefenders >= damageToCritical) {
    notes.push(`erosion lethal damage=${totalDamage}/${damageToCritical}`);
    if (likelyDefenders > 0) notes.push(`through defenders=${damageThroughLikelyDefenders}`);
    return {
      line: 'erosion-lethal',
      score: 112 + totalDamage * 4 - likelyDefenders * 5,
      forceAttackBeforeDeveloping: true,
      reserveDefenders: 0,
      minMainEffectScoreDelta: -1.5,
      minBattleEffectScoreDelta: -2.5,
      notes,
    };
  }

  if (combo?.wantsAllianceAttack || combo?.payoffPlayableNow) {
    notes.push(`combo ${combo.name}`);
    if (combo.reasons.length) notes.push(combo.reasons.join('|'));
    return {
      line: 'combo',
      score: combo.score,
      forceAttackBeforeDeveloping: true,
      reserveDefenders: Math.max(0, Math.min(1, attackers.length - 2)),
      minBattleEffectScoreDelta: -4,
      notes,
    };
  }

  if (incomingThreat.lethalWithoutBlocks || incomingThreat.defendersNeeded >= 2) {
    notes.push(`incoming lethal=${incomingThreat.lethalWithoutBlocks}`);
    notes.push(`need blockers=${incomingThreat.defendersNeeded}`);
    return {
      line: 'stabilize',
      score: 85 + incomingThreat.defendersNeeded * 12,
      forceAttackBeforeDeveloping: false,
      reserveDefenders: Math.min(3, Math.max(incomingThreat.defendersNeeded, 1)),
      minMainEffectScoreDelta: -1,
      notes,
    };
  }

  if (attackers.length > 0 && (opponentErosion >= 6 || (opponent && opponent.deck.length <= riskValue(profile, 'lowDeck', 10)))) {
    notes.push(`pressure damage=${totalDamage}`);
    return {
      line: 'pressure',
      score: 45 + totalDamage * 4 + opponentErosion * 2,
      forceAttackBeforeDeveloping: true,
      reserveDefenders: incomingThreat.defendersNeeded > 0 ? Math.min(1, incomingThreat.defendersNeeded) : 0,
      minBattleEffectScoreDelta: -1,
      notes,
    };
  }

  return {
    line: 'develop',
    score: 10 + attackers.length * 2,
    notes: ['no forcing tactic'],
  };
}

export interface MainPhaseSequencingPlan {
  shouldDevelopBeforeAttack: boolean;
  bestScore: number;
  bestSubject?: string;
  notes: string[];
}

export function scoreMainPhaseCardSequencingValue(gameState: GameState, player: PlayerState, card: Card, profile: DeckAiProfile) {
  if (gameState.phase !== 'MAIN' || !player.isTurn) return 0;
  const opponent = getOpponent(gameState, player);
  const attackers = player.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
  if (!opponent || attackers.length === 0) return 0;

  const text = cardSearchText(card).toUpperCase();
  const knowledge = getCardKnowledge(card);
  const roles = new Set(knowledge?.roles || []);
  const likelyDefenders = countLikelyDefenders(gameState, opponent);
  const opponentErosion = countErosion(opponent);
  const totalAvailableDamage = attackers.reduce((sum, unit) => sum + Math.max(0, unit.damage || 0), 0);
  const damageToCritical = Math.max(1, 10 - opponentErosion);
  const pressureReady =
    totalAvailableDamage >= Math.max(1, damageToCritical - 1) ||
    opponentErosion >= riskValue(profile, 'highErosion', 7) ||
    opponent.deck.length <= riskValue(profile, 'lowDeck', 10);
  const openUnitSlots = player.unitZone.filter(slot => slot === null).length;
  const cardDamage = Math.max(0, card.damage || 0);
  const immediateAttacker =
    card.type === 'UNIT' &&
    openUnitSlots > 0 &&
    cardDamage > 0 &&
    (card.isrush || textHasAny(text, [/RUSH|速攻|闁插秶鐤唡缁旀牜鐤?/]));
  const preCombatTempo =
    (roles.has('removal') || roles.has('tempo') || textHasAny(text, [
      /DESTROY|EXILE|BANISH|SILENCE|CANNOT.*DEFEND|CANNOT_DEFEND|EXHAUST|TAP|BOUNCE|RETURN.*HAND/i,
      /鐮村潖|闄ゅ|妯疆|涓嶈兘闃插尽|涓嶈兘鏀诲嚮/,
    ])) &&
    likelyDefenders > 0;
  const summonFromResource =
    openUnitSlots > 0 &&
    (roles.has('summon' as any) || roles.has('revive' as any) || textHasAny(text, [
      /SUMMON|REVIVE|REANIMATE|PLAY_FROM|PUT.*FIELD|EROSION|GRAVE|DECK.*FIELD/i,
      /渚佃殌|澧撳湴|閹存ê婧€|鐐煎 金|降灵|闄电伒/,
    ]));
  const whiteArcherLine =
    card.id === '101130202' &&
    openUnitSlots >= 2 &&
    player.hand.some(other =>
      other.gamecardId !== card.gamecardId &&
      other.type === 'UNIT' &&
      !other.godMark &&
      (other.acValue || 0) <= 3
    );

  let score = 0;
  if (preCombatTempo) {
    score += 42 + likelyDefenders * 12;
    if (pressureReady) score += 28;
    if (totalAvailableDamage >= damageToCritical && likelyDefenders > 0) score += 36;
  }
  if (immediateAttacker) {
    score += 24 + cardDamage * 10 + Math.max(0, card.power || 0) / 900;
    if (totalAvailableDamage + cardDamage >= damageToCritical) score += 30;
    if (opponent.deck.length <= totalAvailableDamage + cardDamage) score += 24;
  }
  if (summonFromResource) {
    score += profile.gamePlan?.mode === 'engine' || profile.gamePlan?.mode === 'combo' ? 24 : 22;
    if (textHasAny(text, [/EROSION|PLAY\s*FROM|PLAY_FROM|渚佃殌/])) score += 18;
    if (profile.gamePlan?.mode === 'tempo' || profile.gamePlan?.primaryGoal === 'deckPressure') score += 8;
    if (pressureReady) score += 18;
  }
  if (whiteArcherLine) score += 44;

  return score;
}

export function analyzeMainPhaseSequencing(gameState: GameState, player: PlayerState, profile: DeckAiProfile): MainPhaseSequencingPlan {
  if (gameState.phase !== 'MAIN' || !player.isTurn) {
    return { shouldDevelopBeforeAttack: false, bestScore: 0, notes: [] };
  }
  const opponent = getOpponent(gameState, player);
  const attackers = player.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
  if (!opponent || attackers.length === 0) {
    return { shouldDevelopBeforeAttack: false, bestScore: 0, notes: [] };
  }

  const likelyDefenders = countLikelyDefenders(gameState, opponent);
  const totalAvailableDamage = attackers.reduce((sum, unit) => sum + Math.max(0, unit.damage || 0), 0);
  const opponentErosion = countErosion(opponent);
  const directNoBlockLethal =
    likelyDefenders === 0 &&
    (
      totalAvailableDamage > opponent.deck.length ||
      totalAvailableDamage >= Math.max(1, 10 - opponentErosion)
    );
  if (directNoBlockLethal) {
    return { shouldDevelopBeforeAttack: false, bestScore: 0, notes: ['direct lethal does not wait for setup'] };
  }

  const handCandidates = player.hand.map(card => ({
    subject: card.fullName || card.id,
    score: scoreMainPhaseCardSequencingValue(gameState, player, card, profile),
  }));
  const boardEffectCandidates = [
    ...player.unitZone,
    ...player.itemZone,
    ...player.erosionFront,
    ...player.grave,
  ]
    .filter((card): card is Card => !!card)
    .flatMap(card => (card.effects || []).map(effect => {
      if (!(effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED')) return undefined;
      if (effect.id === '102050432_reset_attack_unit' && !card.isExhausted) return undefined;
      const text = effectSearchText(card, effect).toUpperCase();
      const isPreCombatEffect = textHasAny(text, [
        /DESTROY|EXILE|BANISH|SILENCE|CANNOT.*DEFEND|CANNOT_DEFEND|EXHAUST|TAP|BOUNCE|RETURN.*HAND|SUMMON|REVIVE|PLAY_FROM|EROSION/i,
        /鐮村潖|闄ゅ|妯疆|涓嶈兘闃插尽|渚佃殌|澧撳湴|降灵/,
      ]);
      if (!isPreCombatEffect) return undefined;
      let score = 18;
      if (likelyDefenders > 0) score += 24 + likelyDefenders * 8;
      if (totalAvailableDamage >= Math.max(1, 10 - opponentErosion - 1)) score += 18;
      return { subject: `${card.fullName || card.id} #${effect.id || '?'}`, score };
    }).filter(Boolean) as Array<{ subject: string; score: number }>);

  const best = [...handCandidates, ...boardEffectCandidates]
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0];
  const shouldDevelopBeforeAttack = !!best && best.score >= 36;
  return {
    shouldDevelopBeforeAttack,
    bestScore: best?.score || 0,
    bestSubject: best?.subject,
    notes: best ? [`pre-combat action ${best.subject} score=${best.score.toFixed(1)}`] : [],
  };
}

export function buildTurnPlan(gameState: GameState, player: PlayerState, profile: DeckAiProfile): HardAiTurnPlan {
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
  const opponentDeckProfileId = opponentProfileId(gameState, opponentUid);
  const opponentDeckProfile = getOpponentDeckProfile(gameState, opponentUid);
  const matchup = getActiveMatchupPlan(gameState, player, profile, opponentDeckProfile);
  const gamePlan = profile.gamePlan;
  const attackers = player.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
  const ownErosion = countErosion(player);
  const opponentErosion = opponent ? countErosion(opponent) : 0;
  const totalAvailableDamage = attackers.reduce((sum, unit) => sum + (unit.damage || 0), 0);
  const damageToCritical = Math.max(1, 10 - opponentErosion);
  const erosionPressureWindow = totalAvailableDamage >= damageToCritical;
  const lethalWindow = opponent ? totalAvailableDamage > opponent.deck.length : false;
  const likelyDefenders = countLikelyDefenders(gameState, opponent);
  const incomingThreat = estimateIncomingThreat(gameState, player, profile);
  const opponentPotentialDamage = incomingThreat.totalDamage;

  const lowDeck = riskValue(profile, 'lowDeck', 10);
  const criticalDeck = riskValue(profile, 'criticalDeck', 3);
  const reserveDeck = riskValue(profile, 'reserveDefendersAtDeck', lowDeck);
  const highErosion = riskValue(profile, 'highErosion', 7);
  const criticalErosion = riskValue(profile, 'criticalErosion', 9);
  const stopSelfDrawAtDeck = matchup?.stopSelfDrawAtDeck ?? riskValue(profile, 'stopSelfDrawAtDeck', lowDeck);
  const stopSearchAtDeck = matchup?.stopSearchAtDeck ?? riskValue(profile, 'stopSearchAtDeck', lowDeck);

  const attackPriority = (gamePlan?.attackPriority ?? 0) + (matchup?.attackBias ?? 0);
  const defensePriority = (gamePlan?.defensePriority ?? 0) + (matchup?.defenseBias ?? 0);
  const effectPriority = (gamePlan?.effectPriority ?? 0) + (matchup?.effectBias ?? 0);
  const closeGameBias = (gamePlan?.closeGameBias ?? 0) + (matchup?.closeGameBias ?? 0);
  const reserveBias = (gamePlan?.defenderReserveBias ?? 0) + (matchup?.defenderReserveBias ?? 0);
  const pressureLine = Math.max(5, 8 - Math.round(closeGameBias));
  const ownDeckDanger = player.deck.length <= lowDeck;
  const ownCritical = player.deck.length <= criticalDeck || ownErosion >= criticalErosion;
  const opponentPressure = erosionPressureWindow || opponentErosion >= pressureLine || (opponent ? opponent.deck.length <= lowDeck : false);
  const deckOutClock = player.deck.length <= Math.max(1, criticalDeck);
  const canPressureBeforeDeckOut =
    erosionPressureWindow ||
    opponentErosion >= highErosion ||
    (opponent ? opponent.deck.length <= lowDeck : false) ||
    totalAvailableDamage >= Math.max(1, damageToCritical - 1);
  const desperationAttack =
    deckOutClock &&
    attackers.length > 0 &&
    (
      canPressureBeforeDeckOut ||
      opponentPotentialDamage <= 0 ||
      incomingThreat.defendersNeeded === 0 ||
      incomingThreat.defendersNeeded > attackers.length ||
      incomingThreat.lethalThroughOneBlock
    );

  let mode: HardAiTurnPlan['mode'] = 'develop';
  if (lethalWindow) mode = 'lethal';
  else if (desperationAttack) mode = 'pressure';
  else if (ownCritical || incomingThreat.lethalWithoutBlocks || incomingThreat.defendersNeeded >= 2) mode = 'defense';
  else if (opponentPressure || ownDeckDanger) mode = 'pressure';
  else if (gamePlan?.primaryGoal === 'boardControl' && likelyDefenders > 0) mode = 'stabilize';
  else if (gamePlan?.mode === 'engine' || gamePlan?.mode === 'combo') mode = 'setup';

  let attackBeforeDeveloping =
    gameState.turnCount > 1 &&
    attackers.length > 0 &&
    (
      lethalWindow ||
      desperationAttack ||
      opponentPressure ||
      player.deck.length <= reserveDeck ||
      (attackPriority + closeGameBias >= 2 && totalAvailableDamage >= Math.max(1, damageToCritical - 1))
    );

  let reserveDefenders = 0;
  if (!lethalWindow && attackers.length > 0) {
    if (player.deck.length <= reserveDeck) reserveDefenders += 1;
    if (player.deck.length <= criticalDeck + 4) reserveDefenders += 1;
    if (ownErosion >= highErosion) reserveDefenders += 1;
    if (opponentPotentialDamage >= Math.max(4, 10 - ownErosion)) reserveDefenders += 1;
    if (incomingThreat.lethalWithoutBlocks) reserveDefenders += 1;
    if (incomingThreat.lethalThroughOneBlock) reserveDefenders += 1;
    reserveDefenders = Math.max(reserveDefenders, incomingThreat.defendersNeeded);
    if (gamePlan?.mode === 'control') reserveDefenders += 1;
    if (gamePlan?.mode === 'aggro') reserveDefenders -= 1;
    reserveDefenders += Math.round(reserveBias);
  }
  if (desperationAttack && !incomingThreat.lethalThroughOneBlock) {
    reserveDefenders = 0;
  } else if (desperationAttack) {
    reserveDefenders = Math.min(reserveDefenders, Math.max(0, attackers.length - 1));
  }
  if (opponentPotentialDamage <= 0 && incomingThreat.attackers === 0 && !incomingThreat.lethalWithoutBlocks) {
    reserveDefenders = 0;
  }
  if (
    incomingThreat.defendersNeeded <= 1 &&
    !ownCritical &&
    ownErosion <= 3 &&
    player.deck.length > criticalDeck &&
    opponentPotentialDamage <= Math.max(5, 10 - ownErosion)
  ) {
    reserveDefenders = Math.min(reserveDefenders, 1);
  }
  if (opponent && (opponent.deck.length <= lowDeck || opponentErosion >= highErosion || totalAvailableDamage >= Math.max(1, damageToCritical - 2))) {
    reserveDefenders = Math.max(
      incomingThreat.defendersNeeded,
      Math.min(reserveDefenders, likelyDefenders > 0 ? 1 : 0)
    );
  }
  reserveDefenders = Math.max(0, Math.min(3, attackers.length, reserveDefenders));

  let minMainEffectScore = Math.max(5.5, 8.5 - effectPriority * 0.6 + (ownDeckDanger ? 0.8 : 0));
  let minBattleEffectScore = Math.max(7, 9.5 - effectPriority * 0.55 - (lethalWindow ? 0.8 : 0));
  const notes = [
    gamePlan?.mode ? `mode=${gamePlan.mode}` : undefined,
    gamePlan?.primaryGoal ? `goal=${gamePlan.primaryGoal}` : undefined,
    matchup ? (opponentDeckProfileId ? `matchup=${opponentDeckProfileId}` : 'matchup=dynamic') : undefined,
    opponentDeckProfile ? `opponent=${opponentDeckProfile.archetype}` : undefined,
    ownDeckDanger ? 'low deck' : undefined,
    desperationAttack ? 'deck-out race' : undefined,
    lethalWindow ? 'lethal window' : undefined,
    !lethalWindow && erosionPressureWindow ? 'erosion pressure' : undefined,
    incomingThreat.lethalWithoutBlocks ? 'incoming lethal' : undefined,
    incomingThreat.defendersNeeded > 0 ? `need blockers=${incomingThreat.defendersNeeded}` : undefined,
  ].filter(Boolean) as string[];
  let avoidSelfDraw = player.deck.length <= stopSelfDrawAtDeck;
  let avoidSearch = player.deck.length <= stopSearchAtDeck;

  const tactical = analyzeOneTurnTactics(gameState, player, profile);
  if (tactical.line !== 'develop') {
    notes.push(`tactical=${tactical.line}`);
    notes.push(...tactical.notes.map(note => `tactical ${note}`));
  }
  if (tactical.line === 'lethal' || tactical.line === 'erosion-lethal') {
    mode = 'lethal';
  } else if (tactical.line === 'combo' && mode !== 'defense') {
    mode = 'pressure';
  } else if (tactical.line === 'stabilize') {
    mode = incomingThreat.lethalWithoutBlocks ? 'defense' : 'stabilize';
  }
  if (typeof tactical.forceAttackBeforeDeveloping === 'boolean') {
    attackBeforeDeveloping = tactical.forceAttackBeforeDeveloping;
  }
  if (typeof tactical.reserveDefenders === 'number') {
    reserveDefenders = Math.max(0, Math.min(3, attackers.length, tactical.reserveDefenders));
  }
  if (typeof tactical.minMainEffectScoreDelta === 'number') {
    minMainEffectScore = Math.max(4, minMainEffectScore + tactical.minMainEffectScoreDelta);
  }
  if (typeof tactical.minBattleEffectScoreDelta === 'number') {
    minBattleEffectScore = Math.max(4.5, minBattleEffectScore + tactical.minBattleEffectScoreDelta);
  }

  const sequencing = analyzeMainPhaseSequencing(gameState, player, profile);
  if (sequencing.shouldDevelopBeforeAttack && attackBeforeDeveloping) {
    attackBeforeDeveloping = false;
    minMainEffectScore = Math.min(minMainEffectScore, 5.5);
    notes.push(...sequencing.notes.map(note => `sequence ${note}`));
  }

  const turnPlanSnapshot: DeckAiTurnPlanSnapshot = {
    mode,
    ownDeck: player.deck.length,
    opponentDeck: opponent?.deck.length || 0,
    ownErosion,
    opponentErosion,
    attackers: attackers.length,
    totalAvailableDamage,
    likelyDefenders,
    opponentPotentialDamage,
    defendersNeededNextTurn: incomingThreat.defendersNeeded,
    lethalWindow,
  };
  const strategyContext = buildStrategyContext(gameState, player, profile, matchup, opponentDeckProfile);
  let turnAdjustment;
  try {
    turnAdjustment = profile.strategyHooks?.adjustTurnPlan?.({
      ...strategyContext,
      plan: turnPlanSnapshot,
    });
  } catch {
    turnAdjustment = undefined;
  }
  if (turnAdjustment) {
    if (turnAdjustment.mode) mode = turnAdjustment.mode;
    if (typeof turnAdjustment.attackBeforeDeveloping === 'boolean') {
      attackBeforeDeveloping = turnAdjustment.attackBeforeDeveloping;
    }
    if (typeof turnAdjustment.reserveDefendersDelta === 'number') {
      reserveDefenders = Math.max(0, Math.min(3, attackers.length, reserveDefenders + Math.round(turnAdjustment.reserveDefendersDelta)));
    }
    if (typeof turnAdjustment.minMainEffectScoreDelta === 'number') {
      minMainEffectScore = Math.max(4, minMainEffectScore + turnAdjustment.minMainEffectScoreDelta);
    }
    if (typeof turnAdjustment.minBattleEffectScoreDelta === 'number') {
      minBattleEffectScore = Math.max(5, minBattleEffectScore + turnAdjustment.minBattleEffectScoreDelta);
    }
    if (typeof turnAdjustment.avoidSelfDraw === 'boolean') avoidSelfDraw = turnAdjustment.avoidSelfDraw;
    if (typeof turnAdjustment.avoidSearch === 'boolean') avoidSearch = turnAdjustment.avoidSearch;
    if (turnAdjustment.notes?.length) notes.push(...turnAdjustment.notes);
  }
  if (sequencing.shouldDevelopBeforeAttack && attackBeforeDeveloping) {
    attackBeforeDeveloping = false;
    minMainEffectScore = Math.min(minMainEffectScore, 5.5);
    const sequencingNotes = sequencing.notes.map(note => `sequence ${note}`);
    for (const note of sequencingNotes) {
      if (!notes.includes(note)) notes.push(note);
    }
  }

  const combo = getBestComboOpportunity(gameState, player, profile);
  if (combo?.partial) {
    notes.push(`combo=${combo.name}`);
    if (combo.reasons.length) notes.push(`combo reasons=${combo.reasons.join('|')}`);
    if (combo.wantsAllianceAttack) {
      mode = mode === 'defense' && incomingThreat.lethalWithoutBlocks ? 'stabilize' : 'pressure';
      attackBeforeDeveloping = true;
      reserveDefenders = Math.max(0, Math.min(reserveDefenders, Math.max(0, attackers.length - 2)));
      minBattleEffectScore = Math.min(minBattleEffectScore, 5.5);
      notes.push('combo wants alliance attack');
    } else if (combo.payoffPlayableNow) {
      minBattleEffectScore = Math.min(minBattleEffectScore, 4.5);
      notes.push('combo payoff playable');
    }
  }

  return {
    mode,
    opponentProfileId: opponentDeckProfileId,
    ownDeck: player.deck.length,
    opponentDeck: opponent?.deck.length || 0,
    ownErosion,
    opponentErosion,
    attackers: attackers.length,
    totalAvailableDamage,
    damageToCritical,
    lethalWindow,
    opponentArchetype: opponentDeckProfile?.archetype,
    opponentTraits: opponentDeckProfile?.traits,
    likelyDefenders,
    opponentPotentialDamage,
    opponentDamageAfterOneBlock: incomingThreat.damageAfterOneBlock,
    opponentDamageAfterTwoBlocks: incomingThreat.damageAfterTwoBlocks,
    defendersNeededNextTurn: incomingThreat.defendersNeeded,
    opponentLethalWithoutBlocks: incomingThreat.lethalWithoutBlocks,
    opponentLethalThroughOneBlock: incomingThreat.lethalThroughOneBlock,
    desperationAttack,
    attackBeforeDeveloping,
    reserveDefenders,
    minMainEffectScore,
    minBattleEffectScore,
    avoidSelfDraw,
    avoidSearch,
    comboId: combo?.id,
    comboReady: combo?.ready,
    comboPayoffPlayable: combo?.payoffPlayableNow,
    comboNotes: combo?.reasons,
    tacticalLine: tactical.line,
    tacticalScore: tactical.score,
    tacticalNotes: tactical.notes,
    reason: `turn plan: ${mode}`,
    notes,
  };
}

export function scoreCardValue(card: Card | null | undefined, profile: DeckAiProfile, context: Partial<DeckAiStrategyContext> = {}) {
  if (!card) return 0;
  const weights = profile.weights;
  const preferredIdBonus = profile.preferredCardIds?.[card.id] || profile.preferredCardIds?.[card.uniqueId] || 0;
  const preserveBonus = profile.preserveCardIds?.[card.id] || profile.preserveCardIds?.[card.uniqueId] || 0;
  const factionBonus = profile.preferredFactions?.includes(String(card.faction)) ? 2 : 0;
  const knowledge = getCardKnowledge(card);
  const effectBonus = (knowledge?.roles.length || 0) * weights.effectText;
  const costBonus = Math.max(0, 6 - getCardCost(card)) * weights.lowCost;
  const knowledgeBase = knowledge?.baseValue || 0;

  let score = 0;

  if (card.type === 'UNIT') {
    score = (
      knowledgeBase +
      ((card.power || 0) / 1000) * weights.unitPower +
      (card.damage || 0) * weights.unitDamage +
      (card.isrush ? weights.unitRush : 0) +
      (card.godMark ? weights.unitGodMark : 0) +
      costBonus +
      effectBonus +
      factionBonus +
      preferredIdBonus +
      preserveBonus
    );
  } else if (card.type === 'ITEM') {
    score = knowledgeBase + weights.itemValue + costBonus + effectBonus + factionBonus + preferredIdBonus + preserveBonus;
  } else {
    score = knowledgeBase + weights.storyValue + costBonus + effectBonus + factionBonus + preferredIdBonus + preserveBonus;
  }

  if (context.gameState && context.player) {
    score += scoreComboCard(context.gameState, context.player, card, profile, 'value');
    score += applyCardScoreHook(profile, 'adjustCardValue', {
      ...context,
      card,
      score,
      reason: 'value',
    });
  }

  return score;
}

function cardSearchText(card: Card) {
  return [
    card.id,
    card.uniqueId,
    card.fullName,
    card.specialName,
    card.faction,
    card.color,
    ...(card.effects || []).flatMap(effect => [
      effect.id,
      effect.content,
      effect.description,
      effect.triggerEvent,
      effect.targetSpec?.title,
      effect.targetSpec?.description,
      effect.targetSpec?.modeTitle,
      effect.targetSpec?.modeDescription,
      ...(effect.targetSpec?.modeOptions || []).flatMap(mode => [mode.id, mode.label, mode.description, mode.modeDescription]),
    ]),
  ]
    .filter(Boolean)
    .join(' ');
}

function countCardsInZones(player: PlayerState | undefined, zones: string[] | undefined) {
  if (!player) return 0;
  const wanted = new Set(zones && zones.length > 0 ? zones : ['UNIT', 'ITEM', 'GRAVE', 'EROSION_FRONT', 'EROSION_BACK', 'PLAY']);
  let count = 0;
  if (wanted.has('UNIT')) count += player.unitZone.filter(Boolean).length;
  if (wanted.has('ITEM')) count += player.itemZone.filter(Boolean).length;
  if (wanted.has('GRAVE')) count += player.grave.filter(Boolean).length;
  if (wanted.has('EXILE')) count += player.exile.filter(Boolean).length;
  if (wanted.has('HAND')) count += player.hand.filter(Boolean).length;
  if (wanted.has('DECK')) count += player.deck.filter(Boolean).length;
  if (wanted.has('EROSION_FRONT')) count += player.erosionFront.filter(Boolean).length;
  if (wanted.has('EROSION_BACK')) count += player.erosionBack.filter(Boolean).length;
  if (wanted.has('PLAY')) count += player.playZone.filter(Boolean).length;
  return count;
}

function estimateEffectTargetCount(gameState: GameState, player: PlayerState, card: Card, effect: CardEffect) {
  const spec = effect.targetSpec;
  if (!spec) return 0;

  const opponent = getOpponent(gameState, player);
  const shapes = spec.modeOptions?.length
    ? spec.modeOptions
    : spec.targetGroups?.length
      ? spec.targetGroups
      : [spec];

  let bestCount = 0;
  for (const shape of shapes) {
    const option = shape as any;
    try {
      if (typeof option.condition === 'function' && !option.condition(gameState, player, card)) {
        continue;
      }
    } catch {
      continue;
    }

    if (typeof option.getCandidates === 'function') {
      try {
        bestCount = Math.max(bestCount, option.getCandidates(gameState, player, card)?.length || 0);
        continue;
      } catch {
        // Fall back to broad zone counting below.
      }
    }

    const controller = option.controller || spec.controller || 'ANY';
    const zones = option.zones || spec.zones;
    if (controller === 'SELF') {
      bestCount = Math.max(bestCount, countCardsInZones(player, zones));
    } else if (controller === 'OPPONENT') {
      bestCount = Math.max(bestCount, countCardsInZones(opponent, zones));
    } else {
      bestCount = Math.max(bestCount, countCardsInZones(player, zones) + countCardsInZones(opponent, zones));
    }
  }

  return bestCount;
}

function bestStoryEffectTimingScore(gameState: GameState, player: PlayerState, card: Card) {
  const effects = card.effects || [];
  if (effects.length === 0) return 0;
  return effects.reduce((best, effect) => {
    const targetCount = estimateEffectTargetCount(gameState, player, card, effect);
    const timing = scoreEffectTimingWindow(gameState, player, card, effect, {
      targetCount,
      hasTargetSpec: !!effect.targetSpec,
    });
    return Math.max(best, timing.score);
  }, -20);
}

const PREVENT_NEXT_DESTROY_EFFECT_IDS = new Set([
  '201000059_prevent_destroy',
]);
const PREVENT_BATTLE_DESTROY_EFFECT_IDS = new Set([
  '101150208_prevent_battle_destroy',
]);
const WHITE_TIGER_BATTLE_EXILE_RETURN_EFFECT_ID = '101000501_battle_exile_return';
const PREVENT_NEXT_DESTROY_HIGH_VALUE_THRESHOLD = 65;

function isPreventNextDestroyEffect(effect: CardEffect | undefined) {
  if (!effect) return false;
  const id = effect.id || '';
  const text = `${id} ${effect.content || ''} ${effect.description || ''}`;
  return PREVENT_NEXT_DESTROY_EFFECT_IDS.has(id) ||
    /PREVENT[_-]*(?:NEXT[_-]*)?DESTROY/i.test(text);
}

function hasPreventNextDestroyEffect(card: Card) {
  return (card.effects || []).some(isPreventNextDestroyEffect);
}

function isPreventNextDestroyQuery(query: EffectQuery) {
  const effectId = String(query.context?.effectId || '');
  return PREVENT_NEXT_DESTROY_EFFECT_IDS.has(effectId) ||
    /PREVENT[_-]*(?:NEXT[_-]*)?DESTROY/i.test(queryText(query));
}

function isPreventBattleDestroyEffect(effect: CardEffect | undefined) {
  if (!effect) return false;
  const id = effect.id || '';
  const text = `${id} ${effect.content || ''} ${effect.description || ''}`;
  return PREVENT_BATTLE_DESTROY_EFFECT_IDS.has(id) ||
    /PREVENT[_-]*BATTLE[_-]*DESTROY|BATTLE[_-]*DESTROY.*PREVENT/i.test(text);
}

function isPreventBattleDestroyTargetQuery(query: EffectQuery) {
  const effectId = String(query.context?.effectId || '');
  const step = String(query.context?.step || '');
  return (PREVENT_BATTLE_DESTROY_EFFECT_IDS.has(effectId) ||
    /PREVENT[_-]*BATTLE[_-]*DESTROY|BATTLE[_-]*DESTROY.*PREVENT/i.test(queryText(query))) &&
    (!step || /TARGET/i.test(step));
}

function isPreventDestroyTargetQuery(query: EffectQuery) {
  return isPreventNextDestroyQuery(query) || isPreventBattleDestroyTargetQuery(query);
}

function getStackItemEffect(item: GameState['counterStack'][number]) {
  if (!item.card) return undefined;
  if (item.effectIndex !== undefined) return item.card.effects?.[item.effectIndex];
  return item.card.effects?.find(effect =>
    effect.type === 'ALWAYS' ||
    effect.type === 'ACTIVATE' ||
    effect.type === 'ACTIVATED'
  );
}

function stackItemSearchText(item: GameState['counterStack'][number]) {
  const effect = getStackItemEffect(item);
  return [
    item.type,
    item.card?.id,
    item.card?.uniqueId,
    item.card?.fullName,
    effect?.id,
    effect?.content,
    effect?.description,
    effect?.targetSpec?.title,
    effect?.targetSpec?.description,
    ...(effect?.targetSpec?.targetGroups || []).flatMap(group => [
      group.title,
      group.description,
      group.step,
    ]),
    ...(effect?.targetSpec?.modeOptions || []).flatMap(mode => [
      mode.id,
      mode.label,
      mode.description,
      mode.modeDescription,
    ]),
  ].filter(Boolean).join(' ');
}

function stackItemTargetIds(item: GameState['counterStack'][number]) {
  const ids = new Set<string>();
  for (const target of item.declaredTargets || []) {
    if (target.gamecardId) ids.add(target.gamecardId);
  }
  const data = item.data || {};
  for (const key of ['targetCardId', 'targetId', 'targetUnitId', 'defenderId']) {
    if (typeof data[key] === 'string') ids.add(data[key]);
  }
  if (Array.isArray(data.selections)) {
    data.selections.forEach((id: unknown) => {
      if (typeof id === 'string') ids.add(id);
    });
  }
  return ids;
}

function isDestroyingStackText(text: string) {
  return /DESTROY|DESTROY_CARD|DESTROY_UNIT|BANISH|EXILE|REMOVE|TO_GRAVE|SEND.*GRAVE|KILL|_destroy|_exile|_banish|_remove/i.test(text) &&
    !/PREVENT[_\s-]*(?:NEXT[_\s-]*)?DESTROY|INDESTRUCTIBLE|PROTECT/i.test(text);
}

function pushThreatenedUnit(
  entries: Map<string, { unit: Card; value: number; reason: string }>,
  gameState: GameState,
  player: PlayerState,
  profile: DeckAiProfile,
  unit: Card | null | undefined,
  reason: string
) {
  if (!unit || unit.cardlocation !== 'UNIT') return;
  const value = scoreStrategicBoardPresenceValue(gameState, player.uid, unit, profile);
  const { preserve, preferred } = profileCardBias(profile, unit);
  const hasHighStats = (unit.damage || 0) >= 2 || (unit.power || 0) >= 3000;
  const isHighValue =
    unit.godMark ||
    preserve > 0 ||
    preferred > 0 ||
    (hasHighStats && value >= PREVENT_NEXT_DESTROY_HIGH_VALUE_THRESHOLD);
  if (!isHighValue) return;
  const existing = entries.get(unit.gamecardId);
  if (!existing || value > existing.value) {
    entries.set(unit.gamecardId, { unit, value, reason });
  }
}

function collectBattleDestroyedOwnUnits(gameState: GameState, player: PlayerState) {
  const battle = gameState.battleState;
  if (!battle?.defender || !battle.attackers?.length) return [];
  if (!['BATTLE_FREE', 'DAMAGE_CALCULATION', 'COUNTERING'].includes(gameState.phase)) return [];

  const attackerUid = gameState.playerIds[gameState.currentTurnPlayer];
  const defenderUid = gameState.playerIds.find(uid => uid !== attackerUid);
  const attacker = gameState.players[attackerUid];
  const defender = defenderUid ? gameState.players[defenderUid] : undefined;
  if (!attacker || !defender) return [];

  const attackingUnits = battle.attackers
    .map(id => attacker.unitZone.find(unit => unit?.gamecardId === id))
    .filter((unit): unit is Card => !!unit);
  const defendingUnit = defender.unitZone.find(unit => unit?.gamecardId === battle.defender);
  if (attackingUnits.length === 0 || !defendingUnit) return [];

  const defenderPower = defendingUnit.power || 0;
  const threatened = new Set<Card>();

  if (!battle.isAlliance) {
    const attackingUnit = attackingUnits[0];
    const attackerPower = attackingUnit.power || 0;
    if (player.uid === attackerUid && attackerPower <= defenderPower) threatened.add(attackingUnit);
    if (player.uid === defenderUid && attackerPower >= defenderPower) threatened.add(defendingUnit);
    return [...threatened];
  }

  const totalAttackerPower = attackingUnits.reduce((sum, unit) => sum + (unit.power || 0), 0);
  if (player.uid === defenderUid && totalAttackerPower >= defenderPower) {
    threatened.add(defendingUnit);
  }
  if (player.uid === attackerUid) {
    if (totalAttackerPower <= defenderPower) {
      attackingUnits.forEach(unit => threatened.add(unit));
    } else {
      const lowerAttackers = attackingUnits.filter(unit => (unit.power || 0) <= defenderPower);
      const higherAttackers = attackingUnits.filter(unit => (unit.power || 0) > defenderPower);
      if (lowerAttackers.length === 1 && higherAttackers.length === 1) threatened.add(lowerAttackers[0]);
    }
  }

  return [...threatened];
}

function getPreventNextDestroyThreatContext(gameState: GameState, player: PlayerState, profile: DeckAiProfile) {
  const threatened = new Map<string, { unit: Card; value: number; reason: string }>();

  for (const item of gameState.counterStack || []) {
    if (item.ownerUid === player.uid) continue;
    const text = stackItemSearchText(item);
    if (!isDestroyingStackText(text)) continue;
    for (const targetId of stackItemTargetIds(item)) {
      const unit = player.unitZone.find(candidate => candidate?.gamecardId === targetId);
      pushThreatenedUnit(threatened, gameState, player, profile, unit, 'declared-destroy-target');
    }
  }

  for (const unit of collectBattleDestroyedOwnUnits(gameState, player)) {
    pushThreatenedUnit(threatened, gameState, player, profile, unit, 'battle-destroy');
  }

  const sorted = [...threatened.values()].sort((a, b) => b.value - a.value);
  return {
    units: sorted,
    best: sorted[0]?.unit,
    bestValue: sorted[0]?.value || 0,
    reason: sorted[0]?.reason,
  };
}

function getPreventBattleDestroyThreatContext(gameState: GameState, player: PlayerState, profile: DeckAiProfile) {
  const threatened = new Map<string, { unit: Card; value: number; reason: string }>();
  for (const unit of collectBattleDestroyedOwnUnits(gameState, player)) {
    pushThreatenedUnit(threatened, gameState, player, profile, unit, 'battle-destroy');
  }
  const sorted = [...threatened.values()].sort((a, b) => b.value - a.value);
  return {
    units: sorted,
    best: sorted[0]?.unit,
    bestValue: sorted[0]?.value || 0,
    reason: sorted[0]?.reason,
  };
}

function getPreventDestroyQueryThreatContext(gameState: GameState, player: PlayerState, profile: DeckAiProfile, query: EffectQuery) {
  return isPreventBattleDestroyTargetQuery(query)
    ? getPreventBattleDestroyThreatContext(gameState, player, profile)
    : getPreventNextDestroyThreatContext(gameState, player, profile);
}

function scoreStoryPlayDiscipline(gameState: GameState, player: PlayerState, card: Card, profile: DeckAiProfile) {
  const opponent = getOpponent(gameState, player);
  const knowledge = getCardKnowledge(card);
  const roles = new Set(knowledge?.roles || []);
  const text = cardSearchText(card);
  const upper = text.toUpperCase();
  const opponentUnits = opponent?.unitZone.filter(Boolean).length || 0;
  const opponentItems = opponent?.itemZone.filter(Boolean).length || 0;
  const opponentFieldTargets = opponentUnits + opponentItems + (opponent?.playZone.filter(Boolean).length || 0);
  const ownUnits = player.unitZone.filter(Boolean).length;
  const openUnitSlots = player.unitZone.filter(slot => slot === null).length;
  const ownAttackers = player.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
  const battleAttackers = gameState.battleState?.attackers?.filter(Boolean).length || 0;
  const opponentErosion = opponent ? countErosion(opponent) : 0;
  const totalAvailableDamage = ownAttackers.reduce((sum, unit) => sum + (unit.damage || 0), 0);
  const damageToCritical = Math.max(1, 10 - opponentErosion);
  const closeToLethal = !!opponent && (
    totalAvailableDamage >= damageToCritical - 1 ||
    opponent.deck.length <= Math.max(4, totalAvailableDamage + 1)
  );
  const comboScore = scoreComboCard(gameState, player, card, profile, 'playable');
  const timingScore = bestStoryEffectTimingScore(gameState, player, card);
  const phase = gameState.phase;
  const hasBattleContext =
    battleAttackers > 0 ||
    phase === 'BATTLE_DECLARATION' ||
    phase === 'DEFENSE_DECLARATION' ||
    phase === 'DAMAGE_CALCULATION';
  const isPreventNextDestroy = hasPreventNextDestroyEffect(card);
  const preventDestroyThreat = isPreventNextDestroy
    ? getPreventNextDestroyThreatContext(gameState, player, profile)
    : undefined;

  const isRemoval = roles.has('removal') || textHasAny(upper, [/DESTROY|BANISH|EXILE|RETURN.*HAND|BOUNCE|REMOVE|鐮村潖|闄ゅ|杩斿洖|鍥炴墜/]);
  const isDrawSearch = roles.has('draw') || roles.has('search') || textHasAny(upper, [/DRAW|SEARCH|DECK.*HAND|HAND.*DECK|鎶絴鎶搢|妫€绱鎼滅储|鍔犲叆鎵嬬墝/]);
  const isProtection = roles.has('protection') || textHasAny(upper, [/PREVENT|PROTECT|IMMUNE|INDESTRUCTIBLE|CANNOT.*DESTROY|鍏嶇柅|淇濇姢|涓嶄細琚牬鍧?/]);
  const isCounter = textHasAny(upper, [/COUNTER|NEGATE|CANCEL|RESPONSE|CONFRONT|反击|对抗/]);
  const isCombat = roles.has('damage') || roles.has('finisher') || textHasAny(upper, [/COMBAT|BATTLE|ATTACK|DAMAGE|POWER|\+\d|ADD_POWER|ADD_DAMAGE|READY|RESET|浼ゅ|鍔涢噺|閲嶇疆|绔栫疆/]);
  const isResourceSetup = roles.has('engine') || roles.has('resource') || textHasAny(upper, [/RESOURCE|ACCESS|READY|RESET|COST|SUMMON|REVIVE|REANIMATE|PLAY.*UNIT|璧勬簮|璐圭敤|鍙敜|澶嶇敓|澶嶆椿|鏀剧疆鍒版垬鍦?/]);
  const isBoardSetup = isResourceSetup || textHasAny(upper, [/UNIT|BATTLEFIELD|GRAVE|PLAY_FROM|鎴樺満|澧撳湴/]);

  let score = -48;
  let clearReasonScore = 0;

  if (comboScore >= 80) {
    clearReasonScore += 58 + comboScore * 0.15;
  } else if (comboScore > 0) {
    clearReasonScore += comboScore * 0.35;
  } else if (comboScore < 0) {
    clearReasonScore += comboScore * 0.55;
  }

  if (phase === 'MAIN') {
    if (isRemoval) {
      clearReasonScore += opponentFieldTargets > 0 ? 28 + Math.min(10, opponentFieldTargets * 2.5) : -30;
    }
    if (isDrawSearch) {
      const needsCards = player.hand.length <= 3;
      const supportsPlan = profile.gamePlan?.primaryGoal === 'resourceLoop' || profile.gamePlan?.primaryGoal === 'comboSetup';
      clearReasonScore += needsCards ? 22 : supportsPlan ? 12 : -10;
      if (player.deck.length <= matchupRiskValue(gameState, player, profile, 'stopSearchAtDeck', 10)) clearReasonScore -= 20;
    }
    if (isBoardSetup) {
      clearReasonScore += openUnitSlots > 0 || ownUnits <= 2 ? 16 : -8;
      if (profile.gamePlan?.mode === 'engine' || profile.gamePlan?.mode === 'combo') clearReasonScore += 6;
    }
    if ((isCombat || isProtection || isCounter) && !closeToLethal) {
      clearReasonScore -= 18;
    }
    if (isCounter && comboScore < 80) {
      clearReasonScore -= 30;
    }
    if (isProtection && !closeToLethal && comboScore < 80) {
      clearReasonScore -= 18;
    }
    if (closeToLethal && (isCombat || roles.has('finisher'))) {
      clearReasonScore += 24;
    }
  } else if (phase === 'BATTLE_FREE') {
    if (battleAttackers > 0 && (isCombat || isProtection || isRemoval || isCounter || roles.has('finisher'))) {
      clearReasonScore += 38 + Math.min(12, battleAttackers * 4);
      if (closeToLethal) clearReasonScore += 16;
    }
    if (isDrawSearch || isResourceSetup || isBoardSetup) {
      clearReasonScore -= comboScore >= 80 ? 0 : 34;
    }
    if (battleAttackers === 0 && comboScore < 80) {
      clearReasonScore -= 22;
    }
    if (battleAttackers === 0 && (isCounter || isProtection || isCombat) && comboScore < 80) {
      clearReasonScore -= 24;
    }
    if (isRemoval && opponentFieldTargets === 0) {
      clearReasonScore -= 20;
    }
  } else if (phase === 'COUNTERING') {
    if (isCounter || isProtection || isRemoval || isCombat) {
      clearReasonScore += isCounter || isProtection ? 42 : 28;
    }
    if ((isDrawSearch || isResourceSetup || isBoardSetup) && !isCounter) {
      clearReasonScore -= 30;
    }
  } else {
    clearReasonScore -= 18;
  }

  if (isCounter && phase !== 'COUNTERING' && !(phase === 'BATTLE_FREE' && battleAttackers > 0) && comboScore < 80) {
    clearReasonScore -= 18;
  }

  if (isPreventNextDestroy) {
    if (preventDestroyThreat?.best) {
      clearReasonScore += 34 + Math.min(24, preventDestroyThreat.bestValue * 0.35);
    } else {
      clearReasonScore -= phase === 'MAIN' ? 45 : 95;
    }
  }

  if (isProtection && !hasBattleContext && phase !== 'COUNTERING' && !closeToLethal && comboScore < 80) {
    clearReasonScore -= 14;
  }

  if ((isCombat || roles.has('finisher')) && !hasBattleContext && !closeToLethal && comboScore < 80) {
    clearReasonScore -= 10;
  }

  if (timingScore !== 0) {
    clearReasonScore += Math.max(-18, Math.min(18, timingScore * 1.25));
  }

  if (isDrawSearch && player.deck.length <= matchupRiskValue(gameState, player, profile, 'stopSelfDrawAtDeck', 10)) {
    clearReasonScore -= 14;
  }

  const hasClearPurpose =
    comboScore >= 80 ||
    !!preventDestroyThreat?.best ||
    clearReasonScore >= 22 ||
    (phase === 'MAIN' && (isRemoval || isDrawSearch || isBoardSetup) && clearReasonScore >= 12) ||
    (phase === 'BATTLE_FREE' && battleAttackers > 0 && (isCombat || isProtection || isRemoval || isCounter));

  if (!hasClearPurpose) {
    score -= 18;
  }

  return score + clearReasonScore;
}

export function scorePlayableCard(gameState: GameState, player: PlayerState, card: Card, profile: DeckAiProfile) {
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const opponentDeckProfile = getOpponentDeckProfile(gameState, opponentUid);
  const matchup = getActiveMatchupPlan(gameState, player, profile, opponentDeckProfile);
  const strategyContext = buildStrategyContext(gameState, player, profile, matchup, opponentDeckProfile);
  let score = scoreCardValue(card, profile, strategyContext);
  const erosion = countErosion(player);
  const knowledge = getCardKnowledge(card);
  const gamePlan = profile.gamePlan;
  const incomingThreat = estimateIncomingThreat(gameState, player, profile);
  const developmentPriority = (gamePlan?.developmentPriority ?? 0) + (matchup?.developmentBias ?? 0);
  const closeGameBias = (gamePlan?.closeGameBias ?? 0) + (matchup?.closeGameBias ?? 0);
  score += (knowledge?.playPriority || 0) * 0.7;
  score += developmentPriority * 0.8;
  score += scoreMainPhaseCardSequencingValue(gameState, player, card, profile) * 0.65;

  if (card.type === 'UNIT') {
    const openSlots = player.unitZone.filter(slot => slot === null).length;
    score += openSlots <= 1 ? -1.5 : 0;
    if (gameState.turnCount <= 1 && !card.isrush) score -= 1;
    if (knowledge?.roles.includes('engine') && openSlots > 0) score += 2;
    if (gamePlan?.primaryGoal === 'damage') score += (card.damage || 0) * (1 + closeGameBias * 0.35);
    if (gamePlan?.primaryGoal === 'boardControl') score += (card.power || 0) / 1800;
  }

  if (card.type === 'STORY') {
    score += scoreStoryPlayDiscipline(gameState, player, card, profile);
  }

  if ((knowledge?.roles.includes('draw') || knowledge?.roles.includes('search')) && player.deck.length <= matchupRiskValue(gameState, player, profile, 'stopSelfDrawAtDeck', 10)) {
    score -= 4;
  }

  if (incomingThreat.defendersNeeded > 0) {
    const cost = getCardCost(card);
    const totalErosion = countErosion(player);
    const canSafelyPayFromDeck = cost <= 0 || (player.deck.length > cost && totalErosion + cost < 10);
    const addsReadyDefender = card.type === 'UNIT';
    const readyDefenders = player.unitZone.filter(unit =>
      unit &&
      !unit.isExhausted &&
      !(unit as any).battleForbiddenByEffect &&
      !((unit as any).data?.cannotDefendTurn === gameState.turnCount) &&
      !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount)
    ).length;

    if (!canSafelyPayFromDeck && cost > 0) {
      score -= 18 + cost * 7;
    }
    if (!addsReadyDefender && incomingThreat.lethalWithoutBlocks) {
      score -= 10;
    }
    if (addsReadyDefender && readyDefenders + 1 < incomingThreat.defendersNeeded) {
      score -= 8;
    }
  }

  if (erosion >= 8 && getCardCost(card) > 2) score -= 3;
  score += scoreComboCard(gameState, player, card, profile, 'playable');
  score += applyCardScoreHook(profile, 'adjustPlayableScore', {
    ...strategyContext,
    card,
    score,
    reason: 'playable',
  });
  return score;
}

export function choosePlayableCard(
  gameState: GameState,
  player: PlayerState,
  profile: DeckAiProfile,
  difficulty: BotDifficulty,
  canPlay: (card: Card) => boolean
) {
  const playable = player.hand.filter(canPlay);
  if (difficulty !== 'hard') return playable[0];

  const scored = playable
    .map((card): ScoredCard => ({ card, score: scorePlayableCard(gameState, player, card, profile) }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].card : undefined;
}

function isEarlyUnit(card: Card, profile: DeckAiProfile) {
  if (card.type !== 'UNIT') return false;
  const cost = getCardCost(card);
  if (cost <= 3) return true;
  if (profile.gamePlan?.mode === 'aggro' && cost <= 4 && ((card.damage || 0) >= 2 || card.isrush)) return true;
  return false;
}

function scoreMulliganKeep(card: Card, profile: DeckAiProfile, earlyUnitsInHand: number, player?: PlayerState, gameState?: GameState) {
  const cost = getCardCost(card);
  const knowledge = getCardKnowledge(card);
  const mode = profile.gamePlan?.mode;
  const goal = profile.gamePlan?.primaryGoal;
  const strategyContext = gameState && player
    ? buildStrategyContext(gameState, player, profile)
    : { player };
  let score = scoreCardValue(card, profile, strategyContext) * 0.65 + getCardKnowledgeValue(card, 'playPriority') * 0.35;

  if (isEarlyUnit(card, profile)) score += mode === 'aggro' ? 24 : 16;
  if (card.type === 'UNIT' && cost <= 4) score += 6;
  if (card.type === 'UNIT' && goal === 'damage') score += (card.damage || 0) * 4;
  if (card.isrush) score += 7;
  if (knowledge?.roles.includes('engine')) score += mode === 'engine' || mode === 'combo' ? 12 : 5;
  if (knowledge?.roles.includes('search') || knowledge?.roles.includes('draw')) score += earlyUnitsInHand > 0 ? 5 : -4;
  if (knowledge?.roles.includes('removal')) score += 2;

  if (card.type !== 'UNIT' && earlyUnitsInHand === 0) score -= mode === 'aggro' ? 24 : 14;
  if (card.type === 'ITEM' && earlyUnitsInHand === 0) score -= 8;
  if (cost >= 5) score -= mode === 'aggro' ? 18 : 10;
  if (cost >= 5 && (profile.preserveCardIds?.[card.id] || profile.preferredCardIds?.[card.id])) score += 8;
  if (gameState && player) score += scoreComboCard(gameState, player, card, profile, 'mulligan');

  score += applyCardScoreHook(profile, 'adjustMulliganScore', {
    ...strategyContext,
    card,
    score,
    reason: 'mulligan',
    earlyUnitsInHand,
  });

  return score;
}

export function chooseMulliganCards(player: PlayerState, profile: DeckAiProfile, difficulty: BotDifficulty, gameState?: GameState) {
  if (difficulty !== 'hard') return [] as Card[];
  const hand = player.hand;
  if (hand.length === 0) return [];

  const mode = profile.gamePlan?.mode;
  const requiredEarlyUnits = mode === 'aggro' ? 2 : mode === 'control' ? 1 : 1;
  const earlyUnits = hand.filter(card => isEarlyUnit(card, profile));
  const scored = hand
    .map(card => ({
      card,
      score: scoreMulliganKeep(card, profile, earlyUnits.length, player, gameState),
      early: isEarlyUnit(card, profile),
    }))
    .sort((a, b) => a.score - b.score);

  const returning = new Set<Card>();
  if (earlyUnits.length < requiredEarlyUnits) {
    scored
      .filter(entry => !entry.early)
      .slice(0, Math.max(1, requiredEarlyUnits - earlyUnits.length + 1))
      .forEach(entry => returning.add(entry.card));
  }

  const keepThreshold = mode === 'aggro' ? 22 : mode === 'control' ? 18 : 20;
  for (const entry of scored) {
    if (returning.size >= Math.max(1, hand.length - 1)) break;
    if (entry.score < keepThreshold && (!entry.early || earlyUnits.length > requiredEarlyUnits)) {
      returning.add(entry.card);
    }
  }

  if (earlyUnits.length === 0 && returning.size === 0) {
    scored.slice(0, Math.min(2, hand.length)).forEach(entry => returning.add(entry.card));
  }

  return [...returning];
}

export interface OpeningHandAssessment {
  quality: number;
  earlyUnits: number;
  units: number;
  engines: number;
  interaction: number;
  avgCost: number;
  highCostCards: number;
  severeBrick: boolean;
  mildBrick: boolean;
  notes: string[];
}

export interface OpeningHandSoftCompensationResult {
  applied: boolean;
  reason: string;
  returned: Card[];
  gained: Card[];
  before: OpeningHandAssessment;
  after: OpeningHandAssessment;
  inspectedDeckCards: number;
  extremeRescue: boolean;
  fixedOpening?: boolean;
  missingFixedCardIds?: string[];
}

function scoreOpeningCard(card: Card, profile: DeckAiProfile) {
  const knowledge = getCardKnowledge(card);
  const cost = getCardCost(card);
  const mode = profile.gamePlan?.mode;
  const goal = profile.gamePlan?.primaryGoal;
  let score = scoreCardValue(card, profile) * 0.45 + getCardKnowledgeValue(card, 'playPriority') * 0.55;

  if (isEarlyUnit(card, profile)) score += mode === 'aggro' ? 18 : 12;
  if (card.type === 'UNIT' && cost <= 4) score += 5;
  if (card.type === 'UNIT' && goal === 'damage') score += (card.damage || 0) * 3;
  if (card.isrush) score += 5;
  if (knowledge?.roles.includes('engine')) score += mode === 'engine' || mode === 'combo' ? 10 : 4;
  if (knowledge?.roles.includes('resource')) score += mode === 'engine' || mode === 'combo' ? 6 : 2;
  if (knowledge?.roles.includes('search') || knowledge?.roles.includes('draw')) score += 3;
  if (knowledge?.roles.includes('removal') || knowledge?.roles.includes('tempo')) score += 3;
  if (cost >= 5) score -= mode === 'aggro' ? 16 : 8;
  if (cost >= 6) score -= 4;

  return score;
}

export function assessOpeningHand(hand: Card[], profile: DeckAiProfile): OpeningHandAssessment {
  const costs = hand.map(getCardCost);
  const avgCost = costs.length > 0 ? costs.reduce((sum, cost) => sum + cost, 0) / costs.length : 0;
  const units = hand.filter(card => card.type === 'UNIT').length;
  const earlyUnits = hand.filter(card => isEarlyUnit(card, profile)).length;
  const engines = hand.filter(card => {
    const roles = getCardKnowledge(card)?.roles || [];
    return roles.includes('engine') || roles.includes('resource') || roles.includes('combo_piece');
  }).length;
  const interaction = hand.filter(card => {
    const roles = getCardKnowledge(card)?.roles || [];
    return roles.includes('removal') || roles.includes('tempo') || roles.includes('protection');
  }).length;
  const highCostCards = costs.filter(cost => cost >= 5).length;
  const mode = profile.gamePlan?.mode;
  const needsEngine = mode === 'engine' || mode === 'combo' || profile.gamePlan?.primaryGoal === 'resourceLoop' || profile.gamePlan?.primaryGoal === 'comboSetup';
  const avgScore = hand.length > 0
    ? hand.reduce((sum, card) => sum + scoreOpeningCard(card, profile), 0) / hand.length
    : 0;
  const notes: string[] = [];
  let quality =
    avgScore +
    earlyUnits * 8 +
    units * 3 +
    engines * (needsEngine ? 5 : 2) +
    interaction * 2 -
    Math.max(0, avgCost - 3.8) * 8 -
    highCostCards * (mode === 'aggro' ? 4 : 2);

  if (units === 0) {
    quality -= 18;
    notes.push('no units');
  }
  if (earlyUnits === 0) {
    quality -= mode === 'aggro' ? 22 : 14;
    notes.push('no early unit');
  }
  if (needsEngine && engines === 0) {
    quality -= 10;
    notes.push('missing engine');
  }
  if (avgCost >= 4.8) {
    quality -= 12;
    notes.push('high average cost');
  }
  if (highCostCards >= 3) {
    quality -= 10;
    notes.push('too many high-cost cards');
  }

  const severeBrick =
    units === 0 ||
    (earlyUnits === 0 && highCostCards >= 3) ||
    avgCost >= 5 ||
    quality < 22 ||
    (needsEngine && engines === 0 && earlyUnits === 0);
  const mildBrick =
    severeBrick ||
    earlyUnits === 0 ||
    quality < 34 ||
    avgCost >= 4.4 ||
    (needsEngine && engines === 0);

  return {
    quality: Number(quality.toFixed(2)),
    earlyUnits,
    units,
    engines,
    interaction,
    avgCost: Number(avgCost.toFixed(2)),
    highCostCards,
    severeBrick,
    mildBrick,
    notes,
  };
}

function applyFixedOpeningHand(
  player: PlayerState,
  profile: DeckAiProfile,
  before: OpeningHandAssessment
): OpeningHandSoftCompensationResult | undefined {
  const fixedIds = profile.softCompensation?.fixedOpeningHandIds?.filter(Boolean) || [];
  if (fixedIds.length === 0 || player.hand.length === 0) return undefined;

  const openingSize = player.hand.length;
  const targetIds = fixedIds.slice(0, openingSize);
  const originalHand = [...player.hand];
  const selected: Card[] = [];
  const selectedIds = new Set<string>();
  const gained: Card[] = [];
  const missingFixedCardIds: string[] = [];

  for (const cardId of targetIds) {
    const handCard = originalHand.find(card =>
      card.id === cardId &&
      !selectedIds.has(card.gamecardId)
    );
    if (handCard) {
      selected.push(handCard);
      selectedIds.add(handCard.gamecardId);
      continue;
    }

    const deckIndex = player.deck.findIndex(card =>
      card.id === cardId &&
      !selectedIds.has(card.gamecardId)
    );
    if (deckIndex >= 0) {
      const [deckCard] = player.deck.splice(deckIndex, 1);
      selected.push(deckCard);
      selectedIds.add(deckCard.gamecardId);
      gained.push(deckCard);
      continue;
    }

    missingFixedCardIds.push(cardId);
  }

  if (selected.length < openingSize) {
    for (const card of originalHand) {
      if (selected.length >= openingSize) break;
      if (selectedIds.has(card.gamecardId)) continue;
      selected.push(card);
      selectedIds.add(card.gamecardId);
    }
  }

  const returned = originalHand.filter(card => !selectedIds.has(card.gamecardId));
  for (const card of returned) {
    card.cardlocation = 'DECK';
    card.displayState = 'FRONT_FACEDOWN';
    player.deck.unshift(card);
  }

  player.hand = selected.slice(0, openingSize);
  for (const card of player.hand) {
    card.cardlocation = 'HAND';
    card.displayState = 'FRONT_FACEDOWN';
  }

  const after = assessOpeningHand(player.hand, profile);
  return {
    applied: true,
    reason: missingFixedCardIds.length > 0
      ? 'Fixed opening hand was partially applied; some configured cards were not found in hand or deck.'
      : 'Fixed opening hand applied for this deck profile.',
    returned,
    gained,
    before,
    after,
    inspectedDeckCards: player.deck.length + gained.length,
    extremeRescue: false,
    fixedOpening: true,
    missingFixedCardIds,
  };
}

export function applyOpeningHandSoftCompensation(
  player: PlayerState,
  profile: DeckAiProfile
): OpeningHandSoftCompensationResult {
  const before = assessOpeningHand(player.hand, profile);
  const config = profile.softCompensation;
  const disabledResult = (reason: string): OpeningHandSoftCompensationResult => ({
    applied: false,
    reason,
    returned: [],
    gained: [],
    before,
    after: before,
    inspectedDeckCards: 0,
    extremeRescue: false,
  });

  const fixedOpening = applyFixedOpeningHand(player, profile, before);
  if (fixedOpening) return fixedOpening;

  if (!config?.openingSmoothing || !profile.shareCode) return disabledResult('soft compensation disabled');
  if (!before.mildBrick) return disabledResult('opening hand quality acceptable');
  if (player.deck.length === 0 || player.hand.length === 0) return disabledResult('not enough cards to smooth');

  const lookahead = Math.max(4, Math.min(config.openingLookahead || 8, player.deck.length));
  const visibleTopDeck = player.deck.slice(Math.max(0, player.deck.length - lookahead));
  const currentScored = player.hand
    .map(card => ({ card, score: scoreOpeningCard(card, profile) }))
    .sort((a, b) => a.score - b.score);
  const candidateScored = visibleTopDeck
    .map(card => ({ card, score: scoreOpeningCard(card, profile) }))
    .sort((a, b) => b.score - a.score);

  const returned: Card[] = [];
  const gained: Card[] = [];
  const maxConfigured = Math.max(1, config.maxOpeningReplacements || 1);
  const extremeRescue = before.severeBrick && Math.random() < (config.extremeBrickRescueChance ?? 0.3);
  const targetReplacements = Math.min(player.hand.length - 1, maxConfigured + (extremeRescue ? 1 : 0));
  const usedCandidateIds = new Set<string>();
  const usedReturnIds = new Set<string>();

  for (let i = 0; i < targetReplacements; i++) {
    const worst = currentScored.find(entry => !usedReturnIds.has(entry.card.gamecardId));
    const best = candidateScored.find(entry => !usedCandidateIds.has(entry.card.gamecardId));
    if (!worst || !best) break;

    const requiredGain = i === 0
      ? before.severeBrick ? 5 : 8
      : 14;
    if (best.score <= worst.score + requiredGain) break;

    returned.push(worst.card);
    gained.push(best.card);
    usedReturnIds.add(worst.card.gamecardId);
    usedCandidateIds.add(best.card.gamecardId);
  }

  if (returned.length === 0) return disabledResult('no soft replacement improved the hand enough');

  for (const card of returned) {
    const handIndex = player.hand.findIndex(candidate => candidate.gamecardId === card.gamecardId);
    if (handIndex >= 0) {
      player.hand.splice(handIndex, 1);
      card.cardlocation = 'DECK';
      card.displayState = 'FRONT_FACEDOWN';
      player.deck.unshift(card);
    }
  }

  for (const card of gained) {
    const deckIndex = player.deck.findIndex(candidate => candidate.gamecardId === card.gamecardId);
    if (deckIndex >= 0) {
      player.deck.splice(deckIndex, 1);
      card.cardlocation = 'HAND';
      card.displayState = 'FRONT_FACEDOWN';
      player.hand.push(card);
    }
  }

  const after = assessOpeningHand(player.hand, profile);
  return {
    applied: true,
    reason: before.severeBrick
      ? 'Soft compensation replaced an extreme brick opening with a limited top-deck lookahead.'
      : 'Soft compensation lightly smoothed a weak opening hand with a limited top-deck lookahead.',
    returned,
    gained,
    before,
    after,
    inspectedDeckCards: lookahead,
    extremeRescue,
  };
}

export function canUnitAttack(gameState: GameState, unit: Card | null | undefined) {
  if (!unit || unit.isExhausted || unit.canAttack === false) return false;
  if ((unit as any).battleForbiddenByEffect) return false;
  if ((unit as any).data?.cannotAttackThisTurn === gameState.turnCount) return false;
  if ((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount) return false;
  if ((unit.damage || 0) < 1) return false;
  const isRush = !!unit.isrush;
  const wasPlayedThisTurn = unit.playedTurn === gameState.turnCount;
  return isRush || !wasPlayedThisTurn;
}

function getOpponent(gameState: GameState, player: PlayerState) {
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  return opponentUid ? gameState.players[opponentUid] : undefined;
}

function findCardInState(gameState: GameState, gamecardId?: string) {
  if (!gamecardId) return undefined;
  for (const player of Object.values(gameState.players)) {
    const found = [
      ...player.deck,
      ...player.hand,
      ...player.grave,
      ...player.exile,
      ...player.unitZone,
      ...player.itemZone,
      ...player.erosionFront,
      ...player.erosionBack,
      ...player.playZone,
    ].find(card => card?.gamecardId === gamecardId);
    if (found) return found;
  }
  return undefined;
}

function findCardOwnerUid(gameState: GameState, card: Card | null | undefined) {
  if (!card?.gamecardId) return undefined;
  return Object.values(gameState.players).find(player =>
    [
      ...player.deck,
      ...player.hand,
      ...player.grave,
      ...player.exile,
      ...player.unitZone,
      ...player.itemZone,
      ...player.erosionFront,
      ...player.erosionBack,
      ...player.playZone,
    ].some(candidate => candidate?.gamecardId === card.gamecardId)
  )?.uid;
}

function optionIsMine(gameState: GameState, playerUid: string, option: any) {
  if (typeof option.isMine === 'boolean') return option.isMine;
  return option.card ? findCardOwnerUid(gameState, option.card) === playerUid : false;
}

function isBoardPresenceCard(card: Card | null | undefined) {
  return !!card && (card.cardlocation === 'UNIT' || card.cardlocation === 'ITEM');
}

function profileCardBias(profile: DeckAiProfile, card: Card | null | undefined) {
  if (!card) return { preserve: 0, preferred: 0 };
  return {
    preserve: profile.preserveCardIds?.[card.id] || profile.preserveCardIds?.[card.uniqueId] || 0,
    preferred: profile.preferredCardIds?.[card.id] || profile.preferredCardIds?.[card.uniqueId] || 0,
  };
}

function canDefendSoon(gameState: GameState, unit: Card | null | undefined) {
  return !!unit &&
    !unit.isExhausted &&
    !(unit as any).battleForbiddenByEffect &&
    !((unit as any).data?.cannotDefendTurn === gameState.turnCount) &&
    !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount);
}

function scoreStrategicBoardPresenceValue(
  gameState: GameState,
  playerUid: string,
  card: Card | null | undefined,
  profile: DeckAiProfile,
  context: Partial<DeckAiStrategyContext> = {}
) {
  if (!card || !isBoardPresenceCard(card) || findCardOwnerUid(gameState, card) !== playerUid) return 0;

  const player = gameState.players[playerUid];
  const knowledge = getCardKnowledge(card);
  const roles = knowledge?.roles || [];
  const { preserve, preferred } = profileCardBias(profile, card);
  const cardValue = scoreCardValue(card, profile, {
    gameState,
    player,
    ...context,
  });
  const ownUnits = player?.unitZone.filter(Boolean) as Card[] | undefined;
  const ownGodMarks = ownUnits?.filter(unit => unit.godMark) || [];
  const planWantsBoard =
    profile.gamePlan?.mode === 'engine' ||
    profile.gamePlan?.mode === 'combo' ||
    profile.gamePlan?.primaryGoal === 'resourceLoop' ||
    profile.gamePlan?.primaryGoal === 'comboSetup';

  let score = getCardKnowledgeValue(card, 'preserveValue') + cardValue * 0.35;

  if (card.type === 'UNIT') {
    score += (card.damage || 0) * 6 + (card.power || 0) / 900;
    if (canUnitAttack(gameState, card)) score += 6 + (card.damage || 0) * 4;
    if (canDefendSoon(gameState, card)) score += 5;
    if (card.playedTurn === gameState.turnCount) score += 10;
  }

  if (card.godMark) score += 38;
  if (preserve > 0) score += 18 + preserve;
  if (preferred > 0) score += 8 + Math.min(16, preferred * 0.6);
  if (roles.includes('engine')) score += 18;
  if (roles.includes('combo_piece')) score += 16;
  if (roles.includes('resource')) score += 10;
  if (roles.includes('finisher')) score += 12;
  if (roles.includes('protection')) score += 10;
  if (roles.includes('draw') || roles.includes('search')) score += 8;
  if (planWantsBoard && roles.some(role => role === 'engine' || role === 'combo_piece' || role === 'resource')) {
    score += 14;
  }
  if (card.type === 'UNIT' && ownUnits?.length === 1) score += 12;
  if (card.godMark && ownGodMarks.length === 1) score += 14;

  return score;
}

function isLikelyOwnBoardLossQuery(query: EffectQuery, intent: QueryIntent) {
  if (intent === 'cost') return true;
  if (intent !== 'offense') return false;
  const text = queryText(query);
  if (/RETURN|BOUNCE|HAND|READY|RESET|PROTECT|BUFF|BOOST|POWER|DAMAGE_ZERO|CANNOT_DEFEND/i.test(text)) {
    return false;
  }
  return /DESTROY|EXILE|BANISH|REMOVE|BOTTOM|GRAVE|SACRIFICE|DISCARD|KILL|TRIBUTE|TO_GRAVE|SEND/i.test(text);
}

function getLikelyDefenderCards(gameState: GameState, defender: PlayerState | undefined) {
  if (!defender) return [];
  return defender.unitZone.filter(unit =>
    unit &&
    !unit.isExhausted &&
    !(unit as any).battleForbiddenByEffect &&
    !((unit as any).data?.cannotDefendTurn === gameState.turnCount) &&
    !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount)
  ) as Card[];
}

function countLikelyDefenders(gameState: GameState, defender: PlayerState | undefined) {
  const defenders = getLikelyDefenderCards(gameState, defender);
  return Array.isArray(defenders) ? defenders.length : 0;
}

const TEMPLE_MAGIC_SPEAR_ID = '101130440';
const TEMPLE_MAGIC_SPEAR_RESET_ENABLER_EFFECT_IDS = new Set([
  '101130439_reset_hall',
  '101130441_reset_boost',
  '101130155_enter_reset',
  '101000063_ten_reset_units',
  '202000053_reset_after_destroy',
]);

function isTempleMagicSpear(card: Card | null | undefined) {
  return card?.id === TEMPLE_MAGIC_SPEAR_ID;
}

function isTempleMagicSpearResetEnabler(effect: CardEffect | null | undefined) {
  return !!effect?.id && TEMPLE_MAGIC_SPEAR_RESET_ENABLER_EFFECT_IDS.has(effect.id);
}

function templeMagicSpearResetBoost(effect?: CardEffect) {
  return effect?.id === '101130441_reset_boost' ? 1500 : 1000;
}

function getTempleMagicSpearPostAttackResetSupport(player: PlayerState, spear: Card | null | undefined) {
  if (!isTempleMagicSpear(spear)) return undefined;
  let bestBoost = 0;
  const effectIds: string[] = [];

  const fieldCards = [...player.unitZone, ...player.itemZone].filter((card): card is Card => !!card);
  for (const source of fieldCards) {
    for (const effect of source.effects || []) {
      if (!isTempleMagicSpearResetEnabler(effect)) continue;
      if (effect.id === '101130439_reset_hall') {
        if (source.gamecardId === spear.gamecardId || source.isExhausted) continue;
      }
      if (effect.id === '101130441_reset_boost' && player.grave.length < 3) continue;
      const boost = templeMagicSpearResetBoost(effect);
      if (boost > bestBoost) bestBoost = boost;
      effectIds.push(effect.id);
    }
  }

  return bestBoost > 0 ? { bestBoost, effectIds } : undefined;
}

function getTempleMagicSpearBattleResetOpportunity(
  gameState: GameState,
  player: PlayerState,
  effect: CardEffect,
  profile: DeckAiProfile
) {
  if (!isTempleMagicSpearResetEnabler(effect)) return undefined;
  if (gameState.phase !== 'COUNTERING' && gameState.phase !== 'BATTLE_FREE') return undefined;
  const battle = gameState.battleState;
  if (!battle?.attackers?.length) return undefined;
  if (gameState.playerIds[gameState.currentTurnPlayer] !== player.uid) return undefined;

  const spear = battle.attackers
    .map(id => findCardInState(gameState, id))
    .find(card => isTempleMagicSpear(card) && findCardOwnerUid(gameState, card) === player.uid);
  if (!spear) return undefined;

  const opponent = getOpponent(gameState, player);
  if (!opponent) return undefined;
  const boost = templeMagicSpearResetBoost(effect);
  const power = Math.max(0, spear.power || 0);
  const powerAfterReset = power + boost;
  const currentDamage = Math.max(0, spear.damage || 0);
  const defenderCards = battle.defender
    ? [findCardInState(gameState, battle.defender)].filter((card): card is Card => !!card)
    : getLikelyDefenderCards(gameState, opponent);
  const bestDefender = defenderCards
    .sort((a, b) =>
      ((b.power || 0) + scoreCardValue(b, profile) * 0.25) -
      ((a.power || 0) + scoreCardValue(a, profile) * 0.25)
    )[0];
  const defenderPower = Math.max(0, bestDefender?.power || 0);
  const savesSpearFromLikelyBlock = !!bestDefender && defenderPower >= power && powerAfterReset > defenderPower;
  const improvesHopelessFight = !!bestDefender && defenderPower > powerAfterReset;
  const resetDamageCloses =
    !battle.defender &&
    (
      currentDamage + 1 > opponent.deck.length ||
      countErosion(opponent) + currentDamage + 1 >= 10
    );

  let score = 0;
  const notes: string[] = [];
  if (savesSpearFromLikelyBlock) {
    const defenderValue = bestDefender
      ? scoreCardValue(bestDefender, profile) + Math.max(0, bestDefender.damage || 0) * 7
      : 0;
    score += 64 + Math.min(22, defenderValue * 0.22);
    if (battle.defender) score += 16;
    notes.push(`magic spear reset beats ${bestDefender?.fullName || 'likely blocker'} ${power}->${powerAfterReset}`);
  } else if (resetDamageCloses) {
    score += 46;
    notes.push('magic spear reset damage creates lethal pressure');
  } else if (improvesHopelessFight) {
    score += 10;
    notes.push(`magic spear reset still trails blocker ${powerAfterReset}<${defenderPower}`);
  }

  return score > 0
    ? { score, spear, bestDefender, powerAfterReset, notes }
    : undefined;
}

export function scoreAttackCandidate(gameState: GameState, player: PlayerState, card: Card, profile: DeckAiProfile) {
  const attackers = player.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
  const opponent = getOpponent(gameState, player);
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const opponentDeckProfile = getOpponentDeckProfile(gameState, opponentUid);
  const matchup = getActiveMatchupPlan(gameState, player, profile, opponentDeckProfile);
  const strategyContext = buildStrategyContext(gameState, player, profile, matchup, opponentDeckProfile);
  const gamePlan = profile.gamePlan;
  const opponentErosion = opponent ? countErosion(opponent) : 0;
  const defenderCards = getLikelyDefenderCards(gameState, opponent);
  const defenderCount = defenderCards.length;
  const totalAvailableDamage = attackers.reduce((sum, unit) => sum + (unit.damage || 0), 0);
  const damage = card.damage || 0;
  const power = card.power || 0;
  const cardValue = scoreCardValue(card, profile, strategyContext);
  const preserveValue = getCardKnowledgeValue(card, 'preserveValue') + cardValue * 0.25;
  const damageToCritical = Math.max(1, 10 - opponentErosion);
  const lethalWindow = opponent ? totalAvailableDamage > opponent.deck.length : false;
  const singleAttackThreat = opponent ? damage > opponent.deck.length : false;
  const erosionPressureWindow = totalAvailableDamage >= damageToCritical;
  const attackPriority = (gamePlan?.attackPriority ?? 0) + (matchup?.attackBias ?? 0);
  const closeGameBias = (gamePlan?.closeGameBias ?? 0) + (matchup?.closeGameBias ?? 0);
  const criticalDeck = riskValue(profile, 'criticalDeck', 3);
  const lowDeck = riskValue(profile, 'lowDeck', 10);
  const strongestDefenderPower = defenderCards.reduce((best, defender) => Math.max(best, defender.power || 0), 0);
  const strongestDefenderValue = Math.max(0, ...defenderCards.map(defender =>
    scoreCardValue(defender, profile) + (defender.damage || 0) * 6 + (defender.power || 0) / 900
  ));
  const templeSpearResetSupport = getTempleMagicSpearPostAttackResetSupport(player, card);
  const templeSpearPowerAfterReset = power + (templeSpearResetSupport?.bestBoost || 0);
  const templeSpearResetFixesBlock =
    isTempleMagicSpear(card) &&
    !!templeSpearResetSupport &&
    defenderCount > 0 &&
    strongestDefenderPower >= power &&
    templeSpearPowerAfterReset > strongestDefenderPower;
  const templeSpearWouldStillDieToBestBlock =
    isTempleMagicSpear(card) &&
    defenderCount > 0 &&
    strongestDefenderPower >= Math.max(power, templeSpearPowerAfterReset);
  const otherAttackDamage = Math.max(0, totalAvailableDamage - damage);
  const attackWouldBeFatal = !!opponent && isDamageFatal(damage, opponent.deck.length, opponentErosion);
  const otherAttackersCanClose = !!opponent && (
    otherAttackDamage > opponent.deck.length ||
    otherAttackDamage >= damageToCritical
  );
  const expendableBait =
    defenderCount > 0 &&
    attackers.length > defenderCount &&
    otherAttackersCanClose &&
    preserveValue <= 28 &&
    !card.godMark;

  let score = ((damage * 10 + power / 1000 + cardValue * 0.25) * profile.weights.attackBias);
  score += damage * attackPriority * 1.6;
  if (gamePlan?.primaryGoal === 'damage') score += damage * 2.2;
  if (gamePlan?.primaryGoal === 'deckPressure' && opponent && opponent.deck.length <= riskValue(profile, 'lowDeck', 10)) {
    score += damage * 2.5;
  }
  if (player.deck.length <= criticalDeck && opponent && (opponent.deck.length <= lowDeck || opponentErosion >= 7 || erosionPressureWindow)) {
    score += damage * 7 + (singleAttackThreat ? 18 : 0);
  }

  if (singleAttackThreat) {
    score += 45 + damage * (8 + closeGameBias);
  } else if (lethalWindow) {
    score += 18 + damage * (7 + closeGameBias * 0.7);
    if (defenderCount > 0 && attackers.length > defenderCount) {
      const forcesDefensePressure = opponentErosion + damage >= 9;
      const baitValueBonus = Math.max(0, 22 - preserveValue) * (forcesDefensePressure ? 0.9 : 0.4);
      score += baitValueBonus;
      score -= preserveValue * 0.12;
    }
  } else {
    const pressureBonus = opponentErosion >= 7 ? damage * 5 : opponentErosion >= 5 ? damage * 3 : damage;
    score += pressureBonus + (erosionPressureWindow ? damage * 2 : 0);
  }

  if (defenderCount === 0) {
    score += damage * 4;
  }

  if (defenderCount > 0 && strongestDefenderPower >= power && !expendableBait) {
    const losingIntoDefender = strongestDefenderPower > power;
    const clearClosingPurpose = lethalWindow || erosionPressureWindow || attackWouldBeFatal || singleAttackThreat;
    const pressureDiscount = clearClosingPurpose ? 0.45 : 1;
    let badAttackPenalty = losingIntoDefender ? 34 : 20;
    badAttackPenalty += Math.min(24, preserveValue * (losingIntoDefender ? 0.42 : 0.28));
    badAttackPenalty += Math.min(18, strongestDefenderValue * 0.18);
    if (damage <= 1) badAttackPenalty += losingIntoDefender ? 12 : 6;
    if (card.godMark) badAttackPenalty += 18;
    if (!clearClosingPurpose) badAttackPenalty += 10;
    if (templeSpearResetFixesBlock) {
      badAttackPenalty *= 0.45;
      score += 18 + Math.min(18, (templeSpearResetSupport?.bestBoost || 0) / 70);
    } else if (isTempleMagicSpear(card) && !templeSpearResetSupport && !clearClosingPurpose) {
      badAttackPenalty += 24;
    }
    if (templeSpearWouldStillDieToBestBlock && !attackWouldBeFatal && !singleAttackThreat) {
      badAttackPenalty += 34 + Math.min(18, preserveValue * 0.3);
    }
    score -= badAttackPenalty * pressureDiscount;
  } else if (expendableBait) {
    score += 12;
  }

  score += scoreComboCard(gameState, player, card, profile, 'attack');
  score += applyCardScoreHook(profile, 'adjustAttackScore', {
    ...strategyContext,
    card,
    score,
    reason: 'attack',
  });

  return score;
}

export interface ActivatableEffectScore {
  score: number;
  reason: string;
  notes: string[];
}

export interface ActivatableEffectContext {
  opponent?: PlayerState;
  targetCount?: number;
  hasTargetSpec?: boolean;
}

function textHasAny(text: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(text));
}

function effectSearchText(card: Card, effect: CardEffect) {
  return [
    card.fullName,
    effect.content,
    effect.description,
    effect.targetSpec?.title,
    effect.targetSpec?.description,
    effect.targetSpec?.modeTitle,
    effect.targetSpec?.modeDescription,
    ...(effect.targetSpec?.modeOptions || []).flatMap(mode => [mode.label, mode.description, mode.modeDescription]),
  ]
    .filter(Boolean)
    .join(' ');
}

function effectTargetControllers(effect: CardEffect) {
  const spec = effect.targetSpec;
  if (!spec) return [];
  const shapes = spec.modeOptions?.length
    ? spec.modeOptions
    : spec.targetGroups?.length
      ? spec.targetGroups
      : [spec];
  return shapes.map(shape => shape.controller).filter(Boolean) as Array<'SELF' | 'OPPONENT' | 'ANY'>;
}

function estimateEffectPaymentCost(effect: CardEffect) {
  const explicitCost = Number(effect.playCost || 0);
  if (Number.isFinite(explicitCost) && explicitCost > 0) return explicitCost;

  const text = `${effect.description || ''} ${effect.content || ''}`;
  const match = text.match(/鏀粯\s*(\d+)\s*璐圭敤/) ||
    text.match(/pay\s*(\d+)\s*(?:cost|resource)?/i);
  const parsed = match ? Number(match[1]) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function estimateDeckPaymentForEffect(player: PlayerState, sourceCard: Card, effect: CardEffect) {
  const paymentCost = estimateEffectPaymentCost(effect);
  if (paymentCost <= 0) return 0;

  const sourceColor = sourceCard.color === 'NONE' ? undefined : sourceCard.color;
  const hasFeijing = player.hand.some(card =>
    card.gamecardId !== sourceCard.gamecardId &&
    card.feijingMark &&
    (!sourceColor || card.color === sourceColor)
  );
  const feijingReduction = hasFeijing ? 3 : 0;
  const readyUnitPayment = player.unitZone
    .filter((unit): unit is Card => !!unit && !unit.isExhausted && !(unit as any).data?.cannotExhaustByEffect)
    .reduce((total, unit) => {
      const data = (unit as any).data || {};
      const accessMin = Math.max(1, Number(data.accessTapMinValue || 1));
      const accessMax = data.accessTapColor && data.accessTapColor !== sourceColor
        ? 1
        : Math.max(accessMin, Number(data.accessTapValue || 1));
      return total + accessMax;
    }, 0);

  return Math.max(0, paymentCost - feijingReduction - readyUnitPayment);
}

export function scoreActivatableEffect(
  gameState: GameState,
  player: PlayerState,
  card: Card,
  effect: CardEffect,
  profile: DeckAiProfile,
  context: ActivatableEffectContext = {}
): ActivatableEffectScore {
  const text = effectSearchText(card, effect);
  const idText = effect.id || '';
  const searchableText = `${text} ${idText}`;
  const removalText = `${text} ${/destroy|banish|return|bounce|remove/i.test(idText) ? idText : ''}`;
  const notes: string[] = [];
  const tags = new Set<EffectPreferenceTag>();
  const opponent = context.opponent;
  const opponentUnits = opponent?.unitZone.filter(Boolean) as Card[] | undefined;
  const ownAttackers = player.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
  const battleAttackers = gameState.battleState?.attackers?.filter(Boolean).length || 0;
  const opponentErosion = opponent ? countErosion(opponent) : 0;
  const totalAvailableDamage = ownAttackers.reduce((sum, unit) => sum + (unit.damage || 0), 0);
  const damageToCritical = Math.max(1, 10 - opponentErosion);
  const inLethalWindow = totalAvailableDamage >= damageToCritical;
  const knowledge = getCardKnowledge(card);
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const opponentDeckProfile = getOpponentDeckProfile(gameState, opponentUid);
  const matchup = getActiveMatchupPlan(gameState, player, profile, opponentDeckProfile);
  const strategyContext = buildStrategyContext(gameState, player, profile, matchup, opponentDeckProfile);
  const gamePlan = profile.gamePlan;
  const cardValue = scoreCardValue(card, profile, strategyContext);
  const targetCount = context.targetCount ?? 0;
  const controllers = effectTargetControllers(effect);
  const targetsSelfOnly = controllers.length > 0 && controllers.every(controller => controller === 'SELF');
  const canTargetOpponent = controllers.length === 0 || controllers.some(controller => controller === 'OPPONENT' || controller === 'ANY');
  const ownDeckRisk = deckPressurePenalty(player.deck.length, profile, matchup?.stopSelfDrawAtDeck);
  const estimatedDeckPayment = estimateDeckPaymentForEffect(player, card, effect);

  let score = 2 + profile.weights.effectText * 2 + Math.min(5, cardValue * 0.08);
  score += ((gamePlan?.effectPriority ?? 0) + (matchup?.effectBias ?? 0)) * 0.8;

  if (effect.id === '105110108_activate' && player.deck.length > 0) {
    const nameCounts = player.deck.reduce((counts, deckCard) => {
      counts.set(deckCard.fullName, (counts.get(deckCard.fullName) || 0) + 1);
      return counts;
    }, new Map<string, number>());
    const bestCount = Math.max(0, ...nameCounts.values());
    const hitRate = bestCount / player.deck.length;
    const stopSelfDrawAtDeck = matchupRiskValue(gameState, player, profile, 'stopSelfDrawAtDeck', riskValue(profile, 'lowDeck', 10));
    if (player.deck.length <= stopSelfDrawAtDeck) {
      score += hitRate >= 0.45 ? 7 + bestCount : -12 * (0.45 - hitRate);
    } else {
      score += Math.min(4, bestCount);
    }
    notes.push(`declare hit ${bestCount}/${player.deck.length}`);
  }

  if (knowledge?.roles.includes('engine')) {
    score += 4;
    tags.add('engine');
    notes.push('引擎牌');
  }

  if (textHasAny(searchableText, [/抽|抓|draw/i])) {
    const handBonus = player.hand.length <= 3 ? 7 : player.hand.length <= 5 ? 4 : -1;
    score += 5 + handBonus;
    if (ownDeckRisk > 0) {
      score -= canTargetOpponent ? ownDeckRisk * 0.45 : ownDeckRisk;
      notes.push('卡组余量风险');
    }
    tags.add('draw');
    notes.push('补充手牌');
  }

  if (textHasAny(searchableText, [/检索|搜索|卡组|牌库|加入手牌|search|deck/i])) {
    score += 7 + (player.hand.length <= 4 ? 3 : 0);
    if (ownDeckRisk > 0) {
      score -= ownDeckRisk * 0.65;
      notes.push('卡组余量风险');
    }
    tags.add('search');
    notes.push('检索组件');
  }

  if (textHasAny(searchableText, [/免疫|不会被破坏|不能被破坏|保护|prevent|immune|protect|indestructible/i])) {
    score += gameState.phase === 'BATTLE_FREE' ? 4 : -3;
    tags.add('protection');
    notes.push('保护效果');
  }

  if (canTargetOpponent && textHasAny(removalText, [/破坏|放置到墓地|送入墓地|除外|返回手牌|回手|destroy|banish|return|bounce|remove/i])) {
    const bestOpponentThreat = Math.max(0, ...(opponentUnits || []).map(unit => scoreCardValue(unit, profile)));
    score += (targetCount > 0 ? 8 : -8) + Math.min(10, bestOpponentThreat * 0.18);
    tags.add('removal');
    notes.push('处理威胁');
  }

  if (canTargetOpponent && textHasAny(searchableText, [/横置|不能攻击|不能防御|跳过|exhaust|cannot attack|cannot defend|skip/i])) {
    score += (opponentUnits?.length || 0) > 0 ? 5 : 1;
    tags.add('tempo');
    notes.push('节奏压制');
  }

  if (textHasAny(searchableText, [/伤害\+|伤害\+\d|\+\d|追加.*伤害|damage|power/i])) {
    score += inLethalWindow ? 9 : ownAttackers.length > 0 ? 4 : 1;
    tags.add('combat');
    tags.add('buff');
    if (inLethalWindow) tags.add('finisher');
    notes.push(inLethalWindow ? '斩杀窗口' : '提高战斗收益');
  }

  if (textHasAny(searchableText, [/重置|竖置|恢复|费用|支付|access|ready|resource|reset|boost/i])) {
    score += 4;
    tags.add('resource');
    if (textHasAny(searchableText, [/重置|竖置|ready|reset/i])) tags.add('reset');
    notes.push('资源转换');
  }

  const templeSpearBattleReset = getTempleMagicSpearBattleResetOpportunity(gameState, player, effect, profile);
  if (templeSpearBattleReset) {
    score += templeSpearBattleReset.score;
    tags.add('reset');
    tags.add('combat');
    tags.add('buff');
    notes.push(...templeSpearBattleReset.notes);
  }

  if (textHasAny(searchableText, [/召唤|放置到战场|登场|play.*unit|summon|play_from/i])) {
    const openSlots = player.unitZone.filter(slot => slot === null).length;
    score += openSlots > 0 ? 6 + openSlots : -5;
    tags.add('summon');
    notes.push('展开场面');
  }

  if (textHasAny(searchableText, [/复生|复活|墓地.*战场|rebirth|revive|reanimate/i])) {
    score += player.unitZone.filter(slot => slot === null).length > 0 ? 5 : -4;
    tags.add('revive');
    tags.add('summon');
    notes.push('复生展开');
  }

  if (targetsSelfOnly && textHasAny(removalText, [/破坏|放置到墓地|送入墓地|除外|destroy|banish|return|bounce|remove/i])) {
    score -= 4;
  }

  if (context.hasTargetSpec) {
    score += targetCount > 0 ? Math.min(4, targetCount) : -20;
  }

  if (gamePlan?.primaryGoal === 'boardControl' && tags.has('removal')) score += 2;
  if (gamePlan?.primaryGoal === 'damage' && (tags.has('combat') || tags.has('finisher'))) score += 2.5;
  if (gamePlan?.primaryGoal === 'resourceLoop' && (tags.has('engine') || tags.has('resource') || tags.has('draw') || tags.has('search'))) score += 2;
  if (gamePlan?.primaryGoal === 'comboSetup' && (tags.has('engine') || tags.has('summon') || tags.has('revive'))) score += 2;

  if (effect.cost) {
    score -= 3;
    notes.push('有发动代价');
  }

  if (estimatedDeckPayment > 0 && !inLethalWindow) {
    const stopSelfDrawAtDeck = matchupRiskValue(gameState, player, profile, 'stopSelfDrawAtDeck', riskValue(profile, 'lowDeck', 10));
    const deckAfterPayment = player.deck.length - estimatedDeckPayment;
    const erosionAfterPayment = countErosion(player) + estimatedDeckPayment;
    if (deckAfterPayment <= 0 || erosionAfterPayment >= 10) {
      score -= 90 + estimatedDeckPayment * 12;
      notes.push(`effect deck payment unsafe-${estimatedDeckPayment}`);
    } else if (player.deck.length <= stopSelfDrawAtDeck) {
      const paymentRisk = deckPressurePenalty(deckAfterPayment, profile, stopSelfDrawAtDeck) + estimatedDeckPayment * 6;
      score -= paymentRisk;
      notes.push(`effect deck payment risk-${paymentRisk.toFixed(1)}`);
    }
  }

  const timingScore = scoreEffectTimingWindow(gameState, player, card, effect, {
    targetCount,
    hasTargetSpec: context.hasTargetSpec,
  });
  if (timingScore.score !== 0) {
    score += timingScore.score;
    notes.push(...timingScore.notes);
  }
  const timingTags = new Set(timingScore.tags);
  const validCounterWindow =
    gameState.phase === 'COUNTERING' ||
    (gameState.phase === 'BATTLE_FREE' && battleAttackers > 0);
  const validProtectionWindow =
    gameState.phase === 'COUNTERING' ||
    battleAttackers > 0 ||
    gameState.phase === 'DEFENSE_DECLARATION' ||
    gameState.phase === 'DAMAGE_CALCULATION';

  if (isPreventNextDestroyEffect(effect)) {
    const threat = getPreventNextDestroyThreatContext(gameState, player, profile);
    if (threat.best) {
      score += 28 + Math.min(22, threat.bestValue * 0.35);
      notes.push(`prevent destroy saves high-value unit-${threat.reason || 'threat'}`);
    } else {
      score -= gameState.phase === 'MAIN' ? 30 : 80;
      notes.push('prevent destroy held until high-value destruction threat');
    }
  }

  if (isPreventBattleDestroyEffect(effect)) {
    const threat = getPreventBattleDestroyThreatContext(gameState, player, profile);
    if (threat.best) {
      score += 28 + Math.min(22, threat.bestValue * 0.35);
      notes.push(`prevent battle destroy saves high-value unit-${threat.reason || 'threat'}`);
    } else {
      score -= gameState.phase === 'MAIN' ? 35 : 90;
      notes.push('prevent battle destroy held until a high-value unit is losing combat');
    }
  }

  if (effect.id === WHITE_TIGER_BATTLE_EXILE_RETURN_EFFECT_ID) {
    const battle = gameState.battleState;
    const isCurrentAttacker = !!battle?.attackers?.includes(card.gamecardId);
    const isCurrentDefender = battle?.defender === card.gamecardId;
    const isCurrentBattleUnit = isCurrentAttacker || isCurrentDefender;
    const threatenedInBattle = collectBattleDestroyedOwnUnits(gameState, player)
      .some(unit => unit.gamecardId === card.gamecardId);
    const currentBattleDamage = battle?.attackers?.reduce((sum, attackerId) => {
      const attackerUid = gameState.playerIds[gameState.currentTurnPlayer];
      const attacker = gameState.players[attackerUid]?.unitZone.find(unit => unit?.gamecardId === attackerId);
      return sum + Math.max(0, attacker?.damage || 0);
    }, 0) || 0;
    const currentBattleCloses =
      !!opponent &&
      isCurrentAttacker &&
      !battle?.defender &&
      (
        currentBattleDamage > opponent.deck.length ||
        opponentErosion + currentBattleDamage >= 10
      );

    if (!isCurrentBattleUnit) {
      score -= 42;
      notes.push('battle exile return waits for this unit to be in the current battle');
    } else if (threatenedInBattle) {
      score += 34 + Math.min(18, scoreStrategicBoardPresenceValue(gameState, player.uid, card, profile) * 0.2);
      notes.push('battle exile return saves this unit from battle destruction');
    } else {
      score -= currentBattleCloses ? 62 : 38;
      notes.push(currentBattleCloses
        ? 'battle exile return would remove closing battle damage'
        : 'battle exile return held when the current battle is already favorable');
    }
  }

  if (timingTags.has('counter') && !validCounterWindow) {
    score -= 22;
    notes.push('counter held for chain/battle window');
  }

  if (timingTags.has('protection') && !validProtectionWindow && !inLethalWindow) {
    score -= 16;
    notes.push('protection held until real threat');
  }

  if (
    (timingTags.has('combat') || timingTags.has('buff') || timingTags.has('finisher')) &&
    battleAttackers === 0 &&
    gameState.phase === 'BATTLE_FREE' &&
    !inLethalWindow
  ) {
    score -= 14;
    notes.push('combat effect needs an attacker');
  }

  if (
    !templeSpearBattleReset &&
    (timingTags.has('engine') || timingTags.has('draw') || timingTags.has('search') || timingTags.has('resource') || timingTags.has('summon') || timingTags.has('revive')) &&
    (gameState.phase === 'BATTLE_FREE' || gameState.phase === 'COUNTERING') &&
    !timingTags.has('combo') &&
    !timingTags.has('counter') &&
    !timingTags.has('combat') &&
    !timingTags.has('protection')
  ) {
    score -= gameState.phase === 'COUNTERING' ? 18 : 10;
    notes.push('setup effect held outside main phase');
  }

  if (
    context.hasTargetSpec &&
    targetCount <= 0 &&
    (timingTags.has('removal') || timingTags.has('tempo') || tags.has('removal') || tags.has('tempo'))
  ) {
    score -= 18;
    notes.push('effect has no valid tactical target');
  }

  if (
    targetCount > 0 &&
    inLethalWindow &&
    (timingTags.has('tempo') || timingTags.has('removal') || tags.has('tempo') || tags.has('removal'))
  ) {
    score += 6;
    notes.push('targeted effect supports closing window');
  }

  const preferences = profile.effectPreferences;
  if (preferences) {
    const preferredBias = effect.id ? preferences.preferredEffectIds?.[effect.id] || 0 : 0;
    const avoidBias = effect.id ? preferences.avoidEffectIds?.[effect.id] || 0 : 0;
    const lowDeckAvoidBias = effect.id ? preferences.lowDeckAvoidEffectIds?.[effect.id] || 0 : 0;
    const phaseBias = preferences.phaseBias?.[gameState.phase as keyof NonNullable<typeof preferences.phaseBias>] || 0;
    const tagBias = [...tags].reduce((sum, tag) => sum + (preferences.tagBias?.[tag] || 0), 0);
    const costTolerance = effect.cost ? Math.min(3, Math.max(0, preferences.highCostTolerance || 0)) : 0;
    const stopSelfDrawAtDeck = matchupRiskValue(gameState, player, profile, 'stopSelfDrawAtDeck', riskValue(profile, 'lowDeck', 10));
    const criticalDeck = riskValue(profile, 'criticalDeck', 3);
    const lowDeckAvoid =
      lowDeckAvoidBias > 0 && player.deck.length <= stopSelfDrawAtDeck
        ? lowDeckAvoidBias * (player.deck.length <= criticalDeck ? 1.5 : 1)
        : 0;
    const totalPreference = preferredBias - avoidBias - lowDeckAvoid + phaseBias + tagBias + costTolerance;

    if (lowDeckAvoid > 0) {
      notes.push(`low deck effect risk-${lowDeckAvoid.toFixed(1)}`);
    }

    if (totalPreference !== 0) {
      score += totalPreference;
      notes.push(`卡组偏好${totalPreference > 0 ? '+' : ''}${totalPreference.toFixed(1)}`);
    }
  }

  const comboEffect = scoreComboEffect(gameState, player, card, effect, profile);
  if (comboEffect.score !== 0) {
    score += comboEffect.score;
    notes.push(`combo${comboEffect.score > 0 ? '+' : ''}${comboEffect.score.toFixed(1)}${comboEffect.note ? ` ${comboEffect.note}` : ''}`);
  }

  const hookAdjustment = applyEffectScoreHook(profile, {
    ...strategyContext,
    card,
    effect,
    score,
    tags: [...tags],
    targetCount,
    notes,
  });
  if (hookAdjustment !== 0) {
    score += hookAdjustment;
    notes.push(`专属策略${hookAdjustment > 0 ? '+' : ''}${hookAdjustment.toFixed(1)}`);
  }

  if (card.isExhausted) score -= 1.5;
  const isFieldUnit = player.unitZone.some(unit => unit?.gamecardId === card.gamecardId);
  if (card.type === 'UNIT' && isFieldUnit && canUnitAttack(gameState, card)) {
    score -= (card.damage || 0) * 2.5 * profile.weights.attackBias;
    notes.push('会占用可攻击单位');
  }

  if (countErosion(player) >= 8 && textHasAny(searchableText, [/侵蚀|受到.*伤害|self.*damage|lose/i])) {
    score -= 8;
    notes.push('高侵蚀风险');
  }

  const isDevelopmentEffect =
    tags.has('draw') ||
    tags.has('search') ||
    tags.has('resource') ||
    tags.has('engine') ||
    tags.has('summon');
  const isBattlePayEffect = textHasAny(searchableText, [/支付|费用|payment|cost/i]) || !!effect.cost;
  if (
    gameState.phase === 'BATTLE_FREE' &&
    (ownAttackers.length > 0 || battleAttackers > 0) &&
    isDevelopmentEffect &&
    !tags.has('combat') &&
    !tags.has('finisher') &&
    !tags.has('removal')
  ) {
    score -= 22 + Math.max(ownAttackers.length, battleAttackers) * 3 + (isBattlePayEffect ? 6 : 0);
    notes.push('战斗中保留攻击资源');
  }

  if (notes.length === 0) {
    notes.push('稳定主动效果');
  }

  return {
    score,
    reason: `主动效果评分：${notes.join('、')}。`,
    notes,
  };
}

export function chooseAttacker(gameState: GameState, player: PlayerState, profile: DeckAiProfile, forced?: Card) {
  if (forced) return forced;

  const attackers = player.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
  const scored = attackers
    .map(card => ({
      card,
      score: scoreAttackCandidate(gameState, player, card, profile),
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].card : undefined;
}

export function chooseDefender(
  gameState: GameState,
  defender: PlayerState,
  attackingUnits: Card[],
  availableDefenders: Card[],
  profile: DeckAiProfile,
  difficulty: BotDifficulty
) {
  const totalAttackerPower = attackingUnits.reduce((sum, unit) => sum + (unit.power || 0), 0);
  const totalAttackerDamage = attackingUnits.reduce((sum, unit) => sum + (unit.damage || 0), 0);

  if (difficulty !== 'hard') {
    return availableDefenders.find(card => (card.power || 0) > totalAttackerPower) ||
      availableDefenders.find(card => (card.power || 0) === totalAttackerPower) ||
      ((countErosion(defender) >= 7 || totalAttackerDamage >= 2)
        ? [...availableDefenders].sort((a, b) => (a.power || 0) - (b.power || 0))[0]
        : undefined);
  }

  const currentErosion = countErosion(defender);
  const erosionAfterHit = currentErosion + totalAttackerDamage;
  const pressure = erosionAfterHit >= 8;
  const danger = erosionAfterHit >= 9;
  const critical = erosionAfterHit >= 10;
  const lowDeck = riskValue(profile, 'lowDeck', 10);
  const criticalDeck = riskValue(profile, 'criticalDeck', 3);
  const defensePriority = profile.gamePlan?.defensePriority ?? 0;
  const opponentUid = gameState.playerIds.find(uid => uid !== defender.uid);
  const opponentDeckProfile = getOpponentDeckProfile(gameState, opponentUid);
  const matchup = getActiveMatchupPlan(gameState, defender, profile, opponentDeckProfile);
  const strategyContext = buildStrategyContext(gameState, defender, profile, matchup, opponentDeckProfile);
  const deckCritical = defender.deck.length <= Math.max(totalAttackerDamage, criticalDeck);
  const deckPressure = defender.deck.length <= Math.max(totalAttackerDamage + 5, lowDeck);
  const incomingThreat = estimateIncomingThreat(gameState, defender, profile);
  const currentHitFatal = isDamageFatal(totalAttackerDamage, defender.deck.length, currentErosion);
  const highImpactHit = currentHitFatal || deckCritical || critical || danger || deckPressure || totalAttackerDamage >= 3;
  const attackerCombatValues = attackingUnits.map(unit => {
    const knowledge = getCardKnowledge(unit);
    const roleValue = knowledge?.roles.some(role =>
      role === 'engine' ||
      role === 'resource' ||
      role === 'combo_piece' ||
      role === 'finisher'
    ) ? 12 : 0;
    return scoreCardValue(unit, profile, strategyContext) * 0.45 +
      getCardKnowledgeValue(unit, 'preserveValue') * 0.45 +
      Math.max(0, unit.damage || 0) * 8 +
      Math.max(0, unit.power || 0) / 1000 +
      (unit.godMark ? 30 : 0) +
      roleValue;
  });
  const totalAttackerCombatValue = attackerCombatValues.reduce((sum, value) => sum + value, 0);
  const attackerDestroyedValueFor = (defenderPower: number) => {
    if (attackingUnits.length === 0) return 0;
    if (attackingUnits.length === 1) {
      return defenderPower >= totalAttackerPower ? totalAttackerCombatValue : 0;
    }
    if (defenderPower >= totalAttackerPower) return totalAttackerCombatValue;
    const eligible = attackingUnits
      .map((unit, index) => ({ unit, value: attackerCombatValues[index] || 0 }))
      .filter(({ unit }) => (unit.power || 0) <= defenderPower);
    if (eligible.length === 0) return 0;
    return Math.min(...eligible.map(({ value }) => value));
  };
  const largestIncomingDamage = incomingThreat.attackDamages[0] || totalAttackerDamage;
  const preserveBoardForPlan =
    profile.gamePlan?.mode === 'engine' ||
    profile.gamePlan?.mode === 'combo' ||
    profile.gamePlan?.primaryGoal === 'resourceLoop' ||
    profile.gamePlan?.primaryGoal === 'comboSetup';
  const mustSaveForLargerHit =
    incomingThreat.defendersNeeded > 0 &&
    availableDefenders.length <= incomingThreat.defendersNeeded &&
    totalAttackerDamage < largestIncomingDamage;
  const scored = availableDefenders.map(card => {
    const power = card.power || 0;
    const knowledge = getCardKnowledge(card);
    const boardPresenceValue = scoreStrategicBoardPresenceValue(gameState, defender.uid, card, profile, strategyContext);
    const cardValue =
      getCardKnowledgeValue(card, 'preserveValue') +
      scoreCardValue(card, profile, strategyContext) * 0.35 +
      boardPresenceValue * 0.28;
    const wins = power > totalAttackerPower;
    const trades = power === totalAttackerPower;
    const sacrifice = power < totalAttackerPower;
    const nonFatalHit = !critical && !deckCritical && !incomingThreat.lethalWithoutBlocks && !incomingThreat.lethalThroughOneBlock;
    const remainingUnits = defender.unitZone.filter(unit => unit && unit.gamecardId !== card.gamecardId);
    const remainingCounterDamage = remainingUnits
      .filter(unit => canThreatenNextTurn(gameState, unit))
      .reduce((sum, unit) => sum + (unit?.damage || 0), 0);
    const cardCounterDamage = canThreatenNextTurn(gameState, card) ? (card.damage || 0) : 0;
    const isEnginePiece = !!knowledge?.roles.some(role =>
      role === 'engine' ||
      role === 'resource' ||
      role === 'combo_piece' ||
      role === 'draw' ||
      role === 'search'
    );
    const attackerDestroyedValue = attackerDestroyedValueFor(power);
    const damagePreventionValue =
      totalAttackerDamage * (
        currentHitFatal ? 26 :
          critical ? 22 :
            deckCritical ? 20 :
              danger ? 15 :
                pressure ? 10 :
                  deckPressure ? 9 :
                    4
      );
    const ownLossValue =
      cardValue +
      Math.max(0, card.damage || 0) * 4 +
      Math.max(0, card.power || 0) / 1400 +
      (card.godMark ? 42 : 0) +
      (isEnginePiece ? 18 : 0) +
      (remainingUnits.length === 0 ? 14 : 0);
    let score = 0;

    if (wins) {
      score += 20 + defensePriority * 2;
      score += Math.min(54, attackerDestroyedValue * 0.48);
      score += damagePreventionValue;
      if (attackerDestroyedValue >= 45) score += 10;
    }
    if (trades) {
      score += 8 + defensePriority;
      score += Math.min(48, attackerDestroyedValue * 0.42);
      score += damagePreventionValue * 0.9;
    }
    if (sacrifice) {
      const saveMultiplier = currentHitFatal || critical || deckCritical ? 1 : highImpactHit ? 0.72 : 0.32;
      score += damagePreventionValue * saveMultiplier;
      if (currentHitFatal || critical || deckCritical) score += 34 + totalAttackerDamage * 8;
      else if (highImpactHit) score += 6 + totalAttackerDamage * 3;
      else score -= 14;
    }
    if (deckCritical) score += 42 + totalAttackerDamage * 10;
    else if (deckPressure) score += 18 + totalAttackerDamage * 5;
    if (incomingThreat.lethalWithoutBlocks) score += 16 + incomingThreat.defendersNeeded * 8;
    if (incomingThreat.lethalThroughOneBlock) score += 10;
    if (mustSaveForLargerHit) score -= 24 + (largestIncomingDamage - totalAttackerDamage) * 6;
    if (critical) score += 30 + totalAttackerDamage * 10;
    else if (danger) score += 18 + totalAttackerDamage * 7;
    else if (pressure) score += 8 + totalAttackerDamage * 4;
    if (sacrifice && critical) score += 6;
    if (sacrifice && !pressure && totalAttackerDamage < 2) score -= 8;
    if (trades || sacrifice) {
      const lossMultiplier = currentHitFatal || critical || deckCritical ? 0.12 : highImpactHit ? 0.32 : 0.62;
      score -= Math.min(76, ownLossValue * lossMultiplier);
      if (card.godMark && !(currentHitFatal || critical || deckCritical)) score -= 20;
    }
    if (sacrifice && !(currentHitFatal || critical || deckCritical) && totalAttackerDamage <= 1 && attackerDestroyedValue <= 0) {
      score -= 20;
    }
    if (!highImpactHit && attackerDestroyedValue <= 0 && (trades || sacrifice)) {
      score -= 12;
    }
    if (nonFatalHit && preserveBoardForPlan) {
      if (sacrifice) {
        score -= 8 + Math.min(18, cardValue * 0.25);
        if (isEnginePiece) score -= 14;
        if (remainingUnits.length === 0) score -= 14;
        if (remainingCounterDamage === 0 && cardCounterDamage > 0) score -= 8 + cardCounterDamage * 5;
        if (totalAttackerDamage <= 2) score -= 6;
      } else if (trades && (isEnginePiece || remainingUnits.length === 0)) {
        score -= 6 + (isEnginePiece ? 6 : 0);
      }
    }
    if (nonFatalHit && boardPresenceValue >= 58) {
      if (sacrifice) score -= 18 + Math.min(28, boardPresenceValue * 0.28);
      else if (trades) score -= 10 + Math.min(18, boardPresenceValue * 0.18);
      if (card.godMark) score -= 16;
    }
    if (
      profile.id === 'white-temple' &&
      isTempleMagicSpear(card) &&
      (trades || sacrifice) &&
      !(currentHitFatal || critical || deckCritical)
    ) {
      score -= 90;
      if (nonFatalHit) score -= 20;
      if (totalAttackerDamage <= 2) score -= 18;
    }

    const preserveMultiplier = (critical || deckCritical) ? 0.18 : (danger || deckPressure) ? 0.25 : 0.45;
    score -= cardValue * preserveMultiplier * profile.weights.defenseBias;
    score += applyCardScoreHook(profile, 'adjustDefenseScore', {
      ...strategyContext,
      card,
      score,
      reason: 'defense',
      attackingUnits,
      availableDefenders,
    });
    return { card, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].card : undefined;
}

function isSacrificeLikeQuery(query: EffectQuery) {
  const text = `${query.title || ''} ${query.description || ''} ${query.callbackKey || ''}`;
  return /费用|支付|弃置|丢弃|牺牲|放置到墓地|移动到墓地|cost|discard|sacrifice/i.test(text);
}

type QueryIntent = 'cost' | 'benefit' | 'revive' | 'search' | 'offense' | 'keep' | 'neutral';
const ELEMENT_MAGIC_INSTRUCTOR_EFFECT_ID = '105110112_activate';

function queryText(query: EffectQuery) {
  return [
    query.title,
    query.description,
    query.callbackKey,
    query.context?.effectId,
    query.context?.step,
    query.context?.costType,
  ].filter(Boolean).join(' ');
}

function inferQueryIntent(query: EffectQuery): QueryIntent {
  const text = queryText(query);
  const step = String(query.context?.step || '');
  const effectId = String(query.context?.effectId || '');
  const semantic = `${step} ${effectId}`;
  const intentText = `${text} ${semantic}`;
  if (/103000189_grave_enter|EXILE_COST|BANISH_COST|COST_EXILE|COST_BANISH/i.test(semantic)) return 'cost';
  if (/费用|支付|舍弃|弃置|牺牲|作为费用|放逐费用|选择放逐费用/i.test(text)) return 'cost';
  if (isSacrificeLikeQuery(query) || /COST|PAYMENT|DISCARD|SACRIFICE/i.test(semantic)) return 'cost';
  if (/KEEP|PRESERVE|SAVE|HOLD/i.test(semantic)) return 'keep';
  if (/DESTROY|EXILE|BANISH|SILENCE|CANNOT|BOTTOM|BOUNCE|ZERO|REMOVE|OPPONENT|WEAKEN|_destroy|_exile|_silence|_zero|cannot_defend|damage_zero/i.test(intentText)) return 'offense';
  if (/REVIVE|REBIRTH|REANIMATE|SUMMON|PLAY_FROM|PUT|TO_FIELD|ENTER|RETURN_FIELD|_plan|_rebirth/i.test(intentText)) return 'revive';
  if (/SEARCH|RETURN|ADD|HAND|SALVAGE|RECOVER|_search|_return|_salvage/i.test(intentText)) return 'search';
  if (/BOOST|BUFF|POWER|DAMAGE|READY|RESET|RUSH|PROTECT|BLESS|SHENYI|SPIRIT|IMMUNE|_boost|_power|_ready|_reset|_protect|spirit_boost/i.test(intentText)) return 'benefit';
  if (/鐮村潖|鏀剧疆鍒板鍦皘闄ゅ|涓嶈兘|鍔涢噺鍙樹负0/.test(text)) return 'offense';
  if (/鍔涢噺\+|浼ゅ\+|鑾峰緱|閲嶇疆|绔栫疆|淇濇姢/.test(text)) return 'benefit';
  if (/鏀剧疆鍒版垬鍦簗澧撳湴.*鎴樺満/.test(text)) return 'revive';
  if (/鍔犲叆鎵嬬墝|妫€绱鎼滅储/.test(text)) return 'search';
  return 'neutral';
}

function getBattleUnitIds(gameState: GameState) {
  const ids = new Set<string>();
  const battle = gameState.battleState;
  (battle?.attackers || []).forEach(id => ids.add(id));
  if (battle?.defender) ids.add(battle.defender);
  if (battle?.unitTargetId) ids.add(battle.unitTargetId);
  return ids;
}

function queryHasAnyText(query: EffectQuery, patterns: RegExp[]) {
  const text = queryText(query);
  return patterns.some(pattern => pattern.test(text));
}

function scoreTargetTacticalContext(
  gameState: GameState,
  playerUid: string,
  query: EffectQuery,
  card: Card,
  isMine: boolean,
  intent: QueryIntent
) {
  const player = gameState.players[playerUid];
  const opponent = player ? getOpponent(gameState, player) : undefined;
  const knowledge = getCardKnowledge(card);
  const roles = new Set(knowledge?.roles || []);
  const battleUnitIds = getBattleUnitIds(gameState);
  const isBattleUnit = battleUnitIds.has(card.gamecardId);
  const isCurrentAttacker = !!gameState.battleState?.attackers?.includes(card.gamecardId);
  const isCurrentDefender = gameState.battleState?.defender === card.gamecardId ||
    gameState.battleState?.unitTargetId === card.gamecardId;
  const playerIsTurn = player?.isTurn ?? gameState.playerIds[gameState.currentTurnPlayer] === playerUid;
  const canBlockNow = !isMine && playerIsTurn && card.cardlocation === 'UNIT' && canDefendSoon(gameState, card);
  const canAttackNow = card.cardlocation === 'UNIT' && canUnitAttack(gameState, card);
  const readyOwnAttackers = player?.unitZone.filter(unit => canUnitAttack(gameState, unit)).length || 0;
  const opponentErosion = opponent ? countErosion(opponent) : 0;
  const currentBattleDamage = (gameState.battleState?.attackers || [])
    .map(id => findCardInState(gameState, id))
    .reduce((sum, unit) => sum + Math.max(0, unit?.damage || 0), 0);
  const currentBattleFatal = !!player && isDamageFatal(currentBattleDamage, player.deck.length, countErosion(player));
  const closeToPressure = opponentErosion >= 7 ||
    (opponent ? readyOwnAttackers > 0 && readyOwnAttackers >= Math.max(1, 10 - opponentErosion - 1) : false);
  const removalLike = intent === 'offense' || queryHasAnyText(query, [
    /DESTROY|EXILE|BANISH|SILENCE|CANNOT|REMOVE|BOUNCE|RETURN.*HAND/i,
    /destroy|exile|banish|silence|cannot_defend|cannot_attack|bounce|remove/i,
  ]);
  const tempoRestriction = queryHasAnyText(query, [
    /CANNOT.*DEFEND|cannot_defend|EXHAUST|REST|TAP|ZERO|POWER.*0|DAMAGE.*0/i,
    /妯疆|涓嶈兘闃插尽|涓嶈兘鏀诲嚮|闃插尽.*涓嶈兘/i,
  ]);
  const benefitCombat = intent === 'benefit' && queryHasAnyText(query, [
    /BOOST|BUFF|POWER|DAMAGE|READY|RESET|PROTECT|BLESS|IMMUNE/i,
    /battle|combat|defend|attack|浼ゅ|鍔涢噺|闃叉|淇濇姢/i,
  ]);
  let score = 0;

  if (!isMine && removalLike) {
    if (card.cardlocation === 'UNIT') {
      score += (card.godMark ? 18 : 0) +
        (roles.has('engine') ? 18 : 0) +
        (roles.has('combo_piece') ? 14 : 0) +
        (roles.has('finisher') ? 14 : 0) +
        (roles.has('protection') ? 8 : 0);
      score += Math.max(0, card.damage || 0) * 6 + Math.max(0, card.power || 0) / 1100;
      if (isBattleUnit) score += 40;
      if (isCurrentAttacker) score += 18 + Math.max(0, card.damage || 0) * 4;
      if (isCurrentAttacker && currentBattleFatal) score += 280;
      if (canBlockNow) score += closeToPressure || tempoRestriction ? 95 : 10;
      if (tempoRestriction && canBlockNow) score += 150;
      if (tempoRestriction && card.isExhausted && !isBattleUnit) score -= 16;
    } else if (card.cardlocation === 'ITEM') {
      score += 14 + (roles.has('engine') ? 20 : 0) + (roles.has('resource') ? 10 : 0);
    }
  }

  if (isMine && benefitCombat && card.cardlocation === 'UNIT') {
    if (isBattleUnit) score += 64;
    if (isCurrentDefender) score += 96;
    if (isCurrentAttacker) score += 48;
    if (canAttackNow) score += 8 + Math.max(0, card.damage || 0) * 4;
    if (card.isExhausted && /READY|RESET|ready|reset/i.test(queryText(query))) score += 16;
    if (card.godMark || roles.has('combo_piece') || roles.has('engine')) score += 8;
  }

  return score;
}

function scoreCostPreservationValue(
  gameState: GameState | undefined,
  owner: PlayerState | undefined,
  card: Card | null | undefined,
  profile: DeckAiProfile
) {
  if (!gameState || !owner || !card) return 0;
  const knowledge = getCardKnowledge(card);
  const roles = new Set(knowledge?.roles || []);
  const text = cardSearchText(card);
  const { preserve, preferred } = profileCardBias(profile, card);
  const location = card.cardlocation;
  const isHand = !location || location === 'HAND';
  const isFieldUnit = location === 'UNIT';
  const isFieldItem = location === 'ITEM';
  const battleUnitIds = getBattleUnitIds(gameState);
  const currentBattleCard = battleUnitIds.has(card.gamecardId);
  const opponent = getOpponent(gameState, owner);
  let score = 0;

  if (card.feijingMark && isHand) score -= 22;
  else if (card.feijingMark) score -= 8;

  score += preserve * 1.15 + preferred * 0.8;
  if (card.godMark) score += isFieldUnit ? 58 : 30;
  if (roles.has('engine')) score += isFieldUnit || isFieldItem ? 24 : 14;
  if (roles.has('combo_piece')) score += isFieldUnit ? 26 : 16;
  if (roles.has('finisher')) score += isFieldUnit ? 18 : 10;
  if (roles.has('protection')) score += isHand ? 22 : 10;
  if (/COUNTER|COUNTERING|NEGATE|SILENCE|PREVENT|PROTECT|IMMUNE|反制|无效|沉默|防止|保护|不会被破坏/i.test(text)) {
    score += isHand ? 24 : 12;
  }

  if (currentBattleCard) score += 140;

  if (isFieldUnit) {
    const boardPresenceValue = scoreStrategicBoardPresenceValue(gameState, owner.uid, card, profile);
    score += boardPresenceValue * 0.35;
    if (card.playedTurn === gameState.turnCount) score += 12;

    if (canUnitAttack(gameState, card)) {
      score += Math.max(0, card.damage || 0) * 7 + Math.max(0, card.power || 0) / 900;
      if (owner.isTurn && opponent) {
        const readyAttackers = owner.unitZone.filter(unit => canUnitAttack(gameState, unit)) as Card[];
        const totalDamage = readyAttackers.reduce((sum, unit) => sum + Math.max(0, unit.damage || 0), 0);
        const damageWithoutCard = Math.max(0, totalDamage - Math.max(0, card.damage || 0));
        const opponentErosion = countErosion(opponent);
        const damageToCritical = Math.max(1, 10 - opponentErosion);
        if (totalDamage > opponent.deck.length && damageWithoutCard <= opponent.deck.length) {
          score += 70;
        } else if (totalDamage >= damageToCritical && damageWithoutCard < damageToCritical) {
          score += 52;
        } else if (opponentErosion >= 7) {
          score += 18;
        }
      }
    }

    if (canDefendSoon(gameState, card)) {
      const incomingThreat = estimateIncomingThreat(gameState, owner, profile);
      if (incomingThreat.lethalWithoutBlocks || incomingThreat.defendersNeeded > 0) {
        score += 34 + incomingThreat.defendersNeeded * 18 + Math.max(0, card.damage || 0) * 4;
      } else if (incomingThreat.totalDamage >= Math.max(4, 10 - countErosion(owner))) {
        score += 24;
      }
    }
  } else if (isFieldItem) {
    if (roles.has('resource') || roles.has('engine')) score += 18;
  }

  return score;
}

function scoreElementMagicInstructorModeChoice(
  gameState: GameState,
  playerUid: string,
  query: EffectQuery,
  option: any,
  profile: DeckAiProfile
) {
  if (query.context?.effectId !== ELEMENT_MAGIC_INSTRUCTOR_EFFECT_ID || query.context?.step !== 'CHOOSE_MODE') {
    return undefined;
  }

  const player = gameState.players[playerUid];
  if (!player) return undefined;

  const weakUnits = Object.values(gameState.players)
    .flatMap(state => state.unitZone)
    .filter((unit): unit is Card => !!unit && (unit.power || 0) <= 1500);
  const opponentWeakUnits = weakUnits.filter(unit => findCardOwnerUid(gameState, unit) !== playerUid);
  const ownWeakUnits = weakUnits.filter(unit => findCardOwnerUid(gameState, unit) === playerUid);
  const optionId = String(option.id || option.label || '').toUpperCase();

  if (optionId === 'DRAW') {
    const deckRisk = deckPressurePenalty(player.deck.length, profile);
    return 14 + (player.hand.length <= 2 ? 6 : player.hand.length <= 4 ? 3 : 0) - deckRisk * 0.35;
  }

  if (optionId === 'DAMAGE') {
    const opponent = getOpponent(gameState, player);
    const opponentErosion = opponent ? countErosion(opponent) : 0;
    return 15 + (opponentErosion >= 8 ? 10 : opponentErosion >= 6 ? 5 : 0);
  }

  if (optionId === 'DESTROY') {
    if (opponentWeakUnits.length === 0) {
      return -120 - ownWeakUnits.length * 18;
    }
    const bestOpponentTarget = Math.max(0, ...opponentWeakUnits.map(unit => scoreCardValue(unit, profile) + (unit.damage || 0) * 6));
    const discardPenalty = player.hand.length <= 1 ? 18 : player.hand.length <= 3 ? 12 : 8;
    return 16 + Math.min(18, bestOpponentTarget * 0.25) - discardPenalty;
  }

  return undefined;
}

function scoreChoiceOption(gameState: GameState, playerUid: string, query: EffectQuery, option: any, profile: DeckAiProfile) {
  const optionText = `${option.id || ''} ${option.label || ''} ${option.detail || ''}`;
  const player = gameState.players[playerUid];
  const opponent = player ? getOpponent(gameState, player) : undefined;
  const openSlots = player?.unitZone.filter(slot => slot === null).length || 0;
  const attackers = player?.unitZone.filter(unit => canUnitAttack(gameState, unit)).length || 0;
  const opponentErosion = opponent ? countErosion(opponent) : 0;
  let score = 0;

  const elementInstructorScore = scoreElementMagicInstructorModeChoice(gameState, playerUid, query, option, profile);
  if (elementInstructorScore !== undefined) return elementInstructorScore;

  if (/DECLARE_NAME/i.test(queryText(query)) && player) {
    const declaredName = String(option.id || option.label || '');
    const matchingCards = player.deck.filter(card => card.fullName === declaredName).length;
    return matchingCards * 20 + (profile.preserveCardIds?.[declaredName] || 0);
  }

  if (/^(TOP|BOTTOM)$/i.test(option.id || '') && query.context?.targetId) {
    const revealed = findCardInState(gameState, query.context.targetId);
    const revealedValue = revealed
      ? scoreCardValue(revealed, profile) + getCardKnowledgeValue(revealed, 'playPriority') * 0.5
      : 0;
    const keepThreshold = 42 + (player?.hand.length || 0) * 0.8;
    return /^TOP$/i.test(option.id || '')
      ? revealedValue
      : keepThreshold - revealedValue;
  }

  if (/^YES$/i.test(option.id || '')) return 5;
  if (/^NO$/i.test(option.id || '')) return -2;
  if (/REVIVE|REBIRTH|SUMMON|PLAY|PUT|FIELD/i.test(optionText)) score += openSlots > 0 ? 8 + openSlots : -8;
  if (/SEARCH|RETURN|ADD|HAND|SALVAGE|RECOVER/i.test(optionText)) score += (player?.hand.length || 0) <= 4 ? 6 : 3;
  if (/BOOST|BUFF|POWER|DAMAGE|READY|RESET|RUSH|SHENYI|SPIRIT/i.test(optionText)) {
    score += gameState.phase === 'BATTLE_FREE' || attackers > 0 ? 6 : 3;
    if (opponentErosion >= 7) score += 2;
  }
  if (/DESTROY|EXILE|BANISH|SILENCE|CANNOT|REMOVE/i.test(optionText)) score += 5;
  score += (profile.gamePlan?.effectPriority || 0) * 0.5;
  return score;
}

function scoreQueryCardOption(
  gameState: GameState,
  playerUid: string,
  query: EffectQuery,
  option: any,
  profile: DeckAiProfile,
  intent: QueryIntent,
  hasOwnCardOptions: boolean,
  hasOpponentCardOptions: boolean
) {
  const card = option.card as Card | undefined;
  if (!card) return 0;

  const isMine = optionIsMine(gameState, playerUid, option);
  const cardValue = scoreCardValue(card, profile);
  const preserveValue = getCardKnowledgeValue(card, 'preserveValue') + cardValue * 0.25;
  const targetPriority = getCardKnowledgeValue(card, 'targetPriority') + cardValue * 0.35;
  const playPriority = getCardKnowledgeValue(card, 'playPriority') + cardValue * 0.35;
  const attackValue = (card.damage || 0) * 8 + (card.power || 0) / 900 + (canUnitAttack(gameState, card) ? 4 : 0);
  const isFieldCard = card.cardlocation === 'UNIT' || card.cardlocation === 'ITEM';
  const isHiddenResource = card.cardlocation === 'DECK' || card.cardlocation === 'GRAVE' || card.cardlocation === 'EROSION_FRONT' || card.cardlocation === 'EROSION_BACK';
  const ownBoardPresenceValue = isMine
    ? scoreStrategicBoardPresenceValue(gameState, playerUid, card, profile)
    : 0;
  const tacticalTargetScore = scoreTargetTacticalContext(gameState, playerUid, query, card, isMine, intent);
  const ownerUid = findCardOwnerUid(gameState, card);
  const costOwner = ownerUid ? gameState.players[ownerUid] : gameState.players[playerUid];
  const costPreservationValue = scoreCostPreservationValue(gameState, costOwner, card, profile);

  if (isPreventDestroyTargetQuery(query)) {
    if (!isMine) return -160;
    const player = gameState.players[playerUid];
    const threat = player ? getPreventDestroyQueryThreatContext(gameState, player, profile, query) : undefined;
    const threatened = threat?.units.find(entry => entry.unit.gamecardId === card.gamecardId);
    return threatened
      ? 140 + threatened.value
      : -120 - ownBoardPresenceValue * 0.25;
  }

  if (intent === 'cost') {
    return -preserveValue -
      (isFieldCard ? attackValue * 0.5 : 0) -
      ownBoardPresenceValue * 0.95 -
      (card.godMark && isMine ? 24 : 0) -
      costPreservationValue;
  }

  if (intent === 'keep') {
    return preserveValue + attackValue * 0.3;
  }

  if (intent === 'benefit') {
    let score = playPriority + attackValue * 0.75 + preserveValue * 0.25;
    if (isMine) score += 20;
    else if (hasOwnCardOptions) score -= 60;
    if (card.isExhausted) score += /READY|RESET|ready|reset/i.test(queryText(query)) ? 8 : -2;
    if ((card.damage || 0) <= 0 && /DAMAGE|浼ゅ/i.test(queryText(query))) score -= 5;
    return score + tacticalTargetScore;
  }

  if (intent === 'revive') {
    let score = playPriority + preserveValue * 0.4 + attackValue * 0.5;
    if (isMine) score += 12;
    else if (hasOwnCardOptions) score -= 40;
    if (card.type !== 'UNIT') score -= 4;
    if (isHiddenResource) score += 3;
    return score;
  }

  if (intent === 'search') {
    let score = playPriority + cardValue * 0.35;
    if (isMine) score += 10;
    else if (hasOwnCardOptions) score -= 35;
    if (card.type === 'UNIT' && profile.gamePlan?.primaryGoal === 'damage') score += (card.damage || 0) * 2;
    if (card.type === 'ITEM' && profile.gamePlan?.primaryGoal === 'resourceLoop') score += 3;
    return score;
  }

  if (intent === 'offense') {
    const unsafeOwnRemoval =
      isMine &&
      query.context?.effectId === ELEMENT_MAGIC_INSTRUCTOR_EFFECT_ID &&
      query.context?.step === 'DESTROY_UNIT';
    if (unsafeOwnRemoval) {
      return -140 - preserveValue - attackValue - ownBoardPresenceValue * 1.25;
    }

    if (isMine && isLikelyOwnBoardLossQuery(query, intent)) {
      return -110 - preserveValue - attackValue - ownBoardPresenceValue * 1.15;
    }

    let score = targetPriority + attackValue * 0.45 + tacticalTargetScore;
    if (!isMine) score += 20;
    else if (hasOpponentCardOptions) score -= 55;
    else score -= 35 + ownBoardPresenceValue * 0.35;
    if (!isMine && card.godMark) score += 4;
    return score;
  }

  if (isMine && !hasOpponentCardOptions) {
    return playPriority + preserveValue * 0.2;
  }
  if (!isMine && hasOpponentCardOptions) {
    return targetPriority + 4;
  }
  return cardValue;
}

function deckPressurePenalty(deckCount: number, profile?: DeckAiProfile, stopAtOverride?: number) {
  const criticalDeck = profile ? riskValue(profile, 'criticalDeck', 3) : 3;
  const lowDeck = profile ? riskValue(profile, 'lowDeck', 10) : 10;
  const stopAt = stopAtOverride ?? (profile ? riskValue(profile, 'stopSelfDrawAtDeck', lowDeck) : lowDeck);
  if (deckCount <= criticalDeck) return 32;
  if (deckCount <= Math.max(criticalDeck + 3, Math.floor(stopAt * 0.6))) return 22;
  if (deckCount <= stopAt) return 13;
  if (deckCount <= lowDeck + 5) return 5;
  return 0;
}

function scorePlayerTargetOption(gameState: GameState, playerUid: string, query: EffectQuery, option: any, profile: DeckAiProfile) {
  const optionId = option.card?.id || option.card?.gamecardId || option.id;
  if (optionId !== 'PLAYER_SELF' && optionId !== 'PLAYER_OPPONENT') return undefined;

  const player = gameState.players[playerUid];
  const opponentUid = gameState.playerIds.find(uid => uid !== playerUid);
  const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
  if (!player || !opponent) return optionId === 'PLAYER_SELF' ? 0 : 1;

  const target = optionId === 'PLAYER_SELF' ? player : opponent;
  const isSelf = target.uid === player.uid;
  const text = `${query.title || ''} ${query.description || ''} ${query.callbackKey || ''} ${query.context?.effectId || ''} ${query.context?.step || ''}`;
  const drawLike = /抽|充能|卡组顶|侵蚀|draw|recharge|deck|erosion/i.test(text);
  const damageLike = /伤害|damage|DEAL_DAMAGE/i.test(text);
  const skipDrawLike = /跳过|skip/i.test(text);

  let score = isSelf ? 0 : 1;

  if (damageLike) score += isSelf ? -40 : 40;
  if (skipDrawLike) score += isSelf ? -20 : 20;

  if (drawLike) {
    if (isSelf) {
      score += player.hand.length <= 2 ? 10 : player.hand.length <= 4 ? 4 : -3;
      const stopSelfDrawAtDeck = matchupRiskValue(gameState, player, profile, 'stopSelfDrawAtDeck', 10);
      score -= deckPressurePenalty(player.deck.length, profile, stopSelfDrawAtDeck);
      if (countErosion(player) >= 7) score -= 8;
    } else {
      score += opponent.deck.length <= player.deck.length ? 8 : 2;
      score += opponent.deck.length <= 10 ? 14 : opponent.deck.length <= 15 ? 7 : 0;
      if (player.deck.length <= 12) score += 12;
      if (countErosion(opponent) >= 7) score += 5;
    }
  }

  return score;
}

export function chooseQuerySelections(
  gameState: GameState,
  playerUid: string,
  query: EffectQuery,
  profile: DeckAiProfile,
  difficulty: BotDifficulty
) {
  const selectableOptions = (query.options || []).filter(option => !option.disabled);
  const minSelections = query.minSelections ?? 1;
  const maxSelections = query.maxSelections ?? minSelections;
  const requiredSelectionCount = Math.max(0, Math.min(minSelections, maxSelections, selectableOptions.length));
  const maxSelectionCount = Math.max(requiredSelectionCount, Math.min(maxSelections, selectableOptions.length));

  if (query.callbackKey === 'TRIGGER_CHOICE') return ['YES'];
  if (maxSelectionCount === 0) return [];
  if (difficulty !== 'hard') {
    return selectableOptions
      .slice(0, requiredSelectionCount)
      .map(option => option.card?.gamecardId || option.id)
      .filter(Boolean) as string[];
  }

  if (query.type === 'SELECT_CHOICE') {
    const yes = selectableOptions.find(option => option.id === 'YES');
    const no = selectableOptions.find(option => option.id === 'NO');
    if (yes && no && /ATTACK_TARGET|TARGET_CHOICE|TRIGGER|SHENYI/i.test(query.callbackKey || '')) return ['YES'];
    const player = gameState.players[playerUid];
    const strategyContext = player ? buildStrategyContext(gameState, player, profile) : { gameState };
    const scoredChoices = selectableOptions
      .map(option => {
        const baseScore = scoreChoiceOption(gameState, playerUid, query, option, profile);
        return {
          option,
          score: baseScore + applyQueryScoreHook(profile, {
            ...strategyContext,
            query,
            option,
            score: baseScore,
          }),
        };
      })
      .sort((a, b) => b.score - a.score);
    return selectScoredEntries(scoredChoices, requiredSelectionCount, maxSelectionCount)
      .map(({ option }) => option.id || option.card?.gamecardId)
      .filter(Boolean) as string[];
  }

  const playerTargetOptions = selectableOptions
    .map(option => ({ option, score: scorePlayerTargetOption(gameState, playerUid, query, option, profile) }))
    .filter((entry): entry is { option: any; score: number } => entry.score !== undefined);
  if (playerTargetOptions.length === selectableOptions.length && playerTargetOptions.length > 0) {
    const scoredPlayerTargets = playerTargetOptions
      .sort((a, b) => b.score - a.score);
    return selectScoredEntries(scoredPlayerTargets, requiredSelectionCount, maxSelectionCount)
      .map(({ option }) => option.card?.gamecardId || option.id)
      .filter(Boolean) as string[];
  }

  const intent = inferQueryIntent(query);
  const hasOwnCardOptions = selectableOptions.some(option => option.card && optionIsMine(gameState, playerUid, option));
  const hasOpponentCardOptions = selectableOptions.some(option => option.card && !optionIsMine(gameState, playerUid, option));
  const player = gameState.players[playerUid];
  const strategyContext = player ? buildStrategyContext(gameState, player, profile) : { gameState };
  const scored = selectableOptions
    .map(option => {
      const card = option.card;
      const baseScore = card
        ? scoreQueryCardOption(gameState, playerUid, query, option, profile, intent, hasOwnCardOptions, hasOpponentCardOptions)
        : 0;
      return {
        option,
        score: baseScore + applyQueryScoreHook(profile, {
          ...strategyContext,
          query,
          option,
          score: baseScore,
          intent,
        }),
      };
    })
    .sort((a, b) => b.score - a.score);

  if (
    !isPreventDestroyTargetQuery(query) &&
    isLikelyOwnBoardLossQuery(query, intent) &&
    scored.length > 0 &&
    scored.every(entry => !entry.option.card || optionIsMine(gameState, playerUid, entry.option))
  ) {
    const selected = selectScoredEntries(scored, requiredSelectionCount, maxSelectionCount)
      .filter(entry => entry.option.card);
    const onlyProtectedChoices = selected.length > 0 && selected.every(entry => {
      const card = entry.option.card as Card;
      const isFieldCard = card.cardlocation === 'UNIT' || card.cardlocation === 'ITEM';
      return isFieldCard && (card.godMark || scoreStrategicBoardPresenceValue(gameState, playerUid, card, profile) >= 58);
    });
    if (onlyProtectedChoices) return [];
  }

  if (
    query.context?.effectId === ELEMENT_MAGIC_INSTRUCTOR_EFFECT_ID &&
    query.context?.step === 'DESTROY_UNIT' &&
    scored.length > 0 &&
    scored.every(entry => !entry.option.card || optionIsMine(gameState, playerUid, entry.option))
  ) {
    return [];
  }

  return selectScoredEntries(scored, requiredSelectionCount, maxSelectionCount)
    .map(({ option }) => option.card?.gamecardId || option.id)
    .filter(Boolean) as string[];
}

export function chooseDiscardCard(player: PlayerState, profile: DeckAiProfile, difficulty: BotDifficulty, gameState?: GameState) {
  if (difficulty !== 'hard') return player.hand[0];
  const scoreDiscardValue = (card: Card) => {
    const strategyContext = gameState ? buildStrategyContext(gameState, player, profile) : {};
    const baseScore =
      getCardKnowledgeValue(card, 'discardValue') +
      scoreCardValue(card, profile, gameState ? { gameState, player } : {}) * 0.2 +
      scoreComboCard(gameState, player, card, profile, 'discard');
    return baseScore + applyCardScoreHook(profile, 'adjustDiscardScore', {
      ...strategyContext,
      card,
      score: baseScore,
      reason: 'discard',
    });
  };
  return [...player.hand].sort((a, b) => scoreDiscardValue(a) - scoreDiscardValue(b))[0];
}

function findOwnerOfCard(gameState: GameState | undefined, card: Card | null | undefined) {
  if (!gameState || !card) return undefined;
  return Object.values(gameState.players).find(player =>
    [
      ...player.hand,
      ...player.grave,
      ...player.exile,
      ...player.unitZone,
      ...player.itemZone,
      ...player.erosionFront,
      ...player.erosionBack,
      ...player.playZone,
    ].some(candidate => candidate?.gamecardId === card.gamecardId)
  );
}

export function scorePaymentSacrificeValue(
  card: Card | null | undefined,
  profile: DeckAiProfile,
  gameState?: GameState,
  player?: PlayerState
) {
  if (!card) return 0;
  const owner = player || findOwnerOfCard(gameState, card);
  const boardPresenceValue = gameState && owner
    ? scoreStrategicBoardPresenceValue(gameState, owner.uid, card, profile)
    : 0;
  const baseScore = getCardKnowledgeValue(card, 'preserveValue') +
    scoreCardValue(card, profile, gameState && owner ? { gameState, player: owner } : {}) * 0.25 +
    boardPresenceValue * 0.8 +
    scoreComboCard(gameState, owner, card, profile, 'paymentSacrifice') +
    scoreCostPreservationValue(gameState, owner, card, profile);
  if (!gameState || !owner) return baseScore;

  const strategyContext = buildStrategyContext(gameState, owner, profile);
  return baseScore + applyCardScoreHook(profile, 'adjustPaymentScore', {
    ...strategyContext,
    card,
    score: baseScore,
    reason: 'paymentSacrifice',
  });
}

export function scorePaymentExhaustValue(
  gameState: GameState,
  card: Card | null | undefined,
  profile: DeckAiProfile,
  difficulty: BotDifficulty
) {
  const owner = findOwnerOfCard(gameState, card);
  let score = scorePaymentSacrificeValue(card, profile, gameState, owner);
  if (difficulty === 'hard' && owner && card?.cardlocation === 'UNIT') {
    const boardPresenceValue = scoreStrategicBoardPresenceValue(gameState, owner.uid, card, profile);
    score += boardPresenceValue * 0.45;
    if (card.godMark) score += 18;
    if (canDefendSoon(gameState, card)) score += 6 + (card.damage || 0) * 4;
  }
  if (difficulty === 'hard' && gameState.phase === 'MAIN' && canUnitAttack(gameState, card)) {
    score += ((card?.damage || 0) * 9 + (card?.power || 0) / 1000) * profile.weights.attackBias;
  }
  score += scoreComboCard(gameState, owner, card, profile, 'paymentExhaust');
  return score;
}
