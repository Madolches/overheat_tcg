import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutUnitOntoBattlefield, createSelectCardQuery, enteredFromHand, isAlchemyCard, moveCardAsCost, putUnitOntoField } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105120266_reforge',
  type: 'TRIGGER',
  triggerEvent: ['CARD_ENTERED_ZONE', 'CARD_LEFT_FIELD'],
  isMandatory: true,
  sourceSnapshotOnLeftField: true,
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK'],
  limitCount: 1,
  limitNameType: true,
  description: '同名1回合1次：从手牌进入战场或从战场离开时，放逐墓地3张《炼金》卡，从卡组将1张《炼金》非神蚀单位放置到战场。',
  condition: (_gameState, playerState, instance, event) => {
    const entered = event?.type === 'CARD_ENTERED_ZONE' &&
      event.sourceCardId === instance.gamecardId &&
      event.data?.zone === 'UNIT' &&
      enteredFromHand(instance, event);
    const left = event?.type === 'CARD_LEFT_FIELD' &&
      (
        event.sourceCard === instance ||
        event.sourceCardId === instance.gamecardId ||
        event.data?.previousSourceCardId === instance.gamecardId
      );
    return (entered || left) &&
      playerState.grave.filter(card => isAlchemyCard(card)).length >= 3 &&
      playerState.deck.some(card => card.type === 'UNIT' && isAlchemyCard(card) && !card.godMark && canPutUnitOntoBattlefield(playerState, card));
  },
  cost: async (gameState, playerState, instance) => {
    createSelectCardQuery(gameState, playerState.uid, playerState.grave.filter(card => isAlchemyCard(card)), '选择放逐费用', '选择墓地中的3张卡名含有《炼金》的卡放逐作为费用。', 3, 3, {
      sourceCardId: instance.gamecardId,
      effectId: '105120266_reforge',
      step: 'COST',
      skipEffectResolveAfterCost: true
    }, () => 'GRAVE');
    return true;
  },
  onCostResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'COST') {
      selections.forEach(id => {
        const cost = AtomicEffectExecutor.findCardById(gameState, id);
        if (cost?.cardlocation === 'GRAVE') moveCardAsCost(gameState, playerState.uid, cost, 'EXILE', instance);
      });
    }
  },
  execute: async (instance, gameState, playerState) => {
      createSelectCardQuery(gameState, playerState.uid, playerState.deck.filter(card => card.type === 'UNIT' && isAlchemyCard(card) && !card.godMark && canPutUnitOntoBattlefield(playerState, card)), '选择炼金单位', '选择卡组中1张卡名含有《炼金》的非神蚀单位放置到战场。', 1, 1, {
        sourceCardId: instance.gamecardId,
        effectId: '105120266_reforge',
        step: 'UNIT'
      }, () => 'DECK');
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step !== 'UNIT') return;
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (selected?.cardlocation !== 'DECK') return;
    putUnitOntoField(gameState, playerState.uid, selected, instance);
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105120266
 * Card2 Row: 425
 * Card Row: 308
 * Source CardNo: ST04-Y12
 * Package: ST04(TD)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次{这个单位从手牌进入战场时，或这个单位从战场离开时}{将你的墓地中的3张卡名含有《炼金》的放逐}：选择你的卡组中的1张卡名含有《炼金》的非神蚀单位卡，将其放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105120266',
  fullName: '炼金重铸士「娜娜」',
  specialName: '娜娜',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '永生之乡',
  acValue: 4,
  power: 1000,
  basePower: 1000,
  damage: 1,
  baseDamage: 1,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
