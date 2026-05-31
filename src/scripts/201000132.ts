import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createPlayerSelectQuery, createSelectCardQuery, faceUpErosion, getOpponentUid, moveCard, ownUnits, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('201000132_exile_grave', '选择一名玩家墓地2张卡放逐。之后若你场上有<仙雪原>神蚀单位，可以选择侵蚀区1张卡放逐。', async (instance, gameState, playerState) => {
  const canChooseSelf = playerState.grave.length >= 2;
  const opponentUid = getOpponentUid(gameState, playerState.uid);
  const canChooseOpponent = gameState.players[opponentUid].grave.length >= 2;
  if (!canChooseSelf && !canChooseOpponent) return;
  createPlayerSelectQuery(gameState, playerState.uid, '选择玩家', '选择1名玩家，之后选择其墓地2张卡放逐。', {
    sourceCardId: instance.gamecardId,
    effectId: '201000132_exile_grave',
    step: 'PLAYER'
  }, { includeSelf: canChooseSelf, includeOpponent: canChooseOpponent });
}, {
  condition: (gameState, playerState) =>
    playerState.grave.length >= 2 || gameState.players[getOpponentUid(gameState, playerState.uid)].grave.length >= 2,
  targetSpec: {
    preselect: false,
    title: '选择墓地卡牌',
    description: '选择该玩家墓地中的2张卡放逐。',
    minSelections: 2,
    maxSelections: 2,
    zones: ['GRAVE'],
    controller: 'ANY',
    step: 'GRAVE',
    getCandidates: (gameState, playerState) => [
      ...playerState.grave.map(card => ({ card, source: 'GRAVE' as any })),
      ...gameState.players[getOpponentUid(gameState, playerState.uid)].grave.map(card => ({ card, source: 'GRAVE' as any }))
    ]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'PLAYER') {
      const targetUid = selections[0] === 'PLAYER_SELF' ? playerState.uid : getOpponentUid(gameState, playerState.uid);
      createSelectCardQuery(gameState, playerState.uid, gameState.players[targetUid].grave, '选择墓地卡牌', '选择该玩家墓地中的2张卡放逐。', 2, 2, {
        sourceCardId: instance.gamecardId,
        effectId: '201000132_exile_grave',
        step: 'GRAVE',
        targetUid
      }, () => 'GRAVE');
      return;
    }
    if (context?.step === 'GRAVE') {
      const targetUid = context.targetUid;
      selections.forEach(id => {
        const target = AtomicEffectExecutor.findCardById(gameState, id);
        if (target?.cardlocation === 'GRAVE') moveCard(gameState, targetUid, target, 'EXILE', instance);
      });
      if (ownUnits(playerState).some(unit => unit.faction === '仙雪原' && unit.godMark) && faceUpErosion(playerState).length + playerState.erosionBack.filter(Boolean).length > 0) {
        const erosions = [...faceUpErosion(playerState), ...playerState.erosionBack.filter((card): card is Card => !!card)];
        createSelectCardQuery(gameState, playerState.uid, erosions, '选择侵蚀区卡牌', '你可以选择侵蚀区中的1张卡放逐。', 0, 1, {
          sourceCardId: instance.gamecardId,
          effectId: '201000132_exile_grave',
          step: 'EROSION'
        }, card => card.cardlocation as any);
      }
      return;
    }
    if (context?.step === 'EROSION') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target && (target.cardlocation === 'EROSION_FRONT' || target.cardlocation === 'EROSION_BACK')) {
        moveCard(gameState, playerState.uid, target, 'EXILE', instance);
      }
    }
  }
}), {
  id: '201000132_payment_substitute',
  type: 'CONTINUOUS',
  triggerLocation: ['HAND'],
  content: 'SELF_HAND_COST',
  description: '为ACCESS+3以下白色卡支付使用费用时，可以将手牌中的这张卡放逐作为代替。'
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000132
 * Card2 Row: 319
 * Card Row: 558
 * Source CardNo: BT04-W08
 * Package: BT04(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择一名玩家的墓地中2张卡，将其放逐。之后，若你场上有<仙雪原>的神蚀单位，你可以选择你侵蚀区中的1张卡，将其放逐。
 * 【你为ACCESS值+3以下的白色卡支付使用费用时，你可以将手牌中的这张卡放逐作为这次费用的代替。】
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201000132',
  fullName: '狮鹫之息',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
