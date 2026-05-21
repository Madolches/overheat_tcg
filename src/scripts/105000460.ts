import { Card, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { createSelectCardQuery, getOpponentUid } from './BaseUtil';

const effect_105000460_enter_discard: CardEffect = {
  id: '105000460_enter_discard',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  limitCount: 1,
  limitNameType: true,
  erosionBackLimit: [2, 10],
  description: '创痕2：这个单位进入战场时，若对手手牌有2张以上，对手选择1张手牌舍弃。',
  condition: (gameState, playerState, instance, event?: GameEvent) => {
    if (
      instance.cardlocation !== 'UNIT' ||
      event?.type !== 'CARD_ENTERED_ZONE' ||
      event.sourceCardId !== instance.gamecardId ||
      event.data?.zone !== 'UNIT'
    ) {
      return false;
    }

    const opponentUid = getOpponentUid(gameState, playerState.uid);
    return gameState.players[opponentUid]?.hand.length >= 2;
  },
  execute: async (instance, gameState, playerState) => {
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    const opponent = gameState.players[opponentUid];
    if (!opponent || opponent.hand.length < 2) return;

    createSelectCardQuery(
      gameState,
      opponentUid,
      [...opponent.hand],
      '选择舍弃手牌',
      '选择你的1张手牌舍弃。',
      1,
      1,
      {
        sourceCardId: instance.gamecardId,
        effectId: '105000460_enter_discard',
        discardPlayerUid: opponentUid
      },
      () => 'HAND'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.effectId !== '105000460_enter_discard' || selections.length === 0) return;
    const discardPlayerUid = context.discardPlayerUid || getOpponentUid(gameState, playerState.uid);
    await AtomicEffectExecutor.execute(gameState, discardPlayerUid, {
      type: 'DISCARD_CARD',
      targetFilter: { gamecardId: selections[0] }
    }, instance);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000460
 * Card2 Row: 349
 * Card Row: 587
 * Source CardNo: PR04-02Y
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 诱发效果，卡名一回合一次，这个单位进入战场时，创痕2：如果对手手牌有2张或以上，对手选择一张手牌丢弃
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '105000460',
  fullName: '怪盗少女',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 3,
  power: 2500,
  basePower: 2500,
  damage: 2,
  baseDamage: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105000460_enter_discard],
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
