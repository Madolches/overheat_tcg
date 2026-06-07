import { Card, GameState, PlayerState, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { standardizeChoiceOptions } from './BaseUtil';
import { canPayAccessCost, canPutItemOntoBattlefield } from './BaseUtil';

const isNonCombat = (gameState: GameState, cardId: string) => {
  const isAttacking = (gameState.battleState?.attackers || []).includes(cardId);
  const isDefending = gameState.battleState?.defender === cardId;
  return !isAttacking && !isDefending;
};

const findCardInUnitZone = (gameState: GameState, gamecardId: string): Card | undefined => {
  for (const player of Object.values(gameState.players)) {
    const found = player.unitZone.find(u => u?.gamecardId === gamecardId);
    if (found) return found;
  }
  return undefined;
};

const universalEquipEffect: CardEffect = {
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
      EventEngine.recalculateContinuousEffects(gameState);
      return;
    }

    const options: any[] = [];

    const units = playerState.unitZone.filter(u => u !== null) as Card[];
    options.push(...units.map(u => ({ card: u, source: 'UNIT' as any })));

    if (options.length === 0) {
      gameState.logs.push(`[系统] 没有可供操作的目标单位`);
      return;
    }

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
  onQueryResolve: async (card, gameState, playerState, selections, context) => {
    const selectedId = selections[0];
    if (selectedId === card.gamecardId) {
      // Unequip action
      gameState.logs.push(`[效果] ${card.fullName} 已解除装备`);
      card.equipTargetId = undefined;
    } else {
      // Equip or Re-equip action
      card.equipTargetId = selectedId;
      const targetUnit = playerState.unitZone.find(u => u?.gamecardId === selectedId);
      gameState.logs.push(`[效果] ${card.fullName} 装备到了 ${targetUnit?.fullName || '未知单位'}`);
    }
    // After equipment change, recalculate values
    EventEngine.recalculateContinuousEffects(gameState);
  }
};

