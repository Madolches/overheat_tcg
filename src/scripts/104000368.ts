import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canActivateDefaultTiming,
  canPutUnitOntoBattlefield,
  createChoiceQuery,
  createPlayerSelectQuery,
  createSelectCardQuery,
  damagePlayerByEffect,
  getOpponentUid,
  moveCard,
  moveCardAsCost,
  playerTargetCandidates,
  putUnitOntoField
} from './BaseUtil';

const isKuyaCard = (card: Card) =>
  card.fullName.includes('九夜') || !!card.specialName?.includes('九夜');

const isKuyaDiscardCost = (card: Card) =>
  card.color === 'RED' ||
  card.color === 'GREEN' ||
  isKuyaCard(card);

const differentColorNonGodUnitsInGrave = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.type === 'UNIT' && !card.godMark);

const hasIrodoriCost = (playerState: any, amount: number) =>
  new Set(differentColorNonGodUnitsInGrave(playerState).map((card: Card) => card.color)).size >= amount;

const payIrodoriCost = (gameState: any, playerState: any, instance: Card, selections: string[], amount: number) => {
  const selected = selections
    .map(id => playerState.grave.find((card: Card) => card.gamecardId === id))
    .filter((card: Card | undefined): card is Card => !!card && card.type === 'UNIT' && !card.godMark);
  const colors = new Set(selected.map(card => card.color));
  if (selected.length !== amount || colors.size !== amount) return false;

  selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
  return true;
};

const hasColorRequirement = (card?: Card) =>
  !!card && Object.values(card.colorReq || {}).some(value => Number(value || 0) > 0);

const findOpponentColoredNonGodStackItem = (gameState: any, playerUid: string) => {
  for (let index = (gameState.counterStack?.length || 0) - 1; index >= 0; index -= 1) {
    const item = gameState.counterStack[index];
    const card = item?.card as Card | undefined;
    if (
      item &&
      (item.type === 'PLAY' || item.type === 'EFFECT') &&
      item.ownerUid !== playerUid &&
      !item.isNegated &&
      card &&
      !card.godMark &&
      hasColorRequirement(card)
    ) {
      return item;
    }
  }
  return undefined;
};

const canCounterOpponentColoredNonGodCard = (gameState: any, playerState: any) =>
  gameState.phase === 'COUNTERING' &&
  !!findOpponentColoredNonGodStackItem(gameState, playerState.uid);

const canDamageOpponent = (gameState: any, playerState: any) =>
  playerState.isTurn &&
  (gameState.phase === 'MAIN' || (gameState.phase === 'COUNTERING' && gameState.previousPhase === 'MAIN')) &&
  !!getOpponentUid(gameState, playerState.uid);

const modeOptions = (gameState: any, playerState: any) => [
  ...(canDamageOpponent(gameState, playerState) ? [{ value: 'DAMAGE_EXILE', label: '给予对手2点伤害并放逐其墓地最多2张卡' }] : []),
  ...(canCounterOpponentColoredNonGodCard(gameState, playerState) ? [{ value: 'COUNTER', label: '反击有颜色限制的非神蚀卡' }] : []),
];

const effect_104000368_irodori_enter: CardEffect = {
  id: '104000368_irodori_enter',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '异彩3：将墓地3种颜色的非神蚀单位卡各1张放逐，将手牌中的这张卡放置到战场上。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'HAND' &&
    playerState.isTurn &&
    canPutUnitOntoBattlefield(playerState, instance) &&
    hasIrodoriCost(playerState, 3),
  cost: async (gameState, playerState, instance) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      differentColorNonGodUnitsInGrave(playerState),
      '选择异彩费用',
      '选择墓地中3种颜色的非神蚀单位卡各1张放逐。',
      3,
      3,
      { sourceCardId: instance.gamecardId, effectId: '104000368_irodori_enter', costType: 'SP03_B03_IRODORI3' },
      () => 'GRAVE'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    (instance as any).data = {
      ...((instance as any).data || {}),
      enteredByIrodoriTurn: gameState.turnCount
    };
    if (putUnitOntoField(gameState, playerState.uid, instance, instance)) {
      (instance as any).data = {
        ...((instance as any).data || {}),
        enteredByIrodoriTurn: gameState.turnCount
      };
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType !== 'SP03_B03_IRODORI3') return;
    if (!payIrodoriCost(gameState, playerState, instance, selections, 3)) {
      context.cancelActivation = true;
    }
  }
};

