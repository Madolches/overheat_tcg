import { Card, GameState, PlayerState, CardEffect, TriggerLocation } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { exhaustCost } from './BaseUtil';

const card: Card = {
  id: '104030451',
  fullName: '龙翼看板娘[小婷]',
  specialName: '小婷',
  type: 'UNIT',
  color: 'BLUE',
  gamecardId: null as any,
  colorReq: {},
  faction: '冒险家公会',
  acValue: 2,
  power: 1500,
  basePower: 1500,
  damage: 1,
  baseDamage: 1,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [
    {
      id: 'dragon_wing_receptionist_activate',
      type: 'ACTIVATE',
      limitCount: 1,
      limitNameType: true,
      triggerLocation: ['UNIT'],
      description: '【同名回合1次】横置这张卡：选择你单位区中这张卡以外的1个非「神蚀」的「冒险家公会」单位，以及你侵蚀区正面由你持有的1张非「神蚀」的「冒险家公会」单位卡。将选择的侵蚀区单位卡正面向上的纵置摆放进入单位区，随后将选择的单位区对应的单位正面向上的纵置摆放进入侵蚀区。',
      condition: (gameState, playerState, instance) => {
        if (instance.isExhausted) return false;

        const hasOtherFieldUnit = playerState.unitZone.some(u =>
          u !== null &&
          u.gamecardId !== instance.gamecardId &&
          !u.godMark &&
          u.faction === '冒险家公会'
        );

        const fieldSpecialNames = new Set(playerState.unitZone.filter(u => u && u.specialName).map(u => u!.specialName));
        const itemSpecialNames = new Set(playerState.itemZone.filter(i => i && i.specialName).map(i => i!.specialName));

        const hasErosionUnit = playerState.erosionFront.some(c =>
          c !== null &&
          c.displayState === 'FRONT_UPRIGHT' &&
          c.type === 'UNIT' &&
          !c.godMark &&
          c.faction === '冒险家公会' &&
          (!c.specialName || (!fieldSpecialNames.has(c.specialName) && !itemSpecialNames.has(c.specialName)))
        );

        return hasOtherFieldUnit && hasErosionUnit;
      },
      targetSpec: {
        targetGroups: [{
          title: 'Select field unit',
          description: 'Select 1 other non-god Adventurer Guild unit on your battlefield.',
          minSelections: 1,
          maxSelections: 1,
          zones: ['UNIT'],
          controller: 'SELF',
          step: 'FIELD_UNIT',
          getCandidates: (_gameState, playerState, instance) =>
            playerState.unitZone
              .filter((unit): unit is Card =>
                !!unit &&
                unit.gamecardId !== instance.gamecardId &&
                !unit.godMark &&
                unit.faction === '冒险家公会'
              )
              .map(card => ({ card, source: 'UNIT' as TriggerLocation }))
        }, {
          title: 'Select erosion unit',
          description: 'Select 1 face-up non-god Adventurer Guild unit in your erosion zone.',
          minSelections: 1,
          maxSelections: 1,
          zones: ['EROSION_FRONT'],
          controller: 'SELF',
          step: 'EROSION_UNIT',
          getCandidates: (_gameState, playerState) => {
            const fieldSpecialNames = new Set(playerState.unitZone.filter(u => u && u.specialName).map(u => u!.specialName));
            const itemSpecialNames = new Set(playerState.itemZone.filter(i => i && i.specialName).map(i => i!.specialName));
            return playerState.erosionFront
              .filter((card): card is Card =>
                !!card &&
                card.displayState === 'FRONT_UPRIGHT' &&
                card.type === 'UNIT' &&
                !card.godMark &&
                card.faction === '冒险家公会' &&
                (!card.specialName || (!fieldSpecialNames.has(card.specialName) && !itemSpecialNames.has(card.specialName)))
              )
              .map(card => ({ card, source: 'EROSION_FRONT' as TriggerLocation }));
          }
        }]
      },
      cost: exhaustCost,
      execute: async (card, gameState, playerState) => {
        const fieldUnits = playerState.unitZone.filter(u =>
          u !== null &&
          u.gamecardId !== card.gamecardId &&
          !u.godMark &&
          u.faction === '冒险家公会'
        ) as Card[];

        const fieldSpecialNames = new Set(playerState.unitZone.filter(u => u && u.specialName).map(u => u!.specialName));
        const itemSpecialNames = new Set(playerState.itemZone.filter(i => i && i.specialName).map(i => i!.specialName));

        const erosionUnits = playerState.erosionFront.filter(c =>
          c !== null &&
          c.displayState === 'FRONT_UPRIGHT' &&
          c.type === 'UNIT' &&
          !c.godMark &&
          c.faction === '冒险家公会' &&
          (!c.specialName || (!fieldSpecialNames.has(c.specialName) && !itemSpecialNames.has(c.specialName)))
        ) as Card[];

        if (!card.isExhausted) {
          card.isExhausted = true;
          gameState.logs.push(`${playerState.displayName} 横置了 ${card.fullName} 以触发效果。`);
        }

        if (fieldUnits.length === 0 || erosionUnits.length === 0) {
          gameState.logs.push(`[龙翼看板娘[小婷]] 结算时已不存在有效的互换对象，效果发动失败。`);
          return;
        }

        // 2. Step 1: Select Field Unit
        gameState.pendingQuery = {
          id: Math.random().toString(36).substring(7),
          type: 'SELECT_CARD',
          playerUid: playerState.uid,
          options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, fieldUnits.map(u => ({ card: u, source: 'UNIT' as any }))),
          title: '选择战场单位',
          description: '效果结算：请选择你战场上另一个非「神蚀」的「冒险家公会」单位。该单位将被置入侵蚀区。',
          minSelections: 1,
          maxSelections: 1,
          callbackKey: 'EFFECT_RESOLVE',
          context: { sourceCardId: card.gamecardId, effectIndex: 0, step: 1 }
        };
      },
      onQueryResolve: async (card, gameState, playerState, selections, context) => {
        if (context?.declaredTargets?.length) {
          const fieldUnitId = context.declaredTargets.find((target: any) => target.step === 'FIELD_UNIT')?.gamecardId;
          const erosionUnitId = context.declaredTargets.find((target: any) => target.step === 'EROSION_UNIT')?.gamecardId;
          if (fieldUnitId && erosionUnitId) {
            context = { ...context, step: 2, fieldUnitId };
            selections = [erosionUnitId];
          }
        }
        const step = context?.step || 1;

        if (step === 1) {
          const fieldUnitId = selections[0];

          // 3. Step 2: Select Erosion Unit
          const fieldSpecialNames = new Set(playerState.unitZone.filter(u => u && u.specialName).map(u => u!.specialName));
          const itemSpecialNames = new Set(playerState.itemZone.filter(i => i && i.specialName).map(i => i!.specialName));

          const erosionUnits = playerState.erosionFront.filter(c =>
            c !== null &&
            c.displayState === 'FRONT_UPRIGHT' &&
            c.type === 'UNIT' &&
            !c.godMark &&
            c.faction === '冒险家公会' &&
            (!c.specialName || (!fieldSpecialNames.has(c.specialName) && !itemSpecialNames.has(c.specialName)))
          ) as Card[];

          gameState.pendingQuery = {
            id: Math.random().toString(36).substring(7),
            type: 'SELECT_CARD',
            playerUid: playerState.uid,
            options: AtomicEffectExecutor.enrichQueryOptions(gameState, playerState.uid, erosionUnits.map(u => ({ card: u, source: 'EROSION_FRONT' as any }))),
            title: '选择侵蚀区单位卡',
            description: '效果结算：请选择你侵蚀区正面一张非「神蚀」的「冒险家公会」单位卡。该卡牌将进入战场。',
            minSelections: 1,
            maxSelections: 1,
            callbackKey: 'EFFECT_RESOLVE',
            context: {
              sourceCardId: card.gamecardId,
              effectIndex: 0,
              step: 2,
              fieldUnitId
            }
          };
        } else if (step === 2) {
          const fieldUnitId = context.fieldUnitId;
          const erosionUnitId = selections[0];

          const fieldUnit = playerState.unitZone.find(u => u?.gamecardId === fieldUnitId);
          const erosionUnit = playerState.erosionFront.find(c => c?.gamecardId === erosionUnitId);

          if (fieldUnit && erosionUnit) {
            const fieldUnitIndex = playerState.unitZone.findIndex(u => u?.gamecardId === fieldUnitId);
            const erosionUnitIndex = playerState.erosionFront.findIndex(c => c?.gamecardId === erosionUnitId);
            if (fieldUnitIndex < 0) {
              gameState.logs.push(`[龙翼看板娘[小婷]] 结算时场上目标已不合法，效果发动失败。`);
              return;
            }
            if (erosionUnitIndex < 0) {
              gameState.logs.push(`[龙翼看板娘[小婷]] 结算时侵蚀区目标已不合法，效果发动失败。`);
              return;
            }

            playerState.unitZone[fieldUnitIndex] = null;
            playerState.erosionFront[erosionUnitIndex] = null;

            fieldUnit.cardlocation = 'EROSION_FRONT';
            fieldUnit.displayState = 'FRONT_UPRIGHT';
            fieldUnit.isExhausted = false;
            erosionUnit.isExhausted = false;
            erosionUnit.displayState = 'FRONT_UPRIGHT';
            erosionUnit.cardlocation = 'UNIT';
            erosionUnit.playedTurn = gameState.turnCount;

            playerState.unitZone[fieldUnitIndex] = erosionUnit;
            playerState.erosionFront[erosionUnitIndex] = fieldUnit;

            EventEngine.handleCardLeftZone(gameState, playerState.uid, fieldUnit, 'UNIT', true, 'EROSION_FRONT', {
              effectSourcePlayerUid: playerState.uid,
              effectSourceCardId: card.gamecardId,
              previousSourceCardId: fieldUnit.gamecardId
            });
            EventEngine.handleCardLeftZone(gameState, playerState.uid, erosionUnit, 'EROSION_FRONT', true, 'UNIT', {
              effectSourcePlayerUid: playerState.uid,
              effectSourceCardId: card.gamecardId,
              previousSourceCardId: erosionUnit.gamecardId
            });
            EventEngine.handleCardEnteredZone(gameState, playerState.uid, fieldUnit, 'EROSION_FRONT', true, {
              sourceZone: 'UNIT',
              targetZone: 'EROSION_FRONT',
              effectSourcePlayerUid: playerState.uid,
              effectSourceCardId: card.gamecardId,
              previousSourceCardId: fieldUnit.gamecardId
            });
            EventEngine.handleCardEnteredZone(gameState, playerState.uid, erosionUnit, 'UNIT', true, {
              sourceZone: 'EROSION_FRONT',
              targetZone: 'UNIT',
              effectSourcePlayerUid: playerState.uid,
              effectSourceCardId: card.gamecardId,
              previousSourceCardId: erosionUnit.gamecardId
            });
            EventEngine.dispatchMovementSubEvents(gameState, {
              card: fieldUnit,
              cardOwnerUid: playerState.uid,
              fromZone: 'UNIT',
              toZone: 'EROSION_FRONT',
              isEffect: true,
              effectSourcePlayerUid: playerState.uid,
              effectSourceCardId: card.gamecardId,
              previousSourceCardId: fieldUnit.gamecardId
            });
            EventEngine.dispatchMovementSubEvents(gameState, {
              card: erosionUnit,
              cardOwnerUid: playerState.uid,
              fromZone: 'EROSION_FRONT',
              toZone: 'UNIT',
              isEffect: true,
              effectSourcePlayerUid: playerState.uid,
              effectSourceCardId: card.gamecardId,
              previousSourceCardId: erosionUnit.gamecardId
            });

            gameState.logs.push(`[龙翼看板娘[小婷]] 效果生效：${fieldUnit.fullName} 与 ${erosionUnit.fullName} 进行了互换。`);
          } else {
            gameState.logs.push(`[龙翼看板娘[小婷]] 结算时目标已不合法，效果发动失败。`);
          }
        }
      }
    }
  ],
  rarity: 'C',
  availableRarities: ['C'],
  cardPackage: 'BT04',
  uniqueId: null as any,
};

export default card;