const handActivationEffect: CardEffect = {
  id: 'hand_activation',
  type: 'ACTIVATE',
  description: '【启】：我方场上存在2个或以上蓝色单位。支付2费用，在手牌中发动：选择我方2个非神蚀单位（不能是战斗中的单位）返回持有者手牌。之后，将这张卡放置在战场上，并选择我方场上一个单位装备。',
  triggerLocation: ['HAND'],
  condition: (gameState, playerState, instance) => {
    const eligibleBlueUnits = playerState.unitZone.filter(u =>
      u && AtomicEffectExecutor.matchesColor(u, 'BLUE') && isNonCombat(gameState, u.gamecardId)
    );
    return eligibleBlueUnits.length >= 2 &&
      canPutItemOntoBattlefield(playerState, instance) &&
      canPayAccessCost(gameState, playerState, 2, instance.color, instance);
  },
  targetSpec: {
    title: '选择返回手牌的单位',
    description: '选择你的2个非神蚀且未参战的单位返回手牌。',
    minSelections: 2,
    maxSelections: 2,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'RETURN_UNITS',
    costTarget: true,
    getCandidates: (gameState, playerState) =>
      playerState.unitZone
        .filter((unit): unit is Card => !!unit && !unit.godMark && isNonCombat(gameState, unit.gamecardId))
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  cost: async (gameState, playerState, card) => {
    if (!canPayAccessCost(gameState, playerState, 2, card.color, card)) {
      return false;
    }
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_PAYMENT',
      playerUid: playerState.uid,
      options: [],
      title: '发动歌月: 支付费用',
      description: '请支付 2 点费用以从手牌发动效果。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'ACTIVATE_COST_RESOLVE',
      paymentCost: 2,
      paymentColor: card.color,
      context: {
        sourceCardId: card.gamecardId,
        effectId: 'hand_activation',
        step: 1
      }
    };
    return true;
  },
  execute: async () => {
    // The hand activation's practical resolution is completed during the cost flow.
  },
  onQueryResolve: async (card, gameState, playerState, selections, context) => {
    if (context.step === 1) {
      const declaredReturnIds = (context.declaredTargets || [])
        .filter((target: any) => target.step === 'RETURN_UNITS')
        .map((target: any) => target.gamecardId);
      if (declaredReturnIds.length === 2) {
        await handActivationEffect.onQueryResolve!(card, gameState, playerState, declaredReturnIds, { ...context, step: 2 });
        return;
      }

      // Step 1: After payment, select 2 units to return to hand
      const targets = playerState.unitZone.filter(u =>
        u && !u.godMark && isNonCombat(gameState, u.gamecardId)
      ) as Card[];

      if (targets.length < 2) {
        gameState.logs.push(`[系统] 符合条件的非神蚀非战斗单位不足 2 个，发动失败。`);
        context.cancelActivation = true;
        return;
      }

      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: targets.map(t => ({ card: t, source: 'UNIT' as any })),
        title: '选择返回手牌的单位',
        description: '请选择 2 个我方非神蚀且不在战斗中的单位返回手牌。',
        minSelections: 2,
        maxSelections: 2,
        callbackKey: 'ACTIVATE_COST_RESOLVE',
        context: { ...context, step: 2 }
      };
    } else if (context.step === 2) {
      // Step 2: Return units to hand, move self to field
      for (const id of selections) {
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_FIELD',
          targetFilter: { gamecardId: id },
          destinationZone: 'HAND'
        }, card);
      }

      if (!canPutItemOntoBattlefield(playerState, card)) {
        gameState.logs.push(`[系统] 场上已存在专用名为「${card.specialName || card.fullName}」的道具，${card.fullName} 无法放置到战场。`);
        context.cancelActivation = true;
        return;
      }

      // Move self to ITEM zone
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_HAND',
        targetFilter: { gamecardId: card.gamecardId },
        destinationZone: 'ITEM'
      }, card);

      // Select equip target among remaining units
      const units = playerState.unitZone.filter(u => u !== null) as Card[];

      if (units.length === 0) {
        gameState.logs.push(`[系统] ${card.fullName} 已登场，但场上没有剩余可装备的目标。`);
        card.equipTargetId = undefined;
        context.cancelActivation = true;
        return;
      }

      const choiceContext = { ...context, sourceCardId: card.gamecardId, step: 3 };

      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CHOICE',
        playerUid: playerState.uid,
        options: standardizeChoiceOptions(gameState, [
          { id: '__NO_EQUIP__', label: '不装备' },
          ...units.map(u => ({ id: u.gamecardId, label: u.fullName }))
        ], choiceContext),
        title: '是否装备',
        description: '可以选择不装备，或选择一个单位进行装备。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'ACTIVATE_COST_RESOLVE',
        context: choiceContext
      };
    } else if (context.step === 3) {
      // Step 3: Finalize equipment
      const targetId = selections[0];
      if (targetId === '__NO_EQUIP__') {
        card.equipTargetId = undefined;
        gameState.logs.push(`[效果] ${card.fullName} 进入战场，但未选择装备目标。`);
        EventEngine.recalculateContinuousEffects(gameState);
        return;
      }
      card.equipTargetId = targetId;
      const targetUnit = findCardInUnitZone(gameState, targetId);
      gameState.logs.push(`[效果] ${card.fullName} 装备到了 ${targetUnit?.fullName || '未知单位'}`);
      EventEngine.recalculateContinuousEffects(gameState);
    }
  }
};

const applyContinuousBonus = (gameState: GameState, card: Card) => {
  if (card.equipTargetId) {
    const target = findCardInUnitZone(gameState, card.equipTargetId);
    if (target) {
      target.power = (target.power || 0) + 1000;
      target.damage = (target.damage || 0) + 1;

      if (!target.influencingEffects) target.influencingEffects = [];
      target.influencingEffects.push({
        sourceCardName: card.fullName,
        description: '该卡片使其力量值增加1000，伤害值增加1'
      });
    } else {
      // Release equipment if target is gone
      gameState.logs.push(`[系统] ${card.fullName} 的装备对象已离开战场，装备已解除。`);
      card.equipTargetId = undefined;
    }
  }
};


const card: Card = {
  id: '304000019',
  fullName: '「小太刀歌月」',
  specialName: '小太刀歌月',
  type: 'ITEM',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
  faction: '无',
  acValue: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [
    universalEquipEffect,
    handActivationEffect,
    {
      id: 'continuous_bonus',
      type: 'CONTINUOUS',
      description: '装备此卡的单位：伤害+1，力量+1000。',
      applyContinuous: applyContinuousBonus
    }
  ],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
