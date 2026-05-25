import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, cardsInZones, createSelectCardQuery, discardHandCost, isNonGodUnit, moveCard, putUnitOntoField } from './BaseUtil';

const ADVENTURER = '冒险家公会';

const isAdventurerNonGodUnit = (card: Card) =>
  isNonGodUnit(card) &&
  (card.faction === ADVENTURER || card.fullName.includes(ADVENTURER));

const canCycleTargetThroughErosion = (playerState: any, card: Card) => {
  if (!isAdventurerNonGodUnit(card)) return false;
  if (card.cardlocation === 'UNIT') {
    return playerState.unitZone.some((unit: Card | null) => unit === null || unit?.gamecardId === card.gamecardId);
  }
  return card.cardlocation === 'GRAVE' && canPutUnitOntoBattlefield(playerState, card);
};

const targets = (playerState: any) =>
  cardsInZones(playerState, ['UNIT', 'GRAVE'])
    .filter(({ card }) => canCycleTargetThroughErosion(playerState, card));

const cardEffects: CardEffect[] = [{
  id: '104030415_cycle_adventurer_through_erosion',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次，舍弃1张手牌：将你战场上或墓地的1张<冒险家公会>非神蚀单位放置到侵蚀区，之后将那张卡从侵蚀区放置到战场。',
  condition: (_gameState, playerState) =>
    playerState.hand.length > 0 &&
    targets(playerState).length > 0,
  targetSpec: {
    title: '选择冒险家公会单位',
    description: '选择你战场上或墓地的1张冒险家公会非神蚀单位放置到侵蚀区，之后放置到战场。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'GRAVE'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      targets(playerState).map(({ card }) => ({ card, source: card.cardlocation as any }))
  },
  cost: discardHandCost(1),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets(playerState).map(entry => entry.card),
      '选择冒险家公会单位',
      '选择你战场上或墓地的1张<冒险家公会>非神蚀单位放置到侵蚀区，之后放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104030415_cycle_adventurer_through_erosion' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType === 'DISCARD_HAND_COST') return;
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !targets(playerState).some(entry => entry.card.gamecardId === target.gamecardId)) return;
    moveCard(gameState, playerState.uid, target, 'EROSION_FRONT', instance);
    const erosionCard = AtomicEffectExecutor.findCardById(gameState, target.gamecardId);
    if (erosionCard?.cardlocation === 'EROSION_FRONT') {
      putUnitOntoField(gameState, playerState.uid, erosionCard, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104030415
 * Card2 Row: 632
 * Card Row: 516
 * Source CardNo: BT08-B06
 * Package: BT08(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗[舍弃1张手牌]:将你战场上或墓地的1张<冒险家公会>的非神蚀单位卡放置到你的侵蚀区，之后，将侵蚀区中的那张卡放置到战场上。
 */
const card: Card = {
  id: '104030415',
  fullName: '龙之翼「艾伯特」',
  specialName: '艾伯特',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
  faction: '冒险家公会',
  acValue: 5,
  power: 3000,
  basePower: 3000,
  damage: 2,
  baseDamage: 2,
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
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
