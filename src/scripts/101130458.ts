import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor, addInfluence, createSelectCardQuery, ensureData, forbidAttackAndDefenseUntil, getOpponentUid } from './BaseUtil';

const cardEffects: CardEffect[] = [{
  id: '101130458_reset_silence',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ROTATED',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：这个单位由于卡的效果被重置时，选择对手1个非神蚀单位，直到下一次你的回合开始不能发动能力，不能宣言攻击和防御。',
  condition: (gameState, playerState, instance, event) => {
    if (
      event?.targetCardId !== instance.gamecardId ||
      event.data?.direction !== 'VERTICAL' ||
      !event.data?.effectSourceCardId
    ) {
      return false;
    }

    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    return opponent.unitZone.some(unit => !!unit && !unit.godMark);
  },
  execute: async (instance, gameState, playerState) => {
    const opponent = gameState.players[getOpponentUid(gameState, playerState.uid)];
    const targets = opponent.unitZone.filter((unit): unit is Card => !!unit && !unit.godMark);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      targets,
      '选择非神蚀单位',
      '选择对手的1个非神蚀单位，直到下一次你的回合开始不能发动能力，不能宣言攻击和防御。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101130458_reset_silence' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context?.effectId !== '101130458_reset_silence') return;

    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    const opponentUid = getOpponentUid(gameState, playerState.uid);
    const ownerUid = target ? AtomicEffectExecutor.findCardOwnerKey(gameState, target.gamecardId) : undefined;
    if (!target || ownerUid !== opponentUid || target.cardlocation !== 'UNIT' || target.godMark) {
      gameState.logs.push(`[${instance.fullName}] 选择的非神蚀单位已不合法，效果中止。`);
      return;
    }

    const untilTurn = gameState.turnCount + 2;
    const data = ensureData(target);
    data.cannotActivateUntilTurn = untilTurn;
    data.cannotActivateSourceName = instance.fullName;
    target.temporaryCanActivateEffect = false;
    addInfluence(target, instance, '不能发动能力');
    forbidAttackAndDefenseUntil(target, instance, untilTurn);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130458
 * Card2 Row: 347
 * Card Row: 585
 * Source CardNo: PR04-02W
 * Package: 特殊(PR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 诱发效果，一回合一次，这个单位由于卡的效果被重置时，选择对手的一个非神蚀单位，直到下一次你的回合开始时，那个单位不能发动能力，不能宣言攻击和防御。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130458',
  fullName: '殿堂骑士·英剑',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '圣王国',
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
  effects: cardEffects,
  rarity: 'PR',
  availableRarities: ['PR'],
  cardPackage: 'PR',
  uniqueId: null as any,
};

export default card;
