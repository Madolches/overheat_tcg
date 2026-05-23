import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, moveCard, moveCardAsCost, story } from './BaseUtil';

const SILVER_MUSIC = '银乐';

const isRecoverableSilverMusic = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  card.fullName.includes(SILVER_MUSIC);

const faceUpErosionFront = (playerState: any) =>
  playerState.erosionFront.filter((card: Card | null): card is Card =>
    !!card && card.displayState === 'FRONT_UPRIGHT'
  );

const millAndOfferRecovery = (instance: Card, gameState: any, playerState: any, amount: number) => {
  if (amount <= 0 || playerState.deck.length < amount) return;

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
    '选择1张由此效果送入墓地的《银乐》非神蚀单位加入手牌。',
    0,
    1,
    { sourceCardId: instance.gamecardId, effectId: '203000125_mill_silver_music', step: 'RECOVER', milledIds },
    () => 'GRAVE'
  );
};

const cardEffects: CardEffect[] = [story('203000125_mill_silver_music', '同名1回合1次：选择1~3张侵蚀区正面卡送入墓地作为-X，将卡组顶X张送入墓地，可以将其中1张卡名含有《银乐》的非神蚀单位加入手牌。', async (instance, gameState, playerState) => {
  const maxAmount = Math.min(3, faceUpErosionFront(playerState).length, playerState.deck.length);
  if (maxAmount <= 0) return;

  createSelectCardQuery(
    gameState,
    playerState.uid,
    faceUpErosionFront(playerState),
    '支付-X',
    '选择侵蚀区中的1~3张正面卡送入墓地。X等于选择张数。',
    1,
    maxAmount,
    { sourceCardId: instance.gamecardId, effectId: '203000125_mill_silver_music', step: 'EROSION_COST' },
    () => 'EROSION_FRONT'
  );
}, {
  limitCount: 1,
  limitNameType: true,
  condition: (_gameState, playerState) =>
    playerState.deck.length > 0 &&
    faceUpErosionFront(playerState).length > 0,
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'EROSION_COST') {
      const selected = selections
        .map(id => playerState.erosionFront.find((card: Card | null) =>
          card?.gamecardId === id && card.displayState === 'FRONT_UPRIGHT'
        ))
        .filter((card): card is Card => !!card)
        .slice(0, 3);

      if (selected.length === 0) return;
      selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'GRAVE', instance));
      millAndOfferRecovery(instance, gameState, playerState, selected.length);
      return;
    }

    if (context?.step !== 'RECOVER' || !selections[0]) return;
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
 * 〖同名1回合1次〗将你侵蚀区正面卡X张送入墓地（X最多为3），将卡组顶X张送入墓地。你可以将1张由于这个效果被送入墓地的卡名含有《银乐》的非神蚀单位卡加入手牌。
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
