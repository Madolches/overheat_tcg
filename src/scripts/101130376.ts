import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { cardsInZones, moveCard, selectFromEntries } from './BaseUtil';

const recoveryEntries = (playerState: any) =>
  cardsInZones(playerState, ['GRAVE', 'EROSION_FRONT'])
    .filter(({ card, source }) => source === 'GRAVE' || card.displayState === 'FRONT_UPRIGHT');

const cardEffects: CardEffect[] = [{
  id: '101130376_opponent_bounce_recover',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_ZONE',
  triggerLocation: ['UNIT'],
  isGlobal: true,
  limitCount: 1,
  description: '1回合1次：你的单位由于对手卡的效果从战场返回手牌或卡组时，将墓地或正面侵蚀区最多3张卡放到卡组底。',
  condition: (_gameState, playerState, _instance, event) =>
    event?.playerUid === playerState.uid &&
    event.data?.zone === 'UNIT' &&
    (event.data?.targetZone === 'HAND' || event.data?.targetZone === 'DECK') &&
    !!event.data?.isEffect &&
    !!event.data?.effectSourcePlayerUid &&
    event.data.effectSourcePlayerUid !== playerState.uid &&
    recoveryEntries(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    const entries = recoveryEntries(playerState);
    selectFromEntries(
      gameState,
      playerState.uid,
      entries,
      '选择放回卡组底的卡',
      '选择你的墓地或侵蚀区正面卡中最多3张卡，按选择顺序放置到卡组底。',
      0,
      Math.min(3, entries.length),
      { sourceCardId: instance.gamecardId, effectId: '101130376_opponent_bounce_recover' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    selections.slice(0, 3).forEach(id => {
      const card = AtomicEffectExecutor.findCardById(gameState, id);
      const ownerUid = card ? AtomicEffectExecutor.findCardOwnerKey(gameState, card.gamecardId) : undefined;
      if (!card || ownerUid !== playerState.uid) return;
      if (card.cardlocation === 'GRAVE' || (card.cardlocation === 'EROSION_FRONT' && card.displayState === 'FRONT_UPRIGHT')) {
        moveCard(gameState, playerState.uid, card, 'DECK', instance, { insertAtBottom: true });
      }
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130376
 * Card2 Row: 569
 * Card Row: 453
 * Source CardNo: BT07-W03
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗{你的单位由于对手的卡的效果从战场上返回持有者的手牌或卡组时}：将你的墓地中或侵蚀区的正面卡中最多3张卡放置到你的卡组底。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130376',
  fullName: '夜幕的魔法少女',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '圣王国',
  acValue: 3,
  power: 3500,
  basePower: 3500,
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
