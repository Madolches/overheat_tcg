import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addInfluence, ensureData, isSameFactionCard, ownUnits, totalErosionCount, wasPlacedByPromotion, wasPlacedByPromotionThisTurn } from './BaseUtil';

const ownerOfItem = (gameState: any, instance: Card) =>
  Object.values(gameState.players)
    .find((player: any) => player.itemZone.some((item: Card | null) => item?.gamecardId === instance.gamecardId));

const hasPromotionIleuUnit = (gameState: any, playerState: any, instance: Card) =>
  ownUnits(playerState).some(unit => wasPlacedByPromotion(unit) && isSameFactionCard(unit, instance));

const ownFieldCards = (playerState: any) => [
  ...playerState.unitZone.filter((card: Card | null): card is Card => !!card),
  ...playerState.itemZone.filter((card: Card | null): card is Card => !!card)
];

const cardEffects: CardEffect[] = [{
  id: '302050065_protect_first_opponent_leave',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '你有由于晋升进入战场的同势力单位时，你战场上的卡每回合第一次因对手效果离场被防止。',
  applyContinuous: (gameState, instance) => {
    const owner = ownerOfItem(gameState, instance);
    if (!owner || !hasPromotionIleuUnit(gameState, owner, instance)) return;
    ownFieldCards(owner).forEach(card => {
      const data = ensureData(card);
      data.preventFirstOpponentEffectLeaveEachTurnSourceName = instance.fullName;
      addInfluence(card, instance, 'First opponent effect leave each turn is prevented');
    });
  }
}, {
  id: '302050065_draw_on_promotion',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['ITEM'],
  isMandatory: false,
  isGlobal: true,
  description: '4~7：你的单位由于晋升放置到你的战场上时，可以抽1张卡。',
  condition: (gameState, playerState, _instance, event) =>
    totalErosionCount(playerState) >= 4 &&
    totalErosionCount(playerState) <= 7 &&
    event?.playerUid === playerState.uid &&
    event.data?.targetZone === 'UNIT' &&
    event.sourceCardId &&
    (() => {
      const entered = AtomicEffectExecutor.findCardById(gameState, event.sourceCardId);
      return !!entered && wasPlacedByPromotionThisTurn(gameState, entered);
    })() &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 302050065
 * Card2 Row: 603
 * Card Row: 487
 * Source CardNo: BT08-R10
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】{你战场上有由于晋升进入战场的<伊列宇王国>的单位}:你战场上的卡在每个回合中第一次将要由于对手的卡的效果离开战场时，防止那次离开战场。
 * 〖4~7〗【诱】{你的单位由于晋升能力放置到你的战场上时}:你可以抽1张卡。
 */
const card: Card = {
  id: '302050065',
  fullName: '「英雄广场」',
  specialName: '英雄广场',
  type: 'ITEM',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '伊列宇王国',
  acValue: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
