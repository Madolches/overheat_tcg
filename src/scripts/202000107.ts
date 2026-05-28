import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addTempDamage,
  allUnitsOnField,
  createChoiceQuery,
  createSelectCardQuery,
  destroyByEffect,
  ensureData,
  moveCardAsCost,
  story
} from './BaseUtil';

const redHandCards = (playerState: any) =>
  playerState.hand.filter((card: Card) => card.color === 'RED');

const sacrificedUnitByOpponentUnitEffect = (gameState: any, playerUid: string, event: any) => {
  if (
    event?.playerUid !== playerUid ||
    event.data?.sourceZone !== 'UNIT' ||
    event.data?.targetZone !== 'EXILE' ||
    event.data?.isEffect !== true ||
    !event.data?.effectSourcePlayerUid ||
    event.data.effectSourcePlayerUid === playerUid ||
    !event.data?.effectSourceCardId
  ) {
    return undefined;
  }
  const source = AtomicEffectExecutor.findCardById(gameState, event.data.effectSourceCardId);
  return source?.cardlocation === 'UNIT' && source.type === 'UNIT' ? source : undefined;
};

const modeOptions = (gameState: any, playerState: any) => {
  const options = [];
  if (playerState.hand.length > 0) options.push({ id: 'RETALIATION', label: '放逐反击' });
  if (redHandCards(playerState).length > 0 && allUnitsOnField(gameState).length > 0) {
    options.push({ id: 'DAMAGE', label: '伤害+2' });
  }
  return options;
};

const cardEffects: CardEffect[] = [
  story('202000107_sacrifice', '选择1项：本回合己方单位被对手单位效果放逐时反击并可抽2；或舍弃红色手牌使1个单位伤害+2。', async (instance, gameState, playerState) => {
    const options = modeOptions(gameState, playerState);
    if (options.length === 0) return;
    if (options.length === 1) {
      if (options[0].id === 'RETALIATION') {
        createSelectCardQuery(
          gameState,
          playerState.uid,
          playerState.hand,
          '选择舍弃费用',
          '舍弃1张手牌，本回合你的单位被对手单位效果放逐时破坏那个单位，之后可以抽2张卡。',
          1,
          1,
          { sourceCardId: instance.gamecardId, effectId: '202000107_sacrifice', step: 'RETALIATION_COST' },
          () => 'HAND'
        );
        return;
      }
      createSelectCardQuery(
        gameState,
        playerState.uid,
        allUnitsOnField(gameState),
        '选择伤害强化目标',
        '选择战场上的1个单位，本回合中伤害+2。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '202000107_sacrifice', step: 'DAMAGE_TARGET' },
        () => 'UNIT'
      );
      return;
    }
    createChoiceQuery(
      gameState,
      playerState.uid,
      '选择效果',
      '选择1项效果执行。',
      options,
      { sourceCardId: instance.gamecardId, effectId: '202000107_sacrifice', step: 'MODE' }
    );
  }, {
    condition: (gameState, playerState) => modeOptions(gameState, playerState).length > 0,
    onQueryResolve: async (instance, gameState, playerState, selections, context) => {
      if (context?.step === 'MODE') {
        if (selections[0] === 'RETALIATION') {
          createSelectCardQuery(
            gameState,
            playerState.uid,
            playerState.hand,
            '选择舍弃费用',
            '舍弃1张手牌，本回合你的单位被对手单位效果放逐时破坏那个单位，之后可以抽2张卡。',
            1,
            1,
            { sourceCardId: instance.gamecardId, effectId: '202000107_sacrifice', step: 'RETALIATION_COST' },
            () => 'HAND'
          );
          return;
        }
        createSelectCardQuery(
          gameState,
          playerState.uid,
          allUnitsOnField(gameState),
          '选择伤害强化目标',
          '选择战场上的1个单位，本回合中伤害+2。',
          1,
          1,
          { sourceCardId: instance.gamecardId, effectId: '202000107_sacrifice', step: 'DAMAGE_TARGET' },
          () => 'UNIT'
        );
        return;
      }

      if (context?.step === 'RETALIATION_COST') {
        const cost = playerState.hand.find((card: Card) => card.gamecardId === selections[0]);
        if (!cost) return;
        moveCardAsCost(gameState, playerState.uid, cost, 'GRAVE', instance);
        const data = ensureData(instance);
        data.sacrificeRetaliationTurn = gameState.turnCount;
        data.sacrificeRetaliationOwnerUid = playerState.uid;
        return;
      }

      if (context?.step === 'DAMAGE_TARGET') {
        const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
        if (!target || target.cardlocation !== 'UNIT') return;
        createSelectCardQuery(
          gameState,
          playerState.uid,
          redHandCards(playerState),
          '选择红色舍弃费用',
          '舍弃1张红色手牌，使被选择的单位本回合中伤害+2。',
          1,
          1,
          { sourceCardId: instance.gamecardId, effectId: '202000107_sacrifice', step: 'DAMAGE_COST', targetId: target.gamecardId },
          () => 'HAND'
        );
        return;
      }

      if (context?.step === 'DAMAGE_COST') {
        const cost = redHandCards(playerState).find((card: Card) => card.gamecardId === selections[0]);
        const target = context.targetId ? AtomicEffectExecutor.findCardById(gameState, context.targetId) : undefined;
        if (!cost || !target || target.cardlocation !== 'UNIT') return;
        moveCardAsCost(gameState, playerState.uid, cost, 'GRAVE', instance);
        addTempDamage(target, instance, 2);
      }
    }
  }),
  {
    id: '202000107_retaliation_trigger',
    type: 'TRIGGER',
    triggerLocation: ['GRAVE', 'PLAY'],
    triggerEvent: 'CARD_EXILED',
    isGlobal: true,
    description: '献祭延迟效果：本回合你的单位由于对手单位效果被放逐时，破坏那个单位，之后可以抽2张卡。',
    condition: (gameState, playerState, instance, event) =>
      (instance as any).data?.sacrificeRetaliationTurn === gameState.turnCount &&
      (instance as any).data?.sacrificeRetaliationOwnerUid === playerState.uid &&
      !!sacrificedUnitByOpponentUnitEffect(gameState, playerState.uid, event),
    execute: async (instance, gameState, playerState, event) => {
      const source = sacrificedUnitByOpponentUnitEffect(gameState, playerState.uid, event);
      if (source) destroyByEffect(gameState, source, instance);
      if (playerState.deck.length >= 2) {
        await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 2 }, instance);
      }
      delete (instance as any).data.sacrificeRetaliationTurn;
      delete (instance as any).data.sacrificeRetaliationOwnerUid;
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202000107
 * Card2 Row: 563
 * Card Row: 447
 * Source CardNo: BT07-R08
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择下列的1项效果并执行:
 * ◆[舍弃1张手牌]:本回合中，你的单位由于对手的单位的效果被放逐时，将那个对手的单位破坏。之后，你可以抽2张卡。
 * ◆｛选择战场上的1个单位｝[舍弃1张红色手牌]：被选择的单位本回合中〖伤害+2〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202000107',
  fullName: '献祭',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
