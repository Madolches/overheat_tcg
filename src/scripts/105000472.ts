import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutUnitOntoBattlefield } from './BaseUtil';

const effect_105000472_virtual_godmark: CardEffect = {
  id: '105000472_virtual_godmark',
  type: 'CONTINUOUS',
  triggerLocation: ['DECK'],
  treatAsGodMarkInDeck: true,
  description: '在你的卡组中，这张卡也视为神蚀卡。'
} as CardEffect;

const effect_105000472_reveal: CardEffect = {
  id: '105000472_reveal',
  type: 'TRIGGER',
  triggerLocation: ['DECK'],
  triggerEvent: 'REVEAL_DECK',
  isMandatory: false,
  description: '这张卡从卡组顶展示时，你可以将其放置到战场。',
  condition: (_gameState, playerState, instance, event?: GameEvent) =>
    instance.cardlocation === 'DECK' &&
    event?.type === 'REVEAL_DECK' &&
    event.playerUid === playerState.uid &&
    Array.isArray(event.data?.cards) &&
    event.data.cards.some((card: Card) => card.gamecardId === instance.gamecardId),
  execute: async (instance, gameState, playerState) => {
    if (!canPutUnitOntoBattlefield(playerState, instance)) return;
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_DECK',
      targetFilter: { gamecardId: instance.gamecardId },
      destinationZone: 'UNIT'
    }, instance);
  }
};

const card: Card = {
  id: '105000472',
  fullName: '暗影马魔偶',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 3,
  power: 2000,
  basePower: 2000,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  baseGodMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  baseIsrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105000472_virtual_godmark, effect_105000472_reveal],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
