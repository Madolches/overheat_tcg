import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addContinuousDamage, addContinuousKeyword, addContinuousPower } from './BaseUtil';

const isShingiCard = (card?: Card) =>
  !!card && card.fullName.includes('神仪');

const enteredByShingiEffect = (gameState: any, instance: Card) => {
  const data = (instance as any).data || {};
  if (data.placedByShingiEffectSourceCardId || data.placedByShingiEffectSourceName) return true;
  const source = data.lastMoveEffectSourceCardId
    ? AtomicEffectExecutor.findCardById(gameState, data.lastMoveEffectSourceCardId)
    : undefined;
  return data.lastMovedByEffectTurn === gameState.turnCount && isShingiCard(source);
};

const cardEffects: CardEffect[] = [{
  id: '101140396_shingi_enter_stats',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '由于卡名含有《神仪》的卡的效果进入战场的这个单位伤害+1、力量+500并获得【英勇】。',
  applyContinuous: (gameState, instance) => {
    if (!enteredByShingiEffect(gameState, instance)) return;
    addContinuousDamage(instance, instance, 1);
    addContinuousPower(instance, instance, 500);
    addContinuousKeyword(instance, instance, 'heroic');
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140396
 * Card2 Row: 606
 * Card Row: 490
 * Source CardNo: BT08-W02
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:由于卡名含有《神仪》的卡的效果进入战场的这个单位〖伤害+1〗〖力量+500〗并获得【英勇】。
 * 【诱】{这张卡被破坏时，选择对手战场上的1张卡}:将被选择的卡破坏。
 */
const card: Card = {
  id: '101140396',
  fullName: '翼人精锐战士',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '女神教会',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: true,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
