import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canPutUnitOntoBattlefield,
  collectHighAlchemyMaterialColors,
  createSelectCardQuery,
  ensureData,
  exhaustCost,
  isNonGodUnit,
  moveCard,
  putUnitOntoField
} from './BaseUtil';

const costCards = (playerState: any, instance: Card) => [
  ...playerState.unitZone,
  ...playerState.itemZone,
  ...playerState.hand
].filter((card: Card | null): card is Card =>
  !!card && card.gamecardId !== instance.gamecardId
);

const deckTargets = (playerState: any) =>
  playerState.deck.filter((card: Card) => isNonGodUnit(card) && canPutUnitOntoBattlefield(playerState, card));

const playerAfterSendingMaterials = (playerState: any, selectedMaterials: Card[]) => {
  const sentUnitIds = new Set(selectedMaterials
    .filter(card => card.cardlocation === 'UNIT')
    .map(card => card.gamecardId));
  if (sentUnitIds.size === 0) return playerState;
  return {
    ...playerState,
    unitZone: playerState.unitZone.map((unit: Card | null) =>
      unit && sentUnitIds.has(unit.gamecardId) ? null : unit
    ),
  };
};

const deckTargetsForMaterials = (playerState: any, selectedMaterials: Card[], materialColors = collectHighAlchemyMaterialColors(selectedMaterials)) => {
  const highAlchemyContext = {
    highAlchemyMaterialColors: materialColors,
    highAlchemyMaterialCount: selectedMaterials.length,
  };
  const targetPlayerState = playerAfterSendingMaterials(playerState, selectedMaterials);
  return playerState.deck.filter((card: Card) =>
    isNonGodUnit(card) &&
    canPutUnitOntoBattlefield(targetPlayerState, card, highAlchemyContext)
  );
};

const possibleDeckTargets = (playerState: any, instance: Card) =>
  deckTargetsForMaterials(playerState, costCards(playerState, instance));

const markHighAlchemy = (gameState: any, target: Card, source: Card, materialColors: string[]) => {
  const data = ensureData(target);
  data.highAlchemyPlacedTurn = gameState.turnCount;
  data.highAlchemySourceCardId = source.gamecardId;
  data.highAlchemySourceName = source.fullName;
  data.highAlchemyMaterialColors = Array.from(new Set(materialColors));
  data.enteredFromDeckByAlchemyTurn = gameState.turnCount;
  data.enteredFromDeckByAlchemySourceCardId = source.gamecardId;
};

const cardEffects: CardEffect[] = [{
  id: '105110404_high_alchemy_put_unit',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  description: '主要阶段，横置：将自己战场或手牌合计3张以上的卡送入墓地，将卡组中1张非神蚀单位放置到战场。视作《高位炼金》。',
  condition: (gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    !instance.isExhausted &&
    costCards(playerState, instance).length >= 3 &&
    possibleDeckTargets(playerState, instance).length > 0,
  cost: exhaustCost,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      costCards(playerState, instance),
      '选择高位炼金素材',
      '选择你战场上或手牌中合计3张以上的卡送入墓地。',
      3,
      costCards(playerState, instance).length,
      { sourceCardId: instance.gamecardId, effectId: '105110404_high_alchemy_put_unit', step: 'COST' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'COST') {
      const selected = selections
        .map(id => AtomicEffectExecutor.findCardById(gameState, id))
        .filter((card: Card | undefined): card is Card =>
          !!card && costCards(playerState, instance).some(candidate => candidate.gamecardId === card.gamecardId)
      );
      if (selected.length < 3) return;
      const materialColors = collectHighAlchemyMaterialColors(selected);
      selected.forEach(card => moveCard(gameState, playerState.uid, card, 'GRAVE', instance));
      const candidates = deckTargetsForMaterials(playerState, selected, materialColors);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择炼金单位',
        '选择卡组中的1张非神蚀单位放置到战场。',
        1,
        1,
        {
          sourceCardId: instance.gamecardId,
          effectId: '105110404_high_alchemy_put_unit',
          step: 'PUT_UNIT',
          materialColors,
          materialCount: selected.length,
        },
        () => 'DECK'
      );
      return;
    }

    if (context?.step !== 'PUT_UNIT') return;
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    const highAlchemyContext = {
      highAlchemyMaterialColors: context.materialColors || [],
      highAlchemyMaterialCount: Number(context.materialCount || 0),
    };
    if (!target || target.cardlocation !== 'DECK' || !isNonGodUnit(target) ||
      !canPutUnitOntoBattlefield(playerState, target, highAlchemyContext)) return;
    const targetId = target.gamecardId;
    if (!putUnitOntoField(gameState, playerState.uid, target, instance, highAlchemyContext)) return;
    const moved = AtomicEffectExecutor.findCardById(gameState, targetId);
    if (moved) markHighAlchemy(gameState, moved, instance, context.materialColors || []);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110404
 * Card2 Row: 618
 * Card Row: 502
 * Source CardNo: BT08-Y03
 * Package: BT08(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】{你的主要阶段}[〖横置〗]:将你战场上或手牌中合计3张以上的卡送入墓地，将你的卡组中的1张非神蚀单位卡放置到战场上。这个效果也视作由于《高位炼金》的效果将单位卡放置到战场上。
 */
const card: Card = {
  id: '105110404',
  fullName: '炼金术士「塞西莉亚」',
  specialName: '塞西莉亚',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '学院要塞',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
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
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
