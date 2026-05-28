import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, exhaustCost, getOpponentUid, isNonGodUnit, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105110227_only_feijing_payment',
  type: 'CONTINUOUS',
  content: 'ONLY_FEIJING_PAYMENT',
  description: '只能通过【菲晶】能力来支付这张卡的使用费用。'
}, {
  id: '105110227_exhaust_unit',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '你的回合中，选择对手1个非神蚀单位，横置这张卡：横置被选择的单位。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    !instance.isExhausted &&
    ownUnits(gameState.players[getOpponentUid(gameState, playerState.uid)]).some(isNonGodUnit),
  cost: exhaustCost,
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(opponent).filter(isNonGodUnit),
      '选择横置目标',
      '选择对手的1个非神蚀单位，将其横置。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110227_exhaust_unit' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择横置目标',
    description: '选择对手的1个非神蚀单位，将其横置。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    step: 'TARGET',
    getCandidates: (gameState, playerState) => {
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      return ownUnits(opponent)
        .filter(isNonGodUnit)
        .map(card => ({ card, source: 'UNIT' as const }));
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    await AtomicEffectExecutor.execute(
      gameState,
      playerState.uid,
      { type: 'ROTATE_HORIZONTAL', targetFilter: { gamecardId: selections[0] } },
      instance
    );
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110227
 * Card2 Row: 391
 * Card Row: 261
 * Source CardNo: BT05-Y05
 * Package: BT05(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:你只能通过【菲晶】能力来支付这张卡的使用费用。
 * 【启】{你的回合中，选择对手的1个非神蚀单位}[〖横置〗]：将被选择的单位〖横置〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110227',
  fullName: '晶能闪耀「艾柯」',
  specialName: '艾柯',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '学院要塞',
  acValue: 3,
  power: 3500,
  basePower: 3500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
