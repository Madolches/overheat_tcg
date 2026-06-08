import { Card, CardEffect, GameState, PlayerState } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canMeetBattlefieldColorRequirement, canPutUnitOntoBattlefield, paymentCost, putUnitOntoField } from './BaseUtil';

const findCounteredOpponentPlay = (gameState: GameState, playerUid: string) => {
  const opponentUid = gameState.playerIds.find(uid => uid !== playerUid);
  if (!opponentUid) return undefined;

  for (let i = gameState.counterStack.length - 1; i >= 0; i--) {
    const item = gameState.counterStack[i];
    const owner = gameState.players[item.ownerUid] as any;
    if (
      item.type === 'PLAY' &&
      item.ownerUid === opponentUid &&
      !item.isNegated &&
      owner?.uncounterableActionsTurn !== gameState.turnCount &&
      owner?.cardEffectsCannotBeNegatedTurn !== gameState.turnCount &&
      item.card
    ) {
      return item;
    }
  }

  return undefined;
};

const cost_104000073_counter: CardEffect['cost'] = async (gameState, playerState, instance) => {
  if (!canMeetBattlefieldColorRequirement(playerState, { BLUE: 2 })) return false;
  return paymentCost(4, 'BLUE')!(gameState, playerState, instance);
};
(cost_104000073_counter as any).paymentCost = 4;
(cost_104000073_counter as any).paymentColor = 'BLUE';

const effect_104000073_counter: CardEffect = {
  id: 'gensou_counter',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  description: '【启】:[〖+4:蓝蓝〗]这个能力只能在你对抗对手使用卡的宣言时从手牌发动。将这张卡放置到战场上。之后，反击被这个能力对抗的卡，将那张卡返回持有者的手牌，本回合中，对手不能使用那张卡的同名卡。',
  cost: cost_104000073_counter,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card) =>
    instance.cardlocation === 'HAND' &&
    gameState.phase === 'COUNTERING' &&
    canPutUnitOntoBattlefield(playerState, instance) &&
    !!findCounteredOpponentPlay(gameState, playerState.uid),
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const countered = findCounteredOpponentPlay(gameState, playerState.uid);
    if (!countered?.card) return;

    const counteredCard = countered.card;
    const counteredName = counteredCard.fullName;
    const opponent = gameState.players[countered.ownerUid];

    if (!putUnitOntoField(gameState, playerState.uid, instance, instance)) return;

    countered.isNegated = true;
    await AtomicEffectExecutor.moveCard(
      gameState,
      countered.ownerUid,
      'PLAY',
      countered.ownerUid,
      'HAND',
      counteredCard.gamecardId,
      true,
      {
        effectSourcePlayerUid: playerState.uid,
        effectSourceCardId: instance.gamecardId
      }
    );

    if (opponent && counteredName) {
      opponent.negatedNames = opponent.negatedNames || [];
      if (!opponent.negatedNames.includes(counteredName)) {
        opponent.negatedNames.push(counteredName);
      }
    }
  }
};

const card: Card = {
  id: '104000073',
  gamecardId: null as any,
  fullName: '「幻想吞噬龙」',
  specialName: '幻想吞噬龙',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { BLUE: 2 },
  faction: '无',
  acValue: 4,
  power: 3500,
  basePower: 3500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    effect_104000073_counter
  ],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT01',
  uniqueId: null,
};

export default card;
