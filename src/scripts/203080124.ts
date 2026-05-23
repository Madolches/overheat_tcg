import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  awakenUnit,
  canActivateDefaultTiming,
  canPutUnitOntoBattlefield,
  createChoiceQuery,
  createSelectCardQuery,
  hasAwakenAbility,
  markReturnToDeckBottomAtEnd,
  millTop,
  putUnitOntoField,
  addTempPowerUntilEndOfTurn,
  ownUnits,
  story
} from './BaseUtil';

const awakenDeckUnits = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    card.type === 'UNIT' &&
    hasAwakenAbility(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [story('203080124_ritual_or_awaken', '同名1回合1次：将卡组顶3张送入墓地，选择放置1张具有唤醒的单位或执行唤醒。', async (instance, gameState, playerState) => {
  millTop(gameState, playerState.uid, Math.min(3, playerState.deck.length), instance);
  const options = [];
  if (awakenDeckUnits(playerState).length > 0) options.push({ value: 'PUT_AWAKEN', label: '放置具有唤醒的单位' });
  if (ownUnits(playerState).length > 0) options.push({ value: 'AWAKEN', label: '唤醒己方单位' });
  createChoiceQuery(
    gameState,
    playerState.uid,
    '选择效果',
    '选择1项效果执行。',
    options,
    { sourceCardId: instance.gamecardId, effectId: '203080124_ritual_or_awaken', step: 'MODE' }
  );
}, {
  limitCount: 1,
  limitNameType: true,
  condition: (gameState, playerState) =>
    canActivateDefaultTiming(gameState, playerState) &&
    playerState.deck.length >= 3 &&
    (awakenDeckUnits(playerState).length > 0 || ownUnits(playerState).length > 0),
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'MODE') {
      const mode = selections[0];
      if (mode === 'PUT_AWAKEN') {
        createSelectCardQuery(
          gameState,
          playerState.uid,
          awakenDeckUnits(playerState),
          '选择唤醒单位',
          '选择卡组中1张具有唤醒的单位卡放置到战场。',
          1,
          1,
          { sourceCardId: instance.gamecardId, effectId: '203080124_ritual_or_awaken', step: 'PUT_AWAKEN' },
          () => 'DECK'
        );
      } else if (mode === 'AWAKEN') {
        createSelectCardQuery(
          gameState,
          playerState.uid,
          ownUnits(playerState),
          '选择唤醒单位',
          '选择你的战场上的1个单位，本回合力量+1000，回合结束时放置到卡组底。',
          1,
          1,
          { sourceCardId: instance.gamecardId, effectId: '203080124_ritual_or_awaken', step: 'AWAKEN' },
          () => 'UNIT'
        );
      }
      return;
    }

    if (context?.step === 'PUT_AWAKEN') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || target.cardlocation !== 'DECK' || !hasAwakenAbility(target) || !canPutUnitOntoBattlefield(playerState, target)) return;
      putUnitOntoField(gameState, playerState.uid, target, instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
      return;
    }

    if (context?.step === 'AWAKEN') {
      const target = ownUnits(playerState).find(unit => unit.gamecardId === selections[0]);
      if (!target) return;
      awakenUnit(gameState, playerState.uid, target, instance);
      addTempPowerUntilEndOfTurn(target, instance, 1000, gameState);
      markReturnToDeckBottomAtEnd(target, instance, gameState, playerState.uid);
    }
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203080124
 * Card2 Row: 644
 * Card Row: 526
 * Source CardNo: BT08-G07
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖同名1回合1次〗{你的主要阶段，选择下列的1项效果执行}[将你卡组顶的3张卡送入墓地]：
 * ◆将你的卡组中的1张具有唤醒的单位卡放置到战场上。
 * ◆唤醒（〖1回合1次〗{你的主要阶段，选择你的战场上的1个单位}:本回合中，被选择的单位〖力量+1000〗。回合结束时，将其放置到你的卡组底）。
 */
const card: Card = {
  id: '203080124',
  fullName: '苏醒的降灵仪',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '神木森',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
