import { Card, CardEffect, EffectQuery, GameState, PlayerState } from '../../../src/types/game';
import { inferPlayerDeckProfile } from '../playerDeckProfile';
import { DeckAiProfile } from '../types';

export const ADVENTURER_GUILD_PROFILE_ID = 'adventurer-guild';

export const ADVENTURER_GUILD_CARD_IDS = {
  albert: '104030415',
  association: '304030075',
  xiaoting: '104030451',
  foxMerchant: '104020066',
  aketi: '104020068',
  batra: '104030453',
  kathy: '104030459',
  freya: '104030452',
  wen: '104030450',
  hammo: '104030306',
  amy: '104030307',
  scales: '304020009',
  elena: '104010308',
  swordFairy: '104010447',
  soup: '304030039',
  sodo: '104030454',
  meditation: '204000091',
  tenkoOrder: '204000092',
  deepSeaFantasy: '204000115',
} as const;

const DEFAULT_OPENING_IDS = new Set<string>([
  ADVENTURER_GUILD_CARD_IDS.albert,
  ADVENTURER_GUILD_CARD_IDS.association,
  ADVENTURER_GUILD_CARD_IDS.xiaoting,
  ADVENTURER_GUILD_CARD_IDS.foxMerchant,
]);

const SWITCH_ADVENTURER_IDS = new Set<string>([
  ADVENTURER_GUILD_CARD_IDS.batra,
  ADVENTURER_GUILD_CARD_IDS.kathy,
  ADVENTURER_GUILD_CARD_IDS.freya,
  ADVENTURER_GUILD_CARD_IDS.wen,
]);

const BATRA_CHAIN_TARGET_IDS: readonly string[] = [
  ADVENTURER_GUILD_CARD_IDS.sodo,
  ADVENTURER_GUILD_CARD_IDS.hammo,
  ADVENTURER_GUILD_CARD_IDS.amy,
  ADVENTURER_GUILD_CARD_IDS.xiaoting,
  ADVENTURER_GUILD_CARD_IDS.batra,
  ADVENTURER_GUILD_CARD_IDS.kathy,
  ADVENTURER_GUILD_CARD_IDS.wen,
  ADVENTURER_GUILD_CARD_IDS.freya,
];

function isProfile(profile: DeckAiProfile) {
  return profile.id === ADVENTURER_GUILD_PROFILE_ID;
}

function hasCardId(cards: Array<Card | null | undefined>, cardId: string) {
  return cards.some(card => card?.id === cardId);
}

function countCardIds(cards: Array<Card | null | undefined>, cardIds: Set<string>) {
  return cards.reduce((count, card) => count + (card && cardIds.has(card.id) ? 1 : 0), 0);
}

function hasFieldCard(player: PlayerState, cardId: string) {
  return hasCardId([...player.unitZone, ...player.itemZone], cardId);
}

function hasFieldOrHandCard(player: PlayerState, cardId: string) {
  return hasCardId([...player.unitZone, ...player.itemZone, ...player.hand], cardId);
}

function hasErosionCard(player: PlayerState, cardId: string) {
  return hasCardId([...player.erosionFront, ...player.erosionBack], cardId);
}

function getOpponent(gameState: GameState, player: PlayerState) {
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  return opponentUid ? gameState.players[opponentUid] : undefined;
}

function ownFieldCards(player: PlayerState) {
  return [...player.unitZone, ...player.itemZone].filter((card): card is Card => !!card);
}

function ownErosionFrontCards(player: PlayerState) {
  return player.erosionFront.filter((card): card is Card => !!card);
}

function opponentUnits(gameState: GameState, player: PlayerState) {
  return getOpponent(gameState, player)?.unitZone.filter((card): card is Card => !!card) || [];
}

