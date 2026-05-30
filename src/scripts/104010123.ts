import { Card, CardEffect, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { paymentCost } from './BaseUtil';

const getValidBounceTargets = (playerState: PlayerState) => {
  return playerState.unitZone.filter((unit): unit is Card =>
    !!unit &&
    !unit.godMark &&
    unit.fullName !== '三季拳宗师'
  );
};

const activate_104010123: CardEffect = {
  id: '104010123_hand_bounce_summon',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  erosionTotalLimit: [1, 4],
  description: '【启动】【卡名一回合一次】【手牌】侵蚀区数量为1-4，且我方场上有1个或以上的蓝色单位时，支付2费：选择我方单位区1个【三季拳宗师】以外的非神蚀单位，将其返回持有者的手牌。之后，将这张卡放置到单位区。',
  condition: (gameState: GameState, playerState: PlayerState, instance: Card) => {
    const hasBlueUnit = playerState.unitZone.some(unit => unit && AtomicEffectExecutor.matchesColor(unit, 'BLUE'));
    if (!hasBlueUnit) return false;

    return getValidBounceTargets(playerState).length > 0;
  },
  cost: paymentCost(2, 'BLUE'),
  targetSpec: {
    title: '选择返回手牌的单位',
    description: '请选择我方单位区1个【三季拳宗师】以外的非神蚀单位，将其返回持有者的手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'SELECT_TARGET',
    getCandidates: (_gameState, playerState) => {
      return getValidBounceTargets(playerState).map(card => ({ card, source: 'UNIT' as any }));
    }
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step === 'SELECT_TARGET') {
      const targetId = selections[0];
      const targetCard = AtomicEffectExecutor.findCardById(gameState, targetId);
      const targetOwnerUid = targetCard ? AtomicEffectExecutor.findCardOwnerKey(gameState, targetId) : undefined;

      if (!targetCard || !targetOwnerUid || targetOwnerUid !== playerState.uid || targetCard.godMark || targetCard.fullName === '三季拳宗师') {
        gameState.logs.push(`[${instance.fullName}] 目标已不合法，效果结算失败。`);
        return;
      }

      await AtomicEffectExecutor.execute(gameState, targetOwnerUid, {
        type: 'MOVE_FROM_FIELD',
        targetFilter: { gamecardId: targetId },
        destinationZone: 'HAND'
      }, instance);

      if (!playerState.unitZone.some(unit => unit === null)) {
        gameState.logs.push(`[${instance.fullName}] 已将目标返回手牌，但我方单位区没有空位，无法将自身放置到单位区。`);
        return;
      }

      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'MOVE_FROM_HAND',
        targetFilter: { gamecardId: instance.gamecardId },
        destinationZone: 'UNIT'
      }, instance);

      const movedSelf = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
      if (movedSelf && movedSelf.cardlocation === 'UNIT') {
        movedSelf.displayState = 'FRONT_UPRIGHT';
        movedSelf.isExhausted = false;
      }

      gameState.logs.push(`[${instance.fullName}] 将 [${targetCard.fullName}] 返回持有者手牌，并将自身放置到了单位区。`);
    }
  }
};

const card: Card = {
  id: '104010123',
  gamecardId: null as any,
  fullName: '三季拳宗师',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { BLUE: 1 },
  faction: '百濑之水城',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [activate_104010123],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null,
};

export default card;
