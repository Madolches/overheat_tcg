import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, backErosionCount, canPayAccessCost, getOpponentUid } from './BaseUtil';

const findOpponentNonGodPlay = (gameState: any, playerUid: string) => {
  const opponentUid = getOpponentUid(gameState, playerUid);
  return gameState.counterStack?.slice().reverse().find((item: any) =>
    item.type === 'PLAY' &&
    item.ownerUid === opponentUid &&
    item.card &&
    !item.card.godMark &&
    !item.isNegated
  );
};

const cardEffects: CardEffect[] = [{
  id: '204000097_check_counter',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  limitCount: 1,
  limitNameType: true,
  erosionBackLimit: [1, 10],
  description: '创痕1，对手宣言使用非神蚀卡时：对手可以支付AC+2。若不支付，反击那张卡并将其返回持有者手牌。',
  condition: (gameState, playerState) =>
    gameState.phase === 'COUNTERING' &&
    backErosionCount(playerState) >= 1 &&
    !!findOpponentNonGodPlay(gameState, playerState.uid),
  execute: async (instance, gameState, playerState) => {
    const stackItem = findOpponentNonGodPlay(gameState, playerState.uid);
    if (!stackItem?.card) return;
    const opponentUid = stackItem.ownerUid;
    const tax = (stackItem.card.acValue || 0) + 2;
    if (tax > 0 && canPayAccessCost(gameState, gameState.players[opponentUid], tax, stackItem.card.color, stackItem.card)) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_PAYMENT',
        playerUid: opponentUid,
        options: [],
        title: '支付检查费用',
        description: `支付 ${tax} 点费用以防止 [${instance.fullName}] 反击。`,
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        paymentCost: tax,
        paymentColor: stackItem.card.color,
        context: {
          sourceCardId: instance.gamecardId,
          effectId: '204000097_check_counter',
          step: 'PAY_TAX',
          targetCardId: stackItem.card.gamecardId,
          activationPlayerUid: opponentUid
        }
      };
      return;
    }
    stackItem.isNegated = true;
    AtomicEffectExecutor.moveCard(gameState, opponentUid, 'PLAY', opponentUid, 'HAND', stackItem.card.gamecardId, true, {
      effectSourcePlayerUid: playerState.uid,
      effectSourceCardId: instance.gamecardId
    });
  },
  onQueryResolve: async (instance, gameState, _playerState, _selections, context) => {
    if (context?.step === 'PAY_TAX') {
      gameState.logs.push(`[${instance.fullName}] 对手支付了追加费用，未被反击。`);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 204000097
 * Card2 Row: 467
 * Card Row: 401
 * Source CardNo: BT06-B08
 * Package: BT06(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕1】（你的侵蚀区中的背面卡有1张以上时才有效）
 * 〖同名1回合1次〗{对手宣言使用非神蚀卡时}：对手可以支付AC+2。若不支付，反击那张卡并将其返回持有者手牌。
 */
const card: Card = {
  id: '204000097',
  fullName: '检查',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
