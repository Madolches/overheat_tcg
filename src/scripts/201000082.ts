import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, allCardsOnField, createSelectCardQuery, exileByEffect, ownUnits, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('201000082_sacrifice', '选择你的1个单位放逐。之后选择战场上最多2张非神蚀道具卡放逐；若放逐了【神依】单位，可以改选1张神蚀道具卡。', async (instance, gameState, playerState) => {
  if (ownUnits(playerState).length === 0) return;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    ownUnits(playerState),
    '选择放逐的单位',
    '选择你的1个单位，将其放逐。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '201000082_sacrifice', step: 'UNIT' },
    () => 'UNIT'
  );
}, {
  targetSpec: {
    title: '选择放逐的单位',
    description: '选择你的1个单位，将其放逐。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'UNIT',
    getCandidates: (_gameState, playerState) => ownUnits(playerState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections, context) => {
    if (context?.step === 'ITEMS') {
      selections.forEach(id => {
        const card = AtomicEffectExecutor.findCardById(gameState, id);
        if (card) exileByEffect(gameState, card, instance);
      });
      return;
    }

    const unit = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!unit || unit.cardlocation !== 'UNIT') return;
    const exiledShenyi = !!unit.isShenyi;
    exileByEffect(gameState, unit, instance);
    const targets = allCardsOnField(gameState).filter(card =>
      card.cardlocation === 'ITEM' &&
      (exiledShenyi ? card.godMark : !card.godMark)
    );
    if (targets.length === 0) return;
    createSelectCardQuery(
      gameState,
      context?.activationPlayerUid || _playerState.uid,
      targets,
      '选择放逐的道具',
      exiledShenyi ? '选择战场上的1张神蚀道具卡，将其放逐。' : '选择战场上的最多2张非神蚀道具卡，将其放逐。',
      0,
      exiledShenyi ? 1 : Math.min(2, targets.length),
      { sourceCardId: instance.gamecardId, effectId: '201000082_sacrifice', step: 'ITEMS' },
      () => 'ITEM'
    );
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000082
 * Card2 Row: 238
 * Card Row: 238
 * Source CardNo: BT03-W13
 * Package: BT03(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择你的1个单位，将其放逐。之后，选择战场上的最多2张非神蚀道具卡，将其放逐。
 * 若你放逐了具有【神依】的单位，选择的道具卡可以是战场上的1张神蚀道具卡。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201000082',
  fullName: '牺牲',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
