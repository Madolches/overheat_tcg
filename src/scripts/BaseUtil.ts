import { Card, CardEffect, GameEvent, GameState, PlayerState, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
export { AtomicEffectExecutor };
import { EventEngine } from '../services/EventEngine';
import { getCardWealthValue, getPlayerWealthCount } from '../lib/wealth';
import { HighAlchemyEntryContext, satisfiesHighAlchemyEntryRestriction } from '../lib/highAlchemy';

const VIRTUAL_GOD_MARK_IDS = new Set(['105000472', '105000473']);

export type ChoiceOptionInput = {
  id?: string;
  value?: string;
  sourceCardNo?: string;
  optionCode?: string;
  label?: string;
  icon?: string;
  detail?: string;
  disabled?: boolean;
  disabledReason?: string;
};

export const getOpponentUid = (gameState: GameState, playerUid: string) =>
  Object.keys(gameState.players).find(uid => uid !== playerUid)!;

export const getCurrentEffectResolutionBatchKey = (gameState: GameState) => {
  const currentItem = gameState.currentProcessingItem as any;
  if (!currentItem) return undefined;
  if (!currentItem.effectResolutionBatchKey) {
    const nextSeq = ((gameState as any).effectResolutionBatchSeq || 0) + 1;
    (gameState as any).effectResolutionBatchSeq = nextSeq;
    currentItem.effectResolutionBatchKey = `effect:${gameState.turnCount}:${nextSeq}`;
  }
  return currentItem.effectResolutionBatchKey as string;
};

export const getTopDeckCards = (player: PlayerState, count: number) =>
  player.deck.slice(-count).reverse();

export const loseForInsufficientDeckMove = (
  gameState: GameState,
  playerUid: string,
  count: number,
  sourceCard?: Card
) => {
  if (gameState.gameStatus === 2) return;
  const player = gameState.players[playerUid];
  gameState.gameStatus = 2;
  gameState.winReason = 'DECK_OUT_DECK_MOVE';
  gameState.winnerId = gameState.playerIds.find(id => id !== playerUid);
  gameState.winSourceCardName = sourceCard?.fullName;
  gameState.logs.push(`[游戏结束] ${player.displayName} 的卡组数量不足，无法从卡组移动 ${count} 张卡，判负。`);
};

export const ensureDeckHasCardsForMove = (
  gameState: GameState,
  playerUid: string,
  count: number,
  sourceCard?: Card
) => {
  const player = gameState.players[playerUid];
  if (!player || player.deck.length >= count) return true;
  loseForInsufficientDeckMove(gameState, playerUid, count, sourceCard);
  return false;
};

export const revealDeckCards = (gameState: GameState, playerUid: string, count: number, sourceCard?: Card) => {
  const cards = getTopDeckCards(gameState.players[playerUid], count);
  const hasPuppetRevealBoost =
    !!sourceCard &&
    sourceCard.fullName.includes('魔偶') &&
    gameState.players[playerUid].unitZone.some(unit => unit && unit.id === '105000446');

  if (hasPuppetRevealBoost) {
    cards.forEach(card => {
      (card as any).data = {
        ...((card as any).data || {}),
        puppetRevealTurn: gameState.turnCount,
        puppetRevealPlayerUid: playerUid,
        puppetRevealSourceCardId: sourceCard.gamecardId
      };
    });
  }
  if (cards.length > 0) {
    const playerName = gameState.players[playerUid]?.displayName || '玩家';
    const sourceName = sourceCard?.fullName ? ` 因 [${sourceCard.fullName}]` : '';
    gameState.logs.push(`[公开] ${playerName}${sourceName} 公开了卡组顶的 ${cards.length} 张卡: ${cards.map(card => `[${card.fullName}]`).join(', ')}。`);
    EventEngine.dispatchEvent(gameState, {
      type: 'REVEAL_DECK',
      playerUid,
      data: {
        cards,
        sourceCardId: sourceCard?.gamecardId,
        sourceCardName: sourceCard?.fullName
      }
    });
  }
  return cards;
};

export const shuffleAndRevealTopCards = async (
  gameState: GameState,
  playerUid: string,
  count: number,
  sourceCard?: Card
) => {
  await AtomicEffectExecutor.execute(gameState, playerUid, { type: 'SHUFFLE_DECK' }, sourceCard);
  return revealDeckCards(gameState, playerUid, count, sourceCard);
};

export const isVirtualGodMarkReveal = (gameState: GameState, card: Card | undefined) =>
  !!card &&
  (
    card.godMark ||
    VIRTUAL_GOD_MARK_IDS.has(String(card.id)) ||
    (card as any).data?.puppetRevealTurn === gameState.turnCount
  );

export const isEffectiveGodMarkInDeck = (card: Card | undefined) =>
  !!card &&
  card.cardlocation === 'DECK' &&
  (
    card.godMark ||
    VIRTUAL_GOD_MARK_IDS.has(String(card.id)) ||
    card.effects?.some(effect =>
      effect.type === 'CONTINUOUS' &&
      effect.triggerLocation?.includes('DECK') &&
      (effect as any).treatAsGodMarkInDeck
    )
  );

export const isEffectiveGodMark = (card: Card | undefined) =>
  !!card && (card.godMark || isEffectiveGodMarkInDeck(card));

export const withVirtualGodMarkReveal = async <T>(
  gameState: GameState,
  card: Card | undefined,
  run: () => T | Promise<T>
) => {
  if (!card || !isVirtualGodMarkReveal(gameState, card) || card.godMark) {
    return run();
  }
  const previous = card.godMark;
  const previousBase = card.baseGodMark;
  card.godMark = true;
  card.baseGodMark = true;
  try {
    return await run();
  } finally {
    card.godMark = previous;
    card.baseGodMark = previousBase;
  }
};

export const enteredFromHand = (instance: Card, event?: any) =>
  event?.data?.sourceZone === 'HAND' ||
  (event?.data?.sourceZone === 'PLAY' && (instance as any).__playSnapshot?.sourceZone === 'HAND');

export const nameContains = (card: Card, text: string) =>
  card.fullName.includes(text) || !!card.specialName?.includes(text);

export const addTemporaryColor = (card: Card, color: string) => {
  (card as any).temporaryExtraColors = Array.from(new Set([
    ...((card as any).temporaryExtraColors || []),
    color
  ]));
};

export const addPersistentExtraColor = (card: Card, color: string) => {
  (card as any).persistentExtraColors = Array.from(new Set([
    ...((card as any).persistentExtraColors || []),
    color
  ]));
};

export const getBattlefieldColorRequirementResult = (playerState: PlayerState, req: Record<string, number> = {}) => {
  const availableColors: Record<string, number> = { RED: 0, WHITE: 0, YELLOW: 0, BLUE: 0, GREEN: 0, NONE: 0 };
  let omniColorCount = 0;

  playerState.unitZone.forEach(card => {
    if (!card) return;
    const isOmni = String(card.id) === '105000481' || !!card.effects?.some(effect => effect.id === '105000481_omni');
    if (isOmni) {
      omniColorCount += 1;
    } else if (card.color !== 'NONE') {
      availableColors[card.color] = (availableColors[card.color] || 0) + 1;
    }

    const extraColors = new Set([
      ...((card as any).temporaryExtraColors || []),
      ...((card as any).persistentExtraColors || [])
    ]);
    extraColors.forEach(color => {
      if (typeof color === 'string' && color !== card.color && color in availableColors) {
        availableColors[color] = (availableColors[color] || 0) + 1;
      }
    });
  });

  let totalDeficit = 0;
  for (const [color, reqCount] of Object.entries(req)) {
    totalDeficit += Math.max(0, Number(reqCount) - (availableColors[color] || 0));
  }

  return { valid: totalDeficit <= omniColorCount, totalDeficit, omniColorCount, availableColors };
};

export const canMeetBattlefieldColorRequirement = (playerState: PlayerState, cardOrReq: Card | Record<string, number>) => {
  const req: Record<string, number> = typeof (cardOrReq as Card).id === 'string'
    ? (((cardOrReq as Card).colorReq || {}) as Record<string, number>)
    : (cardOrReq as Record<string, number>);
  return getBattlefieldColorRequirementResult(playerState, req).valid;
};

export const isSilverInstrumentCard = (card: Card) => card.fullName.includes('银乐器');

export const hasResonanceAbility = (card: Card) =>
  card.type === 'UNIT' &&
  (card.effects || []).some(effect =>
    /resonance/i.test(effect.id || '') ||
    (effect.description || '').includes('共鸣')
  );

export const getResonanceExiledCard = (event?: GameEvent) =>
  event?.type === 'CARD_EXILED' &&
  event.data?.sourceZone === 'GRAVE' &&
  event.data?.targetZone === 'EXILE' &&
  (event.sourceCard as Card | undefined);

export const isResonanceExileEvent = (event?: GameEvent, sourceCard?: Card) => {
  const exiled = getResonanceExiledCard(event);
  if (!exiled) return false;
  const data = (exiled as any).data || {};
  if (sourceCard) return data.resonanceSourceCardId === sourceCard.gamecardId;
  return !!data.resonanceSourceCardId;
};

export const hasAwakenAbility = (card: Card) =>
  (card.effects || []).some(effect =>
    effect.type === 'ACTIVATE' &&
    (
      /^.+_awaken$/i.test(effect.id || '') ||
      (effect.description || '').startsWith('唤醒') ||
      (effect.description || '').startsWith('喚醒') ||
      (effect.description || '').includes('【启】唤醒') ||
      (effect.description || '').includes('【启】喚醒')
    )
  );

export const awakenUnit = (gameState: GameState, playerUid: string, target: Card, source: Card) => {
  const data = ensureData(target);
  data.awakenedTurn = gameState.turnCount;
  data.awakenedSourceCardId = source.gamecardId;
  data.awakenedSourceName = source.fullName;
  addInfluence(target, source, '适用唤醒');
  EventEngine.dispatchEvent(gameState, {
    type: 'UNIT_AWAKENED',
    sourceCard: target,
    sourceCardId: target.gamecardId,
    playerUid,
    data: {
      unitId: target.gamecardId,
      sourceCardId: source.gamecardId,
      sourceName: source.fullName
    }
  });
};

export const resonanceEffect = (id: string): CardEffect => ({
  id,
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '共鸣：1回合1次，你的主要阶段，选择你的墓地中的1张卡，将其放逐。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    playerState.grave.length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.grave,
      '选择共鸣放逐',
      '选择你的墓地中的1张卡，将其放逐。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: id, step: 'RESONANCE' },
      () => 'GRAVE'
    );
  },
  targetSpec: {
    title: '选择共鸣放逐',
    description: '选择你的墓地中的1张卡，将其放逐。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    step: 'RESONANCE',
    getCandidates: (_gameState, playerState) =>
      playerState.grave.map(card => ({ card, source: 'GRAVE' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'RESONANCE') return;
    const target = playerState.grave.find(card => card.gamecardId === selections[0]);
    if (!target) return;
    const data = ensureData(target);
    data.resonanceSourceCardId = instance.gamecardId;
    data.resonanceSourceName = instance.fullName;
    data.resonanceSourceEffectId = id;
    data.resonanceTurn = gameState.turnCount;
    moveCard(gameState, playerState.uid, target, 'EXILE', instance);
  }
});

export const awakenEffect = (id: string): CardEffect => ({
  id,
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '唤醒：1回合1次，你的主要阶段，选择你的战场上的1个单位，本回合中其力量+1000。回合结束时，将其放置到你的卡组底。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    playerState.unitZone.some((unit): unit is Card => !!unit),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.unitZone.filter((unit): unit is Card => !!unit),
      '选择唤醒单位',
      '选择你的战场上的1个单位，本回合中力量+1000。回合结束时，将其放置到你的卡组底。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: id, step: 'AWAKEN' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择唤醒单位',
    description: '选择你的战场上的1个单位，本回合中力量+1000。回合结束时，将其放置到你的卡组底。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'AWAKEN',
    getCandidates: (_gameState, playerState) =>
      playerState.unitZone
        .filter((unit): unit is Card => !!unit)
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'AWAKEN') return;
    const target = playerState.unitZone.find(unit => unit?.gamecardId === selections[0]);
    if (target) {
      awakenUnit(gameState, playerState.uid, target, instance);
      addTempPowerUntilEndOfTurn(target, instance, 1000, gameState);
      markReturnToDeckBottomAtEnd(target, instance, gameState);
    }
  }
});

