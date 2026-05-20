import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addContinuousDamage, addContinuousKeyword, addContinuousPower, addInfluence, ensureData, ownerOf, universalEquipEffect } from './BaseUtil';

const loneGodEquipBoost: CardEffect = {
  id: '302000076_lone_god_equip_boost',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '如果装备单位是你战场上的唯一神蚀单位，装备单位伤害+1、力量+1000，获得速攻，并且可以攻击对手横置单位。',
  applyContinuous: (gameState, instance) => {
    if (!instance.equipTargetId) return;
    const owner = ownerOf(gameState, instance);
    if (!owner) return;

    const target = AtomicEffectExecutor.findCardById(gameState, instance.equipTargetId);
    if (!target || target.cardlocation !== 'UNIT' || !owner.unitZone.some(unit => unit?.gamecardId === target.gamecardId)) return;
    const ownGodUnits = owner.unitZone.filter((unit): unit is Card => !!unit && unit.godMark);
    if (ownGodUnits.length !== 1 || ownGodUnits[0].gamecardId !== target.gamecardId) return;

    addContinuousDamage(target, instance, 1);
    addContinuousPower(target, instance, 1000);
    addContinuousKeyword(target, instance, 'rush');
    ensureData(target).canAttackExhausted = true;
    addInfluence(target, instance, '可以攻击对手横置单位');
  }
};

const cardEffects: CardEffect[] = [universalEquipEffect, loneGodEquipBoost];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 302000076
 * Card2 Row: 346
 * Card Row: 584
 * Source CardNo: PR04-01R
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 1.装备通用效果
 * 2.永续效果，如果装备单位是你战场上的唯一一个神蚀单位，装备单位获得+1/+1000，并获得速攻，并且可以攻击对手横置单位。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '302000076',
  fullName: '「烬晓之枪」',
  specialName: '烬晓之枪',
  type: 'ITEM',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '无',
  acValue: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
