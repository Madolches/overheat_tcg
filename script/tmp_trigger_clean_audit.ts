import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import XLSX from 'xlsx';

type Row = Record<string, unknown>;
type AbilityKind = 'TRIGGER' | 'ACTIVATE' | 'CONTINUOUS' | 'COUNTER' | 'EQUIP' | 'SCAR';

type RawCard = {
  id: string;
  name: string;
  no: string;
  type: string;
  package: string;
  detail: string;
};

type Ability = {
  kind: AbilityKind;
  marker: string;
  text: string;
};

type TextChunk = {
  delimiter: '{}' | '[]';
  text: string;
  index: number;
  payable: boolean;
  reason?: string;
};

type SelectionHit = {
  index: number;
  phrase: string;
  ignoredReason?: string;
};

const repo = process.cwd();
const scriptsDir = path.join(repo, 'src', 'scripts');
const reportPath = path.join(repo, 'reports', 'strict-trigger-cost-target-audit-round4-clean.json');
const summaryPath = path.join(repo, 'reports', 'strict-trigger-cost-target-audit-round4-clean-summary.json');

const missingPrIds = new Set(['104030489', '104020496', '102050497', '105110498']);
const excludedIds = new Set([
  ...missingPrIds,
  '104030450',
  '104030452',
  '104030453',
  '104010447',
  '201000081',
  '201000082',
  '201000039',
  '202000087',
  '205000085',
  '304010051',
  '304030075',
  '101130441',
  '302050014',
  '304010054',
  '304020050',
  '102070357',
  '103080312',
  '103090421',
  '101000291',
  '103090074',
  '103090075',
  '102050428',
  '103000478',
  '102060433',
  '105000228'
]);

const excludedNamePatterns = [
  /炎雨/,
  /牺牲/,
  /怪盗？魔术？钟结！/,
  /剑仙子/,
  /化剑仙境/,
  /同步集中/,
  /恩泽/,
  /龙翼冒险者协会/,
  /武斗神姬「雅典娜」/,
  /「纳剑仙鞘」/,
  /「白尾之家」/,
  /^异界狂蝠$/,
  /有翼图腾/,
  /银乐器之诗「夏洛」/,
  /圣王子「卢恩」/,
  /清霜粉雪/,
  /乐器工匠/,
  /风车守望者/,
  /赛丽亚的侍女/,
  /静水流连「萨拉拉」/,
  /炎雷领队/,
  /偷天的大怪盗「追月」/
];

const abilityMarks: { kind: AbilityKind; label: string; match: RegExp }[] = [
  { kind: 'TRIGGER', label: '【诱】', match: /【诱[^】]*】/u },
  { kind: 'ACTIVATE', label: '【启】', match: /【启[^】]*】/u },
  { kind: 'CONTINUOUS', label: '【永】', match: /【永[^】]*】/u },
  { kind: 'COUNTER', label: '【反击】', match: /【反击[^】]*】/u },
  { kind: 'EQUIP', label: '【装备】', match: /【装备[^】]*】/u },
  { kind: 'SCAR', label: '【创痕】', match: /【创痕[0-9０-９]*】/u }
];

function norm(value: unknown) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function normalizeNameKey(value: string) {
  return norm(value)
    .toLowerCase()
    .replace(/[【】「」『』（）()\[\]〖〗]/g, '')
    .replace(/[·・？！，、。：；“”‘’"'!@#$%^&*_=+|\\/:;?.<>\-\s]/g, '');
}

function rows(file: string): Row[] {
  const workbook = XLSX.readFile(path.join(repo, file), { cellDates: false });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }) as Row[];
}

const cardRows = rows('Card.xlsx');
const detailRows = rows('Card2.xlsx');
const exactNameToId = new Map<string, string>();
const normalizedNameToIds = new Map<string, string[]>();

for (const row of cardRows) {
  const name = norm(row.CardName);
  const id = norm(row.CardID);
  if (!name || !id) continue;
  exactNameToId.set(name, id);
  const key = normalizeNameKey(name);
  normalizedNameToIds.set(key, [...(normalizedNameToIds.get(key) || []), id]);
}