export const readyByEffect = (gameState: GameState, target: Card, source: Card) => {
  target.isExhausted = false;
  target.hasAttackedThisTurn = false;
  if (gameState.battleState) {
    gameState.battleState.keepResetUnitIds = Array.from(new Set([...(gameState.battleState.keepResetUnitIds || []), target.gamecardId]));
  }
  EventEngine.dispatchEvent(gameState, {
    type: 'CARD_ROTATED',
    sourceCard: source,
    sourceCardId: source.gamecardId,
    targetCardId: target.gamecardId,
    playerUid: ownerUidOf(gameState, source),
    data: {
      direction: 'VERTICAL',
      effectSourcePlayerUid: ownerUidOf(gameState, source),
      effectSourceCardId: source.gamecardId,
      allTargetCardIds: [target.gamecardId]
    }
  });
};

export const addContinuousKeyword = (target: Card, source: Card, keyword: 'rush' | 'heroic' | 'annihilation') => {
  if (keyword === 'rush') {
    target.isrush = true;
    addInfluence(target, source, '获得【速攻】');
  } else if (keyword === 'heroic') {
    target.isHeroic = true;
    addInfluence(target, source, '获得【英勇】');
  } else {
    target.isAnnihilation = true;
    addInfluence(target, source, '获得【歼灭】');
  }
};

export const markCannotBeEffectTarget = (target: Card, source: Card) => {
  (target as any).cannotBeEffectTargetByEffect = true;
  addInfluence(target, source, '不能成为效果对象');
};

export const markCannotBeEffectTargetColors = (target: Card, source: Card, colors: Card['color'][]) => {
  const data = ensureData(target);
  data.cannotBeEffectTargetColors = colors;
  addInfluence(target, source, `不能成为${colors.join('/')}卡的效果对象`);
};

export const markCannotBeOpponentEffectTarget = (target: Card, source: Card) => {
  const data = ensureData(target);
  data.cannotBeEffectTargetByOpponent = true;
  data.cannotBeEffectTargetByOpponentSourceName = source.fullName;
  addInfluence(target, source, 'Cannot be chosen as a target by opponent card effects');
};

export const markCanAttackExhaustedUnit = (target: Card, source: Card) => {
  const data = ensureData(target);
  data.canAttackExhausted = true;
  data.canAttackExhaustedUntilTurn = Number.MAX_SAFE_INTEGER;
  data.canAttackExhaustedSourceName = source.fullName;
  addInfluence(target, source, '可以攻击对手横置单位');
};

export const markCanAttackReadyUnit = (target: Card, source: Card) => {
  const data = ensureData(target);
  data.canAttackReady = true;
  data.canAttackReadyUntilTurn = Number.MAX_SAFE_INTEGER;
  data.canAttackReadySourceName = source.fullName;
  addInfluence(target, source, '可以攻击对手重置单位');
};

export const markCanAttackAnyUnit = (target: Card, source: Card) => {
  const data = ensureData(target);
  data.canAttackAnyUnit = true;
  data.canAttackAnyUnitSourceName = source.fullName;
  addInfluence(target, source, '可以攻击对手单位');
};

export const cardsInZones = (player: PlayerState, zones: TriggerLocation[]) => {
  const entries: { card: Card; source: TriggerLocation }[] = [];
  zones.forEach(zone => {
    const cards =
      zone === 'HAND' ? player.hand :
      zone === 'DECK' ? player.deck :
      zone === 'GRAVE' ? player.grave :
      zone === 'EXILE' ? player.exile :
      zone === 'UNIT' ? player.unitZone :
      zone === 'ITEM' ? player.itemZone :
      zone === 'EROSION_FRONT' ? player.erosionFront :
      zone === 'EROSION_BACK' ? player.erosionBack :
      player.playZone;
    cards.forEach(card => {
      if (card) entries.push({ card, source: zone });
    });
  });
  return entries;
};

export const cannotBeChosenAsEffectTarget = (card: Card, sourceCard?: Card, gameState?: GameState) => {
  if (!sourceCard || card.gamecardId === sourceCard.gamecardId) return false;
  const isFieldCard = card.cardlocation === 'UNIT' || card.cardlocation === 'ITEM';
  const data = (card as any).data || {};
  const sourceOwnerUid = gameState ? ownerUidOf(gameState, sourceCard) : undefined;
  const targetOwnerUid = gameState ? ownerUidOf(gameState, card) : undefined;
  const isOpponentSource = !!sourceOwnerUid && !!targetOwnerUid && sourceOwnerUid !== targetOwnerUid;
  return isFieldCard && (
    !!(card as any).cannotBeEffectTargetByEffect ||
    (data.cannotBeEffectTargetByOpponent && isOpponentSource) ||
    (Array.isArray(data.cannotBeEffectTargetColors) && data.cannotBeEffectTargetColors.includes(sourceCard.color))
  );
};

export const isOpponentAcAtMost = (
  gameState: GameState,
  target: Card,
  source: Card,
  maxAc: number,
  sourceUid?: string
) => {
  const targetUid = ownerUidOf(gameState, target);
  const effectSourceUid = sourceUid || ownerUidOf(gameState, source);
  return !!targetUid &&
    !!effectSourceUid &&
    targetUid !== effectSourceUid &&
    Number(source.acValue || 0) <= maxAc;
};

export const isUnaffectedByCardEffect = (
  gameState: GameState,
  target: Card,
  source?: Card,
  sourceUid?: string
) => {
  if (!source || target.gamecardId === source.gamecardId) return false;
  const targetUid = ownerUidOf(gameState, target);
  const effectSourceUid = sourceUid || ownerUidOf(gameState, source);
  if (!targetUid || !effectSourceUid) return false;

  const data = (target as any).data || {};
  if (data.unaffectedByOtherCardEffects) {
    gameState.logs.push(`[${target.fullName}] 不受这张卡以外的卡牌效果影响。`);
    return true;
  }
  if (targetUid === effectSourceUid) return false;
  if (data.immuneToOpponentEffectsIfOpponentGoddess && gameState.players[effectSourceUid]?.isGoddessMode) {
    gameState.logs.push(`[${target.fullName}] 因对手处于女神化状态而不受对手卡牌效果影响。`);
    return true;
  }
  if (data.unaffectedByOpponentCardEffects) {
    gameState.logs.push(`[${target.fullName}] 不受对手的卡牌效果影响。`);
    return true;
  }
  if (data.unaffectedByOpponentColorEffects && source.color === data.unaffectedByOpponentColorEffects) {
    gameState.logs.push(`[${target.fullName}] 不受对手宣言颜色的卡牌效果影响。`);
    return true;
  }
  if (
    data.unaffectedByOpponentAcLe !== undefined &&
    isOpponentAcAtMost(gameState, target, source, Number(data.unaffectedByOpponentAcLe), effectSourceUid)
  ) {
    gameState.logs.push(`[${target.fullName}] is unaffected by opponent ACCESS ${data.unaffectedByOpponentAcLe} or less card effects.`);
    return true;
  }
  return false;
};

export const isProtectedGraveCardFromOpponentEffect = (
  gameState: GameState,
  target: Card,
  sourceCard?: Card,
  sourceUid?: string
) => {
  if (target.cardlocation !== 'GRAVE') return false;
  const targetUid = ownerUidOf(gameState, target);
  const effectSourceUid = sourceUid || (sourceCard ? ownerUidOf(gameState, sourceCard) : undefined);
  if (!targetUid || !effectSourceUid || targetUid === effectSourceUid) return false;
  const protectedBy = gameState.players[targetUid]?.itemZone.find(item =>
    item?.effects?.some(effect => effect.type === 'CONTINUOUS' && effect.protectOwnGraveFromOpponentEffects)
  );
  if (protectedBy) {
    gameState.logs.push(`[${protectedBy.fullName}] 防止墓地中的 [${target.fullName}] 成为对手效果的对象或被移动。`);
    return true;
  }
  return false;
};

