import { Card, CardEffect } from '../types/game';
import { createChoiceQuery, exhaustCost } from './BaseUtil';

const colorOptions = [
  { id: 'WHITE', label: '白色' },
  { id: 'RED', label: '红色' },
  { id: 'BLUE', label: '蓝色' },
  { id: 'GREEN', label: '绿色' },
  { id: 'YELLOW', label: '黄色' }
];

const addTemporaryColor = (card: Card, color: string) => {
  (card as any).temporaryExtraColors = Array.from(new Set([
    ...((card as any).temporaryExtraColors || []),
    color
  ]));
};

const effect_103000274_declare_color: CardEffect = {
  id: '103000274_declare_color',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '【启】1回合1次，宣言1个颜色，横置：本回合中，这个单位也具备所宣言的颜色。',
  condition: (_gameState, _playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    !instance.isExhausted,
  cost: exhaustCost,
  execute: async (instance, gameState, playerState) => {
    createChoiceQuery(
      gameState,
      playerState.uid,
      '宣言颜色',
      '宣言1个颜色，本回合中此单位也具备那个颜色。',
      colorOptions,
      { sourceCardId: instance.gamecardId, effectId: '103000274_declare_color' }
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const color = selections[0];
    if (!color || !colorOptions.some(option => option.id === color)) return;
    addTemporaryColor(instance, color);
    gameState.logs.push(`[${instance.fullName}] 本回合也具备 ${color}。`);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000274
 * Card2 Row: 433
 * Card Row: 316
 * Source CardNo: SP02-G03
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗{宣言一个颜色}[横置]:本回合中，这个单位也具备所宣言的颜色。
 */
const card: Card = {
  id: '103000274',
  fullName: '裁判猫娘',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
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
  effects: [effect_103000274_declare_color],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
