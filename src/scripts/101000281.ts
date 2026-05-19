import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, readyByEffect } from './BaseUtil';

const isBlueOrGreenNonGodOrVictoria = (card: Card) =>
  card.cardlocation === 'UNIT' &&
  (
    (!card.godMark && (AtomicEffectExecutor.matchesColor(card, 'BLUE') || AtomicEffectExecutor.matchesColor(card, 'GREEN'))) ||
    card.fullName.includes('维多利亚') ||
    !!card.specialName?.includes('维多利亚')
  );

const effect_101000281_enter_ready: CardEffect = {
  id: '101000281_enter_ready',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '【诱】〖同名1回合1次〗你的主要阶段，这个单位从手牌放置到战场上时，选择你战场上的1个蓝色或绿色的非神蚀单位、或是「维多利亚」单位：将被选择的单位〖重置〗。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    event.data?.sourceZone === 'HAND' &&
    playerState.isTurn &&
    playerState.unitZone.some(unit => !!unit && isBlueOrGreenNonGodOrVictoria(unit)),
  targetSpec: {
    title: '选择重置单位',
    description: '选择你战场上的1个蓝色或绿色的非神蚀单位、或是「维多利亚」单位，将其重置。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      playerState.unitZone
        .filter((unit): unit is Card => !!unit && isBlueOrGreenNonGodOrVictoria(unit))
        .map(unit => ({ card: unit, source: 'UNIT' as const }))
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.unitZone.filter((unit): unit is Card => !!unit && isBlueOrGreenNonGodOrVictoria(unit));
    if (candidates.length === 0) return;

    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择重置单位',
      '选择你战场上的1个蓝色或绿色的非神蚀单位、或是「维多利亚」单位，将其重置。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101000281_enter_ready' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target) readyByEffect(gameState, target, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000281
 * Card2 Row: 440
 * Card Row: 323
 * Source CardNo: SP02-W02
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗｛你的主要阶段，这个单位从手牌放置到战场上时，选择你战场上的1个蓝色或绿色的非神蚀单位、或是「维多利亚」单位｝：将被选择的单位〖重置〗。
 */
const card: Card = {
  id: '101000281',
  fullName: '兽神之引导',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
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
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_101000281_enter_ready],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
