import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allUnitsOnField, createSelectCardQuery, freezeUntil, moveCard, paymentCost, untilOpponentEndTurn } from './BaseUtil';

const isShingiCard = (card?: Card) =>
  !!card && (
    card.fullName.includes('神仪') ||
    card.fullName.includes('绁炰华')
  );

const shingiGraveCards = (playerState: any) =>
  playerState.grave.filter((card: Card) => isShingiCard(card));

const freezeTargets = (gameState: any) =>
  allUnitsOnField(gameState).filter(card =>
    !card.godMark &&
    (card.acValue || 0) <= 3
  );

const enteredByShingiEffect = (gameState: any, instance: Card) => {
  const data = (instance as any).data || {};
  if (data.placedByShingiEffectSourceCardId || data.placedByShingiEffectSourceName) return true;
  const source = data.lastMoveEffectSourceCardId
    ? AtomicEffectExecutor.findCardById(gameState, data.lastMoveEffectSourceCardId)
    : undefined;
  return data.lastMovedByEffectTurn === gameState.turnCount &&
    isShingiCard(source);
};

const cardEffects: CardEffect[] = [{
  id: '101000379_leave_recover_shingi',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_FIELD' as any,
  isMandatory: true,
  sourceSnapshotOnLeftField: true,
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'],
  description: '被战斗破坏或由于卡的效果离开战场时，将墓地中的1张卡名含有《神仪》的卡加入手牌。',
  condition: (_gameState, playerState, instance, event) =>
    (
      event?.sourceCardId === instance.gamecardId ||
      event?.data?.previousSourceCardId === instance.gamecardId ||
      event?.sourceCard === instance ||
      (
        !!event?.sourceCard?.runtimeFingerprint &&
        event.sourceCard.runtimeFingerprint === instance.runtimeFingerprint
      )
    ) &&
    (
      event.sourceCard?.id === instance.id ||
      event.sourceCard?.gamecardId === event.sourceCardId ||
      instance.cardlocation === 'UNIT'
    ) &&
    event.data?.sourceZone === 'UNIT' &&
    (
      event.data?.isEffect ||
      event.data?.targetZone === 'GRAVE'
    ) &&
    shingiGraveCards(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    const candidates = shingiGraveCards(playerState);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择神仪卡',
      '选择墓地中的1张卡名含有《神仪》的卡加入手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101000379_leave_recover_shingi' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? playerState.grave.find((card: Card) => card.gamecardId === selections[0]) : undefined;
    if (selected && isShingiCard(selected)) {
      moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    }
  }
}, {
  id: '101000379_shingi_freeze',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：若这个单位由于卡名含有《神仪》的卡的效果进入战场，你的主要阶段，支付1费，冻结战场上1个ACCESS值+3以下的非神蚀单位直到对手回合结束。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    instance.cardlocation === 'UNIT' &&
    enteredByShingiEffect(gameState, instance) &&
    freezeTargets(gameState).length > 0,
  cost: paymentCost(1, 'WHITE'),
  execute: async (instance, gameState, playerState) => {
    const candidates = freezeTargets(gameState);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择冻结目标',
      '选择战场上1个ACCESS值+3以下的非神蚀单位，冻结到对手回合结束。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101000379_shingi_freeze' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择冻结目标',
    description: '选择战场上1个ACCESS值+3以下的非神蚀单位，冻结到对手回合结束。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'TARGET',
    getCandidates: gameState =>
      freezeTargets(gameState)
        .map(card => ({ card, source: 'UNIT' as const }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT' && !target.godMark && (target.acValue || 0) <= 3) {
      freezeUntil(target, instance, untilOpponentEndTurn(gameState, playerState.uid));
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000379
 * Card2 Row: 572
 * Card Row: 456
 * Source CardNo: BT07-W06
 * Package: BT07(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位被战斗破坏或由于卡的效果离开战场时}：将你墓地中的1张卡名含有《神仪》的卡加入手牌。
 * 【启】〖1回合1次〗{若这个单位由于卡名含有《神仪》的卡的效果进入战场，你的主要阶段，选择战场上1个ACCESS值+3以下的非神蚀单位}[AC+1]：直到对手回合结束时为止，将被选择的单位冻结。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101000379',
  fullName: '「小雪女」',
  specialName: '小雪女',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
