import { Card, CardEffect } from '../types/game';
import { addTempDamage, ensureData, moveCard, nameContains, ownUnits } from './BaseUtil';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const cardEffects: CardEffect[] = [{
  id: '203100090_witch_night',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  erosionBackLimit: [3, 10],
  limitCount: 1,
  limitNameType: true,
  description: '创痕3：主要阶段，你的卡名含有《魔女》的单位本回合伤害+1，并获得战斗破坏送墓时横置回场的能力。',
  condition: (gameState, playerState) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    ownUnits(playerState).some(unit => nameContains(unit, '魔女')),
  execute: async (instance, gameState, playerState) => {
    ownUnits(playerState).filter(unit => nameContains(unit, '魔女')).forEach(unit => {
      addTempDamage(unit, instance, 1);
      const data = ensureData(unit);
      data.witchNightReviveTurn = gameState.turnCount;
      data.witchNightReviveSourceName = instance.fullName;
    });
  }
}, {
  id: '203100090_witch_revive',
  type: 'TRIGGER',
  triggerLocation: ['GRAVE'],
  triggerEvent: 'CARD_DESTROYED_BATTLE',
  isMandatory: true,
  isGlobal: true,
  description: '魔女之夜赋予：这个单位被战斗破坏送入墓地时，横置放置到战场。',
  condition: (gameState, playerState, instance, event) =>
    !!event?.targetCardId &&
    playerState.grave.some(card =>
      card.gamecardId === event.targetCardId &&
      (card as any).data?.witchNightReviveTurn === gameState.turnCount
    ) &&
    playerState.unitZone.some(slot => slot === null),
  execute: async (instance, gameState, playerState, event) => {
    const target = playerState.grave.find(card =>
      card.gamecardId === event?.targetCardId &&
      (card as any).data?.witchNightReviveTurn === gameState.turnCount
    );
    if (!target) return;
    moveCard(gameState, playerState.uid, target, 'UNIT', instance);
    const moved = AtomicEffectExecutor.findCardById(gameState, target.gamecardId);
    if (moved) moved.isExhausted = true;
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 203100090
 * Card2 Row: 509
 * Card Row: 332
 * Source CardNo: PR06-09G
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕3】〖同名一回合一次〗{你的主要阶段}：本回合中，你的战场上的所有卡名含有《魔女》的单位〖+1〗并获得“【诱】{这个单位被战斗破坏送入墓地时}：将这张卡以横置状态放置到战场上。”的能力。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '203100090',
  fullName: '魔女之夜',
  specialName: '',
  type: 'STORY',
  color: 'GREEN',
  gamecardId: null as any,
  colorReq: { GREEN: 1 },
  faction: '艾柯利普斯',
  acValue: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
