import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addTempPower, allUnitsOnField, createSelectCardQuery, destroyByEffect, ownUnits, ownerUidOf } from './BaseUtil';

const isSeisoUnit = (card: Card) =>
  card.type === 'UNIT' && (card.fullName.includes('清霜') || !!card.specialName?.includes('清霜'));

const isSeisoMochiyuki = (card: Card) =>
  card.id === '103000299' || card.fullName.includes('清霜饼雪') || card.specialName?.includes('饼雪');

const isAccessThree = (card: Card) => Number(card.acValue || 0) === 3;

const effect_101000291_attack_destroy_boost: CardEffect = {
  id: '101000291_attack_destroy_boost',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ATTACK_DECLARED',
  isGlobal: true,
  isMandatory: false,
  triggerLocation: ['UNIT'],
  description: '这个单位宣言攻击时，可以破坏自己场上1个《清霜饼雪》以外的《清霜》单位。之后己方ACCESS 3单位本回合力量+1000。',
  condition: (_gameState, playerState, instance, event) =>
    event?.playerUid === playerState.uid &&
    (event.data?.attackerIds || []).includes(instance.gamecardId) &&
    ownUnits(playerState).some(unit =>
      unit.gamecardId !== instance.gamecardId &&
      isSeisoUnit(unit) &&
      !isSeisoMochiyuki(unit)
    ),
  execute: async (instance, gameState, playerState) => {
    const candidates = ownUnits(playerState).filter(unit =>
      unit.gamecardId !== instance.gamecardId &&
      isSeisoUnit(unit) &&
      !isSeisoMochiyuki(unit)
    );
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择破坏的清霜单位',
      '选择自己战场上的1个《清霜饼雪》以外的《清霜》单位破坏。之后ACCESS 3单位力量+1000。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101000291_attack_destroy_boost' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (
      target?.cardlocation === 'UNIT' &&
      ownerUidOf(gameState, target) === playerState.uid &&
      target.gamecardId !== instance.gamecardId &&
      isSeisoUnit(target) &&
      !isSeisoMochiyuki(target)
    ) {
      destroyByEffect(gameState, target, instance);
    }

    ownUnits(playerState)
      .filter(isAccessThree)
      .forEach(unit => addTempPower(unit, instance, 1000));
  }
};

const effect_101000291_leave_destroy: CardEffect = {
  id: '101000291_leave_destroy',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_FIELD',
  sourceSnapshotOnLeftField: true,
  isMandatory: true,
  limitCount: 1,
  limitNameType: true,
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'],
  description: '同名1回合1次：这张卡由于战斗或自己的卡牌效果离开战场时，选择战场1个ACCESS 3以下非神蚀单位破坏。',
  condition: (gameState, playerState, instance, event) => {
    const isSelfLeave =
      event?.sourceCard === instance ||
      event?.sourceCardId === instance.gamecardId ||
      event?.data?.previousSourceCardId === instance.gamecardId ||
      (
        !!event?.sourceCard?.runtimeFingerprint &&
        event.sourceCard.runtimeFingerprint === instance.runtimeFingerprint
      );
    if (!isSelfLeave) return false;
    if (event.data?.sourceZone !== 'UNIT') return false;
    const leftByOwnEffect = !!event.data?.isEffect && event.data?.effectSourcePlayerUid === playerState.uid;
    const leftByBattle = !event.data?.isEffect && event.data?.targetZone === 'GRAVE';
    if (!leftByOwnEffect && !leftByBattle) return false;
    return allUnitsOnField(gameState).some(unit => !unit.godMark && Number(unit.acValue || 0) <= 3);
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = allUnitsOnField(gameState).filter(unit => !unit.godMark && Number(unit.acValue || 0) <= 3);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择破坏目标',
      '选择战场上1个ACCESS 3以下的非神蚀单位破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101000291_leave_destroy' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT' && !target.godMark && Number(target.acValue || 0) <= 3) {
      destroyByEffect(gameState, target, instance);
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000291
 * Card2 Row: 517
 * Card Row: 339
 * Source CardNo: SP03-W01
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位宣言攻击时}：你可以将你的战场上的《清霜饼雪》以外的1个卡名含有《清霜》的单位破坏。之后，你的战场上所有的ACCESS值+3的单位本回合中〖力量+1000〗。
 * 【诱】〖同名1回合1次〗{这张卡由于战斗或你的卡的效果从战场离开时，选择战场上1个ACCESS值+3以下的非神蚀单位}：将被选择的单位破坏。
 */
const card: Card = {
  id: '101000291',
  fullName: '清霜粉雪',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
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
  effects: [effect_101000291_attack_destroy_boost, effect_101000291_leave_destroy],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
