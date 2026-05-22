import { Card, GameState, PlayerState, CardEffect, TriggerLocation, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canMeetBattlefieldColorRequirement } from './BaseUtil';

const effect_104020068_trigger: CardEffect = {
  id: 'aketi_rotation_trigger',
  type: 'TRIGGER',
  triggerEvent: 'CARD_TO_EROSION_FRONT',
  isMandatory: false,
  description: '【诱发】每回合一次。在你的回合中，当我方卡牌进入侵蚀区域正面时：选择一张非神蚀卡牌，将其横置或竖置。',
  limitCount: 1,
  limitNameType: true,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    return (
      playerState.isTurn &&
      event?.type === 'CARD_TO_EROSION_FRONT' &&
      event.data?.isEffect === true &&
      event.data?.effectSourcePlayerUid === playerState.uid
    );
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    // Select non-godmark unit or item
    const targets: Card[] = [];
    Object.values(gameState.players).forEach(p => {
      p.unitZone.forEach(c => { if (c && !c.godMark) targets.push(c); });
      p.itemZone.forEach(c => { if (c && !c.godMark) targets.push(c); });
    });

    if (targets.length > 0) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, targets.map(c => ({ card: c, source: c.cardlocation as TriggerLocation }))),
        title: '选择目标卡牌',
        description: '选择一张非神蚀单位或道具，调整其横竖状态。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          effectId: 'aketi_rotation_trigger',
          sourceCardId: instance.gamecardId,
          step: 'SELECT_TARGET'
        }
      };
    }
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step === 'SELECT_TARGET' && selections.length > 0) {
      const targetId = selections[0];
      const target = AtomicEffectExecutor.findCardById(gameState, targetId);
      if (target) {
        const type = target.isExhausted ? 'ROTATE_VERTICAL' : 'ROTATE_HORIZONTAL';
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type,
          targetFilter: { gamecardId: targetId }
        }, instance);
        gameState.logs.push(`[${instance.fullName}] 的效果使 [${target.fullName}] 变为${target.isExhausted ? '竖置' : '横置'}状态。`);
      }
    }
  }
};

const effect_104020068_activate: CardEffect = {
  id: 'aketi_goddess_bounce',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [10, 10],
  erosionFrontLimit: [2, 10],
  description: '【启】在女神化状态下，每场比赛一次。选择侵蚀区域两张卡牌转为背面：选择场上最多两张单位或道具卡牌返回持有者手牌。之后，对自己造成2点效果伤害。',
  limitCount: 1,
  limitGlobal: true,
  limitNameType: true,
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    // 1. Cost: Select 2 from Erosion Front
    const frontCards = playerState.erosionFront.filter(c => c !== null) as Card[];
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, frontCards.map(c => ({ card: c, source: 'EROSION_FRONT' }))),
      title: '支付发动代价',
      description: '选择侵蚀区域两张卡牌转为背面。',
      minSelections: 2,
      maxSelections: 2,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        effectId: 'aketi_goddess_bounce',
        sourceCardId: instance.gamecardId,
        step: 'COST'
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step === 'COST') {
      // Move to back face-down
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'TURN_EROSION_FACE_DOWN',
        value: 2
      }, instance, undefined, selections);

      gameState.logs.push(`[${instance.fullName}] 支付了代价，将侵蚀区卡牌转为背面状态。`);

      // 2. Select up to 2 units/items
      const targets: Card[] = [];
      Object.values(gameState.players).forEach(p => {
        p.unitZone.forEach(c => { if (c) targets.push(c); });
        p.itemZone.forEach(c => { if (c) targets.push(c); });
      });

      if (targets.length > 0) {
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, targets.map(c => ({ card: c, source: c.cardlocation as TriggerLocation }))),
          title: '选择目标卡牌',
          description: '选择最多两张单位或道具卡牌返回持有者手牌。',
          minSelections: 1,
          maxSelections: 2,
          callbackKey: 'EFFECT_RESOLVE',
          context: {
            effectId: 'aketi_goddess_bounce',
            sourceCardId: instance.gamecardId,
            step: 'BOUNCE'
          }
        };
      }
    } else if (context.step === 'BOUNCE') {
      for (const id of selections) {
        const target = AtomicEffectExecutor.findCardById(gameState, id)!;
        const owner = AtomicEffectExecutor.findCardOwnerKey(gameState, id)!;
        const sourceZone = target.cardlocation as TriggerLocation;

        let type: any = 'MOVE_FROM_FIELD';
        if (sourceZone === 'ITEM') type = 'MOVE_FROM_FIELD'; // Atomic handles both in MOVE_FROM_FIELD usually, or I should check implementation

        await AtomicEffectExecutor.execute(gameState, owner, {
          type,
          targetFilter: { gamecardId: id },
          destinationZone: 'HAND'
        }, instance);
      }
      gameState.logs.push(`[${instance.fullName}] 使 ${selections.length} 张卡牌回到了手牌。`);

      // Self damage
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'DEAL_EFFECT_DAMAGE_SELF',
        value: 2
      }, instance);
    }
  }
};

