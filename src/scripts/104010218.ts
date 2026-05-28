import { Card, GameState, PlayerState, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const trigger_104010218_1: CardEffect = {
  id: '104010218_trigger_1',
  type: 'TRIGGER',
  description: '【诱发】这个单位被战斗破坏时，你可以选择你的侵蚀区中的最多2张具有 [菲晶] 的正面卡：将被选择的卡加入手牌。',
  triggerLocation: ['GRAVE'],
  triggerEvent: 'CARD_DESTROYED_BATTLE',
  isMandatory: false,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    if (!event) return instance.cardlocation === 'GRAVE';

    // Must be self destroyed
    const isSelf = event.targetCardId === instance.gamecardId;
    if (!isSelf) return false;

    // Check if there are any [Blue Crystal] cards in erosionFront
    const blueCrystalCards = playerState.erosionFront.filter(c => c && c.feijingMark && c.displayState === 'FRONT_UPRIGHT');
    return blueCrystalCards.length > 0;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const blueCrystalCards = playerState.erosionFront.filter(c => c && c.feijingMark && c.displayState === 'FRONT_UPRIGHT') as Card[];

    if (blueCrystalCards.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, blueCrystalCards.map(c => ({ card: c, source: 'EROSION_FRONT' }))),
      title: '选择加入手牌的卡',
      description: '请从你的侵蚀前区选择最多2张具有 [菲晶] 的正面卡加入手牌',
      minSelections: 1,
      maxSelections: Math.min(2, blueCrystalCards.length),
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '104010218_trigger_1',
        step: 1
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step === 1) {
      for (const targetId of selections) {
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_EROSION',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'HAND'
        }, instance);
      }
      gameState.logs.push(`[草泽医人] 效果：将 ${selections.length} 张卡从侵蚀前区加入手牌。`);
    }
  }
};

const card: Card = {
  id: '104010218',
  fullName: '草泽医人',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '百濑之水城',
  acValue: 2,
  power: 1000,
  basePower: 1000,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [trigger_104010218_1],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT05',
  uniqueId: null,
};

export default card;
