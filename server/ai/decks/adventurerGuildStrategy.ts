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

export const ADVENTURER_GUILD_DEFAULT_OPENING_CARD_IDS = [
  ADVENTURER_GUILD_CARD_IDS.xiaoting,
  ADVENTURER_GUILD_CARD_IDS.elena,
  ADVENTURER_GUILD_CARD_IDS.albert,
  ADVENTURER_GUILD_CARD_IDS.association,
  ADVENTURER_GUILD_CARD_IDS.soup,
] as const;

export const ADVENTURER_GUILD_FIRST_TURN_PLAY_CARD_IDS = [
  ADVENTURER_GUILD_CARD_IDS.xiaoting,
  ADVENTURER_GUILD_CARD_IDS.elena,
  ADVENTURER_GUILD_CARD_IDS.albert,
  ADVENTURER_GUILD_CARD_IDS.association,
] as const;

const DEFAULT_OPENING_IDS = new Set<string>(ADVENTURER_GUILD_DEFAULT_OPENING_CARD_IDS);

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

const ADVENTURER_GUILD_FACTION_IDS = new Set<string>([
  ADVENTURER_GUILD_CARD_IDS.albert,
  ADVENTURER_GUILD_CARD_IDS.xiaoting,
  ADVENTURER_GUILD_CARD_IDS.foxMerchant,
  ADVENTURER_GUILD_CARD_IDS.aketi,
  ADVENTURER_GUILD_CARD_IDS.batra,
  ADVENTURER_GUILD_CARD_IDS.kathy,
  ADVENTURER_GUILD_CARD_IDS.freya,
  ADVENTURER_GUILD_CARD_IDS.wen,
  ADVENTURER_GUILD_CARD_IDS.hammo,
  ADVENTURER_GUILD_CARD_IDS.amy,
  ADVENTURER_GUILD_CARD_IDS.sodo,
]);

const NO_ATTACK_PRIORITY_PENALTY = -120;

export interface AdventurerGuildDevelopmentScore {
  score: number;
  tier?: '核心启动' | '主轴展开' | '组合组件' | '辅助运营' | '战术应对';
  notes: string[];
}

export interface AdventurerGuildTacticalScore {
  score: number;
  priority: number;
  notes: string[];
}

export type AdventurerGuildRouteId = 'ROUTE_A_AMY_KATHY_BATRA' | 'ROUTE_B_BATRA_KATHY_X';
export type AdventurerGuildRouteActionKind = 'ATTACK' | 'ACTIVATE_EFFECT' | 'PLAY_CARD' | 'QUERY_OPTION' | 'QUERY_TARGET';

export interface AdventurerGuildRouteAdvice {
  routeId: AdventurerGuildRouteId;
  stepKey: string;
  actionKind: AdventurerGuildRouteActionKind;
  preferredCardIds?: string[];
  preferredEffectIds?: string[];
  preferredOptionIds?: string[];
  preferredTargetCardIds?: string[];
  scoreBonus: number;
  note: string;
}

function isProfile(profile: DeckAiProfile) {
  return profile.id === ADVENTURER_GUILD_PROFILE_ID;
}

