import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addTemporaryColor,
  createSelectCardQuery,
  isAlchemyCard,
  moveCard,
  wasSentFromFieldToGraveByAlchemyEffect
} from './BaseUtil';

const allColors = ['WHITE', 'BLUE', 'GREEN', 'RED', 'YELLOW'];

const alchemyGraveCards = (playerState: any) =>
  playerState.grave.filter((card: Card) => isAlchemyCard(card));

const drawAndExileSelf = async (instance: Card, gameState: any, playerState: any) => {
  if (playerState.deck.length > 0) {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
  const liveSelf = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
  if (liveSelf?.cardlocation === 'GRAVE') {
    moveCard(gameState, playerState.uid, liveSelf, 'EXILE', instance);
  }
};

const cardEffects: CardEffect[] = [{
  id: '305000062_all_colors_for_alchemy',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '卡名含有《炼金》的卡的效果将战场上的这张卡送入墓地时，这张卡视作具备所有颜色。',
  applyContinuous: (_gameState, instance) => {
    allColors.forEach(color => addTemporaryColor(instance, color));
  }
}, {
  id: '305000062_alchemy_grave_bottom_draw_exile',
  type: 'TRIGGER',
  triggerLocation: ['ITEM', 'GRAVE'],
  triggerEvent: 'CARD_LEFT_ZONE',
  description: '这张卡被卡名含有《炼金》的卡的效果送入墓地时，可以将墓地最多2张《炼金》卡放置到卡组底。之后抽1张卡，将这张卡放逐。',
  condition: (gameState, _playerState, instance, event) =>
    wasSentFromFieldToGraveByAlchemyEffect(gameState, instance, event),
  execute: async (instance, gameState, playerState) => {
    const candidates = alchemyGraveCards(playerState);
    if (candidates.length === 0) {
      await drawAndExileSelf(instance, gameState, playerState);
      return;
    }
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择炼金卡',
      '选择墓地中最多2张卡名含有《炼金》的卡放置到卡组底。',
      0,
      Math.min(2, candidates.length),
      { sourceCardId: instance.gamecardId, effectId: '305000062_alchemy_grave_bottom_draw_exile', step: 'BOTTOM_ALCHEMY' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'BOTTOM_ALCHEMY') return;
    selections.forEach(id => {
      const selected = playerState.grave.find((card: Card) => card.gamecardId === id && isAlchemyCard(card));
      if (selected) moveCard(gameState, playerState.uid, selected, 'DECK', instance, { insertAtBottom: true });
    });
    await drawAndExileSelf(instance, gameState, playerState);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 305000062
 * Card2 Row: 586
 * Card Row: 470
 * Source CardNo: BT07-Y09
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：卡名含有《炼金》的卡的效果将战场上的这张卡送入墓地时，这张卡视作具备所有颜色。
 * 【诱】{这张卡被卡名含有《炼金》的卡的效果送入墓地时}：你可以将你墓地中的最多2张卡名含有《炼金》的卡放置到你的卡组底。之后，抽1张卡，将这张卡放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '305000062',
  fullName: '永生石',
  specialName: '',
  type: 'ITEM',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '无',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
