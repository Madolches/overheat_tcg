import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createPlayerSelectQuery, getOpponentUid, millTop, ownUnits } from './BaseUtil';

const hasWhiteOrYellowUnit = (playerState: any) =>
  ownUnits(playerState).some(unit =>
    AtomicEffectExecutor.matchesColor(unit, 'WHITE') ||
    AtomicEffectExecutor.matchesColor(unit, 'YELLOW')
  );

const effect_102000277_enter_mill: CardEffect = {
  id: '102000277_enter_mill',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '【诱】同名1回合1次，你的战场上有白色或黄色单位，这个单位进入战场时，选择1名对手：将其卡组顶2张送入墓地。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    hasWhiteOrYellowUnit(playerState),
  execute: async (instance, gameState, playerState) => {
    createPlayerSelectQuery(
      gameState,
      playerState.uid,
      '选择对手',
      '选择1名对手，将他的卡组顶2张送入墓地。',
      { sourceCardId: instance.gamecardId, effectId: '102000277_enter_mill' },
      { includeSelf: false, includeOpponent: true }
    );
  },
  onQueryResolve: async (instance, gameState, playerState) => {
    millTop(gameState, getOpponentUid(gameState, playerState.uid), 2, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102000277
 * Card2 Row: 436
 * Card Row: 319
 * Source CardNo: SP02-R02
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{你的战场上有白色或黄色单位，这个单位进入战场时，选择1名对手}:将被选择的玩家的卡组顶2张卡送入墓地。
 */
const card: Card = {
  id: '102000277',
  fullName: '天魔主攻手',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
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
  effects: [effect_102000277_enter_mill],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