function idForName(name: string) {
  if (exactNameToId.has(name)) return exactNameToId.get(name)!;
  const ids = normalizedNameToIds.get(normalizeNameKey(name)) || [];
  return ids.length === 1 ? ids[0] : '';
}

function hasTopLevelPrefix(prefix: string) {
  const stripped = prefix
    .replace(/〖[^〗]*〗/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/[0-9０-９A-Za-z+＋\-－，,\s]/g, '');
  return stripped.length === 0;
}

function isInsideChineseQuote(text: string, index: number) {
  const before = text.slice(0, index);
  return before.lastIndexOf('「') > before.lastIndexOf('」') ||
    before.lastIndexOf('《') > before.lastIndexOf('》') ||
    before.lastIndexOf('“') > before.lastIndexOf('”');
}

function canStartAbilityAt(text: string, index: number) {
  if (isInsideChineseQuote(text, index)) return false;
  const before = text.slice(Math.max(0, index - 120), index);
  return /(^|[\n。；])\s*(?:【[^】]*】|〖[^〗]*〗|\[[^\]]*\]|\{[^}]*\}|[0-9０-９A-Za-z+＋~～\-－，,\s])*$/u.test(before);
}

function findAbilityStarts(detail: string) {
  const starts: { index: number; kind: AbilityKind; marker: string; matchedText: string }[] = [];
  for (let index = 0; index < detail.length; index += 1) {
    if (detail[index] !== '【') continue;
    const tail = detail.slice(index);
    const found = abilityMarks
      .map(mark => {
        const match = mark.match.exec(tail);
        return match && match.index === 0
          ? { kind: mark.kind, marker: mark.label, matchedText: match[0], index }
          : undefined;
      })
      .find(Boolean);
    if (!found || !canStartAbilityAt(detail, index)) continue;
    starts.push(found);
  }
  return starts;
}

function classifyAbility(text: string, start: { kind: AbilityKind; marker: string; matchedText: string }) {
  if (start.kind !== 'SCAR') return { kind: start.kind, marker: start.marker };
  const tail = text.slice(start.matchedText.length);
  for (const inner of abilityMarks.filter(mark => mark.kind !== 'SCAR')) {
    if (inner.match.test(tail)) return { kind: inner.kind, marker: `${start.marker}${inner.label}` };
  }
  return { kind: 'ACTIVATE' as const, marker: start.marker };
}

function splitAbilities(detail: string): Ability[] {
  const result: Ability[] = [];
  const normalized = norm(detail);
  const starts = findAbilityStarts(normalized);
  for (const [startIndex, start] of starts.entries()) {
    const end = starts[startIndex + 1]?.index ?? normalized.length;
    const text = normalized.slice(start.index, end).trim();
    const classified = classifyAbility(text, start);
    result.push({ kind: classified.kind, marker: classified.marker, text });
  }
  return result;
}

function splitTopLevelColon(text: string) {
  const stack: string[] = [];
  const matchingClose: Record<string, string> = {
    '{': '}',
    '[': ']',
    '〖': '〗',
    '【': '】',
    '「': '」',
    '《': '》',
    '（': '）',
    '(': ')'
  };
  const closes = new Set(Object.values(matchingClose));

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (matchingClose[char]) {
      stack.push(matchingClose[char]);
      continue;
    }
    if (closes.has(char)) {
      const position = stack.lastIndexOf(char);
      if (position >= 0) stack.splice(position, 1);
      continue;
    }
    if ((char === ':' || char === '：') && stack.length === 0) {
      return { prelude: text.slice(0, index), body: text.slice(index + 1) };
    }
  }
  return { prelude: text, body: '' };
}

