import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, discardHandCost, ensureData, getOpponentUid, isBattleFreeContext, wealthCount } from './BaseUtil';

const MODE_BATTLE_SHELTER = 'BATTLE_SHELTER';
const MODE_OPPONENT_RUMMAGE = 'OPPONENT_RUMMAGE';
const STEP_OPPONENT_RUMMAGE_DISCARD = 'OPPONENT_RUMMAGE_DISCARD';

const selectedModeFromContext = (context?: any) =>
  context?.modeId || context?.selectedModeId || context?.declaredModeId;

const disableTradeUntilNextOwnTurn = (instance: Card, gameState: any) => {
  (instance as any).data = {
    ...((instance as any).data || {}),
    tradeEffectDisabledUntilOwnStartUid: AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId)
  };
  gameState.logs.push(`[${instance.fullName}] 的手牌交换效果直到下一次自己的回合开始前失去。`);
};

const canUseBattleShelter = (gameState: any, _playerState: any) =>
  isBattleFreeContext(gameState) &&
  !!gameState.battleState;

const canUseOpponentRummage = (gameState: any, playerState: any, instance: Card) =>
  !(instance as any).data?.tradeEffectDisabledUntilOwnStartUid &&
  gameState.players[getOpponentUid(gameState, playerState.uid)]?.deck.length >= 3;

const cardEffects: CardEffect[] = [{
  id: '104020336_modes',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '财富3以上，选择1项效果并执行：战斗自由步骤中舍弃2张手牌防止战斗破坏和战斗伤害；或选择对手并舍弃2张手牌，使对手抽3后舍弃3。',
  condition: (gameState, playerState, instance) =>
    wealthCount(playerState, gameState) >= 3 &&
    playerState.hand.length >= 2 &&
    (canUseBattleShelter(gameState, playerState) || canUseOpponentRummage(gameState, playerState, instance)),
  targetSpec: {
    modeTitle: '选择商队交易专家',
    modeDescription: '选择要执行的1项效果。',
    modeOptions: [{
      id: MODE_BATTLE_SHELTER,
      label: '防止战斗',
      title: '防止战斗',
      description: '战斗自由步骤中，舍弃2张手牌：这次战斗中你的单位不会被战斗破坏，防止你将要受到的所有战斗伤害。',
      minSelections: 0,
      maxSelections: 0,
      condition: canUseBattleShelter
    }, {
      id: MODE_OPPONENT_RUMMAGE,
      label: '对手抽弃',
      title: '对手抽弃',
      description: '选择一名对手，舍弃2张手牌：那名对手抽3张卡，之后舍弃自己的3张手牌。',
      minSelections: 0,
      maxSelections: 0,
      condition: canUseOpponentRummage
    }]
  },
  cost: discardHandCost(2),
  onQueryResolve: async (instance, gameState, playerState, _selections, context) => {
    if (context?.step === STEP_OPPONENT_RUMMAGE_DISCARD) {
      const opponentUid = context.opponentUid || playerState.uid;
      const opponent = gameState.players[opponentUid];
      const activationPlayerUid =
        context.activationPlayerUid ||
        AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId) ||
        playerState.uid;

      _selections.forEach(id => {
        const card = opponent.hand.find((candidate: Card) => candidate.gamecardId === id);
        if (card) {
          AtomicEffectExecutor.moveCard(gameState, opponentUid, 'HAND', opponentUid, 'GRAVE', card.gamecardId, true, {
            effectSourcePlayerUid: activationPlayerUid,
            effectSourceCardId: instance.gamecardId
          });
        }
      });
      disableTradeUntilNextOwnTurn(instance, gameState);
      return;
    }

    const mode = selectedModeFromContext(context);
    if (mode === MODE_BATTLE_SHELTER) {
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
      return;
    }

    if (mode !== MODE_OPPONENT_RUMMAGE) return;
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    await AtomicEffectExecutor.execute(gameState, opponentUid, { type: 'DRAW', value: 3 }, instance);
    const opponent = gameState.players[opponentUid];
    if (opponent.hand.length < 3) {
      disableTradeUntilNextOwnTurn(instance, gameState);
      return;
    }
    createSelectCardQuery(
      gameState,
      opponentUid,
      opponent.hand,
      '选择舍弃手牌',
      '选择自己的3张手牌舍弃。',
      3,
      3,
      {
        sourceCardId: instance.gamecardId,
        effectId: '104020336_modes',
        step: STEP_OPPONENT_RUMMAGE_DISCARD,
        opponentUid,
        activationPlayerUid: playerState.uid
      },
      () => 'HAND'
    );
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
