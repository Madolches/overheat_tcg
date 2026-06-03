import { Card, CardEffect, TriggerLocation } from '../types/game';
import { createSelectCardQuery, destroyByEffect, getOpponentUid, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
    id: '102050087_destroy',
    type: 'TRIGGER',
    triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
    triggerLocation: ['UNIT'],
    description: '入场时，若你的<伊列宇王国>单位有4个以上，破坏对手1个非神蚀单位。',
    condition: (gameState, playerState, instance, event) =>
      event?.sourceCardId === instance.gamecardId &&
      event.data?.zone === 'UNIT' &&
      ownUnits(playerState).filter(unit => unit.faction === '伊列宇王国').length >= 4 &&
      ownUnits(gameState.players[getOpponentUid(gameState, playerState.uid)]).some(unit => !unit.godMark),
    execute: async (instance, gameState, playerState) => {
      const candidates = ownUnits(gameState.players[getOpponentUid(gameState, playerState.uid)]).filter(unit => !unit.godMark);
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择破坏对象',
        '选择对手的1个非神蚀单位，将其破坏。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '102050087_destroy' }
      );
    },
    targetSpec: {
      title: '选择破坏对象',
      description: '选择对手的1个非神蚀单位，将其破坏。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'OPPONENT',
      getCandidates: (gameState, playerState) =>
        ownUnits(gameState.players[getOpponentUid(gameState, playerState.uid)])
          .filter(unit => !unit.godMark)
          .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
    },
    onQueryResolve: async (instance, gameState, _playerState, selections) => {
      const target = Object.values(gameState.players)
        .flatMap(player => ownUnits(player))
        .find(unit => unit.gamecardId === selections[0]);
      if (target) destroyByEffect(gameState, target, instance);
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050087
 * Card2 Row: 41
 * Card Row: 41
 * Source CardNo: BT01-R03
 * Package: BT01(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位进入战场时，若你的战场上的<伊列宇王国>单位有4个以上，选择对手的1个非神蚀单位，将其破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050087',
  fullName: '包围伏击小队',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
  acValue: 2,
  power: 1500,
  basePower: 1500,
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
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
