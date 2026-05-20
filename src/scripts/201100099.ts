import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { backErosionCount, createSelectCardQuery, ensureData, moveCard, moveCardAsCost, ownUnits, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('201100099_devotion', '创痕2：将你战场上的1个神蚀单位放逐。本回合中，你的单位不会由于对手的卡的效果从战场上离开，防止你将要受到的所有伤害。放逐这张卡。', async (instance, gameState, playerState) => {
  const candidates = ownUnits(playerState).filter(unit => unit.godMark);
  if (candidates.length === 0) return;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    candidates,
    '选择献身单位',
    '选择你战场上的1个神蚀单位放逐作为费用。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '201100099_devotion', step: 'EXILE_GODMARK_UNIT' },
    () => 'UNIT'
  );
}, {
  condition: (_gameState, playerState) =>
    backErosionCount(playerState) >= 2 &&
    ownUnits(playerState).some(unit => unit.godMark),
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'EXILE_GODMARK_UNIT') return;
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT' || !target.godMark) return;

    moveCardAsCost(gameState, playerState.uid, target, 'EXILE', instance);
    ownUnits(playerState).forEach(unit => {
      const data = ensureData(unit);
      data.cannotLeaveFieldByOpponentEffectTurn = gameState.turnCount;
      data.cannotLeaveFieldByOpponentEffectSourceName = instance.fullName;
    });
    (playerState as any).preventAllDamageTurn = gameState.turnCount;
    (playerState as any).preventAllDamageSourceName = instance.fullName;

    const liveStory = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (liveStory?.cardlocation === 'PLAY' || liveStory?.cardlocation === 'GRAVE') {
      moveCard(gameState, playerState.uid, liveStory, 'EXILE', instance);
    }
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201100099
 * Card2 Row: 477
 * Card Row: 410
 * Source CardNo: BT06-W07
 * Package: BT06(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕2】（你的侵蚀区中的背面卡有2张以上时才有效）[将你的战场上的1个神蚀单位放逐]：本回合中，你的单位不会由于对手的卡的效果从战场上离开，防止你将要受到的所有伤害。放逐这张卡。
 */
const card: Card = {
  id: '201100099',
  fullName: '献身',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '艾柯利普斯',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
