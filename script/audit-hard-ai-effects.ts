import { AI_DECK_PROFILES } from '../server/ai/deckProfiles';
import { inferEffectTimingProfile } from '../server/ai/effectTimingKnowledge';
import { DeckAiProfile } from '../server/ai/types';
import { initServerCardLibrary, loadServerCards, SERVER_CARD_LIBRARY } from '../server/card_loader';
import { decodeDeckShareCode } from '../src/lib/deckShareCode';
import { Card, CardEffect } from '../src/types/game';

type Severity = 'critical' | 'warning' | 'info';

interface AuditFinding {
  severity: Severity;
  profileId: string;
  cardId: string;
  cardName: string;
  effectId: string;
  category: string;
  message: string;
}

const severityRank: Record<Severity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

const args = new Set(process.argv.slice(2));
const failOn = (() => {
  const raw = process.argv.find(arg => arg.startsWith('--fail-on='));
  const value = raw?.slice('--fail-on='.length) as Severity | undefined;
  return value && severityRank[value] ? value : undefined;
})();

function uniqueCatalogRefs(cards: Card[]) {
  return cards.map(card => card.uniqueId).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function resolveProfileDeck(profile: DeckAiProfile, catalogRefs: string[]) {
  if (!profile.shareCode) return [];
  const refs = decodeDeckShareCode(profile.shareCode, catalogRefs);
  return refs.map(ref => SERVER_CARD_LIBRARY[ref]).filter(Boolean);
}

function effectText(card: Card, effect: CardEffect) {
  return [
    card.fullName,
    card.id,
    effect.id,
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

function normalizedSource(effect: CardEffect) {
  return [
    effect.condition?.toString() || '',
    effect.execute?.toString() || '',
    effect.onQueryResolve?.toString() || '',
    effect.resolve?.toString() || '',
    JSON.stringify(effect.targetSpec || {}),
  ].join(' ');
}

function textHasAny(text: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(text));
}

function hasManualSpecificTiming(timingReasons: string[]) {
  return timingReasons.some(reason =>
    /should|wait|held|protects|after|before|only|needs|window|用于|等待|保护|攻击后|防御|时机/i.test(reason)
  );
}

function hasCardSpecificProfile(profile: DeckAiProfile, card: Card, effect: CardEffect) {
  return !!(
    profile.preferredCardIds?.[card.id] ||
    profile.preserveCardIds?.[card.id] ||
    profile.effectPreferences?.preferredEffectIds?.[effect.id || ''] ||
    profile.effectPreferences?.avoidEffectIds?.[effect.id || ''] ||
    profile.effectPreferences?.lowDeckAvoidEffectIds?.[effect.id || '']
  );
}

function addFinding(
  findings: AuditFinding[],
  severity: Severity,
  profile: DeckAiProfile,
  card: Card,
  effect: CardEffect,
  category: string,
  message: string
) {
  findings.push({
    severity,
    profileId: profile.id,
    cardId: card.id,
    cardName: card.fullName || card.id,
    effectId: effect.id || '(no-effect-id)',
    category,
    message,
  });
}

function auditEffect(profile: DeckAiProfile, card: Card, effect: CardEffect, findings: AuditFinding[]) {
  if (!(effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED')) return;

  const timing = inferEffectTimingProfile(card, effect);
  const tags = new Set(timing.tags);
  const text = effectText(card, effect);
  const upper = text.toUpperCase();
  const source = normalizedSource(effect);
  const hasTargetSpec = !!effect.targetSpec;
  const hasCondition = !!effect.condition;
  const usesSelectionQuery = /createSelectCardQuery|pendingQuery|SELECT_CARD|targetSpec|getCandidates/.test(source);
  const manualSpecificTiming = hasManualSpecificTiming(timing.reasons);
  const profileSpecific = hasCardSpecificProfile(profile, card, effect);

  if ((tags.has('counter') || tags.has('protection')) && !manualSpecificTiming && !profileSpecific) {
    addFinding(
      findings,
      'warning',
      profile,
      card,
      effect,
      'protection/counter',
      'Protection or counter-like effect has no card-specific timing note; verify it waits for a real threat.'
    );
  }

  if (
    (tags.has('draw') || tags.has('search') || tags.has('resource') || tags.has('summon') || tags.has('revive')) &&
    !tags.has('counter') &&
    !tags.has('combat') &&
    !tags.has('protection') &&
    !manualSpecificTiming &&
    !profileSpecific
  ) {
    addFinding(
      findings,
      'info',
      profile,
      card,
      effect,
      'setup/resource',
      'Setup/resource effect lacks specific AI timing knowledge; keep it main-phase unless combo or lethal says otherwise.'
    );
  }

  if ((tags.has('removal') || tags.has('tempo')) && usesSelectionQuery && !hasTargetSpec && !manualSpecificTiming && !profileSpecific) {
    addFinding(
      findings,
      'warning',
      profile,
      card,
      effect,
      'targeting',
      'Removal or tempo effect has no structured targetSpec; audit target selection so AI does not choose own or low-value targets.'
    );
  }
  if ((tags.has('removal') || tags.has('tempo')) && usesSelectionQuery && !hasTargetSpec && profileSpecific) {
    addFinding(
      findings,
      'info',
      profile,
      card,
      effect,
      'targeting',
      'Targeting effect has no structured targetSpec, but the deck profile has card/effect-specific knowledge.'
    );
  }

  const resetLike = tags.has('reset') || textHasAny(upper, [/READY|RESET|重置|竖置|恢復|恢复/]);
  const selfResetLike =
    resetLike &&
    textHasAny(upper, [/THIS UNIT|THIS CARD|SELF|这个单位|這個單位|这张卡|此卡/]) &&
    !hasTargetSpec;
  const sourceChecksExhausted = /isExhausted|hasAttackedThisTurn|battleState|attackers/.test(source);
  if (selfResetLike && !sourceChecksExhausted && !manualSpecificTiming) {
    addFinding(
      findings,
      'critical',
      profile,
      card,
      effect,
      'self-reset',
      'Self-reset effect does not appear to require an exhausted/attacked/battle state; this can be fired too early like Dikai.'
    );
  }

  const allFieldTargeting = /allCardsOnField|allCardsOnField\(gameState\)|ownerOf|ownerUidOf/.test(source);
  if ((tags.has('removal') || tags.has('tempo')) && allFieldTargeting && !profileSpecific && !/getOpponentUid|OPPONENT|opponent|!isMine|ownerOf\(.*!==/.test(source)) {
    addFinding(
      findings,
      'warning',
      profile,
      card,
      effect,
      'broad-targeting',
      'Effect can inspect all field cards without an obvious opponent-only filter; verify AI target scoring and script candidates.'
    );
  }

  const phaseCondition = /gameState\.phase\s*===|gameState\.phase\s*!==|playerState\.isTurn|!playerState\.isTurn/.test(source);
  if (phaseCondition && !manualSpecificTiming) {
    addFinding(
      findings,
      'info',
      profile,
      card,
      effect,
      'script-phase-gate',
      'Script has its own phase/turn gate; confirm it is intended card text and not an overly narrow AI workaround.'
    );
  }

  if (!hasCondition && tags.has('risk') && !profileSpecific) {
    addFinding(
      findings,
      'warning',
      profile,
      card,
      effect,
      'risk',
      'Risk-tagged effect has no condition or profile-specific bias; verify cost/payment discipline.'
    );
  }
}

function summarizeFindings(findings: AuditFinding[]) {
  const bySeverity = findings.reduce<Record<Severity, number>>((counts, finding) => {
    counts[finding.severity] += 1;
    return counts;
  }, { critical: 0, warning: 0, info: 0 });

  console.log(`Hard AI effect audit: ${findings.length} findings`);
  console.log(`critical=${bySeverity.critical}, warning=${bySeverity.warning}, info=${bySeverity.info}`);

  const sorted = [...findings].sort((a, b) =>
    severityRank[b.severity] - severityRank[a.severity] ||
    a.profileId.localeCompare(b.profileId) ||
    a.cardId.localeCompare(b.cardId) ||
    a.effectId.localeCompare(b.effectId)
  );

  const showAll = args.has('--all');
  const visible = showAll ? sorted : sorted.filter(finding => finding.severity !== 'info');
  for (const finding of visible) {
    console.log(
      `${finding.severity.toUpperCase()} [${finding.profileId}] ${finding.cardName} (${finding.cardId}) #${finding.effectId} ${finding.category}: ${finding.message}`
    );
  }

  if (!showAll && bySeverity.info > 0) {
    console.log(`INFO findings hidden: ${bySeverity.info}. Re-run with --all to inspect setup/resource notes.`);
  }

  if (failOn) {
    const threshold = severityRank[failOn];
    const failed = findings.some(finding => severityRank[finding.severity] >= threshold);
    if (failed) process.exitCode = 1;
  }
}

async function main() {
  const cards = await loadServerCards();
  await initServerCardLibrary();
  const catalogRefs = uniqueCatalogRefs(cards);
  const findings: AuditFinding[] = [];

  for (const profile of AI_DECK_PROFILES) {
    const seen = new Set<string>();
    const deck = resolveProfileDeck(profile, catalogRefs);
    for (const card of deck) {
      if (!card || seen.has(card.id)) continue;
      seen.add(card.id);
      for (const effect of card.effects || []) {
        auditEffect(profile, card, effect, findings);
      }
    }
  }

  summarizeFindings(findings);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
