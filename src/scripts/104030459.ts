import { Card, CardEffect, GameEvent, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { getCurrentEffectResolutionBatchKey } from './BaseUtil';

const getErosionCount = (player: PlayerState) => {
  const front = player.erosionFront.filter(c => c !== null).length;
  const back = player.erosionBack.filter(c => c !== null).length;
  return front + back;
};

const getSwapTargets = (playerState: PlayerState, sourceCard: Card) => {
  const fieldSpecialNames = new Set(
    playerState.unitZone.filter((u): u is Card => !!u && !!u.specialName).map(u => u.specialName)
  );
  const itemSpecialNames = new Set(
    playerState.itemZone.filter((i): i is Card => !!i && !!i.specialName).map(i => i.specialName)
  );

  return playerState.erosionFront.filter((c): c is Card =>
    !!c &&
    c.displayState === 'FRONT_UPRIGHT' &&
    c.type === 'UNIT' &&
    c.faction === '冒险家公会' &&
    c.specialName !== sourceCard.specialName &&
    (!c.specialName || (!fieldSpecialNames.has(c.specialName) && !itemSpecialNames.has(c.specialName)))
  );
};

const trigger_104030459_entry_exhaust: CardEffect = {
  id: '104030459_entry_exhaust',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EROSION_TO_FIELD',
  triggerLocation: ['UNIT'],
  isMandatory: false,
  description: '【诱发】这个单位从侵蚀区正面进入战场时，你可以选择发动：横置这张卡：选择对手的1个非神蚀单位，将其横置。',
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    if (!(event?.type === 'CARD_EROSION_TO_FIELD' && event.sourceCardId === instance.gamecardId)) return false;

    const opponentId = gameState.playerIds.find(id => id !== playerState.uid)!;
    const opponent = gameState.players[opponentId];
    return opponent.unitZone.some(unit => unit && !unit.godMark);
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'ROTATE_HORIZONTAL',
      targetFilter: { gamecardId: instance.gamecardId }
    }, instance);

    const opponentId = gameState.playerIds.find(id => id !== playerState.uid)!;
    const opponent = gameState.players[opponentId];
    const targets = opponent.unitZone.filter(unit => unit && !unit.godMark) as Card[];

    if (targets.length === 0) {
      gameState.logs.push(`[${instance.fullName}] 对手没有可被横置的非神蚀单位。`);
      return;
    }

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        targets.map(card => ({ card, source: 'UNIT' as any }))
      ),
      title: '选择要横置的单位',
      description: '请选择对手的1个非神蚀单位，将其横置。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectIndex: 0,
        step: 'SELECT_TARGET'
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step !== 'SELECT_TARGET' || selections.length === 0) return;

    const targetId = selections[0];
    const target = AtomicEffectExecutor.findCardById(gameState, targetId);
    if (!target || target.godMark) {
      gameState.logs.push(`[${instance.fullName}] 目标已不合法，效果结算失败。`);
      return;
    }

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'ROTATE_HORIZONTAL',
      targetFilter: { gamecardId: targetId }
    }, instance);

    gameState.logs.push(`[${instance.fullName}] 将对手的 [${target.fullName}] 横置。`);
  }
};

const activate_104030459_swap: CardEffect = {
  id: '104030459_swap_activate',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  erosionTotalLimit: [3, 7],
  playCost: 1,
  description: '【启动】【卡名一回合一次】侵蚀区数量在3-7时，在你的回合中发动：支付1费，将这个单位放置到侵蚀区，之后选择你的侵蚀区正面1张【凯茜】以外的「冒险家公会」单位卡，放置到战场上。',
  condition: (_gameState: GameState, playerState: PlayerState, instance: Card) => {
    if (!playerState.isTurn || instance.cardlocation !== 'UNIT') return false;
    return true;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_PAYMENT',
      playerUid: playerState.uid,
      options: [],
      title: `支付 [${instance.fullName}] 的费用`,
      description: '请支付1点费用以发动效果。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      paymentCost: 1,
      paymentColor: instance.color,
      context: {
        sourceCardId: instance.gamecardId,
        effectIndex: 1,
        step: 'PAYMENT'
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step === 'PAYMENT') {
      const sourcePlayer = gameState.players[playerState.uid];
      const sourceUnitIndex = sourcePlayer.unitZone.findIndex(c => c?.gamecardId === instance.gamecardId);
      const effectResolutionBatchKey = getCurrentEffectResolutionBatchKey(gameState);
      if (sourceUnitIndex < 0) {
        gameState.logs.push(`[${instance.fullName}] 结算时已不在单位区，效果失败。`);
        return;
      }

      AtomicEffectExecutor.moveCard(
        gameState,
        playerState.uid,
        'UNIT',
        playerState.uid,
        'EROSION_FRONT',
        instance.gamecardId,
        true,
        {
          effectSourcePlayerUid: playerState.uid,
          effectSourceCardId: instance.gamecardId,
          effectResolutionBatchKey
        }
      );

      const movedSelf = sourcePlayer.erosionFront.find(c => c?.gamecardId === instance.gamecardId);
      if (movedSelf) {
        movedSelf.displayState = 'FRONT_UPRIGHT';
        movedSelf.isExhausted = false;
      }

      const validTargets = getSwapTargets(sourcePlayer, instance);
      if (validTargets.length === 0) {
        gameState.logs.push(`[${instance.fullName}] 已进入侵蚀区，但当前没有可放置到战场上的合法目标。`);
        return;
      }

      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(
          gameState,
          playerState.uid,
          validTargets.map(card => ({ card, source: 'EROSION_FRONT' as any }))
        ),
        title: '选择进入战场的单位',
        description: '请选择你侵蚀区正面1张【凯茜】以外的「冒险家公会」单位卡，将其放置到战场上。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          sourceCardId: instance.gamecardId,
          effectIndex: 1,
          step: 'SELECT_SWAP_TARGET',
          sourceUnitIndex,
          effectResolutionBatchKey
        }
      };
      return;
    }

    if (context?.step === 'SELECT_SWAP_TARGET' && selections.length > 0) {
      const targetId = selections[0];
      const sourcePlayer = gameState.players[playerState.uid];
      const targetCard = sourcePlayer.erosionFront.find(c => c?.gamecardId === targetId);

      if (!targetCard) {
        gameState.logs.push(`[${instance.fullName}] 目标已不合法，效果结算失败。`);
        return;
      }

      targetCard.isExhausted = false;
      targetCard.displayState = 'FRONT_UPRIGHT';

      AtomicEffectExecutor.moveCard(
        gameState,
        playerState.uid,
        'EROSION_FRONT',
        playerState.uid,
        'UNIT',
        targetId,
        true,
        {
          effectSourcePlayerUid: playerState.uid,
          effectSourceCardId: instance.gamecardId,
          targetIndex: context?.sourceUnitIndex,
          effectResolutionBatchKey: context?.effectResolutionBatchKey || getCurrentEffectResolutionBatchKey(gameState)
        }
      );

      gameState.logs.push(`[${instance.fullName}] 将 [${targetCard.fullName}] 从侵蚀区放置到了战场上。`);
    }
  }
};

const card: Card = {
  id: '104030459',
  gamecardId: null as any,
  fullName: '珍宝猎人【凯茜】',
  specialName: '凯茜',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { BLUE: 1 },
  faction: '冒险家公会',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    trigger_104030459_entry_exhaust,
    activate_104030459_swap
  ],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: '特殊',
  uniqueId: null,
};

export default card;
