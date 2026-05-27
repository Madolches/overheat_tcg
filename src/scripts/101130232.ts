import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canActivateDuringYourTurn, createSelectCardQuery, exileByEffect, getOpponentUid, isFeijingUnit, isNonGodUnit, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101130232_exile_pair',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '你的回合中，选择你的1个菲晶单位与对手1个非神蚀单位，将它们放逐。',
  condition: (gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    return canActivateDuringYourTurn(gameState, playerState) &&
      ownUnits(playerState).some(isFeijingUnit) &&
      ownUnits(opponent).some(isNonGodUnit);
  },
  execute: async (instance, gameState, playerState) => {
    const ownTargets = ownUnits(playerState).filter(isFeijingUnit);
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    const opponentTargets = ownUnits(opponent).filter(isNonGodUnit);
    if (ownTargets.length === 0 || opponentTargets.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownTargets,
      '选择我方菲晶单位',
      '选择你的1个具有【菲晶】的单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101130232_exile_pair', step: 'OWN' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    targetGroups: [{
      title: '选择我方菲晶单位',
      description: '选择你的1个具有【菲晶】的单位。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
      step: 'OWN',
      getCandidates: (_gameState, playerState) =>
        ownUnits(playerState)
          .filter(isFeijingUnit)
          .map(card => ({ card, source: 'UNIT' as any }))
    }, {
      title: '选择对手单位',
      description: '选择对手的1个非神蚀单位。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'OPPONENT',
      step: 'OPPONENT',
      getCandidates: (gameState, playerState) => {
        const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
        return ownUnits(opponent)
          .filter(isNonGodUnit)
          .map(card => ({ card, source: 'UNIT' as any }));
      }
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.declaredTargets?.length) {
      const ownTargetId = context.declaredTargets.find((target: any) => target.step === 'OWN')?.gamecardId;
      const opponentTargetId = context.declaredTargets.find((target: any) => target.step === 'OPPONENT')?.gamecardId;
      const ownTarget = ownTargetId ? AtomicEffectExecutor.findCardById(gameState, ownTargetId) : undefined;
      const opponentTarget = opponentTargetId ? AtomicEffectExecutor.findCardById(gameState, opponentTargetId) : undefined;
      if (ownTarget) exileByEffect(gameState, ownTarget, instance);
      if (opponentTarget) exileByEffect(gameState, opponentTarget, instance);
      return;
    }

    if (context?.step === 'OWN') {
      const ownTarget = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!ownTarget) return;
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      const opponentTargets = ownUnits(opponent).filter(isNonGodUnit);
      createSelectCardQuery(
        gameState,
        playerState.uid,
        opponentTargets,
        '选择对手单位',
        '选择对手的1个非神蚀单位。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '101130232_exile_pair', step: 'OPPONENT', ownTargetId: ownTarget.gamecardId },
        () => 'UNIT'
      );
      return;
    }

    if (context?.step !== 'OPPONENT') return;
    const ownTarget = AtomicEffectExecutor.findCardById(gameState, context.ownTargetId);
    const opponentTarget = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (ownTarget) exileByEffect(gameState, ownTarget, instance);
    if (opponentTarget) exileByEffect(gameState, opponentTarget, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130232
 * Card2 Row: 399
 * Card Row: 269
 * Source CardNo: BT05-W03
 * Package: BT05(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{你的回合中，选择战场上的你的1个具有【菲晶】的单位与对手的1个非神蚀单位}:将被选择的单位放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130232',
  fullName: '殿堂战甲·天兵',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '圣王国',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
