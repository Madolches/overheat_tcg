import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, destroyByEffect, faceUpErosion, getOpponentUid, moveCardAsCost, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '102050479_enter_destroy',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  description: '进入战场时，若对手单位比你多2个以上，将2张红色正面侵蚀送墓，破坏对手1个非神蚀单位。',
  condition: (gameState, playerState, instance, event?: GameEvent) => {
    if (event?.sourceCardId !== instance.gamecardId || event.data?.zone !== 'UNIT') return false;
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    return ownUnits(opponent).length >= ownUnits(playerState).length + 2 &&
      faceUpErosion(playerState).filter(card => card.color === 'RED').length >= 2 &&
      ownUnits(opponent).some(unit => !unit.godMark);
  },
  cost: async (gameState, playerState, instance) => {
    const candidates = faceUpErosion(playerState).filter(card => card.color === 'RED');
    if (candidates.length < 2) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择红色侵蚀',
      '选择侵蚀区中的2张红色正面卡送入墓地作为费用。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '102050479_enter_destroy', costType: 'EROSION_COST' },
      () => 'EROSION_FRONT'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      faceUpErosion(playerState).filter(card => card.color === 'RED'),
      '选择红色侵蚀',
      '选择侵蚀区中的2张红色正面卡送入墓地作为费用。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '102050479_enter_destroy', step: 'COST' },
      () => 'EROSION_FRONT'
    );
  },
  targetSpec: {
    title: '选择破坏目标',
    description: '选择对手场上的1个非神蚀单位破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    step: 'TARGET',
    getCandidates: (gameState, playerState) => {
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      return ownUnits(opponent)
        .filter(unit => !unit.godMark)
        .map(card => ({ card, source: 'UNIT' as any }));
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType === 'EROSION_COST') {
      const selected = selections
        .map(id => playerState.erosionFront.find(entry => entry?.gamecardId === id && entry.color === 'RED' && entry.displayState === 'FRONT_UPRIGHT'))
        .filter((card: Card | undefined): card is Card => !!card);
      if (selected.length !== 2) {
        context.cancelActivation = true;
        return;
      }
      selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'GRAVE', instance));
      return;
    }

    if (context?.step === 'COST') {
      selections.forEach(id => {
        const card = playerState.erosionFront.find(entry => entry?.gamecardId === id && entry.color === 'RED' && entry.displayState === 'FRONT_UPRIGHT');
        if (card) moveCardAsCost(gameState, playerState.uid, card, 'GRAVE', instance);
      });
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      const targets = ownUnits(opponent).filter(unit => !unit.godMark);
      if (targets.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        targets,
        '选择破坏目标',
        '选择对手场上的1个非神蚀单位破坏。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '102050479_enter_destroy', step: 'TARGET' },
        () => 'UNIT'
      );
      return;
    }
    if (context?.step === 'TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target?.cardlocation === 'UNIT' && !target.godMark) destroyByEffect(gameState, target, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050479
 * Card2 Row: 264
 * Card Row: 620
 * Source CardNo: SP01-R01
 * Package: SP01(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖将你的侵蚀区中的2张红色正面卡送入墓地〗这个单位进入战场时，若对手场上的单位比你的单位多2个以上，选择对手场上的1个非神蚀单位，将其破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050479',
  fullName: '拂风贺岁「萍香」',
  specialName: '萍香',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '伊列宇王国',
  acValue: 3,
  power: 2500,
  basePower: 2500,
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
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP01',
  uniqueId: null as any,
};

export default card;
