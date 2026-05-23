import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, hasPromotionTarget, isSameFactionCard, markPlacedByPromotion, moveCardAsCost, ownUnits, promotionTargetsFromAccess, putUnitOntoField, story } from './BaseUtil';

const promotionCostTargets = (playerState: any, instance: Card) =>
  ownUnits(playerState).filter(unit => isSameFactionCard(unit, instance) && hasPromotionTarget(playerState, unit));

const cardEffects: CardEffect[] = [story('202050118_draw_and_promote', '抽1张卡，将你的1个同势力单位送入墓地并晋升。', async (instance, gameState, playerState) => {
  await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  createSelectCardQuery(
    gameState,
    playerState.uid,
    promotionCostTargets(playerState, instance),
    '选择晋升单位',
    '选择你战场上的1个同势力单位送入墓地并晋升。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '202050118_draw_and_promote', step: 'COST_UNIT' },
    () => 'UNIT'
  );
}, {
  condition: (_gameState, playerState, instance) =>
    playerState.deck.length > 0 &&
    promotionCostTargets(playerState, instance).length > 0,
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'COST_UNIT') {
      const unit = promotionCostTargets(playerState, instance).find(target => target.gamecardId === selections[0]);
      if (!unit) return;
      const sourceAccess = unit.acValue || 0;
      moveCardAsCost(gameState, playerState.uid, unit, 'GRAVE', instance);
      const candidates = promotionTargetsFromAccess(playerState, sourceAccess);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择晋升单位',
        '选择手牌或卡组中1张ACCESS值+1的单位放置到战场。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '202050118_draw_and_promote', step: 'PROMOTION_PUT', sourceAccess },
        card => card.cardlocation as any
      );
      return;
    }
    if (context?.step !== 'PROMOTION_PUT') return;
    const sourceAccess = Number(context?.sourceAccess || 0);
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || !promotionTargetsFromAccess(playerState, sourceAccess).some(card => card.gamecardId === target.gamecardId)) return;
    const targetId = target.gamecardId;
    if (!putUnitOntoField(gameState, playerState.uid, target, instance)) return;
    const live = AtomicEffectExecutor.findCardById(gameState, targetId);
    if (live?.cardlocation === 'UNIT') markPlacedByPromotion(gameState, live, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202050118
 * Card2 Row: 601
 * Card Row: 485
 * Source CardNo: BT08-R08
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 抽1张卡。将你战场上的1个<伊列宇王国>的单位送入墓地。之后，将你的卡组或手牌中的1张ACCESS值比那个单位的ACCESS值多1的单位卡放置到战场上。这个效果进入战场的单位视作由于晋升进入战场。
 */
const card: Card = {
  id: '202050118',
  fullName: '升迁',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '伊列宇王国',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
