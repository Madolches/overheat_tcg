import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  canPutCardOntoBattlefieldByEffect,
  createSelectCardQuery,
  moveCard,
  putCardOntoField
} from './BaseUtil';

const ownFieldCards = (playerState: any) =>
  [...playerState.unitZone, ...playerState.itemZone].filter((card): card is Card => !!card);

const deckCandidates = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    !card.godMark &&
    (card.type === 'UNIT' || card.type === 'ITEM') &&
    canPutCardOntoBattlefieldByEffect(playerState, card)
  );

const effect_205000103_high_alchemy: CardEffect = {
  id: '205000103_high_alchemy',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次，主要阶段，选择你的战场2张以上卡送墓，将卡组1张非神蚀卡放置到战场。之后放逐这张卡。',
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    ownFieldCards(playerState).length >= 2 &&
    deckCandidates(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    const field = ownFieldCards(playerState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      field,
      '选择炼金素材',
      '选择你的战场上的2张以上卡送入墓地。',
      2,
      field.length,
      { sourceCardId: instance.gamecardId, effectId: '205000103_high_alchemy', step: 'SEND_FIELD' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'SEND_FIELD') {
      selections.forEach(cardId => {
        const target = AtomicEffectExecutor.findCardById(gameState, cardId);
        const ownerUid = target ? AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) : undefined;
        if (target && ownerUid === playerState.uid && (target.cardlocation === 'UNIT' || target.cardlocation === 'ITEM')) {
          moveCard(gameState, playerState.uid, target, 'GRAVE', instance);
        }
      });
      const candidates = deckCandidates(playerState);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择放置卡',
        '从你的卡组选择1张非神蚀卡放置到战场。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '205000103_high_alchemy', step: 'PUT_CARD' },
        () => 'DECK'
      );
      return;
    }

    if (context?.step !== 'PUT_CARD') return;
    const selected = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!selected || selected.cardlocation !== 'DECK' || selected.godMark) return;
    const moved = putCardOntoField(gameState, playerState.uid, selected, instance);
    if (!moved) return;
  }
};

const card: Card = {
  id: '205000103',
  fullName: '高位炼金',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  baseColorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 1,
  baseAcValue: 1,
  godMark: false,
  baseGodMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_205000103_high_alchemy],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
