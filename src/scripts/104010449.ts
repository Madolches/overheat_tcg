import { Card, GameState, PlayerState, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { cardsInZones, createSelectCardQuery, moveCardAsCost } from './BaseUtil';

const fukaGodmarkCards = (playerState: PlayerState, instance: Card) =>
  cardsInZones(playerState, ['HAND', 'DECK', 'GRAVE']).filter(({ card }) =>
    card.godMark &&
    card.gamecardId !== instance.gamecardId &&
    !!instance.specialName &&
    (card.specialName === instance.specialName || card.fullName.includes(instance.specialName))
  );

const horizontalFieldCards = (gameState: GameState, instance: Card) =>
  Object.values(gameState.players).flatMap(player => [
    ...player.unitZone
      .filter((card): card is Card => !!card && !!card.isExhausted && card.gamecardId !== instance.gamecardId)
      .map(card => ({ card, source: 'UNIT' as TriggerLocation })),
    ...player.itemZone
      .filter((card): card is Card => !!card && !!card.isExhausted)
      .map(card => ({ card, source: 'ITEM' as TriggerLocation }))
  ]);

const effect_104010449_continuous: CardEffect = {
  id: 'fuka_restriction',
  type: 'CONTINUOUS',
  description: '【持续】你的单位区只能存在一个神蚀单位。',
  limitGodmarkCount: 1
};

const effect_104010449_trigger: CardEffect = {
  id: 'fuka_end_turn_bounce',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END',
  isMandatory: true,
  description: '【诱】在你的回合结束时，如果你的战场上只有蓝色单位，你可以选择发动：选择对手战场上一个AC<=2且非神迹的卡牌返回持有者手牌。',
  condition: (gameState: GameState, playerState: PlayerState, instance: Card) => {
    if (!playerState.isTurn) return false;
    const units = playerState.unitZone.filter(u => u !== null) as Card[];
    if (units.length === 0 || !units.every(u => AtomicEffectExecutor.matchesColor(u, 'BLUE'))) return false;

    // Target Check: Opponent must have a valid card to bounce
    const opponentId = gameState.playerIds.find(id => id !== playerState.uid)!;
    const opponent = gameState.players[opponentId];
    const maxAc = 2;
    const targets = [...opponent.unitZone, ...opponent.itemZone].filter(c =>
      c && !c.godMark && (c.acValue || 0) <= maxAc
    );
    return targets.length > 0;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const opponentId = gameState.playerIds.find(id => id !== playerState.uid)!;
    const opponent = gameState.players[opponentId];
    const maxAc = 2;

    const targets = [...opponent.unitZone, ...opponent.itemZone].filter(c =>
      c && !c.godMark && (c.acValue || 0) <= maxAc
    ) as Card[];

    if (targets.length > 0) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, targets.map(c => ({
          card: c,
          source: opponent.unitZone.includes(c) ? 'UNIT' : 'ITEM'
        }))),
        title: '选择回场目标',
        description: `【浪漫歌月】诱发效果：选择一个AC ${maxAc} 以下的非神迹卡牌返回手牌。`,
        minSelections: 0,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          effectId: 'fuka_end_turn_bounce',
          sourceCardId: instance.gamecardId
        }
      };
    }
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[]) => {
    if (selections.length > 0) {
      const targetId = selections[0];
      const target = AtomicEffectExecutor.findCardById(gameState, targetId);
      if (target) {
        const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, targetId)!;
        await AtomicEffectExecutor.execute(gameState, ownerUid, {
          type: 'MOVE_FROM_FIELD',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'HAND'
        }, instance);
        gameState.logs.push(`[${instance.fullName}] 诱发效果：使对手的 [${target.fullName}] 返回了手牌。`);
      }
    }
  }
};

const effect_104010449_activate: CardEffect = {
  id: 'fuka_exile_bounce',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '【启】每回合此卡名限一次，从你的手牌、卡组或墓地中将两张“风花”神迹卡牌移出对战，且仅在你的主要阶段可以发动：选择一张横置状态的单位或道具卡牌（不包括该单位本身）返回其持有者手牌。',
  limitCount: 1,
  limitNameType: true,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    fukaGodmarkCards(playerState, instance).length >= 2 &&
    horizontalFieldCards(gameState, instance).length > 0,
  targetSpec: {
    title: '选择回场目标',
    description: '选择一张横置的单位或道具返回持有者手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT', 'ITEM'],
    controller: 'ANY',
    step: 'BOUNCE',
    getCandidates: (gameState, _playerState, instance) => horizontalFieldCards(gameState, instance)
  },
  cost: async (gameState, playerState, instance) => {
    const costs = fukaGodmarkCards(playerState, instance);
    if (costs.length < 2) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costs.map(entry => entry.card),
      '选择移出对战的卡牌',
      '选择两张“风花”神迹卡移出对战作为代价。',
      2,
      2,
      {
        sourceCardId: instance.gamecardId,
        effectId: 'fuka_exile_bounce',
        step: 'FUKA_EXILE_COST',
        costType: 'CUSTOM_CARD_COST',
        skipEffectResolveAfterCost: true
      },
      card => (costs.find(entry => entry.card.gamecardId === card.gamecardId)?.source || card.cardlocation) as TriggerLocation
    );
    return true;
  },
  onCostResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step !== 'FUKA_EXILE_COST') return;
    const costs = fukaGodmarkCards(playerState, instance);
    const selected = selections
      .map(id => costs.find(entry => entry.card.gamecardId === id)?.card)
      .filter((card): card is Card => !!card);
    if (selected.length !== 2 || new Set(selected.map(card => card.gamecardId)).size !== 2) {
      context.cancelActivation = true;
      return;
    }
    const usedDeck = selected.some(card => card.cardlocation === 'DECK');
    selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'EXILE', instance));
    if (usedDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  },
  onQueryResolve: async (instance: Card, gameState: GameState, _playerState: PlayerState, selections: string[], context: any) => {
    if (context?.step !== 'BOUNCE' || selections.length === 0) return;
    const targetId = selections[0];
    const owner = AtomicEffectExecutor.findCardOwnerKey(gameState, targetId);
    const target = AtomicEffectExecutor.findCardById(gameState, targetId);
    if (!owner || !target || !target.isExhausted || target.gamecardId === instance.gamecardId) return;
    await AtomicEffectExecutor.execute(gameState, owner, {
      type: 'MOVE_FROM_FIELD',
      targetFilter: { gamecardId: targetId },
      destinationZone: 'HAND'
    }, instance);
  }
};

const card: Card = {
  id: '104010449',
  gamecardId: null as any,
  fullName: '浪漫歌月【风花】',
  specialName: '风花',
  type: 'UNIT',
  color: 'BLUE',
  colorReq: { 'BLUE': 2 },
  faction: '百濑之水城',
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
  effects: [
    effect_104010449_continuous,
    effect_104010449_trigger,
    effect_104010449_activate
  ],
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT04',
  uniqueId: null,
};

export default card;
