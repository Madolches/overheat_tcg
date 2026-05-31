import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addContinuousDamage, addContinuousPower, addInfluence, createSelectCardQuery, faceUpErosion, moveCard, ownUnits, preventNextDestroy } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101150208_exile_boost',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '放逐区15张以上：你的所有单位伤害+1、力量+500并获得【神依】。',
  condition: (_gameState, playerState) => playerState.exile.length >= 15,
  applyContinuous: (gameState, instance) => {
    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId);
    if (!ownerUid) return;
    ownUnits(gameState.players[ownerUid]).forEach(unit => {
      addContinuousDamage(unit, instance, 1);
      addContinuousPower(unit, instance, 500);
      unit.isShenyi = true;
      addInfluence(unit, instance, '获得【神依】');
    });
  }
}, {
  id: '101150208_prevent_battle_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  erosionTotalLimit: [4, 9],
  description: '4~9，1回合1次，对手回合：选择3张正面侵蚀放逐。之后选择你的1个单位，本回合下一次将被战斗破坏时防止。',
  condition: (_gameState, playerState) => !playerState.isTurn && faceUpErosion(playerState).length >= 3 && ownUnits(playerState).length > 0,
  targetSpec: {
    targetGroups: [{
      title: '选择放逐的侵蚀卡',
      description: '选择你的侵蚀区的3张正面卡，将其放逐。',
      minSelections: 3,
      maxSelections: 3,
      zones: ['EROSION_FRONT'],
      controller: 'SELF',
      step: 'EXILE',
      getCandidates: (_gameState, playerState) =>
        faceUpErosion(playerState).map(card => ({ card, source: 'EROSION_FRONT' as any }))
    }, {
      title: '选择防止破坏的单位',
      description: '选择你的1个单位，本回合中下一次将要被战斗破坏时防止那次破坏。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
      step: 'TARGET',
      getCandidates: (_gameState, playerState) =>
        ownUnits(playerState).map(card => ({ card, source: 'UNIT' as any }))
    }]
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      faceUpErosion(playerState),
      '选择放逐的侵蚀卡',
      '选择你的侵蚀区的3张正面卡，将其放逐。',
      3,
      3,
      { sourceCardId: instance.gamecardId, effectId: '101150208_prevent_battle_destroy', step: 'EXILE' },
      () => 'EROSION_FRONT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    const declaredTargets = context?.declaredTargets || [];
    if (declaredTargets.length >= 4) {
      const erosionTargets = declaredTargets
        .filter((target: any) => target.step === 'EXILE')
        .map((target: any) => target.gamecardId);
      const preventTargetId = declaredTargets.find((target: any) => target.step === 'TARGET')?.gamecardId;
      if (erosionTargets.length !== 3 || !preventTargetId) return;
      erosionTargets.forEach(id => {
        const card = playerState.erosionFront.find(candidate => candidate?.gamecardId === id);
        if (card) moveCard(gameState, playerState.uid, card, 'EXILE', instance);
      });
      const target = AtomicEffectExecutor.findCardById(gameState, preventTargetId);
      if (target?.cardlocation === 'UNIT') preventNextDestroy(target, instance, gameState.turnCount);
      return;
    }

    if (context?.step === 'TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target?.cardlocation === 'UNIT') preventNextDestroy(target, instance, gameState.turnCount);
      return;
    }
    selections.forEach(id => {
      const card = playerState.erosionFront.find(candidate => candidate?.gamecardId === id);
      if (card) moveCard(gameState, playerState.uid, card, 'EXILE', instance);
    });
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState),
      '选择防止破坏的单位',
      '选择你的1个单位，本回合中下一次将要被战斗破坏时防止那次破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101150208_prevent_battle_destroy', step: 'TARGET' },
      () => 'UNIT'
    );
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101150208
 * Card2 Row: 234
 * Card Row: 234
 * Source CardNo: BT03-W09
 * Package: BT03(SR,ESR,OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:若你的放逐区的卡有15张以上，你所有的单位〖伤害+1〗〖力量+500〗并获得【神依】。
 * 〖4~9〗【启】〖1回合1次〗:对手的回合中才可以发动。选择你的侵蚀区的3张正面卡，将其放逐。之后，选择你的1个单位，本回合中，那个单位下一次将要被战斗破坏时，防止那次破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101150208',
  fullName: '神谕的巫女「妮可拉丝」',
  specialName: '妮可拉丝',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '仙雪原',
  acValue: 2,
  power: 500,
  basePower: 500,
  damage: 0,
  baseDamage: 0,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isShenyi: false,
  baseShenyi: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
