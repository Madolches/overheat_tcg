import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, cardsInZones, discardHandCost, moveCard, nameContains, selectFromEntries, wealthCount } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '104020287_minotaur_recruit',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  cost: discardHandCost(2),
  description: '1回合1次：财富指示物2个以上，舍弃2张手牌，将卡组或侵蚀区1张卡名含有《牛头人》的非神蚀单位放置到战场。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    instance.cardlocation === 'UNIT' &&
    wealthCount(playerState, gameState) >= 2 &&
    canPutUnitOntoBattlefield(playerState, instance) &&
    cardsInZones(playerState, ['DECK', 'EROSION_FRONT'])
      .some(({ card }) => card.type === 'UNIT' && !card.godMark && nameContains(card, '牛头人') && canPutUnitOntoBattlefield(playerState, card)),
  execute: async (instance, gameState, playerState) => {
    const entries = cardsInZones(playerState, ['DECK', 'EROSION_FRONT'])
      .filter(({ card }) => card.type === 'UNIT' && !card.godMark && nameContains(card, '牛头人') && canPutUnitOntoBattlefield(playerState, card));
    selectFromEntries(gameState, playerState.uid, entries, '选择牛头人单位', '选择卡组或侵蚀区中的1张卡名含有《牛头人》的非神蚀单位放置到战场。', 1, 1, {
      sourceCardId: instance.gamecardId,
      effectId: '104020287_minotaur_recruit'
    });
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && canPutUnitOntoBattlefield(playerState, target)) {
      const fromDeck = target.cardlocation === 'DECK';
      moveCard(gameState, playerState.uid, target, 'UNIT', instance);
      if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020287
 * Card2 Row: 507
 * Card Row: 330
 * Source CardNo: PR06-04B
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗{你的财富指示物有2个以上}[舍弃2张手牌]：将你的卡组或侵蚀区中的1张卡名含有《牛头人》的非神蚀单位放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104020287',
  fullName: '牛头人司令员',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '九尾商会联盟',
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
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
