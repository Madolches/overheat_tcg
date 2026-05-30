import { Card, GameState, PlayerState, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { paymentCost } from './BaseUtil';

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

const triggerSearchEffect: CardEffect = {
  id: 'wen_search_from_erosion',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EROSION_TO_FIELD',
  description: '【诱发】这个单位从侵蚀区进入单位区时，你可以发动：将这个单位横置，并从你的卡组中选择一张「冒险家公会」道具卡加入手牌，随后洗牌。',
  isMandatory: false,
  condition: (_gameState, _playerState, instance, event) => {
    return event?.sourceCardId === instance.gamecardId;
  },
  execute: async (instance, gameState, playerState) => {
    const itemOptions = playerState.deck.filter(c =>
      c.type === 'ITEM' && c.faction === '冒险家公会'
    );

    if (itemOptions.length === 0) {
      gameState.logs.push(`[${instance.fullName}] 卡组中没有「冒险家公会」道具卡。`);
      return;
    }

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        itemOptions.map(c => ({ card: c, source: 'DECK' as any }))
      ),
      title: '检索「冒险家公会」道具',
      description: '发动效果：将此单位横置，并从卡组中选择一张「冒险家公会」道具卡加入手牌。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectIndex: 0,
        step: 1
      }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const targetId = selections[0];

    instance.isExhausted = true;

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_DECK',
      targetFilter: { gamecardId: targetId },
      destinationZone: 'HAND'
    }, instance);

    gameState.logs.push(`[${instance.fullName}] 横置了自身，并将卡牌从卡组加入了手牌。`);

    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

const activateSwapEffect: CardEffect = {
  id: 'wen_swap_activate',
  type: 'ACTIVATE',
  limitCount: 1,
  limitNameType: true,
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [3, 7],
  description: '【启动】【同名回合一次】侵蚀区处于3-7张且在你的回合，支付1费，将这个单位正面表示置入侵蚀前区。之后选择你侵蚀前区一张「文」以外的「冒险家公会」单位卡，将其放置进入单位区。',
  condition: (_gameState, playerState, instance) => {
    if (!playerState.isTurn || instance.cardlocation !== 'UNIT') return false;
    return getSwapTargets(playerState, instance).length > 0;
  },
  cost: paymentCost(1, 'BLUE'),
  execute: async (card, gameState, playerState) => {
    const sourcePlayer = gameState.players[playerState.uid];
    const sourceUnitIndex = sourcePlayer.unitZone.findIndex(c => c?.gamecardId === card.gamecardId);
    if (sourceUnitIndex < 0) {
      gameState.logs.push(`[${card.fullName}] 结算时已不在单位区，效果失败。`);
      return;
    }

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_FIELD',
      destinationZone: 'EROSION_FRONT',
      targetFilter: { gamecardId: card.gamecardId }
    }, card);

    const movedSelf = sourcePlayer.erosionFront.find(c => c?.gamecardId === card.gamecardId);
    if (movedSelf) {
      movedSelf.displayState = 'FRONT_UPRIGHT';
    }

    const validTargets = getSwapTargets(sourcePlayer, card);
    if (validTargets.length === 0) {
      gameState.logs.push(`[${card.fullName}] 已正面进入侵蚀前区，但当前没有可放置到单位区的合法目标。`);
      return;
    }

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        validTargets.map(u => ({ card: u, source: 'EROSION_FRONT' as any }))
      ),
      title: '选择侵蚀卡进入战场',
      description: '请选择一张侵蚀前区正面表示的「冒险家公会」单位（非文），其将进入战场。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: card.gamecardId,
        effectIndex: 1,
        step: 2,
        sourceUnitIndex
      }
    };
  },
  onQueryResolve: async (card, gameState, playerState, selections, context) => {
    const step = context?.step || 2;
    const sourcePlayer = gameState.players[playerState.uid];

    if (step === 2) {
      const targetId = selections[0];
      const targetCard = sourcePlayer.erosionFront.find(c => c?.gamecardId === targetId);

      if (targetCard) {
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
            effectSourceCardId: card.gamecardId,
            targetIndex: context?.sourceUnitIndex
          }
        );

        gameState.logs.push(`[${card.fullName}] 效果生效：${targetCard.fullName} 从侵蚀区进入了战场。`);
      } else {
        gameState.logs.push(`[${card.fullName}] 结算时目标已不合法，效果失败。`);
      }
    }
  }
};

const card: Card = {
  id: '104030450',
  fullName: '援护药师【文】',
  specialName: '文',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '冒险家公会',
  acValue: 2,
  power: 500,
  basePower: 500,
  damage: 0,
  baseDamage: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    triggerSearchEffect,
    activateSwapEffect
  ],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
