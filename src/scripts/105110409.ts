import { Card, CardEffect } from '../types/game';
import {
  addInfluence,
  backErosionCount,
  createSelectCardQuery,
  ensureData,
  isNonGodUnit,
  moveCardAsCost,
  nameContains,
  ownUnits,
  silenceAllNonKeywordEffectsPermanently
} from './BaseUtil';

const transformTargets = (playerState: any) =>
  ownUnits(playerState).filter(unit =>
    isNonGodUnit(unit) &&
    !nameContains(unit, '魔导人偶') &&
    !ensureData(unit).extraNameContainsMagicalDollBy
  );

const handCosts = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId);

const cardEffects: CardEffect[] = [{
  id: '105110409_transform_to_magical_doll',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '2~5：主要阶段，选择己方1个《魔导人偶》以外的非神蚀单位，舍弃1张手牌：其失去所有效果，变为伤害3、力量3500，卡名也视为《魔导人偶》。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    backErosionCount(playerState) >= 2 &&
    backErosionCount(playerState) <= 5 &&
    handCosts(playerState, instance).length > 0 &&
    transformTargets(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      transformTargets(playerState),
      '选择魔导人偶对象',
      '选择你战场上的1个《魔导人偶》以外的非神蚀单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110409_transform_to_magical_doll', step: 'TARGET' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const target = transformTargets(playerState).find(unit => unit.gamecardId === selections[0]);
      if (!target) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        handCosts(playerState, instance),
        '选择舍弃手牌',
        '选择1张手牌舍弃。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105110409_transform_to_magical_doll', step: 'DISCARD', targetId: target.gamecardId },
        () => 'HAND'
      );
      return;
    }

    if (context?.step !== 'DISCARD') return;
    const target = transformTargets(playerState).find(unit => unit.gamecardId === context.targetId);
    const discard = handCosts(playerState, instance).find((card: Card) => card.gamecardId === selections[0]);
    if (!target || !discard) return;
    moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', instance);
    silenceAllNonKeywordEffectsPermanently(target, instance);
    target.basePower = 3500;
    target.power = 3500;
    target.baseDamage = 3;
    target.damage = 3;
    const data = ensureData(target);
    data.extraNameContainsMagicalDollBy = instance.fullName;
    data.extraNameContainsMagicalDollSourceCardId = instance.gamecardId;
    addInfluence(target, instance, '卡名也视为《魔导人偶》，力量3500，伤害3');
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110409
 * Card2 Row: 626
 * Card Row: 510
 * Source CardNo: BT08-Y11
 * Package: BT08(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖2~5〗【启】{选择你战场上的1个《魔导人偶》以外的非神蚀单位}[舍弃1张手牌]:被选择的单位失去所有效果，变为〖伤害3〗〖力量3500〗，卡名也视为《魔导人偶》。
 */
const card: Card = {
  id: '105110409',
  fullName: '教授「多明尼克」',
  specialName: '多明尼克',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '学院要塞',
  acValue: 3,
  power: 2500,
  basePower: 2500,
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
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
