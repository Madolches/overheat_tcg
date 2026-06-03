import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, addTempPower, createChoiceQuery, createSelectCardQuery, isNonGodUnit, markSpiritTargeted, moveCard, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103080181_enter_choice',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  description: '入场时，选择：墓地《地鬼降灵》加入手牌，或选择你的非神蚀单位力量+500。',
  condition: (_gameState, _playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId && event.data?.zone === 'UNIT',
  execute: async (instance, gameState, playerState) => {
    const options = [];
    if (playerState.grave.some(card => card.fullName.includes('地鬼降灵'))) options.push({ id: 'RETURN', label: '回收地鬼降灵' });
    if (ownUnits(playerState).some(isNonGodUnit)) options.push({ id: 'BOOST', label: '力量+500' });
    if (options.length === 0) return;
    createChoiceQuery(gameState, playerState.uid, '选择效果', '选择1项效果执行。', options, { sourceCardId: instance.gamecardId, effectId: '103080181_enter_choice', step: 'CHOICE' });
  },
  targetSpec: {
    modeTitle: '选择效果',
    modeDescription: '选择1项效果执行。',
    modeOptions: [{
      id: 'RETURN',
      label: '回收地鬼降灵',
      title: '选择地鬼降灵',
      description: '选择你的墓地中的1张《地鬼降灵》，将其加入手牌。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['GRAVE'],
      controller: 'SELF',
      step: 'RETURN',
      condition: (_gameState, playerState) =>
        playerState.grave.some(card => card.fullName.includes('地鬼降灵')),
      getCandidates: (_gameState, playerState) =>
        playerState.grave
          .filter(card => card.fullName.includes('地鬼降灵'))
          .map(card => ({ card, source: 'GRAVE' as TriggerLocation }))
    }, {
      id: 'BOOST',
      label: '力量+500',
      title: '选择单位',
      description: '选择你的1个非神蚀单位，本回合中力量+500。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
      step: 'BOOST',
      condition: (_gameState, playerState) =>
        ownUnits(playerState).some(isNonGodUnit),
      getCandidates: (_gameState, playerState) =>
        ownUnits(playerState)
          .filter(isNonGodUnit)
          .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'RETURN') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target?.cardlocation === 'GRAVE') moveCard(gameState, playerState.uid, target, 'HAND', instance);
      return;
    }
    if (context?.step === 'BOOST') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target?.cardlocation === 'UNIT') {
        markSpiritTargeted(gameState, target, instance);
        addTempPower(target, instance, 500);
      }
      return;
    }
    if (selections[0] === 'RETURN') {
      createSelectCardQuery(gameState, playerState.uid, playerState.grave.filter(card => card.fullName.includes('地鬼降灵')), '选择地鬼降灵', '选择墓地中的1张《地鬼降灵》加入手牌。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '103080181_enter_choice', step: 'RETURN' }, () => 'GRAVE');
    } else if (selections[0] === 'BOOST') {
      createSelectCardQuery(gameState, playerState.uid, ownUnits(playerState).filter(isNonGodUnit), '选择单位', '选择你的1个非神蚀单位，本回合力量+500。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '103080181_enter_choice', step: 'BOOST' }, () => 'UNIT');
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103080181
 * Card2 Row: 194
 * Card Row: 194
 * Source CardNo: BT03-G03
 * Package: BT03(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位进入战场时，你选择下列的1项效果并执行。
 * ◆选择你的墓地中的1张《地鬼降灵》，将其加入手牌。
 * ◆选择你的1个非神蚀单位，本回合中〖力量+500〗，这个效果视为卡名含有《降灵》的卡的效果。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103080181',
  fullName: '神木小灵萨',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '神木森',
  acValue: 2,
  power: 1000,
  basePower: 1000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
