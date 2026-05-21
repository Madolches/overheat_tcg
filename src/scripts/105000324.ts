import { Card, CardEffect } from '../types/game';
import { addTempDamage, addTempPower, discardHandCost } from './BaseUtil';

const addTemporaryColor = (card: Card, color: string) => {
  card.temporaryExtraColors = Array.from(new Set([
    ...(card.temporaryExtraColors || []),
    color as any
  ]));
};

const effect_105000324_boost_colors: CardEffect = {
  id: '105000324_boost_colors',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '【启】1回合1次，舍弃1张手牌：本回合中，这个单位伤害+1、力量+500并也具备红色和蓝色。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.hand.some(card => card.gamecardId !== instance.gamecardId),
  cost: discardHandCost(1),
  execute: async (instance, gameState) => {
    addTempDamage(instance, instance, 1);
    addTempPower(instance, instance, 500);
    addTemporaryColor(instance, 'RED');
    addTemporaryColor(instance, 'BLUE');
    gameState.logs.push(`[${instance.fullName}] 本回合也具备红色和蓝色。`);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000324
 * Card2 Row: 446
 * Card Row: 381
 * Source CardNo: SP02-Y04
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗[舍弃1张手牌]：本回合中，这个单位〖+1〗〖+500〗并也具备红色和蓝色。
 */
const card: Card = {
  id: '105000324',
  fullName: '炽月·球迷',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105000324_boost_colors],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
