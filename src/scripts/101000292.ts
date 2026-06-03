import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, createChoiceQuery, createSelectCardQuery, moveCardAsCost, ownUnits, putUnitOntoField, readyByEffect } from './BaseUtil';

const isSeisoUnit = (card: Card) =>
  card.type === 'UNIT' && (card.fullName.includes('清霜') || !!card.specialName?.includes('清霜'));

const isYellowOrGreenNonGodUnit = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  (AtomicEffectExecutor.matchesColor(card, 'YELLOW') || AtomicEffectExecutor.matchesColor(card, 'GREEN'));

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

const effect_101000292_irodori_enter: CardEffect = {
  id: '101000292_irodori_enter',
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
      { sourceCardId: instance.gamecardId, effectId: '101000292_irodori_enter', costType: 'SP03_W02_IRODORI2' },
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
    if (context?.costType !== 'SP03_W02_IRODORI2') return;
    if (!payIrodoriCost(gameState, playerState, instance, selections, 2)) {
      context.cancelActivation = true;
    }
  }
};

const effect_101000292_irodori_ready: CardEffect = {
  id: '101000292_irodori_ready',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  limitCount: 1,
  limitNameType: true,
  triggerLocation: ['UNIT'],
  description: '同名1回合1次：这个单位通过异彩能力进入战场时，重置1个黄色或绿色非神蚀单位，或最多2个《清霜》单位。',
  condition: (_gameState, playerState, instance, event) => {
    if (event?.sourceCardId !== instance.gamecardId || event.data?.targetZone !== 'UNIT') return false;
    if ((instance as any).data?.enteredByIrodoriTurn !== _gameState.turnCount) return false;
    return ownUnits(playerState).some(unit => unit.isExhausted && (isYellowOrGreenNonGodUnit(unit) || isSeisoUnit(unit)));
  },
  execute: async (instance, gameState, playerState) => {
    const hasColorMode = ownUnits(playerState).some(unit => unit.isExhausted && isYellowOrGreenNonGodUnit(unit));
    const hasSeisoMode = ownUnits(playerState).some(unit => unit.isExhausted && isSeisoUnit(unit));
    const options = [
      ...(hasColorMode ? [{ value: 'COLOR_UNIT', label: '重置1个黄/绿非神蚀单位' }] : []),
      ...(hasSeisoMode ? [{ value: 'SEISO_UNITS', label: '重置最多2个清霜单位' }] : [])
    ];
    createChoiceQuery(
      gameState,
      playerState.uid,
      '选择重置模式',
      '选择要执行的重置模式。',
      options,
      { sourceCardId: instance.gamecardId, effectId: '101000292_irodori_ready', step: 'MODE' }
    );
  },
  targetSpec: {
    modeTitle: '选择重置模式',
    modeDescription: '选择要重置的单位。',
    modeOptions: [{
      id: 'COLOR_UNIT',
      label: '黄/绿非神蚀单位',
      title: '选择重置目标',
      description: '选择自己战场上的1个黄色或绿色非神蚀单位重置。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
      step: 'TARGET',
      condition: (_gameState, playerState) =>
        ownUnits(playerState).some(unit => unit.isExhausted && isYellowOrGreenNonGodUnit(unit)),
      getCandidates: (_gameState, playerState) =>
        ownUnits(playerState)
          .filter(unit => unit.isExhausted && isYellowOrGreenNonGodUnit(unit))
          .map(card => ({ card, source: 'UNIT' as any }))
    }, {
      id: 'SEISO_UNITS',
      label: '最多2个清霜单位',
      title: '选择清霜单位',
      description: '选择自己战场上最多2个卡名含有《清霜》的单位重置。',
      minSelections: 1,
      maxSelections: 2,
      zones: ['UNIT'],
      controller: 'SELF',
      step: 'TARGET',
      condition: (_gameState, playerState) =>
        ownUnits(playerState).some(unit => unit.isExhausted && isSeisoUnit(unit)),
      getCandidates: (_gameState, playerState) =>
        ownUnits(playerState)
          .filter(unit => unit.isExhausted && isSeisoUnit(unit))
          .map(card => ({ card, source: 'UNIT' as any }))
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      if (selections[0] === 'COLOR_UNIT') {
        createSelectCardQuery(
          gameState,
          playerState.uid,
          ownUnits(playerState).filter(unit => unit.isExhausted && isYellowOrGreenNonGodUnit(unit)),
          '选择重置目标',
          '选择自己战场上的1个黄色或绿色非神蚀单位重置。',
          1,
          1,
          { sourceCardId: instance.gamecardId, effectId: '101000292_irodori_ready', step: 'TARGET' },
          () => 'UNIT'
        );
        return;
      }

      createSelectCardQuery(
        gameState,
        playerState.uid,
        ownUnits(playerState).filter(unit => unit.isExhausted && isSeisoUnit(unit)),
        '选择清霜单位',
        '选择自己战场上最多2个卡名含有《清霜》的单位重置。',
        1,
        2,
        { sourceCardId: instance.gamecardId, effectId: '101000292_irodori_ready', step: 'TARGET' },
        () => 'UNIT'
      );
      return;
    }

    if (context?.step !== 'TARGET') return;
    selections
      .map(id => AtomicEffectExecutor.findCardById(gameState, id))
      .filter((unit: Card | undefined): unit is Card => !!unit && unit.cardlocation === 'UNIT')
      .forEach(unit => readyByEffect(gameState, unit, instance));
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000292
 * Card2 Row: 518
 * Card Row: 340
 * Source CardNo: SP03-W02
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】异彩2。
 * 【诱】〖同名1回合1次〗{这个单位通过异彩能力进入战场时，选择你战场上的1个黄色或绿色的非神蚀单位，或最多两个卡名含有《清霜》的单位}：将被选择的单位重置。
 */
const card: Card = {
  id: '101000292',
  fullName: '清霜「灰雪」',
  specialName: '灰雪',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
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
  effects: [effect_101000292_irodori_enter, effect_101000292_irodori_ready],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
