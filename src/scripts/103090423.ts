import { Card, CardEffect } from '../types/game';
import { addContinuousDamage, addContinuousPower, addInfluence, ownUnits, totalErosionCount } from './BaseUtil';

const hasSilverMusicName = (card: Card) => card.type === 'UNIT' && card.fullName.includes('银乐');

const cardEffects: CardEffect[] = [{
  id: '103090423_silver_music_field_bonus',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [5, 8],
  description: '5~8：你的战场上卡名含有《银乐》的单位有3个以上时，这个单位伤害+1、力量+1000并获得【歼灭】。',
  applyContinuous: (_gameState, instance) => {
    const owner = Object.values((_gameState as any).players)
      .find((player: any) => player.unitZone.some((unit: Card | null) => unit?.gamecardId === instance.gamecardId));
    if (!owner || totalErosionCount(owner as any) < 5 || totalErosionCount(owner as any) > 8) return;
    if (ownUnits(owner as any).filter(hasSilverMusicName).length < 3) return;
    addContinuousDamage(instance, instance, 1);
    addContinuousPower(instance, instance, 1000);
    instance.isAnnihilation = true;
    addInfluence(instance, instance, '获得【歼灭】');
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090423
 * Card2 Row: 640
 * Card Row: 532
 * Source CardNo: BT08-G03
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖5~8〗【永】{你的战场上的卡名含有《银乐》的单位有3个以上}:这个单位〖伤害+1〗〖力量+1000〗并获得【歼灭】。
 */
const card: Card = {
  id: '103090423',
  fullName: '银乐舞女',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '瑟诺布',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: false,
  baseAnnihilation: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
