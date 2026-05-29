import type { Card, CardEffect, GameState, PlayerOngoingEffect, PlayerState, TriggerLocation } from '../types/game';
import { getPlayerWealthSources } from './wealth';

type PlayerEffectScope = NonNullable<CardEffect['playerEffectScope']>;

type PlayerEffectDisplayRule = {
  scope: PlayerEffectScope;
  description?: string;
};

const DISPLAY_RULES: Record<string, PlayerEffectDisplayRule> = {
  '101060059_continuous_ignore_equip_color': { scope: 'SELF' },
  '101130153_first_holy_discount': { scope: 'SELF' },
  '101130203_draw_replacement': { scope: 'SELF' },
  '101130204_erosion_boost': { scope: 'SELF' },
  '101140437_god_limit': { scope: 'SELF' },
  '101150208_exile_boost': { scope: 'SELF' },
  '102050091_red_rush': { scope: 'SELF' },
  '102050259_disable_opponent_activated': { scope: 'OPPONENT' },
  '102050392_promotion_all_units_attack_units': { scope: 'SELF' },
  '102050432_god_limit': { scope: 'SELF' },
  '102050432_story_lock': { scope: 'OPPONENT' },
  '102060244_power_bonus': { scope: 'SELF' },
  '102060321_hand_access_discount': { scope: 'SELF' },
  '103000426_god_limit': { scope: 'SELF' },
  '103080184_totem_grant': { scope: 'SELF' },
  '104010308_deck_to_hand_discard': { scope: 'BOTH' },
  '104010449_fuka_restriction': { scope: 'SELF' },
  'fuka_restriction': { scope: 'SELF' },
  '105000406_beast_attacks_cannot_be_defended_by_non_god': { scope: 'OPPONENT' },
  '105000407_beast_battle_and_target_protection': { scope: 'SELF' },
  '105000408_opponent_field_to_grave_exile_and_mill': { scope: 'OPPONENT' },
  '105040457_legend_boost': { scope: 'SELF' },
  '105110160_disable_erosion_requirement_effects': { scope: 'BOTH' },
  '105110445_limit': { scope: 'SELF' },
  '301000072_lone_god_boost': { scope: 'SELF' },
  '301140059_uncounterable_shingi': { scope: 'OPPONENT' },
  '302000035_boost': { scope: 'SELF' },
  'continuous_defense_restriction': { scope: 'OPPONENT' },
  '302050024_ten_rush': { scope: 'SELF' },
  '302050065_protect_first_opponent_leave': { scope: 'SELF' },
  '303000052_grave_protection': { scope: 'SELF' },
  '303000071_lone_god_protect': { scope: 'SELF' },
  '303080070_awakened_units_damage': { scope: 'SELF' },
  '303090021_all_access_plus_two': { scope: 'SELF' },
  '304010068_sword_immortal_power': { scope: 'SELF' },
  '305000018_replace_damage': { scope: 'BOTH' },
  '305000049_non_god_power': { scope: 'SELF' }
};

const activeZonesForPlayer = (player: PlayerState) => [
  ...player.unitZone,
  ...player.itemZone,
  ...player.erosionFront
];

const isCardFullySilenced = (gameState: GameState, card: Card) => {
  const data = (card as any).data;
  if (data?.permanentEffectSilenced) return true;
  if (data?.fullEffectSilencedUntilOwnStartUid) return true;
  if (data?.fullEffectSilencedTurn === undefined || data.fullEffectSilencedTurn < gameState.turnCount) return false;
  const zones = data.fullEffectSilencedZones as TriggerLocation[] | undefined;
  return !zones || zones.includes(card.cardlocation as TriggerLocation);
};

const isContinuousEffectActiveAtLocation = (card: Card, effect: CardEffect) => {
  const cardLoc = card.cardlocation as TriggerLocation;
  if (effect.type !== 'CONTINUOUS') return false;
  if (effect.triggerLocation?.length) return effect.triggerLocation.includes(cardLoc);
  if (card.type === 'UNIT') return cardLoc === 'UNIT';
  if (card.type === 'ITEM') return cardLoc === 'ITEM';
  return cardLoc === 'PLAY';
};

const erosionCount = (player: PlayerState, kind: 'front' | 'back' | 'total') => {
  const front = player.erosionFront.filter(card => card !== null).length;
  const back = player.erosionBack.filter(card => card !== null).length;
  if (kind === 'front') return front;
  if (kind === 'back') return back;
  return front + back;
};

const countIsInRange = (count: number, range?: [number, number]) =>
  !range || (count >= range[0] && count <= range[1]);

const effectIsActive = (gameState: GameState, owner: PlayerState, card: Card, effect: CardEffect) => {
  if (effect.type !== 'CONTINUOUS') return false;
  if (isCardFullySilenced(gameState, card)) return false;
  if (!isContinuousEffectActiveAtLocation(card, effect)) return false;
  if (card.silencedEffectIds?.includes(effect.id || '')) return false;
  if (card.canActivateEffect === false) return false;
  if (owner.negatedNames?.includes(card.fullName)) return false;
  if (!countIsInRange(erosionCount(owner, 'front'), effect.erosionFrontLimit)) return false;
  if (!countIsInRange(erosionCount(owner, 'back'), effect.erosionBackLimit)) return false;
  if (!countIsInRange(erosionCount(owner, 'total'), effect.erosionTotalLimit)) return false;

  try {
    return !effect.condition || effect.condition(gameState, owner, card);
  } catch {
    return false;
  }
};

