import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, exileByEffect, getOpponentUid, isFeijingCard, moveCardAsCost, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105110225_enter_exile_god',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  description: '进入战场时，可以选择对手1个神蚀单位，舍弃2张菲晶手牌，将其放逐。',
  condition: (gameState, playerState, instance, event?: GameEvent) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    playerState.hand.filter(isFeijingCard).length >= 2 &&
    ownUnits(gameState.players[getOpponentUid(gameState, playerState.uid)]).some(unit => unit.godMark),
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(opponent).filter(unit => unit.godMark),
      '选择神蚀单位',
      '选择对手场上1个神蚀单位。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110225_enter_exile_god', step: 'TARGET' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const targetId = selections[0];
      if (!targetId) return;
      const feijingHands = playerState.hand.filter(isFeijingCard);
      if (feijingHands.length < 2) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        feijingHands,
        '支付舍弃费用',
        '选择手牌中的2张具有【菲晶】的卡舍弃作为费用。',
        2,
        2,
        { sourceCardId: instance.gamecardId, effectId: '105110225_enter_exile_god', step: 'DISCARD', targetId },
        () => 'HAND'
      );
      return;
    }
    if (context?.step !== 'DISCARD') return;
    selections.forEach(id => {
      const hand = playerState.hand.find(card => card.gamecardId === id);
      if (hand) moveCardAsCost(gameState, playerState.uid, hand, 'GRAVE', instance);
    });
    const target = AtomicEffectExecutor.findCardById(gameState, context.targetId);
    if (target?.cardlocation === 'UNIT') exileByEffect(gameState, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110225
 * Card2 Row: 389
 * Card Row: 259
 * Source CardNo: BT05-Y03
 * Package: BT05(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位进入战场时，你可以选择对手场上1个神蚀单位}[舍弃手牌中的2张具有【菲晶】的卡]:将被选择的单位放逐。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110225',
  fullName: '灭杀的晶钢兵',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '学院要塞',
  acValue: 3,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
