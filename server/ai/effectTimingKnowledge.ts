import { Card, CardEffect, GamePhase, GameState, PlayerState } from '../../src/types/game';

export type EffectTimingTag =
  | 'engine'
  | 'draw'
  | 'search'
  | 'resource'
  | 'summon'
  | 'revive'
  | 'removal'
  | 'tempo'
  | 'combat'
  | 'buff'
  | 'protection'
  | 'counter'
  | 'damage'
  | 'finisher'
  | 'combo'
  | 'reset'
  | 'setup'
  | 'risk';

export interface EffectTimingProfile {
  effectId: string;
  cardId: string;
  cardName: string;
  tags: EffectTimingTag[];
  phaseBias: Partial<Record<GamePhase, number>>;
  preferredPhases: GamePhase[];
  avoidPhases: GamePhase[];
  reasons: string[];
}

export interface EffectTimingScore {
  score: number;
  tags: EffectTimingTag[];
  preferredPhases: GamePhase[];
  notes: string[];
}

const ORDERED_PHASES: GamePhase[] = [
  'START',
  'DRAW',
  'EROSION',
  'MAIN',
  'BATTLE_DECLARATION',
  'DEFENSE_DECLARATION',
  'BATTLE_FREE',
  'DAMAGE_CALCULATION',
  'BATTLE_END',
  'COUNTERING',
  'END',
];

