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

const SWITCH_ACTIVATE_EFFECT_IDS = new Set<string>([
  '104030453_swap',
  '104030459_swap_activate',
  'freya_ranger_activate',
  'wen_swap_activate',
  // Legacy aliases kept so older generated contexts still get the same scoring.
  '104030452_swap',
  '104030450_swap',
]);

const NO_ATTACK_PRIORITY_PENALTY = -120;

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

function ownAlbertTargets(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const targetIds = new Set<string>([ids.batra, ids.hammo, ids.amy, ids.wen]);
  return [...player.unitZone, ...player.grave]
    .filter((card): card is Card => !!card && targetIds.has(card.id));
}

function canEnterBattlefieldFromErosion(player: PlayerState, card: Card) {
  if (card.type !== 'UNIT' || card.displayState !== 'FRONT_UPRIGHT') return false;
  const hasOpenOrCurrentSlot = player.unitZone.some(unit => unit === null || unit?.gamecardId === card.gamecardId);
  if (!hasOpenOrCurrentSlot) return false;
  if (!card.specialName) return true;
  return !player.unitZone.some(unit =>
    !!unit &&
    unit.gamecardId !== card.gamecardId &&
    unit.specialName === card.specialName
  );
}

function hasEnterableErosionUnit(player: PlayerState) {
  return player.erosionFront.some(card => !!card && canEnterBattlefieldFromErosion(player, card));
}

function hasAssociation(player: PlayerState) {
  return hasFieldCard(player, ADVENTURER_GUILD_CARD_IDS.association);
}

function hasAssociationBuffUsed(gameState: GameState, player: PlayerState) {
  const ownAssociationIds = ownFieldCards(player)
    .filter(card => card.id === ADVENTURER_GUILD_CARD_IDS.association && !!card.gamecardId)
    .map(card => card.gamecardId);
  if (ownAssociationIds.length === 0) return false;

  const ownAssociationIdSet = new Set(ownAssociationIds);
  const prefix = `turn_${gameState.turnCount}_304030075_`;
  const suffix = '_option_a';
  return Object.entries(gameState.effectUsage || {}).some(([key, value]) =>
    !!value &&
    key.startsWith(prefix) &&
    key.endsWith(suffix) &&
    ownAssociationIdSet.has(key.slice(prefix.length, -suffix.length))
  );
}

function hasAssociationBuff(card: Card) {
  return !!card.temporaryRush &&
    (card.temporaryDamageBuff || 0) >= 1 &&
    (card.temporaryPowerBuff || 0) >= 500;
}

function hasCoreStarterInFieldOrHand(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  return hasFieldOrHandCard(player, ids.albert) || hasFieldOrHandCard(player, ids.aketi);
}

function hasBothCoreStartersInFieldOrHand(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  return hasFieldOrHandCard(player, ids.albert) && hasFieldOrHandCard(player, ids.aketi);
}

function hammoAmyFieldState(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  return {
    hammo: hasFieldCard(player, ids.hammo),
    amy: hasFieldCard(player, ids.amy),
  };
}

function isHammoAmyMissingPairTarget(player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const pair = hammoAmyFieldState(player);
  return (card.id === ids.hammo && pair.amy && !pair.hammo) ||
    (card.id === ids.amy && pair.hammo && !pair.amy);
}

function isHammoAmyMissingBoth(player: PlayerState) {
  const pair = hammoAmyFieldState(player);
  return !pair.hammo && !pair.amy;
}

function hasSwapTargetForSource(player: PlayerState, source: Card) {
  const fieldSpecialNames = new Set(
    player.unitZone.filter((unit): unit is Card => !!unit && !!unit.specialName).map(unit => unit.specialName)
  );
  const itemSpecialNames = new Set(
    player.itemZone.filter((item): item is Card => !!item && !!item.specialName).map(item => item.specialName)
  );
  return player.erosionFront.some(card =>
    !!card &&
    card.displayState === 'FRONT_UPRIGHT' &&
    card.type === 'UNIT' &&
    card.id !== source.id &&
    card.specialName !== source.specialName &&
    (!card.specialName || (!fieldSpecialNames.has(card.specialName) && !itemSpecialNames.has(card.specialName)))
  );
}

