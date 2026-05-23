import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createChoiceQuery, createSelectCardQuery, getOpponentUid, millTop, moveRandomGraveToDeckBottom, story, wealthCount } from './BaseUtil';

const canDrawToFour = (playerState: any) =>
  playerState.hand.length < 4 && playerState.deck.length > 0;

const canRecoverMill = (gameState: any, playerState: any) =>
  playerState.hand.length >= 2 &&
  playerState.grave.length >= 3 &&
  gameState.players[getOpponentUid(gameState, playerState.uid)].deck.length >= 3;

const cardEffects: CardEffect[] = [story('204020122_money_dream_modes', '同名1回合1次，你的回合中，财富3以上，选择1项：抽到4张；或舍弃2张手牌，恢复3并将对手卡组顶3张送墓。', async (instance, gameState, playerState) => {
  const options = [
    {
      id: 'DRAW_TO_FOUR',
      label: '抽到4张',
      disabled: !canDrawToFour(playerState),
      disabledReason: '手牌已达4张或卡组不足'
    },
    {
      id: 'RECOVER_MILL',
      label: '恢复并送墓',
      disabled: !canRecoverMill(gameState, playerState),
      disabledReason: '手牌、墓地或对手卡组不足'
    }
  ];
  createChoiceQuery(
    gameState,
    playerState.uid,
    '选择金钱美梦',
    '选择要执行的效果。',
    options,
    { sourceCardId: instance.gamecardId, effectId: '204020122_money_dream_modes', step: 'MODE' }
  );
}, {
  limitCount: 1,
  limitNameType: true,
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    wealthCount(playerState, gameState) >= 3 &&
    (canDrawToFour(playerState) || canRecoverMill(gameState, playerState)),
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      if (selections[0] === 'DRAW_TO_FOUR') {
        const count = Math.max(0, Math.min(4 - playerState.hand.length, playerState.deck.length));
        if (count > 0) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: count }, instance);
        return;
      }
      if (selections[0] !== 'RECOVER_MILL' || !canRecoverMill(gameState, playerState)) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        playerState.hand,
        '选择舍弃手牌',
        '选择2张手牌舍弃，之后恢复3并将对手卡组顶3张送入墓地。',
        2,
        2,
        { sourceCardId: instance.gamecardId, effectId: '204020122_money_dream_modes', step: 'DISCARD' },
        () => 'HAND'
      );
      return;
    }

    if (context?.step !== 'DISCARD') return;
    const discards = selections
      .map(id => playerState.hand.find((card: Card) => card.gamecardId === id))
      .filter((card: Card | undefined): card is Card => !!card);
    if (discards.length !== 2) return;
    const recoverCount = Math.min(3, playerState.grave.length);
    discards.forEach(card => {
      AtomicEffectExecutor.moveCard(gameState, playerState.uid, 'HAND', playerState.uid, 'GRAVE', card.gamecardId, false, {
        effectSourcePlayerUid: playerState.uid,
        effectSourceCardId: instance.gamecardId
      });
    });
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
