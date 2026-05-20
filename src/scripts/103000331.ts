import { Card, CardEffect } from '../types/game';
import { addTemporaryColor, createChoiceQuery, ensureData, markReturnToDeckBottomAtEnd } from './BaseUtil';

const colorOptions = [
  { id: 'WHITE', label: '白色' },
  { id: 'RED', label: '红色' },
  { id: 'BLUE', label: '蓝色' },
  { id: 'GREEN', label: '绿色' },
  { id: 'YELLOW', label: '黄色' }
];

const cardEffects: CardEffect[] = [{
  id: '103000331_enter_color',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  description: '进入战场时，可以宣言1个颜色，这个单位也具备该颜色。若不是通过《极彩鸟》的效果放置，本回合结束时放置到持有者卡组底。',
  condition: (_gameState, _playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId && event.data?.zone === 'UNIT',
  execute: async (instance, gameState, playerState) => {
    createChoiceQuery(
      gameState,
      playerState.uid,
      '宣言颜色',
      '宣言1个颜色，这个单位也具备该颜色。',
      colorOptions,
      { sourceCardId: instance.gamecardId, effectId: '103000331_enter_color', step: 'COLOR' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const color = selections[0];
    if (colorOptions.some(option => option.id === color)) {
      addTemporaryColor(instance, color);
      gameState.logs.push(`[${instance.fullName}] 本回合也具备 ${color}。`);
    }

    if (!ensureData(instance).placedByIrodoriBirdTurn) {
      markReturnToDeckBottomAtEnd(instance, instance, gameState, playerState.uid);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000331
 * Card2 Row: 453
 * Card Row: 388
 * Source CardNo: BT06-G05
 * Package: BT06(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位进入战场时，你可以宣言1个颜色}：这个单位也具备所宣言的颜色。若这个单位不是通过《极彩鸟》的效果放置到战场上，本回合结束时，讲这个单位放置到持有者卡组底。
 */
const card: Card = {
  id: '103000331',
  fullName: '极彩鸟的羽毛',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
  power: 0,
  basePower: 0,
  damage: 0,
  baseDamage: 0,
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
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
