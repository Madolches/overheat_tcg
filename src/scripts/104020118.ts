import { Card, GameState, PlayerState, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { ensureData } from './BaseUtil';

const card: Card = {
  id: '104020118',
  fullName: '幻国迷偶 代号NEW',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '九尾商会联盟',
  acValue: 2,
  power: 1000,
  basePower: 1000,
  damage: 0,
  baseDamage: 0,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    {
      id: 'code_new_trigger',
      type: 'TRIGGER',
      triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: true,
      description: '【诱】：当这个单位进入单位区时，选择单位区中AC为2或更低的一张非神蚀单位。在下一个对手回合开始时，该单位不能被置于竖置状态。',
      condition: (gameState, playerState, instance, event) => {
        return event?.sourceCardId === instance.gamecardId && event?.data?.zone === 'UNIT';
      },
      execute: (card, gameState, playerState) => {
        const options: any[] = [];
        Object.values(gameState.players).forEach(p => {
          p.unitZone.forEach(u => {
            if (u && !u.godMark && u.acValue <= 2) {
              options.push({ card: u, source: 'UNIT' as any });
            }
          });
        });

        if (options.length > 0) {
          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CARD',
            playerUid: playerState.uid,
            options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, options),
            title: '选择目标单位',
            description: '请选择一个AC 2或以下的非神蚀单位。该单位在下一个对手回合开始时不能竖置。',
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'EFFECT_RESOLVE',
            context: { sourceCardId: card.gamecardId, effectIndex: 0, step: 1 }
          };
        }
      },
      onQueryResolve: (card, gameState, playerState, selections, context) => {
        const step = context?.step || 1;
        if (step === 1) {
          const targetId = selections[0];
          let targetUnit: Card | undefined;

          Object.values(gameState.players).forEach(p => {
            const found = p.unitZone.find(u => u?.gamecardId === targetId);
            if (found) targetUnit = found;
          });

          if (targetUnit) {
            targetUnit.canResetCount = 1;
            ensureData(targetUnit).cannotResetSourceName = card.fullName;
            gameState.logs.push(`[幻国迷偶 代号NEW] 使单位 ${targetUnit.fullName}在下一个对手回合开始时无法竖置。`);
          }
        }
      }
    }
  ],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT02',
  uniqueId: null as any,
};

export default card;
