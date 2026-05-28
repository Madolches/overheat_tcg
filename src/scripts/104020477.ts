import { Card, GameState, PlayerState, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { moveCardAsCost } from './BaseUtil';

const trigger_104020477: CardEffect = {
  id: '104020477_trigger',
  type: 'TRIGGER',
  description: '【诱发】：当这个单位进入单位区时，若对手的单位比你多2个或以上：将侵蚀位前区两张蓝色的正面卡牌送去墓地，之后选择对手单位区中最多两名非神蚀单位返回持有者手牌。',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    // 1. Check if this card entered the UNIT zone
    const isSelfEntering = event?.type === 'CARD_ENTERED_ZONE' &&
      (event.sourceCardId === instance.gamecardId || event.sourceCard === instance) &&
      event.data?.zone === 'UNIT';
    if (!isSelfEntering) return false;

    // 2. Check unit count difference (Opponent - Me >= 2)
    const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid)!;
    const opponent = gameState.players[opponentId];
    const opponentUnitCount = opponent.unitZone.filter(u => u !== null).length;
    const myUnitCount = playerState.unitZone.filter(u => u !== null).length;
    
    if (opponentUnitCount - myUnitCount < 2) return false;

    // 3. Check for at least 2 blue face-up cards in erosion front
    const blueErosionCount = playerState.erosionFront.filter(c => 
      c && c.displayState === 'FRONT_UPRIGHT' && AtomicEffectExecutor.matchesColor(c, 'BLUE')
    ).length;

    return blueErosionCount >= 2;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const blueErosionCards = playerState.erosionFront.filter(c => 
      c && c.displayState === 'FRONT_UPRIGHT' && AtomicEffectExecutor.matchesColor(c, 'BLUE')
    ) as Card[];

    // Step 1: Select 2 blue erosion cards to sacrifice
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, blueErosionCards.map(c => ({ card: c, source: 'EROSION_FRONT' }))),
      title: '牺牲侵蚀卡牌 (代价)',
      description: '请选择侵蚀前区的两张蓝色正面卡牌送去墓地以发动效果',
      minSelections: 2,
      maxSelections: 2,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '104020477_trigger',
        step: 1
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step === 1) {
      // Resolve sacrificial cost
      for (const targetId of selections) {
        const costCard = playerState.erosionFront.find(card =>
          card?.gamecardId === targetId &&
          card.displayState === 'FRONT_UPRIGHT' &&
          AtomicEffectExecutor.matchesColor(card, 'BLUE')
        );
        if (costCard) moveCardAsCost(gameState, playerState.uid, costCard, 'GRAVE', instance);
      }
      gameState.logs.push(`[${instance.fullName}] 消耗了两张侵蚀卡牌作为代价。`);

      // Step 2: Select up to 2 non-godmark units from opponent
      const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid)!;
      const opponent = gameState.players[opponentId];
      const targets = opponent.unitZone.filter(c => c && !c.godMark) as Card[];

      if (targets.length > 0) {
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, targets.map(c => ({ card: c, source: 'UNIT' }))),
          title: '选择回手单位',
          description: '请选择对手单位区最多两名非神蚀单位返回手牌',
          minSelections: 0,
          maxSelections: 2,
          callbackKey: 'EFFECT_RESOLVE',
          context: {
            sourceCardId: instance.gamecardId,
            effectId: '104020477_trigger',
            step: 2
          }
        };
      } else {
        gameState.logs.push(`[${instance.fullName}] 没有有效的对手单位可供选择。`);
      }
    } else if (context.step === 2) {
      // Resolve bounce effect
      const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid)!;
      for (const targetId of selections) {
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_FIELD',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'HAND'
        }, instance);
      }
      
      if (selections.length > 0) {
        gameState.logs.push(`[${instance.fullName}] 将对手的 ${selections.length} 个单位遣回了手牌。`);
      }
    }
  }
};

const card: Card = {
  id: '104020477',
  fullName: '私服【阿克蒂】',
  specialName: '阿克蒂',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '九尾商会联盟',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [trigger_104020477],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null,
};

export default card;
