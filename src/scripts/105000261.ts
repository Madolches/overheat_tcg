import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, destroyByEffect, moveCard, nameContains, ownItems, paymentCost } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105000261_destroy_item_bottom_kaito',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '选择你的战场上的1张道具卡并支付1费：破坏那张卡，之后将墓地中2张卡名含有《怪盗》的卡放置到卡组底。',
  condition: (_gameState, playerState) =>
    ownItems(playerState).length > 0 &&
    playerState.grave.filter(card => nameContains(card, '怪盗')).length >= 2,
  cost: paymentCost(1, 'YELLOW'),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownItems(playerState),
      '选择破坏道具',
      '选择你的战场上的1张道具卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000261_destroy_item_bottom_kaito', step: 'ITEM', ownerUid: playerState.uid },
      () => 'ITEM'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.effectId !== '105000261_destroy_item_bottom_kaito') return;
    const ownerUid = context.ownerUid || playerState.uid;
    const owner = gameState.players[ownerUid];
    if (!owner) return;

    if (context.step === 'ITEM') {
      const item = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!item || item.cardlocation !== 'ITEM') return;

      destroyByEffect(gameState, item, instance);

      const candidates = owner.grave.filter(card => nameContains(card, '怪盗'));
      if (candidates.length < 2) return;
      createSelectCardQuery(
        gameState,
        ownerUid,
        candidates,
        '选择怪盗卡',
        '选择墓地中的2张卡名含有《怪盗》的卡放置到卡组底。',
        2,
        2,
        { sourceCardId: instance.gamecardId, effectId: '105000261_destroy_item_bottom_kaito', step: 'GRAVE', ownerUid },
        () => 'GRAVE'
      );
      return;
    }

    if (context.step !== 'GRAVE') return;
    selections
      .map(id => owner.grave.find(card => card.gamecardId === id))
      .filter((card): card is Card => !!card && nameContains(card, '怪盗'))
      .forEach(card => moveCard(gameState, ownerUid, card, 'DECK', instance, { insertAtBottom: true }));
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000261
 * Card2 Row: 420
 * Card Row: 303
 * Source CardNo: PR05-03Y
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 启动效果，卡名一回合一次，选择我方战场的一张道具卡，支付1费：将被选择的卡破坏，之后选择墓地的两张卡名含有怪盗的卡，将其放置到卡组底
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000261',
  fullName: '偷天的怪盗助手',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 2,
  power: 1500,
  basePower: 1500,
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
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
