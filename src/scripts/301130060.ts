import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  discardHandCost,
  ownUnits,
  putUnitOntoField,
  totalErosionCount
} from './BaseUtil';

const HOLY_KINGDOM = '圣王国';

const isHolyKingdomUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (card.faction === HOLY_KINGDOM || card.fullName.includes('圣王国'));

const recruitTargets = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    isHolyKingdomUnit(card) &&
    !card.godMark &&
    (card.acValue || 0) <= 3 &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '301130060_recruit_holy_kingdom',
  type: 'ACTIVATE',
  triggerLocation: ['ITEM'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：你的主要阶段，舍弃1张手牌，将卡组中1张ACCESS+3以下<圣王国>非神蚀单位放置到战场。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    instance.cardlocation === 'ITEM' &&
    playerState.hand.length > 0 &&
    recruitTargets(playerState).length > 0,
  cost: discardHandCost(1),
  execute: async (instance, gameState, playerState) => {
    const candidates = recruitTargets(playerState);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择圣王国单位',
      '从你的卡组选择1张ACCESS值+3以下的<圣王国>非神蚀单位放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '301130060_recruit_holy_kingdom' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || selected.cardlocation !== 'DECK' || !isHolyKingdomUnit(selected) || selected.godMark || (selected.acValue || 0) > 3) return;
    if (!putUnitOntoField(gameState, playerState.uid, selected, instance)) return;
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}, {
  id: '301130060_effect_destroy_substitute',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  erosionTotalLimit: [3, 6],
  description: '3-6：你的战场上<圣王国>单位有3个以上时，你的单位将被对手效果破坏时，可以横置这张卡作为代替。',
  substitutionAction: 'EXHAUST_SELF',
  substitutionOnlyEffect: true,
  substitutionOnlyOpponent: true,
  substitutionFilter: {
    type: 'UNIT',
    onField: true
  },
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'ITEM' &&
    !instance.isExhausted &&
    totalErosionCount(playerState) >= 3 &&
    totalErosionCount(playerState) <= 6 &&
    ownUnits(playerState).filter(isHolyKingdomUnit).length >= 3
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 301130060
 * Card2 Row: 576
 * Card Row: 460
 * Source CardNo: BT07-W10
 * Package: BT07(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{你的主要阶段}[舍弃1张手牌]：将你的卡组中的1张ACCESS值+3以下的<圣王国>非神蚀单位卡放置到战场上。
 * 【3-6】【永】{你的战场上的<圣王国>单位有3个以上，你的单位将要被对手的卡的效果破坏时}：你可以将重置状态的这张卡横置作为代替。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '301130060',
  fullName: '暮城兵营',
  specialName: '',
  type: 'ITEM',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '圣王国',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
