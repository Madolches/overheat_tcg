import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  addTemporaryColor,
  backErosionCount,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  isFeijingUnit,
  putUnitOntoField,
  silenceAllNonKeywordEffectsPermanently
} from './BaseUtil';

const hasNoColorRequirement = (card: Card) =>
  Object.values(card.colorReq || {}).every(value => !value || value <= 0);

const normalizeTokenBody = (card: Card, source: Card) => {
  silenceAllNonKeywordEffectsPermanently(card, source);
  card.baseDamage = 1;
  card.damage = 1;
  card.basePower = 0;
  card.power = 0;
};

const hasBlueUnit = (playerState: any) =>
  playerState.unitZone.some((unit: Card | null) =>
    !!unit &&
    (unit.color === 'BLUE' || (unit as any).temporaryExtraColors?.includes('BLUE'))
  );

const getCandidates = (playerState: any) =>
  [...playerState.deck, ...playerState.grave].filter((card: Card) =>
    card.type === 'UNIT' &&
    hasNoColorRequirement(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const effect_105110355_feijing_colors: CardEffect = {
  id: '105110355_feijing_colors',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '你的战场上的具有【菲晶】的单位也具备黄色和蓝色。',
  applyContinuous: (gameState, instance) => {
    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId);
    const playerState = ownerUid ? gameState.players[ownerUid] : undefined;
    if (!playerState) return;
    playerState.unitZone
      .filter((unit): unit is Card => !!unit && isFeijingUnit(unit))
      .forEach(unit => {
        addTemporaryColor(unit, 'YELLOW');
        addTemporaryColor(unit, 'BLUE');
      });
  }
};

const effect_105110355_end_put: CardEffect = {
  id: '105110355_end_put',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'TURN_END' as any,
  limitCount: 1,
  erosionBackLimit: [1, 99],
  description: '创痕1，你战场有蓝色单位时，你的回合结束时，将卡组或墓地1张没有颜色限制的单位放置到战场，其非基本能力无效，伤害1力量0。',
  condition: (_gameState, playerState) =>
    playerState.isTurn &&
    backErosionCount(playerState) >= 1 &&
    hasBlueUnit(playerState) &&
    getCandidates(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      getCandidates(playerState),
      '选择真理放置对象',
      '从你的卡组或墓地选择1张没有颜色限制的单位放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110355_end_put', step: 'PUT_UNIT' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'PUT_UNIT') return;
    const selected = AtomicEffectExecutor.findCardById(gameState, selections[0]);
    if (!selected || selected.type !== 'UNIT' || !hasNoColorRequirement(selected)) return;
    const fromDeck = selected.cardlocation === 'DECK';
    if (!putUnitOntoField(gameState, playerState.uid, selected, instance)) return;
    const live = AtomicEffectExecutor.findCardById(gameState, selected.gamecardId);
    if (live) normalizeTokenBody(live, instance);
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

const card: Card = {
  id: '105110355',
  fullName: '商队护卫「真理」',
  specialName: '真理',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  baseColorReq: { YELLOW: 1 },
  faction: '学院要塞',
  acValue: 3,
  baseAcValue: 3,
  power: 1000,
  basePower: 1000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  baseGodMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105110355_feijing_colors, effect_105110355_end_put],
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
