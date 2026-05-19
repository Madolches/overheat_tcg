import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, moveCard } from './BaseUtil';

const isWhiteOrGreenUnit = (card?: Card) =>
  !!card &&
  card.type === 'UNIT' &&
  (AtomicEffectExecutor.matchesColor(card, 'WHITE') || AtomicEffectExecutor.matchesColor(card, 'GREEN'));

const effect_104000269_hand_unit_filter: CardEffect = {
  id: '104000269_hand_unit_filter',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  isGlobal: true,
  limitCount: 1,
  limitNameType: true,
  description: '【诱】同名1回合1次，你的白色或绿色单位卡从手牌放置到战场上时：你可以抽1张卡。之后，舍弃1张手牌。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    event?.playerUid === playerState.uid &&
    event.data?.zone === 'UNIT' &&
    event.data?.sourceZone === 'HAND' &&
    isWhiteOrGreenUnit(event.sourceCard as Card | undefined) &&
    playerState.deck.length > 0,
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
    if (gameState.gameStatus === 2 || playerState.hand.length === 0) return;

    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.hand,
      '选择舍弃手牌',
      '选择1张手牌舍弃。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '104000269_hand_unit_filter', step: 'DISCARD_AFTER_DRAW' },
      () => 'HAND'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'DISCARD_AFTER_DRAW') return;
    const target = selections[0] ? playerState.hand.find(card => card.gamecardId === selections[0]) : undefined;
    if (target) moveCard(gameState, playerState.uid, target, 'GRAVE', instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104000269
 * Card2 Row: 428
 * Card Row: 311
 * Source CardNo: SP02-B02
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{你的白色或绿色单位卡从手牌放置到战场上时}:你可以抽1张卡。之后，舍弃1张手牌。
 */
const card: Card = {
  id: '104000269',
  fullName: '兽神之替补',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
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
  effects: [effect_104000269_hand_unit_filter],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
