import { Card, CardEffect } from '../types/game';
import {
  canActivateDefaultTiming,
  ensureDeckHasCardsForMove,
  getOpponentUid,
  getTopDeckCards,
  moveCard,
  moveCardAsCost,
  moveRandomGraveToDeckBottom,
} from './BaseUtil';

const enteredByShingiEffect = (card: Card) =>
  !!(card as any).data?.placedByShingiEffectSourceCardId;

const effect_101140347_shingi_leave: CardEffect = {
  id: '101140347_shingi_leave',
  type: 'TRIGGER',
  triggerEvent: ['CARD_LEFT_FIELD', 'CARD_ENTERED_ZONE'],
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'],
  isMandatory: true,
  description: '由于卡名含有《神仪》的卡的效果进入战场后获得：这个单位从战场上离开时，选择1名对手，将其卡组顶2张卡放逐，恢复2。',
  condition: (gameState, _playerState, instance, event) => {
    if (!enteredByShingiEffect(instance) || event?.sourceCardId !== instance.gamecardId) return false;
    if (event.type === 'CARD_LEFT_FIELD' && event.data?.sourceZone === 'UNIT') {
      const data = (instance as any).data || {};
      data.pendingLivianShingiLeaveTurn = gameState.turnCount;
      (instance as any).data = data;
      return true;
    }
    return (
      event.type === 'CARD_ENTERED_ZONE' &&
      event.data?.sourceZone === 'UNIT' &&
      event.data?.zone !== 'UNIT'
    );
  },
  execute: async (instance, gameState, playerState) => {
    if ((instance as any).data) {
      delete (instance as any).data.pendingLivianShingiLeaveTurn;
    }
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    if (!ensureDeckHasCardsForMove(gameState, opponentUid, 2, instance)) return;
    getTopDeckCards(gameState.players[opponentUid], 2).forEach(card =>
      moveCard(gameState, opponentUid, card, 'EXILE', instance)
    );
    moveRandomGraveToDeckBottom(gameState, playerState.uid, Math.min(2, playerState.grave.length), instance);
  }
};

const effect_101140347_shingi_counter: CardEffect = {
  id: '101140347_shingi_counter',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '由于卡名含有《神仪》的卡的效果进入战场后获得：1回合1次，只能在对抗对手使用卡的宣言时发动，将这个单位放逐，反击那张卡。',
  condition: (gameState, playerState, instance) =>
    enteredByShingiEffect(instance) &&
    canActivateDefaultTiming(gameState, playerState) &&
    gameState.phase === 'COUNTERING' &&
    gameState.counterStack.some(item =>
      item.type === 'PLAY' &&
      item.ownerUid !== playerState.uid &&
      !item.isNegated
    ),
  cost: async (gameState, playerState, instance) => {
    if (instance.cardlocation !== 'UNIT') return false;
    moveCardAsCost(gameState, playerState.uid, instance, 'EXILE', instance);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    const opponentPlay = gameState.counterStack.find(item =>
      item.type === 'PLAY' &&
      item.ownerUid !== playerState.uid &&
      !item.isNegated
    );
    if (!opponentPlay) {
      gameState.logs.push(`[${instance.fullName}] 未能找到可反击的使用宣言。`);
      return;
    }
    opponentPlay.isNegated = true;
    (opponentPlay as any).negatedBy101140347 = true;
    gameState.logs.push(`[${instance.fullName}] 反击了 [${opponentPlay.card?.fullName || '对手使用的卡'}]。`);

    for (let i = gameState.counterStack.length - 1; i >= 0; i -= 1) {
      const item = gameState.counterStack[i];
      if (item.type === 'PLAY' && item.ownerUid !== playerState.uid && item.card?.gamecardId === opponentPlay.card?.gamecardId) {
        item.isNegated = true;
        (item as any).negatedBy101140347 = true;
        return;
      }
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140347
 * Card2 Row: 481
 * Card Row: 414
 * Source CardNo: BT06-W11
 * Package: BT06(OHR)，特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：由于卡名含有《神仪》的卡的效果进入战场的这个单位获得下面的效果
 * “【诱】{这个单位从战场上离开时，选择1名对手}：将被选择的玩家的卡组顶的2张卡放逐，恢复2（随机将你的墓地中的2张卡，将其放置到你的卡组底）。”
 * 和“【启】〖1回合1次〗{只能在对抗对手使用卡的宣言时发动}[将这个单位放逐]：反击那张卡。”的能力。
 */
const card: Card = {
  id: '101140347',
  fullName: '菲之使徒「莉薇安」',
  specialName: '莉薇安',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '女神教会',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_101140347_shingi_leave, effect_101140347_shingi_counter],
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
