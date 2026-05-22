import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { GameService } from '../services/gameService';
import { canMeetBattlefieldColorRequirement, canPutItemOntoBattlefield, canPutUnitOntoBattlefield, createChoiceQuery, createSelectCardQuery, revealDeckCards } from './BaseUtil';
import { moveCard } from './BaseUtil';

const getErosionTotal = (playerState: any) =>
  playerState.erosionFront.filter((card: Card | null) => !!card).length +
  playerState.erosionBack.filter((card: Card | null) => !!card).length;

const getFaceUpErosionFront = (playerState: any) =>
  playerState.erosionFront.filter((card: Card | null): card is Card => !!card && card.displayState === 'FRONT_UPRIGHT');

const canUse204000145AsPaymentSubstitute = (card: Card | undefined, paymentColor?: string, cost?: number, playingCardId?: string) =>
  !!card &&
  card.id === '204000145' &&
  card.gamecardId !== playingCardId &&
  paymentColor === 'BLUE' &&
  !!cost &&
  cost > 0 &&
  cost <= 3;

const canUse205000136AsPaymentSubstitute = (card: Card | undefined, paymentColor?: string, cost?: number, playingCardId?: string) =>
  !!card &&
  card.id === '205000136' &&
  card.gamecardId !== playingCardId &&
  paymentColor === 'YELLOW' &&
  !!cost &&
  cost > 0 &&
  cost <= 3;

const getEffectiveLimitGodmarkCount = (playerState: any, card: Card) => {
  const fieldEffect = playerState.unitZone
    .filter((unit: Card | null): unit is Card => !!unit)
    .flatMap((unit: Card) => unit.effects || [])
    .find((effect: CardEffect) => effect.type === 'CONTINUOUS' && effect.limitGodmarkCount !== undefined);
  const selfEffect = (card.effects || []).find(effect => effect.type === 'CONTINUOUS' && effect.limitGodmarkCount !== undefined);
  return fieldEffect?.limitGodmarkCount ?? selfEffect?.limitGodmarkCount;
};

const canAffordCardCost = (gameState: any, playerState: any, card: Card) => {
  const cost = GameService.getEffectivePlayCost(gameState, playerState, card);
  if (cost < 0) {
    return getFaceUpErosionFront(playerState).length >= Math.abs(cost);
  }

  if (cost === 0) return true;

  let remainingCost = cost;
  const hasSpecialSubstitute = playerState.hand.some((handCard: Card) =>
    canUse204000145AsPaymentSubstitute(handCard, card.color, cost, card.gamecardId) ||
    canUse205000136AsPaymentSubstitute(handCard, card.color, cost, card.gamecardId)
  );
  if (hasSpecialSubstitute) {
    return true;
  }

  const hasFeijing = playerState.hand.some((handCard: Card) =>
    handCard.gamecardId !== card.gamecardId &&
    handCard.feijingMark &&
    handCard.color === card.color
  );
  if (hasFeijing) {
    remainingCost = Math.max(0, remainingCost - 3);
  }

  const readyUnitsCount = playerState.unitZone.filter((unit: Card | null) => !!unit && !unit.isExhausted).length;
  remainingCost = Math.max(0, remainingCost - readyUnitsCount);
  if (remainingCost <= 0) return true;

  return getErosionTotal(playerState) + remainingCost < 10;
};

const canUseRevealedCard = (gameState: any, playerState: any, card: Card) => {
  const playCheck = GameService.canPlayCard(gameState, playerState, card);
  if (!playCheck.canPlay) return false;
  if (!canMeetBattlefieldColorRequirement(playerState, card)) return false;
  if (!canAffordCardCost(gameState, playerState, card)) return false;
  if (playerState.factionLock && card.faction !== playerState.factionLock) return false;

  if (card.type === 'UNIT') {
    if (!canPutUnitOntoBattlefield(playerState, card)) return false;
    if (card.godMark) {
      const limit = getEffectiveLimitGodmarkCount(playerState, card);
      if (limit !== undefined) {
        const currentGodmarkCount = playerState.unitZone.filter((unit: Card | null) => !!unit && unit.godMark).length;
        if (currentGodmarkCount >= limit) return false;
      }
    }
    return true;
  }

  if (card.type === 'ITEM') {
    return canPutItemOntoBattlefield(playerState, card);
  }

  const effect = card.effects?.find(e => e.type === 'ALWAYS' || e.type === 'ACTIVATE' || e.type === 'ACTIVATED');
  if (effect) {
    const validationLocation = effect.triggerLocation?.includes('PLAY')
      ? 'PLAY'
      : effect.triggerLocation?.[0] || 'PLAY';
    const result = GameService.checkEffectLimitsAndReqs(
      gameState,
      playerState.uid,
      card,
      effect,
      validationLocation
    );
    if (!result.valid) return false;
  }
  return true;
};

