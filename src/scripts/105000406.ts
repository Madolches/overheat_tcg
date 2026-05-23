import { Card, CardEffect } from '../types/game';
import { getOpponentUid, markCannotDefendUntilEndOfTurn, nameContains, ownUnits, totalErosionCount } from './BaseUtil';

const isAlchemyBeast = (card?: Card | null) =>
  !!card && card.type === 'UNIT' && nameContains(card, '炼金幻兽');

const hasRequiredHighAlchemy = (instance: Card, color: string) => {
  const data = (instance as any).data || {};
  return data.enteredFromDeckByAlchemyTurn !== undefined &&
    Array.isArray(data.highAlchemyMaterialColors) &&
    data.highAlchemyMaterialColors.includes(color);
};

const cardEffects: CardEffect[] = [{
  id: '105000406_high_alchemy_red_gate',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '这张卡只能通过《高位炼金》的效果将包含红色卡的3张卡送入墓地而进入战场。',
  condition: (_gameState, _playerState, instance) =>
    instance.cardlocation === 'UNIT' && hasRequiredHighAlchemy(instance, 'RED')
}, {
  id: '105000406_beast_attacks_cannot_be_defended_by_non_god',
  type: 'TRIGGER',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ATTACK_DECLARED',
  isMandatory: true,
  erosionTotalLimit: [3, 6],
  description: '3~6：对手不能用非神蚀单位防御你卡名含有《炼金幻兽》的单位的单独攻击。',
  condition: (_gameState, playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    !event?.data?.isAlliance &&
    (event?.data?.attackerIds || []).length === 1 &&
    ownUnits(playerState).some(unit =>
      unit.gamecardId === event?.data?.attackerIds?.[0] &&
      isAlchemyBeast(unit)
    ),
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    ownUnits(opponent)
      .filter(unit => !unit.godMark)
      .forEach(unit => markCannotDefendUntilEndOfTurn(unit, instance, gameState));
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000406
 * Card2 Row: 620
 * Card Row: 504
 * Source CardNo: BT08-Y05
 * Package: BT08(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【速攻】
 * 【永】:这张卡只能通过《高位炼金》的效果将包含红色卡的3张卡送入墓地而进入战场。
 * 〖3~6〗【永】:对手不能用非神蚀单位来防御你的战场上的卡名含有《炼金幻兽》的单位的攻击。（其他联军可以被防御时无效）
 */
const card: Card = {
  id: '105000406',
  fullName: '炼金幻兽「寇德」',
  specialName: '寇德',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 2, RED: 2 },
  faction: '无',
  acValue: 5,
  power: 3500,
  basePower: 3500,
  damage: 3,
  baseDamage: 3,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: true,
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
