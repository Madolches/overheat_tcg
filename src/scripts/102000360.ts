import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  allCardsOnField,
  canPutUnitOntoBattlefield,
  cardsInZones,
  createSelectCardQuery,
  discardHandCost,
  destroyByEffect,
  isFeijingUnit,
  isNonGodUnit,
  putUnitOntoField
} from './BaseUtil';

const feijingTargets = (playerState: any) =>
  cardsInZones(playerState, ['HAND', 'DECK']).filter(({ card }) =>
    isFeijingUnit(card) &&
    isNonGodUnit(card) &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const leftByBattleOrOpponentEffect = (playerUid: string, event: any) =>
  event?.type === 'CARD_DESTROYED_BATTLE' ||
  event?.data?.sourcePlayerId && event.data.sourcePlayerId !== playerUid ||
  event?.data?.effectSourcePlayerUid && event.data.effectSourcePlayerUid !== playerUid;

const cardEffects: CardEffect[] = [{
  id: '102000360_enter_discard_put_feijing',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  description: '这张卡进入战场时，舍弃2张手牌：可以将手牌或卡组中的2张具有【菲晶】的非神蚀单位放置到战场。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    playerState.hand.length >= 2 &&
    feijingTargets(playerState).length >= 2,
  cost: async (gameState, playerState, instance) =>
    discardHandCost(2)(gameState, playerState, instance),
  execute: async (instance, gameState, playerState) => {
    const candidates = feijingTargets(playerState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates.map(entry => entry.card),
      '选择菲晶单位',
      '选择手牌或卡组中的2张具有【菲晶】的非神蚀单位放置到战场。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '102000360_enter_discard_put_feijing' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    let shuffled = false;
    for (const id of selections.slice(0, 2)) {
      const target = AtomicEffectExecutor.findCardById(gameState, id);
      if (!target || !isFeijingUnit(target) || !isNonGodUnit(target) || !canPutUnitOntoBattlefield(playerState, target)) continue;
      shuffled = shuffled || target.cardlocation === 'DECK';
      putUnitOntoField(gameState, playerState.uid, target, instance);
    }
    if (shuffled) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}, {
  id: '102000360_leave_destroy_card',
  type: 'TRIGGER',
  triggerLocation: ['GRAVE', 'EXILE'],
  triggerEvent: ['CARD_LEFT_FIELD', 'CARD_DESTROYED_BATTLE', 'CARD_DESTROYED_EFFECT'],
  isMandatory: true,
  erosionBackLimit: [2, 10],
  description: '创痕2：这张卡由于战斗或对手效果从战场离开时，选择战场上的1张卡破坏。',
  condition: (_gameState, playerState, instance, event) => {
    const isSelf = event?.sourceCardId === instance.gamecardId || event?.targetCardId === instance.gamecardId;
    return !!isSelf &&
      leftByBattleOrOpponentEffect(playerState.uid, event) &&
      playerState.erosionBack.filter(Boolean).length >= 2;
  },
  execute: async (instance, gameState, playerState) => {
    const targets = allCardsOnField(gameState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择破坏卡',
      '选择战场上的1张卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102000360_leave_destroy_card' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target) destroyByEffect(gameState, target, instance);
  }
}];

const card: Card = {
  id: '102000360',
  fullName: '司雷福的驯兽师',
  specialName: '',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