function costChunks(text: string): TextChunk[] {
  const result: TextChunk[] = [];
  for (const match of text.matchAll(/\{([^}]*)\}/g)) {
    const text = match[1];
    const payable = isPayableCostChunk(text);
    result.push({ delimiter: '{}', text, index: match.index ?? 0, payable, reason: payable ? payableReason(text) : undefined });
  }
  for (const match of text.matchAll(/\[([^\]]*)\]/g)) {
    const text = match[1];
    const payable = isPayableCostChunk(text);
    result.push({ delimiter: '[]', text, index: match.index ?? 0, payable, reason: payable ? payableReason(text) : undefined });
  }
  result.sort((a, b) => a.index - b.index);
  return result;
}

function stripCostChunks(text: string) {
  return text.replace(/\{[^}]*\}/g, '').replace(/\[[^\]]*\]/g, '');
}

function stripQuotedNames(text: string) {
  return text
    .replace(/"[^"]*"/g, '')
    .replace(/“[^”]*”/g, '')
    .replace(/「[^」]*」/g, '')
    .replace(/《[^》]*》/g, '');
}

function payableReason(text: string) {
  const clean = stripQuotedNames(text).replace(/\s+/g, '');
  if (/〖\s*(?:\+|＋)?[0-9０-９]+\s*[:：]/u.test(clean)) return 'access-payment';
  if (/支付[0-9０-９一二两三四五六七八九十]+费/u.test(clean)) return 'access-payment-text';
  if (/(?:舍弃|丢弃).*[0-9０-９一二两三四五六七八九十]+张/u.test(clean)) return 'discard';
  if (/将.+(?:送入墓地|放逐|返回卡组底|放置到卡组底)/u.test(clean)) return 'move-as-cost';
  if (/〖横置〗|横置这(?:个单位|张卡)|将这(?:个单位|张卡)横置/u.test(clean)) return 'exhaust';
  if (/侵蚀\s*[0-9０-９一二两三四五六七八九十]/u.test(clean)) return 'erosion';
  if (/大喊|展示/u.test(clean)) return 'reveal-or-call';
  if (/作为费用/u.test(clean)) return 'explicit-cost';
  return undefined;
}

function isPayableCostChunk(text: string) {
  const clean = stripQuotedNames(text).replace(/\s+/g, '');
  if (!clean) return false;
  if (/时/u.test(clean) && !/(作为费用|大喊|展示)/u.test(clean)) {
    return false;
  }
  if (/被(?:战斗|效果)?破坏时|战斗破坏时|效果破坏时|将要被破坏时/u.test(clean) && !/作为费用/u.test(clean)) {
    return false;
  }
  return !!payableReason(clean);
}

function phraseFrom(text: string, index: number) {
  return text.slice(index).split(/[。；;\n]/)[0].slice(0, 120);
}

function selectionOccurrences(text: string): SelectionHit[] {
  const clean = stripQuotedNames(text);
  const result: SelectionHit[] = [];
  for (const match of clean.matchAll(/选择/g)) {
    const index = match.index ?? 0;
    const phrase = phraseFrom(clean, index);
    const tail = clean.slice(index, index + 96);
    const before = clean.slice(0, index);
    const ignoredReason = ignoredSelectionReason(before, tail, phrase);
    result.push({ index, phrase, ignoredReason });
  }
  return result;
}

