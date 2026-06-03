import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, createChoiceQuery, createSelectCardQuery, faceUpErosion, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '301130026_exile_draw',
  type: 'TRIGGER',
  triggerEvent: ['CARD_ATTACK_DECLARED', 'CARD_DEFENSE_DECLARED'],
  isMandatory: false,
  triggerLocation: ['ITEM'],
  description: '你的单位组成联军时，或你的单位宣言防御时，可以选择最多3张正面侵蚀放逐。若放逐白色神蚀卡，可以抽1张卡。',
  condition: (_gameState, playerState, _instance, event) => {
    const alliance = event?.type === 'CARD_ATTACK_DECLARED' && event.playerUid === playerState.uid && !!event.data?.isAlliance;
    const defense = event?.type === 'CARD_DEFENSE_DECLARED' && event.playerUid === playerState.uid;
    return (alliance || defense) && faceUpErosion(playerState).length > 0;
  },
  execute: async (instance, gameState, playerState) => {
    const targets = faceUpErosion(playerState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择放逐的侵蚀卡',
      '选择你的侵蚀区的最多3张正面卡，将其放逐。',
      0,
      Math.min(3, targets.length),
      { sourceCardId: instance.gamecardId, effectId: '301130026_exile_draw', step: 'EXILE' },
      () => 'EROSION_FRONT'
    );
  },
  targetSpec: {
    title: '选择放逐的侵蚀卡',
    description: '选择你的侵蚀区的最多3张正面卡，将其放逐。',
    minSelections: 0,
    maxSelections: 3,
    zones: ['EROSION_FRONT'],
    controller: 'SELF',
    step: 'EXILE',
    getCandidates: (_gameState, playerState) =>
      faceUpErosion(playerState).map(card => ({ card, source: 'EROSION_FRONT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'DRAW_CHOICE') {
      if (selections[0] === 'YES') await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
      return;
    }
    const exiled = selections
      .map(id => playerState.erosionFront.find(card => card?.gamecardId === id))
      .filter((card): card is Card => !!card);
    exiled.forEach(card => moveCard(gameState, playerState.uid, card, 'EXILE', instance));
    if (exiled.some(card => card.color === 'WHITE' && card.godMark)) {
      createChoiceQuery(
        gameState,
        playerState.uid,
        '是否抽卡',
        '你放逐了白色神蚀卡。是否抽1张卡？',
        [{ id: 'YES', label: '抽1张卡' }, { id: 'NO', label: '不抽' }],
        { sourceCardId: instance.gamecardId, effectId: '301130026_exile_draw', step: 'DRAW_CHOICE' }
      );
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 301130026
 * Card2 Row: 156
 * Card Row: 156
 * Source CardNo: BT02-W16
 * Package: BT02(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:你的单位组成联军时，或你的单位宣言防御时，你可以选择你的侵蚀区的最多3张正面卡，将其放逐。若放逐了白色神蚀卡，你可以抽1张卡。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '301130026',
  fullName: '「战争女神像」',
  specialName: '战争女神像',
  type: 'ITEM',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '圣王国',
  acValue: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
