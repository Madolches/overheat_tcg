import { Card, CardEffect } from '../types/game';
import { addContinuousDamage, canPutUnitOntoBattlefield, discardHandCost, moveCard, ownUnits, ownerOf, totalErosionCount } from './BaseUtil';

const ADVENTURER = '冒险家公会';

const isAdventurerUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (card.faction === ADVENTURER || card.fullName.includes('冒险家公会'));

const hasHammo = (playerState: any) =>
  ownUnits(playerState).some(unit =>
    unit.id === '104030306' ||
    unit.specialName === '汉莫' ||
    unit.fullName.includes('汉莫')
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
  id: '104030307_buff_with_hammo',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '你的战场上有「汉莫」单位时，这个单位伤害+2，不会被战斗破坏。',
  applyContinuous: (gameState, instance) => {
    const owner = ownerOf(gameState, instance);
    if (!owner || !hasHammo(owner)) return;
    addContinuousDamage(instance, instance, 2);
    (instance as any).battleImmuneByEffect = true;
  }
}, {
  id: '104030307_enter_from_erosion',
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
 * Source CardID: 104030307
 * Card2 Row: 537
 * Card Row: 357
 * Source CardNo: BT07-B04
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】{你的战场上有「汉莫」单位}：这个单位〖伤害+2〗，这个单位不会被战斗破坏。
 * 【4-7】【启】：{你的主要阶段，你的战场上<冒险家工会>的单位有2个以上}［舍弃1张手牌］：将侵蚀区中正面的这张卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104030307',
  fullName: '旋风狂斧「艾咪」',
  specialName: '艾咪',
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