export const createSelectCardQuery = (
  gameState: GameState,
  playerUid: string,
  cards: Card[],
  title: string,
  description: string,
  minSelections: number,
  maxSelections: number,
  context: any,
  sourceResolver?: (card: Card) => TriggerLocation
) => {
  const sourceCard = context?.sourceCardId ? AtomicEffectExecutor.findCardById(gameState, context.sourceCardId) : undefined;
  const selectableCards = cards.filter(card =>
    !cannotBeChosenAsEffectTarget(card, sourceCard, gameState) &&
    !isProtectedGraveCardFromOpponentEffect(gameState, card, sourceCard)
  );
  if (selectableCards.length < minSelections) return;
  gameState.pendingQuery = {
    id: Math.random().toString(36).substring(7),
    type: 'SELECT_CARD',
    playerUid,
    options: AtomicEffectExecutor.enrichQueryOptions(
      gameState,
      playerUid,
      selectableCards.map(card => ({
        card,
        source: sourceResolver ? sourceResolver(card) : (card.cardlocation as TriggerLocation)
      }))
    ),
    title,
    description,
    minSelections,
    maxSelections,
    callbackKey: 'EFFECT_RESOLVE',
    context
  };
};

export const choiceOptionCode = (index: number) => {
  let value = Math.max(0, index);
  let code = '';

  do {
    code = String.fromCharCode(65 + (value % 26)) + code;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return code;
};

export const getChoiceSourceCardNo = (
  gameState: GameState,
  context?: any,
  fallbackCardNo = 'SYSTEM'
) => {
  if (context?.sourceCardNo) return String(context.sourceCardNo);

  const sourceCardId = context?.sourceCardId || context?.cardId || context?.subCardId;
  const sourceCard = sourceCardId ? AtomicEffectExecutor.findCardById(gameState, sourceCardId) : undefined;

  return sourceCard?.id || fallbackCardNo;
};

export const standardizeChoiceOptions = (
  gameState: GameState,
  options: ChoiceOptionInput[],
  context?: any,
  fallbackCardNo?: string
) => {
  const querySourceCardNo = getChoiceSourceCardNo(gameState, context, fallbackCardNo);

  return options.map((option, index) => {
    const sourceCardNo = option.sourceCardNo || querySourceCardNo;
    const optionCode = option.optionCode || choiceOptionCode(index);
    const value = option.value ?? option.id ?? option.label ?? optionCode;

    return {
      ...option,
      id: `${sourceCardNo}_option_${optionCode}`,
      value: String(value),
      sourceCardNo,
      optionCode
    };
  });
};

export const createChoiceQuery = (
  gameState: GameState,
  playerUid: string,
  title: string,
  description: string,
  options: ChoiceOptionInput[],
  context: any
) => {
  gameState.pendingQuery = {
    id: Math.random().toString(36).substring(7),
    type: 'SELECT_CHOICE',
    playerUid,
    options: standardizeChoiceOptions(gameState, options, context),
    title,
    description,
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'EFFECT_RESOLVE',
    context
  };
};

export const createPlayerSelectQuery = (
  gameState: GameState,
  playerUid: string,
  title: string,
  description: string,
  context: any,
  options?: { includeSelf?: boolean; includeOpponent?: boolean }
) => {
  const includeSelf = options?.includeSelf !== false;
  const includeOpponent = options?.includeOpponent !== false;
  const playerOptions: { card: Card; source: TriggerLocation }[] = [];

  if (includeSelf) {
    playerOptions.push({
      card: {
        gamecardId: 'PLAYER_SELF',
        id: 'PLAYER_SELF',
        fullName: gameState.players[playerUid]?.displayName || '我方玩家',
        type: 'UNIT',
        color: 'NONE'
      } as Card,
      source: 'UNIT'
    });
  }

  if (includeOpponent) {
    const opponentUid = getOpponentUid(gameState, playerUid);
    playerOptions.push({
      card: {
        gamecardId: 'PLAYER_OPPONENT',
        id: 'PLAYER_OPPONENT',
        fullName: gameState.players[opponentUid]?.displayName || '对手玩家',
        type: 'UNIT',
        color: 'NONE'
      } as Card,
      source: 'UNIT'
    });
  }

  gameState.pendingQuery = {
    id: Math.random().toString(36).substring(7),
    type: 'SELECT_CARD',
    playerUid,
    options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerUid, playerOptions),
    title,
    description,
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'EFFECT_RESOLVE',
    context
  };
};

export const moveCard = (
  gameState: GameState,
  ownerUid: string,
  card: Card,
  toZone: TriggerLocation,
  sourceCard?: Card,
  options?: {
    insertAtBottom?: boolean;
    faceDown?: boolean;
    toPlayerUid?: string;
    targetIndex?: number;
    highAlchemyMaterialColors?: string[];
    highAlchemyMaterialCount?: number;
    onlySelfActivateSourceCardId?: string;
  }
) => {
  const targetPlayerUid = options?.toPlayerUid || ownerUid;
  if (sourceCard && isUnaffectedByCardEffect(gameState, card, sourceCard, options?.toPlayerUid ? ownerUidOf(gameState, sourceCard) : undefined)) {
    return false;
  }
  AtomicEffectExecutor.moveCard(
    gameState,
    ownerUid,
    card.cardlocation as TriggerLocation,
    targetPlayerUid,
    toZone,
    card.gamecardId,
    true,
    {
      insertAtBottom: options?.insertAtBottom,
      faceDown: options?.faceDown,
      targetIndex: options?.targetIndex,
      highAlchemyMaterialColors: options?.highAlchemyMaterialColors,
      highAlchemyMaterialCount: options?.highAlchemyMaterialCount,
      onlySelfActivateSourceCardId: options?.onlySelfActivateSourceCardId,
      effectSourcePlayerUid: (sourceCard ? AtomicEffectExecutor.findCardOwnerKey(gameState, sourceCard.gamecardId) : ownerUid) || ownerUid,
      effectSourceCardId: sourceCard?.gamecardId
    }
  );
  return card.cardlocation === toZone && ownerUidOf(gameState, card) === targetPlayerUid;
};

export const moveCardAsCost = (
  gameState: GameState,
  ownerUid: string,
  card: Card,
  toZone: TriggerLocation,
  sourceCard?: Card,
  options?: { insertAtBottom?: boolean; faceDown?: boolean; toPlayerUid?: string; targetIndex?: number }
) => {
  const targetPlayerUid = options?.toPlayerUid || ownerUid;
  const data = ensureData(card);
  data.lastMovedAsCostTurn = gameState.turnCount;
  data.lastMovedAsCostSourceCardId = sourceCard?.gamecardId;
  data.lastMovedAsCostSourceName = sourceCard?.fullName;
  AtomicEffectExecutor.moveCard(
    gameState,
    ownerUid,
    card.cardlocation as TriggerLocation,
    targetPlayerUid,
    toZone,
    card.gamecardId,
    false,
    {
      insertAtBottom: options?.insertAtBottom,
      faceDown: options?.faceDown,
      targetIndex: options?.targetIndex,
      effectSourcePlayerUid: (sourceCard ? AtomicEffectExecutor.findCardOwnerKey(gameState, sourceCard.gamecardId) : ownerUid) || ownerUid,
      effectSourceCardId: sourceCard?.gamecardId
    }
  );
};

export const moveCardsToBottom = (
  gameState: GameState,
  ownerUid: string,
  cards: Card[],
  sourceCard?: Card
) => {
  cards.forEach(card => moveCard(gameState, ownerUid, card, 'DECK', sourceCard, { insertAtBottom: true }));
};

export const moveCardsToTop = (
  gameState: GameState,
  ownerUid: string,
  cardsTopToBottom: Card[],
  sourceCard?: Card
) => {
  const player = gameState.players[ownerUid];
  const ids = new Set(cardsTopToBottom.map(card => card.gamecardId));
  player.deck = player.deck.filter(card => !ids.has(card.gamecardId));
  for (let i = cardsTopToBottom.length - 1; i >= 0; i -= 1) {
    const card = cardsTopToBottom[i];
    card.cardlocation = 'DECK';
    player.deck.push(card);
  }
  if (cardsTopToBottom.length > 0 && sourceCard) {
    gameState.logs.push(`[${sourceCard.fullName}] 将 ${cardsTopToBottom.length} 张卡按选择顺序放回卡组顶。`);
  }
};

export const getBattlefieldUnits = (gameState: GameState) =>
  Object.values(gameState.players).flatMap(player => player.unitZone.filter((card): card is Card => !!card));

export const getBattlefieldCards = (gameState: GameState) =>
  Object.values(gameState.players).flatMap(player => [
    ...player.unitZone.filter((card): card is Card => !!card),
    ...player.itemZone.filter((card): card is Card => !!card)
  ]);

export const findUnitOnBattlefield = (gameState: GameState, gamecardId?: string) => {
  if (!gamecardId) return undefined;
  return getBattlefieldUnits(gameState).find(card => card.gamecardId === gamecardId);
};

export type PutOntoBattlefieldContext = HighAlchemyEntryContext;

export const highAlchemyMaterialColorsOf = (card: Card) => {
  const colors = new Set<string>();
  if (card.color && card.color !== 'NONE') colors.add(card.color);

  [
    ...(((card as any).temporaryExtraColors || []) as string[]),
    ...(((card as any).persistentExtraColors || []) as string[]),
  ]
    .filter(color => typeof color === 'string' && color !== 'NONE')
    .forEach(color => colors.add(color));

  if ((card.id === '105000384' || card.id === '305000062') && (card.cardlocation === 'UNIT' || card.cardlocation === 'ITEM')) {
    ['RED', 'WHITE', 'YELLOW', 'BLUE', 'GREEN'].forEach(color => colors.add(color));
  }

  return Array.from(colors);
};

export const collectHighAlchemyMaterialColors = (cards: Card[]) =>
  Array.from(new Set(cards.flatMap(card => highAlchemyMaterialColorsOf(card))));

export const canPutUnitOntoBattlefield = (
  player: PlayerState,
  card: Card,
  context?: PutOntoBattlefieldContext
) =>
  card.type === 'UNIT' &&
  player.unitZone.some(slot => slot === null) &&
  (!card.specialName || !player.unitZone.some(unit => unit?.specialName === card.specialName)) &&
  satisfiesHighAlchemyEntryRestriction(card, context);

export const canPutItemOntoBattlefield = (player: PlayerState, card: Card) =>
  card.type === 'ITEM' &&
  (!card.specialName || !player.itemZone.some(item => item?.specialName === card.specialName));

export const hasTruthUnit = (player: PlayerState) =>
  player.unitZone.some(unit => unit && unit.type === 'UNIT' && (unit.specialName === '真理' || unit.fullName.includes('真理')));

export const getOnlyGodMarkUnit = (player: PlayerState) => {
  const godmarkUnits = player.unitZone.filter((unit): unit is Card => !!unit && unit.godMark);
  return godmarkUnits.length === 1 ? godmarkUnits[0] : undefined;
};

