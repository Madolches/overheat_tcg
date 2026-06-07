import { Card, GameState, PlayerState, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';

const findCardInUnitZone = (gameState: GameState, gamecardId: string): Card | undefined => {
  for (const player of Object.values(gameState.players)) {
    const found = player.unitZone.find(u => u?.gamecardId === gamecardId);
    if (found) return found;
  }
  return undefined;
};

const equip_304010038: CardEffect = {
  id: 'equip_universal',
  type: 'ACTIVATE',
  description: '【启】〔回合1次〕：在你的主要阶段，你可以选择你场上的一个单位，装备这张卡；或者解除这张卡的装备状态。',
  limitCount: 1,
  limitNameType: false,
  triggerLocation: ['ITEM'],
  condition: (gameState) => gameState.phase === 'MAIN',
  execute: async (card, gameState, playerState) => {
    if (card.equipTargetId) {
      card.equipTargetId = undefined;
      const subEffect = card.effects?.find(e => e.id === '304010038_substitution');
      if (subEffect) subEffect.substitutionFilter = undefined;
      EventEngine.recalculateContinuousEffects(gameState);
      return;
    }

    const options: any[] = [];

    const units = playerState.unitZone.filter(u => u !== null) as Card[];
    options.push(...units.map(u => ({ card: u, source: 'UNIT' as any })));

    if (options.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: options,
      title: '选择装备目标',
      description: `选择一个单位进行装备 ${card.fullName}`,
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: card.gamecardId,
        effectId: 'equip_universal'
      }
    };
  },
  onQueryResolve: async (card, gameState, playerState, selections) => {
    const selectedId = selections[0];
    const subEffect = card.effects?.find(e => e.id === '304010038_substitution');

    if (selectedId === card.gamecardId) {
      gameState.logs.push(`[效果] ${card.fullName} 已解除装备`);
      card.equipTargetId = undefined;
      // Clear substitution filter
      if (subEffect) {
        subEffect.substitutionFilter = undefined;
      }
    } else {
      card.equipTargetId = selectedId;
      const targetUnit = playerState.unitZone.find(u => u?.gamecardId === selectedId);
      gameState.logs.push(`[效果] ${card.fullName} 装备到了 ${targetUnit?.fullName || '未知单位'}`);

      // Update substitution filter to protect the host
      if (subEffect) {
        subEffect.substitutionFilter = { gamecardId: selectedId, onField: true };
      }
    }
    EventEngine.recalculateContinuousEffects(gameState);
  }
};

const applyContinuousBonus = (gameState: GameState, card: Card) => {
  if (card.equipTargetId) {
    const target = findCardInUnitZone(gameState, card.equipTargetId);
    if (target) {
    } else {
      card.equipTargetId = undefined;
      const subEffect = card.effects?.find(e => e.id === '304010038_substitution');
      if (subEffect) subEffect.substitutionFilter = undefined;
    }
  }
};

const trigger_304010038_destroy: CardEffect = {
  id: '304010038_destroy_trigger',
  type: 'TRIGGER',
  description: '当此卡被破坏时（包含代破离场），从你侵蚀前区选择一张名称含有「剑仙」的卡牌加入手牌。',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['GRAVE'],
  isMandatory: true,
  condition: (gameState, playerState, instance, event) => {
    return event?.sourceCardId === instance.gamecardId &&
      event.data?.zone === 'GRAVE' &&
      (event.data?.sourceZone === 'ITEM' || event.data?.sourceZone === 'UNIT');
  },
  execute: async (instance, gameState, playerState) => {
    const choices = playerState.erosionFront.filter(c => c && c.fullName.includes('剑仙')) as Card[];
    if (choices.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, choices.map(c => ({ card: c, source: 'EROSION_FRONT' }))),
      title: '选择「剑仙」',
      description: '请从侵蚀前区选择一张「剑仙」卡牌加入手牌。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '304010038_destroy_trigger'
      }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const targetId = selections[0];
    const target = playerState.erosionFront.find(c => c?.gamecardId === targetId);
    if (target) {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_EROSION',
        targetFilter: { gamecardId: targetId },
        destinationZone: 'HAND'
      }, instance);
      gameState.logs.push(`[${instance.fullName}] 触发：将「剑仙」卡牌回收至手牌。`);
    }
  }
};

const card: Card = {
  id: '304010038',
  fullName: '【幻剑仙影】',
  specialName: '',
  type: 'ITEM',
  isEquip: true,
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '百濑之水城',
  acValue: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [
    equip_304010038,
    {
      id: '304010038_substitution',
      type: 'CONTINUOUS',
      description: '装备此卡的单位即将被破坏时，你可以将此卡送入墓地作为代替。',
      substitutionFilter: undefined // Dynamically set when equipped
    },
    {
      id: 'continuous_bonus',
      type: 'CONTINUOUS',
      description: '装备此卡时相关逻辑处理',
      applyContinuous: applyContinuousBonus
    },
    trigger_304010038_destroy
  ],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
