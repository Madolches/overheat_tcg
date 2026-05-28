import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor, addTempPowerUntilEndOfTurn, createSelectCardQuery, isFaction, moveCard, ownerUidOf, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102060243_enter_boost',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  description: '进入战场时，选择你的1个<雷霆>单位，本回合力量+1000。',
  condition: (_gameState, playerState, instance, event?: GameEvent) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    ownUnits(playerState).some(unit => isFaction(unit, '雷霆')),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(unit => isFaction(unit, '雷霆')),
      '选择雷霆单位',
      '选择你的1个<雷霆>单位，本回合力量+1000。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102060243_enter_boost' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target) addTempPowerUntilEndOfTurn(target, instance, 1000, gameState);
  }
}, {
  id: '102060243_return_hand',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'TURN_END' as any,
  isMandatory: true,
  description: '回合结束时，将这个单位返回持有者的手牌。',
  condition: (_gameState, _playerState, instance, event) =>
    event?.type === ('TURN_END' as any) && instance.cardlocation === 'UNIT',
  execute: async (instance, gameState) => {
    const ownerUid = ownerUidOf(gameState, instance);
    if (ownerUid) moveCard(gameState, ownerUid, instance, 'HAND', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102060243
 * Card2 Row: 412
 * Card Row: 282
 * Source CardNo: BT05-R06
 * Package: BT05(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位进入战场时，选择你的1个<雷霆>单位}:本回合中，被选择的单位〖力量+1000〗。
 * 【诱】{回合结束时}:将这个单位返回持有者的手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102060243',
  fullName: '迅雷的追击者',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '雷霆',
  acValue: 2,
  power: 1000,
  basePower: 1000,
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
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
