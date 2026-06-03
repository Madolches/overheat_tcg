import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, createSelectCardQuery, discardHandCost, getOpponentUid, moveCard, revealDeckCards } from './BaseUtil';

const battlePhases = new Set(['BATTLE_DECLARATION', 'DEFENSE_DECLARATION', 'BATTLE_FREE', 'DAMAGE_CALCULATION']);

const isBattlePhase = (gameState: any) => battlePhases.has(gameState.phase) ||
  (gameState.phase === 'COUNTERING' && battlePhases.has(gameState.previousPhase));

const battleHasEnded = (gameState: any) =>
  !gameState.battleState &&
  (
    gameState.phase === 'MAIN' ||
    gameState.phase === 'BATTLE_END' ||
    gameState.previousPhase === 'MAIN' ||
    gameState.previousPhase === undefined ||
    !battlePhases.has(gameState.previousPhase)
  );

const returnFromBattleExile = (instance: Card, gameState: any, playerState: any) => {
  const data = (instance as any).data || {};
  const ownerUid = data.returnFromExileAfterBattleOwnerUid || playerState.uid;
  const owner = gameState.players[ownerUid];
  if (!owner || !canPutUnitOntoBattlefield(owner, instance)) return false;

  delete data.returnFromExileAfterBattleTurn;
  delete data.returnFromExileAfterBattleOwnerUid;
  moveCard(gameState, ownerUid, instance, 'UNIT', instance);
  const returned = owner.unitZone.find((card: Card | null) => card?.gamecardId === instance.gamecardId);
  if (returned) {
    returned.isExhausted = false;
    returned.displayState = 'FRONT_UPRIGHT';
    returned.hasAttackedThisTurn = false;
  }
  return true;
};

const effect_101000501_turn_end: CardEffect = {
  id: '101000501_turn_end',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END' as any,
  triggerLocation: ['UNIT'],
  limitCount: 1,
  isMandatory: true,
  description: '你的回合结束时，公开卡组顶1张。若其为白色卡，对手各自选择1个单位放逐。公开的卡原样放回。',
  condition: (_gameState, playerState, _instance, event) => event?.playerUid === playerState.uid,
  execute: async (instance, gameState, playerState) => {
    const revealed = revealDeckCards(gameState, playerState.uid, 1, instance)[0];
    if (!revealed || revealed.color !== 'WHITE') return;

    const opponentUid = getOpponentUid(gameState, playerState.uid);
    const opponent = gameState.players[opponentUid];
    const candidates = opponent.unitZone.filter((card): card is Card => !!card);
    if (candidates.length === 0) return;

    createSelectCardQuery(
      gameState,
      opponentUid,
      candidates,
      '选择放逐单位',
      '选择你的1个单位放逐。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '101000501_turn_end',
        targetUid: opponentUid
      },
      () => 'UNIT'
    );
  },
  targetSpec: {
    preselect: false,
    title: '选择放逐单位',
    description: '若公开的卡是白色卡，对手选择他的1个单位，将其放逐。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) => {
      const opponentUid = getOpponentUid(gameState, playerState.uid);
      return gameState.players[opponentUid].unitZone
        .filter((card): card is Card => !!card)
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }));
    }
  },
  onQueryResolve: async (instance, gameState, _playerState, selections, context) => {
    if (context?.effectId !== '101000501_turn_end' || selections.length === 0) return;
    await AtomicEffectExecutor.execute(gameState, context.targetUid, {
      type: 'BANISH_CARD',
      targetFilter: { gamecardId: selections[0], type: 'UNIT' },
      faceDown: false
    }, instance);
  }
};

const effect_101000501_battle_exile_return: CardEffect = {
  id: '101000501_battle_exile_return',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '战斗阶段中，舍弃1张白色单位手牌：将这个单位放逐。这个战斗阶段结束时，将其放置到战场上。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    isBattlePhase(gameState) &&
    playerState.hand.some(card =>
      card.gamecardId !== instance.gamecardId &&
      card.type === 'UNIT' &&
      card.color === 'WHITE'
    ),
  cost: discardHandCost(1, card => card.type === 'UNIT' && card.color === 'WHITE'),
  execute: async (instance, gameState, playerState) => {
    const liveSelf = playerState.unitZone.find(card => card?.gamecardId === instance.gamecardId);
    if (!liveSelf) {
      gameState.logs.push(`[${instance.fullName}] 结算时已不在单位区，效果不处理。`);
      return;
    }

    moveCard(gameState, playerState.uid, liveSelf, 'EXILE', liveSelf, { faceDown: false });

    const exiledSelf = playerState.exile.find(card => card?.gamecardId === liveSelf.gamecardId);
    if (exiledSelf) {
      (exiledSelf as any).data = {
        ...((exiledSelf as any).data || {}),
        returnFromExileAfterBattleTurn: gameState.turnCount,
        returnFromExileAfterBattleOwnerUid: playerState.uid
      };
    }
    if (exiledSelf && battleHasEnded(gameState)) {
      gameState.logs.push(`[${exiledSelf.fullName}] 结算时战斗阶段已经结束，立即回到战场。`);
      returnFromBattleExile(exiledSelf, gameState, playerState);
    }
  }
};

const effect_101000501_return_after_battle: CardEffect = {
  id: '101000501_return_after_battle',
  type: 'TRIGGER',
  triggerLocation: ['EXILE'],
  triggerEvent: 'BATTLE_ENDED' as any,
  isMandatory: true,
  limitCount: 1,
  description: '这个战斗阶段结束时，将被这个效果放逐的这张卡放置到战场上。',
  condition: (gameState, _playerState, instance, event) => {
    const data = (instance as any).data;
    if (
      instance.cardlocation !== 'EXILE' ||
      data?.returnFromExileAfterBattleTurn !== gameState.turnCount
    ) {
      return false;
    }
    return event?.type === 'BATTLE_ENDED';
  },
  execute: async (instance, gameState, playerState) => {
    returnFromBattleExile(instance, gameState, playerState);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000501
 * Card2 Row: 291
 * Card Row: 648
 * Source CardNo: SP01-W01
 * Package: SP01(SPR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗:你的回合结束时，公开你卡组顶的一张卡。若那张卡是白色卡，所有对手选择他的一个单位，将其放逐。将公开的卡原样放回。
 * 【启】〖同名1回合1次〗:[舍弃手牌中的1张白色单位卡]这个能力只能在战斗阶段中发动。将这张卡放逐。这个战斗阶段结束时，将被放逐的这张卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101000501',
  fullName: '冰峰神兽「白虎」',
  specialName: '白虎',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '无',
  acValue: 4,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_101000501_turn_end, effect_101000501_battle_exile_return, effect_101000501_return_after_battle],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'SP01',
  uniqueId: null as any,
};

export default card;
