import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  discardHandCost,
  ensureData,
  getResonanceExiledCard,
  isResonanceExileEvent,
  isSilverInstrumentCard,
  putUnitOntoField,
  resonanceEffect,
  totalErosionCount
} from './BaseUtil';

export const areCardsTemporarilySameName = (gameState: any, a?: Card | null, b?: Card | null) => {
  if (!a || !b) return false;
  if (a.fullName === b.fullName || (!!a.specialName && a.specialName === b.specialName)) return true;
  const dataA = (a as any).data || {};
  const dataB = (b as any).data || {};
  return (
    dataA.sameNameAsCardId === b.gamecardId && dataA.sameNameAsTurn === gameState.turnCount
  ) || (
    dataB.sameNameAsCardId === a.gamecardId && dataB.sameNameAsTurn === gameState.turnCount
  );
};

const isGreenCard = (card: Card | null | undefined): card is Card =>
  !!card && card.color === 'GREEN';

const silverInstrumentGraveUnits = (playerState: any) =>
  playerState.grave.filter((card: Card) =>
    card.type === 'UNIT' &&
    !card.godMark &&
    isSilverInstrumentCard(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const sameNameEffect: CardEffect = {
  id: '103090505_same_name_tune',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次，主要阶段，选择战场和墓地各1张绿色卡：本回合墓地目标也视作场上目标的同名卡。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    playerState.unitZone.some(isGreenCard) &&
    playerState.grave.some(isGreenCard),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.unitZone.filter(isGreenCard),
      '选择战场绿色卡',
      '选择你的战场上1张绿色卡。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103090505_same_name_tune', step: 'FIELD_GREEN' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    targetGroups: [{
      title: '选择战场绿色卡',
      description: '选择你的战场上1张绿色卡。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
      step: 'FIELD_GREEN',
      getCandidates: (_gameState, playerState) =>
        playerState.unitZone.filter(isGreenCard).map(card => ({ card, source: 'UNIT' as any }))
    }, {
      title: '选择墓地绿色卡',
      description: '选择你的墓地中1张绿色卡。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['GRAVE'],
      controller: 'SELF',
      step: 'GRAVE_GREEN',
      getCandidates: (_gameState, playerState) =>
        playerState.grave.filter(isGreenCard).map(card => ({ card, source: 'GRAVE' as any }))
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.declaredTargets?.length) {
      const fieldId = context.declaredTargets.find((target: any) => target.step === 'FIELD_GREEN')?.gamecardId;
      const graveId = context.declaredTargets.find((target: any) => target.step === 'GRAVE_GREEN')?.gamecardId;
      if (fieldId && graveId) {
        const field = playerState.unitZone.find(card => card?.gamecardId === fieldId);
        const grave = playerState.grave.find(card => card.gamecardId === graveId);
        if (isGreenCard(field) && isGreenCard(grave)) {
          const data = ensureData(grave);
          data.sameNameAsCardId = field.gamecardId;
          data.sameNameAsName = field.fullName;
          data.sameNameAsTurn = gameState.turnCount;
          data.sameNameAsSourceCardId = instance.gamecardId;
        }
      }
      return;
    }

    if (context?.step === 'FIELD_GREEN') {
      const fieldId = selections[0];
      const field = playerState.unitZone.find(card => card?.gamecardId === fieldId);
      if (!isGreenCard(field)) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        playerState.grave.filter(isGreenCard),
        '选择墓地绿色卡',
        '选择你的墓地中1张绿色卡。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '103090505_same_name_tune', step: 'GRAVE_GREEN', fieldId },
        () => 'GRAVE'
      );
      return;
    }

    if (context?.step === 'GRAVE_GREEN') {
      const field = playerState.unitZone.find(card => card?.gamecardId === context.fieldId);
      const grave = playerState.grave.find(card => card.gamecardId === selections[0]);
      if (!isGreenCard(field) || !isGreenCard(grave)) return;
      const data = ensureData(grave);
      data.sameNameAsCardId = field.gamecardId;
      data.sameNameAsName = field.fullName;
      data.sameNameAsTurn = gameState.turnCount;
      data.sameNameAsSourceCardId = instance.gamecardId;
    }
  }
};

const reviveSilverInstrument: CardEffect = {
  id: '103090505_resonance_revive_silver_instrument',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  triggerLocation: ['EXILE'],
  isMandatory: false,
  description: '5-8：共鸣能力将墓地中的这张卡放逐时，舍弃1张手牌，可以将墓地1张《银乐器》非神蚀单位放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    isResonanceExileEvent(event) &&
    getResonanceExiledCard(event)?.gamecardId === instance.gamecardId &&
    totalErosionCount(playerState) >= 5 &&
    totalErosionCount(playerState) <= 8 &&
    playerState.hand.length > 0 &&
    silverInstrumentGraveUnits(playerState).length > 0,
  cost: discardHandCost(1),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      silverInstrumentGraveUnits(playerState),
      '选择银乐器单位',
      '选择墓地中最多1张卡名含《银乐器》的非神蚀单位放置到战场。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103090505_resonance_revive_silver_instrument' },
      () => 'GRAVE'
    );
  },
  targetSpec: {
    preselect: false,
    title: '选择银乐器单位',
    description: '选择墓地中1张卡名含《银乐器》的非神蚀单位放置到战场。',
    minSelections: 0,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      silverInstrumentGraveUnits(playerState).map(card => ({ card, source: 'GRAVE' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'GRAVE') return;
    if (!silverInstrumentGraveUnits(playerState).some(card => card.gamecardId === target.gamecardId)) return;
    putUnitOntoField(gameState, playerState.uid, target, instance);
  }
};

const cardEffects: CardEffect[] = [
  resonanceEffect('103090505_resonance'),
  sameNameEffect,
  reviveSilverInstrument
];

const card: Card = {
  id: '103090505',
  fullName: '银乐奏曲「萨如」',
  specialName: '萨如',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {GREEN: 1},
  faction: '瑟诺布',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