const MANUAL_EFFECT_TIMING_OVERRIDES: Record<string, {
  tags?: EffectTimingTag[];
  phaseBias?: Partial<Record<GamePhase, number>>;
  reasons?: string[];
}> = {
  '101000159_protect': {
    tags: ['protection'],
    phaseBias: { BATTLE_FREE: 7, COUNTERING: 7, MAIN: -5 },
    reasons: ['white temple protection should answer a real battle/chain threat'],
  },
  '101100096_alliance_protect': {
    tags: ['protection', 'combat'],
    phaseBias: { BATTLE_FREE: 8, COUNTERING: 6, MAIN: -6 },
    reasons: ['smile alliance protection is a battle window payoff'],
  },
  '101100096_reset_after_attack': {
    tags: ['combat', 'resource'],
    phaseBias: { DAMAGE_CALCULATION: 6, BATTLE_FREE: 5, MAIN: -6 },
    reasons: ['smile reset is valuable after committing attacks'],
  },
  '101130439_reset_hall': {
    tags: ['resource', 'setup'],
    phaseBias: { MAIN: 7, BATTLE_FREE: -6, COUNTERING: -8 },
    reasons: ['hall reset is a main-phase sequencing tool'],
  },
  '101130440_reset_boost': {
    tags: ['resource', 'combat', 'buff'],
    phaseBias: { BATTLE_DECLARATION: 5, BATTLE_FREE: 6, DAMAGE_CALCULATION: 5, MAIN: -2 },
    reasons: ['magic spear reset boost should convert an attack/reset turn, not idle setup'],
  },
  '101130458_reset_silence': {
    tags: ['tempo', 'resource'],
    phaseBias: { MAIN: 5, BATTLE_DECLARATION: 4, BATTLE_FREE: 3, COUNTERING: 2 },
    reasons: ['hero sword reset/silence should answer a meaningful unit or push a pressure turn'],
  },
  '101140152_silence_god': {
    tags: ['tempo', 'removal'],
    phaseBias: { MAIN: 5, BATTLE_DECLARATION: 3, COUNTERING: 3 },
    reasons: ['silence should be saved for a meaningful god-mark threat'],
  },
  '201000059_prevent_destroy': {
    tags: ['protection', 'combat', 'counter'],
    phaseBias: { BATTLE_FREE: 9, COUNTERING: 9, MAIN: -9 },
    reasons: ['prevent-destroy story is held for battle or chain protection'],
  },
  '201100037_eclipse': {
    tags: ['removal', 'combo', 'finisher'],
    phaseBias: { BATTLE_FREE: 12, MAIN: -10, COUNTERING: -8 },
    reasons: ['eclipse is best used in the protected smile alliance battle window'],
  },
  'gensou_swallow_counter': {
    tags: ['counter', 'protection', 'removal'],
    phaseBias: { COUNTERING: 13, BATTLE_FREE: 4, MAIN: -14 },
    reasons: ['fantasy swallow is a counter effect and should wait for a chain window'],
  },
  '204000145_counter_silence': {
    tags: ['counter', 'tempo'],
    phaseBias: { COUNTERING: 13, BATTLE_FREE: 4, MAIN: -14 },
    reasons: ['counter silence is reserved for opposing effects or battle interaction'],
  },
  '105110112_activate': {
    tags: ['draw', 'damage', 'removal'],
    phaseBias: { MAIN: 5, BATTLE_FREE: -5 },
    reasons: ['element instructor mode choice is a main-phase value/removal decision'],
  },
  '105120167_activate': {
    tags: ['engine', 'resource', 'summon'],
    phaseBias: { MAIN: 8, BATTLE_FREE: -8, COUNTERING: -9 },
    reasons: ['great alchemist activation is a main-phase engine conversion'],
  },
  '105120168_activate': {
    tags: ['engine', 'resource'],
    phaseBias: { MAIN: 7, BATTLE_FREE: -7, COUNTERING: -9 },
    reasons: ['alchemy knight activation should be sequenced in main phase'],
  },
  '205110042_activate': {
    tags: ['resource', 'setup'],
    phaseBias: { MAIN: 7, BATTLE_FREE: -8, COUNTERING: -9 },
    reasons: ['re-prepare is setup and should not interrupt battle math'],
  },
  '305000018_replace_damage': {
    tags: ['protection', 'counter'],
    phaseBias: { COUNTERING: 10, BATTLE_FREE: 9, MAIN: -10 },
    reasons: ['damage replacement barrier is held for incoming damage windows'],
  },
  '305110028_revive': {
    tags: ['revive', 'summon', 'setup'],
    phaseBias: { MAIN: 9, BATTLE_FREE: -9, COUNTERING: -10 },
    reasons: ['memory doll revive is main-phase board development'],
  },
  '305110029_activate': {
    tags: ['removal', 'damage'],
    phaseBias: { MAIN: 2, BATTLE_DECLARATION: 4, DEFENSE_DECLARATION: 5, BATTLE_FREE: 4, DAMAGE_CALCULATION: 3 },
    reasons: ['auto turret should fire into an attacker, defender, or clear combat target'],
  },
  '305120030_activate': {
    tags: ['engine', 'resource'],
    phaseBias: { MAIN: 9, BATTLE_FREE: -9, COUNTERING: -10 },
    reasons: ['immortal alchemy cauldron is a main-phase engine activation'],
  },
  'aketi_play_from_erosion': {
    tags: ['resource', 'summon', 'setup'],
    phaseBias: { MAIN: 8, BATTLE_FREE: -7, COUNTERING: -8 },
    reasons: ['blue erosion play-from-zone effect is a main-phase development line'],
  },
  '104030453_swap': {
    tags: ['engine', 'tempo'],
    phaseBias: { MAIN: 6, BATTLE_FREE: -5 },
    reasons: ['blue swap engine should set tempo before attacks'],
  },
  'wen_swap_activate': {
    tags: ['engine', 'resource'],
    phaseBias: { MAIN: 6, BATTLE_FREE: -5 },
    reasons: ['blue support swap is a main-phase setup effect'],
  },
  '104030459_swap_activate': {
    tags: ['engine', 'tempo'],
    phaseBias: { MAIN: 7, BATTLE_FREE: -6, COUNTERING: -8 },
    reasons: ['treasure hunter swap is main-phase tempo setup'],
  },
  '304020009_activate': {
    tags: ['engine', 'resource'],
    phaseBias: { MAIN: 7, BATTLE_FREE: -8, COUNTERING: -9 },
    reasons: ['trade scale value effect belongs in main sequencing'],
  },
  '204020024_activate': {
    tags: ['tempo', 'removal'],
    phaseBias: { MAIN: 4, BATTLE_DECLARATION: 4, BATTLE_FREE: 5, COUNTERING: 2 },
    reasons: ['Aketi inducement should tap or bounce an opposing tactical target, not own board filler'],
  },
  '104020066_activate_1': {
    tags: ['engine', 'resource'],
    phaseBias: { MAIN: 6, BATTLE_FREE: -5 },
    reasons: ['merchant value effect belongs in main sequencing'],
  },
  '102050091_battle_save': {
    tags: ['protection', 'combat'],
    phaseBias: { BATTLE_FREE: 9, COUNTERING: 6, MAIN: -9 },
    reasons: ['Dikai battle save protects an actual battle commitment'],
  },
  '102050427_cannot_defend': {
    tags: ['tempo', 'finisher'],
    phaseBias: { MAIN: 5, BATTLE_DECLARATION: 6, BATTLE_FREE: 4 },
    reasons: ['cannot-defend effect is strongest when converting pressure into lethal damage'],
  },
  '102050432_reset_attack_unit': {
    tags: ['reset', 'combat', 'finisher'],
    phaseBias: { BATTLE_DECLARATION: -8, BATTLE_FREE: 9, COUNTERING: 8, DAMAGE_CALCULATION: 4, MAIN: 5 },
    reasons: ['reset attack unit should be used after Dikai is exhausted by an attack or a real combat commitment'],
  },
  '102050087_destroy': {
    tags: ['removal', 'tempo'],
    phaseBias: { MAIN: 6, BATTLE_DECLARATION: 3, BATTLE_FREE: 3 },
    reasons: ['ambush destroy should clear a relevant opposing unit'],
  },
  '102000146_exile_destroy': {
    tags: ['removal', 'tempo'],
    phaseBias: { MAIN: 4, DEFENSE_DECLARATION: 5, BATTLE_FREE: 4, COUNTERING: 3 },
    reasons: ['wandering shadow trades itself only for a real opposing non-godmark threat'],
  },
  '202000035_destroy': {
    tags: ['removal'],
    phaseBias: { MAIN: 6, BATTLE_DECLARATION: 2, BATTLE_FREE: 2 },
    reasons: ['beast subjugation is removal and needs a meaningful target'],
  },
  '202000131_duel': {
    tags: ['removal', 'risk'],
    phaseBias: { MAIN: 3, BATTLE_FREE: -8, COUNTERING: -10 },
    reasons: ['single duel is a risky board reset and should be planned before attacks'],
  },
  '202050034_destroy_god': {
    tags: ['removal', 'tempo'],
    phaseBias: { MAIN: 7, BATTLE_DECLARATION: 4, BATTLE_FREE: 3 },
    reasons: ['fragment hunt is saved for god-mark or high-value threats'],
  },
  '103080184_totem_grant': {
    tags: ['engine', 'resource', 'setup'],
    phaseBias: { MAIN: 8, BATTLE_FREE: -8, COUNTERING: -9 },
    reasons: ['totem grant is a main-phase recursion setup effect'],
  },
  '103080184_granted_totem_revive': {
    tags: ['revive', 'summon'],
    phaseBias: { MAIN: 7, BATTLE_FREE: -4 },
    reasons: ['granted totem revive is board rebuilding, usually before combat'],
  },
  '103080211_rebirth': {
    tags: ['revive', 'summon'],
    phaseBias: { MAIN: 9, BATTLE_FREE: -8, COUNTERING: -9 },
    reasons: ['wood rebirth should rebuild board in main phase'],
  },
  '103080212_plan': {
    tags: ['engine', 'search', 'setup'],
    phaseBias: { MAIN: 8, BATTLE_FREE: -8, COUNTERING: -9 },
    reasons: ['totem planner searches/setup in main phase'],
  },
  '103080258_boost_return': {
    tags: ['combat', 'buff', 'resource'],
    phaseBias: { BATTLE_FREE: 7, DAMAGE_CALCULATION: 5, MAIN: -3 },
    reasons: ['totem stun boost/return is a battle value effect'],
  },
  '103090180_exhaust_boost': {
    tags: ['combat', 'buff', 'finisher', 'risk'],
    phaseBias: { MAIN: -4, BATTLE_DECLARATION: 5, BATTLE_FREE: 8, DAMAGE_CALCULATION: 5 },
    reasons: ['multi-exhaust boost should spend attackers only for a meaningful combat payoff'],
  },
  '203000051_destroy_except_highest': {
    tags: ['removal', 'risk'],
    phaseBias: { MAIN: 5, BATTLE_FREE: -3, COUNTERING: -8 },
    reasons: ['survival story is board reset and should be checked before combat'],
  },
  '203000075_choice': {
    tags: ['summon', 'revive', 'resource'],
    phaseBias: { MAIN: 8, BATTLE_FREE: -8, COUNTERING: -9 },
    reasons: ['earth spirit descent is main-phase board setup'],
  },
  '203000076_spirit_boost': {
    tags: ['combat', 'buff', 'finisher'],
    phaseBias: { MAIN: -5, BATTLE_DECLARATION: 5, BATTLE_FREE: 8, DAMAGE_CALCULATION: 5 },
    reasons: ['sky spirit descent should convert a combat or lethal window'],
  },
  '203000126_ritual': {
    tags: ['revive', 'summon', 'setup'],
    phaseBias: { MAIN: 9, BATTLE_FREE: -9, COUNTERING: -10 },
    reasons: ['great shaman ritual is main-phase recursion setup'],
  },
  '203000129_trample': {
    tags: ['combat', 'finisher'],
    phaseBias: { BATTLE_FREE: 9, BATTLE_DECLARATION: 5, DAMAGE_CALCULATION: 5, MAIN: -7 },
    reasons: ['overlord trample is a combat finisher, not main setup'],
  },
  '203080083_prepare': {
    tags: ['search', 'resource', 'setup'],
    phaseBias: { MAIN: 9, BATTLE_FREE: -9, COUNTERING: -10 },
    reasons: ['descent preparation is main-phase setup/search'],
  },
};

