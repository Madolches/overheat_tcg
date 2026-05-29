import { Card, CardEffect } from '../types/game';
import { addInfluence, ownerOf } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101130375_alliance_protect',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '这个单位参与的联军攻击中，你的单位不会被战斗破坏。',
  applyContinuous: (gameState, instance) => {
    const owner = ownerOf(gameState, instance);
    const battle = gameState.battleState;
    if (!owner || !battle?.isAlliance || !battle.attackers.includes(instance.gamecardId)) return;
    battle.attackers
      .map(id => owner.unitZone.find(unit => unit?.gamecardId === id))
      .filter((unit): unit is Card => !!unit)
      .forEach(unit => {
        (unit as any).battleImmuneByEffect = true;
        addInfluence(unit, instance, '联军攻击中不会被战斗破坏');
      });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130375
 * Card2 Row: 568
 * Card Row: 452
 * Source CardNo: BT07-W02
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：这个单位参与的联军攻击中，你的单位不会被战斗破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130375',
  fullName: '暮城卫兵',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '圣王国',
  acValue: 2,
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
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
