import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, cardsInZones, createSelectCardQuery, destroyByEffect, isNonGodUnit, moveCard, wealthContinuous } from './BaseUtil';

const recordCandidates = (playerState: any) => cardsInZones(playerState, ['EROSION_FRONT', 'GRAVE'])
  .filter(({ card }) => card.fullName === '阿克蒂的记录');

const cardEffects: CardEffect[] = [
  wealthContinuous('104020339_wealth_2', 2),
  {
    id: '104020339_destroy_for_record',
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    limitCount: 1,
    erosionBackLimit: [2, 10],
    description: '创痕2，1回合1次，选择你战场上的1个非神蚀单位：将其破坏，将侵蚀区或墓地中的1张《阿克蒂的记录》加入手牌。',
    condition: (_gameState, playerState, instance) =>
      playerState.erosionBack.filter(Boolean).length >= 2 &&
      playerState.unitZone.some((unit: Card | null) => !!unit && unit.gamecardId !== instance.gamecardId && isNonGodUnit(unit)) &&
      recordCandidates(playerState).length > 0,
    execute: async (instance, gameState, playerState) => {
      const targets = playerState.unitZone.filter((unit: Card | null): unit is Card =>
        !!unit && unit.gamecardId !== instance.gamecardId && isNonGodUnit(unit)
      );
      createSelectCardQuery(
        gameState,
        playerState.uid,
        targets,
        '选择破坏单位',
        '选择你的战场上的1个非神蚀单位破坏。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '104020339_destroy_for_record', step: 'DESTROY' },
        () => 'UNIT'
      );
    },
    targetSpec: {
      title: '选择破坏单位',
      description: '选择你的战场上的1个非神蚀单位破坏。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
      step: 'DESTROY',
      getCandidates: (_gameState, playerState, instance) =>
        playerState.unitZone
          .filter((unit: Card | null): unit is Card => !!unit && unit.gamecardId !== instance.gamecardId && isNonGodUnit(unit))
          .map(card => ({ card, source: 'UNIT' as any }))
    },
    onQueryResolve: async (instance, gameState, playerState, selections, context) => {
      if (context?.step === 'DESTROY') {
        const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
        if (target && target.cardlocation === 'UNIT' && isNonGodUnit(target)) {
          destroyByEffect(gameState, target, instance);
        }
        const entries = recordCandidates(playerState);
        if (entries.length === 0) return;
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, entries),
          title: '选择阿克蒂的记录',
          description: '选择你的侵蚀区或墓地中的1张《阿克蒂的记录》加入手牌。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: { sourceCardId: instance.gamecardId, effectId: '104020339_destroy_for_record', step: 'RECORD' }
        };
        return;
      }
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || target.fullName !== '阿克蒂的记录') return;
      moveCard(gameState, playerState.uid, target, 'HAND', instance);
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020339
 * Card2 Row: 464
 * Card Row: 399
 * Source CardNo: BT06-B05
 * Package: BT06(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】财富2（只要这个单位在战场上，你获得2个财富指示物）。
 * 【创痕2】【启】〖1回合1次〗{选择你的战场上的1个非神蚀单位}：将被选择的卡破坏，将你的侵蚀区或墓地中的1张《阿克蒂的记录》加入手牌。
 */
const card: Card = {
  id: '104020339',
  fullName: '商队领袖「阿克蒂」',
  specialName: '阿克蒂',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
  faction: '九尾商会联盟',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 1,
  baseDamage: 1,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
