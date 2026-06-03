import { Card, CardEffect, TriggerLocation } from '../types/game';
import { addInfluence, appendEndResolution, canPutUnitOntoBattlefield, createSelectCardQuery, ensureData, erosionCost, getOpponentUid, moveCard } from './BaseUtil';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const cardEffects: CardEffect[] = [{
  id: '103000424_control',
  type: 'TRIGGER',
  triggerEvent: 'CARD_DESTROYED_BATTLE',
  isMandatory: true,
  triggerLocation: ['GRAVE'],
  description: '侵蚀1：这个单位参与攻击的战斗中被战斗破坏时，选择对手1个非神蚀单位，得到控制权直到对手回合结束。',
  cost: erosionCost(1),
  condition: (gameState, playerState, instance, event) => {
    if (event?.targetCardId !== instance.gamecardId) return false;
    if (!(event.data?.attackerIds || []).includes(instance.gamecardId)) return false;
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    return opponent.unitZone.some(unit => unit && !unit.godMark && canPutUnitOntoBattlefield(playerState, unit));
  },
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    createSelectCardQuery(gameState, playerState.uid, opponent.unitZone.filter((unit): unit is Card => !!unit && !unit.godMark && canPutUnitOntoBattlefield(playerState, unit)), '选择控制权目标', '选择对手的1个非神蚀单位，得到其控制权直到对手回合结束。', 1, 1, {
      sourceCardId: instance.gamecardId,
      effectId: '103000424_control'
    });
  },
  targetSpec: {
    title: '选择控制权目标',
    description: '选择对手的1个非神蚀单位，直到对手回合结束为止得到其控制权。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) =>
      gameState.players[getOpponentUid(gameState, playerState.uid)].unitZone
        .filter((unit): unit is Card => !!unit && !unit.godMark && canPutUnitOntoBattlefield(playerState, unit))
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    const originalOwnerUid = target ? AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) : undefined;
    if (!target || !originalOwnerUid) return;
    moveCard(gameState, originalOwnerUid, target, 'UNIT', instance, { toPlayerUid: playerState.uid });
    const moved = AtomicEffectExecutor.findCardById(gameState, target.gamecardId);
    if (moved) {
      const data = ensureData(moved);
      data.controlChangedBy = instance.fullName;
      data.extraNameContainsWitchBy = instance.fullName;
      data.controlReturnOwnerUid = originalOwnerUid;
      data.controlReturnControllerUid = playerState.uid;
      addInfluence(moved, instance, '控制权已变更');
      addInfluence(moved, instance, '视为卡名含有《魔女》');
    }
    const controlledId = target.gamecardId;
    const returnControl: CardEffect['resolve'] = async (_source, state) => {
      const currentTurnUid = state.playerIds[state.currentTurnPlayer];
      if (currentTurnUid !== originalOwnerUid) {
        appendEndResolution(state, playerState.uid, instance, '103000424_return_control_retry', returnControl);
        return;
      }
      const controlled = AtomicEffectExecutor.findCardById(state, controlledId);
      if (!controlled || controlled.cardlocation !== 'UNIT') return;
      const currentOwner = AtomicEffectExecutor.findCardOwnerKey(state, controlled.gamecardId);
      if (!currentOwner || currentOwner === originalOwnerUid) return;
      if (!canPutUnitOntoBattlefield(state.players[originalOwnerUid], controlled)) return;
      moveCard(state, currentOwner, controlled, 'UNIT', instance, { toPlayerUid: originalOwnerUid });
      delete ensureData(controlled).controlChangedBy;
      delete ensureData(controlled).extraNameContainsWitchBy;
    };
    appendEndResolution(gameState, playerState.uid, instance, '103000424_return_control', returnControl);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000424
 * Card2 Row: 293
 * Card Row: 533
 * Source CardNo: BT04-G02
 * Package: BT04(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】：[〖侵蚀1〗]这个单位参与攻击的战斗中，这个单位被战斗破坏时，选择对手的一个非神蚀单位，直到对手的回合结束时为止，你得到其控制权。只要你控制着那个单位，那个单位同时也视为卡名含有《魔女》的单位。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000424',
  fullName: '黄昏之灵',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 2,
  power: 0,
  basePower: 0,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
