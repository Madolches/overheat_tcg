
import { Card, GameState, PlayerState, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const trigger_104000177_1: CardEffect = {
  id: '104000177_trigger_1',
  type: 'TRIGGER',
  description: '【诱】这个单位进入战场时，若你的战场上有具有 [神依] 的单位，选择对手的战场上的1张非神蚀卡，将其放置到对手的卡组顶。',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    const isOnUnitZone = instance.cardlocation === 'UNIT';
    if (!event) return isOnUnitZone;

    const isSelf = event.type === 'CARD_ENTERED_ZONE' &&
      (event.sourceCardId === instance.gamecardId || event.sourceCard === instance);
    const isTargetZone = event.data?.zone === 'UNIT';

    if (!isSelf || !isTargetZone || !isOnUnitZone) return false;

    // Check if there is a Shenyi unit on my field
    const hasShenyiUnit = playerState.unitZone.some(u => u && u.isShenyi);
    if (!hasShenyiUnit) return false;

    // Check if opponent has any non-EX (non-godMark) units or items
    const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid)!;
    const opponent = gameState.players[opponentId];
    const targets = [...opponent.unitZone, ...opponent.itemZone].filter(c => c && !c.godMark);
    return targets.length > 0;
  },
  execute: (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const opponentId = Object.keys(gameState.players).find(id => id !== playerState.uid)!;
    const opponent = gameState.players[opponentId];
    const targets = [...opponent.unitZone, ...opponent.itemZone].filter(c => c && !c.godMark) as Card[];

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, targets.map(t => ({ card: t, source: t.cardlocation }))),
      title: '选择卡牌回卡组顶',
      description: '请选择对手战场上的1张非神蚀卡牌将其放置到其卡组顶。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '104000177_trigger_1',
        step: 1
      }
    };
  },
  onQueryResolve: (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step === 1) {
      const targetId = selections[0];
      AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_FIELD',
        targetFilter: { gamecardId: targetId },
        destinationZone: 'DECK'
      }, instance);
      gameState.logs.push(`[海啸的美鱼人] 效果：将对手的一张卡牌移至卡组顶。`);
    }
  }
};

const trigger_104000177_2: CardEffect = {
  id: '104000177_trigger_2',
  type: 'TRIGGER',
  description: '【诱】这个单位从战场送入墓地时，你可以抽1张卡。',
  triggerLocation: ['GRAVE'],
  triggerEvent: ['CARD_LEFT_ZONE', 'CARD_LEFT_FIELD', 'CARD_DESTROYED_BATTLE', 'CARD_DESTROYED_EFFECT'],
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    if (!event) return instance.cardlocation === 'GRAVE';

    // Verify self-event: matches either sourceCardId, targetCardId, or direct reference
    const isSelf =
      (event.sourceCardId === instance.gamecardId) ||
      (event.targetCardId === instance.gamecardId) ||
      (event.sourceCard === instance);

    if (!isSelf) return false;

    // Trigger check: Must have moved to Graveyard
    const isNowInGrave = instance.cardlocation === 'GRAVE';

    // Zone check: If it was a zone-leave event, verify it left the Unit zone
    const leftUnitZone = event.type !== 'CARD_LEFT_ZONE' || (event.data?.zone === 'UNIT');

    return isNowInGrave && leftUnitZone;
  },
  execute: (instance: Card, gameState: GameState, playerState: PlayerState) => {
    AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'DRAW',
      value: 1
    }, instance);
    gameState.logs.push(`[海啸的美鱼人]
  isMandatory: false, 效果：由于离场进入墓地，抽 1 张卡。`);
  }
};

const card: Card = {
  id: '104000177',
  fullName: '海啸的美人鱼',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '无',
  acValue: 3,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isShenyi: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [trigger_104000177_1, trigger_104000177_2],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
