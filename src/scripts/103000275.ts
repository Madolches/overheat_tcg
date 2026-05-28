import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addContinuousKeyword,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  getOpponentUid,
  moveCardAsCost,
  ownUnits,
  putUnitOntoField
} from './BaseUtil';

const differentColorNonGodUnitsInGrave = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.type === 'UNIT' && !card.godMark);

const hasIrodoriThreeCost = (playerState: any) =>
  new Set(differentColorNonGodUnitsInGrave(playerState).map((card: Card) => card.color)).size >= 3;

const payIrodoriThreeCost = (gameState: any, playerState: any, instance: Card, selections: string[]) => {
  const selected = selections
    .map(id => playerState.grave.find((card: Card) => card.gamecardId === id))
    .filter((card: Card | undefined): card is Card => !!card && card.type === 'UNIT' && !card.godMark);
  const colors = new Set(selected.map(card => card.color));
  if (selected.length !== 3 || colors.size !== 3) return false;

  selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
  return true;
};

const effect_103000275_irodori_enter: CardEffect = {
  id: '103000275_irodori_enter',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '【启】同名1回合1次，异彩3：将墓地3种颜色的非神蚀单位各1张放逐，将手牌中的这张卡放置到战场上。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'HAND' &&
    playerState.isTurn &&
    canPutUnitOntoBattlefield(playerState, instance) &&
    hasIrodoriThreeCost(playerState),
  cost: async (gameState, playerState, instance) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      differentColorNonGodUnitsInGrave(playerState),
      '选择异彩费用',
      '选择墓地中3种颜色的非神蚀单位卡各1张放逐。',
      3,
      3,
      { sourceCardId: instance.gamecardId, effectId: '103000275_irodori_enter', costType: 'SP02_G04_IRODORI3' },
      () => 'GRAVE'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    if (putUnitOntoField(gameState, playerState.uid, instance, instance)) {
      (instance as any).data = {
        ...((instance as any).data || {}),
        enteredByIrodoriTurn: gameState.turnCount
      };
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType !== 'SP02_G04_IRODORI3') return;
    if (!payIrodoriThreeCost(gameState, playerState, instance, selections)) {
      context.cancelActivation = true;
    }
  }
};

const effect_103000275_white_heroic: CardEffect = {
  id: '103000275_white_heroic',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '【永】你的战场上有白色单位时，这个单位获得【英勇】。',
  applyContinuous: (gameState, instance) => {
    const owner = Object.values(gameState.players).find(player => player.unitZone.some(unit => unit?.gamecardId === instance.gamecardId));
    if (!owner) return;
    if (ownUnits(owner).some(unit => AtomicEffectExecutor.matchesColor(unit, 'WHITE'))) {
      addContinuousKeyword(instance, instance, 'heroic');
    }
  }
};

const effect_103000275_attack_tap: CardEffect = {
  id: '103000275_attack_tap',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ATTACK_DECLARED',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  description: '【诱】你的战场上有蓝色单位，这个单位宣言攻击时，选择对手的1个非神蚀单位：将其横置。',
  condition: (gameState, playerState, instance, event) => {
    if (event?.sourceCardId !== instance.gamecardId) return false;
    if (!ownUnits(playerState).some(unit => AtomicEffectExecutor.matchesColor(unit, 'BLUE'))) return false;
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    return ownUnits(opponent).some(unit => !unit.godMark);
  },
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    const candidates = ownUnits(opponent).filter(unit => !unit.godMark);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择横置单位',
      '选择对手的1个非神蚀单位，将其横置。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000275_attack_tap' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (_instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT' && !target.godMark) {
      target.isExhausted = true;
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000275
 * Card2 Row: 434
 * Card Row: 317
 * Source CardNo: SP02-G04
 * Package: SP02(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【歼灭】
 * 【启】〖同名1回合1次〗:异彩3。
 * 【永】{你的战场上有白色单位}:这个单位获得【英勇】。
 * 【诱】{你的战场上有蓝色单位，这个单位宣言攻击时，选择对手的一个非神蚀单位}:将被选择的单位横置。
 */
const card: Card = {
  id: '103000275',
  fullName: '兽神之胜利「维多利亚」',
  specialName: '维多利亚',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 3 },
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
  isAnnihilation: true,
  baseAnnihilation: true,
  isHeroic: false,
  baseHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_103000275_irodori_enter, effect_103000275_white_heroic, effect_103000275_attack_tap],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
