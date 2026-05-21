import { Card, CardEffect } from '../types/game';
import { getOpponentUid, moveRandomGraveToDeckBottom } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102070357_combat_damage_recover',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'COMBAT_DAMAGE_CAUSED',
  description: '这张卡对对手造成战斗伤害时，恢复1。',
  condition: (gameState, playerState, instance, event) =>
    event?.playerUid === getOpponentUid(gameState, playerState.uid) &&
    (event.data?.attackerIds || []).includes(instance.gamecardId) &&
    playerState.grave.length > 0,
  execute: async (instance, gameState, playerState) => {
    moveRandomGraveToDeckBottom(gameState, playerState.uid, 1, instance);
  }
}];

const card: Card = {
  id: '102070357',
  fullName: '异界狂蝠',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '忒碧拉之间',
  acValue: 2,
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
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
