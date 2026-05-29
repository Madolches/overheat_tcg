import { Card, CardEffect } from '../types/game';
import {
  AtomicEffectExecutor,
  addContinuousKeyword,
  addContinuousPower,
  damagePlayerByEffect,
  getOpponentUid,
  isAlchemyCard
} from './BaseUtil';

const enteredFromDeckByAlchemy = (instance: Card, gameState: any) =>
  (instance as any).data?.enteredFromDeckByAlchemyTurn !== undefined ||
  (() => {
    if (
      (instance as any).data?.lastMovedFromZone !== 'DECK' ||
      (instance as any).data?.lastMovedToZone !== 'UNIT'
    ) {
      return false;
    }
    const source = AtomicEffectExecutor.findCardById(gameState, (instance as any).data?.lastMoveEffectSourceCardId);
    return isAlchemyCard(source);
  })();

const enteredFromDeckByEffect = (instance: Card) =>
  (instance as any).data?.lastMovedFromZone === 'DECK' &&
  (instance as any).data?.lastMovedToZone === 'UNIT' &&
  (instance as any).data?.lastMovedByEffectTurn !== undefined;

const enteredFromDeckByCardEffect = (instance: Card, gameState: any) =>
  enteredFromDeckByEffect(instance) || enteredFromDeckByAlchemy(instance, gameState);

const battleDestroyedOpponentUnitByThisCard = (playerState: any, instance: Card, event?: any) => {
  if (event?.type !== 'CARD_DESTROYED_BATTLE' || !event.targetCardId) return false;
  const participated =
    event.data?.attackerIds?.includes(instance.gamecardId) ||
    event.data?.defenderId === instance.gamecardId;
  if (!participated) return false;
  if (event.playerUid !== undefined) return event.playerUid !== playerState.uid;
  return !playerState.unitZone.some((unit: Card | null) => unit?.gamecardId === event.targetCardId);
};

const effect_105000354_alchemy_bonus: CardEffect = {
  id: '105000354_alchemy_bonus',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '由于卡名含有《炼金》的卡的效果从卡组进入战场的这张卡力量+1000并获得【英勇】。',
  condition: (gameState, _playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    enteredFromDeckByAlchemy(instance, gameState),
  applyContinuous: (gameState, instance) => {
    if (!enteredFromDeckByAlchemy(instance, gameState)) return;
    addContinuousPower(instance, instance, 1000);
    addContinuousKeyword(instance, instance, 'heroic');
  }
};

const effect_105000354_battle_damage: CardEffect = {
  id: '105000354_battle_damage',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_DESTROYED_BATTLE' as any,
  isGlobal: true,
  isMandatory: true,
  description: '由于卡效果从卡组进入战场的这张卡战斗破坏对手单位时，给予对手3点伤害。',
  condition: (gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    enteredFromDeckByCardEffect(instance, gameState) &&
    battleDestroyedOpponentUnitByThisCard(playerState, instance, event),
  execute: async (instance, gameState, playerState) => {
    await damagePlayerByEffect(gameState, playerState.uid, getOpponentUid(gameState, playerState.uid), 3, instance);
  }
};

const card: Card = {
  id: '105000354',
  fullName: '炼金巨兽',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  baseColorReq: {},
  faction: '无',
  acValue: 4,
  baseAcValue: 4,
  power: 3000,
  basePower: 3000,
  damage: 3,
  baseDamage: 3,
  godMark: false,
  baseGodMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: false,
  baseHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105000354_alchemy_bonus, effect_105000354_battle_damage],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
