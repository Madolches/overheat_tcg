import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createChoiceQuery, createSelectCardQuery, ensureData, moveCard, ownUnits } from './BaseUtil';

const colorOptions = [
  { id: 'WHITE', label: '白' },
  { id: 'RED', label: '红' },
  { id: 'BLUE', label: '蓝' },
  { id: 'GREEN', label: '绿' },
  { id: 'YELLOW', label: '黄' }
];

const colorLabel: Record<string, string> = { WHITE: '白', RED: '红', BLUE: '蓝', GREEN: '绿', YELLOW: '黄' };

const cardEffects: CardEffect[] = [{
  id: '301000047_no_color',
  type: 'CONTINUOUS',
  triggerLocation: ['HAND', 'PLAY', 'ITEM', 'GRAVE', 'EXILE', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'],
  description: '这张卡在任何区域均不具有颜色。',
  applyContinuous: (_gameState, instance) => {
    instance.color = 'NONE';
  }
}, {
  id: '301000047_choose_protection',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  description: '进入战场时，选择你的1个单位并宣言1个颜色。只要这张卡在战场上，该单位不受对手该颜色卡牌效果影响。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'ITEM' &&
    ownUnits(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, ownUnits(playerState), '选择保护单位', '选择你战场上的1个单位。', 1, 1, {
      sourceCardId: instance.gamecardId,
      effectId: '301000047_choose_protection',
      step: 'TARGET'
    });
  },
  onQueryResolve: async (instance, gameState, _playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || target.cardlocation !== 'UNIT') return;
      ensureData(instance).lawCodeTargetId = target.gamecardId;
      createChoiceQuery(gameState, context.controllerUid || _playerState.uid, '宣言颜色', '宣言1个颜色。', colorOptions, {
        sourceCardId: instance.gamecardId,
        effectId: '301000047_choose_protection',
        step: 'COLOR'
      });
      return;
    }
    if (context?.step === 'COLOR') {
      ensureData(instance).lawCodeColor = selections[0];
      ensureData(instance).lawCodeColorLabel = colorLabel[selections[0]] || selections[0];
    }
  }
}, {
  id: '301000047_apply_protection',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '持续保护所选单位。',
  applyContinuous: (gameState, instance) => {
    const data = (instance as any).data || {};
    if (!data.lawCodeTargetId || !data.lawCodeColor) return;
    const target = AtomicEffectExecutor.findCardById(gameState, data.lawCodeTargetId);
    if (!target || target.cardlocation !== 'UNIT') return;
    const targetData = ensureData(target);
    targetData.unaffectedByOpponentColorEffects = data.lawCodeColor;
    targetData.unaffectedByOpponentColorEffectsSourceName = instance.fullName;
    targetData.unaffectedByOpponentColorEffectsLabel = data.lawCodeColorLabel || data.lawCodeColor;
  }
}, {
  id: '301000047_exile_on_leave',
  type: 'TRIGGER',
  triggerLocation: ['ITEM', 'GRAVE'],
  triggerEvent: 'CARD_LEFT_FIELD',
  sourceSnapshotOnLeftField: true,
  isMandatory: false,
  description: '这张卡从战场离开时，将这张卡放逐。',
  condition: (_gameState, _playerState, instance, event) =>
    (
      event?.sourceCard === instance ||
      event?.sourceCardId === instance.gamecardId ||
      event?.data?.previousSourceCardId === instance.gamecardId
    ) &&
    event.data?.sourceZone === 'ITEM' &&
    (instance.cardlocation === 'GRAVE' || event?.sourceCard === instance),
  execute: async (instance, gameState, playerState) => {
    moveCard(gameState, playerState.uid, instance, 'EXILE', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 301000047
 * Card2 Row: 512
 * Card Row: 335
 * Source CardNo: PR06-10W
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：这张卡在任何区域均不具有颜色。这个能力不会失去，效果也不能被无效化。
 * 【永】{这张卡进入战场时，选择你战场上的1个单位并宣言1个颜色}：只要这张卡在战场上，被选择的单位不会成为对手的宣言颜色的卡的效果对象，或由于其效果从战场上离开。
 * 【诱】{这张卡从战场上离开时}：将这张卡放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '301000047',
  fullName: '「菲之法典」',
  specialName: '菲之法典',
  type: 'ITEM',
  color: 'NONE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
