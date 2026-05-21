import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, getOpponentUid, getTopDeckCards, millTop, moveCard, moveRandomGraveToDeckBottom, revealDeckCards } from './BaseUtil';

const effect_105110284_creation_scar: CardEffect = {
  id: '105110284_creation_scar',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '【创痕1】【启】1回合1次，你的主要阶段，将卡组顶1张卡背面放逐：公开卡组顶1张卡。根据颜色处理红/白/黄效果。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    instance.cardlocation === 'UNIT' &&
    playerState.deck.length >= 2,
  cost: async (gameState, playerState, instance) => {
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CHOICE',
      playerUid: playerState.uid,
      options: [{ id: 'PAY', value: 'PAY', label: '背面放逐卡组顶1张' }],
      title: '支付创痕费用',
      description: '将你的卡组顶1张卡背面放逐作为费用。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'ACTIVATE_COST_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '105110284_creation_scar',
        costType: 'TOP_DECK_FACE_DOWN_EXILE',
        topDeckExileAmount: 1
      }
    };
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    const revealed = revealDeckCards(gameState, playerState.uid, 1, instance)[0];
    if (!revealed) return;

    if (AtomicEffectExecutor.matchesColor(revealed, 'RED')) {
      const opponentUid = getOpponentUid(gameState, playerState.uid);
      millTop(gameState, opponentUid, 3, instance);
    }

    if (AtomicEffectExecutor.matchesColor(revealed, 'WHITE') && playerState.grave.length > 0) {
      moveRandomGraveToDeckBottom(gameState, playerState.uid, Math.min(3, playerState.grave.length), instance);
    }

    if (AtomicEffectExecutor.matchesColor(revealed, 'YELLOW')) {
      const opponentUid = getOpponentUid(gameState, playerState.uid);
      const opponent = gameState.players[opponentUid];
      if (opponent.hand.length > 0) {
        createSelectCardQuery(
          gameState,
          opponentUid,
          opponent.hand,
          '选择舍弃手牌',
          '选择你自己的1张手牌舍弃。',
          1,
          1,
          { sourceCardId: instance.gamecardId, effectId: '105110284_creation_scar', step: 'YELLOW_DISCARD', discardPlayerUid: opponentUid },
          () => 'HAND'
        );
      }
    }

    const top = getTopDeckCards(playerState, 1)[0];
    if (top) gameState.logs.push(`[${instance.fullName}] 公开处理了卡组顶 [${top.fullName}] 的颜色效果。`);
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'YELLOW_DISCARD') return;
    const discardPlayer = gameState.players[context.discardPlayerUid || playerState.uid];
    const target = selections[0] ? discardPlayer?.hand.find(card => card.gamecardId === selections[0]) : undefined;
    if (target) moveCard(gameState, discardPlayer.uid, target, 'GRAVE', instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110284
 * Card2 Row: 443
 * Card Row: 326
 * Source CardNo: SP02-Y01
 * Package: SP02(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕1】【启】〖1回合1次〗{你的主要阶段}[将你卡组顶的1张卡背面放逐]：公开你卡组顶的1张卡。根据那张卡的颜色处理以下效果：
 * ◆	红色：所有对手将他自己的卡组顶的3张卡送入墓地。
 * ◆	白色：恢复3（随机选择你墓地中的3张卡，放置到你的卡组底）。
 * ◆	黄色：所有对手选择他自己的1张手牌舍弃。
 */
const card: Card = {
  id: '105110284',
  fullName: '天魔大公主「斯蒂芬妮」',
  specialName: '斯蒂芬妮',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 3 },
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
  effects: [effect_105110284_creation_scar],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
