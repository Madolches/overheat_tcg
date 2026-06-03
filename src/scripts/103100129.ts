import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '103100129_return_witch',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  triggerLocation: ['GRAVE'],
  description: '从战场送入墓地时，选择墓地中1张《魔女的仆从》以外卡名含《魔女》的单位卡加入手牌。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'GRAVE' &&
    event.data?.sourceZone === 'UNIT' &&
    playerState.grave.some(card => card.id !== '103100129' && card.type === 'UNIT' && card.fullName.includes('魔女')),
  targetSpec: {
    title: '选择加入手牌的魔女',
    description: '选择你的墓地中的1张《魔女的仆从》以外的卡名含有《魔女》的单位卡，将其加入手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      playerState.grave
        .filter(card => card.id !== '103100129' && card.type === 'UNIT' && card.fullName.includes('魔女'))
        .map(card => ({ card, source: 'GRAVE' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.grave.filter(card =>
      card.id !== '103100129' &&
      card.type === 'UNIT' &&
      card.fullName.includes('魔女')
    );
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择加入手牌的魔女',
      '选择你的墓地中的1张《魔女的仆从》以外的卡名含有《魔女》的单位卡，将其加入手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103100129_return_witch' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'GRAVE') moveCard(gameState, playerState.uid, target, 'HAND', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103100129
 * Card2 Row: 107
 * Card Row: 107
 * Source CardNo: BT02-G01
 * Package: BT02(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位从你的战场上送入墓地时，选择你的墓地中的1张《魔女的仆从》以外的卡名含有《魔女》的单位卡，将其加入手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103100129',
  fullName: '魔女的仆从',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '艾柯利普斯',
  acValue: 1,
  power: 500,
  basePower: 500,
  damage: 0,
  baseDamage: 0,
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
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
