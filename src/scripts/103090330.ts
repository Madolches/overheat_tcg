import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  backErosionCount,
  createPlayerSelectQuery,
  createSelectCardQuery,
  discardHandCost,
  getOpponentUid,
  getResonanceExiledCard,
  hasResonanceAbility,
  isFeijingUnit,
  isResonanceExileEvent,
  isSilverInstrumentCard,
  millTop,
  moveCard
} from './BaseUtil';

const searchableUnit = (card: Card) =>
  card.type === 'UNIT' && (hasResonanceAbility(card) || isFeijingUnit(card));

const cardEffects: CardEffect[] = [{
  id: '103090330_enter_search',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  description: '进入战场时，舍弃1张手牌：可以将卡组中的1张具有共鸣或【菲晶】的单位卡加入手牌。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    playerState.hand.some(card => card.gamecardId !== instance.gamecardId) &&
    playerState.deck.some(searchableUnit),
  cost: discardHandCost(1),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.deck.filter(searchableUnit),
      '选择共鸣或菲晶单位',
      '选择卡组中的1张具有共鸣或【菲晶】的单位卡加入手牌。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103090330_enter_search', step: 'SEARCH' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'SEARCH') return;
    const target = playerState.deck.find(card => card.gamecardId === selections[0] && searchableUnit(card));
    if (!target) return;
    moveCard(gameState, playerState.uid, target, 'HAND', instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}, {
  id: '103090330_resonance_mill',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  triggerLocation: ['UNIT'],
  erosionBackLimit: [1, 10],
  description: '创痕1：共鸣能力将你的墓地中的卡名含有《银乐器》的卡放逐时，选择1名玩家，将其卡组顶2张送入墓地。',
  condition: (_gameState, playerState, _instance, event) => {
    const exiled = getResonanceExiledCard(event);
    return backErosionCount(playerState) >= 1 && isResonanceExileEvent(event) && !!exiled && isSilverInstrumentCard(exiled);
  },
  execute: async (instance, gameState, playerState) => {
    createPlayerSelectQuery(
      gameState,
      playerState.uid,
      '选择玩家',
      '选择1名玩家，将其卡组顶2张送入墓地。',
      { sourceCardId: instance.gamecardId, effectId: '103090330_resonance_mill', step: 'PLAYER' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const targetUid = selections[0] === 'PLAYER_SELF' ? playerState.uid : getOpponentUid(gameState, playerState.uid);
    millTop(gameState, targetUid, 2, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090330
 * Card2 Row: 452
 * Card Row: 387
 * Source CardNo: BT06-G04
 * Package: BT06(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】｛这个单位进入战场时｝[舍弃1张手牌]：你可以将你的卡组中的1张具有共鸣或【菲晶】的单位卡加入手牌。
 * 【创痕1】【诱】{共鸣能力将你的墓地中的卡名含有《银乐器》的卡放逐时，选择1名玩家}：将被选择的玩家的卡组顶的2张卡送入墓地。
 */
const card: Card = {
  id: '103090330',
  fullName: '「聚居地陷阱师」',
  specialName: '聚居地陷阱师',
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
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
