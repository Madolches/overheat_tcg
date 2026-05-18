import { DeckAiProfile } from '../types';
import { cardCost, cardText, effectHasTag, hasAny, hasRole, opponentErosion, opponentHasTrait, opponentIs, queryEffectId, queryOptionCard, queryOptionIsMine, readyAttackers } from './strategyUtils';

const RED_CORE_IDS = new Set([
  '102050091',
  '102050432',
  '102050427',
  '302050013',
]);

const RED_REMOVAL_EFFECT_IDS = new Set([
  '102000146_exile_destroy',
  '102050087_destroy',
  '202000035_destroy',
  '202050034_destroy_god',
]);

export const redDikaiProfile: DeckAiProfile = {
  id: 'red-dikai',
  displayName: '纯红迪凯',
  shareCode: 'GiZGyewEUeiShgkxp0T0GzhKdIaZTuzP2w',
  notes: '偏进攻，优先推动伤害和战斗阶段，较少保守防御。',
  preferredFactions: ['迪凯'],
  preferredCardIds: {
    '102050085': 8,
    '102050088': 7,
    '102050091': 14,
    '102050427': 10,
    '102050432': 16,
    '302050013': 9,
  },
  preserveCardIds: {
    '102050091': 18,
    '102050427': 12,
    '102050432': 22,
    '302050013': 12,
    '202000131': 10,
  },
  effectPreferences: {
    preferredEffectIds: {
      '102050432_reset_attack_unit': 10,
      '102050427_cannot_defend': 7,
      '102050091_battle_save': 4,
      '102000146_exile_destroy': 5,
      '102050087_destroy': 5,
      '202000035_destroy': 5,
      '202050034_destroy_god': 4,
      '102050089_damage_search': 3,
      '102060433_power_search': 3,
      '102060433_red_story_boost': 3,
    },
    avoidEffectIds: {
      '202000131_duel': 4,
    },
    tagBias: {
      reset: 5,
      combat: 3,
      finisher: 4,
      tempo: 3,
      removal: 2,
      buff: 2,
      search: 1,
    },
    phaseBias: {
      MAIN: 0.5,
      BATTLE_FREE: 3,
    },
    highCostTolerance: 2,
  },
  gamePlan: {
    mode: 'aggro',
    primaryGoal: 'damage',
    attackPriority: 2,
    defensePriority: -0.2,
    developmentPriority: 0.2,
    effectPriority: 0.9,
    closeGameBias: 2,
    defenderReserveBias: -0.8,
    notes: ['Convert board into damage quickly and use battle effects to force lethal windows.'],
  },
  riskThresholds: {
    lowDeck: 8,
    criticalDeck: 3,
    stopSelfDrawAtDeck: 8,
    stopSearchAtDeck: 7,
    highErosion: 8,
    criticalErosion: 9,
    reserveDefendersAtDeck: 6,
  },
  softCompensation: {
    openingSmoothing: true,
    fixedOpeningHandIds: ['102050432', '102050086', '102050427', '302050013'],
    openingLookahead: 8,
    maxOpeningReplacements: 1,
    extremeBrickRescueChance: 0.32,
    fullOpponentDeckProfile: true,
    notes: ['Slightly smooth openings toward early pressure without guaranteeing perfect curve.'],
  },
  matchupPlans: {
    'white-temple': {
      attackBias: 0.5,
      closeGameBias: 0.6,
      notes: ['Attack through white before defensive value overtakes damage race.'],
    },
    'blue-adventurer': {
      attackBias: 0.4,
      effectBias: 0.3,
      notes: ['Keep pressure high so blue cannot spend turns on engine choices.'],
    },
    'yellow-alchemy': {
      attackBias: 0.5,
      closeGameBias: 0.5,
      notes: ['Punish yellow setup turns with immediate battle pressure.'],
    },
    'overlord-totem': {
      attackBias: 0.4,
      effectBias: 0.4,
      notes: ['Use removal and cannot-defend effects before totem boards rebuild.'],
    },
  },
  weights: {
    unitPower: 0.9,
    unitDamage: 9.2,
    unitRush: 5.2,
    unitGodMark: 2.6,
    itemValue: 5.2,
    storyValue: 4.6,
    lowCost: 1.15,
    effectText: 1,
    attackBias: 1.5,
    defenseBias: 0.75,
    preserveHand: 0.85,
  },
  strategyHooks: {
    adjustTurnPlan: context => {
      const notes: string[] = [];
      let reserveDefendersDelta = 0;
      let minBattleEffectScoreDelta = 0;
      let attackBeforeDeveloping: boolean | undefined;
      const damageToCritical = Math.max(1, 10 - context.plan.opponentErosion);
      const nearKill =
        context.plan.lethalWindow ||
        context.plan.totalAvailableDamage >= Math.max(1, damageToCritical - 1) ||
        context.plan.opponentErosion >= 7;

      if (context.plan.attackers > 0 && context.plan.opponentErosion >= 5) {
        attackBeforeDeveloping = true;
        reserveDefendersDelta -= 1;
        minBattleEffectScoreDelta -= 0.8;
        notes.push('red hook: push battle pressure near lethal range');
      }
      if (context.opponentDeckProfile?.archetype === 'engine' || context.opponentDeckProfile?.archetype === 'combo') {
        attackBeforeDeveloping = context.plan.attackers > 0;
        reserveDefendersDelta -= 1;
        notes.push('red hook: race setup deck');
      }
      if (nearKill && context.plan.attackers > 0) {
        attackBeforeDeveloping = true;
        reserveDefendersDelta -= 3;
        minBattleEffectScoreDelta -= 1.2;
        notes.push('red route: commit attackers and battle tricks to close the game');
      }
      if (!nearKill && context.plan.ownDeck <= 6 && context.plan.opponentPotentialDamage > 0) {
        reserveDefendersDelta += 1;
        notes.push('red route: low deck only stabilizes when no kill line exists');
      }
      return notes.length
        ? { attackBeforeDeveloping, reserveDefendersDelta, minBattleEffectScoreDelta, notes }
        : undefined;
    },
    adjustPlayableScore: context => {
      const card = context.card;
      const text = cardText(card);
      let score = 0;
      if (card.id === '202000131') {
        const ownUnits = context.player?.unitZone.filter(Boolean) || [];
        const opponentUnits = context.opponent?.unitZone.filter(Boolean) || [];
        const bestOwn = Math.max(0, ...ownUnits.map(unit => (unit?.power || 0) / 400 + (unit?.damage || 0) * 8 + (RED_CORE_IDS.has(unit?.id || '') ? 18 : 0)));
        const boardResetGain = opponentUnits.length - Math.max(0, ownUnits.length - 1);
        score += ownUnits.length > 0 && opponentUnits.length >= 2 && boardResetGain >= 1
          ? 18 + boardResetGain * 12 + bestOwn * 0.4
          : -34;
      }
      if (card.type === 'UNIT') score += (card.damage || 0) * 4 + (card.isrush ? 6 : 0);
      if (card.type === 'UNIT' && cardCost(card) <= 3) score += 3;
      if (hasRole(card, 'removal') || hasRole(card, 'damage') || hasRole(card, 'finisher')) score += 3;
      if (hasAny(text, [/不能防御|cannot defend|重置|竖置|reset|ready/i])) score += 4;
      if (opponentIs(context, 'aggro') && card.type !== 'UNIT' && cardCost(card) > 3) score -= 3;
      if ((card.damage || 0) >= 2 && opponentErosion(context) >= 5) score += 4;
      if (hasRole(card, 'finisher') && readyAttackers(context) > 0) score += 4;
      return score;
    },
    adjustAttackScore: context => {
      const damage = context.card.damage || 0;
      let score = 6 + damage * 4;
      if (context.card.isrush) score += 3;
      if (opponentIs(context, 'control', 'engine', 'combo')) score += damage * 2;
      if (opponentHasTrait(context, 'large-defenders')) score += damage * 1.2;
      return score;
    },
    adjustDefenseScore: context => {
      const damage = context.card.damage || 0;
      let score = -6 - damage * 3;
      if (RED_CORE_IDS.has(context.card.id) && (context.player?.deck.length || 99) > 5 && !opponentHasTrait(context, 'burst-damage')) score -= 10;
      if ((context.player?.deck.length || 0) <= 5 || opponentHasTrait(context, 'burst-damage')) score += 12;
      return score;
    },
    adjustMulliganScore: context => {
      const card = context.card;
      let score = 0;
      if (card.type === 'UNIT' && cardCost(card) <= 3) score += 14;
      if (card.type === 'UNIT' && (card.damage || 0) >= 2) score += 8;
      if (card.isrush) score += 10;
      if (hasRole(card, 'finisher') && cardCost(card) <= 4) score += 5;
      if (cardCost(card) >= 5 && !card.isrush) score -= 14;
      return score;
    },
    adjustPaymentScore: context => {
      if (RED_CORE_IDS.has(context.card.id)) return 26;
      if (context.card.id === '102050085' && readyAttackers(context) > 0) return 10;
      return 0;
    },
    adjustQueryScore: context => {
      const card = queryOptionCard(context);
      if (!card) return 0;
      const effectId = queryEffectId(context);

      if (effectId === '102050432_reset_attack_unit') {
        const location = card.cardlocation || context.option?.source;
        if (location === 'UNIT' || location === 'ITEM') return -140;
        if (location === 'GRAVE') return 42;
        if (location === 'DECK') return 34;
        if (location === 'HAND') return 24;
        return 10;
      }

      if (effectId === '202000131_duel') {
        if (!queryOptionIsMine(context)) return 0;
        return 60 + (RED_CORE_IDS.has(card.id) ? 34 : 0) + (card.godMark ? 12 : 0) + (card.damage || 0) * 9 + (card.power || 0) / 700;
      }

      if (RED_REMOVAL_EFFECT_IDS.has(effectId) || effectId === '102050427_cannot_defend') {
        return queryOptionIsMine(context)
          ? -110
          : 46 + (card.godMark ? 10 : 0) + (card.damage || 0) * 8 + (card.power || 0) / 800;
      }

      return 0;
    },
    adjustEffectScore: context => {
      let score = 0;
      if (context.effect.id === '102050432_reset_attack_unit') {
        const battle = context.gameState?.battleState;
        const currentTurnUid = context.gameState?.playerIds?.[context.gameState.currentTurnPlayer];
        const isCurrentAttacker = !!battle?.attackers?.includes(context.card.gamecardId);
        const hasAttacked = !!context.card.hasAttackedThisTurn;
        const isOwnTurn = !!context.player?.uid && currentTurnUid === context.player.uid;

        if (!context.card.isExhausted) {
          score -= 80;
        } else if (isOwnTurn && (isCurrentAttacker || hasAttacked)) {
          score += 55 + (opponentErosion(context) >= 6 ? 10 : 0);
        } else if (context.gameState?.phase === 'COUNTERING') {
          score -= 35;
        } else {
          score -= 18;
        }
      }
      if (effectHasTag(context, 'combat') || effectHasTag(context, 'finisher') || effectHasTag(context, 'buff')) score += 5;
      if (effectHasTag(context, 'removal') || effectHasTag(context, 'tempo')) score += opponentHasTrait(context, 'large-defenders') ? 5 : 2.5;
      if (effectHasTag(context, 'draw') && (context.player?.deck.length || 0) <= 8) score -= 5;
      if (opponentIs(context, 'engine', 'combo') && effectHasTag(context, 'finisher')) score += 3;
      if ((effectHasTag(context, 'combat') || effectHasTag(context, 'finisher') || effectHasTag(context, 'reset')) && opponentErosion(context) >= 6) score += 5;
      return score;
    },
  },
};
