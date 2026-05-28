import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, destroyByEffect, getOpponentUid } from './BaseUtil';

const opponentNonGodFieldCards = (gameState: any, playerUid: string) => {
  const opponent = gameState.players[getOpponentUid(gameState, playerUid)];
  return [...opponent.unitZone, ...opponent.itemZone].filter((card: Card | null): card is Card =>
    !!card && !card.godMark
  );
};

const cardEffects: CardEffect[] = [{
  id: '102050319_exiled_by_opponent_destroy',
  type: 'TRIGGER',
  isMandatory: true,
  triggerLocation: ['EXILE'],
  triggerEvent: 'CARD_EXILED',
  limitCount: 1,
  description: '1回合1次：这个单位由于对手卡的效果从战场被放逐时，选择对手战场上1张非神蚀卡破坏。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.playerUid === playerState.uid &&
    event.data?.sourceZone === 'UNIT' &&
    event.data?.targetZone === 'EXILE' &&
    event.data?.isEffect === true &&
    !!event.data?.effectSourcePlayerUid &&
    event.data.effectSourcePlayerUid !== playerState.uid &&
    opponentNonGodFieldCards(_gameState, playerState.uid).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      opponentNonGodFieldCards(gameState, playerState.uid),
      '选择破坏目标',
      '选择对手战场上的1张非神蚀卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050319_exiled_by_opponent_destroy' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && ['UNIT', 'ITEM'].includes(target.cardlocation || '') && !target.godMark) {
      destroyByEffect(gameState, target, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050319
 * Card2 Row: 556
 * Card Row: 376
 * Source CardNo: BT07-R01
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗{这个单位由于对手的卡的效果从战场上被放逐时，选择对手战场上1张非神蚀卡}：将被选择的卡破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050319',
  fullName: '伊列宇的巨盾兵',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '伊列宇王国',
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
