import { Card, GameState, PlayerState, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const activated_104020119: CardEffect = {
  id: '104020119_activated',
  type: 'ACTIVATE',
  description: '【启】横置该单位：选择你侵蚀位前区的一张蓝色卡牌送去墓地，之后抽一张牌，并选择你手牌中的一张卡牌正面表示置入侵蚀区。',
  triggerLocation: ['UNIT'],
  condition: (gameState: GameState, playerState: PlayerState, instance: Card) => {
    if (instance.isExhausted) return false;
    return playerState.erosionFront.some(c =>
      c && c.displayState === 'FRONT_UPRIGHT' && AtomicEffectExecutor.matchesColor(c, 'BLUE')
    );
  },
  targetSpec: {
    title: '选择牺牲的侵蚀卡牌',
    description: '请选择一张侵蚀前区的蓝色正面卡牌送去墓地。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['EROSION_FRONT'],
    controller: 'SELF',
    step: 1 as any,
    getCandidates: (_gameState, playerState) =>
      playerState.erosionFront
        .filter((card): card is Card => !!card && card.displayState === 'FRONT_UPRIGHT' && AtomicEffectExecutor.matchesColor(card, 'BLUE'))
        .map(card => ({ card, source: 'EROSION_FRONT' as any }))
  },
  cost: async (gameState: GameState, playerState: PlayerState, instance: Card) => {
    if (instance.isExhausted) return false;

    const blueErosionCards = playerState.erosionFront.filter(c =>
      c && c.displayState === 'FRONT_UPRIGHT' && AtomicEffectExecutor.matchesColor(c, 'BLUE')
    );
    if (blueErosionCards.length === 0) return false;

    instance.isExhausted = true;
    instance.displayState = 'FRONT_HORIZONTAL';
    return true;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const blueErosionCards = playerState.erosionFront.filter(c =>
      c && c.displayState === 'FRONT_UPRIGHT' && AtomicEffectExecutor.matchesColor(c, 'BLUE')
    ) as Card[];

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, blueErosionCards.map(c => ({ card: c, source: 'EROSION_FRONT' }))),
      title: '选择牺牲的侵蚀卡牌',
      description: '请选择一张侵蚀前区的蓝色卡牌送去墓地',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '104020119_activated',
        step: 1
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    const declaredTargets = context?.declaredTargets || [];
    if (declaredTargets.length > 0 && context?.step === 1) {
      selections = [declaredTargets[0].gamecardId];
    }

    if (context.step === 1) {
      const targetId = selections[0];
      const targetCard = playerState.erosionFront.find(c => c?.gamecardId === targetId);

      if (targetCard) {
        // 1. Move erosion to grave
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_EROSION',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'GRAVE'
        }, instance);

        // 2. Draw 1 card
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'DRAW',
          value: 1
        }, instance);

        gameState.logs.push(`[${instance.fullName}] 发动：牺牲了 ${targetCard.fullName} 并抽了一张卡。`);

        // 3. Step 2: Select a card from hand to place in erosion
        if (playerState.hand.length > 0) {
          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CARD',
            playerUid: playerState.uid,
            options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, playerState.hand.map(c => ({ card: c, source: 'HAND' }))),
            title: '选择置入侵蚀区的卡牌',
            description: '请选择一张手牌置入侵蚀区',
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'EFFECT_RESOLVE',
            context: {
              sourceCardId: instance.gamecardId,
              effectId: '104020119_activated',
              step: 2
            }
          };
        }
      }
    } else if (context.step === 2) {
      const targetId = selections[0];
      const targetCard = playerState.hand.find(c => c.gamecardId === targetId);

      if (targetCard) {
        // 4. Move hand to erosion front (face-up)
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_HAND',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'EROSION_FRONT'
        }, instance);

        // Ensure it's face-up
        if (targetCard) {
          targetCard.displayState = 'FRONT_UPRIGHT';
        }

        gameState.logs.push(`[${instance.fullName}] 将 ${targetCard.fullName} 置入了侵蚀区。`);
      }
    }
  }
};

const card: Card = {
  id: '104020119',
  fullName: '王国的一般商队',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
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
  effects: [activated_104020119],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null,
};

export default card;
