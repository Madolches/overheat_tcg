import { Card, CardEffect } from '../types/game';
import {
  allCardsOnField,
  createSelectCardQuery,
  destroyByEffect,
  getOpponentUid,
  isNonGodUnit,
  markCanAttackAnyUnit,
  moveCardAsCost,
  ownUnits
} from './BaseUtil';

const nonGodItemsOnField = (gameState: any) =>
  allCardsOnField(gameState).filter(card => card.type === 'ITEM' && !card.godMark);

const godmarkGraveCards = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.godMark);

const opponentNonGodUnits = (gameState: any, playerUid: string) =>
  gameState.players[getOpponentUid(gameState, playerUid)].unitZone.filter((card: Card | null): card is Card => !!card && isNonGodUnit(card));

const isMainPhaseContext = (gameState: any) =>
  gameState.phase === 'MAIN' || gameState.previousPhase === 'MAIN';

const SERNOBU_FACTION = '\u745f\u8bfa\u5e03';

const isSernobuUnit = (card: Card) => card.faction === SERNOBU_FACTION;

const cardEffects: CardEffect[] = [{
  id: '203000095_destroy_item',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description: '选择战场上的1张非神蚀道具卡，放逐你墓地中的1张神蚀卡作为费用，将被选择的卡破坏。',
  condition: (gameState, playerState) =>
    nonGodItemsOnField(gameState).length > 0 &&
    godmarkGraveCards(playerState).length > 0,
  cost: async (gameState, playerState, instance) => {
    const costs = godmarkGraveCards(playerState);
    if (costs.length === 0) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costs,
      '选择放逐费用',
      '选择墓地中的1张神蚀卡放逐作为费用。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '203000095_destroy_item',
        step: 'GODMARK_GRAVE_EXILE_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      () => 'GRAVE'
    );
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'GODMARK_GRAVE_EXILE_COST') return;
    const cost = godmarkGraveCards(playerState).find((card: Card) => card.gamecardId === selections[0]);
    if (!cost) {
      context.cancelActivation = true;
      return;
    }
    moveCardAsCost(gameState, playerState.uid, cost, 'EXILE', instance);
  },
  execute: async () => {},
  targetSpec: {
    title: '选择道具卡',
    description: '选择战场上的1张非神蚀道具卡。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['ITEM'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState =>
      nonGodItemsOnField(gameState).map(card => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections, context) => {
    if (context?.step !== 'TARGET') return;
    const target = nonGodItemsOnField(gameState).find(card => card.gamecardId === selections[0]);
    if (target) destroyByEffect(gameState, target, instance);
  }
}, {
  id: '203000095_exiled_by_resonance_attack',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  isMandatory: false,
  triggerLocation: ['EXILE'],
  description: '你的主要阶段中，墓地中的这张卡被放逐时，选择对手战场上1个非神蚀单位。本回合中，你的<瑟诺布>单位可以攻击被选择的单位。',
  condition: (gameState, playerState, instance, event) =>
    playerState.isTurn &&
    isMainPhaseContext(gameState) &&
    event?.sourceCardId === instance.gamecardId &&
    event.data?.sourceZone === 'GRAVE' &&
    event.data?.targetZone === 'EXILE' &&
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
      .filter(isSernobuUnit)
      .forEach(unit => {
        markCanAttackAnyUnit(unit, instance);
        const data = (unit as any).data || {};
        (unit as any).data = data;
        data.canAttackAnyUnitUntilTurn = gameState.turnCount;
        data.canAttackAnyUnitConsumeOnAttack = true;
      });
    playerState.markedUnitAttackTarget = target.gamecardId;
  }
}];

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
