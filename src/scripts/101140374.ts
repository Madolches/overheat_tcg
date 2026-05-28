import { Card, CardEffect } from '../types/game';
import { allCardsOnField, createSelectCardQuery, destroyByEffect } from './BaseUtil';

const isShingiStory = (card?: Card) =>
  !!card &&
  card.type === 'STORY' &&
  card.fullName.includes('神仪');

const cardEffects: CardEffect[] = [{
  id: '101140374_shingi_cost_destroy',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  isMandatory: false,
  triggerLocation: ['EXILE'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：这个单位由于卡名含有《神仪》的故事卡费用被放逐时，选择战场1张非神蚀卡；若该卡ACCESS值+2以下，可以破坏。',
  condition: (gameState, _playerState, instance, event) => {
    if (event?.sourceCardId !== instance.gamecardId || instance.cardlocation !== 'EXILE') return false;
    const sourceCardId = event.data?.effectSourceCardId || (instance as any).data?.lastMovedAsCostSourceCardId;
    const source = sourceCardId
      ? allCardsOnField(gameState).find(card => card.gamecardId === sourceCardId) ||
        Object.values(gameState.players)
          .flatMap(player => [...player.hand, ...player.deck, ...player.grave, ...player.exile, ...player.playZone])
          .find(card => card?.gamecardId === sourceCardId)
      : undefined;
    return event.data?.sourceZone === 'UNIT' &&
      event.data?.targetZone === 'EXILE' &&
      event.data?.isEffect === false &&
      isShingiStory(source) &&
      allCardsOnField(gameState).some(card => !card.godMark && (card.acValue || 0) <= 2);
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = allCardsOnField(gameState).filter(card => !card.godMark && (card.acValue || 0) <= 2);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择破坏目标',
      '选择战场上1张ACCESS值+2以下的非神蚀卡，将其破坏。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101140374_shingi_cost_destroy' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0]
      ? allCardsOnField(gameState).find(card => card.gamecardId === selections[0] && !card.godMark && (card.acValue || 0) <= 2)
      : undefined;
    if (target) destroyByEffect(gameState, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140374
 * Card2 Row: 567
 * Card Row: 451
 * Source CardNo: BT07-W01
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位由于卡名含有《神仪》的故事卡的费用而被放逐时，选择战场上1个非神蚀单位}[AC+2]：你可以将被选择的卡破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101140374',
  fullName: '神仪筹备人',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '女神教会',
  acValue: 2,
  power: 2000,
  basePower: 2000,
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
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
