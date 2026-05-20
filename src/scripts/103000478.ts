import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, enteredFromHand, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103000478_enter_mill_3500',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  limitCount: 1,
  limitNameType: true,
  description: '同名一回合一次：这张卡从手牌进入战场时，选择卡组中1张力量3500的单位卡送入墓地。',
  condition: (_gameState, playerState, instance, event?: GameEvent) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    enteredFromHand(instance, event) &&
    playerState.deck.some(card => card.type === 'UNIT' && (card.power || 0) === 3500),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.deck.filter(card => card.type === 'UNIT' && (card.power || 0) === 3500),
      '选择送墓单位',
      '选择卡组中的1张力量3500的单位卡送入墓地。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000478_enter_mill_3500' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.effectId !== '103000478_enter_mill_3500') return;
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'DECK' && target.type === 'UNIT' && (target.power || 0) === 3500) {
      moveCard(gameState, playerState.uid, target, 'GRAVE', instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000478
 * Card2 Row: 262
 * Card Row: 618
 * Source CardNo: SP01-G01
 * Package: SP01(SPR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗:这个单位从手牌进入战场时，从你的卡组中选择1张〖力量3500〗的单位卡，将其送入墓地。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000478',
  fullName: '静水流连「萨拉拉」',
  specialName: '萨拉拉',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'SP01',
  uniqueId: null as any,
};

export default card;
