import { Card, CardEffect } from '../types/game';
import { addContinuousPower, ownUnits, preventFirstOpponentEffectDestroyEachTurn, totalErosionCount } from './BaseUtil';

type ZoneOwner = {
  unitZone: (Card | null)[];
  itemZone: (Card | null)[];
};

const HOLY_KINGDOM = '圣王国';

const isHolyKingdomCard = (card: Card) =>
  card.faction === HOLY_KINGDOM || card.fullName.includes(HOLY_KINGDOM);

const cardEffects: CardEffect[] = [{
  id: '301130066_prevent_holy_kingdom_first_destroy',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '你战场上的<圣王国>的卡每个回合中第一次将要被对手的卡的效果破坏时，防止那次破坏。',
  applyContinuous: (_gameState, instance) => {
    const owner = Object.values((_gameState as any).players)
      .find((player: any) => player.itemZone.some((item: Card | null) => item?.gamecardId === instance.gamecardId)) as ZoneOwner | undefined;
    if (!owner) return;
    [
      ...owner.unitZone.filter((card: Card | null): card is Card => !!card && isHolyKingdomCard(card)),
      ...owner.itemZone.filter((card: Card | null): card is Card => !!card && isHolyKingdomCard(card))
    ].forEach(card => preventFirstOpponentEffectDestroyEachTurn(card, instance));
  }
}, {
  id: '301130066_low_erosion_holy_kingdom_power',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  erosionTotalLimit: [3, 6],
  description: '3~6：你战场上的<圣王国>单位力量+500。',
  applyContinuous: (_gameState, instance) => {
    const owner = Object.values((_gameState as any).players)
      .find((player: any) => player.itemZone.some((item: Card | null) => item?.gamecardId === instance.gamecardId)) as ZoneOwner | undefined;
    if (!owner || totalErosionCount(owner as any) < 3 || totalErosionCount(owner as any) > 6) return;
    ownUnits(owner as any)
      .filter(isHolyKingdomCard)
      .forEach(unit => addContinuousPower(unit, instance, 500));
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 301130066
 * Card2 Row: 614
 * Card Row: 498
 * Source CardNo: BT08-W10
 * Package: BT08(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:你战场上的<圣王国>的卡每个回合中第一次将要被对手的卡的效果破坏时，防止那次破坏。
 * 〖3~6〗【永】:你战场上的<圣王国>的单位〖力量+500〗。
 */
const card: Card = {
  id: '301130066',
  fullName: '「光辉之城」',
  specialName: '光辉之城',
  type: 'ITEM',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '圣王国',
  acValue: 2,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
