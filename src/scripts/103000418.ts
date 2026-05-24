import { Card, CardEffect } from '../types/game';
import { addContinuousDamage, addContinuousPower, backErosionCount, ensureData } from './BaseUtil';

const stackItemTargetsOwnField = (gameState: any, playerUid: string, item: any) => {
  const ownFieldIds = new Set([
    ...(gameState.players[playerUid]?.unitZone || []),
    ...(gameState.players[playerUid]?.itemZone || [])
  ].filter((card: Card | null): card is Card => !!card).map(card => card.gamecardId));
  const declaredTargetIds = (item.declaredTargets || []).map((target: any) => target.gamecardId);
  const directTargetIds = [
    item.targetCardId,
    item.data?.targetCardId,
    item.data?.targetId,
    ...(item.data?.targetCardIds || []),
    ...(item.data?.targetIds || [])
  ].filter(Boolean);
  return [...declaredTargetIds, ...directTargetIds].some(id => ownFieldIds.has(id));
};

const containsDestroyEffect = (item: any) =>
  /破坏|destroy/i.test(`${item.effect?.description || ''} ${item.effect?.content || ''} ${item.card?.fullName || ''}`);

const isCounterableDestroyEffect = (gameState: any, playerUid: string, item: any) =>
  item?.ownerUid &&
  item.ownerUid !== playerUid &&
  item.card &&
  (
    item.card.type === 'STORY' ||
    item.effect?.type === 'ACTIVATE' ||
    item.effect?.type === 'ACTIVATED'
  ) &&
  containsDestroyEffect(item) &&
  stackItemTargetsOwnField(gameState, playerUid, item);

const counterableDestroyEffectTarget = (gameState: any, playerUid: string) =>
  [...((gameState as any).counterStack || [])].reverse().find((item: any) =>
    isCounterableDestroyEffect(gameState, playerUid, item)
  );

const cardEffects: CardEffect[] = [{
  id: '103000418_counter_destroy_effect',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：反击对手使用的包含破坏你战场卡效果的【启】能力或故事卡。之后失去这个【启】能力。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    !(instance as any).data?.counterDestroyEffectLost &&
    gameState.phase === 'COUNTERING' &&
    !!counterableDestroyEffectTarget(gameState, playerState.uid),
  execute: async (instance, gameState, playerState) => {
    ensureData(instance).counterDestroyEffectLost = true;
    const target = counterableDestroyEffectTarget(gameState, playerState.uid);
    if (target) {
      target.isNegated = true;
      target.negated = true;
      gameState.logs.push(`[${instance.fullName}] 反击了包含破坏效果的能力或故事卡。`);
    }
  }
}, {
  id: '103000418_erosion_stats',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  erosionBackLimit: [3, 99],
  description: '创痕3：这个单位伤害+1、力量+1000。',
  applyContinuous: (gameState, instance) => {
    const owner = Object.values((gameState as any).players)
      .find((player: any) => player.unitZone.some((unit: Card | null) => unit?.gamecardId === instance.gamecardId));
    if (!owner || backErosionCount(owner as any) < 3) return;
    addContinuousDamage(instance, instance, 1);
    addContinuousPower(instance, instance, 1000);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000418
 * Card2 Row: 641
 * Card Row: 523
 * Source CardNo: BT08-G04
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗:反击对手使用包含破坏你战场的卡的效果的【启】能力或故事卡。之后，失去这个【启】能力。
 * 【创痕3】【永】:这个单位〖伤害+1〗〖力量+1000〗。
 */
const card: Card = {
  id: '103000418',
  fullName: '过关的「少女们」',
  specialName: '少女们',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 3,
  power: 3000,
  basePower: 3000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
