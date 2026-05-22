import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canMeetBattlefieldColorRequirement, canPayAccessCost, canPutItemOntoBattlefield, createChoiceQuery, createSelectCardQuery, revealDeckCards } from './BaseUtil';
import { moveCard } from './BaseUtil';

const canUseErosionItem = (gameState: any, playerState: any, card: Card) =>
  card.type === 'ITEM' &&
  canPutItemOntoBattlefield(playerState, card) &&
  canMeetBattlefieldColorRequirement(playerState, card) &&
  canPayAccessCost(gameState, playerState, card.acValue || 0, undefined, card);

const effect_105110113_continuous: CardEffect = {
  id: '105110113_continuous',
  type: 'CONTINUOUS',
  description: '如果你的战场上的道具卡有2张以上的话，这个单位〖伤害+1〗〖力量+1000〗。',
  applyContinuous: (gameState, instance) => {
    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId);
    if (!ownerUid) return;

    const owner = gameState.players[ownerUid];
    const itemCount = owner.itemZone.filter((card): card is Card => !!card).length;
    if (itemCount < 2) return;

    instance.damage = (instance.damage || 0) + 1;
    instance.power = (instance.power || 0) + 1000;
    instance.influencingEffects = instance.influencingEffects || [];
    instance.influencingEffects.push({
      sourceCardName: instance.fullName,
      description: '战场上的道具卡数量：+1伤害 / +1000力量'
    });
  }
};

const effect_105110113_use_erosion_item: CardEffect = {
  id: '105110113_use_erosion_item',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '主要阶段。支付ACCESS费用，从你的侵蚀区使用1张道具卡。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    instance.cardlocation === 'UNIT' &&
    playerState.erosionFront.some(
      (card): card is Card => !!card && canUseErosionItem(gameState, playerState, card)
    ),
  execute: async (instance, gameState, playerState) => {
    const targets = playerState.erosionFront.filter(
      (card): card is Card => !!card && canUseErosionItem(gameState, playerState, card)
    );
    if (targets.length === 0) return;

    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择道具卡',
      '选择1张来自侵蚀区的道具卡，支付其ACCESS费用来使用。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '105110113_use_erosion_item',
        step: 'CHOOSE_ITEM'
      },
      () => 'EROSION_FRONT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'CHOOSE_ITEM') {
      const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
      if (!target || target.cardlocation !== 'EROSION_FRONT' || target.type !== 'ITEM') return;

      if (!canUseErosionItem(gameState, playerState, target)) return;

      if ((target.acValue || 0) > 0) {
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_PAYMENT',
          playerUid: playerState.uid,
          options: [],
          title: `支付费用：${target.fullName}`,
          description: `支付${target.acValue}点费用以从侵蚀区使用这张道具卡。`,
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          paymentCost: target.acValue,
          paymentColor: 'NONE',
          context: {
            sourceCardId: instance.gamecardId,
            effectId: '105110113_use_erosion_item',
            step: 'PAY_AND_USE_ITEM',
            targetId: target.gamecardId,
            useEffectiveCardCost: false
          }
        };
        return;
      }

      await AtomicEffectExecutor.execute(
        gameState,
        playerState.uid,
        {
          type: 'MOVE_FROM_EROSION',
          targetFilter: { gamecardId: target.gamecardId },
          destinationZone: 'ITEM'
        },
        instance
      );
      gameState.logs.push(`[${instance.fullName}] 使用了 [${target.fullName}] 从侵蚀区.`);
      return;
    }

    if (context?.step !== 'PAY_AND_USE_ITEM') return;

    const target = AtomicEffectExecutor.findCardById(gameState, context.targetId);
    if (!target || target.cardlocation !== 'EROSION_FRONT' || target.type !== 'ITEM') return;
    if (!canUseErosionItem(gameState, playerState, target)) return;

    await AtomicEffectExecutor.execute(
      gameState,
      playerState.uid,
      {
        type: 'MOVE_FROM_EROSION',
        targetFilter: { gamecardId: target.gamecardId },
        destinationZone: 'ITEM'
      },
      instance
    );
    gameState.logs.push(`[${instance.fullName}] paid to use [${target.fullName}] from the erosion zone.`);
  }
};

const effect_105110113_reveal_top: CardEffect = {
  id: '105110113_reveal_top',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '你的回合。公开你卡组顶的1张卡，然后将那张卡放置到卡组顶或卡组底。',
  condition: (_gameState, playerState, instance) =>
    playerState.isTurn &&
    instance.cardlocation === 'UNIT' &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    const revealed = revealDeckCards(gameState, playerState.uid, 1, instance)[0];
    if (!revealed) return;

    createChoiceQuery(
      gameState,
      playerState.uid,
      '卡组顶选择',
      `展示的卡：${revealed.fullName}`,
      [
        { id: 'TOP', label: '置顶' },
        { id: 'BOTTOM', label: '置底' }
      ],
      {
        sourceCardId: instance.gamecardId,
        effectId: '105110113_reveal_top',
        targetId: revealed.gamecardId
      }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (selections[0] !== 'BOTTOM') return;

    const target = AtomicEffectExecutor.findCardById(gameState, context?.targetId);
    if (!target || target.cardlocation !== 'DECK') return;

    moveCard(gameState, playerState.uid, target, 'DECK', instance, { insertAtBottom: true });
    gameState.logs.push(`[${instance.fullName}] 将 [${target.fullName}] 放置在卡组底。`);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110113
 * Card2 Row: 79
 * Card Row: 79
 * Source CardNo: BT01-Y07
 * Package: BT01(R),特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：若你的战场上的道具卡有2张以上的话，这个单位〖伤害+1〗〖力量+1000〗。
 * 【启】〖1回合1次〗:你的主要阶段中才可以发动，且不能用于对抗。支付ACCESS值来使用你的侵蚀区中的1张道具卡。
 * 【启】〖1回合1次〗:你的回合中才可以发动。公开你的卡组顶的1张卡，将那张卡放置到卡组顶或卡组底。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110113',
  fullName: '辅助官「希克」',
  specialName: '希克',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '学院要塞',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    effect_105110113_continuous,
    effect_105110113_use_erosion_item,
    effect_105110113_reveal_top
  ],
  rarity: 'R',
  availableRarities: ['R', 'PR'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
