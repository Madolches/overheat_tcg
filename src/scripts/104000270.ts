import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutCardOntoBattlefieldByEffect, createSelectCardQuery, moveCard } from './BaseUtil';

const isRedOrYellowNonGodFieldCard = (card: Card) =>
  !card.godMark &&
  (card.type === 'UNIT' || card.type === 'ITEM') &&
  (AtomicEffectExecutor.matchesColor(card, 'RED') || AtomicEffectExecutor.matchesColor(card, 'YELLOW'));

const canPlaceFromHand = (playerState: any, card: Card) =>
  card.cardlocation === 'HAND' &&
  isRedOrYellowNonGodFieldCard(card) &&
  canPutCardOntoBattlefieldByEffect(playerState, card);

const wasMovedToGraveByNonBattleWay = (gameState: any, instance: Card, event: any) => {
  if (
    event?.type !== 'CARD_LEFT_ZONE' ||
    event.sourceCardId !== instance.gamecardId ||
    event.data?.zone !== 'UNIT' ||
    event.data?.targetZone !== 'GRAVE'
  ) {
    return false;
  }

  const movedCard = event.sourceCard as Card | undefined;
  const movedAsCost = (movedCard as any)?.data?.lastMovedAsCostTurn === gameState.turnCount;
  return !!event.data?.isEffect || movedAsCost;
};

const effect_104000270_non_battle_grave: CardEffect = {
  id: '104000270_non_battle_grave',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_ZONE',
  triggerLocation: ['GRAVE'],
  limitCount: 1,
  limitNameType: true,
  description: '【诱】同名1回合1次，战场上的这个单位由于战斗以外的方式送入墓地时：抽1张卡，将你的手牌中的1张红色或黄色的非神蚀卡放置在战场中。',
  condition: (gameState, playerState, instance, event) =>
    instance.cardlocation === 'GRAVE' &&
    wasMovedToGraveByNonBattleWay(gameState, instance, event) &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
    if (gameState.gameStatus === 2) return;

    const candidates = playerState.hand.filter(card => canPlaceFromHand(playerState, card));
    if (candidates.length === 0) return;

    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择放置到战场的卡',
      '选择手牌中的1张红色或黄色的非神蚀单位或道具卡放置到战场。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104000270_non_battle_grave' },
      () => 'HAND'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0]
      ? playerState.hand.find(card => card.gamecardId === selections[0] && canPlaceFromHand(playerState, card))
      : undefined;
    if (!target) return;

    if (target.type === 'UNIT') {
      moveCard(gameState, playerState.uid, target, 'UNIT', instance);
    } else if (target.type === 'ITEM') {
      moveCard(gameState, playerState.uid, target, 'ITEM', instance);
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104000270
 * Card2 Row: 429
 * Card Row: 312
 * Source CardNo: SP02-B03
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{战场上的这个单位由于战斗以外的方式送入墓地时}:抽1张卡，将你的手牌中的1张红色或黄色的非神蚀卡放置在战场上
 */
const card: Card = {
  id: '104000270',
  fullName: '炽月·助理',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '无',
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
  effects: [effect_104000270_non_battle_grave],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