function isKeyCard(card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  return !!card.godMark ||
    (card.acValue || card.baseAcValue || 0) >= 4 ||
    (card.damage || card.baseDamage || 0) >= 2 ||
    card.id === ids.albert ||
    card.id === ids.aketi ||
    card.id === ids.association ||
    card.id === ids.sodo;
}

function opponentHasKeyErosionCard(gameState: GameState, player: PlayerState) {
  const opponent = getOpponent(gameState, player);
  return !!opponent?.erosionFront.some(card =>
    !!card &&
    card.displayState === 'FRONT_UPRIGHT' &&
    isKeyCard(card)
  );
}

function damageMayOverflow(player: PlayerState | undefined) {
  if (!player) return false;
  const erosion = player.erosionFront.filter(Boolean).length + player.erosionBack.filter(Boolean).length;
  return player.deck.length <= 6 || (!player.isGoddessMode && erosion >= 9);
}

function opponentHasPotentialSuicideNonGod(gameState: GameState, player: PlayerState) {
  const opponent = getOpponent(gameState, player);
  if (!opponent) return false;
  const strongestReadyDefender = Math.max(0, ...player.unitZone
    .filter((unit): unit is Card => !!unit && !unit.isExhausted)
    .map(unit => unit.power || 0));
  return opponent.unitZone.some(unit =>
    !!unit &&
    !unit.godMark &&
    !unit.isExhausted &&
    (unit.damage || 0) > 0 &&
    strongestReadyDefender >= (unit.power || 0)
  );
}

function opponentCanDestroyItems(gameState: GameState, player: PlayerState) {
  const opponent = getOpponent(gameState, player);
  if (!opponent) return false;
  return [...opponent.hand, ...opponent.unitZone, ...opponent.itemZone, ...opponent.grave]
    .filter(Boolean)
    .some(card => (card?.effects || []).some(effect => {
      const text = [effect.id, effect.content, effect.description, effect.targetSpec?.description]
        .filter(Boolean)
        .join(' ');
      return /destroy.*item|item.*destroy|remove.*item|item.*remove|破坏.*道具|道具.*破坏/i.test(text);
    }));
}

function opponentHasLowPowerKeyUnit(gameState: GameState, player: PlayerState, maxPower = 2500) {
  return opponentUnits(gameState, player).some(unit =>
    (unit.power || 0) < maxPower &&
    isKeyCard(unit)
  );
}

function albertTargetPriority(gameState: GameState, player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  switch (card.id) {
    case ids.batra:
      return 4.5 + (hasAssociation(player) ? 0 : -2);
    case ids.hammo:
    case ids.amy:
      return 3.5 + (hasAssociation(player) || isHammoAmyMissingPairTarget(player, card) ? 1 : 0);
    case ids.wen:
      return 3 + (hasAssociation(player) ? 0 : 2);
    default:
      return 0;
  }
}

function bestAlbertTargetPriority(gameState: GameState, player: PlayerState) {
  return Math.max(0, ...ownAlbertTargets(player).map(card => albertTargetPriority(gameState, player, card)));
}

function xiaotingFieldSwapPriority(player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (card.id === ids.batra) return 4;
  if (card.id === ids.amy) return 3.5 + (hasFieldCard(player, ids.hammo) ? 1.5 : 0);
  return 0;
}

function bestXiaotingFieldSwapPriority(player: PlayerState) {
  return Math.max(0, ...player.unitZone
    .filter((card): card is Card => !!card)
    .map(card => xiaotingFieldSwapPriority(player, card)));
}

