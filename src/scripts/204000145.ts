import { Card, CardEffect, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const findOpponentUnitPlay = (gameState: GameState, playerUid: string) => {
  const opponentId = gameState.playerIds.find(id => id !== playerUid);
  if (!opponentId) return undefined;

  for (let i = gameState.counterStack.length - 1; i >= 0; i -= 1) {
    const item = gameState.counterStack[i];
    if (
      item.type === 'PLAY' &&
      item.ownerUid === opponentId &&
      !item.isNegated &&
      item.card?.type === 'UNIT'
    ) {
      return item;
    }
  }

  return undefined;
};

const effect_204000145_counter: CardEffect = {
  id: '204000145_counter_silence',
  type: 'ACTIVATE',
  triggerLocation: ['HAND', 'PLAY'],
  description: '只能在对抗对手使用单位卡的宣言时使用。本回合中，那张卡及其同名卡失去所有能力（不包括基本能力）。将这张卡放逐。',
  condition: (gameState: GameState, playerState: PlayerState) => {
    if (gameState.phase !== 'COUNTERING') return false;
    return !!findOpponentUnitPlay(gameState, playerState.uid);
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const targetPlay = findOpponentUnitPlay(gameState, playerState.uid);
    const targetCard = targetPlay?.card;

    if (!targetCard) {
      gameState.logs.push(`[${instance.fullName}] 未能找到对手正在使用的单位卡。`);
      return;
    }

    const allCards = Object.values(gameState.players)
      .flatMap(player => [
        ...player.deck,
        ...player.hand,
        ...player.grave,
        ...player.exile,
        ...player.unitZone,
        ...player.itemZone,
        ...player.erosionFront,
        ...player.erosionBack,
        ...player.playZone
      ])
      .filter(Boolean) as Card[];

    const matchedCards = allCards.filter(card => card.fullName === targetCard!.fullName);

    matchedCards.forEach(card => {
      const silencedEffectIds = (card.effects || [])
        .map(effect => effect.id)
        .filter((id): id is string => !!id);

      card.temporaryCanActivateEffect = false;
      card.canActivateEffect = false;
      card.silencedEffectIds = silencedEffectIds;
      (card as any).data = {
        ...((card as any).data || {}),
        fullEffectSilencedTurn: gameState.turnCount,
        fullEffectSilenceSource: instance.fullName,
        fullEffectSilencedZones: ['UNIT']
      };
    });

    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'BANISH_CARD',
      targetFilter: { gamecardId: instance.gamecardId }
    }, instance);

    gameState.logs.push(`[${instance.fullName}] 使 [${targetCard.fullName}] 及其同名卡本回合在战场失去所有能力，并将自身放逐。`);
  }
};

const card: Card = {
  id: '204000145',
  fullName: '碍爱伞',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_204000145_counter],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT01',
  uniqueId: null,
};

export default card;
