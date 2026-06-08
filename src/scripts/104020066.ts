import { Card, GameState, PlayerState, TriggerLocation, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const activate_104020066_1: CardEffect = {
  id: '104020066_activate_1',
  type: 'ACTIVATE',
  description: '【启动】在单位区放置为横置：我方选择一名玩家（我方或对手），选择该玩家侵蚀前区的一张正面表示卡并将其送去墓地。之后，将该玩家卡组顶的一张卡放置在侵蚀前区。',
  triggerLocation: ['UNIT'],
  condition: (gameState: GameState, playerState: PlayerState, instance: Card) => {
    if (instance.isExhausted) return false;
    // Check if any player has frontal cards
    return Object.values(gameState.players).some(p =>
      p.erosionFront.some(c => c !== null && c.displayState === 'FRONT_UPRIGHT')
    );
  },
  cost: async (gameState: GameState, playerState: PlayerState, instance: Card) => {
    instance.isExhausted = true;
    return true;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const options: any[] = [];
    Object.values(gameState.players).forEach(p => {
      // Only include players who have frontal erosion cards
      if (p.erosionFront.some(c => c !== null && c.displayState === 'FRONT_UPRIGHT')) {
        const isMe = p.uid === playerState.uid;
        options.push({
          card: {
            gamecardId: isMe ? 'PLAYER_SELF' : 'PLAYER_OPPONENT',
            id: isMe ? 'PLAYER_SELF' : 'PLAYER_OPPONENT',
            fullName: isMe ? '我方玩家' : '对手玩家',
            type: 'UNIT',
            color: 'NONE',
            rarity: 'C'
          },
          source: 'HAND'
        });
      }
    });

    if (options.length > 0) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options,
        title: '选择玩家',
        description: '请选择一名玩家以执行效果（选择该玩家的一张卡以确认）',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          sourceCardId: instance.gamecardId,
          effectIndex: 0,
          step: 1
        }
      };
    }
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step === 1) {
      const selectedGamecardId = selections[0];
      let selectedPlayerUid = '';

      if (selectedGamecardId === 'PLAYER_SELF') {
        selectedPlayerUid = playerState.uid;
      } else if (selectedGamecardId === 'PLAYER_OPPONENT') {
        selectedPlayerUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid) || '';
      } else {
        // Fallback
        for (const uid of Object.keys(gameState.players)) {
          const p = gameState.players[uid];
          const allCards = [...p.hand, ...p.unitZone, ...p.itemZone, ...p.grave, ...p.exile, ...p.erosionFront, ...p.erosionBack, ...p.deck];
          if (allCards.some(c => c && c.gamecardId === selectedGamecardId)) {
            selectedPlayerUid = uid;
            break;
          }
        }
      }

      if (selectedPlayerUid) {
        const targetPlayer = gameState.players[selectedPlayerUid];
        const erosionOptions = targetPlayer.erosionFront
          .filter(c => c !== null && c.displayState === 'FRONT_UPRIGHT') as Card[];

        if (erosionOptions.length > 0) {
          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CARD',
            playerUid: playerState.uid,
            options: erosionOptions.map(c => ({ card: c, source: 'EROSION_FRONT' })),
            title: `选择 ${targetPlayer.displayName} 的侵蚀卡`,
            description: '请从该玩家的侵蚀前区中选择一张正面向上的卡',
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'EFFECT_RESOLVE',
            context: {
              ...context,
              selectedPlayerUid,
              step: 2
            }
          };
        }
      }
    } else if (context.step === 2) {
      const selectedErosionCardId = selections[0];
      const selectedPlayerUid = context.selectedPlayerUid;
      const targetPlayer = gameState.players[selectedPlayerUid];

      const erosionCard = targetPlayer.erosionFront.find(c => c?.gamecardId === selectedErosionCardId);
      if (erosionCard) {
        gameState.logs.push(`[老练的狐族商人] 将 ${targetPlayer.displayName} 的侵蚀卡 ${erosionCard.fullName} 送往墓地`);

        // Move to Grave
        await AtomicEffectExecutor.execute(gameState, selectedPlayerUid, {
          type: 'MOVE_FROM_EROSION',
          targetFilter: { gamecardId: selectedErosionCardId },
          destinationZone: 'GRAVE'
        }, instance);

        // Place top card of deck to erosion
        await AtomicEffectExecutor.execute(gameState, selectedPlayerUid, {
          type: 'MOVE_FROM_DECK',
          targetCount: 1,
          targetFilter: { zone: ['DECK'] },
          destinationZone: 'EROSION_FRONT'
        }, instance);
        gameState.logs.push(`[老练的狐族商人] 将 ${targetPlayer.displayName} 卡组顶的卡放置在了侵蚀前区`);
      }
    }
  }
};

