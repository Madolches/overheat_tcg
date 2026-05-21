import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addInfluence, appendEndResolution, canActivateDefaultTiming, canPutUnitOntoBattlefield, cardsInZones, createSelectCardQuery, ensureData, getOpponentUid, moveCard, ownUnits } from './BaseUtil';

const paySimeteExileCost: CardEffect['cost'] = async (gameState, playerState, instance) => {
  const costs = cardsInZones(playerState, ['HAND', 'DECK', 'GRAVE']).filter(({ card }) => card.godMark && card.specialName === '丝梅特');
  if (costs.length < 2) return false;
  gameState.pendingQuery = {
    id: Math.random().toString(36).substring(7),
    type: 'SELECT_CARD',
    playerUid: playerState.uid,
    options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, costs),
    title: '选择放逐费用',
    description: '选择合计2张「丝梅特」神蚀卡放逐作为费用。',
    minSelections: 2,
    maxSelections: 2,
    callbackKey: 'EFFECT_RESOLVE',
    context: {
      sourceCardId: instance.gamecardId,
      costType: 'SIMETE_EXILE_COST',
      simeteCostAmount: 2
    }
  };
  return true;
};

const cardEffects: CardEffect[] = [{
  id: '101140437_god_limit',
  type: 'CONTINUOUS',
  description: '你的战场上只能有1个神蚀单位。',
  limitGodmarkCount: 1
}, {
  id: '101140437_end_search',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END' as any,
  isMandatory: false,
  triggerLocation: ['UNIT'],
  description: '你的回合结束时，若你的战场上仅有白色单位，可以将卡组中1张ACCESS+2的白色故事卡加入手牌。',
  condition: (_gameState, playerState) => {
    if (!playerState.isTurn) return false;
    const units = ownUnits(playerState);
    return units.length > 0 &&
      units.every(unit => unit.color === 'WHITE') &&
      playerState.deck.some(card => card.type === 'STORY' && card.color === 'WHITE' && (card.acValue || 0) === 2);
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, playerState.deck.filter(card => card.type === 'STORY' && card.color === 'WHITE' && (card.acValue || 0) === 2), '选择白色故事卡', '选择卡组中1张ACCESS+2的白色故事卡加入手牌。', 0, 1, {
      sourceCardId: instance.gamecardId,
      effectId: '101140437_end_search'
    }, () => 'DECK');
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (selected?.cardlocation !== 'DECK') return;
    moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}, {
  id: '101140437_exile_return',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：从手牌、卡组、墓地放逐合计2张「丝梅特」神蚀卡，选择对手1个单位放逐，回合结束时回到持有者战场。',
  cost: paySimeteExileCost,
  condition: (gameState, playerState) => {
    if (!canActivateDefaultTiming(gameState, playerState)) return false;
    const costCount = cardsInZones(playerState, ['HAND', 'DECK', 'GRAVE']).filter(({ card }) => card.godMark && card.specialName === '丝梅特').length;
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    return costCount >= 2 && opponent.unitZone.some(unit => !!unit);
  },
  execute: async (instance, gameState, playerState) => {
    const costs = cardsInZones(playerState, ['HAND', 'DECK', 'GRAVE']).filter(({ card }) => card.godMark && card.specialName === '丝梅特');
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, costs),
      title: '选择放逐费用',
      description: '选择合计2张「丝梅特」神蚀卡放逐作为费用。',
      minSelections: 2,
      maxSelections: 2,
      callbackKey: 'EFFECT_RESOLVE',
      context: { sourceCardId: instance.gamecardId, effectId: '101140437_exile_return', step: 'COST' }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.declaredTargets?.length) {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      const ownerUid = target ? AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) : undefined;
      if (!target || !ownerUid) return;
      const exiledId = target.gamecardId;
      moveCard(gameState, ownerUid, target, 'EXILE', instance, { faceDown: false });
      const exiled = AtomicEffectExecutor.findCardById(gameState, exiledId);
      if (exiled) {
        const data = ensureData(exiled);
        data.returnToOwnerFieldAtTurnEndSourceName = instance.fullName;
        addInfluence(exiled, instance, '回合结束时回到持有者战场');
      }
      appendEndResolution(gameState, playerState.uid, instance, '101140437_return', async (_source, state) => {
        const exiled = AtomicEffectExecutor.findCardById(state, exiledId);
        if (!exiled || exiled.cardlocation !== 'EXILE') return;
        const data = ensureData(exiled);
        delete data.returnToOwnerFieldAtTurnEndSourceName;
        if (!canPutUnitOntoBattlefield(state.players[ownerUid], exiled)) return;
        moveCard(state, ownerUid, exiled, 'UNIT', instance);
        const returned = AtomicEffectExecutor.findCardById(state, exiledId);
        if (returned) {
          returned.isExhausted = false;
          returned.displayState = 'FRONT_UPRIGHT';
        }
      });
      return;
    }
    if (context?.step === 'COST') {
      selections.forEach(id => {
        const cost = AtomicEffectExecutor.findCardById(gameState, id);
        const ownerUid = cost ? AtomicEffectExecutor.findCardOwnerKey(gameState, cost.gamecardId) : undefined;
        if (cost && ownerUid) moveCard(gameState, ownerUid, cost, 'EXILE', instance, { faceDown: false });
      });
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      createSelectCardQuery(gameState, playerState.uid, opponent.unitZone.filter((unit): unit is Card => !!unit), '选择放逐单位', '选择对手的1个单位放逐，回合结束时回到持有者战场。', 1, 1, {
        sourceCardId: instance.gamecardId,
        effectId: '101140437_exile_return',
        step: 'TARGET'
      });
      return;
    }
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    const ownerUid = target ? AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) : undefined;
    if (!target || !ownerUid) return;
    const exiledId = target.gamecardId;
    moveCard(gameState, ownerUid, target, 'EXILE', instance, { faceDown: false });
    const exiled = AtomicEffectExecutor.findCardById(gameState, exiledId);
    if (exiled) {
      const data = ensureData(exiled);
      data.returnToOwnerFieldAtTurnEndSourceName = instance.fullName;
      addInfluence(exiled, instance, '回合结束时回到持有者战场');
    }
    appendEndResolution(gameState, playerState.uid, instance, '101140437_return', async (_source, state) => {
      const exiled = AtomicEffectExecutor.findCardById(state, exiledId);
      if (!exiled || exiled.cardlocation !== 'EXILE') return;
      const data = ensureData(exiled);
      delete data.returnToOwnerFieldAtTurnEndSourceName;
      if (!canPutUnitOntoBattlefield(state.players[ownerUid], exiled)) return;
      moveCard(state, ownerUid, exiled, 'UNIT', instance);
      const returned = AtomicEffectExecutor.findCardById(state, exiledId);
      if (returned) {
        returned.isExhausted = false;
        returned.displayState = 'FRONT_UPRIGHT';
      }
    });
  },
  targetSpec: {
    title: '选择放逐单位',
    description: '选择对手的1个单位放逐，回合结束时回到持有者战场。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    step: 'TARGET',
    getCandidates: (gameState, playerState) => {
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      return opponent.unitZone
        .filter((unit): unit is Card => !!unit)
        .map(card => ({ card, source: 'UNIT' as any }));
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140437
 * Card2 Row: 314
 * Card Row: 553
 * Source CardNo: BT04-W03
 * Package: BT04(ESR,OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：你的战场上只能有一个神蚀单位。
 * 【诱】：你的回合结束时，若你的战场上仅有白色单位，你可以将你卡组中一张ACCESS值+2的白色故事卡加入手牌。
 * 【启】〖同名1回合1次〗：[从你的手牌，卡组，墓地放逐合计两张「丝梅特」的神蚀卡]选择对手的一个单位，将其放逐，回合结束时，将那张卡放置到持有者的战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101140437',
  fullName: '神罚天使「丝梅特」',
  specialName: '丝梅特',
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
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
