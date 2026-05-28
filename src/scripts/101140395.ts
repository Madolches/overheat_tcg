import { Card, CardEffect } from '../types/game';
import { allCardsOnField, createSelectCardQuery, destroyByEffect } from './BaseUtil';

const isShingiStory = (card?: Card) =>
  !!card &&
  card.type === 'STORY' &&
  card.fullName.includes('神仪');

const findCardEverywhere = (gameState: any, gamecardId?: string) => {
  if (!gamecardId) return undefined;
  return Object.values(gameState.players)
    .flatMap((player: any) => [
      ...player.hand,
      ...player.deck,
      ...player.grave,
      ...player.exile,
      ...player.unitZone,
      ...player.itemZone,
      ...player.erosionFront,
      ...player.erosionBack,
      ...player.playZone
    ])
    .find((card: Card | null | undefined) => card?.gamecardId === gamecardId);
};

const nonGodItemTargets = (gameState: any) =>
  allCardsOnField(gameState).filter(card =>
    (card.type === 'ITEM' || card.isEquip) &&
    !card.godMark
  );

const cardEffects: CardEffect[] = [{
  id: '101140395_shingi_cost_destroy_item',
  type: 'TRIGGER',
  triggerEvent: 'CARD_EXILED',
  isMandatory: false,
  triggerLocation: ['EXILE'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：这个单位由于卡名含有《神仪》的故事卡费用被放逐时，可以选择战场上1张非神蚀道具卡破坏。',
  condition: (gameState, _playerState, instance, event) => {
    if (event?.sourceCardId !== instance.gamecardId || instance.cardlocation !== 'EXILE') return false;
    const source = findCardEverywhere(gameState, event.data?.effectSourceCardId || (instance as any).data?.lastMovedAsCostSourceCardId);
    return event.data?.sourceZone === 'UNIT' &&
      event.data?.targetZone === 'EXILE' &&
      event.data?.isEffect === false &&
      isShingiStory(source) &&
      nonGodItemTargets(gameState).length > 0;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodItemTargets(gameState),
      '选择破坏目标',
      '选择战场上1张非神蚀道具卡，将其破坏。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101140395_shingi_cost_destroy_item' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0]
      ? nonGodItemTargets(gameState).find(card => card.gamecardId === selections[0])
      : undefined;
    if (target) destroyByEffect(gameState, target, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140395
 * Card2 Row: 605
 * Card Row: 489
 * Source CardNo: BT08-W01
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位由于卡名含有《神仪》的故事卡的费用而被放逐时，选择战场上1张非神蚀道具卡}:你可以将被选择的卡破坏。
 */
const card: Card = {
  id: '101140395',
  fullName: '神仪祷告者',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '女神教会',
  acValue: 2,
  power: 1500,
  basePower: 1500,
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
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
