import { Card, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor, getOpponentUid, isNonGodUnit, millTop, moveCard, ownUnits, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('203000127_prank', '选择你的1个非神蚀单位送入墓地。之后将对手卡组顶2张送入墓地。', async () => {
}, {
  condition: (_gameState, playerState) => ownUnits(playerState).some(isNonGodUnit),
  targetSpec: {
    title: '选择送墓单位',
    description: '选择你的1个非神蚀单位送入墓地。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'TARGET',
    getCandidates: (_gameState, playerState) =>
      ownUnits(playerState)
        .filter(isNonGodUnit)
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (target?.cardlocation === 'UNIT') moveCard(gameState, playerState.uid, target, 'GRAVE', instance);
    millTop(gameState, getOpponentUid(gameState, playerState.uid), 2, instance);
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203000127
 * Card2 Row: 298
 * Card Row: 537
 * Source CardNo: BT04-G07
 * Package: BT04(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 选择你的1个非神蚀单位，将其送入墓地。之后，将对手卡组顶的2张卡送入墓地。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '203000127',
  fullName: '魔女的恶作剧',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
