import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutCardOntoBattlefieldByEffect, createChoiceQuery, getOpponentUid, moveCard, moveRandomGraveToDeckBottom, putCardOntoField, wealthCount } from './BaseUtil';

const disableMode = (instance: Card, gameState: any, mode: string) => {
  (instance as any).data = {
    ...((instance as any).data || {}),
    disabledAketiRecordModesUntilOwnStart: {
      ...((instance as any).data?.disabledAketiRecordModesUntilOwnStart || {}),
      [mode]: AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId)
    }
  };
};

const modeEnabled = (instance: Card, gameState: any, mode: string) =>
  !((instance as any).data?.disabledAketiRecordModesUntilOwnStart || {})[mode];

const erosionPutTargets = (playerState: any) =>
  playerState.erosionFront
    .filter((card: Card | null): card is Card => !!card && !card.godMark)
    .filter((card: Card) => (card.type === 'UNIT' || card.type === 'ITEM' || card.isEquip) && canPutCardOntoBattlefieldByEffect(playerState, card));

const cardEffects: CardEffect[] = [{
  id: '204000098_record_modes',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description: '财富3以上，选择1项：恢复2后抽2；或将侵蚀区1张非神蚀卡放置到战场；或对手抽3后舍弃3。直到下一次你的回合开始失去那项效果。',
  condition: (gameState, playerState, instance) =>
    wealthCount(playerState, gameState) >= 3 &&
    (
      (modeEnabled(instance, gameState, 'RECOVER_DRAW') && playerState.deck.length >= 2) ||
      (modeEnabled(instance, gameState, 'PUT_EROSION') && erosionPutTargets(playerState).length > 0) ||
      (modeEnabled(instance, gameState, 'OPP_RUMMAGE') && gameState.players[getOpponentUid(gameState, playerState.uid)].deck.length >= 3)
    ),
  execute: async (instance, gameState, playerState) => {
    const options = [
      {
        id: 'RECOVER_DRAW',
        label: '恢复抽牌',
        disabled: !modeEnabled(instance, gameState, 'RECOVER_DRAW') || playerState.deck.length < 2,
        disabledReason: '该模式暂时失去或卡组不足'
      },
      {
        id: 'PUT_EROSION',
        label: '侵蚀登场',
        disabled: !modeEnabled(instance, gameState, 'PUT_EROSION') || erosionPutTargets(playerState).length === 0,
        disabledReason: '该模式暂时失去或没有可放置目标'
      },
      {
        id: 'OPP_RUMMAGE',
        label: '对手滤牌',
        disabled: !modeEnabled(instance, gameState, 'OPP_RUMMAGE') || gameState.players[getOpponentUid(gameState, playerState.uid)].deck.length < 3,
        disabledReason: '该模式暂时失去或对手卡组不足'
      }
    ];
    createChoiceQuery(
      gameState,
      playerState.uid,
      '选择阿克蒂的记录',
      '选择要执行的一项效果。',
      options,
      { sourceCardId: instance.gamecardId, effectId: '204000098_record_modes', step: 'MODE' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      const mode = selections[0];
      if (mode === 'RECOVER_DRAW') {
        moveRandomGraveToDeckBottom(gameState, playerState.uid, 2, instance);
        await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 2 }, instance);
        disableMode(instance, gameState, mode);
        return;
      }
      if (mode === 'OPP_RUMMAGE') {
        const opponentUid = getOpponentUid(gameState, playerState.uid);
        await AtomicEffectExecutor.execute(gameState, opponentUid, { type: 'DRAW', value: 3 }, instance);
        const opponent = gameState.players[opponentUid];
        opponent.hand.slice(0, Math.min(3, opponent.hand.length)).forEach((card: Card) => {
          moveCard(gameState, opponentUid, card, 'GRAVE', instance);
        });
        disableMode(instance, gameState, mode);
        return;
      }
      if (mode === 'PUT_EROSION') {
        const targets = erosionPutTargets(playerState);
        if (targets.length === 0) return;
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(
            gameState,
            playerState.uid,
            targets.map(card => ({ card, source: 'EROSION_FRONT' as const }))
          ),
          title: '选择侵蚀区卡',
          description: '选择你的侵蚀区中的1张非神蚀卡放置到战场上。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: { sourceCardId: instance.gamecardId, effectId: '204000098_record_modes', step: 'PUT' }
        };
        return;
      }
    }
    if (context?.step !== 'PUT') return;
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && target.cardlocation === 'EROSION_FRONT' && !target.godMark) {
      putCardOntoField(gameState, playerState.uid, target, instance);
      disableMode(instance, gameState, 'PUT_EROSION');
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 204000098
 * Card2 Row: 468
 * Card Row: 402
 * Source CardNo: BT06-B09
 * Package: BT06(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * {你的财富指示物有3个以上，选择下列的1项效果并执行，直到下一次你的回合开始时为止，你的《阿克蒂的记录》失去那项效果}：
 * ◆ 恢复2（随机将你墓地中的2张卡，将其放置到你的卡组底）。之后，抽2张卡。
 * ◆ 将你的侵蚀区中的1张非神蚀卡放置到战场上。
 * ◆ 对手抽3张卡，之后，舍弃他自己的3张手牌。
 */
const card: Card = {
  id: '204000098',
  fullName: '阿克蒂的记录',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
