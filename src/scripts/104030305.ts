import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canPutCardOntoBattlefieldByEffect, createChoiceQuery, faceUpErosion, moveCard, putCardOntoField } from './BaseUtil';

const playableOrRecoverableErosion = (playerState: any) =>
  faceUpErosion(playerState).filter(card =>
    card.type !== 'STORY'
  );

const wasOwnUnitExiledByOpponentEffect = (event: any, playerState: any) =>
  event?.type === 'CARD_EXILED' &&
  event.playerUid === playerState.uid &&
  event.sourceCard?.type === 'UNIT' &&
  event.data?.sourceZone === 'UNIT' &&
  event.data?.targetZone === 'EXILE' &&
  event.data?.isEffect === true &&
  !!event.data?.effectSourcePlayerUid &&
  event.data.effectSourcePlayerUid !== playerState.uid;

const cardEffects: CardEffect[] = [{
  id: '104030305_recover_after_own_unit_exiled',
  type: 'TRIGGER',
  isMandatory: true,
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_EXILED',
  limitCount: 1,
  description: '1回合1次：你的单位由于对手卡的效果从战场被放逐时，选择你正面侵蚀区1张卡，加入手牌或放置到战场。',
  condition: (_gameState, playerState, _instance, event) =>
    wasOwnUnitExiledByOpponentEffect(event, playerState) &&
    playableOrRecoverableErosion(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(
        gameState,
        playerState.uid,
        playableOrRecoverableErosion(playerState).map(card => ({ card, source: 'EROSION_FRONT' as const }))
      ),
      title: '选择侵蚀区卡',
      description: '选择你正面侵蚀区的1张卡。',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: { sourceCardId: instance.gamecardId, effectId: '104030305_recover_after_own_unit_exiled', step: 'TARGET' }
    };
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'TARGET') {
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      if (!target || target.cardlocation !== 'EROSION_FRONT' || target.displayState !== 'FRONT_UPRIGHT') return;
      const options = [{ id: 'HAND', label: '加入手牌' }];
      if (canPutCardOntoBattlefieldByEffect(playerState, target)) options.push({ id: 'FIELD', label: '放置到战场' });
      createChoiceQuery(
        gameState,
        playerState.uid,
        '选择移动方式',
        '选择将被选择的卡加入手牌或放置到战场。',
        options,
        { sourceCardId: instance.gamecardId, effectId: '104030305_recover_after_own_unit_exiled', step: 'MODE', targetId: target.gamecardId }
      );
      return;
    }

    if (context?.step !== 'MODE') return;
    const target = AtomicEffectExecutor.findCardById(gameState, context.targetId);
    if (!target || target.cardlocation !== 'EROSION_FRONT' || target.displayState !== 'FRONT_UPRIGHT') return;
    if (selections[0] === 'FIELD' && canPutCardOntoBattlefieldByEffect(playerState, target)) {
      putCardOntoField(gameState, playerState.uid, target, instance);
      return;
    }
    moveCard(gameState, playerState.uid, target, 'HAND', instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104030305
 * Card2 Row: 535
 * Card Row: 355
 * Source CardNo: BT07-B02
 * Package: BT07(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】〖1回合1次〗{你的单位由于对手的卡的效果从战场上被放逐时，选择你侵蚀区中的1张正面卡}：将被选择的卡加入手牌或放置到战场上。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '104030305',
  fullName: '少女魔法使「爱莎」',
  specialName: '爱莎',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '冒险家公会',
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
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
