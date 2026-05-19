import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  createSelectCardQuery,
  moveCard
} from './BaseUtil';

const IRODORI_CARD_IDS = new Set([
  '101000292',
  '101000293',
  '102000367',
  '102050276',
  '102060290',
  '103000302',
  '103000275',
  '104000298',
  '104000368',
  '105000296'
]);

const hasIrodori = (card: Card) =>
  IRODORI_CARD_IDS.has(String(card.id)) ||
  card.effects?.some(effect =>
    effect.id?.toLowerCase().includes('irodori') ||
    effect.description?.includes('异彩')
  );

const addTemporaryColor = (card: Card, color: string) => {
  (card as any).temporaryExtraColors = Array.from(new Set([
    ...((card as any).temporaryExtraColors || []),
    color
  ]));
};

const nonGodUnitCardsInGrave = (playerState: any) =>
  playerState.grave.filter((card: Card) => card.type === 'UNIT' && !card.godMark);

const effect_103000272_enter_search: CardEffect = {
  id: '103000272_enter_search',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  description: '【诱】这个单位进入战场时，横置并舍弃1张手牌：你可以将卡组中1张具有异彩的卡加入手牌。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    !instance.isExhausted &&
    playerState.hand.some(card => card.gamecardId !== instance.gamecardId) &&
    playerState.deck.some(hasIrodori),
  cost: async (gameState, playerState, instance) => {
    const candidates = playerState.hand.filter(card => card.gamecardId !== instance.gamecardId);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '支付舍弃费用',
      '选择1张手牌舍弃，并横置此单位作为费用。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '103000272_enter_search',
        costType: 'DISCARD_HAND_COST',
        discardCostAmount: 1,
        exhaustSourceAsCost: true
      },
      () => 'HAND'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.deck.filter(hasIrodori);
    if (candidates.length === 0) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择异彩卡',
      '选择卡组中的1张具有异彩的卡加入手牌。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000272_enter_search', step: 'SEARCH' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'SEARCH') return;
    const selected = selections[0] ? playerState.deck.find(card => card.gamecardId === selections[0] && hasIrodori(card)) : undefined;
    if (!selected) return;
    moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
};

const effect_103000272_grave_color: CardEffect = {
  id: '103000272_grave_color',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '【启】1回合1次，选择你的墓地中的1张非神蚀单位卡：将其放逐。本回合中，这个单位也具备被放逐的卡的颜色。',
  condition: (_gameState, playerState, instance) =>
    instance.cardlocation === 'UNIT' &&
    nonGodUnitCardsInGrave(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      nonGodUnitCardsInGrave(playerState),
      '选择放逐单位',
      '选择你的墓地中的1张非神蚀单位卡放逐。此单位本回合也具备那张卡的颜色。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '103000272_grave_color' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0]
      ? playerState.grave.find(card => card.gamecardId === selections[0] && card.type === 'UNIT' && !card.godMark)
      : undefined;
    if (!selected) return;
    const color = selected.color;
    moveCard(gameState, playerState.uid, selected, 'EXILE', instance);
    if (color !== 'NONE') {
      addTemporaryColor(instance, color);
      gameState.logs.push(`[${instance.fullName}] 本回合也具备 ${color}。`);
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000272
 * Card2 Row: 431
 * Card Row: 314
 * Source CardNo: SP02-G01
 * Package: SP02(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位进入战场时}[横置，舍弃一张手牌]:你可以将你的卡组中一张具有异彩的卡加入手牌。
 * 【启】〖1回合1次〗{选择你的墓地中的一张非神蚀单位卡}:将被选择的卡放逐。本回合中，这个单位也具备被放逐的卡的颜色。
 * “接下来，我们来听听三队的主将有什么想说的吧！
 */
const card: Card = {
  id: '103000272',
  fullName: '狐族报道员',
  specialName: '',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 2,
  power: 500,
  basePower: 500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_103000272_enter_search, effect_103000272_grave_color],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
