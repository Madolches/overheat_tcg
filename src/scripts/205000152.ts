import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, isFeijingCard, moveCard, story } from './BaseUtil';

const returnRecords = (playerState: any): { turn: number; ids: string[] }[] =>
  playerState.bt08Y08FeijingExcavationReturns || [];

const feijingDeckCards = (playerState: any) =>
  playerState.deck.filter((card: Card) => isFeijingCard(card));

const cardEffects: CardEffect[] = [story('205000152_exile_feijing_for_next_start', '同名1回合1次：主要阶段，将卡组中2张具有【菲晶】的卡放逐。你的下一个回合开始时，将这些卡加入手牌。', async (instance, gameState, playerState) => {
  createSelectCardQuery(
    gameState,
    playerState.uid,
    feijingDeckCards(playerState),
    '选择菲晶卡',
    '选择卡组中的2张具有【菲晶】的卡放逐。',
    2,
    2,
    { sourceCardId: instance.gamecardId, effectId: '205000152_exile_feijing_for_next_start', step: 'EXILE_FEIJING' },
    () => 'DECK'
  );
}, {
  limitCount: 1,
  limitNameType: true,
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    feijingDeckCards(playerState).length >= 2,
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'EXILE_FEIJING') return;
    const selected = selections
      .map(id => AtomicEffectExecutor.findCardById(gameState, id))
      .filter((card: Card | undefined): card is Card =>
        !!card && card.cardlocation === 'DECK' && isFeijingCard(card)
      );
    if (selected.length !== 2) return;
    selected.forEach(card => moveCard(gameState, playerState.uid, card, 'EXILE', instance));
    (playerState as any).bt08Y08FeijingExcavationReturns = [
      ...returnRecords(playerState),
      { turn: gameState.turnCount, ids: selected.map(card => card.gamecardId) }
    ];
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}), {
  id: '205000152_return_exiled_feijing',
  type: 'TRIGGER',
  triggerLocation: ['PLAY', 'GRAVE', 'EXILE'],
  triggerEvent: 'PHASE_CHANGED',
  isMandatory: true,
  description: '你的下一个回合开始时，将由这张卡效果放逐的菲晶卡加入手牌。',
  condition: (gameState, playerState, _instance, event) =>
    playerState.isTurn &&
    event?.type === 'PHASE_CHANGED' &&
    event.data?.phase === 'START' &&
    returnRecords(playerState).some(record => record.turn < gameState.turnCount),
  execute: async (instance, gameState, playerState) => {
    const ready = returnRecords(playerState).filter(record => record.turn < gameState.turnCount);
    const pending = returnRecords(playerState).filter(record => record.turn >= gameState.turnCount);
    (playerState as any).bt08Y08FeijingExcavationReturns = pending;
    ready.flatMap(record => record.ids).forEach(id => {
      const card = AtomicEffectExecutor.findCardById(gameState, id);
      if (card?.cardlocation === 'EXILE') moveCard(gameState, playerState.uid, card, 'HAND', instance);
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 205000152
 * Card2 Row: 623
 * Card Row: 507
 * Source CardNo: BT08-Y08
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖同名1回合1次〗{你的主要阶段}:将你的卡组中的2张具有【菲晶】的卡放逐。你的下一次回合开始时，将被这张卡的效果放逐的卡加入你的手牌。
 */
const card: Card = {
  id: '205000152',
  fullName: '菲晶的发掘',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: true,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
