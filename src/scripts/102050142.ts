import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, appendEndResolution, createSelectCardQuery, ensureData, getOpponentUid, moveCard, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102050142_goddess_control',
  type: 'TRIGGER',
  triggerEvent: 'GODDESS_TRANSFORMATION',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  description: '进入女神化时，选择对手1个AC2以下非神蚀单位重置，本回合得到其控制权。',
  condition: (gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    return playerState.unitZone.some(slot => slot === null) &&
      ownUnits(opponent).some(unit => !unit.godMark && (unit.acValue || 0) <= 2);
  },
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(opponent).filter(unit => !unit.godMark && (unit.acValue || 0) <= 2),
      '选择取得控制权的单位',
      '选择对手的1个ACCESS值2以下的非神蚀单位，将其重置并在本回合得到控制权。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050142_goddess_control' }
    );
  },
  targetSpec: {
    title: '选择取得控制权的单位',
    description: '选择对手的1个ACCESS值2以下的非神蚀单位，将其重置，并在本回合得到控制权。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) =>
      ownUnits(gameState.players[getOpponentUid(gameState, playerState.uid)])
        .filter(unit => !unit.godMark && (unit.acValue || 0) <= 2)
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT' || target.godMark || (target.acValue || 0) > 2) return;
    const data = ensureData(target);
    data.controlChangedBy = instance.fullName;
    data.originalControllerUid = opponentUid;
    target.isExhausted = false;
    moveCard(gameState, opponentUid, target, 'UNIT', instance, { toPlayerUid: playerState.uid });
    appendEndResolution(gameState, playerState.uid, instance, '102050142_return_control', (_source, state) => {
      const live = AtomicEffectExecutor.findCardById(state, target.gamecardId);
      if (!live || live.cardlocation !== 'UNIT') return;
      const currentUid = AtomicEffectExecutor.findCardOwnerKey(state, live.gamecardId);
      if (!currentUid || currentUid === opponentUid) return;
      delete ensureData(live).controlChangedBy;
      delete ensureData(live).originalControllerUid;
      moveCard(state, currentUid, live, 'UNIT', instance, { toPlayerUid: opponentUid });
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050142
 * Card2 Row: 126
 * Card Row: 126
 * Source CardNo: BT02-R03
 * Package: BT02(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗:你进入女神化状态时，选择对手的1个ACCESS值+2以下的非神蚀单位，将其〖重置〗，本回合中，你得到其控制权。（这个单位离开战场时，将那个单位的控制权返还给对手）
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050142',
  fullName: '矮人演说家',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
  acValue: 3,
  power: 1000,
  basePower: 1000,
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
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
