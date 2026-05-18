import { DeckAiProfile } from '../types';
import { cardCost, effectHasTag, hasRole, openUnitSlots, opponentErosion, opponentHasTrait, opponentIs, ownErosion, queryEffectId, queryOptionCard, queryOptionIsMine, queryStep, readyAttackers, readyDefenders } from './strategyUtils';

const YELLOW_CORE_IDS = new Set([
  '105110113',
  '105120167',
  '105120168',
  '305120030',
  '305000018',
]);

const ALCHEMY_SUMMON_PRIORITY: Record<string, number> = {
  '105120166': 48,
  '105120468': 46,
  '105120164': 38,
  '105120165': 34,
  '105120168': 28,
};

const YELLOW_ENGINE_EFFECT_IDS = new Set([
  '105120167_activate',
  '305120030_activate',
]);

export const yellowAlchemyProfile: DeckAiProfile = {
  id: 'yellow-alchemy',
  displayName: '纯黄炼金',
  shareCode: 'GiZGyewEmGvwiDA8EzjGhhYsxlzWwjocHi8BbiA',
  notes: '偏组合和资源利用，保留手牌质量，优先发挥效果牌。',
  preferredFactions: ['炼金'],
  preferredCardIds: {
    '105110113': 12,
    '105120167': 14,
    '105120168': 10,
    '105120166': 11,
    '105120468': 10,
    '305120030': 12,
    '305110029': 7,
  },
  preserveCardIds: {
    '105110113': 14,
    '105120167': 22,
    '105120168': 14,
    '305120030': 18,
    '305000018': 12,
    '305110028': 6,
  },
  effectPreferences: {
    preferredEffectIds: {
      '105110113_use_erosion_item': 7,
      '105110113_reveal_top': 3,
      '105120167_activate': 8,
      '105120168_activate': 6,
      '105120468_activate': 5,
      '305120030_activate': 7,
      '105110112_activate': 5,
      '105110108_activate': 4,
      '205110042_activate': 3,
      '305000018_replace_damage': 3,
      '305110028_revive': 6,
      '305110029_activate': 3,
    },
    avoidEffectIds: {
      '105120167_last_resort': 20,
    },
    lowDeckAvoidEffectIds: {
      '105110108_activate': 12,
      '305120030_activate': 8,
      '105120167_activate': 6,
      '105120168_activate': 6,
      '105120468_activate': 6,
    },
    tagBias: {
      engine: 2,
      resource: 3,
      draw: 2,
      search: 2,
      summon: 3,
      removal: 1.5,
      tempo: 1,
    },
    phaseBias: {
      MAIN: 1.5,
      BATTLE_FREE: 0.5,
    },
    highCostTolerance: 3,
  },
  gamePlan: {
    mode: 'engine',
    primaryGoal: 'resourceLoop',
    attackPriority: 0.95,
    defensePriority: 0.95,
    developmentPriority: 1.2,
    effectPriority: 1.35,
    closeGameBias: 1.15,
    defenderReserveBias: 0.7,
    notes: ['Prioritize engine setup, then convert resource loops into board and damage.'],
  },
  riskThresholds: {
    lowDeck: 14,
    criticalDeck: 4,
    stopSelfDrawAtDeck: 14,
    stopSearchAtDeck: 13,
    highErosion: 7,
    criticalErosion: 9,
    reserveDefendersAtDeck: 12,
  },
  softCompensation: {
    openingSmoothing: true,
    openingLookahead: 10,
    maxOpeningReplacements: 1,
    extremeBrickRescueChance: 0.35,
    fullOpponentDeckProfile: true,
    notes: ['Slightly smooth openings toward one engine, resource, or playable stabilizer.'],
  },
  matchupPlans: {
    'red-dikai': {
      defenseBias: 0.6,
      defenderReserveBias: 0.9,
      developmentBias: -0.2,
      notes: ['Slow development slightly and keep blockers against red pressure.'],
    },
    'blue-adventurer': {
      attackBias: 0.4,
      closeGameBias: 0.4,
      stopSelfDrawAtDeck: 13,
      notes: ['Match blue tempo while avoiding late self-decking.'],
    },
    'white-temple': {
      effectBias: 0.4,
      developmentBias: 0.3,
      notes: ['Out-resource white before committing attacks into defenders.'],
    },
    'overlord-totem': {
      effectBias: 0.4,
      defenseBias: 0.3,
      notes: ['Use removal/resource effects to keep pace with graveyard recursion.'],
    },
  },
  weights: {
    unitPower: 0.85,
    unitDamage: 7.4,
    unitRush: 3.2,
    unitGodMark: 3.4,
    itemValue: 6.9,
    storyValue: 5.8,
    lowCost: 1.15,
    effectText: 1.55,
    attackBias: 1.15,
    defenseBias: 1,
    preserveHand: 1.45,
  },
  strategyHooks: {
    adjustTurnPlan: context => {
      const notes: string[] = [];
      let reserveDefendersDelta = 0;
      let minMainEffectScoreDelta = 0;
      let attackBeforeDeveloping: boolean | undefined;
      const engineOnline = context.plan.attackers >= 2 || context.plan.totalAvailableDamage >= 3;
      const liveOpponentErosion = context.opponent?.isGoddessMode ? 0 : context.plan.opponentErosion;
      const convertToPressure =
        engineOnline &&
        (
          liveOpponentErosion >= 5 ||
          context.plan.ownDeck <= 14 ||
          context.opponentDeckProfile?.archetype === 'control' ||
          context.opponentDeckProfile?.archetype === 'engine'
        );

      if (context.opponentDeckProfile?.archetype === 'aggro') {
        reserveDefendersDelta += 1;
        minMainEffectScoreDelta += 0.2;
        notes.push('yellow hook: slow engine line until blockers are stable');
      }
      if (context.opponentDeckProfile?.archetype === 'control' || context.opponentDeckProfile?.archetype === 'midrange') {
        minMainEffectScoreDelta -= 0.4;
        notes.push('yellow hook: lean into resource engine against slower decks');
      }
      if (convertToPressure) {
        attackBeforeDeveloping = true;
        reserveDefendersDelta -= context.plan.ownDeck <= 14 ? 0 : 1;
        minMainEffectScoreDelta += context.plan.ownDeck <= 14 ? 0.4 : 0;
        notes.push('yellow route: convert engine resources into attacks before self-deck pressure');
      }
      return notes.length
        ? { attackBeforeDeveloping, reserveDefendersDelta, minMainEffectScoreDelta, notes }
        : undefined;
    },
    adjustPlayableScore: context => {
      const card = context.card;
      let score = 0;
      if (hasRole(card, 'engine') || hasRole(card, 'resource')) score += 5;
      if (hasRole(card, 'draw') || hasRole(card, 'search')) score += (context.player?.deck.length || 0) > 14 ? 3.5 : -4;
      if (card.type === 'ITEM') score += 2.5;
      if (card.type === 'UNIT' && openUnitSlots(context) > 0 && hasRole(card, 'combo_piece')) score += 2;
      if (card.type === 'UNIT' && (context.player?.hand.length || 0) >= 5 && opponentErosion(context) >= 4) score += (card.damage || 0) * 1.5;
      if ((ownErosion(context) >= 7 || (context.player?.deck.length || 0) <= 14) && (hasRole(card, 'draw') || hasRole(card, 'search'))) score -= 5;
      if (opponentIs(context, 'aggro') && readyDefenders(context) === 0 && card.type !== 'UNIT') score -= 5;
      return score;
    },
    adjustAttackScore: context => {
      const damage = context.card.damage || 0;
      let score = 0;
      if ((context.player?.hand.length || 0) >= 5 || opponentIs(context, 'control', 'engine')) score += damage * 1.5;
      if (opponentIs(context, 'aggro') && readyDefenders(context) <= 1) score -= damage * 2;
      return score;
    },
    adjustDefenseScore: context => {
      let score = 0;
      if (hasRole(context.card, 'engine') || hasRole(context.card, 'resource')) score -= opponentHasTrait(context, 'burst-damage') ? 2 : 8;
      if (opponentIs(context, 'aggro') || opponentHasTrait(context, 'burst-damage')) score += 9;
      return score;
    },
    adjustMulliganScore: context => {
      const card = context.card;
      let score = 0;
      if (hasRole(card, 'engine') || hasRole(card, 'resource')) score += 10;
      if ((hasRole(card, 'draw') || hasRole(card, 'search')) && (context.earlyUnitsInHand || 0) > 0) score += 5;
      if (card.type === 'ITEM' && cardCost(card) <= 3) score += 4;
      if (opponentIs(context, 'aggro') && card.type !== 'UNIT' && (context.earlyUnitsInHand || 0) === 0) score -= 10;
      return score;
    },
    adjustPaymentScore: context => {
      if (YELLOW_CORE_IDS.has(context.card.id)) return 26;
      if (context.card.id === '305110028' && context.card.cardlocation === 'ITEM') return -8;
      if (context.card.feijingMark) return -4;
      return 0;
    },
    adjustQueryScore: context => {
      const card = queryOptionCard(context);
      if (!card) return 0;
      const effectId = queryEffectId(context);
      const step = queryStep(context);

      if (effectId === '305110029_activate') {
        return queryOptionIsMine(context)
          ? -95
          : 48 + (card.damage || 0) * 9 + (card.power || 0) / 850 + (card.isExhausted ? -6 : 6);
      }

      if (YELLOW_ENGINE_EFFECT_IDS.has(effectId)) {
        if (step === 'PUT_UNIT') {
          return ALCHEMY_SUMMON_PRIORITY[card.id] || ((card.damage || 0) * 8 + (card.power || 0) / 900);
        }

        if (step === 'DISCARD') {
          if (YELLOW_CORE_IDS.has(card.id)) return -90;
          if (card.feijingMark) return 28;
          return cardCost(card) <= 2 ? 12 : -Math.max(0, cardCost(card) - 2) * 4;
        }

        if (step === 'SEND_FIELD' || step === 'SEND_UNIT') {
          if (!queryOptionIsMine(context)) return -80;
          if (YELLOW_CORE_IDS.has(card.id) || card.godMark) return -100;
          if (card.id === '305110028') return 42;
          if (card.feijingMark) return 26;
          return 14 - (card.damage || 0) * 5 - (card.power || 0) / 1100;
        }
      }

      return 0;
    },
    adjustEffectScore: context => {
      let score = 0;
      if (effectHasTag(context, 'engine') || effectHasTag(context, 'resource') || effectHasTag(context, 'summon')) score += 4;
      if (effectHasTag(context, 'draw') || effectHasTag(context, 'search')) score += (context.player?.deck.length || 0) > 14 ? 3 : -6;
      if (effectHasTag(context, 'removal') && (opponentIs(context, 'aggro') || opponentHasTrait(context, 'large-defenders'))) score += 3;
      if ((effectHasTag(context, 'combat') || effectHasTag(context, 'buff')) && (readyAttackers(context) >= 2 || opponentErosion(context) >= 6)) score += 3;
      if ((effectHasTag(context, 'engine') || effectHasTag(context, 'resource')) && (context.player?.deck.length || 0) <= 12) score -= 4;
      return score;
    },
  },
};
