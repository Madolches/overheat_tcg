import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  createChoiceQuery,
  createSelectCardQuery,
  getOpponentUid,
  markCanAttackAnyUnit,
  moveCard,
  ownUnits,
  story
} from './BaseUtil';

const anyDiscardCandidates = (playerState: any, instance: Card) =>
  playerState.hand.filter((card: Card) => card.gamecardId !== instance.gamecardId);

const blueDiscardCandidates = (playerState: any, instance: Card) =>
  anyDiscardCandidates(playerState, instance).filter((card: Card) => card.color === 'BLUE');

const markBlueUnitsCanAttackOpponentUnits = (gameState: any, playerState: any, source: Card) => {
  ownUnits(playerState)
    .filter(unit => unit.color === 'BLUE')
    .forEach(unit => {
      markCanAttackAnyUnit(unit, source);
      const data = (unit as any).data || {};
      (unit as any).data = data;
      data.canAttackAnyUnitUntilTurn = gameState.turnCount;
    });
};

const cardEffects: CardEffect[] = [story('204000115_deep_sea_fantasy', '选择1项：舍弃1张手牌，本回合中对手的卡的效果将对手的单位放置到战场上时，那些单位横置并失去所有能力，然后你可以抽2张卡；或舍弃1张蓝色手牌，本回合中你的蓝色单位可以攻击对手的单位。', async (instance, gameState, playerState) => {
  const options = [];
  if (anyDiscardCandidates(playerState, instance).length > 0) {
    options.push({ id: 'LOCK_OPPONENT_PUT_UNITS', label: '效果登场横置失能' });
  }
  if (blueDiscardCandidates(playerState, instance).length > 0) {
    options.push({ id: 'BLUE_ATTACK_UNITS', label: '蓝色单位可攻击单位' });
  }
  if (options.length === 0) return;
  createChoiceQuery(
    gameState,
    playerState.uid,
    '选择效果',
    '选择1项效果执行。',
    options,
    { sourceCardId: instance.gamecardId, effectId: '204000115_deep_sea_fantasy', step: 'MODE' }
  );
}, {
  condition: (_gameState, playerState, instance) =>
    anyDiscardCandidates(playerState, instance).length > 0,
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      const mode = selections[0];
      const candidates = mode === 'BLUE_ATTACK_UNITS'
        ? blueDiscardCandidates(playerState, instance)
        : anyDiscardCandidates(playerState, instance);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '支付舍弃费用',
        mode === 'BLUE_ATTACK_UNITS' ? '选择1张蓝色手牌舍弃。' : '选择1张手牌舍弃。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '204000115_deep_sea_fantasy', step: 'DISCARD', mode },
        () => 'HAND'
      );
      return;
    }

    if (context?.step === 'DISCARD') {
      const discarded = selections[0] ? playerState.hand.find((card: Card) => card.gamecardId === selections[0]) : undefined;
      if (!discarded) return;
      if (context.mode === 'BLUE_ATTACK_UNITS' && discarded.color !== 'BLUE') return;
      moveCard(gameState, playerState.uid, discarded, 'GRAVE', instance);

      if (context.mode === 'BLUE_ATTACK_UNITS') {
        markBlueUnitsCanAttackOpponentUnits(gameState, playerState, instance);
        return;
      }

      const opponentUid = getOpponentUid(gameState, playerState.uid);
      const opponent = gameState.players[opponentUid] as any;
      opponent.ownEffectPlacedUnitsEnterExhaustedSilencedTurn = gameState.turnCount;
      opponent.ownEffectPlacedUnitsEnterExhaustedSilencedSourceName = instance.fullName;
      opponent.ownEffectPlacedUnitsEnterExhaustedSilencedSourceCardId = instance.gamecardId;
      opponent.ownEffectPlacedUnitsEnterExhaustedSilencedControllerUid = playerState.uid;
      return;
    }

    if (context?.step === 'DRAW_CHOICE' && selections[0] === 'DRAW_TWO') {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 2 }, instance);
    }
  }
}), {
  id: '204000115_lock_draw',
  type: 'TRIGGER',
  triggerLocation: ['GRAVE', 'PLAY'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isGlobal: true,
  isMandatory: false,
  dedupeByEventDataKey: 'effectResolutionBatchKey',
  description: '深海幻想横置并失去能力后可以抽2张卡。',
  condition: (gameState, playerState, instance, event) =>
    event?.data?.targetZone === 'UNIT' &&
    event.data?.effectSourcePlayerUid === event.playerUid &&
    event.data?.effectSourceCardId &&
    event.data.effectSourceCardId !== instance.gamecardId &&
    event.sourceCard?.cardlocation === 'UNIT' &&
    (event.sourceCard as any).data?.fullEffectSilencedTurn === gameState.turnCount &&
    (event.sourceCard as any).data?.placedByOwnEffectForcedExhaustedTurn === gameState.turnCount &&
    (event.sourceCard as any).data?.fullEffectSilenceSource === instance.fullName &&
    (gameState.players[event.playerUid] as any).ownEffectPlacedUnitsEnterExhaustedSilencedControllerUid === playerState.uid,
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
      { sourceCardId: instance.gamecardId, effectId: '204000115_lock_draw', step: 'DRAW_CHOICE' }
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
 * Source CardID: 204000115
 * Card2 Row: 592
 * Card Row: 475
 * Source CardNo: BT07-04B
 * Package: PR(2017年3月)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择下列的1项效果执行：
 * ◆[舍弃1张手牌]：本回合中，对手的卡的效果将对手的单位放置到战场上时，将那些单位横置，本回合中，失去所有能力。之后，你可以抽2张卡。
 * ◆[舍弃1张蓝色手牌]：本回合中，你的蓝色单位可以攻击对手的单位。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '204000115',
  fullName: '深海幻想',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
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
