import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import XLSX from 'xlsx';

type Row = Record<string, unknown>;
type RawCard = {
  id: string;
  name: string;
  no: string;
  type: string;
  package: string;
  detail: string;
};

type AbilityKind = 'TRIGGER' | 'ACTIVATE' | 'CONTINUOUS' | 'COUNTER' | 'EQUIP' | 'SCAR';

const repo = process.cwd();
const scriptsDir = path.join(repo, 'src', 'scripts');
const reportPath = path.join(repo, 'reports', 'full-text-audit-round2.json');

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
  '103090421'
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
  /异界狂蝠/,
  /有翼图腾/,
  /银乐器之诗「夏洛」/,
  /圣王子「卢恩」/,
  /公会的看板娘「可可拉」/,
  /幻国迷偶.*New/,
  /追击部队/,
  /扫地机械/,
  /^文$/,
  /芙蕾雅/,
  /巴特拉/
];

const abilityMarks: { kind: AbilityKind; label: string; match: RegExp }[] = [
  { kind: 'TRIGGER', label: '【诱】', match: /【诱[^】]*】/ },
  { kind: 'ACTIVATE', label: '【启】', match: /【启[^】]*】/ },
  { kind: 'CONTINUOUS', label: '【永】', match: /【永[^】]*】/ },
  { kind: 'COUNTER', label: '【反击】', match: /【反击[^】]*】/ },
  { kind: 'EQUIP', label: '【装备】', match: /【装备[^】]*】/ },
  { kind: 'SCAR', label: '【创痕】', match: /【创痕[0-9０-９]*】/ }
];

function norm(value: unknown) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function normalizeNameKey(value: string) {
  return norm(value)
    .toLowerCase()
    .replace(/[【】「」『』（）()\[\]〖〗《》]/g, '')
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
    .replace(/[0-9０-９A-Za-z+＋\-－，,、\s]/g, '');
  return stripped.length === 0;
}

function isInsideChineseQuote(text: string, index: number) {
  const before = text.slice(0, index);
  return before.lastIndexOf('“') > before.lastIndexOf('”');
}

function canStartAbilityAt(text: string, index: number) {
  if (isInsideChineseQuote(text, index)) return false;
  const before = text.slice(Math.max(0, index - 120), index);
  return /(^|[\n。])\s*(?:〖[^〗]*〗|【(?:[0-9０-９]+|[0-9０-９]+[~～\-－][0-9０-９]+|[0-9０-９]+\+|OH|A[0-9０-９+\-－~～]+)[^】]*】|\[[^\]]*\]|\{[^}]*\}|[0-9０-９A-Za-z+＋\-－~～，,、\s])*$/u.test(before);
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

function topMarker(line: string) {
  const trimmed = line.trim();
  const pairs = abilityMarks
    .map(mark => {
      const match = mark.match.exec(trimmed);
      return match ? { ...mark, index: match.index, matchedText: match[0] } : undefined;
    })
    .filter((pair): pair is { kind: AbilityKind; label: string; match: RegExp; index: number; matchedText: string } =>
      !!pair && hasTopLevelPrefix(trimmed.slice(0, pair.index))
    );
  if (!pairs.length) return undefined;
  pairs.sort((a, b) => a.index - b.index);
  return pairs[0];
}

function classifyAbility(line: string, marker: NonNullable<ReturnType<typeof topMarker>>) {
  if (marker.kind !== 'SCAR') return { kind: marker.kind, marker: marker.label };
  const tail = line.slice(marker.index + marker.matchedText.length);
  for (const inner of abilityMarks.filter(mark => mark.kind !== 'SCAR')) {
    if (inner.match.test(tail)) return { kind: inner.kind, marker: `${marker.label}${inner.label}` };
  }
  return { kind: 'ACTIVATE' as const, marker: marker.label };
}

function splitAbilities(detail: string) {
  const result: { kind: AbilityKind; marker: string; text: string }[] = [];
  const normalized = norm(detail);
  const starts = findAbilityStarts(normalized);
  for (const [startIndex, start] of starts.entries()) {
    const end = starts[startIndex + 1]?.index ?? normalized.length;
    const text = normalized.slice(start.index, end).trim();
    const classified = classifyAbility(text, {
      ...start,
      index: 0,
      label: start.marker,
      match: /(?:)/,
      matchedText: start.matchedText
    });
    result.push({ kind: classified.kind, marker: classified.marker, text });
  }
  return result;
}

