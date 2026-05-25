import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, createSelectCardQuery, moveCardAsCost, ownUnits, putUnitOntoField } from './BaseUtil';

const isBeastGodUnit = (card: Card) =>
  card.type === 'UNIT' && (card.fullName.includes('兽神') || !!card.specialName?.includes('兽神'));

const isWhiteOrBlueAccessThreeOrLessNonGodUnit = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  Number(card.acValue || 0) <= 3 &&
  (AtomicEffectExecutor.matchesColor(card, 'WHITE') || AtomicEffectExecutor.matchesColor(card, 'BLUE'));

const reviveCandidates = (playerState: any) =>
  playerState.grave.filter((card: Card) =>
    card.type === 'UNIT' &&
    (isWhiteOrBlueAccessThreeOrLessNonGodUnit(card) || isBeastGodUnit(card)) &&
    canPutUnitOntoBattlefield(playerState, card)
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

const effect_103000302_irodori_enter: CardEffect = {
  id: '103000302_irodori_enter',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '异彩2：将墓地2种颜色的非神蚀单位各1张放逐，将手牌中的这张卡放置到战场上。',
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
      { sourceCardId: instance.gamecardId, effectId: '103000302_irodori_enter', costType: 'SP03_G04_IRODORI2' },
      () => 'GRAVE'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    (instance as any).data = {
      ...((instance as any).data || {}),
      enteredByIrodoriTurn: gameState.turnCount
    };
    putUnitOntoField(gameState, playerState.uid, instance, instance);
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType !== 'SP03_G04_IRODORI2') return;
    if (!payIrodoriCost(gameState, playerState, instance, selections, 2)) {
      context.cancelActivation = true;
    }
  }
};

const effect_103000302_irodori_revive: CardEffect = {
  id: '103000302_irodori_revive',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  triggerLocation: ['UNIT'],
  description: '同名1回合1次：这个单位通过异彩能力进入战场时，舍弃1张手牌，可以将墓地中符合条件的单位放置到战场。',
  condition: (gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.targetZone === 'UNIT' &&
    (instance as any).data?.enteredByIrodoriTurn === gameState.turnCount &&
    playerState.hand.length > 0 &&
    ownUnits(playerState).length < 6 &&
    reviveCandidates(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      reviveCandidates(playerState),
      '选择放置单位',
      '选择墓地中的1张白色或蓝色ACCESS 3以下非神蚀单位，或卡名含有《兽神》的单位卡放置到战场上。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000302_irodori_revive', step: 'TARGET' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const target = selections[0] ? reviveCandidates(playerState).find((card: Card) => card.gamecardId === selections[0]) : undefined;
      const discardCandidates = playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId);
      if (!target || discardCandidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        discardCandidates,
        '舍弃手牌',
        '舍弃1张手牌作为费用。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '103000302_irodori_revive', step: 'DISCARD', targetId: target.gamecardId },
        () => 'HAND'
      );
      return;
    }

    if (context?.step !== 'DISCARD') return;
    const discard = playerState.hand.find((card: Card) => card.gamecardId === selections[0] && card.gamecardId !== instance.gamecardId);
    const target = context?.targetId ? reviveCandidates(playerState).find((card: Card) => card.gamecardId === context.targetId) : undefined;
    if (discard && target) {
      moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', instance);
      putUnitOntoField(gameState, playerState.uid, target, instance);
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000302
 * Card2 Row: 532
 * Card Row: 352
 * Source CardNo: SP03-G04
 * Package: SP03(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】异彩2。
 * 【诱】〖同名1回合1次〗{这个单位通过异彩能力进入战场时，选择你墓中的1张白色或蓝色的ACCESS+3以下的非神蚀单位卡，或卡名含有《兽神》的单位卡}[舍弃1张手牌]：你可以将被选择的单位卡放置到战场上。
 */
const card: Card = {
  id: '103000302',
  fullName: '兽神之铃音「贝儿」',
  specialName: '贝儿',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
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
  effects: [effect_103000302_irodori_enter, effect_103000302_irodori_revive],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
