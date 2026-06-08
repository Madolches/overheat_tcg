import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, discardHandCost, wealthContinuous, wealthCount } from './BaseUtil';

const findOpponentNonGodPlay = (gameState: any, playerUid: string) => {
  const opponentUid = gameState.playerIds.find((uid: string) => uid !== playerUid);
  if (!opponentUid) return undefined;
  return gameState.counterStack?.slice().reverse().find((item: any) =>
    item.type === 'PLAY' &&
    item.ownerUid === opponentUid &&
    item.card &&
    !item.card.godMark &&
    !item.isNegated &&
    gameState.players[item.ownerUid]?.uncounterableActionsTurn !== gameState.turnCount &&
    gameState.players[item.ownerUid]?.cardEffectsCannotBeNegatedTurn !== gameState.turnCount
  );
};

const cardEffects: CardEffect[] = [
  wealthContinuous('104020337_wealth_1', 1),
  {
    id: '104020337_counter_take',
    type: 'ACTIVATE',
    triggerLocation: ['UNIT'],
    limitCount: 1,
    limitNameType: true,
    description: '财富3以上，对手宣言使用非神蚀卡时，舍弃3张手牌：反击那张卡。之后，将那张卡加入你的手牌；被送去墓地时回到持有者墓地。',
    condition: (gameState, playerState) =>
      gameState.phase === 'COUNTERING' &&
      wealthCount(playerState, gameState) >= 3 &&
      playerState.hand.length >= 3 &&
      !!findOpponentNonGodPlay(gameState, playerState.uid),
    cost: discardHandCost(3),
    execute: async (instance, gameState, playerState) => {
      const stackItem = findOpponentNonGodPlay(gameState, playerState.uid);
      if (!stackItem?.card) return;
      stackItem.isNegated = true;
      const target = AtomicEffectExecutor.findCardById(gameState, stackItem.card.gamecardId) || stackItem.card;
      const ownerUid = AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) || stackItem.ownerUid;
      if (target.cardlocation === 'PLAY') {
        AtomicEffectExecutor.moveCard(gameState, ownerUid, 'PLAY', playerState.uid, 'HAND', target.gamecardId, true, {
          effectSourcePlayerUid: playerState.uid,
          effectSourceCardId: instance.gamecardId
        });
      }
      const taken = AtomicEffectExecutor.findCardById(gameState, target.gamecardId);
      if (taken) {
        gameState.logs.push(`[${instance.fullName}] 这张卡之后若进入墓地，应回到原持有者 ${gameState.players[ownerUid]?.displayName || ownerUid} 的墓地。`);
      }
      gameState.logs.push(`[${instance.fullName}] 反击了 [${target.fullName}] 并将其加入手牌。`);
    }
  }
];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 104020337
 * Card2 Row: 462
 * Card Row: 397
 * Source CardNo: BT06-B03
 * Package: BT06(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】财富1（只要这个单位在战场上，你获得1个财富指示物）。
 * 【启】〖同名1回合1次〗{你的财富指示物3个以上，对手宣言使用非神蚀卡时 }（舍弃三张手牌）：反击那张卡。之后，将那张卡加入你的手牌。被送去墓地时回到持有者的墓地
 */
const card: Card = {
  id: '104020337',
  fullName: '变装丽人「洛·李斯」',
  specialName: '洛·李斯',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: { BLUE: 1 },
  faction: '九尾商会联盟',
  acValue: 3,
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
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
