import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, getTopDeckCards, moveCard } from './BaseUtil';

const isRedOrBlueCard = (card: Card) =>
  AtomicEffectExecutor.matchesColor(card, 'RED') || AtomicEffectExecutor.matchesColor(card, 'BLUE');

const wasSentToGraveByNonBattleWay = (gameState: any, instance: Card, event: any) => {
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

const effect_105000285_non_battle_grave: CardEffect = {
  id: '105000285_non_battle_grave',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_ZONE',
  triggerLocation: ['GRAVE'],
  description: '【诱】战场上的这个单位由于战斗破坏以外的方式送入墓地时：检视卡组顶3张，可将其中1张红色或蓝色卡公开并加入手牌，其余原样放回并洗切。',
  condition: (gameState, playerState, instance, event) =>
    instance.cardlocation === 'GRAVE' &&
    wasSentToGraveByNonBattleWay(gameState, instance, event) &&
    getTopDeckCards(playerState, 3).some(isRedOrBlueCard),
  execute: async (instance, gameState, playerState) => {
    const candidates = getTopDeckCards(playerState, 3).filter(isRedOrBlueCard);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择红色或蓝色卡',
      '从卡组顶3张中选择1张红色或蓝色卡加入手牌。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000285_non_battle_grave' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0]
      ? playerState.deck.find(card => card.gamecardId === selections[0] && isRedOrBlueCard(card))
      : undefined;
    if (selected) moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000285
 * Card2 Row: 444
 * Card Row: 327
 * Source CardNo: SP02-Y02
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{战场上的这个单位由于战斗破坏以外的方式送入墓地时}：检视你的卡组顶的3张卡，你可以从中选择1张红色或蓝色卡公开，将其加入手牌，将其余的卡按原样放回，将你的卡组洗切。
 */
const card: Card = {
  id: '105000285',
  fullName: '炽月·教练',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
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
  effects: [effect_105000285_non_battle_grave],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
