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

const repo = process.cwd();
const scriptsDir = path.join(repo, 'src', 'scripts');

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

const abilityMarks = ['【诱】', '【启】', '【永】', '【反击】', '【装备】', '【创痕'];

function hasTopLevelPrefix(prefix: string) {
  const stripped = prefix
    .replace(/〖[^〗]*〗/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/[0-9０-９A-Za-z+＋\-－，,\s]/g, '');
  return stripped.length === 0;
}

function topMarker(line: string) {
  const trimmed = line.trim();
  const pairs = abilityMarks
    .map(mark => ({ mark, index: trimmed.indexOf(mark) }))
    .filter(pair => pair.index >= 0 && hasTopLevelPrefix(trimmed.slice(0, pair.index)));
  if (!pairs.length) return '';
  pairs.sort((a, b) => a.index - b.index);
  return pairs[0].mark;
}

function splitAbilities(detail: string) {
  const result: string[] = [];
  let current = '';
  for (const rawLine of norm(detail).split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (topMarker(line)) {
      if (current) result.push(current);
      current = line;
    } else if (current) {
      current += `\n${line}`;
    }
  }
  if (current) result.push(current);
  return result;
}

function splitColon(text: string) {
  const half = text.indexOf(':');
  const full = text.indexOf('：');
  const index = half >= 0 && full >= 0 ? Math.min(half, full) : Math.max(half, full);
  if (index < 0) return { prelude: text, body: '' };
  return { prelude: text.slice(0, index), body: text.slice(index + 1) };
}

function bracketChunks(text: string) {
  return [...text.matchAll(/[\{\[〖]([^\}\]〗]+)[\}\]〗]/g)].map(match => match[1]);
}

function stripQuotedText(text: string) {
  return text
    .replace(/"[^"]*"/g, '')
    .replace(/“[^”]*”/g, '')
    .replace(/「[^」]*」/g, '')
    .replace(/《[^》]*》/g, '');
}

function hasPublicSelection(text: string) {
  if (!text.includes('选择')) return false;
  let stripped = text
    .replace(/选择(?:1|一)名?(?:对手|玩家)/g, '')
    .replace(/每名玩家|双方玩家|所有玩家/g, '');
  if (!stripped.includes('选择')) return false;

  const hiddenOnly = /卡组|手牌|公开的|查看|从中选择|卡组顶/.test(stripped);
  const publicZone = /战场|场上|墓地|侵蚀区|放逐区|参战单位|正在进行攻击|单位|道具卡|卡/.test(stripped);
  if (hiddenOnly && !publicZone) return false;
  return publicZone;
}

function expectedMandatory(text: string) {
  const stripped = stripQuotedText(text);
  if (!stripped.includes('可以')) return { value: true as const };
  if (/对手可以|玩家可以|所有玩家可以|各玩家可以|那名玩家可以|被选择[^。]*可以/.test(stripped)) {
    return { review: '“可以”属于非控制者或被选择玩家' };
  }
  if (/获得[^。；\n]*可以|视为[^。；\n]*可以/.test(stripped)) {
    return { review: '“可以”可能在获得/引用的效果文本内' };
  }
  return { value: false as const };
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
  if (/送入墓地时|进入墓地时/.test(text)) events.add('CARD_LEFT_ZONE');
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
  if (/侵蚀区/.test(prelude)) locations.add('EROSION_FRONT');
  if (!locations.size) {
    if (cardType === 'Story') locations.add('PLAY');
    else if (cardType === 'Item') locations.add('ITEM');
    else locations.add('UNIT');
  }
  return [...locations];
}

function effectEvents(effect: any) {
  if (!effect?.triggerEvent) return [];
  return Array.isArray(effect.triggerEvent) ? effect.triggerEvent : [effect.triggerEvent];
}

function effectLocations(effect: any) {
  return effect?.triggerLocation || [];
}

function hasCostImplementation(effect: any, source: string) {
  return !!effect?.cost ||
    !!effect?.onCostResolve ||
    JSON.stringify(effect?.targetSpec || {}).includes('costTarget') ||
    /cost\s*:|onCostResolve|costTarget\s*:\s*true|moveCardAsCost|discardHandCost|paymentCost|erosionCost|exhaustCost|ACTIVATE_COST_RESOLVE/.test(source);
}

function hasTargetSpec(effect: any) {
  return !!effect?.targetSpec;
}

