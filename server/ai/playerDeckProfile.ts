import { Card, GameState, PlayerState } from '../../src/types/game';
import { DeckAiMatchupPlan, DeckAiProfile, PlayerDeckArchetype, PlayerDeckProfile } from './types';
import { getCardKnowledge } from './cardKnowledge';
import { ALL_DECK_AI_PROFILES } from './deckProfiles';
import { SERVER_CARD_LIBRARY } from '../card_loader';
import { decodeDeckShareCode } from '../../src/lib/deckShareCode';

const getCardCost = (card: Card) => Math.max(0, card.baseAcValue ?? card.acValue ?? 0);
const knownProfileDeckRefs = new Map<string, { id: string; name: string; refs: Map<string, number> }>();
let knownProfileCatalogKey = '';

function allPlayerCards(player: PlayerState | undefined) {
  if (!player) return [] as Card[];
  return [
    ...player.deck,
    ...player.hand,
    ...player.grave,
    ...player.exile,
    ...player.playZone,
    ...player.unitZone,
    ...player.itemZone,
    ...player.erosionFront,
    ...player.erosionBack,
  ].filter((card): card is Card => !!card);
}

function incrementMap(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function cardProfileRef(card: Card) {
  return card.uniqueId || card.id;
}

function getKnownProfileDeckRefs() {
  const catalogRefs = Object.keys(SERVER_CARD_LIBRARY).filter(ref => ref.includes(':')).sort();
  const catalogKey = `${catalogRefs.length}|${catalogRefs.join('|')}`;
  if (knownProfileCatalogKey === catalogKey && knownProfileDeckRefs.size > 0) return knownProfileDeckRefs;

  knownProfileDeckRefs.clear();
  knownProfileCatalogKey = catalogKey;
  if (catalogRefs.length === 0) return knownProfileDeckRefs;

  for (const profile of ALL_DECK_AI_PROFILES) {
    if (!profile.shareCode) continue;
    try {
      const refs = decodeDeckShareCode(profile.shareCode, catalogRefs);
      const counts = new Map<string, number>();
      refs.forEach(ref => incrementMap(counts, ref));
      knownProfileDeckRefs.set(profile.id, { id: profile.id, name: profile.displayName, refs: counts });
    } catch {
      // Ignore stale or incompatible share codes; dynamic profiling still works.
    }
  }

  return knownProfileDeckRefs;
}

function detectKnownDeckProfile(cards: Card[]) {
  const fullCounts = new Map<string, number>();
  cards.forEach(card => incrementMap(fullCounts, cardProfileRef(card)));
  const fullSize = [...fullCounts.values()].reduce((sum, count) => sum + count, 0);
  if (fullSize < 45) return undefined;

  let best: { id: string; name: string; score: number; overlap: number; missing: number; extra: number } | undefined;
  for (const known of getKnownProfileDeckRefs().values()) {
    const knownSize = [...known.refs.values()].reduce((sum, count) => sum + count, 0);
    let overlap = 0;
    for (const [ref, count] of known.refs.entries()) {
      overlap += Math.min(count, fullCounts.get(ref) || 0);
    }
    const missing = Math.max(0, knownSize - overlap);
    const extra = Math.max(0, fullSize - overlap);
    const score = overlap / Math.max(1, Math.max(knownSize, fullSize));
    if (!best || score > best.score) {
      best = { id: known.id, name: known.name, score, overlap, missing, extra };
    }
  }

  if (!best || best.score < 0.92 || best.missing > 4 || best.extra > 4) return undefined;
  return best;
}

function cardText(card: Card) {
  return [
    card.fullName,
    card.specialName,
    card.faction,
    card.color,
    ...(card.effects || []).flatMap(effect => [
      effect.id,
      effect.content,
      effect.description,
      effect.triggerEvent,
    ]),
  ].filter(Boolean).join(' ');
}

function increment(map: Record<string, number>, key: string | undefined | null, amount = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function topKeys(map: Record<string, number>, limit = 2) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function ratio(count: number, size: number) {
  return size > 0 ? count / size : 0;
}

function chooseArchetype(scores: PlayerDeckProfile['scores'], size: number): { archetype: PlayerDeckArchetype; confidence: number } {
  const adjustedAggro = scores.aggression - scores.engine * 0.32 - scores.control * 0.22 - scores.combo * 0.2;
  const adjustedTempo = scores.tempo + scores.aggression * 0.22 + scores.engine * 0.08 - scores.defense * 0.15;
  const adjustedControl = scores.control + scores.defense * 0.45 + scores.removal * 0.25 - scores.aggression * 0.12;
  const adjustedEngine = scores.engine + scores.resource * 0.4 + scores.combo * 0.12 - scores.aggression * 0.18;
  const adjustedCombo = scores.combo + scores.recursion * 0.55 + scores.engine * 0.15 - scores.aggression * 0.14;
  const entries: Array<[PlayerDeckArchetype, number]> = [
    ['aggro', adjustedAggro],
    ['tempo', adjustedTempo],
    ['control', adjustedControl],
    ['engine', adjustedEngine],
    ['combo', adjustedCombo],
  ];
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const [bestArchetype, bestScore] = sorted[0];
  const secondScore = sorted[1]?.[1] || 0;
  const midrangeScore = size > 0 ? 11 : 0;

  if (
    bestArchetype === 'engine' &&
    adjustedTempo >= adjustedEngine * 0.5 &&
    scores.tempo >= 45 &&
    scores.aggression >= 50
  ) {
    return {
      archetype: 'tempo',
      confidence: Math.max(0.55, Math.min(0.9, adjustedTempo / Math.max(1, adjustedEngine))),
    };
  }

  if (bestScore < midrangeScore || bestScore - secondScore < 1.6) {
    return {
      archetype: 'midrange',
      confidence: Math.max(0.35, Math.min(0.7, bestScore / Math.max(1, midrangeScore + 4))),
    };
  }

  return {
    archetype: bestArchetype,
    confidence: Math.max(0.45, Math.min(0.95, (bestScore - secondScore + 4) / 14)),
  };
}

export function analyzePlayerDeckProfile(cards: Card[], uid?: string): PlayerDeckProfile {
  const size = cards.length;
  const knownProfile = detectKnownDeckProfile(cards);
  const colors: Record<string, number> = {};
  const factions: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  const roleCounts: Record<string, number> = {};
  let totalCost = 0;
  let unitCount = 0;
  let lowCostUnits = 0;
  let rushUnits = 0;
  let highDamageUnits = 0;
  let highPowerUnits = 0;
  let totalDamage = 0;
  let graveRecursion = 0;
  let selfDamageOrCostRisk = 0;

  for (const card of cards) {
    const knowledge = getCardKnowledge(card);
    const cost = getCardCost(card);
    const text = cardText(card);
    totalCost += cost;
    increment(colors, String(card.color || 'NONE'));
    increment(factions, String(card.faction || 'UNKNOWN'));
    increment(typeCounts, String(card.type || 'UNKNOWN'));

    for (const role of knowledge?.roles || []) {
      increment(roleCounts, role);
    }

    if (card.type === 'UNIT') {
      unitCount += 1;
      totalDamage += card.damage || 0;
      if (cost <= 3) lowCostUnits += 1;
      if (card.isrush) rushUnits += 1;
      if ((card.damage || 0) >= 2) highDamageUnits += 1;
      if ((card.power || 0) >= 5000) highPowerUnits += 1;
    }

    if (/复生|复活|墓地.*战场|墓地.*登场|grave.*field|revive|rebirth|reanimate/i.test(text)) {
      graveRecursion += 1;
    }
    if (/受到.*伤害|自.*伤害|弃置|舍弃|失去|self.*damage|discard|lose/i.test(text)) {
      selfDamageOrCostRisk += 1;
    }
  }

  const avgCost = size > 0 ? totalCost / size : 0;
  const unitRatio = ratio(unitCount, size);
  const lowCurveRatio = ratio(lowCostUnits, Math.max(1, unitCount));
  const avgUnitDamage = unitCount > 0 ? totalDamage / unitCount : 0;
  const role = (key: string) => roleCounts[key] || 0;
  const roleDensity = (key: string) => ratio(role(key), size);

  const scores = {
    aggression:
      unitRatio * 8 +
      lowCurveRatio * 7 +
      avgUnitDamage * 3.5 +
      rushUnits * 1.8 +
      highDamageUnits * 1.5 +
      role('damage') * 1.2 +
      role('finisher') * 1.7,
    defense:
      role('defender') * 1.8 +
      role('protection') * 1.4 +
      highPowerUnits * 1.4 +
      Math.max(0, avgCost - 3.2) * 1.5,
    engine:
      role('engine') * 2.2 +
      role('draw') * 1.7 +
      role('search') * 1.8 +
      role('resource') * 1.6,
    combo:
      role('combo_piece') * 2.1 +
      role('search') * 1.3 +
      role('engine') * 1.2 +
      graveRecursion * 2.2,
    control:
      role('removal') * 2.1 +
      role('tempo') * 1.2 +
      role('protection') * 1.1 +
      role('defender') * 1.2,
    resource:
      role('resource') * 2 +
      role('draw') * 1.4 +
      role('search') * 1.3,
    recursion: graveRecursion * 2.4,
    removal: role('removal') * 2,
    tempo: role('tempo') * 2 + rushUnits * 1.2 + role('search') * 0.8,
  };

  const { archetype, confidence } = chooseArchetype(scores, size);
  const traits: string[] = [];
  if (lowCurveRatio >= 0.5 && unitRatio >= 0.5 && avgCost <= 3.4) traits.push('low-curve-swarm');
  if (rushUnits >= 4 || (highDamageUnits >= 12 && lowCurveRatio >= 0.6 && scores.aggression >= 105)) traits.push('burst-damage');
  if (roleDensity('removal') >= 0.14) traits.push('removal-heavy');
  if (roleDensity('draw') + roleDensity('search') >= 0.22) traits.push('card-selection');
  if (roleDensity('engine') + roleDensity('resource') >= 0.22) traits.push('engine-density');
  if (graveRecursion >= 4) traits.push('grave-recursion');
  if (highPowerUnits >= 6 || roleDensity('defender') >= 0.14) traits.push('large-defenders');
  if (selfDamageOrCostRisk >= 5) traits.push('self-risk');

  const primaryColors = topKeys(colors).join('/');
  const primaryFactions = topKeys(factions).join('/');
  return {
    uid,
    knownProfileId: knownProfile?.id,
    knownProfileName: knownProfile?.name,
    archetype,
    confidence: knownProfile ? Math.max(confidence, 0.98) : confidence,
    size,
    averageCost: Number(avgCost.toFixed(2)),
    colors,
    factions,
    typeCounts,
    roleCounts,
    scores,
    traits,
    summary: `${knownProfile ? `${knownProfile.name} ` : ''}${primaryColors || 'unknown'} ${primaryFactions || 'unknown'} ${archetype} (${traits.slice(0, 3).join(', ') || 'balanced'})`,
  };
}

export function inferPlayerDeckProfile(gameState: GameState, playerUid?: string): PlayerDeckProfile | undefined {
  if (!playerUid) return undefined;
  const player = gameState.players[playerUid];
  if (!player) return undefined;
  return analyzePlayerDeckProfile(allPlayerCards(player), playerUid);
}

export function buildDynamicMatchupPlan(opponent: PlayerDeckProfile | undefined, ownProfile?: DeckAiProfile): DeckAiMatchupPlan | undefined {
  if (!opponent) return undefined;

  const plan: DeckAiMatchupPlan = {
    notes: [`dynamic opponent: ${opponent.summary}`],
  };
  if (opponent.knownProfileId) {
    plan.notes!.push(`known opponent profile: ${opponent.knownProfileId}`);
  }
  const confidence = Math.max(0.45, opponent.confidence);
  const scale = (value: number) => Number((value * confidence).toFixed(2));
  const addNote = (note: string) => plan.notes!.push(note);

  switch (opponent.archetype) {
    case 'aggro':
      plan.defenseBias = scale(0.85);
      plan.defenderReserveBias = scale(1.05);
      plan.developmentBias = scale(-0.3);
      plan.stopSelfDrawAtDeck = Math.max(11, ownProfile?.riskThresholds?.stopSelfDrawAtDeck || 10);
      plan.stopSearchAtDeck = Math.max(10, ownProfile?.riskThresholds?.stopSearchAtDeck || 9);
      addNote('reserve blockers and avoid slow setup against aggro');
      break;
    case 'tempo':
      plan.defenseBias = scale(0.35);
      plan.effectBias = scale(0.35);
      plan.attackBias = scale(0.2);
      plan.defenderReserveBias = scale(0.45);
      addNote('match tempo while keeping one blocker for swing turns');
      break;
    case 'engine':
      plan.attackBias = scale(0.55);
      plan.closeGameBias = scale(0.55);
      plan.effectBias = scale(0.3);
      plan.defenderReserveBias = scale(-0.15);
      addNote('pressure engine decks before value compounds');
      break;
    case 'combo':
      plan.attackBias = scale(0.7);
      plan.closeGameBias = scale(0.65);
      plan.effectBias = scale(0.45);
      plan.defenderReserveBias = scale(-0.2);
      addNote('race combo setup and prioritize disruption windows');
      break;
    case 'control':
      plan.developmentBias = scale(0.35);
      plan.effectBias = scale(0.4);
      plan.attackBias = scale(0.25);
      plan.closeGameBias = scale(0.25);
      addNote('build durable threats and do not overcommit into control');
      break;
    case 'midrange':
    default:
      plan.attackBias = scale(0.18);
      plan.defenseBias = scale(0.18);
      plan.effectBias = scale(0.2);
      addNote('balanced opponent profile');
      break;
  }

  if (opponent.traits.includes('burst-damage')) {
    plan.defenseBias = (plan.defenseBias || 0) + scale(0.25);
    plan.defenderReserveBias = (plan.defenderReserveBias || 0) + scale(0.35);
    addNote('respect burst damage');
  }
  if (opponent.traits.includes('removal-heavy')) {
    plan.developmentBias = (plan.developmentBias || 0) - scale(0.15);
    plan.effectBias = (plan.effectBias || 0) + scale(0.2);
    addNote('expect removal-heavy exchanges');
  }
  if (opponent.traits.includes('grave-recursion')) {
    plan.attackBias = (plan.attackBias || 0) + scale(0.25);
    plan.effectBias = (plan.effectBias || 0) + scale(0.25);
    addNote('close before grave recursion stabilizes');
  }
  if (opponent.traits.includes('large-defenders')) {
    plan.effectBias = (plan.effectBias || 0) + scale(0.25);
    plan.closeGameBias = (plan.closeGameBias || 0) + scale(0.15);
    addNote('value removal and evasion into large defenders');
  }

  if (ownProfile?.gamePlan?.mode === 'aggro') {
    plan.attackBias = (plan.attackBias || 0) + 0.2;
    plan.defenderReserveBias = (plan.defenderReserveBias || 0) - 0.15;
  } else if (ownProfile?.gamePlan?.mode === 'control') {
    plan.defenseBias = (plan.defenseBias || 0) + 0.15;
    plan.defenderReserveBias = (plan.defenderReserveBias || 0) + 0.15;
  } else if (ownProfile?.gamePlan?.mode === 'engine' || ownProfile?.gamePlan?.mode === 'combo') {
    plan.developmentBias = (plan.developmentBias || 0) + 0.15;
  }

  return plan;
}

export function mergeMatchupPlans(...plans: Array<DeckAiMatchupPlan | undefined>): DeckAiMatchupPlan | undefined {
  const validPlans = plans.filter(Boolean) as DeckAiMatchupPlan[];
  if (validPlans.length === 0) return undefined;

  const merged: DeckAiMatchupPlan = {
    notes: validPlans.flatMap(plan => plan.notes || []),
  };
  const additiveKeys: Array<keyof Pick<DeckAiMatchupPlan, 'attackBias' | 'defenseBias' | 'developmentBias' | 'effectBias' | 'closeGameBias' | 'defenderReserveBias'>> = [
    'attackBias',
    'defenseBias',
    'developmentBias',
    'effectBias',
    'closeGameBias',
    'defenderReserveBias',
  ];

  for (const key of additiveKeys) {
    const value = validPlans.reduce((sum, plan) => sum + (plan[key] || 0), 0);
    if (value !== 0) (merged as any)[key] = Number(value.toFixed(2));
  }

  merged.stopSelfDrawAtDeck = validPlans
    .map(plan => plan.stopSelfDrawAtDeck)
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => b - a)[0];
  merged.stopSearchAtDeck = validPlans
    .map(plan => plan.stopSearchAtDeck)
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => b - a)[0];

  return merged;
}
