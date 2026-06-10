import { Card, EffectQuery, GameState, PlayerState } from '../../../src/types/game';
import { DeckAiProfile } from '../types';
import { PURE_YELLOW_STEEL_PROFILE_ID } from './pureYellowSteel';

const HEALING_APPRENTICE_EFFECT_ID = '105110108_activate';
const OTHERWORLD_FANTASY_EFFECT_ID = '205000117_otherworld_fantasy';
const HIGH_ALCHEMY_MATERIAL_STEPS: Record<string, Set<string>> = {
  '205000103_high_alchemy': new Set(['SEND_FIELD']),
  '205000153_rainbow_high_alchemy': new Set(['MATERIALS']),
  '305000073_activate': new Set(['SEND_UNITS']),
  '105110404_high_alchemy_put_unit': new Set(['COST']),
};
const FORTRESS_BLUEPRINT_EFFECT_ID = '305110061_end_fortress_blueprint';
const DEFENSE_MECHANISM_CARD_ID = '105110386';
const STEEL_VALKYRIE_CARD_ID = '105110351';
const STEEL_PUPPET_CARD_ID = '105000385';
const LOW_DECK_START_EXILE_EFFECT_IDS = new Set([
  '305000055_start_exile',
  '305110061_start_face_down_exile',
]);

function isProfile(profile: DeckAiProfile) {
  return profile.id === PURE_YELLOW_STEEL_PROFILE_ID;
}

function getOpponent(gameState: GameState, playerUid: string) {
  const opponentUid = gameState.playerIds.find(uid => uid !== playerUid);
  return opponentUid ? gameState.players[opponentUid] : undefined;
}

function optionId(option: any) {
  return String(option.value || option.id || option.selectionId || option.label || '');
}

function getCost(card: Card) {
  return Math.max(0, card.baseAcValue ?? card.acValue ?? 0);
}

function sameName(card: Card, target: Card) {
  return card.id === target.id || (!!card.fullName && card.fullName === target.fullName);
}

function countSameName(cards: Card[], target: Card) {
  return cards.filter(card => sameName(card, target)).length;
}

function opponentFieldCards(gameState: GameState, playerUid: string) {
  const opponent = getOpponent(gameState, playerUid);
  return opponent
    ? [...opponent.unitZone, ...opponent.itemZone].filter((card): card is Card => !!card)
    : [];
}

function cardKeyValue(card: Card) {
  return (
    (card.type === 'STORY' ? 44 : 0) +
    (card.type === 'ITEM' ? 28 : 0) +
    (card.godMark ? 36 : 0) +
    getCost(card) * 7 +
    Math.max(0, card.damage || card.baseDamage || 0) * 13 +
    Math.max(0, card.power || card.basePower || 0) / 150 +
    (card.effects?.length ? 12 : 0)
  );
}

function profileBias(profile: DeckAiProfile, card: Card) {
  return (
    (profile.preserveCardIds?.[card.id] || profile.preserveCardIds?.[card.uniqueId] || 0) +
    (profile.preferredCardIds?.[card.id] || profile.preferredCardIds?.[card.uniqueId] || 0) * 0.5
  );
}

function scoreHealingRecycleTarget(card: Card, profile: DeckAiProfile) {
  return (
    60 +
    (card.godMark ? 120 : 0) +
    (card.type === 'STORY' ? 95 : 0) +
    (card.type === 'ITEM' ? 35 : 0) +
    profileBias(profile, card) * 2 +
    cardKeyValue(card) * 0.35
  );
}

function scoreOtherworldFantasyTarget(gameState: GameState, playerUid: string, query: EffectQuery, card: Card) {
  const opponent = getOpponent(gameState, playerUid);
  if (!opponent) return undefined;

  const modeId = String(
    query.context?.modeId ||
    query.context?.selectedModeId ||
    query.context?.declaredModeId ||
    ''
  ).toUpperCase();
  const deckCount = countSameName(opponent.deck, card);
  const handCount = countSameName(opponent.hand, card);
  const graveCount = countSameName(opponent.grave, card);
  const sameNamePressure = modeId === 'EXILE_ALL_SAME_NAME'
    ? deckCount * 130 + handCount * 55 + graveCount * 25
    : deckCount * 150 + graveCount * 10;

  return sameNamePressure + cardKeyValue(card);
}

function scoreHighAlchemySendUnit(card: Card, profile: DeckAiProfile) {
  const cost = getCost(card);
  const lowCostBonus = cost <= 1
    ? 180
    : cost === 2
      ? 145
      : cost === 3
        ? 35
        : 0;
  const keyPenalty =
    (card.godMark ? 360 : 0) +
    profileBias(profile, card) * 5 +
    Math.max(0, card.damage || card.baseDamage || 0) * 28 +
    Math.max(0, card.power || card.basePower || 0) / 75 +
    Math.max(0, cost - 2) * 35 +
    (card.effects?.length ? 28 : 0);

  return (
    lowCostBonus +
    ((card.damage || card.baseDamage || 0) <= 0 ? 28 : 0) +
    (card.isExhausted ? 12 : 0) -
    keyPenalty
  );
}

