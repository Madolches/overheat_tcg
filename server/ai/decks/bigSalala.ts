import { Card } from '../../../src/types/game';
import { DeckAiProfile } from '../types';
import { cardCost, cardText, effectHasTag, hasAny, hasRole, openUnitSlots, opponentErosion, opponentHasTrait, opponentIs, queryEffectId, queryOptionCard, queryOptionIsMine, readyAttackers, readyDefenders } from './strategyUtils';

const BIG_SALALA_ID = '103000426';
const BIG_WAR_ANGEL_ID = '101140435';
const BIG_WAR_SONG_ID = '301000016';

const BIG_SALALA_CORE_IDS = new Set([
  BIG_SALALA_ID,
  '301000072',
  '303000022',
  '103090257',
  '101140151',
  '201100037',
]);

const BIG_SALALA_PAYOFF_IDS = new Set([
  '103000426',
  '301000072',
  '301000016',
  '303000022',
]);

function ownCardByGameId(player: any, gamecardId?: string) {
  if (!player || !gamecardId) return undefined;
  return [
    ...(player.hand || []),
    ...(player.itemZone || []),
    ...(player.playZone || []),
    ...(player.grave || []),
  ].find((card: Card | null) => card?.gamecardId === gamecardId);
}

function bigSalalaEquipTargetScore(card: Card | null | undefined) {
  if (!card || card.type !== 'UNIT') return -90;
  return (card.id === BIG_SALALA_ID ? 110 : 0) +
    (card.id === BIG_WAR_ANGEL_ID ? 72 : 0) +
    (BIG_SALALA_CORE_IDS.has(card.id) ? 20 : 0) +
    (card.godMark ? 28 : 0) +
    (card.damage || 0) * 18 +
    (card.power || 0) / 650 +
    (card.isHeroic ? -8 : 0);
}

