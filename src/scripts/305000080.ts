import { Card, CardEffect } from '../types/game';
import { addInfluence, findUnitOnBattlefield, somelinStorybookGrantedActivate, universalEquipEffect } from './BaseUtil';

const effect_305000080_grant: CardEffect = {
  id: '305000080_grant_activate',
  type: 'CONTINUOUS',
  triggerLocation: ['ITEM'],
  description: '装备单位获得“【启】:[横置]公开你的卡组顶1张卡。你可以将那张卡加入手牌，并将1张手牌放置到卡组底。若没有加入手牌，将公开的卡按原样放回。”的能力。',
  applyContinuous: (gameState, instance) => {
    const target = findUnitOnBattlefield(gameState, instance.equipTargetId);
    if (!target) return;

    const grantedId = `305000080_granted_activate:${instance.gamecardId}`;
    if (!target.effects?.some(effect => effect.id === grantedId)) {
      target.effects = [...(target.effects || []), somelinStorybookGrantedActivate(instance.gamecardId)];
    }
    addInfluence(target, instance, '获得索美琳童话集赋予的启动能力');
  }
};

const card: Card = {
  id: '305000080',
  fullName: '索美琳童话集',
  specialName: '',
  type: 'ITEM',
  isEquip: true,
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { YELLOW: 1 },
  faction: '无',
  acValue: 2,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  feijingMark: false,
  canResetCount: 0,
  effects: [universalEquipEffect, effect_305000080_grant],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT03',
  uniqueId: null as any,
};

export default card;
