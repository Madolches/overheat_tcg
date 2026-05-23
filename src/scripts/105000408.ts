import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { getOpponentUid, millTop, moveCard } from './BaseUtil';

const hasRequiredHighAlchemy = (instance: Card, color: string) => {
  const data = (instance as any).data || {};
  return data.enteredFromDeckByAlchemyTurn !== undefined &&
    Array.isArray(data.highAlchemyMaterialColors) &&
    data.highAlchemyMaterialColors.includes(color);
};

const cardEffects: CardEffect[] = [{
  id: '105000408_high_alchemy_green_gate',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '这张卡只能通过《高位炼金》的效果将包含绿色卡的3张卡送入墓地而进入战场。',
  condition: (_gameState, _playerState, instance) =>
    instance.cardlocation === 'UNIT' && hasRequiredHighAlchemy(instance, 'GREEN')
}, {
  id: '105000408_opponent_field_to_grave_exile_and_mill',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_LEFT_FIELD',
  isGlobal: true,
  isMandatory: true,
  erosionTotalLimit: [3, 6],
  description: '3~6：对手战场上的卡送入墓地时，改为放逐。之后将他的卡组顶2张送入墓地。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    event?.type === 'CARD_LEFT_FIELD' &&
    event.playerUid === getOpponentUid(_gameState, playerState.uid) &&
    (event.data?.sourceZone === 'UNIT' || event.data?.sourceZone === 'ITEM') &&
    event.data?.targetZone === 'GRAVE',
  execute: async (instance, gameState, playerState, event) => {
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    const moved = event?.sourceCardId ? AtomicEffectExecutor.findCardById(gameState, event.sourceCardId) : undefined;
    if (moved?.cardlocation === 'GRAVE') {
      moveCard(gameState, opponentUid, moved, 'EXILE', instance);
      millTop(gameState, opponentUid, Math.min(2, gameState.players[opponentUid].deck.length), instance);
    }
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000408
 * Card2 Row: 622
 * Card Row: 506
 * Source CardNo: BT08-Y07
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:这张卡只能通过《高位炼金》的效果将包含绿色卡的3张卡送入墓地而进入战场。
 * 〖3~6〗【永】:对手战场上的卡将要送入墓地时，改为将其放逐。之后，将他的卡组顶的2张卡送入墓地。
 */
const card: Card = {
  id: '105000408',
  fullName: '炼金幻兽「鸦女王」',
  specialName: '鸦女王',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2, GREEN: 2 },
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT08',
  uniqueId: null as any,
};

export default card;
