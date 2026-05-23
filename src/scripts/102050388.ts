import { Card, CardEffect } from '../types/game';
import { canActivateDefaultTiming, createSelectCardQuery, isSameFactionCard, moveCard, moveCardAsCost } from './BaseUtil';

const graveTargets = (playerState: any, instance: Card) =>
  playerState.grave.filter((card: Card) =>
    card.type === 'UNIT' &&
    isSameFactionCard(card, instance)
  );

const cardEffects: CardEffect[] = [{
  id: '102050388_exile_self_recover_ileu_units',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '你的主要阶段，将这个单位放逐：将墓地中的2张同势力单位放置到卡组底。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    graveTargets(playerState, instance).length >= 2,
  cost: async (gameState, playerState, instance) => {
    if (instance.cardlocation !== 'UNIT') return false;
    moveCardAsCost(gameState, playerState.uid, instance, 'EXILE', instance);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      graveTargets(playerState, instance),
      '选择回收单位',
      '选择墓地中的2张同势力单位放置到卡组底。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '102050388_exile_self_recover_ileu_units' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    selections
      .map(id => playerState.grave.find((card: Card) => card.gamecardId === id && card.type === 'UNIT' && isSameFactionCard(card, instance)))
      .filter((card: Card | undefined): card is Card => !!card)
      .slice(0, 2)
      .forEach(card => moveCard(gameState, playerState.uid, card, 'DECK', instance, { insertAtBottom: true }));
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050388
 * Card2 Row: 595
 * Card Row: 478
 * Source CardNo: BT08-R02
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】[将这个单位放逐]:将你墓地中的2张<伊列宇王国>的单位卡放置到你的卡组底。
 */
const card: Card = {
  id: '102050388',
  fullName: '伊列宇剑士',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '伊列宇王国',
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
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
