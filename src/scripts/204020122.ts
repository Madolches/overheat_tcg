import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, getOpponentUid, millTop, moveCardAsCost, moveRandomGraveToDeckBottom, story, wealthCount } from './BaseUtil';

const canDrawToFour = (playerState: any) =>
  playerState.hand.length < 4 && playerState.deck.length > 0;

const canRecoverMill = (gameState: any, playerState: any) =>
  playerState.hand.length >= 2 &&
  playerState.grave.length >= 3 &&
  gameState.players[getOpponentUid(gameState, playerState.uid)].deck.length >= 3;

const discardTwoHands = (gameState: any, playerState: any, instance: Card, selections: string[]) => {
  const discards = selections
    .map(id => playerState.hand.find((card: Card) => card.gamecardId === id))
    .filter((card: Card | undefined): card is Card => !!card);
  if (discards.length !== 2 || new Set(discards.map(card => card.gamecardId)).size !== 2) return false;
  discards.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'GRAVE', instance));
  return true;
};

const createDiscardTwoHandQuery = (gameState: any, playerState: any, instance: Card) => {
  if (playerState.hand.length < 2) return false;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    playerState.hand,
    '选择舍弃手牌',
    '选择2张手牌舍弃，之后恢复3并将对手卡组顶3张送入墓地。',
    2,
    2,
    {
      sourceCardId: instance.gamecardId,
      effectId: '204020122_money_dream_modes',
      step: 'DISCARD_COST',
      costType: 'CUSTOM_CARD_COST',
      skipEffectResolveAfterCost: true
    },
    () => 'HAND'
  );
  return true;
};

const cardEffects: CardEffect[] = [story('204020122_money_dream_modes', '同名1回合1次，你的回合中，财富3以上，选择1项：抽到4张；或舍弃2张手牌，恢复3并将对手卡组顶3张送墓。', async () => {
}, {
  limitCount: 1,
  limitNameType: true,
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    wealthCount(playerState, gameState) >= 3 &&
    (canDrawToFour(playerState) || canRecoverMill(gameState, playerState)),
  targetSpec: {
    modeTitle: '选择金钱美梦',
    modeDescription: '选择要执行的效果。',
    modeOptions: [{
      id: 'DRAW_TO_FOUR',
      label: '抽到4张',
      title: '抽到4张',
      description: '将手牌抽到4张为止。',
      minSelections: 0,
      maxSelections: 0,
      condition: (_gameState, playerState) => canDrawToFour(playerState)
    }, {
      id: 'RECOVER_MILL',
      label: '恢复并送墓',
      title: '恢复并送墓',
      description: '舍弃2张手牌作为费用，恢复3并将对手卡组顶3张送入墓地。',
      minSelections: 0,
      maxSelections: 0,
      condition: (gameState, playerState) => canRecoverMill(gameState, playerState)
    }]
  },
  cost: async (gameState, playerState, instance, options?: any) => {
    if (options?.declaredModeId !== 'RECOVER_MILL') return true;
    return createDiscardTwoHandQuery(gameState, playerState, instance);
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'DISCARD_COST') return;
    if (!discardTwoHands(gameState, playerState, instance, selections)) {
      context.cancelActivation = true;
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    const modeId = context?.modeId || context?.selectedModeId || selections[0];
    if (modeId === 'DRAW_TO_FOUR') {
      const count = Math.max(0, Math.min(4 - playerState.hand.length, playerState.deck.length));
      if (count > 0) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: count }, instance);
      return;
    }

    if (modeId !== 'RECOVER_MILL' || !canRecoverMill(gameState, playerState)) return;
    const recoverCount = Math.min(3, playerState.grave.length);
    moveRandomGraveToDeckBottom(gameState, playerState.uid, recoverCount, instance);
    millTop(gameState, getOpponentUid(gameState, playerState.uid), 3, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 204020122
 * Card2 Row: 633
 * Card Row: 517
 * Source CardNo: BT08-B07
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖同名1回合1次〗{你的回合中，你的财富指示物有3个以上，选择下列的1项效果并执行}:
 * ◆将手牌抽到4张为止。
 * ◆{选择1名对手}[舍弃2张手牌]:恢复3（随机选择你的墓地中的3张卡，将其放置到你的卡组底）。将被选择的对手的卡组顶的3张卡送入墓地。
 */
const card: Card = {
  id: '204020122',
  fullName: '金钱美梦',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '九尾商会联盟',
  acValue: 0,
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
