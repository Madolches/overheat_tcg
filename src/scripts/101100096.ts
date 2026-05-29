import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addInfluence, createSelectCardQuery, ensureData, erosionCost, moveCard, ownerOf, paymentCost, readyByEffect } from './BaseUtil';

const cardEffects: CardEffect[] = [{
    id: '101100096_alliance_protect',
    type: 'CONTINUOUS',
    description: '此单位参与的联军攻击中，你的白色联军单位不会被破坏。',
    applyContinuous: (gameState, instance) => {
      const owner = ownerOf(gameState, instance);
      if (!owner || !gameState.battleState?.isAlliance || !gameState.battleState.attackers.includes(instance.gamecardId)) return;
      gameState.battleState.attackers
        .map(id => owner.unitZone.find(unit => unit?.gamecardId === id))
        .filter((unit): unit is Card => !!unit && AtomicEffectExecutor.matchesColor(unit, 'WHITE'))
        .forEach(unit => {
          (unit as any).battleImmuneByEffect = true;
          ensureData(unit).indestructibleByEffect = true;
          addInfluence(unit, instance, '联军攻击中不会被破坏');
        });
    }
  }, {
    id: '101100096_reset_after_attack',
    type: 'TRIGGER',
    triggerEvent: 'BATTLE_ENDED',
  isMandatory: false,
    triggerLocation: ['UNIT'],
    limitCount: 1,
    description: '此单位参与的攻击结束后，支付1费：将你的所有参战单位重置。',
    condition: (_gameState, playerState, instance, event) =>
      event?.playerUid === playerState.uid &&
      Array.isArray(event?.data?.attackerIds) &&
      event.data.attackerIds.includes(instance.gamecardId),
    cost: paymentCost(1, 'WHITE'),
    execute: async (instance, _gameState, playerState, event) => {
      const ids = event?.data?.attackerIds || [];
      ids.forEach((id: string) => {
        const unit = playerState.unitZone.find(card => card?.gamecardId === id);
        if (unit) {
          readyByEffect(_gameState, unit, instance);
          unit.inAllianceGroup = false;
          addInfluence(unit, instance, '因效果重置');
        }
      });
    }
  }, {
    id: '101100096_ten_bottom',
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    limitCount: 1,
    limitGlobal: true,
    erosionTotalLimit: [10, 10],
    description: '10+，1游戏1次，侵蚀1：选择墓地6张卡放到卡组底。',
    cost: erosionCost(1),
    execute: async (instance, gameState, playerState) => {
      if (playerState.grave.length === 0) return;
      const count = Math.min(6, playerState.grave.length);
      createSelectCardQuery(
        gameState,
        playerState.uid,
        playerState.grave,
        '选择放回卡组底的卡',
        `选择你的墓地中的${count}张卡，放置到卡组底。`,
        count,
        count,
        { sourceCardId: instance.gamecardId, effectId: '101100096_ten_bottom' },
        () => 'GRAVE'
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      selections
        .map(id => playerState.grave.find(card => card.gamecardId === id))
        .filter((card): card is Card => !!card)
        .forEach(card => moveCard(gameState, playerState.uid, card, 'DECK', instance, { insertAtBottom: true }));
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101100096
 * Card2 Row: 56
 * Card Row: 56
 * Source CardNo: BT01-W01
 * Package: BT01(SR,ESR,OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:这个单位参与的联军攻击中，你的白色联军单位不会被破坏。
 * 【诱】〖1回合1次〗:[〖支付一费〗]这个单位参与的攻击结束时，你可以将你的所有参战单位重置。
 * 〖10+〗【启】〖1游戏1次〗:[〖侵蚀1〗]选择你的墓地中的6张卡，放置到卡组底。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101100096',
  fullName: '女神的微笑「柯莉尔」',
  specialName: '柯莉尔',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '艾柯利普斯',
  acValue: 2,
  power: 500,
  basePower: 500,
  damage: 1,
  baseDamage: 1,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
