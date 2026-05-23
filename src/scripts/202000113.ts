import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  canPutUnitOntoBattlefield,
  createChoiceQuery,
  createSelectCardQuery,
  moveCard,
  putUnitOntoField,
  story
} from './BaseUtil';

const anyDiscardCandidates = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId);

const redDiscardCandidates = (playerState: any, instance: Card) =>
  anyDiscardCandidates(playerState, instance).filter((card: Card) => card.color === 'RED');

const redReviveTargets = (playerState: any) =>
  playerState.grave.filter((card: Card) =>
    card.type === 'UNIT' &&
    card.color === 'RED' &&
    !card.godMark &&
    (card.power ?? card.basePower ?? 0) <= 2500 &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [story('202000113_snow_fantasy', '选择1项：舍弃1张手牌，本回合中对手的卡的效果将自己墓地的卡放置到卡组时改为放逐，并给予等量伤害；或舍弃1张红色手牌，将墓地中1张力量2500以下红色非神蚀单位放置到战场。', async (instance, gameState, playerState) => {
  const options = [];
  if (anyDiscardCandidates(playerState, instance).length > 0) {
    options.push({ id: 'REPLACE_GRAVE_TO_DECK', label: '墓地回卡组改为放逐' });
  }
  if (redDiscardCandidates(playerState, instance).length > 0 && redReviveTargets(playerState).length > 0) {
    options.push({ id: 'REVIVE_RED', label: '复活红色单位' });
  }
  if (options.length === 0) return;
  createChoiceQuery(
    gameState,
    playerState.uid,
    '选择效果',
    '选择1项效果执行。',
    options,
    { sourceCardId: instance.gamecardId, effectId: '202000113_snow_fantasy', step: 'MODE' }
  );
}, {
  condition: (_gameState, playerState, instance) =>
    anyDiscardCandidates(playerState, instance).length > 0 &&
    (
      anyDiscardCandidates(playerState, instance).length > 0 ||
      (redDiscardCandidates(playerState, instance).length > 0 && redReviveTargets(playerState).length > 0)
    ),
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      const mode = selections[0];
      const candidates = mode === 'REVIVE_RED'
        ? redDiscardCandidates(playerState, instance)
        : anyDiscardCandidates(playerState, instance);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '支付舍弃费用',
        mode === 'REVIVE_RED' ? '选择1张红色手牌舍弃。' : '选择1张手牌舍弃。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '202000113_snow_fantasy', step: 'DISCARD', mode },
        () => 'HAND'
      );
      return;
    }

    if (context?.step === 'DISCARD') {
      const discarded = selections[0] ? playerState.hand.find((card: Card) => card.gamecardId === selections[0]) : undefined;
      if (!discarded) return;
      if (context.mode === 'REVIVE_RED' && discarded.color !== 'RED') return;
      moveCard(gameState, playerState.uid, discarded, 'GRAVE', instance);

      if (context.mode === 'REPLACE_GRAVE_TO_DECK') {
        const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid);
        if (!opponentUid) return;
        const opponent = gameState.players[opponentUid] as any;
        opponent.replaceOwnGraveToDeckWithExileTurn = gameState.turnCount;
        opponent.replaceOwnGraveToDeckWithExileSourceName = instance.fullName;
        opponent.replaceOwnGraveToDeckWithExileSourceCardId = instance.gamecardId;
        opponent.replaceOwnGraveToDeckWithExileControllerUid = playerState.uid;
        return;
      }

      const targets = redReviveTargets(playerState);
      if (targets.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        targets,
        '选择复活单位',
        '选择你墓地中的1张力量2500以下红色非神蚀单位。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '202000113_snow_fantasy', step: 'REVIVE' },
        () => 'GRAVE'
      );
      return;
    }

    if (context?.step === 'REVIVE') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target && redReviveTargets(playerState).some((card: Card) => card.gamecardId === target.gamecardId)) {
        putUnitOntoField(gameState, playerState.uid, target, instance);
      }
    }
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202000113
 * Card2 Row: 589
 * Card Row: 473
 * Source CardNo: BT07-01R
 * Package: PR(2017年3月)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择下列的1项效果执行：
 * ◆[舍弃1张手牌]：本回合中，对手的卡的效果将要将他墓地中的卡放置到卡组时，改为将那些卡放逐。之后，给予对手被放逐的卡的数量的伤害。
 * ◆[舍弃1张红色手牌]：将你墓地中的1张〖力量2500〗以下的红色非神蚀单位卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202000113',
  fullName: '雪的幻想',
  specialName: '',
  type: 'STORY',
  color: 'RED',
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
