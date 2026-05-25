import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, isFeijingCard, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105110223_enter_leave_search',
  type: 'TRIGGER',
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE'],
  triggerEvent: ['CARD_ENTERED_ZONE', 'CARD_LEFT_FIELD'],
  isMandatory: false,
  sourceSnapshotOnLeftField: true,
  limitCount: 1,
  limitNameType: true,
  description: '进入战场或从战场离开时，可以将卡组中1张菲晶非神蚀卡加入手牌。',
  condition: (_gameState, playerState, instance, event) => {
    const entered = event?.type === 'CARD_ENTERED_ZONE' && event.sourceCardId === instance.gamecardId && event.data?.zone === 'UNIT';
    const left = event?.type === 'CARD_LEFT_FIELD' &&
      (
        event.sourceCard === instance ||
        event.sourceCardId === instance.gamecardId ||
        event.data?.previousSourceCardId === instance.gamecardId ||
        (
          !!event.sourceCard?.runtimeFingerprint &&
          event.sourceCard.runtimeFingerprint === instance.runtimeFingerprint
        )
      ) &&
      event.data?.sourceZone === 'UNIT';
    return (entered || left) && playerState.deck.some(card => isFeijingCard(card) && !card.godMark);
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.deck.filter(card => isFeijingCard(card) && !card.godMark);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择菲晶卡',
      '选择卡组中1张具有【菲晶】的非神蚀卡加入手牌。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110223_enter_leave_search' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (selected?.cardlocation === 'DECK') {
      moveCard(gameState, playerState.uid, selected, 'HAND', instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110223
 * Card2 Row: 387
 * Card Row: 257
 * Source CardNo: BT05-Y01
 * Package: BT05(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位进入战场时，或这个单位从战场离开时}:你可以将你的卡组中1张具有【菲晶】的非神蚀卡加入手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110223',
  fullName: '学院菲晶商',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '学院要塞',
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
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
