import { Card, CardEffect } from '../types/game';
import { addContinuousDamage, addContinuousKeyword, addContinuousPower, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105040457_legend_boost',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '若你有「Brave Immortal」或「Eternal」和「Guardian Promise」，你的<魔王不死传说>单位+2/+2500并获得【英勇】【歼灭】。',
  applyContinuous: (gameState, instance) => {
    const owner = Object.values(gameState.players).find(player => player.unitZone.some(unit => unit?.gamecardId === instance.gamecardId));
    if (!owner) return;
    const units = ownUnits(owner);
    const hasBraveOrEternal = units.some(unit => unit.specialName === 'Brave Immortal' || unit.specialName === 'Eternal');
    const hasPromise = units.some(unit => unit.specialName === 'Guardian Promise');
    if (!hasBraveOrEternal || !hasPromise) return;
    units.filter(unit => unit.faction === '魔王不死传说').forEach(unit => {
      addContinuousDamage(unit, instance, 2);
      addContinuousPower(unit, instance, 2500);
      addContinuousKeyword(unit, instance, 'heroic');
      addContinuousKeyword(unit, instance, 'annihilation');
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105040457
 * Card2 Row: 345
 * Card Row: 583
 * Source CardNo: PR04-01Y
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：若你的战场上有「Brave Immortal」或「Eternal」和「Guardian Promise」卡，你的战场上的所有<魔王不死传说>单位+2/+2500，并获得【英勇】【歼灭】
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105040457',
  fullName: '伊特诺「Eternal」',
  specialName: 'Eternal',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '魔王不死传说',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: false,
  isHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
