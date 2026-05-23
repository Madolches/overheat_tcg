import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canActivateDefaultTiming,
  createSelectCardQuery,
  discardHandCost,
  exhaustCost,
  getResonanceExiledCard,
  isResonanceExileEvent,
  moveCard,
  moveCardAsCost
} from './BaseUtil';

const SERNOBU = '瑟诺布';

const silverMusicDeckCards = (playerState: any) =>
  playerState.deck.filter((card: Card) => card.fullName.includes('银乐'));

const recoverTargets = (playerState: any) =>
  playerState.grave.filter((card: Card) =>
    (card.acValue || 0) <= 3 &&
    card.faction === SERNOBU
  );

const cardEffects: CardEffect[] = [{
  id: '303090069_mill_two_silver_music',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  description: '主要阶段，横置：将卡组中2张卡名含有《银乐》且卡名各不同的卡送入墓地。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'ITEM' &&
    canActivateDefaultTiming(gameState, playerState) &&
    !instance.isExhausted &&
    new Set(silverMusicDeckCards(playerState).map((card: Card) => card.fullName)).size >= 2,
  cost: exhaustCost,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      silverMusicDeckCards(playerState),
      '选择银乐卡',
      '选择卡组中1张卡名含有《银乐》的卡送入墓地。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '303090069_mill_two_silver_music', step: 'FIRST' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'FIRST') {
      const first = playerState.deck.find((card: Card) =>
        card.gamecardId === selections[0] &&
        card.fullName.includes('银乐')
      );
      if (!first) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        silverMusicDeckCards(playerState).filter((card: Card) =>
          card.gamecardId !== first.gamecardId &&
          card.fullName !== first.fullName
        ),
        '选择银乐卡',
        '选择卡组中1张与第一张卡名不同的《银乐》卡送入墓地。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '303090069_mill_two_silver_music', step: 'SECOND', firstId: first.gamecardId },
        () => 'DECK'
      );
      return;
    }

    const first = context?.firstId
      ? playerState.deck.find((card: Card) =>
        card.gamecardId === context.firstId &&
        card.fullName.includes('银乐')
      )
      : undefined;
    const second = selections[0]
      ? playerState.deck.find((card: Card) =>
        card.gamecardId === selections[0] &&
        card.fullName.includes('银乐') &&
        card.fullName !== first?.fullName
      )
      : undefined;
    if (!first || !second) return;
    [first, second].forEach(card => moveCard(gameState, playerState.uid, card, 'GRAVE', instance));
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}, {
  id: '303090069_resonance_recover_sernobu',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  triggerLocation: ['EXILE'],
  isMandatory: false,
  description: '共鸣能力将墓地中的这张卡放逐时，舍弃1张手牌：将墓地中1张ACCESS+3以下的<瑟诺布>卡加入手牌。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    isResonanceExileEvent(event) &&
    getResonanceExiledCard(event)?.gamecardId === instance.gamecardId &&
    playerState.hand.length > 0 &&
    recoverTargets(playerState).length > 0,
  cost: discardHandCost(1),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      recoverTargets(playerState),
      '选择回收卡',
      '选择墓地中1张ACCESS值+3以下的<瑟诺布>卡加入手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '303090069_resonance_recover_sernobu' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = recoverTargets(playerState).find((card: Card) => card.gamecardId === selections[0]);
    if (target) moveCard(gameState, playerState.uid, target, 'HAND', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 303090069
 * Card2 Row: 646
 * Card Row: 528
 * Source CardNo: BT08-G09
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】{你的主要阶段}[〖横置〗]:将你的卡组中的2张卡名含有《银乐》且卡名各不同的卡送入墓地。
 * 【诱】{共鸣能力将你的墓地中的这张卡放逐时}[舍弃1张手牌]:将你墓地中的1张ACCESS值+3以下的<瑟诺布>卡加入手牌。
 */
const card: Card = {
  id: '303090069',
  fullName: '银乐器大提琴',
  specialName: '',
  type: 'ITEM',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '瑟诺布',
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
