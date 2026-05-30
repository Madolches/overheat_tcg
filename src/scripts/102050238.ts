import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createPlayerSelectQuery, createSelectCardQuery, damagePlayerByEffect, getOpponentUid, isFaction, isNonGodUnit, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102050238_ileu_damage',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: ['COMBAT_DAMAGE_CAUSED', 'EFFECT_DAMAGE_CAUSED'],
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  description: '你的<伊列宇王国>单位对对手造成伤害时，可以选择1名对手，给予他2点伤害。',
  condition: (gameState, playerState, _instance, event) => {
    if (event?.playerUid !== getOpponentUid(gameState, playerState.uid)) return false;
    if (event.type === 'EFFECT_DAMAGE_CAUSED') {
      const sourceCard = event.sourceCard || (event.sourceCardId ? AtomicEffectExecutor.findCardById(gameState, event.sourceCardId) : undefined);
      return !!sourceCard &&
        sourceCard.cardlocation === 'UNIT' &&
        AtomicEffectExecutor.findCardOwnerKey(gameState, sourceCard.gamecardId) === playerState.uid &&
        isFaction(sourceCard, '伊列宇王国');
    }
    const attackerIds = event.data?.attackerIds || [];
    return attackerIds.some((id: string) => {
      const attacker = AtomicEffectExecutor.findCardById(gameState, id);
      return !!attacker && isFaction(attacker, '伊列宇王国');
    });
  },
  execute: async (instance, gameState, playerState) => {
    createPlayerSelectQuery(
      gameState,
      playerState.uid,
      '选择对手',
      '选择1名对手，给予他2点伤害。',
      { sourceCardId: instance.gamecardId, effectId: '102050238_ileu_damage' },
      { includeSelf: false, includeOpponent: true }
    );
  },
  onQueryResolve: async (instance, gameState, playerState) => {
    await damagePlayerByEffect(gameState, playerState.uid, getOpponentUid(gameState, playerState.uid), 2, instance);
  }
}, {
  id: '102050238_destroy',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [10, 10],
  limitCount: 1,
  limitNameType: true,
  description: '10+：你的主要阶段，若你有4个以上<伊列宇王国>单位，选择对手1个非神蚀单位破坏。',
  condition: (gameState, playerState) =>
    gameState.phase === 'MAIN' &&
    playerState.isTurn &&
    ownUnits(playerState).filter(unit => isFaction(unit, '伊列宇王国')).length >= 4 &&
    ownUnits(gameState.players[getOpponentUid(gameState, playerState.uid)]).some(isNonGodUnit),
  targetSpec: {
    title: '选择破坏目标',
    description: '选择对手的1个非神蚀单位破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) => {
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      return ownUnits(opponent).filter(isNonGodUnit).map(card => ({ card, source: 'UNIT' as any }));
    }
  },
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(opponent).filter(isNonGodUnit),
      '选择破坏目标',
      '选择对手的1个非神蚀单位破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050238_destroy' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    await AtomicEffectExecutor.execute(
      gameState,
      playerState.uid,
      { type: 'DESTROY_CARD', targetFilter: { gamecardId: selections[0] } },
      instance
    );
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050238
 * Card2 Row: 407
 * Card Row: 277
 * Source CardNo: BT05-R01
 * Package: BT05(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{你的<伊列宇王国>单位对对手造成伤害时，你可以选择1名对手}:给予他2点伤害。
 * 〖10+〗【启】〖同名1回合1次〗{你的主要阶段，你的战场上的<伊列宇王国>单位有4个以上}:选择对手的1个非神蚀单位，将其破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050238',
  fullName: '雌鹰「贝瑞塔」',
  specialName: '贝瑞塔',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '伊列宇王国',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 1,
  baseDamage: 1,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
