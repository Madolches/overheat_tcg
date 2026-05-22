import { Card, CardEffect } from '../types/game';
import { addContinuousKeyword, addContinuousPower, canMeetBattlefieldColorRequirement, canPutUnitOntoBattlefield, paymentCost, putUnitOntoField, totalErosionCount, wealthContinuous, wealthCount } from './BaseUtil';

const cardEffects: CardEffect[] = [
  wealthContinuous('104020310_wealth_1', 1),
  {
    id: '104020310_discarded_put_self',
    type: 'TRIGGER',
    triggerLocation: ['GRAVE'],
    triggerEvent: 'CARD_DISCARDED',
    description: '这张卡从手牌送去墓地时，支付0蓝，将墓地中的这张单位卡放置到战场。',
    condition: (_gameState, playerState, instance, event) =>
      event?.sourceCardId === instance.gamecardId &&
      event.playerUid === playerState.uid &&
      event.data?.sourceZone === 'HAND' &&
      event.data?.targetZone === 'GRAVE' &&
      instance.cardlocation === 'GRAVE' &&
      canMeetBattlefieldColorRequirement(playerState, { BLUE: 1 }) &&
      canPutUnitOntoBattlefield(playerState, instance),
    cost: paymentCost(0, 'BLUE'),
    execute: async (instance, gameState, playerState) => {
      putUnitOntoField(gameState, playerState.uid, instance, instance);
    }
  },
  {
    id: '104020310_wealth_army_buff',
    type: 'CONTINUOUS',
    triggerLocation: ['UNIT'],
    erosionTotalLimit: [3, 6],
    description: '3-6：你的财富指示物3个以上时，你战场上所有非神蚀单位力量+1000，获得英勇。',
    condition: (gameState, playerState) =>
      totalErosionCount(playerState) >= 3 &&
      totalErosionCount(playerState) <= 6 &&
      wealthCount(playerState, gameState) >= 3,
    applyContinuous: (gameState, instance) => {
      const ownerUid = Object.keys(gameState.players).find(uid =>
        gameState.players[uid].unitZone.some((unit: Card | null) => unit?.gamecardId === instance.gamecardId)
      );
      if (!ownerUid) return;
      const player = gameState.players[ownerUid];
      if (totalErosionCount(player) < 3 || totalErosionCount(player) > 6 || wealthCount(player, gameState) < 3) return;
      player.unitZone
        .filter((unit: Card | null): unit is Card =>
          !!unit &&
          unit.gamecardId !== instance.gamecardId &&
          !unit.godMark
        )
        .forEach(unit => {
          addContinuousPower(unit, instance, 1000);
          addContinuousKeyword(unit, instance, 'heroic');
        });
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020310
 * Card2 Row: 544
 * Card Row: 364
 * Source CardNo: BT07-B11
 * Package: BT07(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】财富1（只要这个单位在战场上，你获得1个财富指示物）。
 * 【诱】{这张卡从手牌送去墓地时}[0：蓝]：将墓地中的这张单位卡放置到战场上。
 * 【3-6】【永】{你的财富指示物3个以上}：你战场上所有的非神蚀单位〖力量+1000〗，获得【英勇】。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104020310',
  fullName: '九尾金狐「科萨珂」',
  specialName: '科萨珂',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
  faction: '九尾商会联盟',
  acValue: 3,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: true,
  baseGodMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: false,
  baseHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
