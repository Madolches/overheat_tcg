import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addContinuousKeyword, addContinuousPower, canPutUnitOntoBattlefield, createSelectCardQuery, moveCardAsCost, putUnitOntoField } from './BaseUtil';

const isSwordImmortal = (card: Card) =>
  card.fullName.includes('剑仙') || !!card.specialName?.includes('剑仙');

const equippedWithItem = (gameState: any, instance: Card) =>
  Object.values(gameState.players).some((player: any) =>
    player.itemZone.some((item: Card | null) =>
      !!item &&
      item.equipTargetId === instance.gamecardId
    )
  );

const swordDiscardCards = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) =>
    card.gamecardId !== instance.gamecardId &&
    isSwordImmortal(card)
  );

const cardEffects: CardEffect[] = [{
  id: '104010416_equipped_stats',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '这个单位装备着道具卡时，力量+1000并获得英勇。',
  condition: (gameState, _playerState, instance) =>
    equippedWithItem(gameState, instance),
  applyContinuous: (gameState, instance) => {
    if (!equippedWithItem(gameState, instance)) return;
    addContinuousPower(instance, instance, 1000);
    addContinuousKeyword(instance, instance, 'heroic');
  }
}, {
  id: '104010416_hand_put_self',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  erosionTotalLimit: [1, 4],
  limitCount: 1,
  description: '1~4，手牌中：舍弃手牌中的1张卡名含有《剑仙》的卡，将手牌中的这张卡放置到战场上。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'HAND' &&
    swordDiscardCards(playerState, instance).length > 0 &&
    canPutUnitOntoBattlefield(playerState, instance),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      swordDiscardCards(playerState, instance),
      '选择舍弃的剑仙卡',
      '选择手牌中的1张卡名含有《剑仙》的卡舍弃。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104010416_hand_put_self' },
      () => 'HAND'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const discard = selections[0]
      ? playerState.hand.find((card: Card) => card.gamecardId === selections[0])
      : undefined;
    if (!discard || !isSwordImmortal(discard) || discard.gamecardId === instance.gamecardId) return;
    moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', instance);
    const live = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId) || instance;
    if (live.cardlocation === 'HAND') putUnitOntoField(gameState, playerState.uid, live, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104010416
 * Card2 Row: 637
 * Card Row: 521
 * Source CardNo: BT08-B11
 * Package: BT08(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】{这个单位装备着道具卡时}:这个单位〖力量+1000〗并获得【英勇】。
 * 〖1~4〗【启】{若这张卡在手牌}[〖+0:蓝蓝〗，舍弃手牌中的1张卡名含有《剑仙》的卡]:将手牌中的这张卡放置到战场上。
 */
const card: Card = {
  id: '104010416',
  fullName: '四方剑仙「东方」',
  specialName: '东方',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
  faction: '百濑之水城',
  acValue: 4,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: true,
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
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
