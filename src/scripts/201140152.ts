import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createChoiceQuery, discardHandCost, moveCard, story } from './BaseUtil';

const GODDESS_CHURCH = '女神教会';
const LEGACY_GODDESS_CHURCH = '濂崇鏁欎細';

const isGoddessChurchCard = (card: Card) =>
  card.faction === GODDESS_CHURCH ||
  card.faction === LEGACY_GODDESS_CHURCH;

const faceUpErosionCards = (gameState: any) =>
  Object.values(gameState.players).flatMap((player: any) => [
    ...player.erosionFront,
    ...player.erosionBack
  ].filter((card: Card | null): card is Card =>
    !!card &&
    card.displayState !== 'FRONT_FACEDOWN' &&
    card.displayState !== 'BACK_UPRIGHT'
  ));

const modeOptions = (playerState: any) => {
  const options = [{ id: 'PROTECT', label: '不可对抗与反击保护' }];
  if (playerState.hand.some(isGoddessChurchCard)) {
    options.push({ id: 'BURY_EROSION', label: '送墓正面侵蚀卡' });
  }
  return options;
};

const applyProtection = (gameState: any, playerState: any, instance: Card) => {
  (playerState as any).uncounterableActionsTurn = gameState.turnCount;
  (playerState as any).cardEffectsCannotBeNegatedTurn = gameState.turnCount;
  (playerState as any).quickMysterySourceName = instance.fullName;
  const currentItem = gameState.currentProcessingItem as any;
  if (currentItem?.card?.gamecardId === instance.gamecardId) {
    currentItem.cannotBeNegated = true;
    currentItem.isNegated = false;
  }
};

const cardEffects: CardEffect[] = [story('201140152_quick_mystery', '选择1项：本卡不可对抗并给予本回合反击/无效保护；或舍弃女神教会手牌，将所有玩家侵蚀区正面卡送入墓地。', async (instance, gameState, playerState) => {
  createChoiceQuery(
    gameState,
    playerState.uid,
    '选择快速秘仪效果',
    '选择1项效果执行。',
    modeOptions(playerState),
    { sourceCardId: instance.gamecardId, effectId: '201140152_quick_mystery', step: 'MODE' }
  );
}, {
  condition: () => true,
  targetSpec: {
    modeOptions: [{
      id: 'PROTECT',
      label: '不可对抗与反击保护',
      title: '不可对抗与反击保护',
      description: '对手不能对抗这张卡；本回合中你的使用和效果不会被反击或无效。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: 'PROTECT',
      getCandidates: () => []
    }, {
      id: 'BURY_EROSION',
      label: '送墓正面侵蚀卡',
      title: '送墓正面侵蚀卡',
      description: '舍弃1张<女神教会>手牌，将所有玩家侵蚀区中的所有正面卡送入墓地。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: 'BURY_EROSION',
      condition: (_gameState, playerState) => playerState.hand.some(isGoddessChurchCard),
      getCandidates: () => []
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    const mode = context?.selectedModeId || context?.modeId || selections[0];
    if (mode === 'PROTECT') {
      applyProtection(gameState, playerState, instance);
      return;
    }
    if (mode !== 'BURY_EROSION') return;

    const cost = discardHandCost(1, isGoddessChurchCard);
    if (!cost || !(await cost(gameState, playerState, instance))) return;
    if (gameState.pendingQuery) {
      gameState.pendingQuery.callbackKey = 'ACTIVATE_COST_RESOLVE';
      gameState.pendingQuery.context = {
        ...gameState.pendingQuery.context,
        sourceCardId: instance.gamecardId,
        effectIndex: 0,
        activationPlayerUid: playerState.uid,
        step: 'BURY_EROSION_AFTER_COST',
        skipFinalizeAfterCost: true,
        resumeStackAfterCost: true
      };
      return;
    }
  },
  onCostResolve: async (instance, gameState, _playerState, _selections, context) => {
    if (context?.step !== 'BURY_EROSION_AFTER_COST') return;
    for (const target of faceUpErosionCards(gameState)) {
      const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId);
      if (ownerUid) moveCard(gameState, ownerUid, target, 'GRAVE', instance);
    }
  }
})];

const card: Card = {
  id: '201140152',
  fullName: '快速秘仪',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '女神教会',
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
