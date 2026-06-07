import type { Card, PlayerState } from '../types/game';

export type PlayZoneProjectionKind = 'UNIT' | 'ITEM' | 'STORY';

export type PlayZoneProjection = {
  unitZone: (Card | null)[];
  projectedUnitIds: Set<string>;
  projectedUnitSlotByCardId: Map<string, number>;
  itemZone: Card[];
  projectedItemIds: Set<string>;
  storyCards: Card[];
  playZoneIndexByCardId: Map<string, number>;
};

export const getPlayZoneProjectionKind = (card?: Card | null): PlayZoneProjectionKind => {
  if (card?.type === 'UNIT') return 'UNIT';
  if (card?.type === 'ITEM' || card?.isEquip) return 'ITEM';
  return 'STORY';
};

export const getPlayZoneProjection = (player?: PlayerState | null): PlayZoneProjection => {
  const unitZone = [...(player?.unitZone || [])];
  const projectedUnitIds = new Set<string>();
  const projectedUnitSlotByCardId = new Map<string, number>();
  const itemZone = [...((player?.itemZone || []).filter((card): card is Card => !!card))];
  const projectedItemIds = new Set<string>();
  const storyCards: Card[] = [];
  const playZoneIndexByCardId = new Map<string, number>();

  (player?.playZone || []).forEach((card, playIndex) => {
    if (!card?.gamecardId) return;
    playZoneIndexByCardId.set(card.gamecardId, playIndex);

    const projectionKind = getPlayZoneProjectionKind(card);
    if (projectionKind === 'UNIT') {
      const slotIndex = unitZone.findIndex(slot => !slot);
      if (slotIndex >= 0) {
        unitZone[slotIndex] = card;
        projectedUnitIds.add(card.gamecardId);
        projectedUnitSlotByCardId.set(card.gamecardId, slotIndex);
      }
      return;
    }

    if (projectionKind === 'ITEM') {
      itemZone.push(card);
      projectedItemIds.add(card.gamecardId);
      return;
    }

    storyCards.push(card);
  });

  return {
    unitZone,
    projectedUnitIds,
    projectedUnitSlotByCardId,
    itemZone,
    projectedItemIds,
    storyCards,
    playZoneIndexByCardId
  };
};
