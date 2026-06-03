import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import XLSX from 'xlsx';

type SheetRow = Record<string, any> & {
  CardID?: string;
  CardName?: string;
  CardNo?: string;
  CardPackage?: string;
  CardDetail?: string;
  CardType?: string;
};

const repo = process.cwd();
const scriptsDir = path.join(repo, 'src', 'scripts');
const exclude = new Set([
  '202050118', '203000125', '304030075', '205000134', '202000077', '103000084',
  '102050365', '204000145', '204000047', '103090180', '201100036', '204000025', '204000048',
  '204000092', '203000094', '202000108', '201000110', '205000112'
]);

function norm(value: unknown) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function rows(file: string): SheetRow[] {
  const workbook = XLSX.readFile(path.join(repo, file), { cellDates: false });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' }) as SheetRow[];
}

const cardRows = rows('Card.xlsx');
const detailRows = rows('Card2.xlsx');
const nameToIds = new Map<string, string[]>();
for (const row of cardRows) {
  const name = norm(row.CardName);
  const id = norm(row.CardID);
  if (!name || !id) continue;
  nameToIds.set(name, [...(nameToIds.get(name) || []), id]);
}

const merged: SheetRow[] = detailRows
  .map(row => {
    const ids = nameToIds.get(norm(row.CardName)) || [];
    return { ...row, CardID: ids[0] || '' } as SheetRow;
  })
  .filter(row => row.CardID);

function isPrMissing(row: SheetRow) {
  return /pr/i.test(`${row.CardName} ${row.CardNo} ${row.CardPackage}`);
}

function isRelevant(row: SheetRow) {
  const detail = norm(row.CardDetail);
  return row.CardType === 'Story' || /【启】|【创痕\d+】/.test(detail);
}

function publicSelection(text: string) {
  if (!/选择/.test(text)) return false;
  let stripped = text
    .replace(/选择(?:1|一)名(?:对手|玩家)/g, '')
    .replace(/每名玩家|双方玩家|所有玩家/g, '');
  if (!/选择/.test(stripped)) return false;
  if (/卡组|手牌|公开的|检视|从中选择|卡组顶/.test(stripped) && !/战场|场上|墓地|侵蚀区|放逐区/.test(stripped)) {
    return false;
  }
  return /战场|场上|墓地|侵蚀区|放逐区|参战单位|正在进行攻击|单位|道具卡/.test(stripped);
}

function splitColon(text: string) {
  const half = text.indexOf(':');
  const full = text.indexOf('：');
  let index = -1;
  if (half >= 0 && full >= 0) index = Math.min(half, full);
  else index = Math.max(half, full);
  return index < 0 ? [text, ''] : [text.slice(0, index), text.slice(index + 1)];
}

function bracketChunks(text: string) {
  return [...text.matchAll(/[\{｛\[]([^\}｝\]]+)[\}｝\]]/g)].map(match => match[1]);
}

function activateTexts(detail: string, cardType: string) {
  const result: { kind: 'STORY' | 'ACTIVATE'; text: string }[] = [];
  const lines = detail.split('\n').map(line => line.trim()).filter(Boolean);
  if (cardType === 'Story') result.push({ kind: 'STORY', text: detail });
  for (const line of lines) {
    if (/【启】|【创痕\d+】/.test(line) && !/【诱】/.test(line)) {
      result.push({ kind: 'ACTIVATE', text: line });
    }
  }
  return result;
}

function chooseCount(text: string) {
  const max = text.match(/最多\s*([一二两三四五六七八九十\d]+)\s*(?:张|个)/);
  const exact = text.match(/选择(?:你的|对手的|战场上的|场上的|墓地中的|侵蚀区中的|放逐区中的|你战场上的|对手战场上的)?\s*([一二两三四五六七八九十\d]+)\s*(?:张|个)/);
  const cn: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const toNumber = (value?: string) => value ? (cn[value] || Number(value) || undefined) : undefined;
  if (max) return { kind: 'max', n: toNumber(max[1]) };
  if (exact) return { kind: 'exact', n: toNumber(exact[1]) };
  return undefined;
}

function rangesFromSpec(spec: any) {
  if (!spec) return [];
  const modes = spec.modeOptions?.length ? spec.modeOptions : [spec, ...(spec.targetGroups || [])];
  return modes.filter(Boolean).map((mode: any) => ({
    id: mode.id,
    min: mode.minSelections,
    max: mode.maxSelections,
    zones: mode.zones,
    step: mode.step,
    preselect: mode.preselect ?? spec.preselect
  }));
}

