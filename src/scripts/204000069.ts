import { Card, GameState, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { addInfluence, ensureData } from './BaseUtil';

const card: Card = {
  id: '204000069',
  fullName: '任务：击溃恶党',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [
    {
      id: 'defeat_villains_activate_main',
      type: 'ACTIVATE',
      triggerLocation: ['HAND', 'PLAY'],
      description: '【回合名称1次】：只能在自己的主要阶段发动。选择对手一个横置单位。在本回合中，当该单位离开战场时，你可以选择对手战场上的一个非神蚀卡牌，放置在对手卡组顶。',
      limitCount: 1,
      limitNameType: true,
      condition: (gameState, playerState) => {
        if (gameState.phase !== 'MAIN' || gameState.players[gameState.playerIds[gameState.currentTurnPlayer]].uid !== playerState.uid) return false;
        const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid)!;
        const opponent = gameState.players[opponentId];
        return opponent.unitZone.some(u => u && u.isExhausted);
      },
      targetSpec: {
        title: '选择目标单位',
        description: '选择对手一个横置单位进行标记。',
        minSelections: 1,
        maxSelections: 1,
        zones: ['UNIT'],
        controller: 'OPPONENT',
        step: 1 as any,
        getCandidates: (gameState, playerState) => {
          const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid)!;
          return gameState.players[opponentId].unitZone
            .filter((unit): unit is Card => !!unit && !!unit.isExhausted)
            .map(card => ({ card, source: 'UNIT' as any }));
        }
      },
      execute: async (card, gameState, playerState) => {
        const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid)!;
        const opponent = gameState.players[opponentId];
        const targets = opponent.unitZone.filter(u => u && u.isExhausted) as Card[];

        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, targets.map(t => ({ card: t, source: 'UNIT' }))),
          title: '选择目标单位',
          description: '选择对手一个横置单位进行标记。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: {
            sourceCardId: card.gamecardId,
            effectIndex: 0,
            step: 1
          }
        };
      },
      onQueryResolve: async (card, gameState, playerState, selections) => {
        const targetId = selections[0];
        const targetOwnerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, targetId);
        const target = AtomicEffectExecutor.findCardById(gameState, targetId);
        (card as any).data = {
          ...((card as any).data || {}),
          markedTargetId: targetId,
          markedTargetOwnerUid: targetOwnerUid,
          playedTurn: gameState.turnCount
        };
        (playerState as any).defeatVillainsMarkedTargetId = targetId;
        (playerState as any).defeatVillainsMarkedTargetOwnerUid = targetOwnerUid;
        (playerState as any).defeatVillainsMarkedTurn = gameState.turnCount;

        if (target) {
          const targetData = ensureData(target);
          targetData.defeatVillainsMarkedTurn = gameState.turnCount;
          targetData.defeatVillainsSourceCardId = card.gamecardId;
          targetData.defeatVillainsSourceOwnerUid = playerState.uid;
          targetData.defeatVillainsSourceName = card.fullName;
          targetData.defeatVillainsMarkDescription = '离场时触发：将其控制者战场1张非神蚀卡放置到卡组顶';
          addInfluence(target, card, '离场时触发：将其控制者战场1张非神蚀卡放置到卡组顶');
        }

        gameState.logs.push('[任务：击溃恶党] 已标记目标单位。当其离开战场时将触发后续效果。');
      }
    },
    {
      id: 'defeat_villains_trigger_leave',
      type: 'TRIGGER',
      description: '（标记效果触发）当标记单位离场时，将对手战场一张非神蚀卡放置在卡组顶。',
      triggerLocation: ['GRAVE', 'PLAY'],
      triggerEvent: 'CARD_LEFT_FIELD',
      isGlobal: true,
      isMandatory: true,
      condition: (gameState, playerState, card, event?: GameEvent) => {
        if (!event) return false;
        const data = (card as any).data || {};
        const markedTargetId = data.markedTargetId || (playerState as any).defeatVillainsMarkedTargetId;
        const markedTurn = data.playedTurn ?? (playerState as any).defeatVillainsMarkedTurn;
        const leavingCardId = event.sourceCardId || event.data?.previousSourceCardId;
        return (leavingCardId === markedTargetId || event.data?.previousSourceCardId === markedTargetId) &&
          event.data?.zone === 'UNIT' &&
          gameState.turnCount === markedTurn;
      },
      execute: async (card, gameState, playerState) => {
        const data = (card as any).data || {};
        const fallbackOpponentUid = Object.keys(gameState.players).find(id => id !== playerState.uid);
        const targetOwnerUid =
          data.markedTargetOwnerUid ||
          (playerState as any).defeatVillainsMarkedTargetOwnerUid ||
          AtomicEffectExecutor.findCardOwnerKey(gameState, data.markedTargetId) ||
          fallbackOpponentUid;
        const targetOwner = targetOwnerUid ? gameState.players[targetOwnerUid] : undefined;
        const targets = targetOwner
          ? [...targetOwner.unitZone, ...targetOwner.itemZone].filter(c => c && !c.godMark) as Card[]
          : [];

        if (targets.length === 0) {
          gameState.logs.push('[任务：击溃恶党] 对方战场没有非神蚀卡，效果处理结束。');
          return;
        }

        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, targets.map(t => ({ card: t, source: t.cardlocation as any }))),
          title: '选择对手卡牌回卡组顶',
          description: '标记单位已离场，请选择对手战场一张非神蚀卡放置在对手卡组顶。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: {
            sourceCardId: card.gamecardId,
            effectIndex: 1,
            step: 2
          }
        };
      },
      onQueryResolve: async (card, gameState, playerState, selections) => {
        const targetId = selections[0];
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_FIELD',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'DECK'
        }, card);
        delete (playerState as any).defeatVillainsMarkedTargetId;
        delete (playerState as any).defeatVillainsMarkedTargetOwnerUid;
        delete (playerState as any).defeatVillainsMarkedTurn;
        gameState.logs.push(`[任务：击溃恶党] 效果：将对方的一张卡牌 [${targetId}] 放置在卡组顶。`);
      }
    },
    {
      id: 'defeat_villains_activate_erosion',
      type: 'ACTIVATE',
      description: '【启】：若你的战场上有「冒险家公会」单位且此卡在侵蚀区，舍弃1张手牌：打出此卡。',
      limitCount: 1,
      limitNameType: false,
      triggerLocation: ['EROSION_FRONT'],
      condition: (gameState, playerState, instance) => {
        const hasGuildUnit = playerState.unitZone.some(u => u && u.faction === '冒险家公会');
        if (playerState.factionLock && instance.faction !== playerState.factionLock) return false;
        return instance.cardlocation === 'EROSION_FRONT' && hasGuildUnit && playerState.hand.length > 0;
      },
      cost: async (gameState, playerState, card) => {
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: playerState.hand.map(h => ({ card: h, source: 'HAND' })),
          title: '选择舍弃的卡牌',
          description: '舍弃1张手牌以从侵蚀区打出「任务：击溃恶党」。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'ACTIVATE_COST_RESOLVE',
          context: {
            sourceCardId: card.gamecardId,
            effectIndex: 2
          }
        };
        return true;
      },
      onQueryResolve: async (card, gameState, playerState, selections) => {
        const discardId = selections[0];
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'DISCARD_CARD',
          targetFilter: { gamecardId: discardId }
        }, card);
      },
      execute: async (card, gameState, playerState) => {
        const currentZone = card.cardlocation as 'EROSION_FRONT';
        const mainEffect = card.effects?.[0];

        AtomicEffectExecutor.moveCard(
          gameState,
          playerState.uid,
          currentZone,
          playerState.uid,
          'PLAY',
          card.gamecardId,
          true,
          { effectSourcePlayerUid: playerState.uid, effectSourceCardId: card.gamecardId }
        );

        EventEngine.dispatchEvent(gameState, {
          type: 'CARD_PLAYED',
          sourceCard: card,
          playerUid: playerState.uid,
          sourceCardId: card.gamecardId
        });

        if (mainEffect?.execute) {
          await (mainEffect.execute as any)(card, gameState, playerState);
        }

        AtomicEffectExecutor.moveCard(
          gameState,
          playerState.uid,
          'PLAY',
          playerState.uid,
          'GRAVE',
          card.gamecardId,
          true,
          { effectSourcePlayerUid: playerState.uid, effectSourceCardId: card.gamecardId }
        );
      }
    }
  ],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