function isAdventurerGuildState(player: PlayerState) {
  const cards = [
    ...player.deck,
    ...player.hand,
    ...player.unitZone,
    ...player.itemZone,
    ...player.erosionFront,
    ...player.erosionBack,
    ...player.grave,
    ...player.exile,
    ...player.playZone,
  ].filter((card): card is Card => !!card);
  const adventurerCards = cards.filter(card =>
    ADVENTURER_GUILD_FACTION_IDS.has(card.id) ||
    card.id === ADVENTURER_GUILD_CARD_IDS.association ||
    card.faction === '冒险家公会'
  ).length;
  return adventurerCards >= 4;
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

function isDefaultOpeningCard(card: Card) {
  return DEFAULT_OPENING_IDS.has(card.id);
}

function needsDefaultOpeningCardOnField(player: PlayerState, card: Card) {
  return isDefaultOpeningCard(card) && !hasFieldCard(player, card.id);
}

function hasFieldOrHandCard(player: PlayerState, cardId: string) {
  return hasCardId([...player.unitZone, ...player.itemZone, ...player.hand], cardId);
}

function effectUsedThisTurn(gameState: GameState, player: PlayerState, card: Card | undefined, effectId: string, options?: { limitNameType?: boolean; limitGlobal?: boolean }) {
  if (!card?.gamecardId) return false;
  const usageMap = gameState.effectUsage || {};
  const scope = options?.limitGlobal ? 'game' : `turn_${gameState.turnCount}`;
  const identity = options?.limitNameType
    ? `${player.uid}_name_${card.id}_${effectId}`
    : `${player.uid}_instance_${card.gamecardId}_${effectId}`;
  return (usageMap[`${scope}_${identity}`] || 0) > 0;
}

function getOpponent(gameState: GameState, player: PlayerState) {
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  return opponentUid ? gameState.players[opponentUid] : undefined;
}

function getTurnPlayerUid(gameState: GameState) {
  return gameState.playerIds[gameState.currentTurnPlayer] ||
    gameState.playerIds.find(uid => gameState.players[uid]?.isTurn);
}

function isDefensiveBattleWindow(gameState: GameState, player: PlayerState) {
  const turnPlayerUid = getTurnPlayerUid(gameState);
  const isDefender = !!turnPlayerUid && turnPlayerUid !== player.uid;
  const hasAttackers = (gameState.battleState?.attackers || []).length > 0;
  return gameState.phase === 'DEFENSE_DECLARATION' ||
    (isDefender && hasAttackers && ['BATTLE_FREE', 'COUNTERING', 'DAMAGE_CALCULATION'].includes(gameState.phase));
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

function strongestReadyOpponentDefenderPower(gameState: GameState, player: PlayerState) {
  return Math.max(0, ...opponentUnits(gameState, player)
    .filter(unit => !unit.isExhausted)
    .map(unit => unit.power || 0));
}

function canBeBlockedDead(gameState: GameState, player: PlayerState, card: Card) {
  return strongestReadyOpponentDefenderPower(gameState, player) >= (card.power || 0);
}

function strongestReadyOwnDefenderPower(player: PlayerState) {
  return Math.max(0, ...player.unitZone
    .filter((unit): unit is Card => !!unit && !unit.isExhausted)
    .map(unit => unit.power || 0));
}

function ownAlbertTargets(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const targetIds = new Set<string>([ids.batra, ids.kathy, ids.hammo, ids.amy, ids.wen]);
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

function keyCardPriority(card: Card) {
  return (
    (card.godMark ? 38 : 0) +
    Math.max(0, card.acValue || card.baseAcValue || 0) * 8 +
    Math.max(0, card.damage || card.baseDamage || 0) * 14 +
    Math.max(0, card.power || card.basePower || 0) / 120 +
    (isKeyCard(card) ? 22 : 0)
  );
}

function isAdventurerGuildFactionCard(card: Card) {
  return ADVENTURER_GUILD_FACTION_IDS.has(card.id);
}

function attackersHaveAnnihilation(attackingUnits: Card[]) {
  return attackingUnits.some(unit => !!unit.isAnnihilation || !!(unit as any).temporaryAnnihilation);
}

function incomingAttackDamage(attackingUnits: Card[]) {
  return attackingUnits.reduce((sum, unit) => sum + Math.max(0, unit.damage || 0), 0);
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

function albertDefenseTargetPriority(player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  switch (card.id) {
    case ids.kathy:
      return 4;
    case ids.hammo:
    case ids.amy:
      return 3.5 + (isHammoAmyMissingPairTarget(player, card) ? 1 : 0);
    case ids.wen:
      return 3 + (hasAssociation(player) ? 0 : 2);
    default:
      return 0;
  }
}

function albertTargetNotes(player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  switch (card.id) {
    case ids.batra:
      return hasAssociation(player)
        ? ['艾伯特拉巴特拉：主轴进攻点']
        : ['艾伯特拉巴特拉：缺协会降权'];
    case ids.hammo:
    case ids.amy:
      return hasAssociation(player) || isHammoAmyMissingPairTarget(player, card)
        ? ['艾伯特拉汉莫/艾咪：有协会或缺一补一']
        : ['艾伯特拉汉莫/艾咪：组合组件'];
    case ids.wen:
      return hasAssociation(player)
        ? ['艾伯特拉文：已有协会时中等优先']
        : ['艾伯特拉文：无协会时优先找协会'];
    default:
      return [];
  }
}

function albertDefenseTargetNotes(player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  switch (card.id) {
    case ids.kathy:
      return ['艾伯特防御拉凯茜：优先横置对手单位'];
    case ids.hammo:
    case ids.amy:
      return isHammoAmyMissingPairTarget(player, card)
        ? ['艾伯特防御拉汉莫/艾咪：缺一补一']
        : ['艾伯特防御拉汉莫/艾咪：组合组件'];
    case ids.wen:
      return hasAssociation(player)
        ? ['艾伯特防御拉文：已有协会时中等优先']
        : ['艾伯特防御拉文：无协会时找协会'];
    default:
      return albertTargetNotes(player, card);
  }
}

function bestAlbertTargetPriority(gameState: GameState, player: PlayerState) {
  return Math.max(0, ...ownAlbertTargets(player).map(card => albertTargetPriority(gameState, player, card)));
}

function bestAlbertTargetNotes(gameState: GameState, player: PlayerState) {
  const bestTarget = ownAlbertTargets(player)
    .map(card => ({
      card,
      priority: albertTargetPriority(gameState, player, card)
    }))
    .sort((a, b) => b.priority - a.priority)[0];
  return bestTarget && bestTarget.priority > 0 ? albertTargetNotes(player, bestTarget.card) : ['艾伯特：没有高价值拉取目标'];
}

function xiaotingFieldSwapPriority(player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (card.id === ids.batra) return 4;
  if (card.id === ids.amy) return 3.5 + (hasFieldCard(player, ids.hammo) ? 1.5 : 0);
  return 0;
}

function xiaotingFieldSwapNotes(player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (card.id === ids.batra) return ['小婷换下巴特拉：主轴最高优先'];
  if (card.id === ids.amy) {
    return hasFieldCard(player, ids.hammo)
      ? ['小婷换下艾咪：可配合汉莫拉出永续适用艾咪']
      : ['小婷换下艾咪：组合组件'];
  }
  return [];
}

function bestXiaotingFieldSwapPriority(player: PlayerState) {
  return Math.max(0, ...player.unitZone
    .filter((card): card is Card => !!card)
    .map(card => xiaotingFieldSwapPriority(player, card)));
}

function bestXiaotingFieldSwapNotes(player: PlayerState) {
  const bestTarget = player.unitZone
    .filter((card): card is Card => !!card)
    .map(card => ({
      card,
      priority: xiaotingFieldSwapPriority(player, card)
    }))
    .sort((a, b) => b.priority - a.priority)[0];
  return bestTarget && bestTarget.priority > 0 ? xiaotingFieldSwapNotes(player, bestTarget.card) : ['小婷：没有高价值换下目标'];
}

function bestSwapChainTargetNotes(gameState: GameState, player: PlayerState) {
  const bestTarget = player.erosionFront
    .filter((card): card is Card => !!card && card.displayState === 'FRONT_UPRIGHT')
    .map(card => ({
      card,
      priority: swapChainTargetPriority(gameState, player, card)
    }))
    .sort((a, b) => b.priority - a.priority)[0];
  return bestTarget && bestTarget.priority > 0 ? swapChainTargetNotes(gameState, player, bestTarget.card) : ['换位目标：没有高价值进场目标'];
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

function swapChainTargetNotes(gameState: GameState, player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (card.id === ids.sodo && hasHighCostOpponentUnit(gameState, player)) return ['换位目标：索德应对对手高COST单位'];
  if ((card.id === ids.hammo || card.id === ids.amy) && isHammoAmyMissingPairTarget(player, card)) return ['换位目标：汉莫/艾咪缺一补一'];
  if (card.id === ids.xiaoting && hasSwitchAdventurerOnField(player)) return ['换位目标：小婷配合已有换位冒险家'];
  if (card.id === ids.batra) return ['换位目标：巴特拉主轴进攻'];
  if (card.id === ids.kathy) return ['换位目标：凯茜控制对手单位'];
  if (card.id === ids.wen) return ['换位目标：文检索协会/汤药'];
  if (card.id === ids.freya) return ['换位目标：芙蕾雅补主轴'];
  if (card.id === ids.xiaoting) return ['换位目标：小婷后续展开'];
  if ((card.id === ids.hammo || card.id === ids.amy) && isHammoAmyMissingBoth(player)) return ['换位目标：汉莫/艾咪缺二时补组件'];
  return [];
}

function associationRecycleTargetPriority(gameState: GameState, player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const missingOnFieldBonus = hasFieldCard(player, card.id) ? 0 : 30;
  if (card.id === ids.hammo || card.id === ids.amy) return 90 + missingOnFieldBonus;
  if (card.id === ids.xiaoting && hasSwitchAdventurerOnField(player)) return 82 + missingOnFieldBonus;
  if (card.id === ids.batra) return 76 + missingOnFieldBonus;
  if (card.id === ids.kathy) return 70 + missingOnFieldBonus;
  if (card.id === ids.xiaoting) return 64 + missingOnFieldBonus;
  return card.faction === '冒险家公会' ? 20 + missingOnFieldBonus : 0;
}

function associationRecycleTargetNotes(gameState: GameState, player: PlayerState, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const missing = hasFieldCard(player, card.id) ? '' : '，场上没有';
  if (card.id === ids.hammo || card.id === ids.amy) return [`协会塞侵蚀区：汉莫/艾咪优先${missing}`];
  if (card.id === ids.xiaoting && hasSwitchAdventurerOnField(player)) return [`协会塞侵蚀区：已有换位冒险家时小婷优先${missing}`];
  if (card.id === ids.batra) return [`协会塞侵蚀区：巴特拉主轴${missing}`];
  if (card.id === ids.kathy) return [`协会塞侵蚀区：凯茜控制线${missing}`];
  if (card.id === ids.xiaoting) return [`协会塞侵蚀区：无换位时小婷后置${missing}`];
  return card.faction === '冒险家公会' ? [`协会塞侵蚀区：补冒险家公会资源${missing}`] : [];
}

function bestAssociationRecycleTargetPriority(gameState: GameState, player: PlayerState) {
  return Math.max(0, ...player.grave
    .filter((card): card is Card => !!card)
    .map(card => associationRecycleTargetPriority(gameState, player, card)));
}

function bestAssociationRecycleTargetNotes(gameState: GameState, player: PlayerState) {
  const bestTarget = player.grave
    .filter((card): card is Card => !!card)
    .map(card => ({
      card,
      priority: associationRecycleTargetPriority(gameState, player, card)
    }))
    .sort((a, b) => b.priority - a.priority)[0];
  return bestTarget && bestTarget.priority > 0 ? associationRecycleTargetNotes(gameState, player, bestTarget.card) : ['协会塞侵蚀区：墓地没有高价值目标'];
}

function aketiResetTargetPriority(card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (!card.isExhausted) return 0;
  if (card.id === ids.amy && hasAssociationBuff(card)) return 100;
  if (card.id === ids.batra) return 90;
  if (card.id === ids.kathy && hasAssociationBuff(card)) return 80;
  return 0;
}

function aketiResetTargetNotes(card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (card.id === ids.amy && hasAssociationBuff(card)) return ['阿克蒂重置：协会BUFF艾咪'];
  if (card.id === ids.batra) return ['阿克蒂重置：巴特拉'];
  if (card.id === ids.kathy && hasAssociationBuff(card)) return ['阿克蒂重置：协会BUFF凯茜'];
  return [];
}

function aketiDefenseTargetPriority(gameState: GameState, player: PlayerState, card: Card, isMine: boolean) {
  if (isMine) return aketiResetTargetPriority(card);
  if (card.godMark) return 100 + Math.max(0, card.acValue || card.baseAcValue || 0) * 14 + keyCardPriority(card) * 0.25;
  if (!card.isExhausted) return 80 + Math.max(0, card.power || 0) / 80 + Math.max(0, card.damage || 0) * 12;
  return keyCardPriority(card) * 0.2;
}

function aketiDefenseTargetNotes(card: Card, isMine: boolean) {
  if (isMine) return aketiResetTargetNotes(card);
  if (card.godMark) return ['阿克蒂防御目标：处理对手神蚀单位'];
  if (!card.isExhausted) return ['阿克蒂防御目标：横置对手竖置非神蚀高力量单位'];
  return ['阿克蒂防御目标：对手关键卡'];
}

function kathyDefenseTargetPriority(card: Card, isMine: boolean) {
  if (isMine || card.godMark || card.isExhausted) return 0;
  return 80 + Math.max(0, card.power || 0) / 80 + Math.max(0, card.damage || 0) * 12 + keyCardPriority(card) * 0.2;
}

function kathyDefenseTargetNotes(card: Card, isMine: boolean) {
  if (isMine) return ['凯茜诱发：不选择我方单位'];
  if (card.godMark) return ['凯茜诱发：不能选择神蚀单位'];
  if (card.isExhausted) return ['凯茜诱发：目标已横置，低优先'];
  return ['凯茜诱发：横置对手竖置非神蚀高力量单位'];
}

function swordFairyErosionTargetPriority(card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (card.id === ids.association) return 120;
  if (card.id === ids.albert) return 108;
  if (!isAdventurerGuildFactionCard(card)) return 88 + keyCardPriority(card) * 0.2;
  return 70 + keyCardPriority(card) * 0.1;
}

function swordFairyErosionTargetNotes(card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  if (card.id === ids.association) return ['剑仙子防御目标：优先处理协会'];
  if (card.id === ids.albert) return ['剑仙子防御目标：其次处理艾伯特'];
  if (!isAdventurerGuildFactionCard(card)) return ['剑仙子防御目标：优先回收非冒险家关键卡'];
  return ['剑仙子防御目标：回收冒险家卡'];
}

function meditationTargetPriority(card: Card, isMine: boolean) {
  if (isMine) return -40 + keyCardPriority(card) * 0.1;
  return 90 + keyCardPriority(card);
}

function meditationTargetNotes(card: Card, isMine: boolean) {
  if (isMine) return ['冥想目标：通常不锁自己单位'];
  return isKeyCard(card)
    ? ['冥想目标：锁对方关键卡']
    : ['冥想目标：横置并失能对方单位'];
}

function tenkoDestroyTargetPriority(card: Card, isMine: boolean) {
  if (isMine) return -70;
  return 82 + keyCardPriority(card);
}

function tenkoDestroyTargetNotes(card: Card, isMine: boolean) {
  if (isMine) return ['天狐指令目标：通常不破坏自己卡'];
  return isKeyCard(card)
    ? ['天狐指令目标：破坏对方关键卡']
    : ['天狐指令目标：破坏对方低费黄色卡'];
}

function hasOpponentKeyYellowLowNonGodCard(gameState: GameState, player: PlayerState) {
  const opponent = getOpponent(gameState, player);
  const opponentField = [
    ...opponentUnits(gameState, player),
    ...(opponent?.itemZone.filter((card): card is Card => !!card) || []),
  ];
  return opponentField.some(card =>
    card.color === 'YELLOW' &&
    !card.godMark &&
    (card.acValue || card.baseAcValue || 0) <= 3 &&
    isKeyCard(card)
  );
}

function opponentHasUnitPutEffectOnStack(gameState: GameState, player: PlayerState) {
  return (gameState.counterStack || []).some(item => {
    if (item.ownerUid === player.uid || item.type !== 'EFFECT' || item.isNegated) return false;
    const effect = typeof item.effectIndex === 'number' ? item.card?.effects?.[item.effectIndex] : undefined;
    const text = [
      item.card?.fullName,
      item.card?.id,
      effect?.id,
      effect?.description,
      effect?.content,
      effect?.targetSpec?.description,
      item.declaredModeId,
    ].filter(Boolean).join(' ');
    return /UNIT|FIELD|SUMMON|PUT|ENTER|PLAY_FROM|MOVE_FROM|CARD_EROSION_TO_FIELD|放置到战场|进入战场|单位/i.test(text);
  });
}

function deepSeaLockPriority(gameState: GameState, player: PlayerState) {
  if (opponentHasUnitPutEffectOnStack(gameState, player)) return 6;
  if (gameState.phase === 'COUNTERING') return 4.5;
  if (isDefensiveBattleWindow(gameState, player)) return 4;
  return 1;
}

function deepSeaLockNotes(gameState: GameState, player: PlayerState) {
  if (opponentHasUnitPutEffectOnStack(gameState, player)) return ['深海幻想效果1：对方效果召唤窗口，优先对抗'];
  if (gameState.phase === 'COUNTERING') return ['深海幻想效果1：对抗窗口预防对方效果登场'];
  if (isDefensiveBattleWindow(gameState, player)) return ['深海幻想效果1：防御窗口预防对方效果登场'];
  return ['深海幻想效果1：常规预防效果登场'];
}

function fieldCard(player: PlayerState, cardId: string) {
  return ownFieldCards(player).find(card => card.id === cardId);
}

function handCard(player: PlayerState, cardId: string) {
  return player.hand.find(card => card.id === cardId);
}

function erosionCard(player: PlayerState, cardId: string) {
  return player.erosionFront.find(card =>
    !!card &&
    card.id === cardId &&
    card.displayState === 'FRONT_UPRIGHT'
  );
}

function graveCard(player: PlayerState, cardId: string) {
  return player.grave.find(card => card?.id === cardId);
}

function isReadyFieldCard(player: PlayerState, cardId: string) {
  const card = fieldCard(player, cardId);
  return !!card && !card.isExhausted;
}

function canRouteAttack(gameState: GameState, player: PlayerState, cardId: string) {
  const card = fieldCard(player, cardId);
  if (!card || card.isExhausted || card.canAttack === false || (card.damage || 0) < 1) return false;
  if ((card as any).battleForbiddenByEffect) return false;
  if ((card as any).data?.cannotAttackThisTurn === gameState.turnCount) return false;
  if ((card as any).data?.cannotAttackOrDefendUntilTurn && (card as any).data.cannotAttackOrDefendUntilTurn >= gameState.turnCount) return false;
  return !!card.isrush || card.playedTurn !== gameState.turnCount;
}

function routeAttackLooksSafe(gameState: GameState, player: PlayerState, cardId: string) {
  const card = fieldCard(player, cardId);
  if (!card) return false;
  const opponent = getOpponent(gameState, player);
  const strongestReadyDefender = Math.max(0, ...(opponent?.unitZone || [])
    .filter((unit): unit is Card => !!unit && !unit.isExhausted)
    .map(unit => unit.power || 0));
  if (strongestReadyDefender <= 0) return true;
  if (strongestReadyDefender < (card.power || 0)) return true;
  const opponentErosion = opponent ? opponent.erosionFront.filter(Boolean).length + opponent.erosionBack.filter(Boolean).length : 0;
  const closingPressure = !!opponent && (
    opponent.deck.length <= Math.max(1, card.damage || 0) ||
    (!opponent.isGoddessMode && opponentErosion + Math.max(0, card.damage || 0) >= 10)
  );
  return closingPressure;
}

function optionUsed(gameState: GameState, player: PlayerState, option: 'a' | 'b' | 'c') {
  const association = fieldCard(player, ADVENTURER_GUILD_CARD_IDS.association);
  if (!association?.gamecardId) return true;
  return !!gameState.effectUsage?.[`turn_${gameState.turnCount}_304030075_${association.gamecardId}_option_${option}`];
}

function hasReadyOpponentNonGodUnit(gameState: GameState, player: PlayerState) {
  return opponentUnits(gameState, player).some(unit => !unit.godMark && !unit.isExhausted);
}

function chooseRouteX(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const order = [ids.wen, ids.freya, ids.kathy];
  return order
    .map(id => fieldCard(player, id) || handCard(player, id) || erosionCard(player, id))
    .find((card): card is Card => !!card && card.id !== ids.batra);
}

function chooseRouteInitialX(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const order = [ids.wen, ids.freya, ids.kathy];
  return order
    .map(id => fieldCard(player, id) || handCard(player, id))
    .find((card): card is Card => !!card && card.id !== ids.batra);
}

function routeAdvice(
  routeId: AdventurerGuildRouteId,
  stepKey: string,
  actionKind: AdventurerGuildRouteActionKind,
  note: string,
  extra: Partial<AdventurerGuildRouteAdvice> = {}
): AdventurerGuildRouteAdvice {
  return {
    routeId,
    stepKey,
    actionKind,
    scoreBonus: 95,
    note,
    ...extra,
  };
}

function routeOptionMatchesCurrentTrigger(gameState: GameState, player: PlayerState, query: EffectQuery, optionId: string, route: AdventurerGuildRouteAdvice) {
  if (optionId !== 'OPTION_A' || !route.preferredTargetCardIds?.length) return true;
  const enteringCard = query.context?.enteringCardId
    ? findCardInPlayerZones(player, query.context.enteringCardId) || findCardInPlayerZones(getOpponent(gameState, player), query.context.enteringCardId)
    : undefined;
  return !!enteringCard && route.preferredTargetCardIds.includes(enteringCard.id);
}

function buildAdventurerGuildRouteAdvice(
  gameState: GameState,
  player: PlayerState
): AdventurerGuildRouteAdvice | undefined {
  if (!player.isTurn || gameState.turnCount <= 1) return undefined;
  if (!['MAIN', 'BATTLE_DECLARATION', 'BATTLE_FREE', 'COUNTERING'].includes(gameState.phase)) return undefined;

  const ids = ADVENTURER_GUILD_CARD_IDS;
  const hasAlbert = hasFieldCard(player, ids.albert);
  const hasAssociationCard = hasFieldCard(player, ids.association);
  const hasXiaoting = hasFieldCard(player, ids.xiaoting);
  const hasHammo = hasFieldCard(player, ids.hammo);
  const hasAketi = hasFieldCard(player, ids.aketi);
  const albert = fieldCard(player, ids.albert);
  const xiaoting = fieldCard(player, ids.xiaoting);
  const batra = fieldCard(player, ids.batra);
  const kathy = fieldCard(player, ids.kathy);
  const xCard = chooseRouteX(player);
  const xId = xCard?.id;
  const kathyRouteStarted = !!(fieldCard(player, ids.kathy) || erosionCard(player, ids.kathy) || optionUsed(gameState, player, 'c'));
  const hasAmyRoutePiece = !!(fieldCard(player, ids.amy) || erosionCard(player, ids.amy));

  const routeAReady = hasAlbert && hasAssociationCard && hasXiaoting && hasHammo && hasAmyRoutePiece;
  if (routeAReady) {
    if (!kathyRouteStarted && canRouteAttack(gameState, player, ids.amy) && routeAttackLooksSafe(gameState, player, ids.amy)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_AMY_ATTACK', 'ATTACK', '路线A：艾咪先攻击', {
        preferredCardIds: [ids.amy],
        scoreBonus: 120,
      });
    }
    if (!kathyRouteStarted && canRouteAttack(gameState, player, ids.batra) && routeAttackLooksSafe(gameState, player, ids.batra)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_OPTIONAL_BATRA_ATTACK', 'ATTACK', '路线A：巴特拉可选先攻击', {
        preferredCardIds: [ids.batra],
        scoreBonus: 95,
      });
    }
    if (isReadyFieldCard(player, ids.albert) && !effectUsedThisTurn(gameState, player, albert, '104030415_cycle_adventurer_through_erosion') && (fieldCard(player, ids.batra) || graveCard(player, ids.batra))) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_ALBERT_PULL_BATRA', 'ACTIVATE_EFFECT', '路线A：艾伯特拉巴特拉', {
        preferredCardIds: [ids.albert],
        preferredEffectIds: ['104030415_cycle_adventurer_through_erosion'],
        preferredTargetCardIds: [ids.batra],
      });
    }
    if (!optionUsed(gameState, player, 'c') && graveCard(player, ids.kathy)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_ASSOCIATION_RECYCLE_KATHY', 'QUERY_OPTION', '路线A：协会塞换位凯茜进侵蚀', {
        preferredCardIds: [ids.association],
        preferredEffectIds: ['304030075_trigger'],
        preferredOptionIds: ['OPTION_C'],
        preferredTargetCardIds: [ids.kathy],
      });
    }
    if (isReadyFieldCard(player, ids.xiaoting) && !effectUsedThisTurn(gameState, player, xiaoting, 'dragon_wing_receptionist_activate', { limitNameType: true }) && fieldCard(player, ids.amy) && erosionCard(player, ids.kathy)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_XIAOTING_AMY_TO_KATHY', 'ACTIVATE_EFFECT', '路线A：小婷换下艾咪换上凯茜', {
        preferredCardIds: [ids.xiaoting],
        preferredEffectIds: ['dragon_wing_receptionist_activate'],
        preferredTargetCardIds: [ids.amy, ids.kathy],
        scoreBonus: 115,
      });
    }
    if (!optionUsed(gameState, player, 'b') && hasReadyOpponentNonGodUnit(gameState, player)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_ASSOCIATION_EXHAUST', 'QUERY_OPTION', '路线A：协会横置对手高价值单位', {
        preferredCardIds: [ids.association],
        preferredEffectIds: ['304030075_trigger'],
        preferredOptionIds: ['OPTION_B'],
      });
    }
    if (fieldCard(player, ids.kathy) && hasReadyOpponentNonGodUnit(gameState, player)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_KATHY_EXHAUST', 'QUERY_TARGET', '路线A：凯茜横置对手单位', {
        preferredCardIds: [ids.kathy],
        preferredEffectIds: ['104030459_entry_exhaust'],
      });
    }
    if (fieldCard(player, ids.batra) && !effectUsedThisTurn(gameState, player, batra, '104030453_swap', { limitNameType: true }) && erosionCard(player, ids.amy)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_BATRA_TO_AMY', 'ACTIVATE_EFFECT', '路线A：巴特拉换艾咪', {
        preferredCardIds: [ids.batra],
        preferredEffectIds: ['104030453_swap'],
        preferredTargetCardIds: [ids.amy],
      });
    }
    if (!optionUsed(gameState, player, 'a') && fieldCard(player, ids.amy)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_ASSOCIATION_BUFF_AMY', 'QUERY_OPTION', '路线A：协会给艾咪+BUFF', {
        preferredCardIds: [ids.association],
        preferredEffectIds: ['304030075_trigger'],
        preferredOptionIds: ['OPTION_A'],
        preferredTargetCardIds: [ids.amy],
        scoreBonus: 110,
      });
    }
    if (canRouteAttack(gameState, player, ids.amy) && routeAttackLooksSafe(gameState, player, ids.amy)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_BUFFED_AMY_ATTACK', 'ATTACK', '路线A：BUFF后艾咪攻击', {
        preferredCardIds: [ids.amy],
        scoreBonus: 125,
      });
    }
    if (fieldCard(player, ids.kathy) && !effectUsedThisTurn(gameState, player, kathy, '104030459_swap_activate', { limitNameType: true }) && erosionCard(player, ids.batra)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_KATHY_TO_BATRA', 'ACTIVATE_EFFECT', '路线A：凯茜换巴特拉', {
        preferredCardIds: [ids.kathy],
        preferredEffectIds: ['104030459_swap_activate'],
        preferredTargetCardIds: [ids.batra],
      });
    }
    if (hasAketi && fieldCard(player, ids.amy)?.isExhausted) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_AKETI_READY_AMY', 'QUERY_TARGET', '路线A：阿克蒂重置艾咪', {
        preferredCardIds: [ids.aketi],
        preferredEffectIds: ['aketi_rotation_trigger'],
        preferredTargetCardIds: [ids.amy],
      });
    }
    if (canRouteAttack(gameState, player, ids.batra) && routeAttackLooksSafe(gameState, player, ids.batra)) {
      return routeAdvice('ROUTE_A_AMY_KATHY_BATRA', 'A_FINAL_BATRA_ATTACK', 'ATTACK', '路线A：巴特拉攻击收尾', {
        preferredCardIds: [ids.batra],
        scoreBonus: 120,
      });
    }
  }

  const routeBProgressed = !!(
    fieldCard(player, ids.kathy) ||
    erosionCard(player, ids.kathy) ||
    erosionCard(player, ids.batra) ||
    (xId && erosionCard(player, xId)) ||
    optionUsed(gameState, player, 'a') ||
    optionUsed(gameState, player, 'c')
  );
  const routeBReady = hasAlbert && hasAssociationCard && hasXiaoting && (routeBProgressed ? !!xCard : !!chooseRouteInitialX(player));
  if (routeBReady) {
    if (!kathyRouteStarted && canRouteAttack(gameState, player, ids.batra) && routeAttackLooksSafe(gameState, player, ids.batra)) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_OPTIONAL_BATRA_ATTACK', 'ATTACK', '路线B：巴特拉先攻击', {
        preferredCardIds: [ids.batra],
        scoreBonus: 100,
      });
    }
    if (isReadyFieldCard(player, ids.albert) && !effectUsedThisTurn(gameState, player, albert, '104030415_cycle_adventurer_through_erosion') && (fieldCard(player, ids.batra) || graveCard(player, ids.batra))) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_ALBERT_PULL_BATRA', 'ACTIVATE_EFFECT', '路线B：艾伯特拉巴特拉', {
        preferredCardIds: [ids.albert],
        preferredEffectIds: ['104030415_cycle_adventurer_through_erosion'],
        preferredTargetCardIds: [ids.batra],
      });
    }
    if (!optionUsed(gameState, player, 'c') && graveCard(player, ids.kathy)) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_ASSOCIATION_RECYCLE_KATHY', 'QUERY_OPTION', '路线B：协会塞换位凯茜进侵蚀', {
        preferredCardIds: [ids.association],
        preferredEffectIds: ['304030075_trigger'],
        preferredOptionIds: ['OPTION_C'],
        preferredTargetCardIds: [ids.kathy],
      });
    }
    if (fieldCard(player, ids.batra) && !effectUsedThisTurn(gameState, player, batra, '104030453_swap', { limitNameType: true }) && erosionCard(player, ids.kathy)) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_BATRA_TO_KATHY', 'ACTIVATE_EFFECT', '路线B：巴特拉换凯茜', {
        preferredCardIds: [ids.batra],
        preferredEffectIds: ['104030453_swap'],
        preferredTargetCardIds: [ids.kathy],
      });
    }
    if (!optionUsed(gameState, player, 'a') && fieldCard(player, ids.kathy)) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_ASSOCIATION_BUFF_KATHY', 'QUERY_OPTION', '路线B：协会给凯茜+BUFF', {
        preferredCardIds: [ids.association],
        preferredEffectIds: ['304030075_trigger'],
        preferredOptionIds: ['OPTION_A'],
        preferredTargetCardIds: [ids.kathy],
        scoreBonus: 105,
      });
    }
    if (xId && handCard(player, xId)) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_PLAY_X', 'PLAY_CARD', '路线B：拍出换位冒险家X', {
        preferredCardIds: [xId],
        scoreBonus: 100,
      });
    }
    if (xId && fieldCard(player, xId) && erosionCard(player, ids.batra)) {
      const effectId = xId === ids.wen ? 'wen_swap_activate' : xId === ids.freya ? 'freya_ranger_activate' : '104030459_swap_activate';
      if (!effectUsedThisTurn(gameState, player, fieldCard(player, xId), effectId, { limitNameType: true })) {
        return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_X_TO_BATRA', 'ACTIVATE_EFFECT', '路线B：X换巴特拉', {
          preferredCardIds: [xId],
          preferredEffectIds: [effectId],
          preferredTargetCardIds: [ids.batra],
        });
      }
    }
    if (!optionUsed(gameState, player, 'b') && hasReadyOpponentNonGodUnit(gameState, player)) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_ASSOCIATION_EXHAUST', 'QUERY_OPTION', '路线B：协会横置对手单位', {
        preferredCardIds: [ids.association],
        preferredEffectIds: ['304030075_trigger'],
        preferredOptionIds: ['OPTION_B'],
      });
    }
    if (canRouteAttack(gameState, player, ids.batra) && routeAttackLooksSafe(gameState, player, ids.batra)) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_BATRA_ATTACK', 'ATTACK', '路线B：巴特拉攻击', {
        preferredCardIds: [ids.batra],
        scoreBonus: 120,
      });
    }
    if (xId && isReadyFieldCard(player, ids.xiaoting) && !effectUsedThisTurn(gameState, player, xiaoting, 'dragon_wing_receptionist_activate', { limitNameType: true }) && fieldCard(player, ids.batra) && erosionCard(player, xId)) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_XIAOTING_BATRA_TO_X', 'ACTIVATE_EFFECT', '路线B：小婷换下巴特拉换上X', {
        preferredCardIds: [ids.xiaoting],
        preferredEffectIds: ['dragon_wing_receptionist_activate'],
        preferredTargetCardIds: [ids.batra, xId],
      });
    }
    if (canRouteAttack(gameState, player, ids.kathy) && routeAttackLooksSafe(gameState, player, ids.kathy)) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_KATHY_ATTACK', 'ATTACK', '路线B：凯茜攻击', {
        preferredCardIds: [ids.kathy],
        scoreBonus: 110,
      });
    }
    if (fieldCard(player, ids.kathy) && !effectUsedThisTurn(gameState, player, kathy, '104030459_swap_activate', { limitNameType: true }) && erosionCard(player, ids.batra)) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_KATHY_TO_BATRA', 'ACTIVATE_EFFECT', '路线B：凯茜换巴特拉', {
        preferredCardIds: [ids.kathy],
        preferredEffectIds: ['104030459_swap_activate'],
        preferredTargetCardIds: [ids.batra],
      });
    }
    if (handCard(player, ids.foxMerchant) && hasAketi && fieldCard(player, ids.batra)?.isExhausted) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_PLAY_FOX_FOR_AKETI', 'PLAY_CARD', '路线B：拍狐族商人制造阿克蒂窗口', {
        preferredCardIds: [ids.foxMerchant],
        scoreBonus: 90,
      });
    }
    if (isReadyFieldCard(player, ids.foxMerchant) && hasAketi && fieldCard(player, ids.batra)?.isExhausted) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_TRIGGER_AKETI_WITH_FOX', 'ACTIVATE_EFFECT', '路线B：狐族商人制造阿克蒂重置窗口', {
        preferredCardIds: [ids.foxMerchant],
        preferredEffectIds: ['104020066_activate_2'],
        scoreBonus: 85,
      });
    }
    if (handCard(player, ids.scales) && hasAketi && fieldCard(player, ids.batra)?.isExhausted) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_PLAY_SCALES_FOR_AKETI', 'PLAY_CARD', '路线B：拍天秤制造阿克蒂窗口', {
        preferredCardIds: [ids.scales],
        scoreBonus: 90,
      });
    }
    if (isReadyFieldCard(player, ids.scales) && hasAketi && fieldCard(player, ids.batra)?.isExhausted) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_TRIGGER_AKETI_WITH_SCALES', 'ACTIVATE_EFFECT', '路线B：天秤制造阿克蒂重置窗口', {
        preferredCardIds: [ids.scales],
        preferredEffectIds: ['304020009_activate'],
        scoreBonus: 85,
      });
    }
    if (hasAketi && fieldCard(player, ids.batra)?.isExhausted) {
      return routeAdvice('ROUTE_B_BATRA_KATHY_X', 'B_AKETI_READY_BATRA', 'QUERY_TARGET', '路线B：阿克蒂重置巴特拉', {
        preferredCardIds: [ids.aketi],
        preferredEffectIds: ['aketi_rotation_trigger'],
        preferredTargetCardIds: [ids.batra],
      });
    }
  }
  return undefined;
}