const affectedUidsForScope = (gameState: GameState, ownerUid: string, scope: PlayerEffectScope) => {
  if (scope === 'NONE') return [];
  if (scope === 'SELF') return [ownerUid];
  if (scope === 'OPPONENT') return gameState.playerIds.filter(uid => uid !== ownerUid);
  return [...gameState.playerIds];
};

const dynamicContinuousDescription = (
  gameState: GameState,
  owner: PlayerState,
  card: Card,
  effect: CardEffect,
  fallback?: string
) => {
  if (effect.id === '102060321_hand_access_discount') {
    const soulDevourCount = Number((owner as any)[`soulDevourActivatedTurn_${gameState.turnCount}`] || 0);
    if (soulDevourCount <= 0) return undefined;
    return `你的手牌中的<雷霆>单位卡和红色非神蚀单位卡ACCESS值-${soulDevourCount}（最低为0）。`;
  }

  if (effect.id === '102060321_hand_access_discount') {
    const soulDevourCount = Number((owner as any)[`soulDevourActivatedTurn_${gameState.turnCount}`] || 0);
    if (soulDevourCount <= 0) return undefined;
    return `你的手牌中的<雷霆>单位卡和红色非神蚀卡ACCESS值-${soulDevourCount}（最低为0）。`;
  }

  return fallback || effect.playerEffectDescription || effect.description;
};

const addUnique = (effects: PlayerOngoingEffect[], effect: PlayerOngoingEffect) => {
  if (effects.some(item => item.id === effect.id && item.affectedPlayerUid === effect.affectedPlayerUid)) return;
  effects.push(effect);
};

const addContinuousEffects = (gameState: GameState, affectedPlayerUid: string, effects: PlayerOngoingEffect[]) => {
  Object.entries(gameState.players).forEach(([ownerUid, owner]) => {
    activeZonesForPlayer(owner).forEach(card => {
      if (!card?.effects?.length) return;
      card.effects.forEach(effect => {
        const rule = effect.playerEffectScope
          ? { scope: effect.playerEffectScope, description: effect.playerEffectDescription }
          : DISPLAY_RULES[effect.id || ''];
        if (!rule || rule.scope === 'NONE') return;
        if (!effectIsActive(gameState, owner, card, effect)) return;
        if (!affectedUidsForScope(gameState, ownerUid, rule.scope).includes(affectedPlayerUid)) return;
        const description = dynamicContinuousDescription(gameState, owner, card, effect, rule.description);
        if (!description) return;

        addUnique(effects, {
          id: `${card.gamecardId}:${effect.id || effect.description}:${affectedPlayerUid}`,
          affectedPlayerUid,
          sourceCardName: card.fullName,
          sourceCardId: card.gamecardId,
          description,
          category: 'CONTINUOUS'
        });
      });
    });
  });
};

const addTemporaryEffects = (gameState: GameState, affectedPlayer: PlayerState, effects: PlayerOngoingEffect[]) => {
  const data = affectedPlayer as any;
  if (data.snowstormTurn === gameState.turnCount) {
    addUnique(effects, {
      id: `snowstorm:${affectedPlayer.uid}:${gameState.turnCount}`,
      affectedPlayerUid: affectedPlayer.uid,
      sourceCardName: data.snowstormSourceName || '暴风雪',
      description: '本回合宣言攻击或防御时可以支付1费；若不支付，参与战斗单位伤害-1、力量-1000。',
      category: 'TEMPORARY'
    });
  }
};

const addWealthEffects = (gameState: GameState, affectedPlayer: PlayerState, effects: PlayerOngoingEffect[]) => {
  getPlayerWealthSources(affectedPlayer, { turnCount: gameState.turnCount }).forEach(source => {
    addUnique(effects, {
      id: `wealth:${source.id}:${affectedPlayer.uid}`,
      affectedPlayerUid: affectedPlayer.uid,
      sourceCardName: source.sourceCardName,
      sourceCardId: source.sourceCardId,
      description: source.targetCardName && source.targetCardName !== source.sourceCardName
        ? `${source.targetCardName}：${source.description}`
        : source.description,
      category: 'WEALTH'
    });
  });
};

export const getPlayerOngoingEffects = (gameState: GameState, affectedPlayerUid: string): PlayerOngoingEffect[] => {
  const affectedPlayer = gameState.players[affectedPlayerUid];
  if (!affectedPlayer) return [];

  const effects: PlayerOngoingEffect[] = [];
  addContinuousEffects(gameState, affectedPlayerUid, effects);
  addTemporaryEffects(gameState, affectedPlayer, effects);
  addWealthEffects(gameState, affectedPlayer, effects);

  return effects.sort((a, b) => {
    const categoryOrder = { CONTINUOUS: 0, TEMPORARY: 1, WEALTH: 2 };
    return categoryOrder[a.category] - categoryOrder[b.category] ||
      a.sourceCardName.localeCompare(b.sourceCardName) ||
      a.description.localeCompare(b.description);
  });
};

export const getPlayerOngoingEffectSummary = (gameState: GameState, affectedPlayerUid: string) => {
  const effects = getPlayerOngoingEffects(gameState, affectedPlayerUid);
  return {
    effects,
    continuousCount: effects.filter(effect => effect.category !== 'WEALTH').length,
    wealthCount: effects.filter(effect => effect.category === 'WEALTH').length
  };
};
