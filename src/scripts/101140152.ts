import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addInfluence, createSelectCardQuery, ensureData, erosionCost, forbidAttackAndDefenseUntil, isBattleFreeContext, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101140152_silence_god',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '横置：选择对手1个神蚀单位，直到对手回合结束不能发动能力、不能攻击防御。',
  condition: (gameState, playerState, instance) => {
    const opponentUid = gameState.playerIds.find(uid => uid !== playerState.uid)!;
    return !instance.isExhausted && gameState.players[opponentUid].unitZone.some(unit => unit?.godMark);
  },
  cost: async (_gameState, _playerState, instance) => {
    if (instance.isExhausted) return false;
    instance.isExhausted = true;
    return true;
  },
  targetSpec: {
    title: '选择神蚀单位',
    description: '选择对手的1个神蚀单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) => {
      const opponentUid = gameState.playerIds.find(uid => uid !== playerState.uid)!;
      return gameState.players[opponentUid].unitZone
        .filter((unit): unit is Card => !!unit && unit.godMark)
        .map(card => ({ card, source: 'UNIT' as any }));
    }
  },
  execute: async (instance, gameState, playerState) => {
    const opponentUid = gameState.playerIds.find(uid => uid !== playerState.uid)!;
    const targets = gameState.players[opponentUid].unitZone.filter((unit): unit is Card => !!unit && unit.godMark);
    createSelectCardQuery(gameState, playerState.uid, targets, '选择神蚀单位', '选择对手的1个神蚀单位。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '101140152_silence_god' }, () => 'UNIT');
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target) return;
    const opponentUid = gameState.playerIds.find(uid => uid !== playerState.uid)!;
    const untilTurn = gameState.players[opponentUid].isTurn ? gameState.turnCount : gameState.turnCount + 1;
    const data = ensureData(target);
    data.cannotActivateUntilTurn = untilTurn;
    data.cannotActivateSourceName = instance.fullName;
    target.temporaryCanActivateEffect = false;
    addInfluence(target, instance, '不能发动能力');
    forbidAttackAndDefenseUntil(target, instance, untilTurn);
  }
}, {
  id: '101140152_bottom_attacker',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [10, 10],
  limitCount: 1,
  description: '10+：侵蚀2，选择正在攻击的神蚀单位放到卡组底。',
  condition: gameState => isBattleFreeContext(gameState) && !!gameState.battleState?.attackers?.some(id => AtomicEffectExecutor.findCardById(gameState, id)?.godMark),
  cost: erosionCost(2),
  targetSpec: {
    title: '选择攻击单位',
    description: '选择战场上的1个正在进行攻击的神蚀单位放到卡组底。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    getCandidates: gameState =>
      (gameState.battleState?.attackers || [])
        .map(id => AtomicEffectExecutor.findCardById(gameState, id))
        .filter((card): card is Card => !!card && card.godMark)
        .map(card => ({ card, source: 'UNIT' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    const targets = (gameState.battleState?.attackers || []).map(id => AtomicEffectExecutor.findCardById(gameState, id)).filter((card): card is Card => !!card && card.godMark);
    createSelectCardQuery(gameState, playerState.uid, targets, '选择攻击单位', '选择战场上的1个正在进行攻击的神蚀单位放到卡组底。', 1, 1, { sourceCardId: instance.gamecardId, effectId: '101140152_bottom_attacker' }, () => 'UNIT');
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target) return;
    const uid = AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId);
    if (uid) moveCard(gameState, uid, target, 'DECK', instance, { insertAtBottom: true });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140152
 * Card2 Row: 142
 * Card Row: 142
 * Source CardNo: BT02-W02
 * Package: BT02(SR,ESR,OHR),BT05(FVR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】:[〖横置〗]选择对手的1个神蚀单位，直到对手的回合结束时为止，那个单位不能发动能力，不能宣言攻击和防御。
 * 〖10+〗【启】〖1回合1次〗:[〖侵蚀2〗]选择战场上的1个正在进行攻击的神蚀单位，将其放置到其持有者的卡组底。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101140152',
  fullName: '未来先读「莉薇安」',
  specialName: '莉薇安',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '女神教会',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