export const countItemTypes = (player: PlayerState) =>
  new Set(player.itemZone.filter((card): card is Card => !!card).map(card => card.id)).size;

export const isAlchemyCard = (card?: Card | null) => !!card && card.fullName.includes('炼金');
export const isAlchemyEffectSource = (gameState: GameState, sourceCardId?: string) =>
  !!sourceCardId && isAlchemyCard(AtomicEffectExecutor.findCardById(gameState, sourceCardId));
export const wasSentFromFieldToGraveByCardEffect = (event: any, instance?: Card) =>
  (!instance || event?.sourceCardId === instance.gamecardId || event?.targetCardId === instance.gamecardId) &&
  event?.data?.isEffect === true &&
  (event.data?.sourceZone === 'UNIT' || event.data?.sourceZone === 'ITEM' || event.data?.zone === 'UNIT' || event.data?.zone === 'ITEM') &&
  event.data?.targetZone === 'GRAVE';
export const wasSentFromFieldToGraveByAlchemyEffect = (gameState: GameState, card: Card, event?: any) => {
  if (event) {
    const matchesEventCard = event.sourceCardId === card.gamecardId || event.targetCardId === card.gamecardId;
    if (matchesEventCard && wasSentFromFieldToGraveByCardEffect(event, card)) {
      return isAlchemyEffectSource(gameState, event.data?.effectSourceCardId);
    }
  }

  const data = (card as any).data || {};
  if (data.sentToGraveFromFieldByEffectTurn !== gameState.turnCount) return false;
  return isAlchemyEffectSource(gameState, data.sentToGraveFromFieldByEffectSourceCardId);
};
export const isThisTurnFeijingUnitSentToGraveByAlchemyEffect = (gameState: GameState, card: Card) =>
  isFeijingUnit(card) && wasSentFromFieldToGraveByAlchemyEffect(gameState, card);
export const isTruthOrHickUnit = (card: Card) => card.type === 'UNIT' && (card.specialName === '真理' || card.specialName === '希克');
export const isValkyrieUnit = (card: Card) => card.type === 'UNIT' && card.specialName === '瓦尔基里';
export const isYellowHandCard = (card: Card) => card.cardlocation === 'HAND' && card.color === 'YELLOW';
export const isNonGodAccessLe3Item = (card: Card) => card.type === 'ITEM' && !card.godMark && (card.acValue || 0) <= 3;
export const isNonGodAccessLe3UnitOrItem = (card: Card) =>
  !card.godMark &&
  (card.type === 'UNIT' || card.type === 'ITEM') &&
  (card.acValue || 0) <= 3;

export const canPutCardOntoBattlefieldByEffect = (
  playerState: PlayerState,
  card: Card,
  context?: PutOntoBattlefieldContext
) => {
  if (playerState.factionLock && card.faction !== playerState.factionLock) {
    return false;
  }

  if (card.type === 'UNIT') {
    if (!playerState.unitZone.some(slot => slot === null)) {
      return false;
    }
    if (card.specialName && playerState.unitZone.some(unit => unit?.specialName === card.specialName)) {
      return false;
    }

    if (card.type === 'UNIT' && card.godMark) {
      const fieldEffects = playerState.unitZone
        .filter((unit): unit is Card => !!unit)
        .flatMap(unit => unit.effects || []);
      const fieldLimitEffect = fieldEffects.find(effect => effect.type === 'CONTINUOUS' && effect.limitGodmarkCount !== undefined);
      const selfLimitEffect = card.effects?.find(effect => effect.type === 'CONTINUOUS' && effect.limitGodmarkCount !== undefined);
      const effectiveLimit = fieldLimitEffect?.limitGodmarkCount ?? selfLimitEffect?.limitGodmarkCount;

      if (effectiveLimit !== undefined) {
        const currentGodmarkCount = playerState.unitZone.filter(unit => unit && unit.godMark).length;
        if (currentGodmarkCount >= effectiveLimit) {
          return false;
        }
      }
    }

    if (!satisfiesHighAlchemyEntryRestriction(card, context)) {
      return false;
    }
  }

  if (card.type === 'ITEM') {
    if (card.specialName && playerState.itemZone.some(item => item?.specialName === card.specialName)) {
      return false;
    }
  }

  return true;
};

export const getOwnerUid = (gameState: GameState, card: Card) =>
  AtomicEffectExecutor.findCardOwnerKey(gameState, card.gamecardId);

export const isBattlingGodMarkUnit = (gameState: GameState, instance: Card) => {
  const battleState = gameState.battleState;
  if (!battleState) return false;

  if (battleState.defender === instance.gamecardId) {
    return battleState.attackers.some(attackerId => {
      const attacker = AtomicEffectExecutor.findCardById(gameState, attackerId);
      return !!attacker?.godMark;
    });
  }

  if (battleState.attackers.includes(instance.gamecardId)) {
    const defender = battleState.defender ? AtomicEffectExecutor.findCardById(gameState, battleState.defender) : undefined;
    return !!defender?.godMark;
  }

  return false;
};

export const getOpponentBattlefieldNonGodCards = (gameState: GameState, playerUid: string) => {
  const opponentUid = gameState.playerIds.find(uid => uid !== playerUid)!;
  const opponent = gameState.players[opponentUid];
  return [...opponent.unitZone, ...opponent.itemZone].filter((card): card is Card => !!card && !card.godMark);
};

export const getItemTypeCount = (player: PlayerState) =>
  new Set(player.itemZone.filter((card): card is Card => !!card).map(card => card.id)).size;

export const getLoneGodmarkUnit = (player: PlayerState) => {
  const godmarkUnits = player.unitZone.filter((card): card is Card => !!card && card.godMark);
  return godmarkUnits.length === 1 ? godmarkUnits[0] : undefined;
};

export const wasPlayedFromHand = (instance: Card) => !!(instance as any).__playSnapshot;

export const universalEquipEffect: CardEffect = {
  id: 'equip_universal',
  type: 'ACTIVATE',
  description: '主要阶段中，选择你的1个单位装备这张卡，或解除装备状态。',
  limitCount: 1,
  limitNameType: false,
  triggerLocation: ['ITEM'],
  condition: gameState => gameState.phase === 'MAIN',
  execute: async (card, gameState, playerState) => {
    const currentTargetId = card.equipTargetId;
    const options = currentTargetId
      ? [{ card, source: 'ITEM' as const }]
      : playerState.unitZone
          .filter((unit): unit is Card => !!unit)
          .map(unit => ({ card: unit, source: 'UNIT' as const }));

    if (options.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, options),
      title: currentTargetId ? '解除装备' : '选择装备目标',
      description: currentTargetId ? '选择这张卡自身以解除装备。' : `选择1个单位装备 ${card.fullName}。`,
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: card.gamecardId,
        effectId: 'equip_universal'
      }
    };
  },
  onQueryResolve: async (card, gameState, playerState, selections) => {
    const selectedId = selections[0];
    if (selectedId === card.gamecardId) {
      card.equipTargetId = undefined;
      EventEngine.recalculateContinuousEffects(gameState);
      return;
    }

    const target = playerState.unitZone.find(unit => unit?.gamecardId === selectedId);
    if (!target) return;

    card.equipTargetId = target.gamecardId;
    EventEngine.dispatchEvent(gameState, {
      type: 'CARD_EQUIPPED',
      playerUid: playerState.uid,
      sourceCard: card,
      sourceCardId: card.gamecardId,
      targetCardId: target.gamecardId,
      data: {
        itemId: card.gamecardId,
        unitId: target.gamecardId
      }
    });
    EventEngine.recalculateContinuousEffects(gameState);
  }
};

export const ownerOf = (gameState: GameState, card: Card) =>
  Object.values(gameState.players).find(player =>
    [...player.hand, ...player.deck, ...player.grave, ...player.exile, ...player.unitZone, ...player.itemZone, ...player.erosionFront, ...player.erosionBack, ...player.playZone]
      .some(candidate => candidate?.gamecardId === card.gamecardId)
  );

export const ownerUidOf = (gameState: GameState, card: Card) =>
  Object.entries(gameState.players).find(([, player]) =>
    [...player.hand, ...player.deck, ...player.grave, ...player.exile, ...player.unitZone, ...player.itemZone, ...player.erosionFront, ...player.erosionBack, ...player.playZone]
      .some(candidate => candidate?.gamecardId === card.gamecardId)
  )?.[0];

export const allCardsOnField = (gameState: GameState) =>
  Object.values(gameState.players).flatMap(player => [
    ...player.unitZone.filter((card): card is Card => !!card),
    ...player.itemZone.filter((card): card is Card => !!card)
  ]);

export const hasBattlefieldSpecialNameConflict = (
  gameState: GameState,
  ownerUid: string,
  card: Card,
  zone: TriggerLocation
) => {
  if (!card.specialName) return false;
  const owner = gameState.players[ownerUid];
  const zoneCards = zone === 'ITEM' ? owner?.itemZone : zone === 'UNIT' ? owner?.unitZone : undefined;
  return Array.isArray(zoneCards) && zoneCards.some(slot => slot?.specialName === card.specialName);
};

export const allUnitsOnField = (gameState: GameState) =>
  Object.values(gameState.players).flatMap(player => player.unitZone.filter((card): card is Card => !!card));

export const battlingUnits = (gameState: GameState) => {
  const ids = [
    ...(gameState.battleState?.attackers || []),
    ...(gameState.battleState?.defender ? [gameState.battleState.defender] : [])
  ];
  return ids
    .map(id => AtomicEffectExecutor.findCardById(gameState, id))
    .filter((card): card is Card => !!card && card.cardlocation === 'UNIT');
};

export const attackingUnits = (gameState: GameState) =>
  (gameState.battleState?.attackers || [])
    .map(id => AtomicEffectExecutor.findCardById(gameState, id))
    .filter((card): card is Card => !!card && card.cardlocation === 'UNIT');

export const defendingUnit = (gameState: GameState) =>
  gameState.battleState?.defender ? AtomicEffectExecutor.findCardById(gameState, gameState.battleState.defender) : undefined;

export const isBattleFreeContext = (gameState: GameState) =>
  gameState.phase === 'BATTLE_FREE' ||
  (gameState.phase === 'COUNTERING' && gameState.previousPhase === 'BATTLE_FREE');