const activate_104020066_2: CardEffect = {
  id: '104020066_activate_2',
  type: 'ACTIVATE',
  description: '【启动】卡名每回合限一次。当侵蚀区的卡片数量为4-6张时，将单位横置：选择一名玩家（我方或对手），该玩家抽2张卡。之后，由该玩家选择一张其手牌，并将其放置在侵蚀前区。',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  erosionTotalLimit: [4, 6],
  condition: (gameState: GameState, playerState: PlayerState, instance: Card) => {
    if (instance.isExhausted) return false;
    return true;
  },
  cost: async (gameState: GameState, playerState: PlayerState, instance: Card) => {
    instance.isExhausted = true;
    return true;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const options: any[] = [];
    Object.values(gameState.players).forEach(p => {
      const isMe = p.uid === playerState.uid;
      options.push({
        card: {
          gamecardId: isMe ? 'PLAYER_SELF' : 'PLAYER_OPPONENT',
          id: isMe ? 'PLAYER_SELF' : 'PLAYER_OPPONENT',
          fullName: isMe ? '我方玩家' : '对手玩家',
          type: 'UNIT',
          color: 'NONE',
          rarity: 'C'
        },
        source: 'HAND'
      });
    });

    if (options.length > 0) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options,
        title: '选择玩家',
        description: '请选择一名玩家以执行效果',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          sourceCardId: instance.gamecardId,
          effectIndex: 1,
          step: 1
        }
      };
    }
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step === 1) {
      const selectedGamecardId = selections[0];
      let selectedPlayerUid = '';

      if (selectedGamecardId === 'PLAYER_SELF') {
        selectedPlayerUid = playerState.uid;
      } else if (selectedGamecardId === 'PLAYER_OPPONENT') {
        selectedPlayerUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid) || '';
      } else {
        // Fallback
        for (const uid of Object.keys(gameState.players)) {
          const p = gameState.players[uid];
          const allCards = [...p.hand, ...p.unitZone, ...p.itemZone, ...p.grave, ...p.exile, ...p.erosionFront, ...p.erosionBack, ...p.deck];
          if (allCards.some(c => c && c.gamecardId === selectedGamecardId)) {
            selectedPlayerUid = uid;
            break;
          }
        }
      }

      if (selectedPlayerUid) {
        const targetPlayer = gameState.players[selectedPlayerUid];
        gameState.logs.push(`[老练的狐族商人] 选择了玩家 ${targetPlayer.displayName}，该玩家抽2张卡`);

        // Draw 2 cards
        await AtomicEffectExecutor.execute(gameState, selectedPlayerUid, {
          type: 'DRAW',
          value: 2
        }, instance);

        // Step 2: The SELECTED player chooses a card from hand
        if (targetPlayer.hand.length > 0) {
          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CARD',
            playerUid: selectedPlayerUid, // The selected player makes the choice
            options: targetPlayer.hand.map(c => ({ card: c, source: 'HAND' })),
            title: '选择一张手牌',
            description: '请选择一张手牌将其放置在侵蚀前区',
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'EFFECT_RESOLVE',
            context: {
              ...context,
              selectedPlayerUid,
              step: 2
            }
          };
        }
      }
    } else if (context.step === 2) {
      const selectedHandCardId = selections[0];
      const selectedPlayerUid = context.selectedPlayerUid;
      const targetPlayer = gameState.players[selectedPlayerUid];

      const handCard = targetPlayer.hand.find(c => c.gamecardId === selectedHandCardId);
      if (handCard) {
        gameState.logs.push(`[老练的狐族商人] ${targetPlayer.displayName} 将手牌 ${handCard.fullName} 放置在了侵蚀前区`);

        await AtomicEffectExecutor.execute(gameState, selectedPlayerUid, {
          type: 'MOVE_FROM_HAND',
          targetFilter: { gamecardId: selectedHandCardId },
          destinationZone: 'EROSION_FRONT'
        }, instance);

        // Ensure it is face up
        const newErosionCard = targetPlayer.erosionFront.find(c => c?.gamecardId === selectedHandCardId);
        if (newErosionCard) {
          newErosionCard.displayState = 'FRONT_UPRIGHT';
        }
      }
    }
  }
};

const card: Card = {
  id: '104020066',
  fullName: '老练的狐族商人',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { 'BLUE': 1 },
  faction: '九尾商会联盟',
  acValue: 2,
  power: 1500,
  basePower: 1500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [activate_104020066_1, activate_104020066_2],
  rarity: 'PR',
  availableRarities: ['R', 'PR'],
  cardPackage: 'BT01',
  uniqueId: null,
};

export default card;
