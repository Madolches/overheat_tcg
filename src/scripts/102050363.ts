import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  backErosionCount,
  cardsInZones,
  createSelectCardQuery,
  nameContains,
  moveCard,
  totalErosionCount
} from './BaseUtil';

const isTrackOrExplore = (card: Card) =>
  card.id === '202000104' ||
  card.id === '202000105' ||
  card.fullName === '追迹' ||
  card.fullName === '探寻';

const hasNamedUnit = (playerState: any, text: string) =>
  playerState.unitZone.some((unit: Card | null) => !!unit && nameContains(unit, text));

const cardEffects: CardEffect[] = [{
  id: '102050363_enter_leave_search_story',
  type: 'TRIGGER',
  triggerEvent: ['CARD_ENTERED_ZONE', 'CARD_LEFT_FIELD'],
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE'],
  description: '这张卡进入战场或从战场离开时，可以将卡组或墓地中的1张《追迹》或《探寻》加入手牌。',
  condition: (_gameState, playerState, instance, event) => {
    const entered = event?.type === 'CARD_ENTERED_ZONE' &&
      event.sourceCardId === instance.gamecardId &&
      event.data?.zone === 'UNIT';
    const left = event?.type === 'CARD_LEFT_FIELD' &&
      event.sourceCardId === instance.gamecardId &&
      event.data?.sourceZone === 'UNIT';
    return (entered || left) && cardsInZones(playerState, ['DECK', 'GRAVE']).some(({ card }) => isTrackOrExplore(card));
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = cardsInZones(playerState, ['DECK', 'GRAVE']).filter(({ card }) => isTrackOrExplore(card));
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates.map(entry => entry.card),
      '选择追迹或探寻',
      '选择卡组或墓地中的1张《追迹》或《探寻》加入手牌。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '102050363_enter_leave_search_story' },
      card => card.cardlocation as any
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const selected = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (!selected || !isTrackOrExplore(selected) || !['DECK', 'GRAVE'].includes(selected.cardlocation || '')) return;
    const fromDeck = selected.cardlocation === 'DECK';
    moveCard(gameState, playerState.uid, selected, 'HAND', instance);
    if (fromDeck) await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}, {
  id: '102050363_special_win',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitGlobal: true,
  erosionTotalLimit: [10, 20],
  description: '创痕3，10+：对手卡组10张以下，己方有柯莉尔和赛利亚，放逐区《追迹》《探寻》合计8张以上时，获得游戏胜利。',
  condition: (gameState, playerState, instance) => {
    const opponentUid = gameState.playerIds.find(uid => uid !== playerState.uid);
    return instance.cardlocation === 'UNIT' &&
      backErosionCount(playerState) >= 3 &&
      totalErosionCount(playerState) >= 10 &&
      !!opponentUid &&
      gameState.players[opponentUid].deck.length <= 10 &&
      hasNamedUnit(playerState, '柯莉尔') &&
      hasNamedUnit(playerState, '赛利亚') &&
      playerState.exile.filter(isTrackOrExplore).length >= 8;
  },
  execute: async (instance, gameState, playerState) => {
    gameState.gameStatus = 2;
    gameState.winnerId = playerState.uid;
    gameState.winReason = 'BT06_R01_SPECIAL_WIN';
    gameState.winSourceCardName = instance.fullName;
    gameState.logs.push(`[特殊胜利] ${playerState.displayName} 因 [${instance.fullName}] 获得游戏胜利。`);
  }
}];

const card: Card = {
  id: '102050363',
  fullName: '追迹探寻「迪凯」',
  specialName: '迪凯',
  type: 'UNIT',
  color: 'RED',
  gamecardId: null as any,
  colorReq: { RED: 1 },
  faction: '伊列宇王国',
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
  cardPackage: 'BT06',
  uniqueId: null as any,
};

export default card;
