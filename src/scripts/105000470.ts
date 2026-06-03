import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, getBattlefieldUnits, isVirtualGodMarkReveal, shuffleAndRevealTopCards } from './BaseUtil';

const effect_105000470_enter: CardEffect = {
  id: '105000470_enter',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  limitCount: 1,
  limitNameType: true,
  isMandatory: true,
  description: '这个单位进入战场时，洗切你的卡组并展示卡组顶1张卡。若其为神蚀卡，将战场上1个单位返回持有者手牌。',
  condition: (_gameState, _playerState, instance, event?: GameEvent) =>
    instance.cardlocation === 'UNIT' &&
    event?.type === 'CARD_ENTERED_ZONE' &&
    event.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT',
  targetSpec: {
    preselect: false,
    title: '选择单位',
    description: '若公开的卡为神蚀卡，选择战场上1个单位返回手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'RETURN_UNIT',
    getCandidates: (gameState) =>
      getBattlefieldUnits(gameState).map(card => ({ card, source: 'UNIT' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    const revealedCard = (await shuffleAndRevealTopCards(gameState, playerState.uid, 1, instance))[0];
    if (!isVirtualGodMarkReveal(gameState, revealedCard)) return;

    const targets = getBattlefieldUnits(gameState);
    if (targets.length === 0) return;

    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择单位',
      '选择战场上1个单位返回手牌。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000470_enter' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    await AtomicEffectExecutor.execute(gameState, playerState.uid, {
      type: 'MOVE_FROM_FIELD',
      targetFilter: { gamecardId: selections[0], type: 'UNIT' },
      destinationZone: 'HAND'
    }, instance);
  }
};

const card: Card = {
  id: '105000470',
  fullName: '食人魔偶',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  baseIsrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105000470_enter],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
