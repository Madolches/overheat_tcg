import { Card, CardEffect } from '../types/game';
import { createPlayerSelectQuery, createSelectCardQuery, moveCardsToBottom, moveCard, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('201000138_purify', '依据你的放逐区数量执行净化效果。', async (instance, gameState, playerState) => {
  if (playerState.exile.length >= 5) {
    createPlayerSelectQuery(gameState, playerState.uid, '选择玩家', '选择1名玩家，之后选择他墓地中的3张卡放逐。', { sourceCardId: instance.gamecardId, effectId: '201000138_purify', step: 'PICK_5' });
  } else if (playerState.exile.length >= 10) {
    const targets = playerState.erosionBack.filter((card): card is Card => !!card);
    if (targets.length > 0) createSelectCardQuery(gameState, playerState.uid, targets, '选择背面侵蚀卡', '选择你自己的侵蚀区中的1张背面卡放逐。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '201000138_purify', step: 'BACK_SELF', sourcePlayerUid: playerState.uid }, () => 'EROSION_BACK');
  }
}, {
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    const continueTen = () => {
      if (playerState.exile.length < 10) return false;
      const targets = playerState.erosionBack.filter((card): card is Card => !!card);
      if (targets.length > 0) {
        createSelectCardQuery(gameState, playerState.uid, targets, '选择背面侵蚀卡', '选择你自己的侵蚀区中的1张背面卡放逐。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '201000138_purify', step: 'BACK_SELF', sourcePlayerUid: playerState.uid }, () => 'EROSION_BACK');
        return true;
      }
      return false;
    };
    const continueFifteen = () => {
      if (playerState.exile.length < 15) return false;
      createPlayerSelectQuery(gameState, playerState.uid, '选择玩家', '选择1名玩家，之后选择他墓地中的《净化》以外的5张卡放置到卡组底。', { sourceCardId: instance.gamecardId, effectId: '201000138_purify', step: 'PICK_15' });
      return true;
    };

    if (context?.step === 'PICK_5') {
      const targetUid = selections[0] === 'PLAYER_SELF' ? playerState.uid : gameState.playerIds.find(id => id !== playerState.uid)!;
      const grave = gameState.players[targetUid].grave;
      if (grave.length > 0) createSelectCardQuery(gameState, playerState.uid, grave, '选择放逐的墓地卡', '选择该玩家墓地中的至多3张卡放逐。', Math.min(3, grave.length), Math.min(3, grave.length), { sourceCardId: instance.gamecardId, effectId: '201000138_purify', step: 'EXILE_5', targetUid }, () => 'GRAVE');
      else if (!continueTen()) continueFifteen();
      return;
    }
    if (context?.step === 'EXILE_5') {
      const target = gameState.players[context.targetUid];
      selections.forEach(id => {
        const card = target.grave.find(candidate => candidate.gamecardId === id);
        if (card) moveCard(gameState, context.targetUid, card, 'EXILE', instance);
      });
      if (!continueTen()) continueFifteen();
      return;
    }
    if (context?.step === 'BACK_SELF' || context?.step === 'BACK_OPPONENT') {
      const uid = context.sourcePlayerUid;
      const card = selections[0] ? gameState.players[uid].erosionBack.find(candidate => candidate?.gamecardId === selections[0]) : undefined;
      if (card) moveCard(gameState, uid, card, 'EXILE', instance);
      if (context.step === 'BACK_SELF') {
        const opponentUid = gameState.playerIds.find(id => id !== uid)!;
        const targets = gameState.players[opponentUid].erosionBack.filter((candidate): candidate is Card => !!candidate);
        if (targets.length > 0) {
          createSelectCardQuery(gameState, opponentUid, targets, '选择背面侵蚀卡', '选择你自己的侵蚀区中的1张背面卡放逐。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '201000138_purify', step: 'BACK_OPPONENT', sourcePlayerUid: opponentUid }, () => 'EROSION_BACK');
          return;
        }
      }
      continueFifteen();
      return;
    }
    if (context?.step === 'PICK_15') {
      const targetUid = selections[0] === 'PLAYER_SELF' ? playerState.uid : gameState.playerIds.find(id => id !== playerState.uid)!;
      const grave = gameState.players[targetUid].grave.filter(card => card.id !== '201000138');
      if (grave.length > 0) createSelectCardQuery(gameState, playerState.uid, grave, '选择放回卡组底的卡', '选择该玩家墓地中《净化》以外的至多5张卡放置到卡组底。', Math.min(5, grave.length), Math.min(5, grave.length), { sourceCardId: instance.gamecardId, effectId: '201000138_purify', step: 'BOTTOM_15', targetUid }, () => 'GRAVE');
      return;
    }
    if (context?.step === 'BOTTOM_15') {
      const target = gameState.players[context.targetUid];
      const cards = selections.map(id => target.grave.find(card => card.gamecardId === id)).filter((card): card is Card => !!card);
      moveCardsToBottom(gameState, context.targetUid, cards, instance);
    }
  },
  targetSpec: {
    preselect: false,
    targetGroups: [{
      title: 'Select grave cards to exile',
      description: 'Select grave cards for the 5-exile effect.',
      minSelections: 0,
      maxSelections: 3,
      zones: ['GRAVE'],
      controller: 'ANY',
      step: 'EXILE_5',
      getCandidates: (gameState) =>
        Object.entries(gameState.players).flatMap(([ownerUid, player]) =>
          player.grave.map(card => ({ card, source: 'GRAVE' as any, ownerUid }))
        )
    }, {
      title: 'Select grave cards to bottom',
      description: 'Select non-Purify grave cards for the 15-bottom effect.',
      minSelections: 0,
      maxSelections: 5,
      zones: ['GRAVE'],
      controller: 'ANY',
      step: 'BOTTOM_15',
      getCandidates: (gameState) =>
        Object.entries(gameState.players).flatMap(([ownerUid, player]) =>
          player.grave
            .filter(card => card.id !== '201000138')
            .map(card => ({ card, source: 'GRAVE' as any, ownerUid }))
        )
    }]
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000138
 * Card2 Row: 239
 * Card Row: 595
 * Source CardNo: BT03-W14
 * Package: BT03(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 依据你的放逐区的卡的数量，执行下列效果（满足条件时每项都执行）:
 * ◆5张以上:选择1名玩家，选择他墓地中的3张卡放逐。
 * ◆10张以上:所有玩家选择他自己的侵蚀区中的1张背面卡，将其放逐。
 * ◆15张以上:选择1名玩家，选择他墓地中的《净化》以外的5张卡，放置到他自己的卡组底。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201000138',
  fullName: '净化',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
