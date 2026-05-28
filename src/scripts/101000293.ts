import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canActivateDefaultTiming,
  canPutUnitOntoBattlefield,
  createChoiceQuery,
  createSelectCardQuery,
  destroyByEffect,
  ensureData,
  moveCardAsCost,
  ownUnits,
  ownerUidOf,
  putUnitOntoField
} from './BaseUtil';

const isSeisoUnit = (card: Card) =>
  card.type === 'UNIT' && (card.fullName.includes('清霜') || !!card.specialName?.includes('清霜'));

const isYellowOrGreenOrSeisoNonGodUnit = (card: Card) =>
  card.type === 'UNIT' &&
  !card.godMark &&
  (
    AtomicEffectExecutor.matchesColor(card, 'YELLOW') ||
    AtomicEffectExecutor.matchesColor(card, 'GREEN') ||
    isSeisoUnit(card)
  );

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

const opponentAccessThreeOrLessNonGodCards = (gameState: any, playerUid: string) =>
  Object.values(gameState.players).flatMap((player: any) => [
    ...player.unitZone.filter((card: Card | null): card is Card => !!card),
    ...player.itemZone.filter((card: Card | null): card is Card => !!card)
  ]).filter((card: Card) =>
    ownerUidOf(gameState, card) !== playerUid &&
    !card.godMark &&
    Number(card.acValue || 0) <= 3
  );

const effect_101000293_irodori_enter: CardEffect = {
  id: '101000293_irodori_enter',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  limitCount: 1,
  limitNameType: true,
  description: '异彩3：将墓地3种颜色的非神蚀单位各1张放逐，将手牌中的这张卡放置到战场上。',
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
      { sourceCardId: instance.gamecardId, effectId: '101000293_irodori_enter', costType: 'SP03_W03_IRODORI3' },
      () => 'GRAVE'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    ensureData(instance).enteredByIrodoriTurn = gameState.turnCount;
    if (putUnitOntoField(gameState, playerState.uid, instance, instance)) {
      ensureData(instance).enteredByIrodoriTurn = gameState.turnCount;
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType !== 'SP03_W03_IRODORI3') return;
    if (!payIrodoriCost(gameState, playerState, instance, selections, 3)) {
      context.cancelActivation = true;
    }
  }
};

