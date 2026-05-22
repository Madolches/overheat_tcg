import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  allCardsOnField,
  createSelectCardQuery,
  damagePlayerByEffect,
  destroyByEffect,
  discardHandCost,
  ensureData,
  getOpponentUid
} from './BaseUtil';

const nonGodFieldCards = (gameState: any) => allCardsOnField(gameState).filter(card => !card.godMark);
const ohDisabled = (instance: Card) => !!(instance as any).data?.ohEffectDisabledUntilOwnStartUid;

const destroyedOpponentUnitByOwnEffect = (gameState: any, playerUid: string, event: any) => {
  const opponentUid = getOpponentUid(gameState, playerUid);
  if (event?.playerUid !== opponentUid || event.data?.sourcePlayerId !== playerUid || !event.targetCardId) return undefined;
  return gameState.players[opponentUid].grave.find((card: Card) =>
    card.gamecardId === event.targetCardId &&
    card.type === 'UNIT'
  );
};

const cardEffects: CardEffect[] = [{
  id: '102000372_opponent_unit_effect_destroy_damage',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_DESTROYED_EFFECT',
  isGlobal: true,
  limitCount: 1,
  description: '1回合1次：对手战场上的单位由于你的卡的效果破坏时，给予所有对手2点伤害。',
  condition: (gameState, playerState, _instance, event) =>
    !!destroyedOpponentUnitByOwnEffect(gameState, playerState.uid, event),
  execute: async (instance, gameState, playerState) => {
    await damagePlayerByEffect(gameState, playerState.uid, getOpponentUid(gameState, playerState.uid), 2, instance);
  }
}, {
  id: '102000372_oh_destroy_non_god',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  cost: discardHandCost(1),
  description: 'OH：1回合1次，舍弃1张手牌，选择战场上1张非神蚀卡破坏；直到下一次你的回合开始失去这个启动能力。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isGoddessMode &&
    !ohDisabled(instance) &&
    nonGodFieldCards(gameState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodFieldCards(gameState),
      '选择破坏目标',
      '选择战场上的1张非神蚀卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102000372_oh_destroy_non_god' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && ['UNIT', 'ITEM'].includes(target.cardlocation || '') && !target.godMark) {
      destroyByEffect(gameState, target, instance);
    }
    ensureData(instance).ohEffectDisabledUntilOwnStartUid = playerState.uid;
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000372
 * Card2 Row: 562
 * Card Row: 446
 * Source CardNo: BT07-R07
 * Package: BT07(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗{对手战场上的单位由于你的卡的效果破坏时}：给予所有对手2点伤害。
 * 【OH】【启】〖1回合1次〗{选择战场上1张非神蚀卡}[舍弃1张手牌]：将被选择卡破坏。直到下一次你的回合开始时为止，失去这个【启】能力。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102000372',
  fullName: '圣神八部「阿修罗」',
  specialName: '阿修罗',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
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
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
