import fs from 'node:fs';
import path from 'node:path';

type ScriptProgress = {
  file: string;
  id: string;
  cardNo: string;
  packageName: string;
  dataPackageName: string;
  name: string;
  type: string;
  hasTodo: boolean;
  emptyEffects: boolean;
};

type Options = {
  packageFilter?: string;
  cardNoPrefix?: string;
  details: boolean;
};

const parseArgs = (argv: string[]): Options => {
  const options: Options = { details: false };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--package' && next) {
      options.packageFilter = next.toUpperCase();
      index += 1;
    } else if (current === '--cardNoPrefix' && next) {
      options.cardNoPrefix = next.toUpperCase();
      index += 1;
    } else if (current === '--details') {
      options.details = true;
    }
  }

  return options;
};

const matchString = (text: string, pattern: RegExp, fallback = '') => {
  const match = text.match(pattern);
  return match?.[1]?.trim() || fallback;
};

const readScriptProgress = (scriptsDir: string): ScriptProgress[] => {
  return fs.readdirSync(scriptsDir)
    .filter(file => file.endsWith('.ts') && file !== 'BaseUtil.ts')
    .map(file => {
      const fullPath = path.join(scriptsDir, file);
      const text = fs.readFileSync(fullPath, 'utf8');
      const id = matchString(text, /id:\s*'([^']+)'/, path.basename(file, '.ts'));
      const sourceCardNo = matchString(text, /Source CardNo:\s*([^\r\n]+)/);
      const sourcePackageName = matchString(text, /Package:\s*([^\r\n]+)/);
      const dataPackageName = matchString(text, /cardPackage:\s*'([^']+)'/, 'UNKNOWN');
      const packageName = sourcePackageName || dataPackageName;

      return {
        file,
        id,
        cardNo: sourceCardNo || id,
        packageName,
        dataPackageName,
        name: matchString(text, /fullName:\s*'([^']+)'/),
        type: matchString(text, /type:\s*'([^']+)'/),
        hasTodo: /TODO: confirm ID/.test(text),
        emptyEffects: /effects:\s*\[\]/.test(text)
      };
    });
};

const printTable = (rows: Record<string, unknown>[]) => {
  if (rows.length === 0) {
    console.log('(no rows)');
    return;
  }

  console.table(rows);
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const scriptsDir = path.resolve(process.cwd(), 'src', 'scripts');
  const allRows = readScriptProgress(scriptsDir);
  const filteredRows = allRows.filter(row => {
    if (options.packageFilter && !row.packageName.toUpperCase().startsWith(options.packageFilter)) return false;
    if (options.cardNoPrefix && !row.cardNo.toUpperCase().startsWith(options.cardNoPrefix)) return false;
    return true;
  });

  const grouped = new Map<string, ScriptProgress[]>();
  for (const row of filteredRows) {
    const key = options.cardNoPrefix ? options.cardNoPrefix : row.packageName.split('(')[0];
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }

  const summary = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, rows]) => ({
      group,
      total: rows.length,
      todo: rows.filter(row => row.hasTodo).length,
      emptyEffects: rows.filter(row => row.emptyEffects).length,
      implemented: rows.filter(row => !row.emptyEffects).length
    }));

  printTable(summary);

  if (options.details) {
    const details = filteredRows
      .filter(row => row.hasTodo || row.emptyEffects)
      .sort((a, b) => a.cardNo.localeCompare(b.cardNo))
      .map(row => ({
        cardNo: row.cardNo,
        file: row.file,
        name: row.name,
        type: row.type,
        packageName: row.packageName,
        dataPackageName: row.dataPackageName,
        todo: row.hasTodo,
        emptyEffects: row.emptyEffects
      }));
    printTable(details);
  }
};

main();
