import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  addTempKeyword,
  addTempPowerUntilEndOfTurn,
  allUnitsOnField,
  createChoiceQuery,
  createSelectCardQuery,
  moveCardAsCost,
  story
} from './BaseUtil';

const MODE_PROTECT = 'PROTECT_DESTROY_DRAW';
const MODE_BOOST = 'BOOST_GREEN';

const selectedModeFromContext = (context?: any) =>
  context?.declaredModeId ||
  context?.selectedModeId ||
  context?.modeId ||
  context?.declaredTargets?.[0]?.modeId ||
  context?.declaredTargets?.declaredModeId;

const anyDiscardCandidates = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId);

const greenDiscardCandidates = (playerState: any, instance: Card) =>
  anyDiscardCandidates(playerState, instance).filter((card: Card) => card.color === 'GREEN');

const discardCandidatesForMode = (playerState: any, instance: Card, mode: string) =>
  mode === MODE_BOOST ? greenDiscardCandidates(playerState, instance) : anyDiscardCandidates(playerState, instance);

const openDiscardCostQuery = (gameState: any, playerState: any, instance: Card, mode: string) => {
  const candidates = discardCandidatesForMode(playerState, instance, mode);
  if (candidates.length === 0) return false;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    candidates,
    '支付舍弃费用',
    mode === MODE_BOOST ? '选择1张绿色手牌舍弃，作为发动费用。' : '选择1张手牌舍弃，作为发动费用。',
    1,
    1,
    {
      sourceCardId: instance.gamecardId,
      effectId: '203000116_conveyed_thoughts',
      step: 'DISCARD_COST',
      mode,
      skipEffectResolveAfterCost: true
    },
    () => 'HAND'
  );
  return !!gameState.pendingQuery;
};

const cardEffects: CardEffect[] = [story('203000116_conveyed_thoughts', '选择1项：舍弃1张手牌，本回合中你的单位将被对手的卡的效果破坏时防止那次破坏，然后你可以抽2张卡；或选择战场上的1个单位，舍弃1张绿色手牌，那个单位本回合力量+500并获得歼灭。', async (instance, gameState, playerState) => {
  const options = [];
  if (anyDiscardCandidates(playerState, instance).length > 0) {
    options.push({ id: 'PROTECT_DESTROY_DRAW', label: '防止效果破坏并抽卡' });
  }
  if (greenDiscardCandidates(playerState, instance).length > 0 && allUnitsOnField(gameState).length > 0) {
    options.push({ id: 'BOOST_GREEN', label: '力量+500并获得歼灭' });
  }
  if (options.length === 0) return;
  createChoiceQuery(
    gameState,
    playerState.uid,
    '选择效果',
    '选择1项效果执行。',
    options,
    { sourceCardId: instance.gamecardId, effectId: '203000116_conveyed_thoughts', step: 'MODE' }
  );
}, {
  condition: (gameState, playerState, instance) =>
    anyDiscardCandidates(playerState, instance).length > 0 ||
    (greenDiscardCandidates(playerState, instance).length > 0 && allUnitsOnField(gameState).length > 0),
  targetSpec: {
    modeTitle: '选择效果',
    modeDescription: '选择1项效果并指定对象。',
    modeOptions: [{
      id: MODE_PROTECT,
      label: '防止效果破坏并抽卡',
      title: '确认防止破坏',
      description: '舍弃1张手牌，本回合中你的单位将被对手的卡的效果破坏时防止那次破坏。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: 'PROTECT_DESTROY_DRAW',
      condition: (_gameState, playerState, instance) => anyDiscardCandidates(playerState, instance).length > 0,
      getCandidates: () => [] as any[]
    }, {
      id: MODE_BOOST,
      label: '力量+500并获得歼灭',
      title: '选择单位',
      description: '选择战场上的1个单位。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'ANY',
      step: 'TARGET',
      condition: (gameState, playerState, instance) =>
        greenDiscardCandidates(playerState, instance).length > 0 &&
        allUnitsOnField(gameState).length > 0,
      getCandidates: gameState =>
        allUnitsOnField(gameState).map(card => ({ card, source: 'UNIT' as any }))
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
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'DRAW_CHOICE') {
      if (selections[0] === 'DRAW_TWO') {
        await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 2 }, instance);
      }
      return;
    }

    const mode = selectedModeFromContext(context);

    if (mode === MODE_BOOST) {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target?.cardlocation === 'UNIT') {
        addTempPowerUntilEndOfTurn(target, instance, 500, gameState);
        addTempKeyword(target, instance, 'annihilation');
      }
      return;
    }

    if (mode !== MODE_PROTECT) return;

    const player = playerState as any;
    player.preventOwnUnitsOpponentEffectDestroyTurn = gameState.turnCount;
    player.preventOwnUnitsOpponentEffectDestroySourceName = instance.fullName;
    player.preventOwnUnitsOpponentEffectDestroySourceCardId = instance.gamecardId;
    player.preventOwnUnitsOpponentEffectDestroyControllerUid = playerState.uid;
    return;
  }
}), {
  id: '203000116_prevented_destroy_draw',
  type: 'TRIGGER',
  triggerLocation: ['GRAVE', 'PLAY'],
  triggerEvent: 'CARD_EFFECT_DESTROY_PREVENTED',
  isGlobal: true,
  isMandatory: false,
  description: '传达的思念防止破坏后可以抽2张卡。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.playerUid === playerState.uid,
  execute: async (instance, gameState, playerState) => {
    createChoiceQuery(
      gameState,
      playerState.uid,
      '抽卡选择',
      '是否抽2张卡？',
      [
        { id: 'DRAW_TWO', label: '抽2张卡' },
        { id: 'NO_DRAW', label: '不抽' }
      ],
      { sourceCardId: instance.gamecardId, effectId: '203000116_conveyed_thoughts', step: 'DRAW_CHOICE' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'DRAW_CHOICE' && selections[0] === 'DRAW_TWO') {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 2 }, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203000116
 * Card2 Row: 593
 * Card Row: 476
 * Source CardNo: BT07-05G
 * Package: PR(2017年3月)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择下列的1项效果执行：
 * ◆[舍弃1张手牌]：本回合中，你的单位将要被对手的卡的效果破坏时，防止那次破坏。之后，你可以抽2张卡。
 * ◆{选择战场上的1个单位}[舍弃1张绿色手牌]：被选择的单位本回合中〖力量+500〗，获得歼灭。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '203000116',
  fullName: '传达的思念',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
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
