import { AI_DECK_PROFILES } from '../server/ai/deckProfiles';

const activeDeckNames = AI_DECK_PROFILES.map(profile => profile.displayName).join('、') || '暂无';

console.log(`困难 AI 旧卡组场景测试已清理。当前困难 AI 卡组：${activeDeckNames}`);
console.log('后续会随新的困难人机卡组重建专用场景测试。');
