import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield, createSelectCardQuery, markExileAtEndOfTurn, moveCard, silenceAllEffectsUntil, story } from './BaseUtil';

const hasTwoOpenUnitSlots = (playerState: any) =>
  playerState.unitZone.filter((slot: Card | null) => slot === null).length >= 2;

const isReviveCandidate = (card: Card) =>
  card.type === 'UNIT' && !card.godMark;

const canRevivePair = (playerState: any, first: Card, second: Card) => {
  if (!hasTwoOpenUnitSlots(playerState)) return false;
  if (first.gamecardId === second.gamecardId || first.id !== second.id) return false;
  if (!isReviveCandidate(first) || !isReviveCandidate(second)) return false;
  if (!!first.specialName && !!second.specialName && first.specialName === second.specialName) return false;
  return canPutUnitOntoBattlefield(playerState, first) && canPutUnitOntoBattlefield(playerState, second);
};

const uniqueCards = (cards: Card[]) =>
  cards.filter((card, index, self) => self.findIndex(entry => entry.gamecardId === card.gamecardId) === index);

const getRevivePairs = (playerState: any) => {
  if (!hasTwoOpenUnitSlots(playerState)) return [];
  const graveUnits = playerState.grave.filter(isReviveCandidate);
  const byId = new Map<string, Card[]>();
  graveUnits.forEach(card => {
    const list = byId.get(card.id) || [];
    list.push(card);
    byId.set(card.id, list);
  });

  const pairs: { first: Card; second: Card }[] = [];
  byId.forEach(cards => {
    if (cards.length < 2) return;
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = 0; j < cards.length; j += 1) {
        if (i === j) continue;
        const first = cards[i];
        const second = cards[j];
        if (!canRevivePair(playerState, first, second)) continue;
        pairs.push({ first, second });
      }
    }
  });
  return pairs;
};

const markEndExile = (instance: Card, gameState: any, playerState: any, targetId: string) => {
  const target = AtomicEffectExecutor.findCardById(gameState, targetId);
  if (target?.cardlocation === 'UNIT') {
    markExileAtEndOfTurn(gameState, playerState.uid, target, instance, `203000146_end_exile_${targetId}`);
  }
};

const revivePair = (instance: Card, gameState: any, playerState: any, first: Card, second: Card) => {
  if (!canRevivePair(playerState, first, second)) return;

  const firstId = first.gamecardId;
  const secondId = second.gamecardId;
  moveCard(gameState, playerState.uid, first, 'UNIT', instance);
  const liveFirst = AtomicEffectExecutor.findCardById(gameState, firstId);
  if (liveFirst?.cardlocation === 'UNIT') {
    silenceAllEffectsUntil(liveFirst, instance, gameState.turnCount);
    markEndExile(instance, gameState, playerState, firstId);
  }

  const liveSecondCandidate = playerState.grave.find((card: Card) => card.gamecardId === secondId);
  if (!liveSecondCandidate || !canPutUnitOntoBattlefield(playerState, liveSecondCandidate)) return;
  moveCard(gameState, playerState.uid, liveSecondCandidate, 'UNIT', instance);
  const liveSecond = AtomicEffectExecutor.findCardById(gameState, secondId);
  if (liveSecond?.cardlocation === 'UNIT') {
    silenceAllEffectsUntil(liveSecond, instance, gameState.turnCount);
    markEndExile(instance, gameState, playerState, secondId);
  }
};

