import { Card, Deck } from '../types/game';
import { getCardAdjustmentGroupId, getCardAdjustmentVersionKey } from './cardAdjustments';
import { getDeckCardIds } from './deckEntries';

type CardResolver = (cardId?: string | null) => Card | undefined;

const resolveDeckCards = (deck: Deck, resolveCard: CardResolver): Card[] | null => {
  const cardIds = getDeckCardIds(deck.cards);
  const cards = cardIds.map(cardId => resolveCard(cardId)).filter(Boolean) as Card[];
  return cards.length === cardIds.length ? cards : null;
};

export const validateDeckForBattle = (deck?: Deck | null, resolveCard?: CardResolver): { valid: boolean; error?: string } => {
  if (!deck) {
    return { valid: false, error: '请先选择一个卡组' };
  }

  if (deck.cards.length !== 50) {
    return { valid: false, error: `卡组必须正好 50 张卡牌（当前: ${deck.cards.length}）` };
  }

  if (!resolveCard) {
    return { valid: false, error: '卡牌目录仍在加载，请稍后再试' };
  }

  const cards = resolveDeckCards(deck, resolveCard);
  if (!cards) {
    return { valid: false, error: '卡组中包含未找到的卡牌，请重新保存该卡组后再试' };
  }

  const godMarkCount = cards.filter(card => card.godMark).length;
  if (godMarkCount > 10) {
    return { valid: false, error: `卡组中带有神蚀标记的卡牌不能超过 10 张（当前: ${godMarkCount}）` };
  }

  const groupCount = new Map<string, number>();
  const groupVersions = new Map<string, string>();
  for (const card of cards) {
    const groupId = getCardAdjustmentGroupId(card);
    const version = getCardAdjustmentVersionKey(card);
    const existingVersion = groupVersions.get(groupId);
    if (existingVersion && existingVersion !== version) {
      return { valid: false, error: `卡牌 [${card.fullName}] 的调整前/后版本不能同时加入卡组` };
    }
    groupVersions.set(groupId, version);

    const nextCount = (groupCount.get(groupId) || 0) + 1;
    if (nextCount > 4) {
      return { valid: false, error: `同名卡牌 [${card.fullName}] 在卡组中不能超过 4 张` };
    }
    groupCount.set(groupId, nextCount);
  }

  return { valid: true };
};
