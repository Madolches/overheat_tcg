import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, exhaustCost, moveCard, nameContains } from './BaseUtil';

const blueprintGraveCards = (playerState: any) =>
  playerState.grave.filter((card: Card) => nameContains(card, '蓝图'));

const cardEffects: CardEffect[] = [{
  id: '105110403_exhaust_exile_blueprint_grave',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：主要阶段，选择墓地中1张卡名含有《蓝图》的卡，横置自身，将其背面放逐。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    !instance.isExhausted &&
    blueprintGraveCards(playerState).length > 0,
  cost: exhaustCost,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      blueprintGraveCards(playerState),
      '选择蓝图卡',
      '选择你墓地中的1张卡名含有《蓝图》的卡背面放逐。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110403_exhaust_exile_blueprint_grave' },
      () => 'GRAVE'
    );
  },
  targetSpec: {
    title: '选择蓝图卡',
    description: '选择你墓地中的1张卡名含有《蓝图》的卡背面放逐。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      blueprintGraveCards(playerState).map(card => ({ card, source: 'GRAVE' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !blueprintGraveCards(playerState).some(card => card.gamecardId === target.gamecardId)) return;
    moveCard(gameState, playerState.uid, target, 'EXILE', instance, { faceDown: true });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110403
 * Card2 Row: 617
 * Card Row: 501
 * Source CardNo: BT08-Y02
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{选择你墓地中的1张卡名含有《蓝图》的卡}[〖横置〗]:将被选择的卡背面放逐。
 */
const card: Card = {
  id: '105110403',
  fullName: '蓝图策划',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '学院要塞',
  acValue: 1,
  power: 1000,
  basePower: 1000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
