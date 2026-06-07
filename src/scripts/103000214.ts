import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, cardsInZones, getOpponentUid, isFeijingCard, moveCard, selectFromEntries } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103000214_combat_search',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'COMBAT_DAMAGE_CAUSED',
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  description: '这个单位造成战斗伤害时，可以将卡组或墓地中1张菲晶非神蚀卡加入手牌。',
  condition: (gameState, playerState, instance, event) =>
    event?.playerUid === getOpponentUid(gameState, playerState.uid) &&
    (event.data?.attackerIds || []).includes(instance.gamecardId) &&
    cardsInZones(playerState, ['DECK', 'GRAVE']).some(entry => isFeijingCard(entry.card) && !entry.card.godMark),
  execute: async (instance, gameState, playerState) => {
    const entries = cardsInZones(playerState, ['DECK', 'GRAVE']).filter(entry => isFeijingCard(entry.card) && !entry.card.godMark);
    selectFromEntries(
      gameState,
      playerState.uid,
      entries,
      '选择菲晶卡',
      '选择你的卡组或墓地中的1张具有【菲晶】的非神蚀卡加入手牌。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000214_combat_search' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected) return;
    const fromDeck = selected.cardlocation === 'DECK';
    moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000214
 * Card2 Row: 372
 * Card Row: 242
 * Source CardNo: BT05-G06
 * Package: BT05(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位造成战斗伤害时}:你可以将你的卡组或你的墓地中的1张具有【菲晶】的非神蚀卡加入手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000214',
  fullName: '晶兽猎人',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 3,
  power: 2500,
  basePower: 2500,
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
