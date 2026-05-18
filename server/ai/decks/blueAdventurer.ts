import { DeckAiProfile } from '../types';
import { cardCost, cardText, effectHasTag, hasAny, hasRole, openUnitSlots, opponentErosion, opponentHasTrait, opponentIs, queryEffectId, queryOptionCard, queryOptionIsMine, queryStep, readyAttackers } from './strategyUtils';

const BLUE_CORE_IDS = new Set([
  '104000073',
  '104020068',
  '104030125',
  '104030126',
  '104030450',
  '304030075',
]);

const BLUE_EROSION_PAYOFF_PRIORITY: Record<string, number> = {
  '104030453': 36,
  '104030459': 35,
  '104030454': 34,
  '104030450': 32,
  '104030452': 26,
  '104030451': 24,
};

const BLUE_SWAP_EFFECT_IDS = new Set([
  'aketi_play_from_erosion',
  '104030459_swap_activate',
  '104030453_swap',
  'wen_swap_activate',
  'freya_ranger_activate',
  'dragon_wing_receptionist_activate',
  'accept_commission_activate',
]);

const BLUE_OPPONENT_TEMPO_EFFECT_IDS = new Set([
  '204020024_activate',
  'sodo_entry_bounce',
  '104030459_entry_exhaust',
]);

