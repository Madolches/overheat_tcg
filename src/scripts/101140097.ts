import { Card, CardEffect, TriggerLocation } from '../types/game';
import { addTempDamage, addTempPower, createSelectCardQuery, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
    id: '101140097_grave_to_deck_buff',
    type: 'TRIGGER',
    triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
    triggerLocation: ['UNIT'],
    isGlobal: true,
    description: '你的卡从墓地进入卡组时，选择你的1个单位，伤害+1、力量+500。',
    condition: (_gameState, playerState, _instance, event) =>
      event?.playerUid === playerState.uid &&
      event.data?.zone === 'DECK' &&
      (event.data?.sourceZone === 'GRAVE' || (event.sourceCard as any)?.data?.lastMovedFromZone === 'GRAVE') &&
      ownUnits(playerState).length > 0,
    execute: async (instance, gameState, playerState) => {
      createSelectCardQuery(
        gameState,
        playerState.uid,
        ownUnits(playerState),
        '选择单位',
        '选择你的1个单位，本回合中伤害+1、力量+500。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '101140097_grave_to_deck_buff' }
      );
    },
    targetSpec: {
      title: '选择单位',
      description: '选择你的1个单位，本回合中伤害+1、力量+500。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
      getCandidates: (_gameState, playerState) =>
        ownUnits(playerState).map(card => ({ card, source: 'UNIT' as TriggerLocation }))
    },
    onQueryResolve: async (instance, _gameState, playerState, selections) => {
      const target = ownUnits(playerState).find(unit => unit.gamecardId === selections[0]);
      if (target) {
        addTempDamage(target, instance, 1);
        addTempPower(target, instance, 500);
      }
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140097
 * Card2 Row: 57
 * Card Row: 57
 * Source CardNo: BT01-W02
 * Package: ST01(TD),BT01(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:你的卡从墓地进入卡组时，选择你的1个单位，本回合中〖伤害+1〗〖力量+500〗。 
 * 
 * 愿菲之女神的保佑与你同在。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101140097',
  fullName: '虔诚的修道女',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '女神教会',
  acValue: 1,
  power: 500,
  basePower: 500,
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
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
