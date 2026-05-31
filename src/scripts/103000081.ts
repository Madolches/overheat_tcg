import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, getOpponentUid, millTop, ownUnits } from './BaseUtil';

const canPayGreenZeroCost = (playerState: any) =>
  ownUnits(playerState).filter(unit => AtomicEffectExecutor.matchesColor(unit, 'GREEN')).length >= 2;

const cardEffects: CardEffect[] = [{
    id: '103000081_double_mill',
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    limitCount: 1,
    description: '主要阶段，将双方卡组顶各1张送入墓地。',
    condition: (gameState, playerState) => gameState.phase === 'MAIN' && playerState.isTurn,
    cost: async (_gameState, playerState) => canPayGreenZeroCost(playerState),
    execute: async (instance, gameState, playerState) => {
      millTop(gameState, playerState.uid, 1, instance);
      millTop(gameState, getOpponentUid(gameState, playerState.uid), 1, instance);
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000081
 * Card2 Row: 29
 * Card Row: 29
 * Source CardNo: BT01-G08
 * Package: BT01(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗:[〖支付0费，我方单位区有两个或者以上的绿色单位〗]将对手和你的卡组顶的1张卡分别送入墓地。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000081',
  fullName: '瑟诺布的猎鹰',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
