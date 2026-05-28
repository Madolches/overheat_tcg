import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addContinuousKeyword,
  addContinuousPower,
  canPutUnitOntoBattlefield,
  nameContains,
  putUnitOntoField
} from './BaseUtil';

const enteredByBlueprintOrOwnEffect = (gameState: any, instance: Card) => {
  const data = (instance as any).data || {};
  const source = AtomicEffectExecutor.findCardById(gameState, data.lastMoveEffectSourceCardId);
  return !!data.placedByBlueprintSourceCardId ||
    !!data.placedByOwnRevealEffect ||
    (
      data.placedByBlueprintEffectTurn !== undefined &&
      data.lastMovedByEffectTurn === data.placedByBlueprintEffectTurn &&
      data.lastMovedToZone === 'UNIT' &&
      !!source &&
      nameContains(source, '蓝图')
    );
};

const revealedFromDeckTop = (instance: Card, event: any) =>
  event?.type === 'REVEAL_DECK' &&
  event.data?.cards?.some((card: Card) => card.gamecardId === instance.gamecardId);

const cardEffects: CardEffect[] = [{
  id: '105000385_blueprint_or_own_entry_boost',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '由于卡名含有《蓝图》的卡或这张卡的效果进入战场的这张卡力量+500，获得【英勇】。',
  condition: (gameState, _playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    enteredByBlueprintOrOwnEffect(gameState, instance),
  applyContinuous: (_gameState, instance) => {
    addContinuousPower(instance, instance, 500);
    addContinuousKeyword(instance, instance, 'heroic');
  }
}, {
  id: '105000385_revealed_from_top_put_self',
  type: 'TRIGGER',
  triggerLocation: ['DECK'],
  triggerEvent: 'REVEAL_DECK',
  description: '这张卡从卡组顶被公开时，可以将其放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    revealedFromDeckTop(instance, event) &&
    canPutUnitOntoBattlefield(playerState, instance),
  execute: async (instance, gameState, playerState) => {
    if (!putUnitOntoField(gameState, playerState.uid, instance, instance)) return;
    const moved = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
    if (moved) {
      (moved as any).data = {
        ...((moved as any).data || {}),
        placedByOwnRevealEffectTurn: gameState.turnCount,
        placedByOwnRevealEffect: true
      };
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000385
 * Card2 Row: 582
 * Card Row: 466
 * Source CardNo: BT07-Y05
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：由于卡名含有《蓝图》的卡或这张卡的效果进入战场的这个单位〖力量+500〗，获得【英勇】。
 * 【诱】{这张卡从卡组顶被公开时}:你可以将你卡组顶的这张卡放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000385',
  fullName: '钢兵魔偶',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 4,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: false,
  baseHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
