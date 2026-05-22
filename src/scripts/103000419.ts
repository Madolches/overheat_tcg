import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addInfluence, allUnitsOnField, createSelectCardQuery, ensureData } from './BaseUtil';

const ohDisabled = (instance: Card) => !!(instance as any).data?.ohEffectDisabledUntilOwnStartUid;

const cardEffects: CardEffect[] = [{
  id: '103000419_set_unit_power_zero',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  erosionTotalLimit: [10, 99],
  description: '10+：1回合1次，选择战场上的1个单位，本回合中力量变为0；直到下一次你的回合开始失去这个启动能力。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isGoddessMode &&
    !ohDisabled(instance) &&
    allUnitsOnField(gameState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      allUnitsOnField(gameState),
      '选择力量0目标',
      '选择战场上的1个单位，本回合中力量变为0。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000419_set_unit_power_zero' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT') {
      const data = ensureData(target);
      data.forcePowerToZeroUntilTurn = gameState.turnCount;
      data.forcePowerToZeroSourceName = instance.fullName;
      target.power = 0;
      addInfluence(target, instance, '本回合力量变为0');
    }
    ensureData(instance).ohEffectDisabledUntilOwnStartUid = playerState.uid;
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000419
 * Card2 Row: 642
 * Card Row: 524
 * Source CardNo: BT08-G05
 * Package: BT08(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【歼灭】
 * 【永】:与这个单位进行战斗的对手的非神蚀单位变为〖力量0〗。
 * 〖10+〗【启】〖1回合1次〗{选择战场上的1个单位}:本回合中，被选择的单位变为〖力量0〗。直到下一次你的回合开始时为止，失去这个【启】能力。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000419',
  fullName: '圣神八部「夜叉」',
  specialName: '夜叉',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '无',
  acValue: 4,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