const recordRevealedCardUsage = (gameState: any, playerUid: string, card: Card, effect?: CardEffect) => {
  const player = gameState.players[playerUid];
  if (!player) return;

  if (card.faction) {
    if (!player.factionsUsedThisTurn) player.factionsUsedThisTurn = [];
    if (!player.factionsUsedThisTurn.includes(card.faction)) {
      player.factionsUsedThisTurn.push(card.faction);
    }
  }

  if (!effect?.limitCount) return;

  if (!gameState.effectUsage) {
    gameState.effectUsage = {};
  }

  const key = effect.limitGlobal
    ? (effect.limitNameType
      ? `game_${playerUid}_name_${card.id}_${effect.id}`
      : `game_${playerUid}_instance_${card.gamecardId}_${effect.id}`)
    : (effect.limitNameType
      ? `turn_${gameState.turnCount}_${playerUid}_name_${card.id}_${effect.id}`
      : `turn_${gameState.turnCount}_${playerUid}_instance_${card.gamecardId}_${effect.id}`);

  gameState.effectUsage[key] = (gameState.effectUsage[key] || 0) + 1;
};

const executeRevealedCard = async (instance: Card, gameState: any, playerState: any, cardId: string) => {
  const revealed = AtomicEffectExecutor.findCardById(gameState, cardId);
  if (!revealed || revealed.cardlocation !== 'DECK') return;

  recordRevealedCardUsage(gameState, playerState.uid, revealed);

  if (revealed.type === 'UNIT') {
    AtomicEffectExecutor.moveCard(
      gameState,
      playerState.uid,
      'DECK',
      playerState.uid,
      'UNIT',
      revealed.gamecardId,
      true,
      {
        effectSourcePlayerUid: playerState.uid,
        effectSourceCardId: instance.gamecardId
      }
    );
    revealed.playedTurn = gameState.turnCount;
    gameState.logs.push(`[${instance.fullName}] used the revealed unit [${revealed.fullName}].`);
    return;
  }

  if (revealed.type === 'ITEM') {
    AtomicEffectExecutor.moveCard(
      gameState,
      playerState.uid,
      'DECK',
      playerState.uid,
      'ITEM',
      revealed.gamecardId,
      true,
      {
        effectSourcePlayerUid: playerState.uid,
        effectSourceCardId: instance.gamecardId
      }
    );
    gameState.logs.push(`[${instance.fullName}] used the revealed item [${revealed.fullName}].`);
    return;
  }

  const effect = revealed.effects?.find(e => e.type === 'ALWAYS' || e.type === 'ACTIVATE' || e.type === 'ACTIVATED');
  if (!effect) return;

  recordRevealedCardUsage(gameState, playerState.uid, revealed, effect);

  AtomicEffectExecutor.moveCard(
    gameState,
    playerState.uid,
    'DECK',
    playerState.uid,
    'PLAY',
    revealed.gamecardId,
    true,
    {
      effectSourcePlayerUid: playerState.uid,
      effectSourceCardId: instance.gamecardId
    }
  );

  EventEngine.dispatchEvent(gameState, {
    type: 'CARD_PLAYED',
    sourceCard: revealed,
    playerUid: playerState.uid,
    sourceCardId: revealed.gamecardId
  });

  if (effect.atomicEffects) {
    for (const atomicEffect of effect.atomicEffects) {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, atomicEffect, revealed);
    }
  }

  if (effect.execute) {
    await (effect.execute as any)(revealed, gameState, playerState);
  }

  AtomicEffectExecutor.moveCard(
    gameState,
    playerState.uid,
    'PLAY',
    playerState.uid,
    'GRAVE',
    revealed.gamecardId,
    true,
    {
      effectSourcePlayerUid: playerState.uid,
      effectSourceCardId: instance.gamecardId
    }
  );

  gameState.logs.push(`[${instance.fullName}] used the revealed story [${revealed.fullName}].`);
};

const effect_105110115_stack_top: CardEffect = {
  id: '105110115_stack_top',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '每回合一次，支付2费，选择1张卡牌放到卡组顶。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.deck.length > 0,
  cost: async (gameState, playerState, instance) => {
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_PAYMENT',
      playerUid: playerState.uid,
      options: [],
      title: '支付费用',
      description: '支付2费，选择1张卡牌放到卡组顶。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'ACTIVATE_COST_RESOLVE',
      paymentCost: 2,
      paymentColor: 'NONE',
      context: {
        sourceCardId: instance.gamecardId,
        effectIndex: 0,
        effectId: '105110115_stack_top'
      }
    };
    return true;
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'SELECT_TOP_CARD') {
      const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
      if (!target || target.cardlocation !== 'DECK') return;

      moveCard(gameState, playerState.uid, target, 'DECK', instance);
      gameState.logs.push(`[${instance.fullName}] put [${target.fullName}] on top of the deck.`);
      return;
    }

    createSelectCardQuery(
      gameState,
      playerState.uid,
      [...playerState.deck],
      '选择卡牌',
      '选择1张卡牌放到卡组顶。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '105110115_stack_top',
        step: 'SELECT_TOP_CARD'
      },
      () => 'DECK'
    );
  },
  execute: async () => {
    // Resolved through the cost query chain.
  }
};

