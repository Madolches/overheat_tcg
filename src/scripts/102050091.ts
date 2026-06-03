import { Card, CardEffect, GameEvent } from '../types/game';
import { addInfluence, canPayAccessCost, canPutUnitOntoBattlefield, ensureData, moveCard, ownUnits, ownerOf, paymentCost } from './BaseUtil';

const redUnitCount = (cards: (Card | null)[]) =>
  cards.filter((unit): unit is Card => !!unit && unit.color === 'RED').length;

const cardEffects: CardEffect[] = [{
    id: '102050091_red_rush',
    type: 'CONTINUOUS',
    triggerLocation: ['UNIT'],
    description: '你的所有红色神蚀单位获得速攻；此单位可以攻击对手横置单位。',
    applyContinuous: (gameState, instance) => {
      if (instance.cardlocation !== 'UNIT') return;
      const owner = ownerOf(gameState, instance);
      if (!owner) return;
      ownUnits(owner).filter(unit => unit.color === 'RED' && unit.godMark).forEach(unit => {
        unit.isrush = true;
        addInfluence(unit, instance, '获得效果: 【速攻】');
      });
      ensureData(instance).canAttackExhausted = true;
    }
  }, {
    id: '102050091_battle_save',
    type: 'TRIGGER',
    isMandatory: false,
    triggerLocation: ['HAND'],
    isGlobal: true,
    battleDestroySave: true,
    cost: paymentCost(3, 'RED'),
    description: '你的1个单位将要被战斗破坏时，支付三费且我方场上有2个以上红色单位：可以将这张卡从手牌放置到战场上。之后，防止那次破坏。',
    condition: (gameState, playerState, instance, event?: GameEvent) =>
      event?.data?.beforeDestroy === true &&
      event.playerUid === playerState.uid &&
      !!event.targetCardId &&
      instance.cardlocation === 'HAND' &&
      redUnitCount(playerState.unitZone) >= 2 &&
      canPutUnitOntoBattlefield(playerState, instance) &&
      canPayAccessCost(gameState, playerState, 3, 'RED', instance),
    onCostResolve: async (instance, gameState, playerState, _selections, context) => {
      const targetUnitId = context?.targetUnitId;
      if (
        !targetUnitId ||
        instance.cardlocation !== 'HAND' ||
        !canPutUnitOntoBattlefield(playerState, instance)
      ) {
        return;
      }

      const targetName = ownerOf(gameState, instance)?.unitZone
        .find(unit => unit?.gamecardId === targetUnitId)?.fullName || '目标单位';
      const moved = moveCard(gameState, playerState.uid, instance, 'UNIT', instance);
      if (!moved) return;

      context.battleDestroySaveResolved = true;
      gameState.logs.push(`[${instance.fullName}] 从手牌放置到战场，防止了 [${targetName}] 的战斗破坏。`);
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050091
 * Card2 Row: 45
 * Card Row: 45
 * Source CardNo: BT01-R07
 * Package: BT01(SR,ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:你的所有红色神蚀单位获得【速攻】。
 * 【永】:这个单位可以攻击对手的横置单位。
 * 【诱】:[〖支付三费，我方场上有两个或以上的红色单位〗]你的1个单位将要被战斗破坏时，你可以将这张卡从手牌放置到战场上。之后，防止那次破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050091',
  fullName: '烬晓之光「迪凯」',
  specialName: '迪凯',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '伊列宇王国',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 2,
  baseDamage: 2,
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
