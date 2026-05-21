import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { addInfluence, createSelectCardQuery, getTopDeckCards, moveCardAsCost } from './BaseUtil';

const STEPHANIE_IDS = new Set(['105110284', '105110383']);

const hasNoColorRequirement = (card: Card) =>
  Object.values(card.colorReq || {}).every(value => !value);

const isStephanieUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (
    STEPHANIE_IDS.has(String(card.id)) ||
    card.fullName.includes('斯蒂芬妮') ||
    !!card.specialName?.includes('斯蒂芬妮')
  );

const isCopyTarget = (card: Card) =>
  card.cardlocation === 'UNIT' &&
  card.type === 'UNIT' &&
  (
    (
      !card.godMark &&
      hasNoColorRequirement(card) &&
      (AtomicEffectExecutor.matchesColor(card, 'RED') || AtomicEffectExecutor.matchesColor(card, 'WHITE'))
    ) ||
    isStephanieUnit(card)
  ) &&
  (card.effects || []).some(effect => effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED');

const makeOneShotCopiedEffect = (source: Card, sourceEffect: CardEffect): CardEffect => {
  const copiedEffectId = sourceEffect.id || `105000323_copied_${source.gamecardId}_activate`;
  const consumedKey = `105000323_consumed_${source.gamecardId}_${copiedEffectId}`;
  const markConsumed = (instance: Card, gameState: any) => {
    (instance as any).data = {
      ...((instance as any).data || {}),
      [consumedKey]: gameState.turnCount
    };
  };

  return {
    ...sourceEffect,
    id: copiedEffectId,
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    limitCount: 1,
    limitNameType: false,
    description: `本回合获得的启动能力：${source.fullName} - ${sourceEffect.description}`,
    condition: (gameState, playerState, instance, event) =>
      instance.cardlocation === 'UNIT' &&
      (instance as any).data?.copiedEffectFrom105000323Turn === gameState.turnCount &&
      (instance as any).data?.[consumedKey] !== gameState.turnCount &&
      (!sourceEffect.condition || sourceEffect.condition(gameState, playerState, instance, event)),
    execute: async (instance, gameState, playerState, event) => {
      markConsumed(instance, gameState);
      if (sourceEffect.execute) {
        await (sourceEffect.execute as any)(instance, gameState, playerState, event);
      }
    },
    onQueryResolve: sourceEffect.onQueryResolve
      ? async (instance, gameState, playerState, selections, context) => {
          markConsumed(instance, gameState);
          await (sourceEffect.onQueryResolve as any)(instance, gameState, playerState, selections, context);
        }
      : undefined
  };
};

const effect_105000323_enter_copy_activate: CardEffect = {
  id: '105000323_enter_copy_activate',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '【诱】同名1回合1次，这个单位进入战场时，选择你的1个红色或白色无颜色限制非神蚀单位、或「斯蒂芬妮」单位，将卡组顶1张背面放逐：本回合中，这个单位获得其1个启动能力，发动一次后失去。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    playerState.deck.length > 0 &&
    playerState.unitZone.some((unit): unit is Card => !!unit && unit.gamecardId !== instance.gamecardId && isCopyTarget(unit)),
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.unitZone.filter((unit): unit is Card =>
      !!unit &&
      unit.gamecardId !== instance.gamecardId &&
      isCopyTarget(unit)
    );
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择复制能力的单位',
      '选择你的1个红色或白色无颜色限制非神蚀单位、或「斯蒂芬妮」单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000323_enter_copy_activate', step: 'COPY_TARGET' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'COPY_TARGET') return;
    const target = selections[0]
      ? playerState.unitZone.find(unit => unit?.gamecardId === selections[0] && isCopyTarget(unit))
      : undefined;
    if (!target) return;

    const topCard = getTopDeckCards(playerState, 1)[0];
    if (!topCard) return;
    moveCardAsCost(gameState, playerState.uid, topCard, 'EXILE', instance, { faceDown: true });

    const copied = (target.effects || []).find(effect => effect.type === 'ACTIVATE' || effect.type === 'ACTIVATED');
    if (!copied) return;

    const copiedEffect = makeOneShotCopiedEffect(target, copied);
    instance.effects = [...(instance.effects || []), copiedEffect];
    (instance as any).data = {
      ...((instance as any).data || {}),
      copiedEffectFrom105000323Turn: gameState.turnCount
    };
    addInfluence(instance, target, `本回合获得启动能力：${copied.description}`);
    EventEngine.recalculateContinuousEffects(gameState);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000323
 * Card2 Row: 445
 * Card Row: 380
 * Source CardNo: SP02-Y03
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位进入战场时，选择你的战场上的1个红色或白色的没有颜色限制的非神蚀单位、或「斯蒂芬妮」单位}[将你的卡组顶的1张卡背面放逐]：本回合中，这个单位获得被选择的单位的一个启能力，得到的能力在发动一次后失去。
 */
const card: Card = {
  id: '105000323',
  fullName: '天魔管理员',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
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
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105000323_enter_copy_activate],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
