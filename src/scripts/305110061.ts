import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  moveCard,
  moveCardAsCost,
  putUnitOntoField
} from './BaseUtil';

const faceDownExile = (playerState: any) =>
  playerState.exile.filter((card: Card) => card.displayState === 'FRONT_FACEDOWN');

const fortressCandidates = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    card.type === 'UNIT' &&
    card.faction === '学院要塞' &&
    (card.acValue || 0) >= 4 &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '305110061_start_face_down_exile',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'PHASE_CHANGED',
  description: '你的回合开始时，可以将卡组顶1张卡背面放逐。',
  condition: (_gameState, playerState, instance, event) =>
    playerState.isTurn &&
    instance.cardlocation === 'ITEM' &&
    event?.type === 'PHASE_CHANGED' &&
    event.data?.phase === 'START' &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    const top = playerState.deck[playerState.deck.length - 1];
    if (top) moveCard(gameState, playerState.uid, top, 'EXILE', instance, { faceDown: true });
  }
}, {
  id: '305110061_end_fortress_blueprint',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'TURN_END' as any,
  description: '你的回合结束时，送墓这张卡。若背面放逐卡有4张以上，将所有背面放逐卡放置到卡组底，之后从卡组放置1张<学院要塞>ACCESS4以上单位。',
  condition: (_gameState, playerState, instance) =>
    playerState.isTurn &&
    instance.cardlocation === 'ITEM' &&
    faceDownExile(playerState).length >= 4,
  execute: async (instance, gameState, playerState) => {
    moveCardAsCost(gameState, playerState.uid, instance, 'GRAVE', instance);
    [...faceDownExile(playerState)].forEach(card =>
      moveCard(gameState, playerState.uid, card, 'DECK', instance, { insertAtBottom: true })
    );
    const candidates = fortressCandidates(playerState);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择学院要塞单位',
      '从你的卡组选择1张<学院要塞>ACCESS4以上单位放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '305110061_end_fortress_blueprint', step: 'PUT_UNIT' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'PUT_UNIT') return;
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || !fortressCandidates(playerState).some(card => card.gamecardId === selected.gamecardId)) return;
    if (!putUnitOntoField(gameState, playerState.uid, selected, instance)) return;
    const moved = AtomicEffectExecutor.findCardById(gameState, selected.gamecardId);
    if (moved) {
      (moved as any).data = {
        ...((moved as any).data || {}),
        placedByBlueprintEffectTurn: gameState.turnCount,
        placedByBlueprintSourceCardId: instance.gamecardId
      };
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 305110061
 * Card2 Row: 585
 * Card Row: 469
 * Source CardNo: BT07-Y08
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{你的回合开始时}:你可以将你卡组顶的1张卡背面放逐。（放逐区的背面卡可以被其持有者确认）
 * 【诱】{你的回合结束时}[将这张卡送入墓地]:若你的放逐区的背面卡有4张以上，你可以将你放逐区中的所有背面卡放置到你的卡组底，之后，将你的卡组中的1张<学院要塞>的ACCESS值+4以上的单位卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '305110061',
  fullName: '要塞蓝图',
  specialName: '',
  type: 'ITEM',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '学院要塞',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
