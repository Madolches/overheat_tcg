import { Card, CardEffect } from '../types/game';

const cardEffects: CardEffect[] = [{
  id: '105000503_rainbow_feijing_all_colors',
  type: 'CONTINUOUS',
  description: '你的战场上和手牌中的具有菲晶的单位卡视作具备所有颜色。'
}];

const card: Card = {
  id: '105000503',
  fullName: '虹彩的调和师',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {YELLOW: 2},
  faction: '无',
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
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
