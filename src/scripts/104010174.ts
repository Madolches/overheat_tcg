import { Card, GameState, PlayerState, CardEffect, GameEvent, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const trigger_104010174_battle: CardEffect = {
  id: '104010174_battle_trigger',
  type: 'TRIGGER',
  triggerEvent: ['CARD_ATTACK_DECLARED', 'CARD_DEFENSE_DECLARED'],
  triggerLocation: ['UNIT'],
  isMandatory: false,
  description: '【诱发】当此单位宣言攻击或防御时，你可以选择发动：选择对手的一张非神蚀单位横置。',
  condition: (_gameState: GameState, _playerState: PlayerState, instance: Card, event?: GameEvent) => {
    return (
      event?.sourceCardId === instance.gamecardId ||
      event?.targetCardId === instance.gamecardId ||
      event?.data?.defenderId === instance.gamecardId ||
      event?.sourceCard === instance
    );
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid);
    if (!opponentUid) return;

    const targets = gameState.players[opponentUid].unitZone.filter((u): u is Card => !!u && !u.godMark);
    if (targets.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        targets.map(t => ({ card: t, source: 'UNIT' }))
      ),
      title: '选择横置目标',
      description: '请选择对手的一张非神蚀单位横置。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '104010174_battle_trigger'
      }
    };
  },
  targetSpec: {
    title: '选择横置目标',
    description: '选择对手的1个非神蚀单位，将其横置。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) => {
      const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid);
      if (!opponentUid) return [];
      return gameState.players[opponentUid].unitZone
        .filter((u): u is Card => !!u && !u.godMark)
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }));
    }
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[]) => {
    const targetId = selections[0];
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'ROTATE_HORIZONTAL',
      targetFilter: { gamecardId: targetId }
    }, instance);

    const target = AtomicEffectExecutor.findCardById(gameState, targetId);
    gameState.logs.push(`[${instance.fullName}] 效果：将 [${target?.fullName}] 横置。`);
  }
};

const trigger_104010174_damage: CardEffect = {
  id: '104010174_damage_trigger',
  type: 'TRIGGER',
  triggerEvent: 'COMBAT_DAMAGE_CAUSED',
  triggerLocation: ['UNIT'],
  description: '【诱发】【名称一回合一次】当我方侵蚀区为1-4张且此卡对对手造成战斗伤害时，你可以选择发动：选择我方场上一张单位和对方场上一张横置单位返回持有者手牌。',
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  isGlobal: true,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    if (event?.type !== 'COMBAT_DAMAGE_CAUSED' || event.playerUid === playerState.uid) return false;
    const totalErosion = playerState.erosionFront.filter(Boolean).length + playerState.erosionBack.filter(Boolean).length;
    if (!event.data?.['104010174_erosion_valid'] && (totalErosion < 1 || totalErosion > 4)) return false;

    const attackerIds = event.data?.attackerIds || gameState.battleState?.attackers || [];
    const isAttacking = attackerIds.includes(instance.gamecardId);
    if (!isAttacking) return false;
    event.data['104010174_erosion_valid'] = true;
    return true;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const myUnits = playerState.unitZone.filter((u): u is Card => !!u);
    if (myUnits.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        myUnits.map(u => ({ card: u, source: 'UNIT' }))
      ),
      title: '选择我方返回单位',
      description: '选择你场上的一张单位返回手牌。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '104010174_damage_trigger',
        step: 1
      }
    };
  },
  targetSpec: {
    targetGroups: [{
      title: '选择我方返回单位',
      description: '选择你的场上的1个单位返回手牌。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
      step: '1',
      getCandidates: (_gameState, playerState) =>
        playerState.unitZone
          .filter((u): u is Card => !!u)
          .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
    }, {
      title: '选择对手返回单位',
      description: '选择对手场上的1个横置单位返回其持有者手牌。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'OPPONENT',
      step: '2',
      getCandidates: (gameState, playerState) => {
        const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid);
        if (!opponentUid) return [];
        return gameState.players[opponentUid].unitZone
          .filter((u): u is Card => !!u && u.isExhausted)
          .map(card => ({ card, source: 'UNIT' as TriggerLocation }));
      }
    }]
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.declaredTargets?.length >= 2) {
      const myTargetId = selections[0];
      const oppTargetId = selections[1];

      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_FIELD',
        targetFilter: { gamecardId: myTargetId },
        destinationZone: 'HAND'
      }, instance);

      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_FIELD',
        targetFilter: { gamecardId: oppTargetId },
        destinationZone: 'HAND'
      }, instance);

      gameState.logs.push(`[${instance.fullName}] 效果：将双方选定的单位返回了手牌。`);
      return;
    }

    if (context.step === 1 || context.step === '1') {
      const myTargetId = selections[0];
      const opponentUid = Object.keys(gameState.players).find(uid => uid !== playerState.uid);
      if (!opponentUid) return;

      const oppUnits = gameState.players[opponentUid].unitZone.filter((u): u is Card => !!u && u.isExhausted);
      if (oppUnits.length === 0) {
        gameState.logs.push(`[${instance.fullName}] 由于对手没有横置单位，无法完成返回效果。`);
        return;
      }

      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(
          gameState,
          playerState.uid,
          oppUnits.map(u => ({ card: u, source: 'UNIT' }))
        ),
        title: '选择对手返回单位',
        description: '选择对手场上的一张横置单位返回其持有者手牌。',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          ...context,
          myTargetId,
          step: 2
        }
      };
      return;
    }

    if (context.step === 2 || context.step === '2') {
      const myTargetId = context.myTargetId;
      const oppTargetId = selections[0];

      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_FIELD',
        targetFilter: { gamecardId: myTargetId },
        destinationZone: 'HAND'
      }, instance);

      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_FIELD',
        targetFilter: { gamecardId: oppTargetId },
        destinationZone: 'HAND'
      }, instance);

      gameState.logs.push(`[${instance.fullName}] 效果：将双方选定的单位返回了手牌。`);
    }
  }
};

const card: Card = {
  id: '104010174',
  fullName: '蜻蜓点水【云十三】',
  specialName: '云十三',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 2 },
  faction: '百濑之水城',
  acValue: 4,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [trigger_104010174_battle, trigger_104010174_damage],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT03',
  uniqueId: null,
};

export default card;
