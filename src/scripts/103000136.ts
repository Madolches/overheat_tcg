import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, createSelectCardQuery, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103000136_grave_revive',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '从墓地进入战场时，可以选择墓地1张AC2以下非神蚀单位放置到战场。之后放逐此单位。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    event.data?.sourceZone === 'GRAVE' &&
    playerState.unitZone.some(slot => slot === null) &&
    playerState.grave.some(card => card.type === 'UNIT' && !card.godMark && (card.acValue || 0) <= 2 && canPutUnitOntoBattlefield(playerState, card)),
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.grave.filter(card =>
      card.type === 'UNIT' &&
      !card.godMark &&
      (card.acValue || 0) <= 2 &&
      canPutUnitOntoBattlefield(playerState, card)
    );
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择复活单位',
      '你可以选择墓地中的1张ACCESS值2以下的非神蚀单位卡，将其放置到战场上。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000136_grave_revive' },
      () => 'GRAVE'
    );
  },
  targetSpec: {
    title: '选择复活单位',
    description: '选择你的墓地中的1张ACCESS值2以下的非神蚀单位卡，将其放置到战场上。',
    minSelections: 0,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      playerState.grave
        .filter(card =>
          card.type === 'UNIT' &&
          !card.godMark &&
          (card.acValue || 0) <= 2 &&
          canPutUnitOntoBattlefield(playerState, card)
        )
        .map(card => ({ card, source: 'GRAVE' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'GRAVE') moveCard(gameState, playerState.uid, target, 'UNIT', instance);
    if (instance.cardlocation === 'UNIT') moveCard(gameState, playerState.uid, instance, 'EXILE', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000136
 * Card2 Row: 114
 * Card Row: 114
 * Source CardNo: BT02-G08
 * Package: BT02(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗:这个单位从墓地进入战场时，你可以选择你的墓地中的1张ACCESS值+2以下的非神蚀单位卡，将其放置到战场上。之后，将这个单位放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000136',
  fullName: '流浪的吟游诗人',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 1,
  power: 500,
  basePower: 500,
  damage: 0,
  baseDamage: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
