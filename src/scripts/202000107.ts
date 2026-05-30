import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addTempDamage,
  allUnitsOnField,
  createSelectCardQuery,
  destroyByEffect,
  ensureData,
  moveCardAsCost,
  story
} from './BaseUtil';

const MODE_RETALIATION = 'RETALIATION';
const MODE_DAMAGE = 'DAMAGE';

const selectedModeFromContext = (context?: any) =>
  context?.declaredModeId ||
  context?.selectedModeId ||
  context?.modeId ||
  context?.declaredTargets?.[0]?.modeId ||
  context?.declaredTargets?.declaredModeId;

const discardHandCards = (playerState: any, instance?: Card) =>
  playerState.hand.filter((card: Card) => card.gamecardId !== instance?.gamecardId);

const redHandCards = (playerState: any, instance?: Card) =>
  discardHandCards(playerState, instance).filter((card: Card) => card.color === 'RED');

const discardCandidatesForMode = (playerState: any, instance: Card, mode: string) =>
  mode === MODE_DAMAGE ? redHandCards(playerState, instance) : discardHandCards(playerState, instance);

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

const modeOptions = (gameState: any, playerState: any, instance?: Card) => {
  const options = [];
  if (discardHandCards(playerState, instance).length > 0) options.push({ id: MODE_RETALIATION, label: '放逐反击' });
  if (redHandCards(playerState, instance).length > 0 && allUnitsOnField(gameState).length > 0) {
    options.push({ id: MODE_DAMAGE, label: '伤害+2' });
  }
  return options;
};

const openDiscardCostQuery = (gameState: any, playerState: any, instance: Card, mode: string) => {
  const candidates = discardCandidatesForMode(playerState, instance, mode);
  if (candidates.length === 0) return false;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    candidates,
    mode === MODE_DAMAGE ? '选择红色舍弃费用' : '选择舍弃费用',
    mode === MODE_DAMAGE
      ? '舍弃1张红色手牌，作为发动费用。'
      : '舍弃1张手牌，作为发动费用。',
    1,
    1,
    {
      sourceCardId: instance.gamecardId,
      effectId: '202000107_sacrifice',
      step: 'DISCARD_COST',
      mode,
      skipEffectResolveAfterCost: true
    },
    () => 'HAND'
  );
  return !!gameState.pendingQuery;
};

const cardEffects: CardEffect[] = [
  story('202000107_sacrifice', '选择1项：本回合己方单位被对手单位效果放逐时反击并可抽2；或舍弃红色手牌使1个单位伤害+2。', async () => {}, {
    condition: (gameState, playerState, instance) => modeOptions(gameState, playerState, instance).length > 0,
    targetSpec: {
      modeTitle: '选择效果',
      modeDescription: '选择1项效果并指定对象。',
      modeOptions: [{
        id: MODE_RETALIATION,
        label: '放逐反击',
        title: '确认放逐反击',
        description: '本回合己方单位被对手单位效果放逐时，破坏那个单位，之后可以抽2张卡。',
        minSelections: 0,
        maxSelections: 0,
        zones: [],
        step: MODE_RETALIATION,
        condition: (_gameState, playerState, instance) => discardHandCards(playerState, instance).length > 0,
        getCandidates: () => [] as any[]
      }, {
        id: MODE_DAMAGE,
        label: '伤害+2',
        title: '选择伤害强化目标',
        description: '选择战场上的1个单位，本回合中伤害+2。',
        minSelections: 1,
        maxSelections: 1,
        zones: ['UNIT'],
        controller: 'ANY',
        step: 'DAMAGE_TARGET',
        condition: (gameState, playerState, instance) =>
          redHandCards(playerState, instance).length > 0 &&
          allUnitsOnField(gameState).length > 0,
        getCandidates: gameState =>
          allUnitsOnField(gameState).map(card => ({ card, source: 'UNIT' as any }))
      }]
    },
    cost: async (gameState, playerState, instance, context?: any) => {
      const mode = selectedModeFromContext(context);
      if (!mode) return false;
      return openDiscardCostQuery(gameState, playerState, instance, mode);
    },
    onCostResolve: async (instance, gameState, playerState, selections, context) => {
      const mode = context?.mode;
      const cost = selections[0]
        ? discardCandidatesForMode(playerState, instance, mode).find((card: Card) => card.gamecardId === selections[0])
        : undefined;
      if (!cost) {
        context.cancelActivation = true;
        gameState.logs.push(`[${instance.fullName}] 舍弃费用不合法，发动中止。`);
        return;
      }
      moveCardAsCost(gameState, playerState.uid, cost, 'GRAVE', instance);
    },
    onQueryResolve: async (instance, gameState, playerState, selections, context) => {
      const mode = selectedModeFromContext(context);
      if (mode === MODE_RETALIATION) {
        const data = ensureData(instance);
        data.sacrificeRetaliationTurn = gameState.turnCount;
        data.sacrificeRetaliationOwnerUid = playerState.uid;
        return;
      }

      if (mode === MODE_DAMAGE) {
        const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
        if (!target || target.cardlocation !== 'UNIT') return;
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
      const destroyed = !!source && destroyByEffect(gameState, source, instance);
      if (destroyed && playerState.deck.length >= 2) {
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
 * ◆{选择战场上的1个单位}[舍弃1张红色手牌]:被选择的单位本回合中〖伤害+2〗。
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