export const blueAdventurerProfile: DeckAiProfile = {
  id: 'blue-adventurer',
  displayName: '纯蓝冒险家',
  shareCode: 'GiZGyewEtT6lckR2Hcp99EgcA8tX2-BW6Hx6NI_c',
  notes: '偏节奏和手牌质量，重视低费展开与效果牌选择。',
  preferredFactions: ['冒险家'],
  preferredCardIds: {
    '104000073': 10,
    '104020068': 12,
    '104030453': 9,
    '104030459': 9,
    '104030450': 8,
    '104030454': 9,
    '304030075': 12,
  },
  preserveCardIds: {
    '104000073': 16,
    '104020068': 18,
    '104030453': 10,
    '104030459': 10,
    '104030450': 10,
    '104030454': 11,
    '204000145': 12,
    '204000026': 14,
    '304030075': 16,
  },
  effectPreferences: {
    preferredEffectIds: {
      'gensou_swallow_counter': 3,
      '204000145_counter_silence': 3,
      'aketi_play_from_erosion': 5,
      'aketi_goddess_bounce': 5,
      'seii_from_erosion': 5,
      'seii_to_erosion': 3,
      '104030459_swap_activate': 6,
      '104020066_activate_1': 4,
      '104020066_activate_2': 1,
      '104030453_swap': 4,
      'wen_swap_activate': 4,
      'freya_ranger_activate': 4,
      'dragon_wing_receptionist_activate': 4,
      'accept_commission_activate': 5,
      '304020009_activate': 1,
      '204020024_activate': 4,
    },
    tagBias: {
      search: 3,
      draw: 1,
      summon: 3,
      resource: 2,
      tempo: 1.5,
      engine: 1,
    },
    phaseBias: {
      MAIN: 1,
      BATTLE_FREE: 0.5,
    },
    highCostTolerance: 2,
  },
  gamePlan: {
    mode: 'tempo',
    primaryGoal: 'deckPressure',
    attackPriority: 1.2,
    defensePriority: 0.8,
    developmentPriority: 1.1,
    effectPriority: 1.2,
    closeGameBias: 1.4,
    defenderReserveBias: 0.5,
    notes: ['Use early tempo to pressure erosion, but stop spending deck once the library is low.'],
  },
  riskThresholds: {
    lowDeck: 13,
    criticalDeck: 5,
    stopSelfDrawAtDeck: 14,
    stopSearchAtDeck: 12,
    highErosion: 7,
    criticalErosion: 9,
    reserveDefendersAtDeck: 12,
  },
  softCompensation: {
    openingSmoothing: true,
    fixedOpeningHandIds: ['104030455', '104030451', '304030075', '104020068'],
    openingLookahead: 9,
    maxOpeningReplacements: 1,
    extremeBrickRescueChance: 0.3,
    fullOpponentDeckProfile: true,
    notes: ['Slightly smooth openings toward one low-cost tempo unit or selection engine.'],
  },
  matchupPlans: {
    'red-dikai': {
      defenseBias: 0.6,
      defenderReserveBias: 1,
      stopSelfDrawAtDeck: 15,
      notes: ['Respect red burst damage and keep one extra ready unit when possible.'],
    },
    'white-temple': {
      attackBias: 0.6,
      effectBias: 0.3,
      closeGameBias: 0.5,
      notes: ['Push damage before white stabilizes behind higher-value defenders.'],
    },
    'yellow-alchemy': {
      attackBias: 0.5,
      closeGameBias: 0.4,
      notes: ['Pressure yellow before its engine snowballs.'],
    },
    'overlord-totem': {
      defenseBias: 0.4,
      defenderReserveBias: 0.5,
      notes: ['Preserve blockers against revived board pressure.'],
    },
  },
  weights: {
    unitPower: 0.95,
    unitDamage: 7.5,
    unitRush: 4.8,
    unitGodMark: 3.2,
    itemValue: 6.4,
    storyValue: 5.6,
    lowCost: 1.35,
    effectText: 1.35,
    attackBias: 1.32,
    defenseBias: 0.95,
    preserveHand: 1.1,
  },
  strategyHooks: {
    adjustTurnPlan: context => {
      const notes: string[] = [];
      let reserveDefendersDelta = 0;
      let minMainEffectScoreDelta = 0;
      let minBattleEffectScoreDelta = 0;
      let attackBeforeDeveloping: boolean | undefined;
      const pressureReady =
        context.plan.attackers > 0 &&
        (
          context.plan.opponentErosion >= 4 ||
          context.plan.totalAvailableDamage >= Math.max(1, 10 - context.plan.opponentErosion - 2) ||
          context.opponentDeckProfile?.archetype === 'engine' ||
          context.opponentDeckProfile?.archetype === 'combo' ||
          context.opponentDeckProfile?.archetype === 'control'
        );

      if (context.opponentDeckProfile?.archetype === 'engine' || context.opponentDeckProfile?.archetype === 'combo') {
        attackBeforeDeveloping = context.plan.attackers > 0;
        minMainEffectScoreDelta -= 0.3;
        notes.push('blue hook: convert tempo into pressure against setup decks');
      }
      if (context.opponentDeckProfile?.archetype === 'aggro') {
        reserveDefendersDelta += 1;
        notes.push('blue hook: preserve tempo blocker against aggro');
      }
      if (pressureReady) {
        attackBeforeDeveloping = true;
        reserveDefendersDelta -= 1;
        minBattleEffectScoreDelta -= 0.4;
        notes.push('blue route: turn tempo board into erosion pressure');
      }
      if (context.plan.ownDeck <= 12 && !context.plan.lethalWindow && context.opponentDeckProfile?.archetype === 'aggro') {
        reserveDefendersDelta += 1;
        notes.push('blue route: low deck respects aggro crackback');
      }
      return notes.length
        ? { attackBeforeDeveloping, reserveDefendersDelta, minMainEffectScoreDelta, minBattleEffectScoreDelta, notes }
        : undefined;
    },
    adjustPlayableScore: context => {
      const card = context.card;
      const text = cardText(card);
      let score = 0;
      if (card.type === 'UNIT' && cardCost(card) <= 3) score += 4.5;
      if (card.type === 'UNIT' && openUnitSlots(context) > 0 && hasAny(text, [/冒险家|委托|erosion|侵蚀/])) score += 2;
      if (hasRole(card, 'search') || hasRole(card, 'draw')) score += context.player && context.player.hand.length <= 5 ? 3 : 0.8;
      if (hasRole(card, 'tempo') || hasRole(card, 'removal')) score += opponentHasTrait(context, 'large-defenders') ? 3 : 1.5;
      if (card.type === 'UNIT' && (card.damage || 0) >= 2 && opponentErosion(context) >= 4) score += 3;
      if ((hasRole(card, 'search') || hasRole(card, 'draw')) && (context.player?.deck.length || 0) <= 14) score -= 3;
      if (opponentIs(context, 'aggro') && cardCost(card) >= 5) score -= 5;
      return score;
    },
    adjustAttackScore: context => {
      const damage = context.card.damage || 0;
      let score = damage * 0.8;
      if (opponentIs(context, 'engine', 'combo', 'control')) score += damage * 1.6;
      if (opponentIs(context, 'aggro') && (context.player?.deck.length || 0) <= 12) score -= damage * 1.2;
      return score;
    },
    adjustDefenseScore: context => {
      if (opponentIs(context, 'aggro') || opponentHasTrait(context, 'burst-damage')) return 6;
      if (hasRole(context.card, 'engine') || hasRole(context.card, 'search')) return -3;
      return 0;
    },
    adjustMulliganScore: context => {
      const card = context.card;
      let score = 0;
      if (card.type === 'UNIT' && cardCost(card) <= 3) score += 12;
      if (hasRole(card, 'search') && (context.earlyUnitsInHand || 0) > 0) score += 6;
      if (hasRole(card, 'tempo')) score += 4;
      if (cardCost(card) >= 5) score -= 8;
      return score;
    },
    adjustPaymentScore: context => {
      if (BLUE_CORE_IDS.has(context.card.id)) return 20;
      if (context.card.id === '204000145' || context.card.id === '204000026') return 14;
      if (BLUE_EROSION_PAYOFF_PRIORITY[context.card.id] && context.card.cardlocation !== 'HAND') return 12;
      return 0;
    },
    adjustQueryScore: context => {
      const card = queryOptionCard(context);
      if (!card) return 0;
      const effectId = queryEffectId(context);
      const step = queryStep(context);
      const source = String(context.option?.source || card.cardlocation || '');

      if (BLUE_SWAP_EFFECT_IDS.has(effectId)) {
        if (!queryOptionIsMine(context)) return -60;
        const payoff = BLUE_EROSION_PAYOFF_PRIORITY[card.id] || 0;
        const fromReusableZone = source === 'EROSION_FRONT' || source === 'GRAVE' || source === 'DECK';
        if (fromReusableZone && payoff > 0) return 55 + payoff + (card.damage || 0) * 5;
        if (context.intent === 'cost' && BLUE_CORE_IDS.has(card.id)) return -70;
      }

      if (BLUE_OPPONENT_TEMPO_EFFECT_IDS.has(effectId)) {
        return queryOptionIsMine(context)
          ? -90
          : 42 + (card.godMark ? 8 : 0) + (card.damage || 0) * 7 + (card.power || 0) / 900;
      }

      if (effectId === 'aketi_goddess_bounce') {
        if (step === 'COST') {
          if (!queryOptionIsMine(context)) return -120;
          if (BLUE_CORE_IDS.has(card.id)) return -70;
          return (card.feijingMark ? 18 : 0) - (BLUE_EROSION_PAYOFF_PRIORITY[card.id] || 0);
        }
        if (step === 'BOUNCE') {
          return queryOptionIsMine(context)
            ? -120
            : 58 + (card.godMark ? 10 : 0) + (card.damage || 0) * 8 + (card.power || 0) / 850;
        }
      }

      return 0;
    },
    adjustEffectScore: context => {
      let score = 0;
      if (effectHasTag(context, 'search') || effectHasTag(context, 'summon')) score += 3;
      if (effectHasTag(context, 'tempo') && opponentHasTrait(context, 'large-defenders')) score += 4;
      if (effectHasTag(context, 'draw') && (context.player?.deck.length || 0) <= 13) score -= 4;
      if (opponentIs(context, 'engine', 'combo') && (effectHasTag(context, 'tempo') || effectHasTag(context, 'removal'))) score += 3;
      if ((effectHasTag(context, 'tempo') || effectHasTag(context, 'combat')) && (opponentErosion(context) >= 5 || readyAttackers(context) >= 2)) score += 3;
      return score;
    },
  },
};
