import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { canPutItemOntoBattlefield, canPutUnitOntoBattlefield, createSelectCardQuery, faceUpErosion, getOpponentUid, moveCardAsCost, ownUnits, putUnitOntoField } from './BaseUtil';

const isYellowNonGodFieldCard = (playerState: any, card: Card) =>
  card.color === 'YELLOW' &&
  !card.godMark &&
  (
    (card.type === 'UNIT' && canPutUnitOntoBattlefield(playerState, card)) ||
    (card.type === 'ITEM' && canPutItemOntoBattlefield(playerState, card))
  );

const cardEffects: CardEffect[] = [{
  id: '105110480_enter_put_yellow',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
  description: '进入战场时，若对手单位比你多2个以上，将2张黄色正面侵蚀送墓，从卡组放置1张黄色非神蚀卡。',
  condition: (gameState, playerState, instance, event?: GameEvent) => {
    if (event?.sourceCardId !== instance.gamecardId || event.data?.zone !== 'UNIT') return false;
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    return ownUnits(opponent).length >= ownUnits(playerState).length + 2 &&
      faceUpErosion(playerState).filter(card => card.color === 'YELLOW').length >= 2 &&
      playerState.deck.some(card => isYellowNonGodFieldCard(playerState, card));
  },
  cost: async (gameState, playerState, instance) => {
    const candidates = faceUpErosion(playerState).filter(card => card.color === 'YELLOW');
    if (candidates.length < 2) return false;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择黄色侵蚀',
      '选择侵蚀区中的2张黄色正面卡送入墓地作为费用。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '105110480_enter_put_yellow', costType: 'EROSION_COST' },
      () => 'EROSION_FRONT'
    );
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      faceUpErosion(playerState).filter(card => card.color === 'YELLOW'),
      '选择黄色侵蚀',
      '选择侵蚀区中的2张黄色正面卡送入墓地作为费用。',
      2,
      2,
      { sourceCardId: instance.gamecardId, effectId: '105110480_enter_put_yellow', step: 'COST' },
      () => 'EROSION_FRONT'
    );
  },
  targetSpec: {
    title: '选择黄色非神蚀卡',
    description: '选择卡组中的1张黄色非神蚀卡放置到战场上。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['DECK'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      playerState.deck
        .filter(card => isYellowNonGodFieldCard(playerState, card))
        .map(card => ({ card, source: 'DECK' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.costType === 'EROSION_COST') {
      const selected = selections
        .map(id => playerState.erosionFront.find(entry => entry?.gamecardId === id && entry.color === 'YELLOW' && entry.displayState === 'FRONT_UPRIGHT'))
        .filter((card: Card | undefined): card is Card => !!card);
      if (selected.length !== 2) {
        context.cancelActivation = true;
        return;
      }
      selected.forEach(card => moveCardAsCost(gameState, playerState.uid, card, 'GRAVE', instance));
      return;
    }

    if (context?.step === 'COST') {
      selections.forEach(id => {
        const card = playerState.erosionFront.find(entry => entry?.gamecardId === id && entry.color === 'YELLOW' && entry.displayState === 'FRONT_UPRIGHT');
        if (card) moveCardAsCost(gameState, playerState.uid, card, 'GRAVE', instance);
      });
      const targets = playerState.deck.filter(card => isYellowNonGodFieldCard(playerState, card));
      if (targets.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        targets,
        '选择黄色非神蚀卡',
        '选择卡组中的1张黄色非神蚀卡放置到战场上。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105110480_enter_put_yellow', step: 'TARGET' },
        () => 'DECK'
      );
      return;
    }
    if (context?.step === 'TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || target.cardlocation !== 'DECK' || target.color !== 'YELLOW' || target.godMark) return;
      if (target.type === 'UNIT') {
        putUnitOntoField(gameState, playerState.uid, target, instance);
      } else if (target.type === 'ITEM' && canPutItemOntoBattlefield(playerState, target)) {
        AtomicEffectExecutor.moveCard(gameState, playerState.uid, 'DECK', playerState.uid, 'ITEM', target.gamecardId, true);
      }
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105110480
 * Card2 Row: 267
 * Card Row: 623
 * Source CardNo: SP01-Y01
 * Package: SP01(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖将你的侵蚀区中的2张黄色正面卡送入墓地〗这个单位进入战场时，若对手场上的单位比你的单位多2个以上，从你的卡组中选择1张黄色非神蚀卡，将其放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105110480',
  fullName: '拂风迎新「遂汐」',
  specialName: '遂汐',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '学院要塞',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
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
  cardPackage: 'SP01',
  uniqueId: null as any,
};

export default card;
