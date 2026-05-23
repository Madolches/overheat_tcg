import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addContinuousDamage, canPutUnitOntoBattlefield, createSelectCardQuery, ownUnits, paymentCost, putUnitOntoField, totalErosionCount } from './BaseUtil';

const SHINBOKU = '神木森';

const shinbokuNonGodDeckUnits = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    card.type === 'UNIT' &&
    !card.godMark &&
    card.faction === SHINBOKU &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '303080070_awakened_units_damage',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '你的战场上的被唤醒适用的单位伤害+1。',
  applyContinuous: (gameState, instance) => {
    const owner = Object.values((gameState as any).players)
      .find((player: any) => player.itemZone.some((item: Card | null) => item?.gamecardId === instance.gamecardId));
    if (!owner) return;
    ownUnits(owner as any)
      .filter(unit => (unit as any).data?.awakenedTurn === gameState.turnCount)
      .forEach(unit => addContinuousDamage(unit, instance, 1));
  }
}, {
  id: '303080070_end_put_shinboku',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END',
  triggerLocation: ['ITEM'],
  isMandatory: false,
  description: '2~5：你的战场上有2个以上单位返回过卡组的回合结束时，支付1，将卡组中1张<神木森>非神蚀单位放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    event?.type === 'TURN_END' &&
    event.playerUid === playerState.uid &&
    instance.cardlocation === 'ITEM' &&
    totalErosionCount(playerState) >= 2 &&
    totalErosionCount(playerState) <= 5 &&
    Number((playerState as any).unitsReturnedToDeckThisTurn || 0) >= 2 &&
    shinbokuNonGodDeckUnits(playerState).length > 0,
  cost: paymentCost(1, 'GREEN'),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      shinbokuNonGodDeckUnits(playerState),
      '选择神木森单位',
      '选择卡组中1张<神木森>非神蚀单位放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '303080070_end_put_shinboku' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'DECK' || !shinbokuNonGodDeckUnits(playerState).some((card: Card) => card.gamecardId === target.gamecardId)) return;
    putUnitOntoField(gameState, playerState.uid, target, instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 303080070
 * Card2 Row: 647
 * Card Row: 529
 * Source CardNo: BT08-G10
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:你的战场上的被唤醒适用的单位〖伤害+1〗。
 * 〖2~5〗【诱】{你的战场上有2个以上单位返回过卡组的回合结束时}[〖+1〗]:将卡组中的1张<神木森>的非神蚀单位卡放置到战场上。
 */
const card: Card = {
  id: '303080070',
  fullName: '「绿野幻想」',
  specialName: '绿野幻想',
  type: 'ITEM',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '神木森',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
