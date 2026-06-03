import { Card, CardEffect, GameEvent, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createChoiceQuery, createSelectCardQuery, getBattlefieldUnits, isVirtualGodMarkReveal, readyByEffect, revealDeckCards, withVirtualGodMarkReveal } from './BaseUtil';

const readySelfIfNeeded = (instance: Card, gameState: any, revealedCardId?: string) => {
  const revealedCard = revealedCardId ? AtomicEffectExecutor.findCardById(gameState, revealedCardId) : undefined;
  if (!isVirtualGodMarkReveal(gameState, revealedCard)) return;
  readyByEffect(gameState, instance, instance);
};

const effect_105110467_attack: CardEffect = {
  id: '105110467_attack',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ATTACK_DECLARED',
  limitCount: 1,
  limitNameType: true,
  isMandatory: true,
  description: '这个单位攻击时，洗切你的卡组并展示卡组顶1张卡。结算其结果，之后若其为神蚀卡，重置这个单位。',
  condition: (_gameState, _playerState, instance, event?: GameEvent) =>
    instance.cardlocation === 'UNIT' &&
    event?.type === 'CARD_ATTACK_DECLARED' &&
    Array.isArray(event.data?.attackerIds) &&
    event.data.attackerIds.includes(instance.gamecardId),
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    const revealedCard = revealDeckCards(gameState, playerState.uid, 1, instance)[0];
    if (!revealedCard) return;

    await withVirtualGodMarkReveal(gameState, revealedCard, async () => {
      if (revealedCard.type !== 'UNIT') {
        const current = gameState.battleState?.defenseMaxPowerRestriction;
        gameState.battleState!.defenseMaxPowerRestriction = current === undefined ? 3000 : Math.min(current, 3000);
        readySelfIfNeeded(instance, gameState, revealedCard.gamecardId);
        return;
      }

      const targets = getBattlefieldUnits(gameState).filter(unit => unit.gamecardId !== instance.gamecardId);
      if (targets.length === 0) {
        readySelfIfNeeded(instance, gameState, revealedCard.gamecardId);
        return;
      }

      createSelectCardQuery(
        gameState,
        playerState.uid,
        targets,
        '选择单位',
        '选择战场上另1个单位。',
        1,
        1,
        {
          sourceCardId: instance.gamecardId,
          effectId: '105110467_attack',
          step: 'SELECT_TARGET',
          revealedCardId: revealedCard.gamecardId
        }
      );
    });
  },
  targetSpec: {
    preselect: false,
    title: '选择单位',
    description: '公开的卡为单位时，选择战场上的这个单位以外的1个单位，将其横置或重置。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'SELECT_TARGET',
    getCandidates: (gameState, _playerState, instance) =>
      getBattlefieldUnits(gameState)
        .filter(unit => unit.gamecardId !== instance.gamecardId)
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections, context) => {
    if (context.step === 'SELECT_TARGET') {
      createChoiceQuery(
        gameState,
        _playerState.uid,
        '选择横置或重置',
        '选择将该单位横置或重置。',
        [
          { id: 'HORIZONTAL', label: '横置' },
          { id: 'VERTICAL', label: '重置' }
        ],
        {
          sourceCardId: instance.gamecardId,
          effectId: '105110467_attack',
          step: 'ROTATE_TARGET',
          targetId: selections[0],
          revealedCardId: context.revealedCardId
        }
      );
      return;
    }

    if (context.step !== 'ROTATE_TARGET') return;

    await AtomicEffectExecutor.execute(gameState, _playerState.uid, {
      type: selections[0] === 'HORIZONTAL' ? 'ROTATE_HORIZONTAL' : 'ROTATE_VERTICAL',
      targetFilter: { gamecardId: context.targetId }
    }, instance);

    readySelfIfNeeded(instance, gameState, context.revealedCardId);
  }
};

const card: Card = {
  id: '105110467',
  fullName: '魔偶姬「斯蒂芬妮」',
  specialName: '斯蒂芬妮',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '学院要塞',
  acValue: 4,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  baseIsrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105110467_attack],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
