import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, discardHandCost, ensureData, isBattleFreeContext, wealthCount } from './BaseUtil';

const disableTradeUntilNextOwnTurn = (instance: Card, gameState: any) => {
  (instance as any).data = {
    ...((instance as any).data || {}),
    tradeEffectDisabledUntilOwnStartUid: AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId)
  };
  gameState.logs.push(`[${instance.fullName}] 的手牌交换效果直到下一次自己的回合开始前失去。`);
};

const cardEffects: CardEffect[] = [{
  id: '104020336_battle_shelter',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '财富3以上，战斗自由步骤中，舍弃2张手牌：这次战斗中你的单位不会被战斗破坏，防止你将要受到的所有战斗伤害。',
  condition: (gameState, playerState) =>
    wealthCount(playerState, gameState) >= 3 &&
    isBattleFreeContext(gameState) &&
    !!gameState.battleState &&
    playerState.hand.length >= 2,
  cost: discardHandCost(2),
  execute: async (instance, gameState, playerState) => {
    const battlingOwnUnits = (gameState.battleState?.attackers || [])
      .map((id: string) => AtomicEffectExecutor.findCardById(gameState, id))
      .filter((unit: Card | undefined): unit is Card =>
        !!unit &&
        playerState.unitZone.some(own => own?.gamecardId === unit.gamecardId)
      );
    const defender = gameState.battleState?.defender
      ? AtomicEffectExecutor.findCardById(gameState, gameState.battleState.defender)
      : undefined;
    if (defender && playerState.unitZone.some(unit => unit?.gamecardId === defender.gamecardId)) {
      battlingOwnUnits.push(defender);
    }

    battlingOwnUnits.forEach(unit => {
      const data = ensureData(unit);
      const battleId = gameState.battleState
        ? ((gameState.battleState as any).battleId ||= `battle_${gameState.turnCount}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
        : undefined;
      data.preventBattleDestroyForBattleId = battleId;
      data.preventBattleDestroyForBattleTurn = gameState.turnCount;
      data.preventBattleDestroyForBattleSourceName = instance.fullName;
    });
    (playerState as any).preventAllDamageTurn = gameState.turnCount;
    (playerState as any).preventAllDamageSourceName = instance.fullName;
  }
}, {
  id: '104020336_opponent_rummage',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '财富3以上，选择一名对手，舍弃2张手牌：那名对手抽3张卡，之后舍弃自己的3张手牌。直到下一次你的回合开始失去这项效果。',
  condition: (gameState, playerState, instance) =>
    wealthCount(playerState, gameState) >= 3 &&
    playerState.hand.length >= 2 &&
    !(instance as any).data?.tradeEffectDisabledUntilOwnStartUid &&
    gameState.playerIds.some(uid => uid !== playerState.uid && gameState.players[uid].deck.length >= 3),
  cost: discardHandCost(2),
  execute: async (instance, gameState, playerState) => {
    const opponentUid = gameState.playerIds.find(uid => uid !== playerState.uid);
    if (!opponentUid) return;
    await AtomicEffectExecutor.execute(gameState, opponentUid, { type: 'DRAW', value: 3 }, instance);
    const opponent = gameState.players[opponentUid];
    const discards = opponent.hand.slice(0, Math.min(3, opponent.hand.length));
    discards.forEach(card => {
      AtomicEffectExecutor.moveCard(gameState, opponentUid, 'HAND', opponentUid, 'GRAVE', card.gamecardId, true, {
        effectSourcePlayerUid: playerState.uid,
        effectSourceCardId: instance.gamecardId
      });
    });
    disableTradeUntilNextOwnTurn(instance, gameState);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020336
 * Card2 Row: 461
 * Card Row: 396
 * Source CardNo: BT06-B02
 * Package: BT06(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖同名1回合1次〗{你的财富指示物3个以上，你选择1项效果并执行}：
 * ◆ {战斗自由步骤}（舍弃两张手牌）：这次战斗中，你的单位不会被战斗破坏。防止你将要受到的所有战斗伤害。
 * ◆ {选择一名对手}（舍弃两张手牌）：那名对手抽3张卡，之后，舍弃他自己的3张手牌。直到下一次你的回合开始为止，你的《商队交易专家》失去这项效果。
 */
const card: Card = {
  id: '104020336',
  fullName: '商队交易专家',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '九尾商会联盟',
  acValue: 3,
  power: 1000,
  basePower: 1000,
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
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
