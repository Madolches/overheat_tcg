import { Card, CardEffect } from '../types/game';
import { allCardsOnField, createSelectCardQuery, destroyByEffect, getOpponentUid, getResonanceExiledCard, isNonGodUnit, markCanAttackAnyUnit, moveCardAsCost, ownUnits } from './BaseUtil';

const nonGodItemsOnField = (gameState: any) =>
  allCardsOnField(gameState).filter(card => card.type === 'ITEM' && !card.godMark);

const godmarkGraveCards = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.godMark);

const opponentNonGodUnits = (gameState: any, playerUid: string) =>
  gameState.players[getOpponentUid(gameState, playerUid)].unitZone.filter((card: Card | null): card is Card => !!card && isNonGodUnit(card));

const cardEffects: CardEffect[] = [{
  id: '203000095_destroy_item',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description: '选择战场上的1张非神蚀道具卡，将你的墓地中的1张神蚀卡放逐：将被选择的卡破坏。',
  condition: (gameState, playerState) =>
    nonGodItemsOnField(gameState).length > 0 &&
    godmarkGraveCards(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodItemsOnField(gameState),
      '选择道具卡',
      '选择战场上的1张非神蚀道具卡。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '203000095_destroy_item', step: 'TARGET' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const target = nonGodItemsOnField(gameState).find(card => card.gamecardId === selections[0]);
      if (!target) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        godmarkGraveCards(playerState),
        '选择放逐费用',
        '选择墓地中的1张神蚀卡放逐作为费用。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '203000095_destroy_item', step: 'COST', targetId: target.gamecardId },
        () => 'GRAVE'
      );
      return;
    }

    if (context?.step === 'COST') {
      const cost = godmarkGraveCards(playerState).find((card: Card) => card.gamecardId === selections[0]);
      const target = nonGodItemsOnField(gameState).find(card => card.gamecardId === context.targetId);
      if (!cost || !target) return;
      moveCardAsCost(gameState, playerState.uid, cost, 'EXILE', instance);
      destroyByEffect(gameState, target, instance);
    }
  }
}, {
  id: '203000095_exiled_by_resonance_attack',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  triggerLocation: ['EXILE'],
  description: '你的主要阶段，墓地中的这张卡被共鸣放逐时，选择对手战场上1个非神蚀单位。本回合中，你的<瑟诺布>单位可以攻击被选择的单位。',
  condition: (gameState, playerState, instance, event) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    event?.sourceCardId === instance.gamecardId &&
    !!getResonanceExiledCard(event) &&
    opponentNonGodUnits(gameState, playerState.uid).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      opponentNonGodUnits(gameState, playerState.uid),
      '选择攻击目标',
      '选择对手战场上1个非神蚀单位。本回合中，你的<瑟诺布>单位可以攻击该单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '203000095_exiled_by_resonance_attack' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = opponentNonGodUnits(gameState, playerState.uid).find(card => card.gamecardId === selections[0]);
    if (!target) return;
    ownUnits(playerState)
      .filter(unit => unit.faction === '瑟诺布')
      .forEach(unit => {
        markCanAttackAnyUnit(unit, instance);
        const data = (unit as any).data || {};
        data.canAttackAnyUnitUntilTurn = gameState.turnCount;
        data.canAttackAnyUnitConsumeOnAttack = true;
      });
    playerState.markedUnitAttackTarget = target.gamecardId;
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203000095
 * Card2 Row: 456
 * Card Row: 391
 * Source CardNo: BT06-G08
 * Package: BT06(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * {选择战场上的1张非神蚀道具卡}[将你的墓地中的1张神蚀卡放逐]：将被选择的卡破坏。
 * {你的主要阶段，你的墓地中的这张卡被放逐时，选择对手的战场上的1个非神蚀单位}：本回合中，你的战场上的<瑟诺布>单位可以攻击被选择的单位。
 */
const card: Card = {
  id: '203000095',
  fullName: '银乐器咒法',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: -2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
