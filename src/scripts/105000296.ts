import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  moveCard,
  moveCardAsCost,
  ownUnits,
  putUnitOntoField
} from './BaseUtil';

const isRedOrYellowNonGodOrTenma = (card: Card) =>
  card.cardlocation === 'UNIT' &&
  (
    (!card.godMark && (AtomicEffectExecutor.matchesColor(card, 'RED') || AtomicEffectExecutor.matchesColor(card, 'YELLOW'))) ||
    card.fullName.includes('天魔') ||
    !!card.specialName?.includes('天魔')
  );

const differentColorNonGodUnitsInGrave = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.type === 'UNIT' && !card.godMark);

const hasIrodoriCost = (playerState: any, amount: number) =>
  new Set(differentColorNonGodUnitsInGrave(playerState).map((card: Card) => card.color)).size >= amount;

const payIrodoriCost = (gameState: any, playerState: any, instance: Card, selections: string[], amount: number) => {
  const selected = selections
    .map(id => playerState.grave.find((card: Card) => card.gamecardId === id))
    .filter((card: Card | undefined): card is Card => !!card && card.type === 'UNIT' && !card.godMark);
  const colors = new Set(selected.map(card => card.color));
  if (selected.length !== amount || colors.size !== amount) return false;

  selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
  return true;
};

const effect_105000296_irodori_enter: CardEffect = {
  id: '105000296_irodori_enter',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '异彩2：将墓地2种颜色的非神蚀单位卡各1张放逐，将手牌中的这张卡放置到战场上。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'HAND' &&
    playerState.isTurn &&
    canPutUnitOntoBattlefield(playerState, instance) &&
    hasIrodoriCost(playerState, 2),
  cost: async (gameState, playerState, instance) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      differentColorNonGodUnitsInGrave(playerState),
      '选择异彩费用',
      '选择墓地中2种颜色的非神蚀单位卡各1张放逐。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '105000296_irodori_enter', costType: 'SP03_Y03_IRODORI2' },
      () => 'GRAVE'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    (instance as any).data = {
      ...((instance as any).data || {}),
      enteredByIrodoriTurn: gameState.turnCount
    };
    if (putUnitOntoField(gameState, playerState.uid, instance, instance)) {
      (instance as any).data = {
        ...((instance as any).data || {}),
        enteredByIrodoriTurn: gameState.turnCount
      };
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType !== 'SP03_Y03_IRODORI2') return;
    if (!payIrodoriCost(gameState, playerState, instance, selections, 2)) {
      context.cancelActivation = true;
    }
  }
};

const effect_105000296_irodori_blink: CardEffect = {
  id: '105000296_irodori_blink',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  limitCount: 1,
  limitNameType: true,
  triggerLocation: ['UNIT'],
  description: '同名1回合1次：通过异彩进入战场时，选择己方红/黄非神蚀单位或《天魔》单位，放逐后放置回战场。',
  condition: (gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.targetZone === 'UNIT' &&
    (instance as any).data?.enteredByIrodoriTurn === gameState.turnCount &&
    ownUnits(playerState).some(isRedOrYellowNonGodOrTenma),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(isRedOrYellowNonGodOrTenma),
      '选择放逐再登场单位',
      '选择你战场上的1个红色或黄色的非神蚀单位、或卡名含有《天魔》的单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000296_irodori_blink' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT' || !isRedOrYellowNonGodOrTenma(target)) return;
    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId);
    if (!ownerUid || ownerUid !== playerState.uid) return;

    moveCard(gameState, ownerUid, target, 'EXILE', instance);
    const exiled = AtomicEffectExecutor.findCardById(gameState, target.gamecardId);
    if (exiled) putUnitOntoField(gameState, ownerUid, exiled, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000296
 * Card2 Row: 523
 * Card Row: 345
 * Source CardNo: SP03-Y03
 * Package: SP03(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】异彩2。
 * 【诱】〖同名1回合1次〗{这个单位通过异彩能力进入战场时，选择你战场上的1个红色或黄色的非神蚀单位，或卡名含有《天魔》的单位}：将被选择的单位放逐。之后，将那个单位放置到战场上。
 */
const card: Card = {
  id: '105000296',
  fullName: '天魔小雪仙「优姬」',
  specialName: '优姬',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '无',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105000296_irodori_enter, effect_105000296_irodori_blink],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