const hasAny = (text: string, patterns: RegExp[]) => patterns.some(pattern => pattern.test(text));

function addTag(tags: Set<EffectTimingTag>, tag: EffectTimingTag, reasons: string[], reason: string) {
  tags.add(tag);
  reasons.push(reason);
}

function addPhase(bias: Partial<Record<GamePhase, number>>, phase: GamePhase, amount: number) {
  bias[phase] = (bias[phase] || 0) + amount;
}

function effectSearchText(card: Card, effect: CardEffect) {
  return [
    card.id,
    card.uniqueId,
    card.fullName,
    card.specialName,
    card.faction,
    effect.id,
    effect.type,
    effect.content,
    effect.description,
    effect.triggerEvent,
    effect.targetSpec?.title,
    effect.targetSpec?.description,
    effect.targetSpec?.modeTitle,
    effect.targetSpec?.modeDescription,
    ...(effect.targetSpec?.modeOptions || []).flatMap(mode => [
      mode.id,
      mode.label,
      mode.description,
      mode.modeDescription,
    ]),
    ...(effect.targetSpec?.targetGroups || []).flatMap(group => [
      group.title,
      group.description,
      group.controller,
      group.step,
    ]),
    ...((effect.atomicEffects || []) as any[]).flatMap(atomic => [
      atomic.type,
      atomic.destinationZone,
      atomic.sourceZone,
      atomic.value,
      atomic.targetFilter?.type,
      atomic.targetFilter?.controller,
      atomic.params?.phase,
    ]),
  ]
    .filter(value => value !== undefined && value !== null)
    .join(' ');
}

