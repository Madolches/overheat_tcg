import { Card, CardEffect } from '../types/game';
import { awakenEffect, canPutUnitOntoBattlefield, createSelectCardQuery, moveCardAsCost, putUnitOntoField, selectFromEntries } from './BaseUtil';

const graveNonGodUnits = (playerState: any) =>
  playerState.grave.filter((card: Card) =>
    card.type === 'UNIT' &&
    !card.godMark &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [
  awakenEffect('103080315_awaken'),
  {
    id: '103080315_unit_to_deck_put_grave_unit',
    type: 'TRIGGER',
    triggerLocation: ['UNIT'],
    triggerEvent: 'CARD_LEFT_FIELD',
    isGlobal: true,
    sourceSnapshotOnLeftField: true,
    limitCount: 1,
    erosionBackLimit: [1, 10],
    description: '1回合1次：你的单位由于卡的效果从战场放置到卡组时，选择墓地1张非神蚀单位卡，舍弃1张手牌，将其放置到战场。',
    condition: (_gameState, playerState, _instance, event) =>
      event?.playerUid === playerState.uid &&
      event.data?.sourceZone === 'UNIT' &&
      event.data?.targetZone === 'DECK' &&
      event.data?.isEffect === true &&
      playerState.hand.length > 0 &&
      graveNonGodUnits(playerState).length > 0,
    execute: async (instance, gameState, playerState) => {
      selectFromEntries(
        gameState,
        playerState.uid,
        graveNonGodUnits(playerState).map((card: Card) => ({ card, source: 'GRAVE' as const })),
        '选择墓地单位',
        '选择墓地中1张非神蚀单位卡放置到战场。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '103080315_unit_to_deck_put_grave_unit', step: 'TARGET' }
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections, context) => {
      if (context?.step === 'TARGET') {
        const target = graveNonGodUnits(playerState).find((card: Card) => card.gamecardId === selections[0]);
        if (!target || playerState.hand.length === 0) return;
        createSelectCardQuery(
          gameState,
          playerState.uid,
          playerState.hand,
          '支付舍弃费用',
          `选择1张手牌舍弃以发动 [${instance.fullName}]。`,
          1,
          1,
          { sourceCardId: instance.gamecardId, effectId: '103080315_unit_to_deck_put_grave_unit', step: 'DISCARD', targetId: target.gamecardId },
          () => 'HAND'
        );
        return;
      }

      if (context?.step !== 'DISCARD') return;
      const discard = playerState.hand.find((card: Card) => card.gamecardId === selections[0]);
      const target = graveNonGodUnits(playerState).find((card: Card) => card.gamecardId === context.targetId);
      if (discard && target) {
        moveCardAsCost(gameState, playerState.uid, discard, 'GRAVE', instance);
        putUnitOntoField(gameState, playerState.uid, target, instance);
      }
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103080315
 * Card2 Row: 549
 * Card Row: 369
 * Source CardNo: BT07-G05
 * Package: BT07(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】唤醒（〖1回合1次〗{你的主要阶段，选择你的战场上的1个单位}:本回合中，被选择的单位〖力量+1000〗。回合结束时，将其放置到你的卡组底）。
 * 【诱】〖1回合1次〗{你的单位由于卡的效果从战场上放置到卡组时，选择你墓地中的1张非神蚀单位卡}[舍弃1张手牌]:将被选择的单位卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103080315',
  fullName: '兽神之白玉「雪兔」',
  specialName: '雪兔',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '神木森',
  acValue: 3,
  power: 2000,
  basePower: 2000,
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
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