function ignoredSelectionReason(before: string, tail: string, phrase: string) {
  if (/随机\s*$/u.test(before.slice(-6))) return '随机选择';
  if (/^选择(?:的|了|过|后)/u.test(tail)) return '引用既有被选择对象';
  if (/被选择|所选择/u.test(tail.slice(0, 12))) return '引用既有被选择对象';
  if (/^选择为效果对象/u.test(tail)) return '被其他效果选择为对象';
  if (/^选择(?:下列|以下)?(?:的)?(?:1|一)项(?:效果)?|^选择效果|^选择模式/u.test(tail)) return '选择效果模式';
  if (/^选择(?:1|一)?名?(?:对手|玩家)|^选择任意(?:1|一)名玩家/u.test(tail)) return '选择玩家/对手';
  if (/从中\s*$/u.test(before.slice(-8))) return '从公开/查看内容中选择';
  if (before.lastIndexOf('之后') >= 0) return '选择在“之后”后面';

  const window = phrase.slice(0, 72);
  if (isPublicSelectionWindow(window) && !/^选择(?:你的|对手|自己|双方|任意|最多|至多|[0-9０-９一二两三四五六七八九十]+张|[0-9０-９一二两三四五六七八九十]+个|一张|一枚)?(?:手牌|卡组|卡组顶|公开的|从中|其中)/u.test(window)) {
    return undefined;
  }
  if (/加入(?:你的|其|他|她|自己)?手牌|放置到(?:你的|其|他|她|自己)?侵蚀区/u.test(window) &&
    !/(战场|场上|单位区|道具区|墓地|墓中|放逐区|侵蚀区|参战|攻击中|防御中|正在攻击|正在防御)/u.test(window)) {
    return '选择手牌/卡组等隐藏区';
  }
  if (/^选择(?:你的|对手|自己|双方|任意|最多|至多|[0-9０-９一二两三四五六七八九十]+张|[0-9０-９一二两三四五六七八九十]+个|一张|一枚)?(?:手牌|卡组|卡组顶|公开的|从中|其中)/u.test(window)) {
    return '选择手牌/卡组等隐藏区';
  }
  if (/卡组|手牌|卡组顶|公开|查看|从中选择/u.test(window) && !/(战场|场上|单位区|道具区|墓地|墓中|放逐区|侵蚀区|参战|攻击中|防御中|正在攻击|正在防御)/u.test(window)) {
    return '选择手牌/卡组等隐藏区';
  }

  return '未识别为公开区取对象';
}

function isPublicSelectionWindow(text: string) {
  if (/(战场|场上|单位区|道具区|墓地|墓中|放逐区|侵蚀区|参战|攻击中|防御中|正在攻击|正在防御)/u.test(text)) return true;
  if (/(?:非神蚀|神蚀|横置|竖置|重置|ACCESS|力量|伤害|<[^>]+>)?(?:单位|道具)(?:卡)?/u.test(text)) return true;
  return false;
}

function expectedEvents(text: string) {
  const events = new Set<string>();
  if (/进入战场时|放置到战场时|被放置到战场时|登场时|出场时/u.test(text)) events.add('CARD_ENTERED_ZONE');
  if (/组成联军时/u.test(text)) events.add('CARD_SELECTED_ALLIANCE');
  if (/攻击时|进行攻击时|开始攻击时|攻击宣言/u.test(text)) events.add('CARD_ATTACK_DECLARED');
  if (/防御时|进行防御时|防御宣言/u.test(text)) events.add('CARD_DEFENSE_DECLARED');
  if (/将要被战斗破坏|被战斗破坏时|战斗破坏时/u.test(text)) events.add('CARD_DESTROYED_BATTLE');
  if (/被效果破坏时|效果破坏时/u.test(text)) events.add('CARD_DESTROYED_EFFECT');
  if (/被破坏时/u.test(text)) {
    events.add('CARD_DESTROYED_BATTLE');
    events.add('CARD_DESTROYED_EFFECT');
  }
  if (/离开战场时|从战场离开时|离场时/u.test(text)) events.add('CARD_LEFT_FIELD');
  if (/送入墓地时|进入墓地时|放置到墓地时/u.test(text)) events.add('CARD_LEFT_ZONE');
  if (/放逐时|被放逐时/u.test(text)) events.add('CARD_EXILED');
  if (/回合结束时|结束阶段/u.test(text)) events.add('TURN_END');
  if (/主要阶段开始时|回合开始时|开始阶段/u.test(text)) events.add('PHASE_CHANGED');
  if (/造成战斗伤害时/u.test(text)) events.add('COMBAT_DAMAGE_CAUSED');
  else if (/造成.*伤害时|伤害造成时/u.test(text)) events.add('EFFECT_DAMAGE_CAUSED');
  if (/女神化状态时|进入女神化/u.test(text)) events.add('GODDESS_TRANSFORMATION');
  if (/横置时|转为横置|重置时|转为竖置/u.test(text)) events.add('CARD_ROTATED');
  if (/装备时|被装备时/u.test(text)) events.add('CARD_EQUIPPED');
  if (/回到手牌时|返回手牌时/u.test(text)) events.add('CARD_FIELD_TO_HAND');
  if (/抽到这张卡时/u.test(text)) events.add('CARD_DRAWN');
  return [...events];
}

