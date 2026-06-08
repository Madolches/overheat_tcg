import { DeckAiProfile, DEFAULT_AI_WEIGHTS } from '../types';

export const PURE_YELLOW_STEEL_PROFILE_ID = 'pure-yellow-steel';

export const PURE_YELLOW_STEEL_CARD_IDS = {
  blueprintPainter: '105110381',
  healingApprentice: '105110108',
  academyPuppetMaster: '105110383',
  analysisRoom: '305000063',
  fortressBlueprint: '305110061',
  steelBlueprint: '305000055',
} as const;

export const PURE_YELLOW_STEEL_DEFAULT_OPENING_CARD_IDS = [
  PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter,
  PURE_YELLOW_STEEL_CARD_IDS.healingApprentice,
  PURE_YELLOW_STEEL_CARD_IDS.academyPuppetMaster,
  PURE_YELLOW_STEEL_CARD_IDS.analysisRoom,
  PURE_YELLOW_STEEL_CARD_IDS.fortressBlueprint,
] as const;

export const PURE_YELLOW_STEEL_FIRST_TURN_PLAY_CARD_IDS = [
  PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter,
  PURE_YELLOW_STEEL_CARD_IDS.healingApprentice,
  PURE_YELLOW_STEEL_CARD_IDS.academyPuppetMaster,
  PURE_YELLOW_STEEL_CARD_IDS.analysisRoom,
] as const;

export const pureYellowSteelProfile: DeckAiProfile = {
  id: PURE_YELLOW_STEEL_PROFILE_ID,
  displayName: '纯黄钢兵',
  shareCode: 'GihIjIjYGTovnjmfgpP_JeoLo_uA',
  notes: '纯黄钢兵困难人机卡组，围绕蓝图、魔偶和背面放逐资源展开。',
  weights: {
    ...DEFAULT_AI_WEIGHTS,
    unitDamage: 7.2,
    itemValue: 7.5,
    lowCost: 0.9,
    effectText: 1.2,
    attackBias: 0.95,
    defenseBias: 1.05,
  },
  preferredFactions: ['学院要塞'],
  preferredCardIds: {
    [PURE_YELLOW_STEEL_CARD_IDS.blueprintPainter]: 24,
    [PURE_YELLOW_STEEL_CARD_IDS.steelBlueprint]: 22,
    [PURE_YELLOW_STEEL_CARD_IDS.academyPuppetMaster]: 20,
    [PURE_YELLOW_STEEL_CARD_IDS.analysisRoom]: 18,
    [PURE_YELLOW_STEEL_CARD_IDS.fortressBlueprint]: 16,
  },
  preserveCardIds: {
    [PURE_YELLOW_STEEL_CARD_IDS.academyPuppetMaster]: 18,
    [PURE_YELLOW_STEEL_CARD_IDS.steelBlueprint]: 16,
    [PURE_YELLOW_STEEL_CARD_IDS.fortressBlueprint]: 14,
  },
  effectPreferences: {
    preferredEffectIds: {
      '105110381_hand_enter_search_blueprint_item': 34,
      '105110383_creation_scar_put_top_blueprint_or_puppet': 28,
      '305000055_end_blueprint': 24,
      '305110061_end_fortress_blueprint': 22,
    },
    tagBias: {
      engine: 1.4,
      search: 1.35,
      summon: 1.2,
      resource: 1.1,
    },
    phaseBias: {
      MAIN: 1.15,
    },
  },
  gamePlan: {
    mode: 'engine',
    primaryGoal: 'comboSetup',
    attackPriority: 0.85,
    defensePriority: 1.05,
    developmentPriority: 1.35,
    effectPriority: 1.35,
    closeGameBias: 0.75,
    notes: ['优先建立蓝图与魔偶资源轴，再通过钢兵单位和要塞蓝图扩大场面。'],
  },
  riskThresholds: {
    lowDeck: 10,
    criticalDeck: 3,
    stopSelfDrawAtDeck: 6,
    stopSearchAtDeck: 5,
    highErosion: 7,
    criticalErosion: 9,
    reserveDefendersAtDeck: 10,
  },
};