const effect_105110115_reveal_use_top: CardEffect = {
  id: '105110115_reveal_use_top',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  erosionTotalLimit: [3, 5],
  description: '侵蚀区数量3-5时，每回合一次，公开卡组顶的1张卡。若符合使用条件，你可以立刻支付ACCESS值来使用那张卡。否则，将其按原样放回。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    instance.cardlocation === 'UNIT' &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    const revealed = revealDeckCards(gameState, playerState.uid, 1, instance)[0];
    if (!revealed) return;

    if (!canUseRevealedCard(gameState, playerState, revealed)) {
      gameState.logs.push(`[${instance.fullName}] revealed [${revealed.fullName}], but it could not be used.`);
      return;
    }

    createChoiceQuery(
      gameState,
      playerState.uid,
      '使用展示的卡',
      `公开的卡牌：${revealed.fullName}。立即使用它？`,
      [
        { id: 'YES', label: '使用' },
        { id: 'NO', label: '不使用' }
      ],
      {
        sourceCardId: instance.gamecardId,
        effectId: '105110115_reveal_use_top',
        step: 'ASK_USE_REVEALED',
        targetId: revealed.gamecardId
      }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'SELECT_TOP_CARD') {
      const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
      if (!target || target.cardlocation !== 'DECK') return;

      moveCard(gameState, playerState.uid, target, 'DECK', instance);
      gameState.logs.push(`[${instance.fullName}] put [${target.fullName}] on top of the deck.`);
      return;
    }

    if (context?.step === 'ASK_USE_REVEALED') {
      if (selections[0] !== 'YES') return;

      const revealed = AtomicEffectExecutor.findCardById(gameState, context.targetId);
      if (!revealed || revealed.cardlocation !== 'DECK') return;

      const cost = GameService.getEffectivePlayCost(gameState, playerState, revealed);
      if (cost < 0) {
        const candidates = getFaceUpErosionFront(playerState);
        if (candidates.length < Math.abs(cost)) return;

        createSelectCardQuery(
          gameState,
          playerState.uid,
          candidates,
          '选择侵蚀卡',
          `选择${Math.abs(cost)}张正面朝上的侵蚀区卡牌送到墓地。`,
          Math.abs(cost),
          Math.abs(cost),
          {
            sourceCardId: instance.gamecardId,
            effectId: '105110115_reveal_use_top',
            step: 'PAY_NEGATIVE_COST',
            targetId: revealed.gamecardId
          },
          () => 'EROSION_FRONT'
        );
        return;
      }

      if (cost > 0) {
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_PAYMENT',
          playerUid: playerState.uid,
          options: [],
          title: `支付费用：${revealed.fullName}`,
          description: `支付${cost}点费用以使用展示的卡。`,
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          paymentCost: cost,
          paymentColor: revealed.color,
          context: {
            sourceCardId: instance.gamecardId,
            effectId: '105110115_reveal_use_top',
            step: 'PAY_POSITIVE_COST',
            targetId: revealed.gamecardId,
            targetCardId: revealed.gamecardId
          }
        };
        return;
      }

      await executeRevealedCard(instance, gameState, playerState, revealed.gamecardId);
      return;
    }

    if (context?.step === 'PAY_NEGATIVE_COST') {
      for (const selectedId of selections) {
        const costCard = AtomicEffectExecutor.findCardById(gameState, selectedId);
        if (costCard && costCard.cardlocation === 'EROSION_FRONT') {
          moveCard(gameState, playerState.uid, costCard, 'GRAVE', instance);
        }
      }
      await executeRevealedCard(instance, gameState, playerState, context.targetId);
      return;
    }

    if (context?.step === 'PAY_POSITIVE_COST') {
      await executeRevealedCard(instance, gameState, playerState, context.targetId);
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110115
 * Card2 Row: 81
 * Card Row: 81
 * Source CardNo: BT01-Y09
 * Package: BT01(SR,ESR,OHR),BTO3(FVR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗:[〖+2〗]选择你的卡组中的1张卡，放置到卡组顶。
 * 〖3~5〗【启】〖1回合1次〗:这个能力只能在你的主要阶段中发动，且不能用于对抗。公开你的卡组顶的1张卡。若符合使用条件，你可以立刻支付ACCESS值来使用那张卡。否则，将其按原样放回。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110115',
  fullName: '阿卡迪亚圣女「真理」',
  specialName: '真理',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '学院要塞',
  acValue: 4,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105110115_stack_top, effect_105110115_reveal_use_top],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
