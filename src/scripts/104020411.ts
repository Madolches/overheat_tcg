import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, cardsInZones, moveCard, selectFromEntries, wealthContinuous, wealthCount } from './BaseUtil';

const dreamEntries = (playerState: any) =>
  cardsInZones(playerState, ['GRAVE', 'EROSION_FRONT'])
    .filter(({ card }) =>
      card.fullName === '金钱美梦' &&
      (card.cardlocation !== 'EROSION_FRONT' || card.displayState === 'FRONT_UPRIGHT')
    );

const cardEffects: CardEffect[] = [
  wealthContinuous('104020411_wealth_1', 1),
  {
    id: '104020411_recover_money_dream',
    type: 'TRIGGER',
    triggerEvent: 'TURN_END' as any,
    triggerLocation: ['UNIT'],
    isMandatory: false,
    limitCount: 1,
    description: '1回合1次，财富3以上，你的回合结束时：将墓地或正面侵蚀区1张《金钱美梦》加入手牌。',
    condition: (gameState, playerState, instance, event) =>
      event?.type === ('TURN_END' as any) &&
      event.playerUid === playerState.uid &&
      instance.cardlocation === 'UNIT' &&
      wealthCount(playerState, gameState) >= 3 &&
      dreamEntries(playerState).length > 0,
    execute: async (instance, gameState, playerState) => {
      selectFromEntries(
        gameState,
        playerState.uid,
        dreamEntries(playerState),
        '选择金钱美梦',
        '选择你的墓地或正面侵蚀区中的1张《金钱美梦》加入手牌。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '104020411_recover_money_dream' }
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || target.fullName !== '金钱美梦') return;
      if (!['GRAVE', 'EROSION_FRONT'].includes(target.cardlocation || '')) return;
      moveCard(gameState, playerState.uid, target, 'HAND', instance);
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020411
 * Card2 Row: 628
 * Card Row: 512
 * Source CardNo: BT08-B02
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:财富1(只要这个单位在战场上，你获得1个财富指示物)。
 * 【诱】〖1回合1次〗{你的财富指示物有3个以上，你的回合结束时}：将你的墓地或侵蚀区的正面卡中的1张《金钱美梦》加入手牌。
 */
const card: Card = {
  id: '104020411',
  fullName: '「暮城的大珠宝商」',
  specialName: '暮城的大珠宝商',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '九尾商会联盟',
  acValue: 4,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
