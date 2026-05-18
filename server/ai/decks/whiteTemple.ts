import { DeckAiProfile, DeckAiQueryScoreContext } from '../types';
import { Card } from '../../../src/types/game';
import { battlePressureActive, cardCost, cardText, effectHasTag, hasAny, hasRole, openUnitSlots, opponentErosion, opponentHasTrait, opponentIs, queryEffectId, queryOptionCard, queryOptionIsMine, readyAttackers, readyDefenders } from './strategyUtils';

const PREFERRED_RESET_TARGET_IDS = new Set(['101130440', '101130458']);
const WHITE_CORE_IDS = new Set([
  '101000501', // 冰峰神兽「白虎」
  '101100096', // 女神的微笑「柯莉尔」
  '101130200', // 圣王国的盾兵
  '101130439',
  '101130440',
  '101130441',
  '101130458',
  '101150208',
]);
const WHITE_COMBAT_PROTECTION_EFFECT_IDS = new Set([
  '101000159_protect',
  '101100096_alliance_protect',
]);
const SAINT_KINGDOM_ARCHER_ID = '101130202';
const SAINT_KINGDOM_ARCHER_EFFECT_ID = '101130202_hand_to_field';
const CHURCH_ESCORT_EFFECT_ID = '101140151_enter_exile';
const SAINT_KINGDOM_ARCHER_TARGET_PRIORITY: Record<string, number> = {
  '101130440': 22,
  '101130458': 21,
  '101130104': 17,
  '101130439': 16,
  '101130200': 14,
  '101130233': 12,
};
const RESET_TARGET_EFFECT_IDS = new Set([
  '101130439_reset_hall',
  '101130441_reset_boost',
  '101130155_enter_reset',
  '101000063_ten_reset_units',
  '202000053_reset_after_destroy',
]);

function isResetTargetQuery(context: DeckAiQueryScoreContext) {
  const effectId = String((context.query as any).context?.effectId || '');
  if (RESET_TARGET_EFFECT_IDS.has(effectId)) return true;

  const text = [
    context.query.title,
    context.query.description,
    context.query.callbackKey,
    effectId,
    (context.query as any).context?.step,
  ]
    .filter(Boolean)
    .join(' ');
  return context.intent === 'benefit' && /reset|ready|重置|竖置|閲嶇疆|绔栫疆/i.test(text);
}

function isSaintKingdomArcherTarget(card: Card | null | undefined) {
  return !!card &&
    card.id !== SAINT_KINGDOM_ARCHER_ID &&
    card.type === 'UNIT' &&
    card.faction === '圣王国' &&
    !card.godMark &&
    cardCost(card) <= 3;
}

function isHandCard(card: Card | null | undefined) {
  return !card?.cardlocation || card.cardlocation === 'HAND';
}

function archerTargetPriority(card: Card | null | undefined) {
  if (!isSaintKingdomArcherTarget(card)) return 0;
  return SAINT_KINGDOM_ARCHER_TARGET_PRIORITY[card.id] ||
    8 +
    (card.damage || 0) * 2 +
    Math.max(0, Math.min(4, 4 - cardCost(card)));
}

function handHasArcher(player: DeckAiQueryScoreContext['player']) {
  return !!player?.hand.some(card => card.id === SAINT_KINGDOM_ARCHER_ID);
}

function bestArcherTargetInHand(player: DeckAiQueryScoreContext['player']) {
  const targets = player?.hand.filter(isSaintKingdomArcherTarget) || [];
  return targets.reduce<Card | undefined>((best, card) =>
    archerTargetPriority(card) > archerTargetPriority(best) ? card : best,
    undefined
  );
}

function hasLiveArcherLine(context: { player?: DeckAiQueryScoreContext['player'] }) {
  return handHasArcher(context.player) && !!bestArcherTargetInHand(context.player);
}

