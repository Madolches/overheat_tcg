import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createChoiceQuery, moveCard, moveCardsToBottom, story } from './BaseUtil';

const whiteHandCards = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId && card.color === 'WHITE');

const cardEffects: CardEffect[] = [story('201000114_empty_fantasy', '选择1项：舍弃1张手牌防止本回合受到的对手效果伤害；或舍弃1张白色手牌恢复4并放逐这张卡。', async (instance, gameState, playerState) => {
  const options = [];
  if (playerState.hand.some((card: Card) => card.gamecardId !== instance.gamecardId)) {
    options.push({ id: 'PREVENT_EFFECT_DAMAGE', label: '防止效果伤害' });
  }
  if (whiteHandCards(playerState, instance).length > 0) {
    options.push({ id: 'RECOVER_4', label: '恢复4并放逐' });
  }
  if (options.length === 0) return;
  createChoiceQuery(
    gameState,
    playerState.uid,
    '选择效果',
    '选择1项效果执行。',
    options,
    { sourceCardId: instance.gamecardId, effectId: '201000114_empty_fantasy', step: 'MODE' }
  );
}, {
  condition: (_gameState, playerState, instance) =>
    playerState.hand.some((card: Card) => card.gamecardId !== instance.gamecardId),
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      const mode = selections[0];
      const isRecoverMode = mode === 'RECOVER_4';
      const candidates = isRecoverMode ? whiteHandCards(playerState, instance) : playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId);
      if (candidates.length === 0) return;
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(
          gameState,
          playerState.uid,
          candidates.map((card: Card) => ({ card, source: 'HAND' }))
        ),
        title: '支付舍弃费用',
        description: isRecoverMode ? '选择1张白色手牌舍弃，恢复4并放逐这张卡。' : '选择1张手牌舍弃，防止本回合受到的对手效果伤害。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: { sourceCardId: instance.gamecardId, effectId: '201000114_empty_fantasy', step: 'DISCARD', mode }
      };
      return;
    }

    if (context?.step !== 'DISCARD') return;
    const discarded = selections[0] ? playerState.hand.find((card: Card) => card.gamecardId === selections[0]) : undefined;
    if (!discarded) return;
    if (context.mode === 'RECOVER_4' && discarded.color !== 'WHITE') return;
    moveCard(gameState, playerState.uid, discarded, 'GRAVE', instance);

    if (context.mode === 'RECOVER_4') {
      const recoverCount = Math.min(4, playerState.erosionFront.filter((card: Card | null) => !!card).length);
      const recovered = playerState.erosionFront.filter((card: Card | null): card is Card => !!card).slice(0, recoverCount);
      moveCardsToBottom(gameState, playerState.uid, recovered, instance);
      moveCard(gameState, playerState.uid, instance, 'EXILE', instance);
      return;
    }

    (playerState as any).preventOpponentEffectDamageTurn = gameState.turnCount;
    (playerState as any).preventOpponentEffectDamageSourceName = instance.fullName;
    (playerState as any).preventOpponentEffectDamageSourceCardId = instance.gamecardId;
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000114
 * Card2 Row: 590
 * Card Row: 474
 * Source CardNo: BT07-02W
 * Package: PR(2017年3月)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择下列的1项效果执行：
 * ◆[舍弃1张手牌]：防止你本回合中将要受到的对手的效果伤害。之后，将你墓地中与防止的伤害的相同数量的卡放置到卡组底。
 * ◆[舍弃1张白色手牌]：恢复4。将这张卡放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201000114',
  fullName: '空的幻想',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
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
