import { Card } from '../src/types/game';
import { SERVER_CARD_LIBRARY } from './card_loader';

export type CardInventoryVariation = {
    cardId: string;
    rarity: string;
    uniqueId: string;
};

function isLiveCard(card: Card | undefined): card is Card {
    return !!card?.uniqueId && !card.uniqueId.includes(':legacy');
}

export function getLiveCardVariations(): Card[] {
    const seen = new Set<string>();
    const cards: Card[] = [];

    for (const card of Object.values(SERVER_CARD_LIBRARY)) {
        if (!isLiveCard(card) || seen.has(card.uniqueId)) {
            continue;
        }

        seen.add(card.uniqueId);
        cards.push(card);
    }

    return cards;
}

export function getLiveCardInventoryVariations(): CardInventoryVariation[] {
    return getLiveCardVariations().map(card => ({
        cardId: card.id,
        rarity: card.rarity,
        uniqueId: card.uniqueId
    }));
}

export function getBaseCardIds(): string[] {
    const seen = new Set<string>();
    const cardIds: string[] = [];

    for (const card of getLiveCardVariations()) {
        if (seen.has(card.id)) {
            continue;
        }

        seen.add(card.id);
        cardIds.push(card.id);
    }

    return cardIds;
}