const cardEffects: CardEffect[] = [story('203000146_double_revive', '只能在你的主要阶段使用。从墓地选择2张同名的非神蚀单位卡放置到战场上，它们本回合失去所有能力，回合结束时放逐。', async (instance, gameState, playerState) => {
  const pairs = getRevivePairs(playerState);
  if (pairs.length === 0) return;
  const firstOptions = uniqueCards(pairs.map(pair => pair.first));
  createSelectCardQuery(
    gameState,
    playerState.uid,
    firstOptions,
    '选择第一张单位',
    '选择墓地中的1张可组成同名组合的非神蚀单位卡。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '203000146_double_revive', step: 'FIRST' },
    () => 'GRAVE'
  );
}, {
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    getRevivePairs(playerState).length > 0,
  limitCount: 1,
  limitNameType: true,
  targetSpec: {
    targetGroups: [{
      title: '选择第一张单位',
      description: '选择墓地中的1张可组成同名组合的非神蚀单位卡。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['GRAVE'],
      controller: 'SELF',
      step: 'FIRST',
      getCandidates: (_gameState, playerState) =>
        uniqueCards(getRevivePairs(playerState).map(pair => pair.first))
          .map(card => ({ card, source: 'GRAVE' as any }))
    }, {
      title: '选择第二张单位',
      description: '选择与第一张同名的另一张非神蚀单位卡。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['GRAVE'],
      controller: 'SELF',
      step: 'SECOND',
      getCandidates: (_gameState, playerState, _instance, declaredTargets) => {
        const firstId = declaredTargets?.find(target => target.step === 'FIRST')?.gamecardId;
        if (!firstId) return [];
        return uniqueCards(getRevivePairs(playerState)
          .filter(pair => pair.first.gamecardId === firstId)
          .map(pair => pair.second))
          .map(card => ({ card, source: 'GRAVE' as any }));
      }
    }],
    title: '选择第一张单位',
    description: '选择墓地中的1张可组成同名组合的非神蚀单位卡。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    step: 'FIRST',
    getCandidates: (_gameState, playerState) => {
      const pairs = getRevivePairs(playerState);
      return pairs
        .map(pair => pair.first)
        .filter((card, index, self) => self.findIndex(entry => entry.gamecardId === card.gamecardId) === index)
        .map(card => ({ card, source: 'GRAVE' as any }));
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.declaredTargets) {
      if (context.declaredTargets.length < 2) return;
      const firstId = context.declaredTargets.find((target: any) => target.step === 'FIRST')?.gamecardId || selections[0];
      const secondId = context.declaredTargets.find((target: any) => target.step === 'SECOND')?.gamecardId || selections.find(id => id !== firstId);
      const first = firstId ? playerState.grave.find((card: Card) => card.gamecardId === firstId) : undefined;
      const second = secondId ? playerState.grave.find((card: Card) => card.gamecardId === secondId) : undefined;
      if (first && second) revivePair(instance, gameState, playerState, first, second);
      return;
    }

    if (context?.step === 'FIRST') {
      const first = selections[0] ? playerState.grave.find((card: Card) => card.gamecardId === selections[0]) : undefined;
      if (!first) return;
      const secondOptions = getRevivePairs(playerState)
        .filter(pair => pair.first.gamecardId === first.gamecardId)
        .map(pair => pair.second)
        .filter((card, index, self) => self.findIndex(entry => entry.gamecardId === card.gamecardId) === index);
      if (secondOptions.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        secondOptions,
        '选择第二张单位',
        '选择与第一张同名的另一张非神蚀单位卡。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '203000146_double_revive', step: 'SECOND', firstId: first.gamecardId, reviveId: first.id },
        () => 'GRAVE'
      );
      return;
    }
    if (context?.step === 'SECOND') {
      const first = playerState.grave.find((card: Card) => card.gamecardId === context.firstId && card.id === context.reviveId);
      const second = selections[0] ? playerState.grave.find((card: Card) => card.gamecardId === selections[0] && card.id === context.reviveId) : undefined;
      if (first && second) revivePair(instance, gameState, playerState, first, second);
    }
  }
}), {
  id: '203000146_payment_substitute',
  type: 'CONTINUOUS',
  triggerLocation: ['HAND'],
  content: 'SELF_HAND_COST',
  description: '为ACCESS+3以下白色卡支付使用费用时，可以将手牌中的这张卡放逐作为代替。'
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203000146
 * Card2 Row: 263
 * Card Row: 619
 * Source CardNo: SP01-G02
 * Package: SP01(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖同名1回合1次〗:只能在你的主要阶段使用。从你的墓地选择2张同名的非神蚀单位卡放置到战场上，那些单位的所有能力无效，你的回合结束时，将那些单位放逐。
 * 【你为ACCESS值+3以下的白色卡支付使用费用时，你可以将手牌中的这张卡放逐作为这次费用的代替。】
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '203000146',
  fullName: '花开的传说',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
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
  cardPackage: 'SP01',
  uniqueId: null as any,
};

export default card;