const effect_104020068_activate_play: CardEffect = {
  id: 'aketi_play_from_erosion',
  type: 'ACTIVATED',              //这里作区分，防止被歌月花开选中
  triggerLocation: ['EROSION_FRONT'],
  description: '【启】此卡在侵蚀区域正面时：可以支付AC值使用这张卡。',
  condition: (gameState, playerState, instance) => {
    if (instance.cardlocation !== 'EROSION_FRONT' || instance.displayState !== 'FRONT_UPRIGHT') return false;

    // 1. Basic Turn/Phase/Space check
    if (
      !playerState.isTurn ||
      gameState.phase !== 'MAIN' ||
      !playerState.unitZone.some(u => u === null)
    ) {
      return false;
    }

    // 2. Same Name Check (Unique Unit)
    if (instance.specialName && playerState.unitZone.some(u => u?.specialName === instance.specialName)) return false;

    // 3. Color Requirement Check
    if (!canMeetBattlefieldColorRequirement(playerState, instance)) return false;

    // 4. Cost Sufficiency Check (AC Value vs Erosion Capacity)
    let remainingCost = instance.acValue;
    const hasFeijing = playerState.hand.some(c => c.feijingMark && c.color === instance.color);
    if (hasFeijing) remainingCost = Math.max(0, remainingCost - 3);

    const readyUnitsCount = playerState.unitZone.filter(u => u && !u.isExhausted).length;
    remainingCost = Math.max(0, remainingCost - readyUnitsCount);

    if (remainingCost > 0) {
      const currentErosionCount = playerState.erosionFront.filter(c => c !== null).length +
        playerState.erosionBack.filter(c => c !== null).length;
      if (currentErosionCount + remainingCost >= 10) return false;
    }

    return true;
  },
  cost: async (gameState, playerState, instance) => {
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_PAYMENT',
      playerUid: playerState.uid,
      paymentCost: instance.acValue || 0,
      paymentColor: instance.color,
      options: [],
      title: '支付发动代价',
      description: `支付 ${instance.acValue} 点费用以将此卡从侵蚀区域置入战场。`,
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'ACTIVATE_COST_RESOLVE',
      context: {
        effectId: 'aketi_play_from_erosion',
        effectIndex: 2,
        sourceCardId: instance.gamecardId,
        activationPlayerUid: playerState.uid
      }
    };
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_EROSION',
      targetFilter: { gamecardId: instance.gamecardId },
      destinationZone: 'UNIT'
    }, instance);
    gameState.logs.push(`[${instance.fullName}] 通过支付费用从侵蚀区域进入了战场。`);
  }
};

const card: Card = {
  id: '104020068',
  gamecardId: null as any,
  fullName: '九尾天狐【阿克蒂】',
  specialName: '阿克蒂',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { 'BLUE': 2 },
  faction: '九尾商会联盟',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 1,
  baseDamage: 1,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    effect_104020068_trigger,
    effect_104020068_activate,
    effect_104020068_activate_play
  ],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT01',
  uniqueId: null,
};

export default card;
