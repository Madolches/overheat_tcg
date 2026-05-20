import { Card, GameState } from '../types/game';
import { grantedTotemReviveFromGrave } from '../scripts/BaseUtil';

// use import.meta.glob to load all scripts from ../scripts
const modules = import.meta.glob('../scripts/*.ts', { eager: true });

export const CARD_LIBRARY: Record<string, Card> = {};

const isCardModule = (mod: any): mod is { default: Card } =>
  !!mod?.default &&
  typeof mod.default === 'object' &&
  typeof mod.default.id === 'string';

// Process modules to fill the library
Object.keys(modules).forEach((path) => {
  const mod = modules[path] as any;
  if (isCardModule(mod)) {
    CARD_LIBRARY[mod.default.id] = mod.default;
  }
});

export function hydrateCard(card: Card | null) {
  if (!card || !card.id) return;
  const masterCard = CARD_LIBRARY[card.id];
  if (!card.baseColorReq) {
    card.baseColorReq = { ...(masterCard?.colorReq || card.colorReq || {}) };
  }
  if (masterCard) {
    card.basePower = card.basePower ?? masterCard.basePower ?? masterCard.power;
    card.baseDamage = card.baseDamage ?? masterCard.baseDamage ?? masterCard.damage;
    card.baseAcValue = card.baseAcValue ?? masterCard.baseAcValue ?? masterCard.acValue;
    card.baseIsrush = card.baseIsrush ?? masterCard.baseIsrush ?? masterCard.isrush ?? false;
    card.baseCanAttack = card.baseCanAttack ?? masterCard.baseCanAttack ?? masterCard.canAttack ?? true;
    card.baseGodMark = card.baseGodMark ?? masterCard.baseGodMark ?? masterCard.godMark;
    card.baseCanActivateEffect = card.baseCanActivateEffect ?? masterCard.baseCanActivateEffect ?? masterCard.canActivateEffect ?? true;
    if (card.isrush === undefined) card.isrush = card.baseIsrush;
    if (card.canAttack === undefined) card.canAttack = card.baseCanAttack;
    if (card.godMark === undefined) card.godMark = !!card.baseGodMark;
  }
  if (masterCard && masterCard.effects) {
    // Re-assign effects to restore functions lost during JSON serialization
    card.effects = masterCard.effects.map((originalEffect, idx) => {
      const runtimeEffect = card.effects ? card.effects[idx] : null;
      return {
        ...(runtimeEffect || originalEffect),
        condition: originalEffect.condition,
        execute: originalEffect.execute,
        cost: originalEffect.cost,
        onQueryResolve: originalEffect.onQueryResolve,
        resolve: originalEffect.resolve,
        targetSpec: originalEffect.targetSpec,
        applyContinuous: originalEffect.applyContinuous,
        removeContinuous: originalEffect.removeContinuous
      };
    });
  }
  if (
    card.type === 'UNIT' &&
    card.fullName?.includes('图腾') &&
    !card.effects?.some(effect => effect.id === '103080184_granted_totem_revive')
  ) {
    card.effects = [...(card.effects || []), grantedTotemReviveFromGrave()];
  }
}

export function hydrateGameState(gameState: GameState) {
  if (!gameState || !gameState.players) return;

  Object.values(gameState.players).forEach(player => {
    const zones = [
        player.hand, player.deck, player.grave, player.exile,
        player.unitZone, player.itemZone, player.erosionFront, player.erosionBack, player.playZone
    ];
    zones.forEach(zone => {
      zone.forEach(card => {
        if (card) hydrateCard(card);
      });
    });
  });

  // Also hydrate cards in the counter stack
  if (gameState.counterStack) {
    gameState.counterStack.forEach(item => {
      if (item.card) hydrateCard(item.card);
    });
  }

  // Also hydrate cards in pending query options
  if (gameState.pendingQuery && gameState.pendingQuery.options) {
    gameState.pendingQuery.options.forEach(opt => {
      if (opt.card) hydrateCard(opt.card);
    });
  }
}
