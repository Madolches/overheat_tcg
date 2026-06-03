import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  moveCard,
  moveCardAsCost,
  moveTopDeckTo,
  nameContains,
  putUnitOntoField
} from './BaseUtil';

const faceDownExile = (playerState: any) =>
  playerState.exile.filter((card: Card) => card.displayState === 'FRONT_FACEDOWN');

const deckTargets = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    card.type === 'UNIT' &&
    (nameContains(card, '魔偶') || nameContains(card, '斯蒂芬妮')) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '305110083_start_face_down_exile',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'PHASE_CHANGED',
  isMandatory: false,
  description: '你的回合开始时，可以将卡组顶1张卡背面放逐。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'ITEM' &&
    playerState.isTurn &&
    event?.type === 'PHASE_CHANGED' &&
    event.data?.phase === 'START' &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    moveTopDeckTo(gameState, playerState.uid, 1, 'EXILE', instance, true);
  }
}, {
  id: '305110083_end_puppet_blueprint',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'TURN_END' as any,
  isMandatory: false,
  description: '你的回合结束时，送墓这张卡。若背面放逐区2张以上，将所有背面放逐卡置于卡组底，之后从卡组放置1张《魔偶》或「斯蒂芬妮」单位。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'ITEM' &&
    playerState.isTurn &&
    faceDownExile(playerState).length >= 2,
  cost: async (gameState, playerState, instance) => {
    if (instance.cardlocation !== 'ITEM') return false;
    moveCardAsCost(gameState, playerState.uid, instance, 'GRAVE', instance);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    [...faceDownExile(playerState)].forEach(card =>
      moveCard(gameState, playerState.uid, card, 'DECK', instance, { insertAtBottom: true })
    );
    const candidates = deckTargets(playerState);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择魔导人偶',
      '选择卡组中的1张卡名含有《魔偶》或「斯蒂芬妮」的单位放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '305110083_end_puppet_blueprint', step: 'PUT_UNIT' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'PUT_UNIT') return;
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !deckTargets(playerState).some(card => card.gamecardId === target.gamecardId)) return;
    putUnitOntoField(gameState, playerState.uid, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 305110083
 * Card2 Row: 625
 * Card Row: 509
 * Source CardNo: BT08-Y10
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{你的回合开始时}:你可以将你卡组顶的1张卡背面放逐。（放逐区的背面卡可以被其持有者确认）
 * 【诱】{你的回合结束时}[将这张卡送入墓地]:若你的放逐区的背面卡有2张以上，你可以将你的放逐区的所有背面卡放置到你的卡组底，之后，将你的卡组中的1张卡名含有《魔偶》或「斯蒂芬妮」的单位卡放置到战场上。
 */
const card: Card = {
  id: '305110083',
  fullName: '魔导人偶蓝图',
  specialName: '',
  type: 'ITEM',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
