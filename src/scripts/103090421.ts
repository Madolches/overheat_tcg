import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  discardHandCost,
  getOpponentUid,
  getResonanceExiledCard,
  isResonanceExileEvent,
  markCanAttackAnyUnit,
  moveCard,
  ownUnits,
  putUnitOntoField,
  silenceAllEffectsUntil,
  totalErosionCount,
  untilOpponentEndTurn
} from './BaseUtil';

const SERNOBU = '瑟诺布';

const opponentUnits = (gameState: any, playerUid: string) =>
  gameState.players[getOpponentUid(gameState, playerUid)].unitZone.filter((unit: Card | null): unit is Card => !!unit);

const silverMusicGraveUnits = (playerState: any) =>
  playerState.grave.filter((card: Card) =>
    card.type === 'UNIT' &&
    card.fullName.includes('银乐') &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '103090421_resonance_god_silence_attack',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  triggerLocation: ['UNIT'],
  isMandatory: true,
  isGlobal: true,
  description: '你的单位的共鸣能力将<瑟诺布>神蚀卡放逐时，选择对手1个单位失去所有能力，并令你的<瑟诺布>单位下一次攻击可攻击它。',
  condition: (gameState, playerState, _instance, event) => {
    const exiled = getResonanceExiledCard(event);
    const sourceId = (exiled as any)?.data?.resonanceSourceCardId;
    const source = sourceId ? AtomicEffectExecutor.findCardById(gameState, sourceId) : undefined;
    return !!exiled &&
      isResonanceExileEvent(event) &&
      event?.playerUid === playerState.uid &&
      exiled.faction === SERNOBU &&
      !!exiled.godMark &&
      !!source &&
      source.cardlocation === 'UNIT' &&
      ownUnits(playerState).some(unit => unit.gamecardId === source.gamecardId) &&
      opponentUnits(gameState, playerState.uid).length > 0;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      opponentUnits(gameState, playerState.uid),
      '选择对手单位',
      '选择对手战场上的1个单位。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103090421_resonance_god_silence_attack' },
      () => 'UNIT'
    );
  },
  targetSpec: {
    title: '选择对手单位',
    description: '选择对手战场上的1个单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) =>
      opponentUnits(gameState, playerState.uid)
        .map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = opponentUnits(gameState, playerState.uid).find(unit => unit.gamecardId === selections[0]);
    if (!target) return;
    silenceAllEffectsUntil(target, instance, untilOpponentEndTurn(gameState, playerState.uid));
    ownUnits(playerState)
      .filter(unit => unit.faction === SERNOBU)
      .forEach(unit => {
        markCanAttackAnyUnit(unit, instance);
        const data = (unit as any).data || {};
        (unit as any).data = data;
        data.canAttackAnyUnitUntilTurn = gameState.turnCount;
        data.canAttackAnyUnitConsumeOnAttack = true;
      });
    playerState.markedUnitAttackTarget = target.gamecardId;
  }
}, {
  id: '103090421_self_resonance_revive_silver_music',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  triggerLocation: ['EXILE'],
  isMandatory: false,
  description: '5~8：共鸣能力将墓地中的这张卡放逐时，舍弃1张手牌，可以将墓地中1张卡名含有《银乐》的单位放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    isResonanceExileEvent(event) &&
    getResonanceExiledCard(event)?.gamecardId === instance.gamecardId &&
    totalErosionCount(playerState) >= 5 &&
    totalErosionCount(playerState) <= 8 &&
    playerState.hand.length > 0 &&
    silverMusicGraveUnits(playerState).length > 0,
  cost: discardHandCost(1),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      silverMusicGraveUnits(playerState),
      '选择放置单位',
      '可以选择墓地中1张卡名含有《银乐》的单位放置到战场。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103090421_self_resonance_revive_silver_music' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    if (!selections[0]) return;
    const target = silverMusicGraveUnits(playerState).find((card: Card) => card.gamecardId === selections[0]);
    if (target) putUnitOntoField(gameState, playerState.uid, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103090421
 * Card2 Row: 648
 * Card Row: 530
 * Source CardNo: BT08-G11
 * Package: BT08(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{你的单位的共鸣能力将<瑟诺布>的神蚀卡放逐时，选择对手战场上的1个单位}:直到对手的回合结束时为止，被选择的单位失去所有能力。本回合中，你的<瑟诺布>单位的下一次攻击可以攻击被选择的单位。
 * 〖5~8〗【诱】{共鸣能力将你的墓地中的这张卡放逐时}[舍弃1张手牌]:你可以将你墓地中的1张卡名含有《银乐》的单位卡放置到战场上。
 */
const card: Card = {
  id: '103090421',
  fullName: '银乐器之诗「夏洛」',
  specialName: '夏洛',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '瑟诺布',
  acValue: 4,
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
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
