import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutItemOntoBattlefield, cardsInZones, createSelectCardQuery, moveCardAsCost, putItemOntoField } from './BaseUtil';

const godMarkGraveCards = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.godMark);

const nonGodAccessLe3Items = (playerState: any) =>
  cardsInZones(playerState, ['HAND', 'DECK']).filter(({ card }) =>
    card.type === 'ITEM' &&
    !card.godMark &&
    (card.acValue || 0) <= 3 &&
    canPutItemOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '101130378_enter_put_item',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  description: '进入战场时，将墓地1张神蚀卡放逐，可以将卡组或手牌1张ACCESS值+3以下的非神蚀道具卡放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    godMarkGraveCards(playerState).length > 0 &&
    nonGodAccessLe3Items(playerState).length > 0,
  cost: async (gameState, playerState, instance) => {
    const candidates = godMarkGraveCards(playerState);
    if (candidates.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择神蚀费用',
      '选择墓地中的1张神蚀卡放逐作为费用。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101130378_enter_put_item', step: 'COST' },
      () => 'GRAVE'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = nonGodAccessLe3Items(playerState);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates.map(entry => entry.card),
      '选择放置的道具',
      '选择卡组或手牌中的1张ACCESS值+3以下的非神蚀道具卡放置到战场。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101130378_enter_put_item', step: 'PUT_ITEM' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'COST') {
      const selected = selections[0] ? playerState.grave.find((card: Card) => card.gamecardId === selections[0]) : undefined;
      if (!selected?.godMark) {
        context.cancelActivation = true;
        return;
      }
      moveCardAsCost(gameState, playerState.uid, selected, 'EXILE', instance);
      return;
    }

    if (context?.step !== 'PUT_ITEM') return;
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || !['HAND', 'DECK'].includes(selected.cardlocation || '')) return;
    if (selected.type !== 'ITEM' || selected.godMark || (selected.acValue || 0) > 3) return;
    const fromDeck = selected.cardlocation === 'DECK';
    if (!putItemOntoField(gameState, playerState.uid, selected, instance)) return;
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130378
 * Card2 Row: 571
 * Card Row: 455
 * Source CardNo: BT07-W05
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位进入战场时}[将你墓地中的1张神蚀卡放逐]：你可以将你卡组或手牌中的1张ACCESS值+3以下的非神蚀道具卡以放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130378',
  fullName: '天魔白翼',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '圣王国',
  acValue: 3,
  power: 3500,
  basePower: 3500,
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
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
