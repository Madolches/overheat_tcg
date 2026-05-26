import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  createSelectCardQuery,
  exhaustCost,
  getOpponentUid,
  getTopDeckCards,
  moveCard
} from './BaseUtil';

const opponentGraveTargets = (gameState: any, playerUid: string) =>
  gameState.players[getOpponentUid(gameState, playerUid)].grave;

const sameNameCandidates = (playerState: any, target: Card) =>
  [...playerState.hand, ...playerState.deck].filter((card: Card) =>
    card.id === target.id || card.fullName === target.fullName
  );

const faceDownExileTop = (gameState: any, playerState: any, instance: Card, count = 1) => {
  getTopDeckCards(playerState, count).forEach(card =>
    moveCard(gameState, playerState.uid, card, 'EXILE', instance, { faceDown: true })
  );
};

const cardEffects: CardEffect[] = [{
  id: '305000063_enter_face_down_exile',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  description: '这张卡进入战场时，将卡组顶1张卡背面放逐。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'ITEM' &&
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'ITEM' &&
    playerState.deck.length >= 2,
  execute: async (instance, gameState, playerState) => {
    faceDownExileTop(gameState, playerState, instance, 2);
  }
}, {
  id: '305000063_analyze_same_name',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  erosionTotalLimit: [2, 5],
  cost: exhaustCost,
  description: '2~5：你的主要阶段，选择对手墓地1张卡并横置这张卡：将卡组顶1张卡背面放逐。之后对手将卡组或手牌中1张同名卡送入墓地。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'ITEM' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    !instance.isExhausted &&
    playerState.deck.length >= 2 &&
    opponentGraveTargets(gameState, playerState.uid).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      opponentGraveTargets(gameState, playerState.uid),
      '选择分析对象',
      '选择对手墓地中的1张卡。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '305000063_analyze_same_name', step: 'TARGET' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const opponentUid = getOpponentUid(gameState, playerState.uid);
      const opponent = gameState.players[opponentUid];
      const target = opponent.grave.find((card: Card) => card.gamecardId === selections[0]);
      if (!target) return;
      faceDownExileTop(gameState, playerState, instance, 2);
      const candidates = sameNameCandidates(opponent, target);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        opponentUid,
        candidates,
        '选择送入墓地的同名卡',
        '从你的手牌或卡组中选择1张与被选择卡同名的卡送入墓地。',
        1,
        1,
        {
          sourceCardId: instance.gamecardId,
          effectId: '305000063_analyze_same_name',
          step: 'SAME_NAME',
          opponentUid,
          targetName: target.fullName,
          targetCardId: target.id
        },
        card => card.cardlocation as any
      );
      return;
    }

    if (context?.step === 'SAME_NAME') {
      const opponent = gameState.players[context.opponentUid || playerState.uid];
      const selected = selections[0]
        ? [...opponent.hand, ...opponent.deck].find((card: Card) =>
            card.gamecardId === selections[0] &&
            (card.id === context.targetCardId || card.fullName === context.targetName)
          )
        : undefined;
      if (!selected) return;
      const fromDeck = selected.cardlocation === 'DECK';
      moveCard(gameState, opponent.uid, selected, 'GRAVE', instance);
      if (fromDeck) await AtomicEffectExecutor.execute(gameState, opponent.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 305000063
 * Card2 Row: 587
 * Card Row: 471
 * Source CardNo: BT07-Y10
 * Package: BT07(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这张卡进入战场时}：将你卡组顶的2张卡背面放逐。
 * 【2~5】【启】{你的主要阶段，选择对手墓地中的1张卡}[〖横置〗]:将你卡组顶的1张卡背面放逐。之后，对手将他卡组或手牌中的1张被选择的卡的同名卡送入墓地。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '305000063',
  fullName: '「机关分析室」',
  specialName: '机关分析室',
  type: 'ITEM',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