export function getAdventurerGuildRouteAdvice(
  gameState: GameState,
  player: PlayerState,
  profile: DeckAiProfile,
  actionKind?: AdventurerGuildRouteActionKind
): AdventurerGuildRouteAdvice | undefined {
  if (!isProfile(profile)) return undefined;
  const advice = buildAdventurerGuildRouteAdvice(gameState, player);
  if (!actionKind || advice?.actionKind === actionKind) return advice;
  return undefined;
}

function getAdventurerGuildStateRouteAdvice(
  gameState: GameState,
  player: PlayerState,
  actionKind?: AdventurerGuildRouteActionKind
) {
  if (!isAdventurerGuildState(player)) return undefined;
  const advice = buildAdventurerGuildRouteAdvice(gameState, player);
  if (!actionKind || advice?.actionKind === actionKind) return advice;
  return undefined;
}

function routeMatchesAdvice(advice: AdventurerGuildRouteAdvice | undefined, actionKind: AdventurerGuildRouteActionKind, card?: Card, effectId?: string) {
  if (!advice || advice.actionKind !== actionKind) return false;
  if (card && advice.preferredCardIds?.length && !advice.preferredCardIds.includes(card.id)) return false;
  if (effectId && advice.preferredEffectIds?.length && !advice.preferredEffectIds.includes(effectId)) return false;
  return true;
}

