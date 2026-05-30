import { Card, CardEffect } from '../types/game';
import { createSelectCardQuery, moveCard, moveCardAsCost, moveCardsToBottom, story } from './BaseUtil';

const MODE_PREVENT = 'PREVENT_EFFECT_DAMAGE';
const MODE_RECOVER = 'RECOVER_4';

const selectedModeFromContext = (context?: any) =>
  context?.declaredModeId ||
  context?.selectedModeId ||
  context?.modeId ||
  context?.declaredTargets?.[0]?.modeId ||
  context?.declaredTargets?.declaredModeId;

const anyDiscardCandidates = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId);

const whiteHandCards = (playerState: any, instance: Card) =>
  anyDiscardCandidates(playerState, instance).filter((card: Card) => card.color === 'WHITE');

const discardCandidatesForMode = (playerState: any, instance: Card, mode: string) =>
  mode === MODE_RECOVER ? whiteHandCards(playerState, instance) : anyDiscardCandidates(playerState, instance);

const openDiscardCostQuery = (gameState: any, playerState: any, instance: Card, mode: string) => {
  const candidates = discardCandidatesForMode(playerState, instance, mode);
  if (candidates.length === 0) return false;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    candidates,
    '支付舍弃费用',
    mode === MODE_RECOVER ? '选择1张白色手牌舍弃，作为发动费用。' : '选择1张手牌舍弃，作为发动费用。',
    1,
    1,
    {
      sourceCardId: instance.gamecardId,
      effectId: '201000114_empty_fantasy',
      step: 'DISCARD_COST',
      mode,
      skipEffectResolveAfterCost: true
    },
    () => 'HAND'
  );
  return !!gameState.pendingQuery;
};

const cardEffects: CardEffect[] = [story('201000114_empty_fantasy', '选择1项：舍弃1张手牌防止本回合受到的对手效果伤害；或舍弃1张白色手牌恢复4并放逐这张卡。', async () => {}, {
  condition: (_gameState, playerState, instance) =>
    anyDiscardCandidates(playerState, instance).length > 0,
  targetSpec: {
    modeTitle: '选择效果',
    modeDescription: '选择1项效果执行。',
    modeOptions: [{
      id: MODE_PREVENT,
      label: '防止效果伤害',
      title: '确认防止效果伤害',
      description: '舍弃1张手牌，防止你本回合中将要受到的对手的效果伤害。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: MODE_PREVENT,
      condition: (_gameState, playerState, instance) => anyDiscardCandidates(playerState, instance).length > 0,
      getCandidates: () => [] as any[]
    }, {
      id: MODE_RECOVER,
      label: '恢复4并放逐',
      title: '确认恢复4并放逐',
      description: '舍弃1张白色手牌，恢复4。将这张卡放逐。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: MODE_RECOVER,
      condition: (_gameState, playerState, instance) => whiteHandCards(playerState, instance).length > 0,
      getCandidates: () => [] as any[]
    }]
  },
  cost: async (gameState, playerState, instance, context?: any) => {
    const mode = selectedModeFromContext(context);
    if (!mode) return false;
    return openDiscardCostQuery(gameState, playerState, instance, mode);
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    const mode = context?.mode;
    const discarded = selections[0]
      ? discardCandidatesForMode(playerState, instance, mode).find((card: Card) => card.gamecardId === selections[0])
      : undefined;
    if (!discarded) {
      context.cancelActivation = true;
      gameState.logs.push(`[${instance.fullName}] 舍弃费用不合法，发动中止。`);
      return;
    }
    moveCardAsCost(gameState, playerState.uid, discarded, 'GRAVE', instance);
  },
  onQueryResolve: async (instance, gameState, playerState, _selections, context) => {
    const mode = context?.mode || selectedModeFromContext(context);
    if (mode === MODE_RECOVER) {
      const recoverCount = Math.min(4, playerState.erosionFront.filter((card: Card | null) => !!card).length);
      const recovered = playerState.erosionFront.filter((card: Card | null): card is Card => !!card).slice(0, recoverCount);
      moveCardsToBottom(gameState, playerState.uid, recovered, instance);
      moveCard(gameState, playerState.uid, instance, 'EXILE', instance);
      return;
    }

    if (mode === MODE_PREVENT) {
      (playerState as any).preventOpponentEffectDamageTurn = gameState.turnCount;
      (playerState as any).preventOpponentEffectDamageSourceName = instance.fullName;
      (playerState as any).preventOpponentEffectDamageSourceCardId = instance.gamecardId;
    }
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000114
 * Card2 Row: 590
 * Card Row: 474
 * Source CardNo: BT07-02W
 * Package: PR(2017年7月?)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择下列的1项效果执行：
 * ●[舍弃1张手牌]：防止你本回合中将要受到的对手的效果伤害。之后，将你墓地中与防止的伤害的相同数量的卡放置到卡组底。
 * ●[舍弃1张白色手牌]：恢复4。将这张卡放逐。
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
