import { Card, CardEffect } from '../types/game';
import { backErosionCount, story } from './BaseUtil';

const findOpponentAccessThreeNonGodPlay = (gameState: any, playerUid: string) => {
  for (let index = (gameState.counterStack?.length || 0) - 1; index >= 0; index -= 1) {
    const item = gameState.counterStack[index];
    const card = item?.card as Card | undefined;
    if (
      item?.type === 'PLAY' &&
      item.ownerUid !== playerUid &&
      !item.isNegated &&
      card &&
      !card.godMark &&
      (card.acValue || 0) === 3
    ) {
      return item;
    }
  }
  return undefined;
};

const cardEffects: CardEffect[] = [story('204030123_counter_access_three_non_god', '创痕1：对手使用ACCESS值+3的非神蚀卡时，反击那张卡。', async (instance, gameState, playerState) => {
  const target = findOpponentAccessThreeNonGodPlay(gameState, playerState.uid);
  if (!target) return;
  target.isNegated = true;
  gameState.logs.push(`[${instance.fullName}] 反击了 [${target.card?.fullName || '对手使用的非神蚀卡'}]。`);
}, {
  condition: (gameState, playerState) =>
    gameState.phase === 'COUNTERING' &&
    backErosionCount(playerState) >= 1 &&
    !!findOpponentAccessThreeNonGodPlay(gameState, playerState.uid)
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 204030123
 * Card2 Row: 634
 * Card Row: 518
 * Source CardNo: BT08-B08
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕1】{对手使用ACCESS值+3的非神蚀卡时}:反击那张卡。
 */
const card: Card = {
  id: '204030123',
  fullName: '任务：护卫商队',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '冒险家公会',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
