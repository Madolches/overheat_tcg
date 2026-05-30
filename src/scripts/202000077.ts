import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, createSelectCardQuery, getOpponentUid, markCannotDefendUntilEndOfTurn, ownUnits, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('202000077_cannot_defend', '若你的战场上有力量4500以上单位，选择对手2个单位，本回合不能宣言防御。', async (instance, gameState, playerState) => {
  const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
  const targets = ownUnits(opponent);
  createSelectCardQuery(
    gameState,
    playerState.uid,
    targets,
    '选择不能防御的单位',
    '选择对手的2个单位，本回合中不能宣言防御。',
    Math.min(2, targets.length),
    Math.min(2, targets.length),
    { sourceCardId: instance.gamecardId, effectId: '202000077_cannot_defend' },
    () => 'UNIT'
  );
}, {
  condition: (_gameState, playerState) => ownUnits(playerState).some(unit => (unit.power || 0) >= 4500),
  targetSpec: {
    title: '选择不能防御的单位',
    description: '选择对手最多2个单位，本回合中不能宣言防御。',
    minSelections: 1,
    maxSelections: 2,
    zones: ['UNIT'],
    controller: 'OPPONENT',
    getCandidates: (gameState, playerState) => {
      const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
      return ownUnits(opponent).map(card => ({ card, source: 'UNIT' as any }));
    }
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    selections.forEach(id => {
      const target = AtomicEffectExecutor.findCardById(gameState, id);
      if (target?.cardlocation === 'UNIT') markCannotDefendUntilEndOfTurn(target, instance, gameState);
    });
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 202000077
 * Card2 Row: 219
 * Card Row: 219
 * Source CardNo: BT03-R11
 * Package: BT03(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 若你的战场上没有〖力量4500〗以上的单位，不能使用这张卡。选择对手的2个单位，本回合中，不能宣言防御。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '202000077',
  fullName: '雷鸣呼啸',
  specialName: '',
  type: 'STORY',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '无',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
