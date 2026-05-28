import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, allUnitsOnField, damagePlayerByEffect, destroyByEffect, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('202000079_destroy_self_damage', '5~7：选择战场1个非神蚀单位破坏。之后给予你与那个单位原本伤害值相同的伤害。', async (instance, gameState, playerState, _event, declaredSelections?: string[]) => {
  const target = declaredSelections?.[0] ? AtomicEffectExecutor.findCardById(gameState, declaredSelections[0]) : undefined;
  if (!target || target.godMark) return;
  const damage = target.baseDamage ?? target.damage ?? 0;
  destroyByEffect(gameState, target, instance);
  if (damage > 0) await damagePlayerByEffect(gameState, playerState.uid, playerState.uid, damage, instance);
}, {
  erosionTotalLimit: [5, 7],
  targetSpec: {
    title: '选择破坏对象',
    description: '选择战场上的1个非神蚀单位，将其破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    getCandidates: gameState => allUnitsOnField(gameState).filter(unit => !unit.godMark).map(card => ({ card, source: 'UNIT' }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.godMark) return;
    const damage = target.baseDamage ?? target.damage ?? 0;
    destroyByEffect(gameState, target, instance);
    if (damage > 0) await damagePlayerByEffect(gameState, playerState.uid, playerState.uid, damage, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202000079
 * Card2 Row: 221
 * Card Row: 221
 * Source CardNo: BT03-R12
 * Package: BT03(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖5~7〗选择战场上的1个非神蚀单位，将其破坏。之后，给予你与那个单位的原本伤害值相同的伤害。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202000079',
  fullName: '电鸣',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
