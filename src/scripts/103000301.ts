import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addInfluence,
  canActivateDefaultTiming,
  createSelectCardQuery,
  moveCard,
  moveCardAsCost,
  ownUnits,
  ownerUidOf,
  faceUpErosion
} from './BaseUtil';

const isKuyaCard = (card: Card) =>
  card.fullName.includes('九夜') || !!card.specialName?.includes('九夜');

const greenCostCards = (playerState: any) =>
  playerState.grave.filter((card: Card) =>
    AtomicEffectExecutor.matchesColor(card, 'RED') ||
    AtomicEffectExecutor.matchesColor(card, 'BLUE') ||
    AtomicEffectExecutor.matchesColor(card, 'GREEN')
  );

const hasTwoRequiredCostColors = (playerState: any) => {
  const colors = new Set(greenCostCards(playerState).map((card: Card) => card.color));
  return ['RED', 'BLUE', 'GREEN'].filter(color => colors.has(color as Card['color'])).length >= 2;
};

const payTwoOfRedBlueGreenGraveCost = (gameState: any, playerState: any, instance: Card, selections: string[]) => {
  const selected = selections
    .map(id => playerState.grave.find((card: Card) => card.gamecardId === id))
    .filter((card: Card | undefined): card is Card => !!card);
  const colors = new Set(selected.map(card => card.color).filter(color => ['RED', 'BLUE', 'GREEN'].includes(String(color))));
  if (selected.length !== 2 || colors.size !== 2) return false;
  selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
  return true;
};

const markAsTwoDamageThirtyFive = (target: Card, source: Card) => {
  target.damage = 2;
  target.power = 3500;
  target.temporaryDamageBuff = 2 - (target.baseDamage ?? 0);
  target.temporaryPowerBuff = 3500 - (target.basePower ?? 0);
  target.isAnnihilation = true;
  target.temporaryAnnihilation = true;
  target.temporaryBuffSources = {
    ...(target.temporaryBuffSources || {}),
    damage: source.fullName,
    power: source.fullName,
    annihilation: source.fullName
  };
  addInfluence(target, source, '本回合变为伤害2、力量3500，并获得歼灭');
};

const effect_103000301_recover_kuya_from_erosion: CardEffect = {
  id: '103000301_recover_kuya_from_erosion',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '1回合1次：主要阶段中选择侵蚀区1张正面《九夜》卡，舍弃1张手牌，将其加入手牌。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    playerState.hand.length > 0 &&
    faceUpErosion(playerState).some(isKuyaCard),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      faceUpErosion(playerState).filter(isKuyaCard),
      '选择九夜卡',
      '选择侵蚀区中的1张卡名含有《九夜》的正面卡。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000301_recover_kuya_from_erosion', step: 'TARGET' },
      () => 'EROSION_FRONT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      createSelectCardQuery(
        gameState,
        playerState.uid,
        playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId),
        '舍弃手牌',
        '舍弃1张手牌作为费用，将选择的九夜卡加入手牌。',
        1,
        1,
        {
          sourceCardId: instance.gamecardId,
          effectId: '103000301_recover_kuya_from_erosion',
          step: 'DISCARD',
          targetId: selections[0]
        },
        () => 'HAND'
      );
      return;
    }

    if (context?.step !== 'DISCARD') return;
    const discard = selections[0] ? playerState.hand.find((card: Card) => card.gamecardId === selections[0]) : undefined;
    const target = context.targetId ? faceUpErosion(playerState).find(card => card.gamecardId === context.targetId) : undefined;
    if (!discard || !target || !isKuyaCard(target)) return;
    moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', instance);
    moveCard(gameState, playerState.uid, target, 'HAND', instance);
  }
};

const effect_103000301_transform_unit: CardEffect = {
  id: '103000301_transform_unit',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '1回合1次：选择己方1个非神蚀单位，放逐墓地红/蓝/绿各1张，本回合其变为伤害2、力量3500并获得歼灭。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    ownUnits(playerState).some(unit => !unit.godMark) &&
    hasTwoRequiredCostColors(playerState),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(unit => !unit.godMark),
      '选择强化单位',
      '选择自己战场上的1个非神蚀单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000301_transform_unit', step: 'TARGET' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || target.cardlocation !== 'UNIT' || ownerUidOf(gameState, target) !== playerState.uid || target.godMark) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        greenCostCards(playerState),
        '选择费用',
        '选择墓地中的红色、蓝色、绿色中的2种颜色的卡各1张放逐。',
        2,
        2,
        {
          sourceCardId: instance.gamecardId,
          effectId: '103000301_transform_unit',
          step: 'COST',
          targetId: target.gamecardId
        },
        () => 'GRAVE'
      );
      return;
    }

    if (context?.step !== 'COST') return;
    if (!payTwoOfRedBlueGreenGraveCost(gameState, playerState, instance, selections)) return;
    const target = context.targetId ? AtomicEffectExecutor.findCardById(gameState, context.targetId) : undefined;
    if (target?.cardlocation === 'UNIT' && ownerUidOf(gameState, target) === playerState.uid && !target.godMark) {
      markAsTwoDamageThirtyFive(target, instance);
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000301
 * Card2 Row: 531
 * Card Row: 351
 * Source CardNo: SP03-G03
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗{主要阶段中，选择你的侵蚀区中的1张卡名含有《九夜》的正面卡}[舍弃1张手牌]：将被选择的卡加入手牌。
 * 【启】〖1回合1次〗{你的主要阶段，选择你的战场上的1个非神蚀单位}[将你的墓地中的红、蓝色、绿色中的2种颜色的卡各1张放逐]：被选择的卡本回合中变为[2][3500]并获得【歼灭】。
 */
const card: Card = {
  id: '103000301',
  fullName: '霜梦九夜「冬织」',
  specialName: '冬织',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_103000301_recover_kuya_from_erosion, effect_103000301_transform_unit],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
