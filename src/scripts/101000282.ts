import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, moveCard, moveCardAsCost, moveRandomGraveToDeckBottom, putUnitOntoField } from './BaseUtil';

const isRedOrYellowNonGodOrTenma = (card: Card) =>
  card.cardlocation === 'UNIT' &&
  (
    (!card.godMark && (AtomicEffectExecutor.matchesColor(card, 'RED') || AtomicEffectExecutor.matchesColor(card, 'YELLOW'))) ||
    card.fullName.includes('天魔') ||
    !!card.specialName?.includes('天魔')
  );

const hasGraveBanishCost = (playerState: any) =>
  ['RED', 'WHITE', 'YELLOW'].filter(color =>
    playerState.grave.some((card: Card) => card.color === color)
  ).length >= 2;

const payTwoColorGraveCost = (gameState: any, playerState: any, instance: Card, selections: string[]) => {
  const selected = selections
    .map(id => playerState.grave.find((card: Card) => card.gamecardId === id))
    .filter((card: Card | undefined): card is Card => !!card);
  const colors = new Set(selected.map(card => card.color));
  if (selected.length !== 2 || colors.size !== 2 || ![...colors].every(color => ['RED', 'WHITE', 'YELLOW'].includes(color))) {
    return false;
  }

  selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
  return true;
};

const effect_101000282_leave_recover: CardEffect = {
  id: '101000282_leave_recover',
  type: 'TRIGGER',
  triggerEvent: ['CARD_LEFT_ZONE', 'CARD_LEFT_FIELD', 'CARD_DESTROYED_BATTLE'],
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'],
  isMandatory: true,
  description: '【诱】这个单位由于战斗或对手的卡的效果从战场上离开时：恢复3。',
  condition: (_gameState, playerState, instance, event) => {
    if (event?.type === 'CARD_DESTROYED_BATTLE') {
      return event.targetCardId === instance.gamecardId && playerState.grave.length > 0;
    }

    return (
      (event?.sourceCardId === instance.gamecardId || event?.data?.previousSourceCardId === instance.gamecardId) &&
      event.data?.zone === 'UNIT' &&
      (
        event.data?.isBattle ||
        (event.data?.isEffect && event.data?.effectSourcePlayerUid && event.data.effectSourcePlayerUid !== playerState.uid)
      ) &&
      playerState.grave.length > 0
    );
  },
  execute: async (instance, gameState, playerState) => {
    moveRandomGraveToDeckBottom(gameState, playerState.uid, Math.min(3, playerState.grave.length), instance);
  }
};

const effect_101000282_blink: CardEffect = {
  id: '101000282_blink',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '【启】〖同名1回合1次〗你的回合中，选择你战场上的1个红色或黄色的非神蚀单位、或卡名含有《天魔》的单位，将你的墓地中的红色、白色、黄色中的2种颜色的卡各1张放逐：将被选择的单位放逐，之后，将那个单位放置到战场上。',
  condition: (_gameState, playerState, instance) =>
    playerState.isTurn &&
    instance.cardlocation === 'UNIT' &&
    hasGraveBanishCost(playerState) &&
    playerState.unitZone.some((unit: Card | null) => !!unit && isRedOrYellowNonGodOrTenma(unit)),
  targetSpec: {
    title: '选择放逐再登场单位',
    description: '选择你战场上的1个红色或黄色的非神蚀单位、或卡名含有《天魔》的单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      playerState.unitZone
        .filter((unit): unit is Card => !!unit && isRedOrYellowNonGodOrTenma(unit))
        .map(unit => ({ card: unit, source: 'UNIT' as const }))
  },
  cost: async (gameState, playerState, instance) => {
    const candidates = playerState.grave.filter(card => ['RED', 'WHITE', 'YELLOW'].includes(card.color));
    const colors = new Set(candidates.map(card => card.color));
    if (colors.size < 2) return false;

    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择墓地费用',
      '选择墓地中红色、白色、黄色中的2种颜色的卡各1张放逐作为费用。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '101000282_blink', costType: 'SP02_TWO_COLOR_GRAVE_EXILE' },
      () => 'GRAVE'
    );
    return true;
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType === 'SP02_TWO_COLOR_GRAVE_EXILE') {
      if (!payTwoColorGraveCost(gameState, playerState, instance, selections)) {
        context.cancelActivation = true;
      }
      return;
    }

    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT') return;
    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId);
    if (!ownerUid) return;

    moveCard(gameState, ownerUid, target, 'EXILE', instance);
    const exiled = AtomicEffectExecutor.findCardById(gameState, target.gamecardId);
    if (exiled) putUnitOntoField(gameState, ownerUid, exiled, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000282
 * Card2 Row: 441
 * Card Row: 324
 * Source CardNo: SP02-W03
 * Package: SP02(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】｛这个单位由于战斗或对手的卡的效果从战场上离开时｝：恢复3（随机选择你的墓地中的3张卡，将其放置到你的卡组底）。
 * 【启】〖同名1回合1次〗｛你的回合中，选择你战场上的1个红色或黄色的非神蚀单位、或卡名含有《天魔》的单位｝[将你的墓地中的红色、白色、黄色中的2种颜色的卡各1张放逐]：将战场上的被选择的单位放逐，之后，将那个单位放置到战场上。
 */
const card: Card = {
  id: '101000282',
  fullName: '天魔自由人「艾瑟儿」',
  specialName: '艾瑟儿',
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
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_101000282_leave_recover, effect_101000282_blink],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