function scoreFortressBlueprintUnit(gameState: GameState, playerUid: string, card: Card, profile: DeckAiProfile) {
  const opponentCards = opponentFieldCards(gameState, playerUid);
  const opponentNonGodCards = opponentCards.filter(card => !card.godMark);
  const allGodmarkCards = Object.values(gameState.players).flatMap(player =>
    [...player.unitZone, ...player.itemZone].filter((fieldCard): fieldCard is Card => !!fieldCard && !!fieldCard.godMark)
  );
  const incomingDamage = getOpponent(gameState, playerUid)?.unitZone
    .filter((unit): unit is Card => !!unit && !unit.isExhausted)
    .reduce((sum, unit) => sum + Math.max(0, unit.damage || 0), 0) || 0;
  const baseUnitValue =
    cardKeyValue(card) +
    profileBias(profile, card) * 2 +
    Math.max(0, card.damage || card.baseDamage || 0) * 18 +
    Math.max(0, card.power || card.basePower || 0) / 80;

  if (card.id === DEFENSE_MECHANISM_CARD_ID) {
    return (
      220 +
      baseUnitValue +
      opponentNonGodCards.length * 95 +
      allGodmarkCards.length * 35 +
      (opponentNonGodCards.length >= 2 ? 180 : 0) +
      (incomingDamage >= 4 ? 80 : 0)
    );
  }

  if (card.id === STEEL_VALKYRIE_CARD_ID) {
    return baseUnitValue + (opponentNonGodCards.length > 0 ? 90 : 0) + 40;
  }

  if (card.id === STEEL_PUPPET_CARD_ID) {
    return baseUnitValue + 30;
  }

  return baseUnitValue;
}

export function scorePureYellowSteelChoiceOption(
  gameState: GameState,
  playerUid: string,
  query: EffectQuery,
  option: any,
  profile: DeckAiProfile
) {
  if (!isProfile(profile)) return undefined;
  const player = gameState.players[playerUid];
  if (!player) return undefined;

  const effectId = String(query.context?.effectId || '');
  const step = String(query.context?.step || '');
  const id = optionId(option);

  if (effectId === HEALING_APPRENTICE_EFFECT_ID && step === 'DECLARE_NAME') {
    const topDeckCard = player.deck[player.deck.length - 1];
    if (!topDeckCard?.fullName) return undefined;
    return id === topDeckCard.fullName ? 1000 : -1000;
  }

  if (effectId === HEALING_APPRENTICE_EFFECT_ID && step === 'ASK_BOTTOM') {
    if (/^YES$/i.test(id)) return 120;
    if (/^NO$/i.test(id)) return -120;
  }

  if (
    effectId === OTHERWORLD_FANTASY_EFFECT_ID &&
    query.callbackKey === 'DECLARE_EFFECT_TARGET_MODE'
  ) {
    if (id === 'EXILE_ALL_SAME_NAME') return 260;
    if (id === 'MILL_DECK_SAME_NAME') return 100;
  }

  return undefined;
}

export function choosePureYellowSteelQuerySelections(
  gameState: GameState,
  playerUid: string,
  query: EffectQuery,
  profile: DeckAiProfile
) {
  if (!isProfile(profile)) return undefined;
  const player = gameState.players[playerUid];
  if (!player) return undefined;

  if (query.callbackKey === 'TRIGGER_CHOICE') {
    const effectId = String(query.context?.effectId || '');
    const lowDeck = profile.riskThresholds?.lowDeck ?? 10;
    const stopSelfDrawAtDeck = profile.riskThresholds?.stopSelfDrawAtDeck ?? lowDeck;
    if (
      LOW_DECK_START_EXILE_EFFECT_IDS.has(effectId) &&
      player.deck.length <= stopSelfDrawAtDeck
    ) {
      return ['NO'];
    }
  }

  return undefined;
}

export function scorePureYellowSteelQueryCardOption(
  gameState: GameState,
  playerUid: string,
  query: EffectQuery,
  option: any,
  profile: DeckAiProfile
) {
  if (!isProfile(profile)) return undefined;
  const card = option.card as Card | undefined;
  if (!card) return undefined;

  const effectId = String(query.context?.effectId || '');
  const step = String(query.context?.step || '');

  if (effectId === HEALING_APPRENTICE_EFFECT_ID && step === 'SELECT_GRAVE') {
    return scoreHealingRecycleTarget(card, profile);
  }

  if (effectId === OTHERWORLD_FANTASY_EFFECT_ID && step === 'TARGET') {
    return scoreOtherworldFantasyTarget(gameState, playerUid, query, card);
  }

  if (HIGH_ALCHEMY_MATERIAL_STEPS[effectId]?.has(step)) {
    return scoreHighAlchemySendUnit(card, profile);
  }

  if (effectId === FORTRESS_BLUEPRINT_EFFECT_ID && step === 'PUT_UNIT') {
    return scoreFortressBlueprintUnit(gameState, playerUid, card, profile);
  }

  return undefined;
}