function zonesFromSpec(spec: any) {
  return [...new Set(rangesFromSpec(spec).flatMap((range: any) => range.zones || []))];
}

const results: any[] = [];

for (const row of merged) {
  const id = norm(row.CardID);
  if (exclude.has(id) || !isRelevant(row)) continue;
  const scriptPath = path.join(scriptsDir, `${id}.ts`);
  if (!fs.existsSync(scriptPath)) {
    if (!isPrMissing(row)) results.push({ id, name: row.CardName, no: row.CardNo, type: 'missing-script', raw: row.CardDetail });
    continue;
  }

  const source = fs.readFileSync(scriptPath, 'utf8');
  let card: any;
  try {
    card = (await import(pathToFileURL(scriptPath).href)).default;
  } catch (error: any) {
    results.push({ id, name: row.CardName, no: row.CardNo, type: 'import-error', error: error.message });
    continue;
  }

  const effects = (card.effects || []).filter((effect: any) =>
    effect.type === 'ACTIVATE' ||
    effect.type === 'ACTIVATED' ||
    (row.CardType === 'Story' && (effect.type === 'ALWAYS' || effect.type === 'TRIGGER'))
  );

  for (const ability of activateTexts(norm(row.CardDetail), row.CardType)) {
    const [prelude, body] = splitColon(ability.text);
    const costTarget = bracketChunks(prelude).some(publicSelection) || (/\{[^}｝]*选择/.test(prelude) && publicSelection(prelude));
    const bodyTarget = publicSelection(body || (row.CardType === 'Story' ? ability.text : ''));
    const expectedTarget = costTarget || bodyTarget;
    const effectWithSpec = effects.find((effect: any) => !!effect.targetSpec) || effects[0];
    const spec = effectWithSpec?.targetSpec;
    const ranges = rangesFromSpec(spec);

    if (expectedTarget) {
      if (!spec) {
        results.push({ id, name: row.CardName, no: row.CardNo, type: 'missing-targetSpec', abilityKind: ability.kind, raw: ability.text, effectIds: effects.map((effect: any) => effect.id) });
      } else if (spec.preselect === false) {
        results.push({ id, name: row.CardName, no: row.CardNo, type: 'preselect-false', abilityKind: ability.kind, raw: ability.text, effectId: effectWithSpec?.id, ranges });
      }

      const count = chooseCount(ability.text);
      if (count && spec) {
        const targetRanges = ranges.filter((range: any) => (range.max ?? 0) > 0);
        if (count.kind === 'exact' && count.n && targetRanges.length && !targetRanges.some((range: any) => range.min === count.n && range.max === count.n)) {
          results.push({ id, name: row.CardName, no: row.CardNo, type: 'count-mismatch?', raw: ability.text, count, ranges, effectId: effectWithSpec?.id });
        }
        if (count.kind === 'max' && count.n && targetRanges.length && !targetRanges.some((range: any) => range.max === count.n)) {
          results.push({ id, name: row.CardName, no: row.CardNo, type: 'max-count-mismatch?', raw: ability.text, count, ranges, effectId: effectWithSpec?.id });
        }
      }

      const zones = zonesFromSpec(spec);
      if (/战场上(?:的)?1?张[^。\n]*(?:非神蚀)?卡/.test(ability.text) && zones.length && zones.includes('UNIT') && !zones.includes('ITEM')) {
        results.push({ id, name: row.CardName, no: row.CardNo, type: 'field-card-but-unit-only?', raw: ability.text, zones, effectId: effectWithSpec?.id });
      }
    }

    const costText = [...bracketChunks(prelude), ...bracketChunks(body)].join(' ');
    if (/舍弃|横置|放逐|送入墓地|侵蚀\d|\+\d|支付/.test(costText) && !/cost\s*:|paymentCost|erosionCost|exhaustCost|moveCardAsCost|ACTIVATE_COST_RESOLVE|discardHandCost/.test(source)) {
      results.push({ id, name: row.CardName, no: row.CardNo, type: 'missing-cost?', abilityKind: ability.kind, raw: ability.text, costText, effectIds: effects.map((effect: any) => effect.id) });
    }
  }
}

console.log(JSON.stringify(results, null, 2));
