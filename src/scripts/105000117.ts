import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addInfluence } from './BaseUtil';

const effect_105000117_continuous: CardEffect = {
  id: '105000117_continuous',
  type: 'CONTINUOUS',
  content: 'SELF_HAND_COST',
  description: '若你没有控制单位且侵蚀区没有正面卡，手牌中的这张卡AC变为0。',
  applyContinuous: (gameState, instance) => {
    if (instance.cardlocation !== 'HAND') return;

    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId);
    if (!ownerUid) return;

    const owner = gameState.players[ownerUid];
    const hasUnits = owner.unitZone.some(card => !!card);
    const hasFaceUpErosion = owner.erosionFront.some(card => !!card && card.displayState === 'FRONT_UPRIGHT');
    if (hasUnits || hasFaceUpErosion) return;

    instance.acValue = 0;
    addInfluence(instance, instance, '没有单位且没有正面侵蚀：ACCESS值变为0');
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000117
 * Card2 Row: 83
 * Card Row: 83
 * Source CardNo: BT01-Y11
 * Package: BT01(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:若你的战场上没有单位，且你的侵蚀区中没有正面卡，这个单位的Access值变为〖0〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000117',
  fullName: '普尔氏·小熊猫教官',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 2,
  baseAcValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105000117_continuous],
  rarity: 'C',
  availableRarities: ['C', 'PR'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
