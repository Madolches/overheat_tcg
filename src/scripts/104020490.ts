import { Card, CardEffect, GameEvent, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const getOpponentRotatedTargets = (gameState: GameState, playerState: PlayerState, event?: GameEvent) => {
  if (!event || event.type !== 'CARD_ROTATED') return [] as Card[];
  if (event.data?.direction !== 'HORIZONTAL') return [] as Card[];
  if (event.data?.effectSourcePlayerUid !== playerState.uid) return [] as Card[];
  if (!event.data?.effectSourceCardId) return [] as Card[];

  const candidateIds = Array.isArray(event.data?.allTargetCardIds) && event.data.allTargetCardIds.length > 0
    ? event.data.allTargetCardIds
    : (event.targetCardId ? [event.targetCardId] : []);

  const opponentId = gameState.playerIds.find(id => id !== playerState.uid)!;

  return candidateIds
    .map(cardId => AtomicEffectExecutor.findCardById(gameState, cardId))
    .filter((card): card is Card =>
      !!card &&
      card.type === 'UNIT' &&
      AtomicEffectExecutor.findCardOwnerKey(gameState, card.gamecardId) === opponentId
    );
};

const trigger_104020490_freeze: CardEffect = {
  id: '104020490_freeze_trigger',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ROTATED',
  isMandatory: false,
  isGlobal: true,
  limitCount: 1,
  limitNameType: true,
  description: '【诱发】【卡名一回合一次】当对手的单位由于你的卡的效果横置时：你可以选择发动，丢弃1张手牌，选择那些单位中的1个。下一次对手的回合开始阶段中，那个单位不能竖置。',
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    if (playerState.hand.length === 0) return false;
    const targets = getOpponentRotatedTargets(gameState, playerState, event);
    if (targets.length === 0) return false;
    (instance as any).data = {
      ...((instance as any).data || {}),
      reporterTargetIds: targets.map(card => card.gamecardId)
    };
    return true;
  },
  targetSpec: {
    title: '选择不能竖置的单位',
    description: '选择其中1个单位。下一次对手的回合开始阶段中，那个单位不能竖置。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    step: 'SELECT_TARGET',
    getCandidates: (gameState, playerState, instance) => {
      const targetIds = ((instance as any).data?.reporterTargetIds || []) as string[];
      const opponentId = gameState.playerIds.find(id => id !== playerState.uid)!;
      return targetIds
        .map(cardId => AtomicEffectExecutor.findCardById(gameState, cardId))
        .filter((card): card is Card =>
          !!card &&
          card.type === 'UNIT' &&
          card.isExhausted === true &&
          AtomicEffectExecutor.findCardOwnerKey(gameState, card.gamecardId) === opponentId
        )
        .map(card => ({ card, source: 'UNIT' as any }));
    }
  },
  cost: async (gameState: GameState, playerState: PlayerState, instance: Card, context?: any) => {
    const targets = getOpponentRotatedTargets(gameState, playerState, context?.event);
    if (targets.length === 0 || playerState.hand.length === 0) return false;
    (instance as any).data = {
      ...((instance as any).data || {}),
      reporterTargetIds: targets.map(card => card.gamecardId)
    };

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        playerState.hand.map(card => ({ card, source: 'HAND' as any }))
      ),
      title: '选择舍弃的手牌',
      description: '请选择1张手牌舍弃作为费用。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'ACTIVATE_COST_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectIndex: 0,
        step: 'DISCARD_COST',
        costType: 'DISCARD_HAND_COST',
        discardCostAmount: 1,
        skipEffectResolveAfterCost: true,
        targetIds: targets.map(card => card.gamecardId)
      }
    };
    return true;
  },
  onCostResolve: async (_instance: Card, _gameState: GameState, _playerState: PlayerState, _selections: string[], context: any) => {
    if (context?.step !== 'DISCARD_COST') return;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState, event?: GameEvent) => {
    const rememberedTargetIds = ((instance as any).data?.reporterTargetIds || []) as string[];
    const opponentId = gameState.playerIds.find(id => id !== playerState.uid)!;
    const targets = rememberedTargetIds.length > 0
      ? rememberedTargetIds
          .map(cardId => AtomicEffectExecutor.findCardById(gameState, cardId))
          .filter((card): card is Card =>
            !!card &&
            card.type === 'UNIT' &&
            card.isExhausted === true &&
            AtomicEffectExecutor.findCardOwnerKey(gameState, card.gamecardId) === opponentId
          )
      : getOpponentRotatedTargets(gameState, playerState, event);
    if (targets.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        targets.map(card => ({ card, source: 'UNIT' as any }))
      ),
      title: '选择不能竖置的单位',
      description: '选择其中1个单位。下一次对手的回合开始阶段中，那个单位不能竖置。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectIndex: 0,
        step: 'SELECT_TARGET',
        targetIds: targets.map(card => card.gamecardId)
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step === 'DISCARD') {
      const discardId = selections[0];
      const discardCard = playerState.hand.find(card => card.gamecardId === discardId);
      if (!discardCard) {
        gameState.logs.push(`[${instance.fullName}] 选择的手牌已不合法，效果中止。`);
        return;
      }

      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'DISCARD_CARD',
        targetFilter: { gamecardId: discardId }
      }, instance);

      const opponentId = gameState.playerIds.find(id => id !== playerState.uid)!;
      const validTargets = ((context?.targetIds || []) as string[])
        .map(cardId => AtomicEffectExecutor.findCardById(gameState, cardId))
        .filter((card): card is Card =>
          !!card &&
          card.type === 'UNIT' &&
          card.isExhausted === true &&
          AtomicEffectExecutor.findCardOwnerKey(gameState, card.gamecardId) === opponentId
        );

      if (validTargets.length === 0) {
        gameState.logs.push(`[${instance.fullName}] 没有仍然合法的目标单位，效果结算结束。`);
        return;
      }

      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(
          gameState,
          playerState.uid,
          validTargets.map(card => ({ card, source: 'UNIT' as any }))
        ),
        title: '选择不能竖置的单位',
        description: '请选择其中1个单位。该单位在下一次对手的回合开始阶段中不能竖置。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          sourceCardId: instance.gamecardId,
          effectIndex: 0,
          step: 'SELECT_TARGET'
        }
      };
      return;
    }

    if (context?.step === 'SELECT_TARGET') {
      const targetId = selections[0];
      const targetIds = new Set(((context?.targetIds || []) as string[]));
      const opponentId = gameState.playerIds.find(id => id !== playerState.uid)!;
      const targetCard = AtomicEffectExecutor.findCardById(gameState, targetId);
      if (
        !targetCard ||
        targetCard.type !== 'UNIT' ||
        targetCard.isExhausted !== true ||
        (targetIds.size > 0 && !targetIds.has(targetCard.gamecardId)) ||
        AtomicEffectExecutor.findCardOwnerKey(gameState, targetCard.gamecardId) !== opponentId
      ) {
        gameState.logs.push(`[${instance.fullName}] 目标已不合法，效果结算失败。`);
        if ((instance as any).data) delete (instance as any).data.reporterTargetIds;
        return;
      }

      targetCard.canResetCount = Math.max(targetCard.canResetCount || 0, 1);
      if ((instance as any).data) delete (instance as any).data.reporterTargetIds;
      gameState.logs.push(`[${instance.fullName}] 使 [${targetCard.fullName}] 在下一次对手的回合开始阶段中不能竖置。`);
    }
  }
};

const card: Card = {
  id: '104020490',
  fullName: '新锐记者',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '九尾商会联盟',
  acValue: 3,
  power: 1500,
  basePower: 1500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [trigger_104020490_freeze],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: '特殊',
  uniqueId: null,
};

export default card;
