import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, canActivateDefaultTiming, createSelectCardQuery, ensureDeckHasCardsForMove, getOpponentUid, getTopDeckCards, millTop, moveCard, nameContains, ownUnits } from './BaseUtil';

const isWitchName = (card: Card) => nameContains(card, '魔女') || !!ensureDataSafe(card).extraNameContainsWitchBy;
const ensureDataSafe = (card: Card) => ((card as any).data || {});

const cardEffects: CardEffect[] = [{
  id: '103000425_opponent_start_mill',
  type: 'TRIGGER',
  triggerEvent: 'PHASE_CHANGED',
  triggerLocation: ['UNIT'],
  isMandatory: true,
  description: '对手每个回合开始时，将对手卡组顶X张送入墓地，X为你的其他卡名含有《魔女》的单位数。',
  condition: (_gameState, playerState, instance, event) =>
    event?.data?.phase === 'START' &&
    event.playerUid !== playerState.uid &&
    ownUnits(playerState).some(unit => unit.gamecardId !== instance.gamecardId && isWitchName(unit)),
  execute: async (instance, gameState, playerState) => {
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    const count = ownUnits(playerState).filter(unit => unit.gamecardId !== instance.gamecardId && isWitchName(unit)).length;
    if (count > 0) millTop(gameState, opponentUid, count, instance);
  }
}, {
  id: '103000425_ten_copy_story',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  erosionTotalLimit: [10, 10],
  limitCount: 1,
  limitGlobal: true,
  description: '10+ 1游戏1次：选择墓地中1张卡名含有《魔女》的故事卡放逐，处理那张卡的效果。',
  condition: (gameState, playerState) =>
    canActivateDefaultTiming(gameState, playerState) &&
    playerState.grave.some(card => card.type === 'STORY' && nameContains(card, '魔女')),
  targetSpec: {
    title: '选择魔女故事',
    description: '选择墓地中1张卡名含有《魔女》的故事卡放逐，并处理其效果。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['GRAVE'],
    controller: 'SELF',
    getCandidates: (_gameState, playerState) =>
      playerState.grave
        .filter(card => card.type === 'STORY' && nameContains(card, '魔女'))
        .map(card => ({ card, source: 'GRAVE' as any }))
  },
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(gameState, playerState.uid, playerState.grave.filter(card => card.type === 'STORY' && nameContains(card, '魔女')), '选择魔女故事', '选择墓地中1张卡名含有《魔女》的故事卡放逐，并处理其效果。', 1, 1, {
      sourceCardId: instance.gamecardId,
      effectId: '103000425_ten_copy_story'
    }, () => 'GRAVE');
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || selected.cardlocation !== 'GRAVE') return;
    const copiedEffect = selected.effects?.find(effect => effect.type === 'ACTIVATE');
    moveCard(gameState, playerState.uid, selected, 'EXILE', instance);
    if (copiedEffect) {
      const originalColorReq = { ...(selected.colorReq || {}) };
      const originalAcValue = selected.acValue;
      selected.colorReq = {};
      selected.acValue = 0;
      try {
        if (copiedEffect.atomicEffects) {
          for (const atomic of copiedEffect.atomicEffects) {
            await AtomicEffectExecutor.execute(gameState, playerState.uid, atomic, selected);
          }
        }
        if (copiedEffect.execute) {
          await copiedEffect.execute(selected, gameState, playerState);
        }
      } finally {
        selected.colorReq = originalColorReq;
        selected.acValue = originalAcValue;
      }
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000425
 * Card2 Row: 295
 * Card Row: 534
 * Source CardNo: BT04-G04
 * Package: BT04(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】：对手的每个回合开始时，将对手卡组顶的X张卡送入墓地（X为你的战场上的这个单位以外的卡名含有《魔女》的单位数。
 * 〖10+〗【启】〖1游戏1次〗:选择你的墓地中的1张卡名含有《魔女》的故事卡，将其放逐。之后，将那张卡的效果当做这个能力的效果并处理（不产生对抗）。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '103000425',
  fullName: '黄昏的魔女「爱丽丝」',
  specialName: '爱丽丝',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 2 },
  faction: '无',
  acValue: 3,
  power: 2500,
  basePower: 2500,
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
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