function sortedPreferredPhases(phaseBias: Partial<Record<GamePhase, number>>, positive = true) {
  return ORDERED_PHASES
    .filter(phase => positive ? (phaseBias[phase] || 0) > 0 : (phaseBias[phase] || 0) < 0)
    .sort((a, b) => positive
      ? (phaseBias[b] || 0) - (phaseBias[a] || 0)
      : (phaseBias[a] || 0) - (phaseBias[b] || 0));
}

function applyManualTimingOverride(
  effect: CardEffect,
  tags: Set<EffectTimingTag>,
  phaseBias: Partial<Record<GamePhase, number>>,
  reasons: string[]
) {
  const override = effect.id ? MANUAL_EFFECT_TIMING_OVERRIDES[effect.id] : undefined;
  if (!override) return;
  override.tags?.forEach(tag => tags.add(tag));
  for (const [phase, amount] of Object.entries(override.phaseBias || {})) {
    addPhase(phaseBias, phase as GamePhase, Number(amount));
  }
  reasons.push(...(override.reasons || []));
}

export function inferEffectTimingProfile(card: Card, effect: CardEffect): EffectTimingProfile {
  const text = effectSearchText(card, effect);
  const upper = text.toUpperCase();
  const tags = new Set<EffectTimingTag>();
  const reasons: string[] = [];
  const phaseBias: Partial<Record<GamePhase, number>> = {};

  if (effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED') {
    addPhase(phaseBias, 'MAIN', 2);
  }

  if (hasAny(upper, [/DRAW_CARD|DRAW|鎶絴鎶搢/])) {
    addTag(tags, 'draw', reasons, 'draw/value effect');
    addTag(tags, 'setup', reasons, 'hand setup');
    addPhase(phaseBias, 'MAIN', 5);
    addPhase(phaseBias, 'START', 1);
    addPhase(phaseBias, 'BATTLE_FREE', -7);
    addPhase(phaseBias, 'COUNTERING', -10);
  }

  if (hasAny(upper, [/SEARCH|DECK.*HAND|DECK_TO_HAND|妫€绱鎼滅储|鐗屽簱|鍗＄粍/])) {
    addTag(tags, 'search', reasons, 'deck selection');
    addTag(tags, 'setup', reasons, 'combo/setup search');
    addPhase(phaseBias, 'MAIN', 6);
    addPhase(phaseBias, 'BATTLE_FREE', -8);
    addPhase(phaseBias, 'COUNTERING', -10);
  }

  if (hasAny(upper, [/RESOURCE|ACCESS|READY|RESET|COST|PAY|EROSION|TURN_EROSION|SET_CAN_RESET|璐圭敤|鏀粯|閲嶇疆|绔栫疆|渚佃殌/])) {
    addTag(tags, 'resource', reasons, 'resource conversion');
    addTag(tags, 'setup', reasons, 'resource setup');
    addPhase(phaseBias, 'MAIN', 4);
    addPhase(phaseBias, 'BATTLE_FREE', -4);
  }

  if (hasAny(upper, [/SUMMON|PLAY_FROM|TO_FIELD|ENTER.*FIELD|MOVE.*UNIT|鍙敜|鐧诲満|鎴樺満/])) {
    addTag(tags, 'summon', reasons, 'board development');
    addTag(tags, 'setup', reasons, 'board setup');
    addPhase(phaseBias, 'MAIN', 5);
    addPhase(phaseBias, 'BATTLE_DECLARATION', 1);
    addPhase(phaseBias, 'BATTLE_FREE', -5);
  }

  if (hasAny(upper, [/REVIVE|REBIRTH|REANIMATE|GRAVE.*FIELD|GRAVE.*UNIT|澶嶇敓|澧撳湴.*鎴樺満/])) {
    addTag(tags, 'revive', reasons, 'graveyard development');
    addTag(tags, 'summon', reasons, 'revive to board');
    addPhase(phaseBias, 'MAIN', 5);
    addPhase(phaseBias, 'BATTLE_FREE', -4);
  }

  if (hasAny(upper, [/DESTROY|BANISH|EXILE|REMOVE|RETURN.*HAND|BOUNCE|BOTTOM|DESTROY_CARD|BANISH_CARD|鐮村潖|闄ゅ|鍥炴墜|杩斿洖/])) {
    addTag(tags, 'removal', reasons, 'answer opposing board');
    addPhase(phaseBias, 'MAIN', 4);
    addPhase(phaseBias, 'BATTLE_DECLARATION', 2);
    addPhase(phaseBias, 'BATTLE_FREE', 4);
    addPhase(phaseBias, 'COUNTERING', 1);
  }

  if (hasAny(upper, [/EXHAUST|CANNOT ATTACK|CANNOT DEFEND|SKIP|SILENCE|NEGATE|妯疆|涓嶈兘鏀诲嚮|涓嶈兘闃插尽|璺宠繃|灏佸嵃/])) {
    addTag(tags, 'tempo', reasons, 'tempo/disruption');
    addPhase(phaseBias, 'MAIN', 3);
    addPhase(phaseBias, 'BATTLE_DECLARATION', 3);
    addPhase(phaseBias, 'BATTLE_FREE', 3);
    addPhase(phaseBias, 'COUNTERING', 4);
  }

  if (hasAny(upper, [/ADD_POWER|ADD_DAMAGE|POWER|DAMAGE\+|\+\d|RUSH|COMBAT|BATTLE|浼ゅ\+|鎴樻枟|閫熸敾/])) {
    addTag(tags, 'combat', reasons, 'combat math');
    addTag(tags, 'buff', reasons, 'stat/combat buff');
    addPhase(phaseBias, 'MAIN', -2);
    addPhase(phaseBias, 'BATTLE_DECLARATION', 3);
    addPhase(phaseBias, 'BATTLE_FREE', 7);
    addPhase(phaseBias, 'DAMAGE_CALCULATION', 5);
  }

  if (hasAny(upper, [/IMMUNE|PREVENT|PROTECT|INDESTRUCTIBLE|NEGATE_EFFECT|COUNTER_EFFECT|涓嶄細琚牬鍧|闃叉|淇濇姢|鍏嶇柅|鎶垫秷/])) {
    addTag(tags, 'protection', reasons, 'protection/counter window');
    addPhase(phaseBias, 'BATTLE_FREE', 6);
    addPhase(phaseBias, 'COUNTERING', 7);
    addPhase(phaseBias, 'MAIN', -2);
  }

  if (hasAny(upper, [/COUNTER|NEGATE|INTERRUPT|ON_STACK|CHAIN|瀵规姉|杩為攣|鏃犳晥/])) {
    addTag(tags, 'counter', reasons, 'chain interaction');
    addPhase(phaseBias, 'COUNTERING', 9);
    addPhase(phaseBias, 'BATTLE_FREE', 3);
    addPhase(phaseBias, 'MAIN', -8);
  }

  if (hasAny(upper, [/DEAL_EFFECT_DAMAGE|DIRECT|DAMAGE|浼ゅ|鐩存帴/])) {
    addTag(tags, 'damage', reasons, 'direct damage');
    addPhase(phaseBias, 'MAIN', 3);
    addPhase(phaseBias, 'BATTLE_FREE', 2);
  }

  if (hasAny(upper, [/FINISH|WIN THE GAME|LETHAL|缁堢粨|鑳滃埄|杩藉姞.*浼ゅ/])) {
    addTag(tags, 'finisher', reasons, 'closing effect');
    addPhase(phaseBias, 'MAIN', 3);
    addPhase(phaseBias, 'BATTLE_FREE', 6);
  }

  if (hasAny(upper, [/DISCARD|LOSE|SELF.*DAMAGE|SACRIFICE|寮冪疆|涓㈠純|鑷.*浼ゅ|鐗虹壊/])) {
    addTag(tags, 'risk', reasons, 'has self-cost/risk');
  }

  if (tags.size === 0) {
    addTag(tags, 'engine', reasons, 'generic active effect');
    addPhase(phaseBias, 'MAIN', 1);
  }

  applyManualTimingOverride(effect, tags, phaseBias, reasons);

  return {
    effectId: effect.id || `${card.id}_effect`,
    cardId: card.id,
    cardName: card.fullName,
    tags: [...tags],
    phaseBias,
    preferredPhases: sortedPreferredPhases(phaseBias, true),
    avoidPhases: sortedPreferredPhases(phaseBias, false),
    reasons: [...new Set(reasons)],
  };
}

