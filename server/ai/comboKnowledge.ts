import { Card, CardEffect, GamePhase, GameState, PlayerState } from '../../src/types/game';
import { DeckAiProfile } from './types';

type ComboScoreReason =
  | 'value'
  | 'playable'
  | 'attack'
  | 'defense'
  | 'mulligan'
  | 'discard'
  | 'paymentSacrifice'
  | 'paymentExhaust'
  | 'effect';

export interface ComboOpportunity {
  id: string;
  name: string;
  score: number;
  ready: boolean;
  partial: boolean;
  phase: GamePhase;
  reasons: string[];
  preserveIds: string[];
  preferredAttackers: string[];
  wantsAllianceAttack: boolean;
  payoffPlayableNow: boolean;
  payoffInHand: boolean;
}

export interface ComboAllianceAttackPlan {
  comboId: string;
  comboName: string;
  attackers: [Card, Card];
  score: number;
  reasons: string[];
}

const SMILE_KORIEL_ID = '101100096';
const ECLIPSE_ID = '201100037';
const ECLIPSE_EFFECT_ID = '201100037_eclipse';

function countBackErosion(player: PlayerState) {
  return player.erosionBack.filter(Boolean).length;
}

function countTotalErosion(player: PlayerState) {
  return player.erosionFront.filter(Boolean).length + player.erosionBack.filter(Boolean).length;
}

