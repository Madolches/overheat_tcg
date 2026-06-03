import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  addTempKeyword,
  addTempPower,
  allCardsOnField,
  canActivateDefaultTiming,
  createSelectCardQuery,
  destroyByEffect,
  isFeijingUnit,
  moveCard
} from './BaseUtil';

const wasPlacedByBlueprintThisTurn = (instance: Card, gameState: any) =>
  (instance as any).data?.placedByBlueprintEffectTurn === gameState.turnCount ||
  ((instance as any).data?.lastMovedFromZone === 'DECK' &&
    (instance as any).data?.lastMovedByEffectTurn === gameState.turnCount &&
    !!AtomicEffectExecutor.findCardById(gameState, (instance as any).data?.lastMoveEffectSourceCardId)?.fullName?.includes('蓝图'));

const effect_105110351_blueprint_destroy: CardEffect = {
  id: '105110351_blueprint_destroy',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE' as any,
  isMandatory: true,
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次，这个单位由于卡名含有《蓝图》的卡的效果进入战场时，选择战场1张非神蚀卡破坏。',
  condition: (gameState, _playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    event?.sourceCardId === instance.gamecardId &&
    event?.data?.zone === 'UNIT' &&
    wasPlacedByBlueprintThisTurn(instance, gameState) &&
    allCardsOnField(gameState).some(card => !card.godMark),
  execute: async (instance, gameState, playerState) => {
    const candidates = allCardsOnField(gameState).filter(card => !card.godMark);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择破坏对象',
      '选择战场上的1张非神蚀卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110351_blueprint_destroy', step: 'DESTROY' },
      card => card.cardlocation as any
    );
  },
  targetSpec: {
    title: '选择破坏对象',
    description: '选择战场上的1张非神蚀卡破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'ANY',
    step: 'DESTROY',
    getCandidates: gameState =>
      allCardsOnField(gameState)
        .filter(card => !card.godMark)
        .map(card => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections, context) => {
    if (context?.step !== 'DESTROY') return;
    const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    const ownerUid = target ? AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) : undefined;
    if (!target || !ownerUid || target.godMark || (target.cardlocation !== 'UNIT' && target.cardlocation !== 'ITEM')) return;
    destroyByEffect(gameState, target, instance);
  }
};

const effect_105110351_destroy_boost: CardEffect = {
  id: '105110351_destroy_boost',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次，选择你的战场1张道具卡或具有【菲晶】的单位破坏。之后本回合这张卡力量+1000并获得【歼灭】。',
  condition: (gameState, playerState, instance) =>
    canActivateDefaultTiming(gameState, playerState) &&
    playerState.unitZone.concat(playerState.itemZone).some(card =>
      !!card &&
      card.gamecardId !== instance.gamecardId &&
      (card.cardlocation === 'ITEM' || isFeijingUnit(card))
    ),
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.unitZone.concat(playerState.itemZone).filter((card): card is Card =>
      !!card &&
      card.gamecardId !== instance.gamecardId &&
      (card.cardlocation === 'ITEM' || isFeijingUnit(card))
    );
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择破坏费用',
      '选择你的战场上的1张道具卡或具有【菲晶】的单位破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110351_destroy_boost', step: 'DESTROY_COST' }
    );
  },
  targetSpec: {
    title: '选择破坏费用',
    description: '选择你的战场上的1张道具卡或具有【菲晶】的单位破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'SELF',
    step: 'DESTROY_COST',
    getCandidates: (_gameState, playerState, instance) =>
      playerState.unitZone.concat(playerState.itemZone)
        .filter((card): card is Card =>
          !!card &&
          card.gamecardId !== instance.gamecardId &&
          (card.cardlocation === 'ITEM' || isFeijingUnit(card))
        )
        .map(card => ({ card, source: card.cardlocation as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'DESTROY_COST') return;
    const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (
      !target ||
      AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) !== playerState.uid ||
      (target.cardlocation !== 'ITEM' && !isFeijingUnit(target))
    ) {
      return;
    }
    if (!destroyByEffect(gameState, target, instance)) return;
    const liveSelf = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (!liveSelf || liveSelf.cardlocation !== 'UNIT') return;
    addTempPower(liveSelf, instance, 1000);
    addTempKeyword(liveSelf, instance, 'annihilation');
  }
};

const card: Card = {
  id: '105110351',
  fullName: '钢兵·「瓦尔基里」',
  specialName: '瓦尔基里',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  baseColorReq: { YELLOW: 1 },
  faction: '学院要塞',
  acValue: 4,
  baseAcValue: 4,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  baseGodMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: false,
  baseAnnihilation: false,
  isHeroic: true,
  baseHeroic: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105110351_blueprint_destroy, effect_105110351_destroy_boost],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
