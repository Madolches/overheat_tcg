import { Card, CardEffect, GameEvent, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { canActivateDefaultTiming, moveCardAsCost } from './BaseUtil';

const canPayAccessAfterDiscard = (
  gameState: GameState,
  playerState: PlayerState,
  amount: number,
  color: Card['color'] | undefined,
  sourceCard: Card,
  discardCardId: string
) => {
  const paymentColor = color === 'NONE' ? undefined : color;
  const remainingHand = playerState.hand.filter(card =>
    card.gamecardId !== discardCardId &&
    card.gamecardId !== sourceCard.gamecardId
  );
  const hasFeijingPayment = remainingHand.some(card =>
    (card.feijingMark && (!paymentColor || card.color === paymentColor)) ||
    (card.id === '204000145' && paymentColor === 'BLUE' && amount <= 3) ||
    (card.id === '205000136' && paymentColor === 'YELLOW' && amount <= 3) ||
    (card.id === '201000132' && paymentColor === 'WHITE' && amount <= 3)
  );

  let remaining = hasFeijingPayment ? Math.max(0, amount - 3) : amount;
  const readyUnitValue = playerState.unitZone
    .filter((unit): unit is Card => !!unit && !unit.isExhausted)
    .reduce((total, unit) => {
      const data = (unit as any).data || {};
      if (data.accessTapColor && data.accessTapColor !== paymentColor) return total + 1;
      return total + Math.max(1, Number(data.accessTapValue || 1));
    }, 0);

  remaining = Math.max(0, remaining - readyUnitValue);
  if (remaining <= 0) return true;

  const totalErosion = playerState.erosionFront.filter(Boolean).length +
    playerState.erosionBack.filter(Boolean).length;
  const canUseWindProduction =
    (playerState as any).windProductionTurn === gameState.turnCount &&
    totalErosion + remaining === 10;
  if (!canUseWindProduction && totalErosion + remaining >= 10) return false;

  return playerState.deck.length >= remaining;
};

const feijingCostCandidates = (gameState: GameState, playerState: PlayerState, sourceCard: Card) =>
  playerState.hand.filter(card =>
    card.feijingMark &&
    canPayAccessAfterDiscard(gameState, playerState, 3, sourceCard.color, sourceCard, card.gamecardId)
  );

const trigger_104000222_enter: CardEffect = {
  id: '104000222_enter_combat_guard',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  description: '这个单位进入战场时，直到对手回合结束时为止，这个单位不会被战斗破坏。',
  condition: (_gameState: GameState, _playerState: PlayerState, instance: Card, event?: GameEvent) => {
    if (!event) return instance.cardlocation === 'UNIT';
    return event.type === 'CARD_ENTERED_ZONE' &&
      (event.sourceCardId === instance.gamecardId || event.sourceCard === instance) &&
      event.data?.zone === 'UNIT' &&
      instance.cardlocation === 'UNIT';
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    (instance as any).data = {
      ...((instance as any).data || {}),
      combatImmuneUntilOwnNextTurnStartUid: playerState.uid,
      combatImmuneSourceName: instance.fullName
    };

    EventEngine.recalculateContinuousEffects(gameState);
    gameState.logs.push(`[${instance.fullName}] 获得直到对手回合结束时不会被战斗破坏的效果。`);
  }
};

const activate_104000222_from_erosion: CardEffect = {
  id: '104000222_play_from_erosion',
  type: 'ACTIVATE',
  triggerLocation: ['EROSION_FRONT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：正面的这张卡在侵蚀区时，支付+3并舍弃手牌中的1张具有【菲晶】的卡作为费用，将这张卡放置到战场上。',
  condition: (gameState: GameState, playerState: PlayerState, instance: Card) =>
    instance.cardlocation === 'EROSION_FRONT' &&
    instance.displayState === 'FRONT_UPRIGHT' &&
    playerState.unitZone.some(unit => unit === null) &&
    canActivateDefaultTiming(gameState, playerState) &&
    feijingCostCandidates(gameState, playerState, instance).length > 0,
  cost: async (gameState: GameState, playerState: PlayerState, instance: Card) => {
    const candidates = feijingCostCandidates(gameState, playerState, instance);
    if (candidates.length === 0) return false;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        candidates.map(card => ({ card, source: 'HAND' as any }))
      ),
      title: '选择菲晶费用',
      description: '选择1张具有【菲晶】的手牌舍弃作为费用，之后支付+3。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'ACTIVATE_COST_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectIndex: 1,
        step: 'DISCARD_FEIJING_COST'
      }
    };
    return true;
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step !== 'DISCARD_FEIJING_COST') return;

    const target = feijingCostCandidates(gameState, playerState, instance)
      .find(card => card.gamecardId === selections[0]);
    if (!target) {
      context.cancelActivation = true;
      gameState.logs.push(`[${instance.fullName}] 选择的菲晶费用已不合法，发动中止。`);
      return;
    }

    moveCardAsCost(gameState, playerState.uid, target, 'GRAVE', instance);

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_PAYMENT',
      playerUid: playerState.uid,
      options: [],
      title: `支付 [${instance.fullName}] 的费用`,
      description: '支付+3作为费用，将这张卡从侵蚀区放置到战场上。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'ACTIVATE_COST_RESOLVE',
      paymentCost: 3,
      paymentColor: instance.color,
      context: {
        sourceCardId: instance.gamecardId,
        effectIndex: 1,
        step: 'PAYMENT_COST',
        skipEffectResolveAfterCost: true
      }
    };
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    if (!playerState.unitZone.some(unit => unit === null)) {
      gameState.logs.push(`[${instance.fullName}] 单位区已满，无法放置到战场上。`);
      return;
    }

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_EROSION',
      targetFilter: { gamecardId: instance.gamecardId },
      destinationZone: 'UNIT'
    }, instance);

    const moved = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (moved && moved.cardlocation === 'UNIT') {
      moved.displayState = 'FRONT_UPRIGHT';
      moved.isExhausted = false;
      moved.playedTurn = gameState.turnCount;
    }

    EventEngine.recalculateContinuousEffects(gameState);
    gameState.logs.push(`[${instance.fullName}] 从侵蚀区进入了战场。`);
  }
};

const card: Card = {
  id: '104000222',
  gamecardId: null as any,
  fullName: '阴影盾卫',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { BLUE: 1 },
  faction: '冒险家公会',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    trigger_104000222_enter,
    activate_104000222_from_erosion
  ],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT05',
  uniqueId: null,
};

export default card;
