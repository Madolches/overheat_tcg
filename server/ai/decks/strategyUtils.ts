import { Card } from '../../../src/types/game';
import { DeckAiCardScoreContext, DeckAiEffectScoreContext, DeckAiQueryScoreContext, PlayerDeckArchetype } from '../types';
import { getCardKnowledge } from '../cardKnowledge';

export const cardCost = (card: Card) => Math.max(0, card.baseAcValue ?? card.acValue ?? 0);

export function cardText(card: Card) {
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

export function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(text));
}

export function hasRole(card: Card, role: string) {
  return !!getCardKnowledge(card)?.roles.includes(role as any);
}

export function effectHasTag(context: DeckAiEffectScoreContext, tag: string) {
  return context.tags.includes(tag as any);
}

export function opponentIs(
  context: DeckAiCardScoreContext | DeckAiEffectScoreContext,
  ...archetypes: PlayerDeckArchetype[]
) {
  return !!context.opponentDeckProfile && archetypes.includes(context.opponentDeckProfile.archetype);
}

export function opponentHasTrait(context: DeckAiCardScoreContext | DeckAiEffectScoreContext, trait: string) {
  return !!context.opponentDeckProfile?.traits.includes(trait);
}

export function openUnitSlots(context: DeckAiCardScoreContext | DeckAiEffectScoreContext) {
  return context.player?.unitZone.filter(slot => slot === null).length || 0;
}

export function erosionCount(player: DeckAiCardScoreContext['player']) {
  return (player?.erosionFront.filter(Boolean).length || 0) + (player?.erosionBack.filter(Boolean).length || 0);
}

export function ownErosion(context: DeckAiCardScoreContext | DeckAiEffectScoreContext) {
  return erosionCount(context.player);
}

export function opponentErosion(context: DeckAiCardScoreContext | DeckAiEffectScoreContext) {
  if (context.opponent?.isGoddessMode) return 0;
  return erosionCount(context.opponent);
}

export function readyAttackers(context: DeckAiCardScoreContext | DeckAiEffectScoreContext | DeckAiQueryScoreContext) {
  const turn = context.gameState?.turnCount || 0;
  return context.player?.unitZone.filter(unit =>
    unit &&
    !unit.isExhausted &&
    unit.canAttack !== false &&
    (unit.damage || 0) > 0 &&
    !((unit as any).battleForbiddenByEffect) &&
    !((unit as any).data?.cannotAttackThisTurn === turn) &&
    !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= turn) &&
    (!!unit.isrush || unit.playedTurn !== turn)
  ).length || 0;
}

export function readyDefenders(context: DeckAiCardScoreContext | DeckAiEffectScoreContext | DeckAiQueryScoreContext) {
  const turn = context.gameState?.turnCount || 0;
  return context.player?.unitZone.filter(unit =>
    unit &&
    !unit.isExhausted &&
    !(unit as any).battleForbiddenByEffect &&
    !((unit as any).data?.cannotDefendTurn === turn) &&
    !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= turn)
  ).length || 0;
}

export function queryEffectId(context: DeckAiQueryScoreContext) {
  return String((context.query as any).context?.effectId || '');
}

export function queryStep(context: DeckAiQueryScoreContext) {
  return String((context.query as any).context?.step || '');
}

export function queryText(context: DeckAiQueryScoreContext) {
  const query = context.query as any;
  return [
    query.title,
    query.description,
    query.callbackKey,
    query.context?.effectId,
    query.context?.step,
  ].filter(Boolean).join(' ');
}

export function queryOptionIsMine(context: DeckAiQueryScoreContext) {
  return context.option?.isMine === true;
}

export function queryOptionCard(context: DeckAiQueryScoreContext) {
  return context.option?.card as Card | undefined;
}

export function battlePressureActive(context: DeckAiCardScoreContext | DeckAiEffectScoreContext | DeckAiQueryScoreContext) {
  const phase = context.gameState?.phase;
  const attackers = context.gameState?.battleState?.attackers?.filter(Boolean).length || 0;
  return attackers > 0 || phase === 'BATTLE_DECLARATION' || phase === 'DEFENSE_DECLARATION' || phase === 'DAMAGE_CALCULATION';
}
