import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutItemOntoBattlefield, cardsInZones, exhaustCost, moveCard, selectFromEntries } from './BaseUtil';

const KYUBI = '九尾商会联盟';

const isKyubiNonGodItem = (card: Card) =>
  card.type === 'ITEM' &&
  !card.godMark &&
  (card.faction === KYUBI || card.fullName.includes('九尾商会联盟'));

const itemTargets = (playerState: any) =>
  cardsInZones(playerState, ['DECK', 'EROSION_FRONT'])
    .filter(({ card }) =>
      isKyubiNonGodItem(card) &&
      (card.cardlocation !== 'EROSION_FRONT' || card.displayState === 'FRONT_UPRIGHT') &&
      canPutItemOntoBattlefield(playerState, card)
    );

const cardEffects: CardEffect[] = [{
  id: '104020304_enter_put_kyubi_item',
  type: 'TRIGGER',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：这个单位进入战场时，横置，将卡组或正面侵蚀区1张<九尾商会联盟>非神蚀道具放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    instance.cardlocation === 'UNIT' &&
    !instance.isExhausted &&
    itemTargets(playerState).length > 0,
  cost: exhaustCost,
  execute: async (instance, gameState, playerState) => {
    selectFromEntries(
      gameState,
      playerState.uid,
      itemTargets(playerState),
      '选择九尾商会联盟道具',
      '从你的卡组或正面侵蚀区选择1张<九尾商会联盟>非神蚀道具放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104020304_enter_put_kyubi_item' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !isKyubiNonGodItem(target) || !canPutItemOntoBattlefield(playerState, target)) return;
    const fromDeck = target.cardlocation === 'DECK';
    moveCard(gameState, playerState.uid, target, 'ITEM', instance);
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020304
 * Card2 Row: 534
 * Card Row: 354
 * Source CardNo: BT07-B01
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位进入战场时}［横置］：将卡组或侵蚀区中的1张正面的<九尾商会联盟>的非神蚀道具卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104020304',
  fullName: '白尾商人',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '九尾商会联盟',
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
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
