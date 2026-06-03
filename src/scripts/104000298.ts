import { Card, CardEffect } from '../types/game';
import {
  canPutUnitOntoBattlefield,
  cardsInZones,
  createSelectCardQuery,
  faceUpErosion,
  moveCard,
  moveCardAsCost,
  putUnitOntoField
} from './BaseUtil';

const isKuyaCard = (card: Card) =>
  card.fullName.includes('九夜') || !!card.specialName?.includes('九夜');

const isRedOrGreenFaceUpNonGodUnit = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  card.displayState !== 'FRONT_FACEDOWN' &&
  (card.color === 'RED' || card.color === 'GREEN');

const recoverCandidates = (playerState: any) =>
  cardsInZones(playerState, ['GRAVE', 'EROSION_FRONT'])
    .filter(({ card }) =>
      (card.cardlocation === 'GRAVE' && (isKuyaCard(card) || isRedOrGreenFaceUpNonGodUnit(card))) ||
      (
        card.cardlocation === 'EROSION_FRONT' &&
        faceUpErosion(playerState).some(erosion => erosion.gamecardId === card.gamecardId) &&
        (isKuyaCard(card) || isRedOrGreenFaceUpNonGodUnit(card))
      )
    )
    .map(({ card }) => card);

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

const effect_104000298_irodori_enter: CardEffect = {
  id: '104000298_irodori_enter',
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
      { sourceCardId: instance.gamecardId, effectId: '104000298_irodori_enter', costType: 'SP03_B02_IRODORI2' },
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
    if (context?.costType !== 'SP03_B02_IRODORI2') return;
    if (!payIrodoriCost(gameState, playerState, instance, selections, 2)) {
      context.cancelActivation = true;
    }
  }
};

const effect_104000298_irodori_recover: CardEffect = {
  id: '104000298_irodori_recover',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  limitCount: 1,
  limitNameType: true,
  triggerLocation: ['UNIT'],
  description: '同名1回合1次：通过异彩进入战场时，选择墓地或正面侵蚀区的红/绿非神蚀单位卡，或《九夜》卡加入手牌。',
  condition: (gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.targetZone === 'UNIT' &&
    (instance as any).data?.enteredByIrodoriTurn === gameState.turnCount &&
    recoverCandidates(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      recoverCandidates(playerState),
      '选择回收卡',
      '选择墓地或正面侵蚀区中1张红色或绿色正面非神蚀单位卡，或卡名含有《九夜》的卡加入手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104000298_irodori_recover' },
      card => card.cardlocation as any
    );
  },
  targetSpec: {
    title: '选择回收卡',
    description: '选择你墓地或侵蚀前区中的1张符合条件的卡加入手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE', 'EROSION_FRONT'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      recoverCandidates(playerState).map((card: Card) => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = recoverCandidates(playerState).find((card: Card) => card.gamecardId === selections[0]);
    if (selected) {
      moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104000298
 * Card2 Row: 526
 * Card Row: 348
 * Source CardNo: SP03-B02
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】异彩2。
 * 【诱】〖同名1回合1次〗{这个单位通过异彩能力进入战场时，选择你墓地或侵蚀区1张红色或绿色的正面的非神蚀单位卡，或卡名含有《九夜》的卡}：将被选择的卡加入手牌。
 */
const card: Card = {
  id: '104000298',
  fullName: '霜梦九夜「晓雪」',
  specialName: '晓雪',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
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
  effects: [effect_104000298_irodori_enter, effect_104000298_irodori_recover],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