export const isConfrontationRequestTiming = (gameState: GameState) =>
  gameState.phase === 'COUNTERING' ||
  (gameState.phase === 'BATTLE_FREE' && !!gameState.battleState?.askConfront);

export const canActivateDefaultTiming = (gameState: GameState, playerState: PlayerState) =>
  (playerState.isTurn && (gameState.phase === 'MAIN' || gameState.phase === 'BATTLE_FREE')) ||
  isConfrontationRequestTiming(gameState);

export const canActivateDuringYourTurn = (gameState: GameState, playerState: PlayerState) =>
  playerState.isTurn &&
  (gameState.phase === 'MAIN' || gameState.phase === 'BATTLE_FREE' || isConfrontationRequestTiming(gameState));

export const ownUnits = (player: PlayerState) => player.unitZone.filter((card): card is Card => !!card);
export const ownItems = (player: PlayerState) => player.itemZone.filter((card): card is Card => !!card);
export const faceUpErosion = (player: PlayerState) =>
  player.erosionFront.filter((card): card is Card => !!card && card.displayState === 'FRONT_UPRIGHT');
export const backErosionCount = (player: PlayerState) => player.erosionBack.filter(card => !!card).length;
export const totalErosionCount = (player: PlayerState) => faceUpErosion(player).length + backErosionCount(player);
export const isFaction = (card: Card, faction: string) => card.faction === faction;
export const isNonGodUnit = (card: Card) => card.type === 'UNIT' && !card.godMark;
export const isNonGodFieldCard = (card: Card) => !card.godMark && (card.type === 'UNIT' || card.type === 'ITEM' || card.isEquip);
export const isFeijingCard = (card: Card) => !!card.feijingMark;
export const isFeijingUnit = (card: Card) => card.type === 'UNIT' && !!card.feijingMark;
export const isSameFactionCard = (card: Card, source: Card) =>
  !!source.faction && card.faction === source.faction;
export const isOtherworldBat = (card: Card) =>
  card.id === '102070357' ||
  card.fullName.includes('异界狂蝠') ||
  !!(card as any).data?.extraNameContainsOtherworldBatBy;

export { getCardWealthValue };

export const wealthCount = (player: PlayerState, gameState?: GameState) =>
  getPlayerWealthCount(player, { turnCount: gameState?.turnCount });

export const wealthContinuous = (id: string, value: number): CardEffect => ({
  id,
  type: 'CONTINUOUS',
  wealthValue: value,
  description: `财富${value}（只要这个单位在战场上，你获得${value}个财富指示物）。`
});

export const ensureData = (card: Card) => {
  (card as any).data = (card as any).data || {};
  return (card as any).data;
};

export const wasPlacedByPromotionThisTurn = (gameState: GameState, card: Card) =>
  (card as any).data?.placedByPromotionTurn === gameState.turnCount;

export const wasPlacedByPromotion = (card: Card) =>
  !!(card as any).data?.placedByPromotionSourceCardId;

export const markPlacedByPromotion = (gameState: GameState, target: Card, source: Card) => {
  const data = ensureData(target);
  data.placedByPromotionTurn = gameState.turnCount;
  data.placedByPromotionSourceCardId = source.gamecardId;
  data.placedByPromotionSourceName = source.fullName;
  EventEngine.dispatchEvent(gameState, {
    type: 'CARD_PLACED_BY_PROMOTION',
    sourceCard: target,
    sourceCardId: target.gamecardId,
    playerUid: ownerUidOf(gameState, target),
    data: {
      zone: 'UNIT',
      targetZone: 'UNIT',
      effectSourceCardId: source.gamecardId,
      effectSourcePlayerUid: ownerUidOf(gameState, source)
    }
  });
};

export const promotionTargets = (playerState: PlayerState, source: Card) =>
  [...playerState.hand, ...playerState.deck].filter(card =>
    card.type === 'UNIT' &&
    (card.acValue || 0) === (source.acValue || 0) + 1 &&
    canPutUnitOntoBattlefield(playerState, card)
  );

export const promotionTargetsFromAccess = (playerState: PlayerState, sourceAccess: number) =>
  [...playerState.hand, ...playerState.deck].filter(card =>
    card.type === 'UNIT' &&
    (card.acValue || 0) === sourceAccess + 1 &&
    canPutUnitOntoBattlefield(playerState, card)
  );

export const hasPromotionTarget = (playerState: PlayerState, source: Card) =>
  promotionTargets(playerState, source).length > 0;

export const sameFactionHandCards = (playerState: PlayerState, source: Card) =>
  playerState.hand.filter(card => card.gamecardId !== source.gamecardId && isSameFactionCard(card, source));

export const executePromotionAfterOptionalDiscard = async (
  gameState: GameState,
  playerState: PlayerState,
  source: Card,
  effectId: string,
  options: {
    selections?: string[];
    context?: any;
    discardPredicate?: (card: Card) => boolean;
    skipDiscard?: boolean;
    selfToGraveAsCost?: boolean;
  } = {}
) => {
  const step = options.context?.step;
  if (!step) {
    if (!options.skipDiscard) {
      const discardCandidates = playerState.hand.filter(card =>
        card.gamecardId !== source.gamecardId &&
        (!options.discardPredicate || options.discardPredicate(card))
      );
      if (discardCandidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        discardCandidates,
        'Select promotion cost',
        'Discard 1 card to promote.',
        1,
        1,
        { sourceCardId: source.gamecardId, effectId, step: 'PROMOTION_DISCARD', selfToGraveAsCost: options.selfToGraveAsCost },
        () => 'HAND'
      );
      return;
    }

    if (options.selfToGraveAsCost) moveCardAsCost(gameState, playerState.uid, source, 'GRAVE', source);
    else moveCard(gameState, playerState.uid, source, 'GRAVE', source);
    const candidates = promotionTargets(playerState, source);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      'Select promotion unit',
      'Put 1 unit with ACCESS +1 from your hand or deck onto the field.',
      1,
      1,
      { sourceCardId: source.gamecardId, effectId, step: 'PROMOTION_PUT' },
      card => card.cardlocation as TriggerLocation
    );
    return;
  }

  if (step === 'PROMOTION_DISCARD') {
    const discard = (options.selections || [])
      .map(id => playerState.hand.find(card => card.gamecardId === id))
      .find((card): card is Card => !!card && (!options.discardPredicate || options.discardPredicate(card)));
    if (!discard) return;
    moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', source);
    if (options.context?.selfToGraveAsCost) moveCardAsCost(gameState, playerState.uid, source, 'GRAVE', source);
    else moveCard(gameState, playerState.uid, source, 'GRAVE', source);
    const candidates = promotionTargets(playerState, source);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      'Select promotion unit',
      'Put 1 unit with ACCESS +1 from your hand or deck onto the field.',
      1,
      1,
      { sourceCardId: source.gamecardId, effectId, step: 'PROMOTION_PUT' },
      card => card.cardlocation as TriggerLocation
    );
    return;
  }

  if (step !== 'PROMOTION_PUT') return;
  const target = (options.selections || [])
    .map(id => AtomicEffectExecutor.findCardById(gameState, id))
    .find((card): card is Card => !!card && promotionTargets(playerState, source).some(targetCard => targetCard.gamecardId === card.gamecardId));
  if (!target) return;
  const targetId = target.gamecardId;
  const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, targetId);
  if (ownerUid !== playerState.uid || !putUnitOntoField(gameState, playerState.uid, target, source)) return;
  const live = AtomicEffectExecutor.findCardById(gameState, targetId);
  if (live?.cardlocation === 'UNIT') {
    markPlacedByPromotion(gameState, live, source);
  }
};

export const addInfluence = (card: Card, source: Card, description: string) => {
  card.influencingEffects = card.influencingEffects || [];
  if (!card.influencingEffects.some(effect => effect.sourceCardName === source.fullName && effect.description === description)) {
    card.influencingEffects.push({ sourceCardName: source.fullName, description });
  }
};

export const markAccessTapValue = (target: Card, source: Card, value: number) => {
  const data = ensureData(target);
  data.accessTapValue = value;
  data.accessTapMinValue = 1;
  data.accessTapFlexible = true;
  data.accessTapValueSourceName = source.fullName;
  addInfluence(target, source, `横置支付ACCESS时可当作+1或+${value}`);
};

export const markDeclarationTax = (target: Card, source: Card, amount: number) => {
  const data = ensureData(target);
  data.declareAttackDefenseTax = amount;
  data.declareAttackDefenseTaxSourceName = source.fullName;
  addInfluence(target, source, `宣言攻击或防御需要支付${amount}费`);
};

export const putUnitOntoField = (
  gameState: GameState,
  ownerUid: string,
  card: Card,
  source: Card,
  options?: {
    exhausted?: boolean;
    toPlayerUid?: string;
    highAlchemyMaterialColors?: string[];
    highAlchemyMaterialCount?: number;
    onlySelfActivateSourceCardId?: string;
  }
) => {
  const toPlayerUid = options?.toPlayerUid || ownerUid;
  if (!canPutUnitOntoBattlefield(gameState.players[toPlayerUid], card, options)) return false;
  const fromZone = card.cardlocation;
  moveCard(gameState, ownerUid, card, 'UNIT', source, {
    toPlayerUid,
    highAlchemyMaterialColors: options?.highAlchemyMaterialColors,
    highAlchemyMaterialCount: options?.highAlchemyMaterialCount,
    onlySelfActivateSourceCardId: options?.onlySelfActivateSourceCardId,
  });
  const moved = AtomicEffectExecutor.findCardById(gameState, card.gamecardId);
  if (moved) {
    moved.isExhausted = !!options?.exhausted || (moved as any).data?.placedByOwnEffectForcedExhaustedTurn === gameState.turnCount;
    moved.displayState = 'FRONT_UPRIGHT';
    moved.playedTurn = gameState.turnCount;
    moved.hasAttackedThisTurn = false;
    if (fromZone === 'GRAVE') {
      const data = ensureData(moved);
      data.enteredFromGraveTurn = gameState.turnCount;
      data.enteredFromGraveSourceName = source.fullName;
    }
  }
  return true;
};

export const putItemOntoField = (
  gameState: GameState,
  ownerUid: string,
  card: Card,
  source: Card,
  options?: { toPlayerUid?: string }
) => {
  const toPlayerUid = options?.toPlayerUid || ownerUid;
  if (!canPutItemOntoBattlefield(gameState.players[toPlayerUid], card)) return false;
  moveCard(gameState, ownerUid, card, 'ITEM', source, { toPlayerUid });
  const moved = AtomicEffectExecutor.findCardById(gameState, card.gamecardId);
  if (moved) {
    moved.isExhausted = false;
    moved.displayState = 'FRONT_UPRIGHT';
    moved.playedTurn = gameState.turnCount;
  }
  return true;
};

