import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canActivateDefaultTiming, canPutUnitOntoBattlefield, createSelectCardQuery, moveCard, moveCardAsCost, ownUnits } from './BaseUtil';

const findOwnLiveKuri = (playerState: any, instance: Card) =>
  playerState.unitZone.find((unit: Card | null) => unit?.gamecardId === instance.gamecardId);

const hasTeteruOrSalala = (playerState: any) =>
  ownUnits(playerState).some(unit => unit.specialName === '特特鲁' || unit.specialName === '萨拉拉' || unit.fullName.includes('特特鲁') || unit.fullName.includes('萨拉拉'));

const godMarkGraveCards = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.godMark);

const effect_101140344_leave_revive: CardEffect = {
  id: '101140344_leave_revive',
  type: 'TRIGGER',
  triggerEvent: ['CARD_LEFT_FIELD', 'CARD_ENTERED_ZONE', 'CARD_DESTROYED_BATTLE', 'CARD_DESTROYED_EFFECT'],
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'],
  limitCount: 1,
  limitNameType: true,
  isMandatory: true,
  description: '同名1回合1次：这个单位由于战斗或卡的效果从战场离开时，放逐墓地2张神蚀卡，抽1张卡并将这张卡横置放回战场。',
  condition: (_gameState, playerState, instance, event) => {
    const leftByEvent =
      event?.targetCardId === instance.gamecardId ||
      event?.sourceCardId === instance.gamecardId ||
      event?.data?.previousSourceCardId === instance.gamecardId;
    const leftUnitZone = event?.data?.sourceZone === 'UNIT' || event?.data?.zone === 'UNIT';
    if (
      event?.type === 'CARD_LEFT_FIELD' &&
      leftByEvent &&
      leftUnitZone &&
      (event.data?.isEffect || event.data?.targetZone === 'GRAVE' || event.data?.targetZone === 'EXILE')
    ) {
      (instance as any).data = {
        ...((instance as any).data || {}),
        pendingKuriLeaveReviveTurn: _gameState.turnCount
      };
      return false;
    }
    if (event?.type === 'CARD_ENTERED_ZONE') {
      return (
        leftByEvent &&
        event.data?.sourceZone === 'UNIT' &&
        event.data?.zone !== 'UNIT' &&
        (
          (instance as any).data?.pendingKuriLeaveReviveTurn === _gameState.turnCount ||
          (event.data?.isEffect && (event.data?.zone === 'GRAVE' || event.data?.zone === 'EXILE')) ||
          event.data?.targetZone === 'GRAVE' ||
          event.data?.targetZone === 'EXILE'
        ) &&
        instance.cardlocation !== 'UNIT' &&
        canPutUnitOntoBattlefield(playerState, instance) &&
        godMarkGraveCards(playerState).filter(card => card.gamecardId !== instance.gamecardId).length >= 2
      );
    }
    return (
      leftByEvent &&
      leftUnitZone &&
      (event.type === 'CARD_DESTROYED_BATTLE' || event.type === 'CARD_DESTROYED_EFFECT' || !!event.data?.isEffect) &&
      instance.cardlocation !== 'UNIT' &&
      canPutUnitOntoBattlefield(playerState, instance) &&
      godMarkGraveCards(playerState).filter(card => card.gamecardId !== instance.gamecardId).length >= 2
    );
  },
  cost: async (gameState, playerState, instance) => {
    const candidates = godMarkGraveCards(playerState).filter(card => card.gamecardId !== instance.gamecardId);
    if (candidates.length < 2) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择放逐费用',
      '选择墓地中的2张神蚀卡放逐作为费用。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '101140344_leave_revive', step: 'COST' },
      () => 'GRAVE'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    if ((instance as any).data) {
      delete (instance as any).data.pendingKuriLeaveReviveTurn;
    }
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
    if (instance.cardlocation !== 'UNIT' && canPutUnitOntoBattlefield(playerState, instance)) {
      moveCard(gameState, playerState.uid, instance, 'UNIT', instance);
      const live = findOwnLiveKuri(playerState, instance);
      if (live) {
        live.isExhausted = true;
        live.displayState = 'FRONT_UPRIGHT';
      }
    }
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'COST') return;
    const selected = selections
      .map(id => playerState.grave.find((card: Card) => card.gamecardId === id))
      .filter((card: Card | undefined): card is Card => !!card && card.godMark && card.gamecardId !== instance.gamecardId);
    if (selected.length !== 2) {
      context.cancelActivation = true;
      return;
    }
    selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
  }
};

const effect_101140344_ten_prevent_damage: CardEffect = {
  id: '101140344_ten_prevent_damage',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [10, 10],
  description: '10+：若你的战场上有「特特鲁」或「萨拉拉」，放逐这个单位，本回合防止你将要受到的所有伤害。',
  condition: (gameState, playerState, instance) =>
    canActivateDefaultTiming(gameState, playerState) &&
    instance.cardlocation === 'UNIT' &&
    hasTeteruOrSalala(playerState),
  cost: async (gameState, playerState, instance) => {
    if (!findOwnLiveKuri(playerState, instance)) return false;
    moveCardAsCost(gameState, playerState.uid, instance, 'EXILE', instance);
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    (playerState as any).preventAllDamageTurn = gameState.turnCount;
    (playerState as any).preventAllDamageSourceName = instance.fullName;
    gameState.logs.push(`[${instance.fullName}] 本回合防止 ${playerState.displayName} 将要受到的所有伤害。`);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140344
 * Card2 Row: 474
 * Card Row: 407
 * Source CardNo: BT06-W04
 * Package: BT06(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位由于战斗或卡的效果从战场上离开时}[将你墓地中2张神蚀卡放逐]：抽1张卡，将这张卡以横置状态放置到战场上。
 * 〖10+〗【启】{你的战场上有「特特鲁」或「萨拉拉」的单位}[将这个单位放逐]：本回合中，防止你将要受到的所有伤害。
 */
const card: Card = {
  id: '101140344',
  fullName: '教会修士「克里」',
  specialName: '克里',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '女神教会',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_101140344_leave_revive, effect_101140344_ten_prevent_damage],
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
