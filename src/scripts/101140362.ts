import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, exhaustCost, moveCard, ownUnits } from './BaseUtil';

const whiteUnitCount = (playerState: any) =>
  ownUnits(playerState).filter(unit => AtomicEffectExecutor.matchesColor(unit, 'WHITE')).length;

const isShingiStory = (card: Card) =>
  card.type === 'STORY' && card.fullName.includes('神仪');

const effect_101140362_enter_search_shingi: CardEffect = {
  id: '101140362_enter_search_shingi',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  cost: exhaustCost,
  isMandatory: true,
  description: '同名1回合1次：这个单位进入战场时，若我方有两个以上白色单位，横置并将卡组中的1张卡名含有《神仪》的故事卡加入手牌。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    !instance.isExhausted &&
    whiteUnitCount(playerState) >= 2 &&
    playerState.deck.some(isShingiStory),
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.deck.filter(isShingiStory);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择神仪故事卡',
      '选择卡组中的1张卡名含有《神仪》的故事卡加入手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101140362_enter_search_shingi' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (selected?.cardlocation !== 'DECK' || !isShingiStory(selected)) return;
    moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140362
 * Card2 Row: 473
 * Card Row: 434
 * Source CardNo: BT06-W03
 * Package: BT06(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位进入战场时}[支付0费，我方单位区有两个或以上的白色单位，〖横置〗]：将你卡组中的1张卡名含有《神仪》的故事卡加入手牌。
 */
const card: Card = {
  id: '101140362',
  fullName: '神仪祭司「和鹿」',
  specialName: '和鹿',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '女神教会',
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
  effects: [effect_101140362_enter_search_shingi],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
