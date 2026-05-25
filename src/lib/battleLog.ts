import { BattleLogCardRef, BattleLogCategory, BattleLogEntry, Card, GamePhase, GameState, TriggerLocation } from '../types/game';
import { getLocationLabel } from './utils';

export type BattleLogInput = {
  category?: BattleLogCategory;
  text: string;
  actorUid?: string;
  actorName?: string;
  sourceCard?: BattleLogCardRef;
  targets?: BattleLogCardRef[];
  metadata?: Record<string, any>;
  timestamp?: number;
  turn?: number;
  phase?: GamePhase;
};

const LOG_PREFIX_CATEGORY: Array<[string, BattleLogCategory]> = [
  ['[阶段切换]', 'PHASE'],
  ['[诱发', 'TRIGGERED_EFFECT'],
  ['[强制诱发]', 'TRIGGERED_EFFECT'],
  ['[可选诱发]', 'TRIGGERED_EFFECT'],
  ['【诱发效果】', 'TRIGGERED_EFFECT'],
  ['link', 'CONFRONTATION'],
  ['对抗逆向结算完成', 'CONFRONTATION'],
  ['[战斗', 'BATTLE'],
  ['[攻击宣言]', 'BATTLE'],
  ['[系统]', 'SYSTEM']
];

export function createBattleLogEntry(gameState: Pick<GameState, 'turnCount' | 'phase'>, input: BattleLogInput): BattleLogEntry {
  const timestamp = input.timestamp ?? Date.now();
  return {
    id: `${timestamp}_${Math.random().toString(36).slice(2, 10)}`,
    timestamp,
    turn: input.turn ?? Number(gameState.turnCount || 0),
    phase: input.phase ?? gameState.phase,
    category: input.category || inferLogCategory(input.text),
    text: input.text,
    actorUid: input.actorUid,
    actorName: input.actorName,
    sourceCard: input.sourceCard,
    targets: input.targets,
    metadata: input.metadata
  };
}

export function addBattleLog(gameState: GameState, input: BattleLogInput) {
  if (!gameState.logs) gameState.logs = [];
  gameState.logs.push(createBattleLogEntry(gameState, input));
}

export function addCardAddedToHandBattleLog(
  gameState: GameState,
  input: {
    playerUid: string;
    card: Card;
    sourceCard?: Card | null;
    actorUid?: string;
    fromZone?: TriggerLocation;
    isEffect?: boolean;
  }
) {
  const player = gameState.players?.[input.playerUid];
  const actorUid = input.actorUid || input.playerUid;
  const actor = gameState.players?.[actorUid];
  const sourceText = input.sourceCard?.fullName ? ` 因 [${input.sourceCard.fullName}]` : '';

  addBattleLog(gameState, {
    category: 'EFFECT_ACTIVATED',
    actorUid,
    actorName: actor?.displayName,
    sourceCard: input.sourceCard ? cardToBattleLogRef(gameState, input.sourceCard, actorUid) : undefined,
    targets: [cardToBattleLogRef(gameState, input.card, input.playerUid, 'HAND')!],
    text: `[加入手牌] ${player?.displayName || '玩家'}${sourceText} 将 [${input.card.fullName}] 加入手牌。`,
    metadata: {
      sourceZone: input.fromZone,
      targetZone: 'HAND',
      isEffect: !!input.isEffect
    }
  });
}

export function normalizeBattleLogEntry(log: string | BattleLogEntry, gameState: Pick<GameState, 'turnCount' | 'phase'>, index = 0): BattleLogEntry {
  if (isBattleLogEntry(log)) {
    return {
      ...log,
      id: log.id || `${log.timestamp || Date.now()}_${index}`,
      timestamp: Number(log.timestamp || Date.now()),
      turn: Number.isFinite(Number(log.turn)) ? Number(log.turn) : Number(gameState.turnCount || 0),
      phase: log.phase || gameState.phase,
      category: log.category || inferLogCategory(log.text),
      text: String(log.text || '')
    };
  }

  const timestamp = Date.now() - Math.max(0, 100000 - index);
  return {
    id: `legacy_${timestamp}_${index}`,
    timestamp,
    turn: Number(gameState.turnCount || 0),
    phase: gameState.phase,
    category: inferLogCategory(log),
    text: String(log || '')
  };
}

export function normalizeBattleLogs(gameState: GameState): BattleLogEntry[] {
  const logs = Array.isArray(gameState.logs) ? gameState.logs : [];
  const normalized = logs
    .map((log, index) => normalizeBattleLogEntry(log, gameState, index))
    .filter(shouldKeepBattleLog);
  gameState.logs = normalized;
  return normalized;
}

