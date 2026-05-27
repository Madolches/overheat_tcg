import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addContinuousKeyword,
  addContinuousPower,
  appendEndResolution,
  canActivateDefaultTiming,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  discardHandCost,
  ensureData,
  moveCard,
  ownerUidOf
} from './BaseUtil';

const nonGodUnitTargets = (gameState: any) =>
  Object.values(gameState.players)
    .flatMap((player: any) => player.unitZone)
    .filter((card: Card | null): card is Card => !!card && !card.godMark);

const returnExiledUnit = (gameState: any, unitId: string, ownerUid: string, source: Card) => {
  const target = AtomicEffectExecutor.findCardById(gameState, unitId);
  if (!target || target.cardlocation !== 'EXILE') return;
  const owner = gameState.players[ownerUid];
  if (!owner || !canPutUnitOntoBattlefield(owner, target)) return;
  moveCard(gameState, ownerUid, target, 'UNIT', source);
  const live = AtomicEffectExecutor.findCardById(gameState, unitId);
  if (live) {
    live.isExhausted = false;
    live.displayState = 'FRONT_UPRIGHT';
    delete ensureData(live).returnToOwnerFieldAtTurnEndSourceName;
  }
};

const cardEffects: CardEffect[] = [{
  id: '101140398_exile_non_god_unit_until_end',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  erosionBackLimit: [1, 99],
  description: '创痕1，1回合1次：选择战场上的1个非神蚀单位，舍弃2张手牌，将其放逐。回合结束时，将其放置到战场上。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId).length >= 2 &&
    nonGodUnitTargets(gameState).length > 0,
  cost: discardHandCost(2),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodUnitTargets(gameState),
      '选择放逐单位',
      '选择战场上的1个非神蚀单位，将其放逐。回合结束时，将其放置到战场上。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101140398_exile_non_god_unit_until_end' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择放逐单位',
    description: '选择战场上的1个非神蚀单位，将其放逐。回合结束时，将其放置到战场上。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState =>
      nonGodUnitTargets(gameState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    const targetOwnerUid = target ? ownerUidOf(gameState, target) : undefined;
    if (!target || !targetOwnerUid || target.godMark || target.cardlocation !== 'UNIT') return;
    const targetId = target.gamecardId;
    moveCard(gameState, targetOwnerUid, target, 'EXILE', instance);
    const exiled = AtomicEffectExecutor.findCardById(gameState, targetId);
    if (exiled) {
      ensureData(exiled).returnToOwnerFieldAtTurnEndSourceName = instance.fullName;
    }
    appendEndResolution(gameState, playerState.uid, instance, '101140398_return_exiled_unit', async (_source, state) => {
      returnExiledUnit(state, targetId, targetOwnerUid, instance);
    });
  }
}, {
  id: '101140398_low_erosion_stats',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [0, 4],
  description: '0~4：这个单位力量+500并获得【英勇】。',
  applyContinuous: (_gameState, instance) => {
    addContinuousPower(instance, instance, 500);
    addContinuousKeyword(instance, instance, 'heroic');
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140398
 * Card2 Row: 608
 * Card Row: 492
 * Source CardNo: BT08-W04
 * Package: BT08(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕1】【启】〖1回合1次〗{选择战场上的1个非神蚀单位}[舍弃2张手牌]:将被选择的单位放逐。本回合结束时，将其放置到战场上。
 * 〖0~4〗【永】:这个单位〖力量+500〗并获得【英勇】
 */
const card: Card = {
  id: '101140398',
  fullName: '菲之使徒「杜鲁」',
  specialName: '杜鲁',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '女神教会',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: false,
  baseHeroic: false,
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
