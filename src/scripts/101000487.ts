import { Card, CardEffect } from '../types/game';
import { addTempKeyword, addTempPower, canActivateDefaultTiming, createChoiceQuery, createSelectCardQuery, moveCard, ownUnits } from './BaseUtil';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const cardEffects: CardEffect[] = [{
  id: '101000487_grave_exile_boost',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：将墓地3张卡放逐，选择本回合获得【英勇】或力量+500。',
  condition: (gameState, playerState, instance) =>
    canActivateDefaultTiming(gameState, playerState) &&
    instance.cardlocation === 'UNIT' &&
    playerState.grave.length >= 3,
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      playerState.grave,
      '选择放逐的墓地卡',
      '选择墓地中的3张卡放逐作为费用。',
      3,
      3,
      { sourceCardId: instance.gamecardId, effectId: '101000487_grave_exile_boost', step: 'COST' },
      () => 'GRAVE'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'COST') {
      selections
        .map(id => AtomicEffectExecutor.findCardById(gameState, id))
        .filter((card): card is Card => !!card && card.cardlocation === 'GRAVE')
        .forEach(card => moveCard(gameState, playerState.uid, card, 'EXILE', instance));
      createChoiceQuery(
        gameState,
        playerState.uid,
        '选择效果',
        '选择「获得【英勇】」或「力量+500」。',
        [
          { id: 'HEROIC', label: '获得【英勇】' },
          { id: 'POWER', label: '力量+500' }
        ],
        { sourceCardId: instance.gamecardId, effectId: '101000487_grave_exile_boost', step: 'CHOICE' }
      );
      return;
    }

    const live = ownUnits(playerState).find(unit => unit.gamecardId === instance.gamecardId);
    if (!live) return;
    if (selections[0] === 'HEROIC') addTempKeyword(live, instance, 'heroic');
    if (selections[0] === 'POWER') addTempPower(live, instance, 500);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101000487
 * Card2 Row: 277
 * Card Row: 633
 * Source CardNo: PR02-01W
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】〖1回合1次〗:[将你墓地中的3张卡放逐]你选择下列的1项效果并执行。
 * 本回合中，这个单位获得【英勇】。
 * 本回合中，这个单位〖力量+500〗。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101000487',
  fullName: '雪原狮鹫',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '无',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  isHeroic: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
