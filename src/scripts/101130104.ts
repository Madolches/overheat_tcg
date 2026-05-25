import { Card, CardEffect, TriggerLocation } from '../types/game';
import { addInfluence, createSelectCardQuery, moveCard } from './BaseUtil';

const cardEffects: CardEffect[] = [{
    id: '101130104_alliance_annihilation',
    type: 'CONTINUOUS',
    description: '参与联军攻击中获得歼灭。',
    applyContinuous: (_gameState, instance) => {
      if (instance.inAllianceGroup) {
        instance.isAnnihilation = true;
        addInfluence(instance, instance, '获得效果: 【歼灭】');
      }
    }
  }, {
    id: '101130104_damage_bottom',
    type: 'TRIGGER',
    triggerEvent: 'COMBAT_DAMAGE_CAUSED',
  isMandatory: false,
    triggerLocation: ['UNIT'],
    erosionTotalLimit: [0, 3],
    description: '0~3：给予对手战斗伤害时，将墓地2张卡放到卡组底。',
    condition: (gameState, playerState, instance, event) =>
      event?.playerUid !== playerState.uid &&
      event.data?.attackerIds?.includes(instance.gamecardId) &&
      playerState.grave.length > 0,
    execute: async (instance, gameState, playerState) => {
      const count = Math.min(2, playerState.grave.length);
      createSelectCardQuery(
        gameState,
        playerState.uid,
        playerState.grave,
        '选择放回卡组底的卡',
        `选择你的墓地中的${count}张卡，放置到卡组底。`,
        count,
        count,
        { sourceCardId: instance.gamecardId, effectId: '101130104_damage_bottom' },
        () => 'GRAVE'
      );
    },
    onQueryResolve: async (instance, gameState, playerState, selections) => {
      selections
        .map(id => playerState.grave.find(card => card.gamecardId === id))
        .filter((card): card is Card => !!card)
        .forEach(card => moveCard(gameState, playerState.uid, card, 'DECK', instance, { insertAtBottom: true }));
    }
  }];

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 101130104
 * Card2 Row: 64
 * Card Row: 64
 * Source CardNo: BT01-W09
 * Package: BT01(R)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【永】:这个单位参与的联军攻击中，这个单位获得【歼灭】。
 * 〖0~3〗【诱】:这个单位给予对手战斗伤害时，选择你的墓地中的2张卡，放置到卡组底。
 * TODO: confirm ID / godMark / rarity variants and implement effects.
 */
const card: Card = {
  id: '101130104',
  fullName: '歼灭天使团',
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
  isAnnihilation: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: cardEffects,
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT01',
  uniqueId: null as any,
};

export default card;
