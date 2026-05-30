import type { Card, TriggerLocation } from '../types/game';

const FIELD_ZONES = new Set<TriggerLocation>(['UNIT', 'ITEM']);

const FIELD_LEAVE_DATA_PREFIXES_TO_KEEP = [
  'returnFromExileAfterBattle',
  'permanentEffectSilenced',
  'pendingKuriLeaveRevive',
  'fullEffectSilencedUntilOwnStart',
  'lastMovedAsCost'
];

export const isFieldZone = (zone?: TriggerLocation) => !!zone && FIELD_ZONES.has(zone);

const getPreservedFieldLeaveData = (card: Card, data: any) => {
  if (!data) return undefined;
  const prefixes = [...FIELD_LEAVE_DATA_PREFIXES_TO_KEEP];
  if (card.id === '101140347') {
    prefixes.push('placedByShingiEffect');
    prefixes.push('pendingLivianShingiLeave');
  }
  if (card.id === '101000379') {
    prefixes.push('placedByShingiEffect');
  }
  if (card.id === '304020050') {
    prefixes.push('wealthBeforeLeftField');
  }
  const preserved: Record<string, any> = {};
  Object.keys(data).forEach(key => {
    if (prefixes.some(prefix => key.startsWith(prefix))) {
      preserved[key] = data[key];
    }
  });
  return Object.keys(preserved).length > 0 ? preserved : undefined;
};

export const clearBattlefieldState = (card: Card) => {
  const preservedData = getPreservedFieldLeaveData(card, (card as any).data);
  if (preservedData) (card as any).data = preservedData;
  else delete (card as any).data;

  delete (card as any).__playSnapshot;
  delete (card as any).battleForbiddenByEffect;
  delete (card as any).cannotBeAttackTargetByEffect;
  delete (card as any).cannotBeEffectTargetByEffect;
  if ((card as any).data?.cannotBeEffectTargetColors !== undefined) {
    delete (card as any).data.cannotBeEffectTargetColors;
  }
  if ((card as any).data?.cannotBeEffectTargetByOpponent !== undefined) {
    delete (card as any).data.cannotBeEffectTargetByOpponent;
    delete (card as any).data.cannotBeEffectTargetByOpponentSourceName;
  }
  if ((card as any).data?.preventFirstDestroyEachTurnSourceName !== undefined) {
    delete (card as any).data.preventFirstDestroyEachTurnSourceName;
  }
  if ((card as any).data?.preventFirstAnyDestroyEachTurnSourceName !== undefined) {
    delete (card as any).data.preventFirstAnyDestroyEachTurnSourceName;
  }
  if ((card as any).data?.preventFirstBattleDestroyEachTurnSourceName !== undefined) {
    delete (card as any).data.preventFirstBattleDestroyEachTurnSourceName;
  }
  if ((card as any).data?.preventNextBattleDestroyContinuousSourceCardId !== undefined) {
    delete (card as any).data.preventNextBattleDestroy;
    delete (card as any).data.preventNextBattleDestroySourceName;
    delete (card as any).data.preventNextBattleDestroyUntilTurn;
    delete (card as any).data.preventNextBattleDestroyContinuousSourceCardId;
  }
  if ((card as any).data?.unaffectedByOpponentAcLe !== undefined) {
    delete (card as any).data.unaffectedByOpponentAcLe;
  }
  if ((card as any).data?.cannotLeaveFieldByOpponentAcLe !== undefined) {
    delete (card as any).data.cannotLeaveFieldByOpponentAcLe;
  }
  delete (card as any).battleImmuneByEffect;

  card.declaredTargetMarkers = [];
  card.influencingEffects = [];
  card.equipTargetId = undefined;
  card.nextEffectProtection = undefined;
  card.inAllianceGroup = false;
  card.hasAttackedThisTurn = false;
  card.usedShenyiThisTurn = false;
  card.playedTurn = undefined;
  card.canResetCount = 0;
  card.isExhausted = false;
  card.silencedEffectIds = [];

  card.temporaryCanActivateEffect = undefined;
  card.temporaryImmuneToUnitEffects = undefined;
  card.temporaryPowerBuff = 0;
  card.temporaryDamageBuff = 0;
  card.temporaryRush = false;
  card.temporaryAnnihilation = false;
  card.temporaryHeroic = false;
  card.temporaryCanAttackAny = false;
  card.temporaryBuffSources = {};
  card.temporaryBuffDetails = {};
  delete (card as any).persistentExtraColors;

  if (card.baseColorReq) card.colorReq = { ...card.baseColorReq };
  if (card.basePower !== undefined) card.power = card.basePower;
  if (card.baseDamage !== undefined) card.damage = card.baseDamage;
  if (card.baseAcValue !== undefined) card.acValue = card.baseAcValue;
  if (card.baseIsrush !== undefined) card.isrush = card.baseIsrush;
  if (card.baseAnnihilation !== undefined) card.isAnnihilation = card.baseAnnihilation;
  if (card.baseHeroic !== undefined) card.isHeroic = card.baseHeroic;
  if (card.baseShenyi !== undefined) card.isShenyi = card.baseShenyi;
  if (card.baseGodMark !== undefined) card.godMark = card.baseGodMark;
  if (card.baseCanAttack !== undefined) card.canAttack = card.baseCanAttack;
  else card.canAttack = true;
  if (card.baseCanActivateEffect !== undefined) card.canActivateEffect = card.baseCanActivateEffect;
  else card.canActivateEffect = true;
  card.isImmuneToUnitEffects = card.baseIsImmuneToUnitEffects ?? false;
};

export const shouldClearBattlefieldStateOnMove = (fromZone: TriggerLocation, toZone: TriggerLocation) =>
  isFieldZone(fromZone) && !isFieldZone(toZone);