function swapChainTargetPriority(gameState: GameState, player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (card.id === ids.sodo && hasHighCostOpponentUnit(gameState, player)) return 100;
  if ((card.id === ids.hammo || card.id === ids.amy) && isHammoAmyMissingPairTarget(player, card)) return 92;
  if (card.id === ids.xiaoting && hasSwitchAdventurerOnField(player)) return 86;
  if (card.id === ids.batra) return 82;
  if (card.id === ids.kathy) return 78;
  if (card.id === ids.wen) return 74;
  if (card.id === ids.freya) return 70;
  if (card.id === ids.xiaoting) return 66;
  if ((card.id === ids.hammo || card.id === ids.amy) && isHammoAmyMissingBoth(player)) return 62;
  return 0;
}

function associationRecycleTargetPriority(gameState: GameState, player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const missingOnFieldBonus = hasFieldCard(player, card.id) ? 0 : 100;
  if (card.id === ids.hammo || card.id === ids.amy) return missingOnFieldBonus + 50;
  if (card.id === ids.xiaoting && hasSwitchAdventurerOnField(player)) return missingOnFieldBonus + 45;
  if (card.id === ids.batra) return missingOnFieldBonus + 40;
  if (card.id === ids.kathy) return missingOnFieldBonus + 35;
  if (card.id === ids.xiaoting) return missingOnFieldBonus + 30;
  return card.faction === '冒险家公会' ? missingOnFieldBonus + 10 : 0;
}

function aketiResetTargetPriority(card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (!card.isExhausted) return 0;
  if (card.id === ids.amy && hasAssociationBuff(card)) return 100;
  if (card.id === ids.batra) return 90;
  if (card.id === ids.kathy && hasAssociationBuff(card)) return 80;
  return 0;
}

function hasAketiResetTarget(player: PlayerState) {
  return ownFieldCards(player).some(card => aketiResetTargetPriority(card) > 0);
}

function foxMerchantSelfPriority(player: PlayerState) {
  return 2.5 + (hasCoreStarterInFieldOrHand(player) ? 0 : 1);
}

function foxMerchantOpponentPriority(gameState: GameState, player: PlayerState) {
  return 1 + (damageMayOverflow(getOpponent(gameState, player)) ? 3 : 0);
}

function scalesSelfPriority(player: PlayerState) {
  let priority = 2;
  const hasAdventurerInErosion = ownErosionFrontCards(player).some(card => card.faction === '冒险家公会');
  const hasAdventurerInHand = player.hand.some(card => card.faction === '冒险家公会');
  if (!hasAdventurerInErosion && hasAdventurerInHand) priority += 2;
  if (!hasCoreStarterInFieldOrHand(player)) priority += 3;
  if (hasBothCoreStartersInFieldOrHand(player)) priority -= 2;
  return priority;
}

function scalesOpponentPriority(gameState: GameState, player: PlayerState) {
  return damageMayOverflow(getOpponent(gameState, player)) ? 3 : 0;
}

function canPullContinuousAmy(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  return hasFieldCard(player, ids.hammo) &&
    player.erosionFront.some(card =>
      !!card &&
      card.id === ids.amy &&
      canEnterBattlefieldFromErosion(player, card)
    );
}