function expectedLocations(prelude: string, cardType: string) {
  const locations = new Set<string>();
  if (/手牌/u.test(prelude)) locations.add('HAND');
  if (/墓地|墓中/u.test(prelude)) locations.add('GRAVE');
  if (/放逐区/u.test(prelude)) locations.add('EXILE');
  if (/侵蚀区/u.test(prelude)) {
    locations.add('EROSION_FRONT');
    locations.add('EROSION_BACK');
  }
  if (!locations.size) {
    if (cardType === 'Story') locations.add('PLAY');
    else if (cardType === 'Item') locations.add('ITEM');
    else locations.add('UNIT');
  }
  return [...locations];
}

function expectedMandatory(text: string) {
  const stripped = stripQuotedNames(text)
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '');
  if (!stripped.includes('可以')) return undefined;
  if (/对手可以|玩家可以|所有玩家可以|各玩家可以|那名玩家可以|被选择[^。；\n]*可以/u.test(stripped)) return undefined;
  if (/获得[^。；\n]*可以|视为[^。；\n]*可以/u.test(stripped)) return undefined;
  if (/可以攻击|可以防御|可以被|可以确认/u.test(stripped)) return undefined;
  return false;
}

function effectEvents(effect: any) {
  if (!effect?.triggerEvent) return [];
  return Array.isArray(effect.triggerEvent) ? effect.triggerEvent : [effect.triggerEvent];
}

function effectLocations(effect: any) {
  return Array.isArray(effect?.triggerLocation) ? effect.triggerLocation : [];
}

function allTargetShapes(spec: any): any[] {
  if (!spec) return [];
  const result = [spec];
  for (const group of spec.targetGroups || []) result.push(group);
  for (const mode of spec.modeOptions || []) {
    result.push(mode);
    for (const group of mode.targetGroups || []) result.push(group);
  }
  return result;
}

function targetSpecCostTargetShapes(effect: any) {
  return allTargetShapes(effect?.targetSpec)
    .filter(shape => shape?.costTarget)
    .map(shape => ({
      title: shape.title || shape.label || shape.id,
      step: shape.step,
      minSelections: shape.minSelections,
      maxSelections: shape.maxSelections,
      zones: shape.zones
    }));
}

function targetSpecNumbers(effect: any) {
  return allTargetShapes(effect?.targetSpec)
    .flatMap(shape => [shape.minSelections, shape.maxSelections])
    .filter(value => Number.isFinite(value));
}

function snippetAround(source: string, needle?: string, width = 2200) {
  if (!needle) return '';
  const index = source.indexOf(needle);
  if (index < 0) return '';
  return source.slice(Math.max(0, index - width), Math.min(source.length, index + needle.length + width));
}

function sourceLooksLikeLegacySelection(source: string, effectId?: string) {
  const sourceHint = snippetAround(source, effectId, 2600);
  return /createSelectCardQuery|createChoiceQuery|pendingQuery|SELECT_CARD|SELECT_CHOICE|onQueryResolve/u.test(sourceHint);
}

function actualEffectInfo(effect: any, source: string) {
  const cost = effect?.cost;
  const costTargetShapes = targetSpecCostTargetShapes(effect);
  return effect ? {
    id: effect.id,
    type: effect.type,
    events: effectEvents(effect),
    locations: effectLocations(effect),
    mandatory: effect.isMandatory,
    hasFormalCost: typeof cost === 'function' || typeof effect.onCostResolve === 'function',
    hasCostFunction: typeof cost === 'function',
    hasOnCostResolve: typeof effect.onCostResolve === 'function',
    paymentCost: typeof cost === 'function' ? (cost as any).paymentCost : undefined,
    paymentColor: typeof cost === 'function' ? (cost as any).paymentColor : undefined,
    hasTargetSpec: !!effect.targetSpec,
    targetSpecPreselect: effect.targetSpec?.preselect,
    targetSpecNumbers: targetSpecNumbers(effect),
    costTargetShapes,
    usesLegacySelectionQuery: sourceLooksLikeLegacySelection(source, effect.id),
    description: effect.description
  } : { missing: true };
}

