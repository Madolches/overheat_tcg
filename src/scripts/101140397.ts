import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createChoiceQuery, createSelectCardQuery, getOpponentUid, moveCard, moveCardAsCost } from './BaseUtil';

const isShingiCard = (card?: Card) =>
  !!card && card.fullName.includes('神仪');

const enteredByShingiEffect = (gameState: any, instance: Card) => {
  const data = (instance as any).data || {};
  if (data.placedByShingiEffectSourceCardId || data.placedByShingiEffectSourceName) return true;
  const source = data.lastMoveEffectSourceCardId
    ? AtomicEffectExecutor.findCardById(gameState, data.lastMoveEffectSourceCardId)
    : undefined;
  return data.lastMovedByEffectTurn === gameState.turnCount && isShingiCard(source);
};

const opponentFieldCards = (gameState: any, playerUid: string) => {
  const opponent = gameState.players[getOpponentUid(gameState, playerUid)];
  return [
    ...opponent.unitZone.filter((card: Card | null): card is Card => !!card),
    ...opponent.itemZone.filter((card: Card | null): card is Card => !!card)
  ];
};

const opponentGodTargets = (gameState: any, playerUid: string) =>
  opponentFieldCards(gameState, playerUid).filter(card => card.godMark);

const opponentNonGodTargets = (gameState: any, playerUid: string) =>
  opponentFieldCards(gameState, playerUid).filter(card => !card.godMark);

const cardEffects: CardEffect[] = [{
  id: '101140397_shingi_sacrifice_modes',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionBackLimit: [2, 99],
  description: '创痕2：你的主要阶段，将由于卡名含有《神仪》的卡的效果进入战场的这个单位送入墓地，抽1张卡。之后选择放逐1张对手神蚀卡或最多2张对手非神蚀卡。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    enteredByShingiEffect(gameState, instance) &&
    playerState.deck.length > 0 &&
    (
      opponentGodTargets(gameState, playerState.uid).length > 0 ||
      opponentNonGodTargets(gameState, playerState.uid).length > 0
    ),
  cost: async (gameState, playerState, instance) => {
    if (instance.cardlocation !== 'UNIT' || !enteredByShingiEffect(gameState, instance)) return false;
    moveCardAsCost(gameState, playerState.uid, instance, 'GRAVE', instance);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
    const options = [];
    if (opponentGodTargets(gameState, playerState.uid).length > 0) {
      options.push({ value: 'GOD', label: '放逐1张神蚀卡' });
    }
    if (opponentNonGodTargets(gameState, playerState.uid).length > 0) {
      options.push({ value: 'NON_GOD', label: '放逐最多2张非神蚀卡' });
    }
    if (options.length === 0) return;
    createChoiceQuery(
      gameState,
      playerState.uid,
      '选择效果',
      '选择1项效果执行。',
      options,
      { sourceCardId: instance.gamecardId, effectId: '101140397_shingi_sacrifice_modes', step: 'MODE' }
    );
  },
  targetSpec: {
    modeTitle: '选择效果',
    modeDescription: '选择1项效果并指定对象。',
    modeOptions: [{
      id: 'GOD',
      label: '放逐1张神蚀卡',
      title: '选择神蚀卡',
      description: '选择对手战场上的1张神蚀卡放逐。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT', 'ITEM'],
      controller: 'OPPONENT',
      step: 'GOD',
      condition: (gameState, playerState) => opponentGodTargets(gameState, playerState.uid).length > 0,
      getCandidates: (gameState, playerState) =>
        opponentGodTargets(gameState, playerState.uid).map(card => ({ card, source: card.cardlocation as any }))
    }, {
      id: 'NON_GOD',
      label: '放逐最多2张非神蚀卡',
      title: '选择非神蚀卡',
      description: '选择对手战场上的最多2张非神蚀卡放逐。',
      minSelections: 0,
      maxSelections: 2,
      zones: ['UNIT', 'ITEM'],
      controller: 'OPPONENT',
      step: 'NON_GOD',
      condition: (gameState, playerState) => opponentNonGodTargets(gameState, playerState.uid).length > 0,
      getCandidates: (gameState, playerState) =>
        opponentNonGodTargets(gameState, playerState.uid).map(card => ({ card, source: card.cardlocation as any }))
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.selectedModeId || context?.modeId || context?.declaredTargets?.length) {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
    }

    if (context?.step === 'MODE') {
      const mode = selections[0];
      if (mode === 'GOD') {
        createSelectCardQuery(
          gameState,
          playerState.uid,
          opponentGodTargets(gameState, playerState.uid),
          '选择神蚀卡',
          '选择对手战场上的1张神蚀卡放逐。',
          1,
          1,
          { sourceCardId: instance.gamecardId, effectId: '101140397_shingi_sacrifice_modes', step: 'GOD' },
          card => card.cardlocation as any
        );
      } else if (mode === 'NON_GOD') {
        createSelectCardQuery(
          gameState,
          playerState.uid,
          opponentNonGodTargets(gameState, playerState.uid),
          '选择非神蚀卡',
          '选择对手战场上的最多2张非神蚀卡放逐。',
          0,
          2,
          { sourceCardId: instance.gamecardId, effectId: '101140397_shingi_sacrifice_modes', step: 'NON_GOD' },
          card => card.cardlocation as any
        );
      }
      return;
    }

    const targets = selections
      .map(id => AtomicEffectExecutor.findCardById(gameState, id))
      .filter((card: Card | undefined): card is Card => !!card);
    targets.forEach(target => {
      if (context?.step === 'GOD' && !target.godMark) return;
      if (context?.step === 'NON_GOD' && target.godMark) return;
      const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId);
      if (ownerUid && ['UNIT', 'ITEM'].includes(target.cardlocation || '')) {
        moveCard(gameState, ownerUid, target, 'EXILE', instance);
      }
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140397
 * Card2 Row: 607
 * Card Row: 491
 * Source CardNo: BT08-W03
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕2】【启】{你的主要阶段}[将由于卡名含有《神仪》的卡的效果进入战场的这个单位送入墓地]:抽1张卡。选择下列的1项效果并执行:
 * ◆{选择对手战场上的1张神蚀卡}:将被选择的卡放逐。
 * ◆{选择对手战场上的最多2张非神蚀卡}:将被选择的卡放逐。
 */
const card: Card = {
  id: '101140397',
  fullName: '火焰连击「克里」',
  specialName: '克里',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '女神教会',
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
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
