import fs from 'node:fs';
import path from 'node:path';

const BT08_PR_IDS = ['103090505', '104020504', '105000503', '201140152', '202000153'];
const IMPLEMENTED_PR_IDS = ['202000113', '205000117', '204000115', '203000116'];
const EXPECTED_EMPTY_PR_IDS = [...BT08_PR_IDS, '104000263'];

const scriptsDir = path.resolve('src/scripts');

function readScript(id: string) {
  return fs.readFileSync(path.join(scriptsDir, `${id}.ts`), 'utf8');
}

function matchString(source: string, key: string) {
  return source.match(new RegExp(`${key}: '([^']*)'`))?.[1];
}

function hasEmptyEffects(source: string) {
  return /effects:\s*\[\]/.test(source);
}

const failures: string[] = [];

for (const id of BT08_PR_IDS) {
  const source = readScript(id);
  if (matchString(source, 'cardPackage') !== 'PR') {
    failures.push(`${id} cardPackage is not PR`);
  }
  if (!hasEmptyEffects(source)) {
    failures.push(`${id} should stay empty until effect text is confirmed`);
  }
}

for (const id of IMPLEMENTED_PR_IDS) {
  const source = readScript(id);
  if (hasEmptyEffects(source)) failures.push(`${id} still has empty effects`);
  if (!source.includes('const cardEffects')) failures.push(`${id} does not define cardEffects`);
}

const prFiles = fs.readdirSync(scriptsDir)
  .filter(file => file.endsWith('.ts'))
  .map(file => {
    const source = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
    return {
      id: file.replace(/\.ts$/, ''),
      source,
      rarity: matchString(source, 'rarity'),
      availableRarities: source.match(/availableRarities:\s*\[([^\]]*)\]/)?.[1] || '',
    };
  })
  .filter(entry => entry.rarity === 'PR' || entry.availableRarities.includes("'PR'"));

const emptyPrIds = prFiles
  .filter(entry => hasEmptyEffects(entry.source))
  .map(entry => entry.id)
  .sort();

const expectedEmpty = [...EXPECTED_EMPTY_PR_IDS].sort();
if (JSON.stringify(emptyPrIds) !== JSON.stringify(expectedEmpty)) {
  failures.push(`empty PR scripts mismatch: got ${emptyPrIds.join(', ')}, expected ${expectedEmpty.join(', ')}`);
}

if (failures.length > 0) {
  console.error(`PR audit failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
  process.exit(1);
}

console.log(`PR audit passed: BT08 PR package fixed, ${IMPLEMENTED_PR_IDS.length} scripts implemented, ${emptyPrIds.length} PR scripts intentionally empty.`);
