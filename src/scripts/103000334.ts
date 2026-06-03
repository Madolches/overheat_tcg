import { Card, CardEffect } from '../types/game';
import {
  addTempKeyword,
  allCardsOnField,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  destroyByEffect,
  getResonanceExiledCard,
  isResonanceExileEvent,
  ownUnits,
  putUnitOntoField
} from './BaseUtil';

const chimeraInGrave = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.type === 'UNIT' && (card.specialName === '奇美拉' || card.fullName.includes('奇美拉')));

const nonGodFieldCards = (gameState: any) =>
  allCardsOnField(gameState).filter(card => !card.godMark);

const cardEffects: CardEffect[] = [{
  id: '103000334_resonance_revive_chimera',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  isMandatory: true,
  triggerLocation: ['EXILE'],
  description: '共鸣能力将墓地中的这张卡放逐时，选择你的墓地中的1张「奇美拉」单位卡，将被选择的卡放置到战场上。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    isResonanceExileEvent(event) &&
    !!getResonanceExiledCard(event) &&
    chimeraInGrave(playerState).some((card: Card) => canPutUnitOntoBattlefield(playerState, card)),
  execute: async (instance, gameState, playerState) => {
    const candidates = chimeraInGrave(playerState).filter((card: Card) => canPutUnitOntoBattlefield(playerState, card));
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择奇美拉',
      '选择墓地中的1张「奇美拉」单位卡放置到战场上。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000334_resonance_revive_chimera' },
      () => 'GRAVE'
    );
  },
  targetSpec: {
    title: '选择「奇美拉」单位卡',
    description: '选择你墓地中的1张「奇美拉」单位卡放置到战场上。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      chimeraInGrave(playerState)
        .filter((card: Card) => canPutUnitOntoBattlefield(playerState, card))
        .map((card: Card) => ({ card, source: 'GRAVE' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = chimeraInGrave(playerState).find((card: Card) => card.gamecardId === selections[0] && canPutUnitOntoBattlefield(playerState, card));
    if (target) putUnitOntoField(gameState, playerState.uid, target, instance);
  }
}, {
  id: '103000334_grave_entry_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：这个单位从墓地放置到战场上的回合中，选择战场上1张非神蚀卡，将其破坏。若你战场上有「萨拉拉」单位，本回合中这个单位获得【速攻】【英勇】【歼灭】。',
  condition: (gameState, _playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    (instance as any).data?.enteredFromGraveTurn === gameState.turnCount &&
    nonGodFieldCards(gameState).some(card => card.gamecardId !== instance.gamecardId),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodFieldCards(gameState).filter(card => card.gamecardId !== instance.gamecardId),
      '选择破坏对象',
      '选择战场上1张非神蚀卡，将其破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000334_grave_entry_destroy' },
      card => card.cardlocation as any
    );
  },
  targetSpec: {
    title: '选择破坏对象',
    description: '选择战场上的1张非神蚀卡，将其破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'ANY',
    getCandidates: (gameState, _playerState, instance) =>
      nonGodFieldCards(gameState)
        .filter(card => card.gamecardId !== instance.gamecardId)
        .map(card => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = nonGodFieldCards(gameState).find(card => card.gamecardId === selections[0]);
    if (target) destroyByEffect(gameState, target, instance);
    if (ownUnits(playerState).some(unit => unit.specialName === '萨拉拉' || unit.fullName.includes('萨拉拉'))) {
      addTempKeyword(instance, instance, 'rush');
      addTempKeyword(instance, instance, 'heroic');
      addTempKeyword(instance, instance, 'annihilation');
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000334
 * Card2 Row: 459
 * Card Row: 394
 * Source CardNo: BT06-G11
 * Package: BT06(OHR)，特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{共鸣能力将你的墓地中的这张卡放逐时，选择你的墓地中的1张「奇美拉」单位卡}：将被选择的卡放置到战场上。
 * 【启】〖1回合1次〗{这个单位从墓地放置到战场上的回合中，选择战场上1张非神蚀卡}：将被选择的卡破坏。若你的战场上有「萨拉拉」单位，本回合中，这个单位获得【速攻】【英勇】【歼灭】。
 */
const card: Card = {
  id: '103000334',
  fullName: '白色异兽「奇美拉」',
  specialName: '奇美拉',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '无',
  acValue: 4,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: false,
  isHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
