import { Card, CardEffect } from '../types/game';
import { createSelectCardQuery, ownUnits, readyByEffect } from './BaseUtil';

const HOLY_KINGDOM = '圣王国';

const readyTargets = (playerState: any, instance: Card) =>
  ownUnits(playerState).filter(unit =>
    unit.gamecardId !== instance.gamecardId &&
    unit.id !== instance.id &&
    unit.faction === HOLY_KINGDOM &&
    !unit.godMark
  );

const cardEffects: CardEffect[] = [{
  id: '101130399_alliance_end_ready',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'BATTLE_ENDED',
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：这个单位参与联军攻击的战斗阶段结束时，选择《暮城巡逻队》以外的己方<圣王国>非神蚀单位重置。',
  condition: (_gameState, playerState, instance, event) =>
    event?.playerUid === playerState.uid &&
    !!event.data?.isAlliance &&
    ((event.data?.attackerIds || event.data?.attackers || []) as string[]).includes(instance.gamecardId) &&
    readyTargets(playerState, instance).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      readyTargets(playerState, instance),
      '选择重置单位',
      '选择《暮城巡逻队》以外的你战场上的1个<圣王国>非神蚀单位，将其重置。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101130399_alliance_end_ready' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = readyTargets(playerState, instance).find(unit => unit.gamecardId === selections[0]);
    if (target) readyByEffect(gameState, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130399
 * Card2 Row: 609
 * Card Row: 493
 * Source CardNo: BT08-W05
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位参与联军攻击的战斗阶段结束时，选择《暮城巡逻队》以外的你战场上的1个<圣王国>的非神蚀单位}:将被选择的单位〖重置〗。
 */
const card: Card = {
  id: '101130399',
  fullName: '暮城巡逻队',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '圣王国',
  acValue: 3,
  power: 3000,
  basePower: 3000,
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
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
