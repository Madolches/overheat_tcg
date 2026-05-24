import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addTempPowerUntilEndOfTurn, createSelectCardQuery, nameContains, ownUnits, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('202060130_power', '选择你的1个卡名含有《炎雷》的单位，本回合力量+1500。', async (instance, gameState, playerState) => {
  createSelectCardQuery(gameState, playerState.uid, ownUnits(playerState).filter(unit => nameContains(unit, '炎雷')), '选择炎雷单位', '选择你的1个卡名含有《炎雷》的单位，本回合力量+1500。', 1, 1, {
    sourceCardId: instance.gamecardId,
    effectId: '202060130_power'
  });
}, {
  condition: (_gameState, playerState) => ownUnits(playerState).some(unit => nameContains(unit, '炎雷')),
  targetSpec: {
    title: '选择炎雷单位',
    description: '选择你的1个卡名含有《炎雷》的单位，本回合力量+1500。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) => ownUnits(playerState)
      .filter(unit => nameContains(unit, '炎雷'))
      .map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT') addTempPowerUntilEndOfTurn(target, instance, 1500, gameState);
  }
}), {
  id: '202060130_payment_substitute',
  type: 'CONTINUOUS',
  triggerLocation: ['HAND'],
  content: 'SELF_HAND_COST',
  description: '为<雷霆>卡支付使用费用时，可以将手牌中的这张卡放逐作为代替。'
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202060130
 * Card2 Row: 310
 * Card Row: 549
 * Source CardNo: BT04-R09
 * Package: BT04(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择你的1个卡名含有《炎雷》的单位，本回合中，〖力量+1500〗.
 * 【你为<雷霆>的卡支付使用费用时，你可以将手牌中的这张卡放逐作为这次费用的代替。】
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202060130',
  fullName: '炎雷之箭',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '雷霆',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