function isMissingPrScript(card: RawCard) {
  return /pr/i.test(`${card.name} ${card.no} ${card.package}`);
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
  .filter(card => card.id && card.detail.includes('【诱】'));

const findings: any[] = [];
const candidates: any[] = [];
const importErrors: any[] = [];
const missingPrScripts: any[] = [];

for (const card of cards) {
  const abilities = splitAbilities(card.detail).filter(text => topMarker(text.split('\n')[0]) === '【诱】');
  if (!abilities.length) continue;

  const scriptPath = path.join(scriptsDir, `${card.id}.ts`);
  if (!fs.existsSync(scriptPath)) {
    const entry = { type: 'missing-script', id: card.id, name: card.name, no: card.no, raw: abilities };
    if (isMissingPrScript(card)) missingPrScripts.push(entry);
    else findings.push({ severity: 'high', ...entry });
    continue;
  }

  const source = fs.readFileSync(scriptPath, 'utf8');
  let imported: any;
  try {
    imported = (await import(pathToFileURL(scriptPath).href)).default;
  } catch (error: any) {
    importErrors.push({ id: card.id, name: card.name, no: card.no, error: error?.message || String(error) });
    continue;
  }

  const triggerEffects = (imported.effects || []).filter((effect: any) => effect?.type === 'TRIGGER' || effect?.type === 'TRIGGERED');

  if (triggerEffects.length < abilities.length) {
    findings.push({
      severity: 'high',
      type: 'trigger-count-less-than-text',
      id: card.id,
      name: card.name,
      no: card.no,
      expected: abilities.length,
      actual: triggerEffects.length,
      raw: abilities,
      effectIds: triggerEffects.map((effect: any) => effect.id)
    });
  }
  if (triggerEffects.length > abilities.length) {
    findings.push({
      severity: 'review',
      type: 'trigger-count-more-than-text',
      id: card.id,
      name: card.name,
      no: card.no,
      expected: abilities.length,
      actual: triggerEffects.length,
      raw: abilities,
      effectIds: triggerEffects.map((effect: any) => effect.id)
    });
  }

  abilities.forEach((text, index) => {
    const { prelude, body } = splitColon(text);
    const costText = bracketChunks(prelude).join(' ');
    const expected = {
      events: expectedEvents(text),
      locations: expectedLocations(prelude, card.type),
      mandatory: expectedMandatory(text),
      target: hasPublicSelection(body) || bracketChunks(prelude).some(hasPublicSelection),
      costText,
      hasCost: /横置|舍弃|丢弃|送入墓地|侵蚀\d|侵蚀[一二三四五六七八九十]|支付|放逐|展示|大喊/.test(costText)
    };
    const effect = triggerEffects[Math.min(index, triggerEffects.length - 1)] || triggerEffects[0];
    const actual = effect ? {
      id: effect.id,
      events: effectEvents(effect),
      locations: effectLocations(effect),
      mandatory: effect.isMandatory,
      hasTargetSpec: hasTargetSpec(effect),
      hasCost: hasCostImplementation(effect, source),
      description: effect.description
    } : { missing: true };

    const entry = {
      id: card.id,
      name: card.name,
      no: card.no,
      abilityIndex: index + 1,
      text,
      prelude,
      body,
      expected,
      actual,
      script: `src/scripts/${card.id}.ts`
    };
    candidates.push(entry);

    if (expected.events.length && actual.events?.length && !expected.events.some(event => actual.events.includes(event))) {
      findings.push({ severity: 'medium', type: 'event-mismatch?', ...entry });
    }
    if (expected.locations.length && actual.locations?.length && !expected.locations.some(location => actual.locations.includes(location))) {
      findings.push({ severity: 'medium', type: 'location-mismatch?', ...entry });
    }
    if (expected.mandatory.value !== undefined && actual.mandatory !== undefined && expected.mandatory.value !== actual.mandatory) {
      findings.push({ severity: 'medium', type: 'mandatory-mismatch?', ...entry });
    }
    if (expected.target && !actual.hasTargetSpec) {
      findings.push({ severity: 'medium', type: 'missing-targetSpec?', ...entry });
    }
    if (expected.hasCost && !actual.hasCost) {
      findings.push({ severity: 'medium', type: 'missing-cost?', ...entry });
    }
    if (expected.mandatory.review) {
      findings.push({ severity: 'review', type: 'mandatory-needs-review', ...entry });
    }
  });
}

const byType: Record<string, number> = {};
for (const finding of findings) byType[finding.type] = (byType[finding.type] || 0) + 1;

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    cardsWithTopLevelTriggerText: new Set(candidates.map(candidate => candidate.id)).size,
    abilities: candidates.length,
    findings: findings.length,
    high: findings.filter(finding => finding.severity === 'high').length,
    medium: findings.filter(finding => finding.severity === 'medium').length,
    review: findings.filter(finding => finding.severity === 'review').length,
    importErrors: importErrors.length,
    missingPrScripts: missingPrScripts.length
  },
  byType,
  findings,
  importErrors,
  missingPrScripts,
  candidates
};

fs.mkdirSync(path.join(repo, 'reports'), { recursive: true });
fs.writeFileSync(path.join(repo, 'reports', 'trigger-text-audit-round1-tsx.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ summary: report.summary, byType }, null, 2));
