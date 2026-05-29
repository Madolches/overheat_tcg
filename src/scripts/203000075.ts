import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addTempPower, addTempShenyi, allUnitsOnField, canPutUnitOntoBattlefield, createChoiceQuery, createSelectCardQuery, isNonGodUnit, markSpiritTargeted, moveCard, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('203000075_choice', '选择1项：非神蚀单位力量+500并获得神依；或主要阶段从墓地放置1张《图腾》单位。', async (instance, gameState, playerState, _event, declaredSelections?: string[], declaredContext?: any) => {
  if (declaredSelections?.length) {
    const target = AtomicEffectExecutor.findCardById(gameState, declaredSelections[0]);
    if (declaredContext?.selectedModeId === 'BOOST' && target?.cardlocation === 'UNIT' && !target.godMark) {
      markSpiritTargeted(gameState, target, instance, { dispatchEvent: false });
      addTempPower(target, instance, 500);
      addTempShenyi(target, instance, gameState);
      return;
    }
    if (declaredContext?.selectedModeId === 'REVIVE' && target?.cardlocation === 'GRAVE' && canPutUnitOntoBattlefield(playerState, target)) {
      moveCard(gameState, playerState.uid, target, 'UNIT', instance);
      return;
    }
  }

  const preselectedTargetId = (instance as any).data?.preselectedSpiritTargetId;
  const preselectedTarget = preselectedTargetId ? AtomicEffectExecutor.findCardById(gameState, preselectedTargetId) : undefined;
  if (preselectedTarget?.cardlocation === 'UNIT' && !preselectedTarget.godMark) {
    markSpiritTargeted(gameState, preselectedTarget, instance);
    addTempPower(preselectedTarget, instance, 500);
    addTempShenyi(preselectedTarget, instance, gameState);
    return;
  }

  const options = [];
  const isMainContext = gameState.phase === 'MAIN' || gameState.previousPhase === 'MAIN';
  if (allUnitsOnField(gameState).some(unit => isNonGodUnit(unit))) options.push({ id: 'BOOST', label: '降灵强化' });
  if (isMainContext && playerState.grave.some(card => card.type === 'UNIT' && card.fullName.includes('图腾') && canPutUnitOntoBattlefield(playerState, card))) {
    options.push({ id: 'REVIVE', label: '图腾回场' });
  }
  if (options.length === 0) return;
  createChoiceQuery(gameState, playerState.uid, '选择效果', '选择1项效果执行。', options, { sourceCardId: instance.gamecardId, effectId: '203000075_choice', step: 'CHOICE' });
}, {
  targetSpec: {
    modeTitle: '选择效果',
    modeDescription: '选择《地鬼降灵》要发动的效果。',
    modeOptions: [{
      id: 'BOOST',
      label: '降灵强化',
      title: '选择非神蚀单位',
      description: '选择战场上的1个非神蚀单位，本回合力量+500并获得【神依】。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      step: 'BOOST',
      getCandidates: gameState => allUnitsOnField(gameState).filter(unit => isNonGodUnit(unit)).map(card => ({ card, source: 'UNIT' as any }))
    }, {
      id: 'REVIVE',
      label: '图腾回场',
      title: '选择图腾单位',
      description: '选择你的墓地中的1张卡名含有《图腾》的单位卡，将其放置到战场。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['GRAVE'],
      step: 'REVIVE',
      condition: (gameState, playerState) => gameState.phase === 'MAIN' || gameState.previousPhase === 'MAIN',
      getCandidates: (_gameState, playerState) => playerState.grave
        .filter(card => card.type === 'UNIT' && card.fullName.includes('图腾') && canPutUnitOntoBattlefield(playerState, card))
        .map(card => ({ card, source: 'GRAVE' as any }))
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'BOOST') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target?.cardlocation === 'UNIT' && !target.godMark) {
        markSpiritTargeted(gameState, target, instance);
        addTempPower(target, instance, 500);
        addTempShenyi(target, instance, gameState);
      }
      return;
    }
    if (context?.step === 'REVIVE') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target?.cardlocation === 'GRAVE' && canPutUnitOntoBattlefield(playerState, target)) moveCard(gameState, playerState.uid, target, 'UNIT', instance);
      return;
    }
    if (selections[0] === 'BOOST') {
      createSelectCardQuery(gameState, playerState.uid, allUnitsOnField(gameState).filter(unit => isNonGodUnit(unit)), '选择非神蚀单位', '选择战场上的1个非神蚀单位，本回合力量+500并获得【神依】。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '203000075_choice', step: 'BOOST' }, () => 'UNIT');
    } else if (selections[0] === 'REVIVE') {
      const targets = playerState.grave.filter(card => card.type === 'UNIT' && card.fullName.includes('图腾') && canPutUnitOntoBattlefield(playerState, card));
      createSelectCardQuery(gameState, playerState.uid, targets, '选择图腾单位', '选择你的墓地中的1张卡名含有《图腾》的单位卡，将其放置到战场。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '203000075_choice', step: 'REVIVE' }, () => 'GRAVE');
    }
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203000075
 * Card2 Row: 206
 * Card Row: 206
 * Source CardNo: BT03-G15
 * Package: BT03(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 你选择下列的1项效果并执行。
 * ◆选择战场上的1个非神蚀单位，本回合中〖力量+500〗并获得【神依】。
 * ◆只能在你的主要阶段中使用。选择你的墓地中的1张卡名含有《图腾》的单位卡，将其放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '203000075',
  fullName: '地鬼降灵',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
