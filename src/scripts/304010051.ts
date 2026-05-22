import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addContinuousDamage, canPutItemOntoBattlefield, cardsInZones, discardHandCost, markExileWhenLeavesField, moveCard, universalEquipEffect } from './BaseUtil';

const MOMOSE = '百濑之水城';

const isMomoseWaterCastleGodCard = (card: Card) =>
  card.godMark &&
  (
    card.faction === MOMOSE ||
    card.fullName.includes('百濑之水城')
  );

const isSwordSageUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (card.fullName.includes('剑仙') || card.specialName?.includes('剑仙'));

const isEquipTarget = (card: Card) =>
  isMomoseWaterCastleGodCard(card) || isSwordSageUnit(card);

const selfReviveEntries = (playerState: any, instance: Card) =>
  cardsInZones(playerState, ['GRAVE', 'EROSION_FRONT'])
    .filter(({ card }) =>
      card.gamecardId === instance.gamecardId &&
      (card.cardlocation !== 'EROSION_FRONT' || card.displayState === 'FRONT_UPRIGHT') &&
      canPutItemOntoBattlefield(playerState, card)
    );

const cardEffects: CardEffect[] = [universalEquipEffect, {
  id: '304010051_equip_damage',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '装备单位伤害+1。',
  applyContinuous: (gameState, instance) => {
    if (!instance.equipTargetId) return;
    const target = AtomicEffectExecutor.findCardById(gameState, instance.equipTargetId);
    if (target?.cardlocation === 'UNIT') addContinuousDamage(target, instance, 1);
  }
}, {
  id: '304010051_revive_and_equip',
  type: 'ACTIVATE',
  triggerLocation: ['GRAVE', 'EROSION_FRONT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：选择己方场上的1个<百濑之水城>神蚀卡或卡名含《剑仙》的单位，舍弃1张手牌，从墓地或正面侵蚀区放置并装备，离场放逐。',
  condition: (_gameState, playerState, instance) =>
    playerState.hand.some((card: Card) => card.gamecardId !== instance.gamecardId) &&
    selfReviveEntries(playerState, instance).length > 0 &&
    playerState.unitZone.some((unit: Card | null) => !!unit && isEquipTarget(unit)),
  cost: discardHandCost(1),
  execute: async (instance, gameState, playerState) => {
    const targets = playerState.unitZone.filter((unit: Card | null): unit is Card => !!unit && isEquipTarget(unit));
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, targets.map(card => ({ card, source: 'UNIT' as const }))),
      title: '选择装备目标',
      description: '选择你战场上的1个<百濑之水城>神蚀卡或卡名含有《剑仙》的单位。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: { sourceCardId: instance.gamecardId, effectId: '304010051_revive_and_equip' }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT' || !isEquipTarget(target)) return;
    if (!['GRAVE', 'EROSION_FRONT'].includes(instance.cardlocation || '') || !canPutItemOntoBattlefield(playerState, instance)) return;
    moveCard(gameState, playerState.uid, instance, 'ITEM', instance);
    const item = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (!item || item.cardlocation !== 'ITEM') return;
    item.equipTargetId = target.gamecardId;
    item.isEquip = true;
    markExileWhenLeavesField(item, item);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 304010051
 * Card2 Row: 543
 * Card Row: 363
 * Source CardNo: BT07-B10
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【装备】
 * 【永】：装备单位〖伤害+1〗.
 * 【启】〖同名一回合一次〗{选择你战场上的1个<百濑之水城>的神蚀卡或卡名含有《剑仙》的单位}[舍弃1张手牌]：将墓地或侵蚀区的正面卡中的这张卡放置到战场上并装备给被选择单位。这张卡从战场上离开时，将这张卡放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '304010051',
  fullName: '「化剑仙境」',
  specialName: '化剑仙境',
  type: 'ITEM',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '百濑之水城',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  isEquip: true,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
