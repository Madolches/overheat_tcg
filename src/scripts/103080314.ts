import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { awakenEffect, cardsInZones, moveCard, selectFromEntries } from './BaseUtil';

const SHINBOKU = '神木森';

const shinbokuNonGodDeckEntries = (playerState: any) =>
  cardsInZones(playerState, ['DECK'])
    .filter(({ card }) =>
      !card.godMark &&
      (
        String(card.faction || '').includes(SHINBOKU) ||
        card.fullName.includes(SHINBOKU)
      )
    );

const cardEffects: CardEffect[] = [
  awakenEffect('103080314_awaken'),
  {
    id: '103080314_own_unit_effect_leave_mill_shinboku',
    type: 'TRIGGER',
    triggerLocation: ['UNIT'],
    triggerEvent: 'CARD_LEFT_FIELD',
    isGlobal: true,
    sourceSnapshotOnLeftField: true,
    limitCount: 1,
    description: '1回合1次：你的单位由于卡的效果从战场离开时，可以将卡组中1张<神木森>非神蚀卡送入墓地。',
    condition: (_gameState, playerState, _instance, event) =>
      event?.playerUid === playerState.uid &&
      event.data?.sourceZone === 'UNIT' &&
      event.data?.isEffect === true &&
      shinbokuNonGodDeckEntries(playerState).length > 0,
    execute: async (instance, gameState, playerState) => {
      selectFromEntries(
        gameState,
        playerState.uid,
        shinbokuNonGodDeckEntries(playerState),
        '选择神木森卡',
        '选择卡组中1张<神木森>非神蚀卡送入墓地。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '103080314_own_unit_effect_leave_mill_shinboku' }
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      const target = playerState.deck.find((card: Card) => card.gamecardId === selections[0]);
      if (!target || target.godMark) return;
      moveCard(gameState, playerState.uid, target, 'GRAVE', instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103080314
 * Card2 Row: 548
 * Card Row: 368
 * Source CardNo: BT07-G04
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】唤醒（〖1回合1次〗{你的主要阶段，选择你的战场上的1个单位}:本回合中，被选择的单位〖力量+1000〗。回合结束时，将其放置到你的卡组底）。
 * 【诱】〖1回合1次〗{你的单位由于卡的效果从战场上离开时}:你可以将你卡组中的1张<神木森>的非神蚀卡送入墓地。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103080314',
  fullName: '报晓猿猴',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '神木森',
  acValue: 2,
  power: 2000,
  basePower: 2000,
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
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
