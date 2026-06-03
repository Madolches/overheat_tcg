import { Card, GameState, PlayerState, CardEffect, GameEvent, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { paymentCost, standardizeChoiceOptions } from './BaseUtil';

const trigger_104010170: CardEffect = {
  id: '舞姬触发',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  description: '【诱】[名称一回合一次] 当此单位进入战场时，若我方单位区有2个或更多蓝色单位，可以发动：选择我方单位区一个单位（包括此卡）返回持有者手牌。之后，可以选择发动，从手牌中选择一张卡牌放置在侵蚀前区。',
  isMandatory: false,
  limitCount: 1,
  limitNameType: true,
  cost: paymentCost(0, 'BLUE'),
  condition: (gameState: GameState, playerState: PlayerState, instance: Card, event?: GameEvent) => {
    // 1. Entry event check
    const isSelf = event?.type === 'CARD_ENTERED_ZONE' &&
      (event.sourceCardId === instance.gamecardId || event.sourceCard === instance);
    const isTargetZone = event?.data?.zone === 'UNIT';

    if (!isSelf || !isTargetZone) return false;

    // 2. Must have two or more blue units in the unit area (including self)
    const blueUnits = playerState.unitZone.filter(u => u && AtomicEffectExecutor.matchesColor(u, 'BLUE'));
    if (blueUnits.length < 2) return false;

    return true;
  },
  targetSpec: {
    title: '选择返回手牌的单位',
    description: '选择你的1个单位，将其返回持有者手牌。',
    minSelections: 1,
    maxSelections: 1,
    zones: ['UNIT'],
    controller: 'SELF',
    step: 'RETURN_UNIT',
    getCandidates: (_gameState, playerState) =>
      playerState.unitZone
        .filter((unit): unit is Card => !!unit)
        .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
  },
  execute: async (instance: Card, gameState: GameState, playerState: PlayerState) => {
    // Step 1: Select a unit to return to hand
    const units = playerState.unitZone.filter(u => u !== null) as Card[];
    if (units.length === 0) return;

    gameState.pendingQuery = {
      id: Math.random().toString(36).substring(7),
      type: 'SELECT_CARD',
      playerUid: playerState.uid,
      options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, units.map(u => ({ card: u, source: 'UNIT' }))),
      title: '选择回场单位',
      description: '请选择你战场上的一个单位返回持有者手牌',
      minSelections: 1,
      maxSelections: 1,
      callbackKey: 'EFFECT_RESOLVE',
      context: {
        sourceCardId: instance.gamecardId,
        effectId: '舞姬触发',
        step: 1
      }
    };
  },
  onQueryResolve: async (instance: Card, gameState: GameState, playerState: PlayerState, selections: string[], context: any) => {
    if (context.step === 'RETURN_UNIT') {
      context.step = 1;
    }
    if (context.step === 1) {
      const targetId = selections[0];
      const targetCard = playerState.unitZone.find(u => u?.gamecardId === targetId);

      if (targetCard) {
        // Move unit to hand
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_FIELD',
          targetFilter: { gamecardId: targetId },
          destinationZone: 'HAND'
        }, instance);

        gameState.logs.push(`[${instance.fullName}] 效果：将 [${targetCard.fullName}] 返回手牌。`);

        // Step 2: Optional second part - place a hand card in erosion zone
        // Check if there's space in erosion front
        const hasSpace = playerState.erosionFront.some(c => c === null);
        const hasHand = playerState.hand.length > 0;

        if (hasSpace && hasHand) {
          // Note: The prompt says "Afterwards, you can choose to activate", which implies an optional prompt.
          // Since onQueryResolve can trigger another query, we do that.
          const choiceContext = {
            sourceCardId: instance.gamecardId,
            effectId: '舞姬触发',
            step: 2
          };

          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CHOICE', // Ask if user wants to place a card
            playerUid: playerState.uid,
            options: standardizeChoiceOptions(gameState, [
              { id: 'yes', label: '发动（从手牌放置卡牌到侵蚀区）' },
              { id: 'no', label: '不发动' }
            ], choiceContext),
            title: '后续效果发动',
            description: '是否从手牌中选择一张卡牌放置在侵蚀前区？',
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'EFFECT_RESOLVE',
            context: choiceContext
          };
        }
      }
    } else if (context.step === 2) {
      if (selections[0] === 'yes') {
        // Ask for card selection from hand
        const handOptions = playerState.hand.map(c => ({ card: c, source: 'HAND' as TriggerLocation }));

        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, handOptions),
          title: '选择卡牌',
          description: '请选择一张手牌放置在侵蚀前区',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: {
            sourceCardId: instance.gamecardId,
            effectId: '舞姬触发',
            step: 3
          }
        };
      }
    } else if (context.step === 3) {
      const cardId = selections[0];
      const targetCard = playerState.hand.find(c => c.gamecardId === cardId);

      if (targetCard) {
        await AtomicEffectExecutor.execute(gameState, playerState.uid, {
          type: 'MOVE_FROM_HAND',
          targetFilter: { gamecardId: cardId },
          destinationZone: 'EROSION_FRONT'
        }, instance);

        gameState.logs.push(`[${instance.fullName}] 效果：将手牌中的 [${targetCard.fullName}] 放置在侵蚀前区。`);
      }
    }
  }
};

const card: Card = {
  id: '104010170',
  fullName: '水仙--舞姬',
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
  effects: [trigger_104010170],
  rarity: 'U',
  availableRarities: ['U'],
  cardPackage: 'BT03',
  uniqueId: null,
};

export default card;