function splitTopLevelColon(text: string) {
  const stack: string[] = [];
  const open = new Set(['{', '[', '〖', '【', '（', '(']);
  const closeToOpen: Record<string, string> = {
    '}': '{',
    ']': '[',
    '〗': '〖',
    '】': '【',
    '）': '（',
    ')': '('
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (open.has(char)) {
      stack.push(char);
      continue;
    }
    if (closeToOpen[char]) {
      const expected = closeToOpen[char];
      const position = stack.lastIndexOf(expected);
      if (position >= 0) stack.splice(position, 1);
      continue;
    }
    if ((char === ':' || char === '：') && stack.length === 0) {
      return { prelude: text.slice(0, index), body: text.slice(index + 1) };
    }
  }
  return { prelude: text, body: '' };
}

function costChunks(text: string) {
  return [
    ...[...text.matchAll(/\{([^}]*)\}/g)].map(match => ({ delimiter: '{}', text: match[1] })),
    ...[...text.matchAll(/\[([^\]]*)\]/g)].map(match => ({ delimiter: '[]', text: match[1] }))
  ];
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

function selectionOccurrences(text: string) {
  const clean = stripQuotedNames(text);
  const result: { index: number; phrase: string; ignoredReason?: string }[] = [];
  const matches = [...clean.matchAll(/选择/g)];
  for (const match of matches) {
    const index = match.index ?? 0;
    const tail = clean.slice(index, index + 20);
    const before = clean.slice(0, index);
    const afterIndex = before.lastIndexOf('之后');
    if (/^选择(?:下列的?)?(?:1|一)项效果|^选择(?:下列的?)?(?:1|一)项/.test(tail)) {
      result.push({ index, phrase: tail, ignoredReason: '选择效果模式' });
    } else if (/^选择(?:1|一)名?(?:对手|玩家)/.test(tail)) {
      result.push({ index, phrase: tail, ignoredReason: '选择玩家/对手类问题' });
    } else if (afterIndex >= 0) {
      result.push({ index, phrase: tail, ignoredReason: '选择在“之后”后面' });
    } else {
      result.push({ index, phrase: tail });
    }
  }
  return result;
}

function hasCountLikeCost(text: string) {
  return /横置|重置|舍弃|丢弃|送入墓地|侵蚀\s*[0-9一二三四五六七八九十]|支付|放逐|展示|大喊|破坏|返回卡组底|放置到卡组底|〖\s*0\s*[:：]/.test(text);
}

function expectedEffectTypes(kind: AbilityKind) {
  switch (kind) {
    case 'TRIGGER':
      return ['TRIGGER', 'TRIGGERED'];
    case 'ACTIVATE':
    case 'SCAR':
    case 'COUNTER':
      return ['ACTIVATE', 'ACTIVATED'];
    case 'CONTINUOUS':
    case 'EQUIP':
      return ['CONTINUOUS', 'ALWAYS', 'TRIGGER', 'TRIGGERED'];
    default:
      return [];
  }
}

function expectedMandatory(text: string, kind: AbilityKind) {
  if (kind !== 'TRIGGER') return undefined;
  const stripped = stripQuotedNames(text);
  if (!stripped.includes('可以')) return true;
  if (/对手可以|玩家可以|所有玩家可以|各玩家可以|那名玩家可以|被选择[^。；\n]*可以/.test(stripped)) return undefined;
  if (/获得[^。；\n]*可以|视为[^。；\n]*可以/.test(stripped)) return undefined;
  return false;
}

