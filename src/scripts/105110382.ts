import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { backErosionCount, canPutUnitOntoBattlefield, createSelectCardQuery, paymentCost, putUnitOntoField } from './BaseUtil';

const recruitCandidates = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    card.id !== '105110382' &&
    card.type === 'UNIT' &&
    card.color === 'YELLOW' &&
    !card.godMark &&
    (card.acValue || 0) <= 3 &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const opponentPutUnitFromGraveByEffect = (playerUid: string, event: any) =>
  event?.type === 'CARD_ENTERED_ZONE' &&
  event.playerUid !== playerUid &&
  event.data?.sourceZone === 'GRAVE' &&
  event.data?.zone === 'UNIT' &&
  event.data?.isEffect === true &&
  event.sourceCard?.type === 'UNIT';

const cardEffects: CardEffect[] = [{
  id: '105110382_opponent_grave_entry_recruit',
  type: 'TRIGGER',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isGlobal: true,
  limitCount: 1,
  erosionBackLimit: [1, 99],
  description: '1回合1次：对手通过卡的能力将墓地的单位卡放置到战场上时，创痕1，从卡组放置1张这张卡以外的ACCESS3以下黄色非神蚀单位。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    backErosionCount(playerState) >= 1 &&
    opponentPutUnitFromGraveByEffect(playerState.uid, event) &&
    recruitCandidates(playerState).length > 0,
  cost: paymentCost(1, 'YELLOW'),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      recruitCandidates(playerState),
      '选择战地保卫官支援单位',
      '从你的卡组选择1张《战地保卫官》以外的ACCESS3以下黄色非神蚀单位放置到战场。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110382_opponent_grave_entry_recruit' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || !recruitCandidates(playerState).some(card => card.gamecardId === selected.gamecardId)) return;
    if (putUnitOntoField(gameState, playerState.uid, selected, instance)) {
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110382
 * Card2 Row: 579
 * Card Row: 463
 * Source CardNo: BT07-Y02
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗{对手通过卡的能力将墓地的单位卡放置到战场上时}[〖+1〗]:将你的卡组中的1张《战地保卫官》以外的ACCESS值+3以下的黄色非神蚀单位放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110382',
  fullName: '战地保卫官',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '学院要塞',
  acValue: 3,
  power: 3500,
  basePower: 3500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
