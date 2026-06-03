import { Card, CardEffect, GameEvent, TriggerLocation } from '../types/game';
import { createSelectCardQuery, ownUnits } from './BaseUtil';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const cardEffects: CardEffect[] = [{
  id: '101130155_enter_reset',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  limitCount: 1,
  limitNameType: true,
  erosionTotalLimit: [0, 3],
  isMandatory: false,
  description: '0~3：进入战场时，你可以选择你的1个非神蚀单位重置。',
  condition: (_gameState, playerState, instance, event?: GameEvent) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    ownUnits(playerState).some(unit => !unit.godMark && unit.isExhausted),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, ownUnits(playerState).filter(unit => !unit.godMark && unit.isExhausted), '选择重置单位', '选择你的1个非神蚀单位重置。', 0, 1, { sourceCardId: instance.gamecardId, effectId: '101130155_enter_reset' }, () => 'UNIT');
  },
  targetSpec: {
    title: '选择重置单位',
    description: '选择你的1个横置的非神蚀单位，将其重置。',
    minSelections: 0,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      ownUnits(playerState)
        .filter(unit => !unit.godMark && unit.isExhausted)
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target) return;
    target.isExhausted = false;
    target.displayState = 'FRONT_UPRIGHT';
    target.influencingEffects = target.influencingEffects || [];
    target.influencingEffects.push({ sourceCardName: instance.fullName, description: '因效果重置' });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130155
 * Card2 Row: 145
 * Card Row: 145
 * Source CardNo: BT02-W05
 * Package: BT02(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖0~3〗【诱】:这个单位进入战场时，你可以选择你的1个非神蚀单位，将其〖重置〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130155',
  fullName: '南征军的传令兵',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '圣王国',
  acValue: 2,
  power: 1500,
  basePower: 1500,
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
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
