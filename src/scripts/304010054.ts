import { Card, CardEffect, GameEvent } from '../types/game';
import { EventEngine } from '../services/EventEngine';
import { AtomicEffectExecutor, canPutItemOntoBattlefield, markCannotBeEffectTargetColors, moveCard, universalEquipEffect } from './BaseUtil';

const isMomoseGodUnitFromHand = (event?: GameEvent) => {
  const card = event?.sourceCard;
  return event?.type === 'CARD_ENTERED_ZONE' &&
    event.data?.zone === 'UNIT' &&
    event.data?.sourceZone === 'HAND' &&
    card?.type === 'UNIT' &&
    card.godMark &&
    card.faction === '百濑之水城';
};

const cardEffects: CardEffect[] = [universalEquipEffect, {
  id: '304010054_color_target_guard',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '装备单位不会成为白色或绿色卡的效果对象。',
  applyContinuous: (gameState, instance) => {
    if (!instance.equipTargetId) return;
    const target = AtomicEffectExecutor.findCardById(gameState, instance.equipTargetId);
    if (target?.cardlocation === 'UNIT') markCannotBeEffectTargetColors(target, instance, ['WHITE', 'GREEN']);
  }
}, {
  id: '304010054_hand_auto_equip',
  type: 'TRIGGER',
  triggerLocation: ['HAND'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  isGlobal: true,
  limitCount: 1,
  limitNameType: true,
  description: '你的〈百濑之水城〉神蚀单位从手牌进入战场时，将手牌中的这张卡放置到战场并装备给其中1个单位。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'HAND' &&
    event?.playerUid === playerState.uid &&
    isMomoseGodUnitFromHand(event) &&
    canPutItemOntoBattlefield(playerState, instance),
  execute: async (instance, gameState, playerState, event) => {
    const target = event?.sourceCard;
    if (!target) return;
    moveCard(gameState, playerState.uid, instance, 'ITEM', instance);
    const item = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (!item || item.cardlocation !== 'ITEM') return;
    item.equipTargetId = target.gamecardId;
    EventEngine.dispatchEvent(gameState, {
      type: 'CARD_EQUIPPED',
      playerUid: playerState.uid,
      sourceCard: item,
      sourceCardId: item.gamecardId,
      targetCardId: target.gamecardId,
      data: { itemId: item.gamecardId, unitId: target.gamecardId }
    });
    EventEngine.recalculateContinuousEffects(gameState);
  }
}, {
  id: '304010054_return_with_unit',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: ['CARD_LEFT_ZONE', 'CARD_LEFT_FIELD'] as any,
  isMandatory: true,
  description: '装备单位由于卡的效果返回持有者手牌时，将这张卡返回持有者手牌。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'ITEM' &&
    !!instance.equipTargetId &&
    (event?.sourceCardId === instance.equipTargetId || event?.data?.previousSourceCardId === instance.equipTargetId) &&
    event?.data?.sourceZone === 'UNIT' &&
    event?.data?.targetZone === 'HAND' &&
    !!event?.data?.isEffect,
  execute: async (instance, gameState, playerState) => {
    moveCard(gameState, playerState.uid, instance, 'HAND', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 304010054
 * Card2 Row: 469
 * Card Row: 403
 * Source CardNo: BT06-B10
 * Package: BT06(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【装备】
 * 【永】：装备单位不会成为白色或绿色卡的效果的对象。
 * 【诱】〖同名1回合1次〗{你的〈百濑之水城〉的神蚀单位从手牌进入战场时，选择那些单位中的一个}：将手牌中的这张卡放置到战场上并装备给被选择的单位。
 * 【诱】{装备单位由于卡的效果返回持有者的手牌时}：将这张卡返回持有者的手牌。
 */
const card: Card = {
  id: '304010054',
  fullName: '「纳剑仙鞘」',
  specialName: '纳剑仙鞘',
  type: 'ITEM',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '百濑之水城',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  isEquip: true,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
