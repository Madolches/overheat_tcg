import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createChoiceQuery, getOpponentUid, moveCard, moveTopDeckTo, revealDeckCards } from './BaseUtil';

const typeOptions = [
  { id: 'UNIT', label: '单位卡' },
  { id: 'STORY', label: '故事卡' },
  { id: 'ITEM', label: '道具卡' }
];

const cardEffects: CardEffect[] = [{
  id: '305000046_candy_box',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  limitCount: 1,
  description: '1回合1次：主要阶段选择对手。对手可将卡组顶1张送墓；若否，宣言种类并公开你的卡组顶，种类不同则加入手牌。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    instance.cardlocation === 'ITEM',
  execute: async (instance, gameState, playerState) => {
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    createChoiceQuery(
      gameState,
      opponentUid,
      '糖果魔盒',
      '是否将你自己卡组顶的1张卡送入墓地？若不如此做，你需要宣言1个卡片种类。',
      [
        { id: 'MILL', label: '送入墓地' },
        { id: 'DECLARE', label: '宣言种类' }
      ],
      { sourceCardId: instance.gamecardId, effectId: '305000046_candy_box', step: 'OPPONENT_CHOICE', controllerUid: playerState.uid, opponentUid }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'OPPONENT_CHOICE') {
      const opponentUid = context.opponentUid || playerState.uid;
      if (selections[0] === 'MILL') {
        moveTopDeckTo(gameState, opponentUid, 1, 'GRAVE', instance);
        return;
      }
      createChoiceQuery(gameState, opponentUid, '宣言卡片种类', '宣言1个卡片种类。', typeOptions, {
        sourceCardId: instance.gamecardId,
        effectId: '305000046_candy_box',
        step: 'DECLARE_TYPE',
        controllerUid: context.controllerUid,
        declaredByUid: opponentUid
      });
      return;
    }
    if (context?.step === 'DECLARE_TYPE') {
      const controllerUid = context.controllerUid;
      const controller = gameState.players[controllerUid];
      const top = controller?.deck[controller.deck.length - 1];
      if (!top) return;
      revealDeckCards(gameState, controllerUid, 1, instance);
      if (top.type !== selections[0]) {
        moveCard(gameState, controllerUid, top, 'HAND', instance);
      }
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 305000046
 * Card2 Row: 511
 * Card Row: 334
 * Source CardNo: PR06-07Y
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗{你的主要阶段，选择1名对手}：被选择的玩家可以将自己卡组顶的1张卡送入墓地。若没有如此做，那名玩家宣言1个卡片种类。之后，公开你的卡组顶的1张卡，若那张卡的种类和宣言的不一致，将其加入手牌。若一致，将那张卡按原样放回。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '305000046',
  fullName: '「糖果魔盒」',
  specialName: '糖果魔盒',
  type: 'ITEM',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
