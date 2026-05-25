import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addContinuousDamage, addContinuousKeyword, addContinuousPower, createSelectCardQuery, getOpponentUid, moveCard, ownUnits } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101130204_enter_bottom',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  triggerLocation: ['UNIT'],
  description: '入场时，若你的战场上有【神依】单位，可以选择对手战场1张非神蚀卡放置到卡组底。',
  condition: (gameState, playerState, instance, event) => {
    if (event?.sourceCardId !== instance.gamecardId || event.data?.zone !== 'UNIT') return false;
    if (!ownUnits(playerState).some(unit => unit.isShenyi)) return false;
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    return [...opponent.unitZone, ...opponent.itemZone].some(card => card && !card.godMark);
  },
  execute: async (instance, gameState, playerState) => {
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    const opponent = gameState.players[opponentUid];
    const targets = [...opponent.unitZone, ...opponent.itemZone].filter((card): card is Card => !!card && !card.godMark);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择放置到卡组底的卡',
      '选择对手战场上的1张非神蚀卡，将其放置到卡组底。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101130204_enter_bottom', opponentUid },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections, context) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target && !target.godMark) moveCard(gameState, context.opponentUid, target, 'DECK', instance, { insertAtBottom: true });
  }
}, {
  id: '101130204_erosion_boost',
  type: 'CONTINUOUS',
  erosionTotalLimit: [0, 3],
  triggerLocation: ['UNIT'],
  description: '0~3：你的所有非神蚀单位伤害+1、力量+500并获得【英勇】。',
  applyContinuous: (gameState, instance) => {
    const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, instance.gamecardId);
    if (!ownerUid) return;
    ownUnits(gameState.players[ownerUid]).filter(unit => !unit.godMark).forEach(unit => {
      addContinuousDamage(unit, instance, 1);
      addContinuousPower(unit, instance, 500);
      if (unit.baseHeroic === undefined) unit.baseHeroic = !!unit.isHeroic;
      addContinuousKeyword(unit, instance, 'heroic');
    });
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130204
 * Card2 Row: 230
 * Card Row: 230
 * Source CardNo: BT03-W05
 * Package: BT03(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:这个单位进入战场时，若你的战场上有具有【神依】的单位，你可以选择对手战场上的1张非神蚀卡，将其放置到卡组底。
 * 〖0~3〗【永】:你所有的非神蚀单位〖伤害+1〗〖力量+500〗并获得【英勇】。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130204',
  fullName: '战歌的圣少女「蒂雅」',
  specialName: '蒂雅',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '圣王国',
  acValue: 4,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: false,
  baseHeroic: false,
  isShenyi: false,
  baseShenyi: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