function expectedEvents(text: string) {
  const events = new Set<string>();
  if (/进入战场时|放置到战场时|被放置到战场时|登场时/.test(text)) events.add('CARD_ENTERED_ZONE');
  if (/组成联军时/.test(text)) events.add('CARD_SELECTED_ALLIANCE');
  if (/攻击时|进行攻击时|开始攻击时|攻击宣言/.test(text)) events.add('CARD_ATTACK_DECLARED');
  if (/防御时|进行防御时|防御宣言/.test(text)) events.add('CARD_DEFENSE_DECLARED');
  if (/被战斗破坏时|战斗破坏时/.test(text)) events.add('CARD_DESTROYED_BATTLE');
  if (/被效果破坏时|效果破坏时/.test(text)) events.add('CARD_DESTROYED_EFFECT');
  if (/被破坏时/.test(text)) {
    events.add('CARD_DESTROYED_BATTLE');
    events.add('CARD_DESTROYED_EFFECT');
  }
  if (/离开战场时|从战场离开时|离场时/.test(text)) events.add('CARD_LEFT_FIELD');
  if (/送入墓地时|进入墓地时|放置到墓地时/.test(text)) events.add('CARD_LEFT_ZONE');
  if (/放逐时|被放逐时/.test(text)) events.add('CARD_EXILED');
  if (/回合结束时|结束阶段/.test(text)) events.add('TURN_END');
  if (/主要阶段开始时|回合开始时|开始阶段/.test(text)) events.add('PHASE_CHANGED');
  if (/造成战斗伤害时/.test(text)) events.add('COMBAT_DAMAGE_CAUSED');
  else if (/造成.*伤害时|伤害造成时/.test(text)) events.add('EFFECT_DAMAGE_CAUSED');
  if (/女神化状态时|进入女神化/.test(text)) events.add('GODDESS_TRANSFORMATION');
  if (/横置时|转为横置|重置时|转为竖置/.test(text)) events.add('CARD_ROTATED');
  if (/装备时|被装备时/.test(text)) events.add('CARD_EQUIPPED');
  if (/回到手牌时|返回手牌时/.test(text)) events.add('CARD_FIELD_TO_HAND');
  if (/抽到这张卡时/.test(text)) events.add('CARD_DRAWN');
  return [...events];
}

