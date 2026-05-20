import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, cardsInZones, moveCard, selectFromEntries, wealthContinuous } from './BaseUtil';

const cardEffects: CardEffect[] = [
  wealthContinuous('104020338_wealth_1', 1),
  {
    id: '104020338_put_logistics',
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    limitCount: 1,
    limitNameType: true,
    erosionTotalLimit: [4, 6],
    description: '4-6，你的主要阶段：将卡组或墓地中的1张《商队后勤》放置到战场上。',
    condition: (gameState, playerState) =>
      playerState.isTurn &&
      gameState.phase === 'MAIN' &&
      cardsInZones(playerState, ['DECK', 'GRAVE']).some(({ card }) =>
        card.fullName === '商队后勤' &&
        canPutUnitOntoBattlefield(playerState, card)
      ),
    execute: async (instance, gameState, playerState) => {
      const entries = cardsInZones(playerState, ['DECK', 'GRAVE'])
        .filter(({ card }) => card.fullName === '商队后勤' && canPutUnitOntoBattlefield(playerState, card));
      selectFromEntries(
        gameState,
        playerState.uid,
        entries,
        '选择商队后勤',
        '选择你的卡组或墓地中的1张《商队后勤》放置到战场上。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '104020338_put_logistics' }
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || !canPutUnitOntoBattlefield(playerState, target)) return;
      const fromDeck = target.cardlocation === 'DECK';
      moveCard(gameState, playerState.uid, target, 'UNIT', instance);
      if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020338
 * Card2 Row: 463
 * Card Row: 398
 * Source CardNo: BT06-B04
 * Package: BT06(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】财富1（只要这个单位在战场上，你获得1个财富指示物）。
 * 【4-6】【启】〖同名1回合1次〗{你的主要阶段}：将你卡组或墓地中的1张《商队后勤》放置到战场上。
 */
const card: Card = {
  id: '104020338',
  fullName: '往雪原的非晶商队',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '九尾商会联盟',
  acValue: 3,
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