function hasSwitchAdventurerOnField(player: PlayerState) {
  return countCardIds(ownFieldCards(player), SWITCH_ADVENTURER_IDS) > 0;
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
    case ids.deepSeaFantasy:
      priority = opponentHasLowPowerKeyUnit(gameState, player) ? 4 : 0;
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
      priority = bestAlbertTargetPriority(gameState, player);
      notes.push('冒险家公会：艾伯特优先拉换位/汉莫艾咪/文');
      break;
    case '304030075_trigger':
      priority = 5;
      if (!hasEnterableErosionUnit(player)) priority -= 1.5;
      if (canPullContinuousAmy(player)) priority -= 2.5;
      notes.push('冒险家公会：协会优先+BUFF，其次塞侵蚀区/横置');
      break;
    case 'dragon_wing_receptionist_activate':
      priority = bestXiaotingFieldSwapPriority(player);
      notes.push('冒险家公会：小婷优先换下巴特拉或艾咪');
      break;
    case '104030453_swap':
    case '104030459_swap_activate':
    case 'freya_ranger_activate':
    case 'wen_swap_activate':
    case '104030452_swap':
    case '104030450_swap':
      priority = 4;
      notes.push('冒险家公会：换位冒险家启动效果');
      break;
    case '104030459_entry_exhaust':
      priority = 0;
      if (hasAssociationBuffUsed(gameState, player) || canPullContinuousAmy(player)) priority = 4;
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
      priority = getOpponent(gameState, player)?.erosionFront.some(card => !!card && card.displayState === 'FRONT_UPRIGHT')
        ? 3 + (opponentHasKeyErosionCard(gameState, player) ? 1 : 0)
        : 0;
      notes.push('冒险家公会：狐族商人优先干扰对手侵蚀区');
      break;
    case '104020066_activate_2':
      priority = Math.max(
        foxMerchantSelfPriority(player),
        foxMerchantOpponentPriority(gameState, player)
      );
      notes.push('冒险家公会：狐族商人对自己补艾伯特/阿克蒂');
      break;
    case 'sodo_to_erosion':
      priority = 0;
      if (hasHighCostOpponentUnit(gameState, player)) priority += 4;
      if (!hasCoreStarterInFieldOrHand(player)) priority += 5;
      notes.push('冒险家公会：索德对高COST单位或找主轴时进侵蚀区');
      break;
    case 'sodo_entry_bounce':
      priority = 4;
      if (hasHighCostOpponentUnit(gameState, player)) priority += 2;
      notes.push('冒险家公会：索德诱发回手高威胁');
      break;
    case 'wen_search_from_erosion':
      priority = 4;
      notes.push('adventurer-guild: wen trigger is mandatory');
      break;
    case '304020009_activate':
      priority = Math.max(
        scalesSelfPriority(player),
        scalesOpponentPriority(gameState, player)
      );
      notes.push('冒险家公会：天秤优先给自己补侵蚀区主轴');
      break;
    case '204000115_deep_sea_fantasy':
      priority = opponentHasLowPowerKeyUnit(gameState, player) ? 4 : 0;
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
    case ids.elena:
      priority = 0;
      break;
    case ids.sodo:
      priority = (player.deck.length < 10 || (getOpponent(gameState, player)?.deck.length || 99) < 10) ? 5 : 0;
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
  const switchEffectUnavailable = SWITCH_ADVENTURER_IDS.has(card.id) && !hasSwapTargetForSource(player, card);
  if (card.id === ids.albert && canBeBlockedDead) {
    priority = 0;
  }
  if (switchEffectUnavailable && onlySwitcher && canBeBlockedDead) {
    priority -= 1;
  }
  if (priority <= 0) {
    return NO_ATTACK_PRIORITY_PENALTY;
  }
  return priority * 12;
}

function adventurerTargetPriority(gameState: GameState, player: PlayerState, card: Card) {
  return swapChainTargetPriority(gameState, player, card);
}