export const whiteTempleProfile: DeckAiProfile = {
  id: 'white-temple',
  displayName: '纯白殿堂',
  shareCode: 'GiZGyewEgAHuKBCRHfBXL0ZqofebNZYwojMMXA',
  notes: '偏防守和资源续航，保留高价值单位，倾向稳健防御。',
  preferredFactions: ['殿堂', '圣王国'],
  preferredCardIds: {
    '101000501': 14,
    '101100096': 12,
    '201100037': 8,
    '101130202': 11,
    '101130200': 7,
    '101130439': 8,
    '101130440': 10,
    '101130441': 8,
    '101130458': 9,
    '101150208': 8,
  },
  preserveCardIds: {
    '101000501': 22,
    '101100096': 18,
    '201100037': 14,
    '101130202': 10,
    '101130200': 12,
    '101130439': 8,
    '101130440': 12,
    '101130441': 10,
    '101130458': 12,
    '101150208': 12,
  },
  effectPreferences: {
    preferredEffectIds: {
      '101100096_alliance_protect': 3,
      '101100096_reset_after_attack': 4,
      '101130439_reset_hall': 6,
      '101130441_reset_boost': 6,
      '101130440_reset_boost': 5,
      '101130458_reset_silence': 4,
      '201000056_search': 4,
      '201000059_prevent_destroy': 3,
      '201130038_blessing': 3,
      '101000487_grave_exile_boost': 2,
      '101140152_silence_god': 3,
      '201100037_eclipse': 2,
    },
    avoidEffectIds: {
      '101000159_protect': 2,
      '201000059_prevent_destroy': 2,
      '201100037_eclipse': 4,
    },
    tagBias: {
      reset: 3,
      resource: 1.5,
      search: 1.5,
      protection: 1,
      buff: 1,
      combat: 0.5,
    },
    phaseBias: {
      MAIN: 0.5,
      BATTLE_FREE: 1.5,
    },
    highCostTolerance: 1,
  },
  gamePlan: {
    mode: 'control',
    primaryGoal: 'boardControl',
    attackPriority: 0.3,
    defensePriority: 1.6,
    developmentPriority: 0.8,
    effectPriority: 0.8,
    closeGameBias: 0.2,
    defenderReserveBias: 1.1,
    notes: ['Stabilize the board, preserve high-value units, then attack when pressure is safe.'],
  },
  riskThresholds: {
    lowDeck: 12,
    criticalDeck: 4,
    stopSelfDrawAtDeck: 13,
    stopSearchAtDeck: 11,
    highErosion: 7,
    criticalErosion: 9,
    reserveDefendersAtDeck: 12,
  },
  softCompensation: {
    openingSmoothing: true,
    fixedOpeningHandIds: ['101130202', '101130440', '101130441', '101000501'],
    openingLookahead: 8,
    maxOpeningReplacements: 1,
    extremeBrickRescueChance: 0.28,
    fullOpponentDeckProfile: true,
    notes: ['Slightly smooth openings toward at least one early defender or control piece.'],
  },
  matchupPlans: {
    'red-dikai': {
      defenseBias: 0.8,
      defenderReserveBias: 1.2,
      closeGameBias: 0.3,
      notes: ['Keep ready defenders against red burst turns.'],
    },
    'blue-adventurer': {
      attackBias: 0.3,
      effectBias: 0.3,
      notes: ['Remove tempo pieces and attack once blue deck pressure rises.'],
    },
    'yellow-alchemy': {
      attackBias: 0.4,
      notes: ['Do not let yellow build engine uncontested.'],
    },
    'overlord-totem': {
      defenseBias: 0.5,
      effectBias: 0.4,
      notes: ['Prioritize board control into revived threats.'],
    },
  },
  weights: {
    unitPower: 1.15,
    unitDamage: 6.8,
    unitRush: 2.6,
    unitGodMark: 4.4,
    itemValue: 7.2,
    storyValue: 4.8,
    lowCost: 0.95,
    effectText: 1.15,
    attackBias: 0.95,
    defenseBias: 1.35,
    preserveHand: 1.25,
  },
  strategyHooks: {
    adjustTurnPlan: context => {
      const notes: string[] = [];
      let reserveDefendersDelta = 0;
      let minMainEffectScoreDelta = 0;
      let minBattleEffectScoreDelta = 0;
      let attackBeforeDeveloping: boolean | undefined;
      const pressureReady =
        context.plan.attackers >= 2 &&
        (
          context.plan.opponentErosion >= 6 ||
          context.plan.totalAvailableDamage >= Math.max(1, 10 - context.plan.opponentErosion - 1) ||
          context.plan.lethalWindow
        );

      if (context.opponentDeckProfile?.archetype === 'aggro' || context.opponentDeckProfile?.traits.includes('burst-damage')) {
        reserveDefendersDelta += 1;
        minBattleEffectScoreDelta -= 0.4;
        notes.push('white hook: hold blockers into burst damage');
      }
      if (context.opponentDeckProfile?.archetype === 'engine' || context.opponentDeckProfile?.archetype === 'combo') {
        minMainEffectScoreDelta -= 0.3;
        notes.push('white hook: use control effects before engine stabilizes');
      }
      if (pressureReady) {
        attackBeforeDeveloping = true;
        reserveDefendersDelta -= 1;
        minBattleEffectScoreDelta -= 0.5;
        notes.push('white route: convert stabilized hall board into reset pressure');
      }
      if (context.plan.ownDeck <= 12 && !pressureReady) {
        reserveDefendersDelta += 1;
        notes.push('white route: low deck keeps one more defender before attacking');
      }
      return notes.length
        ? { attackBeforeDeveloping, reserveDefendersDelta, minMainEffectScoreDelta, minBattleEffectScoreDelta, notes }
        : undefined;
    },
    adjustPlayableScore: context => {
      const card = context.card;
      const text = cardText(card);
      const liveArcherLine = hasLiveArcherLine(context) && openUnitSlots(context) >= 2;
      const bestArcherTarget = bestArcherTargetInHand(context.player);
      let score = 0;
      if (card.type === 'UNIT' && ((card.power || 0) >= 5000 || hasRole(card, 'defender'))) score += 3.5;
      if (hasRole(card, 'protection')) score += opponentIs(context, 'aggro', 'tempo') ? 3 : 1.2;
      if (hasRole(card, 'removal') && (opponentIs(context, 'engine', 'combo') || opponentHasTrait(context, 'large-defenders'))) score += 3;
      if (opponentIs(context, 'aggro') && card.type !== 'UNIT' && readyDefenders(context) === 0 && cardCost(card) > 2) score -= 4;
      if (hasAny(text, [/殿堂|圣王国/]) && cardCost(card) <= 4) score += 1.5;
      if (['101130439', '101130440', '101130458'].includes(card.id)) score += readyAttackers(context) > 0 ? 3 : 1.5;
      if (card.id === SAINT_KINGDOM_ARCHER_ID) {
        score += bestArcherTarget && openUnitSlots(context) >= 2
          ? 42 + archerTargetPriority(bestArcherTarget)
          : -8;
      } else if (liveArcherLine && isSaintKingdomArcherTarget(card)) {
        score -= 18 + Math.min(10, archerTargetPriority(card) * 0.3);
      }
      return score;
    },
    adjustAttackScore: context => {
      const damage = context.card.damage || 0;
      if (context.opponentDeckProfile?.archetype === 'aggro' && !context.matchupPlan?.closeGameBias) {
        return -damage * 1.6;
      }
      if (opponentIs(context, 'engine', 'combo')) return damage * 1.2;
      return 0;
    },
    adjustDefenseScore: context => {
      let score = 0;
      if (opponentIs(context, 'aggro', 'tempo') || opponentHasTrait(context, 'burst-damage')) score += 10;
      if (hasRole(context.card, 'defender') || hasRole(context.card, 'protection')) score += 4;
      if (WHITE_CORE_IDS.has(context.card.id) && (context.player?.deck.length || 99) > 5 && !opponentHasTrait(context, 'burst-damage')) {
        score -= 8;
      }
      if ((context.card.damage || 0) >= 2 && !opponentHasTrait(context, 'burst-damage')) score -= 2;
      return score;
    },
    adjustMulliganScore: context => {
      const card = context.card;
      let score = 0;
      if (card.type === 'UNIT' && cardCost(card) <= 4) score += 7;
      if (hasRole(card, 'protection') || hasRole(card, 'removal')) score += 4;
      if (opponentIs(context, 'aggro') && card.type !== 'UNIT') score -= 4;
      if (card.id === SAINT_KINGDOM_ARCHER_ID && bestArcherTargetInHand(context.player)) score += 8;
      if (isSaintKingdomArcherTarget(card) && handHasArcher(context.player)) score += 4;
      return score;
    },
    adjustDiscardScore: context => {
      if (context.card.id === SAINT_KINGDOM_ARCHER_ID && isHandCard(context.card) && bestArcherTargetInHand(context.player)) return 28;
      if (isSaintKingdomArcherTarget(context.card) && isHandCard(context.card) && handHasArcher(context.player)) return 16;
      return 0;
    },
    adjustPaymentScore: context => {
      if (WHITE_CORE_IDS.has(context.card.id)) return 26;
      if (context.card.id === SAINT_KINGDOM_ARCHER_ID && isHandCard(context.card) && bestArcherTargetInHand(context.player)) return 40;
      if (isSaintKingdomArcherTarget(context.card) && isHandCard(context.card) && handHasArcher(context.player)) return 30;
      return 0;
    },
    adjustEffectScore: context => {
      let score = 0;
      if ((effectHasTag(context, 'protection') || effectHasTag(context, 'removal')) && opponentIs(context, 'aggro', 'tempo')) score += 4;
      if (effectHasTag(context, 'reset') || effectHasTag(context, 'resource')) score += 1.5;
      if (effectHasTag(context, 'reset') && (opponentErosion(context) >= 6 || readyAttackers(context) >= 2)) score += 4;
      if (effectHasTag(context, 'buff') && opponentErosion(context) >= 6) score += 2;
      if (effectHasTag(context, 'draw') && (context.player?.deck.length || 0) <= 12) score -= 4;
      return score;
    },
    adjustQueryScore: context => {
      const card = context.option?.card;
      const effectId = String((context.query as any).context?.effectId || '');
      if (!card) return 0;
      if (WHITE_COMBAT_PROTECTION_EFFECT_IDS.has(queryEffectId(context))) {
        if (!queryOptionIsMine(context)) return -80;
        const pressureBonus = battlePressureActive(context) ? 16 : -18;
        return pressureBonus + (WHITE_CORE_IDS.has(card.id) ? 48 : 0) + (card.godMark ? 16 : 0) + (card.damage || 0) * 6;
      }
      if (effectId === SAINT_KINGDOM_ARCHER_EFFECT_ID) {
        if (context.option?.isMine === false) return -80;
        if (!isSaintKingdomArcherTarget(card)) return -80;
        return 80 + archerTargetPriority(card);
      }
      if (effectId === CHURCH_ESCORT_EFFECT_ID) {
        const hasOpponentTargets = !!context.opponent?.unitZone.some(unit => !!unit) ||
          !!context.opponent?.itemZone.some(item => !!item);
        return context.option?.isMine === false
          ? 90 + (card.godMark ? 8 : 0) + (card.damage || 0) * 5 + (card.power || 0) / 900
          : hasOpponentTargets
            ? -140
            : -20;
      }
      if (!isResetTargetQuery(context)) return 0;
      if (context.option?.isMine === false) return 0;

      if (PREFERRED_RESET_TARGET_IDS.has(card.id)) {
        let score = 70;
        if (card.isExhausted) score += 18;
        if (card.id === '101130440') score += 14;
        if (card.id === '101130458') {
          const opponentNonGodUnits = context.opponent?.unitZone.filter(unit => unit && !unit.godMark).length || 0;
          score += opponentNonGodUnits > 0 ? 18 : 6;
        }
        return score;
      }

      return context.intent === 'benefit' ? -10 : 0;
    },
  },
};
