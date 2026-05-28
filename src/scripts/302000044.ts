import { Card, CardEffect } from '../types/game';
import { createSelectCardQuery, damagePlayerByEffect, getOpponentUid, isFeijingCard, moveCard, moveCardAsCost, playerTargetCandidates } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '302000044_burn',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  limitCount: 1,
  limitNameType: true,
  description: '你的主要阶段，选择1名对手，将这张卡送入墓地：舍弃最多2张菲晶手牌，每舍弃1张给予选择的对手2点伤害。',
  condition: (gameState, playerState, instance) =>
    gameState.phase === 'MAIN' &&
    playerState.isTurn &&
    instance.cardlocation === 'ITEM',
  cost: async (gameState, playerState, instance) => {
    moveCardAsCost(gameState, playerState.uid, instance, 'GRAVE', instance);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    const owner = playerState;
    const feijingHands = owner.hand.filter(isFeijingCard);
    if (feijingHands.length === 0) return;
    createSelectCardQuery(
      gameState,
      owner.uid,
      feijingHands,
      '选择舍弃菲晶',
      '选择手牌中的最多2张具有【菲晶】的卡舍弃。每舍弃1张，给予对手2点伤害。',
      0,
      Math.min(2, feijingHands.length),
      { sourceCardId: instance.gamecardId, effectId: '302000044_burn', step: 'DISCARD', ownerUid: owner.uid, targetUid: getOpponentUid(gameState, owner.uid) },
      () => 'HAND'
    );
  },
  targetSpec: {
    title: '选择对手',
    description: '选择1名对手。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['PLAYER'],
    controller: 'OPPONENT',
    step: 'PLAYER',
    getCandidates: (gameState, playerState) => {
      return playerTargetCandidates(gameState, playerState.uid, { includeSelf: false, includeOpponent: true });
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'PLAYER') {
      const owner = gameState.players[context.ownerUid || playerState.uid];
      const feijingHands = owner.hand.filter(isFeijingCard);
      const declaredTarget = context?.declaredTargets?.[0];
      const targetUid = declaredTarget?.ownerUid || getOpponentUid(gameState, owner.uid);
      createSelectCardQuery(
        gameState,
        owner.uid,
        feijingHands,
        '选择舍弃菲晶',
        '选择手牌中的最多2张具有【菲晶】的卡舍弃。每舍弃1张，给予对手2点伤害。',
        0,
        Math.min(2, feijingHands.length),
        { sourceCardId: instance.gamecardId, effectId: '302000044_burn', step: 'DISCARD', ownerUid: owner.uid, targetUid },
        () => 'HAND'
      );
      return;
    }
    if (context?.step !== 'DISCARD') return;
    const ownerUid = context.ownerUid || playerState.uid;
    const owner = gameState.players[ownerUid];
    selections.forEach(id => {
      const hand = owner.hand.find(card => card.gamecardId === id);
      if (hand) {
        moveCard(gameState, ownerUid, hand, 'GRAVE', instance);
        gameState.logs.push(`[${instance.fullName}] 舍弃了 [${hand.fullName}]。`);
      }
    });
    const targetUid = context.targetUid || getOpponentUid(gameState, ownerUid);
    if (selections.length > 0) await damagePlayerByEffect(gameState, ownerUid, targetUid, selections.length * 2, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 302000044
 * Card2 Row: 416
 * Card Row: 300
 * Source CardNo: BT05-R10
 * Package: BT05(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{你的主要阶段，选择1名对手}[将这张卡送入墓地]:舍弃手牌中的最多2张具有【菲晶】的卡，每舍弃1张，给予选择的对手2点伤害。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '302000044',
  fullName: '晶体燃爆装置',
  specialName: '',
  type: 'ITEM',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: true,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
