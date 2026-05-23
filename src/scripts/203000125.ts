import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, moveCard, story } from './BaseUtil';

const isRecoverableSilverMusic = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  card.fullName.includes('银乐');

const cardEffects: CardEffect[] = [story('203000125_mill_silver_music', '同名1回合1次：将卡组顶最多3张送入墓地，可以将其中1张卡名含有《银乐》的非神蚀单位加入手牌。', async (instance, gameState, playerState) => {
  const amount = Math.min(3, playerState.deck.length);
  const milledIds = playerState.deck.slice(-amount).map((card: Card) => card.gamecardId);
  for (let i = 0; i < amount; i += 1) {
    const top = playerState.deck[playerState.deck.length - 1];
    if (top) moveCard(gameState, playerState.uid, top, 'GRAVE', instance);
  }
  const recoverable = playerState.grave.filter((card: Card) =>
    milledIds.includes(card.gamecardId) &&
    isRecoverableSilverMusic(card)
  );
  if (recoverable.length === 0) return;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    recoverable,
    '选择加入手牌',
    '可以选择1张由于这个效果送入墓地的卡名含有《银乐》的非神蚀单位加入手牌。',
    0,
    1,
    { sourceCardId: instance.gamecardId, effectId: '203000125_mill_silver_music', milledIds },
    () => 'GRAVE'
  );
}, {
  limitCount: 1,
  limitNameType: true,
  condition: (_gameState, playerState) => playerState.deck.length > 0,
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (!selections[0]) return;
    const milledIds = context?.milledIds || [];
    const target = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!target || target.cardlocation !== 'GRAVE' || !milledIds.includes(target.gamecardId) || !isRecoverableSilverMusic(target)) return;
    moveCard(gameState, playerState.uid, target, 'HAND', instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203000125
 * Card2 Row: 645
 * Card Row: 527
 * Source CardNo: BT08-G08
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖同名1回合1次〗将你卡组顶的X张卡送入墓地（X最多为3）。你可以将1张由于这个效果被送入墓地的卡名含有《银乐》的非神蚀单位卡加入手牌。
 */
const card: Card = {
  id: '203000125',
  fullName: '银乐笙歌',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
