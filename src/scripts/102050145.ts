import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, createPlayerSelectQuery, createSelectCardQuery, damagePlayerByEffect, ensureData, getOpponentUid, isBattleFreeContext, moveCardAsCost, ownUnits, recordUnitSentFromFieldToGrave } from './BaseUtil';

const isSmallLost = (instance: Card, turn: number) =>
  Number(ensureData(instance).smallActivateLostUntilTurn || 0) > turn;

const canUseInBattleFreeOrDamageRequest = (gameState: any, playerState: any) =>
  (playerState.isTurn && gameState.phase === 'MAIN') ||
  isBattleFreeContext(gameState) ||
  (
    gameState.phase === 'COUNTERING' &&
    gameState.counterStack?.some((item: any) => item.type === 'PHASE_END' && item.nextPhase === 'DAMAGE_CALCULATION')
  );

const cardEffects: CardEffect[] = [{
  id: '102050145_sac_damage',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '选择你的1个单位送入墓地。之后选择1名玩家，给予其1点伤害，并直到下一次你的回合开始失去此能力。',
  condition: (gameState, playerState, instance) =>
    canUseInBattleFreeOrDamageRequest(gameState, playerState) &&
    !isSmallLost(instance, gameState.turnCount) &&
    ownUnits(playerState).length > 0,
  targetSpec: {
    title: '选择费用单位',
    description: '选择你的1个单位送入墓地作为费用。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'SAC',
    costTarget: true,
    getCandidates: (_gameState, playerState) =>
      ownUnits(playerState).map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  cost: async (gameState, playerState, instance, context?: any) => {
    const targetId = context?.declaredTargets?.find((target: any) => target.step === 'SAC')?.gamecardId;
    const target = targetId ? ownUnits(playerState).find(unit => unit.gamecardId === targetId) : undefined;
    if (!target) return false;
    moveCardAsCost(gameState, playerState.uid, target, 'GRAVE', instance);
    recordUnitSentFromFieldToGrave(gameState, playerState.uid, target);
    gameState.logs.push(`[${instance.fullName}] paid cost with [${target.fullName}].`);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState),
      '选择送入墓地的单位',
      '选择你的1个单位，将其送入墓地。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050145_sac_damage', step: 'SAC' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'SAC') {
      if (context?.declaredTargets?.length) {
        const data = ensureData(instance);
        data.smallActivateLostUntilTurn = gameState.turnCount + 2;
        data.smallActivateLostSourceName = instance.fullName;
        createPlayerSelectQuery(
          gameState,
          playerState.uid,
          '选择伤害玩家',
          '选择1名玩家，给予其1点伤害。',
          { sourceCardId: instance.gamecardId, effectId: '102050145_sac_damage', step: 'DAMAGE1' }
        );
        return;
      }
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || target.cardlocation !== 'UNIT') return;
      moveCardAsCost(gameState, playerState.uid, target, 'GRAVE', instance);
      recordUnitSentFromFieldToGrave(gameState, playerState.uid, target);
      gameState.logs.push(`[${instance.fullName}] 将 [${target.fullName}] 送入墓地作为费用。`);
      const data = ensureData(instance);
      data.smallActivateLostUntilTurn = gameState.turnCount + 2;
      data.smallActivateLostSourceName = instance.fullName;
      createPlayerSelectQuery(
        gameState,
        playerState.uid,
        '选择伤害玩家',
        '选择1名玩家，给予他1点伤害。',
        { sourceCardId: instance.gamecardId, effectId: '102050145_sac_damage', step: 'DAMAGE1' }
      );
      return;
    }

    if (context?.step !== 'DAMAGE1') return;
    const targetUid = selections[0] === 'PLAYER_SELF' ? playerState.uid : getOpponentUid(gameState, playerState.uid);
    await damagePlayerByEffect(gameState, playerState.uid, targetUid, 1, instance);
  }
}, {
  id: '102050145_ten_damage',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [10, 10],
  description: '10+：选择1名对手，给予其3点伤害。若未使对手败北，则你败北。',
  condition: (gameState, playerState) => canUseInBattleFreeOrDamageRequest(gameState, playerState),
  execute: async (instance, gameState, playerState) => {
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    await damagePlayerByEffect(gameState, playerState.uid, opponentUid, 3, instance);
    if (gameState.gameStatus !== 2) {
      gameState.gameStatus = 2;
      gameState.winnerId = opponentUid;
      gameState.winReason = 'KATHERINE_BACKLASH';
      gameState.winSourceCardName = instance.fullName;
      gameState.logs.push(`[${instance.fullName}] 的10+效果未使对手败北，${playerState.displayName} 败北。`);
    }
  }
}, {
  id: '102050145_lost_display',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '已使用效果时显示失去此能力。',
  applyContinuous: (gameState, instance) => {
    if (!isSmallLost(instance, gameState.turnCount)) return;
    instance.influencingEffects = instance.influencingEffects || [];
    instance.influencingEffects.push({ sourceCardName: instance.fullName, description: '已使用效果，失去此能力' });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 102050145
 * Card2 Row: 129
 * Card Row: 129
 * Source CardNo: BT02-R06
 * Package: BT02(SR,ESR,OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗:选择你的1个单位，将其送入墓地。之后，选择1名玩家，给予他1点伤害。直到下一次你的回合开始时为止，失去这个【启】能力。
 * 〖10+〗【启】:选择1名对手，给予他3点伤害。若这次伤害未能使对手败北，则你败北。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '102050145',
  fullName: '血焰督军「凯萨琳」',
  specialName: '凯萨琳',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 2 },
  faction: '伊列宇王国',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 1,
  baseDamage: 1,
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
