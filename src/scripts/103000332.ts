import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, createSelectCardQuery, ensureData, putUnitOntoField } from './BaseUtil';

const isFeather = (card: Card) => card.id === '103000331' || card.fullName === '极彩鸟的羽毛';

const featherCandidates = (playerState: any) =>
  [...playerState.deck, ...playerState.grave].filter((card: Card) => isFeather(card) && canPutUnitOntoBattlefield(playerState, card));

const cardEffects: CardEffect[] = [{
  id: '103000332_enter_put_feather',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [1, 4],
  description: '1~4：进入战场时，可以选择卡组或墓地中的1张《极彩鸟的羽毛》，以横置状态放置到战场上。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    featherCandidates(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      featherCandidates(playerState),
      '选择极彩鸟的羽毛',
      '选择卡组或墓地中的1张《极彩鸟的羽毛》，横置放置到战场上。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000332_enter_put_feather' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = featherCandidates(playerState).find((card: Card) => card.gamecardId === selections[0]);
    if (!target) return;
    const fromDeck = target.cardlocation === 'DECK';
    ensureData(target).placedByIrodoriBirdTurn = gameState.turnCount;
    putUnitOntoField(gameState, playerState.uid, target, instance, { exhausted: true });
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000332
 * Card2 Row: 454
 * Card Row: 389
 * Source CardNo: BT06-G06
 * Package: BT06(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖1~4〗【诱】{这个单位进入战场时}：你可以选择你的卡组或墓地中的1张《极彩鸟的羽毛》，以横置的状态放置到战场上。
 */
const card: Card = {
  id: '103000332',
  fullName: '极彩鸟',
  specialName: '',
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
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