function scoreAssociationChoice(gameState: GameState, player: PlayerState, query: EffectQuery, option: any) {
  const optionId = String(option.id || '');
  const sourceCard = query.context?.sourceCardId
    ? findCardInPlayerZones(player, query.context.sourceCardId)
    : undefined;

  if (sourceCard?.id === ADVENTURER_GUILD_CARD_IDS.deepSeaFantasy && query.callbackKey === 'DECLARE_EFFECT_TARGET_MODE') {
    if (optionId === 'BLUE_ATTACK_UNITS') return opponentHasLowPowerKeyUnit(gameState, player) ? 40 : 0;
    return -10;
  }

  if (query.context?.effectId !== '304030075_trigger' || query.context?.step !== 'RESOLVE_OPTION') return undefined;
  if (optionId === 'OPTION_A') {
    let priority = 5;
    if (!hasEnterableErosionUnit(player)) priority -= 1.5;
    if (canPullContinuousAmy(player)) priority -= 2.5;
    return priority * 10;
  }
  if (optionId === 'OPTION_C') {
    return 40;
  }
  if (optionId === 'OPTION_B') {
    let priority = 3;
    if (countReadyOpponentNonGodUnits(gameState, player, 2500) > 0) priority += 1;
    if (opponentHasPotentialSuicideNonGod(gameState, player)) priority += 1.5;
    return priority * 10;
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
    return albertTargetPriority(gameState, player, card) * 20 + (card.cardlocation === 'GRAVE' ? 8 : 0);
  }

  if (effectId === '304030075_trigger' && step === 'FINALIZE_EXHAUST') {
    return !option.isMine ? 90 + (card.power || 0) / 100 + (card.damage || 0) * 12 : -80;
  }

  if (effectId === '304030075_trigger' && step === 'FINALIZE_RECYCLE') {
    return associationRecycleTargetPriority(gameState, player, card);
  }

  if (effectId === 'aketi_rotation_trigger') {
    if (!option.isMine) return undefined;
    const resetPriority = aketiResetTargetPriority(card);
    return resetPriority > 0 ? resetPriority : undefined;
  }

  if (effectId === 'wen_search_from_erosion') {
    const ids = ADVENTURER_GUILD_CARD_IDS;
    const needsAssociation = !hasFieldOrHandCard(player, ids.association);
    const itemRemovalRisk = opponentCanDestroyItems(gameState, player);
    if (card.id === ids.association) return needsAssociation ? 120 : itemRemovalRisk ? 100 : 50;
    if (card.id === ids.soup) return needsAssociation || itemRemovalRisk ? 60 : 110;
    return card.faction === '冒险家公会' ? 40 : 0;
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
    const xiaotingPriority = xiaotingFieldSwapPriority(player, card);
    return xiaotingPriority > 0 ? xiaotingPriority * 20 : adventurerTargetPriority(gameState, player, card) * 0.4;
  }

  const sourceIsSwitcher = !!sourceCard && SWITCH_ADVENTURER_IDS.has(sourceCard.id);
  if (
    step === 'EROSION_UNIT' ||
    step === 'SELECT_SWAP_TARGET' ||
    (sourceIsSwitcher && step === '2') ||
    (SWITCH_ACTIVATE_EFFECT_IDS.has(effectId) && step === '2') ||
    query.description?.includes('放置到战场')
  ) {
    return adventurerTargetPriority(gameState, player, card);
  }

  if (effectId === '104020066_activate_1' && card.cardlocation === 'EROSION_FRONT') {
    const keyCardBonus = isKeyCard(card) ? 40 : 0;
    const boardValue = (card.acValue || card.baseAcValue || 0) * 4 + (card.power || 0) / 100 + (card.damage || 0) * 8;
    return option.isMine
      ? 20 + adventurerTargetPriority(gameState, player, card)
      : 80 + keyCardBonus + boardValue;
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
  const isSelf = optionId === 'PLAYER_SELF';

  if (effectId === '104020066_activate_1') {
    return isSelf
      ? -40
      : (3 + (opponentHasKeyErosionCard(gameState, player) ? 1 : 0)) * 10;
  }
  if (effectId === '104020066_activate_2') {
    const selfScore = foxMerchantSelfPriority(player) * 10;
    const opponentScore = foxMerchantOpponentPriority(gameState, player) * 10;
    return isSelf ? selfScore : opponentScore;
  }
  if (effectId === '304020009_activate') {
    const selfScore = scalesSelfPriority(player) * 10;
    const opponentScore = scalesOpponentPriority(gameState, player) * 10;
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

  if (query.callbackKey === 'TRIGGER_CHOICE') {
    const effectId = String(query.context?.effectId || '');
    if (effectId === 'aketi_rotation_trigger') {
      return hasAketiResetTarget(player) ? ['YES'] : ['NO'];
    }
    if (effectId === '104030459_entry_exhaust') {
      return hasAssociationBuffUsed(gameState, player) || canPullContinuousAmy(player) ? ['YES'] : ['NO'];
    }
    if (effectId === 'sodo_entry_bounce' || effectId === 'wen_search_from_erosion') {
      return ['YES'];
    }
    return undefined;
  }

  const selectableOptions = (query.options || []).filter(option => !option.disabled);
  if (selectableOptions.length === 0) return undefined;

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