function hasAketiResetTarget(player: PlayerState) {
  return ownFieldCards(player).some(card => aketiResetTargetPriority(card) > 0);
}

function bestAketiResetTargetNotes(player: PlayerState) {
  const bestTarget = ownFieldCards(player)
    .map(card => ({
      card,
      priority: aketiResetTargetPriority(card)
    }))
    .sort((a, b) => b.priority - a.priority)[0];
  return bestTarget && bestTarget.priority > 0 ? aketiResetTargetNotes(bestTarget.card) : ['阿克蒂：没有值得重置的目标'];
}

function foxMerchantSelfPriority(player: PlayerState) {
  return 2.5 + (hasCoreStarterInFieldOrHand(player) ? 0 : 1);
}

function foxMerchantSelfNotes(player: PlayerState) {
  return hasCoreStarterInFieldOrHand(player)
    ? ['狐族商人：给自己运营侵蚀区']
    : ['狐族商人：场上和手牌缺艾伯特/阿克蒂'];
}

function foxMerchantOpponentPriority(gameState: GameState, player: PlayerState) {
  return 1 + (damageMayOverflow(getOpponent(gameState, player)) ? 3 : 0);
}

function foxMerchantOpponentNotes(gameState: GameState, player: PlayerState) {
  return damageMayOverflow(getOpponent(gameState, player))
    ? ['狐族商人：对手伤害可能溢出']
    : ['狐族商人：低优先干扰对手'];
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

function scalesSelfNotes(player: PlayerState) {
  const notes = ['天秤：对自己补侵蚀区'];
  const hasAdventurerInErosion = ownErosionFrontCards(player).some(card => card.faction === '冒险家公会');
  const hasAdventurerInHand = player.hand.some(card => card.faction === '冒险家公会');
  if (!hasAdventurerInErosion && hasAdventurerInHand) notes.push('侵蚀区无冒险家且手牌有冒险家');
  if (!hasCoreStarterInFieldOrHand(player)) notes.push('场上和手牌缺艾伯特/阿克蒂');
  if (hasBothCoreStartersInFieldOrHand(player)) notes.push('已有艾伯特和阿克蒂，降低自补优先');
  return notes;
}

function scalesOpponentPriority(gameState: GameState, player: PlayerState) {
  return damageMayOverflow(getOpponent(gameState, player)) ? 3 : 0;
}

function scalesOpponentNotes(gameState: GameState, player: PlayerState) {
  return damageMayOverflow(getOpponent(gameState, player))
    ? ['天秤：对手伤害可能溢出']
    : ['天秤：对手目标低优先'];
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
  const searchTextCount = [...opponent.hand, ...opponent.deck, ...opponent.unitZone, ...opponent.itemZone, ...opponent.grave]
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

export function scoreAdventurerGuildDevelopmentPriority(
  gameState: GameState,
  player: PlayerState,
  card: Card,
  profile?: DeckAiProfile
): AdventurerGuildDevelopmentScore {
  if (profile && !isProfile(profile)) return { score: 0, notes: [] };
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const fieldCards = [...player.unitZone, ...player.itemZone];
  const handCards = player.hand;
  const hasAnySwitcher = countCardIds(fieldCards, SWITCH_ADVENTURER_IDS) > 0;
  const xiaotingOnField = hasFieldCard(player, ids.xiaoting);
  const canNewSwitcherSwapXiaoting = xiaotingOnField && SWITCH_ADVENTURER_IDS.has(card.id);
  const notes: string[] = [];
  let score = 0;
  let tier: AdventurerGuildDevelopmentScore['tier'];

  const add = (value: number, note: string) => {
    score += value;
    notes.push(`${note}${value >= 0 ? '+' : ''}${value.toFixed(1)}`);
  };

  if (needsDefaultOpeningCardOnField(player, card)) {
    add(isFirstTurn(gameState) ? 3.0 : 2.2, '榛樿璧锋墜鍥涗欢濂楋細浼樺厛鎷嶅嚭');
  }

  switch (card.id) {
    case ids.albert:
      tier = '核心启动';
      add(5.2, '核心启动：艾伯特');
      if (isFirstPlayerFirstTurn(gameState, player)) add(-1.1, '先攻第一回合降速');
      if (!hasFieldCard(player, ids.association)) add(0.6, '可找协会/主轴');
      break;
    case ids.association:
      tier = '核心启动';
      add(4.8, '核心启动：协会');
      if (isFirstPlayerFirstTurn(gameState, player)) add(-1.0, '先攻第一回合降速');
      if (hasEnterableErosionUnit(player)) add(0.7, '侵蚀区已有可入场单位');
      break;
    case ids.aketi:
      tier = '核心启动';
      add(4.4, '核心启动：阿克蒂');
      if (card.cardlocation === 'EROSION_FRONT' && card.displayState === 'FRONT_UPRIGHT') add(1.7, '正面侵蚀区翻出');
      else if (isInOwnErosion(player, card)) add(0.8, '已在侵蚀区');
      if (hasAketiResetTarget(player)) add(0.8, '场上有重置收益');
      break;
    case ids.xiaoting:
      tier = '主轴展开';
      add(3.8, '主轴展开：小婷');
      if (hasAnySwitcher) add(0.7, '场上已有换位组件');
      break;
    case ids.batra:
    case ids.kathy:
    case ids.freya:
    case ids.wen:
      tier = '主轴展开';
      add(3.2, '主轴展开：换位组件');
      if (hasAnySwitcher) add(-1.4, '已有换位组件，避免重复铺同类');
      if (canNewSwitcherSwapXiaoting) add(0.8, '可配合小婷换位');
      if (!hasAnySwitcher && !xiaotingOnField) add(0.4, '补第一张换位组件');
      break;
    case ids.hammo:
    case ids.amy: {
      const pairId = card.id === ids.hammo ? ids.amy : ids.hammo;
      tier = '组合组件';
      add(2.4, card.id === ids.hammo ? '组合组件：汉莫' : '组合组件：艾咪');
      if (hasFieldOrHandCard(player, pairId)) add(2.3, '汉莫艾咪缺一补一');
      else if (hasCardId(handCards, ids.hammo) && hasCardId(handCards, ids.amy)) add(1.6, '汉莫艾咪可同时形成组合');
      break;
    }
    case ids.foxMerchant:
      tier = '辅助运营';
      add(2.3, '辅助运营：狐族商人');
      if (isFirstTurn(gameState)) add(1.6, '第一回合运营加速');
      if (!hasCoreStarterInFieldOrHand(player)) add(0.7, '缺核心启动');
      break;
    case ids.scales:
      tier = '辅助运营';
      add(2.2, '辅助运营：天秤');
      if (!hasCoreStarterInFieldOrHand(player)) add(0.8, '寻找核心启动');
      break;
    case ids.elena:
      tier = '辅助运营';
      add(1.8, '辅助运营：艾琳娜');
      if (isFirstTurn(gameState)) add(1.2, '第一回合可先置');
      if (opponentHasManySearches(gameState, player)) add(2.0, '对手检索较多');
      break;
    case ids.swordFairy:
      tier = '辅助运营';
      add(1.8, '辅助运营：剑仙子');
      if (isFirstPlayerFirstTurn(gameState, player)) add(1.6, '先手第一回合防快攻');
      if (opponentLooksAggro(gameState, player)) add(2.2, '对手偏快攻');
      break;
    case ids.soup:
      tier = '辅助运营';
      add(1.7, '辅助运营：汤药');
      break;
    case ids.deepSeaFantasy:
      tier = '战术应对';
      if (opponentHasLowPowerKeyUnit(gameState, player)) add(4.0, '战术应对：处理低力量关键单位');
      break;
  }

  return { score: Math.max(0, score), tier, notes };
}

function scoreDevelopmentPriority(gameState: GameState, player: PlayerState, card: Card) {
  return scoreAdventurerGuildDevelopmentPriority(gameState, player, card).score;
}

export function scoreAdventurerGuildMulliganKeep(card: Card, profile: DeckAiProfile) {
  if (!isProfile(profile)) return 0;
  if (isDefaultOpeningCard(card)) return 80;
  return -8;
}

export function scoreAdventurerGuildPlayableCard(
  gameState: GameState,
  player: PlayerState,
  card: Card,
  profile: DeckAiProfile
) {
  if (!isProfile(profile)) return 0;
  const development = scoreAdventurerGuildDevelopmentPriority(gameState, player, card, profile);
  const route = getAdventurerGuildRouteAdvice(gameState, player, profile, 'PLAY_CARD');
  const routeBonus = routeMatchesAdvice(route, 'PLAY_CARD', card) ? route.scoreBonus : 0;
  if (development.score <= 0 && routeBonus <= 0) return 0;
  return development.score * 12 + routeBonus;
}

export function describeAdventurerGuildPlayableCard(
  gameState: GameState,
  player: PlayerState,
  card: Card,
  profile: DeckAiProfile
) {
  if (!isProfile(profile)) return { score: 0, notes: [] as string[] };
  const development = scoreAdventurerGuildDevelopmentPriority(gameState, player, card, profile);
  const route = getAdventurerGuildRouteAdvice(gameState, player, profile, 'PLAY_CARD');
  const routeBonus = routeMatchesAdvice(route, 'PLAY_CARD', card) ? route.scoreBonus : 0;
  const notes = [...development.notes];
  if (routeBonus > 0 && route) notes.unshift(route.note);
  return {
    score: development.score * 12 + routeBonus,
    notes,
  };
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
  const defensiveWindow = isDefensiveBattleWindow(gameState, player);
  const route = getAdventurerGuildRouteAdvice(gameState, player, profile, 'ACTIVATE_EFFECT');

  switch (effect.id) {
    case '104030415_cycle_adventurer_through_erosion':
      if (defensiveWindow) {
        const bestTarget = ownAlbertTargets(player)
          .map(target => ({ target, priority: albertDefenseTargetPriority(player, target) }))
          .sort((a, b) => b.priority - a.priority)[0];
        priority = Math.max(0, bestTarget?.priority || 0);
        notes.push(...(bestTarget?.priority > 0 ? albertDefenseTargetNotes(player, bestTarget.target) : ['艾伯特防御：没有高价值拉取目标']));
      } else {
        priority = bestAlbertTargetPriority(gameState, player);
        notes.push(...bestAlbertTargetNotes(gameState, player));
      }
      break;
    case '104010447_activate':
      priority = defensiveWindow ? 8 : 2.5;
      notes.push(defensiveWindow ? '剑仙子启效果：防御时必发，优先整理关键侵蚀卡' : '剑仙子启效果：整理侵蚀区');
      break;
    case '304030075_trigger':
      priority = 5;
      notes.push('协会：+BUFF基础优先最高');
      if (!hasEnterableErosionUnit(player)) {
        priority -= 1.5;
        notes.push('协会+BUFF：侵蚀区没有可进场单位，降权');
      }
      if (canPullContinuousAmy(player)) {
        priority -= 2.5;
        notes.push('协会+BUFF：可拉出永续适用艾咪，降低BUFF优先');
      }
      break;
    case 'dragon_wing_receptionist_activate':
      priority = bestXiaotingFieldSwapPriority(player);
      notes.push(...bestXiaotingFieldSwapNotes(player));
      break;
    case '104030453_swap':
    case '104030459_swap_activate':
    case 'freya_ranger_activate':
    case 'wen_swap_activate':
    case '104030452_swap':
    case '104030450_swap':
      priority = 4;
      notes.push(...bestSwapChainTargetNotes(gameState, player));
      break;
    case '104030459_entry_exhaust':
      priority = defensiveWindow ? 5 : 0;
      if (defensiveWindow) {
        notes.push('凯茜诱发：防御时必发，横置对手高力量单位');
      } else if (hasAssociationBuffUsed(gameState, player)) {
        priority = 4;
        notes.push('凯茜诱发：协会BUFF已使用，允许横置对手');
      } else if (canPullContinuousAmy(player)) {
        priority = 4;
        notes.push('凯茜诱发：可拉出永续适用艾咪');
      } else {
        notes.push('凯茜诱发：保留，等待协会BUFF或艾咪线');
      }
      break;
    case 'aketi_rotation_trigger':
      priority = defensiveWindow ? 5.5 : hasAketiResetTarget(player) ? 4 : 0;
      notes.push(defensiveWindow ? '阿克蒂诱发：防御时处理对手神蚀/高力量单位' : '阿克蒂诱发：重置高价值目标');
      break;
    case 'aketi_goddess_bounce':
      priority = defensiveWindow ? 5.5 : 3.5;
      notes.push(defensiveWindow ? '阿克蒂启效果：防御时回手对手关键单位' : '阿克蒂启效果：回手关键单位');
      break;
    case '104030306_enter_from_erosion':
      priority = 3 + (hasFieldCard(player, ids.amy) ? 2 : 0);
      notes.push(hasFieldCard(player, ids.amy) ? '汉莫启效果：有艾咪，组合成型' : '汉莫启效果：基础登场');
      break;
    case '104030307_enter_from_erosion':
      priority = 3 + (hasFieldCard(player, ids.hammo) ? 2 : 0);
      notes.push(hasFieldCard(player, ids.hammo) ? '艾咪启效果：有汉莫，组合成型' : '艾咪启效果：基础登场');
      break;
    case '104020066_activate_1':
      priority = getOpponent(gameState, player)?.erosionFront.some(card => !!card && card.displayState === 'FRONT_UPRIGHT')
        ? 3 + (opponentHasKeyErosionCard(gameState, player) ? 1 : 0)
        : 0;
      notes.push(opponentHasKeyErosionCard(gameState, player)
        ? '狐族商人效果1：对手侵蚀区有关键卡'
        : '狐族商人效果1：干扰对手侵蚀区');
      break;
    case '104020066_activate_2':
      {
        const selfPriority = foxMerchantSelfPriority(player);
        const opponentPriority = foxMerchantOpponentPriority(gameState, player);
        priority = Math.max(selfPriority, opponentPriority);
        notes.push(...(selfPriority >= opponentPriority
          ? foxMerchantSelfNotes(player)
          : foxMerchantOpponentNotes(gameState, player)));
      }
      break;
    case 'sodo_to_erosion':
      priority = 0;
      if (hasHighCostOpponentUnit(gameState, player)) {
        priority += 4;
        notes.push('索德启效果：对手有高COST单位');
      }
      if (!hasCoreStarterInFieldOrHand(player)) {
        priority += 5;
        notes.push('索德启效果：场上和手牌缺艾伯特/阿克蒂');
      }
      break;
    case 'sodo_entry_bounce':
      priority = 4;
      if (hasHighCostOpponentUnit(gameState, player)) {
        priority += 2;
        notes.push('索德诱发：回手对手高COST单位');
      } else {
        notes.push('索德诱发：必发回手威胁单位');
      }
      break;
    case 'wen_search_from_erosion':
      priority = 4;
      notes.push('文诱发：必发，按协会/汤药需求检索');
      break;
    case '304020009_activate':
      {
        const selfPriority = scalesSelfPriority(player);
        const opponentPriority = scalesOpponentPriority(gameState, player);
        priority = Math.max(selfPriority, opponentPriority);
        notes.push(...(selfPriority >= opponentPriority
          ? scalesSelfNotes(player)
          : scalesOpponentNotes(gameState, player)));
      }
      break;
    case '204000091_meditation':
      priority = defensiveWindow ? 4.8 : opponentUnits(gameState, player).some(isKeyCard) ? 3.2 : 1.8;
      notes.push(defensiveWindow ? '冥想：防御窗口优先锁对方关键卡' : '冥想：处理对方关键单位');
      break;
    case '204000092_tenko_order':
      priority = gameState.phase === 'COUNTERING' ? 5.5 : hasOpponentKeyYellowLowNonGodCard(gameState, player) ? 4 : 2.2;
      notes.push(gameState.phase === 'COUNTERING'
        ? '天狐指令：对抗窗口优先反击'
        : '天狐指令：优先破坏对方关键卡');
      break;
    case '204000115_deep_sea_fantasy':
      {
        const lockPriority = deepSeaLockPriority(gameState, player);
        if (lockPriority >= 4) {
          priority = lockPriority;
          notes.push(...deepSeaLockNotes(gameState, player));
          break;
        }
      }
      priority = opponentHasLowPowerKeyUnit(gameState, player) ? 4 : 0;
      notes.push(opponentHasLowPowerKeyUnit(gameState, player)
        ? '深海幻想效果2：对方关键卡力量低于2500'
        : '深海幻想效果2：等待低力量关键卡');
      break;
  }

  if (routeMatchesAdvice(route, 'ACTIVATE_EFFECT', card, effect.id)) {
    priority += route!.scoreBonus / 14;
    notes.push(route!.note);
  } else if (route && route.actionKind === 'ACTIVATE_EFFECT') {
    priority -= 2.5;
    notes.push(`连招路线等待：${route.note}`);
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
  return describeAdventurerGuildAttack(gameState, player, card, profile).score;
}

export function describeAdventurerGuildAttack(
  gameState: GameState,
  player: PlayerState,
  card: Card,
  profile: DeckAiProfile
): AdventurerGuildTacticalScore {
  if (!isProfile(profile)) return { score: 0, priority: 0, notes: [] };
  const ids = ADVENTURER_GUILD_CARD_IDS;
  let priority: number | undefined;
  const notes: string[] = [];
  switch (card.id) {
    case ids.wen:
    case ids.hammo:
    case ids.foxMerchant:
    case ids.elena:
      priority = 0;
      notes.push(`${card.specialName || card.fullName}：默认不做低价值攻击`);
      break;
    case ids.sodo:
      priority = (player.deck.length < 10 || (getOpponent(gameState, player)?.deck.length || 99) < 10) ? 5 : 0;
      notes.push(priority > 0 ? '索德攻击：任一方卡组少于10张，压卡组' : '索德攻击：默认不攻击');
      break;
    case ids.amy:
      priority = 3.5 + (hasFieldCard(player, ids.hammo) ? 1.5 : 0);
      notes.push(hasFieldCard(player, ids.hammo) ? '艾咪攻击：有汉莫，提高优先' : '艾咪攻击：基础进攻');
      break;
    case ids.batra:
    case ids.freya:
    case ids.kathy:
      priority = 5;
      notes.push(`${card.specialName || card.fullName}攻击：换位冒险家主攻`);
      break;
    case ids.albert:
      priority = 2.5;
      notes.push('艾伯特攻击：只在不会被挡死时进攻');
      break;
  }
  if (priority === undefined) return { score: 0, priority: 0, notes: [] };

  const blockedDead = canBeBlockedDead(gameState, player, card);
  const route = getAdventurerGuildRouteAdvice(gameState, player, profile, 'ATTACK');
  const onlySwitcher = SWITCH_ADVENTURER_IDS.has(card.id) && countCardIds(ownFieldCards(player), SWITCH_ADVENTURER_IDS) === 1;
  const switchEffectUnavailable = SWITCH_ADVENTURER_IDS.has(card.id) && !hasSwapTargetForSource(player, card);
  if (card.id === ids.albert && blockedDead) {
    priority = 0;
    notes.push('艾伯特攻击：会被可见防守单位挡死，禁止');
  }
  if (switchEffectUnavailable && onlySwitcher && blockedDead) {
    priority -= 1;
    notes.push('换位冒险家攻击：效果不可用、会被挡死且是唯一换位，降权');
  }
  if (priority <= 0) {
    return { score: NO_ATTACK_PRIORITY_PENALTY, priority, notes };
  }
  if (routeMatchesAdvice(route, 'ATTACK', card)) {
    priority += route!.scoreBonus / 12;
    notes.push(route!.note);
  } else if (route && route.actionKind === 'ATTACK') {
    priority -= 4;
    notes.push(`连招路线保留攻击顺序：${route.note}`);
  }
  return { score: priority * 12, priority, notes };
}

export function scoreAdventurerGuildDefense(
  gameState: GameState,
  defender: PlayerState,
  card: Card,
  attackingUnits: Card[],
  profile: DeckAiProfile
) {
  return describeAdventurerGuildDefense(gameState, defender, card, attackingUnits, profile).score;
}

export function describeAdventurerGuildDefense(
  _gameState: GameState,
  _defender: PlayerState,
  card: Card,
  attackingUnits: Card[],
  profile: DeckAiProfile
): AdventurerGuildTacticalScore {
  if (!isProfile(profile)) return { score: 0, priority: 0, notes: [] };
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const totalAttackerPower = attackingUnits.reduce((sum, unit) => sum + Math.max(0, unit.power || 0), 0);
  const damage = incomingAttackDamage(attackingUnits);
  const sacrifice = (card.power || 0) < totalAttackerPower;
  const annihilation = attackersHaveAnnihilation(attackingUnits);
  let priority = 0;
  const notes: string[] = [];

  if (card.id === ids.swordFairy && annihilation) {
    priority += 7;
    notes.push('剑仙子防歼灭');
  }

  if (card.id === ids.sodo || card.id === ids.elena) {
    if (sacrifice) {
      priority += 4 + Math.max(0, damage) * 1.3;
      notes.push(`${card.specialName || card.fullName}自杀挡高伤害`);
    } else {
      priority += 1.2;
      notes.push(`${card.specialName || card.fullName}可防御，但更偏向自杀挡伤害`);
    }
  }

  if (damage >= 3) {
    priority += 1.5;
    notes.push('本次攻击伤害较高');
  }

  if (annihilation && card.id !== ids.swordFairy) {
    priority += 0.8;
    notes.push('对方歼灭攻击，需要考虑防御');
  }

  if (priority <= 0) return { score: 0, priority: 0, notes: [] };
  return { score: priority * 14, priority, notes };
}

function adventurerTargetPriority(gameState: GameState, player: PlayerState, card: Card) {
  return swapChainTargetPriority(gameState, player, card);
}

function hasRouteACore(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  return hasFieldCard(player, ids.albert) &&
    hasFieldCard(player, ids.association) &&
    hasFieldCard(player, ids.xiaoting) &&
    hasFieldCard(player, ids.hammo) &&
    !!(fieldCard(player, ids.amy) || erosionCard(player, ids.amy));
}

function hasRouteBCore(player: PlayerState) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  return hasFieldCard(player, ids.albert) &&
    hasFieldCard(player, ids.association) &&
    hasFieldCard(player, ids.xiaoting) &&
    !!chooseRouteX(player);
}

function scoreRouteQueryTarget(gameState: GameState, player: PlayerState, query: EffectQuery, card: Card) {
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const effectId = String(query.context?.effectId || '');
  const step = String(query.context?.step || '');
  const sourceCard = query.context?.sourceCardId
    ? findCardInPlayerZones(player, query.context.sourceCardId) || findCardInPlayerZones(getOpponent(gameState, player), query.context.sourceCardId)
    : undefined;
  const selectedFieldUnit = query.context?.fieldUnitId
    ? findCardInPlayerZones(player, query.context.fieldUnitId)
    : undefined;
  const routeA = hasRouteACore(player);
  const routeB = hasRouteBCore(player);
  const xId = chooseRouteX(player)?.id;
  const hint = (score: number, note: string) => ({ score, note });

  if (effectId === '104030415_cycle_adventurer_through_erosion' && card.id === ids.batra && (routeA || routeB)) {
    return hint(150, routeA ? '路线A：艾伯特拉巴特拉' : '路线B：艾伯特拉巴特拉');
  }

  if (effectId === '304030075_trigger' && step === 'FINALIZE_RECYCLE' && card.id === ids.kathy && (routeA || routeB)) {
    return hint(150, routeA ? '路线A：协会塞换位凯茜进侵蚀' : '路线B：协会塞换位凯茜进侵蚀');
  }

  if (sourceCard?.id === ids.xiaoting && (step === 'FIELD_UNIT' || step === '1')) {
    if (routeA && card.id === ids.amy) return hint(148, '路线A：小婷换下艾咪');
    if (routeB && card.id === ids.batra) return hint(148, '路线B：小婷换下巴特拉');
  }

  if (sourceCard?.id === ids.xiaoting && (step === 'EROSION_UNIT' || step === '2')) {
    if ((routeA || selectedFieldUnit?.id === ids.amy) && card.id === ids.kathy) {
      return hint(148, '路线A：小婷换上凯茜');
    }
    if ((routeB || selectedFieldUnit?.id === ids.batra) && xId && card.id === xId) {
      return hint(148, '路线B：小婷换上X');
    }
  }

  if (step === 'SELECT_SWAP_TARGET' || step === '2') {
    if (sourceCard?.id === ids.batra) {
      if (routeA && card.id === ids.amy) return hint(146, '路线A：巴特拉换艾咪');
      if (routeB && card.id === ids.kathy) return hint(146, '路线B：巴特拉换凯茜');
    }
    if (sourceCard?.id === ids.kathy && card.id === ids.batra && (routeA || routeB)) {
      return hint(146, routeA ? '路线A：凯茜换巴特拉' : '路线B：凯茜换巴特拉');
    }
    if (sourceCard && sourceCard.id !== ids.batra && SWITCH_ADVENTURER_IDS.has(sourceCard.id) && routeB && card.id === ids.batra) {
      return hint(146, '路线B：X换巴特拉');
    }
  }

  if (effectId === 'aketi_rotation_trigger') {
    if (routeA && card.id === ids.amy && card.isExhausted) return hint(144, '路线A：阿克蒂重置艾咪');
    if (routeB && card.id === ids.batra && card.isExhausted) return hint(144, '路线B：阿克蒂重置巴特拉');
  }

  return undefined;
}

function scoreRouteAssociationOption(gameState: GameState, player: PlayerState, query: EffectQuery, optionId: string) {
  if (query.context?.effectId !== '304030075_trigger' || query.context?.step !== 'RESOLVE_OPTION') return undefined;
  const ids = ADVENTURER_GUILD_CARD_IDS;
  const enteringCard = query.context?.enteringCardId
    ? findCardInPlayerZones(player, query.context.enteringCardId) || findCardInPlayerZones(getOpponent(gameState, player), query.context.enteringCardId)
    : undefined;
  const routeA = hasRouteACore(player);
  const routeB = hasRouteBCore(player);
  const hint = (score: number, note: string) => ({ score, note });

  if (
    optionId === 'OPTION_C' &&
    !optionUsed(gameState, player, 'c') &&
    enteringCard?.id === ids.batra &&
    graveCard(player, ids.kathy) &&
    (routeA || routeB)
  ) {
    return hint(150, routeA ? '路线A：协会塞换位凯茜进侵蚀' : '路线B：协会塞换位凯茜进侵蚀');
  }

  if (
    optionId === 'OPTION_A' &&
    !optionUsed(gameState, player, 'a') &&
    routeA &&
    enteringCard?.id === ids.amy
  ) {
    return hint(148, '路线A：协会给艾咪+BUFF');
  }

  if (
    optionId === 'OPTION_A' &&
    !optionUsed(gameState, player, 'a') &&
    routeB &&
    enteringCard?.id === ids.kathy
  ) {
    return hint(148, '路线B：协会给凯茜+BUFF');
  }

  if (
    optionId === 'OPTION_B' &&
    !optionUsed(gameState, player, 'b') &&
    hasReadyOpponentNonGodUnit(gameState, player) &&
    (routeA || routeB)
  ) {
    return hint(132, routeA ? '路线A：协会横置对手高价值单位' : '路线B：协会横置对手单位');
  }

  return undefined;
}

function scoreAssociationChoice(gameState: GameState, player: PlayerState, query: EffectQuery, option: any) {
  const optionId = String(option.id || '');
  const sourceCard = query.context?.sourceCardId
    ? findCardInPlayerZones(player, query.context.sourceCardId)
    : undefined;
  const routeOptionHint = scoreRouteAssociationOption(gameState, player, query, optionId);
  if (routeOptionHint) return routeOptionHint.score;
  const route = getAdventurerGuildStateRouteAdvice(gameState, player, 'QUERY_OPTION');

  if (
    query.context?.effectId === '304030075_trigger' &&
    query.context?.step === 'RESOLVE_OPTION' &&
    route?.preferredOptionIds?.includes(optionId)
  ) {
    if (!routeOptionMatchesCurrentTrigger(gameState, player, query, optionId, route)) return undefined;
    return route.scoreBonus;
  }

  if (sourceCard?.id === ADVENTURER_GUILD_CARD_IDS.deepSeaFantasy && query.callbackKey === 'DECLARE_EFFECT_TARGET_MODE') {
    if (optionId === 'BLUE_ATTACK_UNITS') return opponentHasLowPowerKeyUnit(gameState, player) ? 40 : 0;
    return deepSeaLockPriority(gameState, player) * 10;
  }

  if (
    (sourceCard?.id === ADVENTURER_GUILD_CARD_IDS.tenkoOrder || query.context?.effectId === '204000092_tenko_order') &&
    (query.callbackKey === 'DECLARE_EFFECT_TARGET_MODE' || query.context?.step === 'MODE')
  ) {
    if (optionId === 'COUNTER') return gameState.phase === 'COUNTERING' ? 60 : 20;
    if (optionId === 'DESTROY') return hasOpponentKeyYellowLowNonGodCard(gameState, player) ? 52 : 32;
    return undefined;
  }

  if (query.context?.effectId !== '304030075_trigger' || query.context?.step !== 'RESOLVE_OPTION') return undefined;
  if (optionId === 'OPTION_A') {
    let priority = 5;
    if (!hasEnterableErosionUnit(player)) priority -= 1.5;
    if (canPullContinuousAmy(player)) priority -= 2.5;
    return priority * 10;
  }
  if (optionId === 'OPTION_C') {
    const bestRecyclePriority = bestAssociationRecycleTargetPriority(gameState, player);
    return bestRecyclePriority > 0 ? 40 + Math.min(10, bestRecyclePriority / 18) : 0;
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
  const defensiveWindow = isDefensiveBattleWindow(gameState, player);
  const route = getAdventurerGuildStateRouteAdvice(gameState, player, 'QUERY_TARGET') ||
    getAdventurerGuildStateRouteAdvice(gameState, player, 'ACTIVATE_EFFECT') ||
    getAdventurerGuildStateRouteAdvice(gameState, player, 'QUERY_OPTION');
  const routeTargetIndex = route?.preferredTargetCardIds?.indexOf(card.id) ?? -1;
  const routeTargetBonus = routeTargetIndex >= 0 ? route.scoreBonus + (route.preferredTargetCardIds!.length - routeTargetIndex) * 12 : 0;
  const routeTargetHint = scoreRouteQueryTarget(gameState, player, query, card);
  const routeQueryTargetBonus = routeTargetHint?.score || 0;

  if (effectId === '104030415_cycle_adventurer_through_erosion') {
    if (routeQueryTargetBonus > 0) return routeQueryTargetBonus;
    if (routeTargetBonus > 0) return routeTargetBonus;
    if (defensiveWindow) {
      return albertDefenseTargetPriority(player, card) * 20 + (card.cardlocation === 'GRAVE' ? 8 : 0);
    }
    return albertTargetPriority(gameState, player, card) * 20 + (card.cardlocation === 'GRAVE' ? 8 : 0);
  }

  if (effectId === '304030075_trigger' && step === 'FINALIZE_EXHAUST') {
    if (routeQueryTargetBonus > 0) return routeQueryTargetBonus;
    if (routeTargetBonus > 0) return routeTargetBonus;
    const highPowerBonus = (card.power || 0) >= 2500 ? 25 : 0;
    const suicideBonus = !card.godMark && (card.damage || 0) > 0 && strongestReadyOwnDefenderPower(player) >= (card.power || 0) ? 35 : 0;
    return !option.isMine ? 90 + highPowerBonus + suicideBonus + (card.power || 0) / 100 + (card.damage || 0) * 12 : -80;
  }

  if (effectId === '304030075_trigger' && step === 'FINALIZE_RECYCLE') {
    if (routeQueryTargetBonus > 0) return routeQueryTargetBonus;
    if (routeTargetBonus > 0) return routeTargetBonus;
    return associationRecycleTargetPriority(gameState, player, card);
  }

  if (effectId === 'aketi_rotation_trigger') {
    if (routeQueryTargetBonus > 0) return routeQueryTargetBonus;
    if (routeTargetBonus > 0) return routeTargetBonus;
    if (defensiveWindow) {
      const defensePriority = aketiDefenseTargetPriority(gameState, player, card, !!option.isMine);
      return defensePriority > 0 ? defensePriority : undefined;
    }
    if (!option.isMine) return undefined;
    const resetPriority = aketiResetTargetPriority(card);
    return resetPriority > 0 ? resetPriority : undefined;
  }

  if (effectId === 'aketi_goddess_bounce') {
    if (routeTargetBonus > 0) return routeTargetBonus;
    if (option.isMine) return -80;
    return 82 + keyCardPriority(card);
  }

  if (effectId === '104010447_activate') {
    return swordFairyErosionTargetPriority(card);
  }

  if (effectId === '204000091_meditation') {
    return meditationTargetPriority(card, !!option.isMine);
  }

  if (effectId === '204000092_tenko_order' && step === 'DESTROY_TARGET') {
    return tenkoDestroyTargetPriority(card, !!option.isMine);
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
      if (routeQueryTargetBonus > 0) return routeQueryTargetBonus;
      if (routeTargetBonus > 0) return routeTargetBonus;
      if (defensiveWindow) {
        const defensePriority = kathyDefenseTargetPriority(card, !!option.isMine);
        return defensePriority > 0 ? defensePriority : undefined;
      }
      return option.isMine ? -80 : 80 + (card.power || 0) / 100 + (card.damage || 0) * 10;
    }
  }

  if (step === 'FIELD_UNIT' || query.description?.includes('置入侵蚀区')) {
    if (routeQueryTargetBonus > 0) return routeQueryTargetBonus;
    if (routeTargetBonus > 0) return routeTargetBonus;
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
    if (routeQueryTargetBonus > 0) return routeQueryTargetBonus;
    if (routeTargetBonus > 0) return routeTargetBonus;
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

export function describeAdventurerGuildQueryOption(
  gameState: GameState,
  playerUid: string,
  query: EffectQuery,
  option: any,
  profile: DeckAiProfile
): AdventurerGuildTacticalScore | undefined {
  if (!isProfile(profile)) return undefined;
  const player = gameState.players[playerUid];
  if (!player) return undefined;

  if (query.type === 'SELECT_CHOICE') {
    const score = scoreAssociationChoice(gameState, player, query, option);
    if (score === undefined) return undefined;
    const optionId = String(option.id || '');
    const effectId = String(query.context?.effectId || '');
    const route = getAdventurerGuildRouteAdvice(gameState, player, profile, 'QUERY_OPTION');
    const routeOptionHint = scoreRouteAssociationOption(gameState, player, query, optionId);
    if (routeOptionHint) {
      return { score, priority: score / 10, notes: [routeOptionHint.note] };
    }
    if (
      effectId === '304030075_trigger' &&
      route?.preferredOptionIds?.includes(optionId) &&
      routeOptionMatchesCurrentTrigger(gameState, player, query, optionId, route)
    ) {
      return { score, priority: score / 10, notes: [route.note] };
    }
    if (effectId === '304030075_trigger') {
      if (optionId === 'OPTION_A') return { score, priority: score / 10, notes: ['协会选项：+BUFF'] };
      if (optionId === 'OPTION_B') return { score, priority: score / 10, notes: ['协会选项：横置对手非神蚀单位'] };
      if (optionId === 'OPTION_C') return { score, priority: score / 10, notes: bestAssociationRecycleTargetNotes(gameState, player) };
    }
    if (effectId === '204000092_tenko_order') {
      if (optionId === 'COUNTER') return { score, priority: score / 10, notes: ['天狐指令：对抗窗口优先反击'] };
      if (optionId === 'DESTROY') return { score, priority: score / 10, notes: ['天狐指令：破坏对方关键卡'] };
    }
    if (query.callbackKey === 'DECLARE_EFFECT_TARGET_MODE') {
      if (optionId !== 'BLUE_ATTACK_UNITS') {
        return { score, priority: score / 10, notes: deepSeaLockNotes(gameState, player) };
      }
      if (optionId === 'BLUE_ATTACK_UNITS') {
        return {
          score,
          priority: score / 10,
          notes: [opponentHasLowPowerKeyUnit(gameState, player) ? '深海幻想效果2：低力量关键卡窗口' : '深海幻想效果2：暂无低力量关键卡']
        };
      }
      return { score, priority: score / 10, notes: ['深海幻想效果1：防对手效果登场'] };
    }
    return { score, priority: score / 10, notes: ['冒险者公会选项评分'] };
  }

  const playerScore = scorePlayerChoice(gameState, player, query, option);
  if (playerScore !== undefined) {
    const optionId = option.card?.id || option.card?.gamecardId || option.id;
    const isSelf = optionId === 'PLAYER_SELF';
    const effectId = String(query.context?.effectId || '');
    let notes = ['冒险者公会玩家目标'];
    if (effectId === '104020066_activate_1') notes = ['狐族商人效果1：对对手侵蚀区'];
    if (effectId === '104020066_activate_2') notes = isSelf ? foxMerchantSelfNotes(player) : foxMerchantOpponentNotes(gameState, player);
    if (effectId === '304020009_activate') notes = isSelf ? scalesSelfNotes(player) : scalesOpponentNotes(gameState, player);
    return { score: playerScore, priority: playerScore / 10, notes };
  }

  if (option.card) {
    const score = scoreAdventurerGuildCardSelection(gameState, player, query, option);
    if (score === undefined) return undefined;
    const card = option.card as Card;
    const effectId = String(query.context?.effectId || '');
    const step = String(query.context?.step || '');
    const defensiveWindow = isDefensiveBattleWindow(gameState, player);
    const sourceCard = query.context?.sourceCardId
      ? findCardInPlayerZones(player, query.context.sourceCardId) || findCardInPlayerZones(getOpponent(gameState, player), query.context.sourceCardId)
      : undefined;
    const route = getAdventurerGuildRouteAdvice(gameState, player, profile, 'QUERY_TARGET') ||
      getAdventurerGuildRouteAdvice(gameState, player, profile, 'ACTIVATE_EFFECT') ||
      getAdventurerGuildRouteAdvice(gameState, player, profile, 'QUERY_OPTION');
    const routeTargetHint = scoreRouteQueryTarget(gameState, player, query, card);
    let notes: string[] = [];
    if (routeTargetHint) {
      notes = [routeTargetHint.note];
    } else if (route?.preferredTargetCardIds?.includes(card.id)) {
      notes = [route.note];
    } else if ((effectId === '104030459_entry_exhaust' || step === 'SELECT_TARGET') && defensiveWindow && sourceCard?.id === ADVENTURER_GUILD_CARD_IDS.kathy) {
      notes = kathyDefenseTargetNotes(card, !!option.isMine);
    } else if (effectId === '104030415_cycle_adventurer_through_erosion') {
      notes = defensiveWindow ? albertDefenseTargetNotes(player, card) : albertTargetNotes(player, card);
    }
    else if (effectId === '304030075_trigger' && step === 'FINALIZE_EXHAUST') {
      notes = ['协会横置：选择对手高力量/高伤害单位'];
      if ((card.power || 0) >= 2500) notes.push('力量2500以上');
      if (!card.godMark && (card.damage || 0) > 0 && strongestReadyOwnDefenderPower(player) >= (card.power || 0)) notes.push('对手可能自杀进攻');
    } else if (effectId === '304030075_trigger' && step === 'FINALIZE_RECYCLE') notes = associationRecycleTargetNotes(gameState, player, card);
    else if (effectId === 'aketi_rotation_trigger') {
      notes = defensiveWindow
        ? aketiDefenseTargetNotes(card, !!option.isMine)
        : aketiResetTargetNotes(card);
    } else if (effectId === 'aketi_goddess_bounce') notes = ['阿克蒂防御目标：回手对方关键卡'];
    else if (effectId === '104010447_activate') notes = swordFairyErosionTargetNotes(card);
    else if (effectId === '204000091_meditation') notes = meditationTargetNotes(card, !!option.isMine);
    else if (effectId === '204000092_tenko_order' && step === 'DESTROY_TARGET') notes = tenkoDestroyTargetNotes(card, !!option.isMine);
    else if (effectId === 'wen_search_from_erosion') {
      const ids = ADVENTURER_GUILD_CARD_IDS;
      if (card.id === ids.association) notes = ['文检索：拿协会'];
      else if (card.id === ids.soup) notes = ['文检索：已有协会时拿汤药'];
      else notes = ['文检索：冒险者公会道具'];
    } else if (effectId === 'sodo_entry_bounce' || step === 'BOUNCE_TARGET') notes = ['索德诱发：回手对手高价值单位'];
    else if (effectId === '104030459_entry_exhaust' || step === 'SELECT_TARGET') notes = ['凯茜诱发：横置对手单位'];
    else if (step === 'FIELD_UNIT') notes = xiaotingFieldSwapNotes(player, card);
    else if (step === 'EROSION_UNIT' || step === 'SELECT_SWAP_TARGET' || step === '2') notes = swapChainTargetNotes(gameState, player, card);
    else if (effectId === '104020066_activate_1' && card.cardlocation === 'EROSION_FRONT') notes = [option.isMine ? '狐族商人：整理自己侵蚀区' : '狐族商人：干扰对手关键侵蚀卡'];
    return { score, priority: score / 10, notes: notes.length > 0 ? notes : ['冒险者公会目标评分'] };
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
      const routeTarget = getAdventurerGuildStateRouteAdvice(gameState, player, 'QUERY_TARGET');
      if (routeTarget?.preferredEffectIds?.includes(effectId)) return ['YES'];
      if (isDefensiveBattleWindow(gameState, player)) return ['YES'];
      return hasAketiResetTarget(player) ? ['YES'] : ['NO'];
    }
    if (effectId === '104030459_entry_exhaust') {
      const sourceCard = query.context?.sourceCardId
        ? findCardInPlayerZones(player, query.context.sourceCardId)
        : undefined;
      const routeTarget = getAdventurerGuildStateRouteAdvice(gameState, player, 'QUERY_TARGET');
      if (
        routeTarget?.preferredEffectIds?.includes(effectId) ||
        (
          sourceCard?.id === ADVENTURER_GUILD_CARD_IDS.kathy &&
          hasRouteACore(player) &&
          hasReadyOpponentNonGodUnit(gameState, player)
        )
      ) {
        return ['YES'];
      }
      if (isDefensiveBattleWindow(gameState, player)) return ['YES'];
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
