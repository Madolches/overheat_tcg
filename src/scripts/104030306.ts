import { Card, CardEffect } from '../types/game';
import { canPutUnitOntoBattlefield, discardHandCost, moveCard, ownUnits, ownerOf, preventFirstAnyDestroyEachTurn, totalErosionCount } from './BaseUtil';

const ADVENTURER = '冒险家公会';

const isAdventurerUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (card.faction === ADVENTURER || card.fullName.includes('冒险家公会'));

const hasAmy = (playerState: any) =>
  ownUnits(playerState).some(unit =>
    unit.id === '104030307' ||
    unit.specialName === '艾咪' ||
    unit.fullName.includes('艾咪')
  );

const canErosionEnter = (gameState: any, playerState: any, instance: Card) =>
  playerState.isTurn &&
  gameState.phase === 'MAIN' &&
  instance.cardlocation === 'EROSION_FRONT' &&
  instance.displayState === 'FRONT_UPRIGHT' &&
  totalErosionCount(playerState) >= 4 &&
  totalErosionCount(playerState) <= 7 &&
  ownUnits(playerState).filter(isAdventurerUnit).length >= 2 &&
  playerState.hand.length > 0 &&
  canPutUnitOntoBattlefield(playerState, instance);

const cardEffects: CardEffect[] = [{
  id: '104030306_prevent_adventurer_first_destroy',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '你的战场上有「艾咪」单位时，你的<冒险家公会>单位每回合第一次将被破坏时防止。',
  applyContinuous: (gameState, instance) => {
    const owner = ownerOf(gameState, instance);
    if (!owner || !hasAmy(owner)) return;
    ownUnits(owner).filter(isAdventurerUnit).forEach(unit => preventFirstAnyDestroyEachTurn(unit, instance));
  }
}, {
  id: '104030306_enter_from_erosion',
  type: 'ACTIVATE',
  triggerLocation: ['EROSION_FRONT'],
  erosionTotalLimit: [4, 7],
  description: '4-7：你的主要阶段，若你有2个以上<冒险家公会>单位，舍弃1张手牌，将正面侵蚀区的这张卡放置到战场。',
  condition: canErosionEnter,
  cost: discardHandCost(1),
  execute: async (instance, gameState, playerState) => {
    moveCard(gameState, playerState.uid, instance, 'UNIT', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104030306
 * Card2 Row: 536
 * Card Row: 356
 * Source CardNo: BT07-B03
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】{你的战场上有「艾咪」单位}：你的战场上的<冒险家公会>的单位每个回合中第一次将要被破坏时，防止那次破坏。
 * 【4-7】【启】：{你的主要阶段，你的战场上<冒险家工会>的单位有2个以上}［舍弃1张手牌］：将侵蚀区中正面的这张卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104030306',
  fullName: '沉默巨盾「汉莫」',
  specialName: '汉莫',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
  faction: '冒险家公会',
  acValue: 4,
  power: 2500,
  basePower: 2500,
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
