import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutCardOntoBattlefieldByEffect, getOpponentUid, moveCard, moveRandomGraveToDeckBottom, putCardOntoField, wealthCount } from './BaseUtil';

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
  targetSpec: {
    modeTitle: '选择阿克蒂的记录',
    modeDescription: '选择要执行的一项效果。',
    modeOptions: [{
      id: 'RECOVER_DRAW',
      label: '恢复抽牌',
      title: '恢复抽牌',
      description: '恢复2，之后抽2张卡。',
      minSelections: 0,
      maxSelections: 0,
      condition: (gameState, playerState, instance) =>
        modeEnabled(instance, gameState, 'RECOVER_DRAW') && playerState.deck.length >= 2
    }, {
      id: 'PUT_EROSION',
      label: '侵蚀登场',
      title: '选择侵蚀区卡',
      description: '选择你的侵蚀区中的1张非神蚀卡放置到战场上。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['EROSION_FRONT'],
      controller: 'SELF',
      step: 'PUT',
      condition: (gameState, playerState, instance) =>
        modeEnabled(instance, gameState, 'PUT_EROSION') && erosionPutTargets(playerState).length > 0,
      getCandidates: (_gameState, playerState) =>
        erosionPutTargets(playerState).map(card => ({ card, source: 'EROSION_FRONT' as any }))
    }, {
      id: 'OPP_RUMMAGE',
      label: '对手滤牌',
      title: '对手滤牌',
      description: '对手抽3张卡，之后舍弃3张卡。',
      minSelections: 0,
      maxSelections: 0,
      condition: (gameState, playerState, instance) =>
        modeEnabled(instance, gameState, 'OPP_RUMMAGE') &&
        gameState.players[getOpponentUid(gameState, playerState.uid)].deck.length >= 3
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    const mode = context?.modeId || context?.selectedModeId || selections[0];
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

    if (mode !== 'PUT_EROSION' && context?.step !== 'PUT') return;
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
