import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, faceUpErosion, getOpponentUid, markDeclarationTax, moveCard, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101150157_combat_exile_draw',
  type: 'TRIGGER',
  triggerEvent: ['CARD_ATTACK_DECLARED', 'CARD_DEFENSE_DECLARED'],
  isMandatory: true,
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '宣言攻击或防御时，若背面侵蚀1张以下，选择2张正面侵蚀放逐，抽1张卡。',
  condition: (_gameState, playerState, instance, event) => {
    const isAttacker = event?.type === 'CARD_ATTACK_DECLARED' && (event.data?.attackerIds || []).includes(instance.gamecardId);
    const isDefender = event?.type === 'CARD_DEFENSE_DECLARED' && event.sourceCardId === instance.gamecardId;
    return (isAttacker || isDefender) &&
      playerState.erosionBack.filter(Boolean).length <= 1 &&
      faceUpErosion(playerState).length >= 2;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      faceUpErosion(playerState),
      '选择放逐的侵蚀卡',
      '选择你的侵蚀区中的2张正面卡，将其放逐。之后抽1张卡。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '101150157_combat_exile_draw' },
      () => 'EROSION_FRONT'
    );
  },
  targetSpec: {
    title: '选择放逐的侵蚀卡',
    description: '选择你的侵蚀区中的2张正面卡，将其放逐。之后抽1张卡。',
    minSelections: 2,
    maxSelections: 2,
    zones: ['EROSION_FRONT'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      faceUpErosion(playerState).map(card => ({ card, source: 'EROSION_FRONT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    selections.forEach(id => {
      const card = playerState.erosionFront.find(candidate => candidate?.gamecardId === id);
      if (card) moveCard(gameState, playerState.uid, card, 'EXILE', instance);
    });
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
  }
}, {
  id: '101150157_declare_tax',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [0, 3],
  description: '0~3：对手宣言攻击或防御自己的单位时需要支付1费。',
  applyContinuous: (gameState, instance) => {
    if (instance.cardlocation !== 'UNIT') return;
    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId);
    if (!ownerUid) return;
    const opponent = gameState.players[getOpponentUid(gameState, ownerUid)];
    ownUnits(opponent).forEach(unit => markDeclarationTax(unit, instance, 1));
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101150157
 * Card2 Row: 147
 * Card Row: 147
 * Source CardNo: BT02-W07
 * Package: BT02(SR,ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗:这个单位宣言攻击或防御时，若你的侵蚀区中的背面卡在1张或者以下，选择你的侵蚀区的2张正面卡，将其放逐。之后，抽1张卡。
 * 〖0~3〗【永】:对手需要支付〖1费〗才能选择他自己的单位宣言攻击或防御。（若不支付，则不能进行这次宣言。）
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101150157',
  fullName: '苏醒的白龙「圣·斯诺」',
  specialName: '圣·斯诺',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '仙雪原',
  acValue: 4,
  power: 3500,
  basePower: 3500,
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