function normalizeTextForScore(text: string) {
  return stripQuotedNames(text)
    .replace(/[【】〖〗\[\]{}（）()，。；：:、\s]/g, '')
    .replace(/[0-9０-９一二两三四五六七八九十+＋~～\-－]/g, '');
}

function scoreOverlap(a: string, b: string) {
  const aa = normalizeTextForScore(a);
  const bb = normalizeTextForScore(b);
  if (!aa || !bb) return 0;
  const tokens = [
    '进入战场',
    '回合开始',
    '回合结束',
    '战斗伤害',
    '战斗破坏',
    '被破坏',
    '离开战场',
    '送入墓地',
    '墓地',
    '侵蚀区',
    '选择',
    '放置到卡组底',
    '加入手牌',
    '返回手牌',
    '破坏',
    '放逐',
    '抽',
    '恢复',
    '联军',
    '女神化',
    '共鸣',
    '菲晶'
  ];
  let score = 0;
  for (const token of tokens) {
    if (aa.includes(token) && bb.includes(token)) score += 3;
  }
  for (let length = 8; length >= 3; length -= 1) {
    for (let index = 0; index <= aa.length - length; index += 1) {
      const part = aa.slice(index, index + length);
      if (bb.includes(part)) {
        score += length;
        index += length - 1;
      }
    }
  }
  return score;
}

function scoreEffectForExpected(effect: any, expected: any, abilityText: string) {
  if (!effect) return -9999;
  const actual = actualEffectInfo(effect, '');
  let score = 0;
  const events = (actual as any).events || [];
  const locations = (actual as any).locations || [];
  if (expected.events.length) {
    if (events.some((event: string) => expected.events.includes(event))) score += 30;
    else if (!events.length) score -= 4;
    else score -= 14;
  }
  if (expected.locations.length && locations.length) {
    if (locations.some((location: string) => expected.locations.includes(location))) score += 12;
    else score -= 4;
  }
  if (expected.mandatory !== undefined && effect.isMandatory !== undefined) {
    score += expected.mandatory === effect.isMandatory ? 5 : -3;
  }
  if (expected.formalCostExpected && typeof effect.cost === 'function') score += 8;
  if (expected.targetExpected && effect.targetSpec) score += 8;
  if (expected.targetExpected && /记录|标记|track/i.test(effect.id || effect.description || '')) score -= 18;
  score += scoreOverlap(abilityText, effect.description || '');
  return score;
}

function bestTriggerEffect(triggerEffects: any[], expected: any, abilityText: string, usedEffectIndexes: Set<number>) {
  if (!triggerEffects.length) return undefined;
  const scored = triggerEffects
    .map((effect, index) => ({
      effect,
      index,
      score: scoreEffectForExpected(effect, expected, abilityText) - (usedEffectIndexes.has(index) ? 18 : 0)
    }))
    .sort((a, b) => b.score - a.score);
  const selected = scored[0];
  if (selected) usedEffectIndexes.add(selected.index);
  return selected?.effect;
}

function byTriggerEffects(effects: any[]) {
  return effects.filter(effect => effect?.type === 'TRIGGER' || effect?.type === 'TRIGGERED');
}

function isExcluded(card: RawCard) {
  if (excludedIds.has(card.id)) return true;
  return excludedNamePatterns.some(pattern => pattern.test(card.name));
}

function isMissingPrScript(card: RawCard) {
  return missingPrIds.has(card.id) || /pr/i.test(`${card.name} ${card.no} ${card.package}`);
}

const cards: RawCard[] = detailRows
  .map(row => ({
    id: idForName(norm(row.CardName)),
    name: norm(row.CardName),
    no: norm(row.CardNo),
    type: norm(row.CardType),
    package: norm(row.CardPackage),
    detail: norm(row.CardDetail)
  }))
  .filter(card => card.id && card.detail);