export const bigSalalaProfile: DeckAiProfile = {
  id: 'big-salala',
  displayName: '大萨拉拉',
  shareCode: 'GiZGyewEgfeGrHsFLZ21Oee00hdG0tK8MoqIWA',
  notes: '绿白中速压制，围绕大萨拉拉、战天使和控制道具建立高质量战斗窗口。',
  preferredFactions: ['瑟诺布', '女神教会'],
  preferredCardIds: {
    '103000426': 16,
    '301000072': 12,
    '303000022': 11,
    '103090257': 10,
    '101140435': 10,
    '101140151': 9,
    '103090078': 8,
    '203090028': 8,
    '301000016': 8,
    '201100037': 8,
  },
  preserveCardIds: {
    '103000426': 26,
    '301000072': 18,
    '303000022': 16,
    '201100037': 16,
    '103090257': 12,
    '101140435': 11,
    '101140151': 11,
  },
  effectPreferences: {
    preferredEffectIds: {
      '103000426_mill_three': 2,
      '303000022_bind_enter': 7,
      '203090028_forced_battle': 6,
      '203000073_must_defend': 5,
      '203000030_revive': 5,
      '101140151_enter_exile': 5,
      '101140435_enter_search': 5,
      '103090075_search': 4,
      '103090078_destroy_later': 4,
      '103090257_feijing_enter': 4,
      '201100037_eclipse': 3,
      '301000016_equip_buff': 3,
    },
    avoidEffectIds: {
      '201100037_eclipse': 3,
    },
    tagBias: {
      tempo: 3,
      removal: 2.5,
      combat: 2,
      buff: 1.5,
      summon: 1.5,
      revive: 1.5,
      search: 1,
      resource: 1,
      protection: 1,
    },
    phaseBias: {
      MAIN: 1,
      BATTLE_FREE: 1,
    },
    highCostTolerance: 1.5,
  },
  gamePlan: {
    mode: 'midrange',
    primaryGoal: 'boardControl',
    attackPriority: 1.05,
    defensePriority: 1.25,
    developmentPriority: 0.95,
    effectPriority: 1.1,
    closeGameBias: 0.9,
    defenderReserveBias: 0.85,
    notes: ['Develop a durable Salala board, lock key attackers or defenders, then push with large combat bodies.'],
  },
  riskThresholds: {
    lowDeck: 12,
    criticalDeck: 4,
    stopSelfDrawAtDeck: 12,
    stopSearchAtDeck: 11,
    highErosion: 7,
    criticalErosion: 9,
    reserveDefendersAtDeck: 11,
  },
  softCompensation: {
    openingSmoothing: true,
    fixedOpeningHandIds: ['105000481', '103090253', '101140435', '103000426'],
    openingLookahead: 9,
    maxOpeningReplacements: 1,
    extremeBrickRescueChance: 0.3,
    fullOpponentDeckProfile: true,
    notes: ['Smooth toward early Xenobu/Church units while preserving Salala payoff cards.'],
  },
  matchupPlans: {
    'red-dikai': {
      defenseBias: 0.7,
      defenderReserveBias: 1,
      notes: ['Keep a ready blocker and use bind/exile to break red burst turns.'],
    },
    'blue-adventurer': {
      attackBias: 0.35,
      effectBias: 0.4,
      notes: ['Pressure blue while saving bind effects for tempo engines.'],
    },
    'white-temple': {
      effectBias: 0.4,
      closeGameBias: 0.3,
      notes: ['Use forced battle and bind to fight through white board control.'],
    },
  },
  weights: {
    unitPower: 1.22,
    unitDamage: 7.6,
    unitRush: 3.2,
    unitGodMark: 4.4,
    itemValue: 7.4,
    storyValue: 4.8,
    lowCost: 1.05,
    effectText: 1.25,
    attackBias: 1.12,
    defenseBias: 1.18,
    preserveHand: 1.2,
  },
  strategyHooks: {
    adjustTurnPlan: context => {
      const notes: string[] = [];
      let reserveDefendersDelta = 0;
      let minMainEffectScoreDelta = 0;
      let minBattleEffectScoreDelta = 0;
      let attackBeforeDeveloping: boolean | undefined;
      const hasSalala = !!context.player?.unitZone.some(unit => unit?.id === '103000426');
      const hasControlItem = !!context.player?.itemZone.some(item => item && BIG_SALALA_PAYOFF_IDS.has(item.id));
      const liveOpponentErosion = context.opponent?.isGoddessMode ? 0 : context.plan.opponentErosion;
      const pressureReady =
        context.plan.attackers >= 2 &&
        (
          hasSalala ||
          hasControlItem ||
          liveOpponentErosion >= 6 ||
          context.plan.totalAvailableDamage >= Math.max(1, 10 - liveOpponentErosion - 1)
        );

      if (context.opponentDeckProfile?.archetype === 'aggro' || context.opponentDeckProfile?.traits.includes('burst-damage')) {
        reserveDefendersDelta += 1;
        notes.push('big salala hook: hold a blocker against burst pressure');
      }
      if (context.opponentDeckProfile?.archetype === 'engine' || context.opponentDeckProfile?.archetype === 'combo') {
        minMainEffectScoreDelta -= 0.4;
        notes.push('big salala hook: use tempo tools before engines stabilize');
      }
      if (pressureReady) {
        attackBeforeDeveloping = true;
        reserveDefendersDelta -= hasSalala ? 1 : 0;
        minBattleEffectScoreDelta -= 0.5;
        notes.push('big salala route: convert durable board into pressure');
      }
      return notes.length
        ? { attackBeforeDeveloping, reserveDefendersDelta, minMainEffectScoreDelta, minBattleEffectScoreDelta, notes }
        : undefined;
    },
    adjustPlayableScore: context => {
      const card = context.card;
      const text = cardText(card);
      let score = 0;
      if (BIG_SALALA_CORE_IDS.has(card.id)) score += 5;
      if (card.id === BIG_SALALA_ID) score += openUnitSlots(context) > 0 ? 10 : -8;
      if (card.id === '301000072' && context.player?.unitZone.some(unit => unit?.godMark)) score += 8;
      if (card.id === '303000022' && context.opponent?.unitZone.some(unit => !!unit)) score += 7;
      if (card.type === 'UNIT' && cardCost(card) <= 3) score += 3.5;
      if (card.type === 'UNIT' && (card.damage || 0) >= 2 && opponentErosion(context) >= 5) score += 4;
      if (hasRole(card, 'removal') || hasRole(card, 'tempo')) score += opponentHasTrait(context, 'large-defenders') ? 4 : 2;
      if (hasRole(card, 'search') && context.player && context.player.hand.length <= 4) score += 3;
      if (hasAny(text, [/萨拉拉|Salala|瑟诺布|女神教会|Xenobu|Church/i])) score += 1.5;
      if (opponentIs(context, 'aggro') && card.type !== 'UNIT' && readyDefenders(context) === 0) score -= 4;
      return score;
    },
    adjustAttackScore: context => {
      let score = 0;
      if (context.card.id === BIG_SALALA_ID) score += 8 + (context.card.damage || 0) * 1.5;
      if (context.card.id === BIG_WAR_ANGEL_ID && context.card.godMark) score += 4;
      if (opponentIs(context, 'engine', 'combo', 'control')) score += (context.card.damage || 0) * 1.1;
      if (opponentIs(context, 'aggro') && readyDefenders(context) <= 1) score -= (context.card.damage || 0) * 1.2;
      return score;
    },
    adjustDefenseScore: context => {
      let score = 0;
      if (BIG_SALALA_CORE_IDS.has(context.card.id)) score -= 5;
      if (context.card.id === BIG_SALALA_ID) score -= 8;
      if ((context.card.power || 0) >= 3000) score += 4;
      if (opponentIs(context, 'aggro') || opponentHasTrait(context, 'burst-damage')) score += 7;
      return score;
    },
    adjustMulliganScore: context => {
      const card = context.card;
      let score = 0;
      if (card.type === 'UNIT' && cardCost(card) <= 3) score += 7;
      if (card.id === BIG_SALALA_ID) score += 5;
      if (card.id === '105000481') score += 6;
      if (BIG_SALALA_CORE_IDS.has(card.id)) score += 4;
      if (card.type !== 'UNIT' && (context.earlyUnitsInHand || 0) === 0) score -= 6;
      return score;
    },
    adjustPaymentScore: context => {
      if (BIG_SALALA_CORE_IDS.has(context.card.id)) return 24;
      if (context.card.id === '105000481') return 18;
      if (context.card.godMark) return 10;
      return 0;
    },
    adjustEffectScore: context => {
      let score = 0;
      if (context.effect.id === '103000426_mill_three') {
        const handSalala = (context.player?.hand || []).filter(card => card.id === '103000426').length;
        const graveSalala = (context.player?.grave || []).filter(card => card.id === '103000426').length;
        const deckSalala = (context.player?.deck || []).filter(card => card.id === '103000426').length;
        const nonDeckSpare = handSalala + graveSalala;
        const totalSpare = nonDeckSpare + deckSalala;
        const opponentDeck = context.opponent?.deck.length ?? 99;
        const ownDeck = context.player?.deck.length ?? 99;
        const ownErosion = (context.player?.erosionFront || []).filter(Boolean).length +
          (context.player?.erosionBack || []).filter(Boolean).length;
        const millsOut = opponentDeck <= 3;
        const strongDeckPressure = opponentDeck <= 6;

        if (totalSpare < 2) {
          score -= 80;
          context.notes.push('salala mill lacks two spare godmark salalas');
        } else if (millsOut) {
          score += 44;
          context.notes.push('salala mill can threaten deck-out');
        } else if (strongDeckPressure) {
          score += 24;
          context.notes.push('salala mill pushes low opposing deck');
        } else if (opponentDeck <= 10 && nonDeckSpare >= 2) {
          score += 8;
          context.notes.push('salala mill uses non-deck spares under deck pressure');
        } else {
          score -= 32;
          context.notes.push('salala mill held until opposing deck is low');
        }

        if (!millsOut && nonDeckSpare < 2) {
          score -= opponentDeck > 6 ? 24 : 10;
          context.notes.push('salala mill avoids exiling deck copies early');
        }
        if (!millsOut && ownDeck <= 12) {
          score -= 6;
        }
        if (!millsOut && ownErosion >= 8) {
          score -= 8;
        }
      }
      if (context.card.id === BIG_WAR_SONG_ID && context.effect.id === 'equip_universal') {
        const equippedTarget = context.player?.unitZone.find(unit => unit?.gamecardId === context.card.equipTargetId);
        const bestTarget = context.player?.unitZone
          .filter((unit): unit is Card => !!unit)
          .sort((a, b) => bigSalalaEquipTargetScore(b) - bigSalalaEquipTargetScore(a))[0];
        if (context.card.equipTargetId) {
          score += equippedTarget ? -120 : 24;
        } else {
          const bestScore = bigSalalaEquipTargetScore(bestTarget);
          score += bestScore >= 90 ? 54 : bestScore >= 55 ? 22 : -42;
        }
      }
      if (context.effect.id === '303000022_bind_enter' && context.opponent?.unitZone.some(unit => !!unit)) score += 12;
      if (context.effect.id === '203090028_forced_battle') score += context.opponent?.unitZone.some(unit => unit && !unit.godMark) ? 8 : -12;
      if ((effectHasTag(context, 'tempo') || effectHasTag(context, 'removal')) && opponentIs(context, 'engine', 'combo', 'control')) score += 4;
      if (effectHasTag(context, 'combat') && readyAttackers(context) > 0) score += 3;
      return score;
    },
    adjustQueryScore: context => {
      const card = queryOptionCard(context);
      const effectId = queryEffectId(context);
      if (!card) return 0;

      if (effectId === '303000022_bind_enter') {
        return queryOptionIsMine(context)
          ? -100
          : 90 + (card.godMark ? 18 : 0) + (card.damage || 0) * 8 + (card.power || 0) / 800;
      }
      if (effectId === '101140151_enter_exile') {
        const hasOpponentTargets = !!context.opponent?.unitZone.some(unit => !!unit) ||
          !!context.opponent?.itemZone.some(item => !!item);
        return queryOptionIsMine(context)
          ? hasOpponentTargets ? -120 : -15
          : 80 + (card.godMark ? 12 : 0) + (card.damage || 0) * 6 + (card.power || 0) / 900;
      }
      if (effectId === '203090028_forced_battle') {
        if (queryOptionIsMine(context)) {
          return 50 + (card.power || 0) / 700 + (card.damage || 0) * 6 + (BIG_SALALA_CORE_IDS.has(card.id) ? 8 : 0);
        }
        return 75 + (card.damage || 0) * 8 + (card.power || 0) / 800;
      }
      if (effectId === '203000073_must_defend') {
        return queryOptionIsMine(context)
          ? 60 + (card.power || 0) / 900 + (card.damage || 0) * 8
          : -80;
      }
      if (effectId === '103000426_mill_three') {
        if (card.cardlocation === 'DECK') return 24;
        if (card.cardlocation === 'GRAVE') return 18;
        if (card.cardlocation === 'HAND') return -20;
      }
      const sourceCard = ownCardByGameId(context.player, (context.query as any).context?.sourceCardId);
      if (effectId === 'equip_universal' && sourceCard?.id === BIG_WAR_SONG_ID) {
        if (!queryOptionIsMine(context)) return -140;
        const equippedTarget = context.player?.unitZone.find(unit => unit?.gamecardId === sourceCard.equipTargetId);
        const bestTarget = context.player?.unitZone
          .filter((unit): unit is Card => !!unit)
          .sort((a, b) => bigSalalaEquipTargetScore(b) - bigSalalaEquipTargetScore(a))[0];
        if (card.gamecardId === sourceCard.gamecardId) {
          if (!equippedTarget) return -80;
          return bestTarget && bestTarget.gamecardId !== equippedTarget.gamecardId
            ? 24
            : -170;
        }
        return bigSalalaEquipTargetScore(card);
      }
      return 0;
    },
  },
};
