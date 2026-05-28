import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutItemOntoBattlefield, createSelectCardQuery, getOpponentUid, moveCard, nameContains, ownItems } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '105000229_enter_leave_item',
  type: 'TRIGGER',
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'],
  triggerEvent: ['CARD_ENTERED_ZONE', 'CARD_LEFT_FIELD'],
  isMandatory: true,
  limitCount: 1,
  limitNameType: true,
  description: '进入战场或从战场离开时，将卡组中1张ACCESS+1以下的黄色道具卡放置到战场上。',
  condition: (_gameState, playerState, instance, event) => {
    const entered = event?.type === 'CARD_ENTERED_ZONE' && event.sourceCardId === instance.gamecardId && event.data?.zone === 'UNIT';
    const left = event?.type === 'CARD_LEFT_FIELD' &&
      (event.sourceCardId === instance.gamecardId || event.data?.previousSourceCardId === instance.gamecardId) &&
      event.data?.sourceZone === 'UNIT';
    return (entered || left) &&
      playerState.deck.some(card => card.type === 'ITEM' && card.color === 'YELLOW' && (card.acValue || 0) <= 1 && canPutItemOntoBattlefield(playerState, card));
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.deck.filter(card =>
      card.type === 'ITEM' &&
      card.color === 'YELLOW' &&
      (card.acValue || 0) <= 1 &&
      canPutItemOntoBattlefield(playerState, card)
    );
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择黄色道具',
      '选择卡组中的1张ACCESS值+1以下的黄色道具卡放置到战场上。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000229_enter_leave_item' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.effectId !== '105000229_enter_leave_item') return;
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (selected?.cardlocation === 'DECK') {
      moveCard(gameState, playerState.uid, selected, 'ITEM', instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
}, {
  id: '105000229_destroy_search',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '选择你的1张道具卡破坏。之后对手可舍弃1张手牌，若不舍弃，将卡组中1张卡名含有《怪盗》的卡加入手牌。',
  condition: (_gameState, playerState) => ownItems(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownItems(playerState),
      '选择破坏道具',
      '选择你的战场上的1张道具卡破坏。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000229_destroy_search', step: 'ITEM', ownerUid: playerState.uid },
      () => 'ITEM'
    );
  },
  targetSpec: {
    title: '选择破坏道具',
    description: '选择你的战场上的1张道具卡破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['ITEM'],
    controller: 'SELF',
    step: 'ITEM',
    getCandidates: (_gameState, playerState) =>
      ownItems(playerState).map(card => ({ card, source: 'ITEM' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'ITEM') {
      const item = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (item) {
        await AtomicEffectExecutor.execute(gameState, context.ownerUid || playerState.uid, { type: 'DESTROY_CARD', targetFilter: { gamecardId: item.gamecardId } }, instance);
      }
      const opponentUid = getOpponentUid(gameState, context.ownerUid || playerState.uid);
      const opponent = gameState.players[opponentUid];
      if (opponent.hand.length > 0) {
        createSelectCardQuery(
          gameState,
          opponentUid,
          opponent.hand,
          '是否舍弃手牌',
          '可以选择1张手牌舍弃。若不舍弃，对手将检索1张卡名含有《怪盗》的卡。',
          0,
          1,
          { sourceCardId: instance.gamecardId, effectId: '105000229_destroy_search', step: 'DISCARD', ownerUid: context.ownerUid || playerState.uid },
          () => 'HAND'
        );
        return;
      }
      const owner = gameState.players[context.ownerUid || playerState.uid];
      const candidates = owner.deck.filter(card => nameContains(card, '怪盗'));
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        owner.uid,
        candidates,
        '选择怪盗卡',
        '选择卡组中1张卡名含有《怪盗》的卡加入手牌。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105000229_destroy_search', step: 'SEARCH', ownerUid: owner.uid },
        () => 'DECK'
      );
      return;
    }

    if (context?.step === 'DISCARD') {
      if (selections[0]) {
        const discarded = playerState.hand.find(card => card.gamecardId === selections[0]);
        if (discarded) moveCard(gameState, playerState.uid, discarded, 'GRAVE', instance);
        return;
      }
      const owner = gameState.players[context.ownerUid];
      const candidates = owner.deck.filter(card => nameContains(card, '怪盗'));
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        owner.uid,
        candidates,
        '选择怪盗卡',
        '选择卡组中1张卡名含有《怪盗》的卡加入手牌。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105000229_destroy_search', step: 'SEARCH', ownerUid: owner.uid },
        () => 'DECK'
      );
      return;
    }

    if (context?.step !== 'SEARCH') return;
    const owner = gameState.players[context.ownerUid];
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (owner && selected?.cardlocation === 'DECK') {
      moveCard(gameState, owner.uid, selected, 'HAND', instance);
      await AtomicEffectExecutor.execute(gameState, owner.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000229
 * Card2 Row: 393
 * Card Row: 263
 * Source CardNo: BT05-Y07
 * Package: BT05(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖同名1回合1次〗{这个单位进入战场时，或这个单位从战场离开时}:将卡组中的1张ACCESS值+1以下的黄色道具卡放置到战场上。
 * 【启】〖同名1回合1次〗{选择你的战场上的1张道具卡}:将被选择的卡破坏。之后，选择1名对手，他可以选择他的1张手牌舍弃。若不舍弃，你将卡组中的1张卡名含有《怪盗》的卡加入手牌。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000229',
  fullName: '天变的魔术家「追月」',
  specialName: '追月',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2 },
  faction: '无',
  acValue: 4,
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
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT05',
  uniqueId: null as any,
};

export default card;
