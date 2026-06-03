import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addContinuousDamage,
  addContinuousKeyword,
  addContinuousPower,
  allCardsOnField,
  createChoiceQuery,
  createSelectCardQuery,
  destroyByEffect,
  getOpponentUid,
  nameContains
} from './BaseUtil';

const enteredByBlueprint = (gameState: any, instance: Card) => {
  const data = (instance as any).data || {};
  const source = AtomicEffectExecutor.findCardById(gameState, data.lastMoveEffectSourceCardId || data.placedByBlueprintSourceCardId);
  return data.placedByBlueprintEffectTurn === gameState.turnCount ||
    !!source && nameContains(source, '蓝图');
};

const opponentNonGodFieldCards = (gameState: any, playerUid: string) => {
  const opponent = gameState.players[getOpponentUid(gameState, playerUid)];
  return [...opponent.unitZone, ...opponent.itemZone].filter((card: Card | null): card is Card =>
    !!card && !card.godMark
  );
};

const godmarkFieldCards = (gameState: any) =>
  allCardsOnField(gameState).filter(card => card.godMark);

const defenseModeOptions = (gameState: any, playerUid: string) => {
  const options = [];
  if (opponentNonGodFieldCards(gameState, playerUid).length > 0) options.push({ id: 'DESTROY_OPPONENT_NON_GOD', label: '破坏对手非神蚀卡' });
  if (godmarkFieldCards(gameState).length > 0) options.push({ id: 'DESTROY_GODMARK', label: '破坏神蚀卡' });
  return options;
};

const cardEffects: CardEffect[] = [{
  id: '105110386_blueprint_entry_destroy',
  type: 'TRIGGER',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  description: '由于卡名含有《蓝图》的卡的效果进入战场时，选择1项：破坏对手战场所有非神蚀卡；或破坏战场1张神蚀卡。',
  condition: (gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    enteredByBlueprint(gameState, instance) &&
    defenseModeOptions(gameState, playerState.uid).length > 0,
  targetSpec: {
    modeTitle: '选择效果',
    modeDescription: '选择1项效果执行。',
    modeOptions: [{
      id: 'DESTROY_OPPONENT_NON_GOD',
      label: '破坏对手非神蚀卡',
      title: '破坏对手非神蚀卡',
      description: '破坏对手战场上的所有非神蚀卡。',
      minSelections: 0,
      maxSelections: 0,
      zones: [],
      step: 'DESTROY_OPPONENT_NON_GOD',
      condition: (gameState, playerState) => opponentNonGodFieldCards(gameState, playerState.uid).length > 0
    }, {
      id: 'DESTROY_GODMARK',
      label: '破坏神蚀卡',
      title: '选择神蚀卡',
      description: '选择战场上的1张神蚀卡并破坏。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT', 'ITEM'],
      controller: 'ANY',
      step: 'DESTROY_GODMARK',
      getCandidates: (gameState) =>
        godmarkFieldCards(gameState).map(card => ({ card, source: card.cardlocation as any })),
      condition: (gameState) => godmarkFieldCards(gameState).length > 0
    }]
  },
  execute: async (instance, gameState, playerState) => {
    const options = defenseModeOptions(gameState, playerState.uid);
    if (options.length === 1 && options[0].id === 'DESTROY_OPPONENT_NON_GOD') {
      opponentNonGodFieldCards(gameState, playerState.uid).forEach(target => destroyByEffect(gameState, target, instance));
      return;
    }
    if (options.length === 1 && options[0].id === 'DESTROY_GODMARK') {
      createSelectCardQuery(
        gameState,
        playerState.uid,
        godmarkFieldCards(gameState),
        '选择神蚀卡',
        '选择战场上的1张神蚀卡破坏。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105110386_blueprint_entry_destroy', step: 'DESTROY_GODMARK' },
        card => card.cardlocation as any
      );
      return;
    }
    createChoiceQuery(
      gameState,
      playerState.uid,
      '选择效果',
      '选择1项效果执行。',
      options,
      { sourceCardId: instance.gamecardId, effectId: '105110386_blueprint_entry_destroy', step: 'MODE' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    const selectedMode = context?.selectedModeId || context?.modeId || context?.step;
    if (selectedMode === 'DESTROY_OPPONENT_NON_GOD') {
      opponentNonGodFieldCards(gameState, playerState.uid).forEach(target => destroyByEffect(gameState, target, instance));
      return;
    }

    if (context?.step === 'MODE') {
      if (selections[0] === 'DESTROY_OPPONENT_NON_GOD') {
        opponentNonGodFieldCards(gameState, playerState.uid).forEach(target => destroyByEffect(gameState, target, instance));
        return;
      }
      createSelectCardQuery(
        gameState,
        playerState.uid,
        godmarkFieldCards(gameState),
        '选择神蚀卡',
        '选择战场上的1张神蚀卡破坏。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105110386_blueprint_entry_destroy', step: 'DESTROY_GODMARK' },
        card => card.cardlocation as any
      );
      return;
    }

    if (selectedMode === 'DESTROY_GODMARK') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (target && target.godMark && ['UNIT', 'ITEM'].includes(target.cardlocation || '')) {
        destroyByEffect(gameState, target, instance);
      }
    }
  }
}, {
  id: '105110386_creation_scar_stats',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  erosionBackLimit: [4, 99],
  description: '创痕：这张卡伤害+1，力量+1000，并获得【英勇】【歼灭】。',
  applyContinuous: (_gameState, instance) => {
    addContinuousDamage(instance, instance, 1);
    addContinuousPower(instance, instance, 1000);
    addContinuousKeyword(instance, instance, 'heroic');
    addContinuousKeyword(instance, instance, 'annihilation');
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110386
 * Card2 Row: 588
 * Card Row: 472
 * Source CardNo: BT07-Y11
 * Package: BT07(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位由于卡名含有《蓝图》的卡的效果进入战场时，选择下列的1项效果执行}：
 * ◆将对手战场上的所有非神蚀卡破坏。
 * ◆{选择战场上的1张神蚀卡}：将被选择的卡破坏。
 * 【创痕4】【永】：这个单位〖伤害+1〗〖力量+1000〗并获得【英勇】【歼灭】。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110386',
  fullName: '「魔装人型防御机关」',
  specialName: '魔装人型防御机关',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 4 },
  faction: '学院要塞',
  acValue: 5,
  power: 4000,
  basePower: 4000,
  damage: 4,
  baseDamage: 4,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isAnnihilation: false,
  baseAnnihilation: false,
  isHeroic: false,
  baseHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
