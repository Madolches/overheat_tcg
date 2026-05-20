import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addInfluence, readyByEffect } from './BaseUtil';

const getBattleOpponentUnits = (gameState: any, instance: Card) => {
  const battle = gameState.battleState;
  if (!battle || battle.isAlliance) return [];
  if (battle.defender === instance.gamecardId) {
    return (battle.attackers || [])
      .map((id: string) => AtomicEffectExecutor.findCardById(gameState, id))
      .filter((card: Card | undefined): card is Card => !!card && card.cardlocation === 'UNIT');
  }
  if ((battle.attackers || []).includes(instance.gamecardId)) {
    const defender = battle.defender ? AtomicEffectExecutor.findCardById(gameState, battle.defender) : undefined;
    return defender?.cardlocation === 'UNIT' ? [defender] : [];
  }
  return [];
};

const effect_101130346_small_unit_battle_immune: CardEffect = {
  id: '101130346_small_unit_battle_immune',
  type: 'CONTINUOUS',
  description: '这个单位不会被力量2500以下的单位（不包括联军）战斗破坏。',
  applyContinuous: (gameState, instance) => {
    const opponents = getBattleOpponentUnits(gameState, instance);
    if (opponents.length === 0) return;
    if (opponents.every(unit => (unit.power || 0) <= 2500)) {
      (instance as any).battleImmuneByEffect = true;
      addInfluence(instance, instance, '不会被力量2500以下的单位战斗破坏');
    }
  }
};

const effect_101130346_ready_on_opponent_attack: CardEffect = {
  id: '101130346_ready_on_opponent_attack',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ATTACK_DECLARED',
  triggerLocation: ['UNIT'],
  isGlobal: true,
  limitCount: 1,
  limitNameType: true,
  isMandatory: true,
  description: '同名1回合1次：对手的单位宣言攻击时，将这个单位重置。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    event?.playerUid !== playerState.uid &&
    Array.isArray(event?.data?.attackerIds) &&
    event.data.attackerIds.length > 0 &&
    instance.isExhausted,
  execute: async (instance, gameState) => {
    readyByEffect(gameState, instance, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130346
 * Card2 Row: 476
 * Card Row: 409
 * Source CardNo: BT06-W06
 * Package: BT06(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：这个单位不会被〖力量2500〗以下的单位（不包括联军）战斗破坏。
 * 【诱】〖同名1回合1次〗{对手的单位宣言攻击时}：将这个单位〖重置〗。
 */
const card: Card = {
  id: '101130346',
  fullName: '圣歌歌手',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '圣王国',
  acValue: 3,
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
  effects: [effect_101130346_small_unit_battle_immune, effect_101130346_ready_on_opponent_attack],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
