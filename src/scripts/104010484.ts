import { Card, GameState, PlayerState, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const replace_104010484: CardEffect = {
  id: '104010484_replace_erosion_to_field',
  type: 'CONTINUOUS',
  triggerLocation: ['EROSION_FRONT'],
  movementReplacementDestination: 'UNIT',
  isMandatory: true,
  description: '1~4：这张卡由于你的卡的效果将要从卡组或手牌放置到侵蚀区时，改为放置到战场上。',
  condition: (_gameState: GameState, playerState: PlayerState, instance: Card) => {
    if (instance.cardlocation !== 'DECK' && instance.cardlocation !== 'HAND') return false;
    if (!playerState.unitZone.some(u => u === null) && playerState.unitZone.length >= 6) {
      return false;
    }

    const otherErosionTotal = [...playerState.erosionFront, ...playerState.erosionBack]
      .filter(card => !!card && card.gamecardId !== instance.gamecardId)
      .length;
    if (otherErosionTotal < 1 || otherErosionTotal > 4) return false;

    const blueUnitsCount = playerState.unitZone.filter(u => u && AtomicEffectExecutor.matchesColor(u, 'BLUE')).length;
    return blueUnitsCount >= 1;
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
    replace_104010484
  ],
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'BT04',
  uniqueId: null,
};

export default card;
