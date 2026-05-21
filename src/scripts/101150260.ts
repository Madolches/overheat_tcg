import { Card, CardEffect, PlayerState } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, moveCard, ownUnits } from './BaseUtil';

const getValidTargets = (playerState: PlayerState) =>
  ownUnits(playerState).filter(unit =>
    playerState.deck.some(card => card.fullName === unit.fullName)
  );

const cardEffects: CardEffect[] = [{
  id: '101150260_hand_exile_draw',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '你的主要阶段中，从手牌发动：选择你的1个单位，将这张卡放逐。之后将卡组中1张被选择单位的同名卡放逐，抽1张卡。',
  condition: (gameState, playerState) =>
    gameState.phase === 'MAIN' &&
    playerState.isTurn &&
    getValidTargets(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      getValidTargets(playerState),
      '选择单位',
      '选择你的战场上的1个单位。将这张卡放逐，之后将卡组中1张被选择单位的同名卡放逐，抽1张卡。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101150260_hand_exile_draw' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.effectId !== '101150260_hand_exile_draw') return;

    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT') return;

    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId);
    if (ownerUid !== playerState.uid) return;

    if (instance.cardlocation === 'HAND') {
      moveCard(gameState, playerState.uid, instance, 'EXILE', instance);
    }

    const sameNameCard = playerState.deck.find(card => card.fullName === target.fullName);
    if (!sameNameCard) {
      gameState.logs.push(`[${instance.fullName}] 卡组中不存在 [${target.fullName}] 的同名卡，后续效果不结算。`);
      return;
    }

    moveCard(gameState, playerState.uid, sameNameCard, 'EXILE', instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101150260
 * Card2 Row: 418
 * Card Row: 302
 * Source CardNo: PR05-02W
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 启动效果，卡名一回合一次，你的主要阶段从手牌中发动，选择我方战场上的一个单位，将这张卡放逐：从卡组将一张被选择的同名卡放逐，之后抽一张卡
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101150260',
  fullName: '雪原的幻影',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '仙雪原',
  acValue: 1,
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
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
