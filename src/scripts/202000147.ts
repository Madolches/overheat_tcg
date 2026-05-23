import { Card, CardEffect } from '../types/game';
import {
  createChoiceQuery,
  createPlayerSelectQuery,
  damagePlayerByEffect,
  ensureData,
  getOpponentUid,
  ownerUidOf
} from './BaseUtil';

const effect_202000147_draw_reveal: CardEffect = {
  id: '202000147_draw_reveal',
  type: 'TRIGGER',
  triggerLocation: ['HAND'],
  triggerEvent: 'CARD_DRAWN',
  isMandatory: false,
  description: '你在抽卡阶段抽到这张卡时，可以展示手牌中的这张卡直到回合结束。若展示，本回合主要阶段开始时获得伤害效果。',
  condition: (gameState, _playerState, instance, event) =>
    instance.cardlocation === 'HAND' &&
    event?.data?.cardId === instance.gamecardId,
  execute: async (instance, gameState, playerState) => {
    createChoiceQuery(
      gameState,
      playerState.uid,
      '展示火焰爆弹',
      '展示手牌中的这张卡直到回合结束，以获得本回合主要阶段开始时的伤害效果。',
      [
        { id: 'YES', label: '展示' },
        { id: 'NO', label: '不展示' }
      ],
      { sourceCardId: instance.gamecardId, effectId: '202000147_draw_reveal', step: 'REVEAL' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'REVEAL' || selections[0] !== 'YES') return;
    const data = ensureData(instance);
    data.flameBombRevealedTurn = gameState.turnCount;
    data.flameBombRevealOwnerUid = playerState.uid;
    addRevealedHandCard(playerState, instance.gamecardId);
    gameState.logs.push(`[${instance.fullName}] 展示了手牌中的这张卡，本回合主要阶段开始时可以发动伤害效果。`);
    queueMainStartDamageIfAlreadyInMain(instance, gameState, playerState);
  }
};

const effect_202000147_main_start_damage: CardEffect = {
  id: '202000147_main_start_damage',
  type: 'TRIGGER',
  triggerLocation: ['HAND'],
  triggerEvent: 'PHASE_CHANGED',
  isMandatory: false,
  limitCount: 1,
  limitGlobal: true,
  limitNameType: true,
  description: '1游戏1次，只能在你的主要阶段开始时使用：选择1名对手，给予4点伤害；你的侵蚀区中每有1张背面卡，伤害+1。',
  condition: (gameState, playerState, instance, event) => {
    const data = ensureData(instance);
    return event?.data?.phase === 'MAIN' &&
      event.data?.reason === 'MAIN_PHASE_START' &&
      playerState.isTurn &&
      instance.cardlocation === 'HAND' &&
      data.flameBombRevealedTurn === gameState.turnCount &&
      data.flameBombRevealOwnerUid === playerState.uid;
  },
  execute: async (instance, gameState, playerState) => {
    createPlayerSelectQuery(
      gameState,
      playerState.uid,
      '选择伤害对象',
      `选择1名对手，给予${flameBombDamage(playerState)}点伤害。`,
      { sourceCardId: instance.gamecardId, effectId: '202000147_main_start_damage', step: 'DAMAGE' },
      { includeSelf: false, includeOpponent: true }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'DAMAGE') return;
    const targetUid = selections[0] === 'PLAYER_SELF' ? playerState.uid : getOpponentUid(gameState, playerState.uid);
    await damagePlayerByEffect(gameState, playerState.uid, targetUid, flameBombDamage(playerState), instance);
  }
};

const addRevealedHandCard = (playerState: any, cardId: string) => {
  const revealed = new Set<string>(playerState.revealedHandCardIds || []);
  revealed.add(cardId);
  playerState.revealedHandCardIds = Array.from(revealed);
};

const queueMainStartDamageIfAlreadyInMain = (instance: Card, gameState: any, playerState: any) => {
  if (
    gameState.phase !== 'MAIN' ||
    !playerState.isTurn ||
    ownerUidOf(gameState, instance) !== playerState.uid
  ) {
    return;
  }

  const effectIndex = instance.effects?.findIndex(effect => effect.id === '202000147_main_start_damage') ?? -1;
  const effect = effectIndex >= 0 ? instance.effects?.[effectIndex] : undefined;
  if (!effect?.condition?.(gameState, playerState, instance, {
    type: 'PHASE_CHANGED',
    data: { phase: 'MAIN', reason: 'MAIN_PHASE_START' }
  } as any)) {
    return;
  }

  const alreadyQueued = gameState.triggeredEffectsQueue?.some((record: any) =>
    record.card?.gamecardId === instance.gamecardId &&
    record.effect?.id === effect.id &&
    record.playerUid === playerState.uid
  );
  if (alreadyQueued) return;

  gameState.triggeredEffectsQueue = gameState.triggeredEffectsQueue || [];
  gameState.triggeredEffectsQueue.push({
    queueId: `${instance.gamecardId}_202000147_main_start_${gameState.turnCount}`,
    card: instance,
    effect,
    effectIndex,
    playerUid: playerState.uid,
    event: {
      type: 'PHASE_CHANGED',
      data: { phase: 'MAIN', reason: 'MAIN_PHASE_START' }
    }
  });
};

const flameBombDamage = (playerState: any) =>
  4 + playerState.erosionBack.filter((card: Card | null) => !!card).length;

const cardEffects: CardEffect[] = [
  effect_202000147_draw_reveal,
  effect_202000147_main_start_damage
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202000147
 * Card2 Row: 265
 * Card Row: 621
 * Source CardNo: SP01-R02
 * Package: SP01(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 你在抽卡阶段抽到这张卡时，你可以将手牌中的这种卡展示直到这个回合结束时为止。若展示，本回合中，这张卡获得下列效果:
 * “〖一游戏一次〗:只能在你的主要阶段开始时使用。选择1名对手，给予他4点伤害，你的侵蚀区中每有一张背面卡，这个伤害再增加1点。”
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202000147',
  fullName: '火焰爆弹',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 3 },
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP01',
  uniqueId: null as any,
};

export default card;