const effect_104000368_modes: CardEffect = {
  id: '104000368_modes',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '1回合1次：舍弃1张红色、绿色或《九夜》手牌，选择给予对手2点伤害并放逐其墓地最多2张，或在对抗中反击有颜色限制的非神蚀卡。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    playerState.hand.some(isKuyaDiscardCost) &&
    modeOptions(gameState, playerState).length > 0,
  cost: async (gameState, playerState, instance) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.hand.filter(isKuyaDiscardCost),
      '舍弃手牌',
      '舍弃1张红色、绿色或卡名含有《九夜》的手牌作为费用。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '104000368_modes',
        costType: 'DISCARD_HAND_COST',
        discardCostAmount: 1
      },
      () => 'HAND'
    );
    return true;
  },
  targetSpec: {
    modeTitle: '选择效果',
    modeDescription: '选择要执行的效果。',
    modeOptions: [{
      id: 'DAMAGE_EXILE',
      label: '给予对手2点伤害并放逐其墓地最多2张卡',
      title: '选择对手',
      description: '选择1名对手。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['PLAYER'],
      controller: 'OPPONENT',
      step: 'PLAYER',
      condition: canDamageOpponent,
      getCandidates: (gameState, playerState) =>
        playerTargetCandidates(gameState, playerState.uid, { includeSelf: false, includeOpponent: true })
    }, {
      id: 'COUNTER',
      label: '反击有颜色限制的非神蚀卡',
      title: '反击',
      description: '反击那张卡。',
      minSelections: 0,
      maxSelections: 0,
      step: 'COUNTER',
      condition: canCounterOpponentColoredNonGodCard
    }]
  },
  execute: async (instance, gameState, playerState) => {
    const options = modeOptions(gameState, playerState);
    if (options.length === 1 && options[0].value === 'COUNTER') {
      const target = findOpponentColoredNonGodStackItem(gameState, playerState.uid);
      if (target) {
        target.isNegated = true;
        gameState.logs.push(`[${instance.fullName}] 反击了 [${target.card?.fullName || '对手使用的卡'}]。`);
      }
      return;
    }
    if (options.length === 1 && options[0].value === 'DAMAGE_EXILE') {
      createPlayerSelectQuery(
        gameState,
        playerState.uid,
        '选择对手',
        '选择1名对手，给予其2点伤害。',
        { sourceCardId: instance.gamecardId, effectId: '104000368_modes', step: 'PLAYER' },
        { includeSelf: false, includeOpponent: true }
      );
      return;
    }
    createChoiceQuery(
      gameState,
      playerState.uid,
      '选择效果',
      '选择要执行的效果。',
      options,
      { sourceCardId: instance.gamecardId, effectId: '104000368_modes', step: 'MODE' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.modeId === 'COUNTER' || context?.step === 'COUNTER') {
      const target = findOpponentColoredNonGodStackItem(gameState, playerState.uid);
      if (target) {
        target.isNegated = true;
        gameState.logs.push(`[${instance.fullName}] countered [${target.card?.fullName || 'opponent card'}].`);
      }
      return;
    }

    if (context?.step === 'MODE') {
      if (selections[0] === 'COUNTER') {
        const target = findOpponentColoredNonGodStackItem(gameState, playerState.uid);
        if (target) {
          target.isNegated = true;
          gameState.logs.push(`[${instance.fullName}] 反击了 [${target.card?.fullName || '对手使用的卡'}]。`);
        }
        return;
      }
      createPlayerSelectQuery(
        gameState,
        playerState.uid,
        '选择对手',
        '选择1名对手，给予其2点伤害。',
        { sourceCardId: instance.gamecardId, effectId: '104000368_modes', step: 'PLAYER' },
        { includeSelf: false, includeOpponent: true }
      );
      return;
    }

    if (context?.step === 'PLAYER') {
      const declaredTarget = context.declaredTargets?.[0];
      const targetUid = declaredTarget?.ownerUid || (selections[0] === 'PLAYER_OPPONENT'
        ? getOpponentUid(gameState, playerState.uid)
        : selections[0]);
      if (!targetUid || !gameState.players[targetUid]) return;
      await damagePlayerByEffect(gameState, playerState.uid, targetUid, 2, instance);
      const graveTargets = gameState.players[targetUid].grave.filter((card: Card) => !!card);
      if (graveTargets.length > 0) {
        createSelectCardQuery(
          gameState,
          playerState.uid,
          graveTargets,
          '选择放逐墓地卡',
          '选择对手墓地最多2张卡放逐。',
          0,
          Math.min(2, graveTargets.length),
          { sourceCardId: instance.gamecardId, effectId: '104000368_modes', step: 'EXILE_GRAVE', targetUid },
          () => 'GRAVE'
        );
      }
      return;
    }

    if (context?.step !== 'EXILE_GRAVE') return;
    const targetUid = context.targetUid;
    if (!targetUid || !gameState.players[targetUid]) return;
    selections
      .map(id => gameState.players[targetUid].grave.find((card: Card) => card.gamecardId === id))
      .filter((card: Card | undefined): card is Card => !!card)
      .forEach(card => moveCard(gameState, targetUid, card, 'EXILE', instance));
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104000368
 * Card2 Row: 527
 * Card Row: 441
 * Source CardNo: SP03-B03
 * Package: SP03(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】：异彩3
 * 【启】〖1回合1次〗[舍弃1张红色、绿色或卡名含有《九夜》的手牌]选择下列的1项效果并执行：
 * ◆{你的主要阶段，选择1名对手}：给予他2点伤害，将其墓地最多2张卡放逐。
 * ◆{对抗对手使用有颜色限制的非神蚀卡时}：反击那张卡。
 */
const card: Card = {
  id: '104000368',
  fullName: '霜梦九夜「可可拉」',
  specialName: '可可拉',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 3 },
  faction: '无',
  acValue: 5,
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
  effects: [effect_104000368_irodori_enter, effect_104000368_modes],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
