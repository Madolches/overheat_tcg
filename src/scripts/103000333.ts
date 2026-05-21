import { Card, CardEffect } from '../types/game';
import {
  backErosionCount,
  createSelectCardQuery,
  exhaustCost,
  getOpponentBattlefieldNonGodCards,
  getResonanceExiledCard,
  isNonGodUnit,
  isResonanceExileEvent,
  markCannotExhaustUntil,
  moveCard,
  resonanceEffect,
  untilOpponentEndTurn
} from './BaseUtil';

const isSalalaChimeraOrTeteruUnit = (card: Card) =>
  card.type === 'UNIT' &&
  (
    card.specialName === '萨拉拉' ||
    card.specialName === '奇美拉' ||
    card.specialName === '特特鲁' ||
    card.fullName.includes('萨拉拉') ||
    card.fullName.includes('奇美拉') ||
    card.fullName.includes('特特鲁')
  );

const recoverCandidates = (playerState: any) =>
  playerState.grave.filter((card: Card) => isNonGodUnit(card) && (card.acValue || 0) <= 3);

const cardEffects: CardEffect[] = [
  resonanceEffect('103000333_resonance'),
  {
    id: '103000333_resonance_lock_recover',
    type: 'TRIGGER',
    triggerEvent: 'CARD_EXILED',
    triggerLocation: ['UNIT'],
    erosionBackLimit: [1, 10],
    description: '创痕1：这个单位的共鸣能力将「萨拉拉」「奇美拉」或「特特鲁」单位卡放逐时，可以横置自身，选择对手战场上1张非神蚀卡使其直到对手回合结束不能横置。之后，将墓地中1张AC+3以下非神蚀单位卡加入手牌。',
    condition: (gameState, playerState, instance, event) => {
      const exiled = getResonanceExiledCard(event);
      return isResonanceExileEvent(event, instance) &&
        !!exiled &&
        isSalalaChimeraOrTeteruUnit(exiled) &&
        backErosionCount(playerState) >= 1 &&
        !instance.isExhausted &&
        getOpponentBattlefieldNonGodCards(gameState, playerState.uid).length > 0;
    },
    cost: exhaustCost,
    execute: async (instance, gameState, playerState) => {
      createSelectCardQuery(
        gameState,
        playerState.uid,
        getOpponentBattlefieldNonGodCards(gameState, playerState.uid),
        '选择不能横置的卡',
        '选择对手战场上1张非神蚀卡，使其直到对手回合结束不能横置。',
        0,
        1,
        { sourceCardId: instance.gamecardId, effectId: '103000333_resonance_lock_recover', step: 'LOCK' },
        card => card.cardlocation as any
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections, context) => {
      if (context?.step === 'LOCK') {
        const target = getOpponentBattlefieldNonGodCards(gameState, playerState.uid).find(card => card.gamecardId === selections[0]);
        if (target) markCannotExhaustUntil(target, instance, untilOpponentEndTurn(gameState, playerState.uid));
        const candidates = recoverCandidates(playerState);
        if (candidates.length > 0) {
          createSelectCardQuery(
            gameState,
            playerState.uid,
            candidates,
            '选择回收单位',
            '选择墓地中1张AC+3以下非神蚀单位卡加入手牌。',
            0,
            1,
            { sourceCardId: instance.gamecardId, effectId: '103000333_resonance_lock_recover', step: 'RECOVER' },
            () => 'GRAVE'
          );
        }
        return;
      }

      if (context?.step === 'RECOVER') {
        const target = recoverCandidates(playerState).find((card: Card) => card.gamecardId === selections[0]);
        if (target) moveCard(gameState, playerState.uid, target, 'HAND', instance);
      }
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 103000333
 * Card2 Row: 455
 * Card Row: 390
 * Source CardNo: BT06-G07
 * Package: BT06(ESR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】共鸣（〖1回合1次〗｛你的主要阶段，选择你的墓地中的1张卡｝：将被选择的卡放逐）。
 * 【创痕1】【诱】｛这个单位的共鸣能力将「萨拉拉」或「奇美拉」或「特特鲁」的单位卡放逐时，你可以选择对手战场上的1张非神蚀卡｝[〖横置〗]：被选择的卡直到对手回合结束为止不能〖横置〗。之后，将你墓地中的1张ACCESS值+3以下的非神蚀单位卡加入手牌。
 */
const card: Card = {
  id: '103000333',
  fullName: '瑟族少女「萨拉拉」',
  specialName: '萨拉拉',
  type: 'UNIT',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '无',
  acValue: 2,
  power: 1000,
  basePower: 1000,
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
  rarity: 'SER',
  availableRarities: ['SER'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
