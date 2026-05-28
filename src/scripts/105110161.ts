import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { GameService } from '../services/gameService';
import { createSelectCardQuery } from './BaseUtil';

const effect_105110161_activate: CardEffect = {
  id: '105110161_activate',
  type: 'ACTIVATE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitNameType: true,
  description: '破坏我方1张道具，之后选择我方1个单位，本回合中其伤害+1、力量+500。',
  condition: (_gameState, playerState) =>
    playerState.itemZone.some(card => card !== null) &&
    playerState.unitZone.some(card => card !== null),
  execute: async (instance, gameState, playerState) => {
    const ownItems = playerState.itemZone.filter((card): card is Card => !!card);
    createSelectCardQuery(
      gameState,
      playerState.uid,
      ownItems,
      '选择道具',
      '破坏我方1张道具。',
      1,
      1,
      { sourceCardId: instance.gamecardId, effectId: '105110161_activate', step: 'DESTROY_ITEM' }
    );
  },
  onQueryResolve: async (instance, gameState, playerState, selections, context) => {
    if (context.step === 'DESTROY_ITEM') {
      const targetItem = AtomicEffectExecutor.findCardById(gameState, selections[0]);
      if (!targetItem) return;

      await GameService.destroyUnit(gameState, playerState.uid, targetItem.gamecardId, true, playerState.uid);

      const ownUnits = playerState.unitZone.filter((card): card is Card => !!card);
      if (ownUnits.length === 0) return;

      createSelectCardQuery(
        gameState,
        playerState.uid,
        ownUnits,
        '选择单位',
        '选择我方1个单位强化。',
        1,
        1,
        { sourceCardId: instance.gamecardId, effectId: '105110161_activate', step: 'BUFF_UNIT' }
      );
      return;
    }

    if (context.step === 'BUFF_UNIT') {
      const targetId = selections[0];
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'CHANGE_DAMAGE',
        value: 1,
        turnDuration: 1,
        targetFilter: { gamecardId: targetId }
      }, instance);
      await AtomicEffectExecutor.execute(gameState, playerState.uid, {
        type: 'CHANGE_POWER',
        value: 500,
        turnDuration: 1,
        targetFilter: { gamecardId: targetId }
      }, instance);
    }
  }
};

const card: Card = {
  id: '105110161',
  fullName: '学生会执行员',
  specialName: '',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: {},
  faction: '学院要塞',
  acValue: 2,
  power: 2000,
  basePower: 2000,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105110161_activate],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
