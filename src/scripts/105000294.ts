import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import {
  addTempPower,
  canPutUnitOntoBattlefield,
  createSelectCardQuery,
  destroyByEffect,
  ownUnits,
  ownerUidOf,
  putUnitOntoField
} from './BaseUtil';

const isSeisoUnit = (card: Card) =>
  card.type === 'UNIT' && (card.fullName.includes('清霜') || !!card.specialName?.includes('清霜'));

const isSeisoLayuki = (card: Card) =>
  card.id === '105000294' || card.fullName.includes('清霜粒雪') || card.specialName?.includes('粒雪');

const isAccessThreeOrMore = (card: Card) => Number(card.acValue || 0) >= 3;
const isAccessThree = (card: Card) => Number(card.acValue || 0) === 3;

const effect_105000294_attack_destroy_boost: CardEffect = {
  id: '105000294_attack_destroy_boost',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ATTACK_DECLARED',
  isGlobal: true,
  isMandatory: false,
  triggerLocation: ['UNIT'],
  description: '这个单位宣言攻击时，可以破坏自己场上1个《清霜粒雪》以外的《清霜》单位。之后己方ACCESS 3以上单位本回合力量+1000。',
  condition: (_gameState, playerState, instance, event) =>
    event?.playerUid === playerState.uid &&
    (event.data?.attackerIds || []).includes(instance.gamecardId) &&
    ownUnits(playerState).some(unit =>
      unit.gamecardId !== instance.gamecardId &&
      isSeisoUnit(unit) &&
      !isSeisoLayuki(unit)
    ),
  execute: async (instance, gameState, playerState) => {
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownUnits(playerState).filter(unit =>
        unit.gamecardId !== instance.gamecardId &&
        isSeisoUnit(unit) &&
        !isSeisoLayuki(unit)
      ),
      '选择破坏的清霜单位',
      '选择自己战场上的1个《清霜粒雪》以外的《清霜》单位破坏。之后ACCESS 3以上单位力量+1000。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000294_attack_destroy_boost' },
      () => 'UNIT'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? AtomicEffectExecutor.findCardById(gameState, selections[0]) : undefined;
    if (
      target?.cardlocation === 'UNIT' &&
      ownerUidOf(gameState, target) === playerState.uid &&
      target.gamecardId !== instance.gamecardId &&
      isSeisoUnit(target) &&
      !isSeisoLayuki(target)
    ) {
      if (!destroyByEffect(gameState, target, instance)) return;
    } else {
      return;
    }

    ownUnits(playerState)
      .filter(isAccessThreeOrMore)
      .forEach(unit => addTempPower(unit, instance, 1000));
  }
};

const effect_105000294_leave_put_seiso_from_deck: CardEffect = {
  id: '105000294_leave_put_seiso_from_deck',
  type: 'TRIGGER',
  triggerEvent: 'CARD_LEFT_FIELD',
  sourceSnapshotOnLeftField: true,
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  triggerLocation: ['UNIT', 'GRAVE', 'EXILE', 'HAND', 'DECK', 'EROSION_FRONT', 'EROSION_BACK'],
  description: '同名1回合1次：这张卡由于战斗或自己的卡牌效果离开战场时，将卡组1张ACCESS 3《清霜》单位放置到战场。',
  condition: (_gameState, playerState, instance, event) => {
    const isSelfLeave =
      event?.sourceCard === instance ||
      event?.sourceCardId === instance.gamecardId ||
      event?.data?.previousSourceCardId === instance.gamecardId ||
      (
        !!event?.sourceCard?.runtimeFingerprint &&
        event.sourceCard.runtimeFingerprint === instance.runtimeFingerprint
      );
    if (!isSelfLeave) return false;
    if (event.data?.sourceZone !== 'UNIT') return false;
    const leftByOwnEffect = !!event.data?.isEffect && event.data?.effectSourcePlayerUid === playerState.uid;
    const leftByBattle = !event.data?.isEffect && event.data?.targetZone === 'GRAVE';
    return (leftByOwnEffect || leftByBattle) &&
      playerState.unitZone.filter(Boolean).length < 6 &&
      playerState.deck.some((card: Card) => isSeisoUnit(card) && isAccessThree(card) && canPutUnitOntoBattlefield(playerState, card));
  },
  execute: async (instance, gameState, playerState) => {
    const candidates = playerState.deck.filter((card: Card) =>
      isSeisoUnit(card) &&
      isAccessThree(card) &&
      canPutUnitOntoBattlefield(playerState, card)
    );
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择清霜单位',
      '选择卡组中的1张ACCESS 3且卡名含有《清霜》的单位卡放置到战场上。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105000294_leave_put_seiso_from_deck' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0] ? playerState.deck.find((card: Card) => card.gamecardId === selections[0]) : undefined;
    if (target && isSeisoUnit(target) && isAccessThree(target)) {
      putUnitOntoField(gameState, playerState.uid, target, instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
    }
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000294
 * Card2 Row: 521
 * Card Row: 343
 * Source CardNo: SP03-Y01
 * Package: SP03(R,SPR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【诱】{这个单位攻击宣言时}：你可以将你战场上的《清霜拉雪》以为的1个卡名含有《清霜》的单位破坏。之后，你的战场上所有ACCESS值+3以上的单位本回合中〖+1000〗。
 * 【诱】〖同名一回合一次〗{这个单位由于战斗或你的卡的效果从战场上离开时}：你可以将你卡组中的1张ACCESS值+3的卡名含有《清霜》的单位卡放置到战场上。
 */
const card: Card = {
  id: '105000294',
  fullName: '清霜粒雪',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
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
  effects: [effect_105000294_attack_destroy_boost, effect_105000294_leave_put_seiso_from_deck],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'SP03',
  uniqueId: null as any,
};

export default card;
