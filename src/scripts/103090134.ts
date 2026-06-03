import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, createSelectCardQuery, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103090134_goddess_revive',
  type: 'TRIGGER',
  triggerEvent: 'GODDESS_TRANSFORMATION',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [10, 10],
  description: '10+：进入女神化时，选择墓地1张<瑟诺布>非神蚀单位放置到战场。',
  condition: (_gameState, playerState) =>
    playerState.unitZone.some(slot => slot === null) &&
    playerState.grave.some(card => card.type === 'UNIT' && card.faction === '瑟诺布' && !card.godMark && canPutUnitOntoBattlefield(playerState, card)),
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.grave.filter(card =>
      card.type === 'UNIT' &&
      card.faction === '瑟诺布' &&
      !card.godMark &&
      canPutUnitOntoBattlefield(playerState, card)
    );
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择复活单位',
      '选择你的墓地中的1张<瑟诺布>非神蚀单位卡，将其放置到战场上。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103090134_goddess_revive' },
      () => 'GRAVE'
    );
  },
  targetSpec: {
    title: '选择复活单位',
    description: '选择你的墓地中的1张<瑟诺布>非神蚀单位卡，将其放置到战场上。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      playerState.grave
        .filter(card =>
          card.type === 'UNIT' &&
          card.faction === '瑟诺布' &&
          !card.godMark &&
          canPutUnitOntoBattlefield(playerState, card)
        )
        .map(card => ({ card, source: 'GRAVE' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'GRAVE') moveCard(gameState, playerState.uid, target, 'UNIT', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090134
 * Card2 Row: 112
 * Card Row: 112
 * Source CardNo: BT02-G06
 * Package: BT02(C),ST02(TD)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖10+〗【诱】:你进入女神化状态时，选择你的墓地中的1张<瑟诺布>的非神蚀单位卡，将其放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103090134',
  fullName: '瑟诺布作曲家',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '瑟诺布',
  acValue: 2,
  power: 2000,
  basePower: 2000,
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
