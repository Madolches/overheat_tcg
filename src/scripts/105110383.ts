import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addContinuousDamage,
  addContinuousKeyword,
  addContinuousPower,
  canPutCardOntoBattlefieldByEffect,
  createSelectCardQuery,
  getTopDeckCards,
  moveCardAsCost,
  nameContains,
  putCardOntoField,
  revealDeckCards
} from './BaseUtil';

const stephanieCandidates = (playerState: any) =>
  getTopDeckCards(playerState, 2).filter((card: Card) =>
    !card.godMark &&
    (nameContains(card, '蓝图') || nameContains(card, '魔偶')) &&
    canPutCardOntoBattlefieldByEffect(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '105110383_creation_scar_put_top_blueprint_or_puppet',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：你的主要阶段，将卡组顶1张卡背面放逐，公开卡组顶2张，可将其中1张卡名含有《蓝图》或《魔偶》的非神蚀卡放置到战场。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    playerState.deck.length >= 3,
  cost: async (gameState, playerState, instance) => {
    const top = getTopDeckCards(playerState, 1)[0];
    if (!top) return false;
    moveCardAsCost(gameState, playerState.uid, top, 'EXILE', instance, { faceDown: true });
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    revealDeckCards(gameState, playerState.uid, 2, instance);
    const candidates = stephanieCandidates(playerState);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择蓝图或魔偶卡',
      '从公开的卡中选择1张卡名含有《蓝图》或《魔偶》的非神蚀卡放置到战场。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110383_creation_scar_put_top_blueprint_or_puppet' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || !stephanieCandidates(playerState).some(card => card.gamecardId === selected.gamecardId)) return;
    putCardOntoField(gameState, playerState.uid, selected, instance);
  }
}, {
  id: '105110383_creation_scar_stats',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  erosionBackLimit: [2, 99],
  description: '创痕：这张卡伤害+2，力量+1500，并获得【英勇】。',
  applyContinuous: (_gameState, instance) => {
    addContinuousDamage(instance, instance, 2);
    addContinuousPower(instance, instance, 1500);
    addContinuousKeyword(instance, instance, 'heroic');
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110383
 * Card2 Row: 580
 * Card Row: 464
 * Source CardNo: BT07-Y03
 * Package: BT07(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗{你的主要阶段}[将你卡组顶的1张卡背面放逐]:公开你卡组顶的2张卡，你可以从中选择1张卡名含有《蓝图》或《魔偶》的非神蚀卡，将其放置到战场上。其余的卡按原样放回。（放逐区中的背面卡可以被其持有者确认）
 * 【创痕3】【永】：这个单位〖伤害+2〗〖力量+1500〗，获得【英勇】。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110383',
  fullName: '学院魔偶师「斯蒂芬妮」',
  specialName: '斯蒂芬妮',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '学院要塞',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: false,
  baseHeroic: false,
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