export function battleLogText(log: string | BattleLogEntry): string {
  return typeof log === 'string' ? log : log.text;
}

export function inferLogCategory(text?: string): BattleLogCategory {
  const value = String(text || '');
  for (const [prefix, category] of LOG_PREFIX_CATEGORY) {
    if (value.startsWith(prefix)) return category;
  }
  if (value.includes('打出了')) return 'CARD_PLAYED';
  if (value.includes('发动了') && value.includes('效果')) return 'EFFECT_ACTIVATED';
  if (value.includes('指定') || value.includes('对象')) return 'TARGET_DECLARED';
  if (value.includes('战斗伤害') || value.includes('效果伤害') || value.includes('受到了')) return 'DAMAGE';
  if (value.includes('破坏')) return 'DESTROYED';
  if (value.includes('离开') || value.includes('移至') || value.includes('返回') || value.includes('放逐')) return 'MOVED';
  return 'SYSTEM';
}

export function shouldKeepBattleLog(log: BattleLogEntry) {
  if (log.category === 'CHAT') return true;
  if (log.category === 'CONFRONTATION') return true;
  if (log.category === 'TRIGGERED_EFFECT') {
    return log.text.startsWith('【诱发效果】') || log.text === '诱发效果结算完成。';
  }
  if (log.category === 'SYSTEM') {
    return log.text.startsWith('对战开始：') || log.text.startsWith('[游戏结束]') || log.text.startsWith('[对局结束]');
  }

  const hiddenFragments = [
    '猜拳',
    '调度',
    '选择先后攻',
    '练习赛开始',
    '游戏已创建',
    '对抗策略',
    '正在执行脚本回调',
    '支付成功，即将进入后续结算',
    '开始逆向结算',
    '等待玩家选择',
    '结算完成',
    '等待响应',
    '接受了阶段结束请求',
    '接受了攻击宣言',
    '选择不进行对抗'
  ];

  return !hiddenFragments.some(fragment => log.text.includes(fragment));
}

export function isBattleLogEntry(log: any): log is BattleLogEntry {
  return !!log && typeof log === 'object' && typeof log.text === 'string';
}

export function cardToBattleLogRef(gameState: GameState, card?: Card | null, ownerUid?: string, zone?: TriggerLocation | string): BattleLogCardRef | undefined {
  if (!card) return undefined;
  const located = findCardLocationForLog(gameState, card.gamecardId);
  const effectiveOwnerUid = ownerUid || located?.ownerUid;
  const effectiveZone = zone || located?.zone || card.cardlocation;
  const owner = effectiveOwnerUid ? gameState.players?.[effectiveOwnerUid] : undefined;
  return {
    gamecardId: card.gamecardId,
    cardId: card.id,
    name: card.fullName,
    ownerUid: effectiveOwnerUid,
    ownerName: owner?.displayName,
    zone: effectiveZone,
    zoneLabel: getLocationLabel(effectiveZone),
    slotNumber: located?.slotNumber
  };
}

export function describeBattleLogTarget(target: BattleLogCardRef) {
  const owner = target.ownerName ? `${target.ownerName}的` : '';
  const zone = target.zoneLabel || getLocationLabel(target.zone);
  const slot = target.slotNumber ? `${target.slotNumber}号位` : '';
  const where = [owner + zone, slot].filter(Boolean).join('');
  return `${where ? `${where} ` : ''}[${target.name || target.gamecardId || '未知卡牌'}]`;
}

function findCardLocationForLog(gameState: GameState, gamecardId?: string) {
  if (!gamecardId) return undefined;
  const zoneNames: Array<[TriggerLocation, keyof GameState['players'][string]]> = [
    ['HAND', 'hand'],
    ['UNIT', 'unitZone'],
    ['ITEM', 'itemZone'],
    ['GRAVE', 'grave'],
    ['EXILE', 'exile'],
    ['EROSION_FRONT', 'erosionFront'],
    ['EROSION_BACK', 'erosionBack'],
    ['PLAY', 'playZone'],
    ['DECK', 'deck']
  ];

  for (const [ownerUid, player] of Object.entries(gameState.players || {})) {
    for (const [zone, key] of zoneNames) {
      const cards = (player as any)[key] as Array<Card | null> | undefined;
      if (!Array.isArray(cards)) continue;
      const index = cards.findIndex(card => card?.gamecardId === gamecardId);
      if (index >= 0) {
        return { ownerUid, zone, slotNumber: ['UNIT', 'ITEM', 'EROSION_FRONT', 'EROSION_BACK'].includes(zone) ? index + 1 : undefined };
      }
    }
  }
  return undefined;
}
