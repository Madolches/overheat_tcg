import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  isAlchemyCard,
  isFeijingUnit,
  moveCardAsCost,
  putUnitOntoField
} from './BaseUtil';

const enteredFromDeckByEffect = (instance: Card, gameState: any) =>
  (instance as any).data?.lastMovedFromZone === 'DECK' &&
  (instance as any).data?.lastMovedToZone === 'UNIT' &&
  (instance as any).data?.lastMovedByEffectTurn === gameState.turnCount;

const enteredFromDeckByAlchemy = (instance: Card, gameState: any) =>
  (instance as any).data?.enteredFromDeckByAlchemyTurn === gameState.turnCount ||
  (
    enteredFromDeckByEffect(instance, gameState) &&
    !!AtomicEffectExecutor.findCardById(gameState, (instance as any).data?.lastMoveEffectSourceCardId)?.fullName?.includes('炼金')
  );

const wasSentToGraveByAlchemyThisTurn = (gameState: any, card: Card) => {
  const data = (card as any).data || {};
  if (data.sentToGraveFromFieldByEffectTurn !== gameState.turnCount) return false;
  const source = AtomicEffectExecutor.findCardById(gameState, data.sentToGraveFromFieldByEffectSourceCardId);
  return !!source && isAlchemyCard(source);
};

const getPowerCostCandidates = (gameState: any, playerState: any) =>
  playerState.grave.filter((card: Card) =>
    isFeijingUnit(card) &&
    wasSentToGraveByAlchemyThisTurn(gameState, card)
  );

const getSameNameDeckCandidates = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    card.id === '105000353' &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const effect_105000353_alchemy_power: CardEffect = {
  id: '105000353_alchemy_power',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE' as any,
  description: '由卡名含有《炼金》的卡的效果从卡组进入战场时，放逐本回合因炼金效果送墓的1张菲晶单位：这张卡力量变为3000。',
  condition: (gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    event?.sourceCardId === instance.gamecardId &&
    event?.data?.zone === 'UNIT' &&
    enteredFromDeckByAlchemy(instance, gameState) &&
    getPowerCostCandidates(gameState, playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      getPowerCostCandidates(gameState, playerState),
      '选择炼金费用',
      '选择墓地中1张本回合因炼金效果送墓的菲晶单位放逐。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000353_alchemy_power', step: 'EXILE_COST' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'EXILE_COST') return;
    const selected = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!selected || !getPowerCostCandidates(gameState, playerState).some(card => card.gamecardId === selected.gamecardId)) return;
    moveCardAsCost(gameState, playerState.uid, selected, 'EXILE', instance);
    const liveSelf = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (!liveSelf) return;
    liveSelf.basePower = 3000;
    liveSelf.power = 3000;
  }
};

const effect_105000353_chain_copy: CardEffect = {
  id: '105000353_chain_copy',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE' as any,
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次，由卡效果从卡组进入战场时，将卡组1张《炼金晶片妖》以横置状态放置到战场。',
  condition: (gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    event?.sourceCardId === instance.gamecardId &&
    event?.data?.zone === 'UNIT' &&
    enteredFromDeckByEffect(instance, gameState) &&
    getSameNameDeckCandidates(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    const target = getSameNameDeckCandidates(playerState)[0];
    if (!target) return;
    if (!putUnitOntoField(gameState, playerState.uid, target, instance, { exhausted: true })) return;
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

const card: Card = {
  id: '105000353',
  fullName: '炼金晶片妖',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  baseColorReq: {},
  faction: '无',
  acValue: 2,
  baseAcValue: 2,
  power: 500,
  basePower: 500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  baseGodMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: true,
  canResetCount: 0,
  effects: [effect_105000353_alchemy_power, effect_105000353_chain_copy],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
