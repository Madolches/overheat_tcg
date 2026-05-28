import { Card, GameState, PlayerState, CardEffect, GameEvent } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';

const trigger_104010217: CardEffect = {
  id: '104010217_trigger',
  type: 'TRIGGER',
  description: '【诱】[名称一回合一次] 当此单位进入战场时，可以发动：选择你的侵蚀前区中一张名称包含「剑仙」的卡牌加入手牌。',
  triggerLocation: ['UNIT'],
  triggerEvent: 'CARD_ENTERED_ZONE',
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    const isSelf = event?.type === 'CARD_ENTERED_ZONE' &&
      (event.sourceCardId === instance.gamecardId || event.sourceCard === instance);
    const isTargetZone = event?.data?.zone === 'UNIT';

    if (!isSelf || !isTargetZone) return false;

    // Condition: Must have a '剑仙' card in front erosion area (face-up)
    const erosionTargets = playerState.erosionFront.filter(c =>
      c && c.displayState === 'FRONT_UPRIGHT' && c.fullName.includes('剑仙')
    );
    return erosionTargets.length > 0;
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    const erosionTargets = playerState.erosionFront.filter(c =>
      c && c.displayState === 'FRONT_UPRIGHT' && c.fullName.includes('剑仙')
    ) as Card[];

    if (erosionTargets.length > 0) {
      gameState.pendingQuery = {
        id: Math.random().toString(36).substring(7),
        type: 'SELECT_CARD',
        playerUid: playerState.uid,
        options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, erosionTargets.map(c => ({ card: c, source: 'EROSION_FRONT' }))),
        title: '选择「剑仙」卡牌',
        description: '请选择一张侵蚀前区的「剑仙」卡牌加入手牌',
        minSelections: 1,
        maxSelections: 1,
        callbackKey: 'EFFECT_RESOLVE',
        context: {
          sourceCardId: instance.gamecardId,
          effectId: '104010217_trigger',
          step: 1
        }
      };
    }
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step === 1) {
      const targetId = selections[0];
      const targetCard = playerState.erosionFront.find(c => c?.gamecardId === targetId);

      if (targetCard) {
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_EROSION',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'HAND'
        }, instance);

        gameState.logs.push(`[${instance.fullName}] 发动：将侵蚀区的 ${targetCard.fullName} 加入手牌。`);
      }
    }
  }
};

const card: Card = {
  id: '104010217',
  fullName: '御剑仙婢',
  specialName: '',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '百濑之水城',
  acValue: 1,
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
  effects: [trigger_104010217],
  rarity: 'R',
  availableRarities: ['R'],
  cardPackage: 'BT05',
  uniqueId: null,
};

export default card;