export const putCardOntoField = (
  gameState: GameState,
  ownerUid: string,
  card: Card,
  source: Card,
  options?: {
    exhausted?: boolean;
    toPlayerUid?: string;
    highAlchemyMaterialColors?: string[];
    highAlchemyMaterialCount?: number;
    onlySelfActivateSourceCardId?: string;
  }
) => {
  if (card.type === 'UNIT') return putUnitOntoField(gameState, ownerUid, card, source, options);
  if (card.type === 'ITEM' || card.isEquip) return putItemOntoField(gameState, ownerUid, card, source, options);
  return false;
};

export const addContinuousPower = (target: Card, source: Card, amount: number) => {
  const bonus = amount > 0 ? Number((target as any).data?.powerIncreaseBonus || 0) : 0;
  const finalAmount = amount + bonus;
  target.power = (target.power || 0) + finalAmount;
  addInfluence(target, source, `力量${finalAmount >= 0 ? '+' : ''}${finalAmount}`);
};

export const addContinuousDamage = (target: Card, source: Card, amount: number) => {
  target.damage = (target.damage || 0) + amount;
  addInfluence(target, source, `伤害${amount >= 0 ? '+' : ''}${amount}`);
};

export const recordUnitSentFromFieldToGrave = (gameState: GameState, playerUid: string, card: Card) => {
  if (card.type !== 'UNIT') return;
  const key = `unitsSentFromFieldToGraveTurn_${gameState.turnCount}`;
  const idsKey = `${key}_ids`;
  const player = gameState.players[playerUid] as any;
  const ids = new Set<string>(player[idsKey] || []);
  if (ids.has(card.gamecardId)) return;
  ids.add(card.gamecardId);
  player[idsKey] = [...ids];
  player[key] = ids.size;

  const globalIdsKey = `${key}_global_ids`;
  const globalIds = new Set<string>((gameState as any)[globalIdsKey] || []);
  if (globalIds.has(card.gamecardId)) return;
  globalIds.add(card.gamecardId);
  (gameState as any)[globalIdsKey] = [...globalIds];
  (gameState as any)[`${key}_global`] = globalIds.size;
};

export const unitsSentFromFieldToGraveThisTurn = (gameState: GameState, playerState: PlayerState) =>
  Number((playerState as any)[`unitsSentFromFieldToGraveTurn_${gameState.turnCount}`] || 0);

export const totalUnitsSentFromFieldToGraveThisTurn = (gameState: GameState) =>
  Number((gameState as any)[`unitsSentFromFieldToGraveTurn_${gameState.turnCount}_global`] || 0);

export const soulDevourCountThisTurn = (gameState: GameState, playerState: PlayerState) =>
  Number((playerState as any)[`soulDevourActivatedTurn_${gameState.turnCount}`] || 0);

export const recordSoulDevourActivation = (gameState: GameState, playerState: PlayerState) => {
  const key = `soulDevourActivatedTurn_${gameState.turnCount}`;
  (playerState as any)[key] = soulDevourCountThisTurn(gameState, playerState) + 1;
};

export const isSoulDevourUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (card.effects || []).some(effect =>
    effect.type === 'ACTIVATE' &&
    (
      /^.+_(soul_devour|souldevour)_power$/i.test(effect.id || '') ||
      (effect.description || '').startsWith('噬魂') ||
      (effect.description || '').startsWith('噬魂：') ||
      (effect.description || '').includes('【启】噬魂') ||
      (effect.description || '').includes('【启】【噬魂】')
    )
  );

export const isThunderUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (
    String(card.faction || '').includes('雷霆') ||
    card.fullName.includes('雷霆') ||
    !!card.specialName?.includes('雷霆')
  );

export const addTemporaryAccessDiscount = (target: Card, source: Card, amount: number) => {
  if (amount <= 0) return;
  target.acValue = Math.max(0, (target.acValue || 0) - amount);
  addInfluence(target, source, `ACCESS-${amount}`);
};

export const genericSoulDevourPowerEffect = (id: string): CardEffect => ({
  id,
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '噬魂：你的主要阶段，将这个单位以外的己方1个非神蚀单位送入墓地，本回合中你的所有单位力量+500。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    ownUnits(playerState).some(unit => unit.gamecardId !== instance.gamecardId && !unit.godMark),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(unit => unit.gamecardId !== instance.gamecardId && !unit.godMark),
      '选择噬魂费用',
      '选择这个单位以外的己方1个非神蚀单位送入墓地作为费用。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: id, step: 'SOUL_DEVOUR_COST' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'SOUL_DEVOUR_COST') return;
    const costUnit = playerState.unitZone.find(unit =>
      unit?.gamecardId === selections[0] &&
      unit.gamecardId !== instance.gamecardId &&
      !unit.godMark
    );
    if (!costUnit) return;
    moveCardAsCost(gameState, playerState.uid, costUnit, 'GRAVE', instance);
    recordUnitSentFromFieldToGrave(gameState, playerState.uid, costUnit);
    recordSoulDevourActivation(gameState, playerState);
    ownUnits(playerState).forEach(unit => addTempPowerUntilEndOfTurn(unit, instance, 500, gameState));
  }
});

export const addTempPower = (target: Card, source: Card, amount: number, gameState?: GameState) => {
  const bonus = amount > 0 ? Number((target as any).data?.powerIncreaseBonus || 0) : 0;
  const finalAmount = amount + bonus;
  target.temporaryPowerBuff = (target.temporaryPowerBuff || 0) + amount;
  if (bonus > 0) {
    target.temporaryPowerBuff += bonus;
  }
  target.power = (target.power || 0) + finalAmount;
  target.temporaryBuffSources = { ...(target.temporaryBuffSources || {}), power: source.fullName };
  const details = target.temporaryBuffDetails?.power || [];
  details.push({ sourceCardName: source.fullName, value: finalAmount });
  target.temporaryBuffDetails = { ...(target.temporaryBuffDetails || {}), power: details };
  if (gameState && finalAmount !== 0) {
    EventEngine.dispatchEvent(gameState, {
      type: 'CARD_POWER_CHANGED',
      targetCardId: target.gamecardId,
      sourceCard: source,
      sourceCardId: source.gamecardId,
      data: { delta: finalAmount }
    });
  }
};

export const addTempPowerUntilEndOfTurn = (target: Card, source: Card, amount: number, gameState: GameState) => {
  const beforePower = target.power || 0;
  addTempPower(target, source, amount);
  const currentPower = target.power || 0;
  if (currentPower !== beforePower) {
    const event = {
      type: 'CARD_POWER_CHANGED' as const,
      sourceCard: target,
      sourceCardId: target.gamecardId,
      targetCardId: target.gamecardId,
      playerUid: ownerUidOf(gameState, target),
      data: {
        previousPower: beforePower,
        currentPower,
        delta: currentPower - beforePower,
        effectSourceCardId: source.gamecardId,
        effectSourcePlayerUid: ownerUidOf(gameState, source)
      }
    };
    EventEngine.dispatchEvent(gameState, event);
  }
  const data = ensureData(target);
  data.endOfTurnTempPowerBuffs = [
    ...(data.endOfTurnTempPowerBuffs || []),
    { turn: gameState.turnCount, amount, sourceCardName: source.fullName }
  ];
};

export const addTempDamage = (target: Card, source: Card, amount: number) => {
  target.temporaryDamageBuff = (target.temporaryDamageBuff || 0) + amount;
  target.damage = (target.damage || 0) + amount;
  target.temporaryBuffSources = { ...(target.temporaryBuffSources || {}), damage: source.fullName };
};

export const addTempKeyword = (target: Card, source: Card, keyword: 'rush' | 'heroic' | 'annihilation') => {
  target.temporaryBuffSources = target.temporaryBuffSources || {};
  if (keyword === 'rush') {
    target.temporaryRush = true;
    target.isrush = true;
    target.temporaryBuffSources.rush = source.fullName;
  } else if (keyword === 'heroic') {
    target.temporaryHeroic = true;
    target.isHeroic = true;
    target.temporaryBuffSources.heroic = source.fullName;
  } else {
    target.temporaryAnnihilation = true;
    target.isAnnihilation = true;
    target.temporaryBuffSources.annihilation = source.fullName;
    addInfluence(target, source, '获得效果: 【歼灭】');
  }
};

export const addTempShenyi = (target: Card, source: Card, gameState: GameState) => {
  const data = ensureData(target);
  data.tempShenyiUntilTurn = gameState.turnCount;
  data.tempShenyiSourceName = source.fullName;
  target.isShenyi = true;
  addInfluence(target, source, '获得【神依】');
};

export const markCannotDefendUntilEndOfTurn = (target: Card, source: Card, gameState: GameState) => {
  const data = ensureData(target);
  data.cannotDefendTurn = gameState.turnCount;
  data.cannotDefendSourceName = source.fullName;
  addInfluence(target, source, '不能宣言防御');
};

export const markSpiritTargeted = (gameState: GameState, target: Card, source: Card, options?: { dispatchEvent?: boolean }) => {
  const data = ensureData(target);
  data.spiritTargetedTurn = gameState.turnCount;
  data.spiritTargetedSourceName = source.fullName;
  addInfluence(target, source, '被卡名含有《降灵》的效果选择');
  if (target.id === '103080185' && source.fullName.includes('降灵')) {
    const sourceData = ensureData(source);
    sourceData.spiritCostTarget103080185 = true;
    sourceData.spiritCostTarget103080185Turn = gameState.turnCount;
    sourceData.spiritCostTarget103080185TargetId = target.gamecardId;
    addInfluence(source, target, '指定天鬼图腾「暴龙」');
  }
  if (options?.dispatchEvent === false) return;
  EventEngine.dispatchEvent(gameState, {
    type: 'CARD_SELECTED_TARGET',
    sourceCard: source,
    sourceCardId: source.gamecardId,
    targetCardId: target.gamecardId,
    playerUid: ownerUidOf(gameState, source),
    data: {
      isSpiritEffect: true
    }
  });
};

export const isSpiritEffectEvent = (event: any) =>
  !!event?.data?.isSpiritEffect || !!event?.sourceCard?.fullName?.includes('降灵');

