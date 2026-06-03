import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, moveCard, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103000187_grave_to_hand',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  isMandatory: true,
  description: '入场时，若你的战场上有【神依】单位，选择墓地1张非神蚀单位卡加入手牌。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    ownUnits(playerState).some(unit => unit.isShenyi) &&
    playerState.grave.some(card => card.type === 'UNIT' && !card.godMark),
  targetSpec: {
    title: '选择加入手牌的单位',
    description: '选择你的墓地中的1张非神蚀单位卡，将其加入手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      playerState.grave
        .filter(card => card.type === 'UNIT' && !card.godMark)
        .map(card => ({ card, source: 'GRAVE' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.grave.filter(card => card.type === 'UNIT' && !card.godMark),
      '选择加入手牌的单位',
      '选择你的墓地中的1张非神蚀单位卡，将其加入手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000187_grave_to_hand' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'GRAVE') moveCard(gameState, playerState.uid, target, 'HAND', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000187
 * Card2 Row: 200
 * Card Row: 200
 * Source CardNo: BT03-G09
 * Package: BT03(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位进入战场时，若你的战场上有具有【神依】的单位，选择你的墓地中的1张非神蚀单位卡，将其加入手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000187',
  fullName: '灵魂德鲁伊',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
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
  isShenyi: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
