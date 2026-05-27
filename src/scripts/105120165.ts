import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { createSelectCardQuery, getOpponentUid } from './BaseUtil';

const effect_105120165_forced_attack: CardEffect = {
  id: '105120165_forced_attack',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  limitCount: 1,
  limitNameType: true,
  description: '若这个单位因炼金效果从卡组进入战场，选择对手1个单位。直到该玩家的下个回合结束时，其能攻击则必须攻击。',
  condition: (_gameState, _playerState, instance, event?: GameEvent) =>
    instance.cardlocation === 'UNIT' &&
    event?.type === 'CARD_ENTERED_ZONE' &&
    event.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    (instance as any).data?.enteredFromDeckByAlchemyTurn !== undefined &&
    (instance as any).data?.lastMovedFromZone === 'DECK' &&
    (instance as any).data?.lastMovedToZone === 'UNIT',
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    const targets = opponent.unitZone.filter((card): card is Card => !!card);
    if (targets.length === 0) return;

    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择对手单位',
      '选择对手1个单位，使其下回合能攻击则必须攻击。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105120165_forced_attack' }
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!target) return;

    (target as any).data = {
      ...((target as any).data || {}),
      forcedAttackTurn: gameState.turnCount + 1,
      forcedAttackSourceName: instance.fullName
    };
    EventEngine.recalculateContinuousEffects(gameState);
  }
};

const card: Card = {
  id: '105120165',
  fullName: '炼金兽 丽人花',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '永生之乡',
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
  effects: [effect_105120165_forced_attack],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
