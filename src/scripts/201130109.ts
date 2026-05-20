import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, ensureData, ownUnits, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('201130109_battle_shield', '选择你的战场上的1个单位，本回合中那个单位下一次将要被战斗破坏时，防止那次破坏。', async (instance, gameState, playerState) => {
  const targets = ownUnits(playerState);
  if (targets.length === 0) return;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    targets,
    '选择保护单位',
    '选择你的战场上的1个单位，本回合下一次将要被战斗破坏时防止那次破坏。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '201130109_battle_shield' },
    () => 'UNIT'
  );
}, {
  condition: (_gameState, playerState) => ownUnits(playerState).length > 0,
  targetSpec: {
    title: '选择保护单位',
    description: '选择你的战场上的1个单位，本回合下一次将要被战斗破坏时防止那次破坏。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      ownUnits(playerState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, _playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation !== 'UNIT') return;
    const data = ensureData(target);
    data.preventNextBattleDestroy = true;
    data.preventNextBattleDestroyUntilTurn = gameState.turnCount;
    data.preventNextBattleDestroySourceName = instance.fullName;
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201130109
 * Card2 Row: 573
 * Card Row: 457
 * Source CardNo: BT07-W07
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * {选择你的战场上的1个单位}：本回合中，那个单位下一次将要被战斗破坏时，防止那次破坏。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201130109',
  fullName: '防御灵盾',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: {},
  faction: '圣王国',
  acValue: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
