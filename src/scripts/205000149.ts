import { Card, CardEffect } from '../types/game';
import {
  allUnitsOnField,
  destroyByEffect,
  getOpponentUid,
  isNonGodUnit,
  isVirtualGodMarkReveal,
  shuffleAndRevealTopCards
} from './BaseUtil';

const lowPowerNonGodUnit = (card: Card) =>
  isNonGodUnit(card) && (card.power ?? card.basePower ?? 0) <= 2000;

const effect_205000149_chocolate: CardEffect = {
  id: '205000149_chocolate',
  type: 'ACTIVATE',
  triggerLocation: ['PLAY'],
  description: '将你的卡组洗切，公开卡组顶1张卡。若为神蚀卡，破坏对手力量2000以下非神蚀单位；若为非神蚀单位卡，破坏所有玩家力量2000以下非神蚀单位。公开卡按原样放回。',
  execute: async (instance, gameState, playerState) => {
    const revealed = (await shuffleAndRevealTopCards(gameState, playerState.uid, 1, instance))[0];
    if (!revealed) return;

    const revealedAsGodMark = isVirtualGodMarkReveal(gameState, revealed);
    const targets = revealedAsGodMark
      ? gameState.players[getOpponentUid(gameState, playerState.uid)].unitZone
          .filter((unit): unit is Card => !!unit && lowPowerNonGodUnit(unit))
      : revealed.type === 'UNIT' && !revealedAsGodMark
        ? allUnitsOnField(gameState).filter(lowPowerNonGodUnit)
        : [];

    targets.forEach(target => destroyByEffect(gameState, target, instance));
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 205000149
 * Card2 Row: 268
 * Card Row: 624
 * Source CardNo: SP01-Y02
 * Package: SP01(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 将你的卡组洗切，公开你的卡组顶的1张卡。若那张卡是神蚀卡，将对手战场上的〖力量2000〗以下的所有非神蚀单位破坏；若那张卡是非神蚀单位卡，将所有玩家战场上的〖力量2000〗以下的所有非神蚀单位破坏。将公开的那张卡按原样放回。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '205000149',
  fullName: '魔偶姬的巧克力',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 3 },
  faction: '无',
  acValue: 4,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_205000149_chocolate],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