export const preventNextDestroy = (target: Card, source: Card, untilTurn?: number) => {
  const data = ensureData(target);
  data.preventNextDestroy = true;
  data.preventNextDestroySourceName = source.fullName;
  if (untilTurn !== undefined) data.preventNextDestroyUntilTurn = untilTurn;
  addInfluence(target, source, '下一次将被破坏时防止');
};

export const preventFirstDestroyEachTurn = (target: Card, source: Card) => {
  const data = ensureData(target);
  data.preventFirstDestroyEachTurnSourceName = source.fullName;
  addInfluence(target, source, '每回合第一次将被破坏时防止');
};

export const preventNextBattleDamageUpTo = (
  playerState: PlayerState,
  source: Card,
  maxAmount: number,
  gameState: GameState
) => {
  (playerState as any).preventBattleDamageUpToTurn = gameState.turnCount;
  (playerState as any).preventBattleDamageUpToAmount = maxAmount;
  (playerState as any).preventBattleDamageUpToSourceName = source.fullName;
  gameState.logs.push(`[${source.fullName}] 本次战斗中防止 ${playerState.displayName} 将要受到的 ${maxAmount} 点以下战斗伤害。`);
};

export const markCannotResetNextStart = (target: Card, source: Card) => {
  target.canResetCount = Math.max(target.canResetCount || 0, 1);
  const data = ensureData(target);
  data.cannotResetSourceName = source.fullName;
  addInfluence(target, source, '下个重置阶段不能重置');
};

export const markCannotExhaustUntil = (target: Card, source: Card, untilTurn: number) => {
  const data = ensureData(target);
  data.cannotExhaustUntilTurn = untilTurn;
  data.cannotExhaustSourceName = source.fullName;
  addInfluence(target, source, '不能横置');
};

export const markCannotExhaustContinuous = (target: Card, source: Card) => {
  const data = ensureData(target);
  data.cannotExhaustContinuous = true;
  markCannotExhaustUntil(target, source, Number.MAX_SAFE_INTEGER);
};

export const silenceAllEffectsUntil = (target: Card, source: Card, untilTurn: number, zones?: TriggerLocation[]) => {
  const data = ensureData(target);
  data.fullEffectSilencedTurn = untilTurn;
  data.fullEffectSilenceSource = source.fullName;
  if (zones) data.fullEffectSilencedZones = zones;
  else delete data.fullEffectSilencedZones;
  addInfluence(target, source, '失去所有效果');
};

export const silenceAllNonKeywordEffectsUntilOwnStart = (target: Card, source: Card, ownerUid: string) => {
  const data = ensureData(target);
  data.fullEffectSilencedUntilOwnStartUid = ownerUid;
  data.fullEffectSilenceSource = source.fullName;
  addInfluence(target, source, 'Loses all non-keyword effects until its controller next turn starts');
};

export const silenceAllNonKeywordEffectsPermanently = (target: Card, source: Card) => {
  const data = ensureData(target);
  data.permanentEffectSilenced = true;
  data.permanentEffectSilenceSource = source.fullName;
  addInfluence(target, source, 'Loses all non-keyword effects');
};

export const markExileWhenLeavesField = (target: Card, source: Card) => {
  const data = ensureData(target);
  data.exileWhenLeavesFieldSourceName = source.fullName;
  addInfluence(target, source, 'Exile when it leaves the field');
};

export const forbidAttackAndDefenseUntil = (target: Card, source: Card, untilTurn: number) => {
  const data = ensureData(target);
  data.cannotAttackOrDefendUntilTurn = untilTurn;
  data.cannotAttackOrDefendSourceName = source.fullName;
  addInfluence(target, source, '不能宣言攻击和防御');
};

export const forbidAttackAndDefenseContinuous = (target: Card, source: Card) => {
  const data = ensureData(target);
  data.cannotAttackOrDefendContinuous = true;
  forbidAttackAndDefenseUntil(target, source, Number.MAX_SAFE_INTEGER);
};

export const freezeUntil = (target: Card, source: Card, untilTurn: number) => {
  const data = ensureData(target);
  data.freezeUntilTurn = untilTurn;
  data.freezeSourceName = source.fullName;
  data.cannotAttackOrDefendUntilTurn = untilTurn;
  data.cannotAttackOrDefendSourceName = source.fullName;
  data.cannotActivateUntilTurn = untilTurn;
  data.cannotActivateSourceName = source.fullName;
  data.indestructibleByEffect = true;
  addInfluence(target, source, '冻结：不能发动能力，不能宣言攻击和防御，也不会被破坏');
};

export const untilOpponentEndTurn = (gameState: GameState, playerUid: string) => {
  const opponentUid = getOpponentUid(gameState, playerUid);
  return gameState.players[opponentUid]?.isTurn ? gameState.turnCount : gameState.turnCount + 1;
};

export const markReturnToDeckBottomAtEnd = (target: Card, source: Card, gameState: GameState, ownerUid?: string) => {
  const data = ensureData(target);
  data.returnToDeckBottomAtTurnEnd = gameState.turnCount;
  data.returnToDeckBottomSourceName = source.fullName;
  data.returnToDeckBottomSourceCardId = source.gamecardId;
  data.returnToDeckBottomOwnerUid = ownerUid || ownerUidOf(gameState, target);
  addInfluence(target, source, '回合结束时放置到卡组底');
};

export const moveRandomGraveToDeckBottom = (gameState: GameState, playerUid: string, count: number, source: Card) => {
  const player = gameState.players[playerUid];
  const shuffled = [...player.grave].sort(() => Math.random() - 0.5).slice(0, count);
  shuffled.forEach(card => moveCard(gameState, playerUid, card, 'DECK', source, { insertAtBottom: true }));
};

export const feijingCardsIn = (cards: Card[]) => cards.filter(isFeijingCard);

export const selectFromEntries = (
  gameState: GameState,
  playerUid: string,
  entries: { card: Card; source: TriggerLocation }[],
  title: string,
  description: string,
  minSelections: number,
  maxSelections: number,
  context: any
) => {
  gameState.pendingQuery = {
    id: Math.random().toString(36).substring(7),
    type: 'SELECT_CARD',
    playerUid,
    options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerUid, entries),
    title,
    description,
    minSelections,
    maxSelections,
    callbackKey: 'EFFECT_RESOLVE',
    context
  };
};

export const discardHandCost = (count: number, predicate?: (card: Card) => boolean): CardEffect['cost'] => async (gameState, playerState, instance) => {
  const candidates = playerState.hand.filter(card => card.gamecardId !== instance.gamecardId && (!predicate || predicate(card)));
  if (candidates.length < count) return false;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    candidates,
    '支付舍弃费用',
    `选择${count}张手牌舍弃以发动 [${instance.fullName}]。`,
    count,
    count,
    {
      sourceCardId: instance.gamecardId,
      costType: 'DISCARD_HAND_COST',
      discardCostAmount: count
    },
    () => 'HAND'
  );
  return true;
};

export const hasActiveTotemReviveGrant = (gameState: GameState, playerState: PlayerState) => {
  const totalErosion = playerState.erosionFront.filter(Boolean).length + playerState.erosionBack.filter(Boolean).length;
  return totalErosion >= 2 &&
    totalErosion <= 4 &&
    playerState.unitZone.some(unit => unit?.id === '103080184');
};

export const grantedTotemReviveFromGrave = (): CardEffect => ({
  id: '103080184_granted_totem_revive',
  type: 'ACTIVATE',
  triggerLocation: ['GRAVE'],
  description: '由温多娜赋予：舍弃2张手牌，从墓地放置到战场。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'GRAVE' &&
    instance.type === 'UNIT' &&
    instance.fullName.includes('图腾') &&
    hasActiveTotemReviveGrant(gameState, playerState) &&
    playerState.hand.length >= 2 &&
    canPutUnitOntoBattlefield(playerState, instance),
  cost: discardHandCost(2),
  execute: async (instance, gameState, playerState) => {
    if (
      instance.cardlocation === 'GRAVE' &&
      hasActiveTotemReviveGrant(gameState, playerState) &&
      canPutUnitOntoBattlefield(playerState, instance)
    ) {
      moveCard(gameState, playerState.uid, instance, 'UNIT', instance);
    }
  }
});

export const moveByEffect = (
  gameState: GameState,
  card: Card,
  toZone: TriggerLocation,
  source: Card,
  options?: { toPlayerUid?: string; insertAtBottom?: boolean; faceDown?: boolean; targetIndex?: number }
) => {
  const fromUid = ownerUidOf(gameState, card);
  if (!fromUid) return;
  moveCard(gameState, fromUid, card, toZone, source, options);
};

export const moveTopDeckTo = (gameState: GameState, playerUid: string, count: number, toZone: TriggerLocation, source: Card, faceDown?: boolean) => {
  const player = gameState.players[playerUid];
  if (!ensureDeckHasCardsForMove(gameState, playerUid, count, source)) return;
  getTopDeckCards(player, count).forEach(card => moveCard(gameState, playerUid, card, toZone, source, { faceDown }));
};

export const millTop = (gameState: GameState, playerUid: string, count: number, source: Card) => {
  const player = gameState.players[playerUid];
  if (!ensureDeckHasCardsForMove(gameState, playerUid, count, source)) return;
  getTopDeckCards(player, count).forEach(card => moveCard(gameState, playerUid, card, 'GRAVE', source));
};

export const damagePlayerByEffect = async (gameState: GameState, sourcePlayerUid: string, targetPlayerUid: string, amount: number, source: Card) => {
  await AtomicEffectExecutor.execute(
    gameState,
    sourcePlayerUid,
    { type: targetPlayerUid === sourcePlayerUid ? 'DEAL_EFFECT_DAMAGE_SELF' as any : 'DEAL_EFFECT_DAMAGE', value: amount },
    source
  );
};

