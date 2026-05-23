import { Card, CardEffect } from '../types/game';
import { millTop, wealthCount } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '304020067_wealth_special_win',
  type: 'TRIGGER',
  triggerEvent: 'TURN_END' as any,
  triggerLocation: ['ITEM'],
  isMandatory: true,
  description: '财富15以上，你的回合结束时：你获得这场游戏的胜利。',
  condition: (gameState, playerState, instance, event) =>
    event?.type === ('TURN_END' as any) &&
    event.playerUid === playerState.uid &&
    instance.cardlocation === 'ITEM' &&
    wealthCount(playerState, gameState) >= 15,
  execute: async (instance, gameState, playerState) => {
    gameState.gameStatus = 2;
    gameState.winnerId = playerState.uid;
    gameState.winReason = 'BT08_B09_WEALTH_SPECIAL_WIN';
    gameState.winSourceCardName = instance.fullName;
    gameState.logs.push(`[特殊胜利] ${playerState.displayName} 因 [${instance.fullName}] 获得游戏胜利。`);
  }
}, {
  id: '304020067_mill_on_opponent_deck_to_hand',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['ITEM'],
  isGlobal: true,
  isMandatory: false,
  description: '对手以抽卡以外的方式从卡组将卡加入手牌时：将那名对手的卡组顶2张卡送入墓地。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'ITEM' &&
    event?.playerUid &&
    event.playerUid !== playerState.uid &&
    event.data?.isEffect === true &&
    event.data?.sourceZone === 'DECK' &&
    event.data?.targetZone === 'HAND' &&
    event.type === 'CARD_ENTERED_ZONE',
  execute: async (instance, gameState, _playerState, event) => {
    if (!event?.playerUid) return;
    millTop(gameState, event.playerUid, 2, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 304020067
 * Card2 Row: 635
 * Card Row: 519
 * Source CardNo: BT08-B09
 * Package: BT08(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{你的财富指示物有15个以上，你的回合结束时}:你获得这场游戏的胜利。
 * 【诱】{对手以抽卡以外的方式从卡组将卡加入手牌时}:将那名对手的卡组顶的2张卡送入墓地。
 */
const card: Card = {
  id: '304020067',
  fullName: '「财富的马车」',
  specialName: '财富的马车',
  type: 'ITEM',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '九尾商会联盟',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
