import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { addInfluence, canPutUnitOntoBattlefield, createSelectCardQuery, ensureData, moveCard } from './BaseUtil';

const kingdomHeavyTargets = (playerState: any) =>
  playerState.deck.filter((card: Card) =>
    card.id !== '101130377' &&
    card.type === 'UNIT' &&
    card.faction === '圣王国' &&
    !card.godMark &&
    (card.acValue || 0) <= 3 &&
    canPutUnitOntoBattlefield(playerState, card)
  );

const cardEffects: CardEffect[] = [{
  id: '101130377_first_battle_destroy_prevent',
  type: 'CONTINUOUS',
  triggerLocation: ['UNIT'],
  description: '每个回合中第一次将要被战斗破坏时，防止那次破坏。',
  applyContinuous: (_gameState, instance) => {
    const data = ensureData(instance);
    data.preventFirstBattleDestroyEachTurnSourceName = instance.fullName;
    addInfluence(instance, instance, '每回合第一次将要被战斗破坏时防止');
  }
}, {
  id: '101130377_recruit_alliance_partner',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ATTACK_DECLARED',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  description: '1回合1次：这个单位宣言非联军攻击时，从卡组横置放置1张《王国重骑》以外AC+3以下<圣王国>非神蚀单位，视为与这个单位联军攻击。',
  condition: (_gameState, playerState, instance, event) =>
    event?.sourceCardId === instance.gamecardId &&
    event.playerUid === playerState.uid &&
    !event.data?.isAlliance &&
    kingdomHeavyTargets(playerState).length > 0,
  execute: async (instance, gameState, playerState) => {
    const candidates = kingdomHeavyTargets(playerState);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      candidates,
      '选择联军伙伴',
      '选择卡组中1张《王国重骑》以外ACCESS值+3以下的<圣王国>非神蚀单位，以横置状态放置到战场并视为参战。',
      0,
      1,
      { sourceCardId: instance.gamecardId, effectId: '101130377_recruit_alliance_partner' },
      () => 'DECK'
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections) => {
    const target = selections[0]
      ? playerState.deck.find(card =>
        card.gamecardId === selections[0] &&
        card.id !== '101130377' &&
        card.type === 'UNIT' &&
        card.faction === '圣王国' &&
        !card.godMark &&
        (card.acValue || 0) <= 3
      )
      : undefined;
    if (!target || !canPutUnitOntoBattlefield(playerState, target)) return;

    const targetId = target.gamecardId;
    moveCard(gameState, playerState.uid, target, 'UNIT', instance);
    const live = AtomicEffectExecutor.findCardById(gameState, targetId);
    if (!live) return;

    live.isExhausted = true;
    live.displayState = 'FRONT_UPRIGHT';
    const battle = gameState.battleState;
    if (battle?.attackers?.includes(instance.gamecardId) && !battle.attackers.includes(live.gamecardId)) {
      battle.attackers.push(live.gamecardId);
      battle.isAlliance = true;
      battle.keepResetUnitIds = Array.from(new Set([...(battle.keepResetUnitIds || []), live.gamecardId]));
      live.inAllianceGroup = true;
      instance.inAllianceGroup = true;
      addInfluence(live, instance, '被视为与王国重骑进行联军攻击');
    }
    await AtomicEffectExecutor.execute(gameState, playerState.uid, { type: 'SHUFFLE_DECK' }, instance);
  }
}];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130377
 * Card2 Row: 570
 * Card Row: 454
 * Source CardNo: BT07-W04
 * Package: BT07(C)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】：这个单位在每个回合中第一次将要被战斗破坏时，放止那次破坏。
 * 【诱】〖1回合1次〗{这个单位宣言非联军攻击时}：你可以将你卡组中1张《王国重骑》以外的的ACCESS值+3以下的<圣王国>非神蚀单位卡以横置状态放置到战场上。这次战斗中，那个单位视为正在与这个单位进行联军攻击。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130377',
  fullName: '王国重骑',
  specialName: '',
  type: 'UNIT',
  color: 'WHITE',
  gamecardId: null as any,
  colorReq: { WHITE: 1 },
  faction: '圣王国',
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
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT07',
  uniqueId: null as any,
};

export default card;
