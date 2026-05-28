import { Card, CardEffect, TriggerLocation } from '../types/game';
import { addInfluence, allCardsOnField, createSelectCardQuery, damagePlayerByEffect, destroyByEffect, ownerOf, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('202050034_destroy_god', '创痕2：选择1张神蚀卡破坏。之后给予你1点伤害。女神化时手牌中ACCESS值变为0。', async (instance, gameState, playerState) => {
    const candidates = allCardsOnField(gameState).filter(card => card.godMark);
    if (candidates.length === 0) {
      await damagePlayerByEffect(gameState, playerState.uid, playerState.uid, 1, instance);
      return;
    }
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择破坏对象',
      '选择1张神蚀卡，将其破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '202050034_destroy_god' },
      card => card.cardlocation || 'UNIT'
    );
  }, {
    erosionBackLimit: [2, 10],
    targetSpec: {
      title: '选择破坏对象',
      description: '选择1张神蚀卡，将其破坏。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT', 'ITEM'],
      getCandidates: gameState => allCardsOnField(gameState)
        .filter(card => card.godMark)
        .map(card => ({ card, source: card.cardlocation as any }))
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      const target = allCardsOnField(gameState).find(card => card.gamecardId === selections[0]);
      if (target) destroyByEffect(gameState, target, instance);
      await damagePlayerByEffect(gameState, playerState.uid, playerState.uid, 1, instance);
    }
  }), {
    id: '202050034_hand_cost',
    type: 'CONTINUOUS',
    content: 'SELF_HAND_COST',
    triggerLocation: ['HAND'],
    description: '你处于女神化状态时，手牌中的这张卡ACCESS值变为0。',
    applyContinuous: (_gameState, instance) => {
      const owner = ownerOf(_gameState, instance);
      if (!owner?.isGoddessMode || instance.cardlocation !== 'HAND') return;
      instance.acValue = 0;
      addInfluence(instance, instance, 'ACCESS值变为0');
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202050034
 * Card2 Row: 52
 * Card Row: 52
 * Source CardNo: BT01-R14
 * Package: BT01(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕2】（你的侵蚀区中的背面卡有3张以上时才有效）选择1张神蚀卡，将其破坏。之后，给予你1点伤害。你处于女神化状态时，手牌中的这张卡的ACCESS值变为〖0〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202050034',
  fullName: '碎片狩猎',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '伊列宇王国',
  acValue: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
