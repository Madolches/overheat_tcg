import { Card, CardEffect } from '../types/game';
import { AtomicEffectExecutor } from '../services/AtomicEffectExecutor';
import { EventEngine } from '../services/EventEngine';
import { canPutUnitOntoBattlefield, moveCard } from './BaseUtil';

const COLORS = ['RED', 'WHITE', 'YELLOW', 'BLUE', 'GREEN'] as const;

const unitColors = (card: Card) => {
  const colors = new Set<string>();
  if (COLORS.includes(card.color as any)) colors.add(card.color);
  (card.temporaryExtraColors || []).forEach(color => {
    if (COLORS.includes(color as any)) colors.add(color);
  });
  return colors;
};

const canPayFiveColorExhaustCost = (playerState: any) => {
  const available = new Set<string>();
  playerState.unitZone.forEach((unit: Card | null) => {
    if (!unit || unit.isExhausted) return;
    unitColors(unit).forEach(color => available.add(color));
  });
  return COLORS.every(color => available.has(color));
};

const selectFiveColorExhaustUnits = (playerState: any) => {
  const selected: Card[] = [];
  const selectedIds = new Set<string>();

  for (const color of COLORS) {
    const candidate = playerState.unitZone.find((unit: Card | null) =>
      !!unit &&
      !unit.isExhausted &&
      !selectedIds.has(unit.gamecardId) &&
      unitColors(unit).has(color)
    );
    if (!candidate) return [];
    selected.push(candidate);
    selectedIds.add(candidate.gamecardId);
  }

  return selected;
};

const moveZoneCardsToDeck = (gameState: any, ownerUid: string, cards: Card[], source: Card) => {
  for (const card of [...cards]) {
    if (card.cardlocation === 'HAND' || card.cardlocation === 'GRAVE' || card.cardlocation === 'EROSION_FRONT' || card.cardlocation === 'EROSION_BACK') {
      moveCard(gameState, ownerUid, card, 'DECK', source);
    }
  }
};

const shufflePlayerDeck = async (gameState: any, playerUid: string, source: Card) => {
  await AtomicEffectExecutor.execute(gameState, playerUid, { type: 'SHUFFLE_DECK' }, source);
};

const effect_105000325_hand_entry: CardEffect = {
  id: '105000325_hand_entry',
  type: 'ACTIVATE',
  triggerLocation: ['HAND'],
  description: '【启】你的主要阶段，横置你的战场上的5种颜色单位各1个：将手牌中的这张卡放置到战场中。',
  condition: (gameState, playerState, instance) =>
    playerState.isTurn &&
    gameState.phase === 'MAIN' &&
    instance.cardlocation === 'HAND' &&
    canPutUnitOntoBattlefield(playerState, instance) &&
    canPayFiveColorExhaustCost(playerState),
  cost: async (gameState, playerState, instance) => {
    const selected = selectFiveColorExhaustUnits(playerState);
    if (selected.length !== COLORS.length) return false;
    selected.forEach(unit => {
      unit.isExhausted = true;
      EventEngine.dispatchEvent(gameState, {
        type: 'CARD_ROTATED',
        sourceCard: instance,
        sourceCardId: instance.gamecardId,
        targetCardId: unit.gamecardId,
        playerUid: playerState.uid,
        data: {
          direction: 'HORIZONTAL',
          effectSourcePlayerUid: playerState.uid,
          effectSourceCardId: instance.gamecardId,
          allTargetCardIds: selected.map(card => card.gamecardId)
        }
      });
    });
    return true;
  },
  execute: async (instance, gameState, playerState) => {
    (instance as any).data = {
      ...((instance as any).data || {}),
      enteredBy105000325ActivateTurn: gameState.turnCount
    };
    moveCard(gameState, playerState.uid, instance, 'UNIT', instance);
  }
};

const effect_105000325_enter_reset_game: CardEffect = {
  id: '105000325_enter_reset_game',
  type: 'TRIGGER',
  triggerEvent: 'CARD_ENTERED_ZONE',
  triggerLocation: ['UNIT'],
  limitCount: 1,
  limitGlobal: true,
  limitNameType: true,
  isMandatory: true,
  description: '【诱】1游戏1次，由于这张卡的启动能力进入战场时：所有玩家将手牌、侵蚀区、墓地全部返回卡组并洗切。之后所有玩家抽5张。发动后本回合你的单位不能宣言攻击，回合结束后追加你的1个回合。',
  condition: (_gameState, _playerState, instance, event) =>
    instance.cardlocation === 'UNIT' &&
    event?.sourceCardId === instance.gamecardId &&
    event.data?.zone === 'UNIT' &&
    (instance as any).data?.enteredBy105000325ActivateTurn === _gameState.turnCount,
  execute: async (instance, gameState, playerState) => {
    for (const [uid, player] of Object.entries(gameState.players)) {
      moveZoneCardsToDeck(gameState, uid, (player as any).hand, instance);
      moveZoneCardsToDeck(gameState, uid, (player as any).grave, instance);
      moveZoneCardsToDeck(gameState, uid, (player as any).erosionFront.filter((card: Card | null): card is Card => !!card), instance);
      moveZoneCardsToDeck(gameState, uid, (player as any).erosionBack.filter((card: Card | null): card is Card => !!card), instance);
      await shufflePlayerDeck(gameState, uid, instance);
    }

    for (const uid of gameState.playerIds) {
      await AtomicEffectExecutor.execute(gameState, uid, { type: 'DRAW', value: 5 }, instance);
    }

    (playerState as any).cannotDeclareAttackTurn = gameState.turnCount;
    (playerState as any).cannotDeclareAttackSourceName = instance.fullName;
    (playerState as any).extraTurnAfterCurrentTurn = gameState.turnCount;
    gameState.logs.push(`[${instance.fullName}] 本回合 ${playerState.displayName} 的单位不能宣言攻击，回合结束后追加1个回合。`);
  }
};

/**
 * Auto-generated from Card.xlsx + Card2.xlsx.
 * Source CardID: 105000325
 * Card2 Row: 447
 * Card Row: 382
 * Source CardNo: SP02-Y09
 * Package: SP02(OHR)
 * ID Source: card-xlsx
 * Keywords: N/A
 * Card Detail:
 * 【启】{你的主要阶段}[将你的战场上的5种颜色的单位各1个横置]：将手牌中的这张卡放置到战场上。
 * 【诱】〖1游戏1次〗{由于这张卡的【启】能力的效果进入战场时}：所有玩家将手牌、侵蚀区、墓地中的所有卡返回持有者的卡组，将卡组洗切。之后，所有玩家抽5张卡。发动这个能力之后，本回合中，你的单位不能宣言攻击。这个回合结束之后，再进行1次你的回合。
 */
const card: Card = {
  id: '105000325',
  fullName: '炉火之梦「真理」',
  specialName: '真理',
  type: 'UNIT',
  color: 'YELLOW',
  gamecardId: null as any,
  colorReq: { RED: 1, WHITE: 1, YELLOW: 1, BLUE: 1, GREEN: 1 },
  faction: '无',
  acValue: 9,
  power: 4000,
  basePower: 4000,
  damage: 4,
  baseDamage: 4,
  godMark: false,
  displayState: 'FRONT_UPRIGHT',
  isExhausted: false,
  isrush: false,
  canAttack: true,
  feijingMark: false,
  canResetCount: 0,
  effects: [effect_105000325_hand_entry, effect_105000325_enter_reset_game],
  rarity: 'UR',
  availableRarities: ['UR'],
  cardPackage: 'SP02',
  uniqueId: null as any,
};

export default card;