function canAttack(gameState: GameState, card: Card) {
  if (card.cardlocation !== 'UNIT') return false;
  if (card.isExhausted || card.canAttack === false || (card.damage || 0) <= 0) return false;
  if ((card as any).battleForbiddenByEffect) return false;
  if ((card as any).data?.cannotAttackThisTurn === gameState.turnCount) return false;
  if ((card as any).data?.cannotAttackOrDefendUntilTurn && (card as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount) return false;
  return !!card.isrush || card.playedTurn !== gameState.turnCount;
}

function countReadyOpponentNonGodUnits(gameState: GameState, player: PlayerState, minPower = 0) {
  return opponentUnits(gameState, player).filter(unit =>
    !unit.godMark &&
    !unit.isExhausted &&
    (unit.power || 0) >= minPower
  ).length;
}

function hasHighCostOpponentUnit(gameState: GameState, player: PlayerState) {
  return opponentUnits(gameState, player).some(unit => (unit.acValue || unit.baseAcValue || 0) >= 5);
}

function hasAssociation(player: PlayerState) {
  return hasFieldCard(player, ADVENTURER_GUILD_CARD_IDS.association);
}

function hasHammoAmyPairPotential(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  return hasFieldOrHandCard(player, ids.hammo) || hasFieldOrHandCard(player, ids.amy) ||
    hasErosionCard(player, ids.hammo) || hasErosionCard(player, ids.amy);
}

function canPullContinuousAmy(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  return hasFieldCard(player, ids.hammo) && hasErosionCard(player, ids.amy);
}

function hasSwitchAdventurerOnField(player: PlayerState) {
  return countCardIds(ownFieldCards(player), SWITCH_ADVENTURER_IDS) > 0;
}

function countAttackers(gameState: GameState, player: PlayerState) {
  return player.unitZone.filter((unit): unit is Card => !!unit && canAttack(gameState, unit)).length;
}

function isFirstTurn(gameState: GameState) {
  return gameState.turnCount <= 1;
}

function isFirstPlayerFirstTurn(gameState: GameState, player: PlayerState) {
  return isFirstTurn(gameState) && player.isFirst;
}

function isInOwnErosion(player: PlayerState, card: Card) {
  return player.erosionFront.some(candidate => candidate?.gamecardId === card.gamecardId) ||
    player.erosionBack.some(candidate => candidate?.gamecardId === card.gamecardId) ||
    card.cardlocation === 'EROSION_FRONT' ||
    card.cardlocation === 'EROSION_BACK';
}

function opponentHasManySearches(gameState: GameState, player: PlayerState) {
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
  if (!opponent) return false;
  const searchTextCount = [...opponent.hand, ...opponent.unitZone, ...opponent.itemZone, ...opponent.grave]
    .filter(Boolean)
    .filter(card => {
      const text = [
        card?.fullName,
        card?.faction,
        ...(card?.effects || []).flatMap(effect => [effect.id, effect.content, effect.description]),
      ].filter(Boolean).join(' ');
      return /search|deck.*hand|卡组.*手牌|检索|选择.*卡组/.test(text);
    }).length;
  return searchTextCount >= 2;
}

function opponentLooksAggro(gameState: GameState, player: PlayerState) {
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const opponentProfile = inferPlayerDeckProfile(gameState, opponentUid);
  return opponentProfile.archetype === 'aggro' || opponentProfile.scores.aggression >= 16;
}

function scoreDevelopmentPriority(gameState: GameState, player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const fieldCards = [...player.unitZone, ...player.itemZone];
  const handCards = player.hand;
  const hasAnySwitcher = countCardIds(fieldCards, SWITCH_ADVENTURER_IDS) > 0;
  const xiaotingOnField = hasFieldCard(player, ids.xiaoting);
  const canNewSwitcherSwapXiaoting = xiaotingOnField && SWITCH_ADVENTURER_IDS.has(card.id);
  let priority = 0;

  switch (card.id) {
    case ids.albert:
      priority = 5;
      if (isFirstPlayerFirstTurn(gameState, player)) priority -= 1;
      break;
    case ids.association:
      priority = 4.5;
      if (isFirstPlayerFirstTurn(gameState, player)) priority -= 1;
      break;
    case ids.aketi:
      priority = 4;
      if (isInOwnErosion(player, card)) priority += 1.5;
      break;
    case ids.xiaoting:
      priority = 3.5;
      break;
    case ids.batra:
    case ids.kathy:
    case ids.freya:
    case ids.wen:
      priority = 3;
      if (hasAnySwitcher) priority -= 1.5;
      if (canNewSwitcherSwapXiaoting) priority += 0.5;
      break;
    case ids.hammo:
    case ids.amy: {
      const pairId = card.id === ids.hammo ? ids.amy : ids.hammo;
      priority = 2;
      if (hasFieldOrHandCard(player, pairId) || hasCardId(handCards, ids.hammo) && hasCardId(handCards, ids.amy)) {
        priority += 2;
      }
      break;
    }
    case ids.foxMerchant:
      priority = 2;
      if (isFirstTurn(gameState)) priority += 1.5;
      break;
    case ids.scales:
      priority = 2;
      break;
    case ids.elena:
      priority = 1.5;
      if (isFirstTurn(gameState) || opponentHasManySearches(gameState, player)) priority += 2;
      break;
    case ids.swordFairy:
      priority = 1.5;
      if (isFirstPlayerFirstTurn(gameState, player) || opponentLooksAggro(gameState, player)) priority += 2;
      break;
    case ids.soup:
      priority = 1.5;
      break;
  }

  return priority;
}

export function scoreAdventurerGuildMulliganKeep(card: Card, profile: DeckAiProfile) {
  if (!isProfile(profile)) return 0;
  if (DEFAULT_OPENING_IDS.has(card.id)) return 80;
  return -8;
}

export function scoreAdventurerGuildPlayableCard(
  gameState: GameState,
  player: PlayerState,
  card: Card,
  profile: DeckAiProfile
) {
  if (!isProfile(profile)) return 0;
  const priority = scoreDevelopmentPriority(gameState, player, card);
  if (priority <= 0) return 0;
  return priority * 12;
}

export function scoreAdventurerGuildEffect(
  gameState: GameState,
  player: PlayerState,
  card: Card,
  effect: CardEffect,
  profile: DeckAiProfile
) {
  if (!isProfile(profile)) return { score: 0, notes: [] as string[] };
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const notes: string[] = [];
  let priority = 0;

  switch (effect.id) {
    case '104030415_cycle_adventurer_through_erosion':
      if (hasErosionCard(player, ids.batra)) priority = 4.5;
      else if (hasErosionCard(player, ids.hammo) || hasErosionCard(player, ids.amy)) priority = 3.5;
      else if (hasErosionCard(player, ids.wen)) priority = 3;
      else priority = 2.5;
      if (!hasAssociation(player) && hasErosionCard(player, ids.batra)) priority -= 2;
      if (!hasAssociation(player) && hasErosionCard(player, ids.wen)) priority += 2;
      if (hasAssociation(player) && (hasErosionCard(player, ids.hammo) || hasErosionCard(player, ids.amy))) priority += 1;
      notes.push('冒险家公会：艾伯特优先拉换位/汉莫艾咪/文');
      break;
    case '304030075_trigger':
      priority = 5;
      if (!ownErosionFrontCards(player).some(card => card.type === 'UNIT')) priority -= 1.5;
      if (canPullContinuousAmy(player)) priority -= 2.5;
      notes.push('冒险家公会：协会优先+BUFF，其次塞侵蚀区/横置');
      break;
    case 'dragon_wing_receptionist_activate':
      priority = hasErosionCard(player, ids.batra) ? 4 : hasErosionCard(player, ids.amy) ? 3.5 : 2.5;
      if (hasErosionCard(player, ids.amy) && hasFieldCard(player, ids.hammo)) priority += 1.5;
      notes.push('冒险家公会：小婷优先换下巴特拉或艾咪');
      break;
    case '104030453_swap':
    case '104030459_swap_activate':
    case '104030452_swap':
    case '104030450_swap':
      priority = 4;
      notes.push('冒险家公会：换位冒险家启动效果');
      break;
    case '104030459_entry_exhaust':
      priority = 0;
      if (hasAssociation(player) || canPullContinuousAmy(player)) priority = 4;
      notes.push('冒险家公会：凯茜诱发只在协会BUFF已用或可拉艾咪时发动');
      break;
    case '104030306_enter_from_erosion':
      priority = 3 + (hasFieldCard(player, ids.amy) ? 2 : 0);
      notes.push('冒险家公会：汉莫有艾咪时优先登场');
      break;
    case '104030307_enter_from_erosion':
      priority = 3 + (hasFieldCard(player, ids.hammo) ? 2 : 0);
      notes.push('冒险家公会：艾咪有汉莫时优先登场');
      break;
    case '104020066_activate_1':
      priority = 3 + (getOpponent(gameState, player)?.erosionFront.some(card => !!card && card.displayState === 'FRONT_UPRIGHT') ? 1 : 0);
      notes.push('冒险家公会：狐族商人优先干扰对手侵蚀区');
      break;
    case '104020066_activate_2':
      priority = !hasFieldOrHandCard(player, ids.albert) && !hasFieldOrHandCard(player, ids.aketi) ? 3.5 : 2.5;
      notes.push('冒险家公会：狐族商人对自己补艾伯特/阿克蒂');
      break;
    case 'sodo_to_erosion':
      priority = 0;
      if (hasHighCostOpponentUnit(gameState, player)) priority += 4;
      if (!hasFieldOrHandCard(player, ids.albert) && !hasFieldOrHandCard(player, ids.aketi)) priority += 5;
      notes.push('冒险家公会：索德对高COST单位或找主轴时进侵蚀区');
      break;
    case 'sodo_entry_bounce':
      priority = 4;
      if (hasHighCostOpponentUnit(gameState, player)) priority += 2;
      notes.push('冒险家公会：索德诱发回手高威胁');
      break;
    case '304020009_activate':
      priority = 2;
      if (ownErosionFrontCards(player).every(card => card.faction !== '冒险家公会') && player.hand.some(card => card.faction === '冒险家公会')) priority += 2;
      if (!hasFieldOrHandCard(player, ids.albert) && !hasFieldOrHandCard(player, ids.aketi)) priority += 3;
      if (hasFieldOrHandCard(player, ids.albert) && hasFieldOrHandCard(player, ids.aketi)) priority -= 2;
      notes.push('冒险家公会：天秤优先给自己补侵蚀区主轴');
      break;
    case '204000115_deep_sea_fantasy':
      priority = countReadyOpponentNonGodUnits(gameState, player, 1) > 0 ? 4 : 0;
      notes.push('冒险家公会：深海幻想主要用于攻击对方关键低力单位');
      break;
  }

  if (priority <= 0) return { score: 0, notes };
  return { score: priority * 14, notes };
}

export function scoreAdventurerGuildAttack(
  gameState: GameState,
  player: PlayerState,
  card: Card,
  profile: DeckAiProfile
) {
  if (!isProfile(profile)) return 0;
  const ids = ADVENTURER_GUILD_CARD_IDS;
  let priority: number | undefined;
  switch (card.id) {
    case ids.wen:
    case ids.hammo:
    case ids.foxMerchant:
    case ids.sodo:
    case ids.elena:
      priority = 0;
      break;
    case ids.amy:
      priority = 3.5 + (hasFieldCard(player, ids.hammo) ? 1.5 : 0);
      break;
    case ids.batra:
    case ids.freya:
    case ids.kathy:
      priority = 5;
      break;
    case ids.albert:
      priority = 2.5;
      break;
  }
  if (priority === undefined) return 0;

  const strongestReadyDefender = Math.max(0, ...opponentUnits(gameState, player)
    .filter(unit => !unit.isExhausted)
    .map(unit => unit.power || 0));
  const canBeBlockedDead = strongestReadyDefender >= (card.power || 0);
  const onlySwitcher = SWITCH_ADVENTURER_IDS.has(card.id) && countCardIds(ownFieldCards(player), SWITCH_ADVENTURER_IDS) === 1;
  if (onlySwitcher && canBeBlockedDead) priority -= 1;
  if ((card.id === ids.sodo || card.id === ids.elena) && (player.deck.length <= 10 || (getOpponent(gameState, player)?.deck.length || 99) <= 10)) {
    priority += 5;
  }
  return priority * 12;
}

function adventurerTargetPriority(gameState: GameState, player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (card.id === ids.sodo && hasHighCostOpponentUnit(gameState, player)) return 100;
  if ((card.id === ids.hammo || card.id === ids.amy) && hasHammoAmyPairPotential(player)) return 92;
  if (card.id === ids.xiaoting && hasSwitchAdventurerOnField(player)) return 86;
  const index = BATRA_CHAIN_TARGET_IDS.indexOf(card.id);
  return index >= 0 ? 80 - index * 4 : 0;
}

function scoreAssociationChoice(gameState: GameState, player: PlayerState, query: EffectQuery, option: any) {
  const optionId = String(option.id || '');
  if (query.context?.effectId !== '304030075_trigger' || query.context?.step !== 'RESOLVE_OPTION') return undefined;
  if (optionId === 'OPTION_A') {
    let score = 50;
    if (!ownErosionFrontCards(player).some(card => card.type === 'UNIT')) score -= 15;
    if (canPullContinuousAmy(player)) score -= 25;
    return score;
  }
  if (optionId === 'OPTION_C') {
    return 40 + (hasFieldCard(player, ADVENTURER_GUILD_CARD_IDS.hammo) || hasFieldCard(player, ADVENTURER_GUILD_CARD_IDS.amy) ? 8 : 0);
  }
  if (optionId === 'OPTION_B') {
    return 30 +
      countReadyOpponentNonGodUnits(gameState, player, 2500) * 10 +
      (countAttackers(gameState, player) > 0 ? 5 : 0);
  }
  return undefined;
}

function scoreAdventurerGuildCardSelection(gameState: GameState, player: PlayerState, query: EffectQuery, option: any) {
  const card = option.card as Card | undefined;
  if (!card) return undefined;
  const effectId = String(query.context?.effectId || '');
  const step = String(query.context?.step || '');
  const sourceCard = query.context?.sourceCardId
    ? findCardInPlayerZones(player, query.context.sourceCardId) || findCardInPlayerZones(getOpponent(gameState, player), query.context.sourceCardId)
    : undefined;

  if (effectId === '104030415_cycle_adventurer_through_erosion') {
    if (card.cardlocation === 'GRAVE') return 90 + adventurerTargetPriority(gameState, player, card);
    return adventurerTargetPriority(gameState, player, card);
  }

  if (effectId === '304030075_trigger' && step === 'FINALIZE_EXHAUST') {
    return !option.isMine ? 90 + (card.power || 0) / 100 + (card.damage || 0) * 12 : -80;
  }

  if (effectId === '304030075_trigger' && step === 'FINALIZE_RECYCLE') {
    return adventurerTargetPriority(gameState, player, card) || (card.faction === '冒险家公会' ? 30 : 0);
  }

  if (effectId === 'aketi_rotation_trigger') {
    if (option.isMine) {
      if (card.isExhausted && [ADVENTURER_GUILD_CARD_IDS.amy, ADVENTURER_GUILD_CARD_IDS.batra, ADVENTURER_GUILD_CARD_IDS.kathy].includes(card.id as any)) {
        return 100 + (card.damage || 0) * 12;
      }
      return -30;
    }
    return !card.isExhausted ? 80 + (card.power || 0) / 100 + (card.damage || 0) * 10 : 10;
  }

  if (effectId === 'sodo_entry_bounce' || step === 'BOUNCE_TARGET') {
    return option.isMine ? -80 : 90 + (card.acValue || 0) * 8 + (card.power || 0) / 100 + (card.damage || 0) * 10;
  }

  if (effectId === '104030459_entry_exhaust' || step === 'SELECT_TARGET') {
    if (sourceCard?.id === ADVENTURER_GUILD_CARD_IDS.kathy) {
      return option.isMine ? -80 : 80 + (card.power || 0) / 100 + (card.damage || 0) * 10;
    }
  }

  if (step === 'FIELD_UNIT' || query.description?.includes('置入侵蚀区')) {
    if (card.id === ADVENTURER_GUILD_CARD_IDS.batra) return 90;
    if (card.id === ADVENTURER_GUILD_CARD_IDS.amy) return 82 + (hasFieldCard(player, ADVENTURER_GUILD_CARD_IDS.hammo) ? 15 : 0);
    return adventurerTargetPriority(gameState, player, card) * 0.4;
  }

  if (step === 'EROSION_UNIT' || step === 'SELECT_SWAP_TARGET' || query.description?.includes('放置到战场')) {
    return adventurerTargetPriority(gameState, player, card);
  }

  if (effectId === '104020066_activate_1' && card.cardlocation === 'EROSION_FRONT') {
    return option.isMine ? 20 + adventurerTargetPriority(gameState, player, card) : 80 + adventurerTargetPriority(gameState, player, card);
  }

  return undefined;
}

function findCardInPlayerZones(player: PlayerState | undefined, gamecardId: string) {
  if (!player) return undefined;
  return [
    ...player.hand,
    ...player.unitZone,
    ...player.itemZone,
    ...player.grave,
    ...player.exile,
    ...player.erosionFront,
    ...player.erosionBack,
    ...player.playZone,
  ].find(card => card?.gamecardId === gamecardId);
}

function scorePlayerChoice(gameState: GameState, player: PlayerState, query: EffectQuery, option: any) {
  const optionId = option.card?.id || option.card?.gamecardId || option.id;
  if (optionId !== 'PLAYER_SELF' && optionId !== 'PLAYER_OPPONENT') return undefined;
  const effectId = String(query.context?.effectId || '');
  const opponent = getOpponent(gameState, player);
  const isSelf = optionId === 'PLAYER_SELF';
  const opponentErosion = opponent
    ? opponent.erosionFront.filter(Boolean).length + opponent.erosionBack.filter(Boolean).length
    : 0;
  const opponentDamageOverflow = opponent ? opponent.deck.length <= 6 || (!opponent.isGoddessMode && opponentErosion >= 9) : false;

  if (effectId === '104020066_activate_1') return isSelf ? 10 : 60;
  if (effectId === '104020066_activate_2') {
    let selfScore = 25 + (!hasFieldOrHandCard(player, ADVENTURER_GUILD_CARD_IDS.albert) && !hasFieldOrHandCard(player, ADVENTURER_GUILD_CARD_IDS.aketi) ? 10 : 0);
    let opponentScore = 10 + (opponentDamageOverflow ? 30 : 0);
    return isSelf ? selfScore : opponentScore;
  }
  if (effectId === '304020009_activate') {
    let selfScore = 20;
    if (ownErosionFrontCards(player).every(card => card.faction !== '冒险家公会') && player.hand.some(card => card.faction === '冒险家公会')) selfScore += 20;
    if (!hasFieldOrHandCard(player, ADVENTURER_GUILD_CARD_IDS.albert) && !hasFieldOrHandCard(player, ADVENTURER_GUILD_CARD_IDS.aketi)) selfScore += 30;
    if (hasFieldOrHandCard(player, ADVENTURER_GUILD_CARD_IDS.albert) && hasFieldOrHandCard(player, ADVENTURER_GUILD_CARD_IDS.aketi)) selfScore -= 20;
    let opponentScore = opponentDamageOverflow ? 30 : 0;
    return isSelf ? selfScore : opponentScore;
  }
  return undefined;
}

export function chooseAdventurerGuildQuerySelections(
  gameState: GameState,
  playerUid: string,
  query: EffectQuery,
  profile: DeckAiProfile
) {
  if (!isProfile(profile)) return undefined;
  const player = gameState.players[playerUid];
  if (!player) return undefined;
  const selectableOptions = (query.options || []).filter(option => !option.disabled);
  if (selectableOptions.length === 0) return undefined;

  if (query.callbackKey === 'TRIGGER_CHOICE') {
    const effectId = String(query.context?.effectId || '');
    if (effectId === '104030459_entry_exhaust') {
      return hasAssociation(player) || canPullContinuousAmy(player) ? ['YES'] : ['NO'];
    }
    return undefined;
  }

  if (query.type === 'SELECT_CHOICE') {
    const scored = selectableOptions
      .map(option => ({ option, score: scoreAssociationChoice(gameState, player, query, option) }))
      .filter((entry): entry is { option: any; score: number } => entry.score !== undefined)
      .sort((a, b) => b.score - a.score);
    if (scored.length === selectableOptions.length && scored[0]) return [scored[0].option.id || scored[0].option.card?.gamecardId].filter(Boolean);
  }

  const scoredPlayerChoices = selectableOptions
    .map(option => ({ option, score: scorePlayerChoice(gameState, player, query, option) }))
    .filter((entry): entry is { option: any; score: number } => entry.score !== undefined)
    .sort((a, b) => b.score - a.score);
  if (scoredPlayerChoices.length === selectableOptions.length && scoredPlayerChoices[0]) {
    return [scoredPlayerChoices[0].option.card?.gamecardId || scoredPlayerChoices[0].option.id].filter(Boolean);
  }

  const scoredCards = selectableOptions
    .filter(option => option.card)
    .map(option => ({ option, score: scoreAdventurerGuildCardSelection(gameState, player, query, option) }))
    .filter((entry): entry is { option: any; score: number } => entry.score !== undefined)
    .sort((a, b) => b.score - a.score);
  if (scoredCards.length > 0) {
    const minSelections = query.minSelections ?? 1;
    const maxSelections = query.maxSelections ?? minSelections;
    const count = Math.max(0, Math.min(maxSelections, Math.max(minSelections, 1), scoredCards.length));
    return scoredCards.slice(0, count)
      .map(({ option }) => option.card?.gamecardId || option.id)
      .filter(Boolean);
  }

  return undefined;
}
