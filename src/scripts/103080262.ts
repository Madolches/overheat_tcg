import { Card, CardEffect, GameEvent } from '../types/game';
import { addInfluence, createSelectCardQuery, enteredFromHand, faceUpErosion, getOpponentUid, markAccessTapValue, moveCardAsCost, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103080262_enter_access_boost',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  description: '从手牌放置到战场时，若你的单位比对手少2个以上，将2张正面侵蚀送墓，本回合这张卡横置支付绿色卡ACCESS时可当+3。',
  condition: (gameState, playerState, instance, event?: GameEvent) => {
    if (event?.sourceCardId !== instance.gamecardId || event.data?.zone !== 'UNIT' || !enteredFromHand(instance, event)) return false;
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    return ownUnits(gameState.players[opponentUid]).length >= ownUnits(playerState).length + 2 &&
      faceUpErosion(playerState).length >= 2;
  },
  cost: async (gameState, playerState, instance) => {
    const targets = faceUpErosion(playerState);
    if (targets.length < 2) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择正面侵蚀卡',
      '选择侵蚀区中的2张正面卡送入墓地作为费用。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '103080262_enter_access_boost', step: 'COST' },
      () => 'EROSION_FRONT'
    );
    return true;
  },
  execute: async (instance, gameState) => {
    const data = (instance as any).data = (instance as any).data || {};
    data.greenAccessTapBoostTurn = gameState.turnCount;
    data.accessTapColor = 'GREEN';
    markAccessTapValue(instance, instance, 3);
    addInfluence(instance, instance, '本回合横置支付绿色卡ACCESS时可当作+3');
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'COST') return;
    selections.forEach(id => {
      const target = playerState.erosionFront.find(card => card?.gamecardId === id);
      if (target) moveCardAsCost(gameState, playerState.uid, target, 'GRAVE', instance);
    });
  }
}, {
  id: '103080262_green_access_boost_continuous',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '本回合中，这张卡横置支付绿色卡ACCESS时可当作+3。',
  applyContinuous: (gameState, instance) => {
    if (instance.cardlocation !== 'UNIT' || (instance as any).data?.greenAccessTapBoostTurn !== gameState.turnCount) return;
    (instance as any).data.accessTapColor = 'GREEN';
    markAccessTapValue(instance, instance, 3);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103080262
 * Card2 Row: 421
 * Card Row: 304
 * Source CardNo: PR05-05G
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 诱发效果，这张卡从手牌放置到战场时，若战场上你的单位比对手少两个或者以上：将侵蚀区两张正面卡送去墓地，本回合中这张卡获得以下效果：永续效果，通过横置这个单位支付绿色卡的AC值时，可以当作+3来支付。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103080262',
  fullName: '神木猎手「温蒂」',
  specialName: '温蒂',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '神木森',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
