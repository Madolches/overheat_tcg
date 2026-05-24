import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addTempDamage, addTempPower, createSelectCardQuery, ensureData, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102060433_power_search',
  type: 'TRIGGER',
  triggerEvent: ['CARD_POWER_CHANGED', 'PHASE_CHANGED'],
  isMandatory: false,
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：这个单位力量变为3500以上时，可以选择卡组中1张<雷霆>卡加入手牌。',
  condition: (gameState, playerState, instance, event) =>
    (event?.type !== 'CARD_POWER_CHANGED' || event.targetCardId === instance.gamecardId) &&
    (instance.power || 0) >= 3500 &&
    ensureData(instance).powerSearchUsedTurn !== gameState.turnCount &&
    playerState.deck.some(card => card.faction === '雷霆'),
  execute: async (instance, gameState, playerState) => {
    ensureData(instance).powerSearchUsedTurn = gameState.turnCount;
    createSelectCardQuery(gameState, playerState.uid, playerState.deck.filter(card => card.faction === '雷霆'), '选择雷霆卡', '选择卡组中的1张<雷霆>卡加入手牌。', 0, 1, {
      sourceCardId: instance.gamecardId,
      effectId: '102060433_power_search'
    }, () => 'DECK');
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (selected?.cardlocation !== 'DECK') return;
    AtomicEffectExecutor.moveCard(gameState, playerState.uid, 'DECK', playerState.uid, 'HAND', selected.gamecardId, true, {
      effectSourcePlayerUid: playerState.uid,
      effectSourceCardId: instance.gamecardId
    });
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}, {
  id: '102060433_red_story_boost',
  type: 'TRIGGER',
  triggerEvent: 'CARD_PLAYED',
  isMandatory: false,
  triggerLocation: ['UNIT'],
  isGlobal: true,
  description: '你使用红色故事卡时，选择你的1个<雷霆>单位，本回合伤害+1、力量+1000。',
  condition: (_gameState, playerState, _instance, event) =>
    event?.playerUid === playerState.uid &&
    event.sourceCard?.type === 'STORY' &&
    event.sourceCard?.color === 'RED' &&
    ownUnits(playerState).some(unit => unit.faction === '雷霆'),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, ownUnits(playerState).filter(unit => unit.faction === '雷霆'), '选择雷霆单位', '选择你的1个<雷霆>单位，本回合伤害+1、力量+1000。', 1, 1, {
      sourceCardId: instance.gamecardId,
      effectId: '102060433_red_story_boost'
    });
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation !== 'UNIT') return;
    addTempDamage(target, instance, 1);
    addTempPower(target, instance, 1000);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102060433
 * Card2 Row: 308
 * Card Row: 547
 * Source CardNo: BT04-R07
 * Package: BT04(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗：这个单位的力量值变为〖3500〗以上时，你可以选择你的卡组中的1张<雷霆>卡，将其加入手牌。
 * 【诱】：你使用红色故事卡时，选择你的一个<雷霆>单位，本回合中，〖伤害+1〗〖力量+1000〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102060433',
  fullName: '炎雷领队',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '雷霆',
  acValue: 3,
  power: 2000,
  basePower: 2000,
  damage: 2,
  baseDamage: 2,
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
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
