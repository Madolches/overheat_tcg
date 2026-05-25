import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, cardsInZones, ensureData, ownerUidOf, putUnitOntoField, selectFromEntries, totalErosionCount, wealthCount } from './BaseUtil';

const KYUBI = '九尾商会联盟';

const isKyubiUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (card.faction === KYUBI || card.fullName.includes('九尾商会联盟'));

const reviveTargets = (playerState: any) =>
  cardsInZones(playerState, ['GRAVE', 'EROSION_FRONT'])
    .filter(({ card }) =>
      isKyubiUnit(card) &&
      (card.cardlocation !== 'EROSION_FRONT' || card.displayState === 'FRONT_UPRIGHT') &&
      canPutUnitOntoBattlefield(playerState, card)
    );

const blueEnteredUnits = (event: any) =>
  event?.sourceCard?.type === 'UNIT' &&
  event.sourceCard.color === 'BLUE' &&
  event.data?.zone === 'UNIT';

const cardEffects: CardEffect[] = [{
  id: '304020050_revive_on_opponent_effect_leave',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'CARD_LEFT_FIELD',
  sourceSnapshotOnLeftField: true,
  description: '这张卡由于对手卡的效果从战场离开时，按离场前财富数量放置墓地或正面侵蚀区的<九尾商会联盟>单位。',
  condition: (_gameState, playerState, instance, event) =>
    (
      event?.sourceCard === instance ||
      event?.sourceCardId === instance.gamecardId ||
      event?.data?.previousSourceCardId === instance.gamecardId ||
      (
        !!event?.sourceCard?.runtimeFingerprint &&
        event.sourceCard.runtimeFingerprint === instance.runtimeFingerprint
      )
    ) &&
    event.playerUid === playerState.uid &&
    event.data?.sourceZone === 'ITEM' &&
    event.data?.isEffect === true &&
    !!event.data?.effectSourcePlayerUid &&
    event.data.effectSourcePlayerUid !== playerState.uid &&
    Number((event.sourceCard as any)?.data?.wealthBeforeLeftField || 0) > 0 &&
    reviveTargets(playerState).length > 0,
  execute: async (instance, gameState, playerState, event) => {
    const maxCount = Math.min(
      Number((event?.sourceCard as any)?.data?.wealthBeforeLeftField || 0),
      reviveTargets(playerState).length
    );
    if (maxCount <= 0) return;
    selectFromEntries(
      gameState,
      playerState.uid,
      reviveTargets(playerState),
      '选择九尾商会联盟单位',
      `选择至多${maxCount}张墓地或正面侵蚀区的<九尾商会联盟>单位放置到战场。`,
      1,
      maxCount,
      { sourceCardId: instance.gamecardId, effectId: '304020050_revive_on_opponent_effect_leave' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    selections.forEach(id => {
      const target = AtomicEffectExecutor.findCardById(gameState, id);
      if (target && isKyubiUnit(target) && ['GRAVE', 'EROSION_FRONT'].includes(target.cardlocation || '') && canPutUnitOntoBattlefield(playerState, target)) {
        putUnitOntoField(gameState, playerState.uid, target, instance);
      }
    });
  }
}, {
  id: '304020050_grant_wealth_to_blue_unit',
  type: 'TRIGGER',
  triggerLocation: ['ITEM'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isGlobal: true,
  erosionTotalLimit: [3, 6],
  description: '3-6：你的蓝色单位进入战场时，横置这张卡，选择其中1个单位，那个单位获得财富1。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'ITEM' &&
    !instance.isExhausted &&
    event?.playerUid === playerState.uid &&
    blueEnteredUnits(event) &&
    totalErosionCount(playerState) >= 3 &&
    totalErosionCount(playerState) <= 6,
  execute: async (instance, gameState, playerState, event) => {
    instance.isExhausted = true;
    const target = event?.sourceCard;
    if (!target || target.cardlocation !== 'UNIT') return;
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, [{ card: target, source: 'UNIT' as const }]),
      title: '选择获得财富的单位',
      description: '选择进入战场的蓝色单位，使其获得财富1。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: { sourceCardId: instance.gamecardId, effectId: '304020050_grant_wealth_to_blue_unit' }
    };
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT' || target.color !== 'BLUE') return;
    const data = ensureData(target);
    data.grantedWealthValue = Math.max(Number(data.grantedWealthValue || 0), 1);
    data.grantedWealthSourceName = instance.fullName;
    gameState.logs.push(`[${instance.fullName}] 使 [${target.fullName}] 获得财富1。`);
  }
}, {
  id: '304020050_record_wealth_before_leave',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '记录这张卡离场前的财富指示物数量。',
  applyContinuous: (gameState, instance) => {
    const ownerUid = ownerUidOf(gameState, instance);
    if (!ownerUid) return;
    ensureData(instance).wealthBeforeLeftField = wealthCount(gameState.players[ownerUid]);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 304020050
 * Card2 Row: 542
 * Card Row: 362
 * Source CardNo: BT07-B09
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】：{这张卡由于对手的卡的效果从战场上离开时}：将你的墓地或侵蚀区的正面卡中数量最多与这张卡从战场离开前你拥有的财富指示物数量相同的<九尾商会联盟>的单位卡放置到战场上。
 * 【3-6】【诱】：{你的蓝色单位进入战场时，选择其中1个单位 }［横置］：被选择的单位获得“【永】：财富1”的能力。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '304020050',
  fullName: '「白尾之家」',
  specialName: '白尾之家',
  type: 'ITEM',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '九尾商会联盟',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
