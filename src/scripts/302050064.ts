import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { addContinuousDamage, addContinuousPower, addInfluence, createSelectCardQuery, ensureData, wasPlacedByPromotion } from './BaseUtil';

const equippedTarget = (gameState: any, instance: Card) =>
  instance.equipTargetId ? AtomicEffectExecutor.findCardById(gameState, instance.equipTargetId) : undefined;

const promotionEquipTargets = (playerState: any, gameState: any) =>
  playerState.unitZone.filter((unit: Card | null): unit is Card =>
    !!unit && wasPlacedByPromotion(unit)
  );

const promotionEquipEffect: CardEffect = {
  id: '302050064_equip_to_promotion_unit',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  limitCount: 1,
  description: '装备：只能装备给由于晋升进入战场的单位，或解除装备。',
  condition: (gameState, playerState, instance) =>
    gameState.phase === 'MAIN' &&
    (!!instance.equipTargetId || promotionEquipTargets(playerState, gameState).length > 0),
  execute: async (instance, gameState, playerState) => {
    if (instance.equipTargetId) {
      instance.equipTargetId = undefined;
      EventEngine.recalculateContinuousEffects(gameState);
      return;
    }

    const targets = promotionEquipTargets(playerState, gameState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择装备目标',
      '选择1个由于晋升进入战场的单位装备。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '302050064_equip_to_promotion_unit' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selectedId = selections[0];
    if (selectedId === instance.gamecardId) {
      instance.equipTargetId = undefined;
      return;
    }
    const target = promotionEquipTargets(playerState, gameState).find(unit => unit.gamecardId === selectedId);
    if (target) instance.equipTargetId = target.gamecardId;
  }
};

const cardEffects: CardEffect[] = [promotionEquipEffect, {
  id: '302050064_equip_buff_and_protection',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '装备单位伤害+1、力量+500，且不会由于对手的卡的效果从战场离开。',
  applyContinuous: (gameState, instance) => {
    const target = equippedTarget(gameState, instance);
    if (!target || target.cardlocation !== 'UNIT') {
      instance.equipTargetId = undefined;
      return;
    }
    if (!wasPlacedByPromotion(target)) return;
    addContinuousDamage(target, instance, 1);
    addContinuousPower(target, instance, 500);
    const data = ensureData(target);
    data.cannotLeaveFieldByOpponentEffectTurn = gameState.turnCount;
    data.cannotLeaveFieldByOpponentEffectSourceName = instance.fullName;
    addInfluence(target, instance, 'Cannot leave field by opponent card effects');
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 302050064
 * Card2 Row: 602
 * Card Row: 486
 * Source CardNo: BT08-R09
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【装备】
 * 【永】:只能装备给由于晋升进入战场的单位。装备单位〖伤害+1〗〖力量+500〗。
 * 【永】:装备单位获得“【永】：这个单位不会由于对手的卡的效果从战场离开。”的能力。
 */
const card: Card = {
  id: '302050064',
  fullName: '荣誉徽章',
  specialName: '',
  type: 'ITEM',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '伊列宇王国',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  isEquip: true,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
