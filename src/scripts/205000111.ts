import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  allCardsOnField,
  createSelectCardQuery,
  destroyByEffect,
  isVirtualGodMarkReveal,
  moveCard,
  revealDeckCards,
  story
} from './BaseUtil';

const cardEffects: CardEffect[] = [story(
  '205000111_puppet_party',
  '创痕1：选择战场1张卡，公开卡组顶5张。若公开的卡中有神蚀卡，破坏目标。之后放逐这张卡并洗切卡组。',
  async (instance, gameState, playerState) => {
    const candidates = allCardsOnField(gameState);
    if (candidates.length === 0 || playerState.deck.length < 5) return;
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择宴会目标',
      '选择战场上的1张卡。公开卡组顶5张，若其中有神蚀卡则破坏目标。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '205000111_puppet_party', step: 'TARGET' },
      card => card.cardlocation as any
    );
  },
  {
    erosionBackLimit: [1, 10],
    condition: (gameState, playerState) =>
      allCardsOnField(gameState).length > 0 &&
      playerState.deck.length >= 5,
    targetSpec: {
      title: '选择宴会目标',
      description: '选择战场上的1张卡。公开卡组顶5张，若其中有神蚀卡则破坏目标。',
      minSelections: 1,
      maxSelections: 1,
      zones: ['UNIT', 'ITEM'],
      controller: 'ANY',
      step: 'TARGET',
      getCandidates: gameState =>
        allCardsOnField(gameState).map(card => ({ card, source: card.cardlocation as any }))
    },
    onQueryResolve: async (instance, gameState, playerState, selections, context) => {
      if (context?.step !== 'TARGET') return;
      const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
      const revealed = revealDeckCards(gameState, playerState.uid, 5, instance);
      if (target && ['UNIT', 'ITEM'].includes(target.cardlocation || '') && revealed.some(card => isVirtualGodMarkReveal(gameState, card))) {
        destroyByEffect(gameState, target, instance);
      }
      const liveSelf = AtomicEffectExecutor.findCardById(gameState, instance.gamecardId);
      if (liveSelf?.cardlocation === 'PLAY') {
        moveCard(gameState, playerState.uid, liveSelf, 'EXILE', instance);
      }
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
)];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 205000111
 * Card2 Row: 583
 * Card Row: 467
 * Source CardNo: BT07-Y06
 * Package: BT07(SR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【创痕1】〖同名1回合1次〗{选择战场上的1张卡}:公开你卡组顶的5张卡。若你公开的卡中有神蚀卡，将被选择的卡破坏。将这张卡放逐，将被公开的卡按原样放回，将你的卡组洗切。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '205000111',
  fullName: '魔导人偶的宴会',
  specialName: '',
  type: 'STORY',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '无',
  acValue: 1,
  godMark: true,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'SR',
  availableRarities: ['SR'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
