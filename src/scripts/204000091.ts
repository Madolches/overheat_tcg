import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { allUnitsOnField, createSelectCardQuery, silenceAllNonKeywordEffectsUntilOwnStart, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('204000091_meditation', '同名1回合1次：选择战场上的1个单位，抽1张卡，将其横置，并直到下次你的回合开始失去所有能力。', async (instance, gameState, playerState) => {
  createSelectCardQuery(
    gameState,
    playerState.uid,
    allUnitsOnField(gameState),
    '选择冥想目标',
    '选择战场上的1个单位，抽1张卡，将其横置，并直到下次你的回合开始失去所有能力。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '204000091_meditation' },
    () => 'UNIT'
  );
}, {
  limitCount: 1,
  limitNameType: true,
  condition: gameState => allUnitsOnField(gameState).length > 0,
  targetSpec: {
    title: '选择冥想目标',
    description: '选择战场上的1个单位。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    getCandidates: gameState =>
      allUnitsOnField(gameState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target || target.cardlocation !== 'UNIT') return;
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'DRAW', value: 1 }, instance);
    if (!target.isExhausted) target.isExhausted = true;
    silenceAllNonKeywordEffectsUntilOwnStart(target, instance, playerState.uid);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 204000091
 * Card2 Row: 540
 * Card Row: 360
 * Source CardNo: BT07-B07
 * Package: BT07(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 〖同名一回合一次〗{选择战场上的1个单位}：抽1张卡。将被选择的单位横置。直到下一次你的回合开始时为止，被选择的单位失去所有能力。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '204000091',
  fullName: '冥想',
  specialName: '',
  type: 'STORY',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 0,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