export const dealUnpreventableSelfDamage = (gameState: GameState, playerUid: string, amount: number, source: Card) => {
  const player = gameState.players[playerUid];
  if (player.deck.length < amount) {
    gameState.gameStatus = 2;
    gameState.winReason = 'DECK_OUT_EFFECT_DAMAGE';
    gameState.winnerId = gameState.playerIds.find(id => id !== playerUid);
    return;
  }
  for (let i = 0; i < amount; i += 1) {
    const card = player.deck.pop();
    if (!card) continue;
    card.cardlocation = player.isGoddessMode ? 'GRAVE' : 'EROSION_FRONT';
    card.displayState = 'FRONT_UPRIGHT';
    card.isExhausted = false;
    if (player.isGoddessMode) {
      player.grave.push(card);
    } else {
      const currentErosion = player.erosionFront.filter(slot => !!slot).length + player.erosionBack.filter(slot => !!slot).length;
      if (currentErosion >= 10) {
        card.cardlocation = 'GRAVE';
        player.grave.push(card);
        gameState.logs.push(`[侵蚀区已满] ${card.fullName} 因侵蚀区已达10张改为送入墓地。`);
      } else {
        const emptyIndex = player.erosionFront.findIndex(slot => slot === null);
        if (emptyIndex !== -1) player.erosionFront[emptyIndex] = card;
        else player.erosionFront.push(card);
      }
    }
  }
  gameState.logs.push(`[${source.fullName}] 对自己造成 ${amount} 点不能防止的效果伤害。`);
};

export const destroyByEffect = (gameState: GameState, target: Card, source: Card) => {
  const uid = ownerUidOf(gameState, target);
  if (!uid) return false;
  const sourceUid = ownerUidOf(gameState, source);
  const data = (target as any).data || {};
  const sourceName = source.fullName || '卡牌效果';

  if (data.indestructibleByEffect) {
    gameState.logs.push(`[${target.fullName}] 因效果不会被破坏。`);
    return false;
  }

  const opponentUid = getOpponentUid(gameState, uid);
  if (data.indestructibleIfOpponentGoddess && opponentUid && gameState.players[opponentUid]?.isGoddessMode) {
    gameState.logs.push(`[${target.fullName}] 因对手处于女神化状态而不会被破坏。`);
    return false;
  }

  if (isUnaffectedByCardEffect(gameState, target, source)) {
    return false;
  }

  if (
    data.preventNextDestroy &&
    (
      data.preventNextDestroyUntilTurn === undefined ||
      data.preventNextDestroyUntilTurn >= gameState.turnCount
    )
  ) {
    gameState.logs.push(`[${data.preventNextDestroySourceName || sourceName}] 防止了 [${target.fullName}] 将要被破坏。`);
    delete data.preventNextDestroy;
    delete data.preventNextDestroySourceName;
    delete data.preventNextDestroyUntilTurn;
    return false;
  }

  if (data.preventFirstDestroyEachTurnSourceName && data.preventFirstDestroyEachTurnUsedTurn !== gameState.turnCount) {
    data.preventFirstDestroyEachTurnUsedTurn = gameState.turnCount;
    gameState.logs.push(`[${data.preventFirstDestroyEachTurnSourceName}] 防止了 [${target.fullName}] 本回合第一次将被破坏。`);
    return false;
  }

  if (
    sourceUid &&
    sourceUid !== uid &&
    (gameState.players[uid] as any).preventOwnUnitsOpponentEffectDestroyTurn === gameState.turnCount
  ) {
    const sourceCardId = (gameState.players[uid] as any).preventOwnUnitsOpponentEffectDestroySourceCardId;
    const preventSource = sourceCardId ? AtomicEffectExecutor.findCardById(gameState, sourceCardId) : undefined;
    const preventSourceName = preventSource?.fullName || (gameState.players[uid] as any).preventOwnUnitsOpponentEffectDestroySourceName || '破坏防止';
    gameState.logs.push(`[${preventSourceName}] 防止了 [${target.fullName}] 将要被对手的卡的效果破坏。`);
    EventEngine.dispatchEvent(gameState, {
      type: 'CARD_EFFECT_DESTROY_PREVENTED',
      sourceCard: preventSource,
      sourceCardId,
      targetCardId: target.gamecardId,
      playerUid: uid,
      data: {
        preventedCardId: target.gamecardId,
        destroySourcePlayerId: sourceUid,
        destroySourceCardId: source.gamecardId,
        preventBatchKey: getCurrentEffectResolutionBatchKey(gameState)
      }
    });
    return false;
  }

  if (data.returnToHandOnDestroyTurn === gameState.turnCount) {
    moveCard(gameState, uid, target, 'HAND', source);
    gameState.logs.push(`[替换效果] ${target.fullName} 本回合被破坏时改为返回手牌。`);
    return false;
  }

  const destroyed = moveCard(gameState, uid, target, 'GRAVE', source);
  if (!destroyed) return false;
  EventEngine.dispatchEvent(gameState, {
    type: 'CARD_DESTROYED_EFFECT',
    targetCardId: target.gamecardId,
    playerUid: uid,
    data: {
      sourcePlayerId: sourceUid
    }
  });
  gameState.logs.push(`[${source.fullName}] 破坏了 [${target.fullName}]。`);
  return true;
};

export const exileByEffect = (gameState: GameState, target: Card, source: Card) => {
  const uid = ownerUidOf(gameState, target);
  if (!uid) return;
  moveCard(gameState, uid, target, 'EXILE', source);
  gameState.logs.push(`[${source.fullName}] 放逐了 [${target.fullName}]。`);
};

export const paymentCost = (amount: number, color?: string): CardEffect['cost'] => {
  const cost: CardEffect['cost'] = async (gameState, playerState, instance) => {
    if (amount <= 0) return true;
  if (!canPayAccessCost(gameState, playerState, amount, color === 'NONE' ? undefined : color, instance)) {
    return false;
  }
  gameState.pendingQuery = {
    id: Math.random().toString(36).substring(7),
    type: 'SELECT_PAYMENT',
    playerUid: playerState.uid,
    options: [],
    title: '支付费用',
    description: `支付${amount}点费用以发动${instance.fullName}。`,
    minSelections: 1,
    maxSelections: 1,
    callbackKey: 'ACTIVATE_COST_RESOLVE',
    paymentCost: amount,
    paymentColor: color || instance.color,
    context: { sourceCardId: instance.gamecardId }
  };
    return true;
  };
  (cost as any).paymentCost = amount;
  (cost as any).paymentColor = color;
  return cost;
};

export const canPayAccessCost = (gameState: GameState, playerState: PlayerState, amount: number, color?: string, sourceCard?: Card) => {
  if (amount <= 0) return true;

  const paymentColor = color || sourceCard?.color;
  const sourceCardId = sourceCard?.gamecardId;
  const hasFeijing = playerState.hand.some(card =>
    card.gamecardId !== sourceCardId &&
    (
      (card.feijingMark && (!paymentColor || card.color === paymentColor)) ||
      (card.id === '204000145' && paymentColor === 'BLUE' && amount <= 3) ||
      (card.id === '205000136' && paymentColor === 'YELLOW' && amount <= 3) ||
      (card.id === '201000132' && paymentColor === 'WHITE' && amount <= 3) ||
      (card.id === '202060130' && sourceCard?.faction === '雷霆')
    )
  );

  let remaining = hasFeijing ? Math.max(0, amount - 3) : amount;
  const getAccessTapValue = (unit: Card) => {
    const data = (unit as any).data || {};
    if (data.accessTapColor && data.accessTapColor !== paymentColor) return 1;
    return Math.max(1, Number(data.accessTapValue || 1));
  };

  const readyUnitValue = playerState.unitZone
    .filter(unit => unit && !unit.isExhausted)
    .reduce((total, unit) => total + getAccessTapValue(unit), 0);
  remaining = Math.max(0, remaining - readyUnitValue);
  if (remaining <= 0) return true;

  const totalErosion = playerState.erosionFront.filter(card => card !== null).length +
    playerState.erosionBack.filter(card => card !== null).length;
  const canUseWindProduction =
    (playerState as any).windProductionTurn === gameState.turnCount &&
    totalErosion + remaining === 10;
  if (!canUseWindProduction && totalErosion + remaining >= 10) return false;

  return playerState.deck.length >= remaining;
};

export const exhaustCost: CardEffect['cost'] = async (gameState, _playerState, instance) => {
  if (instance.isExhausted) return false;
  if ((instance as any).data?.cannotExhaustUntilTurn >= gameState.turnCount) return false;
  instance.isExhausted = true;
  return true;
};

export const erosionCost = (amount: number): CardEffect['cost'] => async (gameState, playerState, instance) => {
  const targets = faceUpErosion(playerState);
  if (targets.length < amount) return false;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    targets,
    `支付侵蚀${amount}`,
    `选择侵蚀区中的${amount}张正面卡，转为背面以支付 [${instance.fullName}] 的费用。`,
    amount,
    amount,
    {
      sourceCardId: instance.gamecardId,
      costType: 'EROSION_COST',
      erosionCostAmount: amount
    },
    () => 'EROSION_FRONT'
  );
  return true;
};

export const searchDeckEffect = (id: string, description: string, predicate: (card: Card, source: Card) => boolean): CardEffect => ({
  id,
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  triggerLocation: ['UNIT'],
  description,
  condition: (_gameState, _playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId && event.data?.zone === 'UNIT',
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.deck.filter(card => predicate(card, instance));
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择加入手牌的卡',
      description,
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: id },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (selected?.cardlocation === 'DECK') {
      moveCard(gameState, playerState.uid, selected, 'HAND', instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
});

export const story = (id: string, description: string, execute: CardEffect['execute'], extra?: Partial<CardEffect>): CardEffect => ({
  id,
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description,
  execute,
  ...extra
});

export const appendEndResolution = (
  gameState: GameState,
  playerUid: string,
  source: Card,
  id: string,
  resolve: CardEffect['resolve'],
  event?: any
) => {
  gameState.pendingResolutions = gameState.pendingResolutions || [];
  gameState.pendingResolutions.push({
    card: source,
    playerUid,
    event,
    effectIndex: -1,
    effect: {
      id,
      type: 'TRIGGER',
      isMandatory: false,
      description: '回合结束时处理延迟效果。',
      resolve
    }
  });
};

export const markExileAtEndOfTurn = (
  gameState: GameState,
  playerUid: string,
  target: Card,
  source: Card,
  id: string,
  _shouldExile: (card: Card, state: GameState) => boolean = card => card.cardlocation === 'UNIT'
) => {
  const targetId = target.gamecardId;
  const data = ensureData(target);
  data.returnToExileAtEndTurn = gameState.turnCount;
  data.returnToExileSourceName = source.fullName;
  data.returnToExileSourceCardId = source.gamecardId;
  data.returnToExileEffectOwnerUid = playerUid;
  data.returnToExileAtEndPredicateKey = 'STILL_IN_UNIT';
  delete data.returnToExileAtEndPredicate;
  addInfluence(target, source, '回合结束时放逐');
};
