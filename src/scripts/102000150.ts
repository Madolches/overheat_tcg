import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, getOpponentUid, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102000150_enter_exhaust',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  description: '从手牌进入战场时，选择对手最多2个单位横置。',
  condition: (gameState, playerState, instance, event) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    const enteredFromHand =
      event.data?.sourceZone === 'HAND' ||
      (event.data?.sourceZone === 'PLAY' && (instance as any).__playSnapshot?.sourceZone === 'HAND');
    return event?.sourceCardId === instance.gamecardId &&
      event.data?.zone === 'UNIT' &&
      enteredFromHand &&
      ownUnits(opponent).length > 0;
  },
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(opponent),
      '选择横置对象',
      '选择对手最多2个单位，将其横置。',
      0,
      2,
      { sourceCardId: instance.gamecardId, effectId: '102000150_enter_exhaust' }
    );
  },
  targetSpec: {
    title: '选择横置对象',
    description: '选择对手的最多2个单位，将其横置。',
    minSelections: 0,
    maxSelections: 2,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) =>
      ownUnits(gameState.players[getOpponentUid(gameState, playerState.uid)])
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (_instance, gameState, _playerState, selections) => {
    selections.forEach(id => {
      const target = AtomicEffectExecutor.findCardById(gameState, id);
      if (target?.cardlocation === 'UNIT') target.isExhausted = true;
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000150
 * Card2 Row: 134
 * Card Row: 134
 * Source CardNo: BT02-R11
 * Package: BT02(SR,ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【神依】
 * 【诱】:这个单位从手牌进入战场时，选择对手的最多2个单位，将其〖横置〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000150',
  fullName: '飞空霸者「达·哈尔」',
  specialName: '达·哈尔',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isShenyi: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
