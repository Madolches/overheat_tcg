import { Card, CardEffect } from '../types/game';
import {
  addContinuousDamage,
  addContinuousPower,
  allCardsOnField,
  canActivateDefaultTiming,
  createChoiceQuery,
  createSelectCardQuery,
  destroyByEffect,
  isNonGodFieldCard,
  isSameFactionCard,
  totalErosionCount,
  wasPlacedByPromotionThisTurn
} from './BaseUtil';

const nonGodTargets = (gameState: any) => allCardsOnField(gameState).filter(isNonGodFieldCard);
const godTargets = (gameState: any) => allCardsOnField(gameState).filter(card => !!card.godMark);
const sameFactionHandCosts = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId && isSameFactionCard(card, instance));

const cardEffects: CardEffect[] = [{
  id: '102050394_promotion_destroy_modes',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：这个单位由于晋升进入战场的回合中，舍弃1张同势力手牌，选择破坏最多2张非神蚀卡或创痕3破坏1张神蚀卡。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    wasPlacedByPromotionThisTurn(gameState, instance) &&
    sameFactionHandCosts(playerState, instance).length > 0 &&
    (nonGodTargets(gameState).length > 0 || (totalErosionCount(playerState) >= 3 && godTargets(gameState).length > 0)),
  cost: async (gameState, playerState, instance) => {
    const costs = sameFactionHandCosts(playerState, instance);
    if (costs.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costs,
      '选择舍弃费用',
      '选择1张同势力手牌舍弃。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        costType: 'DISCARD_HAND_COST',
        discardCostAmount: 1
      },
      () => 'HAND'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    const options = [];
    if (nonGodTargets(gameState).length > 0) options.push({ value: 'NON_GOD', label: '破坏最多2张非神蚀卡' });
    if (totalErosionCount(playerState) >= 3 && godTargets(gameState).length > 0) options.push({ value: 'GOD', label: '破坏1张神蚀卡' });
    createChoiceQuery(
      gameState,
      playerState.uid,
      '选择效果',
      '选择1项效果执行。',
      options,
      { sourceCardId: instance.gamecardId, effectId: '102050394_promotion_destroy_modes', step: 'MODE' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      const mode = selections[0];
      if (mode === 'NON_GOD') {
        createSelectCardQuery(
          gameState,
          playerState.uid,
          nonGodTargets(gameState),
          '选择非神蚀卡',
          '选择战场上最多2张非神蚀卡破坏。',
          0,
          2,
          { sourceCardId: instance.gamecardId, effectId: '102050394_promotion_destroy_modes', step: 'NON_GOD' },
          card => card.cardlocation as any
        );
      } else if (mode === 'GOD') {
        createSelectCardQuery(
          gameState,
          playerState.uid,
          godTargets(gameState),
          '选择神蚀卡',
          '选择战场上1张神蚀卡破坏。',
          1,
          1,
          { sourceCardId: instance.gamecardId, effectId: '102050394_promotion_destroy_modes', step: 'GOD' },
          card => card.cardlocation as any
        );
      }
      return;
    }
    const targets = selections
      .map(id => allCardsOnField(gameState).find(card => card.gamecardId === id))
      .filter((card: Card | undefined): card is Card => !!card);
    targets.forEach(target => {
      if (context?.step === 'NON_GOD' && target.godMark) return;
      if (context?.step === 'GOD' && !target.godMark) return;
      destroyByEffect(gameState, target, instance);
    });
  }
}, {
  id: '102050394_erosion_stats',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [4, 7],
  description: '4~7：这个单位伤害+1、力量+500。',
  applyContinuous: (_gameState, instance) => {
    addContinuousDamage(instance, instance, 1);
    addContinuousPower(instance, instance, 500);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050394
 * Card2 Row: 604
 * Card Row: 488
 * Source CardNo: BT08-R11
 * Package: BT08(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗{这个单位由于晋升能力进入战场的回合中，选择下列的1项效果并执行}[舍弃1张<伊列宇王国>的手牌]:
 * ◆{选择战场上最多2张非神蚀卡}:将选择的卡破坏。
 * ◆【创痕3】{选择战场上的1张神蚀卡}:将选择的卡破坏。
 * 〖4~7〗【永】:这个单位〖伤害+1〗〖力量+500〗。
 */
const card: Card = {
  id: '102050394',
  fullName: '赤艳一闪「安德莉亚」',
  specialName: '安德莉亚',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '伊列宇王国',
  acValue: 4,
  power: 3500,
  basePower: 3500,
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