function countLikelyDefenders(gameState: GameState, defender: PlayerState | undefined) {
  if (!defender) return 0;
  return defender.unitZone.filter(unit =>
    unit &&
    !unit.isExhausted &&
    !(unit as any).battleForbiddenByEffect &&
    !((unit as any).data?.cannotDefendTurn === gameState.turnCount) &&
    !((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount)
  ).length;
}

function cardMatches(card: Card | null | undefined, id: string) {
  if (!card) return false;
  return card.id === id || card.uniqueId === id || card.effects?.some(effect => effect.id?.startsWith(id));
}

export function isSmileKoriel(card: Card | null | undefined) {
  return cardMatches(card, SMILE_KORIEL_ID);
}

export function isEclipse(card: Card | null | undefined) {
  return cardMatches(card, ECLIPSE_ID) || !!card?.effects?.some(effect => effect.id === ECLIPSE_EFFECT_ID);
}

function isEclipseEffect(effect: CardEffect | undefined) {
  return effect?.id === ECLIPSE_EFFECT_ID;
}

function hasUsedEclipse(gameState: GameState, player: PlayerState) {
  const usage = gameState.effectUsage || {};
  return Object.keys(usage).some(key =>
    usage[key] > 0 &&
    key.includes(`_${player.uid}_`) &&
    key.includes(ECLIPSE_ID) &&
    key.includes(ECLIPSE_EFFECT_ID)
  );
}

function canAttackForCombo(gameState: GameState, unit: Card | null | undefined) {
  if (!unit || unit.isExhausted || unit.canAttack === false) return false;
  if ((unit as any).battleForbiddenByEffect) return false;
  if ((unit as any).data?.cannotAllianceByEffect) return false;
  if ((unit as any).data?.cannotAttackThisTurn === gameState.turnCount) return false;
  if ((unit as any).data?.cannotAttackOrDefendUntilTurn && (unit as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount) return false;
  if ((unit.damage || 0) < 1) return false;
  const wasPlayedThisTurn = unit.playedTurn === gameState.turnCount;
  return !!unit.isrush || !wasPlayedThisTurn;
}

function isWhiteAlliancePartner(gameState: GameState, unit: Card | null | undefined, smile?: Card) {
  return !!unit &&
    !isSmileKoriel(unit) &&
    (!smile?.specialName || !unit.specialName || unit.specialName !== smile.specialName) &&
    unit.type === 'UNIT' &&
    unit.color === 'WHITE' &&
    canAttackForCombo(gameState, unit);
}

function findBestWhitePartner(gameState: GameState, units: Card[], smile?: Card) {
  return [...units]
    .filter(unit => isWhiteAlliancePartner(gameState, unit, smile))
    .sort((a, b) => {
      const score = (unit: Card) =>
        (unit.damage || 0) * 12 +
        (unit.power || 0) / 1000 +
        (unit.godMark ? 2 : 0);
      return score(b) - score(a);
    })[0];
}

function allPlayerCards(player: PlayerState) {
  return [
    ...player.hand,
    ...player.unitZone,
    ...player.itemZone,
    ...player.grave,
    ...player.exile,
    ...player.erosionFront,
    ...player.erosionBack,
    ...player.playZone,
  ].filter((card): card is Card => !!card);
}

function hasSmileAllianceBattle(gameState: GameState, player: PlayerState) {
  const battle = gameState.battleState;
  if (!battle?.isAlliance || gameState.phase !== 'BATTLE_FREE') return false;
  return battle.attackers
    .map(id => player.unitZone.find(unit => unit?.gamecardId === id))
    .some(isSmileKoriel);
}

function opponentBoardSize(gameState: GameState, player: PlayerState) {
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
  return (opponent?.unitZone.filter(Boolean).length || 0) + (opponent?.itemZone.filter(Boolean).length || 0);
}

function ownBoardSize(player: PlayerState) {
  return player.unitZone.filter(Boolean).length + player.itemZone.filter(Boolean).length;
}

function findSmileAllianceEclipseOpportunity(
  gameState: GameState,
  player: PlayerState,
  profile: DeckAiProfile
): ComboOpportunity | undefined {
  const playerCards = allPlayerCards(player);
  const hasRelevantCards = playerCards.some(isSmileKoriel) || playerCards.some(isEclipse);
  if (!hasRelevantCards && profile.id !== 'white-temple') return undefined;

  const units = player.unitZone.filter((unit): unit is Card => !!unit);
  const attackableSmile = units.find(unit => isSmileKoriel(unit) && canAttackForCombo(gameState, unit));
  const fieldSmile = units.find(isSmileKoriel);
  const partner = findBestWhitePartner(gameState, units, fieldSmile);
  const eclipseInHand = player.hand.find(isEclipse);
  const hasBackErosion = countBackErosion(player) >= 3;
  const eclipseUnused = !hasUsedEclipse(gameState, player);
  const inProtectedAllianceWindow = hasSmileAllianceBattle(gameState, player);
  const payoffInHand = !!eclipseInHand;
  const payoffPlayableNow = !!eclipseInHand && hasBackErosion && eclipseUnused && inProtectedAllianceWindow;
  const protectedAllianceReady = !!attackableSmile && !!partner;
  const ready = protectedAllianceReady && payoffInHand && hasBackErosion && eclipseUnused;
  const partial = !!fieldSmile || !!eclipseInHand || !!partner;
  const reasons: string[] = [];

  if (fieldSmile) reasons.push('smile-on-field');
  if (attackableSmile) reasons.push('smile-can-attack');
  if (partner) reasons.push('white-partner-ready');
  if (protectedAllianceReady) reasons.push('smile-protected-alliance-ready');
  if (eclipseInHand) reasons.push('eclipse-in-hand');
  if (hasBackErosion) reasons.push('erosion-back-3');
  if (inProtectedAllianceWindow) reasons.push('protected-alliance-window');
  if (!eclipseUnused) reasons.push('eclipse-used');

  const preserveIds = [fieldSmile, eclipseInHand, partner]
    .filter((card): card is Card => !!card)
    .map(card => card.gamecardId);
  const preferredAttackers = [attackableSmile, partner]
    .filter((card): card is Card => !!card)
    .map(card => card.gamecardId);
  const wantsAllianceAttack = protectedAllianceReady && gameState.phase === 'BATTLE_DECLARATION';
  const boardSwing = Math.max(0, opponentBoardSize(gameState, player) - ownBoardSize(player));
  const score =
    (payoffPlayableNow ? 130 : 0) +
    (wantsAllianceAttack ? 90 : 0) +
    (ready ? 50 : 0) +
    (protectedAllianceReady ? 28 : 0) +
    (partial ? 14 : 0) +
    boardSwing * 5 +
    (countTotalErosion(player) >= 8 ? 8 : 0);

  return {
    id: 'smile-alliance-eclipse',
    name: 'Smile Alliance Eclipse',
    score,
    ready,
    partial,
    phase: gameState.phase,
    reasons,
    preserveIds,
    preferredAttackers,
    wantsAllianceAttack,
    payoffPlayableNow,
    payoffInHand,
  };
}

export function getComboOpportunities(gameState: GameState, player: PlayerState, profile: DeckAiProfile) {
  return [
    findSmileAllianceEclipseOpportunity(gameState, player, profile),
  ]
    .filter((combo): combo is ComboOpportunity => !!combo)
    .sort((a, b) => b.score - a.score);
}

export function getBestComboOpportunity(gameState: GameState, player: PlayerState, profile: DeckAiProfile) {
  return getComboOpportunities(gameState, player, profile)[0];
}

export function getComboAllianceAttack(
  gameState: GameState,
  player: PlayerState,
  profile: DeckAiProfile,
  availableAttackers: Card[]
): ComboAllianceAttackPlan | undefined {
  const combo = getBestComboOpportunity(gameState, player, profile);
  if (!combo?.wantsAllianceAttack) return undefined;

  const availableIds = new Set(availableAttackers.map(card => card.gamecardId));
  const attackers = combo.preferredAttackers
    .map(id => availableAttackers.find(card => card.gamecardId === id))
    .filter((card): card is Card => !!card && availableIds.has(card.gamecardId));

  if (attackers.length !== 2 || !attackers.some(isSmileKoriel)) return undefined;

  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
  const likelyDefenders = countLikelyDefenders(gameState, opponent);
  if (opponent && likelyDefenders === 0) {
    const totalDamage = availableAttackers.reduce((sum, card) => sum + Math.max(0, card.damage || 0), 0);
    const comboDamage = attackers.reduce((sum, card) => sum + Math.max(0, card.damage || 0), 0);
    const damageToCritical = Math.max(1, 10 - countTotalErosion(opponent));
    const directDeckLethal = totalDamage > opponent.deck.length;
    const directErosionCritical = totalDamage >= damageToCritical;
    const comboDeckLethal = comboDamage > opponent.deck.length;
    const comboErosionCritical = comboDamage >= damageToCritical;

    if ((directDeckLethal && !comboDeckLethal) || (directErosionCritical && !comboErosionCritical)) {
      return undefined;
    }
  }

  return {
    comboId: combo.id,
    comboName: combo.name,
    attackers: [attackers[0], attackers[1]],
    score: combo.score,
    reasons: combo.reasons,
  };
}

export function scoreComboCard(
  gameState: GameState | undefined,
  player: PlayerState | undefined,
  card: Card | null | undefined,
  profile: DeckAiProfile,
  reason: ComboScoreReason
) {
  if (!gameState || !player || !card) return 0;
  const combo = getBestComboOpportunity(gameState, player, profile);
  if (!combo?.partial) return 0;

  const isSmile = isSmileKoriel(card);
  const eclipse = isEclipse(card);
  const isPreservedInstance = combo.preserveIds.includes(card.gamecardId);
  let score = 0;

  if (isSmile) {
    if (reason === 'attack' && combo.wantsAllianceAttack) score += 85;
    if (reason === 'playable') score += combo.payoffInHand ? 10 : 5;
    if (reason === 'mulligan') score += 9;
    if (reason === 'discard' || reason === 'paymentSacrifice' || reason === 'paymentExhaust') score += 45;
    if (reason === 'value') score += 8;
  }

  if (eclipse) {
    if (reason === 'playable') {
      if (combo.payoffPlayableNow) {
        score += 135;
      } else if (gameState.phase === 'MAIN' && combo.ready) {
        score -= 85;
      } else if (gameState.phase === 'MAIN' && (combo.payoffInHand || combo.partial)) {
        score -= 35;
      } else if (opponentBoardSize(gameState, player) >= ownBoardSize(player) + 2) {
        score += 14;
      }
    }
    if (reason === 'mulligan') score += 3;
    if (reason === 'discard' || reason === 'paymentSacrifice' || reason === 'paymentExhaust') score += combo.ready ? 55 : 24;
    if (reason === 'value') score += 4;
  }

  if (isPreservedInstance && (reason === 'discard' || reason === 'paymentSacrifice' || reason === 'paymentExhaust')) {
    score += 18;
  }

  if (
    !isSmile &&
    !eclipse &&
    combo.preferredAttackers.includes(card.gamecardId) &&
    (reason === 'attack' || reason === 'paymentExhaust' || reason === 'paymentSacrifice')
  ) {
    score += reason === 'attack' ? 38 : 18;
  }

  return score;
}

export function scoreComboEffect(
  gameState: GameState,
  player: PlayerState,
  card: Card,
  effect: CardEffect,
  profile: DeckAiProfile
) {
  if (!isEclipse(card) && !isEclipseEffect(effect)) return { score: 0, note: undefined as string | undefined };
  const combo = getBestComboOpportunity(gameState, player, profile);
  if (combo?.payoffPlayableNow) {
    return { score: 125, note: `${combo.name}: protected board wipe window` };
  }
  if (combo?.ready && gameState.phase !== 'BATTLE_FREE') {
    return { score: -55, note: `${combo.name}: wait for alliance battle free` };
  }
  if (opponentBoardSize(gameState, player) >= ownBoardSize(player) + 3) {
    return { score: 20, note: 'Eclipse emergency board reset' };
  }
  return { score: -18, note: 'Eclipse held without protected combo window' };
}

export function describeComboForDecision(combo: ComboOpportunity | undefined) {
  if (!combo) return 'none';
  return `${combo.name} ready=${combo.ready} payoff=${combo.payoffPlayableNow} reasons=${combo.reasons.join('|') || 'none'}`;
}

export const KNOWN_COMBO_CARD_IDS = {
  smileKoriel: SMILE_KORIEL_ID,
  eclipse: ECLIPSE_ID,
  eclipseEffect: ECLIPSE_EFFECT_ID,
};