function countErosion(player: PlayerState) {
  return player.erosionFront.filter(Boolean).length + player.erosionBack.filter(Boolean).length;
}

export function scoreEffectTimingWindow(
  gameState: GameState,
  player: PlayerState,
  card: Card,
  effect: CardEffect,
  context: { targetCount?: number; hasTargetSpec?: boolean } = {}
): EffectTimingScore {
  const timing = inferEffectTimingProfile(card, effect);
  const tags = new Set(timing.tags);
  const phase = gameState.phase;
  const opponentUid = gameState.playerIds.find(uid => uid !== player.uid);
  const opponent = opponentUid ? gameState.players[opponentUid] : undefined;
  const opponentUnits = opponent?.unitZone.filter(Boolean).length || 0;
  const battleAttackers = gameState.battleState?.attackers?.filter(Boolean).length || 0;
  const isOwnTurn = gameState.playerIds[gameState.currentTurnPlayer] === player.uid;
  const ownReadyAttackers = player.unitZone.filter(unit =>
    unit &&
    !unit.isExhausted &&
    unit.canAttack !== false &&
    (unit.damage || 0) > 0
  ).length;
  const opponentErosion = opponent ? countErosion(opponent) : 0;
  const opponentDeck = opponent?.deck.length || 0;
  const ownErosion = countErosion(player);
  const targetCount = context.targetCount || 0;
  const hasTarget = !context.hasTargetSpec || targetCount > 0;
  const hasBattleContext =
    battleAttackers > 0 ||
    phase === 'BATTLE_DECLARATION' ||
    phase === 'DEFENSE_DECLARATION' ||
    phase === 'DAMAGE_CALCULATION';
  const closeByErosion = opponentErosion >= 7;
  const closeByDeck = opponentDeck <= Math.max(4, ownReadyAttackers + 2);
  const closeToWin = !!opponent && (closeByErosion || closeByDeck);
  const notes: string[] = [];

  let score = timing.phaseBias[phase] || 0;

  if (phase === 'MAIN' && isOwnTurn && tags.has('setup')) {
    score += 2.5;
  }

  if (phase === 'BATTLE_FREE') {
    if (battleAttackers > 0 && (
      tags.has('combat') ||
      tags.has('buff') ||
      tags.has('protection') ||
      tags.has('removal') ||
      tags.has('tempo') ||
      tags.has('finisher')
    )) {
      score += 4 + Math.min(4, battleAttackers);
    }
    if (battleAttackers > 0 && tags.has('setup') && !tags.has('combat') && !tags.has('removal') && !tags.has('protection')) {
      score -= 8 + battleAttackers * 2;
    }
    if (
      battleAttackers === 0 &&
      (tags.has('combat') || tags.has('buff') || tags.has('protection') || tags.has('counter') || tags.has('finisher')) &&
      !tags.has('combo')
    ) {
      score -= 10;
    }
  }

  if (phase === 'COUNTERING') {
    if (tags.has('counter') || tags.has('protection') || tags.has('tempo')) score += 6;
    if (tags.has('setup') && !tags.has('counter')) score -= 10;
  }

  if (tags.has('counter')) {
    const validCounterWindow = phase === 'COUNTERING' || (phase === 'BATTLE_FREE' && battleAttackers > 0);
    if (validCounterWindow) score += 5;
    else score -= 12;
  }

  if (tags.has('protection')) {
    const validProtectionWindow = phase === 'COUNTERING' || hasBattleContext;
    if (validProtectionWindow) score += 3;
    else score -= 8;
  }

  if (
    (tags.has('draw') || tags.has('search') || tags.has('engine') || tags.has('resource') || tags.has('summon') || tags.has('revive')) &&
    (phase === 'BATTLE_FREE' || phase === 'COUNTERING') &&
    !tags.has('combo') &&
    !tags.has('counter') &&
    !tags.has('combat') &&
    !tags.has('protection')
  ) {
    score -= phase === 'COUNTERING' ? 14 : 8;
  }

  if ((tags.has('draw') || tags.has('search')) && phase === 'MAIN') {
    if (player.hand.length <= 3) score += 2.5;
    if (player.deck.length <= 8 || ownErosion >= 8) score -= 6;
  }

  if ((tags.has('removal') || tags.has('tempo')) && context.hasTargetSpec) {
    score += hasTarget ? Math.min(5, targetCount * 1.5) : -12;
  }

  if ((tags.has('removal') || tags.has('tempo')) && opponentUnits === 0) {
    score -= hasTarget ? 4 : 8;
  }

  if ((tags.has('combat') || tags.has('buff')) && phase === 'MAIN' && ownReadyAttackers === 0) {
    score -= 4;
  }

  if (
    (tags.has('combat') || tags.has('buff') || tags.has('finisher')) &&
    !hasBattleContext &&
    !closeToWin &&
    !tags.has('setup') &&
    !tags.has('combo')
  ) {
    score -= 8;
  }

  if ((tags.has('damage') || tags.has('finisher') || tags.has('combat')) && opponent) {
    if (closeToWin) score += 5;
  }

  if ((tags.has('tempo') || tags.has('removal')) && closeToWin && hasTarget) {
    score += 4;
  }

  if (tags.has('risk') && phase !== 'MAIN' && !tags.has('finisher')) {
    score -= 2.5;
  }

  if (Math.abs(score) >= 1) {
    notes.push(`timing ${phase} ${score >= 0 ? '+' : ''}${score.toFixed(1)}`);
  }
  if (timing.preferredPhases.length > 0 && !timing.preferredPhases.includes(phase) && score < 0) {
    notes.push(`prefers ${timing.preferredPhases.slice(0, 2).join('/')}`);
  }

  return {
    score,
    tags: [...tags],
    preferredPhases: timing.preferredPhases,
    notes,
  };
}
