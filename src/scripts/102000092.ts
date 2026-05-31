import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, damagePlayerByEffect, ownUnits } from './BaseUtil';

const canPayRedZeroCost = (playerState: any) =>
  ownUnits(playerState).filter(unit => AtomicEffectExecutor.matchesColor(unit, 'RED')).length >= 2;

const cardEffects: CardEffect[] = [{
    id: '102000092_all_damage',
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    limitCount: 1,
    description: '主要阶段，给予所有玩家1点伤害。',
    condition: (gameState, playerState) => gameState.phase === 'MAIN' && playerState.isTurn,
    cost: async (_gameState, playerState) => canPayRedZeroCost(playerState),
    execute: async (instance, gameState, playerState) => {
      for (const uid of Object.keys(gameState.players)) await damagePlayerByEffect(gameState, playerState.uid, uid, 1, instance);
    }
  }, {
    id: '102000092_self_damage',
    type: 'TRIGGER',
    triggerEvent: 'CARD_ENTERED_ZONE',
    triggerLocation: ['UNIT'],
    isMandatory: true,
    erosionTotalLimit: [9, 9],
    description: '9~9：入场时给予你1点伤害。',
    condition: (_gameState, _playerState, instance, event) => event?.sourceCardId === instance.gamecardId && event.data?.zone === 'UNIT',
    execute: async (instance, gameState, playerState) => damagePlayerByEffect(gameState, playerState.uid, playerState.uid, 1, instance)
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000092
 * Card2 Row: 46
 * Card Row: 46
 * Source CardNo: BT01-R08
 * Package: ST01(TD),BT01(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗:[〖支付0费，我方单位区有两个或者以上的红色单位〗]你的主要阶段中才可以发动。给予所有玩家1点伤害。
 * 〖9~9〗【诱】:这个单位进入战场时，给予你1点伤害。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000092',
  fullName: '招来不幸的预言者',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 1,
  power: 500,
  basePower: 500,
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
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