const findings: any[] = [];
const candidates: any[] = [];
const importErrors: any[] = [];
const missingPrScripts: any[] = [];
const excludedCards: { id: string; name: string; no: string }[] = [];

for (const card of cards) {
  if (isExcluded(card)) {
    excludedCards.push({ id: card.id, name: card.name, no: card.no });
    continue;
  }

  const triggerAbilities = splitAbilities(card.detail).filter(ability => ability.kind === 'TRIGGER');
  if (!triggerAbilities.length) continue;

  const scriptPath = path.join(scriptsDir, `${card.id}.ts`);
  if (!fs.existsSync(scriptPath)) {
    const entry = { type: 'missing-script', id: card.id, name: card.name, no: card.no, raw: triggerAbilities.map(ability => ability.text) };
    if (isMissingPrScript(card)) missingPrScripts.push(entry);
    else findings.push({ severity: 'high', ...entry });
    continue;
  }

  const source = fs.readFileSync(scriptPath, 'utf8');
  let imported: any;
  try {
    imported = (await import(`${pathToFileURL(scriptPath).href}?audit=${Date.now()}-${card.id}`)).default;
  } catch (error: any) {
    importErrors.push({ id: card.id, name: card.name, no: card.no, error: error?.message || String(error) });
    findings.push({ severity: 'high', type: 'import-error', id: card.id, name: card.name, no: card.no, error: error?.message || String(error) });
    continue;
  }

  const triggerEffects = byTriggerEffects(imported.effects || []);
  const usedEffectIndexes = new Set<number>();
  if (triggerEffects.length < triggerAbilities.length) {
    findings.push({
      severity: 'review',
      type: 'trigger-effect-count-less-than-text',
      id: card.id,
      name: card.name,
      no: card.no,
      expected: triggerAbilities.length,
      actual: triggerEffects.length,
      raw: triggerAbilities.map(ability => ability.text),
      effectIds: triggerEffects.map((effect: any) => effect.id),
      script: `src/scripts/${card.id}.ts`
    });
  }
  if (triggerEffects.length > triggerAbilities.length) {
    findings.push({
      severity: 'review',
      type: 'trigger-effect-count-more-than-text',
      id: card.id,
      name: card.name,
      no: card.no,
      expected: triggerAbilities.length,
      actual: triggerEffects.length,
      raw: triggerAbilities.map(ability => ability.text),
      effectIds: triggerEffects.map((effect: any) => effect.id),
      script: `src/scripts/${card.id}.ts`
    });
  }

  for (const [abilityIndex, ability] of triggerAbilities.entries()) {
    const { prelude, body } = splitTopLevelColon(ability.text);
    const chunks = costChunks(ability.text);
    const costSelections = chunks.flatMap(chunk =>
      selectionOccurrences(chunk.text)
        .filter(hit => !hit.ignoredReason)
        .map(hit => ({ ...hit, delimiter: chunk.delimiter, chunk: chunk.text }))
    );
    const bodySelections = selectionOccurrences(stripCostChunks(body)).filter(hit => !hit.ignoredReason);
    const ignoredSelections = [
      ...chunks.flatMap(chunk => selectionOccurrences(chunk.text).filter(hit => hit.ignoredReason).map(hit => ({ ...hit, delimiter: chunk.delimiter, chunk: chunk.text }))),
      ...selectionOccurrences(stripCostChunks(body)).filter(hit => hit.ignoredReason)
    ];
    const payableChunks = chunks.filter(chunk => chunk.payable);
    const expected = {
      kind: 'TRIGGER',
      events: expectedEvents(ability.text),
      locations: expectedLocations(prelude, card.type),
      mandatory: expectedMandatory(ability.text),
      costChunks: chunks,
      payableChunks,
      costSelections,
      bodySelections,
      ignoredSelections,
      targetExpected: costSelections.length > 0 || bodySelections.length > 0,
      formalCostExpected: payableChunks.length > 0
    };
    const effect = bestTriggerEffect(triggerEffects, expected, ability.text, usedEffectIndexes);
    const actual = actualEffectInfo(effect, source);
    const entry = {
      id: card.id,
      name: card.name,
      no: card.no,
      cardType: card.type,
      abilityIndex: abilityIndex + 1,
      text: ability.text,
      prelude,
      body,
      expected,
      actual,
      script: `src/scripts/${card.id}.ts`
    };
    candidates.push(entry);

    if (!effect) {
      findings.push({ severity: 'high', type: 'trigger-text-without-effect', ...entry });
      continue;
    }

    if (expected.formalCostExpected && !(actual as any).hasFormalCost) {
      findings.push({ severity: 'high', type: 'payable-trigger-cost-not-formal', ...entry });
    }
    if (expected.targetExpected && !(actual as any).hasTargetSpec) {
      findings.push({
        severity: (actual as any).usesLegacySelectionQuery ? 'medium' : 'high',
        type: (actual as any).usesLegacySelectionQuery ? 'public-selection-uses-legacy-query-no-targetSpec' : 'public-selection-missing-targetSpec',
        ...entry
      });
    }
    if ((actual as any).costTargetShapes?.length) {
      findings.push({
        severity: 'review',
        type: 'targetSpec-marked-costTarget-review',
        detail: '取对象本身不作为 cost；若没有额外支付/移动费用，这里的 costTarget 标记需要复核。',
        ...entry
      });
    }
    if (expected.events.length && (actual as any).events?.length && !expected.events.some(event => (actual as any).events.includes(event))) {
      findings.push({ severity: 'review', type: 'trigger-event-mismatch-review', ...entry });
    }
    if (expected.locations.length && (actual as any).locations?.length && !expected.locations.some(location => (actual as any).locations.includes(location))) {
      findings.push({ severity: 'review', type: 'trigger-location-mismatch-review', ...entry });
    }
    if (expected.mandatory !== undefined && (actual as any).mandatory !== undefined && expected.mandatory !== (actual as any).mandatory) {
      findings.push({ severity: 'review', type: 'trigger-optional-mismatch-review', ...entry });
    }
  }
}

