import { Card, CardEffect, TriggerLocation } from '../types/game';
import { addInfluence, allCardsOnField, createSelectCardQuery, destroyByEffect, ensureData, erosionCost, getOpponentUid, millTop, moveCard } from './BaseUtil';

const applyTenForm = (instance: Card) => {
  instance.temporaryPowerBuff = 4000 - (instance.basePower ?? 0);
  instance.temporaryDamageBuff = 4 - (instance.baseDamage ?? 0);
  instance.temporaryHeroic = true;
  instance.temporaryBuffSources = {
    ...(instance.temporaryBuffSources || {}),
    power: instance.fullName,
    damage: instance.fullName,
    heroic: instance.fullName
  };
  instance.temporaryBuffDetails = {
    ...(instance.temporaryBuffDetails || {}),
    power: [{ sourceCardName: instance.fullName, value: instance.temporaryPowerBuff }]
  };
};

const cardEffects: CardEffect[] = [{
    id: '101140098_start',
    type: 'TRIGGER',
    triggerEvent: 'PHASE_CHANGED',
    isMandatory: true,
    triggerLocation: ['UNIT'],
    description: '你的回合开始时，将墓地1张卡放到卡组底。之后将对手卡组顶1张送入墓地。',
    condition: (_gameState, playerState, _instance, event) =>
      playerState.isTurn &&
      event?.data?.phase === 'START' &&
      playerState.grave.length > 0,
    execute: async (instance, gameState, playerState) => {
      createSelectCardQuery(
        gameState,
        playerState.uid,
        playerState.grave,
        '选择放回卡组底的卡',
        '选择你的墓地中的1张卡，放置到卡组底。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '101140098_start' },
        () => 'GRAVE'
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      const graveCard = playerState.grave.find(card => card.gamecardId === selections[0]);
      if (graveCard) moveCard(gameState, playerState.uid, graveCard, 'DECK', instance, { insertAtBottom: true });
      millTop(gameState, getOpponentUid(gameState, playerState.uid), 1, instance);
    }
  }, {
    id: '101140098_ten_destroy',
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    limitCount: 1,
    erosionFrontLimit: [2, 10],
    erosionTotalLimit: [10, 10],
    description: '10+，侵蚀2：选择战场上1张卡破坏。',
    cost: erosionCost(2),
    targetSpec: {
      title: '选择破坏对象',
      description: '选择战场上的1张卡，将其破坏。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT', 'ITEM'],
      controller: 'ANY',
      getCandidates: (gameState, _playerState, instance) =>
        allCardsOnField(gameState)
          .filter(card => card.gamecardId !== instance.gamecardId)
          .map(card => ({ card, source: card.cardlocation as any }))
    },
    execute: async (instance, gameState, playerState) => {
      const candidates = allCardsOnField(gameState).filter(card => card.gamecardId !== instance.gamecardId);
      if (candidates.length === 0) return;
      createSelectCardQuery(
        gameState,
        playerState.uid,
        candidates,
        '选择破坏对象',
        '选择战场上的1张卡，将其破坏。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '101140098_ten_destroy' },
        card => card.cardlocation || 'UNIT'
      );
    },
    onQueryResolve: async (instance, gameState, _playerState, selections) => {
      const target = allCardsOnField(gameState).find(card => card.gamecardId === selections[0]);
      if (target) destroyByEffect(gameState, target, instance);
    }
  }, {
    id: '101140098_ten_form',
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    limitCount: 1,
    erosionFrontLimit: [2, 10],
    erosionTotalLimit: [10, 10],
    description: '10+，侵蚀2：直到下一次你的回合结束，此单位变为伤害4、力量4000并获得英勇。',
    cost: erosionCost(2),
    execute: async (instance, gameState, playerState) => {
      const data = ensureData(instance);
      data.tenFormActive = true;
      data.tenFormActivatedTurn = gameState.turnCount;
      data.tenFormOwnerUid = playerState.uid;
      data.tenFormSourceName = instance.fullName;
      applyTenForm(instance);
    }
  }, {
    id: '101140098_ten_form_continuous',
    type: 'CONTINUOUS',
    triggerLocation: ['UNIT'],
    description: '愤怒：伤害4、力量4000并获得英勇。',
    applyContinuous: (_gameState, instance) => {
      if (!ensureData(instance).tenFormActive) return;
      applyTenForm(instance);
    }
  }, {
    id: '101140098_ten_form_clear',
    type: 'TRIGGER',
    triggerEvent: 'TURN_END' as any,
    triggerLocation: ['UNIT'],
    isMandatory: true,
    description: '你的回合结束时，平静。',
    condition: (gameState, playerState, instance, event) =>
      event?.playerUid === playerState.uid &&
      ensureData(instance).tenFormActive &&
      ensureData(instance).tenFormOwnerUid === playerState.uid &&
      gameState.turnCount > ensureData(instance).tenFormActivatedTurn,
    execute: async instance => {
      const data = ensureData(instance);
      delete data.tenFormActive;
      delete data.tenFormActivatedTurn;
      delete data.tenFormOwnerUid;
      delete data.tenFormSourceName;
      instance.temporaryPowerBuff = 0;
      instance.temporaryDamageBuff = 0;
      instance.temporaryHeroic = false;
      instance.isHeroic = instance.baseHeroic ?? false;
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101140098
 * Card2 Row: 58
 * Card Row: 58
 * Source CardNo: BT01-W03
 * Package: BT01(SR,ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】:你的回合开始时，选择你的墓地中的1张卡，放置到卡组底。之后，选择1名对手，将他的卡组顶的1张卡送入墓地。
 * 〖10+〗 【启】〖1回合1次〗:〖[侵蚀2〗]选择战场上的1张卡，将其破坏。
 * 〖10+〗【启】〖1回合1次〗:〖[侵蚀2〗]直到下一次你的回合结束时为止，这个单位变为〖伤害4〗〖力量4000〗并获得【英勇】。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101140098',
  fullName: '天翼的审判官「丝梅特」',
  specialName: '丝梅特',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 2 },
  faction: '女神教会',
  acValue: 2,
  power: 0,
  basePower: 0,
  damage: 0,
  baseDamage: 0,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