function expectedLocations(prelude: string, cardType: string) {
  const locations = new Set<string>();
  if (/手牌/.test(prelude)) locations.add('HAND');
  if (/墓地/.test(prelude)) locations.add('GRAVE');
  if (/放逐区/.test(prelude)) locations.add('EXILE');
  if (/侵蚀区/.test(prelude)) {
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

function textNumbers(text: string) {
  const normalized = text
    .replace(/一/g, '1')
    .replace(/二/g, '2')
    .replace(/两/g, '2')
    .replace(/三/g, '3')
    .replace(/四/g, '4')
    .replace(/五/g, '5');
  const tokens: string[] = [];
  for (const match of normalized.matchAll(/([+-]?\d+)\s*(张|个|点|费|力量|伤害|AC|回合|次)/g)) {
    tokens.push(`${match[1]}${match[2]}`);
  }
  return [...new Set(tokens)];
}

function effectEvents(effect: any) {
  if (!effect?.triggerEvent) return [];
  return Array.isArray(effect.triggerEvent) ? effect.triggerEvent : [effect.triggerEvent];
}

function effectLocations(effect: any) {
  return effect?.triggerLocation || [];
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

function hasTargetSpec(effect: any) {
  return !!effect?.targetSpec;
}

function hasCostTargetSpec(effect: any) {
  return allTargetShapes(effect?.targetSpec).some(shape => shape?.costTarget);
}

function targetSpecNumbers(effect: any) {
  return allTargetShapes(effect?.targetSpec)
    .flatMap(shape => [shape.minSelections, shape.maxSelections])
    .filter(value => Number.isFinite(value));
}

function hasCostImplementation(effect: any, source: string, effectId?: string) {
  const sourceHint = effectId ? snippetAround(source, effectId, 1800) : source;
  return !!effect?.cost ||
    !!effect?.onCostResolve ||
    hasCostTargetSpec(effect) ||
    /cost\s*:|onCostResolve|costTarget\s*:\s*true|moveCardAsCost|discardHandCost|paymentCost|erosionCost|exhaustCost|ACTIVATE_COST_RESOLVE|createCostQuery/.test(sourceHint);
}

function snippetAround(source: string, needle: string, width = 1000) {
  const index = source.indexOf(needle);
  if (index < 0) return '';
  return source.slice(Math.max(0, index - width), Math.min(source.length, index + needle.length + width));
}

function sourceLooksLikeSelectionQuery(source: string, effectId?: string) {
  const sourceHint = effectId ? snippetAround(source, effectId, 2200) : source;
  return /createSelectCardQuery|query|targetSpec|TARGET|selectedTargets|declaredTargets/.test(sourceHint);
}

function isExcluded(card: RawCard) {
  if (excludedIds.has(card.id)) return true;
  return excludedNamePatterns.some(pattern => pattern.test(card.name));
}

function byTypeEffects(effects: any[], kind: AbilityKind) {
  const expectedTypes = expectedEffectTypes(kind);
  return effects.filter(effect => expectedTypes.includes(effect?.type));
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

  const abilities = splitAbilities(card.detail);
  if (!abilities.length) continue;

  const scriptPath = path.join(scriptsDir, `${card.id}.ts`);
  if (!fs.existsSync(scriptPath)) {
    const entry = { type: 'missing-script', id: card.id, name: card.name, no: card.no, raw: abilities };
    if (missingPrIds.has(card.id) || /pr/i.test(`${card.name} ${card.no} ${card.package}`)) missingPrScripts.push(entry);
    else findings.push({ severity: 'high', ...entry });
    continue;
  }

  const source = fs.readFileSync(scriptPath, 'utf8');
  let imported: any;
  try {
    imported = (await import(`${pathToFileURL(scriptPath).href}?audit=${Date.now()}-${card.id}`)).default;
  } catch (error: any) {
    importErrors.push({ id: card.id, name: card.name, no: card.no, error: error?.message || String(error) });
    continue;
  }

  const allEffects = imported.effects || [];
  const usedEffectIndexes = new Set<number>();

  for (const [abilityIndex, ability] of abilities.entries()) {
    const effectPool = byTypeEffects(allEffects, ability.kind);
    const localIndex = abilities.slice(0, abilityIndex).filter(prev => prev.kind === ability.kind).length;
    const effect = effectPool[Math.min(localIndex, Math.max(0, effectPool.length - 1))];
    const effectIndex = allEffects.indexOf(effect);
    if (effectIndex >= 0) usedEffectIndexes.add(effectIndex);

    const { prelude, body } = splitTopLevelColon(ability.text);
    const chunks = costChunks(ability.text);
    const costSelection = chunks.flatMap(chunk =>
      selectionOccurrences(chunk.text)
        .filter(item => !item.ignoredReason)
        .map(item => ({ ...item, delimiter: chunk.delimiter, costText: chunk.text }))
    );
    const effectSelection = selectionOccurrences(stripCostChunks(body)).filter(item => !item.ignoredReason);
    const ignoredSelection = [
      ...chunks.flatMap(chunk => selectionOccurrences(chunk.text).filter(item => item.ignoredReason)),
      ...selectionOccurrences(stripCostChunks(body)).filter(item => item.ignoredReason)
    ];
    const paymentCostExpected = chunks.some(chunk => hasCountLikeCost(chunk.text));
    const targetExpected = costSelection.length > 0 || effectSelection.length > 0;
    const targetCountHint = (() => {
      const selectedText = [...costSelection, ...effectSelection].map(item => item.phrase).join(' ');
      const countMatch = selectedText.match(/选择(?:最多)?\s*([0-9一二两三四五六七八九十]+)\s*(?:张|个|名)?/);
      if (!countMatch) return undefined;
      const value = countMatch[1].replace('一', '1').replace('二', '2').replace('两', '2').replace('三', '3').replace('四', '4').replace('五', '5');
      return Number(value);
    })();
    const mandatory = expectedMandatory(ability.text, ability.kind);
    const expected = {
      kind: ability.kind,
      effectTypes: expectedEffectTypes(ability.kind),
      events: ability.kind === 'TRIGGER' ? expectedEvents(ability.text) : [],
      locations: ability.kind === 'TRIGGER' ? expectedLocations(prelude, card.type) : [],
      mandatory,
      costChunks: chunks,
      costSelection,
      effectSelection,
      ignoredSelection,
      paymentCostExpected,
      targetExpected,
      targetCountHint,
      bodyNumbers: textNumbers(body),
      costNumbers: textNumbers(chunks.map(chunk => chunk.text).join(' '))
    };
    const actual = effect ? {
      effectIndex,
      id: effect.id,
      type: effect.type,
      events: effectEvents(effect),
      locations: effectLocations(effect),
      mandatory: effect.isMandatory,
      hasTargetSpec: hasTargetSpec(effect),
      hasCostTargetSpec: hasCostTargetSpec(effect),
      targetSpecNumbers: targetSpecNumbers(effect),
      hasCost: hasCostImplementation(effect, source, effect.id),
      hasSelectionQuery: sourceLooksLikeSelectionQuery(source, effect.id),
      description: effect.description,
      descriptionNumbers: textNumbers(effect.description || '')
    } : { missing: true };

    const entry = {
      id: card.id,
      name: card.name,
      no: card.no,
      cardType: card.type,
      abilityIndex: abilityIndex + 1,
      kind: ability.kind,
      text: ability.text,
      prelude,
      body,
      expected,
      actual,
      script: `src/scripts/${card.id}.ts`
    };
    candidates.push(entry);

    if (!effect) {
      findings.push({ severity: ability.kind === 'EQUIP' ? 'review' : 'high', type: 'effect-missing-for-text', ...entry });
      continue;
    }

    if (!expected.effectTypes.includes(effect.type)) {
      findings.push({ severity: 'high', type: 'effect-type-mismatch', ...entry });
    }
    if (expected.events.length && actual.events?.length && !expected.events.some(event => actual.events.includes(event))) {
      findings.push({ severity: 'medium', type: 'trigger-event-mismatch?', ...entry });
    }
    if (expected.locations.length && actual.locations?.length && !expected.locations.some(location => actual.locations.includes(location))) {
      findings.push({ severity: 'medium', type: 'trigger-location-mismatch?', ...entry });
    }
    if (mandatory !== undefined && actual.mandatory !== undefined && mandatory !== actual.mandatory) {
      findings.push({ severity: 'medium', type: 'trigger-mandatory-mismatch?', ...entry });
    }
    if (expected.targetExpected && !actual.hasTargetSpec) {
      findings.push({
        severity: actual.hasSelectionQuery ? 'review' : 'medium',
        type: actual.hasSelectionQuery ? 'target-selection-uses-query?' : 'missing-targetSpec?',
        ...entry
      });
    }
    if (costSelection.length > 0 && actual.hasTargetSpec && !actual.hasCostTargetSpec) {
      findings.push({ severity: 'medium', type: 'cost-selection-not-costTarget?', ...entry });
    }
    if (expected.paymentCostExpected && !actual.hasCost) {
      findings.push({ severity: 'medium', type: 'payment-cost-missing?', ...entry });
    }
    if (targetCountHint && actual.targetSpecNumbers?.length && !actual.targetSpecNumbers.includes(targetCountHint)) {
      findings.push({ severity: 'review', type: 'target-count-mismatch?', ...entry });
    }
    if (expected.bodyNumbers.length && actual.descriptionNumbers?.length) {
      const missingNumbers = expected.bodyNumbers.filter(token => !actual.descriptionNumbers.includes(token));
      if (missingNumbers.length) {
        findings.push({ severity: 'review', type: 'description-number-drift?', missingNumbers, ...entry });
      }
    }
  }

  for (const [index, effect] of allEffects.entries()) {
    if (!usedEffectIndexes.has(index) && effect?.type && ['TRIGGER', 'TRIGGERED', 'ACTIVATE', 'ACTIVATED'].includes(effect.type)) {
      findings.push({
        severity: 'review',
        type: 'implemented-effect-without-matched-text?',
        id: card.id,
        name: card.name,
        no: card.no,
        cardType: card.type,
        actual: {
          effectIndex: index,
          id: effect.id,
          type: effect.type,
          description: effect.description,
          events: effectEvents(effect),
          locations: effectLocations(effect),
          hasTargetSpec: hasTargetSpec(effect)
        },
        script: `src/scripts/${card.id}.ts`
      });
    }
  }
}

const byType: Record<string, number> = {};
for (const finding of findings) byType[finding.type] = (byType[finding.type] || 0) + 1;

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    cardsWithAbilityText: new Set(candidates.map(candidate => candidate.id)).size,
    abilities: candidates.length,
    findings: findings.length,
    high: findings.filter(finding => finding.severity === 'high').length,
    medium: findings.filter(finding => finding.severity === 'medium').length,
    review: findings.filter(finding => finding.severity === 'review').length,
    importErrors: importErrors.length,
    missingPrScripts: missingPrScripts.length,
    excludedCards: excludedCards.length
  },
  byType,
  findings,
  importErrors,
  missingPrScripts,
  excludedCards,
  candidates
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ summary: report.summary, byType, reportPath }, null, 2));