const byType: Record<string, number> = {};
const bySeverity: Record<string, number> = {};
for (const finding of findings) {
  byType[finding.type] = (byType[finding.type] || 0) + 1;
  bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
}

const actionable = findings.filter(finding =>
  finding.severity !== 'review' &&
  [
    'payable-trigger-cost-not-formal',
    'public-selection-uses-legacy-query-no-targetSpec',
    'public-selection-missing-targetSpec',
    'trigger-text-without-effect',
    'missing-script',
    'import-error'
  ].includes(finding.type)
);

const summary = {
  generatedAt: new Date().toISOString(),
  sourceFiles: ['Card.xlsx', 'Card2.xlsx'],
  reportPath: path.relative(repo, reportPath),
  scannedCards: new Set(candidates.map(candidate => candidate.id)).size,
  scannedTriggerAbilities: candidates.length,
  findings: findings.length,
  actionable: actionable.length,
  bySeverity,
  byType,
  importErrors: importErrors.length,
  missingPrScripts: missingPrScripts.length,
  excludedCards: excludedCards.length,
  rules: [
    '仅审计 Card2 原文中的【诱】能力，并只对照脚本里的 TRIGGER/TRIGGERED effect。',
    '{} 和 [] 中只有包含明确支付/舍弃/横置/移动/展示等动作的片段才按正式 cost 检查。',
    '选择本身不是 cost，不生成 costTarget 缺失类问题。',
    '选择卡组/手牌/玩家/对手，以及“之后”后面的选择，不按取对象处理。',
    '战场、场上、墓地、放逐区、侵蚀区、单位/道具等公开区选择需要 targetSpec。'
  ]
};

const report = {
  ...summary,
  actionable,
  findings,
  importErrors,
  missingPrScripts,
  excludedCards,
  candidates
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify(summary, null, 2));