const effect_101000293_seiso_modes: CardEffect = {
  id: '101000293_seiso_modes',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '1回合1次：选择自己战场1个黄/绿/清霜非神蚀单位，破坏双方目标，或赋予其被破坏时从卡组横置放置清霜单位。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    canActivateDefaultTiming(gameState, playerState) &&
    ownUnits(playerState).some(isYellowOrGreenOrSeisoNonGodUnit),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(isYellowOrGreenOrSeisoNonGodUnit),
      '选择己方单位',
      '选择自己战场上的1个黄色、绿色或卡名含有《清霜》的非神蚀单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101000293_seiso_modes', step: 'OWN_TARGET' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    targetGroups: [{
      title: '选择己方单位',
      description: '选择自己战场上的1个黄色、绿色或卡名含有《清霜》的非神蚀单位。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT'],
      controller: 'SELF',
      step: 'OWN_TARGET',
      getCandidates: (_gameState, playerState) =>
        ownUnits(playerState)
          .filter(isYellowOrGreenOrSeisoNonGodUnit)
          .map(card => ({ card, source: 'UNIT' as const }))
    }, {
      title: '选择对手卡牌',
      description: '若要执行破坏效果，选择对手场上的1张ACCESS 3以下非神蚀卡；若要执行招募设置，可不选择。',
      minSelections: 0,
      maxSelections: 1,
      zones: ['UNIT', 'ITEM'],
      controller: 'OPPONENT',
      step: 'OPP_TARGET',
      getCandidates: (gameState, playerState) =>
        opponentAccessThreeOrLessNonGodCards(gameState, playerState.uid)
          .map(card => ({ card, source: card.cardlocation as any }))
    }]
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.declaredTargets?.length) {
      const ownTargetId = context.declaredTargets.find((target: any) => target.step === 'OWN_TARGET')?.gamecardId;
      const ownTarget = ownTargetId ? AtomicEffectExecutor.findCardById(gameState, ownTargetId) : undefined;
      if (
        !ownTarget ||
        ownTarget.cardlocation !== 'UNIT' ||
        ownerUidOf(gameState, ownTarget) !== playerState.uid ||
        !isYellowOrGreenOrSeisoNonGodUnit(ownTarget)
      ) {
        return;
      }

      const oppTargetId = context.declaredTargets.find((target: any) => target.step === 'OPP_TARGET')?.gamecardId;
      if (oppTargetId) {
        const oppTarget = oppTargetId ? AtomicEffectExecutor.findCardById(gameState, oppTargetId) : undefined;
        if (ownTarget.cardlocation === 'UNIT') destroyByEffect(gameState, ownTarget, instance);
        if (
          oppTarget &&
          ['UNIT', 'ITEM'].includes(oppTarget.cardlocation || '') &&
          ownerUidOf(gameState, oppTarget) !== playerState.uid &&
          !oppTarget.godMark &&
          Number(oppTarget.acValue || 0) <= 3
        ) {
          destroyByEffect(gameState, oppTarget, instance);
        }
        return;
      }

      const data = ensureData(ownTarget);
      data.seisoRecruitOnDestroyedTurn = gameState.turnCount;
      data.seisoRecruitSourceCardId = instance.gamecardId;
      data.seisoRecruitOwnerUid = playerState.uid;
      data.seisoRecruitSourceName = instance.fullName;
      (playerState as any).seisoRecruitMarks = [
        ...(((playerState as any).seisoRecruitMarks || []).filter((mark: any) =>
          !(mark.targetId === ownTarget.gamecardId && mark.sourceCardId === instance.gamecardId)
        )),
        {
          targetId: ownTarget.gamecardId,
          sourceCardId: instance.gamecardId,
          turn: gameState.turnCount
        }
      ];
      return;
    }

    if (context?.step === 'OWN_TARGET') {
      const ownTarget = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (
        !ownTarget ||
        ownTarget.cardlocation !== 'UNIT' ||
        ownerUidOf(gameState, ownTarget) !== playerState.uid ||
        !isYellowOrGreenOrSeisoNonGodUnit(ownTarget)
      ) {
        return;
      }

      const options = [{ value: 'SETUP_RECRUIT', label: '被破坏时横置放置清霜单位' }];
      if (gameState.phase === 'MAIN' && opponentAccessThreeOrLessNonGodCards(gameState, playerState.uid).length > 0) {
        options.unshift({ value: 'DESTROY_PAIR', label: '支付创痕1并破坏双方目标' });
      }
      createChoiceQuery(
        gameState,
        playerState.uid,
        '选择牡丹雪效果',
        '选择要执行的效果。',
        options,
        {
          sourceCardId: instance.gamecardId,
          effectId: '101000293_seiso_modes',
          step: 'MODE',
          ownTargetId: ownTarget.gamecardId
        }
      );
      return;
    }

    if (context?.step === 'MODE') {
      const ownTarget = context.ownTargetId ? AtomicEffectExecutor.findCardById(gameState, context.ownTargetId) : undefined;
      if (!ownTarget || ownTarget.cardlocation !== 'UNIT') return;

      if (selections[0] === 'DESTROY_PAIR') {
        createSelectCardQuery(
          gameState,
          playerState.uid,
          opponentAccessThreeOrLessNonGodCards(gameState, playerState.uid),
          '选择对手卡牌',
          '选择对手场上的1张ACCESS 3以下非神蚀卡。结算时将选择的己方单位和对手卡牌破坏。',
          1,
          1,
          {
            sourceCardId: instance.gamecardId,
            effectId: '101000293_seiso_modes',
            step: 'OPP_TARGET',
            ownTargetId: ownTarget.gamecardId
          },
          card => card.cardlocation as any
        );
        return;
      }

      const data = ensureData(ownTarget);
      data.seisoRecruitOnDestroyedTurn = gameState.turnCount;
      data.seisoRecruitSourceCardId = instance.gamecardId;
      data.seisoRecruitOwnerUid = playerState.uid;
      data.seisoRecruitSourceName = instance.fullName;
      (playerState as any).seisoRecruitMarks = [
        ...(((playerState as any).seisoRecruitMarks || []).filter((mark: any) =>
          !(mark.targetId === ownTarget.gamecardId && mark.sourceCardId === instance.gamecardId)
        )),
        {
          targetId: ownTarget.gamecardId,
          sourceCardId: instance.gamecardId,
          turn: gameState.turnCount
        }
      ];
      return;
    }

    if (context?.step !== 'OPP_TARGET') return;
    const ownTarget = context.ownTargetId ? AtomicEffectExecutor.findCardById(gameState, context.ownTargetId) : undefined;
    const oppTarget = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (ownTarget?.cardlocation === 'UNIT' && ownerUidOf(gameState, ownTarget) === playerState.uid) {
      destroyByEffect(gameState, ownTarget, instance);
    }
    if (
      oppTarget &&
      ['UNIT', 'ITEM'].includes(oppTarget.cardlocation || '') &&
      ownerUidOf(gameState, oppTarget) !== playerState.uid &&
      !oppTarget.godMark &&
      Number(oppTarget.acValue || 0) <= 3
    ) {
      destroyByEffect(gameState, oppTarget, instance);
    }
  }
};

