import { Card, CardEffect } from '../types/game';
import { enteredFromHand, searchDeckEffect } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  ...searchDeckEffect('102050428_enter_search', '同名1回合1次：从手牌进入战场时，本回合只能使用/发动<伊列宇王国>卡；可以从卡组将1张「赛利亚」加入手牌。', card => card.specialName === '赛利亚'),
  limitCount: 1,
  limitNameType: true,
  condition: (_gameState, _playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    enteredFromHand(instance, event),
  execute: async (instance, gameState, playerState, event) => {
    playerState.factionLock = '伊列宇王国';
    await searchDeckEffect('102050428_enter_search', '选择卡组中的1张「赛利亚」加入手牌。', card => card.specialName === '赛利亚').execute!(instance, gameState, playerState, event);
  }
} as CardEffect];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050428
 * Card2 Row: 303
 * Card Row: 542
 * Source CardNo: BT04-R02
 * Package: BT04(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗：使用这个能力的回合中，你只能使用<伊列宇王国>的卡，只能发动<伊列宇王国>的卡的能力。这个单位从手牌进入战场时，你可以选择你的卡组中的一张「赛利亚」，将其加入手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050428',
  fullName: '赛丽亚的侍女',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
  acValue: 2,
  power: 1500,
  basePower: 1500,
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
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
