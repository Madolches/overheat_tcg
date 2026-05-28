import { Card, CardEffect } from '../types/game';
import { createPlayerSelectQuery, getOpponentUid, millTop, ownerUidOf } from './BaseUtil';

const effect_102000279_cost_mill: CardEffect = {
  id: '102000279_cost_mill',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_ZONE',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  isGlobal: true,
  limitCount: 1,
  limitNameType: true,
  description: '【诱】同名1回合1次，卡的能力的费用将你的战场上的单位送入墓地时，选择1名对手：将其卡组顶1张送入墓地。',
  condition: (gameState, playerState, _instance, event) => {
    const movedCard = event?.sourceCard as Card | undefined;
    if (
      !movedCard ||
      event?.data?.zone !== 'UNIT' ||
      event.data?.targetZone !== 'GRAVE' ||
      ownerUidOf(gameState, movedCard) !== playerState.uid
    ) {
      return false;
    }
    const data = (movedCard as any)?.data;
    return data?.lastMovedAsCostTurn === gameState.turnCount;
  },
  execute: async (instance, gameState, playerState) => {
    createPlayerSelectQuery(
      gameState,
      playerState.uid,
      '选择对手',
      '选择1名对手，将他的卡组顶1张送入墓地。',
      { sourceCardId: instance.gamecardId, effectId: '102000279_cost_mill' },
      { includeSelf: false, includeOpponent: true }
    );
  },
  onQueryResolve: async (instance, gameState, playerState) => {
    millTop(gameState, getOpponentUid(gameState, playerState.uid), 1, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000279
 * Card2 Row: 438
 * Card Row: 321
 * Source CardNo: SP02-R04
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{卡的能力的费用将你的战场上的单位送入墓地时，选择1名对手}:将被选择的玩家的卡组顶的1张卡送入墓地。
 */
const card: Card = {
  id: '102000279',
  fullName: '炽月·接应',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
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
  effects: [effect_102000279_cost_mill],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
