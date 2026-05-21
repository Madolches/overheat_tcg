import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allCardsOnField, attackingUnits, createSelectCardQuery, destroyByEffect, ensureData, isBattleFreeContext, totalErosionCount, untilOpponentEndTurn } from './BaseUtil';

const HOLY_KINGDOM = '圣王国';

const isHolyKingdomUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (card.faction === HOLY_KINGDOM || card.fullName.includes('圣王国'));

const isYukatiaAllianceAttack = (gameState: any, playerState: any, instance: Card) => {
  const attackers = attackingUnits(gameState);
  return !!gameState.battleState?.isAlliance &&
    attackers.some(unit => unit.gamecardId === instance.gamecardId) &&
    attackers.some(unit => unit.gamecardId !== instance.gamecardId && isHolyKingdomUnit(unit)) &&
    attackers.every(unit => playerState.unitZone.some((own: Card | null) => own?.gamecardId === unit.gamecardId));
};

const nonGodOpponentFieldCards = (gameState: any, playerUid: string) =>
  allCardsOnField(gameState).filter(card =>
    AtomicEffectExecutor.findCardOwnerKey(gameState, card.gamecardId) !== playerUid &&
    !card.godMark
  );

const cardEffects: CardEffect[] = [{
  id: '101130380_alliance_battle_immune',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ATTACK_DECLARED',
  description: '这个单位参与联军攻击时，直到对手回合结束时为止不会被战斗破坏。',
  condition: (_gameState, playerState, instance, event) =>
    event?.playerUid === playerState.uid &&
    (event.data?.attackerIds || []).includes(instance.gamecardId) &&
    !!event.data?.isAlliance,
  execute: async (instance, gameState, playerState) => {
    const data = ensureData(instance);
    data.preventNextBattleDestroy = true;
    data.preventNextBattleDestroyUntilTurn = untilOpponentEndTurn(gameState, playerState.uid);
    data.preventNextBattleDestroySourceName = instance.fullName;
  }
}, {
  id: '101130380_alliance_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  erosionTotalLimit: [2, 99],
  description: '创痕2，1回合1次：这个单位与<圣王国>单位的联军攻击的战斗自由步骤中，选择对手战场1张非神蚀卡破坏。',
  condition: (gameState, playerState, instance) =>
    isBattleFreeContext(gameState) &&
    instance.cardlocation === 'UNIT' &&
    totalErosionCount(playerState) >= 2 &&
    isYukatiaAllianceAttack(gameState, playerState, instance) &&
    nonGodOpponentFieldCards(gameState, playerState.uid).length > 0,
  execute: async (instance, gameState, playerState) => {
    const candidates = nonGodOpponentFieldCards(gameState, playerState.uid);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择破坏目标',
      '选择对手战场上的1张非神蚀卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101130380_alliance_destroy' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (
      target &&
      ['UNIT', 'ITEM'].includes(target.cardlocation || '') &&
      AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) !== playerState.uid &&
      !target.godMark
    ) {
      destroyByEffect(gameState, target, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130380
 * Card2 Row: 577
 * Card Row: 461
 * Source CardNo: BT07-W11
 * Package: BT07(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【速攻】【英勇】
 * 【诱】{这个单位参与联军攻击时}：直到对手回合结束时为止，这个单位不会被战斗破坏。
 * 【创痕2】【启】〖1回合1次〗{这个单位与<圣王国>单位的联军攻击的战斗自由步骤中，选择对手战场上的1张非神蚀卡}：将被选择的卡破坏
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130380',
  fullName: '王国骑士「尤卡蒂亚」',
  specialName: '尤卡蒂亚',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '圣王国',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: true,
  isHeroic: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
