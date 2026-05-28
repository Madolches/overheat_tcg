import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, attackingUnits, createSelectCardQuery, isBattleFreeContext, moveCard, ownerUidOf, story } from './BaseUtil';

const cardEffects: CardEffect[] = [story('201000058_bottom_attacker', '创痕2：选择1个参与攻击的单位放置到其持有者卡组底。若其是神蚀单位，其持有者选择墓地2张卡放置到卡组底。', async (instance, gameState, playerState) => {
  const targets = attackingUnits(gameState);
  if (targets.length === 0) return;
  createSelectCardQuery(
    gameState,
    playerState.uid,
    targets,
    '选择攻击单位',
    '选择战场上的1个参与攻击的单位，将其放置到其持有者的卡组底。',
    1,
    1,
    { sourceCardId: instance.gamecardId, effectId: '201000058_bottom_attacker', step: 'ATTACKER' }
  );
}, {
  erosionBackLimit: [2, 10],
  condition: gameState => isBattleFreeContext(gameState) && attackingUnits(gameState).length > 0,
  targetSpec: {
    title: '选择攻击单位',
    description: '选择战场上的1个参与攻击的单位，将其放置到其持有者的卡组底。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'ANY',
    step: 'ATTACKER',
    getCandidates: gameState =>
      attackingUnits(gameState).map(card => ({ card, source: 'UNIT' as any }))
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.step === 'GRAVE_BOTTOM') {
      selections.forEach(id => {
        const card = playerState.grave.find(candidate => candidate.gamecardId === id);
        if (card) moveCard(gameState, playerState.uid, card, 'DECK', instance, { insertAtBottom: true });
      });
      return;
    }
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!target) return;
    const ownerUid = ownerUidOf(gameState, target);
    const wasGod = target.godMark;
    if (!ownerUid) return;
    moveCard(gameState, ownerUid, target, 'DECK', instance, { insertAtBottom: true });
    const owner = gameState.players[ownerUid];
    if (wasGod && owner.grave.length > 0) {
      const count = Math.min(2, owner.grave.length);
      createSelectCardQuery(
        gameState,
        ownerUid,
        owner.grave,
        '选择放回卡组底的墓地卡',
        `选择墓地中的${count}张卡，放置到卡组底。`,
        count,
        count,
        { sourceCardId: instance.gamecardId, effectId: '201000058_bottom_attacker', step: 'GRAVE_BOTTOM' },
        () => 'GRAVE'
      );
    }
  }
})];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000058
 * Card2 Row: 152
 * Card Row: 152
 * Source CardNo: BT02-W12
 * Package: BT02(U)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕2】选择战场上的1个参与攻击的单位，将其放置到其持有者的卡组底。之后，若那个单位是神蚀单位，其持有者选择他的墓地中的2张卡，放置到卡组底。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201000058',
  fullName: '戒律',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
