import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addInfluence, appendEndResolution, createSelectCardQuery, destroyByEffect, ensureData, getOpponentUid, ownUnits, ownerOf, paymentCost } from './BaseUtil';

const cardEffects: CardEffect[] = [{
    id: '103090078_attack_gate',
    type: 'CONTINUOUS',
    description: '你的<瑟诺布>单位少于2个时，不能宣言攻击和防御。',
    applyContinuous: (gameState, instance) => {
      const owner = ownerOf(gameState, instance);
      if (!owner || ownUnits(owner).filter(unit => unit.faction === '瑟诺布').length >= 2) return;
      (instance as any).battleForbiddenByEffect = true;
      addInfluence(instance, instance, '不能宣言攻击和防御');
    }
  }, {
    id: '103090078_destroy_later',
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    limitCount: 1,
    limitNameType: true,
    description: '主要阶段，支付1费并横置：选择对手1个力量不高于此单位的非神蚀单位，回合结束时破坏。',
    condition: (gameState, playerState, instance) => {
      if (!playerState.isTurn || gameState.phase !== 'MAIN' || instance.isExhausted) return false;
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      return ownUnits(opponent).some(unit =>
        !unit.godMark &&
        (unit.power || 0) <= (instance.power || 0)
      );
    },
    targetSpec: {
      title: '选择破坏预约对象',
      description: '选择对手的1个力量值在这个单位以下的非神蚀单位，回合结束时破坏。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'OPPONENT',
      step: 'TARGET',
      getCandidates: (gameState, playerState, instance) => {
        const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
        return ownUnits(opponent)
          .filter(unit => !unit.godMark && (unit.power || 0) <= (instance.power || 0))
          .map(card => ({ card, source: 'UNIT' as any }));
      }
    },
    cost: async (gameState, playerState, instance) => {
      const paid = await paymentCost(1, 'GREEN')!(gameState, playerState, instance);
      instance.isExhausted = true;
      return paid;
    },
    execute: async (instance, gameState, playerState) => {
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      const candidates = ownUnits(opponent).filter(unit =>
        !unit.godMark &&
        (unit.power || 0) <= (instance.power || 0)
      );
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择破坏预约对象',
        '选择对手的1个力量值在这个单位以下的非神蚀单位，回合结束时破坏。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '103090078_destroy_later' }
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      const target = ownUnits(opponent).find(unit => unit.gamecardId === selections[0]);
      if (!target) return;
      const data = ensureData(target);
      data.destroyAtEndBy = instance.fullName;
      data.destroyAtEndSourceCardId = instance.gamecardId;
      data.destroyAtEndSourcePlayerUid = playerState.uid;
      addInfluence(target, instance, '回合结束时破坏');
      appendEndResolution(gameState, playerState.uid, instance, '103090078_end_destroy', (source, state) => {
        const live = AtomicEffectExecutor.findCardById(state, target.gamecardId);
        if (!live) return;
        delete (live as any).data?.destroyAtEndBy;
        delete (live as any).data?.destroyAtEndSourceCardId;
        delete (live as any).data?.destroyAtEndSourcePlayerUid;
        destroyByEffect(state, live, source);
      });
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090078
 * Card2 Row: 26
 * Card Row: 26
 * Source CardNo: BT01-G05
 * Package: BT01(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:你的战场上的<瑟诺布>单位有2个以上时，这个单位才能宣言攻击和防御。
 * 【启】〖同名1回合1次〗:[〖支付1费〗，〖横置〗]这个能力只能在你的主要阶段中发动。选择对手的1个力量值在这个单位以下的非神蚀单位，回合结束时，将那个单位破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103090078',
  fullName: '移动风车炮',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '瑟诺布',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
