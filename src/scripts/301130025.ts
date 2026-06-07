import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addInfluence } from './BaseUtil';
import { EventEngine } from '../services/EventEngine';

const hasSilverCrossBattlewear = (playerState: any, unit: Card, instance: Card) =>
  playerState.itemZone.some((item: Card | null) =>
    item &&
    item.gamecardId !== instance.gamecardId &&
    item.id === instance.id &&
    item.equipTargetId === unit.gamecardId
  );

const silverCrossEquipEffect: CardEffect = {
  id: '301130025_equip',
  type: 'ACTIVATE',
  description: '主要阶段中，选择你的1个未装备《银白十字战衣》的单位装备这张卡，或解除装备状态。',
  limitCount: 1,
  limitNameType: false,
  triggerLocation: ['ITEM'],
  condition: (gameState, playerState, instance) =>
    gameState.phase === 'MAIN' &&
    (!!instance.equipTargetId || playerState.unitZone.some(unit => unit && !hasSilverCrossBattlewear(playerState, unit, instance))),
  execute: async (instance, gameState, playerState) => {
    if (instance.equipTargetId) {
      instance.equipTargetId = undefined;
      EventEngine.recalculateContinuousEffects(gameState);
      return;
    }

    const options = playerState.unitZone
      .filter((unit): unit is Card => !!unit && !hasSilverCrossBattlewear(playerState, unit, instance))
      .map(unit => ({ card: unit, source: 'UNIT' as const }));

    if (options.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, options),
      title: '选择装备目标',
      description: '选择1个未装备《银白十字战衣》的单位装备这张卡。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '301130025_equip'
      }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selectedId = selections[0];
    if (selectedId === instance.gamecardId) {
      instance.equipTargetId = undefined;
      EventEngine.recalculateContinuousEffects(gameState);
      return;
    }

    const target = playerState.unitZone.find(unit =>
      unit?.gamecardId === selectedId &&
      !hasSilverCrossBattlewear(playerState, unit, instance)
    );
    if (!target) return;

    instance.equipTargetId = target.gamecardId;
    EventEngine.dispatchEvent(gameState, {
      type: 'CARD_EQUIPPED',
      playerUid: playerState.uid,
      sourceCard: instance,
      sourceCardId: instance.gamecardId,
      targetCardId: target.gamecardId,
      data: {
        itemId: instance.gamecardId,
        unitId: target.gamecardId
      }
    });
    EventEngine.recalculateContinuousEffects(gameState);
  }
};

const cardEffects: CardEffect[] = [silverCrossEquipEffect, {
  id: '301130025_reset_equipped',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'CARD_EQUIPPED',
  isMandatory: true,
  description: '非神蚀单位装备这张卡时，将装备单位重置。',
  condition: (gameState, _playerState, instance, event) => {
    if (event?.sourceCardId !== instance.gamecardId || event.targetCardId !== instance.equipTargetId) return false;
    const target = AtomicEffectExecutor.findCardById(gameState, event.targetCardId);
    return !!target && !target.godMark;
  },
  execute: async (instance, gameState, _playerState, event) => {
    const target = event?.targetCardId ? AtomicEffectExecutor.findCardById(gameState, event.targetCardId) : undefined;
    if (!target || target.godMark) return;
    target.isExhausted = false;
    addInfluence(target, instance, '装备时重置');
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 301130025
 * Card2 Row: 155
 * Card Row: 155
 * Source CardNo: BT02-W15
 * Package: BT02(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【装备】（〖1回合1次〗你的主要阶段中，你可以选择你的1个单位装备这张卡，或者解除这张卡的装备状态。）
 * 【永】:1个单位只能装备1张《银白十字战衣》。
 * 【诱】:非神蚀单位装备这张卡时，将装备单位〖重置〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '301130025',
  fullName: '银白十字战衣',
  specialName: '',
  type: 'ITEM',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '圣王国',
  acValue: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