const effect_101000293_marked_recruit: CardEffect = {
  id: '101000293_marked_recruit',
  type: 'TRIGGER',
  triggerEvent: ['CARD_DESTROYED_EFFECT', 'CARD_DESTROYED_BATTLE'],
  triggerLocation: ['UNIT'],
  isGlobal: true,
  isMandatory: false,
  description: '本回合被牡丹雪选择的己方单位被破坏时，从卡组将1张《清霜》单位横置放置到战场。',
  condition: (gameState, playerState, instance, event) => {
    const destroyed = event?.targetCardId ? AtomicEffectExecutor.findCardById(gameState, event.targetCardId) : undefined;
    const data = (event?.sourceCard as any)?.data || (destroyed as any)?.data || {};
    const mark = ((playerState as any).seisoRecruitMarks || []).find((entry: any) =>
      entry.targetId === event?.targetCardId &&
      entry.sourceCardId === instance.gamecardId &&
      entry.turn === gameState.turnCount
    );
    const targetZone = event?.type === 'CARD_DESTROYED_BATTLE'
      ? 'GRAVE'
      : (event?.data?.targetZone || destroyed?.cardlocation);
    return instance.cardlocation === 'UNIT' &&
      (
        !!mark ||
        (
          data.seisoRecruitSourceCardId === instance.gamecardId &&
          data.seisoRecruitOwnerUid === playerState.uid &&
          data.seisoRecruitOnDestroyedTurn === gameState.turnCount
        )
      ) &&
      targetZone === 'GRAVE' &&
      playerState.unitZone.filter(Boolean).length < 6 &&
      playerState.deck.some((card: Card) => isSeisoUnit(card));
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.deck.filter((card: Card) => isSeisoUnit(card));
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择放置的清霜单位',
      '选择卡组中的1张卡名含有《清霜》的单位卡，以横置状态放置到战场上。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101000293_marked_recruit' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? playerState.deck.find((card: Card) => card.gamecardId === selections[0]) : undefined;
    if (target && isSeisoUnit(target)) {
      putUnitOntoField(gameState, playerState.uid, target, instance, { exhausted: true });
    }
    (playerState as any).seisoRecruitMarks = ((playerState as any).seisoRecruitMarks || []).filter((mark: any) =>
      !(mark.sourceCardId === instance.gamecardId && mark.turn === gameState.turnCount)
    );
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000293
 * Card2 Row: 519
 * Card Row: 341
 * Source CardNo: SP03-W03
 * Package: SP03(SR,XSR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】异彩3。
 * 【启】〖1回合1次〗{选择你战场上的1个黄色、绿色或卡名含有《清霜》的非神蚀单位，选择下列的1项效果并执行}：
 * ◆{你的主要阶段，选择对手场上的1张ACCESS值+3以下的非神蚀卡}[+1]：将被选择的你和对手的卡破坏。
 * ◆本回合中，被选择的你的单位被破坏时，将你的卡组中的1张卡名含有《清霜》的单位卡以横置状态放置到战场上。
 */
const card: Card = {
  id: '101000293',
  fullName: '天舞清霜「牡丹雪」',
  specialName: '牡丹雪',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 3 },
  faction: '无',
  acValue: 5,
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
  effects: [effect_101000293_irodori_enter, effect_101000293_seiso_modes, effect_101000293_marked_recruit],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
