import { DeckAiProfile, DEFAULT_AI_WEIGHTS } from '../types';

export const adventurerGuildProfile: DeckAiProfile = {
  id: 'adventurer-guild',
  displayName: '冒险家公会',
  shareCode: 'GihIjIjYOVY1kX2fdZtTRgFcWXj6dQw',
  notes: '新困难人机第一套测试卡组，先使用通用困难 AI 评分，后续按实战表现补充专用策略。',
  weights: {
    ...DEFAULT_AI_WEIGHTS,
    unitDamage: 7.5,
    unitRush: 4.5,
    storyValue: 4.5,
    attackBias: 1.05,
    defenseBias: 0.95,
  },
  gamePlan: {
    mode: 'tempo',
    primaryGoal: 'boardControl',
    attackPriority: 1,
    developmentPriority: 1,
    effectPriority: 1,
    closeGameBias: 0.8,
    notes: ['以通用节奏型策略运行，等待新困难人机重构时细化。'],
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
