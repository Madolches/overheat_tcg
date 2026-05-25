import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addTempPowerUntilEndOfTurn, attackingUnits, createSelectCardQuery, moveCardAsCost, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '302000034_attack_boost',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ATTACK_DECLARED',
  isMandatory: false,
  triggerLocation: ['ITEM'],
  isGlobal: true,
  limitCount: 1,
  description: '1回合1次：你的单位攻击时，可以选择1个参与攻击的单位，这次战斗中力量+1000。',
  condition: (_gameState, playerState, _instance, event) =>
    event?.playerUid === playerState.uid && attackingUnits(_gameState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, attackingUnits(gameState), '选择攻击单位', '选择1个参与攻击的单位，这次战斗中力量+1000。', 0, 1, { sourceCardId: instance.gamecardId, effectId: '302000034_attack_boost' }, () => 'UNIT');
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT') addTempPowerUntilEndOfTurn(target, instance, 1000, gameState);
  }
}, {
  id: '302000034_sac_power',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  description: '将这张卡送入墓地：选择你的1个<雷霆>单位，本回合力量+1000。',
  condition: (_gameState, playerState) => ownUnits(playerState).some(unit => unit.faction === '雷霆'),
  cost: async (gameState, playerState, instance) => {
    moveCardAsCost(gameState, playerState.uid, instance, 'GRAVE', instance);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, ownUnits(playerState).filter(unit => unit.faction === '雷霆'), '选择雷霆单位', '选择你的1个<雷霆>单位，本回合力量+1000。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '302000034_sac_power' }, () => 'UNIT');
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT') addTempPowerUntilEndOfTurn(target, instance, 1000, gameState);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 302000034
 * Card2 Row: 224
 * Card Row: 224
 * Source CardNo: BT03-R16
 * Package: BT03(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗:你的单位攻击时，你可以选择1个参与攻击的单位，这次战斗中〖力量+1000〗。
 * 【启】:[将这张卡送入墓地]选择你的1个<雷霆>单位，本回合中〖力量+1000〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '302000034',
  fullName: '雷霆号角',
  specialName: '',
  type: 'ITEM',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
