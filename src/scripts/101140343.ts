import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { moveCardAsCost } from './BaseUtil';

const SHINGI_KEYWORDS = ['\u795e\u4eea', '\u7ec1\u70b0\u534e'];

const isShingiCard = (card?: Card) =>
  !!card &&
  [card.fullName, card.specialName || ''].some(name =>
    SHINGI_KEYWORDS.some(keyword => name.includes(keyword))
  );

const effect_101140343_shingi_cost_draw: CardEffect = {
  id: '101140343_shingi_cost_draw',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  triggerLocation: ['EXILE'],
  limitCount: 1,
  limitNameType: true,
  isMandatory: true,
  description: '同名1回合1次：这个单位由于卡名含有《神仪》的卡的费用而被放逐时，可以抽1张卡。',
  condition: (gameState, playerState, instance, event) => {
    if (event?.sourceCardId !== instance.gamecardId) return false;
    if (event.data?.sourceZone !== 'UNIT' || event.data?.targetZone !== 'EXILE') return false;
    if ((instance as any).data?.lastMovedAsCostTurn !== gameState.turnCount) return false;

    const sourceCardId = event.data?.effectSourceCardId || (instance as any).data?.lastMovedAsCostSourceCardId;
    const source = sourceCardId ? AtomicEffectExecutor.findCardById(gameState, sourceCardId) : undefined;
    return isShingiCard(source) && playerState.deck.length > 0;
  },
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
};

export const exileDawnFollowerAsShingiCost = (gameState: any, playerUid: string, card: Card, source: Card) => {
  (card as any).data = {
    ...((card as any).data || {}),
    lastMovedAsCostTurn: gameState.turnCount,
    lastMovedAsCostSourceCardId: source.gamecardId,
    lastMovedAsCostSourceName: source.fullName
  };
  moveCardAsCost(gameState, playerUid, card, 'EXILE', source);
};

/**
 * Source CardID: 101140343
 * Source CardNo: BT06-W02
 * Package: BT06(C)
 * Card Detail:
 * 【诱】【同名1回合1次】{这个单位由于卡名含有《神仪》的卡的费用而被放逐时}：你可以抽1张卡。
 */
const card: Card = {
  id: '101140343',
  fullName: '黎明教众',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '女神教会',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_101140343_shingi_cost_draw],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
