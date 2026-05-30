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

const activateEffect: CardEffect = {
  id: 'freya_ranger_activate',
  type: 'ACTIVATE',
  limitCount: 1,
  limitNameType: true,
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [3, 7],
  description: '【启动】【同名回合一次】侵蚀区处于3-7张且在你的回合，支付1费，将这个单位正面表示置入侵蚀前区。之后选择你侵蚀前区一张「芙蕾雅」以外的「冒险家公会」单位卡，将其放置进入单位区。',
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
      description: '请选择一张侵蚀前区正面表示的「冒险家公会」单位（非芙蕾雅），其将进入战场。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: card.gamecardId,
        effectIndex: 0,
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
  id: '104030452',
  fullName: '破阵游侠【芙蕾雅】',
  specialName: '芙蕾雅',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '冒险家公会',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [activateEffect],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
