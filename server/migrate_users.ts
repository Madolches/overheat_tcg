import * as mariadb from 'mariadb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

type DbPrefix = 'SOURCE' | 'TARGET';

interface DbConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
}

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const replaceExisting = args.has('--replace');

function readDbConfig(prefix: DbPrefix): DbConfig {
  const fallbackPrefix = prefix === 'SOURCE' ? 'DB' : '';
  const read = (name: string, fallback?: string) =>
    process.env[`${prefix}_DB_${name}`] ||
    (fallbackPrefix ? process.env[`${fallbackPrefix}_${name}`] : undefined) ||
    fallback;

  return {
    host: read('HOST', 'localhost')!,
    user: read('USER', 'root')!,
    password: read('PASSWORD', process.env[`${prefix}_DB_PASS`] || '')!,
    database: read('NAME', 'overheat')!,
    port: Number(read('PORT', '3306'))
  };
}

function assertTargetConfig() {
  const required = ['TARGET_DB_HOST', 'TARGET_DB_USER', 'TARGET_DB_NAME'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`缺少目标库环境变量：${missing.join(', ')}`);
  }
}

function createPool(config: DbConfig) {
  return mariadb.createPool({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    port: config.port,
    connectionLimit: 4
  });
}

async function ensureUsersTable(conn: mariadb.PoolConnection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(50) PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NULL,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(50) NOT NULL,
      role VARCHAR(20) DEFAULT 'user',
      coins BIGINT DEFAULT 100000,
      card_crystals BIGINT DEFAULT 100000,
      favorite_card_id VARCHAR(50) DEFAULT 'fav_card',
      favorite_back_id VARCHAR(50) DEFAULT 'default',
      created_at BIGINT,
      session_version INT NOT NULL DEFAULT 0
    )
  `);

  const columns = await conn.query(`
    SELECT COLUMN_NAME AS name
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
  `);
  const existingColumns = new Set(columns.map((row: any) => String(row.name)));
  const addColumn = async (name: string, sql: string) => {
    if (!existingColumns.has(name)) await conn.query(sql);
  };

  await addColumn('email', `ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE NULL AFTER username`);
  await addColumn('coins', `ALTER TABLE users ADD COLUMN coins BIGINT DEFAULT 100000 AFTER role`);
  await addColumn('card_crystals', `ALTER TABLE users ADD COLUMN card_crystals BIGINT DEFAULT 100000 AFTER coins`);
  await addColumn('favorite_card_id', `ALTER TABLE users ADD COLUMN favorite_card_id VARCHAR(50) DEFAULT 'fav_card' AFTER card_crystals`);
  await addColumn('favorite_back_id', `ALTER TABLE users ADD COLUMN favorite_back_id VARCHAR(50) DEFAULT 'default' AFTER favorite_card_id`);
  await addColumn('created_at', `ALTER TABLE users ADD COLUMN created_at BIGINT NULL AFTER favorite_back_id`);
  await addColumn('session_version', `ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0 AFTER created_at`);
}

async function main() {
  assertTargetConfig();

  const sourceConfig = readDbConfig('SOURCE');
  const targetConfig = readDbConfig('TARGET');
  const sourcePool = createPool(sourceConfig);
  const targetPool = createPool(targetConfig);

  let sourceConn: mariadb.PoolConnection | undefined;
  let targetConn: mariadb.PoolConnection | undefined;

  try {
    sourceConn = await sourcePool.getConnection();
    targetConn = await targetPool.getConnection();

    await ensureUsersTable(targetConn);

    const users = await sourceConn.query(`
      SELECT
        id, username, email, password_hash, display_name, role, coins,
        card_crystals, favorite_card_id, favorite_back_id, created_at,
        COALESCE(session_version, 0) AS session_version
      FROM users
      ORDER BY created_at ASC, id ASC
    `);

    console.log(`准备迁移 users：${users.length} 条`);
    console.log(`源库：${sourceConfig.user}@${sourceConfig.host}:${sourceConfig.port}/${sourceConfig.database}`);
    console.log(`目标库：${targetConfig.user}@${targetConfig.host}:${targetConfig.port}/${targetConfig.database}`);
    console.log(`模式：${shouldApply ? (replaceExisting ? '写入并覆盖已有用户' : '写入并更新已有用户') : 'dry-run，仅预览'}`);

    if (!shouldApply) {
      console.log('未传入 --apply，未写入目标库。');
      return;
    }

    await targetConn.beginTransaction();

    const updateClause = replaceExisting
      ? `
        username = VALUES(username),
        email = VALUES(email),
        password_hash = VALUES(password_hash),
        display_name = VALUES(display_name),
        role = VALUES(role),
        coins = VALUES(coins),
        card_crystals = VALUES(card_crystals),
        favorite_card_id = VALUES(favorite_card_id),
        favorite_back_id = VALUES(favorite_back_id),
        created_at = VALUES(created_at),
        session_version = VALUES(session_version)
      `
      : `
        email = VALUES(email),
        display_name = VALUES(display_name),
        role = VALUES(role),
        coins = VALUES(coins),
        card_crystals = VALUES(card_crystals),
        favorite_card_id = VALUES(favorite_card_id),
        favorite_back_id = VALUES(favorite_back_id),
        created_at = COALESCE(users.created_at, VALUES(created_at)),
        session_version = GREATEST(COALESCE(users.session_version, 0), VALUES(session_version))
      `;

    let migrated = 0;
    for (const user of users) {
      await targetConn.query(
        `
          INSERT INTO users (
            id, username, email, password_hash, display_name, role, coins,
            card_crystals, favorite_card_id, favorite_back_id, created_at,
            session_version
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE ${updateClause}
        `,
        [
          user.id,
          user.username,
          user.email || null,
          user.password_hash,
          user.display_name,
          user.role || 'user',
          user.coins ?? 100000,
          user.card_crystals ?? 100000,
          user.favorite_card_id || 'fav_card',
          user.favorite_back_id || 'default',
          user.created_at || Date.now(),
          Number(user.session_version || 0)
        ]
      );
      migrated += 1;
    }

    await targetConn.commit();
    console.log(`迁移完成：${migrated} 条 users 已写入目标库。`);
  } catch (err) {
    if (targetConn) await targetConn.rollback().catch(() => undefined);
    console.error('迁移失败：', err);
    process.exitCode = 1;
  } finally {
    if (sourceConn) sourceConn.release();
    if (targetConn) targetConn.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

main();
