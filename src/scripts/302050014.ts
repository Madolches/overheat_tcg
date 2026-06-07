import { Card, GameState, PlayerState, CardEffect, GameEvent, TriggerLocation } from '../types/game';
import { EventEngine } from '../services/EventEngine';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

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

const moveAndShiftToErosionBack = (player: PlayerState, targetCard: Card) => {
  // 1. Remove from Front
  const frontIdx = player.erosionFront.findIndex(c => c?.gamecardId === targetCard.gamecardId);
  if (frontIdx !== -1) player.erosionFront[frontIdx] = null;

  // 2. State update
  targetCard.displayState = 'BACK_UPRIGHT';
  targetCard.cardlocation = 'EROSION_BACK';

  // 3. Shift Back Erosion backwards
  // Move 0->1, 1->2... 8->9. Slot 9 is overwritten if any.
  for (let i = 9; i > 0; i--) {
    player.erosionBack[i] = player.erosionBack[i - 1];
  }
  player.erosionBack[0] = targetCard;
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
  onQueryResolve: async (card, gameState, playerState, selections) => {
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

const applyContinuousRush = (gameState: GameState, card: Card) => {
  if (card.equipTargetId) {
    const target = findCardInUnitZone(gameState, card.equipTargetId);
    if (target) {
      target.isrush = true;
      if (!target.influencingEffects) target.influencingEffects = [];
      target.influencingEffects.push({
        sourceCardName: card.fullName,
        description: '赋予【速攻】效果'
      });
    } else {
      // Release equipment if target is gone
      card.equipTargetId = undefined;
    }
  }
};

const goddessTriggerEffect: CardEffect = {
  id: 'goddess_trigger',
  type: 'TRIGGER',
  triggerEvent: 'GODDESS_TRANSFORMATION' as any,
  erosionTotalLimit: [5, 7],
  description: '【诱发】：当侵蚀区为5-7时，若装备单位的攻击导致对手进入神化状态。若对手侵蚀区正面卡为1，则将其翻为背面；若为2张以上，则选择其中2张翻为背面。',
  triggerLocation: ['ITEM'],
  isMandatory: true,
  condition: (gameState, playerState, card, event) => {
    if (!event || event.type !== 'GODDESS_TRANSFORMATION') return false;

    // 2. Check if the transformed player is the opponent
    const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid);
    if (event.playerUid !== opponentUid) return false;

    // 3. Check if current phase is damage calculation (caused by attack) or just transitioned to MAIN
    if (
      gameState.phase !== 'DAMAGE_CALCULATION' &&
      gameState.phase !== 'MAIN' &&
      gameState.phase !== 'BATTLE_FREE' &&
      gameState.previousPhase !== 'BATTLE_FREE'
    ) return false;

    // 4. Check if equipped unit is in attackers
    if (!card.equipTargetId || !gameState.battleState?.attackers.includes(card.equipTargetId)) return false;

    return true;
  },
  execute: async (card, gameState, playerState) => {
    const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid)!;
    const opponent = gameState.players[opponentUid];

    const frontalCards = opponent.erosionFront.filter(c => c !== null && c.displayState === 'FRONT_UPRIGHT') as Card[];

    if (frontalCards.length === 0) {
      gameState.logs.push(`[效果] 对手侵蚀区没有正面向上的卡牌，无法发动效果。`);
      return;
    }

    if (frontalCards.length === 1) {
      const targetCard = frontalCards[0];
      moveAndShiftToErosionBack(opponent, targetCard);
      gameState.logs.push(`[效果] ${opponent.displayName} 的侵蚀卡 [${targetCard.fullName}] 已由于 ${card.fullName} 的效果移动到侵蚀区背面。`);
    } else {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: frontalCards.map(c => ({ card: c, source: 'EROSION_FRONT' as any, ownerName: opponent.displayName, isMine: false })),
        title: '选择翻面的侵蚀卡',
        description: '请选择对手侵蚀区 2 张正面卡翻为背面。',
        minSelections: 2,
        maxSelections: 2,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          sourceCardId: card.gamecardId,
          effectId: 'goddess_trigger'
        }
      };
    }
  },
  onQueryResolve: async (card, gameState, playerState, selections) => {
    const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid)!;
    const opponent = gameState.players[opponentUid];

    // Explicitly flip and move selected cards
    selections.forEach(sid => {
      const c = opponent.erosionFront.find(card => card?.gamecardId === sid);
      if (c) {
        moveAndShiftToErosionBack(opponent, c);
        gameState.logs.push(`[系统] ${opponent.displayName} 的卡片 [${c.fullName}] 移动到侵蚀区背面 (雅典娜效果)`);
      }
    });

    gameState.logs.push(`[效果] ${gameState.players[opponentUid].displayName} 的侵蚀卡已成功翻为背面。`);
  }
};

const card: Card = {
  id: '302050014',
  fullName: '武斗神姬「雅典娜」',
  specialName: '雅典娜',
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
      id: 'continuous_rush',
      type: 'CONTINUOUS',
      description: '装备此卡的单位：获得【速攻】。',
      applyContinuous: applyContinuousRush
    },
    goddessTriggerEffect
  ],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
