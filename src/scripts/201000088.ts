import { Card, CardEffect } from '../types/game';
import { getOpponentUid, isBattleFreeContext, preventNextBattleDamageUpTo } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '201000088_prevent_battle_damage',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description: '对手的战斗自由步骤：防止这次战斗中你受到的3点以下战斗伤害。',
  condition: (gameState, playerState) =>
    isBattleFreeContext(gameState) &&
    gameState.players[getOpponentUid(gameState, playerState.uid)]?.isTurn,
  execute: async (instance, gameState, playerState) => {
    preventNextBattleDamageUpTo(playerState, instance, 3, gameState);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 201000088
 * Card2 Row: 505
 * Card Row: 329
 * Source CardNo: PR06-02W
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * {对手的战斗自由步骤}：防止这次战斗中你受到的3点以下的战斗伤害。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '201000088',
  fullName: '救赎',
  specialName: '',
  type: 'STORY',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '无',
  acValue: 1,
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
