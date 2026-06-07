import { Card, GameState, PlayerState, CardEffect, TriggerLocation } from '../types/game';
import { EventEngine } from '../services/EventEngine';

const getErosionCount = (player: PlayerState) => {
  const front = player.erosionFront.filter(c => c !== null).length;
  const back = player.erosionBack.filter(c => c !== null).length;
  return front + back;
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
      gameState.logs.push(`[效果] ${card.fullName} 已解除装备`);
      card.equipTargetId = undefined;
    } else {
      card.equipTargetId = selectedId;
      const targetUnit = playerState.unitZone.find(u => u?.gamecardId === selectedId);
      gameState.logs.push(`[效果] ${card.fullName} 装备到了 ${targetUnit?.fullName || '未知单位'}`);
    }
    EventEngine.recalculateContinuousEffects(gameState);
  }
};

const applyContinuousBonus = (gameState: GameState, card: Card) => {
  const target = findCardInUnitZone(gameState, card.equipTargetId);

  if (target) {
    target.power = (target.power || 0) + 1000;
    target.damage = (target.damage || 0) + 1;

    if (!target.influencingEffects) target.influencingEffects = [];
    target.influencingEffects.push({
      sourceCardName: card.fullName,
      description: '力量+1000，伤害+1'
    });
  } else {
      if (card.equipTargetId) {
        console.log(`[Scadi] Target ${card.equipTargetId} not found in unit zone, releasing equipment`);
        card.equipTargetId = undefined;
      }
  }
};

const applyDefenseRestriction = (gameState: GameState, card: Card) => {
  const target = findCardInUnitZone(gameState, card.equipTargetId);
  if (!target) return;

  const playerUid = Object.keys(gameState.players).find(uid =>
    gameState.players[uid].itemZone.some(c => c?.gamecardId === card.gamecardId)
  );
  if (!playerUid) return;

  const battleState = gameState.battleState;
  if (
    battleState &&
    Array.isArray(battleState.attackers) &&
    card.equipTargetId &&
    battleState.attackers.includes(card.equipTargetId) &&
    !battleState.isAlliance
  ) {
    const currentRestriction = battleState.defensePowerRestriction || 0;
    battleState.defensePowerRestriction = Math.max(currentRestriction, 2500);

    target.influencingEffects = target.influencingEffects || [];
    target.influencingEffects.push({
      sourceCardName: card.fullName,
      description: '对方不能使用力量值低于 2500 的单位防御此攻击'
    });
  }
};

const card: Card = {
  id: '302050013',
  fullName: '武斗神姬「史嘉蒂」',
  specialName: '史嘉蒂',
  type: 'ITEM',
  isEquip: true,
  color: 'RED',
  gamecardId: null as any,
  colorReq: { 'RED': 1 },
  faction: '伊列宇王国',
  acValue: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [
    universalEquipEffect,
    {
      id: 'continuous_bonus',
      type: 'CONTINUOUS',
      description: '装备此卡的单位：伤害+1，力量+1000。',
      applyContinuous: applyContinuousBonus
    },
    {
      id: 'continuous_defense_restriction',
      type: 'CONTINUOUS',
      erosionTotalLimit: [5, 7],
      description: '侵蚀区处于5-7时，对手不能用力量值低于2500的单位防御装备此卡单位的攻击（联军时，若联军其他单位可被防御则失效）。',
      applyContinuous: applyDefenseRestriction
    }
  ],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
