import { Card, GameState, PlayerState, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';

const trigger_104010484: CardEffect = {
  id: 'daowuzhe_trigger',
  type: 'TRIGGER',
  triggerEvent: 'CARD_TO_EROSION_FRONT',
  triggerLocation: ['EROSION_FRONT'],
  isMandatory: true,
  description: '【永】当侵蚀区存在1-4张其他卡牌且战场上有1个或更多蓝色单位时，因卡的效果将此卡从卡组或手牌放入侵蚀区正面时，将此卡放置在战场上。',
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    const isSelf = event?.type === 'CARD_TO_EROSION_FRONT' &&
      (event.sourceCardId === instance.gamecardId || event.sourceCard === instance);
    const sourceZone = event?.data?.sourceZone;
    const isByEffect = event?.data?.isEffect === true;

    if (!isSelf || !isByEffect || (sourceZone !== 'DECK' && sourceZone !== 'HAND')) {
      return false;
    }

    if (instance.cardlocation !== 'EROSION_FRONT') {
      return false;
    }

    if (!playerState.unitZone.some(u => u === null) && playerState.unitZone.length >= 6) {
      return false;
    }

    const otherErosionCount = [
      ...playerState.erosionFront,
      ...playerState.erosionBack
    ].filter(card => card && card.gamecardId !== instance.gamecardId).length;
    if (otherErosionCount < 1 || otherErosionCount > 4) return false;

    const blueUnitsCount = playerState.unitZone.filter(u => u && AtomicEffectExecutor.matchesColor(u, 'BLUE')).length;
    return blueUnitsCount >= 1;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const frontIdx = playerState.erosionFront.findIndex(c => c?.gamecardId === instance.gamecardId);
    if (frontIdx === -1) return;

    const targetIndex = playerState.unitZone.findIndex(c => c === null);
    if (targetIndex === -1 && playerState.unitZone.length >= 6) return;

    playerState.erosionFront[frontIdx] = null;
    instance.cardlocation = 'UNIT';
    instance.displayState = 'FRONT_UPRIGHT';
    instance.isExhausted = false;
    instance.playedTurn = gameState.turnCount;

    if (targetIndex !== -1) {
      playerState.unitZone[targetIndex] = instance;
    } else {
      playerState.unitZone.push(instance);
    }

    EventEngine.handleCardEnteredZone(gameState, playerState.uid, instance, 'UNIT', true);
    EventEngine.dispatchMovementSubEvents(gameState, {
      card: instance,
      cardOwnerUid: playerState.uid,
      fromZone: 'EROSION_FRONT',
      toZone: 'UNIT',
      isEffect: true,
      effectSourcePlayerUid: playerState.uid,
      effectSourceCardId: instance.gamecardId
    });
  }
};

const card: Card = {
  id: '104010484',
  gamecardId: null as any,
  fullName: '水城的刀舞者',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { 'BLUE': 1 },
  faction: '百濑之水城',
  acValue: 4,
  power: 3000,
  basePower: 3000,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    trigger_104010484
  ],
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'BT04',
  uniqueId: null,
};

export default card;
